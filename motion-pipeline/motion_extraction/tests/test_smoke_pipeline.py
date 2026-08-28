"""Stage-contract and end-to-end smoke tests for the motion pipeline."""

from __future__ import annotations

import csv
import json
from pathlib import Path
import shutil

import pandas as pd
import pytest

from motion_extraction.complexity_analysis.add_complexity_to_dancetree import (
    add_complexities_to_dancetrees,
)
from motion_extraction.complexity_analysis.calculate_cumulative_complexity import (
    DvajMeasureWeighting,
    PoseLandmarkWeighting,
    VisibilityMode,
    calculate_cumulative_complexities,
)
from motion_extraction.audio_analysis.perform_analysis import perform_audio_analysis
from motion_extraction.dancetree.bundle_data import bundle_dance_data_as_json
from motion_extraction.dancetree.run_dancetree_pipeline import run_dancetree_pipeline
from motion_extraction.extract_holistic_data import extract_holistic_data
from motion_extraction.preprocess_pose_data import (
    PREPROCESS_TORSO_LENGTH_COLUMN,
    PREPROCESS_USABLE_FRAME_COLUMN,
    PoseDataType,
    preprocess_all_pose_data,
)
from motion_extraction.pipeline_validation import PipelineOutputLayout, PipelineOutputValidator
from motion_extraction.update_database import update_database


pytestmark = pytest.mark.smoke

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SMOKETEST_ROOT = REPOSITORY_ROOT / "data" / "test-fixtures" / "smoketest"
MANIFEST_PATH = SMOKETEST_ROOT / "manifest.json"
CASE_NAMES = tuple(
    json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))["cases"].keys()
)


def _load_case(case_name: str) -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return manifest["cases"][case_name]


def _fixture_path(relative_path: str) -> Path:
    path = SMOKETEST_ROOT / relative_path
    assert path.is_file(), f"Missing smoke-test fixture: {path}"
    return path


def _case_path(case: dict, stage: str) -> Path:
    value = case["stages"].get(stage)
    if value is None:
        pytest.skip(f"Smoke case has no {stage!r} fixture")
    assert isinstance(value, str), f"Expected one fixture for stage {stage!r}"
    return _fixture_path(value)


def _copy_fixture(path: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, destination)
    return destination


def _copy_case_video(video_path: Path, temporary_root: Path) -> Path:
    """Copy one case video into an isolated input directory for a stage run."""

    return _copy_fixture(video_path, temporary_root / "videos" / video_path.name)


def test_smoketest_manifest_is_stage_first() -> None:
    """Ensure manifest paths stay in the stage-owned directory hierarchy."""

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    stage_roots = {
        "motionvideo",
        "database",
        "pose_raw",
        "pose_clean",
        "audio_analysis",
        "complexity",
        "dancetrees",
        "dancetrees_with_complexity",
        "bundle",
    }

    for case in manifest["cases"].values():
        paths = [case["video"]]
        for value in case["stages"].values():
            paths.extend(value if isinstance(value, list) else [value])
        for relative_path in paths:
            path = Path(relative_path)
            assert path.parts[0] in stage_roots
            assert (SMOKETEST_ROOT / path).is_file()


@pytest.mark.parametrize("case_name", CASE_NAMES)
def test_database_stage_smoke(case_name: str, tmp_path: Path) -> None:
    """Build a database from the committed smoke video without writing to data/."""

    case = _load_case(case_name)
    video_path = _fixture_path(case["video"])
    input_video_path = _copy_case_video(video_path, tmp_path)
    output_path = tmp_path / "db.csv"

    update_database(
        database_csv_path=output_path,
        videos_dir=input_video_path.parent,
        thumbnails_dir=None,
    )

    database = pd.read_csv(output_path)
    assert len(database) == 1
    assert database.loc[0, "clipRelativeStem"] == video_path.stem
    assert database.loc[0, "frameCount"] > 0
    assert database.loc[0, "fps"] > 0


