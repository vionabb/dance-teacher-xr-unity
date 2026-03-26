"""
Analysis of the distribution of joint visibility and other pose qualities arising from pose estimation.

Takes in a bunch of CSV files containing pose data (generated with the getposes.py 
script using Google mediapipe).
"""
from pathlib import Path
import argparse
import itertools
import typing as t
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from tqdm import tqdm

# Note: pose csv files have the following columns:
# frame,timestamp,is_valid,NOSE_x_2d,NOSE_y_2d,NOSE_z_2d,NOSE_visibility_2d,LEFT_EYE_INNER_x_2d,LEFT_EYE_INNER_y_2d,LEFT_EYE_INNER_z_2d,LEFT_EYE_INNER_visibility_2d,LEFT_EYE_x_2d,LEFT_EYE_y_2d,LEFT_EYE_z_2d,LEFT_EYE_visibility_2d,LEFT_EYE_OUTER_x_2d,LEFT_EYE_OUTER_y_2d,LEFT_EYE_OUTER_z_2d,LEFT_EYE_OUTER_visibility_2d,RIGHT_EYE_INNER_x_2d,RIGHT_EYE_INNER_y_2d,RIGHT_EYE_INNER_z_2d,RIGHT_EYE_INNER_visibility_2d,RIGHT_EYE_x_2d,RIGHT_EYE_y_2d,RIGHT_EYE_z_2d,RIGHT_EYE_visibility_2d,RIGHT_EYE_OUTER_x_2d,RIGHT_EYE_OUTER_y_2d,RIGHT_EYE_OUTER_z_2d,RIGHT_EYE_OUTER_visibility_2d,LEFT_EAR_x_2d,LEFT_EAR_y_2d,LEFT_EAR_z_2d,LEFT_EAR_visibility_2d,RIGHT_EAR_x_2d,RIGHT_EAR_y_2d,RIGHT_EAR_z_2d,RIGHT_EAR_visibility_2d,MOUTH_LEFT_x_2d,MOUTH_LEFT_y_2d,MOUTH_LEFT_z_2d,MOUTH_LEFT_visibility_2d,MOUTH_RIGHT_x_2d,MOUTH_RIGHT_y_2d,MOUTH_RIGHT_z_2d,MOUTH_RIGHT_visibility_2d,LEFT_SHOULDER_x_2d,LEFT_SHOULDER_y_2d,LEFT_SHOULDER_z_2d,LEFT_SHOULDER_visibility_2d,RIGHT_SHOULDER_x_2d,RIGHT_SHOULDER_y_2d,RIGHT_SHOULDER_z_2d,RIGHT_SHOULDER_visibility_2d,LEFT_ELBOW_x_2d,LEFT_ELBOW_y_2d,LEFT_ELBOW_z_2d,LEFT_ELBOW_visibility_2d,RIGHT_ELBOW_x_2d,RIGHT_ELBOW_y_2d,RIGHT_ELBOW_z_2d,RIGHT_ELBOW_visibility_2d,LEFT_WRIST_x_2d,LEFT_WRIST_y_2d,LEFT_WRIST_z_2d,LEFT_WRIST_visibility_2d,RIGHT_WRIST_x_2d,RIGHT_WRIST_y_2d,RIGHT_WRIST_z_2d,RIGHT_WRIST_visibility_2d,LEFT_PINKY_x_2d,LEFT_PINKY_y_2d,LEFT_PINKY_z_2d,LEFT_PINKY_visibility_2d,RIGHT_PINKY_x_2d,RIGHT_PINKY_y_2d,RIGHT_PINKY_z_2d,RIGHT_PINKY_visibility_2d,LEFT_INDEX_x_2d,LEFT_INDEX_y_2d,LEFT_INDEX_z_2d,LEFT_INDEX_visibility_2d,RIGHT_INDEX_x_2d,RIGHT_INDEX_y_2d,RIGHT_INDEX_z_2d,RIGHT_INDEX_visibility_2d,LEFT_THUMB_x_2d,LEFT_THUMB_y_2d,LEFT_THUMB_z_2d,LEFT_THUMB_visibility_2d,RIGHT_THUMB_x_2d,RIGHT_THUMB_y_2d,RIGHT_THUMB_z_2d,RIGHT_THUMB_visibility_2d,LEFT_HIP_x_2d,LEFT_HIP_y_2d,LEFT_HIP_z_2d,LEFT_HIP_visibility_2d,RIGHT_HIP_x_2d,RIGHT_HIP_y_2d,RIGHT_HIP_z_2d,RIGHT_HIP_visibility_2d,LEFT_KNEE_x_2d,LEFT_KNEE_y_2d,LEFT_KNEE_z_2d,LEFT_KNEE_visibility_2d,RIGHT_KNEE_x_2d,RIGHT_KNEE_y_2d,RIGHT_KNEE_z_2d,RIGHT_KNEE_visibility_2d,LEFT_ANKLE_x_2d,LEFT_ANKLE_y_2d,LEFT_ANKLE_z_2d,LEFT_ANKLE_visibility_2d,RIGHT_ANKLE_x_2d,RIGHT_ANKLE_y_2d,RIGHT_ANKLE_z_2d,RIGHT_ANKLE_visibility_2d,LEFT_HEEL_x_2d,LEFT_HEEL_y_2d,LEFT_HEEL_z_2d,LEFT_HEEL_visibility_2d,RIGHT_HEEL_x_2d,RIGHT_HEEL_y_2d,RIGHT_HEEL_z_2d,RIGHT_HEEL_visibility_2d,LEFT_FOOT_INDEX_x_2d,LEFT_FOOT_INDEX_y_2d,LEFT_FOOT_INDEX_z_2d,LEFT_FOOT_INDEX_visibility_2d,RIGHT_FOOT_INDEX_x_2d,RIGHT_FOOT_INDEX_y_2d,RIGHT_FOOT_INDEX_z_2d,RIGHT_FOOT_INDEX_visibility_2d,NOSE_x_3d,NOSE_y_3d,NOSE_z_3d,NOSE_visibility_3d,LEFT_EYE_INNER_x_3d,LEFT_EYE_INNER_y_3d,LEFT_EYE_INNER_z_3d,LEFT_EYE_INNER_visibility_3d,LEFT_EYE_x_3d,LEFT_EYE_y_3d,LEFT_EYE_z_3d,LEFT_EYE_visibility_3d,LEFT_EYE_OUTER_x_3d,LEFT_EYE_OUTER_y_3d,LEFT_EYE_OUTER_z_3d,LEFT_EYE_OUTER_visibility_3d,RIGHT_EYE_INNER_x_3d,RIGHT_EYE_INNER_y_3d,RIGHT_EYE_INNER_z_3d,RIGHT_EYE_INNER_visibility_3d,RIGHT_EYE_x_3d,RIGHT_EYE_y_3d,RIGHT_EYE_z_3d,RIGHT_EYE_visibility_3d,RIGHT_EYE_OUTER_x_3d,RIGHT_EYE_OUTER_y_3d,RIGHT_EYE_OUTER_z_3d,RIGHT_EYE_OUTER_visibility_3d,LEFT_EAR_x_3d,LEFT_EAR_y_3d,LEFT_EAR_z_3d,LEFT_EAR_visibility_3d,RIGHT_EAR_x_3d,RIGHT_EAR_y_3d,RIGHT_EAR_z_3d,RIGHT_EAR_visibility_3d,MOUTH_LEFT_x_3d,MOUTH_LEFT_y_3d,MOUTH_LEFT_z_3d,MOUTH_LEFT_visibility_3d,MOUTH_RIGHT_x_3d,MOUTH_RIGHT_y_3d,MOUTH_RIGHT_z_3d,MOUTH_RIGHT_visibility_3d,LEFT_SHOULDER_x_3d,LEFT_SHOULDER_y_3d,LEFT_SHOULDER_z_3d,LEFT_SHOULDER_visibility_3d,RIGHT_SHOULDER_x_3d,RIGHT_SHOULDER_y_3d,RIGHT_SHOULDER_z_3d,RIGHT_SHOULDER_visibility_3d,LEFT_ELBOW_x_3d,LEFT_ELBOW_y_3d,LEFT_ELBOW_z_3d,LEFT_ELBOW_visibility_3d,RIGHT_ELBOW_x_3d,RIGHT_ELBOW_y_3d,RIGHT_ELBOW_z_3d,RIGHT_ELBOW_visibility_3d,LEFT_WRIST_x_3d,LEFT_WRIST_y_3d,LEFT_WRIST_z_3d,LEFT_WRIST_visibility_3d,RIGHT_WRIST_x_3d,RIGHT_WRIST_y_3d,RIGHT_WRIST_z_3d,RIGHT_WRIST_visibility_3d,LEFT_PINKY_x_3d,LEFT_PINKY_y_3d,LEFT_PINKY_z_3d,LEFT_PINKY_visibility_3d,RIGHT_PINKY_x_3d,RIGHT_PINKY_y_3d,RIGHT_PINKY_z_3d,RIGHT_PINKY_visibility_3d,LEFT_INDEX_x_3d,LEFT_INDEX_y_3d,LEFT_INDEX_z_3d,LEFT_INDEX_visibility_3d,RIGHT_INDEX_x_3d,RIGHT_INDEX_y_3d,RIGHT_INDEX_z_3d,RIGHT_INDEX_visibility_3d,LEFT_THUMB_x_3d,LEFT_THUMB_y_3d,LEFT_THUMB_z_3d,LEFT_THUMB_visibility_3d,RIGHT_THUMB_x_3d,RIGHT_THUMB_y_3d,RIGHT_THUMB_z_3d,RIGHT_THUMB_visibility_3d,LEFT_HIP_x_3d,LEFT_HIP_y_3d,LEFT_HIP_z_3d,LEFT_HIP_visibility_3d,RIGHT_HIP_x_3d,RIGHT_HIP_y_3d,RIGHT_HIP_z_3d,RIGHT_HIP_visibility_3d,LEFT_KNEE_x_3d,LEFT_KNEE_y_3d,LEFT_KNEE_z_3d,LEFT_KNEE_visibility_3d,RIGHT_KNEE_x_3d,RIGHT_KNEE_y_3d,RIGHT_KNEE_z_3d,RIGHT_KNEE_visibility_3d,LEFT_ANKLE_x_3d,LEFT_ANKLE_y_3d,LEFT_ANKLE_z_3d,LEFT_ANKLE_visibility_3d,RIGHT_ANKLE_x_3d,RIGHT_ANKLE_y_3d,RIGHT_ANKLE_z_3d,RIGHT_ANKLE_visibility_3d,LEFT_HEEL_x_3d,LEFT_HEEL_y_3d,LEFT_HEEL_z_3d,LEFT_HEEL_visibility_3d,RIGHT_HEEL_x_3d,RIGHT_HEEL_y_3d,RIGHT_HEEL_z_3d,RIGHT_HEEL_visibility_3d,LEFT_FOOT_INDEX_x_3d,LEFT_FOOT_INDEX_y_3d,LEFT_FOOT_INDEX_z_3d,LEFT_FOOT_INDEX_visibility_3d,RIGHT_FOOT_INDEX_x_3d,RIGHT_FOOT_INDEX_y_3d,RIGHT_FOOT_INDEX_z_3d,RIGHT_FOOT_INDEX_visibility_3d
# There are 33 joints, each with a 2d and 3d visibility column (as well as the x, y, z coordinates).
# Only the _visibility_2d columns are used for visibility purposes in this script (as they are always the same as the _visibility_3d columns).

