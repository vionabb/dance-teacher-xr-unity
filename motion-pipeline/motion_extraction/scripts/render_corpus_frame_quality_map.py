"""Render a per-frame INPUT-SIGNAL-QUALITY map across the participant corpus.

One row per participant clip, one pixel-column per frame (resampled to a
fixed width so clips of different lengths line up), colored by a per-frame
severity classification:

- white: no detected issue.
- yellow: a correctable issue -- an arm/shoulder landmark is out of frame
  but MediaPipe correctly reports low visibility for it (the gap is
  detectable and interpolatable), or a transient velocity/visibility
  suspicion spike (plausibly smoothable).
- red: an uncorrectable issue -- an arm/shoulder landmark is out of frame
  but MediaPipe reports it with *high* visibility (a confident-looking
  hallucination that a preprocessing step won't know to mask), or a severe
  suspicion spike.

**Scope, and what this map is not**: yellow/red here mean "the detector
*thinks* this is correctable" -- a claim about the input signal and our
detection heuristics, not a claim that any actual correction technique
fixes it. This script never runs pose data through
``PosePreprocessingConfig`` (gap-fill/outlier-removal/smoothing) or any
other correction pipeline; ``preprocess_pose_dataframe(..., config=None)``
below only recenters/torso-normalizes, matching the "raw, uncorrected input"
reading this map is meant to give. Validating whether a correction technique
actually closes a yellow gap is a separate question, answered by comparing
its output against real per-frame ``error_marking`` ground truth, not by
this script.

Landmarks and thresholds intentionally reuse the 2026-08-30 out-of-frame /
hallucination analysis in the quality-gate handoff doc: scoring is
restricted to the 6 arm/shoulder landmarks (hips excluded -- hip framing
isn't treated as a defect on its own, see that analysis), and the
high-visibility threshold (0.5) matches the one used there.

Rows are grouped by which reference dance the clip is performing (parsed
from the participant filename) and, within each group, ordered worst-to-best
by a weighted badness score, so the worst clips in each group are easiest to
spot. Each row also carries three small severity-indicator swatches (crop /
lighting / clothing -- see ``_oob_severity``'s "REGENERATE" note and the
"Video-quality row indicators" section below) so patterns between input
video quality and error prevalence are visible at a glance, not just
inferable from the frame-quality bar alone.

**Regenerate this whenever "is tracking implausible?" (detection) or "is
this tracking error fixable?" (the yellow/red classification in
``_oob_severity``) code changes** -- see the "REGENERATE" callouts on
those functions and on ``false_tracking_signal`` in
``compute_automatic_quality_signals.py`` for exactly what to watch. Each run
is written to its own timestamped output directory (past runs are never
overwritten, so before/after is always comparable) and a
``temp/experiments/latest-frame-quality-map`` symlink always points at the
most recent one; ``run_provenance.json`` records the git commit and a
content hash of the detection/fixability source at run time, and this
script prints a one-line note if that hash differs from the previous run's,
so a stale PNG lying around is never mistaken for current.

Usage: uv run python -m motion_extraction.scripts.render_corpus_frame_quality_map
       [--output-root temp/experiments/<name>] [--max-clips N]
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import typing as t

import cv2
import numpy as np
import pandas as pd

from dance_teacher_pose import PoseDataType, preprocess_pose_dataframe
from motion_extraction.scripts.compute_automatic_quality_signals import (
    crop_signal,
    lighting_signal,
)
from motion_extraction.scripts.extract_pose_landmarker_corpus import build_extraction_targets
from motion_extraction.scripts.select_suspicious_frames import per_frame_suspicion
from motion_extraction.study_pose_data import default_data_root

ARM_LANDMARKS = [
    "LEFT_SHOULDER", "RIGHT_SHOULDER",
    "LEFT_ELBOW", "RIGHT_ELBOW",
    "LEFT_WRIST", "RIGHT_WRIST",
]
VIS_HIGH_THRESHOLD = 0.5
SUSPICION_YELLOW_PERCENTILE = 75.0
SUSPICION_RED_PERCENTILE = 95.0

# Video-quality row indicators: crop and lighting are automatic (every row
# gets one), clothing is sparse (only from a completed video_quality_rating
# judgment -- 0/20 pilot done as of 2026-09-03, so expect mostly "no data").
# Matches compute_automatic_quality_signals.py's canonical-sweep defaults so
# the numbers behind these indicators are the same ones already documented
# in the handoff doc, not a fourth reimplementation.
CROP_MARGIN = 0.03
LIGHTING_SAMPLE_COUNT = 6
# Crop/lighting severity buckets are corpus-wide percentiles (computed fresh
# each run, like the suspicion-score thresholds above), not guessed fixed
# cutoffs -- see build_rows().
INDICATOR_MODERATE_PERCENTILE = 60.0
INDICATOR_SEVERE_PERCENTILE = 90.0

DANCE_LABELS = {
    "madatdisney": "Mad at Disney",
    "pajamaparty": "Pajama Party",
    "lastchristmas": "Last Christmas",
    "bartender": "Bartender",
    "other": "Other / unparsed",
}
_CONDITIONS = ("emojiandsegmented", "emoji", "segmented", "sheetmotion", "skeleton", "control")
_DANCE_PATTERN = re.compile(r"userstudy\d+-+(?P<dance>.+?)-+(?:" + "|".join(_CONDITIONS) + r")$")

WHITE = (255, 255, 255)
YELLOW_BGR = (0, 215, 255)
RED_BGR = (0, 0, 220)
SEVERITY_COLOR = {0: WHITE, 1: YELLOW_BGR, 2: RED_BGR}

# Indicator swatches use a blue/purple/magenta family specifically so they're
# never confused with the white/yellow/red frame-severity bar next to them.
# Bucket -1 (no data) is always gray, regardless of which indicator.
INDICATOR_NO_DATA = (95, 95, 95)
INDICATOR_COLOR = {-1: INDICATOR_NO_DATA, 0: (200, 140, 60), 1: (180, 60, 180), 2: (120, 0, 120)}
# Clothing has no automatic scalar to bucket by percentile -- map the human
# quality_rating_response_json categories directly onto the same 0/1/2 scale.
CLOTHING_BUCKET = {"well_suited": 0, "moderate": 1, "poorly_suited": 2}

RESAMPLED_WIDTH = 200
COLUMN_PX = 4
ROW_PX = 3
GROUP_HEADER_PX = 26
LEGEND_PX = 76
INDICATOR_PX = 5
INDICATOR_GAP_PX = 2
INDICATOR_COUNT = 3  # crop, lighting, clothing
INDICATOR_BLOCK_PX = INDICATOR_COUNT * INDICATOR_PX + (INDICATOR_COUNT - 1) * INDICATOR_GAP_PX + 6


def parse_dance(relative_stem: str) -> str:
    """Extract a normalized dance key from a participant filename.

    Both studies embed the dance name inconsistently (hyphenated,
    concatenated, or with varying separators -- "mad-at-disney" vs
    "madatdisney", "pajama-party" vs "pajamaparty"), so this strips to
    alphanumeric-only after isolating the segment between "userstudyN-" and
    a known condition suffix.
    """

    segment = relative_stem.split("____workflowid")[0]
    match = _DANCE_PATTERN.search(segment)
    if not match:
        return "other"
    return re.sub(r"[^a-z0-9]", "", match.group("dance").lower()) or "other"


@dataclass
class ClipRow:
    corpus: str
    relative_stem: str
    dance: str
    n_frames: int
    classification: np.ndarray  # per-frame: 0 white, 1 yellow, 2 red
    white_fraction: float
    yellow_fraction: float
    red_fraction: float
    badness: float
    # Video-quality indicators (see "Video-quality row indicators" in the
    # module docstring). Buckets are -1/0/1/2 = no data/ok/moderate/severe.
    crop_violation_fraction: float = float("nan")
    crop_bucket: int = -1
    lighting_badness: float = float("nan")
    lighting_bucket: int = -1
    clothing_rating: str = ""
    clothing_bucket: int = -1
    clothing_annotator: str = ""


def _video_dimensions(video_path: Path) -> tuple[float, float] | None:
    capture = cv2.VideoCapture(str(video_path))
    width = capture.get(cv2.CAP_PROP_FRAME_WIDTH)
    height = capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
    capture.release()
    if not width or not height:
        return None
    return width, height


def _oob_severity(raw: pd.DataFrame, width: float, height: float, n_frames: int) -> np.ndarray:
    """Per-frame severity (0/1/2) from out-of-frame arm/shoulder landmarks alone.

    This is the "is this tracking error fixable?" half of the map's
    classification (the other half, "is tracking implausible at all?", is
    ``per_frame_suspicion`` in ``select_suspicious_frames.py``, called from
    ``collect_clip_data`` below). A high-visibility out-of-frame report is
    judged unfixable (red) because nothing downstream has a signal telling it
    to distrust that coordinate; a low-visibility one is judged fixable
    (yellow) because a gap-fill/interpolation step *could* act on it -- this
    function does not check whether one actually does.

    REGENERATE the frame-quality map (see the module docstring) if you touch
    ``VIS_HIGH_THRESHOLD``, ``ARM_LANDMARKS``, or this fixability judgment
    itself -- it changes what counts as yellow vs. red for every clip.
    """

    high_vis = np.zeros(n_frames, dtype=bool)
    low_vis = np.zeros(n_frames, dtype=bool)
    for landmark in ARM_LANDMARKS:
        x_col, y_col, vis_col = f"{landmark}_x", f"{landmark}_y", f"{landmark}_vis"
        if not all(column in raw.columns for column in (x_col, y_col, vis_col)):
            continue
        x = raw[x_col].to_numpy(dtype=float)
        y = raw[y_col].to_numpy(dtype=float)
        vis = raw[vis_col].to_numpy(dtype=float)
        out_of_bounds = (x < 0) | (x >= width) | (y < 0) | (y >= height)
        out_of_bounds &= np.isfinite(x) & np.isfinite(y)
        high_vis |= out_of_bounds & (vis > VIS_HIGH_THRESHOLD)
        low_vis |= out_of_bounds & ~(vis > VIS_HIGH_THRESHOLD)
    severity = np.zeros(n_frames, dtype=np.uint8)
    severity[low_vis] = 1
    severity[high_vis] = 2
    return severity


def _lighting_badness(mean_luminance: float, contrast_sd: float) -> float:
    """Simple, unvalidated lighting-quality proxy from ``lighting_signal``'s output.

    ``luminance_penalty`` grows as mean brightness moves away from a
    comfortable mid-gray (128); ``contrast_penalty`` grows as contrast falls
    below a flat/washed-out threshold (30). Not calibrated against any human
    label -- only 0/20 ``video_quality_rating`` pilot tasks are done as of
    2026-09-03, nowhere near enough to fit or validate a real model. Treat
    the resulting bucket as a rough automatic hint, not a substitute for the
    human `lighting` rating this same row may also carry (see
    ``load_video_quality_ratings``); once real ratings exist, this should be
    checked against them and replaced or recalibrated if it doesn't hold up.
    """

    if not np.isfinite(mean_luminance) or not np.isfinite(contrast_sd):
        return float("nan")
    luminance_penalty = abs(mean_luminance - 128.0) / 128.0
    contrast_penalty = max(0.0, (30.0 - contrast_sd) / 30.0)
    return luminance_penalty + contrast_penalty


def load_video_quality_ratings(
    experiment_root: Path, database_path: Path
) -> dict[str, dict[str, str]]:
    """video-session-key -> {"lighting": ..., "clothing": ..., "annotator": ...}
    from completed ``video_quality_rating`` judgments.

    A human rating (any annotator other than ``claude``/``claude-ui-check``)
    is preferred over Claude's own reference rating when both exist for the
    same video; today (2026-09-03) Viona hasn't rated any of the 20-video
    pilot yet, so every entry here is Claude's own reference rating,
    included anyway (labeled by ``annotator``) since it's still informative
    for spotting patterns -- just not yet human-verified. Sparse by design:
    only the 20-video pilot has any rating at all, so most rows' lookup will
    simply miss. Returns ``{}`` if the manifest or database isn't found, so
    a fresh experiment root without this pilot batch still renders the map.

    The session key matches ``append_video_quality_rating_tasks.py``'s own
    grouping (everything before ``____clipN``, or the whole stem if absent)
    so a clip row's own relative_stem, split the same way, joins against it.
    """

    manifest_path = experiment_root / "annotation_tasks.json"
    if not manifest_path.is_file() or not database_path.is_file():
        return {}
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    task_video_key = {}
    for task in manifest.get("tasks", []):
        if task.get("task_type") != "video_quality_rating":
            continue
        stem = task["relative_stem"]
        task_video_key[task["task_id"]] = stem.split("____clip")[0] if "____clip" in stem else stem
    if not task_video_key:
        return {}

    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            WITH latest AS (
                SELECT task_id, annotator, MAX(revision_id) AS rid
                FROM judgment_revisions
                WHERE task_type = 'video_quality_rating' AND status = 'completed'
                GROUP BY task_id, annotator
            )
            SELECT jr.task_id, jr.annotator, jr.quality_rating_response_json
            FROM judgment_revisions jr JOIN latest l ON jr.revision_id = l.rid
            """
        ).fetchall()

    by_video: dict[str, tuple[bool, dict[str, str]]] = {}
    for row in rows:
        video_key = task_video_key.get(row["task_id"])
        if video_key is None:
            continue
        is_human = row["annotator"] not in ("claude", "claude-ui-check")
        existing = by_video.get(video_key)
        if existing is not None and existing[0] and not is_human:
            continue  # keep an existing human rating over a claude one
        response = json.loads(row["quality_rating_response_json"])
        by_video[video_key] = (
            is_human,
            {
                "lighting": response.get("lighting", ""),
                "clothing": response.get("clothing", ""),
                "annotator": row["annotator"],
            },
        )
    return {key: value for key, (_, value) in by_video.items()}


