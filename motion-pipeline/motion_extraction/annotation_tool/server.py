"""Serve prioritized annotation tasks with append-only SQLite persistence."""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
import ipaddress
import json
import math
from pathlib import Path
import re
import secrets
import sqlite3
import typing as t
from urllib.parse import parse_qs, urlparse


SCHEMA_VERSION = "3.5"
STATUSES = {"started", "completed", "unclear", "skipped"}
TEMPORAL_CHOICES = {
    "A",
    "B",
    "C",
    "no_discernible_difference",
    "cannot_judge",
}
TEMPORAL_CONFIDENCES = {"low", "medium", "high"}
TRIAGE_VERDICTS = {"fine", "problematic", "cannot_judge"}
ERROR_MARK_LABEL_MAX_LENGTH = 64
ERROR_MARK_NOTE_MAX_LENGTH = 500
# A skeletal error (which body part is inaccurate, over which frames) is
# recorded separately from its guessed cause(s), so one clip can carry
# several independently-typed, independently-timed, and possibly-overlapping
# errors -- e.g. a right-arm inaccuracy across frames 1-14, an inaccurate hip
# location at just frame 10, and something else across frames 12-16 -- and a
# single marked error can be attributed to more than one probable cause.
DEFAULT_ERROR_BODY_PARTS = [
    {"id": "right_arm", "label": "Right arm"},
    {"id": "left_arm", "label": "Left arm"},
    {"id": "hips", "label": "Hips"},
    {"id": "right_leg", "label": "Right leg"},
    {"id": "left_leg", "label": "Left leg"},
    {"id": "torso", "label": "Shoulders"},
    {"id": "head", "label": "Head"},
    {"id": "other", "label": "Other"},
]
DEFAULT_ERROR_CAUSES = [
    {"id": "occlusion", "label": "Occlusion (limb crosses/hides behind body)"},
    {"id": "out_of_frame", "label": "Out of frame"},
    {"id": "missing_tracking", "label": "Missing / lost tracking"},
    {"id": "other", "label": "Other"},
]
LIGHTING_RATINGS = {"good", "moderate", "poor"}
CLOTHING_RATINGS = {"well_suited", "moderate", "poorly_suited"}
SKELETON_FREE_TASK_TYPES = {
    "temporal_pose_comparison",
    "quality_triage",
    "error_marking",
    "video_quality_rating",
}
SOURCE_EVIDENCE_QUALITIES = {"usable", "constrained", "weak"}
SOURCE_EVIDENCE_FACTORS = {
    "motion_blur",
    "low_light",
    "cropped_body",
    "silhouette",
    "backdrop_confusion",
    "other",
}
ACCESS_CODE_PATTERN = re.compile(r"[A-Z0-9]{6}")


