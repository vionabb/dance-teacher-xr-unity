"""URDF visualization utilities for the NAO robot.

Provides helpers to load a URDF file, set joint angles, and render a
matplotlib plot of the robot's kinematic chain.  The default URDF path
resolves relative to the repository's ``data/urdf`` folder so the file
works without hard-coded machine-specific paths.
"""

from pathlib import Path
from typing import Dict, Optional
from argparse import ArgumentParser
from pytransform3d.urdf import UrdfTransformManager
import pytransform3d.visualizer as pv
import matplotlib.pyplot as plt
from matplotlib.axes import Axes

# Default NAO URDF path, relative to the motion-pipeline project root.
_DEFAULT_NAO_URDF_PATH = Path(__file__).resolve().parents[3] / "data" / "urdf" / "naoV50_generated_urdf" / "nao.urdf"


def display_urdf(urdf_path: Path = _DEFAULT_NAO_URDF_PATH, joint_values: Dict[str, float] = {}, fig_title: Optional[str] = None, block=True):
    """Load a URDF and display it with the given joint angles.

    Args:
        urdf_path: Path to the ``.urdf`` file to load.
        joint_values: Mapping of joint name → angle (radians).
        fig_title: Optional title for the matplotlib window.
        block: Whether to block until the plot window is closed.
    """
    tm = load_urdf(urdf_path)

    if fig_title is not None:
        fig = plt.gcf()
        fig.canvas.manager.set_window_title(fig_title)

    plot_urdf(tm, joint_values, block=block)
    plt.show(block=block)


def load_urdf(urdf_path: Path = _DEFAULT_NAO_URDF_PATH) -> UrdfTransformManager:
    """Load a URDF file and return a pytransform3d UrdfTransformManager.

    Args:
        urdf_path: Path to the ``.urdf`` file.

    Returns:
        A populated ``UrdfTransformManager`` ready for kinematic queries.
    """
    tm = UrdfTransformManager()
    with urdf_path.open('r') as f:
        tm.load_urdf(f.read())
    return tm


def plot_urdf(urdf_tm: UrdfTransformManager, joint_values: Dict[str, float], ax: Axes = None):
    """Render the URDF kinematic chain into a matplotlib Axes.

    Args:
        urdf_tm: A loaded ``UrdfTransformManager``.
        joint_values: Mapping of joint name → angle (radians) to apply before plotting.
        ax: Matplotlib axes to draw into; uses the current axes if ``None``.
    """
    if ax is None:
        ax = plt.gca()

    for key, value in joint_values.items():
        urdf_tm.set_joint(key, value)

    urdf_tm.plot_connections_in('torso', ax=ax)


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument('urdf_path', type=Path)
    args = parser.parse_args()

    joint_values = {
        'LElbowRoll': -0.8681809384798285,
        'LElbowYaw': -2.0857,
        'LShoulderPitch': 1.4203183290769317,
        'LShoulderRoll': 0.24367291711909592,
        'RElbowRoll': 0.5987513709494573,
        'RElbowYaw': -0.695563051834121,
        'RShoulderPitch': 1.3295914070059884,
        'RShoulderRoll': 0.3142
    }

    display_urdf(args.urdf_path, joint_values)
