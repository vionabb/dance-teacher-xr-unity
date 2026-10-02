"""Build a source-faithful, local manual-review catalog and frozen pose release.

Run from ``motion-pipeline``. Inputs are read-only; outputs live below the
Git-ignored ``local-data/manual-review`` root. The original annotation SQLite
files are always captured with SQLite's backup API, including live WAL data.
"""

from __future__ import annotations

import argparse
from collections import Counter
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
import typing as t


PIPELINE = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = PIPELINE / "local-data/manual-review"
ACTIVE_ID = "video-first-20260923"
SOURCE_CONFIG: dict[str, dict[str, t.Any]] = {
    ACTIVE_ID: {
        "database": "temp/experiments/20260923-video-first-001/annotations.sqlite3",
        "manifests": [
            "temp/experiments/20260929-frame-usability-correctable-203/annotation_tasks.json",
            "temp/experiments/20260923-video-first-001/annotation_tasks.json",
        ],
    },
    "preprocessing-overlay-quality": {
        "database": "data/human-annotations/preprocessing-overlay-quality/annotations.sqlite3",
        "manifests": [
            "temp/experiments/20260825-preprocessing-cleanup-v10/annotation_tasks.json",
            "temp/experiments/20260826-c4-smoothing-temporal-v1/annotation_tasks.json",
            "temp/experiments/20260828-quality-triage-batch-v1/annotation_tasks.json",
        ],
    },
    "quality-triage": {
        "database": "data/human-annotations/quality-triage/annotations.sqlite3",
        "manifests": ["temp/experiments/20260828-quality-triage-batch-v1/annotation_tasks.json"],
    },
    "three-stage-20260922": {
        "database": "temp/experiments/20260922-three-stage-batch-001/annotations.sqlite3",
        "manifests": ["temp/experiments/20260922-three-stage-batch-001/annotation_tasks.json"],
    },
}


def sha256(path: Path) -> str:
    """Return the SHA-256 of a file without loading it all into memory."""

    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_text(value: t.Any) -> str:
    """Encode catalog JSON consistently for repeated imports."""

    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def relative(root: Path, path: Path) -> str:
    """Return a portable path below the canonical corpus root."""

    return path.relative_to(root).as_posix()


def immutable_copy(source: Path, destination: Path, expected: str) -> None:
    """Store immutable source bytes once and reject an existing hash mismatch."""

    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if sha256(destination) != expected:
            raise ValueError(f"Existing immutable artifact has wrong hash: {destination}")
        return
    temporary = destination.with_name(destination.name + f".tmp-{os.getpid()}")
    try:
        shutil.copyfile(source, temporary)
        if sha256(temporary) != expected:
            raise ValueError(f"Input changed while copying: {source}")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def snapshot_database(source: Path, root: Path, source_id: str) -> dict[str, t.Any]:
    """Use SQLite backup API, refresh a stable snapshot, and retain a hash blob."""

    if not source.is_file():
        raise FileNotFoundError(source)
    destination = root / "sources" / source_id / "annotations.sqlite3"
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".annotations-{os.getpid()}.sqlite3")
    try:
        with sqlite3.connect(f"file:{source.resolve()}?mode=ro", uri=True) as live:
            with sqlite3.connect(temporary) as backup:
                live.backup(backup)
        digest = sha256(temporary)
        blob = root / "sources" / "blobs" / f"{digest}.sqlite3"
        immutable_copy(temporary, blob, digest)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    with sqlite3.connect(f"file:{destination}?mode=ro", uri=True) as connection:
        count = connection.execute("SELECT COUNT(*) FROM judgment_revisions").fetchone()[0]
    return {
        "source_id": source_id,
        "original_path": str(source.resolve()),
        "original_db_file_sha256": sha256(source),
        "snapshot_path": relative(root, destination),
        "snapshot_blob_path": relative(root, blob),
        "snapshot_sha256": digest,
        "revision_count": count,
    }


def register_manifests(root: Path, source_id: str, paths: list[Path]) -> list[dict[str, t.Any]]:
    """Preserve each exact task manifest by hash and keep declared precedence."""

    records = []
    for precedence, source in enumerate(paths):
        if not source.is_file():
            raise FileNotFoundError(source)
        digest = sha256(source)
        target = root / "sources" / "manifests" / f"{digest}.json"
        immutable_copy(source, target, digest)
        manifest = json.loads(target.read_text())
        records.append({
            "source_id": source_id,
            "precedence": precedence,
            "original_path": str(source.resolve()),
            "snapshot_path": relative(root, target),
            "sha256": digest,
            "experiment_id": manifest["experiment_id"],
            "task_count": len(manifest.get("tasks", [])),
            "manifest": manifest,
            "artifact_root": source.parent,
        })
    return records


