import numpy as np
import pandas as pd

from dance_teacher_pose import PoseDataType, preprocess_pose_dataframe
from motion_extraction.scripts.compute_automatic_quality_signals import (
    crop_signal,
    false_tracking_signal,
    windowed_roughness,
)


def _linear_pose(frame_count: int = 30) -> pd.DataFrame:
    """A smoothly moving, fully-visible torso -- mirrors the helper in
    ``test_preprocessing_experiment.py`` so both suites share one fixture shape.
    """

    fields = ("x", "y", "distance")
    roots = {
        "LEFT_HIP": (-1.0, 0.0, 0.0),
        "RIGHT_HIP": (1.0, 0.0, 0.0),
        "LEFT_SHOULDER": (-1.0, 2.0, 0.0),
        "RIGHT_SHOULDER": (1.0, 2.0, 0.0),
        "LEFT_WRIST": (0.0, 1.0, 0.0),
    }
    data: dict[str, list[float]] = {}
    for root, initial in roots.items():
        for field, value in zip(fields, initial):
            data[f"{root}_{field}"] = [
                value + (0.02 * frame if field == "x" else 0.0) for frame in range(frame_count)
            ]
        data[f"{root}_vis"] = [1.0] * frame_count
    return pd.DataFrame(data, index=pd.Index(range(frame_count), name="frame"))


def test_crop_signal_divides_pixel_space_coordinates_by_frame_dimensions() -> None:
    raw = pd.DataFrame({"LEFT_HIP_x": [10.0], "LEFT_HIP_y": [500.0], "RIGHT_HIP_x": [500.0], "RIGHT_HIP_y": [500.0]})

    result = crop_signal(raw, video_width=1000.0, video_height=1000.0, margin=0.03)

    # LEFT_HIP_x=10 / width=1000 = 0.01 < margin=0.03 -> violation.
    assert result["crop_violation_fraction"] == 1.0


def test_crop_signal_tracks_longest_contiguous_violation_run() -> None:
    raw = pd.DataFrame(
        {
            "LEFT_HIP_x": [500.0, 10.0, 10.0, 500.0],
            "LEFT_HIP_y": [500.0, 500.0, 500.0, 500.0],
            "RIGHT_HIP_x": [500.0, 500.0, 500.0, 500.0],
            "RIGHT_HIP_y": [500.0, 500.0, 500.0, 500.0],
        }
    )

    result = crop_signal(raw, video_width=1000.0, video_height=1000.0, margin=0.03)

    assert result["crop_violation_fraction"] == 0.5
    assert result["crop_longest_run_frames"] == 2


def test_crop_signal_without_dimensions_reports_nan() -> None:
    raw = pd.DataFrame({"LEFT_HIP_x": [10.0], "LEFT_HIP_y": [500.0], "RIGHT_HIP_x": [500.0], "RIGHT_HIP_y": [500.0]})

    result = crop_signal(raw, video_width=None, video_height=None, margin=0.03)

    assert np.isnan(result["crop_violation_fraction"])
    assert result["crop_longest_run_frames"] == 0


def test_windowed_roughness_localizes_a_sharp_jump_to_its_window() -> None:
    raw = _linear_pose(40)
    # Inject one large positional jump midway through, isolated by smooth frames on both sides.
    raw.loc[20, "LEFT_WRIST_x"] += 5.0
    clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=None)

    result = windowed_roughness(clean, window_frames=6)

    assert result["windowed_roughness_worst_window_start"] != -1
    worst_start = result["windowed_roughness_worst_window_start"]
    assert worst_start <= 20 <= worst_start + 6
    assert result["windowed_roughness_p95_max"] > 0


def test_false_tracking_signal_requires_both_high_velocity_and_low_visibility() -> None:
    raw = _linear_pose(10)
    clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=None)
    # A fast, but confidently-tracked, jump should not count as false tracking.
    confident_jump = raw.copy()
    confident_jump.loc[5, "LEFT_WRIST_x"] += 5.0
    confident_clean = preprocess_pose_dataframe(confident_jump, PoseDataType.pose2d, config=None)
    confident_result = false_tracking_signal(
        confident_jump, confident_clean, velocity_threshold=0.5, visibility_threshold=0.5
    )
    assert confident_result["false_tracking_candidate_fraction"] == 0.0

    # The same jump with low visibility at that frame should count.
    low_visibility_jump = confident_jump.copy()
    low_visibility_jump.loc[5, "LEFT_WRIST_vis"] = 0.1
    low_visibility_clean = preprocess_pose_dataframe(low_visibility_jump, PoseDataType.pose2d, config=None)
    flagged_result = false_tracking_signal(
        low_visibility_jump, low_visibility_clean, velocity_threshold=0.5, visibility_threshold=0.5
    )
    assert flagged_result["false_tracking_candidate_fraction"] > 0.0
