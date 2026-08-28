"""Extract canonical pose2d + pose3d CSVs for the whole corpus via GPU PoseLandmarker.

Replaces the need for compute_automatic_quality_signals.py's legacy-schema
adapter: instead of translating each participant study's pre-canonical raw
pose format in memory, this actually re-extracts every clip (reference and
both participant studies) through the Tasks API's standalone PoseLandmarker,
GPU-delegated on macOS. Pose-only (no hands/face) -- the combined Holistic
Landmarker Task has a long-standing upstream crash on any empty-detection
sub-packet (mediapipe#5181, open since 2024, no fix); the standalone Pose
Landmarker does not share that bug (validated directly on 2026-08-28 against
both a synthetic blank frame and real corpus clips) and is roughly an order
of magnitude faster per frame than the CPU-only legacy Holistic path.

Writes two canonical CSVs per clip:
- pose2d (image-space, pixel coordinates, matches the existing schema exactly)
- pose3d (world-space, meters, hip-midpoint-relative -- new modality, kept in
  its own directory since nothing consumes it yet; Viona wants it available
  for future 3D-motion investigation)

Resumable: skips a clip whose pose2d and pose3d outputs already exist unless
--overwrite is passed. One clip's failure is recorded, not fatal to the run.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import time
import typing as t

from dance_teacher_pose.extraction import extract_pose_landmarker_video
from motion_extraction.corpus_videos import CorpusVideo, list_corpus_videos
from motion_extraction.mp_utils import (
    POSE_LANDMARKER_HEAVY_MODEL_URL,
    ensure_task_model,
    holistic_landmarker_model_path,
)
from motion_extraction.study_pose_data import STUDY_POSE_LAYOUTS, StudyPoseLayout, default_data_root

REFERENCE_OUTPUT_SUBDIR = "reference_motions/pose-raw"
_STUDY_SEGMENTED_LAYOUT: dict[str, str] = {
    "chi25_study1": "study1-segmented",
    "chi25_study2": "study2-segmented",
}


@dataclass(frozen=True)
class ExtractionTarget:
    video: CorpusVideo
    pose2d_output_path: Path
    pose3d_output_path: Path


def _reference_targets(data_root: Path, videos: list[CorpusVideo]) -> list[ExtractionTarget]:
    pose_root = data_root / REFERENCE_OUTPUT_SUBDIR
    return [
        ExtractionTarget(
            video,
            pose_root / "pose2d" / f"{video.relative_stem}.pose2d.raw.csv",
            pose_root / "pose3d" / f"{video.relative_stem}.pose3d.raw.csv",
        )
        for video in videos
        if video.corpus == "reference"
    ]


def _participant_targets(data_root: Path, study: str, videos: list[CorpusVideo]) -> list[ExtractionTarget]:
    layout: StudyPoseLayout = STUDY_POSE_LAYOUTS[_STUDY_SEGMENTED_LAYOUT[study]]
    # StudyPoseLayout.raw_pose_root expects the participant_motions root
    # specifically (it appends the study_root_name itself), not the general
    # workspace data/ root that this script's other paths are relative to.
    pose_root = layout.raw_pose_root(data_root / "participant_motions")
    return [
        ExtractionTarget(
            video,
            pose_root / "pose2d" / f"{video.relative_stem}.pose2d.raw.csv",
            pose_root / "pose3d" / f"{video.relative_stem}.pose3d.raw.csv",
        )
        for video in videos
        if video.corpus == study
    ]


def build_extraction_targets(data_root: Path, corpora: t.Sequence[str]) -> list[ExtractionTarget]:
    videos = list_corpus_videos(data_root)
    targets: list[ExtractionTarget] = []
    if "reference" in corpora:
        targets += _reference_targets(data_root, videos)
    for study in ("chi25_study1", "chi25_study2"):
        if study in corpora:
            targets += _participant_targets(data_root, study, videos)
    return targets


def _cap_per_corpus(targets: list[ExtractionTarget], max_files: int) -> list[ExtractionTarget]:
    counts: dict[str, int] = {}
    capped: list[ExtractionTarget] = []
    for target in targets:
        seen = counts.get(target.video.corpus, 0)
        if seen >= max_files:
            continue
        capped.append(target)
        counts[target.video.corpus] = seen + 1
    return capped


def _build_landmarker(use_gpu: bool) -> t.Any:
    from mediapipe.tasks.python import BaseOptions, vision

    model_path = holistic_landmarker_model_path().parent / "pose_landmarker_heavy.task"
    ensure_task_model(model_path, POSE_LANDMARKER_HEAVY_MODEL_URL)
    delegate = BaseOptions.Delegate.GPU if use_gpu else BaseOptions.Delegate.CPU
    base_options = BaseOptions(model_asset_path=str(model_path), delegate=delegate)
    options = vision.PoseLandmarkerOptions(base_options=base_options, running_mode=vision.RunningMode.IMAGE)
    return vision.PoseLandmarker.create_from_options(options)


def run_extraction(
    targets: list[ExtractionTarget],
    *,
    landmarker: t.Any,
    overwrite: bool,
    progress_every: int = 25,
) -> list[dict[str, t.Any]]:
    results: list[dict[str, t.Any]] = []
    for index, target in enumerate(targets):
        already_done = target.pose2d_output_path.exists() and target.pose3d_output_path.exists()
        row: dict[str, t.Any] = {
            "corpus": target.video.corpus,
            "relative_stem": target.video.relative_stem,
            "pose2d_output_path": str(target.pose2d_output_path),
            "pose3d_output_path": str(target.pose3d_output_path),
            "status": "skipped_existing",
            "error": "",
            "elapsed_seconds": 0.0,
        }
        if already_done and not overwrite:
            results.append(row)
            continue
        start = time.time()
        try:
            extract_pose_landmarker_video(
                target.video.video_path,
                target.pose2d_output_path,
                target.pose3d_output_path,
                landmarker=landmarker,
            )
            row["status"] = "extracted"
        except Exception as error:  # noqa: BLE001 - one bad clip must not abort a corpus-wide run
            row["status"] = "failed"
            row["error"] = f"{type(error).__name__}: {error}"
        row["elapsed_seconds"] = round(time.time() - start, 3)
        results.append(row)
        if (index + 1) % progress_every == 0 or index + 1 == len(targets):
            print(f"[{index + 1}/{len(targets)}] {target.video.corpus}/{target.video.relative_stem}: {row['status']}")
    return results


def main(argv: t.Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=default_data_root().parent)
    parser.add_argument("--output-root", type=Path, required=True, help="Where run_provenance.json / results.csv are written; must not already exist.")
    parser.add_argument("--corpora", nargs="+", choices=["reference", *_STUDY_SEGMENTED_LAYOUT], default=["reference", *_STUDY_SEGMENTED_LAYOUT])
    parser.add_argument("--max-files", type=int, default=None, help="Cap clips per corpus, for quick iteration.")
    parser.add_argument("--overwrite", action="store_true", help="Re-extract clips that already have pose2d and pose3d output.")
    parser.add_argument("--cpu", action="store_true", help="Use the CPU delegate instead of GPU (for comparison/debugging only).")
    args = parser.parse_args(argv)

    if args.output_root.exists():
        raise FileExistsError(f"Output root already exists: {args.output_root}")

    targets = build_extraction_targets(args.data_root, args.corpora)
    if args.max_files is not None:
        targets = _cap_per_corpus(targets, args.max_files)

    landmarker = _build_landmarker(use_gpu=not args.cpu)

    started_at = datetime.now(timezone.utc)
    results = run_extraction(targets, landmarker=landmarker, overwrite=args.overwrite)
    finished_at = datetime.now(timezone.utc)

    args.output_root.mkdir(parents=True)
    import csv

    with (args.output_root / "results.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(results[0].keys()) if results else [])
        writer.writeheader()
        writer.writerows(results)

    status_counts: dict[str, int] = {}
    for row in results:
        status_counts[row["status"]] = status_counts.get(row["status"], 0) + 1
    provenance = {
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "data_root": str(args.data_root.resolve()),
        "corpora": args.corpora,
        "max_files_per_corpus": args.max_files,
        "overwrite": args.overwrite,
        "delegate": "CPU" if args.cpu else "GPU",
        "target_count": len(targets),
        "status_counts": status_counts,
    }
    (args.output_root / "run_provenance.json").write_text(json.dumps(provenance, indent=2))
    print(f"Done: {status_counts}")


if __name__ == "__main__":
    main()