@pytest.mark.parametrize("case_name", CASE_NAMES)
def test_raw_pose_stage_contract_smoke(case_name: str) -> None:
    """Validate the committed raw pose artifacts consumed by preprocessing."""

    case = _load_case(case_name)
    raw_pose_paths = case["stages"].get("pose_raw")
    if raw_pose_paths is None:
        pytest.skip("Smoke case has no raw-pose fixtures")
    assert len(raw_pose_paths) == 2

    for relative_path in raw_pose_paths:
        path = _fixture_path(relative_path)
        with path.open(newline="", encoding="utf-8") as input_file:
            rows = csv.reader(input_file)
            header = next(rows)
            first_row = next(rows)
            remaining_row_count = sum(1 for _ in rows)
        assert header[0] == "frame"
        assert len(first_row) == len(header)
        assert len(header) > 10
        assert remaining_row_count > 0


@pytest.mark.parametrize("case_name", CASE_NAMES)
def test_pose_extraction_stage_smoke(case_name: str, tmp_path: Path) -> None:
    """Extract raw 2D and holistic pose data from the committed smoke video."""

    case = _load_case(case_name)
    video_path = _fixture_path(case["video"])
    input_video_path = _copy_case_video(video_path, tmp_path)
    holistic_root = tmp_path / "holistic_data"
    pose2d_root = tmp_path / "pose2d_data"

    extract_holistic_data(
        video_folder=input_video_path,
        output_folder=holistic_root,
        pose2d_output_folder=pose2d_root,
        rewrite_existing=True,
    )

    for output_path in (
        holistic_root / f"{video_path.stem}.holistic.raw.csv",
        pose2d_root / f"{video_path.stem}.pose2d.raw.csv",
    ):
        assert output_path.is_file()
        assert output_path.stat().st_size > 0


@pytest.mark.parametrize("case_name", CASE_NAMES)
def test_preprocessing_stage_smoke(case_name: str, tmp_path: Path) -> None:
    """Preprocess committed raw 2D and holistic inputs into temporary clean files."""

    case = _load_case(case_name)
    raw_paths_value = case["stages"].get("pose_raw")
    if raw_paths_value is None:
        pytest.skip("Smoke case has no raw-pose fixtures")
    raw_paths = [_fixture_path(path) for path in raw_paths_value]
    if len(raw_paths) != 2:
        pytest.skip("Preprocessing smoke test requires both raw pose modalities")
    holistic_root = tmp_path / "holistic_data"
    pose2d_root = tmp_path / "pose2d_data"
    holistic_path = next((path for path in raw_paths if ".holistic." in path.name), None)
    pose2d_path = next((path for path in raw_paths if ".pose2d." in path.name), None)
    if holistic_path is None or pose2d_path is None:
        pytest.skip("Preprocessing smoke test requires holistic and pose2d fixtures")
    _copy_fixture(holistic_path, holistic_root / holistic_path.name)
    _copy_fixture(pose2d_path, pose2d_root / pose2d_path.name)

    preprocess_all_pose_data(
        holistic_data_root=holistic_root,
        pose2d_data_root=pose2d_root,
        rewrite_existing=True,
    )

    clean_paths = [
        holistic_root / holistic_path.name.replace(
            ".holistic.raw.csv", ".holistic.clean.csv"
        ),
        pose2d_root / pose2d_path.name.replace(
            ".pose2d.raw.csv", ".pose2d.clean.csv"
        ),
    ]
    for clean_path in clean_paths:
        assert clean_path.is_file()
        clean_data = pd.read_csv(clean_path, index_col="frame")
        assert PREPROCESS_TORSO_LENGTH_COLUMN in clean_data.columns
        assert PREPROCESS_USABLE_FRAME_COLUMN in clean_data.columns
        assert len(clean_data) > 1