CATALOG_SQL = """
PRAGMA foreign_keys=ON;
CREATE TABLE source_databases (
  source_id TEXT PRIMARY KEY, original_path TEXT NOT NULL, original_db_file_sha256 TEXT NOT NULL,
  snapshot_path TEXT NOT NULL, snapshot_blob_path TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL, revision_count INTEGER NOT NULL
);
CREATE TABLE source_manifests (
  source_id TEXT NOT NULL, manifest_sha256 TEXT NOT NULL, precedence INTEGER NOT NULL,
  original_path TEXT NOT NULL, snapshot_path TEXT NOT NULL, experiment_id TEXT NOT NULL,
  task_count INTEGER NOT NULL, PRIMARY KEY(source_id, manifest_sha256)
);
CREATE TABLE task_definitions (
  source_id TEXT NOT NULL, manifest_sha256 TEXT NOT NULL, experiment_id TEXT NOT NULL,
  task_id TEXT NOT NULL, case_id TEXT, task_type TEXT, task_json TEXT NOT NULL,
  PRIMARY KEY(source_id, manifest_sha256, experiment_id, task_id)
);
CREATE TABLE revisions (
  source_id TEXT NOT NULL, revision_id INTEGER NOT NULL, experiment_id TEXT NOT NULL,
  annotator TEXT NOT NULL, task_id TEXT NOT NULL, case_id TEXT, task_type TEXT,
  status TEXT NOT NULL, created_at TEXT, supersedes_revision_id INTEGER,
  row_json TEXT NOT NULL, PRIMARY KEY(source_id, revision_id)
);
CREATE INDEX revisions_by_task ON revisions(source_id, experiment_id, annotator, task_id, revision_id);
CREATE VIEW latest_effective_reviews AS
  SELECT * FROM (
    SELECT revisions.*, ROW_NUMBER() OVER (
      PARTITION BY source_id, experiment_id, annotator, task_id ORDER BY revision_id DESC
    ) AS newest_rank FROM revisions
  ) WHERE newest_rank=1;
CREATE TABLE video_assessments (
  source_id TEXT NOT NULL, revision_id INTEGER NOT NULL, rating TEXT,
  override_rating TEXT, note TEXT, video_unusable INTEGER,
  PRIMARY KEY(source_id, revision_id)
);
CREATE TABLE triage_assessments (
  source_id TEXT NOT NULL, revision_id INTEGER NOT NULL, verdict TEXT, note TEXT,
  PRIMARY KEY(source_id, revision_id)
);
CREATE TABLE video_quality_assessments (
  source_id TEXT NOT NULL, revision_id INTEGER NOT NULL, clothing TEXT,
  lighting TEXT, note TEXT, PRIMARY KEY(source_id, revision_id)
);
CREATE TABLE frame_assessments (
  source_id TEXT NOT NULL, revision_id INTEGER NOT NULL, task_frame INTEGER NOT NULL,
  manual_label TEXT NOT NULL, PRIMARY KEY(source_id, revision_id, task_frame)
);
CREATE TABLE automatic_frame_flags (
  source_id TEXT NOT NULL, revision_id INTEGER NOT NULL, task_frame INTEGER NOT NULL,
  flag TEXT NOT NULL, algorithm_provenance TEXT NOT NULL,
  PRIMARY KEY(source_id, revision_id, task_frame, flag)
);
CREATE TABLE landmark_marks (
  source_id TEXT NOT NULL, revision_id INTEGER NOT NULL, mark_index INTEGER NOT NULL,
  landmark TEXT NOT NULL, start_frame INTEGER NOT NULL, end_frame INTEGER NOT NULL,
  causes_json TEXT NOT NULL, note TEXT NOT NULL, positions_json TEXT NOT NULL,
  PRIMARY KEY(source_id, revision_id, mark_index)
);
CREATE TABLE landmark_corrections (
  source_id TEXT NOT NULL, revision_id INTEGER NOT NULL, mark_index INTEGER NOT NULL,
  task_frame INTEGER NOT NULL, source_frame INTEGER, landmark TEXT NOT NULL,
  corrected_x REAL NOT NULL, corrected_y REAL NOT NULL,
  PRIMARY KEY(source_id, revision_id, mark_index, task_frame)
);
CREATE TABLE review_coverage (
  source_id TEXT NOT NULL, revision_id INTEGER NOT NULL, status TEXT NOT NULL,
  review_scope TEXT NOT NULL, declared_frame_count INTEGER, manually_labeled_frames INTEGER NOT NULL,
  mark_count INTEGER NOT NULL, corrected_positions INTEGER NOT NULL,
  implicit_unmarked_no_error INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(source_id, revision_id)
);
CREATE TABLE segment_review_coverage (
  source_id TEXT NOT NULL, segment_id TEXT NOT NULL, recording_id TEXT NOT NULL,
  source_corpus TEXT NOT NULL, source_stem TEXT NOT NULL,
  source_frame_start INTEGER NOT NULL, source_frame_end_exclusive INTEGER NOT NULL,
  video_completed INTEGER NOT NULL, frame_completed INTEGER NOT NULL,
  frame_started INTEGER NOT NULL, completed_frame_labels INTEGER NOT NULL,
  completed_corrections INTEGER NOT NULL, metric_ready_frame_review INTEGER NOT NULL,
  task_ids_json TEXT NOT NULL, PRIMARY KEY(source_id, segment_id)
);
CREATE TABLE recording_review_coverage (
  source_id TEXT NOT NULL, recording_id TEXT NOT NULL, source_corpus TEXT NOT NULL,
  source_stem TEXT NOT NULL, segment_count INTEGER NOT NULL,
  video_completed_segments INTEGER NOT NULL, frame_completed_segments INTEGER NOT NULL,
  metric_ready_frame_segments INTEGER NOT NULL, completed_corrections INTEGER NOT NULL,
  PRIMARY KEY(source_id, recording_id)
);
"""


