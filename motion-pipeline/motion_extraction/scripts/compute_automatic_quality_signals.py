"""Sweep the full local pose/video corpus and compute automatic quality signals.

Enumerates every video under the reference and both participant-study video
roots, matches each to its raw pose data, and writes one CSV row per clip
with coverage, roughness, frame-bounds crop, lighting, and false-tracking
signals. This is a read-only research script: it never writes pose or video
files, and it never modifies pipeline defaults.

Reference clips already have canonical pose2d raw CSVs
(``<stem>.pose2d.raw.csv``, pixel-space x/y). Neither participant study has
been run through the canonical extraction pipeline yet -- their only local
pose data is a pre-canonical ``.pose.csv`` format (frame-normalized [0, 1]
x/y, ``_2d``-suffixed columns, an ``is_valid`` frame flag). ``adapt_legacy_
pose2d`` renames that format onto the canonical column contract in memory so
every downstream signal function only has to know one column layout; the
``pose_schema`` field on each ``ClipSource`` records which convention a clip
came from, since it changes unit handling (pixel vs. already-normalized) for
the crop signal and frame-seeking (frame index vs. timestamp) for lighting.

See ``lab-log/2026-08-27-preprocessing-quality-gate-pivot-handoff.md`` for
the full design and the current phase status.
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

from dance_teacher_pose import (
    PoseDataType,
    collect_pose_data_files,
    get_pose_data_schema,
    preprocess_pose_dataframe,
    relative_stem_from_pose_csv_path,
)
from motion_extraction.scripts.run_preprocessing_experiment import (
    _direct_quality_summary,
    _visible_roots,
)

CROP_LANDMARKS = ("LEFT_HIP", "RIGHT_HIP", "LEFT_SHOULDER", "RIGHT_SHOULDER")

LEGACY_FIELD_SUFFIXES = (
    ("_x_2d", "_x"),
    ("_y_2d", "_y"),
    ("_z_2d", "_distance"),
    ("_visibility_2d", "_vis"),
)

PARTICIPANT_STUDIES = ("chi25_study1", "chi25_study2")


@dataclass(frozen=True)
class ClipSource:
    """One video plus whatever raw pose data (if any) matches it."""

    corpus: str
    relative_stem: str
    video_path: Path
    raw_pose_path: Path | None
    pose_schema: str  # "canonical_pixel" | "legacy_normalized" | "none"


def adapt_legacy_pose2d(raw_legacy: pd.DataFrame) -> pd.DataFrame:
    """Rename a legacy ``_2d``-suffixed raw pose CSV onto the canonical pose2d
    column contract.

    Legacy x/y are already frame-normalized to [0, 1], unlike canonical
    pose2d's pixel-space columns. Torso-normalization in
    ``preprocess_pose_dataframe`` cancels absolute units, so this does not
    affect roughness/coverage signals -- but a caller computing frame-bounds
    crop fractions must not re-divide these values by video width/height.
    Frames where ``is_valid`` is false have every coordinate field set to NaN,
    matching how an undetected landmark is represented elsewhere.
    """

    landmark_names = sorted(
        {column[: -len("_x_2d")] for column in raw_legacy.columns if column.endswith("_x_2d")}
    )
    valid = (
        raw_legacy["is_valid"].astype(bool).to_numpy()
        if "is_valid" in raw_legacy.columns
        else np.ones(len(raw_legacy), dtype=bool)
    )
    columns: dict[str, np.ndarray] = {}
    for landmark in landmark_names:
        for legacy_suffix, canonical_suffix in LEGACY_FIELD_SUFFIXES:
            column = f"{landmark}{legacy_suffix}"
            if column not in raw_legacy.columns:
                continue
            values = raw_legacy[column].to_numpy(dtype=float)
            columns[f"{landmark}{canonical_suffix}"] = np.where(valid, values, np.nan)
    if "timestamp" in raw_legacy.columns:
        columns["timestamp_ms"] = raw_legacy["timestamp"].to_numpy(dtype=float)
    return pd.DataFrame(columns, index=pd.Index(raw_legacy["frame"].to_numpy(), name="frame"))


def _discover_reference_clips(data_root: Path) -> list[ClipSource]:
    video_root = data_root / "reference_motions" / "videos"
    pose_root = data_root / "reference_motions" / "pose-raw" / "pose2d"
    pose_files: dict[str, Path] = {}
    if pose_root.is_dir():
        for pose_path in collect_pose_data_files(
            pose_root, PoseDataType.pose2d, preferred_versions=("raw", "legacy")
        ):
            stem = relative_stem_from_pose_csv_path(pose_path, pose_root, PoseDataType.pose2d)
            pose_files[stem] = pose_path
    clips: list[ClipSource] = []
    if not video_root.is_dir():
        return clips
    for video_path in sorted(video_root.rglob("*.mp4")):
        stem = video_path.relative_to(video_root).with_suffix("").as_posix()
        pose_path = pose_files.get(stem)
        clips.append(
            ClipSource("reference", stem, video_path, pose_path, "canonical_pixel" if pose_path else "none")
        )
    return clips


def _discover_participant_clips(data_root: Path, study: str, legacy_dirname: str) -> list[ClipSource]:
    video_root = data_root / "participant_motions" / study / "videos"
    pose_root = data_root / "participant_motions" / study / "pose-raw" / "legacy" / legacy_dirname
    legacy_suffix = ".pose.csv"
    pose_files: dict[str, Path] = {}
    if pose_root.is_dir():
        for pose_path in pose_root.glob(f"*{legacy_suffix}"):
            pose_files[pose_path.name[: -len(legacy_suffix)]] = pose_path
    clips: list[ClipSource] = []
    if not video_root.is_dir():
        return clips
    for video_path in sorted(video_root.glob("*.mp4")):
        stem = video_path.stem
        pose_path = pose_files.get(stem)
        clips.append(
            ClipSource(study, stem, video_path, pose_path, "legacy_normalized" if pose_path else "none")
        )
    return clips


def discover_corpus(data_root: Path) -> list[ClipSource]:
    """Enumerate every reference and participant-study video plus its raw pose match, if any."""

    clips = list(_discover_reference_clips(data_root))
    clips += _discover_participant_clips(data_root, "chi25_study1", "study1-poses-segmented")
    clips += _discover_participant_clips(data_root, "chi25_study2", "study2-poses-segmented")
    return clips


def load_raw_pose(clip: ClipSource) -> pd.DataFrame | None:
    """Load one clip's raw pose data onto the canonical pose2d column contract."""

    if clip.raw_pose_path is None:
        return None
    if clip.pose_schema == "canonical_pixel":
        return pd.read_csv(clip.raw_pose_path, index_col="frame")
    if clip.pose_schema == "legacy_normalized":
        return adapt_legacy_pose2d(pd.read_csv(clip.raw_pose_path))
    return None


