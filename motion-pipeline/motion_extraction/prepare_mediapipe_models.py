"""Prepare MediaPipe task model assets required by the motion pipeline."""

from __future__ import annotations

import argparse
from pathlib import Path

from .mp_utils import (
    HOLISTIC_LANDMARKER_MODEL_URL,
    ensure_task_model,
    holistic_landmarker_model_path,
)


def ensure_holistic_landmarker_model(download: bool) -> Path:
    """Check or explicitly download the MediaPipe Holistic task model."""

    model_path = holistic_landmarker_model_path()
    if model_path.is_file():
        return model_path
    if not download:
        raise RuntimeError(
            "MediaPipe's Holistic Landmarker model is missing. Run "
            "'uv run --locked python -m motion_extraction.prepare_mediapipe_models "
            "--download' before running the smoke suite."
        )

    print(f"Downloading MediaPipe model to {model_path}")
    return ensure_task_model(model_path, HOLISTIC_LANDMARKER_MODEL_URL)


def main() -> None:
    """Check or download the model selected by the command line."""

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download the model when it is not already available.",
    )
    args = parser.parse_args()
    model_path = ensure_holistic_landmarker_model(download=args.download)
    print(f"MediaPipe Holistic Landmarker model ready: {model_path}")


if __name__ == "__main__":
    main()
