"""Real-Chromium tests for annotation-tool interaction contracts that a
static source-text assertion cannot verify: canvas pointer-drag coordinate
transforms, the LAN access-code gate, and narrow-viewport reachability.

Opt in with the `browser-tests` dependency group and a one-time browser
install, then run explicitly (not part of the default test collection):

    uv sync --group browser-tests
    uv run playwright install chromium
    uv run --locked pytest motion_extraction/tests/test_annotation_tool_browser.py -m browser -q

See ``motion_extraction/tests/test_annotation_tool.py`` for the source-text
and server-contract tests that cover everything else about this tool.
"""

from __future__ import annotations

import threading
from pathlib import Path

import cv2
import numpy as np
import pytest

from motion_extraction.annotation_tool.server import AnnotationServer, AnnotationStore

playwright_sync_api = pytest.importorskip("playwright.sync_api")
expect = playwright_sync_api.expect

pytestmark = pytest.mark.browser

SOURCE_WIDTH, SOURCE_HEIGHT = 200, 150
KEYPOINT = (100.0, 75.0)


def _manifest() -> dict:
    return {
        "schema_version": "3.0",
        "experiment_id": "browser-test",
        "task_type": "editable_pose_ground_truth",
        "landmarks": ["TEST_POINT"],
        "pose_edges": [],
        "occlusion_states": [
            {"id": "non_occluded", "label": "Non-occluded", "visibility": 1.0},
            {"id": "semi_occluded", "label": "Semi-occluded", "visibility": 0.5},
            {"id": "fully_occluded", "label": "Fully occluded", "visibility": 0.0},
        ],
        "tasks": [
            {
                "task_id": "task-1",
                "case_id": "1",
                "priority": 1,
                "category": "browser_test",
                "source_artifact": "review/source.png",
                "source_dimensions": {"width": SOURCE_WIDTH, "height": SOURCE_HEIGHT},
                "overlays": [
                    {
                        "overlay_id": "B0",
                        "artifact": "review/source.png",
                        "keypoints": {"TEST_POINT": list(KEYPOINT)},
                        "visibility": {"TEST_POINT": 1.0},
                    }
                ],
            }
        ],
    }


def _start_server(tmp_path: Path, *, access_token: str | None = None):
    experiment_root = tmp_path / "experiment"
    (experiment_root / "review").mkdir(parents=True)
    cv2.imwrite(
        str(experiment_root / "review" / "source.png"),
        np.zeros((SOURCE_HEIGHT, SOURCE_WIDTH, 3), dtype=np.uint8),
    )
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _manifest())
    server = AnnotationServer(0, experiment_root, store, access_token=access_token)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, store, thread


def _stop_server(server, thread) -> None:
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)


def _log_in(page, base_url: str, *, annotator: str = "researcher", access_token: str = "") -> None:
    page.goto(base_url)
    page.fill("#annotator", annotator)
    if access_token:
        page.fill("#access-token", access_token)
    page.click("#start")


def test_dragging_a_landmark_persists_its_new_data_space_coordinate(page, tmp_path: Path) -> None:
    server, store, thread = _start_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#workspace")).to_be_visible()
        canvas = page.locator("#ground-truth-canvas")
        expect(canvas).to_be_visible()

        geometry = page.evaluate(
            """() => {
                const c = document.getElementById('ground-truth-canvas');
                const r = c.getBoundingClientRect();
                return {width: c.width, height: c.height, left: r.left, top: r.top,
                         rectWidth: r.width, rectHeight: r.height};
            }"""
        )
        # editorGeometry() pads a tight bounding box around the single
        # landmark by max(4% of source width, 36px), so a landmark well
        # inside the frame yields a known, checkable canvas size.
        assert geometry["width"] == SOURCE_WIDTH + 16
        assert geometry["height"] == SOURCE_HEIGHT + 4
        pad_x, pad_top = 8, 2

        def to_client(data_x: float, data_y: float) -> tuple[float, float]:
            client_x = geometry["left"] + (data_x + pad_x) * geometry["rectWidth"] / geometry["width"]
            client_y = geometry["top"] + (data_y + pad_top) * geometry["rectHeight"] / geometry["height"]
            return client_x, client_y

        start_x, start_y = to_client(*KEYPOINT)
        target_data = (KEYPOINT[0] + 40.0, KEYPOINT[1] + 20.0)
        end_x, end_y = to_client(*target_data)

        page.mouse.move(start_x, start_y)
        page.mouse.down()
        page.mouse.move((start_x + end_x) / 2, (start_y + end_y) / 2)
        page.mouse.move(end_x, end_y)
        page.mouse.up()

        expect(page.locator("#save-state")).to_contain_text("saved revision", timeout=5000)

        landmark = store.state("researcher")["latest_judgments"]["task-1"]["ground_truth_landmarks"][
            "TEST_POINT"
        ]
        assert landmark["x"] == pytest.approx(target_data[0], abs=2)
        assert landmark["y"] == pytest.approx(target_data[1], abs=2)
    finally:
        _stop_server(server, thread)


def test_access_code_gate_blocks_then_admits_with_the_correct_code(page, tmp_path: Path) -> None:
    server, _store, thread = _start_server(tmp_path, access_token="A7K2Q9")
    try:
        page.on("dialog", lambda dialog: dialog.accept())
        base_url = f"http://127.0.0.1:{server.server_port}"

        _log_in(page, base_url, access_token="")
        expect(page.locator("#save-state")).to_contain_text("unable to load", timeout=5000)
        expect(page.locator("#workspace")).to_be_hidden()
        expect(page.locator("#login-panel")).to_be_visible()

        page.fill("#access-token", "A7K2Q9")
        page.click("#start")
        expect(page.locator("#workspace")).to_be_visible()
        expect(page.locator("#login-panel")).to_be_hidden()
    finally:
        _stop_server(server, thread)


def test_narrow_mobile_viewport_keeps_key_controls_reachable(page, tmp_path: Path) -> None:
    server, _store, thread = _start_server(tmp_path)
    try:
        page.set_viewport_size({"width": 375, "height": 667})
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#workspace")).to_be_visible()

        expect(page.locator("#complete-case")).to_be_in_viewport()
        expect(page.locator("#mark-unclear")).to_be_in_viewport()
        expect(page.locator("#landmark-panel")).to_be_in_viewport()
    finally:
        _stop_server(server, thread)
