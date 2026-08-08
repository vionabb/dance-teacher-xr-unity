"""Stage a Drive dataset locally and run the validated reference-video pipeline."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import typing as t

from .dancetree.run_dancetree_pipeline import run_dancetree_pipeline
from .pipeline_validation import PipelineOutputLayout, PipelineOutputValidator
from .rclone_transfer import pull


def _default_run_dir() -> Path:
    """Return a unique local output directory for one staged run."""

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return Path("temp") / "rclone_pipeline_runs" / timestamp


def run_staged_pipeline(
    remote_path: str,
    run_dir: Path,
    *,
    include_audio_in_bundle: bool = False,
    include_thumbnail_in_bundle: bool = False,
    rewrite_existing_holistic_data: bool = False,
    rewrite_existing_preprocessed_pose_data: bool = False,
    skip_existing_cumulative_complexity: bool = False,
    skip_existing_audioanalysis: bool = False,
) -> Path:
    """Pull ``remote_path``, run the local pipeline, and write run metadata."""

    run_dir = run_dir.resolve()
    source_dir = run_dir / "source"
    output_dir = run_dir / "output"
    source_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Staging dataset:{remote_path} into {source_dir}")
    pull(remote_path, source_dir)

    layout = PipelineOutputLayout(
        database_csv_path=output_dir / "db.csv",
        video_srcdir=source_dir,
        holistic_data_srcdir=output_dir / "holistic_data",
        pose2d_data_srcdir=output_dir / "pose2d_data",
        temp_dir=output_dir / "temp",
        bundle_export_path=output_dir / "bundle" / "nonmedia",
        bundle_media_export_path=output_dir / "bundle" / "media",
    )
    validator = PipelineOutputValidator(layout)

    run_dancetree_pipeline(
        database_csv_path=layout.database_csv_path,
        video_srcdir=layout.video_srcdir,
        holistic_data_srcdir=layout.holistic_data_srcdir,
        pose2d_data_srcdir=layout.pose2d_data_srcdir,
        temp_dir=layout.temp_dir,
        bundle_export_path=layout.bundle_export_path,
        bundle_media_export_path=layout.bundle_media_export_path,
        include_audio_in_bundle=include_audio_in_bundle,
        include_thumbnail_in_bundle=include_thumbnail_in_bundle,
        rewrite_existing_holistic_data=rewrite_existing_holistic_data,
        rewrite_existing_preprocessed_pose_data=rewrite_existing_preprocessed_pose_data,
        skip_existing_cumulative_complexity=skip_existing_cumulative_complexity,
        skip_existing_audioanalysis=skip_existing_audioanalysis,
        visibility_mode="interpolate",
        artifact_archive_root=output_dir / "artifact-archive",
        stage_validator=validator,
    )

    metadata = {
        "remote_path": f"dataset:{remote_path}",
        "completed_at_utc": datetime.now(timezone.utc).isoformat(),
        "run_directory": ".",
        "source_directory": "source",
        "output_directory": "output",
        "validated_stages": validator.validated_stages,
        "parameters": {
            "include_audio_in_bundle": include_audio_in_bundle,
            "include_thumbnail_in_bundle": include_thumbnail_in_bundle,
            "rewrite_existing_holistic_data": rewrite_existing_holistic_data,
            "rewrite_existing_preprocessed_pose_data": rewrite_existing_preprocessed_pose_data,
            "skip_existing_cumulative_complexity": skip_existing_cumulative_complexity,
            "skip_existing_audioanalysis": skip_existing_audioanalysis,
        },
    }
    metadata_path = run_dir / "run-manifest.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Validated {len(validator.validated_stages)} pipeline stages")
    print(f"Run manifest: {metadata_path}")
    return run_dir


def main(argv: t.Sequence[str] | None = None) -> None:
    """Parse the staged-run CLI and execute it."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--remote-path",
        required=True,
        help="path below the read-only dataset rclone remote, e.g. referencevideos",
    )
    parser.add_argument(
        "--run-dir",
        type=Path,
        default=None,
        help="local run directory; defaults to a timestamped directory under temp/",
    )
    parser.add_argument("--include-audio-in-bundle", action="store_true")
    parser.add_argument("--include-thumbnail-in-bundle", action="store_true")
    parser.add_argument("--rewrite-existing-holistic-data", action="store_true")
    parser.add_argument("--rewrite-existing-preprocessed-pose-data", action="store_true")
    parser.add_argument("--skip-existing-cumulative-complexity", action="store_true")
    parser.add_argument("--skip-existing-audioanalysis", action="store_true")
    args = parser.parse_args(argv)

    run_staged_pipeline(
        args.remote_path,
        args.run_dir or _default_run_dir(),
        include_audio_in_bundle=args.include_audio_in_bundle,
        include_thumbnail_in_bundle=args.include_thumbnail_in_bundle,
        rewrite_existing_holistic_data=args.rewrite_existing_holistic_data,
        rewrite_existing_preprocessed_pose_data=args.rewrite_existing_preprocessed_pose_data,
        skip_existing_cumulative_complexity=args.skip_existing_cumulative_complexity,
        skip_existing_audioanalysis=args.skip_existing_audioanalysis,
    )


if __name__ == "__main__":
    main()
