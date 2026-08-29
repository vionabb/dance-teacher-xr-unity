from pathlib import Path

import pandas as pd

from motion_extraction.annotation_tool.generate_quality_triage_tasks import (
    CONTROL,
    CROP,
    FALSE_TRACKING,
    ROUGHNESS,
    _center_frame_for_run,
    _clip_window,
    TriageCandidate,
    select_candidates,
)


def _signals_row(
    relative_stem: str,
    *,
    corpus: str = "chi25_study1",
    crop: float = 0.0,
    roughness: float = 0.5,
    false_tracking: float = 0.1,
    frame_count: int = 100,
    crop_start: int = -1,
    crop_length: int = 0,
    roughness_start: int = -1,
    false_tracking_start: int = -1,
    false_tracking_length: int = 0,
    pose_available: bool = True,
    error: str = "",
) -> dict:
    return {
        "corpus": corpus,
        "relative_stem": relative_stem,
        "video_path": f"/videos/{relative_stem}.mp4",
        "pose_path": f"/pose/{relative_stem}.pose2d.raw.csv",
        "pose_available": pose_available,
        "error": error,
        "frame_count": frame_count,
        "video_fps": 30.0,
        "crop_violation_fraction": crop,
        "crop_longest_run_start": crop_start,
        "crop_longest_run_frames": crop_length,
        "windowed_roughness_p95_max": roughness,
        "windowed_roughness_worst_window_start": roughness_start,
        "false_tracking_candidate_fraction": false_tracking,
        "false_tracking_longest_run_start": false_tracking_start,
        "false_tracking_longest_run_frames": false_tracking_length,
    }


def _signals_df(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def test_center_frame_for_run_falls_back_when_run_is_absent() -> None:
    assert _center_frame_for_run(-1, 0, fallback_center=42) == 42
    assert _center_frame_for_run(10, 0, fallback_center=42) == 42


def test_center_frame_for_run_uses_the_run_midpoint() -> None:
    assert _center_frame_for_run(10, 20, fallback_center=0) == 20


def test_clip_window_clamps_to_frame_bounds_near_the_start() -> None:
    candidate = TriageCandidate(
        corpus="c", relative_stem="s", video_path=Path("v.mp4"), pose_path=Path("p.csv"),
        category=ROUGHNESS, center_frame=2, frame_count=100, fps=30.0, signal_value=1.0,
    )
    start, end = _clip_window(candidate)
    assert start == 0
    assert end - start == 90  # 3s @ 30fps


def test_clip_window_clamps_to_frame_bounds_near_the_end() -> None:
    candidate = TriageCandidate(
        corpus="c", relative_stem="s", video_path=Path("v.mp4"), pose_path=Path("p.csv"),
        category=ROUGHNESS, center_frame=98, frame_count=100, fps=30.0, signal_value=1.0,
    )
    start, end = _clip_window(candidate)
    assert end == 100
    assert end - start == 90


def test_select_candidates_ranks_by_signal_and_excludes_flagged_from_controls() -> None:
    rows = [
        _signals_row("crop-high", crop=0.9, crop_start=5, crop_length=10),
        _signals_row("rough-high", roughness=5.0, roughness_start=20),
        _signals_row("false-track-high", false_tracking=0.8, false_tracking_start=15, false_tracking_length=6),
        _signals_row("plain-1", crop=0.0, roughness=0.1, false_tracking=0.0),
        _signals_row("plain-2", crop=0.0, roughness=0.1, false_tracking=0.0),
    ]
    df = _signals_df(rows)

    candidates = select_candidates(df, per_signal_count=1, control_count=2, seed=1)

    by_stem = {c.relative_stem: c for c in candidates}
    assert by_stem["crop-high"].category == CROP
    assert by_stem["rough-high"].category == ROUGHNESS
    assert by_stem["false-track-high"].category == FALSE_TRACKING
    controls = {stem for stem, c in by_stem.items() if c.category == CONTROL}
    assert controls == {"plain-1", "plain-2"}


def test_select_candidates_never_shows_the_same_clip_under_two_categories() -> None:
    # Regression test: a clip ranking top-1 on more than one signal used to be
    # appended once per matching category, so the same clip could appear
    # multiple times in the task list under different framings.
    rows = [_signals_row("triple-threat", crop=0.9, roughness=5.0, false_tracking=0.8)]
    df = _signals_df(rows)

    candidates = select_candidates(df, per_signal_count=1, control_count=0, seed=1)

    stems = [c.relative_stem for c in candidates]
    assert stems.count("triple-threat") == 1
    assert candidates[0].category == CROP  # crop wins the fixed priority order


def test_select_candidates_skips_clips_without_pose_data_or_with_errors() -> None:
    rows = [
        _signals_row("missing-pose", pose_available=False),
        _signals_row("errored", error="EmptyDataError: No columns to parse from file"),
        _signals_row("fine-1"),
    ]
    df = _signals_df(rows)

    candidates = select_candidates(df, per_signal_count=1, control_count=5, seed=1)

    stems = {c.relative_stem for c in candidates}
    assert stems == {"fine-1"}


def test_select_candidates_computes_crop_center_from_longest_run() -> None:
    rows = [_signals_row("crop-clip", crop=0.9, crop_start=10, crop_length=20, frame_count=100)]
    df = _signals_df(rows)

    candidates = select_candidates(df, per_signal_count=1, control_count=0, seed=1)

    assert candidates[0].center_frame == 20  # start=10 + length//2=10


def test_select_candidates_falls_back_to_clip_midpoint_when_run_is_missing() -> None:
    rows = [_signals_row("no-run", crop=0.9, crop_start=-1, crop_length=0, frame_count=100)]
    df = _signals_df(rows)

    candidates = select_candidates(df, per_signal_count=1, control_count=0, seed=1)

    assert candidates[0].center_frame == 50
