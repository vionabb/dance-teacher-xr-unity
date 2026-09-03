"""Attach per-frame landmark pixel positions to existing error_marking tasks.

error_marking tasks reuse an already-rendered quality_triage clip.mp4 (pose
overlay burned into the pixels) but never recorded per-frame landmark pixel
coordinates or which window of the original source video the clip came from.
Both are fully recoverable without re-running pose estimation: the window is
a deterministic function of the automatic quality signal that selected the
clip (recomputed here with the exact same `_clip_window`/
`_center_frame_for_run` logic that rendered it originally), and the landmark
coordinates come from the same per-frame clean pose data already computed
for the whole corpus (`_pose_pixels`, reused as-is, the same helper the
overlay-burning render step used).

Idempotent: a task that already has a `landmarks_artifact` is left alone, so
this is safe to re-run after appending more error_marking tasks to the same
manifest.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import typing as t

import pandas as pd

from dance_teacher_pose import PoseDataType, preprocess_pose_dataframe
from motion_extraction.annotation_tool.generate_quality_triage_tasks import (
    CLIP_WINDOW_SECONDS,
    CONTROL,
    CROP,
    FALSE_TRACKING,
    ROUGHNESS,
    SIGNAL_RANKING_COLUMN,
    TriageCandidate,
    _center_frame_for_run,
    _clip_window,
)
from motion_extraction.scripts.run_preprocessing_experiment import POSE_EDGES, _pose_pixels

LANDMARKS = sorted({item for edge in POSE_EDGES for item in edge})
POSE_EDGE_LIST = [list(edge) for edge in POSE_EDGES]


def _candidate_for_row(row: "pd.Series[t.Any]", category: str) -> TriageCandidate:
    frame_count = int(row["frame_count"])
    fps = float(row.get("video_fps") or 30.0)
    if category == CROP:
        center = _center_frame_for_run(
            int(row["crop_longest_run_start"]), int(row["crop_longest_run_frames"]), frame_count // 2
        )
    elif category == ROUGHNESS:
        window_frames = max(1, round(fps * CLIP_WINDOW_SECONDS))
        center = _center_frame_for_run(
            int(row["windowed_roughness_worst_window_start"]), window_frames, frame_count // 2
        )
    elif category == FALSE_TRACKING:
        center = _center_frame_for_run(
            int(row["false_tracking_longest_run_start"]),
            int(row["false_tracking_longest_run_frames"]),
            frame_count // 2,
        )
    elif category == CONTROL:
        center = frame_count // 2
    else:
        raise ValueError(f"unknown category: {category}")
    signal_column = SIGNAL_RANKING_COLUMN.get(category)
    signal_value = (
        float(row[signal_column]) if signal_column and pd.notna(row[signal_column]) else None
    )
    return TriageCandidate(
        corpus=str(row["corpus"]),
        relative_stem=str(row["relative_stem"]),
        video_path=Path(row["video_path"]),
        pose_path=Path(row["pose_path"]),
        category=category,
        center_frame=int(center),
        frame_count=frame_count,
        fps=fps,
        signal_value=signal_value,
    )


def attach_landmarks(
    manifest_path: Path, signals_csv_path: Path, output_root: Path
) -> tuple[dict[str, t.Any], list[str]]:
    manifest = json.loads(manifest_path.read_text())
    signals = pd.read_csv(signals_csv_path)
    pose_cache: dict[Path, pd.DataFrame] = {}
    written = 0
    already_attached = 0
    skipped: list[str] = []

    for task in manifest["tasks"]:
        if task.get("task_type") != "error_marking":
            continue
        if task.get("landmarks_artifact"):
            already_attached += 1
            continue
        match = signals[
            (signals["corpus"] == task["corpus"]) & (signals["relative_stem"] == task["relative_stem"])
        ]
        if match.empty:
            skipped.append(f"{task['task_id']}: no signals row for {task['corpus']}/{task['relative_stem']}")
            continue
        row = match.iloc[0]
        candidate = _candidate_for_row(row, task["category"])
        start, end = _clip_window(candidate)
        recomputed_frame_count = end - start
        if recomputed_frame_count != int(task["frame_count"]):
            skipped.append(
                f"{task['task_id']}: recomputed window has {recomputed_frame_count} frames, "
                f"task expects {task['frame_count']} -- refusing to guess"
            )
            continue

        if candidate.pose_path not in pose_cache:
            raw = pd.read_csv(candidate.pose_path, index_col="frame")
            pose_cache[candidate.pose_path] = preprocess_pose_dataframe(
                raw, PoseDataType.pose2d, config=None
            )
        clean = pose_cache[candidate.pose_path]

        frames = [_pose_pixels(clean, start + i) for i in range(recomputed_frame_count)]
        artifact_relative = f"{task['task_id']}/landmarks.json"
        artifact_path = output_root / artifact_relative
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text(
            json.dumps(
                {
                    "landmarks": LANDMARKS,
                    "pose_edges": POSE_EDGE_LIST,
                    "source_dimensions": {
                        "width": int(row["video_width"]),
                        "height": int(row["video_height"]),
                    },
                    "source_window": {"start_frame": start, "end_frame": end},
                    "frames": [
                        {name: [point[0], point[1]] for name, point in frame.items()} for frame in frames
                    ],
                },
                allow_nan=False,
            )
            + "\n",
            encoding="utf-8",
        )
        task["landmarks_artifact"] = artifact_relative
        task["source_dimensions"] = {"width": int(row["video_width"]), "height": int(row["video_height"])}
        written += 1

    manifest_path.write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return {"written": written, "already_attached": already_attached}, skipped


def main(argv: t.Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True, help="Updated in place.")
    parser.add_argument("--signals-csv", type=Path, required=True)
    parser.add_argument(
        "--output-root", type=Path, required=True, help="Experiment root landmarks.json artifacts are written under."
    )
    args = parser.parse_args(argv)

    summary, skipped = attach_landmarks(args.manifest, args.signals_csv, args.output_root)
    print(f"Wrote landmarks for {summary['written']} task(s); {summary['already_attached']} already had them.")
    if skipped:
        print(f"Skipped {len(skipped)}:")
        for line in skipped:
            print(f"  {line}")


if __name__ == "__main__":
    main()
