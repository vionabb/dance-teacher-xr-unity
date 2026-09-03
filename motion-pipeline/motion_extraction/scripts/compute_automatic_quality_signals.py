"""Sweep the full local pose/video corpus and compute automatic quality signals.

Enumerates every video under the reference and both participant-study video
roots, matches each to its canonical raw pose2d CSV, and writes one CSV row
per clip with coverage, roughness, frame-bounds crop, lighting, and
false-tracking signals. This is a read-only research script: it never writes
pose or video files, and it never modifies pipeline defaults.

Every clip in the corpus now has a canonical pose2d CSV (pixel-space x/y),
extracted via ``scripts/extract_pose_landmarker_corpus.py`` (GPU Tasks-API
Pose Landmarker) -- this script previously carried an in-memory adapter for
participant studies' older, pre-canonical pose format, removed once that
extraction ran across the whole corpus. See
``lab-log/2026-08-27-preprocessing-quality-gate-pivot-handoff.md`` for the
full design and the current phase status.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import typing as t

import cv2
import numpy as np
import pandas as pd

from dance_teacher_pose import PoseDataType, get_pose_data_schema, preprocess_pose_dataframe
from motion_extraction.scripts.extract_pose_landmarker_corpus import build_extraction_targets
from motion_extraction.scripts.run_preprocessing_experiment import (
    _direct_quality_summary,
    _visible_roots,
)
from motion_extraction.scripts.select_suspicious_frames import landmark_velocity_and_visibility

CROP_LANDMARKS = ("LEFT_HIP", "RIGHT_HIP", "LEFT_SHOULDER", "RIGHT_SHOULDER")

PARTICIPANT_STUDIES = ("chi25_study1", "chi25_study2")


@dataclass(frozen=True)
class ClipSource:
    """One video plus its canonical pose2d CSV, if it exists yet."""

    corpus: str
    relative_stem: str
    video_path: Path
    raw_pose_path: Path | None


def discover_corpus(data_root: Path) -> list[ClipSource]:
    """Enumerate every reference and participant-study video plus its canonical pose2d match, if any."""

    return [
        ClipSource(
            target.video.corpus,
            target.video.relative_stem,
            target.video.video_path,
            target.pose2d_output_path if target.pose2d_output_path.exists() else None,
        )
        for target in build_extraction_targets(data_root, ["reference", *PARTICIPANT_STUDIES])
    ]


def load_raw_pose(clip: ClipSource) -> pd.DataFrame | None:
    """Load one clip's canonical raw pose2d data, if it exists."""

    if clip.raw_pose_path is None:
        return None
    return pd.read_csv(clip.raw_pose_path, index_col="frame")


def _longest_true_run(mask: np.ndarray) -> tuple[int, int]:
    """Return (length, start index) of the longest contiguous True run.

    The start index feeds Stage 2 defect-localization warm-starts and the
    quality-triage generator's frame/window selection, so it must survive
    into the signals CSV alongside the length, not just be discarded.
    """

    longest = current = 0
    longest_start = current_start = 0
    for index, value in enumerate(mask):
        if value:
            if current == 0:
                current_start = index
            current += 1
        else:
            current = 0
        if current > longest:
            longest = current
            longest_start = current_start
    return longest, longest_start


def crop_signal(
    raw: pd.DataFrame,
    video_width: float | None,
    video_height: float | None,
    margin: float,
) -> dict[str, t.Any]:
    """Fraction of frames, and the longest contiguous run, where a hip/shoulder
    landmark sits within ``margin`` of the frame edge or off-frame entirely.

    ``raw`` is canonical pose2d: pixel-space x/y, divided here by the video's
    width/height to get frame-relative fractions.
    """

    violation = np.zeros(len(raw), dtype=bool)
    contributing_landmarks = 0
    for landmark in CROP_LANDMARKS:
        x_col, y_col = f"{landmark}_x", f"{landmark}_y"
        if x_col not in raw.columns or y_col not in raw.columns:
            continue
        if not video_width or not video_height:
            continue
        x = raw[x_col].to_numpy(dtype=float) / video_width
        y = raw[y_col].to_numpy(dtype=float) / video_height
        finite = np.isfinite(x) & np.isfinite(y)
        landmark_violation = finite & ((x < margin) | (x > 1 - margin) | (y < margin) | (y > 1 - margin))
        violation |= landmark_violation
        contributing_landmarks += 1
    if contributing_landmarks == 0:
        return {"crop_violation_fraction": float("nan"), "crop_longest_run_frames": 0, "crop_longest_run_start": -1}
    length, start = _longest_true_run(violation)
    return {
        "crop_violation_fraction": float(violation.mean()),
        "crop_longest_run_frames": length,
        "crop_longest_run_start": start if length else -1,
    }