def flatmap(func, iterable):
    return itertools.chain.from_iterable(map(func, iterable))

def calculate_motion_energy(file_df: pd.DataFrame, joint_names: t.List[str], visibility_threshold: float) -> pd.DataFrame:
    """
    Calculate 2D and 3D motion energy timeseries for each joint in the given DataFrame,
    filtered by visibility threshold and consecutive rows.

    Args:
        file_df (pd.DataFrame): DataFrame containing pose data for a single file.
        joint_names (List[str]): List of joint names to calculate motion energy for.
        visibility_threshold (float): Threshold for visibility filtering.

    Returns:
        pd.DataFrame: DataFrame containing motion energy for each joint (columns suffixed with '_motion_energy_2d' and '_motion_energy_3d').
    """
    motion_energy_data = {}

    for joint in joint_names:
        joint_2d_vis = joint + "_visibility_2d"
        joint_x_2d = joint + "_x_2d"
        joint_y_2d = joint + "_y_2d"
        joint_x_3d = joint + "_x_3d"
        joint_y_3d = joint + "_y_3d"
        joint_z_3d = joint + "_z_3d"

        # Calculate raw energy with all rows included
        raw_energy_2d = (
            (file_df[joint_x_2d].diff()**2 +
             file_df[joint_y_2d].diff()**2)
        ).fillna(0)

        raw_energy_3d = (
            (file_df[joint_x_3d].diff()**2 +
             file_df[joint_y_3d].diff()**2 +
             file_df[joint_z_3d].diff()**2)
        ).fillna(0)

        # Create a new column for min visibility between consecutive rows
        file_df[joint + "_min_visibility"] = file_df[joint_2d_vis].combine(file_df[joint_2d_vis].shift(), min)

        # Filter rows based on visibility threshold and consecutive rows
        valid_rows = file_df[joint + "_min_visibility"] >= visibility_threshold
        # remove first row (there's no previous row to compare to)
        valid_rows = valid_rows & (file_df.index > 0)

        # Calculate filtered energy
        filtered_energy_2d = raw_energy_2d[valid_rows]
        filtered_energy_3d = raw_energy_3d[valid_rows]

        motion_energy_data[f"{joint}_motion_energy_2d"] = filtered_energy_2d
        motion_energy_data[f"{joint}_motion_energy_3d"] = filtered_energy_3d

    return pd.DataFrame(motion_energy_data)

