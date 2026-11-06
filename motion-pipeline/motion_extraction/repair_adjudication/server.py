"""Serve the blinded repair-adjudication cases with an append-only SQLite record.

This is deliberately separate from ``motion_extraction.annotation_tool``: it
never reads or writes the active annotation database, and it only ever loads
the *blinded* first-pass manifest.  The sealed answer key (selection arm,
midpoint proposal, rule values, inclusion probabilities) must stay unread
while judgments are collected, so every input path is refused if it lies in a
directory named ``sealed`` and the browser only receives an allowlisted
projection of each case.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import ThreadingHTTPServer
import io
import json
import math
from pathlib import Path
import secrets
import sqlite3
import typing as t
from urllib.parse import parse_qs, urlparse

from motion_extraction.annotation_tool.server import (
    AnnotationHandler,
    _is_loopback_host,
    _valid_access_code,
)


PROTOCOL_ID = "repair-adjudication-v2-first-pass"
STORE_SCHEMA_VERSION = "1.0"
# sha256 of the v2 blinded/first_pass_manifest.json written by prepare_sample
# on 2026-11-06, as recorded in
# lab-log/assets/2026-10-06-preprocessing-metric-validation/repair-adjudication-v2-selection.json
# ("blinded_first_pass_sha256"). The October v1 bundle was lost.  The server refuses any other manifest unless
# --allow-unfrozen-manifest is passed (for tests and synthetic dry runs).
FROZEN_BLINDED_MANIFEST_SHA256 = (
    "59805bdb296231d83036132c0feea48db2ad8819af3756a9e1c97fd91f1271c4"
)
VERDICTS = ("acceptable_as_is", "incorrect_correctable", "unjudgeable")
NOTE_MAX_LENGTH = 1000
# Corrected points are normalized to the source image; allow some room
# outside the frame for a landmark that is genuinely out of view.
CORRECTED_POINT_RANGE = (-0.5, 1.5)
LANDMARKS = {
    "LEFT_SHOULDER",
    "RIGHT_SHOULDER",
    "LEFT_ELBOW",
    "RIGHT_ELBOW",
    "LEFT_WRIST",
    "RIGHT_WRIST",
    "LEFT_HIP",
    "RIGHT_HIP",
    "LEFT_KNEE",
    "RIGHT_KNEE",
    "LEFT_ANKLE",
    "RIGHT_ANKLE",
}
# Only these case fields ever reach the browser.  Anything else in the
# manifest (for example corpus or source identifiers) is kept server-side.
PUBLIC_CASE_FIELDS = (
    "blind_id",
    "frame_index",
    "fps",
    "landmark",
    "point",
    "context_points",
)
COOKIE_NAME = "repair_adjudication_access"


class SealedPathError(ValueError):
    """Raised when an input path points into a sealed answer-key directory."""


def refuse_sealed(path: Path, what: str) -> Path:
    """Return the resolved *path*, or raise if any component is ``sealed``.

    Used for the manifest, the media root, every case video, and the database,
    so a mistyped argument cannot load or serve answer-key material.
    """

    resolved = path.expanduser().resolve()
    for part in (*path.expanduser().parts, *resolved.parts):
        if part.lower() == "sealed":
            raise SealedPathError(f"{what} must not be inside a 'sealed' directory: {path}")
    return resolved


def _point(value: t.Any, field: str) -> list[float]:
    """Validate a normalized ``[x, y]`` (or ``{"x", "y"}``) image point."""

    if isinstance(value, dict):
        value = [value.get("x"), value.get("y")]
    if (
        not isinstance(value, (list, tuple))
        or len(value) != 2
        or not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in value)
        or not all(math.isfinite(v) for v in value)
    ):
        raise ValueError(f"{field} must be a finite [x, y] pair")
    return [float(value[0]), float(value[1])]


def load_blinded_manifest(
    manifest_path: Path,
    media_root: Path,
    expected_sha256: str | None = FROZEN_BLINDED_MANIFEST_SHA256,
) -> dict[str, t.Any]:
    """Load and validate the blinded first-pass manifest.

    Expected shape (either a top-level list of cases or ``{"cases": [...]}``)::

        {"blind_id": "B07", "video": "<path under media_root>",
         "frame_index": 412, "fps": 30, "landmark": "LEFT_HIP",
         "point": [0.41, 0.63],            # normalized tracked position
         "context_points": {"LEFT_KNEE": [..]}}   # optional, drawn grey

    Returns ``{"sha256", "cases", "public_cases", "videos"}``.  ``public_cases``
    is the allowlisted, order-preserving projection sent to the browser;
    ``videos`` maps blind ID to a resolved video path under *media_root*.
    The file is only read, never modified.
    """

    manifest_path = refuse_sealed(manifest_path, "manifest")
    media_root = refuse_sealed(media_root, "media root")
    raw = manifest_path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if expected_sha256 is not None and digest != expected_sha256:
        raise ValueError(
            "blinded manifest sha256 does not match the frozen first-pass value "
            f"({digest} != {expected_sha256}); confirm against selection_summary.json "
            "or pass --allow-unfrozen-manifest for a synthetic dry run"
        )
    document = json.loads(raw)
    cases = document.get("cases") if isinstance(document, dict) else document
    if not isinstance(cases, list) or not cases:
        raise ValueError("manifest must contain a non-empty list of cases")
    public_cases: list[dict[str, t.Any]] = []
    videos: dict[str, Path] = {}
    for index, case in enumerate(cases):
        if not isinstance(case, dict):
            raise ValueError(f"case {index} must be an object")
        missing = [f for f in ("blind_id", "video", "frame_index", "fps", "landmark", "point") if f not in case]
        if missing:
            raise ValueError(f"case {index} is missing {', '.join(missing)}")
        blind_id = case["blind_id"]
        if not isinstance(blind_id, str) or not blind_id.strip() or blind_id in videos:
            raise ValueError(f"case {index} needs a unique non-empty string blind_id")
        frame_index = case["frame_index"]
        if not isinstance(frame_index, int) or isinstance(frame_index, bool) or frame_index < 0:
            raise ValueError(f"{blind_id}: frame_index must be a non-negative integer")
        fps = case["fps"]
        if not isinstance(fps, (int, float)) or isinstance(fps, bool) or not math.isfinite(fps) or fps <= 0:
            raise ValueError(f"{blind_id}: fps must be positive")
        if case["landmark"] not in LANDMARKS:
            raise ValueError(f"{blind_id}: unknown landmark {case['landmark']!r}")
        point = _point(case["point"], f"{blind_id}.point")
        context = case.get("context_points") or {}
        if not isinstance(context, dict):
            raise ValueError(f"{blind_id}: context_points must be an object")
        context = {
            name: _point(value, f"{blind_id}.context_points.{name}")
            for name, value in context.items()
            if name in LANDMARKS and name != case["landmark"]
        }
        video = refuse_sealed(media_root / str(case["video"]), f"{blind_id} video")
        try:
            video.relative_to(media_root)
        except ValueError as error:
            raise ValueError(f"{blind_id}: video must be under the media root") from error
        videos[blind_id] = video
        public_cases.append(
            {
                "blind_id": blind_id,
                "frame_index": frame_index,
                "fps": float(fps),
                "landmark": case["landmark"],
                "point": point,
                "context_points": context,
            }
        )
    return {"sha256": digest, "cases": cases, "public_cases": public_cases, "videos": videos}


class AdjudicationStore:
    """Append-only adjudication record, kept apart from the annotation database.

    SQLite triggers reject every UPDATE and DELETE, so each save is a new
    revision and the latest revision per ``(annotator, blind_id)`` is the
    current judgment.  The database is bound to one protocol and one manifest
    hash; opening it with any other manifest, or opening a database created by
    another tool, raises instead of mixing records.
    """

    def __init__(self, database: Path, manifest_sha256: str, blind_ids: t.Iterable[str]):
        self.database = refuse_sealed(database, "database")
        self.manifest_sha256 = manifest_sha256
        self.blind_ids = list(blind_ids)
        self._blind_id_set = set(self.blind_ids)
        existed = self.database.exists() and self.database.stat().st_size > 0
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            if existed:
                self._check_existing(connection)
            else:
                self._create(connection)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database)
        connection.row_factory = sqlite3.Row
        return connection

    def _create(self, connection: sqlite3.Connection) -> None:
        connection.executescript(
            """
            CREATE TABLE adjudication_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE adjudication_revisions (
                revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
                blind_id TEXT NOT NULL,
                annotator TEXT NOT NULL,
                verdict TEXT NOT NULL,
                corrected_x REAL,
                corrected_y REAL,
                note TEXT NOT NULL DEFAULT '',
                viewed_frames_json TEXT NOT NULL DEFAULT '[]',
                client_saved_at TEXT,
                server_saved_at TEXT NOT NULL,
                manifest_sha256 TEXT NOT NULL
            );
            CREATE TRIGGER adjudication_revisions_no_update BEFORE UPDATE ON adjudication_revisions
                BEGIN SELECT RAISE(ABORT, 'adjudication revisions are append-only'); END;
            CREATE TRIGGER adjudication_revisions_no_delete BEFORE DELETE ON adjudication_revisions
                BEGIN SELECT RAISE(ABORT, 'adjudication revisions are append-only'); END;
            CREATE TRIGGER adjudication_meta_no_update BEFORE UPDATE ON adjudication_meta
                BEGIN SELECT RAISE(ABORT, 'adjudication metadata is immutable'); END;
            CREATE TRIGGER adjudication_meta_no_delete BEFORE DELETE ON adjudication_meta
                BEGIN SELECT RAISE(ABORT, 'adjudication metadata is immutable'); END;
            """
        )
        connection.executemany(
            "INSERT INTO adjudication_meta (key, value) VALUES (?, ?)",
            [
                ("protocol_id", PROTOCOL_ID),
                ("store_schema_version", STORE_SCHEMA_VERSION),
                ("manifest_sha256", self.manifest_sha256),
                ("created_at", _now()),
            ],
        )

    def _check_existing(self, connection: sqlite3.Connection) -> None:
        tables = {
            row["name"]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        if "adjudication_meta" not in tables:
            raise ValueError(
                f"{self.database} was not created by the repair-adjudication tool; "
                "use a new, separate database file"
            )
        meta = {
            row["key"]: row["value"]
            for row in connection.execute("SELECT key, value FROM adjudication_meta")
        }
        if meta.get("protocol_id") != PROTOCOL_ID:
            raise ValueError(f"{self.database} belongs to protocol {meta.get('protocol_id')!r}")
        if meta.get("manifest_sha256") != self.manifest_sha256:
            raise ValueError(
                f"{self.database} was created for manifest {meta.get('manifest_sha256')}, "
                f"not {self.manifest_sha256}"
            )

    def append(self, payload: dict[str, t.Any]) -> dict[str, t.Any]:
        """Validate one judgment and append it as a new revision."""

        if not isinstance(payload, dict):
            raise ValueError("judgment must be an object")
        blind_id = payload.get("blind_id")
        if blind_id not in self._blind_id_set:
            raise ValueError("unknown blind_id")
        annotator = payload.get("annotator")
        if not isinstance(annotator, str) or not annotator.strip() or len(annotator) > 100:
            raise ValueError("annotator is required")
        verdict = payload.get("verdict")
        if verdict not in VERDICTS:
            raise ValueError(f"verdict must be one of {', '.join(VERDICTS)}")
        corrected = payload.get("corrected_point")
        corrected_x = corrected_y = None
        if corrected is not None:
            if verdict != "incorrect_correctable":
                raise ValueError("corrected_point is only allowed for incorrect_correctable")
            corrected_x, corrected_y = _point(corrected, "corrected_point")
            low, high = CORRECTED_POINT_RANGE
            if not (low <= corrected_x <= high and low <= corrected_y <= high):
                raise ValueError("corrected_point is outside the allowed image range")
        note = payload.get("note") or ""
        if not isinstance(note, str) or len(note) > NOTE_MAX_LENGTH:
            raise ValueError(f"note must be text of at most {NOTE_MAX_LENGTH} characters")
        viewed = payload.get("viewed_frames") or []
        if (
            not isinstance(viewed, list)
            or len(viewed) > 10000
            or not all(isinstance(v, int) and not isinstance(v, bool) and v >= 0 for v in viewed)
        ):
            raise ValueError("viewed_frames must be a list of frame indices")
        client_saved_at = payload.get("client_saved_at")
        if client_saved_at is not None and (not isinstance(client_saved_at, str) or len(client_saved_at) > 64):
            raise ValueError("client_saved_at must be an ISO timestamp string")
        server_saved_at = _now()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO adjudication_revisions (
                    blind_id, annotator, verdict, corrected_x, corrected_y, note,
                    viewed_frames_json, client_saved_at, server_saved_at, manifest_sha256
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    blind_id,
                    annotator.strip(),
                    verdict,
                    corrected_x,
                    corrected_y,
                    note,
                    json.dumps(sorted(set(viewed))),
                    client_saved_at,
                    server_saved_at,
                    self.manifest_sha256,
                ),
            )
            revision_id = cursor.lastrowid
        return {"revision_id": revision_id, "server_saved_at": server_saved_at}

    def latest(self, annotator: str) -> dict[str, dict[str, t.Any]]:
        """Return the latest revision per blind ID for *annotator*."""

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM adjudication_revisions
                WHERE annotator = ? AND revision_id IN (
                    SELECT MAX(revision_id) FROM adjudication_revisions
                    WHERE annotator = ? GROUP BY blind_id
                )
                """,
                (annotator, annotator),
            ).fetchall()
        return {row["blind_id"]: _decode(row) for row in rows}

    def export_rows(self) -> list[dict[str, t.Any]]:
        """Return every revision in insertion order."""

        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM adjudication_revisions ORDER BY revision_id"
            ).fetchall()
        return [_decode(row) for row in rows]


