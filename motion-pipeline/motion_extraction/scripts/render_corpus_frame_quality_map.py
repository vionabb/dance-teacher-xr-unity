"""Render a per-frame quality map across the participant corpus.

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

Landmarks and thresholds intentionally reuse the 2026-08-30 out-of-frame /
hallucination analysis in the quality-gate handoff doc: scoring is
restricted to the 6 arm/shoulder landmarks (hips excluded -- hip framing
isn't treated as a defect on its own, see that analysis), and the
high-visibility threshold (0.5) matches the one used there.

Rows are grouped by which reference dance the clip is performing (parsed
from the participant filename) and, within each group, ordered worst-to-best
by a weighted badness score, so the worst clips in each group are easiest to
spot. Meant to be re-run whenever the preprocessing methodology changes --
each run is written to its own timestamped output directory so past runs
aren't overwritten and can be compared.

Usage: uv run python -m motion_extraction.scripts.render_corpus_frame_quality_map
       [--output-root temp/experiments/<name>] [--max-clips N]
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import typing as t

import cv2
import numpy as np
import pandas as pd

from dance_teacher_pose import PoseDataType, preprocess_pose_dataframe
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

RESAMPLED_WIDTH = 200
COLUMN_PX = 4
ROW_PX = 3
GROUP_HEADER_PX = 26
LEGEND_PX = 60


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


def _video_dimensions(video_path: Path) -> tuple[float, float] | None:
    capture = cv2.VideoCapture(str(video_path))
    width = capture.get(cv2.CAP_PROP_FRAME_WIDTH)
    height = capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
    capture.release()
    if not width or not height:
        return None
    return width, height


def _oob_severity(raw: pd.DataFrame, width: float, height: float, n_frames: int) -> np.ndarray:
    """Per-frame severity (0/1/2) from out-of-frame arm/shoulder landmarks alone."""

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


def collect_clip_data(data_root: Path, max_clips: int | None) -> list[dict[str, t.Any]]:
    """First pass: load pose + compute the oob severity and raw suspicion score per clip."""

    targets = build_extraction_targets(data_root, ["chi25_study1", "chi25_study2"])
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
        collected.append(
            {
                "corpus": target.video.corpus,
                "relative_stem": target.video.relative_stem,
                "dance": parse_dance(target.video.relative_stem),
                "n_frames": n_frames,
                "oob_severity": oob_severity,
                "suspicion": suspicion,
            }
        )
        if (index + 1) % 200 == 0:
            print(f"...loaded {index + 1} clips", flush=True)
    return collected


def build_rows(collected: list[dict[str, t.Any]]) -> list[ClipRow]:
    """Second pass: apply corpus-wide suspicion-score percentile thresholds."""

    all_suspicion = np.concatenate([item["suspicion"] for item in collected])
    yellow_threshold = float(np.percentile(all_suspicion, SUSPICION_YELLOW_PERCENTILE))
    red_threshold = float(np.percentile(all_suspicion, SUSPICION_RED_PERCENTILE))
    print(
        f"Suspicion-score thresholds (corpus-wide, arm/shoulder-only): "
        f"yellow >= {yellow_threshold:.4f} (p{SUSPICION_YELLOW_PERCENTILE:.0f}), "
        f"red >= {red_threshold:.4f} (p{SUSPICION_RED_PERCENTILE:.0f})"
    )

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

    image_width = RESAMPLED_WIDTH * COLUMN_PX
    body_height = sum(GROUP_HEADER_PX + len(group_rows) * ROW_PX for group_rows in groups.values())
    canvas = np.full((LEGEND_PX + body_height, image_width, 3), 30, dtype=np.uint8)

    cv2.putText(canvas, "Participant corpus frame-quality map", (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, WHITE, 1, cv2.LINE_AA)
    legend_y = 42
    for label, color, x in (("white = clean", WHITE, 10), ("yellow = correctable", YELLOW_BGR, 190), ("red = uncorrectable", RED_BGR, 400)):
        cv2.rectangle(canvas, (x, legend_y - 10), (x + 12, legend_y + 2), color, -1)
        cv2.putText(canvas, label, (x + 18, legend_y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, WHITE, 1, cv2.LINE_AA)

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
            resampled = _resample_row(row.classification, RESAMPLED_WIDTH)
            for column in range(RESAMPLED_WIDTH):
                color = SEVERITY_COLOR[int(resampled[column])]
                canvas[y : y + ROW_PX, column * COLUMN_PX : (column + 1) * COLUMN_PX] = color
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
            }
            for row in rows
        ]
    )
    frame = frame.sort_values(["dance", "badness"], ascending=[True, False])
    frame.to_csv(path, index=False)


def main(argv: t.Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=default_data_root().parent)
    parser.add_argument("--output-root", type=Path, default=None)
    parser.add_argument("--max-clips", type=int, default=None, help="Limit clips processed (debugging).")
    args = parser.parse_args(argv)

    output_root = args.output_root or Path(
        f"temp/experiments/{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-frame-quality-map"
    )
    output_root.mkdir(parents=True, exist_ok=True)

    print("Pass 1/2: loading pose data and computing per-frame signals...")
    collected = collect_clip_data(args.data_root, args.max_clips)
    print(f"Loaded {len(collected)} clips with usable pose data.")

    print("Pass 2/2: applying corpus-wide thresholds and classifying...")
    rows = build_rows(collected)

    image = render_image(rows)
    image_path = output_root / "frame_quality_map.png"
    cv2.imwrite(str(image_path), image)

    csv_path = output_root / "frame_quality_summary.csv"
    write_summary_csv(rows, csv_path)

    provenance = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "clip_count": len(rows),
        "arm_landmarks": ARM_LANDMARKS,
        "vis_high_threshold": VIS_HIGH_THRESHOLD,
        "suspicion_yellow_percentile": SUSPICION_YELLOW_PERCENTILE,
        "suspicion_red_percentile": SUSPICION_RED_PERCENTILE,
        "row_unit": "clip (not recording session)",
        "row_order": "worst-to-best by badness = 2*red_fraction + yellow_fraction, within each dance group",
    }
    (output_root / "run_provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")

    print(f"Wrote {image_path}")
    print(f"Wrote {csv_path}")
    print(f"Wrote {output_root / 'run_provenance.json'}")


if __name__ == "__main__":
    main()