def collect_clip_data(
    data_root: Path, corpora: t.Sequence[str], max_clips: int | None
) -> list[dict[str, t.Any]]:
    """First pass: load pose + compute the oob severity, suspicion score, and
    automatic video-quality signals (crop, lighting) per clip."""

    targets = build_extraction_targets(data_root, corpora)
    if max_clips is not None:
        targets = targets[:max_clips]

    collected: list[dict[str, t.Any]] = []
    for index, target in enumerate(targets):
        if not target.pose2d_output_path.exists():
            continue
        dimensions = _video_dimensions(target.video.video_path)
        if dimensions is None:
            continue
        width, height = dimensions
        try:
            raw = pd.read_csv(target.pose2d_output_path, index_col="frame")
        except Exception:
            continue
        if raw.empty:
            continue
        clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=None)
        n_frames = len(clean)
        oob_severity = _oob_severity(raw, width, height, n_frames)
        suspicion = per_frame_suspicion(raw, clean, roots=ARM_LANDMARKS)["score"].to_numpy()
        crop = crop_signal(raw, width, height, CROP_MARGIN)
        lighting = lighting_signal(target.video.video_path, raw, LIGHTING_SAMPLE_COUNT)
        stem = target.video.relative_stem
        video_key = stem.split("____clip")[0] if "____clip" in stem else stem
        collected.append(
            {
                "corpus": target.video.corpus,
                "relative_stem": stem,
                "video_key": video_key,
                "dance": parse_dance(stem),
                "n_frames": n_frames,
                "oob_severity": oob_severity,
                "suspicion": suspicion,
                "crop_violation_fraction": crop["crop_violation_fraction"],
                "lighting_badness": _lighting_badness(
                    lighting["mean_luminance_0_255"], lighting["luminance_contrast_sd"]
                ),
            }
        )
        if (index + 1) % 200 == 0:
            print(f"...loaded {index + 1} clips", flush=True)
    return collected