class AnnotationStore:
    """Append-only annotation revision store backed by SQLite."""

    def __init__(
        self,
        database_path: Path,
        manifest: dict[str, t.Any],
        *,
        read_only: bool = False,
    ):
        """Open an annotation store, optionally without any database writes."""

        self.database_path = database_path
        self.manifest = manifest
        self.tasks = {str(task["task_id"]): task for task in manifest["tasks"]}
        self.read_only = read_only
        if read_only:
            if not database_path.is_file():
                raise FileNotFoundError(database_path)
            return
        database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS judgment_revisions (
                    revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    schema_version TEXT NOT NULL,
                    experiment_id TEXT NOT NULL,
                    annotator TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    case_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    tier_assignments_json TEXT NOT NULL,
                    notes TEXT NOT NULL,
                    tags_json TEXT NOT NULL,
                    overlay_tags_json TEXT NOT NULL DEFAULT '{}',
                    overlay_notes_json TEXT NOT NULL DEFAULT '{}',
                    ground_truth_landmarks_json TEXT NOT NULL DEFAULT '{}',
                    initial_ground_truth_landmarks_json TEXT NOT NULL DEFAULT '{}',
                    initial_landmark_sources_json TEXT NOT NULL DEFAULT '{}',
                    landmark_interactions_json TEXT NOT NULL DEFAULT '{}',
                    ground_truth_initial_profile TEXT NOT NULL DEFAULT '',
                    automatic_profile_scores_json TEXT NOT NULL DEFAULT '{}',
                    source_evidence_quality TEXT NOT NULL DEFAULT '',
                    source_evidence_factors_json TEXT NOT NULL DEFAULT '[]',
                    task_type TEXT NOT NULL DEFAULT 'editable_pose_ground_truth',
                    temporal_choice TEXT NOT NULL DEFAULT '',
                    temporal_confidence TEXT NOT NULL DEFAULT '',
                    temporal_note TEXT NOT NULL DEFAULT '',
                    triage_response_json TEXT NOT NULL DEFAULT '{}',
                    error_marking_response_json TEXT NOT NULL DEFAULT '{}',
                    quality_rating_response_json TEXT NOT NULL DEFAULT '{}',
                    profile_provenance_json TEXT NOT NULL,
                    frame_window_json TEXT NOT NULL,
                    artifact_ids_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    supersedes_revision_id INTEGER
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(judgment_revisions)")
            }
            if "overlay_tags_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN overlay_tags_json TEXT NOT NULL DEFAULT '{}'"
                )
            if "overlay_notes_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN overlay_notes_json TEXT NOT NULL DEFAULT '{}'"
                )
            if "ground_truth_landmarks_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN ground_truth_landmarks_json TEXT NOT NULL DEFAULT '{}'"
                )
            if "ground_truth_initial_profile" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN ground_truth_initial_profile TEXT NOT NULL DEFAULT ''"
                )
            if "initial_ground_truth_landmarks_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN initial_ground_truth_landmarks_json TEXT NOT NULL DEFAULT '{}'"
                )
            if "landmark_interactions_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN landmark_interactions_json TEXT NOT NULL DEFAULT '{}'"
                )
            if "initial_landmark_sources_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN initial_landmark_sources_json TEXT NOT NULL DEFAULT '{}'"
                )
            if "automatic_profile_scores_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN automatic_profile_scores_json TEXT NOT NULL DEFAULT '{}'"
                )
            if "source_evidence_quality" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN source_evidence_quality TEXT NOT NULL DEFAULT ''"
                )
            if "source_evidence_factors_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN source_evidence_factors_json TEXT NOT NULL DEFAULT '[]'"
                )
            if "task_type" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN task_type TEXT NOT NULL DEFAULT 'editable_pose_ground_truth'"
                )
            if "temporal_choice" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN temporal_choice TEXT NOT NULL DEFAULT ''"
                )
            if "temporal_confidence" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN temporal_confidence TEXT NOT NULL DEFAULT ''"
                )
            if "temporal_note" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN temporal_note TEXT NOT NULL DEFAULT ''"
                )
            if "triage_response_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN triage_response_json TEXT NOT NULL DEFAULT '{}'"
                )
            if "error_marking_response_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN error_marking_response_json TEXT NOT NULL DEFAULT '{}'"
                )
            if "quality_rating_response_json" not in columns:
                connection.execute(
                    "ALTER TABLE judgment_revisions ADD COLUMN quality_rating_response_json TEXT NOT NULL DEFAULT '{}'"
                )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_judgment_revisions_resume
                ON judgment_revisions (experiment_id, annotator, task_id, revision_id)
                """
            )
            connection.execute("PRAGMA optimize")

    def _connect(self) -> sqlite3.Connection:
        if self.read_only:
            connection = sqlite3.connect(
                f"{self.database_path.resolve().as_uri()}?mode=ro", uri=True
            )
        else:
            connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def append(self, payload: dict[str, t.Any]) -> dict[str, t.Any]:
        """Validate and append one judgment revision."""

        annotator = str(payload.get("annotator", "")).strip()
        task_id = str(payload.get("task_id", ""))
        status = str(payload.get("status", "started"))
        if not annotator:
            raise ValueError("annotator is required")
        if task_id not in self.tasks:
            raise ValueError(f"unknown task_id: {task_id}")
        if status not in STATUSES:
            raise ValueError(f"invalid status: {status}")
        task = self.tasks[task_id]
        task_type = str(
            task.get(
                "task_type",
                self.manifest.get("task_type", "editable_pose_ground_truth"),
            )
        )
        temporal_response = self._validate_temporal_response(
            payload.get("temporal_response", {}), task_type, status
        )
        triage_response = self._validate_triage_response(
            payload.get("triage_response", {}), task_type, status
        )
        error_marking_response = self._validate_error_marking_response(
            payload.get("error_marking_response", {}), task_type, status
        )
        quality_rating_response = self._validate_quality_rating_response(
            payload.get("quality_rating_response", {}), task_type, status
        )
        assignments = payload.get("tier_assignments", {})
        if not isinstance(assignments, dict):
            raise ValueError("tier_assignments must be an object")
        overlay_ids = {str(item["overlay_id"]) for item in task.get("overlays", [])}
        unknown = set(assignments) - overlay_ids
        if unknown:
            raise ValueError(f"unknown overlay ids: {sorted(unknown)}")
        allowed_tiers = {
            int(tier["value"])
            for tier in self.manifest.get(
                "tier_definitions",
                [{"value": value} for value in range(1, 6)],
            )
        }
        for overlay_id, tier in assignments.items():
            if not isinstance(tier, int) or tier not in allowed_tiers:
                raise ValueError(
                    f"tier for {overlay_id} must be one of {sorted(allowed_tiers)}"
                )
        if task_type in SKELETON_FREE_TASK_TYPES:
            ground_truth: dict[str, dict[str, t.Any]] = {}
            initial_ground_truth: dict[str, dict[str, t.Any]] = {}
            interactions: dict[str, dict[str, t.Any]] = {}
            initial_landmark_sources: dict[str, str] = {}
        else:
            ground_truth = self._validate_ground_truth(payload, task, overlay_ids, status)
            initial_ground_truth = self._validate_ground_truth(
                {
                    "ground_truth_landmarks": payload.get(
                        "initial_ground_truth_landmarks", {}
                    )
                },
                task,
                overlay_ids,
                "started",
            )
            interactions = self._validate_interactions(
                payload.get("landmark_interactions", {}), task
            )
            initial_landmark_sources = self._validate_initial_sources(
                payload.get("initial_landmark_sources", {}), task
            )
        initial_profile = str(payload.get("ground_truth_initial_profile", "")).strip()
        if initial_profile and initial_profile not in overlay_ids:
            raise ValueError("ground_truth_initial_profile must name an overlay")
        if (
            status == "completed"
            and task_type not in SKELETON_FREE_TASK_TYPES
            and not ground_truth
            and set(assignments) != overlay_ids
        ):
            raise ValueError(
                "completed judgments require an adjusted skeleton or a tier for every overlay"
            )
        expected_landmarks = set(self.manifest.get("landmarks", []))
        if (
            task.get("calibration_of_task_id")
            and status == "completed"
            and set(ground_truth) != expected_landmarks
        ):
            missing = sorted(expected_landmarks - set(ground_truth))
            raise ValueError(
                f"completed skeletons require every landmark; missing: {missing}"
            )
        calibration = self._calibration_summary(
            annotator,
            candidate={
                "task_id": task_id,
                "status": status,
                "ground_truth_landmarks": ground_truth,
                "ground_truth_initial_profile": initial_profile,
            },
        )
        automatic_scores = self._score_profiles(
            task, ground_truth, calibration["active_tolerance_torso"]
        )
        tags = payload.get("tags", [])
        if not isinstance(tags, list):
            raise ValueError("tags must be an array")
        overlay_tags = payload.get("overlay_tags", {})
        if not isinstance(overlay_tags, dict):
            raise ValueError("overlay_tags must be an object")
        unknown_overlay_tags = set(overlay_tags) - overlay_ids
        if unknown_overlay_tags:
            raise ValueError(
                f"unknown overlay ids in overlay_tags: {sorted(unknown_overlay_tags)}"
            )
        if any(not isinstance(value, list) for value in overlay_tags.values()):
            raise ValueError("each overlay_tags value must be an array")
        overlay_notes = payload.get("overlay_notes", {})
        if not isinstance(overlay_notes, dict):
            raise ValueError("overlay_notes must be an object")
        unknown_overlay_notes = set(overlay_notes) - overlay_ids
        if unknown_overlay_notes:
            raise ValueError(
                f"unknown overlay ids in overlay_notes: {sorted(unknown_overlay_notes)}"
            )
        if any(not isinstance(value, str) for value in overlay_notes.values()):
            raise ValueError("each overlay_notes value must be a string")
        notes = str(payload.get("notes", ""))
        source_evidence_quality = self._validate_source_evidence_quality(
            payload.get("source_evidence_quality", "")
        )
        source_evidence_factors = self._validate_source_evidence_factors(
            payload.get("source_evidence_factors", [])
        )
        if (
            status == "completed"
            and (
                task.get("requires_source_evidence_quality")
                or task.get("requires_evidence_quality")
            )
            and not source_evidence_quality
        ):
            raise ValueError(
                "completed task requires a source_evidence_quality classification"
            )
        created_at = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            previous = connection.execute(
                """
                SELECT revision_id FROM judgment_revisions
                WHERE experiment_id = ? AND annotator = ? AND task_id = ?
                ORDER BY revision_id DESC LIMIT 1
                """,
                (self.manifest["experiment_id"], annotator, task_id),
            ).fetchone()
            cursor = connection.execute(
                """
                INSERT INTO judgment_revisions (
                    schema_version, experiment_id, annotator, task_id, case_id,
                    status, tier_assignments_json, notes, tags_json, overlay_tags_json,
                    overlay_notes_json, ground_truth_landmarks_json,
                    initial_ground_truth_landmarks_json, landmark_interactions_json,
                    initial_landmark_sources_json,
                    ground_truth_initial_profile, automatic_profile_scores_json,
                    source_evidence_quality, source_evidence_factors_json, task_type,
                    temporal_choice, temporal_confidence, temporal_note,
                    triage_response_json, error_marking_response_json, quality_rating_response_json,
                    profile_provenance_json, frame_window_json, artifact_ids_json,
                    created_at, supersedes_revision_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    SCHEMA_VERSION,
                    self.manifest["experiment_id"],
                    annotator,
                    task_id,
                    str(task["case_id"]),
                    status,
                    json.dumps(assignments, sort_keys=True),
                    notes,
                    json.dumps(tags, sort_keys=True),
                    json.dumps(overlay_tags, sort_keys=True),
                    json.dumps(overlay_notes, sort_keys=True),
                    json.dumps(ground_truth, sort_keys=True),
                    json.dumps(initial_ground_truth, sort_keys=True),
                    json.dumps(interactions, sort_keys=True),
                    json.dumps(initial_landmark_sources, sort_keys=True),
                    initial_profile,
                    json.dumps(automatic_scores, sort_keys=True),
                    source_evidence_quality,
                    json.dumps(source_evidence_factors, sort_keys=True),
                    task_type,
                    temporal_response["choice"],
                    temporal_response["confidence"],
                    temporal_response["note"],
                    json.dumps(triage_response, sort_keys=True),
                    json.dumps(error_marking_response, sort_keys=True),
                    json.dumps(quality_rating_response, sort_keys=True),
                    json.dumps(self.manifest.get("profile_provenance", {}), sort_keys=True),
                    json.dumps(task.get("frame_window", {}), sort_keys=True),
                    json.dumps(
                        {
                            "source": task.get(
                                "source_video", task.get("source_artifact")
                            ),
                            "overlays": task.get("overlays", []),
                            "candidates": task.get("candidates", []),
                        },
                        sort_keys=True,
                    ),
                    created_at,
                    None if previous is None else previous["revision_id"],
                ),
            )
            revision_id = int(cursor.lastrowid)
        return {
            "revision_id": revision_id,
            "created_at": created_at,
            "status": status,
            "automatic_profile_scores": automatic_scores,
            "calibration_summary": calibration,
        }

    @staticmethod
    def _validate_temporal_response(
        value: t.Any, task_type: str, status: str
    ) -> dict[str, str]:
        """Validate the response fields used only by temporal comparison tasks."""

        empty = {"choice": "", "confidence": "", "note": ""}
        if task_type != "temporal_pose_comparison":
            if value not in ({}, None):
                raise ValueError(
                    "temporal_response is only valid for temporal_pose_comparison tasks"
                )
            return empty
        if not isinstance(value, dict):
            raise ValueError("temporal_response must be an object")
        choice = value.get("choice", "")
        confidence = value.get("confidence", "")
        note = value.get("note", "")
        if not all(isinstance(item, str) for item in (choice, confidence, note)):
            raise ValueError("temporal response fields must be strings")
        choice, confidence, note = choice.strip(), confidence.strip(), note.strip()
        if choice and choice not in TEMPORAL_CHOICES:
            raise ValueError(
                f"temporal choice must be one of {sorted(TEMPORAL_CHOICES)}"
            )
        if confidence and confidence not in TEMPORAL_CONFIDENCES:
            raise ValueError(
                "temporal confidence must be low, medium, high, or empty"
            )
        if choice == "cannot_judge" and confidence:
            raise ValueError("cannot_judge must not include confidence")
        if status == "completed":
            if choice not in TEMPORAL_CHOICES:
                raise ValueError("completed temporal response requires exactly one choice")
            if choice != "cannot_judge" and confidence not in TEMPORAL_CONFIDENCES:
                raise ValueError(
                    "completed temporal response requires confidence unless cannot_judge"
                )
        return {"choice": choice, "confidence": confidence, "note": note}

    @staticmethod
    def _validate_triage_response(
        value: t.Any, task_type: str, status: str
    ) -> dict[str, str]:
        """Validate the response fields used only by quality_triage tasks."""

        empty = {"verdict": "", "note": ""}
        if task_type != "quality_triage":
            if value not in ({}, None):
                raise ValueError(
                    "triage_response is only valid for quality_triage tasks"
                )
            return empty
        if not isinstance(value, dict):
            raise ValueError("triage_response must be an object")
        verdict = value.get("verdict", "")
        note = value.get("note", "")
        if not all(isinstance(item, str) for item in (verdict, note)):
            raise ValueError("triage response fields must be strings")
        verdict, note = verdict.strip(), note.strip()
        if verdict and verdict not in TRIAGE_VERDICTS:
            raise ValueError(f"triage verdict must be one of {sorted(TRIAGE_VERDICTS)}")
        if status == "completed" and verdict not in TRIAGE_VERDICTS:
            raise ValueError("completed triage response requires a verdict")
        return {"verdict": verdict, "note": note}

    @staticmethod
    def _validate_error_marking_response(
        value: t.Any, task_type: str, status: str
    ) -> dict[str, t.Any]:
        """Validate the response fields used only by error_marking tasks."""

        empty: dict[str, t.Any] = {"marks": [], "no_errors_found": False, "note": ""}
        if task_type != "error_marking":
            if value not in ({}, None):
                raise ValueError(
                    "error_marking_response is only valid for error_marking tasks"
                )
            return empty
        if not isinstance(value, dict):
            raise ValueError("error_marking_response must be an object")
        raw_marks = value.get("marks", [])
        if not isinstance(raw_marks, list):
            raise ValueError("error_marking_response marks must be an array")
        marks: list[dict[str, t.Any]] = []
        for item in raw_marks:
            if not isinstance(item, dict):
                raise ValueError("each error mark must be an object")
            body_part = str(item.get("body_part", "")).strip()
            if not body_part:
                raise ValueError("each error mark requires a non-empty body_part")
            if len(body_part) > ERROR_MARK_LABEL_MAX_LENGTH:
                raise ValueError(
                    f"body_part must be at most {ERROR_MARK_LABEL_MAX_LENGTH} characters"
                )
            start_frame, end_frame = item.get("start_frame"), item.get("end_frame")
            if isinstance(start_frame, bool) or isinstance(end_frame, bool):
                raise ValueError("start_frame/end_frame must be integers")
            try:
                start_frame, end_frame = int(start_frame), int(end_frame)
            except (TypeError, ValueError) as error:
                raise ValueError("start_frame/end_frame must be integers") from error
            if start_frame < 0 or end_frame < start_frame:
                raise ValueError("error mark frame range is invalid")
            raw_causes = item.get("causes", [])
            if not isinstance(raw_causes, list) or any(
                not isinstance(cause, str) for cause in raw_causes
            ):
                raise ValueError("causes must be an array of strings")
            causes: list[str] = []
            for cause in raw_causes:
                cause = cause.strip()
                if not cause:
                    continue
                if len(cause) > ERROR_MARK_LABEL_MAX_LENGTH:
                    raise ValueError(
                        f"each cause must be at most {ERROR_MARK_LABEL_MAX_LENGTH} characters"
                    )
                if cause not in causes:
                    causes.append(cause)
            mark_note = str(item.get("note", "")).strip()
            if len(mark_note) > ERROR_MARK_NOTE_MAX_LENGTH:
                raise ValueError(
                    f"each mark note must be at most {ERROR_MARK_NOTE_MAX_LENGTH} characters"
                )
            marks.append(
                {
                    "body_part": body_part,
                    "start_frame": start_frame,
                    "end_frame": end_frame,
                    "causes": causes,
                    "note": mark_note,
                }
            )
        no_errors_found = bool(value.get("no_errors_found", False))
        note = str(value.get("note", "")).strip()
        if status == "completed":
            if not marks and not no_errors_found:
                raise ValueError(
                    "completed error_marking requires marks, or no_errors_found checked"
                )
            if marks and no_errors_found:
                raise ValueError("no_errors_found must not be set when marks are present")
        return {"marks": marks, "no_errors_found": no_errors_found, "note": note}

    @staticmethod
    def _validate_quality_rating_response(
        value: t.Any, task_type: str, status: str
    ) -> dict[str, str]:
        """Validate the response fields used only by video_quality_rating tasks."""

        empty = {"lighting": "", "clothing": "", "note": ""}
        if task_type != "video_quality_rating":
            if value not in ({}, None):
                raise ValueError(
                    "quality_rating_response is only valid for video_quality_rating tasks"
                )
            return empty
        if not isinstance(value, dict):
            raise ValueError("quality_rating_response must be an object")
        lighting = str(value.get("lighting", "")).strip()
        clothing = str(value.get("clothing", "")).strip()
        note = str(value.get("note", "")).strip()
        if lighting and lighting not in LIGHTING_RATINGS:
            raise ValueError(f"lighting must be one of {sorted(LIGHTING_RATINGS)}")
        if clothing and clothing not in CLOTHING_RATINGS:
            raise ValueError(f"clothing must be one of {sorted(CLOTHING_RATINGS)}")
        if status == "completed" and (not lighting or not clothing):
            raise ValueError(
                "completed video_quality_rating requires both lighting and clothing"
            )
        return {"lighting": lighting, "clothing": clothing, "note": note}

    @staticmethod
    def _validate_source_evidence_quality(value: t.Any) -> str:
        """Validate the optional, frame-level confidence classification."""

        if value is None:
            return ""
        if not isinstance(value, str):
            raise ValueError("source_evidence_quality must be a string")
        quality = value.strip()
        if quality and quality not in SOURCE_EVIDENCE_QUALITIES:
            raise ValueError(
                "source_evidence_quality must be one of "
                f"{sorted(SOURCE_EVIDENCE_QUALITIES)} or empty"
            )
        return quality

    @staticmethod
    def _validate_source_evidence_factors(value: t.Any) -> list[str]:
        """Validate optional, controlled source-evidence limitations."""

        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            raise ValueError("source_evidence_factors must be an array of strings")
        factors = sorted({item.strip() for item in value if item.strip()})
        unknown = set(factors) - SOURCE_EVIDENCE_FACTORS
        if unknown:
            raise ValueError(
                f"unknown source_evidence_factors: {sorted(unknown)}"
            )
        return factors

    def _validate_interactions(
        self, interactions: t.Any, task: dict[str, t.Any]
    ) -> dict[str, dict[str, t.Any]]:
        if not isinstance(interactions, dict):
            raise ValueError("landmark_interactions must be an object")
        allowed_landmarks = set(self.manifest.get("landmarks", []))
        unknown = set(interactions) - allowed_landmarks
        if unknown:
            raise ValueError(f"unknown landmark interactions: {sorted(unknown)}")
        validated: dict[str, dict[str, t.Any]] = {}
        for landmark, value in interactions.items():
            if not isinstance(value, dict):
                raise ValueError(f"interactions for {landmark} must be an object")
            drag_count = value.get("position_drag_count", 0)
            occlusion_count = value.get("occlusion_change_count", 0)
            if (
                isinstance(drag_count, bool)
                or not isinstance(drag_count, int)
                or drag_count < 0
                or isinstance(occlusion_count, bool)
                or not isinstance(occlusion_count, int)
                or occlusion_count < 0
            ):
                raise ValueError("interaction counts must be non-negative integers")
            validated[landmark] = {
                "position_drag_count": drag_count,
                "position_changed": bool(value.get("position_changed", False)),
                "occlusion_change_count": occlusion_count,
                "occlusion_changed": bool(value.get("occlusion_changed", False)),
            }
        return validated

    def _validate_initial_sources(
        self, sources: t.Any, task: dict[str, t.Any]
    ) -> dict[str, str]:
        if not isinstance(sources, dict):
            raise ValueError("initial_landmark_sources must be an object")
        allowed_landmarks = set(self.manifest.get("landmarks", []))
        overlay_ids = {str(item["overlay_id"]) for item in task.get("overlays", [])}
        if set(sources) - allowed_landmarks:
            raise ValueError("initial_landmark_sources contains unknown landmarks")
        if any(str(source) not in overlay_ids for source in sources.values()):
            raise ValueError("initial_landmark_sources must name task overlays")
        return {str(landmark): str(source) for landmark, source in sources.items()}

    def _validate_ground_truth(
        self,
        payload: dict[str, t.Any],
        task: dict[str, t.Any],
        overlay_ids: set[str],
        status: str,
    ) -> dict[str, dict[str, t.Any]]:
        ground_truth = payload.get("ground_truth_landmarks", {})
        if not isinstance(ground_truth, dict):
            raise ValueError("ground_truth_landmarks must be an object")
        allowed_landmarks = set(self.manifest.get("landmarks", []))
        if not allowed_landmarks:
            for overlay in task.get("overlays", []):
                allowed_landmarks.update(overlay.get("keypoints", {}))
        unknown = set(ground_truth) - allowed_landmarks
        if unknown:
            raise ValueError(f"unknown ground-truth landmarks: {sorted(unknown)}")
        dimensions = task.get("source_dimensions", {})
        width = float(dimensions.get("width", 0))
        height = float(dimensions.get("height", 0))
        validated: dict[str, dict[str, t.Any]] = {}
        for landmark, value in ground_truth.items():
            if not isinstance(value, dict):
                raise ValueError(f"ground truth for {landmark} must be an object")
            x, y = value.get("x"), value.get("y")
            occlusion = value.get("occlusion", "non_occluded")
            if isinstance(x, bool) or isinstance(y, bool):
                raise ValueError(f"ground truth for {landmark} requires numeric x and y")
            try:
                x, y = float(x), float(y)
            except (TypeError, ValueError) as error:
                raise ValueError(
                    f"ground truth for {landmark} requires numeric x and y"
                ) from error
            if not math.isfinite(x) or not math.isfinite(y):
                raise ValueError(f"ground truth for {landmark} must be finite")
            allowed_occlusion = {"non_occluded", "semi_occluded", "fully_occluded"}
            if occlusion not in allowed_occlusion:
                raise ValueError(
                    f"occlusion for {landmark} must be one of {sorted(allowed_occlusion)}"
                )
            if (
                status == "completed"
                and occlusion == "non_occluded"
                and width > 0
                and height > 0
                and not (0 <= x < width and 0 <= y < height)
            ):
                raise ValueError(
                    f"non-occluded ground truth for {landmark} is outside the source frame"
                )
            validated[str(landmark)] = {"x": x, "y": y, "occlusion": occlusion}
        return validated

    @staticmethod
    def _score_profiles(
        task: dict[str, t.Any],
        ground_truth: dict[str, dict[str, t.Any]],
        tolerance_torso: float = 0.05,
    ) -> dict[str, dict[str, t.Any]]:
        """Rank profiles using visibility and error beyond annotation tolerance."""

        if not ground_truth:
            return {}
        visibility_targets = {
            "non_occluded": 1.0,
            "semi_occluded": 0.5,
            "fully_occluded": 0.0,
        }
        positioned = {
            name: item
            for name, item in ground_truth.items()
            if visibility_targets[item["occlusion"]] > 0
        }
        dimensions = task.get("source_dimensions", {})
        diagonal = math.hypot(float(dimensions.get("width", 1)), float(dimensions.get("height", 1)))

        def midpoint(first: str, second: str) -> tuple[float, float] | None:
            if first not in positioned or second not in positioned:
                return None
            return (
                (positioned[first]["x"] + positioned[second]["x"]) / 2,
                (positioned[first]["y"] + positioned[second]["y"]) / 2,
            )

        shoulders = midpoint("LEFT_SHOULDER", "RIGHT_SHOULDER")
        hips = midpoint("LEFT_HIP", "RIGHT_HIP")
        torso = math.dist(shoulders, hips) if shoulders and hips else diagonal / 5
        scale = torso if math.isfinite(torso) and torso > 1e-6 else max(diagonal / 5, 1)
        scored: list[tuple[str, dict[str, t.Any]]] = []
        for overlay in task.get("overlays", []):
            predicted = overlay.get("keypoints", {})
            predicted_visibility = overlay.get("visibility", {})
            matched_errors: list[float] = []
            weighted_error_total = 0.0
            weighted_excess_total = 0.0
            coordinate_weight_total = 0.0
            visibility_errors: list[float] = []
            missing = 0
            for name, truth in ground_truth.items():
                target_visibility = visibility_targets[truth["occlusion"]]
                profile_visibility = float(predicted_visibility.get(name, 0.0))
                profile_visibility = min(1.0, max(0.0, profile_visibility))
                visibility_errors.append(abs(profile_visibility - target_visibility))
                if target_visibility <= 0:
                    continue
                point = predicted.get(name)
                if isinstance(point, list) and len(point) == 2:
                    error = math.hypot(float(point[0]) - truth["x"], float(point[1]) - truth["y"])
                    matched_errors.append(error)
                else:
                    error = scale
                    missing += 1
                weighted_error_total += target_visibility * error
                weighted_excess_total += target_visibility * max(
                    0.0, error / scale - tolerance_torso
                )
                coordinate_weight_total += target_visibility
            mean_error = (
                weighted_error_total / coordinate_weight_total
                if coordinate_weight_total
                else 0.0
            )
            visibility_error = sum(visibility_errors) / len(visibility_errors)
            coordinate_error = mean_error / scale
            excess_error = (
                weighted_excess_total / coordinate_weight_total
                if coordinate_weight_total
                else 0.0
            )
            combined_error = 0.8 * excess_error + 0.2 * visibility_error
            matched_sorted = sorted(matched_errors)
            median = (
                matched_sorted[len(matched_sorted) // 2]
                if matched_sorted
                else None
            )
            score = {
                "annotated_landmark_count": len(ground_truth),
                "position_weight_total": coordinate_weight_total,
                "matched_landmark_count": len(matched_errors),
                "missing_position_landmark_count": missing,
                "mean_error_px_including_missing_penalty": mean_error,
                "mean_visibility_absolute_error": visibility_error,
                "mean_error_torso": coordinate_error,
                "position_equivalence_tolerance_torso": tolerance_torso,
                "mean_excess_error_torso": excess_error,
                "combined_error": combined_error,
                "median_matched_error_px": median,
                "normalization_scale_px": scale,
                "ranking_formula": "0.8 * mean_excess_error_torso + 0.2 * mean_visibility_absolute_error",
            }
            scored.append((str(overlay["overlay_id"]), score))
        scored.sort(key=lambda item: (item[1]["combined_error"], item[0]))
        previous_error: float | None = None
        previous_rank = 0
        for position, (_, score) in enumerate(scored, start=1):
            if previous_error is None or not math.isclose(
                score["combined_error"], previous_error, abs_tol=1e-12
            ):
                previous_rank = position
                previous_error = score["combined_error"]
            score["rank"] = previous_rank
        return dict(scored)

    @staticmethod
    def _ground_truth_scale(
        task: dict[str, t.Any], ground_truth: dict[str, dict[str, t.Any]]
    ) -> float:
        positioned = {
            name: item
            for name, item in ground_truth.items()
            if item.get("occlusion") != "fully_occluded"
        }

        def midpoint(first: str, second: str) -> tuple[float, float] | None:
            if first not in positioned or second not in positioned:
                return None
            return (
                (positioned[first]["x"] + positioned[second]["x"]) / 2,
                (positioned[first]["y"] + positioned[second]["y"]) / 2,
            )

        shoulders = midpoint("LEFT_SHOULDER", "RIGHT_SHOULDER")
        hips = midpoint("LEFT_HIP", "RIGHT_HIP")
        dimensions = task.get("source_dimensions", {})
        diagonal = math.hypot(
            float(dimensions.get("width", 1)), float(dimensions.get("height", 1))
        )
        torso = math.dist(shoulders, hips) if shoulders and hips else diagonal / 5
        return torso if math.isfinite(torso) and torso > 1e-6 else max(diagonal / 5, 1)

    def _calibration_summary(
        self,
        annotator: str,
        candidate: dict[str, t.Any] | None = None,
    ) -> dict[str, t.Any]:
        latest = self.latest(annotator)
        if candidate is not None:
            latest[str(candidate["task_id"])] = candidate
        calibration_tasks = [
            task for task in self.manifest["tasks"] if task.get("calibration_of_task_id")
        ]
        pinned_originals: dict[int, dict[str, t.Any]] = {}
        revision_ids = {
            int(task["calibration_of_revision_id"])
            for task in calibration_tasks
            if task.get("calibration_of_revision_id") is not None
        }
        if revision_ids:
            with self._connect() as connection:
                for revision_id in revision_ids:
                    row = connection.execute(
                        """
                        SELECT * FROM judgment_revisions
                        WHERE revision_id = ? AND experiment_id = ? AND annotator = ?
                        """,
                        (revision_id, self.manifest["experiment_id"], annotator),
                    ).fetchone()
                    if row is not None:
                        pinned_originals[revision_id] = self._decode_row(row)
        normalized_distances: list[float] = []
        semi_occluded_distances: list[float] = []
        per_repeat_p90: list[float] = []
        completed_repeats = 0
        invalid_initializer_repeats = 0
        for repeat_task in calibration_tasks:
            repeat = latest.get(str(repeat_task["task_id"]), {})
            pinned_id = repeat_task.get("calibration_of_revision_id")
            original = (
                pinned_originals.get(int(pinned_id), {})
                if pinned_id is not None
                else latest.get(str(repeat_task["calibration_of_task_id"]), {})
            )
            if repeat.get("status") != "completed" or original.get("status") != "completed":
                continue
            if (
                repeat.get("ground_truth_initial_profile")
                != repeat_task.get("default_initial_profile")
                or repeat.get("ground_truth_initial_profile")
                == original.get("ground_truth_initial_profile")
            ):
                invalid_initializer_repeats += 1
                continue
            completed_repeats += 1
            repeat_gt = repeat.get("ground_truth_landmarks", {})
            original_gt = original.get("ground_truth_landmarks", {})
            scale = self._ground_truth_scale(repeat_task, original_gt)
            repeat_distances: list[float] = []
            for name in set(repeat_gt) & set(original_gt):
                repeat_occlusion = repeat_gt[name].get("occlusion")
                original_occlusion = original_gt[name].get("occlusion")
                if "fully_occluded" in (repeat_occlusion, original_occlusion):
                    continue
                distance = math.hypot(
                    repeat_gt[name]["x"] - original_gt[name]["x"],
                    repeat_gt[name]["y"] - original_gt[name]["y"],
                ) / scale
                if repeat_occlusion == original_occlusion == "non_occluded":
                    repeat_distances.append(distance)
                    normalized_distances.append(distance)
                else:
                    semi_occluded_distances.append(distance)
            if repeat_distances:
                ordered_repeat = sorted(repeat_distances)
                per_repeat_p90.append(
                    ordered_repeat[math.ceil(0.9 * len(ordered_repeat)) - 1]
                )
        empirical = None
        if per_repeat_p90:
            ordered = sorted(per_repeat_p90)
            middle = len(ordered) // 2
            empirical = (
                ordered[middle]
                if len(ordered) % 2
                else (ordered[middle - 1] + ordered[middle]) / 2
            )
        use_empirical = completed_repeats >= 3 and empirical is not None
        return {
            "requested_repeat_count": len(calibration_tasks),
            "completed_repeat_count": completed_repeats,
            "paired_position_landmark_count": len(normalized_distances),
            "semi_occluded_pair_count": len(semi_occluded_distances),
            "semi_occluded_p90_distance_torso": (
                sorted(semi_occluded_distances)[
                    math.ceil(0.9 * len(semi_occluded_distances)) - 1
                ]
                if semi_occluded_distances
                else None
            ),
            "per_repeat_p90_tolerance_torso": per_repeat_p90,
            "empirical_median_repeat_p90_tolerance_torso": empirical,
            "invalid_initializer_repeat_count": invalid_initializer_repeats,
            "active_tolerance_torso": empirical if use_empirical else 0.05,
            "active_tolerance_source": (
                "empirical_median_repeat_p90" if use_empirical else "provisional"
            ),
            "minimum_repeats_for_empirical": 3,
        }

    def latest(self, annotator: str) -> dict[str, dict[str, t.Any]]:
        """Return the latest revision for each task for one annotator."""

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT revisions.* FROM judgment_revisions revisions
                JOIN (
                    SELECT task_id, MAX(revision_id) AS latest_revision_id
                    FROM judgment_revisions
                    WHERE experiment_id = ? AND annotator = ?
                    GROUP BY task_id
                ) latest ON latest.latest_revision_id = revisions.revision_id
                ORDER BY revisions.revision_id
                """,
                (self.manifest["experiment_id"], annotator),
            ).fetchall()
        return {str(row["task_id"]): self._decode_row(row) for row in rows}

    def state(self, annotator: str) -> dict[str, t.Any]:
        """Return prioritized tasks, latest judgments, progress, and resume target."""

        latest = self.latest(annotator)
        tasks = sorted(self.manifest["tasks"], key=lambda task: int(task["priority"]))
        calibration = self._calibration_summary(annotator)
        for task in tasks:
            judgment = latest.get(str(task["task_id"]))
            if judgment and judgment.get("ground_truth_landmarks"):
                judgment["automatic_profile_scores"] = self._score_profiles(
                    task,
                    judgment["ground_truth_landmarks"],
                    calibration["active_tolerance_torso"],
                )
        counts = {"completed": 0, "skipped": 0, "unclear": 0, "started": 0, "unjudged": 0}
        for task in tasks:
            status = latest.get(str(task["task_id"]), {}).get("status", "unjudged")
            counts[status] += 1
        resume = next(
            (str(task["task_id"]) for task in tasks if latest.get(str(task["task_id"]), {}).get("status") == "started"),
            None,
        )
        if resume is None:
            resume = next(
                (str(task["task_id"]) for task in tasks if str(task["task_id"]) not in latest),
                str(tasks[0]["task_id"]) if tasks else None,
            )
        return {
            "schema_version": SCHEMA_VERSION,
            "experiment_id": self.manifest["experiment_id"],
            "task_type": self.manifest.get("task_type", ""),
            "profile_provenance": self.manifest.get("profile_provenance", {}),
            "landmarks": self.manifest.get("landmarks", []),
            "pose_edges": self.manifest.get("pose_edges", []),
            "occlusion_states": self.manifest.get("occlusion_states", []),
            "issue_tags": self.manifest.get("issue_tags", []),
            "error_mark_body_part_defaults": DEFAULT_ERROR_BODY_PARTS,
            "error_mark_cause_defaults": DEFAULT_ERROR_CAUSES,
            "source_evidence_quality_definitions": [
                {
                    "id": "usable",
                    "label": "Usable",
                    "description": "The source supports confident landmark placement.",
                },
                {
                    "id": "constrained",
                    "label": "Constrained",
                    "description": "Placement is approximate because of a visible limitation.",
                },
                {
                    "id": "weak",
                    "label": "Weak",
                    "description": "The source is too ambiguous for a dependable positional judgment.",
                },
            ],
            "source_evidence_factor_definitions": [
                {"id": factor, "label": factor.replace("_", " ")}
                for factor in sorted(SOURCE_EVIDENCE_FACTORS)
            ],
            "tier_definitions": self.manifest.get(
                "tier_definitions",
                [
                    {"value": 1, "id": "perfect", "label": "Perfect"},
                    {"value": 2, "id": "ok", "label": "OK"},
                    {"value": 3, "id": "poor", "label": "Poor"},
                    {"value": 4, "id": "bad", "label": "Bad"},
                ],
            ),
            "tasks": tasks,
            "latest_judgments": latest,
            "calibration_summary": calibration,
            "progress": {"total": len(tasks), **counts},
            "resume_task_id": resume,
        }

    def export_rows(self) -> list[dict[str, t.Any]]:
        """Return revisions plus scores recomputed with the current final tolerance."""

        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM judgment_revisions ORDER BY revision_id"
            ).fetchall()
        exported = [dict(row) for row in rows]
        calibration_by_annotator: dict[str, dict[str, t.Any]] = {}
        for row in exported:
            annotator = str(row["annotator"])
            if annotator not in calibration_by_annotator:
                calibration_by_annotator[annotator] = self._calibration_summary(
                    annotator
                )
            calibration = calibration_by_annotator[annotator]
            task = self.tasks.get(str(row["task_id"]))
            ground_truth = json.loads(row["ground_truth_landmarks_json"])
            scores = (
                self._score_profiles(
                    task,
                    ground_truth,
                    calibration["active_tolerance_torso"],
                )
                if task is not None and ground_truth
                else {}
            )
            row["final_automatic_profile_scores_json"] = json.dumps(
                scores, sort_keys=True
            )
            row["final_tolerance_torso"] = calibration["active_tolerance_torso"]
            row["final_tolerance_source"] = calibration["active_tolerance_source"]
        return exported

    @staticmethod
    def _decode_row(row: sqlite3.Row) -> dict[str, t.Any]:
        decoded = dict(row)
        for column in (
            "tier_assignments_json",
            "tags_json",
            "overlay_tags_json",
            "overlay_notes_json",
            "ground_truth_landmarks_json",
            "initial_ground_truth_landmarks_json",
            "initial_landmark_sources_json",
            "landmark_interactions_json",
            "automatic_profile_scores_json",
            "source_evidence_factors_json",
            "profile_provenance_json",
            "frame_window_json",
            "artifact_ids_json",
        ):
            decoded[column.removesuffix("_json")] = json.loads(decoded.pop(column))
        decoded["temporal_response"] = {
            "choice": decoded.get("temporal_choice", ""),
            "confidence": decoded.get("temporal_confidence", ""),
            "note": decoded.get("temporal_note", ""),
        }
        decoded["triage_response"] = json.loads(decoded.pop("triage_response_json", "{}") or "{}")
        decoded["error_marking_response"] = json.loads(
            decoded.pop("error_marking_response_json", "{}") or "{}"
        )
        decoded["quality_rating_response"] = json.loads(
            decoded.pop("quality_rating_response_json", "{}") or "{}"
        )
        return decoded


class AnnotationHandler(SimpleHTTPRequestHandler):
    """HTTP API and static/artifact handler for one local experiment."""

    server: "AnnotationServer"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/access-info":
            self._json({"access_token_required": self.server.access_token is not None})
            return
        if parsed.path.startswith("/api/") or parsed.path.startswith("/artifacts/"):
            if not self._authorized():
                self._json({"error": "valid annotation access code required"}, HTTPStatus.UNAUTHORIZED)
                return
        if parsed.path == "/api/state":
            annotator = parse_qs(parsed.query).get("annotator", [""])[0].strip()
            if not annotator:
                self._json({"error": "annotator is required"}, HTTPStatus.BAD_REQUEST)
                return
            self._json(self.server.store.state(annotator))
            return
        if parsed.path in ("/api/export.csv", "/api/export.jsonl"):
            self._export(parsed.path)
            return
        if parsed.path.startswith("/artifacts/"):
            relative = parsed.path.removeprefix("/artifacts/")
            self._serve_file(self.server.experiment_root, relative)
            return
        relative = "index.html" if parsed.path == "/" else parsed.path.lstrip("/")
        self._serve_file(self.server.static_root, relative)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/logout":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header(
                "Set-Cookie",
                "annotation_access=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
            )
            self.end_headers()
            return
        if path != "/api/judgments":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not self._authorized():
            self._json({"error": "valid annotation access code required"}, HTTPStatus.UNAUTHORIZED)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            self._json(self.server.store.append(payload), HTTPStatus.CREATED)
        except (ValueError, json.JSONDecodeError) as error:
            self._json({"error": str(error)}, HTTPStatus.BAD_REQUEST)

    def _authorized(self) -> bool:
        """Require the supplied access token for data-bearing resources.

        The small HTML/CSS/JS application shell remains public so a phone can
        display the access-code field.  Participant media and every API route
        are protected; browser requests carry the code only in a header, never
        in a URL.
        """

        token = self.server.access_token
        if token is None:
            return True
        supplied = self.headers.get("X-Annotation-Token", "")
        if supplied and secrets.compare_digest(supplied, token):
            return True
        cookies = SimpleCookie()
        cookies.load(self.headers.get("Cookie", ""))
        cookie = cookies.get("annotation_access")
        return cookie is not None and secrets.compare_digest(cookie.value, token)

    def _serve_file(self, root: Path, relative: str) -> None:
        target = (root / relative).resolve()
        try:
            target.relative_to(root.resolve())
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_types = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "text/javascript",
            ".png": "image/png",
            ".mp4": "video/mp4",
        }
        size = target.stat().st_size
        start, end = 0, size - 1
        status = HTTPStatus.OK
        range_header = self.headers.get("Range")
        if range_header:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
            if match is None or not any(match.groups()) or size == 0:
                self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                return
            first, last = match.groups()
            if first:
                start = int(first)
                end = int(last) if last else size - 1
            else:
                suffix_length = int(last)
                if suffix_length <= 0:
                    self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    return
                start = max(0, size - suffix_length)
            if start >= size or end < start:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            end = min(end, size - 1)
            status = HTTPStatus.PARTIAL_CONTENT
        length = max(0, end - start + 1)
        self.send_response(status)
        self.send_header("Content-Type", content_types.get(target.suffix, "application/octet-stream"))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == HTTPStatus.PARTIAL_CONTENT:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with target.open("rb") as stream:
            stream.seek(start)
            remaining = length
            while remaining:
                chunk = stream.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def _json(self, payload: t.Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        if (
            self.server.access_token
            and self.headers.get("X-Annotation-Token") == self.server.access_token
        ):
            self.send_header(
                "Set-Cookie",
                f"annotation_access={self.server.access_token}; Path=/; "
                "HttpOnly; SameSite=Strict",
            )
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _export(self, path: str) -> None:
        rows = self.server.store.export_rows()
        if path.endswith(".jsonl"):
            data = "".join(json.dumps(row) + "\n" for row in rows).encode("utf-8")
            content_type = "application/x-ndjson"
            filename = "annotation-revisions.jsonl"
        else:
            output = io.StringIO()
            if rows:
                writer = csv.DictWriter(output, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            data = output.getvalue().encode("utf-8")
            content_type = "text/csv"
            filename = "annotation-revisions.csv"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class AnnotationServer(ThreadingHTTPServer):
    """Threading server carrying experiment and persistence context."""

    def __init__(
        self,
        port: int,
        experiment_root: Path,
        store: AnnotationStore,
        host: str = "127.0.0.1",
        access_token: str | None = None,
    ):
        self.experiment_root = experiment_root.resolve()
        self.static_root = Path(__file__).with_name("static").resolve()
        self.store = store
        self.access_token = access_token
        super().__init__((host, port), AnnotationHandler)


def _is_loopback_host(host: str) -> bool:
    """Return whether *host* only accepts local connections."""

    if host.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _valid_access_code(value: str) -> bool:
    """Return whether a LAN access code has the six-character phone-friendly format."""

    return bool(ACCESS_CODE_PATTERN.fullmatch(value))


def main() -> None:
    """Start the annotation server, local-only unless explicitly protected."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment-root", type=Path, required=True)
    parser.add_argument("--database", type=Path, default=None)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind address (default: 127.0.0.1). A LAN address requires --access-token.",
    )
    parser.add_argument(
        "--access-token",
        default=None,
        help="Six-character uppercase letter/number code required for a non-loopback --host.",
    )
    args = parser.parse_args()
    if not _is_loopback_host(args.host) and not args.access_token:
        parser.error("a non-loopback --host requires --access-token")
    if args.access_token and not _valid_access_code(args.access_token):
        parser.error("--access-token must be exactly 6 uppercase letters or numbers")
    manifest_path = args.experiment_root / "annotation_tasks.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    database = args.database or args.experiment_root / "annotations.sqlite3"
    store = AnnotationStore(database, manifest)
    server = AnnotationServer(
        args.port, args.experiment_root, store, args.host, args.access_token
    )
    print(f"Annotation tool: http://{args.host}:{args.port}")
    if args.access_token:
        print("Access token protection is enabled for API and participant-media routes.")
    print(f"Database: {database}")
    server.serve_forever()


if __name__ == "__main__":
    main()
