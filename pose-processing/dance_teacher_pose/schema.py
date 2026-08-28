"""Canonical raw/clean pose-data schemas and path conventions."""

from __future__ import annotations

from dataclasses import dataclass
import enum
from pathlib import Path
import typing as t


class PoseDataType(enum.Enum):
    """Supported pose CSV modalities."""

    holistic_3d = "holistic_3d"
    pose2d = "pose2d"
    pose3d = "pose3d"


@dataclass(frozen=True)
class PoseDataSchema:
    """File and coordinate conventions for one pose-data modality."""

    pose_data_type: PoseDataType
    coordinate_fields: tuple[str, ...]
    legacy_suffix: str
    raw_suffix: str
    clean_suffix: str


_POSE_DATA_SCHEMAS: dict[PoseDataType, PoseDataSchema] = {
    PoseDataType.holistic_3d: PoseDataSchema(
        pose_data_type=PoseDataType.holistic_3d,
        coordinate_fields=("x", "y", "z"),
        legacy_suffix=".holisticdata.csv",
        raw_suffix=".holistic.raw.csv",
        clean_suffix=".holistic.clean.csv",
    ),
    PoseDataType.pose2d: PoseDataSchema(
        pose_data_type=PoseDataType.pose2d,
        coordinate_fields=("x", "y", "distance"),
        legacy_suffix=".pose2d.csv",
        raw_suffix=".pose2d.raw.csv",
        clean_suffix=".pose2d.clean.csv",
    ),
    PoseDataType.pose3d: PoseDataSchema(
        pose_data_type=PoseDataType.pose3d,
        coordinate_fields=("x", "y", "z"),
        legacy_suffix=".pose3d.csv",
        raw_suffix=".pose3d.raw.csv",
        clean_suffix=".pose3d.clean.csv",
    ),
}


def get_pose_data_schema(pose_data_type: PoseDataType) -> PoseDataSchema:
    """Return the schema definition for one supported modality."""

    return _POSE_DATA_SCHEMAS[pose_data_type]


def rename_pose_csv_suffix(file_path: Path, old_suffix: str, new_suffix: str) -> Path:
    """Return ``file_path`` with one known pose suffix replaced."""

    if not file_path.name.endswith(old_suffix):
        return file_path
    return file_path.with_name(file_path.name[: -len(old_suffix)] + new_suffix)


def relative_stem_from_pose_csv_path(
    pose_csv_path: Path,
    root_folder: Path,
    pose_data_type: PoseDataType,
) -> str:
    """Return a relative clip stem while preserving nested directories."""

    schema = get_pose_data_schema(pose_data_type)
    relative_path = pose_csv_path.relative_to(root_folder).as_posix()
    for suffix in (schema.clean_suffix, schema.raw_suffix, schema.legacy_suffix):
        if relative_path.endswith(suffix):
            return relative_path[: -len(suffix)]
    return Path(relative_path).with_suffix("").as_posix()


def clip_stem_from_pose_csv_path(pose_csv_path: Path, pose_data_type: PoseDataType) -> str:
    """Return the filename stem without a known pose suffix."""

    schema = get_pose_data_schema(pose_data_type)
    name = pose_csv_path.name
    for suffix in (schema.clean_suffix, schema.raw_suffix, schema.legacy_suffix):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return pose_csv_path.stem


def is_clean_pose_data_file(file_path: Path, pose_data_type: PoseDataType) -> bool:
    """Return whether a path points to a clean pose artifact."""

    return file_path.name.endswith(get_pose_data_schema(pose_data_type).clean_suffix)


def migrate_legacy_pose_csv_outputs(output_folder: Path, pose_data_type: PoseDataType) -> None:
    """Rename legacy pose outputs to explicit ``.raw.csv`` names."""

    schema = get_pose_data_schema(pose_data_type)
    if not output_folder.exists():
        return
    for legacy_csv_path in output_folder.rglob(f"*{schema.legacy_suffix}"):
        raw_csv_path = rename_pose_csv_suffix(
            legacy_csv_path, schema.legacy_suffix, schema.raw_suffix
        )
        if not raw_csv_path.exists():
            legacy_csv_path.rename(raw_csv_path)


def collect_pose_data_files(
    root_folder: Path,
    pose_data_type: PoseDataType,
    preferred_versions: t.Sequence[str] = ("clean", "raw", "legacy"),
) -> list[Path]:
    """Collect one pose artifact per relative stem using version precedence."""

    schema = get_pose_data_schema(pose_data_type)
    version_to_suffix = {
        "legacy": schema.legacy_suffix,
        "raw": schema.raw_suffix,
        "clean": schema.clean_suffix,
    }
    files_by_relative_stem: dict[str, Path] = {}
    for version in reversed(tuple(preferred_versions)):
        try:
            suffix = version_to_suffix[version]
        except KeyError as error:
            raise ValueError(f"Unknown pose-data version: {version}") from error
        for pose_csv_path in root_folder.rglob(f"*{suffix}"):
            relative_stem = relative_stem_from_pose_csv_path(
                pose_csv_path, root_folder, pose_data_type
            )
            files_by_relative_stem[relative_stem] = pose_csv_path
    return [files_by_relative_stem[key] for key in sorted(files_by_relative_stem)]

