"""MediaPipe extraction into the canonical raw pose CSVs.

Two independent extraction paths exist:

- ``extract_holistic_video`` (legacy Solutions API, CPU-only): the original
  path, producing canonical holistic (pose-world + hand landmarks) and pose2d
  CSVs from one shared ``mediapipe.python.solutions.holistic.Holistic`` call.
  Kept as-is; still the only source of hand/face data.
- ``extract_pose_landmarker_video`` (Tasks API standalone Pose Landmarker,
  GPU-capable): pose-only, no hands/face. The combined Holistic Landmarker
  Task has a long-standing upstream crash on any frame with no confident
  detection (mediapipe#5181); the standalone Pose Landmarker does not share
  that bug and supports a GPU delegate on macOS. Produces canonical pose2d
  (image-space) and pose3d (world-space) CSVs from one shared landmarker
  instance the caller creates and passes in, since GPU model load/context
  setup is expensive to repeat per clip.
"""

from __future__ import annotations

import csv
import enum
from pathlib import Path
import typing as t

import cv2
import mediapipe as mp
import numpy as np
import pandas as pd
from mediapipe.python.solutions import holistic as mp_holistic

PoseLandmark = mp.solutions.pose.PoseLandmark


class HandLandmark(enum.IntEnum):
    """Index-compatible hand landmark constants used by the CSV schema."""

    WRIST = 0
    THUMB_CMC = 1
    THUMB_MCP = 2
    THUMB_IP = 3
    THUMB_TIP = 4
    INDEX_FINGER_MCP = 5
    INDEX_FINGER_PIP = 6
    INDEX_FINGER_DIP = 7
    INDEX_FINGER_TIP = 8
    MIDDLE_FINGER_MCP = 9
    MIDDLE_FINGER_PIP = 10
    MIDDLE_FINGER_DIP = 11
    MIDDLE_FINGER_TIP = 12
    RING_FINGER_MCP = 13
    RING_FINGER_PIP = 14
    RING_FINGER_DIP = 15
    RING_FINGER_TIP = 16
    PINKY_MCP = 17
    PINKY_PIP = 18
    PINKY_DIP = 19
    PINKY_TIP = 20


def _landmark_list(value: t.Any) -> t.Any:
    if value is None:
        return None
    if hasattr(value, "landmark"):
        return value.landmark
    if (
        hasattr(value, "__len__")
        and len(value) > 0
        and not hasattr(value[0], "x")
        and hasattr(value[0], "__len__")
    ):
        return value[0]
    return value


def _landmark_at(value: t.Any, index: int) -> t.Any:
    landmarks = _landmark_list(value)
    if landmarks is None or len(landmarks) <= index:
        return None
    return landmarks[index]


def _hand_indices() -> range:
    return range(21)


def construct_header_row() -> list[str]:
    """Return the canonical holistic CSV header."""

    return ["frame"] + [
        f"{PoseLandmark(index).name}_{field}"
        for index in range(len(PoseLandmark))
        for field in ("x", "y", "z", "vis")
    ] + [
        f"LEFTHAND_{HandLandmark(index).name}_{field}"
        for index in _hand_indices()
        for field in ("x", "y", "z")
    ] + [
        f"RIGHTHAND_{HandLandmark(index).name}_{field}"
        for index in _hand_indices()
        for field in ("x", "y", "z")
    ]


def construct_pose2d_header_row() -> list[str]:
    """Return the canonical 2D pose CSV header."""

    return ["frame"] + [
        f"{PoseLandmark(index).name}_{field}"
        for index in range(len(PoseLandmark))
        for field in ("x", "y", "distance", "vis")
    ]


def transform_to_pose2d_csvrow(
    frame_i: int,
    frame_data: t.Any,
    video_width: float,
    video_height: float,
    *,
    as_pd_series: bool = False,
    in_pixel_coords: bool = True,
) -> list[t.Any] | pd.Series:
    """Serialize one MediaPipe result into the canonical 2D row."""

    x_mult = video_width if in_pixel_coords else 1
    y_mult = video_height if in_pixel_coords else 1
    row: list[t.Any] = [frame_i]
    for index in range(len(PoseLandmark)):
        landmark = _landmark_at(getattr(frame_data, "pose_landmarks", None), index)
        row.extend(
            [landmark.x * x_mult, landmark.y * y_mult, landmark.z * x_mult, landmark.visibility]
            if landmark is not None
            else [None, None, None, None]
        )
    if as_pd_series:
        return pd.Series(row, index=construct_pose2d_header_row())
    return row


def transform_to_holistic_csvrow(
    frame_i: int, frame_data: t.Any, *, as_pd_series: bool = False
) -> list[t.Any] | pd.Series:
    """Serialize one MediaPipe result into the canonical holistic row."""

    row: list[t.Any] = [frame_i]
    for index in range(len(PoseLandmark)):
        landmark = _landmark_at(getattr(frame_data, "pose_world_landmarks", None), index)
        row.extend(
            [landmark.x, -landmark.y, -landmark.z, landmark.visibility]
            if landmark is not None
            else [None, None, None, None]
        )
    for side in ("right_hand_landmarks", "left_hand_landmarks"):
        for index in _hand_indices():
            landmark = _landmark_at(getattr(frame_data, side, None), index)
            row.extend(
                [landmark.x, landmark.y, landmark.z]
                if landmark is not None
                else [None, None, None]
            )
    if as_pd_series:
        return pd.Series(row, index=construct_header_row())
    return row


def _perform_by_frame(video_path: Path) -> t.Iterator[tuple[int, float, int, np.ndarray]]:
    cap = cv2.VideoCapture(str(video_path))
    try:
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        for frame_i in range(int(frame_count)):
            success, image = cap.read()
            if not success:
                break
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            yield frame_i, frame_count, int(frame_i * 1000 / fps), image_rgb
    finally:
        cap.release()