def _percentile_bucket(values: np.ndarray, value: float, moderate_threshold: float, severe_threshold: float) -> int:
    if not np.isfinite(value):
        return -1
    if value >= severe_threshold:
        return 2
    if value >= moderate_threshold:
        return 1
    return 0


def build_rows(
    collected: list[dict[str, t.Any]], ratings: dict[str, dict[str, str]] | None = None
) -> list[ClipRow]:
    """Second pass: apply corpus-wide percentile thresholds (suspicion, crop,
    lighting) and attach any available human/reference video-quality rating."""

    ratings = ratings or {}

    all_suspicion = np.concatenate([item["suspicion"] for item in collected])
    yellow_threshold = float(np.percentile(all_suspicion, SUSPICION_YELLOW_PERCENTILE))
    red_threshold = float(np.percentile(all_suspicion, SUSPICION_RED_PERCENTILE))
    print(
        f"Suspicion-score thresholds (corpus-wide, arm/shoulder-only): "
        f"yellow >= {yellow_threshold:.4f} (p{SUSPICION_YELLOW_PERCENTILE:.0f}), "
        f"red >= {red_threshold:.4f} (p{SUSPICION_RED_PERCENTILE:.0f})"
    )

    all_crop = np.array([item["crop_violation_fraction"] for item in collected], dtype=float)
    all_lighting = np.array([item["lighting_badness"] for item in collected], dtype=float)
    crop_moderate = float(np.nanpercentile(all_crop, INDICATOR_MODERATE_PERCENTILE))
    crop_severe = float(np.nanpercentile(all_crop, INDICATOR_SEVERE_PERCENTILE))
    lighting_moderate = float(np.nanpercentile(all_lighting, INDICATOR_MODERATE_PERCENTILE))
    lighting_severe = float(np.nanpercentile(all_lighting, INDICATOR_SEVERE_PERCENTILE))
    print(
        f"Crop indicator thresholds (corpus-wide): moderate >= {crop_moderate:.4f}, severe >= {crop_severe:.4f}\n"
        f"Lighting indicator thresholds (corpus-wide): moderate >= {lighting_moderate:.4f}, severe >= {lighting_severe:.4f}"
    )
    rated_count = sum(1 for item in collected if item["video_key"] in ratings)
    print(f"Clothing indicator: {rated_count}/{len(collected)} clips have a video_quality_rating available.")

    rows: list[ClipRow] = []
    for item in collected:
        suspicion_severity = np.zeros(item["n_frames"], dtype=np.uint8)
        suspicion_severity[item["suspicion"] >= yellow_threshold] = 1
        suspicion_severity[item["suspicion"] >= red_threshold] = 2
        classification = np.maximum(item["oob_severity"], suspicion_severity)
        n = item["n_frames"]
        white_fraction = float((classification == 0).mean())
        yellow_fraction = float((classification == 1).mean())
        red_fraction = float((classification == 2).mean())

        rating = ratings.get(item["video_key"], {})
        clothing_rating = rating.get("clothing", "")

        rows.append(
            ClipRow(
                corpus=item["corpus"],
                relative_stem=item["relative_stem"],
                dance=item["dance"],
                n_frames=n,
                classification=classification,
                white_fraction=white_fraction,
                yellow_fraction=yellow_fraction,
                red_fraction=red_fraction,
                badness=2.0 * red_fraction + yellow_fraction,
                crop_violation_fraction=item["crop_violation_fraction"],
                crop_bucket=_percentile_bucket(all_crop, item["crop_violation_fraction"], crop_moderate, crop_severe),
                lighting_badness=item["lighting_badness"],
                lighting_bucket=_percentile_bucket(
                    all_lighting, item["lighting_badness"], lighting_moderate, lighting_severe
                ),
                clothing_rating=clothing_rating,
                clothing_bucket=CLOTHING_BUCKET.get(clothing_rating, -1),
                clothing_annotator=rating.get("annotator", ""),
            )
        )
    return rows


