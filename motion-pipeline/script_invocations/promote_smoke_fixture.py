"""Explicitly promote one validated temporary output into a smoke-test stage."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import shutil


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SMOKETEST_ROOT = REPOSITORY_ROOT / "data" / "test-fixtures" / "smoketest"
VALID_STAGES = {
    "motionvideo",
    "database",
    "pose_raw",
    "pose_clean",
    "audio_analysis",
    "complexity",
    "dancetrees",
    "dancetrees_with_complexity",
    "bundle",
}


def sha256(path: Path) -> str:
    """Return the SHA-256 checksum of a fixture candidate."""

    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    """Copy one validated output into a stage-owned smoke-test directory."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--stage", choices=sorted(VALID_STAGES), required=True)
    parser.add_argument("--destination-name", default=None)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.is_file():
        parser.error(f"Source is not a file: {source}")
    if source.is_relative_to(SMOKETEST_ROOT.resolve()):
        parser.error("Source must be a generated output outside data/test-fixtures/smoketest")

    destination_name = args.destination_name or source.name
    destination = (SMOKETEST_ROOT / args.stage / destination_name).resolve()
    if not destination.is_relative_to((SMOKETEST_ROOT / args.stage).resolve()):
        parser.error("Destination name must remain inside the selected stage")
    if destination.exists() and not args.replace:
        parser.error(f"Destination exists; pass --replace only after review: {destination}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    print(f"Promoted {source} -> {destination}")
    print(f"sha256={sha256(destination)}")
    print("Update data/test-fixtures/smoketest/manifest.json after reviewing the promoted fixture.")


if __name__ == "__main__":
    main()
