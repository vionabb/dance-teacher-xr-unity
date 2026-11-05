"""Contract tests for the blinded repair-adjudication screen (synthetic cases only)."""

from __future__ import annotations

from pathlib import Path
import hashlib
import http.client
import json
import sqlite3
import subprocess
import threading

import pytest

from motion_extraction.annotation_tool.server import AnnotationStore
from motion_extraction.repair_adjudication.server import (
    FROZEN_BLINDED_MANIFEST_SHA256,
    PUBLIC_CASE_FIELDS,
    AdjudicationServer,
    AdjudicationStore,
    SealedPathError,
    load_blinded_manifest,
)


STATIC_ROOT = Path(__file__).parents[1] / "repair_adjudication" / "static"


def _write_fixture(root: Path, extra_case_fields: dict | None = None) -> tuple[Path, Path]:
    media = root / "media"
    media.mkdir(parents=True)
    (media / "clip-a.mp4").write_bytes(b"0123456789abcdef")
    (media / "clip-b.mp4").write_bytes(b"fedcba9876543210")
    cases = [
        {"blind_id": "B02", "video": "clip-b.mp4", "frame_index": 7, "fps": 30, "landmark": "LEFT_HIP", "point": [0.4, 0.6]},
        {"blind_id": "B01", "video": "clip-a.mp4", "frame_index": 3, "fps": 25, "landmark": "RIGHT_WRIST", "point": {"x": 0.2, "y": 0.3},
         "context_points": {"RIGHT_ELBOW": [0.25, 0.4], "NOSE": [0.1, 0.1]}},
    ]
    for case in cases:
        case.update(extra_case_fields or {})
    blinded = root / "blinded"
    blinded.mkdir()
    manifest = blinded / "first_pass_manifest.json"
    manifest.write_text(json.dumps({"cases": cases}), encoding="utf-8")
    return manifest, media


def _load(tmp_path: Path, **extra):
    manifest_path, media = _write_fixture(tmp_path, extra or None)
    return load_blinded_manifest(manifest_path, media, expected_sha256=None)


def test_manifest_projection_keeps_order_and_drops_unlisted_fields(tmp_path):
    manifest = _load(tmp_path, corpus="chi25_study2", selection_arm="hip_flag", midpoint_proposal=[0.5, 0.5])
    assert [c["blind_id"] for c in manifest["public_cases"]] == ["B02", "B01"]
    for case in manifest["public_cases"]:
        assert set(case) == set(PUBLIC_CASE_FIELDS)
    assert manifest["public_cases"][1]["point"] == [0.2, 0.3]
    # Unknown landmark names in context are ignored rather than drawn.
    assert manifest["public_cases"][1]["context_points"] == {"RIGHT_ELBOW": [0.25, 0.4]}


def test_frozen_hash_is_enforced_by_default(tmp_path):
    manifest_path, media = _write_fixture(tmp_path)
    with pytest.raises(ValueError, match="frozen"):
        load_blinded_manifest(manifest_path, media)
    digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    assert load_blinded_manifest(manifest_path, media, expected_sha256=digest)["sha256"] == digest
    assert len(FROZEN_BLINDED_MANIFEST_SHA256) == 64


def test_sealed_paths_are_refused(tmp_path):
    manifest_path, media = _write_fixture(tmp_path)
    sealed = tmp_path / "sealed"
    sealed.mkdir()
    key = sealed / "first_pass_answer_key.json"
    key.write_text(manifest_path.read_text(), encoding="utf-8")
    with pytest.raises(SealedPathError):
        load_blinded_manifest(key, media, expected_sha256=None)
    with pytest.raises(SealedPathError):
        load_blinded_manifest(manifest_path, sealed, expected_sha256=None)
    with pytest.raises(SealedPathError):
        AdjudicationStore(sealed / "db.sqlite3", "x" * 64, ["B01"])
    escaped = json.loads(manifest_path.read_text())
    escaped["cases"][0]["video"] = "../sealed/first_pass_answer_key.json"
    manifest_path.write_text(json.dumps(escaped), encoding="utf-8")
    with pytest.raises(SealedPathError):
        load_blinded_manifest(manifest_path, media, expected_sha256=None)


