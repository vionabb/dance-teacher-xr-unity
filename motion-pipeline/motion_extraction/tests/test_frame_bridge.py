"""The local Svelte bridge must preserve the legacy frame revision contract."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from motion_extraction.annotation_tool.server import AnnotationStore


class FrameBridgeTest(unittest.TestCase):
    def test_append_and_stale_revision_rejection(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            task = {
                "task_id": "frame-usability-video-usability-001",
                "task_type": "frame_usability",
                "case_id": "frame-case-001",
                "priority": 1,
                "frame_count": 3,
                "source_dimensions": {"width": 100, "height": 100},
            }
            manifest = {
                "schema_version": "1.0",
                "experiment_id": "synthetic-frame-bridge",
                "tasks": [task],
            }
            manifest_path = root / "annotation_tasks.json"
            manifest_path.write_text(json.dumps(manifest))
            database = root / "annotations.sqlite3"
            store = AnnotationStore(database, manifest)
            initial = store.append({
                "annotator": "researcher", "task_id": task["task_id"],
                "status": "started", "frame_usability_response": {},
            })
            args = [
                sys.executable, "-m", "motion_extraction.annotation_tool.frame_bridge",
                "save", "--manifest", str(manifest_path),
                "--database", str(database), "--annotator", "researcher",
            ]
            payload = {
                "annotator": "researcher", "task_id": task["task_id"],
                "status": "started", "expected_revision_id": initial["revision_id"],
                "frame_usability_response": {
                    "labels": {"1": "flawed"}, "marks": [],
                    "last_viewed_frame": 1,
                },
            }
            def save(value: dict) -> dict:
                result = subprocess.run(
                    args, input=json.dumps(value), text=True, capture_output=True,
                    cwd=Path(__file__).resolve().parents[2], check=True,
                )
                return json.loads(result.stdout)

            saved = save(payload)
            self.assertFalse(saved["conflict"])
            self.assertGreater(saved["revision_id"], initial["revision_id"])
            self.assertEqual(
                store.latest("researcher")[task["task_id"]]["frame_usability_response"]["labels"],
                {"1": "flawed"},
            )
            stale = save(payload)
            self.assertTrue(stale["conflict"])
            self.assertEqual(stale["revision_id"], saved["revision_id"])
            self.assertEqual(store.latest("researcher")[task["task_id"]]["revision_id"], saved["revision_id"])


if __name__ == "__main__":
    unittest.main()
