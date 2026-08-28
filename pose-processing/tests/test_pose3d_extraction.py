from dataclasses import dataclass

from dance_teacher_pose.extraction import (
    PoseLandmark,
    construct_pose2d_header_row,
    construct_pose3d_header_row,
    transform_to_pose3d_csvrow,
)


@dataclass(frozen=True)
class _FakeLandmark:
    x: float
    y: float
    z: float
    visibility: float


@dataclass(frozen=True)
class _FakePoseLandmarkerResult:
    """Mimics the fields of mediapipe.tasks.python.vision.PoseLandmarkerResult
    that transform_to_pose3d_csvrow reads, without depending on a real model.
    """

    pose_world_landmarks: list[list[_FakeLandmark]]


def _detected_result() -> _FakePoseLandmarkerResult:
    landmarks = [_FakeLandmark(x=index * 0.01, y=index * 0.02, z=index * 0.03, visibility=0.9) for index in range(len(PoseLandmark))]
    return _FakePoseLandmarkerResult(pose_world_landmarks=[landmarks])


def test_pose3d_header_matches_pose2d_landmark_ordering_with_z_not_distance() -> None:
    pose3d_header = construct_pose3d_header_row()
    pose2d_header = construct_pose2d_header_row()

    assert pose3d_header[0] == "frame"
    assert len(pose3d_header) == len(pose2d_header)
    assert pose3d_header[1:5] == ["NOSE_x", "NOSE_y", "NOSE_z", "NOSE_vis"]


def test_transform_to_pose3d_csvrow_uses_world_landmarks() -> None:
    row = transform_to_pose3d_csvrow(7, _detected_result())

    assert row[0] == 7
    left_hip_index = list(PoseLandmark).index(PoseLandmark.LEFT_HIP)
    offset = 1 + left_hip_index * 4
    assert row[offset : offset + 4] == [
        left_hip_index * 0.01,
        left_hip_index * 0.02,
        left_hip_index * 0.03,
        0.9,
    ]


def test_transform_to_pose3d_csvrow_on_empty_detection_is_all_none() -> None:
    empty_result = _FakePoseLandmarkerResult(pose_world_landmarks=[])

    row = transform_to_pose3d_csvrow(3, empty_result)

    assert row[0] == 3
    assert all(value is None for value in row[1:])


def test_transform_to_pose3d_csvrow_as_pd_series_uses_header_index() -> None:
    series = transform_to_pose3d_csvrow(0, _detected_result(), as_pd_series=True)

    assert list(series.index) == construct_pose3d_header_row()
