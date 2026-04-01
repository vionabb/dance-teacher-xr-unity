from collections import defaultdict
from pathlib import Path
import time
import pandas as pd
import numpy as np
import typing as t
import matplotlib.pyplot as plt
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

from ..mp_utils import PoseLandmark
from .uist_complexityanalysis import get_pose_landmarks_present_in_dataframe, DVAJ, calc_scalar_dvaj

BASE_COL_NAME = "base"

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
LANDMARK_WEIGHTING_BALANCED: t.Final[t.Dict[PoseLandmark, float]] = normalize_weighting(
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

def get_complexity_creationmethod_name(
    measure_weighting_choice: DvajMeasureWeighting,
    landmark_weighting_choice: PoseLandmarkWeighting,
    weigh_by_visibility: bool,
    include_base: bool
):
    creation_method = f"mw-{measure_weighting_choice.name}_lmw-{landmark_weighting_choice.name}_{'byvisibility' if weigh_by_visibility else 'ignorevisibility'}_{'includebase' if include_base else 'excludebase'}"
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

def aggregate_accumulated_dvaj_by_measure(
    dvaj_cumsum: pd.DataFrame, 
    measure_weighting: t.Dict[DVAJ, float] = {}, 
    landmark_weighting: t.Dict[PoseLandmark, float] = {},
):
    landmark_names = get_pose_landmarks_present_in_dataframe(dvaj_cumsum)

    weighted_accumulated_dvaj_by_measure = pd.DataFrame()

    for measure in DVAJ:
        weighted_dvaj_by_landmark = pd.DataFrame()
        for landmark in landmark_names:
            landmark_weight = landmark_weighting.get(landmark, 1.0)
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
        # warn if the file is not a holisticdata.csv file
        if not holistic_csv_file.name.endswith(".holisticdata.csv"):
            print(f"WARNING: {holistic_csv_file} is not a .holisticdata.csv file.", file=sys.stderr)
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
        plot_figs: bool = False,
        include_base: bool = False,
        weigh_by_visibility: bool = True,
        print_prefix: t.Callable[[], str] = lambda: "",
        skip_existing: bool = False,
):
    input_files: t.List[Path] = other_files.copy()
    relative_dirs: t.List[Path] = [f.parent for f in other_files]

    # if srcdir is specified, add all files of the form "*.holisticdata.csv" in that directory to the list of files.
    files_from_srcdir = []
    if srcdir is not None:
        files_from_srcdir = list(srcdir.rglob("*.holisticdata.csv"))
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
      
    print(f"{print_prefix()}Output: saving output dance trees to {destdir}.")
    destdir.mkdir(parents=True, exist_ok=True)

    measure_weighting_choice = measure_weighting
    measure_weighting_weights = measure_weighting_choice.get_weighting()
    landmark_weighting_choice = landmark_weighting
    landmark_weighting_weights = landmark_weighting_choice.get_weighting(include_base=include_base)
    complexity_calculation_parameters_string = get_complexity_creationmethod_name(
        measure_weighting_choice,
        landmark_weighting_choice,
        weigh_by_visibility,
        include_base,
    )

    filename_stems = [file.stem.replace('.holisticdata', '') for file in input_files]
    relative_filename_stems = [
        str(file.relative_to(relative_dir).parent / file.stem.replace('.holisticdata', ''))
        for file, relative_dir 
        in zip(input_files, relative_dirs)
    ]
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

    debug_dir = destdir / "debug" / sup_title
    debug_dir.mkdir(parents=True, exist_ok=True)
    count_by_subpath = {}
    debug_file_count = 0
    def make_debug_path(name: str, subpath: str = "") -> Path:
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
    print(f"{print_prefix()}Weighing by visibility: {'yes' if weigh_by_visibility else 'no'}")

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
    
    if plot_figs:
        print_with_time("\tPlotting raw DVAJs...")
        for i in trange(len(filename_stems)):
            save_debug_fig("generated_dvaj.png", lambda ax: dvaj_dfs[i].plot(title=f"Raw DVAJ ({filename_stems[i]})", ax=ax), subpath=relative_filename_stems[i])

    if weigh_by_visibility:
        dvaj_suffixes = [measure.name for measure in DVAJ]
        print_with_time("Step 2: Weighting by visibility...")
        dvaj_dfs = [weigh_by_visiblity(dvaj, visibility, landmark_names, dvaj_suffixes) for dvaj, visibility in tqdm(zip(dvaj_dfs, visibility_dfs), total=len(dvaj_dfs))]

        if plot_figs:
            print_with_time("\tPlotting visibility-weighted DVAJs...")
            for i in trange(len(filename_stems)):
                save_debug_fig("visweighted_dvaj.png", lambda ax: dvaj_dfs[i].plot(title=f"Visibility-Weighted DVAJ ({filename_stems[i]})", ax=ax), subpath=relative_filename_stems[i])
    else:
        print_with_time("Step 2: Skipped (not weighting by visibility) ...")

    print_with_time("Step 3: Converting to cumulative sum...")
    dvaj_cumsum_dfs = [dvaj.cumsum() for dvaj in dvaj_dfs]
    # For any NaNs, fill with the last valid value (NaNs will appear when skeleton isn't tracked)
    dvaj_cumsum_dfs = [dvaj_cumsum.fillna(method="ffill") for dvaj_cumsum in dvaj_cumsum_dfs]
    if plot_figs:
        print_with_time("\tPlotting cumulative DVAJs...")
        for i in trange(len(filename_stems)):
            save_debug_fig("cumsum_dvaj.png", lambda ax: dvaj_cumsum_dfs[i].plot(title=f"Cumulative DVAJ ({filename_stems[i]})", ax=ax), subpath=relative_filename_stems[i])
    del dvaj_dfs
    
    print_with_time("Step 4: Trimming trailing frames...")
    dvaj_cumsum_dfs, tossed_frames = t.cast(t.Tuple[t.List[pd.DataFrame], t.List[int]] , zip(*[
        trim_df_to_convergence(dvaj_cumsum) for dvaj_cumsum in dvaj_cumsum_dfs
    ]))
    nontossed_frame_counts = [df.shape[0] for df in dvaj_cumsum_dfs]
    # pd.DataFrame({
        # "trimmed_frames": [dvaj_cumsum.shape[0] for dvaj_cumsum in dvaj_cumsum_dfs],
        # "tossed_frames": tossed_frames,
        # }, index=filename_stems).to_csv(make_debug_path("tossed_frames.csv"))
    
    if plot_figs:
        for measure in DVAJ:
            print_with_time(f"\tPlotting trimmed {measure.name}...")
            for i in trange(len(filename_stems)):
                df = dvaj_cumsum_dfs[i]
                measure_cols = [col for col in df.columns if measure.name in col]
                save_debug_fig(f"trimmed_dvaj_{measure.name}.png", lambda ax: df[measure_cols].plot(title=f"Trimmed {measure.name} ({filename_stems[0]})", ax=ax), subpath=relative_filename_stems[i])

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
    maxes_per_frame.to_csv(make_debug_path("movement_per_frame.csv"))
    max_vals_and_src.to_csv(make_debug_path("max_vals.csv"))

    # Step 6 & 7.
    # 6. Normalize each metric by its max among the dataset, adjusted
    #      by the length of the dataframe.
    # 7. Aggregate the normalized metrics into a single complexity measure.
    print_with_time("Step 6 & 7: Normalizing & Aggregating metrics...")
    complexity_measures = [
        aggregate_accumulated_dvaj_by_measure(
            dvaj_cumsum,
            measure_weighting=measure_weighting_weights,
            landmark_weighting=landmark_weighting_weights,
        )
        for dvaj_cumsum in dvaj_cumsum_dfs
    ]
    overall_complexities = [
        complexity_measures[i].sum(axis=1)
        for i in range(len(complexity_measures))
    ]
    for i in range(len(overall_complexities)):
        overall_complexities[i].name = filename_stems[i]
        overall_complexities[i].ffill(inplace=True)

    del dvaj_cumsum_dfs
    if plot_figs:
        print_with_time("\tPlotting complexity measures...")
        for i in trange(len(filename_stems)):
            save_debug_fig(f"complexity_measures.png", lambda ax: complexity_measures[i].plot(title=f"Complexity Measures ({filename_stems[i]})", ax=ax), subpath=relative_filename_stems[i])
            save_debug_fig(f"overall_complexity.png", lambda ax: overall_complexities[i].plot(title=f"Overall Complexity ({filename_stems[i]})", ax=ax), subpath=relative_filename_stems[i])

    # Step 8.
    # Save results
    print_with_time("Step 8: Scaling & Saving results...")
    overall_complexities_df = pd.concat(overall_complexities, axis=1)
    overall_complexities_df.columns = relative_filename_stems
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
    
    save_debug_fig(f"overall_complexities.png", lambda ax: debug_overall_complexities_df.plot(title=f"Overall Complexity", ax=ax))
    overall_complexities_df.to_csv(make_debug_path("overall_complexities.csv"))

    scaled_complexities = [
        (overall_complexities[i] - min_linear_cumulative_complexity[:nontossed_frame_counts[i]]) / max_complexity_per_second
        for i in range(len(filename_stems))
    ]

    scaled_complexities_df = pd.concat(scaled_complexities, axis=1, names=relative_filename_stems)
    save_debug_fig(f"scaled_complexities.png", lambda ax: scaled_complexities_df.plot(title=f"Scaled Complexity", ax=ax))

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

    print_with_time("Finished.")


