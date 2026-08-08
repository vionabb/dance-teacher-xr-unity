"""Validation helpers for the reference-video motion pipeline outputs."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
import typing as t

import pandas as pd


class PipelineValidationError(RuntimeError):
    """Raised when a pipeline stage does not produce its documented outputs."""


@dataclass(frozen=True)
class PipelineOutputLayout:
    """Describe the paths used by one local DanceTree pipeline run."""

    database_csv_path: Path
    video_srcdir: Path
    holistic_data_srcdir: Path
    pose2d_data_srcdir: Path
    temp_dir: Path
    bundle_export_path: Path
    bundle_media_export_path: Path

    def video_stems(self) -> tuple[Path, ...]:
        """Return input video stems using the pipeline's relative path convention."""

        videos = sorted(
            path for path in self.video_srcdir.rglob("*.mp4") if path.is_file()
        )
        return tuple(
            path.relative_to(self.video_srcdir).with_suffix("") for path in videos
        )


@dataclass
class PipelineOutputValidator:
    """Validate each stage of a local pipeline run as it completes."""

    layout: PipelineOutputLayout
    validated_stages: list[str] = field(default_factory=list)

    def __call__(self, stage: str) -> None:
        """Validate ``stage`` and remember it for run metadata."""

        validate_stage_outputs(stage, self.layout)
        self.validated_stages.append(stage)


def _require_file(path: Path, stage: str) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        raise PipelineValidationError(
            f"{stage}: expected a non-empty file at {path}"
        )


def _require_csv(
    path: Path,
    stage: str,
    *,
    required_columns: t.Iterable[str] = (),
    min_rows: int = 1,
) -> pd.DataFrame:
    _require_file(path, stage)
    try:
        dataframe = pd.read_csv(path)
    except Exception as error:
        raise PipelineValidationError(f"{stage}: could not read CSV {path}: {error}") from error

    missing_columns = sorted(set(required_columns) - set(dataframe.columns))
    if missing_columns:
        raise PipelineValidationError(
            f"{stage}: CSV {path} is missing columns {missing_columns}"
        )
    if len(dataframe.index) < min_rows:
        raise PipelineValidationError(
            f"{stage}: CSV {path} has {len(dataframe.index)} rows; expected at least {min_rows}"
        )
    return dataframe


def _require_json(path: Path, stage: str) -> t.Any:
    _require_file(path, stage)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        raise PipelineValidationError(f"{stage}: could not read JSON {path}: {error}") from error


def _expected_path(root: Path, stem: Path, suffix: str) -> Path:
    """Build an output path while preserving a video's relative directories."""

    return root / Path(f"{stem.as_posix()}{suffix}")


def _require_expected_files(
    root: Path,
    stems: t.Iterable[Path],
    suffix: str,
    stage: str,
) -> list[Path]:
    paths = [_expected_path(root, stem, suffix) for stem in stems]
    for path in paths:
        _require_file(path, stage)
    return paths


def _validate_database(layout: PipelineOutputLayout, stems: tuple[Path, ...]) -> None:
    database = _require_csv(
        layout.database_csv_path,
        "update-database",
        required_columns=("clipRelativeStem", "frameCount", "fps"),
        min_rows=len(stems),
    )
    if len(database.index) != len(stems):
        raise PipelineValidationError(
            "update-database: database row count does not match the number of input videos "
            f"({len(database.index)} != {len(stems)})"
        )
    expected_stems = {stem.as_posix() for stem in stems}
    actual_stems = set(database["clipRelativeStem"].astype(str))
    if actual_stems != expected_stems:
        raise PipelineValidationError(
            "update-database: database clipRelativeStem values do not match input videos"
        )


def _validate_pose_outputs(layout: PipelineOutputLayout, stems: tuple[Path, ...], *, clean: bool) -> None:
    stage = "preprocess-pose-data" if clean else "extract-pose-data"
    holistic_suffix = ".holisticdata.clean.csv" if clean else ".holisticdata.raw.csv"
    pose2d_suffix = ".pose2d.clean.csv" if clean else ".pose2d.raw.csv"
    holistic_paths = _require_expected_files(
        layout.holistic_data_srcdir, stems, holistic_suffix, stage
    )
    pose2d_paths = _require_expected_files(layout.pose2d_data_srcdir, stems, pose2d_suffix, stage)

    if clean:
        required_columns = {"preprocess_torso_length", "preprocess_is_usable"}
        for path in [*holistic_paths, *pose2d_paths]:
            columns = set(_require_csv(path, stage, min_rows=2).columns)
            missing = required_columns - columns
            if missing:
                raise PipelineValidationError(
                    f"{stage}: clean pose CSV {path} is missing columns {sorted(missing)}"
                )


