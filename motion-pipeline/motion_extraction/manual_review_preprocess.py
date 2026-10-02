"""Preprocess a frozen manual-review release without changing pipeline defaults.

Run from ``motion-pipeline``. Reviewed pose2d inputs remain immutable; a new
Git-ignored experiment directory receives clean poses, separate frame masks,
and hash-pinned provenance for each completed detailed review.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import typing as t
import uuid

import pandas as pd

from dance_teacher_pose import PoseDataType, preprocess_pose_dataframe
from dance_teacher_pose import preprocessing as shared_preprocessing


PIPELINE = Path(__file__).resolve().parents[1]
EXPERIMENTS = PIPELINE / "temp" / "experiments"
VALID_LABELS = {"good", "flawed", "unusable"}


def sha256(path: Path) -> str:
    """Hash a file in bounded memory."""

    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verified_file(root: Path, relative_path: str, expected_hash: str) -> Path:
    """Resolve a corpus artifact inside its root and verify its declared hash."""

    if not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
        raise ValueError(f"Invalid artifact SHA-256: {relative_path}")
    candidate = Path(relative_path)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError(f"Unsafe corpus artifact path: {relative_path}")
    path = (root / candidate).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f"Corpus artifact missing or outside root: {relative_path}")
    if sha256(path) != expected_hash:
        raise ValueError(f"Corpus artifact hash mismatch: {relative_path}")
    return path


def exact_source_frames(pose: pd.DataFrame, segment: dict[str, t.Any]) -> list[int]:
    """Require one reviewed row for every absolute source frame in the segment."""

    start = int(segment["source_frame_start"])
    end = int(segment["source_frame_end_exclusive"])
    expected = list(range(start, end))
    if end - start != int(segment["frame_count"]) or len(pose) != len(expected):
        raise ValueError(f"Reviewed pose frame count differs from release: {segment['task_id']}")
    if pose.index.hasnans or not pose.index.is_unique or list(pose.index) != expected:
        raise ValueError(f"Reviewed pose frame index differs from absolute source frames: {segment['task_id']}")
    return expected


def frame_masks(segment: dict[str, t.Any], frames: list[int]) -> tuple[pd.DataFrame, dict[str, int]]:
    """Keep sparse human labels apart from automatic missing-pose flags."""

    count = len(frames)
    raw_labels = segment.get("manual_frame_labels") or {}
    if not isinstance(raw_labels, dict):
        raise ValueError(f"Manual frame labels are not an object: {segment['task_id']}")
    labels: dict[int, str] = {}
    for key, label in raw_labels.items():
        if not str(key).isdigit() or not 0 <= int(key) < count or label not in VALID_LABELS:
            raise ValueError(f"Invalid manual frame label: {segment['task_id']} frame {key}")
        labels[int(key)] = label
    raw_missing = segment.get("automatic_missing_pose_frames") or []
    if not isinstance(raw_missing, list):
        raise ValueError(f"Automatic missing-pose flags are not a list: {segment['task_id']}")
    missing: set[int] = set()
    for value in raw_missing:
        if type(value) is not int or not 0 <= value < count:
            raise ValueError(f"Invalid automatic missing-pose frame: {segment['task_id']}")
        missing.add(value)
    mask = pd.DataFrame({
        "frame": frames,
        "manual_label": [labels.get(offset, "") for offset in range(count)],
        "human_unusable": [int(labels.get(offset) == "unusable") for offset in range(count)],
        "automatic_missing_pose": [int(offset in missing) for offset in range(count)],
    })
    return mask, {"manual_labeled": len(labels), "human_unusable": sum(value == "unusable" for value in labels.values()),
                  "automatic_missing_pose": len(missing), "unlabeled": count - len(labels)}


def preprocess_segment(root: Path, stage: Path, segment: dict[str, t.Any], code_hash: str) -> dict[str, t.Any]:
    """Verify one complete reviewed segment and write its clean pose and masks."""

    if segment.get("status") != "completed" or segment.get("review_scope") != "frame_and_landmark":
        raise ValueError(f"Segment is not a completed detailed review: {segment.get('task_id')}")
    if segment.get("pose_alignment_validation") != "validated_coordinates":
        raise ValueError(f"Reviewed segment lacks validated raw/UI alignment: {segment['task_id']}")
    reviewed_path = verified_file(root, segment["reviewed_pose_path"], segment["reviewed_pose_sha256"])
    verified_file(root, segment["raw_pose_path"], segment["raw_pose_sha256"])
    pose = pd.read_csv(reviewed_path, index_col="frame")
    frames = exact_source_frames(pose, segment)
    required_roots = {f"{body}_{axis}" for body in
                      ("LEFT_HIP", "RIGHT_HIP", "LEFT_SHOULDER", "RIGHT_SHOULDER")
                      for axis in ("x", "y", "distance")}
    if not required_roots.issubset(pose.columns):
        raise ValueError(f"Reviewed pose lacks 2D body-landmark columns: {segment['task_id']}")
    clean = preprocess_pose_dataframe(pose, PoseDataType.pose2d, config=None)
    if list(clean.index) != frames or len(clean) != len(frames):
        raise ValueError(f"Shared preprocessing changed source-frame index: {segment['task_id']}")
    masks, counts = frame_masks(segment, frames)
    task_id = str(segment["task_id"])
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", task_id):
        raise ValueError(f"Unsafe review task ID: {task_id}")
    clean_rel = Path("clean") / f"{task_id}.pose2d.clean.csv"
    mask_rel = Path("masks") / f"{task_id}.frame-masks.csv"
    provenance_rel = Path("provenance") / f"{task_id}.json"
    for relative_path in (clean_rel, mask_rel, provenance_rel):
        (stage / relative_path).parent.mkdir(parents=True, exist_ok=True)
    clean.to_csv(stage / clean_rel, index_label="frame")
    masks.to_csv(stage / mask_rel, index=False)
    record = {
        "task_id": task_id, "segment_id": segment["segment_id"],
        "recording_id": segment["recording_id"], "source_id": segment["source_id"],
        "source_manifest_sha256": segment["source_manifest_sha256"],
        "experiment_id": segment["experiment_id"], "revision_id": segment["revision_id"],
        "annotator": segment["annotator"], "review_scope": segment["review_scope"],
        "source_frame_start": frames[0], "source_frame_end_exclusive": frames[-1] + 1,
        "frame_count": len(frames), "raw_pose_path": segment["raw_pose_path"],
        "raw_pose_sha256": segment["raw_pose_sha256"],
        "reviewed_pose_path": segment["reviewed_pose_path"],
        "reviewed_pose_sha256": segment["reviewed_pose_sha256"],
        "clean_pose_path": clean_rel.as_posix(), "clean_pose_sha256": sha256(stage / clean_rel),
        "frame_masks_path": mask_rel.as_posix(), "frame_masks_sha256": sha256(stage / mask_rel),
        "frame_mask_counts": counts, "correction_count": segment["correction_count"],
        "preprocessing": {"pose_data_type": "pose2d", "config": None,
                          "shared_preprocessing_sha256": code_hash,
                          "output_coordinate_system": "hip_recentered_torso_normalized"},
        "metric_compatibility": "Existing raw-pixel metrics must consume reviewed_pose_path, not clean_pose_path.",
        "interpretation": "Only explicit moved x/y are human corrections; unmarked coordinates are not verified ground truth.",
    }
    (stage / provenance_rel).write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    return {**record, "provenance_path": provenance_rel.as_posix(),
            "provenance_sha256": sha256(stage / provenance_rel)}


def run(release_manifest: Path, output_dir: Path | None, expected_manifest_sha256: str | None) -> Path:
    """Build one immutable experiment from a frozen manual-review release."""

    release_manifest = release_manifest.resolve()
    if release_manifest.name != "manifest.json" or release_manifest.parent.parent.name != "releases":
        raise ValueError("Expected a frozen releases/<release-id>/manifest.json")
    root = release_manifest.parents[2]
    if not release_manifest.is_file():
        raise FileNotFoundError(release_manifest)
    manifest_hash = sha256(release_manifest)
    if expected_manifest_sha256 and expected_manifest_sha256 != manifest_hash:
        raise ValueError("Frozen release manifest SHA-256 mismatch")
    manifest = json.loads(release_manifest.read_text())
    if manifest.get("release_id") != release_manifest.parent.name:
        raise ValueError("Release ID differs from manifest directory")
    verified_file(root, f"releases/{manifest['release_id']}/{manifest['coverage_report']}", manifest["coverage_sha256"])
    verified_file(root, manifest["catalog_snapshot_path"], manifest["catalog_snapshot_sha256"])
    segments = manifest.get("reviewed_segments")
    if not isinstance(segments, list) or not segments:
        raise ValueError("Release contains no completed detailed reviewed segments")
    code_hash = sha256(Path(shared_preprocessing.__file__).resolve())
    EXPERIMENTS.mkdir(parents=True, exist_ok=True)
    if output_dir is None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        output_dir = EXPERIMENTS / f"manual-review-{manifest['release_id']}-{stamp}-{uuid.uuid4().hex[:8]}"
    elif not output_dir.is_absolute():
        output_dir = PIPELINE / output_dir
    output_dir = output_dir.absolute()
    if output_dir.parent.resolve() != EXPERIMENTS.resolve() or output_dir.exists():
        raise ValueError("Output must be a new direct child of temp/experiments")
    stage = Path(tempfile.mkdtemp(prefix=".manual-review-preprocess-", dir=EXPERIMENTS))
    try:
        records = [preprocess_segment(root, stage, segment, code_hash) for segment in segments]
        if len({item["task_id"] for item in records}) != len(records):
            raise ValueError("Release has duplicate detailed review task IDs")
        provenance = {
            "schema_version": "1.0", "release_id": manifest["release_id"],
            "release_manifest_sha256": manifest_hash,
            "release_manifest_path": str(release_manifest),
            "shared_preprocessing_sha256": code_hash,
            "preprocessing_profile": "shared_pose2d_historical_default_config_none",
            "coordinate_boundary": "Reviewed input is source-image pixels; clean output is hip-recentered and torso-normalized. Existing raw-pixel metrics require reviewed input.",
            "segment_count": len(records),
            "manual_unusable_frame_count": sum(item["frame_mask_counts"]["human_unusable"] for item in records),
            "automatic_missing_pose_frame_count": sum(item["frame_mask_counts"]["automatic_missing_pose"] for item in records),
            "segments": records,
        }
        (stage / "run_provenance.json").write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + "\n")
        os.replace(stage, output_dir)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    return output_dir


def main() -> None:
    """Parse CLI arguments for an isolated manual-review preprocessing run."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-manifest", required=True, type=Path)
    parser.add_argument("--output-dir", type=Path, help="Unique direct child of temp/experiments")
    parser.add_argument("--expected-manifest-sha256", help="Optional out-of-band release manifest hash")
    args = parser.parse_args()
    output = run(args.release_manifest, args.output_dir, args.expected_manifest_sha256)
    print(output)


if __name__ == "__main__":
    main()
