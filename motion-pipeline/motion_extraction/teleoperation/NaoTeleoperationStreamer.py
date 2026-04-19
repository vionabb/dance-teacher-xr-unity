from asyncio import Future
from collections import deque
from dataclasses import dataclass
from typing import Deque, List, Literal, Union
from matplotlib import pyplot as plt
from matplotlib.axes import Axes
import pandas as pd
from ..motion_output_provider import NaoTrajectoryOutputProvider
from ..view_urdf import load_urdf, plot_urdf
from ..extract_holistic_data import transform_to_holistic_csvrow
from ..MecanimHumanoid import HumanoidPositionSkeleton
import json
import socket

@dataclass
class NaoTeleoperationListener:
    name: str
    ip: int
    port: int
    # protocol: str = 'http'

class NaoTeleoperationStreamer:

    def __init__(self, urdf_display_axes: Axes = None, skeleton_display_axes: Axes = None):
        self.urdf_ax = urdf_display_axes
        self.skeleton_display_ax = skeleton_display_axes

        self.traj_output_provider = NaoTrajectoryOutputProvider('temp/nao_ctl.csv')
        self.frame_i = 0
        self.listeners: List[NaoTeleoperationListener] = []        
        
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.socket.setblocking(False)

        if self.urdf_ax is not None:
            self.urdf_tm = load_urdf()

    def register_listener(self, name: str, listener_ip: Union[int, Literal['localhost']], listener_port: int):
        self.listeners.append(
            NaoTeleoperationListener(
                name, 
                listener_ip, 
                listener_port
            )
        )

    def on_pose(self, holistic_row: Union[pd.Series, None]):
        if holistic_row is None:
            return

        skel = HumanoidPositionSkeleton.from_mp_pose(holistic_row)
        tfs = skel.get_transforms(plot=False)
        nao_ctl = self.traj_output_provider.process_frame(skel, tfs, record_to_dataframe=False)
        self.frame_i += 1
        self.forward_to_listeners(nao_ctl)

        if self.urdf_ax is not None:
            self.urdf_ax.clear()
            plot_urdf(
                self.urdf_tm, 
                joint_values=nao_ctl.to_dict(),
                ax=self.urdf_ax
            )
        
        if self.skeleton_display_ax is not None:
            self.skeleton_display_ax.clear()
            skel.plt_skeleton(self.skeleton_display_ax, color="#8f8b99", dotcolor="#4a20ab")

    def forward_to_listeners(self, nao_ctl: pd.Series):
        ctl = nao_ctl.to_dict()
        ctl_str = json.dumps(ctl).encode('utf-8')
        for i in range(len(self.listeners)):
            self.socket.sendto(
                ctl_str, (self.listeners[i].ip, self.listeners[i].port)
            )