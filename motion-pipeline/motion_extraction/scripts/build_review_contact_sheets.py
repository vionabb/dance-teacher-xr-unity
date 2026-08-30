"""Build one multi-frame contact sheet per clip-based quality-triage task.

A multimodal reviewer (human or AI) can judge a still frame directly, but a
video clip needs to be reduced to a handful of representative frames first.
This reads an existing quality-triage manifest (from
``generate_quality_triage_tasks.py``), and for every task whose
``review_unit`` is ``"clip"``, extracts evenly-spaced frames from its
already-overlay-burned ``clip.mp4`` and tiles them into one labeled
``contact_sheet.jpg`` per task -- so reviewing 60 tasks costs 60 image looks,
not 60 video watches. Frame-review tasks (``review_unit == "frame"``) are
left untouched; they already have exactly the single image a reviewer needs.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import typing as t

import cv2
import numpy as np

DEFAULT_FRAMES_PER_CLIP = 4


def _extract_evenly_spaced_frames(video_path: Path, count: int) -> list[np.ndarray]:
    capture = cv2.VideoCapture(str(video_path))
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    positions = np.linspace(0, max(frame_count - 1, 0), num=min(count, max(frame_count, 1)), dtype=int)
    frames: list[np.ndarray] = []
    for position in positions:
        capture.set(cv2.CAP_PROP_POS_FRAMES, int(position))
        ok, frame = capture.read()
        if ok:
            frames.append(frame)
    capture.release()
    return frames


def _tile_frames(frames: list[np.ndarray], label: str) -> np.ndarray:
    if not frames:
        raise RuntimeError("no frames to tile")
    height, width = frames[0].shape[:2]
    strip_height = 22
    labeled = []
    for index, frame in enumerate(frames):
        frame = cv2.resize(frame, (width, height))
        strip = np.zeros((strip_height, width, 3), dtype=np.uint8)
        cv2.putText(
            strip, f"frame {index + 1}/{len(frames)}", (6, 16),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA,
        )
        labeled.append(np.vstack([strip, frame]))
    columns = 2 if len(labeled) > 1 else 1
    rows = [labeled[i : i + columns] for i in range(0, len(labeled), columns)]
    row_images = [np.hstack(row) if len(row) == columns else np.hstack(row + [np.zeros_like(row[0])]) for row in rows]
    grid = np.vstack(row_images)
    title_height = 24
    title = np.zeros((title_height, grid.shape[1], 3), dtype=np.uint8)
    cv2.putText(title, label, (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1, cv2.LINE_AA)
    return np.vstack([title, grid])


def build_contact_sheets(
    manifest_path: Path, *, frames_per_clip: int, overwrite: bool
) -> list[dict[str, t.Any]]:
    manifest = json.loads(manifest_path.read_text())
    output_root = manifest_path.parent
    results: list[dict[str, t.Any]] = []
    for task in manifest["tasks"]:
        if task["review_unit"] != "clip":
            continue
        task_dir = output_root / task["task_id"]
        clip_path = task_dir / "clip.mp4"
        sheet_path = task_dir / "contact_sheet.jpg"
        if sheet_path.exists() and not overwrite:
            results.append({"task_id": task["task_id"], "status": "skipped_existing"})
            continue
        frames = _extract_evenly_spaced_frames(clip_path, frames_per_clip)
        label = f"{task['task_id']} ({task['category']})"
        sheet = _tile_frames(frames, label)
        cv2.imwrite(str(sheet_path), sheet)
        results.append({"task_id": task["task_id"], "status": "built", "frame_count": len(frames)})
    return results


def main(argv: t.Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True, help="Path to annotation_tasks.json")
    parser.add_argument("--frames-per-clip", type=int, default=DEFAULT_FRAMES_PER_CLIP)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)

    results = build_contact_sheets(
        args.manifest, frames_per_clip=args.frames_per_clip, overwrite=args.overwrite
    )
    built = sum(1 for row in results if row["status"] == "built")
    print(f"Built {built} contact sheets ({len(results) - built} already existed).")


if __name__ == "__main__":
    main()
