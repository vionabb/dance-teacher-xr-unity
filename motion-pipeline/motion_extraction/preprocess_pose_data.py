"""Preprocess extracted pose CSVs into explicit clean pose-data artifacts.

This module defines the raw/clean file naming contract for extracted pose data
and currently implements the first preprocessing phase:

1. torso/root recentering using the midpoint of the hips; and
2. normalization by torso length using the shoulder-midpoint to hip-midpoint
   distance.

Raw files are preserved. Clean files are written as sibling CSVs with
`.clean.csv` suffixes.
"""

from __future__ import annotations

from dataclasses import dataclass
import enum
from pathlib import Path
import typing as t

import numpy as np
import pandas as pd

from .artifacts import build_artifact_report, resolve_artifact_output_dir
from .mp_utils import PoseLandmark

_HOLISTIC_DATA_LEGACY_SUFFIX = ".holisticdata.csv"
_HOLISTIC_DATA_RAW_SUFFIX = ".holisticdata.raw.csv"
_HOLISTIC_DATA_CLEAN_SUFFIX = ".holisticdata.clean.csv"

_POSE2D_DATA_LEGACY_SUFFIX = ".pose2d.csv"
_POSE2D_DATA_RAW_SUFFIX = ".pose2d.raw.csv"
_POSE2D_DATA_CLEAN_SUFFIX = ".pose2d.clean.csv"

PREPROCESS_ROOT_COLUMN_PREFIX = "preprocess_root"
PREPROCESS_TORSO_LENGTH_COLUMN = "preprocess_torso_length"
PREPROCESS_USABLE_FRAME_COLUMN = "preprocess_is_usable"


class PoseDataType(enum.Enum):
    """Supported pose CSV modalities."""

    holistic_3d = "holistic_3d"
    pose2d = "pose2d"


@dataclass(frozen=True)
class PoseDataSchema:
    """File and column conventions for one pose-data modality."""

    pose_data_type: PoseDataType
    coordinate_fields: t.Tuple[str, ...]
    legacy_suffix: str
    raw_suffix: str
    clean_suffix: str


_POSE_DATA_SCHEMAS: t.Final[dict[PoseDataType, PoseDataSchema]] = {
    PoseDataType.holistic_3d: PoseDataSchema(
        pose_data_type=PoseDataType.holistic_3d,
        coordinate_fields=("x", "y", "z"),
        legacy_suffix=_HOLISTIC_DATA_LEGACY_SUFFIX,
        raw_suffix=_HOLISTIC_DATA_RAW_SUFFIX,
        clean_suffix=_HOLISTIC_DATA_CLEAN_SUFFIX,
    ),
    PoseDataType.pose2d: PoseDataSchema(
        pose_data_type=PoseDataType.pose2d,
        coordinate_fields=("x", "y", "distance"),
        legacy_suffix=_POSE2D_DATA_LEGACY_SUFFIX,
        raw_suffix=_POSE2D_DATA_RAW_SUFFIX,
        clean_suffix=_POSE2D_DATA_CLEAN_SUFFIX,
    ),
}


def get_pose_data_schema(pose_data_type: PoseDataType) -> PoseDataSchema:
    """Return the schema definition for one supported pose-data modality."""

    return _POSE_DATA_SCHEMAS[pose_data_type]


def rename_pose_csv_suffix(file_path: Path, old_suffix: str, new_suffix: str) -> Path:
    """Return `file_path` with one known pose-data suffix replaced."""

    if not file_path.name.endswith(old_suffix):
        return file_path
    return file_path.with_name(file_path.name[: -len(old_suffix)] + new_suffix)


def relative_stem_from_pose_csv_path(
    pose_csv_path: Path,
    root_folder: Path,
    pose_data_type: PoseDataType,
) -> str:
    """Return the relative clip stem for a pose CSV path under `root_folder`."""

    schema = get_pose_data_schema(pose_data_type)
    relative_path = pose_csv_path.relative_to(root_folder).as_posix()
    for suffix in (schema.clean_suffix, schema.raw_suffix, schema.legacy_suffix):
        if relative_path.endswith(suffix):
            return relative_path[: -len(suffix)]
    return Path(relative_path).with_suffix("").as_posix()


def clip_stem_from_pose_csv_path(pose_csv_path: Path, pose_data_type: PoseDataType) -> str:
    """Return the clip stem for one pose CSV filename."""

    schema = get_pose_data_schema(pose_data_type)
    name = pose_csv_path.name
    for suffix in (schema.clean_suffix, schema.raw_suffix, schema.legacy_suffix):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return pose_csv_path.stem


def is_clean_pose_data_file(file_path: Path, pose_data_type: PoseDataType) -> bool:
    """Return whether `file_path` already points at a clean pose-data CSV."""

    return file_path.name.endswith(get_pose_data_schema(pose_data_type).clean_suffix)


