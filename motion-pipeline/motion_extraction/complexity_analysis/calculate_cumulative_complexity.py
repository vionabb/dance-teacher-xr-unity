"""Compute and persist cumulative motion complexity from holistic pose CSVs.

This module is the batch entry point for the DVAJ-based complexity pipeline in
`motion_extraction/complexity_analysis`. It reads `*.holisticdata.csv` and
`*.holisticdata.raw.csv` pose exports, optionally re-centers landmarks around a synthetic hip-base landmark,
derives per-frame scalar DVAJ values, accumulates them over time, and writes
scaled complexity series plus dataset-level summaries to `destdir`.

Primary use:
- import `calculate_cumulative_complexities(...)` from other pipeline code; or
- run this file as a script to process a source tree or an explicit file list.

Main outputs:
- `destdir/byfile/**/*.complexity.csv` for per-recording scaled cumulative
  complexity series;
- `destdir/dvaj_complexity.csv` for cross-file summary rows; and
- optional intermediate plots and diagnostic CSVs when artifact output is
  enabled.
"""

from collections import defaultdict
from fnmatch import fnmatchcase
from pathlib import Path
import json
import time
import pandas as pd
import numpy as np
import typing as t
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.colors import to_rgba
from matplotlib.lines import Line2D
import enum
import sys
import itertools
try:
    from tqdm import tqdm, trange
except ImportError:
    def tqdm(iterable, *args, **kwargs):
        return iterable

    def trange(*args, **kwargs):
        return range(*args)

from ..artifacts import (
    build_artifact_report,
    resolve_artifact_clip_title,
    resolve_artifact_output_dir,
)
from ..update_database import load_db
from ..mp_utils import PoseLandmark
from .uist_complexityanalysis import get_pose_landmarks_present_in_dataframe, DVAJ, calc_scalar_dvaj

_HOLISTIC_DATA_LEGACY_SUFFIX = ".holisticdata.csv"
_HOLISTIC_DATA_RAW_SUFFIX = ".holisticdata.raw.csv"


def _clip_stem_from_holistic_csv_path(file_path: Path) -> str:
    name = file_path.name
    for suffix in (_HOLISTIC_DATA_RAW_SUFFIX, _HOLISTIC_DATA_LEGACY_SUFFIX):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return file_path.stem


def _collect_holistic_data_files(root_folder: Path) -> list[Path]:
    files_by_relative_stem: dict[str, Path] = {}
    for holistic_data_file in root_folder.rglob(f"*{_HOLISTIC_DATA_LEGACY_SUFFIX}"):
        relative_stem = holistic_data_file.relative_to(root_folder).as_posix()[: -len(_HOLISTIC_DATA_LEGACY_SUFFIX)]
        files_by_relative_stem[relative_stem] = holistic_data_file
    for holistic_data_file in root_folder.rglob(f"*{_HOLISTIC_DATA_RAW_SUFFIX}"):
        relative_stem = holistic_data_file.relative_to(root_folder).as_posix()[: -len(_HOLISTIC_DATA_RAW_SUFFIX)]
        files_by_relative_stem[relative_stem] = holistic_data_file
    return list(files_by_relative_stem.values())

BASE_COL_NAME = "base"
BEATS_PER_BAR: t.Final[int] = 4
DEFAULT_BODYPARTS_FOR_ARTIFACT_PLOTTING: t.Final[t.Tuple[str, ...]] = ("left_wrist",)
VISIBILITY_REPAIR_CUTOFF: t.Final[float] = 0.5
VISIBILITY_PLOT_ALPHA_FLOOR: t.Final[float] = 0.35

LEGACY_GROUPED_BODY_PARTS: t.Final[t.Dict[str, t.Tuple[str, ...]]] = {
    "face": (PoseLandmark.LEFT_EAR.name, PoseLandmark.RIGHT_EAR.name),
    "left_wrist": (PoseLandmark.LEFT_WRIST.name,),
    "right_wrist": (PoseLandmark.RIGHT_WRIST.name,),
    "shoulder_average": (PoseLandmark.LEFT_SHOULDER.name, PoseLandmark.RIGHT_SHOULDER.name),
    "hip_average": (PoseLandmark.LEFT_HIP.name, PoseLandmark.RIGHT_HIP.name),
    "left_ankle": (PoseLandmark.LEFT_ANKLE.name,),
    "right_ankle": (PoseLandmark.RIGHT_ANKLE.name,),
}
LEGACY_GROUPED_BODY_PART_LABELS: t.Final[t.Dict[str, str]] = {
    "face": "Face",
    "left_wrist": "Left Wrist",
    "right_wrist": "Right Wrist",
    "shoulder_average": "Shoulders",
    "hip_average": "Hips",
    "left_ankle": "Left Ankle",
    "right_ankle": "Right Ankle",
}

def pd_append_replace(df1: pd.DataFrame, df2: pd.DataFrame) -> pd.DataFrame:
    """Appends pd2 contents of df1, replacing any rows in df1 that have the same index as pd2, 
    and returns the result.

    Args:
        df1 (pd.DataFrame): The original dataframe
        df2 (pd.DataFrame): Dataframe with updated or additional data
    
    Returns:
        pd.DataFrame: The updated dataframe
    """
    return pd.concat([
        df1[~df1.index.isin(df2.index)], # unmodified rows
        df2                              # updated / new rows
    ])

T = t.TypeVar('T', bound=enum.Enum)
def normalize_weighting(w: t.Dict[T, float]) -> t.Dict[T, float]:
    """Normalizes a weighting dictionary to add up to 1."""    

    value_sum = sum(w.values())
    return {
        **{
            k: v / value_sum for k, v in w.items()
        }
    }

class DvajMeasureWeighting(enum.Enum):
    decreasing_by_half = enum.auto()
    decreasing_by_quarter = enum.auto()
    equal = enum.auto()

    def get_weighting(self):
        if self == DvajMeasureWeighting.decreasing_by_half:
            return normalize_weighting(
                {
                    DVAJ.distance: 1.0,
                    DVAJ.velocity: 0.5,
                    DVAJ.acceleration: 0.25,
                    DVAJ.jerk: 0.125
                }
            )
        elif self == DvajMeasureWeighting.decreasing_by_quarter:
            return normalize_weighting(
                {
                    DVAJ.distance: 1.0,
                    DVAJ.velocity: 0.75,
                    DVAJ.acceleration: 0.5,
                    DVAJ.jerk: 0.25
                }
            )
        elif self == DvajMeasureWeighting.equal:
            return normalize_weighting(
                {
                    DVAJ.distance: 1.0,
                    DVAJ.velocity: 1.0,
                    DVAJ.acceleration: 1.0,
                    DVAJ.jerk: 1.0
                }
            )
        else:
            raise ValueError(f"DvajMeasureWeighting {self} not recognized.")

"""An anthropomorphic weighting for the human body based on mass distribution.

    Described by Larboulette, C., & Gibet, S. (2015, August). A review of computable expressive descriptors of human motion
    Inspired by Dempster, W. T. (1955). Space requirements of the seated operator, geometrical, kinematic, and mechanical aspects of the body with special reference to the limbs. Michigan State Univ East Lansing.
"""
LANDMARK_WEIGHTING_DEMPSTER: t.Final[t.Dict[PoseLandmark, float]] = normalize_weighting(
    {
        PoseLandmark.LEFT_HIP: 0.497 / 2 + 0.05,  # root: 49.7%. 50% split between hips. Also,
                                                  #   10% of thigh is split between hip and knee.
        PoseLandmark.RIGHT_HIP: 0.497 / 2 + 0.05,
        PoseLandmark.LEFT_SHOULDER: .028,   # each shoulders: 2.8%
        PoseLandmark.RIGHT_SHOULDER: .028,
        PoseLandmark.LEFT_ELBOW: .016,      # each elbows: 1.6%
        PoseLandmark.RIGHT_ELBOW: .016,
        PoseLandmark.LEFT_WRIST: .006,      # each wrists: 0.6%
        PoseLandmark.RIGHT_WRIST: .006,
        PoseLandmark.LEFT_KNEE: 0.05 + .0465,       # 1/2 of thigh + knee: 5% + 4.65%
        PoseLandmark.RIGHT_KNEE: 0.05 + .0465,
        PoseLandmark.LEFT_ANKLE: 0.0145,      # each foot: 1.45%
        PoseLandmark.RIGHT_ANKLE: 0.0145,
        PoseLandmark.NOSE: 0.081 # head: 8.1%
    }
)
LANDMARK_WEIGHTING_DEMPSTER_WITH_BASE: t.Final[t.Dict[str, float]] = normalize_weighting({
    **{k.name: v for k, v in LANDMARK_WEIGHTING_DEMPSTER.items()},
    **{
        # Adjust to have the theigh be 10% of the body, move root weighting to base
        PoseLandmark.LEFT_HIP.name: 0.05,
        PoseLandmark.RIGHT_HIP.name: 0.05,
        BASE_COL_NAME: 0.497
    }
}) # type: ignore
"""A balanced weighting for the human body. (adhoc construction)"""
LANDMARK_WEIGHTING_BALANCED: t.Final[t.Dict[PoseLandmark, float]] = normalize_weighting( # type: ignore
    {
        # 1-weight for hips
        PoseLandmark.LEFT_HIP: 1,
        PoseLandmark.RIGHT_HIP: 1,

        PoseLandmark.LEFT_SHOULDER: 1,
        PoseLandmark.RIGHT_SHOULDER: 1,

        # 1-weight for the arm joints
        PoseLandmark.LEFT_ELBOW: 1,
        PoseLandmark.LEFT_WRIST: 1,
        PoseLandmark.RIGHT_ELBOW: 1,
        PoseLandmark.RIGHT_WRIST: 1,

        #  1-weight for leg joints
        PoseLandmark.LEFT_KNEE: 1,
        PoseLandmark.RIGHT_KNEE: 1,
        PoseLandmark.LEFT_ANKLE: 2,
        PoseLandmark.RIGHT_ANKLE: 2,

        # 1-weight for the head
        PoseLandmark.LEFT_EAR: 1,
        PoseLandmark.RIGHT_EAR: 1,
    }
)
LANDMARK_WEIGHTING_BALANCED_WITH_BASE: t.Final[t.Dict[str, float]] = normalize_weighting({
        **{k.name: v for k, v in LANDMARK_WEIGHTING_BALANCED.items()},
        **{
            BASE_COL_NAME: 1.0 /3.0, # this will make it have 1/4 of the total weight, since the above is normalized
        },
    } # type: ignore
)

class PoseLandmarkWeighting(enum.Enum):
    balanced = enum.auto()
    dempster = enum.auto()

    def get_weighting(self, include_base: bool) -> t.Dict[t.Union[str, PoseLandmark], float]:
        if self == PoseLandmarkWeighting.balanced and not include_base:
            return LANDMARK_WEIGHTING_BALANCED
        elif self == PoseLandmarkWeighting.balanced and include_base:
            return LANDMARK_WEIGHTING_BALANCED_WITH_BASE
        elif self == PoseLandmarkWeighting.dempster and not include_base:
            return LANDMARK_WEIGHTING_DEMPSTER
        elif self == PoseLandmarkWeighting.dempster and include_base:
            return LANDMARK_WEIGHTING_DEMPSTER_WITH_BASE
        else:
            raise ValueError(f"PoseLandmarkWeighting {self} not recognized.")

