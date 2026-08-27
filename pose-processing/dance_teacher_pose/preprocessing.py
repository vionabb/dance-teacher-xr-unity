"""Clean pose preprocessing shared by reference and study workflows."""

from __future__ import annotations

from dataclasses import dataclass
import math
import numbers
from pathlib import Path
import typing as t

import numpy as np
import pandas as pd

from .schema import (
    PoseDataType,
    collect_pose_data_files,
    get_pose_data_schema,
    migrate_legacy_pose_csv_outputs,
    relative_stem_from_pose_csv_path,
)

PREPROCESS_ROOT_COLUMN_PREFIX = "preprocess_root"
PREPROCESS_TORSO_LENGTH_COLUMN = "preprocess_torso_length"
PREPROCESS_USABLE_FRAME_COLUMN = "preprocess_is_usable"
DEFAULT_TRIANGULAR3_NEIGHBOR_WEIGHT = 0.25

PREPROCESS_ACTIONS = (
    "visibility_masked",
    "interpolated",
    "outlier_replaced",
    "smoothed",
)

LEFT_HIP = "LEFT_HIP"
RIGHT_HIP = "RIGHT_HIP"
LEFT_SHOULDER = "LEFT_SHOULDER"
RIGHT_SHOULDER = "RIGHT_SHOULDER"


@dataclass(frozen=True)
class PosePreprocessingConfig:
    """Conservative optional cleanup applied before and after normalization.

    ``triangular3_neighbor_weight`` is the symmetric neighbor coefficient
    :math:`a` in ``a*x[t-1] + (1-2*a)*x[t] + a*x[t+1]``. Its historical value
    is 0.25, and it is used only when ``smoothing="triangular3"``.
    """

    min_visibility: float = 0.2
    max_gap_frames: int = 3
    isolated_outlier_threshold: float = 0.75
    isolated_outlier_ratio: float = 3.0
    smoothing: t.Literal["none", "triangular3"] = "none"
    triangular3_neighbor_weight: float = DEFAULT_TRIANGULAR3_NEIGHBOR_WEIGHT

    def __post_init__(self) -> None:
        if not 0.0 <= self.min_visibility <= 1.0:
            raise ValueError("min_visibility must be between 0 and 1")
        if self.max_gap_frames < 0:
            raise ValueError("max_gap_frames must be non-negative")
        if self.isolated_outlier_threshold < 0 or self.isolated_outlier_ratio < 0:
            raise ValueError("outlier thresholds must be non-negative")
        if self.smoothing not in ("none", "triangular3"):
            raise ValueError(f"Unknown smoothing mode: {self.smoothing}")
        weight = self.triangular3_neighbor_weight
        if (
            isinstance(weight, bool)
            or not isinstance(weight, numbers.Real)
            or not math.isfinite(weight)
            or not 0.0 <= weight <= 0.5
        ):
            raise ValueError(
                "triangular3_neighbor_weight must be a finite number between 0 and 0.5"
            )


def _find_coordinate_roots(dataframe: pd.DataFrame, coordinate_fields: t.Sequence[str]) -> list[str]:
    roots: list[str] = []
    for column_name in dataframe.columns:
        if "_" not in column_name:
            continue
        root, suffix = column_name.rsplit("_", 1)
        if suffix not in coordinate_fields or root in roots:
            continue
        if all(f"{root}_{field}" in dataframe.columns for field in coordinate_fields):
            roots.append(root)
    return roots


def _midpoint(
    dataframe: pd.DataFrame,
    left_root: str,
    right_root: str,
    coordinate_fields: t.Sequence[str],
) -> dict[str, pd.Series]:
    return {
        coordinate_field: (
            dataframe[f"{left_root}_{coordinate_field}"]
            + dataframe[f"{right_root}_{coordinate_field}"]
        )
        / 2.0
        for coordinate_field in coordinate_fields
    }