def _resample_row(classification: np.ndarray, width: int) -> np.ndarray:
    """Downsample to a fixed column count, keeping the worst severity per bucket."""

    n = len(classification)
    if n == width:
        return classification
    edges = np.linspace(0, n, width + 1).astype(int)
    resampled = np.zeros(width, dtype=np.uint8)
    for column in range(width):
        start, end = edges[column], max(edges[column + 1], edges[column] + 1)
        resampled[column] = classification[start:end].max()
    return resampled


def render_image(rows: list[ClipRow]) -> np.ndarray:
    groups: dict[str, list[ClipRow]] = {}
    for row in rows:
        groups.setdefault(row.dance, []).append(row)
    for group_rows in groups.values():
        group_rows.sort(key=lambda row: row.badness, reverse=True)

    bar_width = RESAMPLED_WIDTH * COLUMN_PX
    image_width = INDICATOR_BLOCK_PX + bar_width
    body_height = sum(GROUP_HEADER_PX + len(group_rows) * ROW_PX for group_rows in groups.values())
    canvas = np.full((LEGEND_PX + body_height, image_width, 3), 30, dtype=np.uint8)

    cv2.putText(canvas, "Participant corpus frame-quality map", (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, WHITE, 1, cv2.LINE_AA)
    legend_y = 42
    for label, color, x in (("white = clean", WHITE, 10), ("yellow = correctable", YELLOW_BGR, 190), ("red = uncorrectable", RED_BGR, 400)):
        cv2.rectangle(canvas, (x, legend_y - 10), (x + 12, legend_y + 2), color, -1)
        cv2.putText(canvas, label, (x + 18, legend_y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, WHITE, 1, cv2.LINE_AA)

    legend_y2 = 60
    cv2.putText(
        canvas, "row indicators (crop | lighting | clothing):", (10, legend_y2),
        cv2.FONT_HERSHEY_SIMPLEX, 0.42, WHITE, 1, cv2.LINE_AA,
    )
    indicator_legend_x = 330
    for label, color in (
        ("ok", INDICATOR_COLOR[0]), ("moderate", INDICATOR_COLOR[1]),
        ("severe", INDICATOR_COLOR[2]), ("no data", INDICATOR_NO_DATA),
    ):
        cv2.rectangle(canvas, (indicator_legend_x, legend_y2 - 9), (indicator_legend_x + 10, legend_y2 + 2), color, -1)
        cv2.putText(canvas, label, (indicator_legend_x + 14, legend_y2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, WHITE, 1, cv2.LINE_AA)
        indicator_legend_x += 26 + 8 * len(label)

    y = LEGEND_PX
    for dance in sorted(groups):
        group_rows = groups[dance]
        label = DANCE_LABELS.get(dance, dance)
        cv2.rectangle(canvas, (0, y), (image_width, y + GROUP_HEADER_PX), (60, 60, 60), -1)
        cv2.putText(
            canvas, f"{label}  (n={len(group_rows)}, worst-to-best)", (10, y + 18),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, WHITE, 1, cv2.LINE_AA,
        )
        y += GROUP_HEADER_PX
        for row in group_rows:
            indicator_x = 3
            for bucket in (row.crop_bucket, row.lighting_bucket, row.clothing_bucket):
                canvas[y : y + ROW_PX, indicator_x : indicator_x + INDICATOR_PX] = INDICATOR_COLOR[bucket]
                indicator_x += INDICATOR_PX + INDICATOR_GAP_PX

            resampled = _resample_row(row.classification, RESAMPLED_WIDTH)
            for column in range(RESAMPLED_WIDTH):
                color = SEVERITY_COLOR[int(resampled[column])]
                left = INDICATOR_BLOCK_PX + column * COLUMN_PX
                canvas[y : y + ROW_PX, left : left + COLUMN_PX] = color
            y += ROW_PX

    return canvas


def write_summary_csv(rows: list[ClipRow], path: Path) -> None:
    frame = pd.DataFrame(
        [
            {
                "corpus": row.corpus,
                "relative_stem": row.relative_stem,
                "dance": row.dance,
                "dance_label": DANCE_LABELS.get(row.dance, row.dance),
                "n_frames": row.n_frames,
                "white_fraction": row.white_fraction,
                "yellow_fraction": row.yellow_fraction,
                "red_fraction": row.red_fraction,
                "badness": row.badness,
                "crop_violation_fraction": row.crop_violation_fraction,
                "crop_bucket": row.crop_bucket,
                "lighting_badness": row.lighting_badness,
                "lighting_bucket": row.lighting_bucket,
                "clothing_rating": row.clothing_rating,
                "clothing_bucket": row.clothing_bucket,
                "clothing_annotator": row.clothing_annotator,
            }
            for row in rows
        ]
    )
    frame = frame.sort_values(["dance", "badness"], ascending=[True, False])
    frame.to_csv(path, index=False)


def _git_commit_hash() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True,
            cwd=Path(__file__).resolve().parent, timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None


def _detection_and_fixability_source_hash() -> tuple[str, list[str]]:
    """Content hash of the source files defining "is tracking implausible?"
    and "is this tracking error fixable?" for this map, so a later run (or a
    human looking at an old PNG) can tell whether the code that produced a
    given run has since changed -- see the module docstring's "REGENERATE"
    guidance.
    """

    motion_pipeline_root = Path(__file__).resolve().parents[2]
    files = [
        Path(__file__).resolve(),
        Path(__file__).resolve().parent / "select_suspicious_frames.py",
    ]
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.read_bytes())
    relative = [str(path.relative_to(motion_pipeline_root)) for path in files]
    return digest.hexdigest()[:16], relative


def main(argv: t.Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=default_data_root().parent)
    parser.add_argument("--output-root", type=Path, default=None)
    parser.add_argument("--max-clips", type=int, default=None, help="Limit clips processed (debugging).")
    parser.add_argument(
        "--corpora",
        nargs="+",
        choices=["reference", "chi25_study1", "chi25_study2"],
        default=["chi25_study1", "chi25_study2"],
        help="Which corpora to include (default: study1+study2, matching prior runs -- "
        "add 'reference' to also map the reference tutorial clips). Reference filenames "
        "don't follow the participant userstudyN-<dance>-<condition> naming convention, "
        "so parse_dance() can't identify their dance and they land in the 'Other / "
        "unparsed' group rather than under a named dance.",
    )
    parser.add_argument(
        "--experiment-root",
        type=Path,
        default=Path("temp/experiments/20260828-quality-triage-batch-v1"),
        help="Where to look for a video_quality_rating manifest (annotation_tasks.json) "
        "for the clothing/human-lighting row indicators. Missing is fine -- those "
        "indicators just show as 'no data'.",
    )
    parser.add_argument(
        "--annotations-database",
        type=Path,
        default=Path("data/human-annotations/quality-triage/annotations.sqlite3"),
        help="Where to look for completed video_quality_rating judgments. Missing is "
        "fine -- see --experiment-root.",
    )
    args = parser.parse_args(argv)

    output_root = args.output_root or Path(
        f"temp/experiments/{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-frame-quality-map"
    )
    output_root.mkdir(parents=True, exist_ok=True)

    detection_hash, detection_files = _detection_and_fixability_source_hash()
    latest_link = output_root.parent / "latest-frame-quality-map"
    if latest_link.exists():
        try:
            prior = json.loads((latest_link / "run_provenance.json").read_text())
            if prior.get("detection_and_fixability_source_hash") != detection_hash:
                prior_commit = (prior.get("git_commit") or "?")[:7]
                print(
                    f"Detection/fixability code has changed since the previous run "
                    f"({prior.get('created_utc', '?')}, commit {prior_commit}) -- "
                    f"this run reflects the current code."
                )
            else:
                print("Detection/fixability code is unchanged since the previous run.")
        except Exception:
            pass

    print("Loading video_quality_rating judgments for row indicators (if any)...")
    ratings = load_video_quality_ratings(args.experiment_root, args.annotations_database)

    print("Pass 1/2: loading pose data and computing per-frame signals...")
    collected = collect_clip_data(args.data_root, args.corpora, args.max_clips)
    print(f"Loaded {len(collected)} clips with usable pose data.")

    print("Pass 2/2: applying corpus-wide thresholds and classifying...")
    rows = build_rows(collected, ratings)

    image = render_image(rows)
    image_path = output_root / "frame_quality_map.png"
    cv2.imwrite(str(image_path), image)

    csv_path = output_root / "frame_quality_summary.csv"
    write_summary_csv(rows, csv_path)

    provenance = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "git_commit": _git_commit_hash(),
        "detection_and_fixability_source_hash": detection_hash,
        "detection_and_fixability_source_files": detection_files,
        "corpora": list(args.corpora),
        "clip_count": len(rows),
        "arm_landmarks": ARM_LANDMARKS,
        "vis_high_threshold": VIS_HIGH_THRESHOLD,
        "suspicion_yellow_percentile": SUSPICION_YELLOW_PERCENTILE,
        "suspicion_red_percentile": SUSPICION_RED_PERCENTILE,
        "indicator_moderate_percentile": INDICATOR_MODERATE_PERCENTILE,
        "indicator_severe_percentile": INDICATOR_SEVERE_PERCENTILE,
        "clothing_ratings_available": len(ratings),
        "row_unit": "clip (not recording session)",
        "row_order": "worst-to-best by badness = 2*red_fraction + yellow_fraction, within each dance group",
        "scope": "input signal quality and detection heuristics only -- does not run or "
        "reflect any pose-correction technique (see module docstring).",
    }
    (output_root / "run_provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")

    try:
        if latest_link.is_symlink() or latest_link.exists():
            latest_link.unlink()
        latest_link.symlink_to(output_root.name)
        print(f"Updated {latest_link} -> {output_root.name}")
    except OSError as error:
        print(f"Could not update {latest_link} (non-fatal): {error}")

    print(f"Wrote {image_path}")
    print(f"Wrote {csv_path}")
    print(f"Wrote {output_root / 'run_provenance.json'}")


if __name__ == "__main__":
    main()
