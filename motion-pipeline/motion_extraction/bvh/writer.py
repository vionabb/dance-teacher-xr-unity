from __future__ import annotations
from dataclasses import dataclass, field
from io import StringIO, TextIOBase
from typing import *
import numpy as np
import math
from pytransform3d import rotations as pr
from pytransform3d import transformations as pt
from pytransform3d.transform_manager import TransformManager
# from utils import get_passive_euler_zxy_from_matrix

# def passive_euler_zxy_from_matrix(matrix: np.ndarray) -> np.ndarray:
#     # https://www.researchgate.net/publication/238189035_General_Formula_for_Extracting_the_Euler_Angles
#     n1 = np.array([0., 0., 1.]) # Z
#     n2 = np.array([1., 0., 0.]) # X
#     n3 = np.array([0., 1., 0.]) # Y
#     D = matrix
#     C = (n2 @ np.cross(n1, n2) @ n1).T


#     return R

@dataclass
class BVHWriteNode:
    name: str
    offset: Tuple[float, float, float]
    rotation_order: str = 'ZXY'
    has_position_channels: bool = False   
    parent: BVHWriteNode = field(default=None)
    children: List[BVHWriteNode] = field(default_factory=list)
    end_site_offset: Optional[Tuple[float, float, float]] = None

    @staticmethod
    def create(name: str, 
        include_position_channels: bool = True, 
        rotation_order: str = 'zxy', 
        offset: Tuple[float, float, float] = (0., 0., 0.)
    ) -> BVHWriteNode:
        
        return BVHWriteNode(
            name, 
            offset, 
            rotation_order=rotation_order,
            has_position_channels = include_position_channels,
            parent=None, 
            children=[], 
            end_site_offset=None
        )
    
    @property
    def channels(self):
        channels = []
        if self.has_position_channels:
            channels.append('Xposition')
            channels.append('Yposition')
            channels.append('Zposition')
        channels.extend([f"{c.upper()}rotation" for c in self.rotation_order])
        return channels

    def add_child(self, child: BVHWriteNode) -> None:
        self.children.append(child)
        child.parent = self

    def write_hierarchy(self, file: TextIOBase, indent: int = 0) -> None:

        indent_str = " " * indent
        if indent == 0:
            file.write(f'ROOT {self.name}\n')
        else:
            file.write(f'{indent_str}JOINT {self.name}\n')


        file.write(f'{indent_str}{{\n')
        sub_indent = indent + 4
        sub_indent_str = " " * sub_indent
        file.write(f'{sub_indent_str}OFFSET {self.offset[0]} {self.offset[1]} {self.offset[2]}\n')
        file.write(f'{sub_indent_str}CHANNELS {len(self.channels)} {" ".join(self.channels)}\n')

        for child in self.children:
            child.write_hierarchy(file, sub_indent)
        
        if self.end_site_offset is not None:
            file.write(f'{sub_indent_str}End Site\n')
            file.write(f'{sub_indent_str}{{\n')
            file.write(f'{sub_indent_str}OFFSET {self.end_site_offset[0]} {self.end_site_offset[1]} {self.end_site_offset[2]}\n')
            file.write(f'{sub_indent_str}}}\n')

        file.write(f'{indent_str}}}\n')        
    
    def get_channel_column_names(self) -> Generator[str]:
        
        for channel in self.channels:
            yield self.name + '.' + channel 
        
        for child in self.children:
            yield from child.get_channel_column_names()

    def get_channel_info(self, transform, position_multiplier: float = 1.0):
        data = {}
        if len(self.channels) == 6:
            x, y, z = transform[:3,3] * position_multiplier
            data.update({
                f'{self.name}.Xposition': x,
                f'{self.name}.Yposition': y,
                f'{self.name}.Zposition': z
            })

        rx, rx, rz = 0., 0., 0.
        R = transform[:3,:3]

        
        
        # pr.euler_zyx_from_matrix(R)
        # pr.intrinsic_euler_xyx_from_active_matrix
        match self.rotation_order.lower():
            
            # Trying different euler angle extraction functions.
            # case 'xyz': rx, ry, rz = pr.intrinsic_euler_xyx_from_active_matrix(R.T)

            # case 'xyz': rx, ry, rz = pr.extrinsic_euler_xyz_from_active_matrix(R.T)
            # case 'xzy': rx, ry, rz = pr.extrinsic_euler_xzy_from_active_matrix(R)
            # case 'yxz': rx, ry, rz = pr.extrinsic_euler_yxz_from_active_matrix(R)
            # case 'yzx': rx, ry, rz = pr.extrinsic_euler_yzx_from_active_matrix(R)
            case 'zxy': rz, rx, ry = pr.intrinsic_euler_zxy_from_active_matrix(R.T)
            # case 'zyx': rx, ry, rz = pr.extrinsic_euler_zyx_from_active_matrix(R)

            # case 'zxy': rz, rx, ry = get_passive_euler_zxy_from_matrix(R)
            case _:
                raise ValueError(f'Unsupported rotation order: {self.rotation_order}')
            
        data.update({
            f'{self.name}.Xrotation': math.degrees(rx),
            f'{self.name}.Yrotation': math.degrees(ry),
            f'{self.name}.Zrotation': math.degrees(rz)
        })
        return data

