"""
Analysis of the distribution of joint visibility arising from pose estimation.

Takes in a bunch of CSV files containing pose data (generated with the getposes.py 
script using Google mediapipe).
"""
from pathlib import Path
import argparse
import itertools
import typing as t
import pandas as pd
import matplotlib.pyplot as plt

# Note: pose csv files have the following columns:
# frame,timestamp,is_valid,NOSE_x_2d,NOSE_y_2d,NOSE_z_2d,NOSE_visibility_2d,LEFT_EYE_INNER_x_2d,LEFT_EYE_INNER_y_2d,LEFT_EYE_INNER_z_2d,LEFT_EYE_INNER_visibility_2d,LEFT_EYE_x_2d,LEFT_EYE_y_2d,LEFT_EYE_z_2d,LEFT_EYE_visibility_2d,LEFT_EYE_OUTER_x_2d,LEFT_EYE_OUTER_y_2d,LEFT_EYE_OUTER_z_2d,LEFT_EYE_OUTER_visibility_2d,RIGHT_EYE_INNER_x_2d,RIGHT_EYE_INNER_y_2d,RIGHT_EYE_INNER_z_2d,RIGHT_EYE_INNER_visibility_2d,RIGHT_EYE_x_2d,RIGHT_EYE_y_2d,RIGHT_EYE_z_2d,RIGHT_EYE_visibility_2d,RIGHT_EYE_OUTER_x_2d,RIGHT_EYE_OUTER_y_2d,RIGHT_EYE_OUTER_z_2d,RIGHT_EYE_OUTER_visibility_2d,LEFT_EAR_x_2d,LEFT_EAR_y_2d,LEFT_EAR_z_2d,LEFT_EAR_visibility_2d,RIGHT_EAR_x_2d,RIGHT_EAR_y_2d,RIGHT_EAR_z_2d,RIGHT_EAR_visibility_2d,MOUTH_LEFT_x_2d,MOUTH_LEFT_y_2d,MOUTH_LEFT_z_2d,MOUTH_LEFT_visibility_2d,MOUTH_RIGHT_x_2d,MOUTH_RIGHT_y_2d,MOUTH_RIGHT_z_2d,MOUTH_RIGHT_visibility_2d,LEFT_SHOULDER_x_2d,LEFT_SHOULDER_y_2d,LEFT_SHOULDER_z_2d,LEFT_SHOULDER_visibility_2d,RIGHT_SHOULDER_x_2d,RIGHT_SHOULDER_y_2d,RIGHT_SHOULDER_z_2d,RIGHT_SHOULDER_visibility_2d,LEFT_ELBOW_x_2d,LEFT_ELBOW_y_2d,LEFT_ELBOW_z_2d,LEFT_ELBOW_visibility_2d,RIGHT_ELBOW_x_2d,RIGHT_ELBOW_y_2d,RIGHT_ELBOW_z_2d,RIGHT_ELBOW_visibility_2d,LEFT_WRIST_x_2d,LEFT_WRIST_y_2d,LEFT_WRIST_z_2d,LEFT_WRIST_visibility_2d,RIGHT_WRIST_x_2d,RIGHT_WRIST_y_2d,RIGHT_WRIST_z_2d,RIGHT_WRIST_visibility_2d,LEFT_PINKY_x_2d,LEFT_PINKY_y_2d,LEFT_PINKY_z_2d,LEFT_PINKY_visibility_2d,RIGHT_PINKY_x_2d,RIGHT_PINKY_y_2d,RIGHT_PINKY_z_2d,RIGHT_PINKY_visibility_2d,LEFT_INDEX_x_2d,LEFT_INDEX_y_2d,LEFT_INDEX_z_2d,LEFT_INDEX_visibility_2d,RIGHT_INDEX_x_2d,RIGHT_INDEX_y_2d,RIGHT_INDEX_z_2d,RIGHT_INDEX_visibility_2d,LEFT_THUMB_x_2d,LEFT_THUMB_y_2d,LEFT_THUMB_z_2d,LEFT_THUMB_visibility_2d,RIGHT_THUMB_x_2d,RIGHT_THUMB_y_2d,RIGHT_THUMB_z_2d,RIGHT_THUMB_visibility_2d,LEFT_HIP_x_2d,LEFT_HIP_y_2d,LEFT_HIP_z_2d,LEFT_HIP_visibility_2d,RIGHT_HIP_x_2d,RIGHT_HIP_y_2d,RIGHT_HIP_z_2d,RIGHT_HIP_visibility_2d,LEFT_KNEE_x_2d,LEFT_KNEE_y_2d,LEFT_KNEE_z_2d,LEFT_KNEE_visibility_2d,RIGHT_KNEE_x_2d,RIGHT_KNEE_y_2d,RIGHT_KNEE_z_2d,RIGHT_KNEE_visibility_2d,LEFT_ANKLE_x_2d,LEFT_ANKLE_y_2d,LEFT_ANKLE_z_2d,LEFT_ANKLE_visibility_2d,RIGHT_ANKLE_x_2d,RIGHT_ANKLE_y_2d,RIGHT_ANKLE_z_2d,RIGHT_ANKLE_visibility_2d,LEFT_HEEL_x_2d,LEFT_HEEL_y_2d,LEFT_HEEL_z_2d,LEFT_HEEL_visibility_2d,RIGHT_HEEL_x_2d,RIGHT_HEEL_y_2d,RIGHT_HEEL_z_2d,RIGHT_HEEL_visibility_2d,LEFT_FOOT_INDEX_x_2d,LEFT_FOOT_INDEX_y_2d,LEFT_FOOT_INDEX_z_2d,LEFT_FOOT_INDEX_visibility_2d,RIGHT_FOOT_INDEX_x_2d,RIGHT_FOOT_INDEX_y_2d,RIGHT_FOOT_INDEX_z_2d,RIGHT_FOOT_INDEX_visibility_2d,NOSE_x_3d,NOSE_y_3d,NOSE_z_3d,NOSE_visibility_3d,LEFT_EYE_INNER_x_3d,LEFT_EYE_INNER_y_3d,LEFT_EYE_INNER_z_3d,LEFT_EYE_INNER_visibility_3d,LEFT_EYE_x_3d,LEFT_EYE_y_3d,LEFT_EYE_z_3d,LEFT_EYE_visibility_3d,LEFT_EYE_OUTER_x_3d,LEFT_EYE_OUTER_y_3d,LEFT_EYE_OUTER_z_3d,LEFT_EYE_OUTER_visibility_3d,RIGHT_EYE_INNER_x_3d,RIGHT_EYE_INNER_y_3d,RIGHT_EYE_INNER_z_3d,RIGHT_EYE_INNER_visibility_3d,RIGHT_EYE_x_3d,RIGHT_EYE_y_3d,RIGHT_EYE_z_3d,RIGHT_EYE_visibility_3d,RIGHT_EYE_OUTER_x_3d,RIGHT_EYE_OUTER_y_3d,RIGHT_EYE_OUTER_z_3d,RIGHT_EYE_OUTER_visibility_3d,LEFT_EAR_x_3d,LEFT_EAR_y_3d,LEFT_EAR_z_3d,LEFT_EAR_visibility_3d,RIGHT_EAR_x_3d,RIGHT_EAR_y_3d,RIGHT_EAR_z_3d,RIGHT_EAR_visibility_3d,MOUTH_LEFT_x_3d,MOUTH_LEFT_y_3d,MOUTH_LEFT_z_3d,MOUTH_LEFT_visibility_3d,MOUTH_RIGHT_x_3d,MOUTH_RIGHT_y_3d,MOUTH_RIGHT_z_3d,MOUTH_RIGHT_visibility_3d,LEFT_SHOULDER_x_3d,LEFT_SHOULDER_y_3d,LEFT_SHOULDER_z_3d,LEFT_SHOULDER_visibility_3d,RIGHT_SHOULDER_x_3d,RIGHT_SHOULDER_y_3d,RIGHT_SHOULDER_z_3d,RIGHT_SHOULDER_visibility_3d,LEFT_ELBOW_x_3d,LEFT_ELBOW_y_3d,LEFT_ELBOW_z_3d,LEFT_ELBOW_visibility_3d,RIGHT_ELBOW_x_3d,RIGHT_ELBOW_y_3d,RIGHT_ELBOW_z_3d,RIGHT_ELBOW_visibility_3d,LEFT_WRIST_x_3d,LEFT_WRIST_y_3d,LEFT_WRIST_z_3d,LEFT_WRIST_visibility_3d,RIGHT_WRIST_x_3d,RIGHT_WRIST_y_3d,RIGHT_WRIST_z_3d,RIGHT_WRIST_visibility_3d,LEFT_PINKY_x_3d,LEFT_PINKY_y_3d,LEFT_PINKY_z_3d,LEFT_PINKY_visibility_3d,RIGHT_PINKY_x_3d,RIGHT_PINKY_y_3d,RIGHT_PINKY_z_3d,RIGHT_PINKY_visibility_3d,LEFT_INDEX_x_3d,LEFT_INDEX_y_3d,LEFT_INDEX_z_3d,LEFT_INDEX_visibility_3d,RIGHT_INDEX_x_3d,RIGHT_INDEX_y_3d,RIGHT_INDEX_z_3d,RIGHT_INDEX_visibility_3d,LEFT_THUMB_x_3d,LEFT_THUMB_y_3d,LEFT_THUMB_z_3d,LEFT_THUMB_visibility_3d,RIGHT_THUMB_x_3d,RIGHT_THUMB_y_3d,RIGHT_THUMB_z_3d,RIGHT_THUMB_visibility_3d,LEFT_HIP_x_3d,LEFT_HIP_y_3d,LEFT_HIP_z_3d,LEFT_HIP_visibility_3d,RIGHT_HIP_x_3d,RIGHT_HIP_y_3d,RIGHT_HIP_z_3d,RIGHT_HIP_visibility_3d,LEFT_KNEE_x_3d,LEFT_KNEE_y_3d,LEFT_KNEE_z_3d,LEFT_KNEE_visibility_3d,RIGHT_KNEE_x_3d,RIGHT_KNEE_y_3d,RIGHT_KNEE_z_3d,RIGHT_KNEE_visibility_3d,LEFT_ANKLE_x_3d,LEFT_ANKLE_y_3d,LEFT_ANKLE_z_3d,LEFT_ANKLE_visibility_3d,RIGHT_ANKLE_x_3d,RIGHT_ANKLE_y_3d,RIGHT_ANKLE_z_3d,RIGHT_ANKLE_visibility_3d,LEFT_HEEL_x_3d,LEFT_HEEL_y_3d,LEFT_HEEL_z_3d,LEFT_HEEL_visibility_3d,RIGHT_HEEL_x_3d,RIGHT_HEEL_y_3d,RIGHT_HEEL_z_3d,RIGHT_HEEL_visibility_3d,LEFT_FOOT_INDEX_x_3d,LEFT_FOOT_INDEX_y_3d,LEFT_FOOT_INDEX_z_3d,LEFT_FOOT_INDEX_visibility_3d,RIGHT_FOOT_INDEX_x_3d,RIGHT_FOOT_INDEX_y_3d,RIGHT_FOOT_INDEX_z_3d,RIGHT_FOOT_INDEX_visibility_3d
# There are 33 joints, each with a 2d and 3d visibility column (as well as the x, y, z coordinates).
# Only the _visibility_2d columns are used in this script (as they are always the same as the _visibility_3d columns).

