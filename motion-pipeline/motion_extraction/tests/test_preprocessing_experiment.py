import json
from pathlib import Path

import numpy as np
import pandas as pd

from dance_teacher_pose import PoseDataType, preprocess_pose_dataframe
from motion_extraction.scripts.run_preprocessing_experiment import (
    PROFILES,
    _c2_frame_scores,
    _displacement_summary,
    _load_corpus_membership,
    _synthetic_checks,
    _visible_roots,
    _whole_pose_gap_events,
    _write_gap_event_plots,
    _write_c2_distortion_review,
)


def _linear_pose(frame_count: int = 30) -> pd.DataFrame:
    fields = ("x", "y", "distance")
    roots = {
        "LEFT_HIP": (-1.0, 0.0, 0.0),
        "RIGHT_HIP": (1.0, 0.0, 0.0),
        "LEFT_SHOULDER": (-1.0, 2.0, 0.0),
        "RIGHT_SHOULDER": (1.0, 2.0, 0.0),
        "LEFT_WRIST": (0.0, 1.0, 0.0),
    }
    data: dict[str, list[float]] = {}
    for root, initial in roots.items():
        for field, value in zip(fields, initial):
            data[f"{root}_{field}"] = [
                value + (0.02 * frame if field == "x" else 0.0)
                for frame in range(frame_count)
            ]
        data[f"{root}_vis"] = [1.0] * frame_count
    return pd.DataFrame(data, index=pd.Index(range(frame_count), name="frame"))


def test_real_manifest_resolves_exact_25_clip_working_set() -> None:
    corpus_root = Path(__file__).parents[2] / "temp/experiments/20260813-preprocessing-lightweight"
    included, excluded, stems = _load_corpus_membership(corpus_root)

    assert len(included) == len(stems) == 25
    assert len(excluded) == 2
    assert not any("user5357" in stem or stem.endswith("clip5") and "user4751" in stem for stem in stems)


def test_synthetic_checks_repair_three_but_not_edge_four_or_fifteen() -> None:
    result = _synthetic_checks(_linear_pose(), PROFILES["C1"], PoseDataType.pose2d)

    assert result is not None
    assert result["gap_recovered"] == 1
    assert result["edge_gap_unfilled"] == 1
    assert result["internal_4_gap_unfilled"] == 1
    assert result["internal_15_gap_unfilled"] == 1
    assert result["spike_replaced"] == 1
    assert result["uncorrupted_span_unprompted_outlier_action_count"] == 0


def test_c4_gap_only_profile_rejects_three_frame_gap_without_outlier_action() -> None:
    result = _synthetic_checks(_linear_pose(), PROFILES["C4"], PoseDataType.pose2d)

    assert result is not None
    assert result["gap_recovered"] == 0
    assert result["spike_replaced"] == 0


def test_quality_roots_exclude_generated_base_and_metadata() -> None:
    clean = preprocess_pose_dataframe(_linear_pose(), PoseDataType.pose2d)

    roots = _visible_roots(clean, ("x", "y", "distance"))

    assert "base" not in roots
    assert all(not root.startswith("preprocess_") for root in roots)


def test_whole_pose_gap_manifest_distinguishes_internal_and_edge_events() -> None:
    raw = _linear_pose()
    coordinate_columns = [column for column in raw if not column.endswith("_vis")]
    raw.loc[5, coordinate_columns] = np.nan
    raw.loc[28:29, coordinate_columns] = np.nan

    events = _whole_pose_gap_events(raw, PoseDataType.pose2d, "test/clip")

    assert [(event["gap_length"], event["is_edge_gap"]) for event in events] == [(1, 0), (2, 1)]


def test_whole_pose_gap_plot_includes_selected_internal_event(tmp_path: Path) -> None:
    corpus_root = tmp_path / "corpus"
    raw_root = corpus_root / "raw" / "pose2d" / "test"
    raw_root.mkdir(parents=True)
    raw = _linear_pose()
    coordinate_columns = [column for column in raw if not column.endswith("_vis")]
    raw.loc[12, coordinate_columns] = np.nan
    raw.to_csv(raw_root / "clip.pose2d.raw.csv", index_label="frame")
    events = pd.DataFrame(
        _whole_pose_gap_events(raw, PoseDataType.pose2d, "test/clip")
    )
    output_root = tmp_path / "output"
    output_root.mkdir()

    _write_gap_event_plots(corpus_root, output_root, events)

    selection = pd.read_csv(output_root / "whole_pose_gap_plot_selection.csv")
    assert len(selection) == 1
    assert (output_root / selection.loc[0, "artifact"]).exists()


