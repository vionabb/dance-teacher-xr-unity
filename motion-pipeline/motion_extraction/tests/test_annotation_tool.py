from pathlib import Path
import csv
import http.client
import json
import subprocess
import threading

import pytest

from motion_extraction.annotation_tool import generate_temporal_comparison_tasks as temporal_generator
from motion_extraction.annotation_tool.server import (
    AnnotationServer,
    AnnotationStore,
    _is_loopback_host,
    _valid_access_code,
)
from motion_extraction.annotation_tool.prepare_calibration_tasks import add_calibration_tasks


STATIC_ROOT = Path(__file__).parents[1] / "annotation_tool" / "static"


def _manifest() -> dict:
    return {
        "schema_version": "3.0",
        "experiment_id": "experiment-test",
        "task_type": "ordered_quality_tiers",
        "profile_provenance": {"B0": None, "C2": {"smoothing": "triangular3"}},
        "issue_tags": ["jitter", "lag"],
        "landmarks": ["LEFT_SHOULDER", "RIGHT_SHOULDER"],
        "pose_edges": [["LEFT_SHOULDER", "RIGHT_SHOULDER"]],
        "occlusion_states": [
            {"id": "non_occluded", "label": "Non-occluded", "visibility": 1.0},
            {"id": "semi_occluded", "label": "Semi-occluded", "visibility": 0.5},
            {"id": "fully_occluded", "label": "Fully occluded", "visibility": 0.0},
        ],
        "tier_definitions": [
            {"value": 1, "id": "perfect", "label": "Perfect"},
            {"value": 2, "id": "ok", "label": "OK"},
            {"value": 3, "id": "poor", "label": "Poor"},
            {"value": 4, "id": "bad", "label": "Bad"},
        ],
        "tasks": [
            {
                "task_id": "task-high",
                "case_id": "1",
                "priority": 1,
                "category": "high_disagreement",
                "frame_window": {"positions": [8, 9, 10, 11, 12]},
                "source_artifact": "review/source.png",
                "source_dimensions": {"width": 100, "height": 100},
                "overlays": [
                    {"overlay_id": "B0", "artifact": "review/b0.png", "keypoints": {"LEFT_SHOULDER": [10, 10]}, "visibility": {"LEFT_SHOULDER": 0.9}},
                    {"overlay_id": "C2", "artifact": "review/c2.png", "keypoints": {"LEFT_SHOULDER": [20, 20], "RIGHT_SHOULDER": [30, 20]}, "visibility": {"LEFT_SHOULDER": 1.0, "RIGHT_SHOULDER": 0.1}},
                ],
            },
            {
                "task_id": "task-control",
                "case_id": "2",
                "priority": 2,
                "category": "ordinary_control",
                "frame_window": {"positions": [18, 19, 20, 21, 22]},
                "source_artifact": "review/source2.png",
                "source_dimensions": {"width": 100, "height": 100},
                "overlays": [
                    {"overlay_id": "B0", "artifact": "review/b02.png", "keypoints": {}, "visibility": {}},
                    {"overlay_id": "C2", "artifact": "review/c22.png", "keypoints": {}, "visibility": {}},
                ],
            },
        ],
    }


def test_loopback_host_check_rejects_lan_bindings() -> None:
    assert _is_loopback_host("127.0.0.1")
    assert _is_loopback_host("::1")
    assert _is_loopback_host("localhost")
    assert not _is_loopback_host("0.0.0.0")
    assert not _is_loopback_host("192.168.1.21")


def test_access_code_is_six_uppercase_alphanumeric_characters() -> None:
    assert _valid_access_code("A7K2Q9")
    assert _valid_access_code("123456")
    assert not _valid_access_code("a7K2Q9")
    assert not _valid_access_code("A7K2Q")
    assert not _valid_access_code("A7K2Q9!")