def write_bvh(file: TextIOBase, root_node: BVHWriteNode, fps: int, frame_count: int, frames: Iterable[Sequence[float]]) -> None:
    file.write(f'HIERARCHY\n')
    root_node.write_hierarchy(file)

    file.write("MOTION\n")
    file.write(f'Frames: {frame_count}\n')
    file.write(f'Frame Time: {1. / fps}\n')

    for frame in frames:
        file.write(" ".join(map(str, frame)) + "\n")        
    file.write('\n')


def mediapipe_capture_pipeline():
    pass

if __name__ == "__main__":
    from pathlib import Path
    import pandas as pd
    import matplotlib.pyplot as plt

    # Base Shape:
    #    -  -
    #    \ /
    #     |

    firstNode = BVHWriteNode("First", (0., 0., 0.), has_position_channels=True)
    secondNode = BVHWriteNode("Second", (0.0, 10., 0.))
    firstNode.add_child(secondNode)
    t1Node = BVHWriteNode("T1", (10.0, 10., 0.), end_site_offset=(5., 0., 0.))
    t2Node = BVHWriteNode("T2", (-10.0, 10., 0.), end_site_offset=(5., 0., 0.))
    secondNode.add_child(t1Node)
    secondNode.add_child(t2Node)

    # Transform shape:
    # |
    #  \
    #    --
    #  /
    # |
    tfs = TransformManager()
    
    id3 = np.identity(3)
    r90z = pr.active_matrix_from_intrinsic_euler_zxy((math.radians(90.), 0., 0.))
    # r90z = pr.passive_matrix_from_angle(basis=2, angle=math.radians(90)) # 90 in z (basis=2) axis
    
    # 90deg z rotation world to first (lean to left)
    tfs.add_transform('world', 'First', pt.transform_from(r90z.T, np.array([0., 10.0, 0.])))

    # Second keeps same orientation as first, but 10 units to left (-x)
    tfs.add_transform('First', 'Second', pt.transform_from(id3, np.array([0., 10., 0.])))

    # t1 is oriented with x pointing up, which is same as first and second, offset from second 10left, 10 up
    tfs.add_transform('Second', 'T1', pt.transform_from(id3, np.array([10., 10., 0.])))

    rneg90z = pr.active_matrix_from_intrinsic_euler_zxy((-math.radians(90.), 0., 0.))
    tfs.add_transform('Second', 'T2Pos', pt.transform_from(id3, np.array([-10., 10., 0.])))
    # t1 is oriented with x pointing down, which is same as first and second, offset from second 10left, 10 down
    tfs.add_transform('T2Pos', 'T2', pt.transform_from(rneg90z.T, np.zeros(3)))

    position_multiplier = 1.0

    def get_data(node: BVHWriteNode, parent_frame = 'world', data = None):
        if data is None:
            data = {}
        try:
            tf = tfs.get_transform(parent_frame, node.name)
        except KeyError:
            tf = np.eye(4)
        data.update(node.get_channel_info(tf, position_multiplier))
        for child in node.children:
            data.update(get_data(child, node.name))
        return data

    first_pose_data = get_data(firstNode, data={})
    print(f'{first_pose_data=}')

    ax = tfs.plot_frames_in('world', s=5.0, ax_s=30.0)
    tfs.plot_connections_in('world', ax=ax)
    plt.show(block=True)

    tfs.remove_transform('T2Pos', 'T2')
    point_out = pr.matrix_from_two_vectors(np.array([0., 0., 1.]), np.array([0., -1., 0.]))
    tfs.add_transform('T2Pos', 'T2', pt.transform_from(point_out, np.zeros(3)))

    
    second_pose_data = get_data(firstNode, data={})
    print(f'{second_pose_data=}')
    
    ax = tfs.plot_frames_in('world', s=5.0, ax_s=30.0)
    tfs.plot_connections_in('world', ax=ax)
    plt.show(block=True)

    col_names = list(firstNode.get_channel_column_names())
    zero_dict = {k: 0. for k in col_names}
    df = pd.DataFrame(columns = col_names)
    df.loc[0] = zero_dict
    df.loc[1] = first_pose_data
    df.loc[2] = second_pose_data
    df.loc[3] = first_pose_data
    df.loc[4] = zero_dict
    
    frames = df.to_numpy()

    # frames = np.array([
    #     #firstX firstY firstZ firstRZ firstRX firstRY secondRZ secondRX secondRY t1RZ t1RX t1RY t2RZ t2RX t2RY
    #     [0.,    0.,    0.,    0.,     0.,     0.,     0.,      0.,      0.,      0.,  0.,  0.,  0.,  0.,  0.  ],
    #     [0.,    0.,    0.,    45.,    0.,     0.,     0.,      0.,      0.,      0.,  0.,  0.,  0.,  0.,  180.  ],
    #     [0.,    0.,    0.,    0.,     0.,     0.,     0.,      0.,      0.,      0.,  0.,  0.,  0.,  0.,  0.  ],
    #     [0.,    0.,    0.,    -45.,   0.,     0.,     0.,      0.,      0.,      0.,  0.,  0.,  0.,  0.,  -180.  ],
    #     [0.,    0.,    0.,    0.,     0.,     0.,     0.,      0.,      0.,      0.,  0.,  0.,  0.,  0.,  0.],
    # ])
    path = Path("~/Desktop/test.bvh").expanduser()
    with path.open('w') as f:
        write_bvh(f, firstNode, fps=10, frame_count=frames.shape[0], frames=frames)