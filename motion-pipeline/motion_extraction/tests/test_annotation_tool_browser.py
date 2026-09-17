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
import re
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
    view_box = svg_rect["viewBox"]
    scale = min(svg_rect["width"] / view_box["width"], svg_rect["height"] / view_box["height"])
    offset_x = (svg_rect["width"] - view_box["width"] * scale) / 2
    offset_y = (svg_rect["height"] - view_box["height"] * scale) / 2
    return (
        svg_rect["left"] + offset_x + (x - view_box["x"]) * scale,
        svg_rect["top"] + offset_y + (y - view_box["y"]) * scale,
    )


def _overlay_rect(page) -> dict:
    return page.evaluate(
        """() => {
            const svg = document.getElementById('error-marking-overlay');
            const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
            return {left: r.left, top: r.top, width: r.width, height: r.height,
                    viewBox: {x: vb.x, y: vb.y, width: vb.width, height: vb.height}};
        }"""
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


def test_flagging_current_frame_persists_as_unusable_frame(page, tmp_path: Path) -> None:
    server, store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        usable = page.locator("#error-marking-mark-frame-usable")
        unusable = page.locator("#error-marking-mark-frame-unusable")
        expect(usable).to_have_text("Mark frame usable")
        expect(unusable).to_have_text("Mark frame unusable")

        unusable.click()
        unusable.click()

        expect(unusable).to_have_attribute("aria-pressed", "true")
        expect(page.locator("#error-marking-bad-frame-badge")).to_be_visible()
        expect(page.locator(".skeleton-edge").first).to_have_attribute("stroke", "#b3261e")
        expect(page.locator("#save-state")).to_contain_text("saved revision", timeout=5000)
        response = store.state("researcher")["latest_judgments"]["error-marking-1"]["error_marking_response"]
        assert response["bad_frames"] == [0]

        usable.click()
        usable.click()
        page.evaluate("() => flushPendingSave()")
        expect(usable).to_have_attribute("aria-pressed", "true")
        response = store.state("researcher")["latest_judgments"]["error-marking-1"]["error_marking_response"]
        assert response["bad_frames"] == []
        assert response["usable_frames"] == [0]
    finally:
        _stop_server(server, thread)


def test_missing_tracking_frame_is_auto_marked_and_grouped_on_timeline(page, tmp_path: Path) -> None:
    server, _store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        page.evaluate(
            """() => {
                state.errorMarkingLandmarks.frames[2] = {};
                state.errorMarkingLandmarks.frames[3] = {};
                refreshAutomaticBadFrames(state.errorMarkingLandmarks, state.data.tasks[state.taskIndex]);
                renderErrorMarkingTimeline();
            }"""
        )
        expect(page.locator(".timeline-bad-frame-auto")).to_have_count(1)
        expect(page.locator(".timeline-bad-frame-auto")).to_have_attribute("data-bad-frame-start", "2")
        expect(page.locator(".timeline-bad-frame-auto")).to_have_attribute("data-bad-frame-end", "3")

        # Automatic flags remain actionable: clicking the range records a
        # manual confirmation and changes the timeline treatment to manual.
        page.locator(".timeline-bad-frame-auto").click()
        expect(page.locator(".timeline-bad-frame-auto")).to_have_count(0)
        expect(page.locator(".timeline-bad-frame").first).to_have_attribute("title", re.compile(r"marked manually"))
        page.evaluate("() => { setErrorMarkingFrame(2); updateBadFrameControls(2); renderSkeletonOverlay(2); }")
        expect(page.locator("#error-marking-no-pose-badge")).to_be_visible()
    finally:
        _stop_server(server, thread)


def test_video_unusable_disposition_persists_its_reason(page, tmp_path: Path) -> None:
    server, store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        page.locator("#error-marking-video-unusable-control").click()
        reason = page.locator("#error-marking-video-unusable-reason")
        note = page.locator("#error-marking-note")
        expect(reason).to_be_visible()
        reason.fill("The tracking is detached from the dancer for the entire clip.")
        expect(note).to_have_value("The tracking is detached from the dancer for the entire clip.")
        note.fill("The clip is consistently detached from the dancer.")
        expect(reason).to_have_value("The clip is consistently detached from the dancer.")

        expect(page.locator("#error-marking-screen")).to_have_class(
            re.compile(r"video-marked-unusable")
        )
        expect(page.locator("#save-state")).to_contain_text("saved revision", timeout=5000)
        response = store.state("researcher")["latest_judgments"]["error-marking-1"]["error_marking_response"]
        assert response["video_unusable"] is True
        assert response["video_unusable_reason"] == "The clip is consistently detached from the dancer."
        assert response["note"] == response["video_unusable_reason"]
    finally:
        _stop_server(server, thread)


def test_video_unusable_allows_frame_flags_but_blocks_joint_marks(page, tmp_path: Path) -> None:
    server, store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        page.locator("#error-marking-video-unusable-control").click()

        rating = page.locator('input[name="error-marking-usability-rating"][value="unusable"]')
        expect(rating).to_be_checked()
        expect(page.locator("#error-marking-mark-frame-unusable")).to_be_enabled()
        expect(page.locator('[data-track-part="LEFT_WRIST"]')).to_have_attribute("aria-disabled", "true")

        page.locator("#error-marking-mark-frame-unusable").click()
        page.locator(".skeleton-landmark").first.click()
        expect(page.locator("#error-mark-dialog")).not_to_be_visible()
        expect(page.locator("#save-state")).to_contain_text("saved revision", timeout=5000)

        response = store.state("researcher")["latest_judgments"]["error-marking-1"]["error_marking_response"]
        assert response["video_unusable"] is True
        assert response["video_usability_rating"] == "unusable"
        assert response["bad_frames"] == [0]
        assert response["marks"] == []
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


def test_buffered_canvas_stays_aligned_and_allows_out_of_frame_drag(page, tmp_path: Path) -> None:
    server, store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        expect(page.locator('.skeleton-landmark[data-landmark="LEFT_WRIST"]')).to_be_visible(timeout=5000)
        page.wait_for_function("document.getElementById('error-marking-video').videoWidth > 0")

        rect = _overlay_rect(page)
        assert rect["viewBox"] == pytest.approx(
            {"x": -16, "y": -12, "width": 232, "height": 174}, abs=0.01
        )

        # The source-image corners mapped through the expanded SVG viewBox
        # must still land on the actual displayed video pixels exactly.
        video_content = page.evaluate(
            """() => {
                const video = document.getElementById('error-marking-video');
                const r = video.getBoundingClientRect();
                const aspect = video.videoWidth / video.videoHeight;
                let width = r.width, height = width / aspect;
                if (height > r.height) { height = r.height; width = height * aspect; }
                return {
                  left: r.left + (r.width - width) / 2,
                  top: r.top + (r.height - height) / 2,
                  right: r.left + (r.width + width) / 2,
                  bottom: r.top + (r.height + height) / 2,
                };
            }"""
        )
        source_top_left = _svg_client_point(
            rect, ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT, 0, 0
        )
        source_bottom_right = _svg_client_point(
            rect, ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT,
            ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT,
        )
        assert source_top_left == pytest.approx((video_content["left"], video_content["top"]), abs=1)
        assert source_bottom_right == pytest.approx((video_content["right"], video_content["bottom"]), abs=1)

        # Put the tracked point just outside the source frame but within the
        # new buffer, then grab it there and drag it back into the picture.
        out_of_frame = (-8.0, WRIST_POINT[1])
        target = (8.0, WRIST_POINT[1])
        page.evaluate(
            """(point) => {
                state.errorMarkingLandmarks.frames[0].LEFT_WRIST = point;
                renderSkeletonOverlay(0);
            }""",
            list(out_of_frame),
        )
        wrist = page.locator('.skeleton-landmark[data-landmark="LEFT_WRIST"]')
        expect(wrist).to_be_visible()
        start_x, start_y = _svg_client_point(
            rect, ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT, *out_of_frame
        )
        end_x, end_y = _svg_client_point(
            rect, ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT, *target
        )
        page.mouse.move(start_x, start_y)
        page.mouse.down()
        page.mouse.move(end_x, end_y)
        page.mouse.up()

        expect(page.locator("#save-state")).to_contain_text("saved revision", timeout=5000)
        marks = store.state("researcher")["latest_judgments"]["error-marking-1"]["error_marking_response"]["marks"]
        assert marks[0]["positions"]["0"] == pytest.approx(list(target), abs=2)
    finally:
        _stop_server(server, thread)


def test_adjusted_landmark_keeps_only_the_previous_frame_ghost_after_drag(page, tmp_path: Path) -> None:
    server, _store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        expect(page.locator('.skeleton-landmark[data-landmark="LEFT_WRIST"]')).to_be_visible(timeout=5000)

        page.evaluate(
            """() => {
                state.errorMarkingLandmarks.frames[1].LEFT_WRIST = [90, 70];
                state.errorMarkingLandmarks.frames[3].LEFT_WRIST = [110, 80];
            }"""
        )
        page.locator("#error-marking-scrubber").evaluate(
            """(scrubber) => {
                scrubber.value = '2';
                scrubber.dispatchEvent(new Event('input', {bubbles: true}));
            }"""
        )
        rect = _overlay_rect(page)
        start_x, start_y = _svg_client_point(
            rect, ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT, *WRIST_POINT
        )
        end_x, end_y = _svg_client_point(
            rect, ERROR_MARKING_SOURCE_WIDTH, ERROR_MARKING_SOURCE_HEIGHT,
            WRIST_POINT[0] + 25, WRIST_POINT[1] + 15,
        )

        page.mouse.move(start_x, start_y)
        page.mouse.down()
        page.mouse.move(end_x, end_y)

        overlay = page.locator("#error-marking-overlay")
        previous_point = overlay.locator(".skeleton-previous-frame-landmark-ghost")
        previous_edges = overlay.locator(".skeleton-previous-frame-edge-ghost")
        expect(previous_point).to_have_count(1)
        expect(previous_edges).to_have_count(1)
        expect(previous_point).to_have_attribute("cx", "90")
        expect(previous_point).not_to_have_attribute("cx", "110")
        expect(previous_edges.first).to_have_attribute("stroke", "#5da9e9")

        page.mouse.up()
        expect(previous_point).to_have_count(1)
        expect(previous_edges).to_have_count(1)
        expect(previous_point).to_have_attribute("cx", "90")
    finally:
        _stop_server(server, thread)


def test_removing_a_current_frame_mark_immediately_restores_the_tracked_skeleton(page, tmp_path: Path) -> None:
    server, _store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        expect(page.locator('.skeleton-landmark[data-landmark="LEFT_WRIST"]')).to_be_visible(timeout=5000)

        corrected = (WRIST_POINT[0] + 25.0, WRIST_POINT[1] + 15.0)
        page.evaluate(
            """(corrected) => {
                state.errorMarks = [{
                  body_part: 'LEFT_WRIST', start_frame: 0, end_frame: 2,
                  causes: ['motion_blur'], note: '', positions: {'0': corrected},
                }];
                renderErrorMarkingTimeline();
                renderSkeletonOverlay();
                openErrorMarkPopup(0);
            }""",
            list(corrected),
        )
        live_overlay = page.locator("#error-marking-overlay")
        wrist = live_overlay.locator('.skeleton-landmark[data-landmark="LEFT_WRIST"]')
        expect(wrist).to_have_attribute("cx", str(int(corrected[0])))
        expect(wrist).to_have_attribute("fill", "#c6eb28")
        expect(live_overlay.locator(".skeleton-landmark-ghost")).to_have_count(1)
        expect(live_overlay.locator(".skeleton-landmark-cause-halo")).to_have_attribute("fill", "#3a8fd9")
        expect(live_overlay.locator(".skeleton-edge")).to_have_attribute("stroke", "#c6eb28")
        expect(live_overlay.locator(".skeleton-edge-cause-halo")).to_have_attribute("stroke", "#3a8fd9")

        page.click("#error-mark-dialog-remove")

        expect(page.locator("#error-mark-dialog")).to_be_hidden()
        expect(wrist).to_have_attribute("cx", str(int(WRIST_POINT[0])))
        expect(wrist).to_have_attribute("cy", str(int(WRIST_POINT[1])))
        expect(live_overlay.locator(".skeleton-landmark-ghost")).to_have_count(0)
        expect(live_overlay.locator(".skeleton-landmark-cause-halo")).to_have_count(0)
        expect(live_overlay.locator(".skeleton-edge-cause-halo")).to_have_count(0)
    finally:
        _stop_server(server, thread)


def test_playback_controls_form_a_footer_below_the_video_canvas(page, tmp_path: Path) -> None:
    server, _store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        expect(page.locator(".skeleton-landmark").first).to_be_visible(timeout=5000)

        geometry = page.evaluate(
            """() => {
                const player = document.querySelector('.error-marking-player').getBoundingClientRect();
                const canvas = document.getElementById('error-marking-video-wrap').getBoundingClientRect();
                const controls = document.querySelector('.error-marking-controls-bar').getBoundingClientRect();
                const videoStyle = getComputedStyle(document.getElementById('error-marking-video'));
                const rootStyle = getComputedStyle(document.documentElement);
                const controlsStyle = getComputedStyle(document.querySelector('.error-marking-controls-bar'));
                const groupStyle = getComputedStyle(document.querySelector('.error-marking-controls-bar .step-buttons-join'));
                const buttons = document.querySelectorAll('.error-marking-controls-bar .btn');
                const firstButtonStyle = getComputedStyle(buttons[0]);
                const secondButtonStyle = getComputedStyle(buttons[1]);
                return {
                  viewportHeight: window.innerHeight,
                  rootFontSize: parseFloat(rootStyle.fontSize),
                  videoMaxHeight: parseFloat(videoStyle.maxHeight),
                  player: {left: player.left, right: player.right},
                  canvas: {left: canvas.left, right: canvas.right, bottom: canvas.bottom, height: canvas.height},
                  controls: {
                    left: controls.left, right: controls.right, top: controls.top,
                    paddingTop: controlsStyle.paddingTop, paddingBottom: controlsStyle.paddingBottom,
                  },
                  borders: {
                    groupLeft: groupStyle.borderLeftWidth,
                    firstLeft: firstButtonStyle.borderLeftWidth,
                    firstRight: firstButtonStyle.borderRightWidth,
                    secondLeft: secondButtonStyle.borderLeftWidth,
                  },
                };
            }"""
        )
        assert geometry["controls"]["top"] >= geometry["canvas"]["bottom"] - 1
        assert geometry["controls"]["left"] == pytest.approx(geometry["player"]["left"], abs=1)
        assert geometry["controls"]["right"] == pytest.approx(geometry["player"]["right"], abs=1)
        assert geometry["videoMaxHeight"] == pytest.approx(
            geometry["viewportHeight"] * 0.32 + geometry["rootFontSize"] * 2.75,
            abs=1,
        )
        assert geometry["controls"]["paddingTop"] == "0px"
        assert geometry["controls"]["paddingBottom"] == "0px"
        assert geometry["borders"] == {
            "groupLeft": "1px",
            "firstLeft": "0px",
            "firstRight": "0px",
            "secondLeft": "1px",
        }
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

        page.locator("#error-marking-scrubber").evaluate(
            """(scrubber) => {
                scrubber.value = '2';
                scrubber.dispatchEvent(new Event('input', {bubbles: true}));
            }"""
        )
        replay = page.locator("#error-marking-replay")
        replay.click()
        expect(replay).to_have_text("⏸ Pause")
        expect(page.locator("#error-marking-frame-indicator")).to_contain_text("frame 3", timeout=1500)
        replay.click()
        expect(replay).to_have_text("▶ Play")

        paused_frame = page.evaluate("() => errorMarkingCurrentFrame()")
        page.wait_for_timeout(400)
        assert page.evaluate("() => errorMarkingCurrentFrame()") == paused_frame

        replay.click()
        expect(replay).to_have_text("⏸ Pause")
        assert page.evaluate("() => errorMarkingCurrentFrame()") == paused_frame
        replay.click()
    finally:
        _stop_server(server, thread)


def test_backwards_replay_button_becomes_pause_and_freezes_the_current_frame(page, tmp_path: Path) -> None:
    server, _store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()

        page.locator("#error-marking-scrubber").evaluate(
            """(scrubber) => {
                scrubber.value = '3';
                scrubber.dispatchEvent(new Event('input', {bubbles: true}));
            }"""
        )
        backwards = page.locator("#error-marking-replay-backwards")
        backwards.click()
        expect(backwards).to_have_text("⏸ Pause")
        expect(backwards).to_have_attribute("aria-label", "Pause backwards playback")
        expect(page.locator("#error-marking-frame-indicator")).to_contain_text("frame 2", timeout=1500)
        backwards.click()
        expect(backwards).to_have_text("◀ Backwards")
        expect(backwards).to_have_attribute("aria-label", "Play backwards")

        paused_frame = page.evaluate("() => errorMarkingCurrentFrame()")
        page.wait_for_timeout(400)
        assert page.evaluate("() => errorMarkingCurrentFrame()") == paused_frame
    finally:
        _stop_server(server, thread)


def test_playback_hides_correction_ghosts_and_shows_only_the_adjusted_skeleton(page, tmp_path: Path) -> None:
    server, _store, thread = _start_error_marking_server(tmp_path)
    try:
        _log_in(page, f"http://127.0.0.1:{server.server_port}")
        expect(page.locator("#error-marking-screen")).to_be_visible()
        expect(page.locator('.skeleton-landmark[data-landmark="LEFT_WRIST"]')).to_be_visible(timeout=5000)

        corrected = (WRIST_POINT[0] + 25.0, WRIST_POINT[1] + 15.0)
        page.evaluate(
            """(corrected) => {
                state.errorMarks = [{
                  body_part: 'LEFT_WRIST', start_frame: 1, end_frame: 3,
                  causes: ['motion_blur'], note: '',
                  positions: {'1': corrected, '2': corrected, '3': corrected},
                }];
                renderErrorMarkingTimeline();
                renderSkeletonOverlay();
            }""",
            list(corrected),
        )
        page.locator("#error-marking-scrubber").evaluate(
            """(scrubber) => {
                scrubber.value = '2';
                scrubber.dispatchEvent(new Event('input', {bubbles: true}));
            }"""
        )

        live_overlay = page.locator("#error-marking-overlay")
        expect(live_overlay.locator(".skeleton-landmark-ghost")).to_have_count(1)
        expect(live_overlay.locator(".skeleton-previous-frame-landmark-ghost")).to_have_count(1)
        expect(live_overlay.locator(".skeleton-previous-frame-edge-ghost")).to_have_count(1)
        expect(live_overlay.locator(".skeleton-landmark-cause-halo")).to_have_count(1)

        replay = page.locator("#error-marking-replay")
        replay.click()
        expect(live_overlay.locator(".skeleton-landmark-ghost")).to_have_count(0)
        expect(live_overlay.locator(".skeleton-previous-frame-landmark-ghost")).to_have_count(0)
        expect(live_overlay.locator(".skeleton-previous-frame-edge-ghost")).to_have_count(0)
        expect(live_overlay.locator(".skeleton-landmark-cause-halo")).to_have_count(1)
        replay.click()

        backwards = page.locator("#error-marking-replay-backwards")
        backwards.click()
        expect(live_overlay.locator(".skeleton-landmark-ghost")).to_have_count(0)
        expect(live_overlay.locator(".skeleton-previous-frame-landmark-ghost")).to_have_count(0)
        backwards.click()

        expect(live_overlay.locator(".skeleton-landmark-ghost")).to_have_count(1)
        expect(live_overlay.locator(".skeleton-previous-frame-landmark-ghost")).to_have_count(1)
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