def _bounded_internal_gap_mask(valid: pd.Series, max_gap_frames: int) -> pd.Series:
    """Return positions belonging to bounded false runs no longer than the limit."""

    fillable = pd.Series(False, index=valid.index)
    if max_gap_frames == 0 or valid.empty:
        return fillable
    values = valid.to_numpy(dtype=bool)
    position = 0
    while position < len(values):
        if values[position]:
            position += 1
            continue
        start = position
        while position < len(values) and not values[position]:
            position += 1
        if start > 0 and position < len(values) and position - start <= max_gap_frames:
            fillable.iloc[start:position] = True
    return fillable


def _initialize_action_metadata(dataframe: pd.DataFrame) -> None:
    """Add zero-valued per-frame audit counts and flags in place."""

    for action in PREPROCESS_ACTIONS:
        dataframe[f"preprocess_{action}_landmark_count"] = 0
        dataframe[f"preprocess_has_{action}"] = 0


def _record_action(dataframe: pd.DataFrame, action: str, mask: pd.Series) -> None:
    """Increment one per-landmark action on the selected frames."""

    count_column = f"preprocess_{action}_landmark_count"
    dataframe.loc[mask, count_column] = dataframe.loc[mask, count_column] + 1
    dataframe.loc[mask, f"preprocess_has_{action}"] = 1


def _clean_visible_landmarks(
    dataframe: pd.DataFrame,
    coordinate_roots: t.Sequence[str],
    coordinate_fields: t.Sequence[str],
    config: PosePreprocessingConfig,
) -> list[str]:
    """Mask low visibility and fill only short, bounded body-landmark gaps."""

    visible_roots = [
        root for root in coordinate_roots if f"{root}_vis" in dataframe.columns
    ]
    for root in visible_roots:
        coordinate_columns = [f"{root}_{field}" for field in coordinate_fields]
        low_visibility = dataframe[f"{root}_vis"].lt(config.min_visibility).fillna(False)
        had_finite_coordinate = dataframe[coordinate_columns].notna().any(axis=1)
        masked = low_visibility & had_finite_coordinate
        dataframe.loc[low_visibility, coordinate_columns] = np.nan
        _record_action(dataframe, "visibility_masked", masked)

        complete = dataframe[coordinate_columns].notna().all(axis=1)
        # A partially missing landmark is treated as missing as a unit so that
        # interpolation cannot mix observations from different frames.
        dataframe.loc[~complete, coordinate_columns] = np.nan
        fillable = _bounded_internal_gap_mask(complete, config.max_gap_frames)
        if fillable.any():
            for column in coordinate_columns:
                interpolated = dataframe[column].interpolate(
                    method="linear", limit_area="inside"
                )
                dataframe.loc[fillable, column] = interpolated.loc[fillable]
            _record_action(dataframe, "interpolated", fillable)
    return visible_roots


def _replace_isolated_outliers(
    dataframe: pd.DataFrame,
    roots: t.Sequence[str],
    coordinate_fields: t.Sequence[str],
    config: PosePreprocessingConfig,
) -> None:
    """Replace isolated normalized spikes using their finite neighbor midpoint."""

    for root in roots:
        columns = [f"{root}_{field}" for field in coordinate_fields]
        coordinates = dataframe[columns].to_numpy(dtype=float)
        finite_triplet = (
            np.isfinite(coordinates[:-2]).all(axis=1)
            & np.isfinite(coordinates[1:-1]).all(axis=1)
            & np.isfinite(coordinates[2:]).all(axis=1)
        )
        midpoint = (coordinates[:-2] + coordinates[2:]) / 2.0
        residual = np.linalg.norm(coordinates[1:-1] - midpoint, axis=1)
        neighbor_chord = np.linalg.norm(coordinates[2:] - coordinates[:-2], axis=1)
        interior_outlier = (
            finite_triplet
            & (residual > config.isolated_outlier_threshold)
            & (residual > config.isolated_outlier_ratio * neighbor_chord)
        )
        outlier = pd.Series(False, index=dataframe.index)
        outlier.iloc[1:-1] = interior_outlier
        if outlier.any():
            dataframe.loc[outlier, columns] = midpoint[interior_outlier]
            _record_action(dataframe, "outlier_replaced", outlier)


