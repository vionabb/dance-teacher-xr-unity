"""Run the validated reference-video pipeline from Drive staging or a local cache."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import typing as t

from .dancetree.run_dancetree_pipeline import PIPELINE_STAGES, run_dancetree_pipeline
from .pipeline_validation import PipelineOutputLayout, PipelineOutputValidator
from .rclone_transfer import pull


def _default_run_dir() -> Path:
    """Return a unique local output directory for one staged run."""

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return Path("temp") / "rclone_pipeline_runs" / timestamp


def _write_manifest(path: Path, manifest: dict[str, t.Any]) -> None:
    """Write a readable snapshot of a staged run's current state."""

    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def _copy_cached_run(
    reuse_from: Path, run_dir: Path, *, copy_source: bool = True
) -> None:
    """Copy generated outputs and, only when requested, the staged video source."""

    cached_source = reuse_from / "source"
    cached_output = reuse_from / "output"
    if not cached_output.is_dir() or (copy_source and not cached_source.is_dir()):
        raise ValueError(
            "reuse_from must contain output/ and, without --video-srcdir, source/: "
            f"{reuse_from}"
        )
    if run_dir.resolve() == reuse_from.resolve():
        raise ValueError("run_dir must differ from reuse_from to protect the cached run")
    if any(run_dir.iterdir()):
        raise ValueError(
            f"run_dir must be empty when reusing a cached run: {run_dir}"
        )
    if copy_source:
        shutil.copytree(cached_source, run_dir / "source")
    shutil.copytree(cached_output, run_dir / "output")


def _stage_range(start_at: str | None, stop_after: str | None) -> tuple[str, ...]:
    """Validate and return one inclusive contiguous pipeline stage range."""

    start = start_at or PIPELINE_STAGES[0]
    stop = stop_after or PIPELINE_STAGES[-1]
    try:
        start_index = PIPELINE_STAGES.index(start)
        stop_index = PIPELINE_STAGES.index(stop)
    except ValueError as error:
        raise ValueError(f"Unknown pipeline stage: {error.args[0]!r}") from error
    if start_index > stop_index:
        raise ValueError("start_at must not come after stop_after")
    return PIPELINE_STAGES[start_index : stop_index + 1]


