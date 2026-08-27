from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from dance_teacher_pose import (
    PoseDataType,
    PosePreprocessingConfig,
    preprocess_pose_data,
    preprocess_pose_dataframe,
)


def _sequence(
    frame_count: int = 20,
    pose_data_type: PoseDataType = PoseDataType.pose2d,
) -> pd.DataFrame:
    fields = ("x", "y", "distance") if pose_data_type is PoseDataType.pose2d else ("x", "y", "z")
    rows: dict[str, list[float]] = {}
    roots = {
        "LEFT_HIP": (-1.0, 0.0, 0.0),
        "RIGHT_HIP": (1.0, 0.0, 0.0),
        "LEFT_SHOULDER": (-1.0, 2.0, 0.0),
        "RIGHT_SHOULDER": (1.0, 2.0, 0.0),
        "LEFT_WRIST": (0.0, 1.0, 0.0),
    }
    for root, initial in roots.items():
        for field, value in zip(fields, initial):
            rows[f"{root}_{field}"] = [value + (0.2 * frame if field == "x" else 0.0) for frame in range(frame_count)]
        rows[f"{root}_vis"] = [1.0] * frame_count
    # A hand-like root has coordinates but no visibility and must not receive cleanup.
    for field, value in zip(fields, (0.5, 0.5, 0.0)):
        rows[f"LEFT_HAND_{field}"] = [value] * frame_count
    rows["timestamp"] = [frame / 30 for frame in range(frame_count)]
    return pd.DataFrame(rows, index=pd.Index(range(frame_count), name="frame"))


def _config(**overrides: object) -> PosePreprocessingConfig:
    values: dict[str, object] = {
        "min_visibility": 0.2,
        "max_gap_frames": 3,
        "isolated_outlier_threshold": 0.75,
        "isolated_outlier_ratio": 3.0,
        "smoothing": "none",
    }
    values.update(overrides)
    return PosePreprocessingConfig(**values)  # type: ignore[arg-type]


def test_none_config_preserves_historical_columns_and_values() -> None:
    raw = _sequence(3)
    clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=None)

    assert list(clean.columns[: len(raw.columns)]) == list(raw.columns)
    assert not any(column.startswith("preprocess_has_") for column in clean.columns)
    assert clean.loc[1, "LEFT_WRIST_x"] == pytest.approx(0.0)
    assert clean.loc[1, "LEFT_WRIST_y"] == pytest.approx(0.5)
    assert clean.loc[1, "timestamp"] == raw.loc[1, "timestamp"]


@pytest.mark.parametrize("pose_data_type", [PoseDataType.pose2d, PoseDataType.holistic_3d])
def test_short_internal_gap_is_filled_for_both_modalities(pose_data_type: PoseDataType) -> None:
    raw = _sequence(9, pose_data_type)
    fields = ("x", "y", "distance") if pose_data_type is PoseDataType.pose2d else ("x", "y", "z")
    raw.loc[3:5, [f"LEFT_WRIST_{field}" for field in fields]] = np.nan

    clean = preprocess_pose_dataframe(raw, pose_data_type, _config())

    assert clean.loc[3:5, f"LEFT_WRIST_{fields[0]}"].notna().all()
    assert clean["preprocess_interpolated_landmark_count"].sum() == 3


@pytest.mark.parametrize("gap", [(0, 2), (3, 6), (4, 18)])
def test_edges_four_frame_and_fifteen_frame_gaps_are_not_filled(gap: tuple[int, int]) -> None:
    raw = _sequence(20)
    start, end = gap
    columns = [f"LEFT_WRIST_{field}" for field in ("x", "y", "distance")]
    raw.loc[start:end, columns] = np.nan

    clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, _config())

    assert clean.loc[start:end, columns].isna().all().all()
    assert clean["preprocess_interpolated_landmark_count"].sum() == 0


def test_low_visibility_masks_coordinates_but_preserves_visibility() -> None:
    raw = _sequence(5)
    raw.loc[2, "LEFT_WRIST_vis"] = 0.1

    clean = preprocess_pose_dataframe(
        raw, PoseDataType.pose2d, _config(max_gap_frames=0)
    )

    assert clean.loc[2, ["LEFT_WRIST_x", "LEFT_WRIST_y", "LEFT_WRIST_distance"]].isna().all()
    assert clean.loc[2, "LEFT_WRIST_vis"] == 0.1
    assert clean.loc[2, "preprocess_visibility_masked_landmark_count"] == 1
    assert clean.loc[2, "preprocess_has_visibility_masked"] == 1


def test_isolated_spike_is_replaced_but_fast_linear_motion_is_preserved() -> None:
    raw = _sequence(7)
    raw.loc[3, "LEFT_WRIST_x"] += 10.0
    cleaned_spike = preprocess_pose_dataframe(raw, PoseDataType.pose2d, _config())
    assert cleaned_spike.loc[3, "LEFT_WRIST_x"] == pytest.approx(0.0)
    assert cleaned_spike["preprocess_outlier_replaced_landmark_count"].sum() == 1

    fast = _sequence(7)
    fast["LEFT_WRIST_x"] = np.arange(7, dtype=float) * 4.0
    cleaned_fast = preprocess_pose_dataframe(fast, PoseDataType.pose2d, _config())
    expected = preprocess_pose_dataframe(fast, PoseDataType.pose2d)
    pd.testing.assert_series_equal(cleaned_fast["LEFT_WRIST_x"], expected["LEFT_WRIST_x"])
    assert cleaned_fast["preprocess_outlier_replaced_landmark_count"].sum() == 0


