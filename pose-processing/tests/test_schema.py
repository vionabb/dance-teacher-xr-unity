from pathlib import Path

import pandas as pd

from dance_teacher_pose import (
    PoseDataType,
    collect_pose_data_files,
    preprocess_pose_dataframe,
    relative_stem_from_pose_csv_path,
)


def _raw_pose() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "LEFT_HIP_x": [1.0], "LEFT_HIP_y": [0.0], "LEFT_HIP_distance": [0.0], "LEFT_HIP_vis": [1.0],
            "RIGHT_HIP_x": [3.0], "RIGHT_HIP_y": [0.0], "RIGHT_HIP_distance": [0.0], "RIGHT_HIP_vis": [1.0],
            "LEFT_SHOULDER_x": [1.0], "LEFT_SHOULDER_y": [4.0], "LEFT_SHOULDER_distance": [0.0], "LEFT_SHOULDER_vis": [1.0],
            "RIGHT_SHOULDER_x": [3.0], "RIGHT_SHOULDER_y": [4.0], "RIGHT_SHOULDER_distance": [0.0], "RIGHT_SHOULDER_vis": [1.0],
            "LEFT_WRIST_x": [5.0], "LEFT_WRIST_y": [2.0], "LEFT_WRIST_distance": [1.0], "LEFT_WRIST_vis": [1.0],
            "timestamp": [0.25],
        }
    )


def test_preprocessing_preserves_metadata_and_canonicalizes_coordinates() -> None:
    clean = preprocess_pose_dataframe(_raw_pose(), PoseDataType.pose2d)
    assert clean.loc[0, "timestamp"] == 0.25
    assert clean.loc[0, "LEFT_WRIST_x"] == 0.75
    assert clean.loc[0, "preprocess_is_usable"] == 1


def test_nested_stem_and_version_precedence(tmp_path: Path) -> None:
    root = tmp_path / "poses"
    nested = root / "participant" / "clip.pose2d"
    nested.parent.mkdir(parents=True)
    raw = nested.with_name("clip.pose2d.raw.csv")
    clean = nested.with_name("clip.pose2d.clean.csv")
    raw.write_text("frame\n0\n", encoding="utf-8")
    clean.write_text("frame\n0\n", encoding="utf-8")

    assert relative_stem_from_pose_csv_path(raw, root, PoseDataType.pose2d) == "participant/clip"
    assert collect_pose_data_files(root, PoseDataType.pose2d, ("clean", "raw")) == [clean]

