import unittest

import numpy as np
import pandas as pd

from motion_extraction.complexity_analysis.calculate_cumulative_complexity import (
    DVAJ,
    alpha_from_visibility,
    build_legacy_body_part_metric_series,
    build_grouped_visibility_series,
    calculate_legacy_body_part_complexities,
    choose_legacy_example_body_part,
    compute_naive_segment_boundaries,
    filter_plot_columns_by_weight,
    get_complexity_creationmethod_name,
    resolve_bodyparts_for_artifact_plotting,
    repair_cumulative_metrics_by_visibility,
    repair_low_visibility_cumulative_series,
    get_group_weight,
    normalize_grouped_cumulative_metrics,
    PoseLandmarkWeighting,
    snap_boundaries_to_beats,
    VisibilityMode,
    DvajMeasureWeighting,
)
from motion_extraction.mp_utils import PoseLandmark


class LegacyDiagnosticsTests(unittest.TestCase):
    def test_build_legacy_body_part_metric_series_averages_groups(self):
        dvaj = pd.DataFrame(
            {
                "LEFT_EAR_distance": [1.0, 3.0],
                "RIGHT_EAR_distance": [5.0, 7.0],
                "LEFT_EAR_velocity": [2.0, 4.0],
                "RIGHT_EAR_velocity": [6.0, 8.0],
                "LEFT_WRIST_distance": [9.0, 10.0],
                "LEFT_WRIST_velocity": [11.0, 12.0],
            }
        )

        grouped = build_legacy_body_part_metric_series(dvaj)

        self.assertListEqual(grouped["face_distance"].tolist(), [3.0, 5.0])
        self.assertListEqual(grouped["face_velocity"].tolist(), [4.0, 6.0])
        self.assertListEqual(grouped["left_wrist_distance"].tolist(), [9.0, 10.0])

    def test_grouped_displacement_cumsum_is_single_accumulation(self):
        per_frame = pd.DataFrame(
            {
                "LEFT_WRIST_distance": [1.0, 2.0, 3.0],
                "LEFT_WRIST_velocity": [0.5, 0.5, 0.5],
            }
        )

        grouped_per_frame = build_legacy_body_part_metric_series(per_frame)
        grouped_cumsum = build_legacy_body_part_metric_series(per_frame.cumsum())

        expected_distance_cumsum = grouped_per_frame["left_wrist_distance"].cumsum()
        self.assertTrue(expected_distance_cumsum.equals(grouped_cumsum["left_wrist_distance"]))

    def test_body_part_complexity_is_not_forced_to_end_at_one(self):
        grouped_cumsum = pd.DataFrame(
            {
                "left_wrist_distance": [1.0, 2.0],
                "left_wrist_velocity": [0.5, 1.0],
                "face_distance": [0.25, 0.5],
                "face_velocity": [0.1, 0.2],
            }
        )
        normalization_maxes = pd.Series(
            {
                "left_wrist_distance": 1.0,
                "left_wrist_velocity": 0.5,
                "face_distance": 0.25,
                "face_velocity": 0.1,
            }
        )
        normalized = normalize_grouped_cumulative_metrics(grouped_cumsum, normalization_maxes)

        measure_weights = {
            DVAJ.distance: 1.0,
            DVAJ.velocity: 0.5,
            DVAJ.acceleration: 0.0,
            DVAJ.jerk: 0.0,
        }
        body_part_complexity = calculate_legacy_body_part_complexities(normalized, measure_weights)

        self.assertGreater(body_part_complexity["left_wrist"].iloc[-1], 1.0)
        self.assertGreater(body_part_complexity["face"].iloc[-1], 1.0)

    def test_compute_naive_segment_boundaries_uses_target_crossings(self):
        overall_complexity = pd.Series([0.0, 4.0, 10.0, 15.0, 21.0], index=[0, 1, 2, 3, 4])

        boundaries = compute_naive_segment_boundaries(overall_complexity, 10.0)

        self.assertListEqual(boundaries["target_complexity"].tolist(), [10.0, 20.0])
        self.assertListEqual(boundaries["frame"].tolist(), [2, 4])

    def test_snap_boundaries_to_beats_allows_duplicates(self):
        snapped = snap_boundaries_to_beats([9.0, 11.0, 19.0], [10.0, 20.0])
        self.assertListEqual(snapped.tolist(), [10.0, 10.0, 20.0])

    def test_repair_low_visibility_series_uses_average_high_visibility_increment(self):
        cumulative = pd.Series([0.0, 1.0, 1.0, 1.0, 3.0])
        visibility = pd.Series([1.0, 1.0, 0.0, 0.0, 1.0])

        repaired = repair_low_visibility_cumulative_series(cumulative, visibility, visibility_cutoff=0.5)

        self.assertListEqual(repaired.round(3).tolist(), [0.0, 1.0, 2.0, 3.0, 5.0])

    def test_repair_low_visibility_series_all_low_falls_back_to_zero_increment(self):
        cumulative = pd.Series([0.0, 0.0, 0.0, 0.0])
        visibility = pd.Series([0.0, 0.0, 0.0, 0.0])

        repaired = repair_low_visibility_cumulative_series(cumulative, visibility, visibility_cutoff=0.5)

        self.assertListEqual(repaired.tolist(), [0.0, 0.0, 0.0, 0.0])

    def test_repair_cumulative_metrics_uses_landmark_visibility(self):
        cumulative_metrics = pd.DataFrame(
            {
                "LEFT_WRIST_distance": [0.0, 1.0, 1.0, 1.0],
                "LEFT_WRIST_velocity": [0.0, 0.5, 0.5, 0.5],
            }
        )
        landmark_visibility = pd.DataFrame({"LEFT_WRIST": [1.0, 1.0, 0.0, 0.0]})

        repaired = repair_cumulative_metrics_by_visibility(cumulative_metrics, landmark_visibility, visibility_cutoff=0.5)

        self.assertListEqual(repaired["LEFT_WRIST_distance"].round(3).tolist(), [0.0, 1.0, 2.0, 3.0])
        self.assertListEqual(repaired["LEFT_WRIST_velocity"].round(3).tolist(), [0.0, 0.5, 1.0, 1.5])

    def test_grouped_visibility_uses_harmonic_mean(self):
        visibility = pd.DataFrame(
            {
                "LEFT_EAR": [1.0, 0.5],
                "RIGHT_EAR": [1.0, 1.0],
                "LEFT_WRIST": [0.25, 0.25],
            }
        )
        body_part_groups = {
            "face": ("LEFT_EAR", "RIGHT_EAR"),
            "left_wrist": ("LEFT_WRIST",),
        }

        grouped = build_grouped_visibility_series(visibility, body_part_groups)

        self.assertTrue(np.allclose(grouped["face"].tolist(), [1.0, 2.0 / 3.0]))
        self.assertTrue(np.allclose(grouped["left_wrist"].tolist(), [0.25, 0.25]))

    def test_alpha_mapping_clamps_to_floor_and_ceiling(self):
        alpha = alpha_from_visibility(np.array([0.0, 0.5, 1.0]), alpha_floor=0.35)
        self.assertTrue(np.allclose(alpha, [0.35, 0.675, 1.0]))
        self.assertTrue(np.all((alpha >= 0.35) & (alpha <= 1.0)))

    def test_filter_plot_columns_by_weight_removes_zero_weight_landmarks(self):
        plot_df = pd.DataFrame(
            {
                "LEFT_WRIST_distance": [1.0, 2.0],
                "RIGHT_WRIST_distance": [3.0, 4.0],
                "distance": [5.0, 6.0],
            }
        )
        visibility_df = pd.DataFrame(
            {
                "LEFT_WRIST_distance": [1.0, 1.0],
                "RIGHT_WRIST_distance": [1.0, 1.0],
                "distance": [1.0, 1.0],
            }
        )
        landmark_weighting = {
            PoseLandmark.LEFT_WRIST: 1.0,
            PoseLandmark.RIGHT_WRIST: 0.0,
        }

        filtered_df, filtered_visibility_df = filter_plot_columns_by_weight(
            plot_df,
            landmark_weighting,
            visibility=visibility_df,
        )

        self.assertListEqual(list(filtered_df.columns), ["LEFT_WRIST_distance", "distance"])
        self.assertListEqual(list(filtered_visibility_df.columns), ["LEFT_WRIST_distance", "distance"])

    def test_filter_plot_columns_by_weight_removes_zero_weight_groups(self):
        plot_df = pd.DataFrame(
            {
                "face": [1.0, 2.0],
                "left_wrist": [3.0, 4.0],
            }
        )
        visibility_df = plot_df.copy()
        landmark_weighting = {
            PoseLandmark.LEFT_EAR: 0.0,
            PoseLandmark.RIGHT_EAR: 0.0,
            PoseLandmark.LEFT_WRIST: 1.0,
        }
        body_part_groups = {
            "face": ("LEFT_EAR", "RIGHT_EAR"),
            "left_wrist": ("LEFT_WRIST",),
        }

        filtered_df, filtered_visibility_df = filter_plot_columns_by_weight(
            plot_df,
            landmark_weighting,
            visibility=visibility_df,
            body_part_groups=body_part_groups,
        )

        self.assertListEqual(list(filtered_df.columns), ["left_wrist"])
        self.assertListEqual(list(filtered_visibility_df.columns), ["left_wrist"])
        self.assertEqual(get_group_weight("face", body_part_groups, landmark_weighting), 0.0)

    def test_choose_legacy_example_body_part_falls_back_to_first_positive_group(self):
        landmark_weighting = {
            PoseLandmark.LEFT_EAR: 0.0,
            PoseLandmark.RIGHT_EAR: 0.0,
            PoseLandmark.LEFT_WRIST: 1.0,
            PoseLandmark.RIGHT_WRIST: 0.0,
        }
        body_part_groups = {
            "face": ("LEFT_EAR", "RIGHT_EAR"),
            "left_wrist": ("LEFT_WRIST",),
            "right_wrist": ("RIGHT_WRIST",),
        }

        chosen = choose_legacy_example_body_part("face", body_part_groups, landmark_weighting)

        self.assertEqual(chosen, "left_wrist")

    def test_choose_legacy_example_body_part_returns_none_when_all_groups_zero_weight(self):
        landmark_weighting = {
            PoseLandmark.LEFT_EAR: 0.0,
            PoseLandmark.RIGHT_EAR: 0.0,
        }
        body_part_groups = {
            "face": ("LEFT_EAR", "RIGHT_EAR"),
        }

        chosen = choose_legacy_example_body_part("face", body_part_groups, landmark_weighting)

        self.assertIsNone(chosen)

    def test_resolve_bodyparts_for_artifact_plotting_deduplicates_and_falls_back(self):
        landmark_weighting = {
            PoseLandmark.LEFT_EAR: 0.0,
            PoseLandmark.RIGHT_EAR: 0.0,
            PoseLandmark.LEFT_WRIST: 1.0,
            PoseLandmark.RIGHT_WRIST: 1.0,
        }
        body_part_groups = {
            "face": ("LEFT_EAR", "RIGHT_EAR"),
            "left_wrist": ("LEFT_WRIST",),
            "right_wrist": ("RIGHT_WRIST",),
        }

        resolved = resolve_bodyparts_for_artifact_plotting(
            ["face", "left_wrist", "face", "right_wrist"],
            body_part_groups,
            landmark_weighting,
        )

        self.assertListEqual(resolved, ["left_wrist", "right_wrist"])

    def test_visibility_mode_creation_method_names_are_stable(self):
        self.assertEqual(
            get_complexity_creationmethod_name(
                DvajMeasureWeighting.decreasing_by_quarter,
                PoseLandmarkWeighting.balanced,
                VisibilityMode.weight,
                True,
            ),
            "mw-decreasing_by_quarter_lmw-balanced_byvisibility_includebase",
        )
        self.assertEqual(
            get_complexity_creationmethod_name(
                DvajMeasureWeighting.decreasing_by_quarter,
                PoseLandmarkWeighting.balanced,
                VisibilityMode.interpolate,
                True,
            ),
            "mw-decreasing_by_quarter_lmw-balanced_interpolatevisibility_includebase",
        )


if __name__ == "__main__":
    unittest.main()