def _decode(row: sqlite3.Row) -> dict[str, t.Any]:
    record = dict(row)
    record["viewed_frames"] = json.loads(record.pop("viewed_frames_json"))
    corrected_x, corrected_y = record.pop("corrected_x"), record.pop("corrected_y")
    record["corrected_point"] = None if corrected_x is None else [corrected_x, corrected_y]
    return record


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AdjudicationHandler(AnnotationHandler):
    """HTTP API for the adjudication screen.

    Reuses the annotation tool's range-capable file serving, but uses its own
    routes and access cookie so it never shares state with that tool.
    """

    server: "AdjudicationServer"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/access-info":
            self._json({"access_token_required": self.server.access_token is not None})
            return
        if parsed.path.startswith("/api/") or parsed.path.startswith("/media/"):
            if not self._authorized():
                self._json({"error": "valid access code required"}, HTTPStatus.UNAUTHORIZED)
                return
        if parsed.path == "/api/state":
            annotator = parse_qs(parsed.query).get("annotator", [""])[0].strip()
            if not annotator:
                self._json({"error": "annotator is required"}, HTTPStatus.BAD_REQUEST)
                return
            self._json(
                {
                    "protocol_id": PROTOCOL_ID,
                    "verdicts": list(VERDICTS),
                    "cases": self.server.public_cases,
                    "latest": self.server.store.latest(annotator),
                }
            )
            return
        if parsed.path in ("/api/export.csv", "/api/export.jsonl"):
            self._export(parsed.path)
            return
        if parsed.path.startswith("/media/"):
            blind_id = parsed.path.removeprefix("/media/")
            video = self.server.videos.get(blind_id)
            if video is None:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            self._serve_file(video.parent, video.name)
            return
        relative = "index.html" if parsed.path == "/" else parsed.path.lstrip("/")
        self._serve_file(self.server.static_root, relative)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/logout":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Set-Cookie", f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")
            self.end_headers()
            return
        if path != "/api/judgments":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not self._authorized():
            self._json({"error": "valid access code required"}, HTTPStatus.UNAUTHORIZED)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            self._json(self.server.store.append(payload), HTTPStatus.CREATED)
        except (ValueError, json.JSONDecodeError) as error:
            self._json({"error": str(error)}, HTTPStatus.BAD_REQUEST)

    def _authorized(self) -> bool:
        """Require the access code (header or this tool's cookie) when one is set."""

        token = self.server.access_token
        if token is None:
            return True
        supplied = self.headers.get("X-Annotation-Token", "")
        if supplied and secrets.compare_digest(supplied, token):
            return True
        cookies = SimpleCookie()
        cookies.load(self.headers.get("Cookie", ""))
        cookie = cookies.get(COOKIE_NAME)
        return cookie is not None and secrets.compare_digest(cookie.value, token)

    def _json(self, payload: t.Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        token = self.server.access_token
        if token and secrets.compare_digest(self.headers.get("X-Annotation-Token", ""), token):
            self.send_header("Set-Cookie", f"{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Strict")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _export(self, path: str) -> None:
        rows = self.server.store.export_rows()
        if path.endswith(".jsonl"):
            data = "".join(json.dumps(row) + "\n" for row in rows).encode("utf-8")
            content_type, filename = "application/x-ndjson", "repair-adjudication-revisions.jsonl"
        else:
            output = io.StringIO()
            if rows:
                flat = [
                    {**row, "corrected_point": json.dumps(row["corrected_point"]), "viewed_frames": json.dumps(row["viewed_frames"])}
                    for row in rows
                ]
                writer = csv.DictWriter(output, fieldnames=list(flat[0]))
                writer.writeheader()
                writer.writerows(flat)
            data = output.getvalue().encode("utf-8")
            content_type, filename = "text/csv", "repair-adjudication-revisions.csv"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class AdjudicationServer(ThreadingHTTPServer):
    """Threading server carrying the blinded cases and the adjudication store."""

    def __init__(
        self,
        port: int,
        manifest: dict[str, t.Any],
        store: AdjudicationStore,
        host: str = "127.0.0.1",
        access_token: str | None = None,
    ):
        self.public_cases = manifest["public_cases"]
        self.videos = manifest["videos"]
        self.static_root = Path(__file__).with_name("static").resolve()
        self.store = store
        self.access_token = access_token
        super().__init__((host, port), AdjudicationHandler)


def main() -> None:
    """Start the adjudication screen, local-only unless protected by an access code."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blinded-manifest", type=Path, required=True, help="blinded/first_pass_manifest.json")
    parser.add_argument("--media-root", type=Path, required=True, help="directory that case video paths are relative to")
    parser.add_argument("--database", type=Path, required=True, help="new or existing repair-adjudication SQLite file")
    parser.add_argument("--port", type=int, default=8775)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--access-token", default=None)
    parser.add_argument(
        "--allow-unfrozen-manifest",
        action="store_true",
        help="skip the frozen sha256 check (synthetic dry runs only)",
    )
    args = parser.parse_args()
    if not _is_loopback_host(args.host) and not args.access_token:
        parser.error("a non-loopback --host requires --access-token")
    if args.access_token and not _valid_access_code(args.access_token):
        parser.error("--access-token must be exactly 6 uppercase letters or numbers")
    expected = None if args.allow_unfrozen_manifest else FROZEN_BLINDED_MANIFEST_SHA256
    manifest = load_blinded_manifest(args.blinded_manifest, args.media_root, expected)
    missing = [blind_id for blind_id, video in manifest["videos"].items() if not video.is_file()]
    if missing:
        parser.error(f"case videos not found under media root: {', '.join(missing)}")
    store = AdjudicationStore(args.database, manifest["sha256"], manifest["videos"])
    server = AdjudicationServer(args.port, manifest, store, args.host, args.access_token)
    print(f"Repair adjudication: http://{args.host}:{args.port}")
    print(f"Cases: {len(manifest['public_cases'])}  manifest sha256: {manifest['sha256']}")
    print(f"Database: {store.database}")
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