class VisibilityMode(enum.Enum):
    none = enum.auto()
    weight = enum.auto()
    interpolate = enum.auto()

    def creation_method_suffix(self) -> str:
        if self == VisibilityMode.none:
            return "ignorevisibility"
        if self == VisibilityMode.weight:
            return "byvisibility"
        if self == VisibilityMode.interpolate:
            return "interpolatevisibility"
        raise ValueError(f"VisibilityMode {self} not recognized.")

    def uses_weighting(self) -> bool:
        return self == VisibilityMode.weight

    def uses_interpolation(self) -> bool:
        return self == VisibilityMode.interpolate

    def uses_visibility_styling(self) -> bool:
        return self != VisibilityMode.none

def get_complexity_creationmethod_name(
    measure_weighting_choice: DvajMeasureWeighting,
    landmark_weighting_choice: PoseLandmarkWeighting,
    visibility_mode: VisibilityMode,
    include_base: bool
):
    creation_method = f"mw-{measure_weighting_choice.name}_lmw-{landmark_weighting_choice.name}_{visibility_mode.creation_method_suffix()}_{'includebase' if include_base else 'excludebase'}"
    return creation_method

def get_position_relative_to_base(positions: pd.DataFrame):
    
    axes = ["x", "y", "z"]
    axes_with_vis = axes + ["vis"]

    lhip_x, lhip_y, lhip_z, lhip_vis  = [f"{PoseLandmark.LEFT_HIP.name}_{axis}" for axis in axes_with_vis]
    rhip_x, rhip_y, rhip_z, rhip_vis = [f"{PoseLandmark.RIGHT_HIP.name}_{axis}" for axis in axes_with_vis]
    
    base_x = (positions[lhip_x] + positions[rhip_x]) / 2
    base_y = (positions[lhip_y] + positions[rhip_y]) / 2
    base_z = (positions[lhip_z] + positions[rhip_z]) / 2
    base_vis = (positions[lhip_vis] + positions[rhip_vis]) / 2

    cols = ["base_x", "base_y", "base_z", "base_vis"]
    data = [base_x, base_y, base_z, base_vis]

    for landmark in get_pose_landmarks_present_in_dataframe(positions):
        cols = cols + [f"{landmark}_x", f"{landmark}_y", f"{landmark}_z", f"{landmark}_vis"]
        data.extend([
            positions[f"{landmark}_x"] - base_x,
            positions[f"{landmark}_y"] - base_y,
            positions[f"{landmark}_z"] - base_z,
            positions[f"{landmark}_vis"]
        ])
        
    positions_relative_to_hip = pd.concat(data, keys=cols, axis=1)
    return positions_relative_to_hip

def trim_df_to_convergence(df: pd.DataFrame):
    """Trims a dataframe to the last frame where the cumulative sum changes."""
    
    # Find the first index where the cumulative sum stops changing (searching backwards).
    last_changing_frame = df.shape[0] - 1
    diff = df.diff()
    for i in range(df.shape[0] - 1, -1, -1):
        if diff.iloc[i].any():
            # The cumulative sum changed, so i is the last changing frame.
            # We can throw away every frame after i.
            last_changing_frame = i
            break

    tossed_frame_count = df.shape[0] - last_changing_frame - 1
    return df.iloc[:last_changing_frame + 1], tossed_frame_count


def stem_matches_any_pattern(relative_stem: str, patterns: t.Sequence[str]) -> bool:
    """Return whether a relative file stem matches any configured wildcard pattern."""
    return any(fnmatchcase(relative_stem, pattern) for pattern in patterns)

def normalize_accumulated_dvaj(
    dvaj_cumsum: pd.DataFrame,
    metric_normalization_maxes: t.Dict[PoseLandmark, t.Dict[DVAJ, float]],
):
    """Normalizes the accumulated dvaj by the max value of each metric-landmark
    cumulative sum across the dataset."""
    cur_frames = dvaj_cumsum.shape[0]

    for landmark in metric_normalization_maxes.keys():
        for measure in metric_normalization_maxes[landmark].keys():
            normalization_factor = cur_frames * metric_normalization_maxes[landmark][measure]
            dvaj_cumsum[f"{landmark.name}_{measure.name}"] /= normalization_factor
    
    return dvaj_cumsum

def get_metric_column_roots(columns: t.Iterable[str]) -> t.List[str]:
    """Return ordered metric roots like LEFT_WRIST or left_wrist."""
    metric_names = {measure.name for measure in DVAJ}
    roots = []
    for column_name in columns:
        if "_" not in column_name:
            continue
        root, suffix = column_name.rsplit("_", 1)
        if suffix in metric_names and root not in roots:
            roots.append(root)
    return roots

def normalize_cumulative_metric_columns(
    dvaj_cumsum: pd.DataFrame,
    metric_normalization_maxes_per_frame: pd.Series,
) -> pd.DataFrame:
    """Normalize cumulative metric columns with per-frame dataset maxima."""
    normalized = dvaj_cumsum.copy()
    cur_frames = max(dvaj_cumsum.shape[0], 1)
    for column_name in normalized.columns:
        normalization_per_frame = metric_normalization_maxes_per_frame.get(column_name, 0.0)
        normalization_factor = cur_frames * normalization_per_frame
        if normalization_factor > 0:
            normalized[column_name] /= normalization_factor
        else:
            normalized[column_name] = 0.0
    return normalized.fillna(0.0)

def expand_landmark_visibility_to_metric_columns(
    landmark_visibility: pd.DataFrame,
    metric_columns: t.Iterable[str],
) -> pd.DataFrame:
    """Repeat per-landmark visibility onto each metric column."""
    expanded = pd.DataFrame(index=landmark_visibility.index)
    for column_name in metric_columns:
        root, _ = column_name.rsplit("_", 1)
        expanded[column_name] = landmark_visibility.get(root, pd.Series(0.0, index=landmark_visibility.index))
    return expanded.fillna(0.0)

def harmonic_mean_visibility(visibility: pd.DataFrame) -> pd.Series:
    """Compute the harmonic mean while treating any non-positive value as zero visibility."""
    if visibility.shape[1] == 0:
        return pd.Series(0.0, index=visibility.index)
    positive_mask = visibility.gt(0)
    reciprocal = 1.0 / visibility.where(positive_mask)
    harmonic = visibility.shape[1] / reciprocal.sum(axis=1)
    harmonic = harmonic.where(positive_mask.all(axis=1), 0.0)
    return harmonic.fillna(0.0)

def build_grouped_visibility_series(
    visibility: pd.DataFrame,
    body_part_groups: t.Dict[str, t.Tuple[str, ...]],
) -> pd.DataFrame:
    """Construct grouped visibility using the harmonic mean across member landmarks."""
    grouped_visibility = pd.DataFrame(index=visibility.index)
    for body_part, landmarks in body_part_groups.items():
        available_landmarks = [landmark for landmark in landmarks if landmark in visibility.columns]
        if available_landmarks:
            grouped_visibility[body_part] = harmonic_mean_visibility(visibility[available_landmarks])
    return grouped_visibility.fillna(0.0)

def repair_low_visibility_cumulative_series(
    cumulative_series: pd.Series,
    visibility_series: pd.Series,
    visibility_cutoff: float = VISIBILITY_REPAIR_CUTOFF,
) -> pd.Series:
    """Replace low-visibility cumulative growth with the trusted average increment."""
    repaired_input = cumulative_series.ffill().fillna(0.0)
    aligned_visibility = visibility_series.reindex(repaired_input.index).fillna(0.0)
    increments = repaired_input.diff().fillna(repaired_input.iloc[0])
    trusted_mask = aligned_visibility > visibility_cutoff
    trusted_increment_mask = trusted_mask & trusted_mask.shift(1, fill_value=False)
    average_increment = increments[trusted_increment_mask].mean()
    if pd.isna(average_increment):
        average_increment = 0.0
    repaired_increments = increments.copy()
    low_visibility_mask = ~trusted_mask
    if len(repaired_increments) > 1:
        repaired_increments.iloc[1:] = np.where(
            low_visibility_mask.iloc[1:],
            average_increment,
            repaired_increments.iloc[1:],
        )
    repaired = repaired_increments.cumsum()
    return repaired.fillna(0.0)

def repair_cumulative_metrics_by_visibility(
    cumulative_metrics: pd.DataFrame,
    landmark_visibility: pd.DataFrame,
    visibility_cutoff: float = VISIBILITY_REPAIR_CUTOFF,
) -> pd.DataFrame:
    """Repair each cumulative metric column using its landmark visibility."""
    repaired = pd.DataFrame(index=cumulative_metrics.index)
    for column_name in cumulative_metrics.columns:
        root, _ = column_name.rsplit("_", 1)
        visibility_series = landmark_visibility.get(root, pd.Series(0.0, index=cumulative_metrics.index))
        repaired[column_name] = repair_low_visibility_cumulative_series(
            cumulative_metrics[column_name],
            visibility_series,
            visibility_cutoff=visibility_cutoff,
        )
    return repaired

def alpha_from_visibility(
    visibility: t.Union[float, np.ndarray, pd.Series],
    alpha_floor: float = VISIBILITY_PLOT_ALPHA_FLOOR,
):
    """Map visibility in [0, 1] to line alpha with a readable floor."""
    return alpha_floor + (1.0 - alpha_floor) * np.clip(visibility, 0.0, 1.0)

def plot_visibility_series(
    ax: plt.Axes,
    series: pd.Series,
    visibility: t.Optional[pd.Series] = None,
    label: t.Optional[str] = None,
    color: t.Optional[str] = None,
    linewidth: float = 1.8,
    alpha_floor: float = VISIBILITY_PLOT_ALPHA_FLOOR,
) -> str:
    """Plot a line whose per-segment alpha is driven by visibility."""
    if color is None:
        color = ax._get_lines.get_next_color()

    x = series.index.to_numpy(dtype=float)
    y = series.to_numpy(dtype=float)
    valid_mask = np.isfinite(x) & np.isfinite(y)
    if valid_mask.sum() < 2:
        ax.plot(x, y, color=color, linewidth=linewidth, label=label)
        return color

    if visibility is None:
        ax.plot(x, y, color=color, linewidth=linewidth, label=label)
        return color

    aligned_visibility = visibility.reindex(series.index).fillna(0.0).to_numpy(dtype=float)
    segment_points = np.column_stack([x, y]).reshape(-1, 1, 2)
    segments = np.concatenate([segment_points[:-1], segment_points[1:]], axis=1)
    segment_mask = valid_mask[:-1] & valid_mask[1:]
    if not np.any(segment_mask):
        ax.plot(x, y, color=color, linewidth=linewidth, label=label)
        return color

    segment_visibility = 0.5 * (aligned_visibility[:-1] + aligned_visibility[1:])
    rgba = to_rgba(color)
    colors = [
        (rgba[0], rgba[1], rgba[2], float(alpha))
        for alpha in alpha_from_visibility(segment_visibility[segment_mask], alpha_floor=alpha_floor)
    ]
    collection = LineCollection(segments[segment_mask], colors=colors, linewidths=linewidth)
    ax.add_collection(collection)
    ax.autoscale_view()
    if label is not None:
        ax.add_line(Line2D([], [], color=color, linewidth=linewidth, label=label))
    return color

