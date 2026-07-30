"""
    Robot Trajectory Mapper

    Integrates into step two to produce a robot output
"""
from enum import Enum, auto
from random import sample
import pandas as pd
import numpy as np
from typing import Dict, Optional
import pytransform3d.rotations as pr
from motion_extraction.MecanimHumanoid import MecanimBone
from .MotionOutputProvider import MotionOutputProvider, HumanoidPositionSkeleton, TransformManager, Path

from ..teleoperation.view_urdf import display_urdf

class NaoMotor(Enum):
    HeadYaw = auto()
    HeadPitch = auto()
    LShoulderPitch = auto()
    LShoulderRoll = auto()
    LElbowYaw = auto()
    LElbowRoll = auto()
    # LWristYaw = auto()
    # LHand = auto()
    RShoulderPitch = auto()
    RShoulderRoll = auto()
    RElbowYaw = auto()
    RElbowRoll = auto()
    # RWristYaw = auto()
    # RHand = auto()
    # LHipYawPitch = auto()
    # LHipRoll = auto()
    # LHipPitch = auto()
    # LKneePitch = auto()
    # LAnklePitch = auto()
    # LAnkleRoll = auto()
    # RHipYawPitch = auto()
    # RHipRoll = auto()
    # RHipPitch = auto()
    # RKneePitch = auto()
    # RAnklePitch = auto()
    # RAnkleRoll = auto()

    @property
    def range_min(self):
        match self:
            case NaoMotor.HeadYaw: return -2.0857
            case NaoMotor.HeadPitch: return -0.6720
            case NaoMotor.LShoulderPitch: return -2.0857
            case NaoMotor.LShoulderRoll: return -0.3142
            case NaoMotor.LElbowYaw: return -2.0857
            case NaoMotor.LElbowRoll: return -1.5446
            # case NaoMotor.LWristYaw: return -1.8238
            # case NaoMotor.LHand: return 0.0
            case NaoMotor.RShoulderPitch: return -2.0857
            case NaoMotor.RShoulderRoll: return -1.3265
            case NaoMotor.RElbowYaw: return -2.0857
            case NaoMotor.RElbowRoll: return 0.0349
            # case NaoMotor.RWristYaw: return -1.8238
            # case NaoMotor.RHand: return 0.0
            #TODO: Left and Right Legs

    @property 
    def range_max(self):
        match self:
            case NaoMotor.HeadYaw: return 2.0857
            case NaoMotor.HeadPitch: return 0.5149
            case NaoMotor.LShoulderPitch: return 2.0857
            case NaoMotor.LShoulderRoll: return 1.3265
            case NaoMotor.LElbowYaw: return 2.0857
            case NaoMotor.LElbowRoll: return -0.0349
            # case NaoMotor.LWristYaw: return 1.8238
            # case NaoMotor.LHand: return 1.0
            case NaoMotor.RShoulderPitch: return 2.0857
            case NaoMotor.RShoulderRoll: return 0.3142
            case NaoMotor.RElbowYaw: return 2.0857
            case NaoMotor.RElbowRoll: return 1.5446
            # case NaoMotor.RWristYaw: return 1.8238
            # case NaoMotor.RHand: return 1.0
            #TODO: Left and Right Legs
    
    def limit(self, value: float) -> float:
        return max(self.range_min, min(self.range_max, value))
    
    @property
    def velocity_max(self) -> float:
        match self:
            case NaoMotor.HeadYaw: return 8.26797
            case NaoMotor.HeadPitch: return 7.19407
            case NaoMotor.LShoulderPitch: return 8.26797
            case NaoMotor.LShoulderRoll: return 7.19407
            case NaoMotor.LElbowYaw: return 8.26797
            case NaoMotor.LElbowRoll: return 7.19407
            # case NaoMotor.LWristYaw: return 24.6229
            # case NaoMotor.LHand: return 1.0
            case NaoMotor.RShoulderPitch: return 8.26797
            case NaoMotor.RShoulderRoll: return 7.19407
            case NaoMotor.RElbowYaw: return 8.26797
            case NaoMotor.RElbowRoll: return 7.19407
            # case NaoMotor.RWristYaw: return 24.6229
            # case NaoMotor.RHand: return 1.0
            #TODO: Left and Right Legs

    @property 
    def velocity_max_with_buffer(self):
        MAX_VEL_BUFFER_PERCENT = 0.1 # 10%
        return self.velocity_max * (1 - MAX_VEL_BUFFER_PERCENT)