def migrate_legacy_pose_csv_outputs(output_folder: Path, pose_data_type: PoseDataType) -> None:
    """Rename legacy extracted pose CSVs to their explicit `.raw.csv` form."""

    schema = get_pose_data_schema(pose_data_type)
    if not output_folder.exists():
        return
    for legacy_csv_path in output_folder.rglob(f"*{schema.legacy_suffix}"):
        raw_csv_path = rename_pose_csv_suffix(
            legacy_csv_path,
            schema.legacy_suffix,
            schema.raw_suffix,
        )
        if raw_csv_path.exists():
            continue
        legacy_csv_path.rename(raw_csv_path)


def collect_pose_data_files(
    root_folder: Path,
    pose_data_type: PoseDataType,
    preferred_versions: t.Sequence[str] = ("clean", "raw", "legacy"),
) -> list[Path]:
    """Collect pose CSV files under `root_folder`, preferring one version per stem."""

    schema = get_pose_data_schema(pose_data_type)
    version_to_suffix = {
        "legacy": schema.legacy_suffix,
        "raw": schema.raw_suffix,
        "clean": schema.clean_suffix,
    }
    files_by_relative_stem: dict[str, Path] = {}
    for version in reversed(tuple(preferred_versions)):
        suffix = version_to_suffix[version]
        for pose_csv_path in root_folder.rglob(f"*{suffix}"):
            relative_stem = relative_stem_from_pose_csv_path(
                pose_csv_path,
                root_folder,
                pose_data_type,
            )
            files_by_relative_stem[relative_stem] = pose_csv_path
    return list(files_by_relative_stem.values())


def _find_coordinate_roots(
    dataframe: pd.DataFrame,
    coordinate_fields: t.Sequence[str],
) -> list[str]:
    roots = []
    required_suffixes = {f"_{field}" for field in coordinate_fields}
    for column_name in dataframe.columns:
        if "_" not in column_name:
            continue
        root, suffix = column_name.rsplit("_", 1)
        if f"_{suffix}" not in required_suffixes or root in roots:
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


def preprocess_pose_dataframe(
    raw_pose_df: pd.DataFrame,
    pose_data_type: PoseDataType,
) -> pd.DataFrame:
    """Return a clean pose dataframe with root recentering and torso scaling.

    The returned dataframe preserves non-coordinate columns and visibility
    values. Coordinate columns are rewritten into the clean coordinate space.
    Frames without a usable hip center or torso length are marked unusable and
    their transformed coordinate columns are set to `NaN`.
    """

    schema = get_pose_data_schema(pose_data_type)
    coordinate_fields = schema.coordinate_fields

    clean_pose_df = raw_pose_df.copy()
    coordinate_roots = _find_coordinate_roots(clean_pose_df, coordinate_fields)

    hip_midpoint = _midpoint(
        clean_pose_df,
        PoseLandmark.LEFT_HIP.name,
        PoseLandmark.RIGHT_HIP.name,
        coordinate_fields,
    )
    shoulder_midpoint = _midpoint(
        clean_pose_df,
        PoseLandmark.LEFT_SHOULDER.name,
        PoseLandmark.RIGHT_SHOULDER.name,
        coordinate_fields,
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
        # Complexity runs that include the base landmark need the original
        # hip midpoint alongside the recentered landmark coordinates.
        clean_pose_df[f"base_{coordinate_field}"] = hip_midpoint[coordinate_field]
    if all(
        f"{hip}_{visibility_field}" in clean_pose_df.columns
        for hip in (PoseLandmark.LEFT_HIP.name, PoseLandmark.RIGHT_HIP.name)
        for visibility_field in ("vis",)
    ):
        clean_pose_df["base_vis"] = (
            clean_pose_df[f"{PoseLandmark.LEFT_HIP.name}_vis"]
            + clean_pose_df[f"{PoseLandmark.RIGHT_HIP.name}_vis"]
        ) / 2.0
    clean_pose_df[PREPROCESS_TORSO_LENGTH_COLUMN] = torso_length
    clean_pose_df[PREPROCESS_USABLE_FRAME_COLUMN] = usable_frame_mask.astype(int)

    for coordinate_root in coordinate_roots:
        for coordinate_field in coordinate_fields:
            column_name = f"{coordinate_root}_{coordinate_field}"
            clean_pose_df[column_name] = (
                (
                    clean_pose_df[column_name]
                    - hip_midpoint[coordinate_field]
                )
                / torso_length
            ).where(usable_frame_mask, np.nan)

    return clean_pose_df


def preprocess_pose_file(
    raw_pose_csv_path: Path,
    clean_pose_csv_path: Path,
    pose_data_type: PoseDataType,
) -> None:
    """Load one raw pose CSV, preprocess it, and persist the clean result."""

    raw_pose_df = pd.read_csv(raw_pose_csv_path, index_col="frame")
    clean_pose_df = preprocess_pose_dataframe(raw_pose_df, pose_data_type)
    clean_pose_csv_path.parent.mkdir(parents=True, exist_ok=True)
    clean_pose_df.to_csv(clean_pose_csv_path, index_label="frame")


def preprocess_pose_data(
    pose_data_root: Path,
    pose_data_type: PoseDataType,
    rewrite_existing: bool = False,
    print_prefix: t.Callable[[], str] = lambda: "",
    artifact_archive_root: t.Optional[Path] = None,
    artifact_output_dir: t.Optional[Path] = None,
) -> pd.DataFrame:
    """Preprocess one extracted pose-data tree into sibling clean CSVs."""

    schema = get_pose_data_schema(pose_data_type)
    pose_data_root.mkdir(parents=True, exist_ok=True)
    migrate_legacy_pose_csv_outputs(pose_data_root, pose_data_type)

    artifact_dir = resolve_artifact_output_dir(
        artifact_archive_root=artifact_archive_root,
        artifact_output_dir=artifact_output_dir,
        default_label=f"preprocess-{pose_data_type.value}",
    )

    raw_pose_files = collect_pose_data_files(
        pose_data_root,
        pose_data_type,
        preferred_versions=("raw", "legacy"),
    )
    summary_rows: list[pd.Series] = []
    computed_count = 0
    cached_count = 0

    for raw_pose_csv_path in raw_pose_files:
        relative_stem = relative_stem_from_pose_csv_path(
            raw_pose_csv_path,
            pose_data_root,
            pose_data_type,
        )
        clean_pose_csv_path = pose_data_root / f"{relative_stem}{schema.clean_suffix}"
        status = "cached"
        if rewrite_existing or not clean_pose_csv_path.exists() or clean_pose_csv_path.stat().st_size == 0:
            preprocess_pose_file(raw_pose_csv_path, clean_pose_csv_path, pose_data_type)
            status = "computed"
            computed_count += 1
        else:
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
                            PREPROCESS_USABLE_FRAME_COLUMN,
                            pd.Series(dtype=int),
                        ).sum()
                    ),
                    "median_torso_length": float(
                        clean_pose_df.get(
                            PREPROCESS_TORSO_LENGTH_COLUMN,
                            pd.Series(dtype=float),
                        ).median()
                    )
                    if PREPROCESS_TORSO_LENGTH_COLUMN in clean_pose_df.columns
                    else np.nan,
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

    if artifact_dir is not None:
        report = build_artifact_report(
            artifact_dir,
            title=f"Preprocess {pose_data_type.value} Report",
            intro=(
                f"Generated clean `{pose_data_type.value}` CSVs under `{pose_data_root}`."
            ),
        )
        report.add_heading("Run Summary")
        report.add_list(
            [
                f"Pose-data root: `{pose_data_root}`",
                f"Pose-data type: `{pose_data_type.value}`",
                f"Raw suffix: `{schema.raw_suffix}`",
                f"Clean suffix: `{schema.clean_suffix}`",
                f"Rewrite existing: `{rewrite_existing}`",
                f"Files computed: `{computed_count}`",
                f"Files cached: `{cached_count}`",
            ]
        )
        if not summary_df.empty:
            report.add_heading("Per-File Summary")
            report.add_dataframe(
                "preprocess_summary",
                summary_df,
                max_rows_in_markdown=10,
                preview_rows=10,
            )
        report.write()

    return summary_df