def test_video_outside_media_root_is_refused(tmp_path):
    manifest_path, media = _write_fixture(tmp_path)
    document = json.loads(manifest_path.read_text())
    document["cases"][0]["video"] = "../blinded/first_pass_manifest.json"
    manifest_path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(ValueError, match="under the media root"):
        load_blinded_manifest(manifest_path, media, expected_sha256=None)


@pytest.mark.parametrize(
    "change, message",
    [
        ({"blind_id": "B01"}, "unique"),
        ({"landmark": "NOSE"}, "landmark"),
        ({"frame_index": -1}, "frame_index"),
        ({"fps": 0}, "fps"),
        ({"point": [0.1]}, "point"),
    ],
)
def test_manifest_validation(tmp_path, change, message):
    manifest_path, media = _write_fixture(tmp_path)
    document = json.loads(manifest_path.read_text())
    document["cases"][0].update(change)
    manifest_path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        load_blinded_manifest(manifest_path, media, expected_sha256=None)


def test_store_is_append_only_and_latest_wins(tmp_path):
    store = AdjudicationStore(tmp_path / "adjudication.sqlite3", "a" * 64, ["B01", "B02"])
    first = store.append({"blind_id": "B01", "annotator": "viona", "verdict": "acceptable_as_is"})
    second = store.append(
        {"blind_id": "B01", "annotator": "viona", "verdict": "incorrect_correctable", "corrected_point": [0.3, 0.35], "viewed_frames": [3, 2, 3]}
    )
    assert second["revision_id"] > first["revision_id"]
    latest = store.latest("viona")
    assert latest["B01"]["verdict"] == "incorrect_correctable"
    assert latest["B01"]["corrected_point"] == [0.3, 0.35]
    assert latest["B01"]["viewed_frames"] == [2, 3]
    assert store.latest("someone-else") == {}
    assert [row["verdict"] for row in store.export_rows()] == ["acceptable_as_is", "incorrect_correctable"]
    with sqlite3.connect(store.database) as connection:
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            connection.execute("UPDATE adjudication_revisions SET verdict = 'unjudgeable'")
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            connection.execute("DELETE FROM adjudication_revisions")
        with pytest.raises(sqlite3.IntegrityError, match="immutable"):
            connection.execute("UPDATE adjudication_meta SET value = 'x' WHERE key = 'manifest_sha256'")


@pytest.mark.parametrize(
    "payload, message",
    [
        ({"blind_id": "B99", "annotator": "v", "verdict": "acceptable_as_is"}, "blind_id"),
        ({"blind_id": "B01", "annotator": " ", "verdict": "acceptable_as_is"}, "annotator"),
        ({"blind_id": "B01", "annotator": "v", "verdict": "fine"}, "verdict"),
        ({"blind_id": "B01", "annotator": "v", "verdict": "acceptable_as_is", "corrected_point": [0.1, 0.1]}, "only allowed"),
        ({"blind_id": "B01", "annotator": "v", "verdict": "incorrect_correctable", "corrected_point": [3, 0.1]}, "outside"),
        ({"blind_id": "B01", "annotator": "v", "verdict": "unjudgeable", "note": "x" * 1001}, "note"),
    ],
)
def test_store_rejects_invalid_judgments(tmp_path, payload, message):
    store = AdjudicationStore(tmp_path / "adjudication.sqlite3", "a" * 64, ["B01"])
    with pytest.raises(ValueError, match=message):
        store.append(payload)
    assert store.export_rows() == []