def run_staged_pipeline(
    remote_path: str | None,
    run_dir: Path,
    *,
    include_audio_in_bundle: bool = False,
    include_thumbnail_in_bundle: bool = False,
    rewrite_existing_holistic_data: bool = False,
    rewrite_existing_preprocessed_pose_data: bool = False,
    skip_existing_cumulative_complexity: bool = False,
    skip_existing_audioanalysis: bool = False,
    start_at: str | None = None,
    stop_after: str | None = None,
    reuse_from: Path | None = None,
    video_srcdir: Path | None = None,
    database_csv_path: Path | None = None,
    holistic_data_srcdir: Path | None = None,
    pose2d_data_srcdir: Path | None = None,
    temp_dir: Path | None = None,
    bundle_export_path: Path | None = None,
    bundle_media_export_path: Path | None = None,
    holistic_processed_srcdir: Path | None = None,
    pose2d_processed_srcdir: Path | None = None,
) -> Path:
    """Run selected stages against staged or persistent local video inputs.

    ``video_srcdir`` is a persistent local video cache and is never copied or
    written by this runner. A reused run copies only generated ``output/`` when
    a local video source is supplied. Starting after the first stage requires
    ``reuse_from``; its upstream generated outputs are validated before use.
    """

    run_dir = run_dir.resolve()
    selected_stages = _stage_range(start_at, stop_after)
    start_index = PIPELINE_STAGES.index(selected_stages[0])
    if start_index and reuse_from is None:
        raise ValueError("start_at after update-database requires --reuse-from")
    if remote_path is not None and video_srcdir is not None:
        raise ValueError("remote_path and video_srcdir are mutually exclusive")
    local_video_srcdir = video_srcdir.resolve() if video_srcdir is not None else None
    if local_video_srcdir is not None and not local_video_srcdir.is_dir():
        raise ValueError(f"video_srcdir must be an existing directory: {local_video_srcdir}")
    source_dir = local_video_srcdir or run_dir / "source"
    output_dir = run_dir / "output"
    run_dir.mkdir(parents=True, exist_ok=True)
    reuse_path = reuse_from.resolve() if reuse_from is not None else None
    if reuse_path is not None:
        _copy_cached_run(reuse_path, run_dir, copy_source=local_video_srcdir is None)
        source_provenance: dict[str, t.Any] = (
            {
                "kind": "local-video-cache",
                "video_srcdir": str(local_video_srcdir),
                "reuse_from": str(reuse_path),
            }
            if local_video_srcdir is not None
            else {"kind": "copied-cache", "reuse_from": str(reuse_path)}
        )
    elif local_video_srcdir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        source_provenance = {
            "kind": "local-video-cache",
            "video_srcdir": str(local_video_srcdir),
        }
    else:
        if remote_path is None:
            raise ValueError("remote_path is required unless --reuse-from is supplied")
        source_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)
        print(f"Staging dataset:{remote_path} into {source_dir}")
        pull(remote_path, source_dir)
        source_provenance = {"kind": "rclone", "remote_path": f"dataset:{remote_path}"}

    layout = PipelineOutputLayout(
        database_csv_path=(database_csv_path or output_dir / "db.csv").resolve(),
        video_srcdir=source_dir,
        holistic_data_srcdir=(holistic_data_srcdir or output_dir / "holistic_data").resolve(),
        pose2d_data_srcdir=(pose2d_data_srcdir or output_dir / "pose2d_data").resolve(),
        temp_dir=(temp_dir or output_dir / "temp").resolve(),
        bundle_export_path=(bundle_export_path or output_dir / "bundle" / "nonmedia").resolve(),
        bundle_media_export_path=(bundle_media_export_path or output_dir / "bundle" / "media").resolve(),
        holistic_processed_srcdir=(holistic_processed_srcdir or output_dir / "holistic_data_processed").resolve(),
        pose2d_processed_srcdir=(pose2d_processed_srcdir or output_dir / "pose2d_processed").resolve(),
    )
    validator = PipelineOutputValidator(layout)
    completed_stages: list[str] = []
    cached_validated_stages: list[str] = []
    manifest_path = run_dir / "run-manifest.json"
    manifest: dict[str, t.Any] = {
        "status": "running",
        "started_at_utc": datetime.now(timezone.utc).isoformat(),
        "completed_at_utc": None,
        "run_directory": ".",
        "source_directory": (
            "source" if local_video_srcdir is None else str(local_video_srcdir)
        ),
        "output_directory": "output",
        "remote_path": f"dataset:{remote_path}" if remote_path is not None else None,
        "source_provenance": source_provenance,
        "stage_range": {"start_at": selected_stages[0], "stop_after": selected_stages[-1]},
        "completed_stages": completed_stages,
        "cached_upstream_validated_stages": cached_validated_stages,
        "parameters": {
            "remote_path": remote_path,
            "include_audio_in_bundle": include_audio_in_bundle,
            "include_thumbnail_in_bundle": include_thumbnail_in_bundle,
            "rewrite_existing_holistic_data": rewrite_existing_holistic_data,
            "rewrite_existing_preprocessed_pose_data": rewrite_existing_preprocessed_pose_data,
            "skip_existing_cumulative_complexity": skip_existing_cumulative_complexity,
            "skip_existing_audioanalysis": skip_existing_audioanalysis,
            "start_at": start_at,
            "stop_after": stop_after,
            "reuse_from": str(reuse_path) if reuse_path else None,
            "video_srcdir": str(local_video_srcdir) if local_video_srcdir else None,
            "database_csv_path": str(layout.database_csv_path),
            "holistic_data_srcdir": str(layout.holistic_data_srcdir),
            "pose2d_data_srcdir": str(layout.pose2d_data_srcdir),
            "holistic_processed_srcdir": str(layout.holistic_processed_srcdir),
            "pose2d_processed_srcdir": str(layout.pose2d_processed_srcdir),
            "temp_dir": str(layout.temp_dir),
            "bundle_export_path": str(layout.bundle_export_path),
            "bundle_media_export_path": str(layout.bundle_media_export_path),
        },
    }
    _write_manifest(manifest_path, manifest)

    def validate_cached_upstream() -> None:
        """Validate copied prerequisites before allowing a later stage to run."""

        for stage in PIPELINE_STAGES[:start_index]:
            validator(stage)
            cached_validated_stages.append(stage)
        _write_manifest(manifest_path, manifest)

    def validate_completed_stage(stage: str) -> None:
        """Validate a stage and persist its successful completion immediately."""

        validator(stage)
        completed_stages.append(stage)
        _write_manifest(manifest_path, manifest)

    try:
        validate_cached_upstream()
        run_dancetree_pipeline(
            database_csv_path=layout.database_csv_path,
            video_srcdir=layout.video_srcdir,
            holistic_data_srcdir=layout.holistic_data_srcdir,
            pose2d_data_srcdir=layout.pose2d_data_srcdir,
            holistic_processed_srcdir=layout.holistic_processed_srcdir,
            pose2d_processed_srcdir=layout.pose2d_processed_srcdir,
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
            stage_validator=validate_completed_stage,
            start_at=selected_stages[0],
            stop_after=selected_stages[-1],
        )
    except Exception as error:
        manifest["status"] = "failed"
        manifest["failure"] = {"type": type(error).__name__, "message": str(error)}
        manifest["completed_at_utc"] = datetime.now(timezone.utc).isoformat()
        _write_manifest(manifest_path, manifest)
        raise

    manifest["status"] = "completed"
    manifest["completed_at_utc"] = datetime.now(timezone.utc).isoformat()
    manifest["validated_stages"] = validator.validated_stages
    _write_manifest(manifest_path, manifest)
    print(f"Validated {len(validator.validated_stages)} pipeline stages")
    print(f"Run manifest: {manifest_path}")
    return run_dir


