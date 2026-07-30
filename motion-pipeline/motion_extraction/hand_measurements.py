from typing import Final
import numpy as np
from motion_extraction.mp_utils import HandLandmark

# Average hand joint lengths
# From: https://scielo.conicyt.cl/pdf/ijmorphol/v28n3/art15.pdf
# "Proportions of Hand Segments"
# by: Buryanov Alexander & Kotiuk Viktor

# TODO / CORRECTIONS: 
# * from picture, these distances are of the xray bones. The finger bones don't start in same spot, 
#   like they do in mediapipe's skeleton!
# * should take into account the pp* distance vs bone distance (llde* vs lld in the picture)

TYPICAL_FINGER_JOINTS: Final[np.ndarray] = np.array([
    # Key: (units: mm)
    # [tip, distal phalanx, medial phalanx, proximal phalanx, metacarpal]
    # tip: soft tissue past last bone
    # distal phalanx: leaf-most bone
    # medial phalanx: middle bone
    # proximal phalanx: root-most knuckle bone (longest)
    # metacarpal: from wrist root to knucle bone

    # Finger 1: Thumb (doesn't have a medial phalanx)
    [5.67,     21.67,      0.0,        31.57,      46.22],

    # Finger 2: Index
    [3.84,     15.82,      22.38,      39.78,     68.12],

    # Finger 3: Middle
    [3.95,      17.40,     26.33,      44.63,     64.60],

    # Finger 4: Ring
    [3.95,      17.30,     25.65,      41.37,     58.00],

    # Finger 5: Pinky
    [3.73,      15.96,     18.11,      32.57,     53.69],
])

TYPICAL_HAND_BONE_LENGTHS = {
    HandLandmark.THUMB_TIP: TYPICAL_FINGER_JOINTS[0][0],
    HandLandmark.THUMB_IP: TYPICAL_FINGER_JOINTS[0][1],
    HandLandmark.THUMB_MCP: TYPICAL_FINGER_JOINTS[0][3],
    HandLandmark.THUMB_CMC: TYPICAL_FINGER_JOINTS[0][4],

    HandLandmark.INDEX_FINGER_TIP: TYPICAL_FINGER_JOINTS[1][0] + TYPICAL_FINGER_JOINTS[1][1],
    HandLandmark.INDEX_FINGER_DIP: TYPICAL_FINGER_JOINTS[1][2],
    HandLandmark.INDEX_FINGER_PIP: TYPICAL_FINGER_JOINTS[1][3],
    HandLandmark.INDEX_FINGER_MCP: TYPICAL_FINGER_JOINTS[1][4],

    HandLandmark.MIDDLE_FINGER_TIP: TYPICAL_FINGER_JOINTS[2][0] + TYPICAL_FINGER_JOINTS[2][1],
    HandLandmark.MIDDLE_FINGER_DIP: TYPICAL_FINGER_JOINTS[2][2],
    HandLandmark.MIDDLE_FINGER_PIP: TYPICAL_FINGER_JOINTS[2][3],
    HandLandmark.MIDDLE_FINGER_MCP: TYPICAL_FINGER_JOINTS[2][4],

    HandLandmark.RING_FINGER_TIP: TYPICAL_FINGER_JOINTS[3][0] + TYPICAL_FINGER_JOINTS[3][1],
    HandLandmark.RING_FINGER_DIP: TYPICAL_FINGER_JOINTS[3][2],
    HandLandmark.RING_FINGER_PIP: TYPICAL_FINGER_JOINTS[3][3],
    HandLandmark.RING_FINGER_MCP: TYPICAL_FINGER_JOINTS[3][4],

    HandLandmark.PINKY_TIP: TYPICAL_FINGER_JOINTS[4][0] + TYPICAL_FINGER_JOINTS[4][1],
    HandLandmark.PINKY_DIP: TYPICAL_FINGER_JOINTS[4][2],
    HandLandmark.PINKY_PIP: TYPICAL_FINGER_JOINTS[4][3],
    HandLandmark.PINKY_MCP: TYPICAL_FINGER_JOINTS[4][4],
}