def flatmap(func, iterable):
    return itertools.chain.from_iterable(map(func, iterable))

# Argument parser setup
parser = argparse.ArgumentParser(description="Measure pose visibility from CSV files.")
parser.add_argument(
    "pose_csvfile_dirs",
    type=Path,
    nargs="*",
    default=[
        Path("../svelte-web-frontend/testResults/study1-pixelposes-segmented"),
        Path("../svelte-web-frontend/testResults/study2-pixelposes-segmented"),
    ],
    help="Directories containing pose CSV files. Default is two directories with segmented poses.",
)
parser.add_argument(
    "--output_dir",
    type=Path,
    default=Path("../svelte-web-frontend/artifacts/pose_visibility"),
)

args = parser.parse_args()
pose_csvfile_dirs: t.List[Path] = args.pose_csvfile_dirs
output_dir: Path = args.output_dir
output_dir.mkdir(parents=True, exist_ok=True)

script_name = Path(__file__).name
print(f"{script_name}")

print(f"\toutput:\t{output_dir}")

posefiles_by_parentdir: t.Dict[Path, t.List[str]] = {}
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

    # First, plot the visibility distribution for each joint, so
    # that we can see which joints tend to be more visible.
    visibility_by_joint = visibility_df.mean().to_frame(name="mean_visibility").reset_index()
    visibility_by_joint.columns = ["joint", "mean_visibility"]
    visibility_by_joint["parentdir"] = parentdir
    visibility_by_joint["joint"] = visibility_by_joint["joint"].str.replace("_visibility_2d", "")

    fig, ax = plt.subplots(figsize=(12, 6))
    visibility_df.boxplot(
        column=visibility_cols,
        grid=False,
        rot=90,
        showfliers=False,
        ax=ax,
    )
    ax.set_title(f"Joint Visibility Distribution in {parentdir}")
    ax.set_ylabel("Visibility")
    ax.set_xlabel("Joint")
    ax.set_xticklabels(visibility_by_joint["joint"], rotation=90)
    ax.set_title(f"Joint Visibility {parentdir}")
    fig_path = fig_outputdir = output_dir / (parentdir + ".mean_joint_visibility.png")
    ax.figure.savefig(str(fig_path), bbox_inches='tight')
    ax.figure.clf()  # Clear the figure to free memory
    print(f"\tSaved joint visibility plot to {fig_path.relative_to(output_dir)}")

    # Second, plot the visibility distribution as a histogram for each joint (histogram)
    # There are 33 joints, so we will plot them in a 7x5 grid of subplots.
    num_joints = len(joint_names)
    num_cols = 5
    num_rows = (num_joints + num_cols - 1) // num_cols  # Ceiling division to get number of rows
    fig, axs = plt.subplots(num_rows, num_cols, figsize=(15, 3 * num_rows), squeeze=False)
    axs = axs.flatten()  # Flatten the 2D array of axes for easy iteration
    for i, joint in enumerate(joint_names):
        ax = axs[i]
        visibility_df[joint + "_visibility_2d"].hist(bins=30, ax=ax, color='blue', alpha=0.7)
        ax.set_title(f"{joint} Visibility Distribution")
        ax.set_xlabel("Visibility")
        ax.set_ylabel("Frequency")
        ax.set_xlim(0, 1)  # Visibility is between 0 and 1
        ax.grid(False)
    # Hide any unused subplots
    for j in range(i + 1, len(axs)):
        axs[j].axis('off')
        
    fig_path = output_dir / f"{parentdir}.visibility_histogram.png"
    fig.suptitle(f"Joint Visibility Distributions in {parentdir}", fontsize=16)
    plt.tight_layout()
    plt.savefig(str(fig_path), bbox_inches='tight')
    plt.close(fig)  # Close the figure to free memory
    print(f"\tSaved joint visibility histogram plot to {fig_path.relative_to(output_dir)}")

    # Third, plot the overall visibliity distribution as a histogram
    # overlaid with an estimated PDF (probability density function).
    fig, ax = plt.subplots(figsize=(6, 4))
    all_visiblity = visibility_df.melt(var_name="Joint", value_name="Visibility")["Visibility"]
    all_visiblity.plot(
        kind='hist', bins=30, density=True, alpha=0.5, ax=ax, label='Visibility Histogram'
    )
    all_visiblity.plot(kind='kde', ax=ax, label='Estimated PDF', color='red')
    ax.set_title(f"Overall Joint Visibility Distribution in {parentdir}")
    ax.set_xlabel("Visibility")
    ax.set_ylabel("Density")
    ax.set_xlim(0, 1)  # Visibility is between 0 and 1
    ax.legend()
    fig_path = output_dir / f"{parentdir}.overall_visibility_distribution.png"
    plt.savefig(str(fig_path), bbox_inches='tight')
    plt.close(fig)  # Close the figure to free memory
    print(f"\tSaved overall visibility distribution plot to {fig_path.relative_to(output_dir)}")





    
    