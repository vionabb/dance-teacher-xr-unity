#!/usr/bin/env python3
"""Resume the active 203-task video and frame-usability batch on the local LAN.

Update the defaults below when a new annotation batch becomes the active one.
Run from motion-pipeline:
    ./.venv/bin/python resume_annotation_server.py
"""

from __future__ import annotations

import getpass
import sys
from pathlib import Path


# Keep these values in sync with the active annotation batch and this computer's
# trusted private LAN address. The SQLite file contains the resumable history.
MOTION_PIPELINE_ROOT = Path(__file__).resolve().parent
EXPERIMENT_ROOT = MOTION_PIPELINE_ROOT / "temp/experiments/20260929-frame-usability-correctable-203"
# This manifest preserves the 154 video tasks and their experiment ID, so the
# source database retains all completed video ratings and future frame labels.
DATABASE = MOTION_PIPELINE_ROOT / "temp/experiments/20260923-video-first-001/annotations.sqlite3"
HOST = "192.168.1.21"
PORT = 8765


def main() -> int:
    """Serve the active batch, then back up a normally stopped session."""

    manifest = EXPERIMENT_ROOT / "annotation_tasks.json"
    if not manifest.is_file():
        raise SystemExit(f"Annotation task manifest not found: {manifest}")
    if not DATABASE.is_file():
        raise SystemExit(f"Annotation history database not found: {DATABASE}")

    access_code = getpass.getpass("Annotation access code: ").strip().upper()
    if not access_code:
        raise SystemExit("An access code is required to serve the experiment on the LAN.")

    # Invoke the existing server entry point directly so the access code is not
    # exposed in the operating system's process argument list.
    sys.argv = [
        "motion_extraction.annotation_tool.server",
        "--experiment-root",
        str(EXPERIMENT_ROOT),
        "--database",
        str(DATABASE),
        "--host",
        HOST,
        "--port",
        str(PORT),
        "--access-token",
        access_code,
    ]
    from motion_extraction.annotation_tool.server import main as run_annotation_server

    try:
        run_annotation_server()
    except KeyboardInterrupt:
        print("\nAnnotation server stopped by Ctrl-C.", flush=True)
    else:
        print("Annotation server stopped.", flush=True)

    # The server has closed its listener before taking a consistent SQLite
    # snapshot. A failed upload never modifies the live database.
    print("Backing up annotation history and publishing the snapshot to Drive...", flush=True)
    try:
        from backup_current_annotation import main as backup_current_annotation

        backup_current_annotation()
    except KeyboardInterrupt:
        print("Annotation backup interrupted. The live SQLite database is unchanged.", file=sys.stderr)
        return 130
    except (Exception, SystemExit) as error:
        print(f"Annotation backup failed: {error}", file=sys.stderr)
        print("Retry with ./.venv/bin/python backup_current_annotation.py", file=sys.stderr)
        return 1
    print("Annotation backup completed and published.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