def plot_visibility_dataframe(
    ax: plt.Axes,
    data: pd.DataFrame,
    visibility: t.Optional[pd.DataFrame] = None,
    title: t.Optional[str] = None,
    linewidth: float = 1.8,
    alpha_floor: float = VISIBILITY_PLOT_ALPHA_FLOOR,
):
    """Plot a dataframe with optional per-column visibility styling."""
    for column_name in data.columns:
        visibility_series = None if visibility is None or column_name not in visibility.columns else visibility[column_name]
        plot_visibility_series(
            ax,
            data[column_name],
            visibility=visibility_series,
            label=column_name,
            linewidth=linewidth,
            alpha_floor=alpha_floor,
        )
    if title is not None:
        ax.set_title(title)
    if len(data.columns) > 1:
        ax.legend()

def plot_visibility_single_series(
    ax: plt.Axes,
    series: pd.Series,
    visibility: t.Optional[pd.Series] = None,
    title: t.Optional[str] = None,
    color: t.Optional[str] = None,
    linewidth: float = 2.2,
    alpha_floor: float = VISIBILITY_PLOT_ALPHA_FLOOR,
):
    """Plot one series with optional visibility styling."""
    plot_visibility_series(ax, series, visibility=visibility, color=color, linewidth=linewidth, alpha_floor=alpha_floor)
    if title is not None:
        ax.set_title(title)

def aggregate_landmark_visibility(
    landmark_visibility: pd.DataFrame,
    landmark_weighting: t.Dict[t.Union[str, PoseLandmark], float],
) -> pd.Series:
    """Aggregate landmark visibility with the same landmark weights used for complexity."""
    weights = {}
    for column_name in landmark_visibility.columns:
        pose_landmark = PoseLandmark.__members__.get(column_name)
        weight = landmark_weighting.get(pose_landmark, landmark_weighting.get(column_name, 0.0))
        if weight > 0:
            weights[column_name] = weight
    if not weights:
        return pd.Series(0.0, index=landmark_visibility.index)
    weight_sum = sum(weights.values())
    out = pd.Series(0.0, index=landmark_visibility.index)
    for column_name, weight in weights.items():
        out = out + landmark_visibility[column_name] * (weight / weight_sum)
    return out.fillna(0.0)

def expand_series_to_measures(series: pd.Series) -> pd.DataFrame:
    """Repeat one visibility series for each DVAJ measure column."""
    return pd.DataFrame({measure.name: series for measure in DVAJ}, index=series.index)

def get_landmark_weight(
    landmark_name: str,
    landmark_weighting: t.Dict[t.Union[str, PoseLandmark], float],
) -> float:
    """Resolve one landmark/root weight from either enum or string keys."""
    pose_landmark = PoseLandmark.__members__.get(landmark_name)
    return float(landmark_weighting.get(pose_landmark, landmark_weighting.get(landmark_name, 0.0)))

def get_group_weight(
    group_name: str,
    body_part_groups: t.Dict[str, t.Tuple[str, ...]],
    landmark_weighting: t.Dict[t.Union[str, PoseLandmark], float],
) -> float:
    """Return the effective weight of a grouped body-part series."""
    return float(sum(get_landmark_weight(landmark_name, landmark_weighting) for landmark_name in body_part_groups.get(group_name, ())))

def filter_plot_columns_by_weight(
    data: pd.DataFrame,
    landmark_weighting: t.Dict[t.Union[str, PoseLandmark], float],
    visibility: t.Optional[pd.DataFrame] = None,
    body_part_groups: t.Optional[t.Dict[str, t.Tuple[str, ...]]] = None,
) -> t.Tuple[pd.DataFrame, t.Optional[pd.DataFrame]]:
    """Keep only plotted series whose effective landmark/group weight is positive."""
    kept_columns = []
    measure_names = {measure.name for measure in DVAJ}

    for column_name in data.columns:
        if column_name in measure_names:
            kept_columns.append(column_name)
            continue

        root = column_name
        if "_" in column_name:
            possible_root, possible_suffix = column_name.rsplit("_", 1)
            if possible_suffix in measure_names:
                root = possible_root

        if body_part_groups is not None and root in body_part_groups:
            if get_group_weight(root, body_part_groups, landmark_weighting) > 0:
                kept_columns.append(column_name)
            continue

        if get_landmark_weight(root, landmark_weighting) > 0:
            kept_columns.append(column_name)

    filtered_data = data.loc[:, kept_columns].copy()
    filtered_visibility = None if visibility is None else visibility.loc[:, [column_name for column_name in kept_columns if column_name in visibility.columns]].copy()
    return filtered_data, filtered_visibility

def choose_legacy_example_body_part(
    preferred_body_part: str,
    body_part_groups: t.Dict[str, t.Tuple[str, ...]],
    landmark_weighting: t.Dict[t.Union[str, PoseLandmark], float],
) -> t.Optional[str]:
    """Choose the requested grouped example body part, or the first positive-weight fallback."""
    if get_group_weight(preferred_body_part, body_part_groups, landmark_weighting) > 0:
        return preferred_body_part
    for body_part in body_part_groups.keys():
        if get_group_weight(body_part, body_part_groups, landmark_weighting) > 0:
            return body_part
    return None

def resolve_bodyparts_for_artifact_plotting(
    requested_body_parts: t.Sequence[str],
    body_part_groups: t.Dict[str, t.Tuple[str, ...]],
    landmark_weighting: t.Dict[t.Union[str, PoseLandmark], float],
) -> t.List[str]:
    """Resolve requested body parts to positive-weight grouped body parts without duplicates."""
    resolved_body_parts: t.List[str] = []
    for requested_body_part in requested_body_parts:
        chosen_body_part = choose_legacy_example_body_part(
            requested_body_part,
            body_part_groups,
            landmark_weighting,
        )
        if chosen_body_part is not None and chosen_body_part not in resolved_body_parts:
            resolved_body_parts.append(chosen_body_part)
    return resolved_body_parts

def maybe_visibility_df(
    visibility: t.Optional[pd.DataFrame],
    enabled: bool,
) -> t.Optional[pd.DataFrame]:
    """Return visibility data only when visibility-driven styling is enabled."""
    return visibility if enabled else None

def maybe_visibility_series(
    visibility: t.Optional[pd.Series],
    enabled: bool,
) -> t.Optional[pd.Series]:
    """Return visibility series only when visibility-driven styling is enabled."""
    return visibility if enabled else None

def get_available_legacy_body_part_groups(columns: t.Iterable[str]) -> t.Dict[str, t.Tuple[str, ...]]:
    """Return legacy grouped body-part definitions restricted to available columns."""
    column_set = set(columns)
    groups: t.Dict[str, t.Tuple[str, ...]] = {}
    for body_part, landmarks in LEGACY_GROUPED_BODY_PARTS.items():
        available_landmarks = tuple(
            landmark for landmark in landmarks
            if any(f"{landmark}_{measure.name}" in column_set for measure in DVAJ)
        )
        if available_landmarks:
            groups[body_part] = available_landmarks
    return groups

def build_legacy_body_part_metric_series(
    dvaj: pd.DataFrame,
    body_part_groups: t.Optional[t.Dict[str, t.Tuple[str, ...]]] = None,
) -> pd.DataFrame:
    """Average metric series into the legacy grouped body-part views."""
    groups = body_part_groups or get_available_legacy_body_part_groups(dvaj.columns)
    grouped = pd.DataFrame(index=dvaj.index)
    for body_part, landmarks in groups.items():
        for measure in DVAJ:
            columns = [
                f"{landmark}_{measure.name}"
                for landmark in landmarks
                if f"{landmark}_{measure.name}" in dvaj.columns
            ]
            if columns:
                grouped[f"{body_part}_{measure.name}"] = dvaj[columns].mean(axis=1)
    return grouped

def calculate_metric_normalization_maxes_per_frame(
    dvaj_cumsum_dfs: t.Sequence[pd.DataFrame],
) -> pd.Series:
    """Compute per-column normalization denominators using cumulative-max-per-frame."""
    if len(dvaj_cumsum_dfs) == 0:
        return pd.Series(dtype=float)
    return pd.DataFrame(
        {
            column_name: [
                dvaj_cumsum[column_name].max() / max(dvaj_cumsum.shape[0], 1)
                for dvaj_cumsum in dvaj_cumsum_dfs
                if column_name in dvaj_cumsum.columns
            ]
            for column_name in dvaj_cumsum_dfs[0].columns
        }
    ).max()

def normalize_grouped_cumulative_metrics(
    grouped_cumsum: pd.DataFrame,
    metric_normalization_maxes_per_frame: pd.Series,
) -> pd.DataFrame:
    """Normalize grouped cumulative metrics using dataset-level per-frame maxima."""
    normalized = grouped_cumsum.copy()
    cur_frames = max(grouped_cumsum.shape[0], 1)
    for column_name in normalized.columns:
        normalization_per_frame = metric_normalization_maxes_per_frame.get(column_name, 0.0)
        normalization_factor = cur_frames * normalization_per_frame
        if normalization_factor > 0:
            normalized[column_name] /= normalization_factor
        else:
            normalized[column_name] = 0.0
    return normalized

def calculate_legacy_body_part_complexities(
    normalized_grouped_cumsum: pd.DataFrame,
    measure_weighting: t.Dict[DVAJ, float],
) -> pd.DataFrame:
    """Combine normalized grouped metrics into one cumulative series per body part."""
    body_parts = sorted({column_name.rsplit("_", 1)[0] for column_name in normalized_grouped_cumsum.columns})
    body_part_complexities = pd.DataFrame(index=normalized_grouped_cumsum.index)
    for body_part in body_parts:
        series = pd.Series(0.0, index=normalized_grouped_cumsum.index)
        for measure in DVAJ:
            column_name = f"{body_part}_{measure.name}"
            if column_name in normalized_grouped_cumsum.columns:
                series = series + normalized_grouped_cumsum[column_name] * measure_weighting[measure]
        body_part_complexities[body_part] = series
    return body_part_complexities