def _longest_true_run(mask: np.ndarray) -> int:
    longest = current = 0
    for value in mask:
        current = current + 1 if value else 0
        longest = max(longest, current)
    return longest


def crop_signal(
    raw: pd.DataFrame,
    pixel_space: bool,
    video_width: float | None,
    video_height: float | None,
    margin: float,
) -> dict[str, t.Any]:
    """Fraction of frames, and the longest contiguous run, where a hip/shoulder
    landmark sits within ``margin`` of the frame edge or off-frame entirely.
    """

    violation = np.zeros(len(raw), dtype=bool)
    contributing_landmarks = 0
    for landmark in CROP_LANDMARKS:
        x_col, y_col = f"{landmark}_x", f"{landmark}_y"
        if x_col not in raw.columns or y_col not in raw.columns:
            continue
        x = raw[x_col].to_numpy(dtype=float)
        y = raw[y_col].to_numpy(dtype=float)
        if pixel_space:
            if not video_width or not video_height:
                continue
            x = x / video_width
            y = y / video_height
        finite = np.isfinite(x) & np.isfinite(y)
        landmark_violation = finite & ((x < margin) | (x > 1 - margin) | (y < margin) | (y > 1 - margin))
        violation |= landmark_violation
        contributing_landmarks += 1
    if contributing_landmarks == 0:
        return {"crop_violation_fraction": float("nan"), "crop_longest_run_frames": 0}
    return {
        "crop_violation_fraction": float(violation.mean()),
        "crop_longest_run_frames": _longest_true_run(violation),
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
    """

    fields = get_pose_data_schema(PoseDataType.pose2d).coordinate_fields
    roots = _visible_roots(clean, fields)
    frame_count = len(clean)
    flagged = np.zeros(frame_count, dtype=bool)
    contributing_landmarks = 0
    for root in roots:
        vis_col = f"{root}_vis"
        if vis_col not in raw.columns or frame_count < 2:
            continue
        values = clean[[f"{root}_{field}" for field in fields]].to_numpy(dtype=float)
        velocity = np.linalg.norm(np.diff(values, axis=0), axis=1)
        low_visibility = raw[vis_col].to_numpy(dtype=float)[1:] < visibility_threshold
        implausible = np.isfinite(velocity) & (velocity > velocity_threshold) & low_visibility
        flagged[1:] |= implausible
        contributing_landmarks += 1
    if contributing_landmarks == 0:
        return {"false_tracking_candidate_fraction": float("nan"), "false_tracking_longest_run_frames": 0}
    return {
        "false_tracking_candidate_fraction": float(flagged.mean()),
        "false_tracking_longest_run_frames": _longest_true_run(flagged),
    }


def lighting_signal(video_path: Path, raw: pd.DataFrame, pixel_space: bool, sample_count: int) -> dict[str, t.Any]:
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
        if pixel_space:
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(raw.index[position]))
        elif "timestamp_ms" in raw.columns:
            capture.set(cv2.CAP_PROP_POS_MSEC, float(raw["timestamp_ms"].iloc[position]))
        else:
            continue
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
        "pose_schema": clip.pose_schema,
        "pose_available": clip.raw_pose_path is not None,
        "error": "",
    }
    if clip.raw_pose_path is None:
        return row
    try:
        raw = load_raw_pose(clip)
        clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=None)
        pixel_space = clip.pose_schema == "canonical_pixel"

        row.update(_direct_quality_summary(clean, PoseDataType.pose2d))
        lighting = lighting_signal(clip.video_path, raw, pixel_space, lighting_sample_count)
        row.update(lighting)
        row.update(
            crop_signal(raw, pixel_space, lighting.get("video_width"), lighting.get("video_height"), crop_margin)
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