@pytest.mark.parametrize("case_name", CASE_NAMES)
def test_complexity_stage_smoke(case_name: str, tmp_path: Path) -> None:
    """Calculate complexity from a committed raw pose input in a temp directory."""

    case = _load_case(case_name)
    raw_pose_paths = case["stages"].get("pose_raw")
    if raw_pose_paths is None:
        pytest.skip("Smoke case has no raw-pose fixtures")
    raw_holistic_path = next(
        (path for path in raw_pose_paths if ".holistic." in path),
        None,
    )
    if raw_holistic_path is None:
        pytest.skip("Smoke case has no holistic raw-pose fixture")
    raw_holistic = _fixture_path(raw_holistic_path)
    source_root = tmp_path / "holistic_data"
    _copy_fixture(raw_holistic, source_root / raw_holistic.name)

    output_root = tmp_path / "complexities"
    calculate_cumulative_complexities(
        srcdir=source_root,
        other_files=[],
        destdir=output_root,
        measure_weighting=DvajMeasureWeighting.decreasing_by_quarter,
        landmark_weighting=PoseLandmarkWeighting.balanced,
        database_csv_path=_case_path(case, "database"),
        include_base=True,
        pose_data_type=PoseDataType.holistic_3d,
        visibility_mode=VisibilityMode.interpolate,
    )

    per_file_output = output_root / "byfile" / f"{raw_holistic.name.removesuffix('.holistic.raw.csv')}.complexity.csv"
    summary_output = output_root / "dvaj_complexity.csv"
    assert per_file_output.is_file()
    assert summary_output.is_file()
    complexity = pd.read_csv(per_file_output, index_col=0)
    assert len(complexity) > 1
    assert complexity.shape[1] >= 1
    assert complexity.iloc[:, 0].notna().any()


@pytest.mark.parametrize("case_name", CASE_NAMES)
def test_audio_analysis_stage_contract_smoke(case_name: str) -> None:
    """Validate the promoted audio-analysis result used by downstream stages."""

    case = _load_case(case_name)
    result = json.loads(_case_path(case, "audio_analysis").read_text(encoding="utf-8"))
    assert result["duration"] > 0
    assert result["sample_rate"] > 0
    assert result["tempo_info"]["bpm"] > 0
    assert result["tempo_info"]["audible_beats"]


@pytest.mark.parametrize("case_name", CASE_NAMES)
def test_audio_analysis_stage_smoke(case_name: str, tmp_path: Path) -> None:
    """Run audio analysis on the committed smoke video in a temp directory."""

    case = _load_case(case_name)
    video_path = _fixture_path(case["video"])
    input_video_path = _copy_case_video(video_path, tmp_path)
    output_root = tmp_path / "audio_analysis"

    perform_audio_analysis(
        videosrcdir=input_video_path.parent,
        audiosrcdir=None,
        audio_analysis_destdir=output_root,
        audiocachedir=tmp_path / "audio_cache",
        analysis_summary_out=output_root / "audio_analysis_summary.csv",
        database_csv_path=None,
        include_mem_usage=False,
        skip_existing=False,
    )

    output_path = output_root / "analysis" / "video" / f"{video_path.stem}.json"
    assert output_path.is_file()
    assert json.loads(output_path.read_text(encoding="utf-8"))["tempo_info"]["bpm"] > 0


@pytest.mark.parametrize("case_name", CASE_NAMES)
def test_add_complexity_stage_smoke(case_name: str, tmp_path: Path) -> None:
    """Enrich a committed DanceTree with a committed complexity input."""

    case = _load_case(case_name)
    tree_root = tmp_path / "dancetrees"
    complexity_root = tmp_path / "complexities"
    _copy_fixture(
        _case_path(case, "dancetrees"),
        tree_root / _case_path(case, "dancetrees").name,
    )
    complexity_path = _case_path(case, "complexity")
    _copy_fixture(
        complexity_path,
        complexity_root / "byfile" / complexity_path.name,
    )

    complexity_method = pd.read_csv(complexity_path, nrows=1).columns[1]
    output_root = tmp_path / "dancetrees_with_complexity"
    add_complexities_to_dancetrees(
        tree_srcdir=tree_root,
        complexity_srcdir=complexity_root,
        database_path=_case_path(case, "database"),
        output_dir=output_root,
        complexity_method=complexity_method,
    )

    output_path = output_root / _case_path(case, "dancetrees").name
    assert output_path.is_file()
    output = json.loads(output_path.read_text(encoding="utf-8"))
    assert output["generation_data"]["complexity"] == complexity_method
    assert output["root"]["complexity"] is not None


