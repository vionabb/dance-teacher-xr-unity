"""Select the most suspicious frames in a clip for targeted contact sheets.

Even spacing (build_review_contact_sheets.py's default) missed most of the
brief, transient tracking glitches Viona's manual review caught in the first
quality-triage POC (2026-08-30) -- her free-text notes describe momentary
failures ("loses tracking around the middle", "tracking deteriorates when
right arm crosses body") that a 4-frames-spread-evenly-across-3-seconds
sample mostly missed. This ranks every frame in a clip by a per-frame
suspicion score combining a landmark-jump signal (torso-normalized
frame-to-frame velocity) and a visibility-dip signal (how low, and how much
it just dropped), then returns the top-K frame positions -- concentrated on
the likely defect, not spread across the whole window.
"""

from __future__ import annotations

from pathlib import Path
import typing as t

import numpy as np
import pandas as pd

from dance_teacher_pose import PoseDataType, get_pose_data_schema, preprocess_pose_dataframe
from motion_extraction.scripts.run_preprocessing_experiment import _visible_roots


def per_frame_suspicion(raw: pd.DataFrame, clean: pd.DataFrame) -> pd.DataFrame:
    """Return a per-frame DataFrame of jump/visibility features and a combined score.

    - ``max_velocity``: largest torso-normalized frame-to-frame displacement
      across landmarks at this frame (a jump anywhere is suspicious, not just
      on average).
    - ``min_visibility``: lowest detector-reported visibility across landmarks
      at this frame.
    - ``visibility_drop``: how much the minimum visibility fell versus the
      previous frame (catches the moment tracking is lost, not just frames
      that are already low-visibility throughout, e.g. a mostly-cropped clip).
    """

    fields = get_pose_data_schema(PoseDataType.pose2d).coordinate_fields
    roots = _visible_roots(clean, fields)
    frame_count = len(clean)

    velocity_by_frame = np.zeros((frame_count, len(roots)))
    visibility_by_frame = np.full((frame_count, len(roots)), np.nan)
    for index, root in enumerate(roots):
        values = clean[[f"{root}_{field}" for field in fields]].to_numpy(dtype=float)
        velocity = np.linalg.norm(np.diff(values, axis=0), axis=1)
        velocity_by_frame[1:, index] = np.nan_to_num(velocity, nan=0.0)
        vis_col = f"{root}_vis"
        if vis_col in raw.columns:
            visibility_by_frame[:, index] = raw[vis_col].to_numpy(dtype=float)

    max_velocity = np.nanmax(velocity_by_frame, axis=1)
    min_visibility = np.nanmin(visibility_by_frame, axis=1)
    min_visibility = np.where(np.isnan(min_visibility), 1.0, min_visibility)
    visibility_drop = np.zeros(frame_count)
    visibility_drop[1:] = np.clip(min_visibility[:-1] - min_visibility[1:], 0, None)

    velocity_scale = np.nanpercentile(max_velocity[max_velocity > 0], 90) if (max_velocity > 0).any() else 1.0
    velocity_scale = velocity_scale or 1.0
    score = (max_velocity / velocity_scale) * (1.0 - min_visibility) + visibility_drop

    return pd.DataFrame(
        {
            "frame": clean.index,
            "max_velocity": max_velocity,
            "min_visibility": min_visibility,
            "visibility_drop": visibility_drop,
            "score": score,
        }
    )


def select_suspicious_positions(
    raw: pd.DataFrame, clean: pd.DataFrame, *, count: int, min_separation: int = 5
) -> list[int]:
    """Top-``count`` frame positions by suspicion score, spread apart by at least
    ``min_separation`` frames so they don't all cluster on one glitch.
    """

    scored = per_frame_suspicion(raw, clean).sort_values("score", ascending=False)
    selected: list[int] = []
    for _, row in scored.iterrows():
        position = int(row["frame"])
        if all(abs(position - existing) >= min_separation for existing in selected):
            selected.append(position)
        if len(selected) == count:
            break
    return sorted(selected)


def load_raw_and_clean(pose_path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    raw = pd.read_csv(pose_path, index_col="frame")
    clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=None)
    return raw, clean
