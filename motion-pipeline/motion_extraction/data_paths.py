"""Workspace-level paths for durable motion-pipeline data."""

from __future__ import annotations

from pathlib import Path


CODEWORKSPACE_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = CODEWORKSPACE_ROOT / "data"

REFERENCE_ROOT = DATA_ROOT / "reference_motions"
REFERENCE_VIDEO_ROOT = REFERENCE_ROOT / "videos"
REFERENCE_RAW_POSE_ROOT = REFERENCE_ROOT / "pose-raw"
REFERENCE_PROCESSED_ROOT = REFERENCE_ROOT / "pose-processed"
REFERENCE_AUDIO_ROOT = REFERENCE_ROOT / "audio-analysis"
REFERENCE_DB_PATH = REFERENCE_ROOT / "db.csv"

PARTICIPANT_ROOT = DATA_ROOT / "participant_motions"


def reference_raw_pose_root(modality: str) -> Path:
    """Return the durable reference raw-pose directory for a modality."""

    if modality not in {"pose2d", "holisticdata"}:
        raise ValueError(f"Unknown pose modality: {modality}")
    return REFERENCE_RAW_POSE_ROOT / modality


def participant_study_root(study: str) -> Path:
    """Return the durable root for one participant study."""

    return PARTICIPANT_ROOT / study


def participant_video_root(study: str) -> Path:
    """Return the durable video root for one participant study."""

    return participant_study_root(study) / "videos"


def participant_raw_pose_root(study: str, modality: str, segmentation: str = "canonical") -> Path:
    """Return the durable participant raw-pose directory for a study/modality."""

    if modality not in {"pose2d", "holisticdata"}:
        raise ValueError(f"Unknown pose modality: {modality}")
    return participant_study_root(study) / "pose-raw" / segmentation / modality


def participant_processed_pose_root(study: str, modality: str, segmentation: str = "canonical") -> Path:
    """Return the generated participant processed-pose directory."""

    if modality not in {"pose2d", "holisticdata"}:
        raise ValueError(f"Unknown pose modality: {modality}")
    return participant_study_root(study) / "pose-processed" / segmentation / modality