def parse_json_field(row: dict[str, t.Any], name: str) -> dict[str, t.Any]:
    """Decode one optional historical response without changing the raw row."""

    try:
        value = json.loads(row.get(name) or "{}")
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def populate_review_tables(connection: sqlite3.Connection, source_id: str, row: dict[str, t.Any]) -> None:
    """Index normalized review fields while retaining the full original row."""

    revision = int(row["revision_id"])
    error = parse_json_field(row, "error_marking_response_json")
    frame = parse_json_field(row, "frame_usability_response_json")
    video_rating = error.get("video_usability_rating") or None
    override = frame.get("video_usability_rating_override") or None
    note = frame.get("note") or error.get("note") or row.get("notes") or ""
    if video_rating or override or row.get("task_type") == "video_usability_triage":
        connection.execute(
            "INSERT INTO video_assessments VALUES (?,?,?,?,?,?)",
            (source_id, revision, video_rating, override, str(note), int(bool(error.get("video_unusable")))),
        )
    triage = parse_json_field(row, "triage_response_json")
    if row.get("task_type") == "quality_triage" or triage.get("verdict"):
        connection.execute(
            "INSERT INTO triage_assessments VALUES (?,?,?,?)",
            (source_id, revision, triage.get("verdict"), triage.get("note")),
        )
    quality = parse_json_field(row, "quality_rating_response_json")
    if row.get("task_type") == "video_quality_rating" or quality.get("clothing") or quality.get("lighting"):
        connection.execute(
            "INSERT INTO video_quality_assessments VALUES (?,?,?,?,?)",
            (source_id, revision, quality.get("clothing"), quality.get("lighting"), quality.get("note")),
        )
    labels = frame.get("labels") or frame.get("ratings") or {}
    if isinstance(labels, dict):
        for key, label in labels.items():
            if str(key).isdigit() and isinstance(label, str):
                connection.execute("INSERT INTO frame_assessments VALUES (?,?,?,?)", (source_id, revision, int(key), label))
    auto = frame.get("automatic_missing_pose_frames") or []
    if isinstance(auto, list):
        for item in auto:
            if type(item) is int:
                connection.execute(
                    "INSERT OR IGNORE INTO automatic_frame_flags VALUES (?,?,?,?,?)",
                    (source_id, revision, item, "missing_pose", "annotation_tool-derived; version not stored in revision"),
                )
    marks = frame.get("marks") if row.get("task_type") == "frame_usability" else error.get("marks")
    if not isinstance(marks, list):
        marks = []
    correction_count = 0
    for index, mark in enumerate(marks):
        if not isinstance(mark, dict):
            continue
        landmark = str(mark.get("body_part", ""))
        positions = mark.get("positions") if isinstance(mark.get("positions"), dict) else {}
        connection.execute(
            "INSERT INTO landmark_marks VALUES (?,?,?,?,?,?,?,?,?)",
            (source_id, revision, index, landmark, int(mark.get("start_frame") or 0),
             int(mark.get("end_frame") or 0), json_text(mark.get("causes", [])),
             str(mark.get("note", "")), json_text(positions)),
        )
        for key, point in positions.items():
            if not str(key).isdigit() or not isinstance(point, (list, tuple)) or len(point) != 2:
                continue
            try:
                x, y = float(point[0]), float(point[1])
            except (TypeError, ValueError):
                continue
            if not (math.isfinite(x) and math.isfinite(y)):
                continue
            connection.execute(
                "INSERT INTO landmark_corrections VALUES (?,?,?,?,?,?,?,?)",
                (source_id, revision, index, int(key), None, landmark, x, y),
            )
            correction_count += 1
    frame_window = parse_json_field(row, "frame_window_json")
    declared = frame_window.get("frame_count") or frame_window.get("end_frame")
    connection.execute(
        "INSERT INTO review_coverage VALUES (?,?,?,?,?,?,?, ?,0)",
        (source_id, revision, row["status"], row.get("task_type") or "unknown",
         int(declared) if isinstance(declared, int) else None,
         len(labels) if isinstance(labels, dict) else 0, len(marks), correction_count),
    )


def rebuild_catalog(root: Path, sources: list[dict[str, t.Any]], manifests: list[dict[str, t.Any]]) -> dict[str, int]:
    """Rebuild a source-aware SQLite read model without touching authoring DBs."""

    catalog = root / "catalog.sqlite3"
    temporary = catalog.with_name(f".catalog-{os.getpid()}.sqlite3")
    temporary.unlink(missing_ok=True)
    counts: dict[str, int] = {}
    try:
        with sqlite3.connect(temporary) as output:
            output.executescript(CATALOG_SQL)
            for source in sources:
                output.execute(
                    "INSERT INTO source_databases VALUES (?,?,?,?,?,?,?)",
                    tuple(source[key] for key in (
                        "source_id", "original_path", "original_db_file_sha256", "snapshot_path",
                        "snapshot_blob_path", "snapshot_sha256", "revision_count",
                    )),
                )
            for manifest in manifests:
                output.execute(
                    "INSERT INTO source_manifests VALUES (?,?,?,?,?,?,?)",
                    tuple(manifest[key] for key in (
                        "source_id", "sha256", "precedence", "original_path", "snapshot_path",
                        "experiment_id", "task_count",
                    )),
                )
                for task in manifest["manifest"].get("tasks", []):
                    output.execute(
                        "INSERT INTO task_definitions VALUES (?,?,?,?,?,?,?)",
                        (manifest["source_id"], manifest["sha256"], manifest["experiment_id"],
                         str(task["task_id"]), str(task.get("case_id", "")),
                         str(task.get("task_type", manifest["manifest"].get("task_type", ""))), json_text(task)),
                    )
            for source in sources:
                count = 0
                snapshot = root / source["snapshot_path"]
                with sqlite3.connect(f"file:{snapshot}?mode=ro", uri=True) as original:
                    original.row_factory = sqlite3.Row
                    for raw_row in original.execute("SELECT * FROM judgment_revisions ORDER BY revision_id"):
                        row = dict(raw_row)
                        output.execute(
                            "INSERT INTO revisions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            (source["source_id"], row["revision_id"], row["experiment_id"],
                             row["annotator"], row["task_id"], row.get("case_id"),
                             row.get("task_type"), row["status"], row.get("created_at"),
                             row.get("supersedes_revision_id"), json_text(row)),
                        )
                        populate_review_tables(output, source["source_id"], row)
                        resolved = task_resolution(manifests, source["source_id"], row)
                        if resolved is not None and "source_frame_start" in resolved[1]:
                            _, resolved_task = resolved
                            output.execute(
                                "UPDATE landmark_corrections SET source_frame=? + task_frame "
                                "WHERE source_id=? AND revision_id=?",
                                (int(resolved_task["source_frame_start"]), source["source_id"], row["revision_id"]),
                            )
                        count += 1
                if count != source["revision_count"]:
                    raise ValueError(f"Source revision count changed during import: {source['source_id']}")
                counts[source["source_id"]] = count
        os.replace(temporary, catalog)
    finally:
        temporary.unlink(missing_ok=True)
    return counts


