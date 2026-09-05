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

import json
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


# --- error-marking skeleton overlay ----------------------------------------
#
# Covers exactly the interaction contract a static source-text assertion
# can't: the SVG viewBox/preserveAspectRatio "meet" fit transform a click or
# drag has to be inverted through (svgToContentPoint() in app.js), and
# whether a real drag beyond the click/drag threshold lands as a corrected
# position rather than as a click. See the module docstring above -- this
# is the same category of gap the annotation-tool README calls out for any
# change to canvas/overlay drag or hit-test math.

ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT = 200, 150
ERROR_MARKING_FPS = 5.0
ERROR_MARKING_FRAME_COUNT = 5
WRIST_POINT = (100.0, 75.0)
ELBOW_POINT = (60.0, 75.0)


def _error_marking_manifest() -> dict:
    return {
        "schema_version": "1.0",
        "experiment_id": "browser-error-marking-test",
        "task_type": "error_marking",
        "tasks": [
            {
                "task_id": "error-marking-1",
                "case_id": "error-marking-1",
                "priority": 1,
                "task_type": "error_marking",
                "category": "roughness",
                "source_artifact": "error-marking-1/clip.mp4",
                "fps": ERROR_MARKING_FPS,
                "frame_count": ERROR_MARKING_FRAME_COUNT,
                "landmarks_artifact": "error-marking-1/landmarks.json",
                "source_dimensions": {
                    "width": ERROR_MARKING_SOURCE_WIDTH,
                    "height": ERROR_MARKING_SOURCE_HEIGHT,
                },
            }
        ],
    }


def _start_error_marking_server(tmp_path: Path):
    from motion_extraction.annotation_tool.generate_temporal_comparison_tasks import (
        _encode_frames,
        _require_encoder,
    )

    experiment_root = tmp_path / "experiment"
    task_dir = experiment_root / "error-marking-1"
    task_dir.mkdir(parents=True)

    ffmpeg = _require_encoder()
    blank_frame = np.zeros((ERROR_MARKING_SOURCE_HEIGHT, ERROR_MARKING_SOURCE_WIDTH, 3), dtype=np.uint8)
    frames = [blank_frame for _ in range(ERROR_MARKING_FRAME_COUNT)]
    _encode_frames(
        ffmpeg,
        task_dir / "clip.mp4",
        iter(frames),
        ERROR_MARKING_SOURCE_WIDTH,
        ERROR_MARKING_SOURCE_HEIGHT,
        ERROR_MARKING_FPS,
    )

    per_frame_points = {"LEFT_ELBOW": list(ELBOW_POINT), "LEFT_WRIST": list(WRIST_POINT)}
    (task_dir / "landmarks.json").write_text(
        json.dumps(
            {
                "landmarks": ["LEFT_ELBOW", "LEFT_WRIST"],
                "pose_edges": [["LEFT_ELBOW", "LEFT_WRIST"]],
                "source_dimensions": {
                    "width": ERROR_MARKING_SOURCE_WIDTH,
                    "height": ERROR_MARKING_SOURCE_HEIGHT,
                },
                "frames": [dict(per_frame_points) for _ in range(ERROR_MARKING_FRAME_COUNT)],
            }
        )
    )

    store = AnnotationStore(tmp_path / "annotations.sqlite3", _error_marking_manifest())
    server = AnnotationServer(0, experiment_root, store)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, store, thread


def _svg_client_point(svg_rect: dict, width: int, height: int, x: float, y: float) -> tuple[float, float]:
    # The inverse of the "meet" fit svgToContentPoint() in app.js undoes --
    # mirrored here so the test can click/drag a known content-space point.
    scale = min(svg_rect["width"] / width, svg_rect["height"] / height)
    offset_x = (svg_rect["width"] - width * scale) / 2
    offset_y = (svg_rect["height"] - height * scale) / 2
    return svg_rect["left"] + offset_x + x * scale, svg_rect["top"] + offset_y + y * scale


def _overlay_rect(page) -> dict:
    return page.evaluate(
        "() => { const r = document.getElementById('error-marking-overlay').getBoundingClientRect();"
        " return {left: r.left, top: r.top, width: r.width, height: r.height}; }"
    )