def calculate_visibility_distribution(visibility_df: pd.DataFrame, joint_names: t.List[str], parentdir: str, visibility_output_dir: Path):
    """
    Calculate and plot visibility distributions for each joint.

    Args:
        visibility_df (pd.DataFrame): DataFrame containing visibility data.
        joint_names (List[str]): List of joint names.
        parentdir (str): Parent directory name for output.
        visibility_output_dir (Path): Directory to save plots.
    """
    # Calculate mean visibility
    visibility_by_joint = visibility_df.mean().to_frame(name="mean_visibility").reset_index()
    visibility_by_joint.columns = ["joint", "mean_visibility"]
    visibility_by_joint["parentdir"] = parentdir
    visibility_by_joint["joint"] = visibility_by_joint["joint"].str.replace("_visibility_2d", "")

    # Plot boxplot of visibility distribution
    fig, ax = plt.subplots(figsize=(12, 6))
    visibility_df.boxplot(
        grid=False,
        rot=90,
        showfliers=False,
        ax=ax
    )
    # ax.set_title(f"Joint Visibility Distribution in {parentdir}")
    ax.set_ylabel("Visibility")
    ax.set_xlabel("Joint")
    ax.set_xticklabels(visibility_by_joint["joint"], rotation=90)
    fig_path = visibility_output_dir / f"{parentdir}.mean_joint_visibility.png"
    ax.figure.savefig(str(fig_path), bbox_inches='tight', dpi=300)
    ax.figure.clf()  # Clear the figure to free memory
    print(f"\tSaved joint visibility plot to {fig_path.relative_to(visibility_output_dir)}")

    # Plot histogram for each joint
    num_joints = len(joint_names)
    num_cols = 5
    num_rows = (num_joints + num_cols - 1) // num_cols  # Ceiling division
    fig, axs = plt.subplots(num_rows, num_cols, figsize=(15, 3 * num_rows), squeeze=False)
    axs = axs.flatten()
    for i, joint in enumerate(joint_names):
        ax = axs[i]
        visibility_df[joint + "_visibility_2d"].hist(bins=30, ax=ax, color='blue', alpha=0.7)
        ax.set_title(f"{joint} Visibility Distribution")
        ax.set_xlabel("Visibility")
        ax.set_ylabel("Frequency")
        ax.set_xlim(0, 1)
        ax.grid(False)
    for j in range(i + 1, len(axs)):
        axs[j].axis('off')
    fig_path = visibility_output_dir / f"{parentdir}.visibility_histogram.png"
    fig.suptitle(f"Joint Visibility Distributions in {parentdir}", fontsize=16)
    plt.tight_layout()
    plt.savefig(str(fig_path), bbox_inches='tight', dpi=300)
    plt.close(fig)
    print(f"\tSaved joint visibility histogram plot to {fig_path.relative_to(visibility_output_dir)}")

    # Plot overall visibility distribution
    fig, ax = plt.subplots(figsize=(6, 4))
    all_visibility = visibility_df.melt(var_name="Joint", value_name="Visibility")["Visibility"]
    all_visibility.plot(kind='hist', bins=30, density=True, alpha=0.5, ax=ax, label='Visibility Histogram')
    all_visibility.plot(kind='kde', ax=ax, label='Estimated PDF', color='red')
    # ax.set_title(f"Overall Joint Visibility Distribution in {parentdir}")
    ax.set_xlabel("Visibility")
    ax.set_ylabel("Density")
    ax.set_xlim(0, 1)
    ax.legend()
    fig_path = visibility_output_dir / f"{parentdir}.overall_visibility_distribution.png"
    plt.savefig(str(fig_path), bbox_inches='tight', dpi=300)
    plt.close(fig)
    print(f"\tSaved overall visibility distribution plot to {fig_path.relative_to(visibility_output_dir)}")

