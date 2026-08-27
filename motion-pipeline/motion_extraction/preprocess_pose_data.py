"""Compatibility façade for the shared pose preprocessing package.

The implementation now lives in :mod:`dance_teacher_pose`. This module keeps
the historical import path and artifact-reporting behavior used by the
reference pipeline while callers migrate to the shared package directly.
"""

from __future__ import annotations

from pathlib import Path
import typing as t

import pandas as pd

from dance_teacher_pose.preprocessing import (
    PREPROCESS_ROOT_COLUMN_PREFIX,
    PREPROCESS_TORSO_LENGTH_COLUMN,
    PREPROCESS_USABLE_FRAME_COLUMN,
    PosePreprocessingConfig,
    preprocess_pose_dataframe,
    preprocess_pose_file,
)
from dance_teacher_pose.schema import (
    PoseDataSchema,
    PoseDataType,
    clip_stem_from_pose_csv_path,
    collect_pose_data_files,
    get_pose_data_schema,
    is_clean_pose_data_file,
    migrate_legacy_pose_csv_outputs,
    relative_stem_from_pose_csv_path,
    rename_pose_csv_suffix,
)

from .artifacts import build_artifact_report, resolve_artifact_output_dir


def preprocess_pose_data(
    pose_data_root: Path,
    pose_data_type: PoseDataType,
    output_root: t.Optional[Path] = None,
    rewrite_existing: bool = False,
    print_prefix: t.Callable[[], str] = lambda: "",
    artifact_archive_root: t.Optional[Path] = None,
    artifact_output_dir: t.Optional[Path] = None,
    config: t.Optional[PosePreprocessingConfig] = None,
) -> pd.DataFrame:
    """Preprocess one pose-data tree and preserve the legacy report contract."""

    artifact_dir = resolve_artifact_output_dir(
        artifact_archive_root=artifact_archive_root,
        artifact_output_dir=artifact_output_dir,
        default_label=f"preprocess-{pose_data_type.value}",
    )
    summary_df = _shared_preprocess_pose_data(
        pose_data_root=pose_data_root,
        pose_data_type=pose_data_type,
        output_root=output_root,
        rewrite_existing=rewrite_existing,
        print_prefix=print_prefix,
        config=config,
    )
    if artifact_dir is not None:
        schema = get_pose_data_schema(pose_data_type)
        report = build_artifact_report(
            artifact_dir,
            title=f"Preprocess {pose_data_type.value} Report",
            intro=f"Generated clean `{pose_data_type.value}` CSVs under `{pose_data_root}`.",
        )
        report.add_heading("Run Summary")
        computed = int((summary_df.get("status") == "computed").sum()) if not summary_df.empty else 0
        cached = int((summary_df.get("status") == "cached").sum()) if not summary_df.empty else 0
        report.add_list(
            [
                f"Pose-data root: `{pose_data_root}`",
                f"Clean output root: `{output_root or pose_data_root}`",
                f"Pose-data type: `{pose_data_type.value}`",
                f"Raw suffix: `{schema.raw_suffix}`",
                f"Clean suffix: `{schema.clean_suffix}`",
                f"Rewrite existing: `{rewrite_existing}`",
                f"Cleanup config: `{config}`",
                f"Files computed: `{computed}`",
                f"Files cached: `{cached}`",
            ]
        )
        if not summary_df.empty:
            report.add_heading("Per-File Summary")
            report.add_dataframe(
                "preprocess_summary", summary_df, max_rows_in_markdown=10, preview_rows=10
            )
        report.write()
    return summary_df


def preprocess_all_pose_data(
    *,
    holistic_data_root: t.Optional[Path],
    pose2d_data_root: t.Optional[Path],
    holistic_output_root: t.Optional[Path] = None,
    pose2d_output_root: t.Optional[Path] = None,
    rewrite_existing: bool = False,
    print_prefix: t.Callable[[], str] = lambda: "",
    artifact_archive_root: t.Optional[Path] = None,
    artifact_output_dir: t.Optional[Path] = None,
    config: t.Optional[PosePreprocessingConfig] = None,
) -> dict[PoseDataType, pd.DataFrame]:
    """Preprocess any configured pose-data roots through the shared library."""

    output: dict[PoseDataType, pd.DataFrame] = {}
    if holistic_data_root is not None:
        output[PoseDataType.holistic_3d] = preprocess_pose_data(
            pose_data_root=holistic_data_root,
            pose_data_type=PoseDataType.holistic_3d,
            output_root=holistic_output_root,
            rewrite_existing=rewrite_existing,
            print_prefix=print_prefix,
            artifact_archive_root=artifact_archive_root,
            artifact_output_dir=None
            if artifact_output_dir is None
            else artifact_output_dir / "holistic_3d",
            config=config,
        )
    if pose2d_data_root is not None:
        output[PoseDataType.pose2d] = preprocess_pose_data(
            pose_data_root=pose2d_data_root,
            pose_data_type=PoseDataType.pose2d,
            output_root=pose2d_output_root,
            rewrite_existing=rewrite_existing,
            print_prefix=print_prefix,
            artifact_archive_root=artifact_archive_root,
            artifact_output_dir=None
            if artifact_output_dir is None
            else artifact_output_dir / "pose2d",
            config=config,
        )
    return output


from dance_teacher_pose.preprocessing import preprocess_pose_data as _shared_preprocess_pose_data


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
