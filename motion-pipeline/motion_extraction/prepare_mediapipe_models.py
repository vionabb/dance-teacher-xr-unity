"""Prepare MediaPipe model assets required by the legacy Holistic API."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import tempfile
from urllib.request import urlopen


POSE_LANDMARK_HEAVY_URL = (
    "https://storage.googleapis.com/mediapipe-assets/pose_landmark_heavy.tflite"
)
POSE_LANDMARK_HEAVY_SHA256 = (
    "59e42d71bcd44cbdbabc419f0ff76686595fd265419566bd4009ef703ea8e1fe"
)


def pose_landmark_heavy_path() -> Path:
    """Return the installed MediaPipe path for the heavy pose model."""

    import mediapipe

    return (
        Path(mediapipe.__file__).resolve().parent
        / "modules"
        / "pose_landmark"
        / "pose_landmark_heavy.tflite"
    )


def _sha256(path: Path) -> str:
    """Return a file's SHA-256 digest."""

    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download_model(destination: Path) -> None:
    """Download the model to a temporary file before installing it atomically."""

    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb", dir=destination.parent, prefix=".pose_landmark_heavy.", delete=False
    ) as temporary_file:
        temporary_path = Path(temporary_file.name)
        try:
            with urlopen(POSE_LANDMARK_HEAVY_URL, timeout=60) as response:
                while chunk := response.read(1024 * 1024):
                    temporary_file.write(chunk)
            if _sha256(temporary_path) != POSE_LANDMARK_HEAVY_SHA256:
                raise RuntimeError(
                    "Downloaded MediaPipe model failed its SHA-256 check."
                )
            os.replace(temporary_path, destination)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise


def ensure_pose_landmark_heavy_model(download: bool) -> Path:
    """Check or explicitly download the model used by Holistic complexity 2."""

    model_path = pose_landmark_heavy_path()
    if model_path.is_file() and _sha256(model_path) == POSE_LANDMARK_HEAVY_SHA256:
        return model_path
    if not download:
        raise RuntimeError(
            "MediaPipe's heavy pose model is missing. Run "
            "'uv run --locked python -m motion_extraction.prepare_mediapipe_models "
            "--download' before running the smoke suite."
        )

    print(f"Downloading MediaPipe model to {model_path}")
    _download_model(model_path)
    return model_path


def main() -> None:
    """Check or download the MediaPipe model selected by the command line."""

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download the model when it is not already installed.",
    )
    args = parser.parse_args()
    model_path = ensure_pose_landmark_heavy_model(download=args.download)
    print(f"MediaPipe heavy pose model ready: {model_path}")


if __name__ == "__main__":
    main()
