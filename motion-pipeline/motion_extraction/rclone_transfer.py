"""Explicit rclone transfers for cloud-agent dataset and artifact workflows."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess


def _run_rclone(*args: str) -> None:
    """Run rclone with the configured environment and stream its output."""
    subprocess.run(["rclone", *args], check=True)


def pull(remote_path: str, local_path: Path) -> None:
    """Copy a dataset subtree into a local working directory without deleting files."""
    local_path.mkdir(parents=True, exist_ok=True)
    _run_rclone("copy", f"dataset:{remote_path}", str(local_path), "--progress")


def publish_artifacts(local_path: Path, remote_path: str) -> None:
    """Copy a completed research artifact run into the writable agent-output remote."""
    _run_rclone("copy", str(local_path), f"agentoutput:{remote_path}", "--progress")


def publish_processed_bundle(local_path: Path) -> None:
    """Replace the processed-media bundle with a verified local bundle.

    This is intentionally an explicit sync because the remote bundle is a cache
    with one authoritative latest version. The caller must opt in with the CLI
    command; normal pipeline runs never invoke it.
    """
    _run_rclone("sync", str(local_path), "processedmediabundle:", "--progress")


def main() -> None:
    """Expose pull and explicit publication operations as a CLI."""
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    pull_parser = subparsers.add_parser("pull", help="copy a dataset subtree locally")
    pull_parser.add_argument("remote_path", help="path below the dataset root")
    pull_parser.add_argument("local_path", type=Path)

    artifact_parser = subparsers.add_parser("publish-artifacts", help="persist a completed artifact run")
    artifact_parser.add_argument("local_path", type=Path)
    artifact_parser.add_argument("remote_path", help="path below agentoutput")

    bundle_parser = subparsers.add_parser("publish-processed-bundle", help="replace the latest processed bundle")
    bundle_parser.add_argument("local_path", type=Path)

    args = parser.parse_args()
    if not os.environ.get("RCLONE_CONFIG"):
        print("Using rclone's default config path.")
    if args.command == "pull":
        pull(args.remote_path, args.local_path)
    elif args.command == "publish-artifacts":
        publish_artifacts(args.local_path, args.remote_path)
    else:
        publish_processed_bundle(args.local_path)


if __name__ == "__main__":
    main()
