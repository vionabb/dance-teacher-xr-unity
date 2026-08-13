"""Extract participant-study videos into the canonical pose-data layout.

Participant videos live in the persistent, access-controlled workspace data
tree. This module never copies or modifies those videos; it writes canonical
raw and generated clean pose artifacts under the study's data directory.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import typing as t

from .dancetree.run_dancetree_pipeline import run_dancetree_pipeline
from .data_paths import PARTICIPANT_ROOT


@dataclass(frozen=True)
class StudyPoseLayout:
    """Paths for one participant-study video collection."""

    name: str
    study_root_name: str
    video_relative_path: Path

    def video_root(self, data_root: Path) -> Path:
        return data_root / self.study_root_name / "videos" / self.video_relative_path

    def pose_root(self, data_root: Path) -> Path:
        return data_root / self.study_root_name / "pose-raw" / "canonical" / self.name


STUDY_POSE_LAYOUTS: dict[str, StudyPoseLayout] = {
    "study1-segmented": StudyPoseLayout(
        "study1-segmented", "chi25_study1", Path("userperformances-study1-segmented")
    ),
    "study1-whole": StudyPoseLayout("study1-whole", "chi25_study1", Path("userperformances-study1")),
    "study2-segmented": StudyPoseLayout(
        "study2-segmented", "chi25_study2", Path("userperformances-study2-segmented")
    ),
    "study2-whole": StudyPoseLayout("study2-whole", "chi25_study2", Path("userperformances-study2")),
}

POSE_STAGES = ("extract-pose-data", "preprocess-pose-data")


def default_data_root() -> Path:
    """Return the local persistent participant-data cache."""

    return PARTICIPANT_ROOT


def get_study_pose_layout(study: str) -> StudyPoseLayout:
    try:
        return STUDY_POSE_LAYOUTS[study]
    except KeyError as error:
        choices = ", ".join(STUDY_POSE_LAYOUTS)
        raise ValueError(f"Unknown study; choose one of: {choices}") from error


def run_study_pose_pipeline(
    *,
    study: str,
    data_root: Path | None = None,
    video_srcdir: Path | None = None,
    start_at: str | None = None,
    stop_after: str | None = None,
    rewrite_existing_holistic_data: bool = False,
    rewrite_existing_preprocessed_pose_data: bool = False,
) -> tuple[str, ...]:
    """Run the selected extraction/preprocessing stages for one study.

    Only the two pose stages are exposed here.  The general pipeline remains
    responsible for complexity, audio, and bundling; this command keeps
    participant data in its cache-owned canonical layout and supports reruns
    of either stage without touching the source videos.
    """

    layout = get_study_pose_layout(study)
    root = (data_root or default_data_root()).resolve()
    videos = (video_srcdir or layout.video_root(root)).resolve()
    if not videos.is_dir():
        raise FileNotFoundError(f"Participant video directory does not exist: {videos}")

    selected_start = start_at or POSE_STAGES[0]
    selected_stop = stop_after or POSE_STAGES[-1]
    try:
        start_index = POSE_STAGES.index(selected_start)
        stop_index = POSE_STAGES.index(selected_stop)
    except ValueError as error:
        choices = ", ".join(POSE_STAGES)
        raise ValueError(f"Study pose stages must be one of: {choices}") from error
    if start_index > stop_index:
        raise ValueError("start_at must not come after stop_after")

    selected_stages = POSE_STAGES[start_index : stop_index + 1]
    pose_root = root / layout.study_root_name / "pose-raw" / "canonical" / study
    holistic_root = pose_root / "holisticdata"
    pose2d_root = pose_root / "pose2d"
    processed_root = root / layout.study_root_name / "pose-processed" / "canonical" / study
    holistic_processed_root = processed_root / "holisticdata"
    pose2d_processed_root = processed_root / "pose2d"
    work_root = processed_root / "run-state"
    completed: list[str] = []

    run_dancetree_pipeline(
        database_csv_path=work_root / "database.csv",
        video_srcdir=videos,
        holistic_data_srcdir=holistic_root,
        pose2d_data_srcdir=pose2d_root,
        temp_dir=work_root / "temp",
        bundle_export_path=work_root / "bundle",
        bundle_media_export_path=work_root / "bundle-media",
        holistic_processed_srcdir=holistic_processed_root,
        pose2d_processed_srcdir=pose2d_processed_root,
        rewrite_existing_holistic_data=rewrite_existing_holistic_data,
        rewrite_existing_preprocessed_pose_data=rewrite_existing_preprocessed_pose_data,
        suppress_update_database_artifacts=True,
        suppress_compute_holistic_data_artifacts=True,
        suppress_preprocess_pose_data_artifacts=True,
        suppress_cumulative_complexity_artifacts=True,
        suppress_audio_analysis_artifacts=True,
        suppress_add_complexity_artifacts=True,
        suppress_bundle_data_artifacts=True,
        start_at=selected_start,
        stop_after=selected_stop,
        stage_validator=completed.append,
    )
    return tuple(completed)


def main(argv: t.Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--study", choices=tuple(STUDY_POSE_LAYOUTS), required=True)
    parser.add_argument("--data-root", type=Path, default=None)
    parser.add_argument("--video-srcdir", type=Path, default=None)
    parser.add_argument("--start-at", choices=POSE_STAGES, default=None)
    parser.add_argument("--stop-after", choices=POSE_STAGES, default=None)
    parser.add_argument("--rewrite-existing-holistic-data", action="store_true")
    parser.add_argument("--rewrite-existing-preprocessed-pose-data", action="store_true")
    args = parser.parse_args(argv)
    completed = run_study_pose_pipeline(
        study=args.study,
        data_root=args.data_root,
        video_srcdir=args.video_srcdir,
        start_at=args.start_at,
        stop_after=args.stop_after,
        rewrite_existing_holistic_data=args.rewrite_existing_holistic_data,
        rewrite_existing_preprocessed_pose_data=args.rewrite_existing_preprocessed_pose_data,
    )
    print(f"Completed: {', '.join(completed)}")


if __name__ == "__main__":
    main()