def task_resolution(manifests: list[dict[str, t.Any]], source_id: str, row: dict[str, t.Any]) -> tuple[dict[str, t.Any], dict[str, t.Any]] | None:
    """Resolve a revision to a case-matching task using source manifest order."""

    for record in sorted((m for m in manifests if m["source_id"] == source_id), key=lambda m: m["precedence"]):
        if record["experiment_id"] != row["experiment_id"]:
            continue
        task = next((task for task in record["manifest"].get("tasks", [])
                     if task["task_id"] == row["task_id"] and str(task.get("case_id")) == str(row.get("case_id"))), None)
        if task is not None:
            return record, task
    return None


def case_provenance(record: dict[str, t.Any], task: dict[str, t.Any]) -> dict[str, t.Any] | None:
    """Find the original video's pinned raw-pose provenance for a task case."""

    cases = record["manifest"].get("input_provenance", {})
    value = cases.get(str(task.get("case_id")))
    if value:
        return value
    parent_id = task.get("parent_video_task_id")
    if parent_id:
        parent = next((item for item in record["manifest"].get("tasks", []) if item["task_id"] == parent_id), None)
        if parent:
            return cases.get(str(parent.get("case_id")))
    return None


def archived_raw(root: Path, source: Path, expected_hash: str) -> tuple[Path, str]:
    """Verify the declared raw pose and archive its exact bytes by hash."""

    if not source.is_file():
        raise FileNotFoundError(source)
    actual = sha256(source)
    if actual != expected_hash:
        raise ValueError(f"raw pose hash differs from annotation manifest: {source}")
    target = root / "poses" / "raw" / actual / "pose2d.raw.csv"
    immutable_copy(source, target, actual)
    return target, actual


def archive_active_raw_manifest(root: Path, manifests: list[dict[str, t.Any]]) -> list[dict[str, t.Any]]:
    """Archive every raw pose pinned by the active 154-case source manifest."""

    active = min((item for item in manifests if item["source_id"] == ACTIVE_ID), key=lambda item: item["precedence"])
    archived: dict[tuple[str, str], dict[str, t.Any]] = {}
    verified_videos: set[tuple[str, str]] = set()
    for case_id, provenance in active["manifest"].get("input_provenance", {}).items():
        source = Path(provenance["raw_pose_path"])
        expected = provenance["raw_pose_sha256"]
        target, digest = archived_raw(root, source, expected)
        video = Path(provenance["source_video_path"])
        video_digest = str(provenance["source_video_sha256"])
        video_key = (str(video.resolve()), video_digest)
        if video_key not in verified_videos:
            if not video.is_file() or sha256(video) != video_digest:
                raise ValueError(f"Source video absent or hash differs from manifest: {video}")
            verified_videos.add(video_key)
        key = (str(source.resolve()), digest)
        item = archived.setdefault(key, {
            "raw_pose_path": relative(root, target), "raw_pose_sha256": digest,
            "original_path": str(source.resolve()), "source_video_sha256": video_digest,
            "source_video_original_path": str(video.resolve()), "case_ids": [],
        })
        item["case_ids"].append(case_id)
    return sorted(archived.values(), key=lambda item: item["original_path"])


