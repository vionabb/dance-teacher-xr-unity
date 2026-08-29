"""Generate Stage 1 quality-triage tasks from an automatic-signals sweep.

For each of the three automatic signals (crop, roughness, false-tracking),
selects the clips that rank highest on that signal -- the most extreme,
most-informative test cases for judging whether the signal is catching
something real -- plus a random sample of unflagged clips as controls.
Every review item is rendered with the pose overlay burned in (Viona: pose
estimation can look fine on a bad-looking video or bad on a good-looking one,
so both must always be visible together). Static-factor candidates (crop)
are shown as a single frame; temporal-factor candidates (roughness,
false-tracking) and controls are shown as a short clip window, centered on
the specific span the signal already localized
(``compute_automatic_quality_signals.py``'s ``*_longest_run_start`` /
``windowed_roughness_worst_window_start`` columns).

See lab-log/2026-08-27-preprocessing-quality-gate-pivot-handoff.md for the
full design and "Decisions already made".
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import random
import typing as t

import cv2
import numpy as np
import pandas as pd

from dance_teacher_pose import PoseDataType, preprocess_pose_dataframe
from motion_extraction.annotation_tool.generate_temporal_comparison_tasks import (
    _draw_pose,
    _encode_frames,
    _require_encoder,
)
from motion_extraction.scripts.run_preprocessing_experiment import _pose_pixels, _write_review_frame

CROP = "crop"
ROUGHNESS = "roughness"
FALSE_TRACKING = "false_tracking"
CONTROL = "control"
CLIP_WINDOW_SECONDS = 3.0
DEFAULT_FPS = 30.0

SIGNAL_RANKING_COLUMN = {
    CROP: "crop_violation_fraction",
    ROUGHNESS: "windowed_roughness_p95_max",
    FALSE_TRACKING: "false_tracking_candidate_fraction",
}
STATIC_CATEGORIES = {CROP}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass(frozen=True)
class TriageCandidate:
    corpus: str
    relative_stem: str
    video_path: Path
    pose_path: Path
    category: str
    center_frame: int
    frame_count: int
    fps: float
    signal_value: float | None


def _center_frame_for_run(start: int, length: int, fallback_center: int) -> int:
    if start < 0 or length <= 0:
        return fallback_center
    return start + length // 2


def _select_top(df: pd.DataFrame, column: str, count: int) -> pd.DataFrame:
    ranked = df[df[column].notna()].sort_values(column, ascending=False)
    return ranked.head(count)


def select_candidates(
    signals_df: pd.DataFrame,
    *,
    per_signal_count: int,
    control_count: int,
    seed: int,
) -> list[TriageCandidate]:
    """Pick the most-extreme clips per signal, plus random unflagged controls."""

    usable = signals_df[
        signals_df["pose_available"].fillna(False) & (signals_df["error"].fillna("") == "")
    ].copy()

    # A clip ranking highly on more than one signal must only be shown once,
    # under whichever category claims it first -- otherwise the same clip
    # would appear multiple times under different framings. Priority order
    # (crop, then roughness, then false-tracking) is arbitrary but fixed.
    crop_rows = _select_top(usable, "crop_violation_fraction", per_signal_count)
    remaining = usable[~usable["relative_stem"].isin(crop_rows["relative_stem"])]
    roughness_rows = _select_top(remaining, "windowed_roughness_p95_max", per_signal_count)
    remaining = remaining[~remaining["relative_stem"].isin(roughness_rows["relative_stem"])]
    false_tracking_rows = _select_top(remaining, "false_tracking_candidate_fraction", per_signal_count)

    flagged_stems = (
        set(crop_rows["relative_stem"])
        | set(roughness_rows["relative_stem"])
        | set(false_tracking_rows["relative_stem"])
    )
    control_pool = usable[~usable["relative_stem"].isin(flagged_stems)]
    control_rows = control_pool.sample(
        n=min(control_count, len(control_pool)), random_state=seed
    )

    candidates: list[TriageCandidate] = []
    for _, row in crop_rows.iterrows():
        center = _center_frame_for_run(
            int(row["crop_longest_run_start"]),
            int(row["crop_longest_run_frames"]),
            int(row["frame_count"]) // 2,
        )
        candidates.append(_candidate(row, CROP, center))
    for _, row in roughness_rows.iterrows():
        window_frames = max(1, round((row.get("video_fps") or DEFAULT_FPS) * CLIP_WINDOW_SECONDS))
        start = int(row["windowed_roughness_worst_window_start"])
        center = _center_frame_for_run(start, window_frames, int(row["frame_count"]) // 2)
        candidates.append(_candidate(row, ROUGHNESS, center))
    for _, row in false_tracking_rows.iterrows():
        center = _center_frame_for_run(
            int(row["false_tracking_longest_run_start"]),
            int(row["false_tracking_longest_run_frames"]),
            int(row["frame_count"]) // 2,
        )
        candidates.append(_candidate(row, FALSE_TRACKING, center))
    for _, row in control_rows.iterrows():
        candidates.append(_candidate(row, CONTROL, int(row["frame_count"]) // 2))

    rng = random.Random(seed)
    rng.shuffle(candidates)
    return candidates


def _candidate(row: pd.Series, category: str, center_frame: int) -> TriageCandidate:
    signal_column = SIGNAL_RANKING_COLUMN.get(category)
    return TriageCandidate(
        corpus=str(row["corpus"]),
        relative_stem=str(row["relative_stem"]),
        video_path=Path(row["video_path"]),
        pose_path=Path(row["pose_path"]),
        category=category,
        center_frame=int(center_frame),
        frame_count=int(row["frame_count"]),
        fps=float(row.get("video_fps") or DEFAULT_FPS),
        signal_value=float(row[signal_column]) if signal_column else None,
    )


def _clip_window(candidate: TriageCandidate) -> tuple[int, int]:
    window_frames = max(1, round(candidate.fps * CLIP_WINDOW_SECONDS))
    half = window_frames // 2
    start = max(0, candidate.center_frame - half)
    end = min(candidate.frame_count, start + window_frames)
    start = max(0, end - window_frames)
    return start, end


def _render_frame_task(candidate: TriageCandidate, task_dir: Path) -> str:
    raw = pd.read_csv(candidate.pose_path, index_col="frame")
    clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=None)
    position = min(max(candidate.center_frame, 0), len(clean) - 1)

    capture = cv2.VideoCapture(str(candidate.video_path))
    capture.set(cv2.CAP_PROP_POS_FRAMES, position)
    ok, frame = capture.read()
    capture.release()
    if not ok:
        raise RuntimeError(f"could not read frame {position} from {candidate.video_path}")

    rendered = _draw_pose(frame, _pose_pixels(clean, position))
    artifact_path = task_dir / "frame.png"
    _write_review_frame(artifact_path, cv2.cvtColor(rendered, cv2.COLOR_BGR2RGB))
    return artifact_path.as_posix()


def _render_clip_task(candidate: TriageCandidate, task_dir: Path, ffmpeg: str) -> str:
    raw = pd.read_csv(candidate.pose_path, index_col="frame")
    clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=None)
    start, end = _clip_window(candidate)

    capture = cv2.VideoCapture(str(candidate.video_path))
    capture.set(cv2.CAP_PROP_POS_FRAMES, start)
    frames: list[np.ndarray] = []
    for position in range(start, end):
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(_draw_pose(frame, _pose_pixels(clean, position)))
    capture.release()
    if not frames:
        raise RuntimeError(f"could not read window [{start}, {end}) from {candidate.video_path}")

    height, width = frames[0].shape[:2]
    artifact_path = task_dir / "clip.mp4"
    _encode_frames(ffmpeg, artifact_path, iter(frames), width, height, candidate.fps)
    return artifact_path.as_posix()


def build_manifest(
    candidates: list[TriageCandidate],
    output_root: Path,
    *,
    seed: int,
    signals_csv_path: Path,
) -> dict[str, t.Any]:
    ffmpeg = _require_encoder()
    tasks: list[dict[str, t.Any]] = []
    for index, candidate in enumerate(candidates):
        task_id = f"quality-triage-{index:03d}"
        task_dir = output_root / task_id
        review_unit = "frame" if candidate.category in STATIC_CATEGORIES else "clip"
        artifact = (
            _render_frame_task(candidate, task_dir)
            if review_unit == "frame"
            else _render_clip_task(candidate, task_dir, ffmpeg)
        )
        tasks.append(
            {
                "task_id": task_id,
                "case_id": task_id,
                "task_type": "quality_triage",
                "priority": index,
                "category": candidate.category,
                "review_unit": review_unit,
                "corpus": candidate.corpus,
                "relative_stem": candidate.relative_stem,
                "source_artifact": Path(artifact).relative_to(output_root).as_posix(),
                "signal_value": candidate.signal_value,
            }
        )
    return {
        "schema_version": "1.0",
        "experiment_id": f"quality-triage-{seed}",
        "task_type": "quality_triage",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "seed": seed,
        "task_count": len(tasks),
        "response_choices": ["fine", "problematic", "cannot_judge"],
        "design": {
            "clip_window_seconds": CLIP_WINDOW_SECONDS,
            "selection": (
                "Top-ranked clips per automatic signal (crop, windowed roughness, "
                "false-tracking candidate fraction) plus a random sample of clips "
                "unflagged by any of the three, as controls."
            ),
        },
        "input_provenance": {"signals_csv_sha256": _sha256(signals_csv_path)},
        "tasks": tasks,
    }


def main(argv: t.Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--signals-csv", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True, help="Must not already exist.")
    parser.add_argument("--per-signal-count", type=int, default=15)
    parser.add_argument("--control-count", type=int, default=15)
    parser.add_argument("--seed", type=int, default=20260828)
    args = parser.parse_args(argv)

    if args.output_root.exists():
        raise FileExistsError(f"Output root already exists: {args.output_root}")

    signals_df = pd.read_csv(args.signals_csv)
    candidates = select_candidates(
        signals_df,
        per_signal_count=args.per_signal_count,
        control_count=args.control_count,
        seed=args.seed,
    )
    args.output_root.mkdir(parents=True)
    manifest = build_manifest(
        candidates, args.output_root, seed=args.seed, signals_csv_path=args.signals_csv
    )
    (args.output_root / "annotation_tasks.json").write_text(
        json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(candidates)} tasks to {args.output_root / 'annotation_tasks.json'}")


if __name__ == "__main__":
    main()
