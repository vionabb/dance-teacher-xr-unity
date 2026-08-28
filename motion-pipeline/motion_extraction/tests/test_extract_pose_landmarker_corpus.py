from pathlib import Path

from motion_extraction.scripts.extract_pose_landmarker_corpus import (
    build_extraction_targets,
    run_extraction,
)


def _touch(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"")


def _make_corpus(data_root: Path) -> None:
    _touch(data_root / "reference_motions" / "videos" / "tutorials" / "clip1.mp4")
    _touch(data_root / "participant_motions" / "chi25_study1" / "videos" / "user1____clip1.mp4")
    _touch(data_root / "participant_motions" / "chi25_study2" / "videos" / "user2____clip1.mp4")
    # A nested whole-session recording must NOT be picked up as a per-clip target.
    _touch(
        data_root
        / "participant_motions"
        / "chi25_study1"
        / "videos"
        / "userperformances-study1"
        / "whole-session.mp4"
    )


def test_build_extraction_targets_places_reference_output_beside_pose_raw(tmp_path: Path) -> None:
    _make_corpus(tmp_path)

    targets = build_extraction_targets(tmp_path, ["reference"])

    assert len(targets) == 1
    target = targets[0]
    assert target.video.relative_stem == "tutorials/clip1"
    assert target.pose2d_output_path == tmp_path / "reference_motions" / "pose-raw" / "pose2d" / "tutorials" / "clip1.pose2d.raw.csv"
    assert target.pose3d_output_path == tmp_path / "reference_motions" / "pose-raw" / "pose3d" / "tutorials" / "clip1.pose3d.raw.csv"


def test_build_extraction_targets_uses_study_pose_layout_canonical_root(tmp_path: Path) -> None:
    _make_corpus(tmp_path)

    targets = build_extraction_targets(tmp_path, ["chi25_study1"])

    assert len(targets) == 1
    target = targets[0]
    assert target.video.relative_stem == "user1____clip1"
    expected_pose_root = (
        tmp_path
        / "participant_motions"
        / "chi25_study1"
        / "pose-raw"
        / "canonical"
        / "study1-segmented"
    )
    assert target.pose2d_output_path == expected_pose_root / "pose2d" / "user1____clip1.pose2d.raw.csv"
    assert target.pose3d_output_path == expected_pose_root / "pose3d" / "user1____clip1.pose3d.raw.csv"


def test_build_extraction_targets_excludes_whole_session_recordings(tmp_path: Path) -> None:
    _make_corpus(tmp_path)

    targets = build_extraction_targets(tmp_path, ["chi25_study1"])

    assert all("whole-session" not in target.video.relative_stem for target in targets)
    assert len(targets) == 1


def _write_nonempty(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("frame,NOSE_x,NOSE_y,NOSE_distance,NOSE_vis\n")


def test_run_extraction_skips_clips_with_both_outputs_already_present(tmp_path: Path) -> None:
    _make_corpus(tmp_path)
    targets = build_extraction_targets(tmp_path, ["reference"])
    _write_nonempty(targets[0].pose2d_output_path)
    _write_nonempty(targets[0].pose3d_output_path)

    results = run_extraction(targets, landmarker=None, overwrite=False)

    assert results[0]["status"] == "skipped_existing"


def test_run_extraction_reprocesses_a_zero_byte_output_left_by_a_killed_run(tmp_path: Path) -> None:
    # Regression test: a real corpus run was killed by the OS mid-write,
    # leaving one clip's pose2d output as a 0-byte file. Since it existed,
    # every subsequent resumed attempt skipped it forever, silently leaving
    # that clip permanently unextracted. Existence alone must not satisfy
    # the "already done" check.
    _make_corpus(tmp_path)
    targets = build_extraction_targets(tmp_path, ["reference"])
    targets[0].pose2d_output_path.parent.mkdir(parents=True, exist_ok=True)
    targets[0].pose2d_output_path.write_bytes(b"")  # zero bytes, as a kill mid-write leaves
    _write_nonempty(targets[0].pose3d_output_path)

    results = run_extraction(targets, landmarker=None, overwrite=False)

    assert results[0]["status"] != "skipped_existing"


def test_run_extraction_survives_an_unreadable_video_without_aborting(tmp_path: Path) -> None:
    # The corpus helper writes empty (0-byte) .mp4 fixtures, which cv2 can open
    # but reads zero frames from -- this exercises the same "one clip can't
    # abort a 1,808-clip run" guarantee as a genuine per-clip exception would,
    # without needing a real corrupt video file or a real landmarker.
    _make_corpus(tmp_path)
    targets = build_extraction_targets(tmp_path, ["reference", "chi25_study1"])

    results = run_extraction(targets, landmarker=None, overwrite=False)

    assert len(results) == 2
    assert all(row["status"] == "extracted" for row in results)
    assert all(row["error"] == "" for row in results)
    for target in targets:
        assert target.pose2d_output_path.is_file()
        assert target.pose3d_output_path.is_file()


def test_run_extraction_records_failure_without_aborting(tmp_path: Path) -> None:
    _make_corpus(tmp_path)
    targets = build_extraction_targets(tmp_path, ["reference"])
    # Block the pose2d output directory itself with a same-named file so the
    # extractor's mkdir(parents=True) inside extract_pose_landmarker_video raises.
    blocking_path = targets[0].pose2d_output_path.parent
    blocking_path.parent.mkdir(parents=True, exist_ok=True)
    blocking_path.write_bytes(b"")

    results = run_extraction(targets, landmarker=None, overwrite=False)

    assert len(results) == 1
    assert results[0]["status"] == "failed"
    assert results[0]["error"]