# Argument parser setup
parser = argparse.ArgumentParser(description="Measure pose visibility from CSV files.")
parser.add_argument(
    "pose_csvfile_dirs",
    type=Path,
    nargs="*",
    default=[
        Path("../svelte-web-frontend/testResults/tiktoks-pixelposes-segmented"),
        Path("../svelte-web-frontend/testResults/study1-pixelposes-segmented"),
        Path("../svelte-web-frontend/testResults/study2-pixelposes-segmented"),
    ],
    help="Directories containing pose CSV files. Default is two directories with segmented poses.",
)
parser.add_argument(
    "--visibility_output_dir",
    type=Path,
    default=Path("../svelte-web-frontend/artifacts/pose_visibility"),
    help="Directory to save visibility plots. Default is '../svelte-web-frontend/artifacts/pose_visibility'.",
)
parser.add_argument(
    "--motion_energy_output_dir",
    type=Path,
    default=Path("../svelte-web-frontend/artifacts/pose_motion_energy"),
    help="Directory to save motion energy plots. Default is '../svelte-web-frontend/artifacts/pose_motion_energy'.",
)
parser.add_argument(
    "--visibility_threshold",
    type=float,
    default=0.9,
    help="Threshold for visibility to consider a joint as visible, range: [0, 1]. Default is 0.9.",
)
parser.add_argument(
    "--skip_visibility",
    action="store_true",
    help="Skip plotting visibility distributions. Default is False.",
)
parser.add_argument(
    "--skip_motion_energy",
    action="store_true",
    help="Skip plotting motion energy distributions. Default is False.",
)

