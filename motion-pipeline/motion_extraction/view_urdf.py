from pathlib import Path
from typing import Mapping, Optional
from argparse import ArgumentParser
from pytransform3d.urdf import UrdfTransformManager
import pytransform3d.visualizer as pv
import matplotlib.pyplot as plt
from matplotlib.axes import Axes

DEFAULT_NAO_URDF_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "nao"
    / "naoV50_urdf"
    / "nao.urdf"
)

def display_urdf(
    urdf_path: Path = DEFAULT_NAO_URDF_PATH,
    joint_values: Optional[Mapping[str, float]] = None,
    fig_title: Optional[str] = None,
    block: bool = True,
):
    tm = load_urdf(urdf_path)

    if fig_title is not None:
        fig = plt.gcf()
        fig.canvas.manager.set_window_title(fig_title)

    plot_urdf(tm, joint_values or {})
    plt.show(block=block)

def load_urdf(urdf_path: Path = DEFAULT_NAO_URDF_PATH):
    tm = UrdfTransformManager()
    with urdf_path.open('r') as f:
        tm.load_urdf(f.read())
    return tm

def plot_urdf(
    urdf_tm: UrdfTransformManager,
    joint_values: Mapping[str, float],
    ax: Optional[Axes] = None,
):
    if ax is None:
        ax = plt.gca()
    
    for key, value in joint_values.items():
        urdf_tm.set_joint(key, value)

    urdf_tm.plot_connections_in('torso', ax=ax)
    # tm.plot_frames_in('torso', s=0.1)

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
