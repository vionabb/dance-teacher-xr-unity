"""Tests for staged pipeline output contracts and rclone command construction."""

from __future__ import annotations

import json
import importlib
from pathlib import Path
import typing as t

import pandas as pd
import pytest

from motion_extraction.pipeline_validation import (
    PipelineOutputLayout,
    PipelineOutputValidator,
    PipelineValidationError,
)
from motion_extraction.rclone_transfer import pull, publish_processed_bundle


staged_pipeline = importlib.import_module("motion_extraction.run_staged_pipeline")
dancetree_pipeline = importlib.import_module(
    "motion_extraction.dancetree.run_dancetree_pipeline"
)
study_pose_pipeline = importlib.import_module("motion_extraction.study_pose_data")


def _layout(tmp_path: Path) -> PipelineOutputLayout:
    video_dir = tmp_path / "source"
    video_dir.mkdir()
    (video_dir / "lesson" / "clip.mp4").parent.mkdir()
    (video_dir / "lesson" / "clip.mp4").write_bytes(b"video")
    output = tmp_path / "output"
    return PipelineOutputLayout(
        database_csv_path=output / "db.csv",
        video_srcdir=video_dir,
        holistic_data_srcdir=output / "holistic_data",
        pose2d_data_srcdir=output / "pose2d_data",
        temp_dir=output / "temp",
        bundle_export_path=output / "bundle" / "nonmedia",
        bundle_media_export_path=output / "bundle" / "media",
        holistic_processed_srcdir=output / "holistic_data_processed",
        pose2d_processed_srcdir=output / "pose2d_processed",
    )


def _write_csv(path: Path, dataframe: pd.DataFrame) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    dataframe.to_csv(path, index=False)


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def _populate_outputs(layout: PipelineOutputLayout) -> None:
    stem = Path("lesson/clip")
    _write_csv(
        layout.database_csv_path,
        pd.DataFrame({"clipRelativeStem": [stem.as_posix()], "frameCount": [10], "fps": [30]}),
    )
    for root, suffix in (
        (layout.holistic_data_srcdir, ".holisticdata.raw.csv"),
        (layout.pose2d_data_srcdir, ".pose2d.raw.csv"),
    ):
        _write_csv(root / f"{stem.as_posix()}{suffix}", pd.DataFrame({"frame": [0, 1]}))
    for root, suffix in (
        (layout.holistic_processed_srcdir or layout.holistic_data_srcdir, ".holisticdata.clean.csv"),
        (layout.pose2d_processed_srcdir or layout.pose2d_data_srcdir, ".pose2d.clean.csv"),
    ):
        _write_csv(
            root / f"{stem.as_posix()}{suffix}",
            pd.DataFrame(
                {
                    "frame": [0, 1],
                    "preprocess_torso_length": [1.0, 1.0],
                    "preprocess_is_usable": [1, 1],
                }
            ),
        )
    _write_csv(
        layout.temp_dir / "complexities" / "dvaj_complexity.csv",
        pd.DataFrame({"clip": [stem.as_posix()]}),
    )
    _write_csv(
        layout.temp_dir / "complexities" / "byfile" / "lesson" / "clip.complexity.csv",
        pd.DataFrame({"frame": [0, 1], "method": [0.0, 1.0]}),
    )
    _write_csv(
        layout.temp_dir / "audio_analysis" / "audio_analysis_summary.csv",
        pd.DataFrame({"file": [stem.as_posix()]}),
    )
    audio_result = {
        "duration": 1.0,
        "sample_rate": 44100,
        "tempo_info": {"bpm": 120, "audible_beats": [0.0, 0.5]},
    }
    _write_json(
        layout.temp_dir / "audio_analysis" / "analysis" / "video" / "lesson" / "clip.json",
        audio_result,
    )
    tree = {"root": {}, "generation_data": {"complexity": "method"}}
    _write_json(
        layout.temp_dir / "audio_analysis" / "dancetrees" / "video" / "lesson" / "clip.dancetree.json",
        tree,
    )
    _write_json(
        layout.temp_dir / "trees_with_complexity" / "lesson" / "clip.dancetree.json",
        tree,
    )
    _write_json(layout.bundle_export_path / "dances.json", [])
    _write_json(layout.bundle_export_path / "dancetrees.json", {})


def test_validator_checks_all_pipeline_stages(tmp_path: Path) -> None:
    """Validate every stage against the expected local output layout."""

    layout = _layout(tmp_path)
    _populate_outputs(layout)
    validator = PipelineOutputValidator(layout)

    for stage in (
        "update-database",
        "extract-pose-data",
        "preprocess-pose-data",
        "cumulative-complexity",
        "audio-analysis",
        "add-complexity",
        "bundle-data",
    ):
        validator(stage)

    assert validator.validated_stages == [
        "update-database",
        "extract-pose-data",
        "preprocess-pose-data",
        "cumulative-complexity",
        "audio-analysis",
        "add-complexity",
        "bundle-data",
    ]


