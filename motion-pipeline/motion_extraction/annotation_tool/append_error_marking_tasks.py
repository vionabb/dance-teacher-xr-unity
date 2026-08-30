"""Append error_marking pilot tasks to an existing quality-triage manifest.

Targets the clip-based quality_triage tasks a human annotator already marked
"problematic" -- these are exactly the clips known to contain a real error,
so localizing *where* and *what kind* is immediately useful, and it reuses
the existing overlay-burned clip.mp4 artifacts (no new rendering needed).

Frame indices recorded by the error_marking UI are local to the displayed
clip.mp4 (frame 0 = the first frame of that rendered window), not positions
in the original source video.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import typing as t

import cv2


def _clip_metadata(video_path: Path) -> tuple[float, int]:
    capture = cv2.VideoCapture(str(video_path))
    fps = float(capture.get(cv2.CAP_PROP_FPS)) or 30.0
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    capture.release()
    return fps, frame_count


def append_error_marking_tasks(
    manifest: dict[str, t.Any], output_root: Path, target_task_ids: list[str]
) -> dict[str, t.Any]:
    result = copy.deepcopy(manifest)
    tasks_by_id = {str(task["task_id"]): task for task in manifest["tasks"]}
    missing = [task_id for task_id in target_task_ids if task_id not in tasks_by_id]
    if missing:
        raise ValueError(f"unknown source task_ids: {missing}")

    existing_error_marking = [
        task for task in result["tasks"] if task.get("task_type") == "error_marking"
    ]
    if existing_error_marking:
        raise ValueError("manifest already contains error_marking tasks")

    next_priority = max(int(task["priority"]) for task in result["tasks"]) + 1
    for index, source_task_id in enumerate(target_task_ids):
        source = tasks_by_id[source_task_id]
        if source.get("review_unit") != "clip":
            raise ValueError(f"{source_task_id} is not a clip-based task")
        video_path = output_root / source["source_artifact"]
        if not video_path.exists():
            raise FileNotFoundError(video_path)
        fps, frame_count = _clip_metadata(video_path)
        task_id = f"error-marking-{index:03d}"
        result["tasks"].append(
            {
                "task_id": task_id,
                "case_id": task_id,
                "task_type": "error_marking",
                "priority": next_priority + index,
                "category": source.get("category"),
                "source_quality_triage_task_id": source_task_id,
                "corpus": source.get("corpus"),
                "relative_stem": source.get("relative_stem"),
                "source_artifact": source["source_artifact"],
                "fps": fps,
                "frame_count": frame_count,
            }
        )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    parser.add_argument(
        "--task-ids", nargs="+", required=True, help="quality_triage task_ids to build error_marking tasks from"
    )
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    result = append_error_marking_tasks(manifest, args.manifest.parent, args.task_ids)
    args.output_manifest.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    added = sum(1 for task in result["tasks"] if task.get("task_type") == "error_marking")
    print(f"Wrote {added} error_marking tasks to {args.output_manifest}")


if __name__ == "__main__":
    main()
