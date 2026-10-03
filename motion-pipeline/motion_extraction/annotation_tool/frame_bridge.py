"""Small JSON bridge for the local Svelte frame-review workspace.

The original AnnotationStore remains the sole writer and validator of frame
revisions. This process is deliberately one request long and has no listener.
"""

from __future__ import annotations

import argparse
import fcntl
import json
from pathlib import Path
import sqlite3
import sys

from motion_extraction.annotation_tool.server import AnnotationStore


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("latest", "save"))
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--annotator", required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    if not args.annotator.strip():
        raise ValueError("annotator is required")
    if not args.database.is_file():
        raise FileNotFoundError(args.database)
    with sqlite3.connect(args.database.resolve().as_uri() + "?mode=ro", uri=True) as connection:
        matched = connection.execute(
            "SELECT 1 FROM judgment_revisions WHERE experiment_id = ? LIMIT 1",
            (manifest["experiment_id"],),
        ).fetchone()
    if matched is None:
        raise ValueError("annotation database does not match the frame manifest experiment")
    if args.operation == "latest":
        store = AnnotationStore(args.database, manifest, read_only=True)
        latest = store.latest(args.annotator)
        print(json.dumps({key: {
            "revision_id": value["revision_id"],
            "status": value["status"],
            "frame_usability_response": value.get("frame_usability_response", {}),
        } for key, value in latest.items() if store.tasks.get(key, {}).get("task_type") == "frame_usability"}))
        return 0

    payload = json.load(sys.stdin)
    task = next((task for task in manifest["tasks"] if task["task_id"] == payload.get("task_id")), None)
    if not task or task.get("task_type") != "frame_usability":
        raise ValueError("unknown frame-usability task")
    expected = payload.get("expected_revision_id")
    if expected is not None and (type(expected) is not int or expected < 0):
        raise ValueError("expected_revision_id must be a nonnegative integer")
    # Serialize the read/check/append sequence across bridge processes. The
    # legacy server may still edit this DB; its revisions are checked below.
    lock_file = args.database.with_suffix(args.database.suffix + ".frame-bridge.lock")
    with lock_file.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        store = AnnotationStore(args.database, manifest)
        prior = store.latest(args.annotator).get(payload["task_id"])
        current = prior["revision_id"] if prior else 0
        if expected is not None and current != expected:
            print(json.dumps({"conflict": True, "revision_id": current}))
            return 0
        try:
            result = store.append(payload)
        except ValueError as error:
            if str(error) != "frame review revision conflict":
                raise
            current = store.latest(args.annotator).get(payload["task_id"])
            print(json.dumps({"conflict": True, "revision_id": current["revision_id"] if current else 0}))
            return 0
        print(json.dumps({"conflict": False, "revision_id": result["revision_id"]}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