def windowed_roughness(clean: pd.DataFrame, window_frames: int) -> dict[str, t.Any]:
    """Rolling-window p95 of per-frame mean landmark acceleration, and where it peaks.

    Unlike the whole-clip ``normalized_acceleration_p95`` (which pools every
    landmark-frame acceleration together), this averages across landmarks per
    frame first, so a window can be localized to a specific span for warm-start
    defect localization later.
    """

    fields = get_pose_data_schema(PoseDataType.pose2d).coordinate_fields
    roots = _visible_roots(clean, fields)
    frame_count = len(clean)
    if not roots or frame_count < 3:
        return {"windowed_roughness_p95_max": float("nan"), "windowed_roughness_worst_window_start": -1}

    acceleration_sum = np.zeros(frame_count)
    acceleration_count = np.zeros(frame_count)
    for root in roots:
        values = clean[[f"{root}_{field}" for field in fields]].to_numpy(dtype=float)
        acceleration = np.linalg.norm(np.diff(values, n=2, axis=0), axis=1)
        finite = np.isfinite(acceleration)
        positions = np.arange(1, frame_count - 1)[finite]
        acceleration_sum[positions] += acceleration[finite]
        acceleration_count[positions] += 1
    per_frame_mean = np.divide(
        acceleration_sum, acceleration_count, out=np.full(frame_count, np.nan), where=acceleration_count > 0
    )

    if window_frames < 1 or frame_count < window_frames:
        return {"windowed_roughness_p95_max": float("nan"), "windowed_roughness_worst_window_start": -1}
    window_scores = np.full(frame_count - window_frames + 1, np.nan)
    for start in range(len(window_scores)):
        window = per_frame_mean[start : start + window_frames]
        if np.isfinite(window).any():
            window_scores[start] = np.nanquantile(window, 0.95)
    if not np.isfinite(window_scores).any():
        return {"windowed_roughness_p95_max": float("nan"), "windowed_roughness_worst_window_start": -1}
    worst = int(np.nanargmax(window_scores))
    return {
        "windowed_roughness_p95_max": float(window_scores[worst]),
        "windowed_roughness_worst_window_start": worst,
    }


def false_tracking_signal(
    raw: pd.DataFrame,
    clean: pd.DataFrame,
    velocity_threshold: float,
    visibility_threshold: float,
) -> dict[str, t.Any]:
    """Frames where a landmark's torso-normalized frame-to-frame displacement is
    implausibly large while its detector-reported visibility is low.

    This is a coarse, unvalidated proxy for hallucinated/false-tracked limbs --
    the failure mode named twice in the 2026-08-27 lab-log entry's free-text
    annotation notes -- not a validated detector. Report the continuous
    fraction/run-length so a human reviewer can judge the threshold, rather
    than baking in a pass/fail cutoff here.

    Shares its underlying velocity/visibility computation with
    ``select_suspicious_frames.py``'s ``per_frame_suspicion`` and
    ``render_corpus_frame_quality_map.py``'s classification via
    ``landmark_velocity_and_visibility`` (see that function's docstring) --
    this function still applies its own fixed-threshold, all-visible-landmark,
    binary-flag policy on top, which is a deliberately different aggregation
    from those two, not an oversight.
    """

    fields = get_pose_data_schema(PoseDataType.pose2d).coordinate_fields
    roots = _visible_roots(clean, fields)
    frame_count = len(clean)
    flagged = np.zeros(frame_count, dtype=bool)
    contributing_landmarks = 0
    if frame_count >= 2 and roots:
        velocity_by_frame, visibility_by_frame = landmark_velocity_and_visibility(raw, clean, roots)
        for index, root in enumerate(roots):
            vis_col = f"{root}_vis"
            if vis_col not in raw.columns:
                continue
            velocity = velocity_by_frame[1:, index]
            low_visibility = visibility_by_frame[1:, index] < visibility_threshold
            implausible = np.isfinite(velocity) & (velocity > velocity_threshold) & low_visibility
            flagged[1:] |= implausible
            contributing_landmarks += 1
    if contributing_landmarks == 0:
        return {
            "false_tracking_candidate_fraction": float("nan"),
            "false_tracking_longest_run_frames": 0,
            "false_tracking_longest_run_start": -1,
        }
    length, start = _longest_true_run(flagged)
    return {
        "false_tracking_candidate_fraction": float(flagged.mean()),
        "false_tracking_longest_run_frames": length,
        "false_tracking_longest_run_start": start if length else -1,
    }


