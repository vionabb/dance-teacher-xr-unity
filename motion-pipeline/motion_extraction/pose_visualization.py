from pathlib import Path
from typing import Literal
import matplotlib.pyplot as plt
from numpy import isnan
import pandas as pd
from .mp_utils import HAND_CONNECTIONS, POSE_CONNECTIONS, HandLandmark, PoseLandmark

POSE_CONNETIONS = POSE_CONNECTIONS

lm_pose_connections = [
    (PoseLandmark(i), PoseLandmark(j)) for i, j in POSE_CONNETIONS
]
lm_hand_connections = [
    (HandLandmark(i), HandLandmark(j)) for i, j in HAND_CONNECTIONS
]
# Useful tutorial: https://matplotlib.org/stable/tutorials/toolkits/mplot3d.html

def visualize_pose(pose_row: pd.Series, block=True):
    fig = plt.figure("Pose Visualization")
    ax = fig.add_subplot(projection='3d')

    xyz_tuples = [
        (pose_row[f'{i.name}_x'], pose_row[f'{i.name}_y'], pose_row[f'{i.name}_z'], i.name)
        for i in PoseLandmark
    ]
    xyz_tuples = [
        (x, y, z, name)
        for x, y, z, name in xyz_tuples
        if not isnan(x) and not isnan(y) and not isnan(z)
    ]

    # for x, y, z, l in xyz_tuples:
        # ax.scatter(x, y, z, label=l)
    # ax.legend()

    ax.set_xlabel('x')
    ax.set_ylabel('y')
    ax.set_zlabel('z')

    xs, ys, zs, labels = list(zip(*xyz_tuples))
    ax.scatter(xs, ys, zs,c='red')

    # Draw Connections
    for i, j in lm_pose_connections:
        x1, y1, z1 = pose_row[f'{i.name}_x'], pose_row[f'{i.name}_y'], pose_row[f'{i.name}_z']
        x2, y2, z2 = pose_row[f'{j.name}_x'], pose_row[f'{j.name}_y'], pose_row[f'{j.name}_z']

        if isnan(x1) or isnan(y1) or isnan(z1) or isnan(x2) or isnan(y2) or isnan(z2):
            continue

        ax.plot([x1, x2], [y1, y2], zs=[z1, z2], color='black')
    plt.show(block=block)


def visualize_hand(hand_row: pd.Series, prefix: Literal["RIGHTHAND_", "LEFTHAND_", ""] = "RIGHTHAND_"):
    
    fig = plt.figure("Hand Visualization")
    ax = fig.add_subplot(projection='3d')


    xyz_tuples = [
        (hand_row[f'{prefix}{i.name}_x'], hand_row[f'{prefix}{i.name}_y'], hand_row[f'{prefix}{i.name}_z'], i.name)
        for i in HandLandmark
    ]
    xyz_tuples = [
        (x, y, z, name)
        for x, y, z, name in xyz_tuples
        if not isnan(x) and not isnan(y) and not isnan(z)
    ]
    ax.set_xlabel('x')
    ax.set_ylabel('y')
    ax.set_zlabel('z')

    xs, ys, zs, labels = list(zip(*xyz_tuples))
    ax.scatter(xs, ys, zs,c='red')

    for i, j in lm_hand_connections:
        x1, y1, z1 = hand_row[f'{prefix}{i.name}_x'], hand_row[f'{prefix}{i.name}_y'], hand_row[f'{prefix}{i.name}_z']
        x2, y2, z2 = hand_row[f'{prefix}{j.name}_x'], hand_row[f'{prefix}{j.name}_y'], hand_row[f'{prefix}{j.name}_z']

        if isnan(x1) or isnan(y1) or isnan(z1) or isnan(x2) or isnan(y2) or isnan(z2):
            continue

        ax.plot([x1, x2], [y1, y2], zs=[z1, z2], color='black')

    plt.show(block=True)

def visualize_skeleton(skeleton_row: pd.Series):
    pass


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--pose_file', type=Path)
    parser.add_argument('--hand_file', type=Path)

    args = parser.parse_args()

    if args.pose_file is not None:
        world_poses = pd.read_csv(
            args.pose_file,
            header='infer',
            index_col='frame',
        )
        visualize_pose(world_poses.iloc[len(world_poses) // 2])

    if args.hand_file is not None:
        hand_poses = pd.read_csv(
            args.hand_file,
            header='infer',
            index_col='frame',
        )
        visualize_hand(hand_poses.iloc[len(hand_poses) // 2])