def extract_holistic_video(
    input_video_path: Path,
    holistic_output_path: Path,
    pose2d_output_path: Path | None = None,
    *,
    model_complexity: int = 2,
    frame_callback: t.Callable[[int, float, np.ndarray, t.Any, pd.Series], None] | None = None,
) -> None:
    """Extract one video into canonical raw holistic and optional 2D CSVs."""

    cap = cv2.VideoCapture(str(input_video_path))
    video_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    video_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    cap.release()

    holistic_output_path.parent.mkdir(parents=True, exist_ok=True)
    pose2d_file = None
    pose2d_writer = None
    if pose2d_output_path is not None:
        pose2d_output_path.parent.mkdir(parents=True, exist_ok=True)
        pose2d_file = pose2d_output_path.open("w", encoding="utf-8", newline="")
        pose2d_writer = csv.writer(pose2d_file)

    try:
        with (
            holistic_output_path.open("w", encoding="utf-8", newline="") as holistic_file,
            mp_holistic.Holistic(
                static_image_mode=True,
                model_complexity=model_complexity,
                refine_face_landmarks=False,
                enable_segmentation=False,
            ) as holistic_processor,
        ):
            holistic_writer = csv.writer(holistic_file)
            for frame_i, frame_count, _timestamp_ms, image_rgb in _perform_by_frame(input_video_path):
                frame_data = holistic_processor.process(image_rgb)
                holistic_row = transform_to_holistic_csvrow(frame_i, frame_data)
                holistic_series = pd.Series(holistic_row, index=construct_header_row())
                if frame_i == 0:
                    holistic_writer.writerow(construct_header_row())
                    if pose2d_writer is not None:
                        pose2d_writer.writerow(construct_pose2d_header_row())
                holistic_writer.writerow(holistic_row)
                if pose2d_writer is not None:
                    pose2d_writer.writerow(
                        transform_to_pose2d_csvrow(
                            frame_i, frame_data, video_width, video_height
                        )
                    )
                if frame_callback is not None:
                    frame_callback(frame_i, frame_count, image_rgb, frame_data, holistic_series)
    finally:
        if pose2d_file is not None:
            pose2d_file.close()


def construct_pose3d_header_row() -> list[str]:
    """Return the canonical 3D world-space pose CSV header."""

    return ["frame"] + [
        f"{PoseLandmark(index).name}_{field}"
        for index in range(len(PoseLandmark))
        for field in ("x", "y", "z", "vis")
    ]


def transform_to_pose3d_csvrow(
    frame_i: int, frame_data: t.Any, *, as_pd_series: bool = False
) -> list[t.Any] | pd.Series:
    """Serialize one Pose Landmarker result into the canonical 3D world-space row.

    ``frame_data`` is a ``mediapipe.tasks.python.vision.PoseLandmarkerResult``
    (or any object exposing an equivalent ``pose_world_landmarks`` attribute):
    a list with at most one entry (this extractor only asks for a single
    person), itself a list of 33 landmarks with ``x``/``y``/``z`` in meters,
    hip-midpoint-relative, and a ``visibility`` score. An empty list (no
    confident detection this frame) yields an all-``None`` row, the same
    convention ``transform_to_holistic_csvrow``/``transform_to_pose2d_csvrow``
    already use.
    """

    world_landmarks = frame_data.pose_world_landmarks[0] if frame_data.pose_world_landmarks else None
    row: list[t.Any] = [frame_i]
    for index in range(len(PoseLandmark)):
        landmark = world_landmarks[index] if world_landmarks is not None else None
        row.extend(
            [landmark.x, landmark.y, landmark.z, landmark.visibility]
            if landmark is not None
            else [None, None, None, None]
        )
    if as_pd_series:
        return pd.Series(row, index=construct_pose3d_header_row())
    return row


def extract_pose_landmarker_video(
    input_video_path: Path,
    pose2d_output_path: Path,
    pose3d_output_path: Path,
    *,
    landmarker: t.Any,
) -> None:
    """Extract one video into canonical pose2d and pose3d CSVs via a shared,
    caller-owned ``mediapipe.tasks.python.vision.PoseLandmarker`` instance
    (typically GPU-delegated). Pose-only: no hand or face data, unlike
    ``extract_holistic_video``. The landmarker is reused across an entire
    corpus sweep rather than re-created per clip, since GPU model load and
    Metal context setup is comparatively expensive.
    """

    cap = cv2.VideoCapture(str(input_video_path))
    video_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    video_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    cap.release()

    pose2d_output_path.parent.mkdir(parents=True, exist_ok=True)
    pose3d_output_path.parent.mkdir(parents=True, exist_ok=True)

    with (
        pose2d_output_path.open("w", encoding="utf-8", newline="") as pose2d_file,
        pose3d_output_path.open("w", encoding="utf-8", newline="") as pose3d_file,
    ):
        pose2d_writer = csv.writer(pose2d_file)
        pose3d_writer = csv.writer(pose3d_file)
        pose2d_writer.writerow(construct_pose2d_header_row())
        pose3d_writer.writerow(construct_pose3d_header_row())
        for frame_i, _frame_count, _timestamp_ms, image_rgb in _perform_by_frame(input_video_path):
            image_rgba = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2RGBA)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGBA, data=image_rgba)
            frame_data = landmarker.detect(mp_image)
            pose2d_writer.writerow(
                transform_to_pose2d_csvrow(frame_i, frame_data, video_width, video_height)
            )
            pose3d_writer.writerow(transform_to_pose3d_csvrow(frame_i, frame_data))