def lighting_signal(video_path: Path, raw: pd.DataFrame, sample_count: int) -> dict[str, t.Any]:
    """Video dimensions plus mean luminance/contrast sampled at a handful of
    frames spread across the clip. Extends the single-frame triage-hint
    snippet in ``append_targeted_preprocessing_tasks.py`` (``_frame_quality``)
    to sample across a clip instead of one frame.
    """

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        capture.release()
        return {
            "video_readable": False,
            "video_width": float("nan"),
            "video_height": float("nan"),
            "video_fps": float("nan"),
            "mean_luminance_0_255": float("nan"),
            "luminance_contrast_sd": float("nan"),
            "lighting_samples_decoded": 0,
        }
    width = capture.get(cv2.CAP_PROP_FRAME_WIDTH)
    height = capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
    fps = capture.get(cv2.CAP_PROP_FPS)

    frame_count = len(raw)
    positions = (
        np.linspace(0, frame_count - 1, num=min(sample_count, frame_count), dtype=int)
        if frame_count
        else np.array([], dtype=int)
    )
    means: list[float] = []
    stds: list[float] = []
    for position in positions:
        capture.set(cv2.CAP_PROP_POS_FRAMES, int(raw.index[position]))
        ok, frame = capture.read()
        if not ok:
            continue
        gray = frame.astype(float).mean(axis=2)
        means.append(float(gray.mean()))
        stds.append(float(gray.std()))
    capture.release()
    return {
        "video_readable": True,
        "video_width": float(width) if width else float("nan"),
        "video_height": float(height) if height else float("nan"),
        "video_fps": float(fps) if fps else float("nan"),
        "mean_luminance_0_255": float(np.mean(means)) if means else float("nan"),
        "luminance_contrast_sd": float(np.mean(stds)) if stds else float("nan"),
        "lighting_samples_decoded": len(means),
    }


def compute_clip_signals(
    clip: ClipSource,
    *,
    crop_margin: float,
    roughness_window_frames: int,
    false_tracking_velocity_threshold: float,
    false_tracking_visibility_threshold: float,
    lighting_sample_count: int,
) -> dict[str, t.Any]:
    """Compute every automatic signal for one clip. Never raises: a failure on
    one clip is recorded in its ``error`` column so it cannot abort the sweep.
    """

    row: dict[str, t.Any] = {
        "corpus": clip.corpus,
        "relative_stem": clip.relative_stem,
        "video_path": str(clip.video_path),
        "pose_path": str(clip.raw_pose_path) if clip.raw_pose_path else "",
        "pose_available": clip.raw_pose_path is not None,
        "error": "",
    }
    if clip.raw_pose_path is None:
        return row
    try:
        raw = load_raw_pose(clip)
        clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=None)

        row.update(_direct_quality_summary(clean, PoseDataType.pose2d))
        lighting = lighting_signal(clip.video_path, raw, lighting_sample_count)
        row.update(lighting)
        row.update(
            crop_signal(raw, lighting.get("video_width"), lighting.get("video_height"), crop_margin)
        )
        row.update(windowed_roughness(clean, roughness_window_frames))
        row.update(
            false_tracking_signal(
                raw, clean, false_tracking_velocity_threshold, false_tracking_visibility_threshold
            )
        )
    except Exception as error:  # noqa: BLE001 - one bad clip must not abort a 1900-clip sweep
        row["error"] = f"{type(error).__name__}: {error}"
    return row