args = parser.parse_args()

pose_csvfile_dirs: t.List[Path] = args.pose_csvfile_dirs
visibility_output_dir: Path = args.visibility_output_dir
visibility_output_dir.mkdir(parents=True, exist_ok=True)
motion_energy_output_dir: Path = args.motion_energy_output_dir
motion_energy_output_dir.mkdir(parents=True, exist_ok=True)

script_name = Path(__file__).name
print(f"{script_name}")

print(f"\toutput:\t{visibility_output_dir}")

posefiles_by_parentdir: t.Dict[str | Path, t.List[str | Path]] = {}
for dir in pose_csvfile_dirs:
    pose_csv_files = list(dir.glob("*.csv"))
    print(f"\t{len(pose_csv_files)} files\t{dir}")
    posefiles_by_parentdir[dir.name] = pose_csv_files

for parentdir, posefiles in posefiles_by_parentdir.items():
    print(f"Processing {len(posefiles)} files in {parentdir}")
    # Read all CSV files and concatenate them into a single DataFrame
    df = pd.concat([pd.read_csv(posefile) for posefile in posefiles], ignore_index=True)
    
    # Select only the visibility columns
    visibility_cols = [col for col in df.columns if "visibility_2d" in col]
    joint_names = [col.split("_visibility_2d")[0] for col in visibility_cols]
    visibility_df = df[visibility_cols]

    if not args.skip_visibility:
        calculate_visibility_distribution(visibility_df, joint_names, parentdir, visibility_output_dir)

    if not args.skip_motion_energy:
        visibility_threshold = args.visibility_threshold
        print(f"\tCalculating motion energy (using visibility threshold: {visibility_threshold:.2f})")

        # Accumulate motion energy of valid frames across all pose files, so that we can plot
        # the distribution of motion energy by joint across all files.
        motion_energy_dfs = []
        for posefile in tqdm(posefiles, desc="Processing pose files"):
            # Read the individual CSV file
            file_df = pd.read_csv(posefile)
            visibility_cols = [col for col in file_df.columns if "visibility_2d" in col]
            joint_names = [col.split("_visibility_2d")[0] for col in visibility_cols]

            # Calculate motion energy using the refactored function
            file_motion_energy = calculate_motion_energy(file_df, joint_names, visibility_threshold)

            motion_energy_dfs.append(file_motion_energy)
        
        # Concatenate all motion energy DataFrames
        motion_energy_df = pd.concat(motion_energy_dfs, ignore_index=True)
    
        # Determine columns for 2D and 3D motion energy
        cols_2d = [col for col in motion_energy_df.columns if col.endswith("_motion_energy_2d")]
        cols_3d = [col for col in motion_energy_df.columns if col.endswith("_motion_energy_3d")]

        # Compute the count of valid datapoints (non-NaN) for each joint column
        counts_2d = {col: motion_energy_df[col].count() for col in cols_2d}
        counts_3d = {col: motion_energy_df[col].count() for col in cols_3d}

        # --- 2D Motion Energy Plot ---
        fig_2d, ax_box_2d = plt.subplots(figsize=(12, 6))
        motion_energy_df.boxplot(
            column=cols_2d,
            grid=False,
            rot=90,
            showfliers=False,
            ax=ax_box_2d,
        )
        # ax_box_2d.set_title("2D Motion Energy")
        ax_box_2d.set_ylabel("Motion Energy per Frame")
        ax_box_2d.set_xlabel("Joint")
        labels_2d = [col.replace("_motion_energy_2d", "") for col in cols_2d]
        ax_box_2d.set_xticks(range(1, len(labels_2d) + 1))
        ax_box_2d.set_xticklabels(labels_2d, rotation=90)
        # fig_2d.suptitle(f"Framewise 2D Joint Motion Energy Distribution in {parentdir}", fontsize=14)
        fig_path_2d = motion_energy_output_dir / f"{parentdir}.joint_motion_energy_distribution_2d.png"
        fig_2d.savefig(str(fig_path_2d), bbox_inches='tight', dpi=300)
        plt.close(fig_2d)
        print(f"\tSaved 2D joint motion energy distribution plot to {fig_path_2d.relative_to(motion_energy_output_dir)}")

        # --- 3D Motion Energy Plot ---
        fig_3d, ax_box_3d = plt.subplots(figsize=(12, 6))
        motion_energy_df.boxplot(
            column=cols_3d,
            grid=False,
            rot=90,
            showfliers=False,
            ax=ax_box_3d,
        )
        # ax_box_3d.set_title("3D Motion Energy")
        ax_box_3d.set_ylabel("Motion Energy per Frame")
        ax_box_3d.set_xlabel("Joint")
        labels_3d = [col.replace("_motion_energy_3d", "") for col in cols_3d]
        ax_box_3d.set_xticks(range(1, len(labels_3d) + 1))
        ax_box_3d.set_xticklabels(labels_3d, rotation=90)
        # fig_3d.suptitle(f"3D Motion Energy Distribution in {parentdir}", fontsize=14)
        fig_path_3d = motion_energy_output_dir / f"{parentdir}.joint_motion_energy_distribution_3d.png"
        fig_3d.savefig(str(fig_path_3d), bbox_inches='tight', dpi=300)
        plt.close(fig_3d)
        print(f"\tSaved 3D joint motion energy distribution plot to {fig_path_3d.relative_to(motion_energy_output_dir)}")

        # --- Counts & Weights Table Plot ---
        # Now, we'll use the motion energy as a basis for suggesting a weighting for each joint.
        # In this secnario, a joint's typical contribution to the motion energy can be used to
        # determine how much it should be weighted in a pose quality metric.
        # We'll filter out joints that have too few valid frames, as well as those that have a
        # weight of < 1%.
        medians_2d = motion_energy_df[cols_2d].median().to_dict()
        counts_visible = {joint: motion_energy_df[joint + "_motion_energy_2d"].count() for joint in joint_names}
        get_joint_name = lambda col: col.replace("_motion_energy_2d", "").replace("_motion_energy_3d", "")
        MIN_COUNT = 100
        weights_2d = {
            get_joint_name(col): median
            for col, median in medians_2d.items()
            if counts_visible[get_joint_name(col)] >= MIN_COUNT and median > 0
        }
        total_weight = sum(weights_2d.values())
        # Normalize weights to sum to 100%
        if total_weight > 0:
            weights_2d = {joint: weight / total_weight for joint, weight in weights_2d.items()}
        
        medians_3d = motion_energy_df[cols_3d].median().to_dict()
        weights_3d = {
            get_joint_name(col): median
            for col, median in medians_3d.items()
            if counts_visible[get_joint_name(col)] >= MIN_COUNT and median > 0
        }
        total_weight = sum(weights_3d.values())
        # Normalize weights to sum to 100%
        if total_weight > 0:
            weights_3d = {joint: weight / total_weight for joint, weight in weights_3d.items()}
        weights_3d = {joint: weight for joint, weight in weights_3d.items() if weight >= 0.01}

        mean_weights = {
            joint: (weights_2d.get(joint, 0) + weights_3d.get(joint, 0)) / 2
            for joint in set(weights_2d.keys()).union(weights_3d.keys())
        }
        # filter out weights that are less than 1%
        mean_weights = {joint: weight for joint, weight in mean_weights.items() if weight >= 0.01}
        # reweigh the weights so that they sum to 1
        total_weight = sum(mean_weights.values())
        if total_weight > 0:
            mean_weights = {joint: weight / total_weight for joint, weight in mean_weights.items()}
        else:
            mean_weights = {}

        table_data_2d = {col.replace("_motion_energy_2d", ""): (counts_2d[col], mean_weights[get_joint_name(col)])  for col in cols_2d if get_joint_name(col) in mean_weights}
        table_data_2d = pd.DataFrame.from_dict(table_data_2d, orient='index', columns=['Count', 'Weight (frac)']).reset_index()
        fig_table, ax_table = plt.subplots(figsize=(8, 10))
        ax_table.axis('tight')
        table_data_2d['Weight (frac)'] = table_data_2d['Weight (frac)'].apply(lambda x: f"{x:.2f}")
        ax_table.axis('off')
        table_2d = ax_table.table(
            cellText=table_data_2d.values,
            colLabels=table_data_2d.columns,
            loc="center",
        )
        table_2d.auto_set_font_size(True)
        ax_table.set_title("Valid Frame Counts")
        fig_table.suptitle(f"Joint Counts and Weights in {parentdir}", fontsize=14)
        fig_path_table = motion_energy_output_dir / f"{parentdir}.joint_motion_energy_weights_table.png"
        fig_table.savefig(str(fig_path_table), bbox_inches='tight', dpi=300)
        plt.close(fig_table)
        print(f"\tSaved joint motion energy weights table to {fig_path_table.relative_to(motion_energy_output_dir)}")




