from __future__ import annotations

import enum
import os
from pathlib import Path
import urllib.request

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

PoseLandmark = vision.PoseLandmark


class HandLandmark(enum.IntEnum):
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


POSE_CONNECTIONS = tuple(
    (connection.start, connection.end)
    for connection in vision.PoseLandmarksConnections.POSE_LANDMARKS
)
HAND_CONNECTIONS = tuple(
    (connection.start, connection.end)
    for connection in vision.HandLandmarksConnections.HAND_CONNECTIONS
)

HOLISTIC_LANDMARKER_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task"
)
POSE_LANDMARKER_HEAVY_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"
)


def ensure_task_model(model_path: Path, download_url: str) -> Path:
    model_path = Path(model_path)
    if model_path.exists():
        return model_path

    model_path.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(download_url, model_path)
    return model_path


def rgb_image_to_mp_image(image_rgb: np.ndarray) -> mp.Image:
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)


def build_base_options(model_path: Path, use_gpu: bool = True) -> BaseOptions:
    delegate = BaseOptions.Delegate.GPU
    if os.name == "nt" or not use_gpu:
        delegate = BaseOptions.Delegate.CPU
    return BaseOptions(model_asset_path=str(model_path), delegate=delegate)


def landmark_list(value):
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


def landmark_at(value, index: int):
    landmarks = landmark_list(value)
    if landmarks is None or len(landmarks) <= index:
        return None
    return landmarks[index]