def _smooth_visible_landmarks(
    dataframe: pd.DataFrame,
    roots: t.Sequence[str],
    coordinate_fields: t.Sequence[str],
    neighbor_weight: float,
) -> None:
    """Apply a symmetric three-sample filter without crossing missing samples."""

    if neighbor_weight == 0.0:
        return

    for root in roots:
        columns = [f"{root}_{field}" for field in coordinate_fields]
        coordinates = dataframe[columns].to_numpy(dtype=float)
        finite_triplet = (
            np.isfinite(coordinates[:-2]).all(axis=1)
            & np.isfinite(coordinates[1:-1]).all(axis=1)
            & np.isfinite(coordinates[2:]).all(axis=1)
        )
        smoothed_values = (
            neighbor_weight * coordinates[:-2]
            + (1.0 - 2.0 * neighbor_weight) * coordinates[1:-1]
            + neighbor_weight * coordinates[2:]
        )
        smoothed = pd.Series(False, index=dataframe.index)
        smoothed.iloc[1:-1] = finite_triplet
        if smoothed.any():
            dataframe.loc[smoothed, columns] = smoothed_values[finite_triplet]
            _record_action(dataframe, "smoothed", smoothed)


def preprocess_pose_dataframe(
    raw_pose_df: pd.DataFrame,
    pose_data_type: PoseDataType,
    config: PosePreprocessingConfig | None = None,
) -> pd.DataFrame:
    """Recenter and torso-normalize one raw pose dataframe.

    Non-coordinate columns, including study metadata such as ``timestamp`` and
    ``is_valid``, are preserved. Frames without a finite hip midpoint or a
    positive torso length are marked unusable and receive NaN coordinates.
    Passing ``None`` preserves the historical preprocessing output exactly.
    An explicit config enables auditable visibility, gap, outlier, and optional
    smoothing cleanup for body landmarks that have visibility columns.
    """

    schema = get_pose_data_schema(pose_data_type)
    coordinate_fields = schema.coordinate_fields
    clean_pose_df = raw_pose_df.copy()
    coordinate_roots = _find_coordinate_roots(clean_pose_df, coordinate_fields)
    visible_roots: list[str] = []
    if config is not None:
        _initialize_action_metadata(clean_pose_df)
        visible_roots = _clean_visible_landmarks(
            clean_pose_df, coordinate_roots, coordinate_fields, config
        )

    hip_midpoint = _midpoint(clean_pose_df, LEFT_HIP, RIGHT_HIP, coordinate_fields)
    shoulder_midpoint = _midpoint(
        clean_pose_df, LEFT_SHOULDER, RIGHT_SHOULDER, coordinate_fields
    )

    torso_length = pd.Series(0.0, index=clean_pose_df.index, dtype=float)
    for coordinate_field in coordinate_fields:
        torso_length = torso_length + (
            shoulder_midpoint[coordinate_field] - hip_midpoint[coordinate_field]
        ).pow(2)
    torso_length = torso_length.pow(0.5)

    root_is_finite = pd.Series(True, index=clean_pose_df.index)
    for coordinate_field in coordinate_fields:
        root_is_finite = root_is_finite & hip_midpoint[coordinate_field].notna()
    usable_frame_mask = root_is_finite & torso_length.notna() & torso_length.gt(0)

    for coordinate_field in coordinate_fields:
        clean_pose_df[f"{PREPROCESS_ROOT_COLUMN_PREFIX}_{coordinate_field}"] = hip_midpoint[
            coordinate_field
        ]
        clean_pose_df[f"base_{coordinate_field}"] = hip_midpoint[coordinate_field].where(
            usable_frame_mask, np.nan
        )

    if all(
        f"{hip}_vis" in clean_pose_df.columns
        for hip in (LEFT_HIP, RIGHT_HIP)
    ):
        clean_pose_df["base_vis"] = (
            clean_pose_df[f"{LEFT_HIP}_vis"] + clean_pose_df[f"{RIGHT_HIP}_vis"]
        ).div(2.0).where(usable_frame_mask, np.nan)

    clean_pose_df[PREPROCESS_TORSO_LENGTH_COLUMN] = torso_length
    clean_pose_df[PREPROCESS_USABLE_FRAME_COLUMN] = usable_frame_mask.astype(int)

    for coordinate_root in coordinate_roots:
        for coordinate_field in coordinate_fields:
            column_name = f"{coordinate_root}_{coordinate_field}"
            clean_pose_df[column_name] = (
                (clean_pose_df[column_name] - hip_midpoint[coordinate_field]) / torso_length
            ).where(usable_frame_mask, np.nan)

    if config is not None:
        _replace_isolated_outliers(clean_pose_df, visible_roots, coordinate_fields, config)
        if config.smoothing == "triangular3":
            _smooth_visible_landmarks(
                clean_pose_df,
                visible_roots,
                coordinate_fields,
                config.triangular3_neighbor_weight,
            )

    return clean_pose_df