@pytest.mark.parametrize("case_name", CASE_NAMES)
def test_bundle_stage_smoke(case_name: str, tmp_path: Path) -> None:
    """Bundle a committed enriched DanceTree and audio result in a temp directory."""

    case = _load_case(case_name)
    tree_root = tmp_path / "dancetrees_with_complexity"
    _copy_fixture(
        _case_path(case, "dancetrees_with_complexity"),
        tree_root / _case_path(case, "dancetrees_with_complexity").name,
    )
    audio_root = tmp_path / "audio_analysis"
    source_audio_root = _case_path(case, "audio_analysis").parents[2]
    shutil.copytree(source_audio_root, audio_root)
    bundle_root = tmp_path / "bundle"

    result = bundle_dance_data_as_json(
        dancetree_srcdir=tree_root,
        db_csv_path=_case_path(case, "database"),
        audio_results_dir=audio_root,
        bundle_export_path=bundle_root,
        exclude_test=True,
    )

    assert result["dance_count"] == 1
    assert json.loads((bundle_root / "dances.json").read_text())
    assert json.loads((bundle_root / "dancetrees.json").read_text())


@pytest.mark.parametrize("case_name", CASE_NAMES)
def test_full_pipeline_smoke(case_name: str, tmp_path: Path) -> None:
    """Run the complete reference-video pipeline from the committed smoke video."""

    case = _load_case(case_name)
    video_path = _fixture_path(case["video"])
    input_video_path = _copy_case_video(video_path, tmp_path)
    temp_root = tmp_path / "pipeline"
    holistic_root = tmp_path / "holistic_data"
    pose2d_root = tmp_path / "pose2d_data"
    bundle_root = tmp_path / "bundle"
    media_root = tmp_path / "bundle_media"
    validator = PipelineOutputValidator(
        PipelineOutputLayout(
            database_csv_path=tmp_path / "db.csv",
            video_srcdir=input_video_path.parent,
            holistic_data_srcdir=holistic_root,
            pose2d_data_srcdir=pose2d_root,
            temp_dir=temp_root,
            bundle_export_path=bundle_root,
            bundle_media_export_path=media_root,
        )
    )

    run_dancetree_pipeline(
        database_csv_path=tmp_path / "db.csv",
        video_srcdir=input_video_path.parent,
        holistic_data_srcdir=holistic_root,
        pose2d_data_srcdir=pose2d_root,
        temp_dir=temp_root,
        bundle_export_path=bundle_root,
        bundle_media_export_path=media_root,
        rewrite_existing_holistic_data=True,
        rewrite_existing_preprocessed_pose_data=True,
        visibility_mode="interpolate",
        suppress_update_database_artifacts=True,
        suppress_compute_holistic_data_artifacts=True,
        suppress_preprocess_pose_data_artifacts=True,
        suppress_cumulative_complexity_artifacts=True,
        suppress_audio_analysis_artifacts=True,
        suppress_add_complexity_artifacts=True,
        suppress_bundle_data_artifacts=True,
        stage_validator=validator,
    )

    assert validator.validated_stages == [
        "update-database",
        "extract-pose-data",
        "preprocess-pose-data",
        "cumulative-complexity",
        "audio-analysis",
        "add-complexity",
        "bundle-data",
    ]

    assert (holistic_root / f"{video_path.stem}.holistic.raw.csv").is_file()
    assert (pose2d_root / f"{video_path.stem}.pose2d.raw.csv").is_file()
    assert (holistic_root / f"{video_path.stem}.holistic.clean.csv").is_file()
    assert (temp_root / "complexities" / "byfile" / f"{video_path.stem}.complexity.csv").is_file()
    assert (temp_root / "audio_analysis" / "analysis" / "video" / f"{video_path.stem}.json").is_file()
    assert (temp_root / "trees_with_complexity" / f"{video_path.stem}.dancetree.json").is_file()
    assert json.loads((bundle_root / "dances.json").read_text(encoding="utf-8"))
    assert json.loads((bundle_root / "dancetrees.json").read_text(encoding="utf-8"))
