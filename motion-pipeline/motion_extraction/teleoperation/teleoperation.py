
from typing import Any, Callable, List, Literal, NamedTuple, Union
import mediapipe as mp
import cv2
import matplotlib.pyplot as plt
from matplotlib.axes import Axes
from pathlib import Path
import time


from ..utils import throttle

from ..mp_utils import (
    POSE_CONNECTIONS,
    POSE_LANDMARKER_HEAVY_MODEL_URL,
    build_base_options,
    ensure_task_model,
    landmark_list,
    rgb_image_to_mp_image,
)
from ..extract_holistic_data import (
    draw_normalized_landmarks,
    plot_3d_pose,
    transform_to_holistic_csvrow,
)

@throttle(1)
def print_throttled(txt: str):
    print(txt)
    
def stream_realtime(
    src_media: Union[str, Literal['webcam']],
    on_pose: Callable[[NamedTuple], None],
    ax_livestream: Axes = None,
    ax_mediapipe_3d: Axes = None,
    break_on_frames: List[int] = None,
    show_webcam_feed: bool = False,
    webcam_index: int = 0,
):
    cap = None
    if src_media == 'webcam':
        cap = cv2.VideoCapture(0)
        # Set webcam resolution (to 720p)
        cap.set(3, 1280)
        cap.set(4, 720)
    else:
        media_path = str(Path(src_media).resolve())
        cap = cv2.VideoCapture(media_path)

    frame_i = 0

    # Can use this to use images instead of webcam (for a sequence of images)
    # cap = cv2.VideoCapture('path/to/image_%d.jpg') 

    model_path = ensure_task_model(
        Path(__file__).resolve().parent.parent / "scripts" / "pose_landmarker_heavy.task",
        POSE_LANDMARKER_HEAVY_MODEL_URL,
    )
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=build_base_options(model_path),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
    )

    with mp.tasks.vision.PoseLandmarker.create_from_options(options) as pose:
        while cap.isOpened():
            success, image = cap.read()
            if not success:
                # If using video file, we're at the end (so stop)
                if src_media != 'webcam':
                    break

                print_throttled(f"Error fetching frame from camera {frame_i} ... retrying")
                continue
                
            frame_i += 1

            if src_media == 'webcam':
                # Flip the image horizontally for a later selfie-view display when in webcam mode
                image = cv2.flip(image, 1)
                
            # Convert the BGR image to RGB for mediapipe purposes
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            # To improve performance, optionally mark the image as not writeable to
            # pass by reference.
            image.flags.writeable = False
            mp_image = rgb_image_to_mp_image(image)
            timestamp_ms = time.monotonic_ns() // 1_000_000
            results = pose.detect_for_video(mp_image, timestamp_ms)

            # Draw the pose annotation on the image.
            image.flags.writeable = True
            image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
            pose_landmarks = results.pose_landmarks[0] if results.pose_landmarks else None
            draw_normalized_landmarks(image, pose_landmarks, POSE_CONNECTIONS)

            holistic_row = transform_to_holistic_csvrow(frame_i, results, as_pdSeries=True)
            if not results.pose_world_landmarks:
                on_pose(None)
            else:
                on_pose(holistic_row)

            if ax_livestream is not None:
                img_display = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                ax_livestream.imshow(img_display)

            if show_webcam_feed and image is not None:
                cv2.imshow('MediaPipe Pose', image)

            if ax_mediapipe_3d is not None:
                ax_mediapipe_3d.clear()
                plot_3d_pose(holistic_row, ax=ax_mediapipe_3d)
                plt.pause(0.001)
            
            if break_on_frames is not None and frame_i in break_on_frames:
                plt.show(block=True)

            # Break on keypress.
            #  > Mask out the first 24 bits (leaving only the last 8 as ascii)
            rawkey = cv2.waitKey(5)
            key = rawkey & 0xFF 
            if rawkey != -1 and key:
                break
    