class NaoTrajectoryOutputProvider(MotionOutputProvider):
    def __init__(self, nao_trajectory_filepath: Path):
        self.nao_trajectory_filepath = nao_trajectory_filepath

        self.dataframe = pd.DataFrame(
            columns = [
                e.name for e in NaoMotor
            ]
        )
    
    def _plt(self, skel, tfs, ax=None):
        import matplotlib.pyplot as plt
        if ax == None:
            ax = plt.gca()
        tfs.plot_frames_in('world', s=0.1, ax=ax)
        skel.plt_skeleton(ax=ax, color='black', alpha=0.5)
        plt.tight_layout()
        plt.show(block=True)

    def process_frame(self, skel: HumanoidPositionSkeleton, tfs: Optional[TransformManager], record_to_dataframe: bool = True):
        
        # tfs can be None when a human isn't recognized in a video frame. 
        # If so, just use the previous frame's transforms (if there is one, else default to zeros).
        if tfs is None:
            inferred_joints  = pd.Series({ k:0. for k in self.dataframe.columns})
            if len(self.dataframe) > 0:
                inferred_joints = self.dataframe.loc[len(self.dataframe) - 1]
            if record_to_dataframe:
                self.dataframe.loc[len(self.dataframe)]
            return inferred_joints

        row: Dict[str, float] = {}
        chest_to_lupperarm = tfs.get_transform(MecanimBone.LeftUpperArm.name, MecanimBone.Chest.name)
        lupperarm_vector = chest_to_lupperarm[:3, :3] @ np.array([1., 0., 0.])
        luarm_x, luarm_y, luarm_z = lupperarm_vector
        if luarm_z == 0:
            lshoulder_pitch = 0.
            lshoulder_roll = 0.
        else:
            lshoulder_pitch = np.arctan2(-luarm_y, luarm_z)
            yz_hypotenus = np.sqrt(luarm_y**2 + luarm_z**2)
            lshoulder_roll = np.arctan2(luarm_x, yz_hypotenus)
        row[NaoMotor.LShoulderPitch.name] = NaoMotor.LShoulderPitch.limit(lshoulder_pitch)
        row[NaoMotor.LShoulderRoll.name] = NaoMotor.LShoulderRoll.limit(lshoulder_roll)

        # Note: in chest-rightward coordinate system, x is rightward, y is up, and z is *backward*
        chest_to_rupperarm = tfs.get_transform(MecanimBone.RightUpperArm.name, MecanimBone.ChestRightward.name)
        rupperarm_vector = chest_to_rupperarm[:3, :3] @ np.array([1., 0., 0.])
        ruarm_x, ruarm_y, ruarm_z = rupperarm_vector
        if ruarm_z == 0:
            rshoulder_pitch = 0.
            rshoulder_roll = 0.
        else:
            # z faces backwards, so we need to flip the sign
            rshoulder_pitch = np.arctan2(-ruarm_y, -ruarm_z)
            yz_hypotenus = np.sqrt(ruarm_y**2 + ruarm_z**2)
            rshoulder_roll = -np.arctan2(ruarm_x, yz_hypotenus)
        row[NaoMotor.RShoulderPitch.name] = NaoMotor.RShoulderPitch.limit(rshoulder_pitch)
        row[NaoMotor.RShoulderRoll.name] = NaoMotor.RShoulderRoll.limit(rshoulder_roll)
      
        # Targets:
        # LShoulderPitch = ~81 deg
        # LShoulderRoll = ~14 deg
        # LElbowYaw = ~-119 deg
        # LElbowRoll = ~-35 deg
        # chest_to_llowerarm = tfs.get_transform(MecanimBone.LeftLowerArm.name, MecanimBone.Chest.name)
        
        world_vectolshoulder = tfs.get_transform(MecanimBone.Chest.name, 'world')[:3, :3] @ np.array([1., 0., 0.])
        world_vectollowerarm = tfs.get_transform(MecanimBone.LeftUpperArm.name, 'world')[:3, :3] @ np.array([1., 0., 0.])
        world_vectolhand = tfs.get_transform(MecanimBone.LeftLowerArm.name, 'world')[:3, :3] @ np.array([1., 0., 0.])

        # Points towards interior of shoulder joint
        lshoulder_pivot_bisection_vector = world_vectollowerarm - world_vectolshoulder
        lshoulder_pivot_bisection_vector /= np.linalg.norm(lshoulder_pivot_bisection_vector)

        # Points towards interior of elbow joint
        lelbow_pivot_bisection_vector = world_vectolhand - world_vectollowerarm
        lelbow_pivot_bisection_vector /= np.linalg.norm(lelbow_pivot_bisection_vector)

        lshoulder_pivot_bisection_vector_proj = pr.vector_projection(lshoulder_pivot_bisection_vector, world_vectollowerarm)
        lshoulder_pivot_vector_rejection = lshoulder_pivot_bisection_vector - lshoulder_pivot_bisection_vector_proj
        lshoulder_pivot_vector_rejection /= np.linalg.norm(lshoulder_pivot_vector_rejection)

        lelbow_pivot_bisection_vector_proj = pr.vector_projection(lelbow_pivot_bisection_vector, world_vectollowerarm)
        lelbow_pivot_vector_rejection = lelbow_pivot_bisection_vector - lelbow_pivot_bisection_vector_proj
        lelbow_pivot_vector_rejection /= np.linalg.norm(lelbow_pivot_vector_rejection)

        lelbow_axis_angle = pr.axis_angle_from_two_directions(lshoulder_pivot_vector_rejection, lelbow_pivot_vector_rejection)
        lelbow_angle_sign = lelbow_axis_angle[:3].dot(world_vectollowerarm)
        lelbow_yaw = lelbow_axis_angle[3] * lelbow_angle_sign
        lelbow_yaw -= np.pi / 2

        # lelbow_yaw = -pr.angle_between_vectors(lshoulder_pivot_vector_rejection, lelbow_pivot_vector_rejection)
        row[NaoMotor.LElbowYaw.name] = NaoMotor.LElbowYaw.limit(lelbow_yaw)
        lelbow_roll = -np.abs(pr.angle_between_vectors(world_vectollowerarm, world_vectolhand))
        row[NaoMotor.LElbowRoll.name] = NaoMotor.LElbowRoll.limit(lelbow_roll)

        world_vectorrshoulder = tfs.get_transform(MecanimBone.ChestRightward.name, 'world')[:3, :3] @ np.array([1., 0., 0.])
        world_vectorrlowerarm = tfs.get_transform(MecanimBone.RightUpperArm.name, 'world')[:3, :3] @ np.array([1., 0., 0.])        
        world_vectorrhand = tfs.get_transform(MecanimBone.RightLowerArm.name, 'world')[:3, :3] @ np.array([1., 0., 0.])

        # Points towards interior of shoulder joint
        rshoulder_pivot_bisection_vector = world_vectorrlowerarm - world_vectorrshoulder
        rshoulder_pivot_bisection_vector /= np.linalg.norm(rshoulder_pivot_bisection_vector)

        # Points towards interior of elbow joint
        relbow_pivot_bisection_vector = world_vectorrhand - world_vectorrlowerarm
        relbow_pivot_bisection_vector /= np.linalg.norm(relbow_pivot_bisection_vector)

        rshoulder_pivot_bisection_vector_proj = pr.vector_projection(rshoulder_pivot_bisection_vector, world_vectorrlowerarm)
        rshoulder_pivot_vector_rejection = rshoulder_pivot_bisection_vector - rshoulder_pivot_bisection_vector_proj
        rshoulder_pivot_vector_rejection /= np.linalg.norm(rshoulder_pivot_vector_rejection)

        relbow_pivot_bisection_vector_proj = pr.vector_projection(relbow_pivot_bisection_vector, world_vectorrlowerarm)
        relbow_pivot_vector_rejection = relbow_pivot_bisection_vector - relbow_pivot_bisection_vector_proj
        relbow_pivot_vector_rejection /= np.linalg.norm(relbow_pivot_vector_rejection)

        relbow_axis_angle = pr.axis_angle_from_two_directions(rshoulder_pivot_vector_rejection, relbow_pivot_vector_rejection)
        relbow_angle_sign = relbow_axis_angle[:3].dot(world_vectorrlowerarm)
        relbow_yaw = relbow_axis_angle[3] * relbow_angle_sign
        relbow_yaw -= np.pi / 2
        relbow_yaw %= np.pi
        # relbow_yaw = -pr.angle_between_vectors(rshoulder_pivot_vector_rejection, relbow_pivot_vector_rejection)

        row[NaoMotor.RElbowYaw.name] = NaoMotor.RElbowYaw.limit(relbow_yaw)
        relbow_roll = np.abs(pr.angle_between_vectors(world_vectorrlowerarm, world_vectorrhand))
        row[NaoMotor.RElbowRoll.name] = NaoMotor.RElbowRoll.limit(relbow_roll)
        
        # Calculate head yaw and pitch
        head2chest = tfs.get_transform(MecanimBone.Head.name, MecanimBone.Chest.name)
        gaze_direction = head2chest[:3, :3] @ np.array([0., 0., 1.])
        gaze_x, gaze_y, gaze_z = gaze_direction

        head_yaw = np.arctan2(gaze_x, gaze_z)
        head_pitch = np.arctan2(gaze_z, gaze_y)
        row[NaoMotor.HeadYaw.name] = NaoMotor.HeadYaw.limit(head_yaw)
        row[NaoMotor.HeadPitch.name] = NaoMotor.HeadPitch.limit(head_pitch)
        
        frame_index = len(self.dataframe)

        fps = 30.
        # Ensure that velocity limits are not exceeded
        for (motor_name, motor_angle) in row.items():
            # skip if this is the first frame
            if len(self.dataframe) == 0:
                break

            motor = NaoMotor[motor_name]
            prev_angle = self.dataframe[motor_name].iloc[-1]
            max_angle_change = motor.velocity_max_with_buffer / fps
            angle_change = np.abs(motor_angle - prev_angle)
            if angle_change > max_angle_change:
                new_motor_angle = prev_angle + np.sign(angle_change) * max_angle_change
                row[motor_name] = motor.limit(new_motor_angle)

        series_data = pd.Series(row)

        if record_to_dataframe:
            self.dataframe.loc[frame_index] = pd.Series(row)
        
        debug = False
        if debug:
            display_urdf(nao_urdf_path, joint_values = row, fig_title=f"Frame {frame_index} NAO URDF")

        return series_data


    def write_output(self):
        self.dataframe.to_csv(self.nao_trajectory_filepath, index=False)
        print("\tWrote Nao Control file to", self.nao_trajectory_filepath)