def preprocess_pose_file(
    raw_pose_csv_path: Path,
    clean_pose_csv_path: Path,
    pose_data_type: PoseDataType,
    config: PosePreprocessingConfig | None = None,
) -> None:
    """Load, preprocess, and save one pose CSV with optional cleanup."""

    raw_pose_df = pd.read_csv(raw_pose_csv_path, index_col="frame")
    clean_pose_df = preprocess_pose_dataframe(raw_pose_df, pose_data_type, config=config)
    clean_pose_csv_path.parent.mkdir(parents=True, exist_ok=True)
    clean_pose_df.to_csv(clean_pose_csv_path, index_label="frame")


def preprocess_pose_data(
    pose_data_root: Path,
    pose_data_type: PoseDataType,
    output_root: Path | None = None,
    rewrite_existing: bool = False,
    print_prefix: t.Callable[[], str] = lambda: "",
    config: PosePreprocessingConfig | None = None,
) -> pd.DataFrame:
    """Preprocess all raw pose artifacts under one directory."""

    schema = get_pose_data_schema(pose_data_type)
    pose_data_root.mkdir(parents=True, exist_ok=True)
    destination_root = output_root or pose_data_root
    destination_root.mkdir(parents=True, exist_ok=True)
    migrate_legacy_pose_csv_outputs(pose_data_root, pose_data_type)
    raw_pose_files = collect_pose_data_files(
        pose_data_root, pose_data_type, preferred_versions=("raw", "legacy")
    )
    summary_rows: list[pd.Series] = []
    computed_count = 0
    cached_count = 0

    for raw_pose_csv_path in raw_pose_files:
        relative_stem = relative_stem_from_pose_csv_path(
            raw_pose_csv_path, pose_data_root, pose_data_type
        )
        clean_pose_csv_path = destination_root / f"{relative_stem}{schema.clean_suffix}"
        if (
            config is not None
            or rewrite_existing
            or not clean_pose_csv_path.exists()
            or clean_pose_csv_path.stat().st_size == 0
        ):
            preprocess_pose_file(
                raw_pose_csv_path, clean_pose_csv_path, pose_data_type, config=config
            )
            status = "computed"
            computed_count += 1
        else:
            status = "cached"
            cached_count += 1

        clean_pose_df = pd.read_csv(clean_pose_csv_path, index_col="frame")
        summary_row: dict[str, t.Any] = {
            "file": relative_stem,
            "status": status,
            "frame_count": len(clean_pose_df.index),
            "usable_frame_count": int(
                clean_pose_df.get(
                    PREPROCESS_USABLE_FRAME_COLUMN, pd.Series(dtype=int)
                ).sum()
            ),
            "median_torso_length": float(
                clean_pose_df[PREPROCESS_TORSO_LENGTH_COLUMN].median()
            ),
        }
        if config is not None:
            for action in PREPROCESS_ACTIONS:
                count_column = f"preprocess_{action}_landmark_count"
                summary_row[count_column] = int(clean_pose_df[count_column].sum())
        summary_rows.append(pd.Series(summary_row))

    summary_df = pd.DataFrame(summary_rows)
    if not summary_df.empty:
        summary_df.sort_values(by="file", inplace=True)
    print(
        f"{print_prefix()} Preprocessed {computed_count} {pose_data_type.value} files, "
        f"used cached clean files for {cached_count}"
    )
    return summary_df