def test_clicking_a_skeleton_landmark_creates_a_mark_at_the_current_frame(page, tmp_path: Path) -> None:
    server, store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        expect(page.locator(".skeleton-landmark").first).to_be_visible(timeout=5000)

        rect = _overlay_rect(page)
        click_x, click_y = _svg_client_point(
            rect, ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT, *WRIST_POINT
        )
        page.mouse.move(click_x, click_y)
        page.mouse.down()
        page.mouse.up()

        expect(page.locator("#error-mark-dialog")).to_be_visible()
        expect(page.locator("#save-state")).to_contain_text("saved revision", timeout=5000)

        marks = store.state("researcher")["latest_judgments"]["error-marking-1"]["error_marking_response"]["marks"]
        assert len(marks) == 1
        assert marks[0]["body_part"] == "LEFT_WRIST"
        assert marks[0]["start_frame"] == 0
        assert marks[0]["end_frame"] == 0
        assert marks[0]["positions"] == {}
    finally:
        _stop_server(server, thread)


def test_dragging_a_skeleton_landmark_records_a_corrected_position_and_a_mark(page, tmp_path: Path) -> None:
    server, store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        expect(page.locator(".skeleton-landmark").first).to_be_visible(timeout=5000)

        rect = _overlay_rect(page)
        start_x, start_y = _svg_client_point(
            rect, ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT, *WRIST_POINT
        )
        target = (WRIST_POINT[0] + 25.0, WRIST_POINT[1] + 15.0)
        end_x, end_y = _svg_client_point(rect, ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT, *target)

        page.mouse.move(start_x, start_y)
        page.mouse.down()
        page.mouse.move((start_x + end_x) / 2, (start_y + end_y) / 2)
        page.mouse.move(end_x, end_y)
        page.mouse.up()

        expect(page.locator("#save-state")).to_contain_text("saved revision", timeout=5000)
        expect(page.locator("#error-mark-dialog")).to_be_hidden()

        marks = store.state("researcher")["latest_judgments"]["error-marking-1"]["error_marking_response"]["marks"]
        assert len(marks) == 1
        mark = marks[0]
        assert mark["body_part"] == "LEFT_WRIST"
        assert mark["start_frame"] == 0
        assert mark["end_frame"] == 0
        position = mark["positions"]["0"]
        assert position[0] == pytest.approx(target[0], abs=2)
        assert position[1] == pytest.approx(target[1], abs=2)
    finally:
        _stop_server(server, thread)


def test_seeking_to_every_frame_round_trips_to_the_exact_frame(page, tmp_path: Path) -> None:
    # Regression test for two compounding bugs, both invisible before the
    # skeleton overlay needed the reported frame to exactly match the
    # video's actually-decoded content: (1) seeking to exactly frame/fps
    # lands right on the boundary between that frame and its neighbor,
    # which the browser's own frame timestamps don't always round the way
    # assumed -- fixed by seeking to each frame's midpoint (frameToTime()).
    # (2) video.currentTime assignment is asynchronous in every browser, so
    # a *fresh* read of it shortly after assigning -- as errorMarkingCurrentFrame()
    # used to do -- is not reliably caught up yet, even once the on-screen
    # frame label already shows the right number from an explicitly-passed
    # frame. Fixed by tracking the intended/confirmed frame as state
    # (state.errorMarkingFrame / setErrorMarkingFrame()) instead of
    # re-deriving it from currentTime at arbitrary call sites.
    server, _store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        expect(page.locator(".skeleton-landmark").first).to_be_visible(timeout=5000)

        for frame in range(ERROR_MARKING_FRAME_COUNT):
            page.evaluate(
                "(frame) => {"
                " const scrubber = document.getElementById('error-marking-scrubber');"
                " scrubber.value = String(frame);"
                " scrubber.dispatchEvent(new Event('input', {bubbles: true}));"
                "}",
                frame,
            )
            expect(page.locator("#error-marking-frame-indicator")).to_contain_text(f"frame {frame} /")
            reported = page.evaluate("() => errorMarkingCurrentFrame()")
            assert reported == frame, f"seeking to frame {frame} reported back frame {reported}"
    finally:
        _stop_server(server, thread)


