"""Append a small pilot batch of video_quality_rating tasks to a manifest.

Lighting and clothing are properties of the source recording, not of any one
frame or clip -- they don't change mid-video. So this rates one unique
*video* (one source reference video, or one participant recording session,
which may be segmented into several clips) rather than one clip, sampling a
single representative frame (no pose overlay -- this rates the source video,
not the tracking output) at the midpoint of the video's duration.

This is a pilot: a small, fixed-seed random sample per corpus, meant to be
rated independently by both a human annotator and a multimodal model so the
two sets of ratings can be compared before committing to full-corpus coverage.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import random
import typing as t

import cv2


def _representative_frame(video_path: Path, task_dir: Path) -> tuple[str, int, int]:
    capture = cv2.VideoCapture(str(video_path))
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    capture.set(cv2.CAP_PROP_POS_FRAMES, max(0, frame_count // 2))
    ok, frame = capture.read()
    capture.release()
    if not ok:
        raise RuntimeError(f"could not read a representative frame from {video_path}")
    task_dir.mkdir(parents=True, exist_ok=True)
    frame_path = task_dir / "frame.png"
    cv2.imwrite(str(frame_path), frame)
    height, width = frame.shape[:2]
    return frame_path.as_posix(), width, height


def _unique_participant_sessions(video_root: Path, *, seed: int, count: int) -> list[tuple[str, Path]]:
    """Group segmented clip files by session (everything before ``____clipN``)."""

    by_session: dict[str, Path] = {}
    for video_path in sorted(video_root.rglob("*.mp4")):
        stem = video_path.stem
        session = stem.split("____clip")[0] if "____clip" in stem else stem
        by_session.setdefault(session, video_path)  # first clip found stands in for the session
    sessions = sorted(by_session.items())
    random.Random(seed).shuffle(sessions)
    return sessions[:count]


def append_video_quality_rating_tasks(
    manifest: dict[str, t.Any],
    output_root: Path,
    *,
    reference_video_root: Path,
    study1_video_root: Path,
    study2_video_root: Path,
    reference_count: int,
    study1_count: int,
    study2_count: int,
    seed: int,
) -> dict[str, t.Any]:
    result = copy.deepcopy(manifest)
    if any(task.get("task_type") == "video_quality_rating" for task in result["tasks"]):
        raise ValueError("manifest already contains video_quality_rating tasks")

    candidates: list[dict[str, t.Any]] = []

    reference_videos = sorted(reference_video_root.rglob("*.mp4"))
    random.Random(seed).shuffle(reference_videos)
    for video_path in reference_videos[:reference_count]:
        stem = video_path.relative_to(reference_video_root).with_suffix("").as_posix()
        candidates.append({"corpus": "reference", "relative_stem": stem, "video_path": video_path})

    for corpus, root, count in (
        ("chi25_study1", study1_video_root, study1_count),
        ("chi25_study2", study2_video_root, study2_count),
    ):
        for session, video_path in _unique_participant_sessions(root, seed=seed, count=count):
            stem = video_path.relative_to(root).with_suffix("").as_posix()
            candidates.append({"corpus": corpus, "relative_stem": stem, "video_path": video_path})

    next_priority = max(int(task["priority"]) for task in result["tasks"]) + 1
    for index, candidate in enumerate(candidates):
        task_id = f"video-quality-{index:03d}"
        task_dir = output_root / task_id
        artifact, width, height = _representative_frame(candidate["video_path"], task_dir)
        result["tasks"].append(
            {
                "task_id": task_id,
                "case_id": task_id,
                "task_type": "video_quality_rating",
                "priority": next_priority + index,
                "corpus": candidate["corpus"],
                "relative_stem": candidate["relative_stem"],
                "source_artifact": Path(artifact).relative_to(output_root).as_posix(),
                "source_dimensions": {"width": width, "height": height},
            }
        )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    parser.add_argument("--reference-video-root", type=Path, required=True)
    parser.add_argument("--study1-video-root", type=Path, required=True)
    parser.add_argument("--study2-video-root", type=Path, required=True)
    parser.add_argument("--reference-count", type=int, default=6)
    parser.add_argument("--study1-count", type=int, default=7)
    parser.add_argument("--study2-count", type=int, default=7)
    parser.add_argument("--seed", type=int, default=20260830)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    result = append_video_quality_rating_tasks(
        manifest,
        args.manifest.parent,
        reference_video_root=args.reference_video_root,
        study1_video_root=args.study1_video_root,
        study2_video_root=args.study2_video_root,
        reference_count=args.reference_count,
        study1_count=args.study1_count,
        study2_count=args.study2_count,
        seed=args.seed,
    )
    args.output_manifest.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    added = sum(1 for task in result["tasks"] if task.get("task_type") == "video_quality_rating")
    print(f"Wrote {added} video_quality_rating tasks to {args.output_manifest}")


if __name__ == "__main__":
    main()