def _cap_per_corpus(clips: list[ClipSource], max_files: int) -> list[ClipSource]:
    counts: dict[str, int] = {}
    capped: list[ClipSource] = []
    for clip in clips:
        seen = counts.get(clip.corpus, 0)
        if seen >= max_files:
            continue
        capped.append(clip)
        counts[clip.corpus] = seen + 1
    return capped


def main(argv: t.Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-root",
        type=Path,
        default=Path(__file__).resolve().parents[3] / "data",
        help="Workspace data root containing reference_motions/ and participant_motions/.",
    )
    parser.add_argument("--output-root", type=Path, required=True, help="Must not already exist.")
    parser.add_argument(
        "--corpora",
        nargs="+",
        choices=["reference", *PARTICIPANT_STUDIES],
        default=["reference", *PARTICIPANT_STUDIES],
    )
    parser.add_argument("--max-files", type=int, default=None, help="Cap clips per corpus, for quick iteration.")
    parser.add_argument("--crop-margin", type=float, default=0.03)
    parser.add_argument("--roughness-window-frames", type=int, default=15)
    parser.add_argument("--false-tracking-velocity-threshold", type=float, default=0.5)
    parser.add_argument("--false-tracking-visibility-threshold", type=float, default=0.5)
    parser.add_argument("--lighting-sample-count", type=int, default=6)
    args = parser.parse_args(argv)

    if args.output_root.exists():
        raise FileExistsError(f"Output root already exists: {args.output_root}")

    clips = [clip for clip in discover_corpus(args.data_root) if clip.corpus in args.corpora]
    if args.max_files is not None:
        clips = _cap_per_corpus(clips, args.max_files)

    started_at = datetime.now(timezone.utc)
    rows: list[dict[str, t.Any]] = []
    for index, clip in enumerate(clips):
        rows.append(
            compute_clip_signals(
                clip,
                crop_margin=args.crop_margin,
                roughness_window_frames=args.roughness_window_frames,
                false_tracking_velocity_threshold=args.false_tracking_velocity_threshold,
                false_tracking_visibility_threshold=args.false_tracking_visibility_threshold,
                lighting_sample_count=args.lighting_sample_count,
            )
        )
        if (index + 1) % 25 == 0 or index + 1 == len(clips):
            print(f"[{index + 1}/{len(clips)}] {clip.corpus}/{clip.relative_stem}")

    args.output_root.mkdir(parents=True)
    output_csv = args.output_root / "automatic_quality_signals.csv"
    pd.DataFrame(rows).to_csv(output_csv, index=False)

    provenance = {
        "started_at": started_at.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "data_root": str(args.data_root.resolve()),
        "corpora": args.corpora,
        "max_files_per_corpus": args.max_files,
        "clip_count": len(clips),
        "clips_with_pose_data": sum(1 for clip in clips if clip.raw_pose_path is not None),
        "clips_missing_pose_data": sum(1 for clip in clips if clip.raw_pose_path is None),
        "parameters": {
            "crop_margin": args.crop_margin,
            "roughness_window_frames": args.roughness_window_frames,
            "false_tracking_velocity_threshold": args.false_tracking_velocity_threshold,
            "false_tracking_visibility_threshold": args.false_tracking_visibility_threshold,
            "lighting_sample_count": args.lighting_sample_count,
        },
    }
    (args.output_root / "run_provenance.json").write_text(json.dumps(provenance, indent=2))
    print(f"Wrote {len(rows)} rows to {output_csv}")


if __name__ == "__main__":
    main()
