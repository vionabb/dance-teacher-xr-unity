"""Exploratory isolated-jump repair rule ("rule v2"), kept out of preprocessing.

This is the rule under test in the blinded repair adjudication. It was
re-implemented on 2026-11-06 from the 2026-10-06 lab-log specification after
the original script was lost; on the frozen first manual-review release it
does not reproduce the October counts exactly (see the lab log). It is an
experimental proposal generator only. Nothing in the pipeline applies it.

A landmark position at frame ``t`` is flagged when, in image pixels and divided
by the frame's torso length (shoulder midpoint to hip midpoint at ``t``):

- its distance from the midpoint of frames ``t-1`` and ``t+1`` exceeds 0.15,
- the two neighbors are at most 0.3 apart, and
- both neighbors have visibility above 0.8.

Both neighbors must lie inside the reviewed segment and on frames not marked
unusable. The proposed repair replaces the point with that midpoint.
"""

from __future__ import annotations

import math
import typing as t

RESIDUAL_MIN = 0.15
NEIGHBOR_GAP_MAX = 0.3
NEIGHBOR_VISIBILITY_MIN = 0.8
UPPER_BODY_LANDMARKS = (
    "LEFT_SHOULDER",
    "RIGHT_SHOULDER",
    "LEFT_ELBOW",
    "RIGHT_ELBOW",
    "LEFT_WRIST",
    "RIGHT_WRIST",
    "LEFT_HIP",
    "RIGHT_HIP",
)
ARM_LANDMARKS = frozenset(UPPER_BODY_LANDMARKS[:6])
HIP_LANDMARKS = frozenset(UPPER_BODY_LANDMARKS[6:])

Row = t.Mapping[str, float]


def _xy(row: Row | None, landmark: str) -> tuple[float, float] | None:
    if row is None:
        return None
    x, y = row.get(f"{landmark}_x"), row.get(f"{landmark}_y")
    if x is None or y is None or not (math.isfinite(x) and math.isfinite(y)):
        return None
    return float(x), float(y)


def torso_length(row: Row | None) -> float:
    """Return the shoulder-midpoint to hip-midpoint distance, or NaN."""

    points = [_xy(row, name) for name in ("LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP")]
    if any(p is None for p in points):
        return math.nan
    (lsx, lsy), (rsx, rsy), (lhx, lhy), (rhx, rhy) = points  # type: ignore[misc]
    return math.hypot((lsx + rsx) / 2 - (lhx + rhx) / 2, (lsy + rsy) / 2 - (lhy + rhy) / 2)


def evaluate_segment(
    rows: t.Sequence[Row | None],
    unusable_frames: t.Collection[int] = (),
    landmarks: t.Sequence[str] = UPPER_BODY_LANDMARKS,
) -> list[dict[str, t.Any]]:
    """Evaluate the rule on one segment of raw 2D pose rows.

    ``rows[i]`` is the pose row for segment-relative frame ``i`` (``None`` if
    absent). Returns one record per finite landmark position on a usable frame:
    ``frame``, ``landmark``, ``xy``, ``visibility``, ``torso``, and, when the
    rule is computable there, ``residual``, ``neighbor_gap``, ``midpoint``;
    ``flagged`` says whether the rule selects it.
    """

    unusable = set(unusable_frames)
    records = []
    count = len(rows)
    for frame, row in enumerate(rows):
        if frame in unusable:
            continue
        torso = torso_length(row)
        for landmark in landmarks:
            current = _xy(row, landmark)
            if current is None:
                continue
            record: dict[str, t.Any] = {
                "frame": frame,
                "landmark": landmark,
                "xy": list(current),
                "visibility": float(row.get(f"{landmark}_vis", math.nan)),  # type: ignore[union-attr]
                "torso": torso,
                "flagged": False,
            }
            before, after = frame - 1, frame + 1
            if (
                before >= 0
                and after < count
                and before not in unusable
                and after not in unusable
                and math.isfinite(torso)
                and torso > 0
            ):
                previous, following = _xy(rows[before], landmark), _xy(rows[after], landmark)
                if previous is not None and following is not None:
                    midpoint = ((previous[0] + following[0]) / 2, (previous[1] + following[1]) / 2)
                    residual = math.dist(current, midpoint) / torso
                    gap = math.dist(previous, following) / torso
                    visibilities = (
                        rows[before].get(f"{landmark}_vis", math.nan),  # type: ignore[union-attr]
                        rows[after].get(f"{landmark}_vis", math.nan),  # type: ignore[union-attr]
                    )
                    record.update(residual=residual, neighbor_gap=gap, midpoint=list(midpoint))
                    record["flagged"] = (
                        residual > RESIDUAL_MIN
                        and gap <= NEIGHBOR_GAP_MAX
                        and all(v > NEIGHBOR_VISIBILITY_MIN for v in visibilities)
                    )
            records.append(record)
    return records
