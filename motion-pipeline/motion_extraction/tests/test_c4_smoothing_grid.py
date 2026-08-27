from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from dance_teacher_pose import PoseDataType
from motion_extraction.scripts.run_c4_smoothing_grid import (
    _annotation_case_scores,
    _band_energy,
    _bootstrap_mean_interval,
    _candidate_config,
    _finite_runs,
    _motion_metrics,
    _score_annotation_task,
)


def _clean_sequence(values: np.ndarray) -> pd.DataFrame:
    frame_count = len(values)
    return pd.DataFrame(
        {
            "LEFT_WRIST_x": values,
            "LEFT_WRIST_y": np.zeros(frame_count),
            "LEFT_WRIST_distance": np.zeros(frame_count),
            "LEFT_WRIST_vis": np.ones(frame_count),
            "base_x": np.arange(frame_count, dtype=float) ** 3,
            "base_y": np.arange(frame_count, dtype=float) ** 3,
            "base_distance": np.arange(frame_count, dtype=float) ** 3,
            "base_vis": np.ones(frame_count),
            "preprocess_root_x": np.arange(frame_count, dtype=float) ** 3,
            "preprocess_root_y": np.arange(frame_count, dtype=float) ** 3,
            "preprocess_is_usable": np.ones(frame_count),
        }
    )


def test_motion_metrics_exclude_generated_columns_and_use_matched_segments() -> None:
    values = np.arange(16, dtype=float)
    baseline = _clean_sequence(values)
    candidate = baseline.copy()
    baseline.loc[7, "LEFT_WRIST_x"] = np.nan
    candidate.loc[7, "LEFT_WRIST_x"] = np.nan

    metrics = _motion_metrics(baseline, candidate, PoseDataType.pose2d)

    assert metrics["visible_landmark_count"] == 1
    assert metrics["corrected_normalized_acceleration_p95"] == pytest.approx(0.0)
    assert metrics["displacement_vs_c4_p95"] == pytest.approx(0.0)
    assert metrics["matched_segment_count"] == 13
    assert metrics["path_length_retention_vs_c4"] == pytest.approx(1.0)
    assert metrics["peak_speed_retention_vs_c4"] == pytest.approx(1.0)
    assert metrics["high_frequency_energy_reduction_vs_c4"] == pytest.approx(0.0)


def test_high_frequency_energy_and_weaker_smoothing_tradeoff() -> None:
    values = np.tile(np.array([-1.0, 1.0]), 16)
    baseline = _clean_sequence(values)

    def smooth(weight: float) -> pd.DataFrame:
        candidate = baseline.copy()
        candidate.loc[1 : len(values) - 2, "LEFT_WRIST_x"] = (
            weight * values[:-2]
            + (1 - 2 * weight) * values[1:-1]
            + weight * values[2:]
        )
        return candidate

    weak = _motion_metrics(baseline, smooth(0.05), PoseDataType.pose2d)
    strong = _motion_metrics(baseline, smooth(0.25), PoseDataType.pose2d)

    assert _band_energy(values, 0.25, 0.5) > 0
    assert weak["high_frequency_energy_reduction_vs_c4"] > 0
    assert (
        strong["high_frequency_energy_reduction_vs_c4"]
        > weak["high_frequency_energy_reduction_vs_c4"]
    )
    assert strong["displacement_vs_c4_p95"] > weak["displacement_vs_c4_p95"]


def test_finite_runs_never_bridge_missing_boundaries() -> None:
    mask = np.array([True] * 8 + [False] + [True] * 7 + [False] + [True] * 9)

    runs = _finite_runs(mask, minimum_length=8)

    assert [(run.start, run.stop) for run in runs] == [(0, 8), (17, 26)]


def test_annotation_scoring_excludes_fully_occluded_and_applies_tolerance() -> None:
    task = {"source_dimensions": {"width": 100, "height": 100}}
    ground_truth = {
        "LEFT_HIP": {"x": 0.0, "y": 0.0, "occlusion": "non_occluded"},
        "RIGHT_HIP": {"x": 2.0, "y": 0.0, "occlusion": "non_occluded"},
        "LEFT_SHOULDER": {"x": 0.0, "y": 10.0, "occlusion": "non_occluded"},
        "RIGHT_SHOULDER": {"x": 2.0, "y": 10.0, "occlusion": "non_occluded"},
        "LEFT_WRIST": {"x": 5.0, "y": 5.0, "occlusion": "semi_occluded"},
        "RIGHT_WRIST": {"x": 8.0, "y": 5.0, "occlusion": "fully_occluded"},
    }
    predicted = {
        name: (item["x"], item["y"])
        for name, item in ground_truth.items()
        if name != "RIGHT_WRIST"
    }
    predicted["LEFT_WRIST"] = (5.5, 5.0)

    scores = _score_annotation_task(task, ground_truth, predicted, 0.05)

    assert "RIGHT_WRIST" not in {row["landmark"] for row in scores}
    wrist = next(row for row in scores if row["landmark"] == "LEFT_WRIST")
    assert wrist["position_weight"] == 0.5
    assert wrist["error_torso"] == pytest.approx(0.05)
    assert wrist["excess_error_torso"] == pytest.approx(0.0)
    assert wrist["within_active_tolerance"] == 1


def test_case_aggregation_and_bootstrap_treat_tasks_as_clustered() -> None:
    tasks = pd.DataFrame(
        {
            "neighbor_weight": [0.1, 0.1, 0.1],
            "annotator": ["a", "a", "a"],
            "case_key": ["case-1", "case-1", "case-2"],
            "source_evidence_quality": ["unclassified"] * 3,
            "task_id": ["t1", "t2", "t3"],
            "eligible_position_landmark_count": [4, 4, 4],
            "matched_landmark_count": [4, 4, 4],
            "mean_error_torso": [0.0, 1.0, 1.0],
            "mean_excess_error_torso": [0.0, 0.8, 0.8],
            "within_tolerance_rate": [1.0, 0.0, 0.0],
        }
    )

    cases = _annotation_case_scores(tasks)
    first = cases[cases["case_key"] == "case-1"].iloc[0]
    assert first["task_count"] == 2
    assert first["mean_error_torso"] == pytest.approx(0.5)
    assert _bootstrap_mean_interval([0.5, 1.0], samples=200, seed=7) == (
        _bootstrap_mean_interval([0.5, 1.0], samples=200, seed=7)
    )


def test_candidate_config_is_c4_plus_only_requested_smoothing() -> None:
    zero = _candidate_config(0.0)
    weak = _candidate_config(0.1)

    assert zero.smoothing == "none"
    assert weak.smoothing == "triangular3"
    assert weak.triangular3_neighbor_weight == pytest.approx(0.1)
    assert weak.min_visibility == zero.min_visibility == 0.0
    assert weak.max_gap_frames == zero.max_gap_frames == 2
    assert np.isinf(weak.isolated_outlier_threshold)