def _validate_complexity(layout: PipelineOutputLayout, stems: tuple[Path, ...]) -> None:
    stage = "cumulative-complexity"
    _require_csv(layout.temp_dir / "complexities" / "dvaj_complexity.csv", stage)
    for stem in stems:
        path = _expected_path(
            layout.temp_dir / "complexities" / "byfile",
            stem,
            ".complexity.csv",
        )
        _require_csv(path, stage, min_rows=2)


def _validate_audio(layout: PipelineOutputLayout, stems: tuple[Path, ...]) -> None:
    stage = "audio-analysis"
    _require_csv(layout.temp_dir / "audio_analysis" / "audio_analysis_summary.csv", stage)
    analysis_root = layout.temp_dir / "audio_analysis" / "analysis" / "video"
    for stem in stems:
        result = _require_json(_expected_path(analysis_root, stem, ".json"), stage)
        if not isinstance(result, dict):
            raise PipelineValidationError(f"{stage}: audio result is not an object")
        tempo_info = result.get("tempo_info")
        if not isinstance(tempo_info, dict) or not tempo_info.get("audible_beats"):
            raise PipelineValidationError(
                f"{stage}: audio result is missing tempo_info.audible_beats"
            )
        if result.get("duration", 0) <= 0 or result.get("sample_rate", 0) <= 0:
            raise PipelineValidationError(
                f"{stage}: audio result has invalid duration or sample rate"
            )


def _validate_dancetrees(layout: PipelineOutputLayout, stems: tuple[Path, ...]) -> None:
    stage = "add-complexity"
    source_root = layout.temp_dir / "audio_analysis" / "dancetrees" / "video"
    output_root = layout.temp_dir / "trees_with_complexity"
    for stem in stems:
        _require_json(_expected_path(source_root, stem, ".dancetree.json"), stage)
        tree = _require_json(_expected_path(output_root, stem, ".dancetree.json"), stage)
        if not isinstance(tree, dict) or not isinstance(tree.get("root"), dict):
            raise PipelineValidationError(f"{stage}: invalid enriched DanceTree JSON for {stem}")
        generation_data = tree.get("generation_data")
        if not isinstance(generation_data, dict) or not generation_data.get("complexity"):
            raise PipelineValidationError(
                f"{stage}: enriched DanceTree has no complexity metadata for {stem}"
            )


def _validate_bundle(layout: PipelineOutputLayout) -> None:
    stage = "bundle-data"
    dances = _require_json(layout.bundle_export_path / "dances.json", stage)
    dancetrees = _require_json(layout.bundle_export_path / "dancetrees.json", stage)
    if not isinstance(dances, list):
        raise PipelineValidationError(f"{stage}: dances.json must contain a list")
    if not isinstance(dancetrees, dict):
        raise PipelineValidationError(f"{stage}: dancetrees.json must contain an object")


def validate_stage_outputs(stage: str, layout: PipelineOutputLayout) -> None:
    """Validate the output contract for one completed pipeline stage."""

    stems = layout.video_stems()
    if not stems:
        raise PipelineValidationError(
            f"{stage}: no .mp4 input videos found under {layout.video_srcdir}"
        )

    validators: dict[str, t.Callable[[], None]] = {
        "update-database": lambda: _validate_database(layout, stems),
        "extract-pose-data": lambda: _validate_pose_outputs(layout, stems, clean=False),
        "preprocess-pose-data": lambda: _validate_pose_outputs(layout, stems, clean=True),
        "cumulative-complexity": lambda: _validate_complexity(layout, stems),
        "audio-analysis": lambda: _validate_audio(layout, stems),
        "add-complexity": lambda: _validate_dancetrees(layout, stems),
        "bundle-data": lambda: _validate_bundle(layout),
    }
    try:
        validator = validators[stage]
    except KeyError as error:
        raise ValueError(f"Unknown pipeline stage: {stage}") from error
    validator()