def preprocess_all_pose_data(
    *,
    holistic_data_root: t.Optional[Path],
    pose2d_data_root: t.Optional[Path],
    rewrite_existing: bool = False,
    print_prefix: t.Callable[[], str] = lambda: "",
    artifact_archive_root: t.Optional[Path] = None,
    artifact_output_dir: t.Optional[Path] = None,
) -> dict[PoseDataType, pd.DataFrame]:
    """Preprocess any configured extracted pose-data roots."""

    output: dict[PoseDataType, pd.DataFrame] = {}
    if holistic_data_root is not None:
        output[PoseDataType.holistic_3d] = preprocess_pose_data(
            pose_data_root=holistic_data_root,
            pose_data_type=PoseDataType.holistic_3d,
            rewrite_existing=rewrite_existing,
            print_prefix=print_prefix,
            artifact_archive_root=artifact_archive_root,
            artifact_output_dir=None if artifact_output_dir is None else artifact_output_dir / "holistic_3d",
        )
    if pose2d_data_root is not None:
        output[PoseDataType.pose2d] = preprocess_pose_data(
            pose_data_root=pose2d_data_root,
            pose_data_type=PoseDataType.pose2d,
            rewrite_existing=rewrite_existing,
            print_prefix=print_prefix,
            artifact_archive_root=artifact_archive_root,
            artifact_output_dir=None if artifact_output_dir is None else artifact_output_dir / "pose2d",
        )
    return output


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--pose_data_root", type=Path, required=True)
    parser.add_argument(
        "--pose_data_type",
        choices=[pose_data_type.name for pose_data_type in PoseDataType],
        required=True,
    )
    parser.add_argument("--rewrite_existing", action="store_true", default=False)
    parser.add_argument("--artifact_archive_root", type=Path, default=None)
    parser.add_argument("--artifact_output_dir", type=Path, default=None)
    args = parser.parse_args()

    preprocess_pose_data(
        pose_data_root=args.pose_data_root,
        pose_data_type=PoseDataType[args.pose_data_type],
        rewrite_existing=args.rewrite_existing,
        artifact_archive_root=args.artifact_archive_root,
        artifact_output_dir=args.artifact_output_dir,
    )