def alignment_rows(
    task: dict[str, t.Any], artifact: dict[str, t.Any], raw: Path,
    *, require_comparable: bool = True,
) -> tuple[list[dict[str, str]], list[str], int]:
    """Require a complete source-frame window and exact UI-to-raw pixel match."""

    if artifact.get("pose_source") != "raw_pose2d_image_pixels_no_repair":
        raise ValueError("UI pose source is not pinned raw image-space pose2d")
    window = artifact.get("source_window") or {}
    start, end = int(window.get("start_frame", -1)), int(window.get("end_frame", -1))
    if (start, end) != (int(task.get("source_frame_start", -2)), int(task.get("source_frame_end_exclusive", -2))):
        raise ValueError("UI pose window differs from task source-frame window")
    if end - start != int(task["frame_count"]):
        raise ValueError("UI pose window length differs from task frame_count")
    if artifact.get("source_dimensions") != task.get("source_dimensions"):
        raise ValueError("UI source dimensions differ from task")
    frames = artifact.get("frames")
    if not isinstance(frames, list) or len(frames) != end - start:
        raise ValueError("UI landmark frame count differs from task")
    with raw.open(newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = reader.fieldnames or []
        if "frame" not in fieldnames:
            raise ValueError("raw pose CSV lacks frame index")
        by_frame: dict[int, dict[str, str]] = {}
        for row in reader:
            frame = int(row["frame"])
            if frame in by_frame:
                raise ValueError("raw pose CSV contains duplicate source frames")
            by_frame[frame] = row
    if any(frame not in by_frame for frame in range(start, end)):
        raise ValueError("raw pose CSV lacks one or more annotated source frames")
    selected = [by_frame[frame].copy() for frame in range(start, end)]
    compared = 0
    for task_frame, points in enumerate(frames):
        if not isinstance(points, dict):
            raise ValueError("UI landmark frame is not an object")
        row = selected[task_frame]
        for landmark, point in points.items():
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError("UI landmark coordinate is not an [x,y] pair")
            columns = (f"{landmark}_x", f"{landmark}_y")
            if not all(column in fieldnames for column in columns):
                raise ValueError(f"UI landmark absent from raw schema: {landmark}")
            try:
                raw_x, raw_y = float(row[columns[0]]), float(row[columns[1]])
                ui_x, ui_y = float(point[0]), float(point[1])
            except (TypeError, ValueError):
                raise ValueError(f"UI/raw landmark has nonnumeric coordinates: {landmark}") from None
            if not all(math.isfinite(value) for value in (raw_x, raw_y, ui_x, ui_y)):
                raise ValueError(f"UI/raw landmark has nonfinite coordinates: {landmark}")
            if abs(raw_x - ui_x) > 1e-6 or abs(raw_y - ui_y) > 1e-6:
                raise ValueError(f"UI/raw pixel coordinate mismatch at frame {start + task_frame} {landmark}")
            compared += 1
    if compared == 0 and require_comparable:
        raise ValueError("UI contains no comparable landmarks; alignment is unverified")
    return selected, fieldnames, compared


def corrections_for(row: dict[str, t.Any], frame_count: int) -> list[dict[str, t.Any]]:
    """Extract only explicit human-moved 2D landmark positions from a revision."""

    response = parse_json_field(row, "frame_usability_response_json") if row.get("task_type") == "frame_usability" else parse_json_field(row, "error_marking_response_json")
    marks = response.get("marks") or []
    if not isinstance(marks, list):
        raise ValueError("correction marks are not a list")
    coordinates: dict[tuple[int, str], dict[str, t.Any]] = {}
    for index, mark in enumerate(marks):
        if not isinstance(mark, dict):
            raise ValueError("correction mark is not an object")
        landmark = str(mark.get("body_part", ""))
        positions = mark.get("positions") or {}
        if not isinstance(positions, dict):
            raise ValueError("correction positions are not an object")
        for key, point in positions.items():
            if not str(key).isdigit() or not isinstance(point, list) or len(point) != 2:
                raise ValueError("correction position is malformed")
            task_frame = int(key)
            if task_frame >= frame_count:
                raise ValueError("correction frame is outside task")
            x, y = float(point[0]), float(point[1])
            if not (math.isfinite(x) and math.isfinite(y)):
                raise ValueError("correction position is nonfinite")
            entry = {"task_frame": task_frame, "landmark": landmark, "x": x, "y": y,
                     "mark_index": index, "causes": mark.get("causes", []), "mark_note": mark.get("note", "")}
            previous = coordinates.get((task_frame, landmark))
            if previous and (previous["x"], previous["y"]) != (x, y):
                raise ValueError("conflicting corrections for the same frame and landmark")
            coordinates[(task_frame, landmark)] = entry
    return sorted(coordinates.values(), key=lambda item: (item["task_frame"], item["landmark"]))


def split_for(corpus: str, source_stem: str, recording_id: str) -> tuple[str, str]:
    """Record a leakage-safe grouping key without assigning an evaluation split."""

    match = re.match(r"user([0-9]+)", source_stem)
    group = f"{corpus}:user{match.group(1)}" if match else recording_id
    return group, "not_assigned"


def materialize_review(
    root: Path, stage: Path, task: dict[str, t.Any], row: dict[str, t.Any],
    record: dict[str, t.Any], provenance: dict[str, t.Any], source_id: str, release_id: str,
    *, write_reviewed: bool,
) -> dict[str, t.Any]:
    """Archive an aligned review; write pose CSV only for completed frame work."""

    source = Path(provenance["raw_pose_path"])
    raw, raw_hash = archived_raw(root, source, provenance["raw_pose_sha256"])
    relative_artifact = Path(task["landmarks_artifact"])
    if relative_artifact.is_absolute() or ".." in relative_artifact.parts:
        raise ValueError("Unsafe landmarks artifact path")
    ui_path = record["artifact_root"] / relative_artifact
    if not ui_path.is_file():
        raise ValueError("UI landmarks artifact missing")
    ui_hash = sha256(ui_path)
    declared_hash = record["manifest"].get("artifact_sha256", {}).get(str(relative_artifact))
    if declared_hash and declared_hash != ui_hash:
        raise ValueError("UI landmarks hash differs from manifest")
    video_hash = str(provenance.get("source_video_sha256", ""))
    if not re.fullmatch(r"[0-9a-f]{64}", video_hash):
        raise ValueError("source video hash not pinned")
    video_path = Path(provenance.get("source_video_path", ""))
    if not video_path.is_file() or sha256(video_path) != video_hash:
        raise ValueError("source video absent or hash differs from manifest")
    artifact = json.loads(ui_path.read_text())
    alignment_reason: str | None = None
    try:
        rows, fieldnames, compared = alignment_rows(task, artifact, raw, require_comparable=write_reviewed)
        if (int(provenance["source_frame_start"]), int(provenance["source_frame_end_exclusive"])) != (
            int(task["source_frame_start"]), int(task["source_frame_end_exclusive"])
        ):
            raise ValueError("input_provenance source window differs from task")
    except ValueError as error:
        if write_reviewed:
            raise
        # A video rating is valid human history even if the accompanying pose
        # is truncated or cannot be aligned. It never produces a reviewed pose.
        rows, fieldnames, compared = [], [], 0
        alignment_reason = str(error)
    alignment_status = (
        "incomplete_raw_pose" if alignment_reason == "raw pose CSV lacks one or more annotated source frames" else
        "unverified_alignment_mismatch" if alignment_reason else
        "validated_coordinates" if compared else "unverified_no_landmarks"
    )
    corrections = corrections_for(row, len(rows)) if write_reviewed else []
    applied: list[dict[str, t.Any]] = []
    for item in corrections:
        frame, landmark = item["task_frame"], item["landmark"]
        x_name, y_name = f"{landmark}_x", f"{landmark}_y"
        if x_name not in fieldnames or y_name not in fieldnames:
            raise ValueError(f"corrected landmark absent from raw schema: {landmark}")
        target = rows[frame]
        original_x, original_y = target[x_name], target[y_name]
        target[x_name], target[y_name] = repr(item["x"]), repr(item["y"])
        applied.append({**item, "source_frame": int(target["frame"]),
                        "original_x": original_x, "original_y": original_y,
                        "corrected_x": target[x_name], "corrected_y": target[y_name],
                        "source_id": source_id, "revision_id": row["revision_id"]})
    reviewed_path: Path | None = None
    if write_reviewed:
        name = re.sub(r"[^A-Za-z0-9_.-]", "_", str(task["task_id"]))
        reviewed_path = stage / f"{name}.pose2d.reviewed.csv"
        try:
            with reviewed_path.open("w", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(rows)
            with reviewed_path.open(newline="") as stream:
                reread = list(csv.DictReader(stream))
            if len(reread) != len(rows) or any(reread[i] != item for i, item in enumerate(rows)):
                raise ValueError("reviewed CSV roundtrip changed uncorrected cells")
        except Exception:
            reviewed_path.unlink(missing_ok=True)
            raise
    corpus, stem = str(task["source_corpus"]), str(task["source_stem"])
    recording_id = hashlib.sha256(f"{corpus}|{stem}|{video_hash}".encode()).hexdigest()
    start, end = int(task["source_frame_start"]), int(task["source_frame_end_exclusive"])
    segment_id = hashlib.sha256(f"{recording_id}|{start}:{end}".encode()).hexdigest()
    split_group, split = split_for(corpus, stem, recording_id)
    frame_response = parse_json_field(row, "frame_usability_response_json")
    error_response = parse_json_field(row, "error_marking_response_json")
    return {
        "source_id": source_id, "experiment_id": row["experiment_id"],
        "source_manifest_sha256": record["sha256"],
        "revision_id": row["revision_id"], "created_at": row.get("created_at"),
        "annotator": row["annotator"],
        "task_id": row["task_id"], "task_type": row["task_type"], "status": row["status"],
        "recording_id": recording_id, "segment_id": segment_id,
        "source_corpus": corpus, "source_stem": stem,
        "source_video_sha256": video_hash, "raw_pose_artifact_id": raw_hash,
        "raw_pose_path": relative(root, raw), "raw_pose_sha256": raw_hash,
        "reviewed_pose_path": f"poses/reviewed/{release_id}/{reviewed_path.name}" if reviewed_path else None,
        "reviewed_pose_sha256": sha256(reviewed_path) if reviewed_path else None,
        "ui_landmarks_sha256": ui_hash, "ui_compared_landmarks": compared,
        "pose_alignment_validation": alignment_status,
        "pose_alignment_reason": alignment_reason,
        "source_frame_start": start, "source_frame_end_exclusive": end,
        "source_dimensions": task["source_dimensions"],
        "coordinate_system": "source_image_pixels_pose2d",
        "frame_count": int(task["frame_count"]), "correction_count": len(applied),
        "corrections": applied,
        "manual_frame_labels": frame_response.get("labels", {}),
        "automatic_missing_pose_frames": frame_response.get("automatic_missing_pose_frames", []),
        "manual_bad_frames": error_response.get("bad_frames", []),
        "manual_usable_frames": error_response.get("usable_frames", []),
        "video_usability_rating": error_response.get("video_usability_rating"),
        "video_usability_rating_override": frame_response.get("video_usability_rating_override"),
        "split_group": split_group, "split": split,
        "review_scope": "frame_and_landmark" if write_reviewed else "video_only",
        "unmarked_landmarks_independently_verified": False,
    }


def segment_coverage(
    latest: list[dict[str, t.Any]], manifests: list[dict[str, t.Any]], source_id: str,
) -> list[dict[str, t.Any]]:
    """Summarize source-scoped latest reviews by exact recording and frame window."""

    segments: dict[str, dict[str, t.Any]] = {}
    for entry in latest:
        row = json.loads(entry["row_json"])
        resolved = task_resolution(manifests, source_id, row)
        if resolved is None:
            continue
        record, task = resolved
        provenance = case_provenance(record, task)
        if not provenance or not provenance.get("source_video_sha256"):
            continue
        corpus, stem = str(task.get("source_corpus", "")), str(task.get("source_stem", ""))
        video_hash = str(provenance["source_video_sha256"])
        recording_id = hashlib.sha256(f"{corpus}|{stem}|{video_hash}".encode()).hexdigest()
        start, end = int(task["source_frame_start"]), int(task["source_frame_end_exclusive"])
        segment_id = hashlib.sha256(f"{recording_id}|{start}:{end}".encode()).hexdigest()
        item = segments.setdefault(segment_id, {
            "source_id": source_id, "segment_id": segment_id, "recording_id": recording_id,
            "source_corpus": corpus, "source_stem": stem,
            "source_frame_start": start, "source_frame_end_exclusive": end,
            "video_completed": 0, "frame_completed": 0, "frame_started": 0,
            "completed_frame_labels": 0, "completed_corrections": 0,
            "metric_ready_frame_review": 0, "task_ids": [],
        })
        item["task_ids"].append(str(row["task_id"]))
        task_type, status = row.get("task_type"), row.get("status")
        if task_type == "video_usability_triage" and status == "completed":
            item["video_completed"] += 1
        if task_type in {"frame_usability", "error_marking"}:
            if status == "completed":
                item["frame_completed"] += 1
                response = parse_json_field(row, "frame_usability_response_json") if task_type == "frame_usability" else parse_json_field(row, "error_marking_response_json")
                labels = response.get("labels") or {}
                item["completed_frame_labels"] += len(labels) if isinstance(labels, dict) else 0
                try:
                    item["completed_corrections"] += len(corrections_for(row, end - start))
                except (ValueError, TypeError):
                    # The complete revision remains in the catalog; release validation reports the failure.
                    pass
            elif status == "started":
                item["frame_started"] += 1
    return sorted(segments.values(), key=lambda item: (item["source_corpus"], item["source_stem"], item["source_frame_start"]))


def store_segment_coverage(root: Path, coverage: list[dict[str, t.Any]], recordings: list[dict[str, t.Any]]) -> None:
    """Put the same segment summary in the queryable catalog."""

    with sqlite3.connect(root / "catalog.sqlite3") as catalog:
        for item in coverage:
            catalog.execute(
                "INSERT INTO segment_review_coverage VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (item["source_id"], item["segment_id"], item["recording_id"], item["source_corpus"],
                 item["source_stem"], item["source_frame_start"], item["source_frame_end_exclusive"],
                 item["video_completed"], item["frame_completed"], item["frame_started"],
                 item["completed_frame_labels"], item["completed_corrections"],
                 item["metric_ready_frame_review"], json_text(item["task_ids"])),
            )
        for item in recordings:
            catalog.execute(
                "INSERT INTO recording_review_coverage VALUES (?,?,?,?,?,?,?,?,?)",
                (item["source_id"], item["recording_id"], item["source_corpus"], item["source_stem"],
                 item["segment_count"], item["video_completed_segments"], item["frame_completed_segments"],
                 item["metric_ready_frame_segments"], item["completed_corrections"]),
            )


def recording_coverage(segments: list[dict[str, t.Any]]) -> list[dict[str, t.Any]]:
    """Aggregate exact segment coverage at the source recording level."""

    recordings: dict[str, dict[str, t.Any]] = {}
    for segment in segments:
        item = recordings.setdefault(segment["recording_id"], {
            "source_id": segment["source_id"], "recording_id": segment["recording_id"],
            "source_corpus": segment["source_corpus"], "source_stem": segment["source_stem"],
            "segment_count": 0, "video_completed_segments": 0, "frame_completed_segments": 0,
            "metric_ready_frame_segments": 0, "completed_corrections": 0,
        })
        item["segment_count"] += 1
        item["video_completed_segments"] += int(segment["video_completed"] > 0)
        item["frame_completed_segments"] += int(segment["frame_completed"] > 0)
        item["metric_ready_frame_segments"] += segment["metric_ready_frame_review"]
        item["completed_corrections"] += segment["completed_corrections"]
    return sorted(recordings.values(), key=lambda item: (item["source_corpus"], item["source_stem"]))


def release_current(
    root: Path, release_id: str, sources: list[dict[str, t.Any]],
    manifests: list[dict[str, t.Any]], counts: dict[str, int],
) -> dict[str, t.Any]:
    """Freeze eligible completed active reviews, reporting every exclusion."""

    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", release_id):
        raise ValueError("release_id must be 1-64 letters, digits, underscores, or hyphens")
    final_reviewed = root / "poses" / "reviewed" / release_id
    final_release = root / "releases" / release_id
    if final_reviewed.exists() or final_release.exists():
        raise FileExistsError(f"Release already exists and is immutable: {release_id}")
    stage = root / "poses" / "reviewed" / f".staging-{release_id}-{os.getpid()}"
    stage.mkdir(parents=True, exist_ok=False)
    release_stage = root / "releases" / f".staging-{release_id}-{os.getpid()}"
    release_stage.mkdir(parents=True, exist_ok=False)
    included: list[dict[str, t.Any]] = []
    video_reviews: list[dict[str, t.Any]] = []
    excluded: list[dict[str, t.Any]] = []
    try:
        archived_raw_poses = archive_active_raw_manifest(root, manifests)
        with sqlite3.connect(f"file:{root / 'catalog.sqlite3'}?mode=ro", uri=True) as catalog:
            catalog.row_factory = sqlite3.Row
            all_latest = [dict(item) for item in catalog.execute(
                "SELECT * FROM latest_effective_reviews ORDER BY source_id, revision_id"
            )]
        latest = [entry for entry in all_latest if entry["source_id"] == ACTIVE_ID]
        coverage = segment_coverage(latest, manifests, ACTIVE_ID)
        legacy_exclusions = []
        for entry in all_latest:
            if entry["source_id"] == ACTIVE_ID:
                continue
            row = json.loads(entry["row_json"])
            resolved = task_resolution(manifests, entry["source_id"], row)
            provenance = case_provenance(*resolved) if resolved else None
            reason = (
                "no case-matching source task manifest" if resolved is None else
                "no exact raw pose path/hash in source manifest" if not provenance or not provenance.get("raw_pose_path") or not provenance.get("raw_pose_sha256") else
                "historical review retained in source-aware catalog; raw/UI alignment not established"
            )
            legacy_exclusions.append({"source_id": entry["source_id"], "experiment_id": row["experiment_id"],
                                      "annotator": row["annotator"], "task_id": row["task_id"],
                                      "revision_id": row["revision_id"], "reason": reason})
        logical_sources: dict[tuple[str, str, str], set[str]] = {}
        for entry in all_latest:
            key = (entry["experiment_id"], entry["annotator"], entry["task_id"])
            logical_sources.setdefault(key, set()).add(entry["source_id"])
        cross_source = [
            {"experiment_id": experiment, "annotator": annotator, "task_id": task,
             "source_ids": sorted(source_ids)}
            for (experiment, annotator, task), source_ids in logical_sources.items()
            if len(source_ids) > 1
        ]
        for entry in latest:
            row = json.loads(entry["row_json"])
            resolved = task_resolution(manifests, ACTIVE_ID, row)
            if resolved is None:
                excluded.append({"task_id": row["task_id"], "revision_id": row["revision_id"],
                                 "reason": "no case-matching source task manifest"})
                continue
            record, task = resolved
            if row["status"] != "completed":
                excluded.append({"task_id": row["task_id"], "revision_id": row["revision_id"],
                                 "reason": f"review status {row['status']} is not completed"})
                continue
            if row["task_type"] not in {"video_usability_triage", "frame_usability", "error_marking"}:
                excluded.append({"task_id": row["task_id"], "revision_id": row["revision_id"],
                                 "reason": f"unsupported review type {row['task_type']}"})
                continue
            provenance = case_provenance(record, task)
            if not provenance or not provenance.get("raw_pose_path") or not provenance.get("raw_pose_sha256"):
                excluded.append({"task_id": row["task_id"], "revision_id": row["revision_id"],
                                 "reason": "no exact raw pose path/hash in source manifest"})
                continue
            try:
                result = materialize_review(
                    root, stage, task, row, record, provenance, ACTIVE_ID, release_id,
                    write_reviewed=row["task_type"] in {"frame_usability", "error_marking"},
                )
                (included if result["reviewed_pose_path"] else video_reviews).append(result)
            except (ValueError, KeyError, TypeError, OSError, json.JSONDecodeError) as error:
                candidate = stage / f"{re.sub(r'[^A-Za-z0-9_.-]', '_', str(task['task_id']))}.pose2d.reviewed.csv"
                candidate.unlink(missing_ok=True)
                excluded.append({"task_id": row["task_id"], "revision_id": row["revision_id"],
                                 "reason": str(error)})
        expected_files = {Path(item["reviewed_pose_path"]).name for item in included}
        actual_files = {item.name for item in stage.iterdir() if item.is_file()}
        if actual_files != expected_files:
            raise ValueError(f"Unlisted reviewed pose files: {sorted(actual_files ^ expected_files)}")
        validated_segments = {item["segment_id"] for item in included}
        for item in coverage:
            item["metric_ready_frame_review"] = int(item["segment_id"] in validated_segments)
        recordings = recording_coverage(coverage)
        store_segment_coverage(root, coverage, recordings)
        catalog_digest = sha256(root / "catalog.sqlite3")
        catalog_blob = root / "sources" / "catalog-blobs" / f"{catalog_digest}.sqlite3"
        immutable_copy(root / "catalog.sqlite3", catalog_blob, catalog_digest)
        frozen_sources = [{key: source[key] for key in (
            "source_id", "snapshot_blob_path", "snapshot_sha256", "revision_count"
        )} for source in sources]
        frozen_manifests = [{key: manifest[key] for key in (
            "source_id", "sha256", "snapshot_path", "experiment_id", "task_count"
        )} for manifest in manifests]
        report = {
            "release_id": release_id,
            "source_revision_counts": counts,
            "latest_active_tasks": len(latest),
            "materialized_count": len(included),
            "video_review_count": len(video_reviews),
            "video_pose_alignment_counts": dict(Counter(item["pose_alignment_validation"] for item in video_reviews)),
            "archived_raw_pose_count": len(archived_raw_poses),
            "excluded_count": len(excluded),
            "excluded_reasons": dict(Counter(item["reason"] for item in excluded)),
            "excluded": excluded,
            "status_counts": dict(Counter(entry["status"] for entry in latest)),
            "correction_count": sum(item["correction_count"] for item in included),
            "manual_frame_label_count": sum(len(item["manual_frame_labels"]) for item in included),
            "legacy_latest_excluded_count": len(legacy_exclusions),
            "legacy_excluded_reasons": dict(Counter(item["reason"] for item in legacy_exclusions)),
            "legacy_exclusions": legacy_exclusions,
            "cross_source_logical_overlap_count": len(cross_source),
            "cross_source_logical_overlaps": cross_source,
            "segment_review_coverage": coverage,
            "recording_review_coverage": recordings,
        }
        manifest = {
            "schema_version": "1.0",
            "release_id": release_id,
            "description": "Active video reviews and validated completed frame review pose2d; older histories retained in catalog",
            "source_databases": frozen_sources,
            "source_manifests": frozen_manifests,
            "catalog_revision_counts": counts,
            "catalog_snapshot_path": relative(root, catalog_blob),
            "catalog_snapshot_sha256": catalog_digest,
            "split_policy": "not_assigned; recording/person grouping keys retained for future leakage-safe evaluation",
            "annotation_policy": {
                "manual_labels_are_sparse": True,
                "automatic_missing_pose_is_separate": True,
                "only_explicit_moved_xy_are_applied": True,
                "unmarked_landmarks_are_not_independent_ground_truth": True,
                "started_reviews_are_excluded_from_metric_ready_files": True,
                "video_ratings_survive_incomplete_pose_alignment": True,
            },
            "reviewed_segments": included,
            "video_reviews": video_reviews,
            "archived_raw_poses": archived_raw_poses,
            "segment_review_coverage": coverage,
            "recording_review_coverage": recordings,
            "coverage_report": "coverage.json",
        }
        (release_stage / "coverage.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
        manifest["coverage_sha256"] = sha256(release_stage / "coverage.json")
        (release_stage / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        os.replace(stage, final_reviewed)
        os.replace(release_stage, final_release)
        return report
    finally:
        if stage.exists():
            shutil.rmtree(stage)
        if release_stage.exists():
            shutil.rmtree(release_stage)


def build(root: Path, release_id: str, source_config: dict[str, dict[str, t.Any]]) -> dict[str, t.Any]:
    """Snapshot sources, rebuild the catalog, then freeze an eligible release."""

    root = root.resolve()
    if root.is_symlink():
        raise ValueError("Refusing a symlink corpus root")
    if (root / "releases" / release_id / "manifest.json").exists():
        raise FileExistsError(f"Release already frozen: {release_id}")
    root.mkdir(parents=True, exist_ok=True)
    sources = []
    manifests = []
    for source_id, config in source_config.items():
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", source_id):
            raise ValueError(f"Unsafe source ID: {source_id}")
        db = Path(config["database"])
        if not db.is_absolute():
            db = PIPELINE / db
        sources.append(snapshot_database(db, root, source_id))
        paths = [Path(p) if Path(p).is_absolute() else PIPELINE / p for p in config["manifests"]]
        manifests.extend(register_manifests(root, source_id, paths))
    counts = rebuild_catalog(root, sources, manifests)
    report = release_current(root, release_id, sources, manifests, counts)
    return report


def main() -> None:
    """Parse CLI settings and build one immutable local release."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="Git-ignored canonical corpus root")
    parser.add_argument("--release-id", required=True, help="Immutable release ID")
    parser.add_argument("--sources-json", type=Path, help="Optional source ID to database/manifests mapping JSON")
    args = parser.parse_args()
    config = json.loads(args.sources_json.read_text()) if args.sources_json else SOURCE_CONFIG
    result = build(args.root, args.release_id, config)
    print(json.dumps({key: result[key] for key in (
        "release_id", "source_revision_counts", "latest_active_tasks", "materialized_count", "excluded_count", "correction_count"
    )}, indent=2))


if __name__ == "__main__":
    main()