def compute_naive_segment_boundaries(
    accumulated_complexity: pd.Series,
    target_complexity_per_segment: float,
) -> pd.DataFrame:
    """Find the first frame at which each target complexity threshold is reached."""
    if target_complexity_per_segment <= 0:
        raise ValueError("target_complexity_per_segment must be positive")
    if accumulated_complexity.empty:
        return pd.DataFrame(columns=["threshold_index", "target_complexity", "frame"])

    max_complexity = float(accumulated_complexity.iloc[-1])
    threshold_count = int(np.floor(max_complexity / target_complexity_per_segment))
    threshold_indices = np.arange(1, threshold_count + 1, dtype=int)
    if len(threshold_indices) == 0:
        return pd.DataFrame(columns=["threshold_index", "target_complexity", "frame"])

    target_complexities = threshold_indices * target_complexity_per_segment
    frame_values = accumulated_complexity.to_numpy(dtype=float)
    insertion_indices = np.searchsorted(frame_values, target_complexities, side="left")
    insertion_indices = np.clip(insertion_indices, 0, len(accumulated_complexity.index) - 1)
    frames = accumulated_complexity.index.to_numpy()[insertion_indices]

    return pd.DataFrame(
        {
            "threshold_index": threshold_indices,
            "target_complexity": target_complexities,
            "frame": frames,
        }
    )

def snap_boundaries_to_beats(
    boundary_frames: t.Sequence[float],
    beat_frames: t.Sequence[float],
) -> np.ndarray:
    """Snap boundaries to the nearest beat frame."""
    beat_array = np.asarray(list(beat_frames), dtype=float)
    if beat_array.size == 0:
        return np.asarray([], dtype=float)
    snapped_frames = []
    for boundary_frame in boundary_frames:
        beat_index = int(np.argmin(np.abs(beat_array - boundary_frame)))
        snapped_frames.append(beat_array[beat_index])
    return np.asarray(snapped_frames, dtype=float)

