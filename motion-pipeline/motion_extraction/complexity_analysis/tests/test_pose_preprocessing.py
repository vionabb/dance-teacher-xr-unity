import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from motion_extraction.complexity_analysis.calculate_cumulative_complexity import (
    generate_dvajs_with_visibility,
)
from motion_extraction.preprocess_pose_data import (
    PREPROCESS_ROOT_COLUMN_PREFIX,
    PREPROCESS_TORSO_LENGTH_COLUMN,
    PREPROCESS_USABLE_FRAME_COLUMN,
    PoseDataType,
    preprocess_pose_dataframe,
)


class PosePreprocessingTests(unittest.TestCase):
    def test_preprocess_pose2d_recenters_and_normalizes_by_torso_length(self):
        raw_pose2d_df = pd.DataFrame(
            {
                "LEFT_HIP_x": [1.0],
                "LEFT_HIP_y": [0.0],
                "LEFT_HIP_distance": [0.0],
                "LEFT_HIP_vis": [1.0],
                "RIGHT_HIP_x": [3.0],
                "RIGHT_HIP_y": [0.0],
                "RIGHT_HIP_distance": [0.0],
                "RIGHT_HIP_vis": [1.0],
                "LEFT_SHOULDER_x": [1.0],
                "LEFT_SHOULDER_y": [4.0],
                "LEFT_SHOULDER_distance": [0.0],
                "LEFT_SHOULDER_vis": [1.0],
                "RIGHT_SHOULDER_x": [3.0],
                "RIGHT_SHOULDER_y": [4.0],
                "RIGHT_SHOULDER_distance": [0.0],
                "RIGHT_SHOULDER_vis": [1.0],
                "LEFT_WRIST_x": [5.0],
                "LEFT_WRIST_y": [2.0],
                "LEFT_WRIST_distance": [1.0],
                "LEFT_WRIST_vis": [1.0],
            },
            index=pd.Index([0], name="frame"),
        )

        clean_pose2d_df = preprocess_pose_dataframe(raw_pose2d_df, PoseDataType.pose2d)

        self.assertAlmostEqual(clean_pose2d_df[f"{PREPROCESS_ROOT_COLUMN_PREFIX}_x"].iloc[0], 2.0)
        self.assertAlmostEqual(clean_pose2d_df[f"{PREPROCESS_ROOT_COLUMN_PREFIX}_y"].iloc[0], 0.0)
        self.assertAlmostEqual(clean_pose2d_df[PREPROCESS_TORSO_LENGTH_COLUMN].iloc[0], 4.0)
        self.assertEqual(int(clean_pose2d_df[PREPROCESS_USABLE_FRAME_COLUMN].iloc[0]), 1)
        self.assertAlmostEqual(clean_pose2d_df["LEFT_WRIST_x"].iloc[0], 0.75)
        self.assertAlmostEqual(clean_pose2d_df["LEFT_WRIST_y"].iloc[0], 0.5)
        self.assertAlmostEqual(clean_pose2d_df["LEFT_WRIST_distance"].iloc[0], 0.25)

    def test_preprocess_marks_zero_torso_length_frames_unusable(self):
        raw_pose2d_df = pd.DataFrame(
            {
                "LEFT_HIP_x": [1.0],
                "LEFT_HIP_y": [1.0],
                "LEFT_HIP_distance": [0.0],
                "LEFT_HIP_vis": [1.0],
                "RIGHT_HIP_x": [1.0],
                "RIGHT_HIP_y": [1.0],
                "RIGHT_HIP_distance": [0.0],
                "RIGHT_HIP_vis": [1.0],
                "LEFT_SHOULDER_x": [1.0],
                "LEFT_SHOULDER_y": [1.0],
                "LEFT_SHOULDER_distance": [0.0],
                "LEFT_SHOULDER_vis": [1.0],
                "RIGHT_SHOULDER_x": [1.0],
                "RIGHT_SHOULDER_y": [1.0],
                "RIGHT_SHOULDER_distance": [0.0],
                "RIGHT_SHOULDER_vis": [1.0],
                "LEFT_WRIST_x": [5.0],
                "LEFT_WRIST_y": [2.0],
                "LEFT_WRIST_distance": [1.0],
                "LEFT_WRIST_vis": [1.0],
            },
            index=pd.Index([0], name="frame"),
        )

        clean_pose2d_df = preprocess_pose_dataframe(raw_pose2d_df, PoseDataType.pose2d)

        self.assertEqual(int(clean_pose2d_df[PREPROCESS_USABLE_FRAME_COLUMN].iloc[0]), 0)
        self.assertTrue(np.isnan(clean_pose2d_df["LEFT_WRIST_x"].iloc[0]))
        self.assertTrue(np.isnan(clean_pose2d_df["LEFT_WRIST_y"].iloc[0]))
        self.assertTrue(np.isnan(clean_pose2d_df["LEFT_WRIST_distance"].iloc[0]))

    def test_generate_dvajs_with_visibility_supports_pose2d_and_holistic(self):
        landmark_names = [
            "LEFT_HIP",
            "RIGHT_HIP",
            "LEFT_SHOULDER",
            "RIGHT_SHOULDER",
            "LEFT_WRIST",
        ]

        pose2d_raw_df = pd.DataFrame(
            {
                "LEFT_HIP_x": [1.0, 1.0],
                "LEFT_HIP_y": [0.0, 0.0],
                "LEFT_HIP_distance": [0.0, 0.0],
                "LEFT_HIP_vis": [1.0, 1.0],
                "RIGHT_HIP_x": [3.0, 3.0],
                "RIGHT_HIP_y": [0.0, 0.0],
                "RIGHT_HIP_distance": [0.0, 0.0],
                "RIGHT_HIP_vis": [1.0, 1.0],
                "LEFT_SHOULDER_x": [1.0, 1.0],
                "LEFT_SHOULDER_y": [4.0, 4.0],
                "LEFT_SHOULDER_distance": [0.0, 0.0],
                "LEFT_SHOULDER_vis": [1.0, 1.0],
                "RIGHT_SHOULDER_x": [3.0, 3.0],
                "RIGHT_SHOULDER_y": [4.0, 4.0],
                "RIGHT_SHOULDER_distance": [0.0, 0.0],
                "RIGHT_SHOULDER_vis": [1.0, 1.0],
                "LEFT_WRIST_x": [5.0, 6.0],
                "LEFT_WRIST_y": [2.0, 2.0],
                "LEFT_WRIST_distance": [1.0, 1.0],
                "LEFT_WRIST_vis": [1.0, 1.0],
            },
            index=pd.Index([0, 1], name="frame"),
        )

        holistic_clean_df = pd.DataFrame(
            {
                "LEFT_HIP_x": [-0.25, -0.25],
                "LEFT_HIP_y": [0.0, 0.0],
                "LEFT_HIP_z": [0.0, 0.0],
                "LEFT_HIP_vis": [1.0, 1.0],
                "RIGHT_HIP_x": [0.25, 0.25],
                "RIGHT_HIP_y": [0.0, 0.0],
                "RIGHT_HIP_z": [0.0, 0.0],
                "RIGHT_HIP_vis": [1.0, 1.0],
                "LEFT_SHOULDER_x": [-0.25, -0.25],
                "LEFT_SHOULDER_y": [1.0, 1.0],
                "LEFT_SHOULDER_z": [0.0, 0.0],
                "LEFT_SHOULDER_vis": [1.0, 1.0],
                "RIGHT_SHOULDER_x": [0.25, 0.25],
                "RIGHT_SHOULDER_y": [1.0, 1.0],
                "RIGHT_SHOULDER_z": [0.0, 0.0],
                "RIGHT_SHOULDER_vis": [1.0, 1.0],
                "LEFT_WRIST_x": [0.75, 1.0],
                "LEFT_WRIST_y": [0.5, 0.5],
                "LEFT_WRIST_z": [0.25, 0.25],
                "LEFT_WRIST_vis": [1.0, 1.0],
                PREPROCESS_TORSO_LENGTH_COLUMN: [4.0, 4.0],
                PREPROCESS_USABLE_FRAME_COLUMN: [1, 1],
            },
            index=pd.Index([0, 1], name="frame"),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            pose2d_raw_path = temp_root / "sample.pose2d.raw.csv"
            holistic_clean_path = temp_root / "sample.holisticdata.clean.csv"
            pose2d_raw_df.to_csv(pose2d_raw_path, index_label="frame")
            holistic_clean_df.to_csv(holistic_clean_path, index_label="frame")

            pose2d_dvaj, pose2d_visibility = next(
                generate_dvajs_with_visibility(
                    [pose2d_raw_path],
                    landmark_names,
                    pose_data_type=PoseDataType.pose2d,
                )
            )
            holistic_dvaj, holistic_visibility = next(
                generate_dvajs_with_visibility(
                    [holistic_clean_path],
                    landmark_names,
                    pose_data_type=PoseDataType.holistic_3d,
                )
            )

        self.assertIn("LEFT_WRIST_distance", pose2d_dvaj.columns)
        self.assertIn("LEFT_WRIST_distance", holistic_dvaj.columns)
        self.assertGreater(pose2d_dvaj["LEFT_WRIST_distance"].iloc[1], 0.0)
        self.assertGreater(holistic_dvaj["LEFT_WRIST_distance"].iloc[1], 0.0)
        self.assertEqual(pose2d_visibility["LEFT_WRIST"].iloc[0], 1.0)
        self.assertEqual(holistic_visibility["LEFT_WRIST"].iloc[0], 1.0)


if __name__ == "__main__":
    unittest.main()