def test_clicking_an_adjacent_frames_landmark_extends_the_existing_mark(page, tmp_path: Path) -> None:
    # Also exercises the async-currentTime bug above end to end: stepping
    # forward then immediately clicking the landmark used to read back the
    # frame startSkeletonLandmarkDrag() computed independently from
    # video.currentTime, which could still be lagging even though the frame
    # label had already updated -- landing the click's mark back on frame 0.
    server, store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        expect(page.locator(".skeleton-landmark").first).to_be_visible(timeout=5000)

        rect = _overlay_rect(page)
        click_x, click_y = _svg_client_point(
            rect, ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT, *WRIST_POINT
        )
        page.mouse.move(click_x, click_y)
        page.mouse.down()
        page.mouse.up()
        expect(page.locator("#error-mark-dialog")).to_be_visible()
        page.locator("#error-mark-dialog .modal-action form button").click()
        expect(page.locator("#error-mark-dialog")).to_be_hidden()
        expect(page.locator("#save-state")).to_contain_text("saved revision", timeout=5000)

        page.click("#error-marking-step-forward-1")
        expect(page.locator("#error-marking-frame-indicator")).to_contain_text("frame 1")

        page.mouse.move(click_x, click_y)
        page.mouse.down()
        page.mouse.up()
        expect(page.locator("#save-state")).to_contain_text("saved revision", timeout=5000)

        marks = store.state("researcher")["latest_judgments"]["error-marking-1"]["error_marking_response"]["marks"]
        assert len(marks) == 1
        assert marks[0]["start_frame"] == 0
        assert marks[0]["end_frame"] == 1
    finally:
        _stop_server(server, thread)


def test_replay_button_becomes_pause_and_freezes_the_current_frame(page, tmp_path: Path) -> None:
    server, _store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()

        replay = page.locator("#error-marking-replay")
        replay.click()
        expect(replay).to_have_text("⏸ Pause")
        replay.click()
        expect(replay).to_have_text("▶ Replay")

        paused_frame = page.evaluate("() => errorMarkingCurrentFrame()")
        page.wait_for_timeout(400)
        assert page.evaluate("() => errorMarkingCurrentFrame()") == paused_frame
    finally:
        _stop_server(server, thread)


def test_resizing_a_mark_next_to_another_merges_and_preserves_details(page, tmp_path: Path) -> None:
    server, store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        expect(page.locator(".skeleton-landmark").first).to_be_visible(timeout=5000)
        page.evaluate(
            """() => {
                state.errorMarks = [
                  {body_part: 'LEFT_WRIST', start_frame: 0, end_frame: 1,
                   causes: ['motion_blur'], note: 'first', positions: {'0': [100, 75]}},
                  {body_part: 'LEFT_WRIST', start_frame: 3, end_frame: 3,
                   causes: ['occlusion'], note: 'second', positions: {'3': [102, 76]}},
                ];
                renderErrorMarkingTimeline();
            }"""
        )
        page.locator(
            '.timeline-segment[data-mark-index="0"] .timeline-handle-end'
        ).scroll_into_view_if_needed()

        geometry = page.evaluate(
            """(frameCount) => {
                const track = document.querySelector('.timeline-row-track[data-track-part="LEFT_WRIST"]');
                const handle = document.querySelector('.timeline-segment[data-mark-index="0"] .timeline-handle-end');
                const trackRect = track.getBoundingClientRect();
                const handleRect = handle.getBoundingClientRect();
                return {
                  startX: handleRect.left + handleRect.width / 2,
                  y: handleRect.top + handleRect.height / 2,
                  targetX: trackRect.left + 2 * trackRect.width / (frameCount - 1),
                };
            }""",
            ERROR_MARKING_FRAME_COUNT,
        )
        page.mouse.move(geometry["startX"], geometry["y"])
        page.mouse.down()
        page.mouse.move(geometry["targetX"], geometry["y"])
        page.mouse.up()

        expect(page.locator("#save-state")).to_contain_text("saved revision", timeout=5000)
        marks = store.state("researcher")["latest_judgments"]["error-marking-1"]["error_marking_response"]["marks"]
        assert len(marks) == 1
        assert marks[0]["start_frame"] == 0
        assert marks[0]["end_frame"] == 3
        assert set(marks[0]["causes"]) == {"motion_blur", "occlusion"}
        assert marks[0]["positions"] == {"0": [100, 75], "3": [102, 76]}
        assert marks[0]["note"] == "first\nsecond"
    finally:
        _stop_server(server, thread)
