from typing import Optional
import pandas as pd
import numpy as np
from enum import Enum
from .MotionOutputProvider import MotionOutputProvider, TransformManager, Path
from ..MecanimHumanoid import HumanoidPositionSkeleton, MecanimBone, MecanimMeasurement
from motion_extraction.bvh.writer import BVHWriteNode, write_bvh

METERS_TO_CM = 100.

def _get_bvh_hierarchy(bone_avg_offsets: pd.Series) -> BVHWriteNode:
    """
    Get the hierarchy of the bvh file.
    """
    class Channel(Enum):
        X = 0
        Y = 1
        Z = 2

    def make_node(
        bone: MecanimBone, 
        offset_channel, 
        add_position_channel = False, 
        negate_offset = False,
        override_offset_val = None,
    ) -> BVHWriteNode:
        measure = bone_avg_offsets[bone.name] if override_offset_val is None else override_offset_val
        multiplier = -1. if negate_offset else 1.
        offset = [0., 0., 0.]
        offset[offset_channel.value] = multiplier * measure
        return BVHWriteNode.create(
            bone.name, 
            add_position_channel, 
            offset=tuple(offset)
        )

    hips = make_node(MecanimBone.Hips, add_position_channel=True, offset_channel=Channel.X) # the offset channel doesn't matter - will be zero
    spine = make_node(MecanimBone.Spine, offset_channel=Channel.Y)
    hips.add_child(spine)
    chest = make_node(MecanimBone.Chest, offset_channel=Channel.Y)
    spine.add_child(chest)

    avg_upperleg_offset = 0.5 * (bone_avg_offsets[MecanimBone.LeftUpperLeg.name] + bone_avg_offsets[MecanimBone.RightUpperLeg.name])
    leftUpperLeg = make_node(MecanimBone.LeftUpperLeg, offset_channel=Channel.X, override_offset_val=avg_upperleg_offset)
    rightUpperLeg = make_node(MecanimBone.RightUpperLeg, offset_channel=Channel.X, override_offset_val=avg_upperleg_offset, negate_offset=True)
    hips.add_child(leftUpperLeg)
    hips.add_child(rightUpperLeg)

    head = make_node(MecanimBone.Head, offset_channel=Channel.Y)
    chest.add_child(head)

    avg_lowerleg_offset = 0.5 * (bone_avg_offsets[MecanimBone.LeftLowerLeg.name] + bone_avg_offsets[MecanimBone.RightLowerLeg.name])
    leftLowerLeg = make_node(MecanimBone.LeftLowerLeg, offset_channel=Channel.X, override_offset_val=avg_lowerleg_offset)
    rightLowerLeg = make_node(MecanimBone.RightLowerLeg, offset_channel=Channel.X, override_offset_val=avg_lowerleg_offset)
    leftUpperLeg.add_child(leftLowerLeg)
    rightUpperLeg.add_child(rightLowerLeg)

    avg_foot_offset = 0.5 * (bone_avg_offsets[MecanimBone.LeftFootAnkle.name] + bone_avg_offsets[MecanimBone.RightFootAnkle.name])
    leftFoot = make_node(MecanimBone.LeftFootAnkle, offset_channel=Channel.X, override_offset_val=avg_foot_offset)
    rightFoot = make_node(MecanimBone.RightFootAnkle, offset_channel=Channel.X, override_offset_val=avg_foot_offset)
    leftLowerLeg.add_child(leftFoot)
    rightLowerLeg.add_child(rightFoot)

    # add end sites for feet
    avg_foot_length = 0.5 * (bone_avg_offsets[MecanimBone.LeftToes.name] + bone_avg_offsets[MecanimBone.RightToes.name])
    leftFoot.end_site_offset = np.array((avg_foot_length, 0., 0.))
    rightFoot.end_site_offset = np.array((avg_foot_length, 0., 0.))

    leftUpperArm = make_node(MecanimBone.LeftUpperArm, offset_channel=Channel.X)
    rightUpperArm = make_node(MecanimBone.RightUpperArm, offset_channel=Channel.X)
    # avg_shoulder_link = 0.5 * (bone_avg_offsets[MecanimBone.LeftUpperArm.name] + bone_avg_offsets[MecanimBone.RightUpperArm.name])
    shoulderWidth = bone_avg_offsets[MecanimMeasurement.ShoulderWidth.name]
    # spineLength = bone_avg_offsets[MecanimMeasurement.SpineLength.name]
    # shoudler_y = spineLength

    shoulder_x = shoulderWidth / 2.
    leftUpperArm.offset = (shoulder_x, 0., 0.)
    rightUpperArm.offset = (-shoulder_x, 0., 0.)
    chest.add_child(leftUpperArm)
    chest.add_child(rightUpperArm)

    avg_lowerarm_offset = 0.5 * (bone_avg_offsets[MecanimBone.LeftLowerArm.name] + bone_avg_offsets[MecanimBone.RightLowerArm.name])
    leftLowerArm = make_node(MecanimBone.LeftLowerArm, offset_channel=Channel.X, override_offset_val=avg_lowerarm_offset)
    rightLowerArm = make_node(MecanimBone.RightLowerArm, offset_channel=Channel.X, override_offset_val=avg_lowerarm_offset)
    leftUpperArm.add_child(leftLowerArm)
    rightUpperArm.add_child(rightLowerArm)

    # Add hand
    avg_hand_offset = 0.5 * (bone_avg_offsets[MecanimBone.LeftHand.name] + bone_avg_offsets[MecanimBone.RightHand.name])
    leftHand = make_node(MecanimBone.LeftHand, offset_channel=Channel.X, override_offset_val=avg_hand_offset)
    rightHand = make_node(MecanimBone.RightHand, offset_channel=Channel.X, override_offset_val=avg_hand_offset)
    leftLowerArm.add_child(leftHand)
    rightLowerArm.add_child(rightHand)

    # Add end sites for the hands
    avg_finger_length = 0.25 * (
        bone_avg_offsets[MecanimBone.LeftHandIndexRoot.name] + 
        bone_avg_offsets[MecanimBone.RightHandIndexRoot.name] + 
        bone_avg_offsets[MecanimBone.LeftHandPinkyRoot.name] + 
        bone_avg_offsets[MecanimBone.RightHandPinkyRoot.name]
    )
    leftLowerArm.end_site_offset = (avg_finger_length, 0., 0.)
    rightLowerArm.end_site_offset = (avg_finger_length, 0., 0.)

    return hips    