if __name__ == "__main__":
    import argparse
    import sys
    import json
    plt.ioff()

    parser = argparse.ArgumentParser()
    parser.add_argument("--destdir", type=Path, default=Path.cwd())  
    parser.add_argument("--srcdir", type=Path, default=None)
    parser.add_argument("--plot_figs", action="store_true", default=False)
    parser.add_argument("--measure_weighting", choices=[e.name for e in DvajMeasureWeighting] + ['all'], default=DvajMeasureWeighting.decreasing_by_quarter.name)
    parser.add_argument("--landmark_weighting", choices=[e.name for e in PoseLandmarkWeighting] + ['all'], default=PoseLandmarkWeighting.balanced.name)
    parser.add_argument("--include_base", choices=['true', 'false', 'both'], default='true')
    parser.add_argument("--weigh_by_visibility", choices=['true', 'false', 'both'], default='true')
    parser.add_argument('--skip_existing', action='store_true', default=False, help='Skip files that already have a complexity summary')
    parser.add_argument("files", nargs="*", type=Path)
    args = parser.parse_args()

    measure_weighting_choices = [DvajMeasureWeighting[args.measure_weighting]] if args.measure_weighting != 'all' else list(DvajMeasureWeighting)
    landmark_weighting_choices = [PoseLandmarkWeighting[args.landmark_weighting]] if args.landmark_weighting != 'all' else list(PoseLandmarkWeighting)
    include_base_choices = [args.include_base] if args.include_base != 'both' else ['true', 'false']
    weigh_by_visiblity_choices = [args.weigh_by_visibility] if args.weigh_by_visibility != 'both' else ['true', 'false']


    run_iterations = list(itertools.product(
        measure_weighting_choices,
        landmark_weighting_choices,
        include_base_choices,
        weigh_by_visiblity_choices,
    ))

    def str2bool(v: str):
        return v.lower() in ("yes", "true", "t", "1")

    run_iterations = [
        (measure_weighting, 
         landmark_weighting, 
         str2bool(include_base), 
         str2bool(weigh_by_visibility)) 
        for measure_weighting, landmark_weighting, include_base, weigh_by_visibility 
        in run_iterations
    ]
        
    for i, (measure_weighting, landmark_weighting, include_base, weigh_by_visibility) in enumerate(run_iterations):
        calculate_cumulative_complexities(
            srcdir=args.srcdir,
            other_files=args.files,
            destdir=args.destdir,
            measure_weighting=measure_weighting,
            landmark_weighting=landmark_weighting,
            plot_figs=args.plot_figs,
            weigh_by_visibility=weigh_by_visibility,
            include_base=include_base,
            print_prefix=lambda: f"{i+1}/{len(run_iterations)}\t" if len(run_iterations) > 1 else "",
            skip_existing=args.skip_existing,
        )
