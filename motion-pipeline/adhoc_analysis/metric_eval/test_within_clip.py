"""Run: uv run pytest adhoc_analysis/metric_eval/test_within_clip.py"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from within_clip import clip_pairs, evaluate


def frame():
    rng = np.random.default_rng(0)
    rows = []
    for clip, offset in [("a", 0.0), ("b", -2.0), ("c", 1.0)]:
        human = rng.permutation(np.repeat([1, 2, 3, 4, 5], 4)).astype(float)
        for i, h in enumerate(human):
            rows.append(
                {
                    "participant": f"p{i}",
                    "clip": clip,
                    "human": h,
                    "offset": h + offset,
                    "reversed": -h,
                    "flat": 1.0,
                }
            )
    return pd.DataFrame(rows)


def test_clip_offsets_do_not_count_against_a_metric():
    res = evaluate(frame(), ["offset"])["offset"]
    assert res["within_rho"] == 1.0
    assert res["pairwise"] == 1.0
    assert res["pooled_rho"] < 0.9


def test_reversed_and_flat_metrics():
    res = evaluate(frame(), ["reversed", "flat"])
    assert res["reversed"]["pairwise"] == 0.0
    assert res["flat"]["pairwise"] == 0.5


def test_rater_ties_are_skipped_and_metric_ties_count_half():
    credit, pairs = clip_pairs(np.array([1.0, 1.0, 2.0]), np.array([5.0, 5.0, 3.0]))
    assert pairs == 2  # the tied human pair is skipped
    assert credit == 0.0  # metric orders both informative pairs the wrong way
    credit, pairs = clip_pairs(np.array([1.0, 1.0]), np.array([1.0, 2.0]))
    assert (credit, pairs) == (0.5, 1)