def discover_audio_analysis_dir(destdir: Path) -> t.Optional[Path]:
    """Try to locate a sibling audio-analysis results directory for beat-aware diagnostics."""
    candidates = [
        destdir.parent / "audio_analysis" / "analysis" / "video",
        destdir / "audio_analysis" / "analysis" / "video",
        destdir.parent.parent / "audio_analysis" / "analysis" / "video",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None

def load_audio_analysis_beats(
    audio_analysis_dir: t.Optional[Path],
    relative_filename_stem: str,
) -> t.Optional[t.List[float]]:
    """Load beat times in seconds from an audio-analysis JSON result when available."""
    if audio_analysis_dir is None:
        return None
    analysis_path = audio_analysis_dir / Path(relative_filename_stem).with_suffix(".json")
    if not analysis_path.exists():
        return None
    try:
        analysis_data = json.loads(analysis_path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    tempo_info = analysis_data.get("tempo_info", {})
    beats = tempo_info.get("all_beats")
    if not isinstance(beats, list):
        return None
    return [float(beat) for beat in beats]

def add_segment_target_lines(ax: plt.Axes, overall_complexity: pd.Series, target_complexity_per_segment: float):
    """Draw evenly spaced horizontal target-complexity lines."""
    max_complexity = float(overall_complexity.iloc[-1]) if not overall_complexity.empty else 0.0
    target_count = int(np.floor(max_complexity / target_complexity_per_segment))
    for threshold_index in range(0, target_count + 1):
        ax.axhline(threshold_index * target_complexity_per_segment, color="orange", alpha=0.35)

def aggregate_accumulated_dvaj_by_measure(
    dvaj_cumsum: pd.DataFrame, 
    measure_weighting: t.Dict[DVAJ, float] = {}, 
    landmark_weighting: t.Dict[t.Union[str, PoseLandmark], float] = {},
):
    landmark_names = get_metric_column_roots(dvaj_cumsum.columns)

    weighted_accumulated_dvaj_by_measure = pd.DataFrame()

    for measure in DVAJ:
        weighted_dvaj_by_landmark = pd.DataFrame()
        for landmark in landmark_names:
            pose_landmark = PoseLandmark.__members__.get(landmark)
            landmark_weight = landmark_weighting.get(pose_landmark, landmark_weighting.get(landmark, 1.0))
            weighted_dvaj_by_landmark[f"{landmark}_{measure.name}"] = dvaj_cumsum[f"{landmark}_{measure.name}"] * landmark_weight

        weighted_accumulated_dvaj_by_measure[f"{measure.name}"] = weighted_dvaj_by_landmark[[f"{landmark}_{measure.name}" for landmark in landmark_names]].sum(axis=1)
        weighted_accumulated_dvaj_by_measure[f"{measure.name}"] *= measure_weighting[measure]

    return weighted_accumulated_dvaj_by_measure

def construct_dance_tree_from_complexity_measures(
        title: str, 
        complexity_measures: pd.DataFrame,
    ):
    
    # complexity_measures.plot(
        # title=f"{title} Accumulated Complexity",
    # )
    # plt.show(block=True)

    return {}

def get_visibility(data: pd.DataFrame, joint_names: t.List[str]):
    """Returns a dataframe with the visibility of each landmark."""
    vis_col_names = [joint_name + "_vis" for joint_name in joint_names]
    visibility_df = data[vis_col_names]
    # remove _viz from col names
    visibility_df.columns = [col_name[:-4] for col_name in visibility_df.columns]

    # replace any NaN with zero
    visibility_df = visibility_df.fillna(0)

    return visibility_df

def weigh_by_visiblity(data: pd.DataFrame, data_vis: pd.DataFrame, col_roots: t.List[str], col_suffixes: t.List[str]):
    """Weighs the data by visibility."""
    weighted_data = pd.DataFrame()

    # Get total visibilty of landmarks for each frame.
    visibility = data_vis[col_roots].sum(axis=1)

    for col_root in col_roots:
        for col_suffix in col_suffixes:
            col_name = f"{col_root}_{col_suffix}"
            weighted_data[col_name] = data[col_name] * data_vis[col_root] / visibility

    return weighted_data

def generate_dvajs_with_visibility(
    filepaths: t.Iterable[Path],
    landmark_names: t.List[str],
    include_base: bool = True,
):
    for holistic_csv_file in filepaths:
        # warn if the file does not use a recognized holistic data suffix
        if not holistic_csv_file.name.endswith((_HOLISTIC_DATA_LEGACY_SUFFIX, _HOLISTIC_DATA_RAW_SUFFIX)):
            print(
                f"WARNING: {holistic_csv_file} is not a recognized holistic data CSV.",
                file=sys.stderr,
            )
            continue
        data = pd.read_csv(holistic_csv_file, index_col='frame')
        relative_position = get_position_relative_to_base(data)
        
        dvaj = calc_scalar_dvaj(relative_position, landmark_names)
        # distance_cols = [col for col in dvaj.columns if "distance" in col]
        # dvaj[distance_cols].plot(title=f"{holistic_csv_file.name} Distance")

        visibility = get_visibility(relative_position, landmark_names)
        yield dvaj, visibility

def calculate_cumulative_complexities(
        srcdir: t.Optional[Path],
        other_files: t.List[Path],
        destdir: Path,
        measure_weighting: DvajMeasureWeighting,
        landmark_weighting: PoseLandmarkWeighting,
        database_csv_path: t.Optional[Path] = None,
        artifact_archive_root: t.Optional[Path] = None,
        artifact_output_dir: t.Optional[Path] = None,
        plot_whitelist: t.Optional[t.Sequence[str]] = None,
        include_base: bool = False,
        visibility_mode: VisibilityMode = VisibilityMode.weight,
        visibility_repair_cutoff: float = VISIBILITY_REPAIR_CUTOFF,
        visibility_plot_alpha_floor: float = VISIBILITY_PLOT_ALPHA_FLOOR,
        target_complexity_per_segment: float = 10.0,
        bodyparts_for_artifact_plotting: t.Sequence[str] = DEFAULT_BODYPARTS_FOR_ARTIFACT_PLOTTING,
        print_prefix: t.Callable[[], str] = lambda: "",
        skip_existing: bool = False,
):
    """Generate cumulative complexity outputs for one batch of pose CSV inputs.

    Inputs are collected from `other_files` plus any `*.holisticdata.csv` and
    `*.holisticdata.raw.csv` files under `srcdir`. Results are written under `destdir`, with one complexity CSV
    per input file and an aggregate `dvaj_complexity.csv` summary for the whole
    batch. The selected weighting options are encoded into the output column
    name so multiple calculation variants can coexist in the same destination.
    When artifact output is enabled, intermediate diagnostic CSVs and plots are
    also written under the artifact directory in a subdirectory for the
    selected weighting configuration. `plot_whitelist`, when provided, filters
    plots by relative input stem while leaving the underlying complexity
    calculation and CSV outputs unchanged.
    """
    artifact_dir = resolve_artifact_output_dir(
        artifact_archive_root=artifact_archive_root,
        artifact_output_dir=artifact_output_dir,
        default_label="cumulative-complexity",
    )
    input_files: t.List[Path] = other_files.copy()
    relative_dirs: t.List[Path] = [f.parent for f in other_files]

    # if srcdir is specified, add all files of the form "*.holisticdata{,.raw}.csv" in that directory to the list of files.
    files_from_srcdir = []
    if srcdir is not None:
        files_from_srcdir = _collect_holistic_data_files(srcdir)
        input_files.extend(files_from_srcdir)
        relative_dirs.extend([srcdir for _ in files_from_srcdir])
    elif len(input_files) == 0:
        print(f"{print_prefix()}No files specified. Use --srcdir or specify files as arguments.")
        sys.exit(1)
    
    print(f"{print_prefix()}Input: {len(input_files)} files", end='')
    if srcdir is not None:
        print(f", {len(files_from_srcdir)} from {srcdir}.")
    else:
        print('.')
      
    print(f"{print_prefix()}Output: saving complexity outputs to {destdir}.")
    destdir.mkdir(parents=True, exist_ok=True)
    if artifact_dir is not None:
        print(f"{print_prefix()}Artifacts: writing plots and debug CSVs to {artifact_dir}.")

    measure_weighting_choice = measure_weighting
    measure_weighting_weights = measure_weighting_choice.get_weighting()
    landmark_weighting_choice = landmark_weighting
    landmark_weighting_weights = landmark_weighting_choice.get_weighting(include_base=include_base)
    complexity_calculation_parameters_string = get_complexity_creationmethod_name(
        measure_weighting_choice,
        landmark_weighting_choice,
        visibility_mode,
        include_base,
    )

    filename_stems = [_clip_stem_from_holistic_csv_path(file) for file in input_files]
    relative_filename_stems = [
        str(file.relative_to(relative_dir).parent / _clip_stem_from_holistic_csv_path(file))
        for file, relative_dir 
        in zip(input_files, relative_dirs)
    ]
    figure_display_titles = [
        resolve_artifact_clip_title(
            relative_filename_stem,
            database_csv_path=database_csv_path,
            fallback_title=filename_stem,
        )
        for relative_filename_stem, filename_stem in zip(relative_filename_stems, filename_stems)
    ]
    db = load_db(database_csv_path) if database_csv_path is not None else None
    fps_by_relative_stem = {
        relative_filename_stem: float(db.loc[relative_filename_stem]["fps"])
        for relative_filename_stem in relative_filename_stems
        if db is not None and relative_filename_stem in db.index
    }
    audio_analysis_dir = discover_audio_analysis_dir(destdir)
    plot_whitelist_patterns = list(plot_whitelist or [])
    plot_file_indices = [
        i for i, relative_filename_stem in enumerate(relative_filename_stems)
        if not plot_whitelist_patterns or stem_matches_any_pattern(relative_filename_stem, plot_whitelist_patterns)
    ]
    if artifact_dir is not None and plot_whitelist_patterns:
        print(
            f"{print_prefix()}Artifacts: plotting {len(plot_file_indices)}/{len(input_files)} files "
            f"matching plot whitelist {plot_whitelist_patterns}."
        )
        if len(plot_file_indices) == 0:
            print(f"{print_prefix()}Artifacts: no files matched the plot whitelist; plot generation will be skipped.")
    complexity_csv_output_paths = [
        (destdir / 'byfile' / relative_filename_stem).with_suffix(".complexity.csv")
        for relative_filename_stem in relative_filename_stems
    ]
    can_skip_complexity_calculation = False
    if skip_existing:
        print(f"{print_prefix()} Checking for existing complexity calculations...")
        can_skip_complexity_calculation = np.all([
            complexity_csv_output_path.exists() and
            complexity_calculation_parameters_string in pd.read_csv((complexity_csv_output_path), nrows=2, index_col=0).columns
            for complexity_csv_output_path in complexity_csv_output_paths
        ]) 
        if can_skip_complexity_calculation:
            print(f"{print_prefix()} Skipping complexity calculation because an existing complexity calculation using this parameters has been found for all input files.")
            return

    sup_title = complexity_calculation_parameters_string
    should_output_diagnostics = artifact_dir is not None

    debug_dir = artifact_dir / sup_title if artifact_dir is not None else None
    if debug_dir is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)
    count_by_subpath = {}
    debug_file_count = 0
    def make_debug_path(name: str, subpath: str = "") -> Path:
        if debug_dir is None:
            raise RuntimeError("Diagnostic output requested without a configured diagnostic directory.")
        nonlocal debug_file_count
        debug_file_count += 1
        count_by_subpath[subpath] = count_by_subpath.get(subpath, 0) + 1
        dirpath = debug_dir
        prefix = f"{debug_file_count:04}"
        if len(subpath) > 0:
            dirpath = dirpath / subpath
            # prefix = f"{prefix}_subid{count_by_subpath[subpath]:04}"
        dirpath.mkdir(parents=True, exist_ok=True)
        subpath_stem = Path(subpath).stem
        final_path = dirpath / f"{prefix}_{subpath_stem}_{name}"
        return final_path
    
    def save_debug_fig(name: str, fn: t.Callable[[plt.Axes], t.Union[t.Any, None]], subpath: str = "", subtitle: t.Optional[str] = sup_title):
        fig, ax = plt.subplots()
        fig.set_size_inches(7.5, 5.0)

        fn(ax)
        # plt.legend(bbox_to_anchor=(1.05, 1.0), loc='upper left')

        # # max_legend_entries = 10
        # # legend = plt.gca().get_legend()
        # # if legend is not None:
        # #     if len(legend.texts) > max_legend_entries:
        # #         legend.texts[max_legend_entries - 1].set_text('...')
        # #     for text in legend.tests[max_legend_entries:]: # remove extra legend entries
        # #         text.set_visible(False)
        
        # plt.tight_layout()

        if subtitle is not None:
            plt.suptitle(subtitle, fontsize=8, y=0.99)

        save_path = make_debug_path(name, subpath)
        fig.savefig(str(save_path))
        plt.close(fig)

    skipped_plot_messages: t.List[str] = []

    landmarks = [
        lm for lm in landmark_weighting_weights.keys()
        if landmark_weighting_weights.get(lm, 0) > 0
    ]

    landmark_names = [*landmarks]
    
    landmark_names = [
        (landmark.name if isinstance(landmark, PoseLandmark) else landmark)  # type: ignore
        for landmark in landmarks
    ]

    print(f"{print_prefix()}Using measure weighting: {measure_weighting_choice.name}")
    print(f"{print_prefix()}Using landmark weighting: {landmark_weighting_choice.name}")
    print(f"{print_prefix()}Including base landmark: {'yes' if include_base else 'no'}")
    print(f"{print_prefix()}Visibility mode: {visibility_mode.name}")
    print(f"{print_prefix()}Visibility repair cutoff: {visibility_repair_cutoff}")
    print(f"{print_prefix()}Visibility plot alpha floor: {visibility_plot_alpha_floor}")
    print(f"{print_prefix()}Legacy diagnostic target complexity per segment: {target_complexity_per_segment}")
    print(f"{print_prefix()}Artifact plotting body parts: {list(bodyparts_for_artifact_plotting)}")

    use_visibility_weighting = visibility_mode.uses_weighting()
    use_visibility_repair = visibility_mode.uses_interpolation()
    use_visibility_plot_styling = visibility_mode.uses_visibility_styling()

    # print("Preprocessing files...")

    start_time = time.time()

    def print_with_time(msg: str, **kwargs):
        print(f"{print_prefix()}[{time.time() - start_time: 6.2f}s]\t{msg} ", **kwargs)
    
    ##### Preprocess Steps:
    # 1. Calculate the dvaj by-frame for each file.
    # 2. Weigh by visibility (joint-by-joint)
    # 3. Convert to cumulative sum (accumulated complexity).
    # 4. Trim trailing frames beyond which cumulative sum doesn't change.
    # 5. Calculate normalization denominators for each metric, on a per-frame basis.
    print_with_time("Step 1: Calculating DVAJs...")
    dvaj_dfs, visibility_dfs = zip(*tqdm(generate_dvajs_with_visibility(input_files, landmark_names, include_base=include_base), total=len(input_files)))
    dvaj_dfs = list(dvaj_dfs)
    visibility_dfs = [visibility_df.fillna(0.0) for visibility_df in visibility_dfs]
    metric_visibility_dfs = [
        expand_landmark_visibility_to_metric_columns(visibility_dfs[i], dvaj_dfs[i].columns)
        for i in range(len(dvaj_dfs))
    ]
    plot_ready_dvaj_dfs_and_visibility = [
        filter_plot_columns_by_weight(
            dvaj_dfs[i],
            landmark_weighting_weights,
            visibility=maybe_visibility_df(metric_visibility_dfs[i], use_visibility_plot_styling),
        )
        for i in range(len(dvaj_dfs))
    ]
    
    if should_output_diagnostics:
        print_with_time("\tPlotting raw DVAJs...")
        for i in tqdm(plot_file_indices):
            plot_df, plot_visibility_df = plot_ready_dvaj_dfs_and_visibility[i]
            if plot_df.empty:
                skipped_plot_messages.append(f"{relative_filename_stems[i]}: skipped `generated_dvaj.png` because no positive-weight landmark series remained.")
                continue
            save_debug_fig(
                "generated_dvaj.png",
                lambda ax, plot_df=plot_df, plot_visibility_df=plot_visibility_df, i=i: plot_visibility_dataframe(
                    ax,
                    plot_df,
                    visibility=plot_visibility_df,
                    title=figure_display_titles[i],
                    linewidth=1.8,
                    alpha_floor=visibility_plot_alpha_floor,
                ),
                subpath=relative_filename_stems[i],
            )

    if use_visibility_weighting:
        dvaj_suffixes = [measure.name for measure in DVAJ]
        print_with_time("Step 2: Weighting by visibility...")
        dvaj_dfs = [weigh_by_visiblity(dvaj, visibility, landmark_names, dvaj_suffixes) for dvaj, visibility in tqdm(zip(dvaj_dfs, visibility_dfs), total=len(dvaj_dfs))]
        plot_ready_dvaj_dfs_and_visibility = [
            filter_plot_columns_by_weight(
                dvaj_dfs[i],
                landmark_weighting_weights,
                visibility=maybe_visibility_df(metric_visibility_dfs[i], use_visibility_plot_styling),
            )
            for i in range(len(dvaj_dfs))
        ]

        if should_output_diagnostics:
            print_with_time("\tPlotting visibility-weighted DVAJs...")
            for i in tqdm(plot_file_indices):
                plot_df, plot_visibility_df = plot_ready_dvaj_dfs_and_visibility[i]
                if plot_df.empty:
                    skipped_plot_messages.append(f"{relative_filename_stems[i]}: skipped `visweighted_dvaj.png` because no positive-weight landmark series remained.")
                    continue
                save_debug_fig(
                    "visweighted_dvaj.png",
                    lambda ax, plot_df=plot_df, plot_visibility_df=plot_visibility_df, i=i: plot_visibility_dataframe(
                        ax,
                        plot_df,
                        visibility=plot_visibility_df,
                        title=figure_display_titles[i],
                        linewidth=1.8,
                        alpha_floor=visibility_plot_alpha_floor,
                    ),
                    subpath=relative_filename_stems[i],
                )
    else:
        print_with_time("Step 2: Skipped (not weighting by visibility) ...")

    print_with_time("Step 3: Converting to cumulative sum...")
    dvaj_cumsum_dfs = [dvaj.cumsum() for dvaj in dvaj_dfs]
    # For any NaNs, fill with the last valid value (NaNs will appear when skeleton isn't tracked)
    dvaj_cumsum_dfs = [dvaj_cumsum.ffill().fillna(0.0) for dvaj_cumsum in dvaj_cumsum_dfs]
    plot_ready_cumsum_dfs_and_visibility = [
        filter_plot_columns_by_weight(
            dvaj_cumsum_dfs[i],
            landmark_weighting_weights,
            visibility=maybe_visibility_df(metric_visibility_dfs[i], use_visibility_plot_styling),
        )
        for i in range(len(dvaj_cumsum_dfs))
    ]
    if should_output_diagnostics:
        print_with_time("\tPlotting cumulative DVAJs...")
        for i in tqdm(plot_file_indices):
            plot_df, plot_visibility_df = plot_ready_cumsum_dfs_and_visibility[i]
            if plot_df.empty:
                skipped_plot_messages.append(f"{relative_filename_stems[i]}: skipped `cumsum_dvaj.png` because no positive-weight landmark series remained.")
                continue
            save_debug_fig(
                "cumsum_dvaj.png",
                lambda ax, plot_df=plot_df, plot_visibility_df=plot_visibility_df, i=i: plot_visibility_dataframe(
                    ax,
                    plot_df,
                    visibility=plot_visibility_df,
                    title=figure_display_titles[i],
                    linewidth=1.8,
                    alpha_floor=visibility_plot_alpha_floor,
                ),
                subpath=relative_filename_stems[i],
            )
    print_with_time("Step 4: Trimming trailing frames...")
    dvaj_cumsum_dfs, tossed_frames = t.cast(t.Tuple[t.List[pd.DataFrame], t.List[int]] , zip(*[
        trim_df_to_convergence(dvaj_cumsum) for dvaj_cumsum in dvaj_cumsum_dfs
    ]))
    nontossed_frame_counts = [df.shape[0] for df in dvaj_cumsum_dfs]
    trimmed_dvaj_dfs = [
        dvaj.iloc[:nontossed_frame_counts[i]].copy()
        for i, dvaj in enumerate(dvaj_dfs)
    ]
    trimmed_visibility_dfs = [
        visibility_dfs[i].iloc[:nontossed_frame_counts[i]].copy()
        for i in range(len(visibility_dfs))
    ]
    trimmed_metric_visibility_dfs = [
        metric_visibility_dfs[i].iloc[:nontossed_frame_counts[i]].copy()
        for i in range(len(metric_visibility_dfs))
    ]
    # pd.DataFrame({
        # "trimmed_frames": [dvaj_cumsum.shape[0] for dvaj_cumsum in dvaj_cumsum_dfs],
        # "tossed_frames": tossed_frames,
        # }, index=filename_stems).to_csv(make_debug_path("tossed_frames.csv"))
    
    if should_output_diagnostics:
        for measure in DVAJ:
            print_with_time(f"\tPlotting trimmed {measure.name}...")
            for i in tqdm(plot_file_indices):
                df = dvaj_cumsum_dfs[i]
                measure_cols = [col for col in df.columns if measure.name in col]
                plot_df, plot_visibility_df = filter_plot_columns_by_weight(
                    dvaj_cumsum_dfs[i][measure_cols],
                    landmark_weighting_weights,
                    visibility=maybe_visibility_df(trimmed_metric_visibility_dfs[i][measure_cols], use_visibility_plot_styling),
                )
                if plot_df.empty:
                    skipped_plot_messages.append(f"{relative_filename_stems[i]}: skipped `trimmed_dvaj_{measure.name}.png` because no positive-weight landmark series remained.")
                    continue
                save_debug_fig(
                    f"trimmed_dvaj_{measure.name}.png",
                    lambda ax, plot_df=plot_df, plot_visibility_df=plot_visibility_df, i=i: plot_visibility_dataframe(
                        ax,
                        plot_df,
                        visibility=plot_visibility_df,
                        title=figure_display_titles[i],
                        linewidth=1.8,
                        alpha_floor=visibility_plot_alpha_floor,
                    ),
                    subpath=relative_filename_stems[i],
                )

    legacy_body_part_groups = get_available_legacy_body_part_groups(trimmed_dvaj_dfs[0].columns) if len(trimmed_dvaj_dfs) > 0 else {}

    grouped_dvaj_dfs = [
        build_legacy_body_part_metric_series(trimmed_dvaj_dfs[i], legacy_body_part_groups)
        for i in range(len(trimmed_dvaj_dfs))
    ]
    grouped_visibility_dfs = [
        build_grouped_visibility_series(trimmed_visibility_dfs[i], legacy_body_part_groups)
        for i in range(len(trimmed_visibility_dfs))
    ]
    del dvaj_dfs
    grouped_cumsum_dfs = [
        build_legacy_body_part_metric_series(dvaj_cumsum_dfs[i], legacy_body_part_groups)
        for i in range(len(dvaj_cumsum_dfs))
    ]
    grouped_metric_visibility_dfs = [
        expand_landmark_visibility_to_metric_columns(grouped_visibility_dfs[i], grouped_cumsum_dfs[i].columns)
        for i in range(len(grouped_cumsum_dfs))
    ]
    grouped_metric_maxes_per_frame = calculate_metric_normalization_maxes_per_frame(grouped_cumsum_dfs)
    grouped_maxes_per_frame_df = pd.DataFrame(
        {
            column_name: [
                grouped_cumsum[column_name].max() / max(grouped_cumsum.shape[0], 1)
                for grouped_cumsum in grouped_cumsum_dfs
            ]
            for column_name in grouped_cumsum_dfs[0].columns
        },
        index=filename_stems,
    ) if len(grouped_cumsum_dfs) > 0 and len(grouped_cumsum_dfs[0].columns) > 0 else pd.DataFrame()
    grouped_normalized_cumsum_original_dfs = [
        normalize_grouped_cumulative_metrics(grouped_cumsum_dfs[i], grouped_metric_maxes_per_frame)
        for i in range(len(grouped_cumsum_dfs))
    ]
    grouped_normalized_cumsum_dfs = [
        repair_cumulative_metrics_by_visibility(
            grouped_normalized_cumsum_original_dfs[i],
            grouped_visibility_dfs[i],
            visibility_cutoff=visibility_repair_cutoff,
        ) if use_visibility_repair else grouped_normalized_cumsum_original_dfs[i].copy()
        for i in range(len(grouped_normalized_cumsum_original_dfs))
    ]
    legacy_body_part_complexities = [
        calculate_legacy_body_part_complexities(grouped_normalized_cumsum_dfs[i], measure_weighting_weights)
        for i in range(len(grouped_normalized_cumsum_dfs))
    ]
    legacy_body_part_visibility_dfs = grouped_visibility_dfs
    legacy_overall_visibility = [
        grouped_visibility_dfs[i].mean(axis=1).fillna(0.0) if len(grouped_visibility_dfs[i].columns) > 0 else pd.Series(0.0, index=grouped_visibility_dfs[i].index)
        for i in range(len(grouped_visibility_dfs))
    ]
    if not use_visibility_plot_styling:
        grouped_metric_visibility_dfs = [None for _ in grouped_metric_visibility_dfs]
        legacy_body_part_visibility_dfs = [None for _ in legacy_body_part_visibility_dfs]
        legacy_overall_visibility = [None for _ in legacy_overall_visibility]
    legacy_overall_complexities = [
        legacy_body_part_complexities[i].sum(axis=1)
        for i in range(len(legacy_body_part_complexities))
    ]
    for i in range(len(legacy_overall_complexities)):
        legacy_overall_complexities[i].name = filename_stems[i]
        legacy_overall_complexities[i].ffill(inplace=True)

    # Step 5.
    # Computes the normalization denominators for each metric, on a per-frame basis.
    #   - Doing this by frame is necessary because the number of frames in each file may differ,
    #     and we want to normalize each metric in a consistent, duration-independant way.
    print_with_time("Step 5: Calculating normalization denominators...")
    maxes_per_frame = pd.DataFrame({
        f"{landmark_name}_{measure.name}": [
            dvaj_cumsum[f"{landmark_name}_{measure.name}"].max() / dvaj_cumsum.shape[0]
            for dvaj_cumsum in dvaj_cumsum_dfs
        ]
        for landmark_name in landmark_names
        for measure in DVAJ
    },  index=filename_stems)
    # Can lookup the normalization denominator for a given metric with:
    #   max_vals.loc[f"{landmark_name}_{measure.name}"].
    max_vals = maxes_per_frame.max()
    max_vals_and_src = pd.concat([max_vals, maxes_per_frame.idxmax()], keys=["max", "src"], axis=1)
    normalized_dvaj_cumsum_original_dfs = [
        normalize_cumulative_metric_columns(dvaj_cumsum_dfs[i], max_vals)
        for i in range(len(dvaj_cumsum_dfs))
    ]
    repaired_normalized_dvaj_cumsum_dfs = [
        repair_cumulative_metrics_by_visibility(
            normalized_dvaj_cumsum_original_dfs[i],
            trimmed_visibility_dfs[i],
            visibility_cutoff=visibility_repair_cutoff,
        ) if use_visibility_repair else normalized_dvaj_cumsum_original_dfs[i].copy()
        for i in range(len(normalized_dvaj_cumsum_original_dfs))
    ]
    if should_output_diagnostics:
        maxes_per_frame.to_csv(make_debug_path("movement_per_frame.csv"))
        max_vals_and_src.to_csv(make_debug_path("max_vals.csv"))
        if not grouped_metric_maxes_per_frame.empty and not grouped_maxes_per_frame_df.empty:
            grouped_max_vals_and_src = pd.concat(
                [
                    grouped_metric_maxes_per_frame,
                    grouped_maxes_per_frame_df.idxmax()
                ],
                keys=["max", "src"],
                axis=1,
            )
            grouped_max_vals_and_src.to_csv(make_debug_path("legacy_grouped_max_vals.csv"))

    # Step 6 & 7.
    # 6. Normalize each metric by its max among the dataset, adjusted
    #      by the length of the dataframe.
    # 7. Aggregate the normalized metrics into a single complexity measure.
    print_with_time("Step 6 & 7: Normalizing & Aggregating metrics...")
    complexity_measures = [
        aggregate_accumulated_dvaj_by_measure(
            repaired_normalized_dvaj_cumsum_dfs[i],
            measure_weighting=measure_weighting_weights,
            landmark_weighting=landmark_weighting_weights,
        )
        for i in range(len(repaired_normalized_dvaj_cumsum_dfs))
    ]
    measure_visibility_dfs = [
        expand_series_to_measures(aggregate_landmark_visibility(trimmed_visibility_dfs[i], landmark_weighting_weights))
        for i in range(len(trimmed_visibility_dfs))
    ]
    overall_visibility = [
        aggregate_landmark_visibility(trimmed_visibility_dfs[i], landmark_weighting_weights)
        for i in range(len(trimmed_visibility_dfs))
    ]
    if not use_visibility_plot_styling:
        measure_visibility_dfs = [None for _ in measure_visibility_dfs]
        overall_visibility = [None for _ in overall_visibility]
    overall_complexities = [
        complexity_measures[i].sum(axis=1)
        for i in range(len(complexity_measures))
    ]
    for i in range(len(overall_complexities)):
        overall_complexities[i].name = filename_stems[i]
        overall_complexities[i].ffill(inplace=True)

    del dvaj_cumsum_dfs
    if should_output_diagnostics:
        print_with_time("\tPlotting complexity measures...")
        for i in tqdm(plot_file_indices):
            save_debug_fig(
                f"complexity_measures.png",
                lambda ax, i=i: plot_visibility_dataframe(
                    ax,
                    complexity_measures[i],
                    visibility=measure_visibility_dfs[i],
                    title=figure_display_titles[i],
                    alpha_floor=visibility_plot_alpha_floor,
                ),
                subpath=relative_filename_stems[i],
            )
            save_debug_fig(
                f"overall_complexity.png",
                lambda ax, i=i: plot_visibility_single_series(
                    ax,
                    overall_complexities[i],
                    visibility=overall_visibility[i],
                    title=figure_display_titles[i],
                    alpha_floor=visibility_plot_alpha_floor,
                ),
                subpath=relative_filename_stems[i],
            )
        print_with_time("\tPlotting legacy investigation diagnostics...")
        for i in tqdm(plot_file_indices):
            relative_stem = relative_filename_stems[i]
            selected_body_parts_for_artifact_plotting = resolve_bodyparts_for_artifact_plotting(
                bodyparts_for_artifact_plotting,
                legacy_body_part_groups,
                landmark_weighting_weights,
            )

            grouped_per_frame = grouped_dvaj_dfs[i]
            grouped_cumsum = grouped_cumsum_dfs[i]
            grouped_normalized_cumsum = grouped_normalized_cumsum_dfs[i]
            body_part_complexity_df = legacy_body_part_complexities[i].copy()
            overall_legacy_complexity = legacy_overall_complexities[i]

            grouped_per_frame.to_csv(make_debug_path("legacy_grouped_perframe_metrics.csv", subpath=relative_stem))
            grouped_cumsum.to_csv(make_debug_path("legacy_grouped_cumsum_metrics.csv", subpath=relative_stem))
            grouped_normalized_cumsum_original_dfs[i].to_csv(make_debug_path("legacy_grouped_normalized_metrics_original.csv", subpath=relative_stem))
            grouped_normalized_cumsum.to_csv(make_debug_path("legacy_grouped_normalized_metrics_repaired.csv", subpath=relative_stem))
            body_part_complexity_df.to_csv(make_debug_path("legacy_bodypart_complexity.csv", subpath=relative_stem))
            normalized_dvaj_cumsum_original_dfs[i].to_csv(make_debug_path("normalized_dvaj_original.csv", subpath=relative_stem))
            repaired_normalized_dvaj_cumsum_dfs[i].to_csv(make_debug_path("normalized_dvaj_repaired.csv", subpath=relative_stem))

            filtered_body_part_plot_df, filtered_body_part_visibility_df = filter_plot_columns_by_weight(
                body_part_complexity_df,
                landmark_weighting_weights,
                visibility=legacy_body_part_visibility_dfs[i],
                body_part_groups=legacy_body_part_groups,
            )
            body_part_plot_df = filtered_body_part_plot_df.rename(columns=LEGACY_GROUPED_BODY_PART_LABELS)
            body_part_visibility_plot_df = None if filtered_body_part_visibility_df is None else filtered_body_part_visibility_df.rename(columns=LEGACY_GROUPED_BODY_PART_LABELS)

            if not selected_body_parts_for_artifact_plotting:
                skipped_plot_messages.append(f"{relative_stem}: skipped grouped example legacy plots because no positive-weight grouped body part remained.")
            for selected_body_part in selected_body_parts_for_artifact_plotting:
                selected_body_part_label = LEGACY_GROUPED_BODY_PART_LABELS.get(
                    selected_body_part,
                    selected_body_part.replace("_", " ").title(),
                )
                example_metric_columns = [
                    f"{selected_body_part}_{measure.name}"
                    for measure in DVAJ
                    if f"{selected_body_part}_{measure.name}" in grouped_per_frame.columns
                ]
                metric_labels = {
                    f"{selected_body_part}_{measure.name}": measure.name.capitalize()
                    for measure in DVAJ
                    if f"{selected_body_part}_{measure.name}" in grouped_per_frame.columns
                }
                if not example_metric_columns:
                    skipped_plot_messages.append(f"{relative_stem}: skipped grouped example plots for `{selected_body_part}` because no grouped metric columns were available.")
                    continue
                save_debug_fig(
                    f"legacy_raw_metrics_{selected_body_part}.png",
                    lambda ax, i=i, example_metric_columns=example_metric_columns, metric_labels=metric_labels, selected_body_part_label=selected_body_part_label: plot_visibility_dataframe(
                        ax,
                        grouped_per_frame[example_metric_columns].rename(columns=metric_labels),
                        visibility=None if grouped_metric_visibility_dfs[i] is None else grouped_metric_visibility_dfs[i][example_metric_columns].rename(columns=metric_labels),
                        title=f"Raw complexity by metric (example) - {selected_body_part_label}",
                        alpha_floor=visibility_plot_alpha_floor,
                    ),
                    subpath=relative_stem,
                )
                save_debug_fig(
                    f"legacy_cumsum_metrics_{selected_body_part}.png",
                    lambda ax, i=i, example_metric_columns=example_metric_columns, metric_labels=metric_labels, selected_body_part_label=selected_body_part_label: plot_visibility_dataframe(
                        ax,
                        grouped_cumsum[example_metric_columns].rename(columns=metric_labels),
                        visibility=None if grouped_metric_visibility_dfs[i] is None else grouped_metric_visibility_dfs[i][example_metric_columns].rename(columns=metric_labels),
                        title=f"Cumulative complexity by metric (example) - {selected_body_part_label}",
                        alpha_floor=visibility_plot_alpha_floor,
                    ),
                    subpath=relative_stem,
                )
                save_debug_fig(
                    f"legacy_normalized_cumsum_metrics_{selected_body_part}.png",
                    lambda ax, i=i, example_metric_columns=example_metric_columns, metric_labels=metric_labels, selected_body_part_label=selected_body_part_label: plot_visibility_dataframe(
                        ax,
                        grouped_normalized_cumsum[example_metric_columns].rename(columns=metric_labels),
                        visibility=None if grouped_metric_visibility_dfs[i] is None else grouped_metric_visibility_dfs[i][example_metric_columns].rename(columns=metric_labels),
                        title=f"Normalized cumulative sum by metric (example) - {selected_body_part_label}",
                        alpha_floor=visibility_plot_alpha_floor,
                    ),
                    subpath=relative_stem,
                )

            if body_part_plot_df.empty:
                skipped_plot_messages.append(f"{relative_stem}: skipped `legacy_bodypart_complexity.png` because no positive-weight grouped body parts remained.")
            else:
                save_debug_fig(
                    "legacy_bodypart_complexity.png",
                    lambda ax, body_part_plot_df=body_part_plot_df, body_part_visibility_plot_df=body_part_visibility_plot_df: plot_visibility_dataframe(
                        ax,
                        body_part_plot_df,
                        visibility=body_part_visibility_plot_df,
                        title="Accumulated complexity by body part (legacy recreation)",
                        alpha_floor=visibility_plot_alpha_floor,
                    ),
                    subpath=relative_stem,
                )
            save_debug_fig(
                "legacy_overall_complexity.png",
                lambda ax, overall_legacy_complexity=overall_legacy_complexity, i=i: plot_visibility_single_series(
                    ax,
                    overall_legacy_complexity,
                    visibility=legacy_overall_visibility[i],
                    title="Accumulated complexity over time",
                    alpha_floor=visibility_plot_alpha_floor,
                ),
                subpath=relative_stem,
            )
            save_debug_fig(
                "legacy_target_complexity.png",
                lambda ax, overall_legacy_complexity=overall_legacy_complexity, i=i: (
                    plot_visibility_single_series(
                        ax,
                        overall_legacy_complexity,
                        visibility=legacy_overall_visibility[i],
                        title=f"Desired complexity per segment ({target_complexity_per_segment:.1f} target per segment)",
                        color="C3",
                        alpha_floor=visibility_plot_alpha_floor,
                    ),
                    add_segment_target_lines(ax, overall_legacy_complexity, target_complexity_per_segment),
                ),
                subpath=relative_stem,
            )

            boundary_df = compute_naive_segment_boundaries(overall_legacy_complexity, target_complexity_per_segment)
            beat_times_secs = load_audio_analysis_beats(audio_analysis_dir, relative_stem)
            fps = fps_by_relative_stem.get(relative_stem, 30.0)

            if boundary_df.empty:
                boundary_df.to_csv(make_debug_path("legacy_segment_boundaries.csv", subpath=relative_stem), index=False)
                continue

            boundary_df["snapped_frame"] = np.nan
            if beat_times_secs:
                beat_frames = np.asarray(beat_times_secs) * fps
                boundary_df["snapped_frame"] = snap_boundaries_to_beats(boundary_df["frame"].tolist(), beat_frames)
            boundary_df.to_csv(make_debug_path("legacy_segment_boundaries.csv", subpath=relative_stem), index=False)

            save_debug_fig(
                "legacy_naive_boundaries.png",
                lambda ax, overall_legacy_complexity=overall_legacy_complexity, boundary_df=boundary_df, i=i: (
                    plot_visibility_single_series(
                        ax,
                        overall_legacy_complexity,
                        visibility=legacy_overall_visibility[i],
                        title="Segmented based on complexity",
                        color="C3",
                        alpha_floor=visibility_plot_alpha_floor,
                    ),
                    add_segment_target_lines(ax, overall_legacy_complexity, target_complexity_per_segment),
                    ax.scatter(boundary_df["frame"], boundary_df["target_complexity"], color="C3", label="Naive divisions"),
                    ax.legend(),
                ),
                subpath=relative_stem,
            )

            if not beat_times_secs:
                continue

            beat_frames = np.asarray(beat_times_secs) * fps
            bar_frames = beat_frames[::BEATS_PER_BAR]
            snapped_frames = boundary_df["snapped_frame"].to_numpy(dtype=float)
            snapped_complexity = np.interp(snapped_frames, overall_legacy_complexity.index.to_numpy(dtype=float), overall_legacy_complexity.to_numpy(dtype=float))

            save_debug_fig(
                "legacy_beat_snap_lines.png",
                lambda ax, overall_legacy_complexity=overall_legacy_complexity, boundary_df=boundary_df, beat_frames=beat_frames, bar_frames=bar_frames, i=i: (
                    plot_visibility_single_series(
                        ax,
                        overall_legacy_complexity,
                        visibility=legacy_overall_visibility[i],
                        title="Segmented based on complexity (Snap lines from audio beats)",
                        color="C3",
                        alpha_floor=visibility_plot_alpha_floor,
                    ),
                    add_segment_target_lines(ax, overall_legacy_complexity, target_complexity_per_segment),
                    [ax.axvline(frame, color="0.45", alpha=0.3) for frame in beat_frames],
                    [ax.axvline(frame, color="0.2", alpha=0.55) for frame in bar_frames],
                    ax.scatter(boundary_df["frame"], boundary_df["target_complexity"], color="C3", label="Naive divisions"),
                    ax.legend(),
                ),
                subpath=relative_stem,
            )
            save_debug_fig(
                "legacy_snapped_boundaries.png",
                lambda ax, overall_legacy_complexity=overall_legacy_complexity, boundary_df=boundary_df, beat_frames=beat_frames, bar_frames=bar_frames, snapped_frames=snapped_frames, snapped_complexity=snapped_complexity, i=i: (
                    plot_visibility_single_series(
                        ax,
                        overall_legacy_complexity,
                        visibility=legacy_overall_visibility[i],
                        title="Segmented based on complexity (Snapped to audio beats)",
                        color="C3",
                        alpha_floor=visibility_plot_alpha_floor,
                    ),
                    add_segment_target_lines(ax, overall_legacy_complexity, target_complexity_per_segment),
                    [ax.axvline(frame, color="0.45", alpha=0.3) for frame in beat_frames],
                    [ax.axvline(frame, color="0.2", alpha=0.55) for frame in bar_frames],
                    ax.scatter(boundary_df["frame"], boundary_df["target_complexity"], color="C3", label="Naive divisions"),
                    ax.scatter(snapped_frames, snapped_complexity, color="C0", label="Snapped divisions"),
                    ax.legend(),
                ),
                subpath=relative_stem,
            )

    # Step 8.
    # Save results
    print_with_time("Step 8: Scaling & Saving results...")
    overall_complexities_df = pd.concat(overall_complexities, axis=1)
    overall_complexities_df.columns = relative_filename_stems
    overall_visibility_df = None
    if use_visibility_plot_styling:
        overall_visibility_df = pd.concat(t.cast(t.Sequence[pd.Series], overall_visibility), axis=1)
        overall_visibility_df.columns = relative_filename_stems
    # overall_complexities_df.fillna(method='ffill', inplace=True)
        
    complexity_per_frame = [overall_complexities[i].iloc[-1] / nontossed_frame_counts[i] for i in range(len(filename_stems))]
    min_complexity_per_frame = min(complexity_per_frame)
    max_complexity_per_frame = max(complexity_per_frame)
    fps = 30.0

    max_complexity_per_second = (max_complexity_per_frame - min_complexity_per_frame) * fps
    max_frames = max(nontossed_frame_counts)

    # Add cols for min and max complexity
    debug_overall_complexities_df = overall_complexities_df.copy()
    max_linear_cumulative_complexity = np.linspace(0, max_frames * max_complexity_per_frame, max_frames, endpoint=False)
    min_linear_cumulative_complexity = np.linspace(0, max_frames * min_complexity_per_frame, max_frames, endpoint=False)
    # hundred_percent_scale_cumulative_complexity = np.linspace(0, max_frames * max_complexity_per_second, max_frames, endpoint=False)
    debug_overall_complexities_df["max"] = max_linear_cumulative_complexity
    debug_overall_complexities_df["min"] = min_linear_cumulative_complexity
    if should_output_diagnostics:
        plot_overall_complexities_df = debug_overall_complexities_df[
            [relative_filename_stems[i] for i in plot_file_indices] + ["max", "min"]
        ]
        plot_overall_visibility_df = None
        if overall_visibility_df is not None:
            plot_overall_visibility_df = overall_visibility_df[[relative_filename_stems[i] for i in plot_file_indices]].copy()
            plot_overall_visibility_df["max"] = 1.0
            plot_overall_visibility_df["min"] = 1.0
        save_debug_fig(
            f"overall_complexities.png",
            lambda ax: plot_visibility_dataframe(
                ax,
                plot_overall_complexities_df,
                visibility=plot_overall_visibility_df,
                title=f"Overall Complexity",
                alpha_floor=visibility_plot_alpha_floor,
            ),
        )
        overall_complexities_df.to_csv(make_debug_path("overall_complexities.csv"))

    scaled_complexities = [
        (overall_complexities[i] - min_linear_cumulative_complexity[:nontossed_frame_counts[i]]) / max_complexity_per_second
        for i in range(len(filename_stems))
    ]

    scaled_complexities_df = pd.concat(scaled_complexities, axis=1, names=relative_filename_stems)
    if should_output_diagnostics and len(plot_file_indices) > 0:
        plot_scaled_complexities_df = scaled_complexities_df.iloc[:, plot_file_indices]
        plot_scaled_visibility_df = None if overall_visibility_df is None else overall_visibility_df.iloc[:, plot_file_indices]
        save_debug_fig(
            f"scaled_complexities.png",
            lambda ax: plot_visibility_dataframe(
                ax,
                plot_scaled_complexities_df,
                visibility=plot_scaled_visibility_df,
                title=f"Scaled Complexity",
                alpha_floor=visibility_plot_alpha_floor,
            ),
        )

    # Save complexity by file
    for i, (complexity_csv_output_path) in enumerate(tqdm(complexity_csv_output_paths)): # type: ignore
        
        if (complexity_csv_output_path).exists():
            existing_complexity = pd.read_csv((complexity_csv_output_path), index_col=0)
            if complexity_calculation_parameters_string in existing_complexity.columns:
                # Drop to ensure no rows are retained from previous runs
                existing_complexity.drop(columns=[complexity_calculation_parameters_string], inplace=True)
            existing_complexity[complexity_calculation_parameters_string] = scaled_complexities[i]
            existing_complexity.to_csv(str((complexity_csv_output_path)))
        else:
            (complexity_csv_output_path).parent.mkdir(parents=True, exist_ok=True)
            csv_data = scaled_complexities[i].copy()
            csv_data.name = complexity_calculation_parameters_string
            csv_data.to_csv(str((complexity_csv_output_path)))

    update_data = pd.DataFrame({
        "stem": filename_stems,
        "frames": nontossed_frame_counts,
        "unscaled_complexity_per_frame": [overall_complexities[i].iloc[-1] / nontossed_frame_counts[i] for i in range(len(filename_stems))], 
        "unscaled_net_complexity": [overall_complexities[i].iloc[-1] for i in range(len(filename_stems))],
        "net_complexity": [scaled_complexities[i].iloc[-1] for i in range(len(filename_stems))],
        "scaled_complexity_per_second": [scaled_complexities[i].iloc[-1] / (nontossed_frame_counts[i] / 30.) for i in range(len(filename_stems))],
    },
        index=[
            relative_filename_stems,
            [complexity_calculation_parameters_string for _ in filename_stems]
        ]
    )    
    update_data.index.names = ["path", "creation_method"]
    if should_output_diagnostics:
        update_data.to_csv(make_debug_path("complexity_summary.csv"))

    existing_complexity_summary = None
    complexity_summary_csv_filepath = destdir / "dvaj_complexity.csv"
    if complexity_summary_csv_filepath.exists():
        existing_complexity_summary = pd.read_csv(str(complexity_summary_csv_filepath), index_col=["path", "creation_method"])

        # Perform an upsert on the existing complexity summary
        # (combination of outer join and update)
        existing_complexity_summary = pd_append_replace(
            existing_complexity_summary,
            update_data,
        )
    else:
        existing_complexity_summary = update_data    

    existing_complexity_summary.to_csv(complexity_summary_csv_filepath, index=True, header=True)

    if artifact_dir is not None:
        report = build_artifact_report(
            artifact_dir,
            title="Cumulative Complexity Report",
            intro=(
                f"Calculated cumulative complexity outputs into `{destdir}` using `{complexity_calculation_parameters_string}`."
            ),
        )
        report.add_heading("Run Summary")
        report.add_list(
            [
                f"Source dir: `{srcdir}`" if srcdir else "Source dir: none",
                f"Explicit file count: `{len(other_files)}`",
                f"Input file count: `{len(input_files)}`",
                f"Destination dir: `{destdir}`",
                f"Measure weighting: `{measure_weighting_choice.name}`",
                f"Landmark weighting: `{landmark_weighting_choice.name}`",
                f"Include base: `{include_base}`",
                f"Visibility mode: `{visibility_mode.name}`",
                f"Visibility repair cutoff: `{visibility_repair_cutoff}`",
                f"Visibility plot alpha floor: `{visibility_plot_alpha_floor}`",
                f"Plot whitelist: `{plot_whitelist_patterns}`" if plot_whitelist_patterns else "Plot whitelist: all files",
                f"Plotted file count: `{len(plot_file_indices)}`",
                f"Creation method: `{complexity_calculation_parameters_string}`",
                f"Legacy target complexity per segment: `{target_complexity_per_segment}`",
                f"Body parts for artifact plotting: `{list(bodyparts_for_artifact_plotting)}`",
                f"Legacy audio analysis dir: `{audio_analysis_dir}`" if audio_analysis_dir else "Legacy audio analysis dir: not found",
            ]
        )
        report.add_heading("Complexity Summary")
        report.add_dataframe(
            "complexity_summary",
            update_data.reset_index(),
            max_rows_in_markdown=20,
            preview_rows=10,
        )
        if skipped_plot_messages:
            report.add_heading("Skipped Plots")
            report.add_list(skipped_plot_messages)
        report.write()

    print_with_time("Finished.")


if __name__ == "__main__":
    import argparse
    import sys
    import json
    plt.ioff()

    parser = argparse.ArgumentParser()
    parser.add_argument("--destdir", type=Path, default=Path.cwd())  
    parser.add_argument("--srcdir", type=Path, default=None)
    parser.add_argument("--database_csv_path", type=Path, default=None)
    parser.add_argument("--artifact_archive_root", type=Path, default=None)
    parser.add_argument("--artifact_output_dir", type=Path, default=None)
    parser.add_argument(
        "--plot_whitelist",
        action="append",
        default=None,
        help="Optional wildcard whitelist for diagnostic plotting, matched against relative file stems.",
    )
    parser.add_argument("--visibility_repair_cutoff", type=float, default=VISIBILITY_REPAIR_CUTOFF)
    parser.add_argument("--visibility_plot_alpha_floor", type=float, default=VISIBILITY_PLOT_ALPHA_FLOOR)
    parser.add_argument("--target_complexity_per_segment", type=float, default=10.0)
    parser.add_argument("--bodyparts_for_artifact_plotting", action="append", default=list(DEFAULT_BODYPARTS_FOR_ARTIFACT_PLOTTING))
    parser.add_argument("--measure_weighting", choices=[e.name for e in DvajMeasureWeighting] + ['all'], default=DvajMeasureWeighting.decreasing_by_quarter.name)
    parser.add_argument("--landmark_weighting", choices=[e.name for e in PoseLandmarkWeighting] + ['all'], default=PoseLandmarkWeighting.balanced.name)
    parser.add_argument("--include_base", choices=['true', 'false', 'both'], default='true')
    parser.add_argument("--visibility_mode", choices=[e.name for e in VisibilityMode] + ['all'], default=VisibilityMode.weight.name)
    parser.add_argument('--skip_existing', action='store_true', default=False, help='Skip files that already have a complexity summary')
    parser.add_argument("files", nargs="*", type=Path)
    args = parser.parse_args()

    measure_weighting_choices = [DvajMeasureWeighting[args.measure_weighting]] if args.measure_weighting != 'all' else list(DvajMeasureWeighting)
    landmark_weighting_choices = [PoseLandmarkWeighting[args.landmark_weighting]] if args.landmark_weighting != 'all' else list(PoseLandmarkWeighting)
    include_base_choices = [args.include_base] if args.include_base != 'both' else ['true', 'false']
    visibility_mode_choices = [VisibilityMode[args.visibility_mode]] if args.visibility_mode != 'all' else list(VisibilityMode)

    def str2bool(v: str):
        return v.lower() in ("yes", "true", "t", "1")

    run_iterations = list(itertools.product(
        measure_weighting_choices,
        landmark_weighting_choices,
        include_base_choices,
        visibility_mode_choices,
    ))

    run_iterations = [
        (measure_weighting, 
         landmark_weighting, 
         str2bool(include_base), 
         visibility_mode) 
        for measure_weighting, landmark_weighting, include_base, visibility_mode 
        in run_iterations
    ]
        
    for i, (measure_weighting, landmark_weighting, include_base, visibility_mode) in enumerate(run_iterations):
        calculate_cumulative_complexities(
            srcdir=args.srcdir,
            other_files=args.files,
            destdir=args.destdir,
            measure_weighting=measure_weighting,
            landmark_weighting=landmark_weighting,
            database_csv_path=args.database_csv_path,
            artifact_archive_root=args.artifact_archive_root,
            artifact_output_dir=args.artifact_output_dir,
            plot_whitelist=args.plot_whitelist,
            visibility_mode=visibility_mode,
            include_base=include_base,
            visibility_repair_cutoff=args.visibility_repair_cutoff,
            visibility_plot_alpha_floor=args.visibility_plot_alpha_floor,
            target_complexity_per_segment=args.target_complexity_per_segment,
            bodyparts_for_artifact_plotting=args.bodyparts_for_artifact_plotting,
            print_prefix=lambda: f"{i+1}/{len(run_iterations)}\t" if len(run_iterations) > 1 else "",
            skip_existing=args.skip_existing,
        )