def test_store_refuses_other_databases_and_manifests(tmp_path):
    annotation_db = tmp_path / "annotations.sqlite3"
    AnnotationStore(annotation_db, {"experiment_id": "e", "tasks": []})
    before = annotation_db.read_bytes()
    with pytest.raises(ValueError, match="not created by the repair-adjudication tool"):
        AdjudicationStore(annotation_db, "a" * 64, ["B01"])
    assert annotation_db.read_bytes() == before
    database = tmp_path / "adjudication.sqlite3"
    AdjudicationStore(database, "a" * 64, ["B01"])
    with pytest.raises(ValueError, match="created for manifest"):
        AdjudicationStore(database, "b" * 64, ["B01"])
    AdjudicationStore(database, "a" * 64, ["B01"])  # same manifest resumes


def _request(server, method, path, body=None, headers=None):
    connection = http.client.HTTPConnection("127.0.0.1", server.server_port)
    data = None if body is None else json.dumps(body)
    connection.request(method, path, body=data, headers=headers or {})
    response = connection.getresponse()
    return response, response.read()


@pytest.fixture
def running_server(tmp_path):
    manifest = _load(tmp_path, selection_arm="hip_flag")
    store = AdjudicationStore(tmp_path / "adjudication.sqlite3", manifest["sha256"], manifest["videos"])
    server = AdjudicationServer(0, manifest, store, access_token="A7K2Q9")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()


def test_http_contract_hides_sealed_fields_and_requires_access(running_server):
    auth = {"X-Annotation-Token": "A7K2Q9"}
    response, _ = _request(running_server, "GET", "/api/state?annotator=viona")
    assert response.status == 401
    response, _ = _request(running_server, "GET", "/media/B01")
    assert response.status == 401
    response, body = _request(running_server, "GET", "/api/state?annotator=viona", headers=auth)
    assert response.status == 200
    assert "repair_adjudication_access=" in response.getheader("Set-Cookie")
    assert "selection_arm" not in body.decode() and "hip_flag" not in body.decode()
    assert "clip-a" not in body.decode()  # source file names stay server-side
    state = json.loads(body)
    assert [c["blind_id"] for c in state["cases"]] == ["B02", "B01"]
    response, body = _request(running_server, "GET", "/media/B01", headers={**auth, "Range": "bytes=2-5"})
    assert response.status == 206 and body == b"2345"
    response, _ = _request(running_server, "GET", "/media/clip-a.mp4", headers=auth)
    assert response.status == 404
    response, body = _request(
        running_server, "POST", "/api/judgments",
        {"blind_id": "B02", "annotator": "viona", "verdict": "unjudgeable", "note": "hip hidden by arm"},
        {**auth, "Content-Type": "application/json"},
    )
    assert response.status == 201
    response, body = _request(running_server, "POST", "/api/judgments", {"blind_id": "B02", "annotator": "viona", "verdict": "bad"}, auth)
    assert response.status == 400
    response, body = _request(running_server, "GET", "/api/export.jsonl", headers=auth)
    rows = [json.loads(line) for line in body.decode().splitlines()]
    assert [row["verdict"] for row in rows] == ["unjudgeable"]
    response, body = _request(running_server, "GET", "/api/export.csv", headers=auth)
    assert body.decode().splitlines()[0].startswith("revision_id,blind_id,annotator,verdict")


def test_static_shell_contract():
    html = (STATIC_ROOT / "index.html").read_text(encoding="utf-8")
    for element_id in ("login-panel", "review-screen", "video", "overlay", "verdicts", "note", "save", "go-target", "scrubber"):
        assert f'id="{element_id}"' in html
    for verdict in ("acceptable_as_is", "incorrect_correctable", "unjudgeable"):
        assert f'value="{verdict}"' in html
    script = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert "sealed" not in script.lower()
    assert "localStorage" not in script  # neither the access code nor answers persist in the browser
    subprocess.run(["node", "--check", str(STATIC_ROOT / "app.js")], check=True)
