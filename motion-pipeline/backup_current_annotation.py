#!/usr/bin/env python3
"""Snapshot the active annotation batch locally, then publish to Drive via rclone.

Run from motion-pipeline with its configured Python environment. The verified
local snapshot remains available if remote publication fails.
"""

from __future__ import annotations

from pathlib import Path
import shutil
import sys

from motion_extraction.manual_review_backup import create_snapshot, publish
from resume_annotation_server import DATABASE, EXPERIMENT_ROOT


def main() -> None:
    manifest = EXPERIMENT_ROOT / "annotation_tasks.json"
    if not DATABASE.is_file():
        raise SystemExit(f"Active annotation database not found: {DATABASE}")
    if not manifest.is_file():
        raise SystemExit(f"Active annotation task manifest not found: {manifest}")

    pipeline_root = Path(__file__).resolve().parent
    canonical_root = pipeline_root / "local-data" / "manual-review"
    snapshot_parent = pipeline_root / "temp" / "manual-review-snapshots"
    snapshot = create_snapshot(
        canonical_root,
        snapshot_parent,
        DATABASE,
        manifest,
    )
    print(f"Verified local snapshot: {snapshot}")
    # The local snapshot is complete before any remote transfer begins.
    remote = publish(snapshot, None)
    print(f"Published current annotation backup to: {remote}")
    if snapshot.is_symlink() or snapshot.parent.resolve() != snapshot_parent.resolve():
        raise RuntimeError(f"Refusing to remove unexpected snapshot path: {snapshot}")
    try:
        shutil.rmtree(snapshot)
    except OSError as error:
        print(f"Drive publication succeeded, but local snapshot cleanup failed: {error}", file=sys.stderr)
    else:
        print("Removed temporary local snapshot after verified Drive publication.")


if __name__ == "__main__":
    main()