def test_validator_reports_missing_stage_output(tmp_path: Path) -> None:
    """Fail with the stage name and missing path when an artifact is absent."""

    layout = _layout(tmp_path)
    _populate_outputs(layout)
    (layout.temp_dir / "trees_with_complexity" / "lesson" / "clip.dancetree.json").unlink()

    with pytest.raises(PipelineValidationError, match="add-complexity"):
        PipelineOutputValidator(layout)("add-complexity")


def test_rclone_pull_uses_dataset_remote(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """The pull helper copies from the read-only dataset remote."""

    calls: list[list[str]] = []

    def fake_run(command: list[str], check: bool) -> None:
        calls.append(command)
        assert check is True

    monkeypatch.setattr("motion_extraction.rclone_transfer.subprocess.run", fake_run)
    destination = tmp_path / "source"
    pull("referencevideos", destination)

    assert calls == [["rclone", "copy", "dataset:referencevideos", str(destination), "--progress"]]
    assert destination.is_dir()


def test_rclone_processed_bundle_publication_uses_sync(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Processed-media publication is an explicit replacing sync."""

    calls: list[list[str]] = []
    monkeypatch.setattr(
        "motion_extraction.rclone_transfer.subprocess.run",
        lambda command, check: calls.append(command),
    )
    bundle = tmp_path / "media"
    bundle.mkdir()
    publish_processed_bundle(bundle)

    assert calls == [["rclone", "sync", str(bundle), "processedmediabundle:", "--progress"]]


def test_staged_runner_pulls_runs_and_writes_manifest(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The orchestration layer connects staging, pipeline execution, and metadata."""

    def fake_pull(remote_path: str, local_path: Path) -> None:
        assert remote_path == "referencevideos"
        (local_path / "clip.mp4").parent.mkdir(parents=True, exist_ok=True)
        (local_path / "clip.mp4").write_bytes(b"video")

    class FakeValidator:
        def __init__(self, layout: object) -> None:
            self.validated_stages: list[str] = []

        def __call__(self, stage: str) -> None:
            self.validated_stages.append(stage)

    def fake_pipeline(**kwargs: object) -> None:
        validator = kwargs["stage_validator"]
        assert callable(validator)
        for stage in (
            "update-database",
            "extract-pose-data",
            "preprocess-pose-data",
            "cumulative-complexity",
            "audio-analysis",
            "add-complexity",
            "bundle-data",
        ):
            validator(stage)

    monkeypatch.setattr(staged_pipeline, "pull", fake_pull)
    monkeypatch.setattr(staged_pipeline, "PipelineOutputValidator", FakeValidator)
    monkeypatch.setattr(staged_pipeline, "run_dancetree_pipeline", fake_pipeline)

    run_dir = staged_pipeline.run_staged_pipeline("referencevideos", tmp_path / "run")
    manifest = json.loads((run_dir / "run-manifest.json").read_text(encoding="utf-8"))

    assert manifest["remote_path"] == "dataset:referencevideos"
    assert manifest["validated_stages"] == [
        "update-database",
        "extract-pose-data",
        "preprocess-pose-data",
        "cumulative-complexity",
        "audio-analysis",
        "add-complexity",
        "bundle-data",
    ]


def test_pipeline_runs_only_the_requested_contiguous_stage_range(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Stage bounds prevent both upstream and downstream operations from running."""

    calls: list[str] = []
    monkeypatch.setattr(
        dancetree_pipeline,
        "preprocess_all_pose_data",
        lambda **_kwargs: calls.append("preprocess-pose-data"),
    )
    for name in (
        "update_database",
        "extract_holistic_data",
        "add_complexities_to_dancetrees",
        "bundle_dance_data_as_json",
    ):
        monkeypatch.setattr(
            dancetree_pipeline, name, lambda **_kwargs: calls.append(name)
        )
    validated: list[str] = []

    result = dancetree_pipeline.run_dancetree_pipeline(
        database_csv_path=tmp_path / "db.csv",
        video_srcdir=tmp_path / "source",
        holistic_data_srcdir=tmp_path / "holistic",
        pose2d_data_srcdir=tmp_path / "pose2d",
        temp_dir=tmp_path / "temp",
        bundle_export_path=tmp_path / "bundle",
        bundle_media_export_path=tmp_path / "bundle-media",
        start_at="preprocess-pose-data",
        stop_after="preprocess-pose-data",
        stage_validator=validated.append,
    )

    assert result == ("preprocess-pose-data",)
    assert calls == ["preprocess-pose-data"]
    assert validated == ["preprocess-pose-data"]


def test_staged_runner_copies_and_validates_cached_upstream_outputs(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A later-stage experiment copies, rather than mutates, its cached run."""

    cached_run = tmp_path / "cache"
    cached_run.mkdir()
    cached_layout = _layout(cached_run)
    _populate_outputs(cached_layout)
    destination = tmp_path / "experiment"

    def fake_pipeline(**kwargs: object) -> None:
        assert kwargs["start_at"] == "preprocess-pose-data"
        assert kwargs["stop_after"] == "preprocess-pose-data"
        t.cast(t.Callable[[str], None], kwargs["stage_validator"])("preprocess-pose-data")

    monkeypatch.setattr(staged_pipeline, "run_dancetree_pipeline", fake_pipeline)
    monkeypatch.setattr(
        staged_pipeline,
        "pull",
        lambda *_args: pytest.fail("a reused run must not stage from rclone"),
    )

    staged_pipeline.run_staged_pipeline(
        None,
        destination,
        start_at="preprocess-pose-data",
        stop_after="preprocess-pose-data",
        reuse_from=cached_run,
    )
    manifest = json.loads((destination / "run-manifest.json").read_text(encoding="utf-8"))

    assert manifest["status"] == "completed"
    assert manifest["completed_stages"] == ["preprocess-pose-data"]
    assert manifest["cached_upstream_validated_stages"] == [
        "update-database", "extract-pose-data"
    ]
    assert manifest["source_provenance"]["kind"] == "copied-cache"
    assert (destination / "output" / "db.csv").is_file()


def test_staged_runner_reuses_outputs_without_copying_persistent_videos(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A local video cache stays outside each copied experiment run."""

    cached_run = tmp_path / "baseline"
    cached_run.mkdir()
    cached_layout = _layout(cached_run)
    _populate_outputs(cached_layout)
    video_cache = tmp_path / "video-cache"
    (video_cache / "lesson").mkdir(parents=True)
    video_file = video_cache / "lesson" / "clip.mp4"
    video_file.write_bytes(b"video")
    destination = tmp_path / "experiment"

    def fake_pipeline(**kwargs: object) -> None:
        assert kwargs["video_srcdir"] == video_cache.resolve()
        t.cast(t.Callable[[str], None], kwargs["stage_validator"])(
            "preprocess-pose-data"
        )

    monkeypatch.setattr(staged_pipeline, "run_dancetree_pipeline", fake_pipeline)

    staged_pipeline.run_staged_pipeline(
        None,
        destination,
        start_at="preprocess-pose-data",
        stop_after="preprocess-pose-data",
        reuse_from=cached_run,
        video_srcdir=video_cache,
    )
    manifest = json.loads((destination / "run-manifest.json").read_text(encoding="utf-8"))

    assert not (destination / "source").exists()
    assert video_file.read_bytes() == b"video"
    assert (destination / "output" / "db.csv").is_file()
    assert manifest["source_provenance"] == {
        "kind": "local-video-cache",
        "video_srcdir": str(video_cache.resolve()),
        "reuse_from": str(cached_run.resolve()),
    }


def test_study_pose_pipeline_uses_canonical_roots_and_selected_stages(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Participant extraction reads videos in place and writes separate modalities."""

    video_root = tmp_path / "chi25_study1" / "videos" / "userperformances-study1-segmented"
    video_root.mkdir(parents=True)
    (video_root / "clip.mp4").write_bytes(b"video")
    calls: dict[str, object] = {}

    def fake_pipeline(**kwargs: object) -> None:
        calls.update(kwargs)
        t.cast(t.Callable[[str], None], kwargs["stage_validator"])("preprocess-pose-data")

    monkeypatch.setattr(study_pose_pipeline, "run_dancetree_pipeline", fake_pipeline)

    result = study_pose_pipeline.run_study_pose_pipeline(
        study="study1-segmented",
        data_root=tmp_path,
        start_at="preprocess-pose-data",
        stop_after="preprocess-pose-data",
    )

    assert result == ("preprocess-pose-data",)
    assert calls["video_srcdir"] == video_root.resolve()
    assert calls["holistic_data_srcdir"] == (
        tmp_path / "chi25_study1/pose-raw/canonical/study1-segmented/holisticdata"
    ).resolve()
    assert calls["pose2d_data_srcdir"] == (
        tmp_path / "chi25_study1/pose-raw/canonical/study1-segmented/pose2d"
    ).resolve()
    assert calls["holistic_processed_srcdir"] == (
        tmp_path / "chi25_study1/pose-processed/canonical/study1-segmented/holisticdata"
    ).resolve()
    assert calls["pose2d_processed_srcdir"] == (
        tmp_path / "chi25_study1/pose-processed/canonical/study1-segmented/pose2d"
    ).resolve()
    assert calls["start_at"] == "preprocess-pose-data"
    assert calls["stop_after"] == "preprocess-pose-data"


def test_study_pose_pipeline_reuses_reference_pose_stage_implementations(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Participant videos go through the same extraction and preprocessing calls."""

    video_root = tmp_path / "chi25_study1" / "videos" / "userperformances-study1-segmented"
    video_root.mkdir(parents=True)
    (video_root / "clip.mp4").write_bytes(b"video")
    pose_pipeline = dancetree_pipeline
    calls: list[str] = []

    monkeypatch.setattr(
        pose_pipeline,
        "extract_holistic_data",
        lambda **_kwargs: calls.append("extract-pose-data"),
    )
    monkeypatch.setattr(
        pose_pipeline,
        "preprocess_all_pose_data",
        lambda **_kwargs: calls.append("preprocess-pose-data"),
    )

    result = study_pose_pipeline.run_study_pose_pipeline(
        study="study1-segmented",
        data_root=tmp_path,
    )

    assert result == ("extract-pose-data", "preprocess-pose-data")
    assert calls == ["extract-pose-data", "preprocess-pose-data"]