def main(argv: t.Sequence[str] | None = None) -> None:
    """Parse the staged-run CLI and execute it."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--remote-path",
        required=False,
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
    parser.add_argument("--start-at", choices=PIPELINE_STAGES)
    parser.add_argument("--stop-after", choices=PIPELINE_STAGES)
    parser.add_argument(
        "--reuse-from", type=Path,
        help="completed staged run to copy as an immutable upstream cache",
    )
    parser.add_argument(
        "--video-srcdir",
        type=Path,
        help="persistent local video cache; this runner reads it without copying or writing it",
    )
    parser.add_argument("--database-csv-path", type=Path)
    parser.add_argument("--holistic-data-srcdir", type=Path)
    parser.add_argument("--pose2d-data-srcdir", type=Path)
    parser.add_argument("--temp-dir", type=Path)
    parser.add_argument("--bundle-export-path", type=Path)
    parser.add_argument("--bundle-media-export-path", type=Path)
    parser.add_argument("--holistic-processed-srcdir", type=Path)
    parser.add_argument("--pose2d-processed-srcdir", type=Path)
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
        start_at=args.start_at,
        stop_after=args.stop_after,
        reuse_from=args.reuse_from,
        video_srcdir=args.video_srcdir,
        database_csv_path=args.database_csv_path,
        holistic_data_srcdir=args.holistic_data_srcdir,
        pose2d_data_srcdir=args.pose2d_data_srcdir,
        temp_dir=args.temp_dir,
        bundle_export_path=args.bundle_export_path,
        bundle_media_export_path=args.bundle_media_export_path,
        holistic_processed_srcdir=args.holistic_processed_srcdir,
        pose2d_processed_srcdir=args.pose2d_processed_srcdir,
    )


if __name__ == "__main__":
    main()