def test_untouched_high_confidence_displacement_is_zero() -> None:
    raw = _linear_pose()
    baseline = preprocess_pose_dataframe(raw, PoseDataType.pose2d)
    candidate = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=PROFILES["C2"])

    summary = _displacement_summary(
        raw,
        baseline,
        candidate,
        PoseDataType.pose2d,
        min_visibility=0.5,
    )

    assert summary["untouched_coordinate_count"] > 0
    assert np.isclose(summary["untouched_displacement_p95"], 0.0)


def test_c2_frame_scores_prioritize_high_visibility_distal_disagreement() -> None:
    raw = _linear_pose()
    baseline = preprocess_pose_dataframe(raw, PoseDataType.pose2d)
    candidate = baseline.copy()
    candidate.loc[10, "LEFT_WRIST_x"] += 0.5

    scores = _c2_frame_scores(raw, baseline, candidate)
    highest = scores.nlargest(1, "disagreement").iloc[0]

    assert highest["frame_position"] == 10
    assert highest["joint"] == "LEFT_WRIST"
    assert np.isclose(highest["disagreement"], 0.5)


def test_c2_review_writes_single_frame_source_backed_annotation_tasks(tmp_path: Path) -> None:
    import cv2

    corpus_root = tmp_path / "corpus"
    raw_root = corpus_root / "raw" / "pose2d" / "test"
    video_root = corpus_root / "videos" / "test"
    raw_root.mkdir(parents=True)
    video_root.mkdir(parents=True)
    raw = _linear_pose()
    raw.to_csv(raw_root / "clip.pose2d.raw.csv", index_label="frame")
    video_path = video_root / "clip.mp4"
    writer = cv2.VideoWriter(
        str(video_path), cv2.VideoWriter_fourcc(*"mp4v"), 30.0, (64, 64)
    )
    if not writer.isOpened():
        import pytest

        pytest.skip("OpenCV MP4 writer is unavailable")
    for frame_number in range(len(raw)):
        writer.write(np.full((64, 64, 3), frame_number, dtype=np.uint8))
    writer.release()
    output_root = tmp_path / "output"
    output_root.mkdir()

    _write_c2_distortion_review(
        corpus_root, output_root, ["test/clip"], max_cases=1
    )

    cases = pd.read_csv(output_root / "c2_review_cases.csv")
    answers = pd.read_csv(output_root / "c2_review_answer_key.csv")
    manifest = json.loads((output_root / "annotation_tasks.json").read_text())
    assert len(cases) == len(answers) == 1
    assert (output_root / cases.loc[0, "artifact"]).exists()
    assert {answers.loc[0, "A"], answers.loc[0, "B"]} == {"B0", "C2"}
    assert cases.loc[0, "source_artifact"]
    assert manifest["schema_version"] == "3.0"
    assert manifest["task_type"] == "editable_pose_ground_truth"
    assert manifest["pose_edges"]
    assert manifest["landmarks"]
    assert [state["id"] for state in manifest["occlusion_states"]] == [
        "non_occluded",
        "semi_occluded",
        "fully_occluded",
    ]
    assert [tier["label"] for tier in manifest["tier_definitions"]] == [
        "Perfect",
        "OK",
        "Poor",
        "Bad",
    ]
    assert len(manifest["tasks"]) == 5
    assert manifest["tasks"][0]["frame_window"]["center_position"] == int(
        cases.loc[0, "center_frame_position"]
    )
    for task in manifest["tasks"]:
        assert len(task["frame_window"]["positions"]) == 1
        source = cv2.imread(str(output_root / task["source_artifact"]))
        assert source is not None and source.shape[:2] == (64, 64)
        assert task["source_dimensions"] == {"width": 64, "height": 64}
        assert len(task["overlays"]) == len(PROFILES)
        for overlay in task["overlays"]:
            rendered = cv2.imread(str(output_root / overlay["artifact"]))
            assert rendered is not None and rendered.shape[:2] == (64, 64)
            assert isinstance(overlay["keypoints"], dict)
            assert isinstance(overlay["visibility"], dict)
