import json
from pathlib import Path

import pandas as pd

from dance_teacher_pose import PoseDataType, preprocess_pose_dataframe
from motion_extraction.annotation_tool.attach_error_marking_landmarks import attach_landmarks
from motion_extraction.scripts.run_preprocessing_experiment import _pose_pixels


def _linear_pose(frame_count: int = 30) -> pd.DataFrame:
    # Same fixture shape as test_preprocessing_experiment.py's _linear_pose():
    # a few landmarks drifting linearly in x, fully visible throughout.
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
                value + (0.02 * frame if field == "x" else 0.0) for frame in range(frame_count)
            ]
        data[f"{root}_vis"] = [1.0] * frame_count
    return pd.DataFrame(data, index=pd.Index(range(frame_count), name="frame"))


def _write_pose_csv(path: Path, frame_count: int = 30) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _linear_pose(frame_count).to_csv(path)


def _signals_csv(tmp_path: Path, pose_path: Path, *, frame_count: int = 30) -> Path:
    row = {
        "corpus": "test_corpus",
        "relative_stem": "clip-a",
        "video_path": "/videos/clip-a.mp4",
        "pose_path": str(pose_path),
        "pose_available": True,
        "error": "",
        "frame_count": frame_count,
        "video_fps": 10.0,
        "video_width": 320,
        "video_height": 240,
        "crop_violation_fraction": 0.0,
        "crop_longest_run_start": -1,
        "crop_longest_run_frames": 0,
        "windowed_roughness_p95_max": 0.5,
        "windowed_roughness_worst_window_start": 0,
        "false_tracking_candidate_fraction": 0.1,
        "false_tracking_longest_run_start": -1,
        "false_tracking_longest_run_frames": 0,
    }
    csv_path = tmp_path / "automatic_quality_signals.csv"
    pd.DataFrame([row]).to_csv(csv_path, index=False)
    return csv_path


def _error_marking_manifest(*, frame_count: int = 30) -> dict:
    return {
        "schema_version": "1.0",
        "experiment_id": "attach-landmarks-test",
        "task_type": "error_marking",
        "tasks": [
            {
                "task_id": "error-marking-000",
                "case_id": "error-marking-000",
                "task_type": "error_marking",
                "priority": 0,
                "category": "roughness",
                "corpus": "test_corpus",
                "relative_stem": "clip-a",
                "source_artifact": "error-marking-000/clip.mp4",
                "fps": 10.0,
                "frame_count": frame_count,
            }
        ],
    }


def test_attach_landmarks_writes_the_exact_window_and_pixels_the_render_step_would_use(tmp_path: Path) -> None:
    pose_path = tmp_path / "pose" / "clip-a.pose2d.raw.csv"
    _write_pose_csv(pose_path)
    signals_csv = _signals_csv(tmp_path, pose_path)
    manifest_path = tmp_path / "annotation_tasks.json"
    manifest_path.write_text(json.dumps(_error_marking_manifest()))
    output_root = tmp_path

    summary, skipped = attach_landmarks(manifest_path, signals_csv, output_root)

    assert summary == {"written": 1, "already_attached": 0}
    assert skipped == []

    manifest = json.loads(manifest_path.read_text())
    task = manifest["tasks"][0]
    assert task["landmarks_artifact"] == "error-marking-000/landmarks.json"
    assert task["source_dimensions"] == {"width": 320, "height": 240}

    artifact = json.loads((output_root / "error-marking-000" / "landmarks.json").read_text())
    assert artifact["source_window"] == {"start_frame": 0, "end_frame": 30}
    assert len(artifact["frames"]) == 30
    assert set(artifact["landmarks"]) >= {"LEFT_HIP", "RIGHT_HIP", "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_WRIST"}
    assert ["LEFT_SHOULDER", "RIGHT_SHOULDER"] in artifact["pose_edges"]

    raw = pd.read_csv(pose_path, index_col="frame")
    clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=None)
    expected_frame_5 = _pose_pixels(clean, 5)
    assert artifact["frames"][5]["LEFT_WRIST"] == _rounded_point(expected_frame_5["LEFT_WRIST"])


def _rounded_point(point: tuple[float, float]) -> list[float]:
    # attach_landmarks() round-trips coordinates through JSON, so compare as
    # plain floats rather than needing pytest.approx's numpy-aware wrapping.
    return [round(point[0], 9), round(point[1], 9)]


def test_attach_landmarks_is_idempotent_and_skips_already_attached_tasks(tmp_path: Path) -> None:
    pose_path = tmp_path / "pose" / "clip-a.pose2d.raw.csv"
    _write_pose_csv(pose_path)
    signals_csv = _signals_csv(tmp_path, pose_path)
    manifest_path = tmp_path / "annotation_tasks.json"
    manifest_path.write_text(json.dumps(_error_marking_manifest()))

    attach_landmarks(manifest_path, signals_csv, tmp_path)
    summary, skipped = attach_landmarks(manifest_path, signals_csv, tmp_path)

    assert summary == {"written": 0, "already_attached": 1}
    assert skipped == []


def test_attach_landmarks_skips_a_task_whose_recomputed_window_disagrees(tmp_path: Path) -> None:
    pose_path = tmp_path / "pose" / "clip-a.pose2d.raw.csv"
    _write_pose_csv(pose_path)
    signals_csv = _signals_csv(tmp_path, pose_path)
    manifest_path = tmp_path / "annotation_tasks.json"
    # The task claims a different frame_count than the (fps, window) formula
    # actually produces -- e.g. built by a since-changed selection step.
    manifest_path.write_text(json.dumps(_error_marking_manifest(frame_count=29)))

    summary, skipped = attach_landmarks(manifest_path, signals_csv, tmp_path)

    assert summary == {"written": 0, "already_attached": 0}
    assert len(skipped) == 1
    assert "recomputed window has 30 frames, task expects 29" in skipped[0]
    manifest = json.loads(manifest_path.read_text())
    assert "landmarks_artifact" not in manifest["tasks"][0]


def test_attach_landmarks_skips_a_task_with_no_matching_signals_row(tmp_path: Path) -> None:
    pose_path = tmp_path / "pose" / "clip-a.pose2d.raw.csv"
    _write_pose_csv(pose_path)
    signals_csv = _signals_csv(tmp_path, pose_path)
    manifest = _error_marking_manifest()
    manifest["tasks"][0]["relative_stem"] = "clip-not-in-signals-csv"
    manifest_path = tmp_path / "annotation_tasks.json"
    manifest_path.write_text(json.dumps(manifest))

    summary, skipped = attach_landmarks(manifest_path, signals_csv, tmp_path)

    assert summary == {"written": 0, "already_attached": 0}
    assert len(skipped) == 1
    assert "no signals row" in skipped[0]