def test_smoothing_preserves_linear_motion_and_does_not_cross_gap() -> None:
    raw = _sequence(7)
    raw.loc[3, ["LEFT_WRIST_x", "LEFT_WRIST_y", "LEFT_WRIST_distance"]] = np.nan
    config = _config(max_gap_frames=0, smoothing="triangular3")
    clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config)
    baseline = preprocess_pose_dataframe(raw, PoseDataType.pose2d)

    assert clean.loc[3, "LEFT_WRIST_x"] is np.nan or np.isnan(clean.loc[3, "LEFT_WRIST_x"])
    pd.testing.assert_series_equal(clean["LEFT_WRIST_x"], baseline["LEFT_WRIST_x"])
    # Other body landmarks are still smoothed, but the wrist is excluded for
    # the missing frame and both adjacent frames.
    assert clean.loc[2:4, "preprocess_smoothed_landmark_count"].eq(4).all()
    assert clean.loc[1, "preprocess_smoothed_landmark_count"] == 5


def test_triangular3_default_matches_explicit_historical_weight() -> None:
    raw = _sequence(7)
    raw.loc[3, "LEFT_WRIST_x"] += 4.0
    settings = {
        "max_gap_frames": 0,
        "isolated_outlier_threshold": float("inf"),
        "smoothing": "triangular3",
    }

    historical_default = preprocess_pose_dataframe(
        raw, PoseDataType.pose2d, _config(**settings)
    )
    explicit_quarter = preprocess_pose_dataframe(
        raw,
        PoseDataType.pose2d,
        _config(**settings, triangular3_neighbor_weight=0.25),
    )

    pd.testing.assert_frame_equal(historical_default, explicit_quarter)


def test_weaker_triangular3_weight_changes_impulse_less_and_zero_is_none() -> None:
    raw = _sequence(7)
    raw.loc[3, "LEFT_WRIST_x"] += 4.0
    settings = {
        "max_gap_frames": 0,
        "isolated_outlier_threshold": float("inf"),
    }
    unsmoothed = preprocess_pose_dataframe(
        raw, PoseDataType.pose2d, _config(**settings, smoothing="none")
    )
    zero = preprocess_pose_dataframe(
        raw,
        PoseDataType.pose2d,
        _config(**settings, smoothing="triangular3", triangular3_neighbor_weight=0.0),
    )
    weaker = preprocess_pose_dataframe(
        raw,
        PoseDataType.pose2d,
        _config(**settings, smoothing="triangular3", triangular3_neighbor_weight=0.10),
    )
    quarter = preprocess_pose_dataframe(
        raw,
        PoseDataType.pose2d,
        _config(**settings, smoothing="triangular3", triangular3_neighbor_weight=0.25),
    )

    pd.testing.assert_frame_equal(zero, unsmoothed)
    original = unsmoothed.loc[3, "LEFT_WRIST_x"]
    assert abs(weaker.loc[3, "LEFT_WRIST_x"] - original) < abs(
        quarter.loc[3, "LEFT_WRIST_x"] - original
    )
    assert weaker.loc[2, "LEFT_WRIST_x"] == pytest.approx(
        0.1 * unsmoothed.loc[1, "LEFT_WRIST_x"]
        + 0.8 * unsmoothed.loc[2, "LEFT_WRIST_x"]
        + 0.1 * unsmoothed.loc[3, "LEFT_WRIST_x"]
    )


def test_hands_without_visibility_are_not_cleaned_and_metadata_are_integers() -> None:
    raw = _sequence(5)
    raw.loc[2, "LEFT_HAND_x"] = 100.0
    clean = preprocess_pose_dataframe(
        raw, PoseDataType.pose2d, _config(smoothing="triangular3")
    )
    baseline = preprocess_pose_dataframe(raw, PoseDataType.pose2d)

    pd.testing.assert_series_equal(clean["LEFT_HAND_x"], baseline["LEFT_HAND_x"])
    audit_columns = [
        column for column in clean.columns
        if column.startswith("preprocess_has_") or column.endswith("_landmark_count")
    ]
    assert audit_columns
    assert all(pd.api.types.is_integer_dtype(clean[column]) for column in audit_columns)


def test_config_is_frozen_and_validated() -> None:
    config = PosePreprocessingConfig()
    with pytest.raises(Exception):
        config.max_gap_frames = 5  # type: ignore[misc]
    with pytest.raises(ValueError):
        PosePreprocessingConfig(smoothing="wide")  # type: ignore[arg-type]
    for invalid_weight in (-0.01, 0.51, float("nan"), float("inf"), True, "0.1"):
        with pytest.raises(ValueError):
            PosePreprocessingConfig(
                triangular3_neighbor_weight=invalid_weight  # type: ignore[arg-type]
            )


def test_tree_api_preserves_suffix_and_aggregates_audit_counts(tmp_path) -> None:
    raw_root = tmp_path / "raw"
    output_root = tmp_path / "clean"
    raw_path = raw_root / "nested" / "clip.pose2d.raw.csv"
    raw_path.parent.mkdir(parents=True)
    raw = _sequence(5)
    raw.loc[2, "LEFT_WRIST_vis"] = 0.1
    raw.to_csv(raw_path, index_label="frame")

    summary = preprocess_pose_data(
        raw_root,
        PoseDataType.pose2d,
        output_root=output_root,
        config=_config(max_gap_frames=0),
    )

    clean_path = output_root / "nested" / "clip.pose2d.clean.csv"
    assert clean_path.exists()
    assert summary.loc[0, "file"] == "nested/clip"
    assert summary.loc[0, "preprocess_visibility_masked_landmark_count"] == 1