def test_annotation_ui_uses_two_screen_workflow_and_no_profile_picker() -> None:
    html = (STATIC_ROOT / "index.html").read_text(encoding="utf-8")
    assert 'id="skeleton-screen"' in html
    assert 'id="annotation-screen"' in html
    assert 'id="initial-profile"' not in html
    assert 'id="to-annotation"' not in html
    assert 'id="frame-preview"' not in html
    assert "<h2>Frame annotation</h2>" not in html
    assert "automatic-scores" not in html
    assert 'id="login-panel"' in html
    assert 'id="user-menu"' in html
    assert 'id="logout"' in html
    assert '<summary id="logged-in-annotator" class="btn btn-ghost btn-sm"></summary>' in html
    assert html.count(">Log out<") == 1
    assert 'class="user-menu dropdown dropdown-end"' in html
    assert '<div class="navbar-end">' in html
    assert 'id="landmark-panel" class="card card-border self-center p-4" aria-labelledby="landmark-dialog-title"' in html
    assert 'class="card card-border flex flex-row items-center justify-between' in html
    assert "dropdown-content menu" in html
    assert 'id="close-landmark-dialog"' not in html
    assert "daisyui@5" in html
    assert "btn btn-primary" in html
    assert "select select-bordered" in html
    assert "textarea textarea-bordered" in html
    assert 'class="modal"' in html
    assert "Identity and access" not in html
    assert ">Reset<" in html
    assert "Adjust the skeleton</h2>" not in html
    assert 'id="complete-case"' in html
    assert 'id="mark-unclear"' in html
    assert 'id="back-to-skeleton"' not in html
    assert "if (rememberedToken && rememberedAnnotator) loadState();" in (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert '$("previous").onclick' not in (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert ".remember-token { display: inline-flex" in (STATIC_ROOT / "style.css").read_text(encoding="utf-8")
    assert "padding: 1rem 1rem 5rem" in (STATIC_ROOT / "style.css").read_text(encoding="utf-8")
    assert ".case-picker select { width: 100%; min-width: 0; color: var(--ink);" in (STATIC_ROOT / "style.css").read_text(encoding="utf-8")
    assert ".case-picker { min-width: 0; max-width: 52%; }" in (STATIC_ROOT / "style.css").read_text(encoding="utf-8")
    assert ".progress-card { min-height: 4.25rem;" in (STATIC_ROOT / "style.css").read_text(encoding="utf-8")
    assert ".progress-card.card { flex-direction: row; }" in (STATIC_ROOT / "style.css").read_text(encoding="utf-8")


def test_annotation_ui_declares_single_pointer_drag_and_native_page_pan() -> None:
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert "state.activePointers.size !== 1" in javascript
    assert "editorView" not in javascript
    assert "state.selectedLandmark" in javascript
    html = (STATIC_ROOT / "index.html").read_text(encoding="utf-8")
    css = (STATIC_ROOT / "style.css").read_text(encoding="utf-8")
    assert 'id="landmark-panel"' in html
    assert "touch-action: auto" in css
    assert "position: fixed" in css
    assert "max-height: min(70vh, calc(100vh - 15rem))" in css
    assert "overflow: visible" in css
    assert ".user-menu summary::-webkit-details-marker { display: none; }" in css
    assert ".user-menu summary::after { content: none; }" in css
    assert "function nearestLandmark(point, radius)" in javascript
    assert "const nearest = nearestLandmark(point, hitRadius)" in javascript


def test_annotation_editor_pads_canvas_around_out_of_frame_landmarks() -> None:
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert "const points = Object.values(state.groundTruth || {})" in javascript
    assert "Math.max(width * .04, -minX + 36, maxX - width + 36)" in javascript
    assert "Math.max(height * .01, -minY + 36)" in javascript
    assert "Math.max(height * .01, maxY - height + 36)" in javascript
    assert "invalid initial positions inside the interactive canvas" in javascript
    assert "const minX = -geometry.paddingX, maxX = geometry.width + geometry.paddingX;" in javascript
    assert "const canLeaveFrame" not in javascript


def test_landmark_hit_test_selects_visible_landmark_coordinates() -> None:
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    start = javascript.index("function nearestLandmark(point, radius)")
    end = javascript.index("\n}", start) + 2
    helper = javascript[start:end]
    script = f"""
{helper}
state = {{groundTruth: {{LEFT_ELBOW: {{x: 120, y: 240}}, RIGHT_ELBOW: {{x: 300, y: 240}}}}}};
if (nearestLandmark({{x: 120, y: 240}}, 24) !== "LEFT_ELBOW") process.exit(1);
if (nearestLandmark({{x: 125, y: 245}}, 24) !== "LEFT_ELBOW") process.exit(2);
if (nearestLandmark({{x: 180, y: 240}}, 24) !== null) process.exit(3);
"""
    result = subprocess.run(["node", "-e", script], check=False, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
def test_annotation_ui_has_outside_dismissible_occlusion_tiles() -> None:
    html = (STATIC_ROOT / "index.html").read_text(encoding="utf-8")
    css = (STATIC_ROOT / "style.css").read_text(encoding="utf-8")
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert 'id="landmark-occlusion-options"' in html
    assert "function mostDiscrepantLandmark(task)" in javascript
    assert "#landmark-occlusion-options label" in css
    assert "#ground-truth-canvas { display: block; max-width: 100%; max-height: min(70vh, calc(100vh - 15rem));" in css
    assert "pointer-events: none" in css
    assert "label:has(input:checked)" in css
    assert '$("landmark-dialog").show();' not in javascript
    assert "#landmark-panel" in css
    assert ".actions .btn-ghost { color: #173c37;" in css
    assert ".actions .btn-warning.btn-outline { color: #6c4b00;" in css


def test_landmark_dialog_has_explicit_viewport_position_when_open() -> None:
    css = (STATIC_ROOT / "style.css").read_text(encoding="utf-8")
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert "#landmark-panel { flex: 0 0 11rem;" in css
    assert "state.selectedLandmark = mostDiscrepantLandmark(task);" in javascript
    assert "padding-bottom: 7rem" in css
    assert "background: #f3f1eb;" in css
    assert "background: #f3f1ebed" not in css


def test_annotation_ui_auto_logs_in_when_both_credentials_are_remembered() -> None:
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert 'localStorage.getItem("annotation-access-token")' in javascript
    assert 'localStorage.getItem("annotation-annotator")' in javascript
    assert "if (rememberedToken && rememberedAnnotator) loadState();" in javascript
    assert 'localStorage.setItem("annotation-annotator", state.annotator)' in javascript


def test_annotation_action_always_unlocks_controls_after_advance_failure() -> None:
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    action_source = javascript.split('document.querySelectorAll(".actions button[data-status]")', 1)[1]
    assert "try {" in action_source
    assert "finally {" in action_source
    assert "lockInteraction(false);" in action_source


def test_annotation_render_does_not_reference_removed_navigation_controls() -> None:
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert '$("previous")' not in javascript
    assert '$("next")' not in javascript
    assert "status-breakdown" not in javascript


def test_store_appends_revisions_and_resumes_prioritized_work(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _manifest())
    initial = store.state("researcher")
    assert initial["resume_task_id"] == "task-high"
    assert initial["progress"]["unjudged"] == 2

    first = store.append(
        {
            "annotator": "researcher",
            "task_id": "task-high",
            "status": "started",
            "tier_assignments": {"B0": 1, "C2": 1},
            "tags": ["jitter"],
            "overlay_tags": {"C2": ["jitter"]},
            "overlay_notes": {"B0": "left arm is missing", "C2": "aligned"},
            "notes": "possible tie",
        }
    )
    second = store.append(
        {
            "annotator": "researcher",
            "task_id": "task-high",
            "status": "completed",
            "tier_assignments": {"B0": 1, "C2": 2},
            "tags": ["lag"],
            "notes": "revised after replay",
        }
    )

    assert second["revision_id"] > first["revision_id"]
    rows = store.export_rows()
    assert len(rows) == 2
    assert rows[1]["supersedes_revision_id"] == rows[0]["revision_id"]
    state = store.state("researcher")
    assert state["progress"]["completed"] == 1
    assert state["resume_task_id"] == "task-control"
    assert state["latest_judgments"]["task-high"]["tags"] == ["lag"]


def test_completed_tier_judgment_requires_every_overlay(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _manifest())

    with pytest.raises(ValueError, match="every overlay"):
        store.append(
            {
                "annotator": "researcher",
                "task_id": "task-high",
                "status": "completed",
                "tier_assignments": {"B0": 1},
            }
        )


def test_tier_values_and_overlay_notes_are_validated(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _manifest())

    with pytest.raises(ValueError, match="one of"):
        store.append(
            {
                "annotator": "researcher",
                "task_id": "task-high",
                "status": "started",
                "tier_assignments": {"B0": 5},
            }
        )
    with pytest.raises(ValueError, match="overlay_notes"):
        store.append(
            {
                "annotator": "researcher",
                "task_id": "task-high",
                "status": "started",
                "overlay_notes": {"unknown": "bad"},
            }
        )


def test_ties_skip_and_unclear_are_valid(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _manifest())
    store.append(
        {
            "annotator": "researcher",
            "task_id": "task-high",
            "status": "completed",
            "tier_assignments": {"B0": 1, "C2": 1},
        }
    )
    store.append(
        {
            "annotator": "researcher",
            "task_id": "task-control",
            "status": "skipped",
            "tier_assignments": {},
        }
    )

    progress = store.state("researcher")["progress"]
    assert progress["completed"] == 1
    assert progress["skipped"] == 1


def test_adjusted_skeleton_completes_without_tiers_and_ranks_profiles(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _manifest())
    result = store.append(
        {
            "annotator": "researcher",
            "task_id": "task-high",
            "status": "completed",
            "ground_truth_initial_profile": "C2",
            "initial_ground_truth_landmarks": {
                "LEFT_SHOULDER": {"x": 20, "y": 20, "occlusion": "non_occluded"},
                "RIGHT_SHOULDER": {"x": 30, "y": 20, "occlusion": "fully_occluded"},
            },
            "initial_landmark_sources": {
                "LEFT_SHOULDER": "C2",
                "RIGHT_SHOULDER": "C2",
            },
            "landmark_interactions": {
                "LEFT_SHOULDER": {
                    "position_drag_count": 0,
                    "position_changed": False,
                    "occlusion_change_count": 0,
                    "occlusion_changed": False,
                }
            },
            "ground_truth_landmarks": {
                "LEFT_SHOULDER": {"x": 20, "y": 20, "occlusion": "non_occluded"},
                "RIGHT_SHOULDER": {"x": 30, "y": 20, "occlusion": "fully_occluded"},
            },
        }
    )

    scores = result["automatic_profile_scores"]
    assert scores["C2"]["rank"] == 1
    assert scores["C2"]["mean_error_torso"] == 0
    assert scores["C2"]["mean_visibility_absolute_error"] == pytest.approx(0.05)
    assert scores["B0"]["missing_position_landmark_count"] == 0
    latest = store.state("researcher")["latest_judgments"]["task-high"]
    assert latest["ground_truth_landmarks"]["RIGHT_SHOULDER"]["occlusion"] == "fully_occluded"
    assert latest["ground_truth_initial_profile"] == "C2"
    assert latest["initial_landmark_sources"]["LEFT_SHOULDER"] == "C2"
    assert latest["landmark_interactions"]["LEFT_SHOULDER"]["position_drag_count"] == 0
    exported = store.export_rows()[0]
    assert exported["final_tolerance_source"] == "provisional"
    assert '"position_equivalence_tolerance_torso": 0.05' in exported[
        "final_automatic_profile_scores_json"
    ]


def test_semi_occluded_position_is_half_weighted_and_missing_is_penalized(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _manifest())
    result = store.append(
        {
            "annotator": "researcher",
            "task_id": "task-high",
            "status": "started",
            "ground_truth_landmarks": {
                "LEFT_SHOULDER": {"x": 20, "y": 20, "occlusion": "semi_occluded"},
                "RIGHT_SHOULDER": {"x": 30, "y": 20, "occlusion": "non_occluded"},
            },
        }
    )
    assert result["automatic_profile_scores"]["B0"]["missing_position_landmark_count"] == 1
    assert result["automatic_profile_scores"]["C2"]["position_weight_total"] == 1.5


def test_occluded_landmarks_may_leave_frame_and_bounds_never_block_skip(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _manifest())
    for occlusion in ("semi_occluded", "fully_occluded"):
        store.append(
            {
                "annotator": "researcher",
                "task_id": "task-high",
                "status": "completed",
                "ground_truth_landmarks": {
                    "LEFT_SHOULDER": {"x": -25, "y": 125, "occlusion": occlusion},
                },
            }
        )
    store.append(
        {
            "annotator": "researcher",
            "task_id": "task-high",
            "status": "skipped",
            "ground_truth_landmarks": {
                "LEFT_SHOULDER": {"x": -25, "y": 125, "occlusion": "non_occluded"},
            },
        }
    )
    with pytest.raises(ValueError, match="non-occluded ground truth"):
        store.append(
            {
                "annotator": "researcher",
                "task_id": "task-high",
                "status": "completed",
                "ground_truth_landmarks": {
                    "LEFT_SHOULDER": {"x": -25, "y": 125, "occlusion": "non_occluded"},
                },
            }
        )


def test_ui_flushes_pending_save_and_advances_only_after_success() -> None:
    app_js = Path(__file__).parents[1] / "annotation_tool/static/app.js"
    source = app_js.read_text(encoding="utf-8")
    save_source = source.split("async function save(status)", 1)[1].split(
        "async function flushPendingSave()", 1
    )[0]

    assert "async function flushPendingSave()" in source
    assert "const previous = state.savePromise" in save_source
    assert "refresh(" not in save_source
    assert "lockInteraction(true)" in source
    assert "navigateTo(state.taskIndex - 1)" in source
    assert "if (saved)" in source


def test_overlay_issue_tags_are_attributed_and_exported(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _manifest())
    store.append(
        {
            "annotator": "researcher",
            "task_id": "task-high",
            "status": "started",
            "tier_assignments": {"B0": 1, "C2": 2},
            "overlay_tags": {"C2": ["lag", "jitter"]},
            "overlay_notes": {"B0": "left wrist misses the source", "C2": "good"},
        }
    )

    latest = store.state("researcher")["latest_judgments"]["task-high"]
    assert latest["overlay_tags"] == {"C2": ["lag", "jitter"]}
    assert latest["overlay_notes"] == {
        "B0": "left wrist misses the source",
        "C2": "good",
    }
    assert '"C2": ["lag", "jitter"]' in store.export_rows()[0]["overlay_tags_json"]
    assert '"B0": "left wrist misses the source"' in store.export_rows()[0]["overlay_notes_json"]


def test_ui_supports_per_frame_free_text_without_comparative_judgments() -> None:
    static_root = Path(__file__).parents[1] / "annotation_tool/static"
    app_source = (static_root / "app.js").read_text(encoding="utf-8")
    html_source = (static_root / "index.html").read_text(encoding="utf-8")

    assert 'id="frame-note"' in html_source
    assert '$("frame-note").value.trim()' in app_source
    assert 'tier_assignments: {}' in app_source
    assert 'overlay_notes: {}' in app_source
    assert "configureDropZone" not in app_source
    assert "tier-board" not in html_source
    assert "comparative judgments" not in html_source
    assert "Observed issues" not in html_source
    assert "jitter" not in html_source
    assert "lag" not in html_source
    assert "attenuation" not in html_source
    assert "ground-truth-canvas" in html_source
    assert "ground_truth_landmarks" in app_source
    assert "onpointermove" in app_source
    assert "fully_occluded" in app_source
    assert "semi_occluded" in app_source
    assert "automatic_profile_scores" not in app_source
    assert "geometry.paddingX" in app_source
    assert 'edgeStates.has("fully_occluded")' in app_source
    assert "initial_ground_truth_landmarks" in app_source
    assert "landmark_interactions" in app_source


def test_source_evidence_is_append_only_validated_and_exported(tmp_path: Path) -> None:
    manifest = _manifest()
    manifest["tasks"][0]["requires_evidence_quality"] = True
    manifest["tasks"][0]["annotation_title"] = "Input evidence check"
    manifest["tasks"][0]["annotation_instruction"] = "Assess source evidence before editing."
    store = AnnotationStore(tmp_path / "annotations.sqlite3", manifest)

    with pytest.raises(ValueError, match="requires a source_evidence_quality"):
        store.append(
            {
                "annotator": "researcher",
                "task_id": "task-high",
                "status": "completed",
                "ground_truth_landmarks": {
                    "LEFT_SHOULDER": {"x": 10, "y": 10, "occlusion": "non_occluded"}
                },
            }
        )
    store.append(
        {
            "annotator": "researcher",
            "task_id": "task-high",
            "status": "completed",
            "source_evidence_quality": "constrained",
            "source_evidence_factors": ["low_light", "motion_blur"],
            "ground_truth_landmarks": {
                "LEFT_SHOULDER": {"x": 10, "y": 10, "occlusion": "non_occluded"}
            },
        }
    )
    latest = store.state("researcher")["latest_judgments"]["task-high"]
    assert latest["source_evidence_quality"] == "constrained"
    assert latest["source_evidence_factors"] == ["low_light", "motion_blur"]
    assert store.state("researcher")["source_evidence_quality_definitions"][0]["id"] == "usable"
    exported = store.export_rows()[0]
    assert exported["source_evidence_quality"] == "constrained"
    assert exported["source_evidence_factors_json"] == '["low_light", "motion_blur"]'

    with pytest.raises(ValueError, match="unknown source_evidence_factors"):
        store.append(
            {
                "annotator": "researcher",
                "task_id": "task-control",
                "status": "started",
                "source_evidence_factors": ["unlisted"],
            }
        )


def test_ui_renders_source_evidence_without_redundant_task_chrome() -> None:
    static_root = Path(__file__).parents[1] / "annotation_tool/static"
    app_source = (static_root / "app.js").read_text(encoding="utf-8")
    html_source = (static_root / "index.html").read_text(encoding="utf-8")

    assert 'id="task-guidance"' not in html_source
    assert 'id="source-evidence-quality-options"' in html_source
    assert 'id="source-evidence-factor-options"' in html_source
    assert "function taskGuidance(task)" not in app_source
    assert "function renderSourceEvidence(task, judgment)" in app_source
    assert "source_evidence_quality" in app_source


def test_balanced_repeat_tasks_estimate_empirical_tolerance(tmp_path: Path) -> None:
    manifest = _manifest()
    manifest["landmarks"] = ["LEFT_SHOULDER"]
    manifest["pose_edges"] = []
    profiles = ["B0", "C1", "C2", "C3", "C4"]
    base = manifest["tasks"][0]
    base["overlays"] = [
        {
            "overlay_id": profile,
            "artifact": f"review/{profile}.png",
            "keypoints": {"LEFT_SHOULDER": [20, 20]},
            "visibility": {"LEFT_SHOULDER": 1.0},
        }
        for profile in profiles
    ]
    manifest["tasks"] = []
    for index in range(5):
        task = dict(base)
        task["task_id"] = f"original-{index}"
        task["case_id"] = str(index)
        task["priority"] = index + 1
        task["overlays"] = [dict(overlay) for overlay in base["overlays"]]
        manifest["tasks"].append(task)
    database = tmp_path / "annotations.sqlite3"
    store = AnnotationStore(database, manifest)
    original_initializers = ["B0", "C1", "C1", "C1", "C1"]
    for task, initializer in zip(manifest["tasks"], original_initializers):
        store.append(
            {
                "annotator": "researcher",
                "task_id": task["task_id"],
                "status": "completed",
                "ground_truth_initial_profile": initializer,
                "ground_truth_landmarks": {
                    "LEFT_SHOULDER": {"x": 20, "y": 20, "occlusion": "non_occluded"}
                },
            }
        )

    calibrated = add_calibration_tasks(manifest, database, "researcher")
    repeats = [task for task in calibrated["tasks"] if task.get("calibration_of_task_id")]
    assert len(repeats) == 5
    assert {task["default_initial_profile"] for task in repeats} == set(profiles)
    assert all(
        task["default_initial_profile"]
        != original_initializers[int(task["calibration_of_task_id"].removeprefix("original-"))]
        for task in repeats
    )

    calibrated_store = AnnotationStore(database, calibrated)
    calibrated_store.append(
        {
            "annotator": "researcher",
            "task_id": repeats[0]["calibration_of_task_id"],
            "status": "completed",
            "ground_truth_initial_profile": "C4",
            "ground_truth_landmarks": {
                "LEFT_SHOULDER": {"x": 80, "y": 80, "occlusion": "non_occluded"}
            },
        }
    )
    for task in repeats[:3]:
        calibrated_store.append(
            {
                "annotator": "researcher",
                "task_id": task["task_id"],
                "status": "completed",
                "ground_truth_initial_profile": task["default_initial_profile"],
                "ground_truth_landmarks": {
                    "LEFT_SHOULDER": {"x": 25, "y": 20, "occlusion": "non_occluded"}
                },
            }
        )
    summary = calibrated_store.state("researcher")["calibration_summary"]
    assert summary["completed_repeat_count"] == 3
    assert summary["paired_position_landmark_count"] == 3
    assert summary["active_tolerance_source"] == "empirical_median_repeat_p90"
    assert summary["active_tolerance_torso"] == pytest.approx(5 / (100**2 + 100**2) ** 0.5 * 5)


def _temporal_manifest() -> dict:
    return {
        "schema_version": "1.0",
        "experiment_id": "temporal-test",
        "task_type": "temporal_pose_comparison",
        "tasks": [
            {
                "task_id": "temporal-1",
                "case_id": "temporal-1",
                "priority": 1,
                "task_type": "temporal_pose_comparison",
                "source_video": "media/source.mp4",
                "candidates": [
                    {"candidate_id": label, "artifact": f"media/{label}.mp4"}
                    for label in ("A", "B", "C")
                ],
                "frame_window": {"start_position": 10, "end_position_exclusive": 70},
            }
        ],
    }


def test_temporal_responses_are_typed_append_only_and_exported(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _temporal_manifest())
    first = store.append(
        {
            "annotator": "reviewer",
            "task_id": "temporal-1",
            "status": "started",
            "temporal_response": {"choice": "B", "confidence": "", "note": ""},
            "tier_assignments": {},
        }
    )
    second = store.append(
        {
            "annotator": "reviewer",
            "task_id": "temporal-1",
            "status": "completed",
            "temporal_response": {
                "choice": "no_discernible_difference",
                "confidence": "medium",
                "note": "Only visible frame by frame.",
            },
            "tier_assignments": {},
        }
    )
    assert second["revision_id"] > first["revision_id"]
    latest = store.state("reviewer")["latest_judgments"]["temporal-1"]
    assert latest["task_type"] == "temporal_pose_comparison"
    assert latest["temporal_response"] == {
        "choice": "no_discernible_difference",
        "confidence": "medium",
        "note": "Only visible frame by frame.",
    }
    rows = store.export_rows()
    assert len(rows) == 2
    assert rows[1]["supersedes_revision_id"] == rows[0]["revision_id"]
    assert rows[1]["temporal_choice"] == "no_discernible_difference"
    assert rows[1]["temporal_confidence"] == "medium"
    assert rows[1]["temporal_note"] == "Only visible frame by frame."
    assert rows[1]["automatic_profile_scores_json"] == "{}"


def test_completed_temporal_response_validation_is_separate_from_skeleton_scores(
    tmp_path: Path,
) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _temporal_manifest())
    with pytest.raises(ValueError, match="exactly one choice"):
        store.append(
            {
                "annotator": "reviewer",
                "task_id": "temporal-1",
                "status": "completed",
                "temporal_response": {},
            }
        )
    with pytest.raises(ValueError, match="requires confidence"):
        store.append(
            {
                "annotator": "reviewer",
                "task_id": "temporal-1",
                "status": "completed",
                "temporal_response": {"choice": "A"},
            }
        )
    store.append(
        {
            "annotator": "reviewer",
            "task_id": "temporal-1",
            "status": "completed",
            "temporal_response": {"choice": "cannot_judge", "note": "Source is hidden."},
        }
    )
    with pytest.raises(ValueError, match="only valid"):
        AnnotationStore(tmp_path / "skeleton.sqlite3", _manifest()).append(
            {
                "annotator": "reviewer",
                "task_id": "task-high",
                "status": "started",
                "temporal_response": {"choice": "A"},
            }
        )


def _triage_manifest() -> dict:
    return {
        "schema_version": "1.0",
        "experiment_id": "triage-test",
        "task_type": "quality_triage",
        "tasks": [
            {
                "task_id": "triage-1",
                "case_id": "triage-1",
                "priority": 1,
                "task_type": "quality_triage",
                "category": "crop",
                "review_unit": "frame",
                "source_artifact": "triage-1/frame.png",
                "signal_value": 0.87,
            }
        ],
    }


def test_triage_responses_are_typed_append_only_and_exported(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _triage_manifest())
    first = store.append(
        {
            "annotator": "reviewer",
            "task_id": "triage-1",
            "status": "started",
            "triage_response": {"verdict": "fine", "note": ""},
            "tier_assignments": {},
        }
    )
    second = store.append(
        {
            "annotator": "reviewer",
            "task_id": "triage-1",
            "status": "completed",
            "triage_response": {"verdict": "problematic", "note": "Hips off-frame the whole clip."},
            "tier_assignments": {},
        }
    )
    assert second["revision_id"] > first["revision_id"]
    latest = store.state("reviewer")["latest_judgments"]["triage-1"]
    assert latest["task_type"] == "quality_triage"
    assert latest["triage_response"] == {
        "verdict": "problematic",
        "note": "Hips off-frame the whole clip.",
    }
    rows = store.export_rows()
    assert len(rows) == 2
    assert rows[1]["supersedes_revision_id"] == rows[0]["revision_id"]
    assert json.loads(rows[1]["triage_response_json"]) == {
        "verdict": "problematic",
        "note": "Hips off-frame the whole clip.",
    }
    assert rows[1]["ground_truth_landmarks_json"] == "{}"


def test_completed_triage_response_requires_a_verdict(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _triage_manifest())
    with pytest.raises(ValueError, match="requires a verdict"):
        store.append(
            {
                "annotator": "reviewer",
                "task_id": "triage-1",
                "status": "completed",
                "triage_response": {"note": "no verdict chosen"},
            }
        )
    store.append(
        {
            "annotator": "reviewer",
            "task_id": "triage-1",
            "status": "completed",
            "triage_response": {"verdict": "cannot_judge", "note": "Frame is fully black."},
        }
    )


def test_triage_response_is_rejected_on_a_non_triage_task(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="only valid"):
        AnnotationStore(tmp_path / "skeleton.sqlite3", _manifest()).append(
            {
                "annotator": "reviewer",
                "task_id": "task-high",
                "status": "started",
                "triage_response": {"verdict": "fine"},
            }
        )


def test_mp4_serving_supports_mime_type_and_single_byte_ranges(tmp_path: Path) -> None:
    experiment = tmp_path / "experiment"
    media = experiment / "media"
    media.mkdir(parents=True)
    payload = b"0123456789abcdef"
    (media / "clip.mp4").write_bytes(payload)
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _temporal_manifest())
    server = AnnotationServer(0, experiment, store)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        connection = http.client.HTTPConnection("127.0.0.1", server.server_port)
        connection.request(
            "GET", "/artifacts/media/clip.mp4", headers={"Range": "bytes=4-8"}
        )
        response = connection.getresponse()
        assert response.status == 206
        assert response.getheader("Content-Type") == "video/mp4"
        assert response.getheader("Accept-Ranges") == "bytes"
        assert response.getheader("Content-Range") == "bytes 4-8/16"
        assert response.read() == b"45678"
        connection.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_access_info_reports_whether_a_token_is_required(tmp_path: Path) -> None:
    store = AnnotationStore(tmp_path / "annotations.sqlite3", _manifest())
    open_server = AnnotationServer(0, tmp_path / "experiment", store)
    thread = threading.Thread(target=open_server.serve_forever, daemon=True)
    thread.start()
    try:
        connection = http.client.HTTPConnection("127.0.0.1", open_server.server_port)
        connection.request("GET", "/api/access-info")
        response = connection.getresponse()
        assert response.status == 200
        assert json.loads(response.read()) == {"access_token_required": False}
        connection.close()
    finally:
        open_server.shutdown()
        open_server.server_close()
        thread.join(timeout=2)

    protected_server = AnnotationServer(
        0, tmp_path / "experiment", store, access_token="A7K2Q9"
    )
    thread = threading.Thread(target=protected_server.serve_forever, daemon=True)
    thread.start()
    try:
        connection = http.client.HTTPConnection("127.0.0.1", protected_server.server_port)
        connection.request("GET", "/api/access-info")
        response = connection.getresponse()
        assert response.status == 200
        assert json.loads(response.read()) == {"access_token_required": True}
        connection.close()
    finally:
        protected_server.shutdown()
        protected_server.server_close()
        thread.join(timeout=2)


def test_temporal_generator_blinds_profiles_and_links_permuted_repeats(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    roots = {
        name: tmp_path / name
        for name in ("corpus", "numerical", "reference", "participant")
    }
    for root in roots.values():
        root.mkdir()
    (roots["numerical"] / "numerical_by_clip.csv").write_text(
        "fixture\n", encoding="utf-8"
    )
    (roots["numerical"] / "included_clips.tsv").write_text(
        "fixture\n", encoding="utf-8"
    )
    candidates = []
    for index, (kind, category) in enumerate(
        [
            ("reference", "artifact_rich"),
            ("participant", "attenuation_risk"),
            ("participant", "artifact_rich"),
            ("reference", "attenuation_risk"),
        ],
        start=1,
    ):
        candidates.append(
            {
                "relative_stem": f"{kind}/clip-{index}",
                "kind": kind,
                "selection_category": category,
                "selection_score": 10 - index,
                "start_frame": index * 10,
                "end_frame": index * 10 + 60,
                "center_frame": index * 10 + 30,
                "fps": 20.0,
                "corpus": kind,
                "dance": f"dance-{index}",
                "condition": "test",
                "selection_reason": "test fixture",
            }
        )

    def fake_render(window, task_dir, order, ffmpeg):
        task_dir.mkdir(parents=True)
        source = task_dir / "source.mp4"
        source.write_bytes(b"source")
        artifacts = {}
        for label, profile in zip(("A", "B", "C"), order):
            path = task_dir / f"candidate_{label}.mp4"
            path.write_text(profile, encoding="utf-8")
            artifacts[label] = path.as_posix()
        return source.as_posix(), artifacts

    monkeypatch.setattr(temporal_generator, "_require_encoder", lambda: "ffmpeg")
    monkeypatch.setattr(
        temporal_generator, "_source_candidates", lambda *args: candidates
    )
    monkeypatch.setattr(temporal_generator, "_render_unique_media", fake_render)
    output = tmp_path / "served-temporal-batch"
    manifest_path, answer_key_path = (
        temporal_generator.generate_temporal_comparison_tasks(
            roots["corpus"],
            roots["numerical"],
            roots["reference"],
            roots["participant"],
            output,
            seed=31,
            task_count=6,
        )
    )
    manifest_text = manifest_path.read_text(encoding="utf-8")
    manifest = json.loads(manifest_text)
    assert len(manifest["tasks"]) == 6
    assert manifest["unique_window_count"] == 4
    assert manifest["repeat_count"] == 2
    originals = manifest["tasks"][:4]
    assert {task["source_provenance"]["source_kind"] for task in originals} == {
        "reference",
        "participant",
    }
    assert {task["category"] for task in originals} == {
        "artifact_rich",
        "attenuation_risk",
    }
    assert len(
        {task["source_provenance"]["relative_stem"] for task in originals}
    ) == 4
    assert all(task["frame_window"]["fps"] == 20.0 for task in originals)
    assert "C4+a" not in manifest_text
    assert "neighbor_weight" not in manifest_text
    assert answer_key_path.parent == output.parent
    assert answer_key_path.parent != output
    with answer_key_path.open(encoding="utf-8") as stream:
        keys = list(csv.DictReader(stream))
    assert {row["profile_id"] for row in keys} == {
        "C4",
        "C4+a=.01",
        "C4+a=.02",
    }
    mappings = {
        task["task_id"]: {
            row["candidate_id"]: row["profile_id"]
            for row in keys
            if row["task_id"] == task["task_id"]
        }
        for task in manifest["tasks"]
    }
    for repeat in manifest["tasks"][4:]:
        original_id = repeat["repeat_of_task_id"]
        assert original_id
        assert mappings[repeat["task_id"]] != mappings[original_id]


def test_access_code_field_is_hidden_when_the_server_does_not_require_one() -> None:
    html = (STATIC_ROOT / "index.html").read_text(encoding="utf-8")
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert 'id="access-token-field"' in html
    assert '/api/access-info' in javascript
    assert '$("access-token-field").hidden = true' in javascript


def test_temporal_ui_contract_has_blinded_synchronized_responsive_controls() -> None:
    html = (STATIC_ROOT / "index.html").read_text(encoding="utf-8")
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    css = (STATIC_ROOT / "style.css").read_text(encoding="utf-8")
    assert 'id="temporal-screen"' in html
    assert 'id="temporal-source-video"' in html
    assert 'id="temporal-candidates"' in html
    assert 'id="temporal-play"' in html
    assert 'id="temporal-pause"' in html
    assert 'id="temporal-restart"' in html
    assert 'id="temporal-loop"' in html
    assert 'id="temporal-speed-half"' in html
    assert 'id="temporal-speed-normal"' in html
    assert all(f'value="{value}"' in html for value in ("A", "B", "C"))
    assert 'value="no_discernible_difference"' in html
    assert 'value="cannot_judge"' in html
    assert "function playTemporalVideos" in javascript
    assert "Math.abs(video.currentTime - source.currentTime) > .08" in javascript
    assert "temporal_response: temporalResponse" in javascript
    assert "candidate.profile" not in javascript
    assert ".temporal-candidates { display: grid;" in css
    assert "@media (max-width: 800px)" in css
    assert ".temporal-candidates { grid-template-columns: 1fr; }" in css


def test_triage_ui_contract_shows_overlay_and_a_fast_verdict_only() -> None:
    html = (STATIC_ROOT / "index.html").read_text(encoding="utf-8")
    javascript = (STATIC_ROOT / "app.js").read_text(encoding="utf-8")
    assert 'id="triage-screen"' in html
    assert 'id="triage-category-badge"' in html
    assert 'id="triage-frame-figure"' in html
    assert 'id="triage-frame-image"' in html
    assert 'id="triage-clip-figure"' in html
    assert 'id="triage-clip-video"' in html
    assert 'id="triage-note"' in html
    assert all(f'value="{value}"' in html for value in ("fine", "problematic", "cannot_judge"))
    # No factor-tag or source-evidence-quality checkboxes on this screen -- the
    # design deliberately keeps Stage 1 to a single fast verdict.
    assert "source-evidence-factor" not in html.split('id="triage-screen"')[1].split("</section>")[0]
    assert "function isTriageTask" in javascript
    assert "function renderTriageTask" in javascript
    assert "triage_response: triageResponse" in javascript