class BVHOutputProvider(MotionOutputProvider):
    def __init__(
        self, 
        avg_offsets_and_measurements_cm: pd.Series,
        bvh_filepath: Path,
        bvhcsv_filepath: Optional[Path]
    ):
        self.bvh_root = _get_bvh_hierarchy(avg_offsets_and_measurements_cm)
        self.dataframe = pd.DataFrame(columns = list(self.bvh_root.get_channel_column_names()))
        self.fps = 30.
        self.bvh_filepath = bvh_filepath
        self.bvhcsv_filepath = bvhcsv_filepath

    def process_frame(self, skel: HumanoidPositionSkeleton, tfs: Optional[TransformManager]):
        """
        Convert the holistic data to jointspace.
        """    

        if tfs is None:
            if len(self.dataframe) > 0:
                self.dataframe.loc[len(self.dataframe)] = self.dataframe.loc[len(self.dataframe) - 1]
            else:
                self.dataframe.loc[len(self.dataframe)] = pd.Series({ k:0. for k in self.dataframe.columns})
            return


        def get_data(node: BVHWriteNode, parent_frame = 'world', data = {}):
            try:
                tf = tfs.get_transform(parent_frame, node.name)
            except KeyError:
                tf = np.eye(4)
            data.update(node.get_channel_info(tf, METERS_TO_CM))
            for child in node.children:
                data.update(get_data(child, node.name))
            return data

        data = get_data(self.bvh_root)
        data =  pd.Series(data)   
        self.dataframe.loc[len(self.dataframe)] = data

    def write_output(self):

        frames = self.dataframe.to_numpy()
        frame_count = len(self.dataframe)

        with open(self.bvh_filepath, 'w') as f:
            write_bvh(f, self.bvh_root, self.fps, frame_count, frames)
            print("\tWrote BVH file to", self.bvh_filepath)

        if self.bvhcsv_filepath is not None:
            self.dataframe.to_csv(self.bvhcsv_filepath, index=False, float_format='%.3f')
            print("\tWrote BVH CSV file to", self.bvhcsv_filepath)


    