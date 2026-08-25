"""Clean pose preprocessing shared by reference and study workflows."""

from __future__ import annotations

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

LEFT_HIP = "LEFT_HIP"
RIGHT_HIP = "RIGHT_HIP"
LEFT_SHOULDER = "LEFT_SHOULDER"
RIGHT_SHOULDER = "RIGHT_SHOULDER"


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


def preprocess_pose_dataframe(raw_pose_df: pd.DataFrame, pose_data_type: PoseDataType) -> pd.DataFrame:
    """Recenter and torso-normalize one raw pose dataframe.

    Non-coordinate columns, including study metadata such as ``timestamp`` and
    ``is_valid``, are preserved. Frames without a finite hip midpoint or a
    positive torso length are marked unusable and receive NaN coordinates.
    """

    schema = get_pose_data_schema(pose_data_type)
    coordinate_fields = schema.coordinate_fields
    clean_pose_df = raw_pose_df.copy()
    coordinate_roots = _find_coordinate_roots(clean_pose_df, coordinate_fields)

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

    return clean_pose_df


def preprocess_pose_file(
    raw_pose_csv_path: Path,
    clean_pose_csv_path: Path,
    pose_data_type: PoseDataType,
) -> None:
    """Load, preprocess, and save one pose CSV."""

    raw_pose_df = pd.read_csv(raw_pose_csv_path, index_col="frame")
    clean_pose_df = preprocess_pose_dataframe(raw_pose_df, pose_data_type)
    clean_pose_csv_path.parent.mkdir(parents=True, exist_ok=True)
    clean_pose_df.to_csv(clean_pose_csv_path, index_label="frame")


def preprocess_pose_data(
    pose_data_root: Path,
    pose_data_type: PoseDataType,
    output_root: Path | None = None,
    rewrite_existing: bool = False,
    print_prefix: t.Callable[[], str] = lambda: "",
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
        if rewrite_existing or not clean_pose_csv_path.exists() or clean_pose_csv_path.stat().st_size == 0:
            preprocess_pose_file(raw_pose_csv_path, clean_pose_csv_path, pose_data_type)
            status = "computed"
            computed_count += 1
        else:
            status = "cached"
            cached_count += 1

        clean_pose_df = pd.read_csv(clean_pose_csv_path, index_col="frame")
        summary_rows.append(
            pd.Series(
                {
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
            )
        )

    summary_df = pd.DataFrame(summary_rows)
    if not summary_df.empty:
        summary_df.sort_values(by="file", inplace=True)
    print(
        f"{print_prefix()} Preprocessed {computed_count} {pose_data_type.value} files, "
        f"used cached clean files for {cached_count}"
    )
    return summary_df
