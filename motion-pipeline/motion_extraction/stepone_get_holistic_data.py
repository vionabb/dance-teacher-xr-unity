from pathlib import Path
import typing as t
import cv2
from matplotlib import pyplot as plt
import mediapipe as mp
from mediapipe.python.solutions import holistic as mp_holistic
import numpy as np
import pandas as pd
from functools import reduce
import csv

from .utils import throttle
from .mp_utils import (
    HAND_CONNECTIONS,
    POSE_CONNECTIONS,
    HandLandmark,
    PoseLandmark,
    landmark_at,
    landmark_list,
)

import mpl_toolkits.mplot3d.art3d as art3d
from mpl_toolkits.mplot3d.axes3d import Axes3D

T = t.TypeVar('T')

_PRESENCE_THRESHOLD = 0.5
_VISIBILITY_THRESHOLD = 0.5
_BGR_CHANNELS = 3
from typing import Iterable


def _normalized_to_pixel_coordinates(normalized_x, normalized_y, image_width, image_height):
    if not (0.0 <= normalized_x <= 1.0 and 0.0 <= normalized_y <= 1.0):
        return None
    x_px = min(int(normalized_x * image_width), image_width - 1)
    y_px = min(int(normalized_y * image_height), image_height - 1)
    return x_px, y_px


def _should_draw_landmark(landmark) -> bool:
    visibility = getattr(landmark, "visibility", None)
    if visibility is not None and visibility < _VISIBILITY_THRESHOLD:
        return False

    presence = getattr(landmark, "presence", None)
    if presence is not None and presence < _PRESENCE_THRESHOLD:
        return False

    return True


def draw_normalized_landmarks(
    image: np.ndarray,
    landmarks: t.Optional[Iterable],
    connections: t.Optional[t.Iterable[tuple[int, int]]] = None,
    landmark_color=(0, 0, 255),
    connection_color=(224, 224, 224),
):
    if image.shape[2] != _BGR_CHANNELS:
        raise ValueError('Input image must contain three channel bgr data.')

    landmarks = landmark_list(landmarks)
    if not landmarks:
        return

    image_rows, image_cols, _ = image.shape
    idx_to_coordinates = {}

    for idx, landmark in enumerate(landmarks):
        if not _should_draw_landmark(landmark):
            continue
        landmark_px = _normalized_to_pixel_coordinates(
            landmark.x,
            landmark.y,
            image_cols,
            image_rows,
        )
        if landmark_px is not None:
            idx_to_coordinates[idx] = landmark_px

    if connections:
        for start_idx, end_idx in connections:
            if start_idx in idx_to_coordinates and end_idx in idx_to_coordinates:
                cv2.line(
                    image,
                    idx_to_coordinates[start_idx],
                    idx_to_coordinates[end_idx],
                    connection_color,
                    2,
                )

    for landmark_px in idx_to_coordinates.values():
        cv2.circle(image, landmark_px, 4, (255, 255, 255), -1)
        cv2.circle(image, landmark_px, 3, landmark_color, -1)




def construct_header_row():
    return ['frame'] + \
           [f'{PoseLandmark(landmark_i).name}_{field}' 
               for landmark_i in np.array(sorted(PoseLandmark))
               for field in ('x', 'y', 'z', 'vis')
           ] + \
           [f'LEFTHAND_{HandLandmark(landmark_i).name}_{field}'
               for landmark_i in np.array(sorted(HandLandmark))
               for field in ('x', 'y', 'z')
           ] + \
           [f'RIGHTHAND_{HandLandmark(landmark_i).name}_{field}'
               for landmark_i in np.array(sorted(HandLandmark))
               for field in ('x', 'y', 'z')
            ]

def construct_pose2d_header_row():
   return ['frame'] + \
          [f'{PoseLandmark(landmark_i).name}_{field}' 
               for landmark_i in np.array(sorted(PoseLandmark))
               for field in ('x', 'y', 'distance', 'vis')
           ]

def transform_to_pose2d_csvrow(
    frame_i: int, 
    frame_data, 
    video_width: float, 
    video_height: float, 
    as_pdSeries: bool = False,
    in_pixelCoords: bool = True,
):
    x_mult = 1 if not in_pixelCoords else video_width
    y_mult = 1 if not in_pixelCoords else video_height
    row = [frame_i]
    row += list(reduce(
        lambda x, y: x + y,
        [
            
            # Get the pixel coordinates of the landmark.
            # Pet the documentation, the z-coordinate is the approximate depth / distance from camera, 
            # with the same approximate magnitude as x. 
            ([
                pose2d_lm.x * x_mult, 
                pose2d_lm.y * y_mult, 
                pose2d_lm.z * x_mult,
                pose2d_lm.visibility
             ] if pose2d_lm is not None 
             else [None, None, None, None]
            )
            for pose2d_lm in 
            [
                landmark_at(getattr(frame_data, "pose_landmarks", None), landmark_i)
                for landmark_i in range(len(PoseLandmark))
            ]
        ]
    ))

    if as_pdSeries:
      return pd.Series(row, index=construct_header_row())
   
    return row

def transform_to_holistic_csvrow(frame_i: int, frame_data, as_pdSeries: bool = False):
    row = [frame_i]
            
    row += list(reduce(
            lambda x, y: x + y,
            [
                # We want to remap x, y, z. 
                #   > The default has negative y being up, positive x being right, and pozitive z being away from the camera.
                #   > We actually want y being up, x being left, and z being forward (towards camera).
                #   So x <- x
                #      y <- -y
                #      z <- -z
                [ 
                    lm.x,
                    -lm.y, 
                    -lm.z,
                    lm.visibility
                ] if lm is not None else [None, None, None, None]
                for lm in 
                [landmark_at(getattr(frame_data, "pose_world_landmarks", None), landmark_i) for landmark_i in range(len(PoseLandmark))]
            ]
        ))
        
    row += list(reduce(
            lambda x, y: x + y,
            [
                ([lm.x, lm.y, lm.z] if lm is not None else [None, None, None])
                for lm in 
                [landmark_at(getattr(frame_data, "right_hand_landmarks", None), landmark_i) for landmark_i in range(len(HandLandmark))]
            ]
        ))

    row += list(reduce(
            lambda x, y: x + y,
            [
                ([lm.x, lm.y, lm.z] if lm is not None else [None, None, None])
                for lm in 
                [landmark_at(getattr(frame_data, "left_hand_landmarks", None), landmark_i) for landmark_i in range(len(HandLandmark))]
            ]
        ))

    if as_pdSeries:
        return pd.Series(row, index=construct_header_row())

    return row

def plot_3d_pose(holistic_row_series, fig=None, ax: t.Optional[Axes3D]=None, title=None):
    if fig is None and ax is None:
        fig = plt.figure(title)
    if ax is None:
        if fig is None:
            fig = plt.figure(title)
        ax = fig.add_subplot(projection='3d')  # type: ignore
    
    assert ax is not None
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.set_zlabel('Z')  # type: ignore
    
    x, y, z = [
        np.array([
            holistic_row_series[f'{PoseLandmark(landmark_i).name}_{field}']
            for landmark_i in range(len(PoseLandmark))
        ])
        for field in ('x', 'y', 'z')
    ]
    # Plot the joint positions
    ax.scatter(x, y, z) # type: ignore

    # Connect joint position skeleton
    segs = [
        [(x[i], y[i], z[i]), (x[j], y[j], z[j])] 
        for i, j in POSE_CONNECTIONS
    ]
    lines = art3d.Line3DCollection(
        segs,
        colors="gray"
    )
    ax.add_collection3d(lines)

def _perform_by_frame(video_path: Path):
    cap = None
    try:
        cap = cv2.VideoCapture(str(video_path))
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        fps = cap.get(cv2.CAP_PROP_FPS) or 0
        fps = fps if fps > 0 else 30.0
        frame_count = 1 if frame_count == 0 else frame_count
        i = 0
        while cap.isOpened():
            success, image = cap.read()
            if not success:
                return
                # raise Exception('Error reading image from video')

            # Convert the BGR image to RGB.
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # To improve performance, optionally mark the image as not writeable to pass by reference.
            image.flags.writeable = False
            # percent_done = int(i * 100 / frame_count)
            # print(f'{percent_done}% ', end='')
            timestamp_ms = int((i * 1000) / fps)
            yield i, frame_count, timestamp_ms, image

            i += 1
    finally:
        if cap is not None:
            cap.release()

def process_video(
    input_video_path: Path, 
    model_complexity: int,
    holistic_data_output_filepath: Path,
    pose_2d_data_output_filepath: t.Optional[Path] = None,
    frame_output_folder: t.Optional[Path] = None,
    print_progress_context: t.Callable[[],str] = lambda: '',
):
    @throttle(seconds=1)
    def print_progress(i, frame_count):
        percent_done = i / frame_count
        print(f'{print_progress_context()}: {i}/{frame_count} {percent_done:.1%}')

    # Get video width / height
    cap = cv2.VideoCapture(str(input_video_path))
    video_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    video_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    cap.release()

    
    header_row = construct_header_row()
    pose2d_header_row = construct_pose2d_header_row()

    holistic_data_output_filepath.parent.mkdir(parents=True, exist_ok=True)
    pose_2d_file = None
    pose_2d_csv_writer = None
    if pose_2d_data_output_filepath:
       pose_2d_data_output_filepath.parent.mkdir(parents=True, exist_ok=True)
       pose_2d_file = pose_2d_data_output_filepath.open('w', encoding='utf-8', newline='')
       pose_2d_csv_writer = csv.writer(pose_2d_file)

    with(
        holistic_data_output_filepath.open('w', encoding='utf-8', newline='') as holistic_file,
        mp_holistic.Holistic(
            static_image_mode=True,
            model_complexity=model_complexity,
            refine_face_landmarks=False,
            enable_segmentation=False,
        ) as holistic_processor,
    ):
        holistic_csv_writer = csv.writer(holistic_file)
        for frame_i, (_, frame_count, _timestamp_ms, image) in enumerate(_perform_by_frame(input_video_path)):
            frame_data: t.Any = holistic_processor.process(image)


            # cv2.imshow(f'Frame {frame_i}', image)
            # cv2.waitKey(500)
            holistic_csv_row = transform_to_holistic_csvrow(frame_i, frame_data)
            holistic_series_row = pd.Series(holistic_csv_row, index=header_row)

            if frame_output_folder is not None:
                image.flags.writeable = True
                image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

                # # # Some code to draw the analysis vectors
                # imgcpy = image.copy()
                # analysis_connection_thickness = 7
                # connections_analysis_drawing_spec = {
                #     (14, 16): mp_drawing.DrawingSpec(color=(255, 153, 153), thickness=analysis_connection_thickness),
                #     (12, 14): mp_drawing.DrawingSpec(color=(255, 204, 153), thickness=analysis_connection_thickness),
                #     (12, 11): mp_drawing.DrawingSpec(color=(255, 255, 153), thickness=analysis_connection_thickness),
                #     (12, 24): mp_drawing.DrawingSpec(color=(204, 255, 153), thickness=analysis_connection_thickness),
                #     (24, 23): mp_drawing.DrawingSpec(color=(153, 255, 204), thickness=analysis_connection_thickness),
                #     (11, 23): mp_drawing.DrawingSpec(color=(153, 204, 255), thickness=analysis_connection_thickness),
                #     (11, 13): mp_drawing.DrawingSpec(color=(204, 154, 255), thickness=analysis_connection_thickness),
                #     (13, 15): mp_drawing.DrawingSpec(color=(255, 153, 255), thickness=analysis_connection_thickness),
                # }
                # connections_analysis = frozenset(connections_analysis_drawing_spec.keys())
                # analysis_unique_lms = set()
                # for connection in connections_analysis:
                #     analysis_unique_lms.add(connection[0])
                #     analysis_unique_lms.add(connection[1])
                # analysis_unique_lms = frozenset(analysis_unique_lms)
                # analysis_lm_drawing_spec = {
                #     lm: mp_drawing.DrawingSpec(color=(244, 244, 244), thickness=analysis_connection_thickness + 2)
                #     for lm in analysis_unique_lms
                # }

                # custom_draw_landmarks(
                #     imgcpy,
                #     frame_data.pose_landmarks,
                #     connections_analysis,
                #     landmark_drawing_spec=analysis_lm_drawing_spec,
                #     connection_drawing_spec=connections_analysis_drawing_spec
                # )
                # cv2.imwrite('temp.jpg', imgcpy)

                draw_normalized_landmarks(image, frame_data.pose_landmarks, POSE_CONNECTIONS)
                frame_output_folder.mkdir(parents=True, exist_ok=True)
                out_path_2d = f'{frame_output_folder}/{input_video_path.stem}_2d/{input_video_path.stem}_{frame_i:0{len(str(int(frame_count)))}}.jpg'
                Path(out_path_2d).parent.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(out_path_2d, image)

                if landmark_list(frame_data.pose_world_landmarks):
                    plot_3d_pose(
                        holistic_series_row, 
                        title=f'{holistic_data_output_filepath.name}-frame{frame_i}'
                    )

                    out_path = f'{frame_output_folder}/{input_video_path.stem}_3d/{input_video_path.stem}_{frame_i:0{len(str(int(frame_count)))}}.png'
                    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

                    ax = plt.gca()
                    ax.azim = -92 # type: ignore
                    ax.elev = 118 # type: ignore
                    ax.dist = 10  # type: ignore
                    
                    # plt.show(block=True)
                    plt.savefig(out_path)
                    # plt.show(block=True)
                    plt.close()

            print_progress(frame_i, frame_count)
            if frame_i == 0:
                holistic_csv_writer.writerow(header_row)
                if (pose_2d_csv_writer):
                    pose_2d_csv_writer.writerow(pose2d_header_row)
            
            holistic_csv_writer.writerow(holistic_csv_row)
            if (pose_2d_csv_writer):
                pose2d_csv_row = transform_to_pose2d_csvrow(frame_i, frame_data, video_width, video_height)
                pose_2d_csv_writer.writerow(pose2d_csv_row)
    
    if (pose_2d_file):
        pose_2d_file.close()
            
def compute_holistic_data(
    video_folder: Path,
    output_folder: Path,
    pose2d_output_folder: t.Optional[Path] = None,
    model_complexity: int = 2,
    frame_output_folder: t.Optional[Path] = None,
    rewrite_existing: bool = False,
    print_prefix: t.Callable[[], str]=lambda: '',
):
    if not output_folder.exists():
        output_folder.mkdir(parents=True)

    video_folder = Path(video_folder)
    video_paths = []
    parent_folder = video_folder.parent
    if video_folder.is_dir():
        video_paths = video_folder.rglob('*.mp4')
        parent_folder = video_folder
    else:
        parent_folder = video_folder.parent
        video_paths = parent_folder.glob(video_folder.name)
        
    video_paths = list(video_paths)

    skipped_count = 0
    processed_count = 0
    for i, video_path in enumerate(video_paths):
        video_file_relative = video_path.relative_to(parent_folder)
        video_file_relative_stem = video_file_relative.with_suffix('')
        holistic_data_filepath = output_folder / video_file_relative.with_suffix(".holisticdata.csv")
        pose_2d_data_filepath = (pose2d_output_folder / video_file_relative.with_suffix(".pose2d.csv")) if pose2d_output_folder is not None else None

        holistic_is_valid = (
            holistic_data_filepath.exists() and holistic_data_filepath.stat().st_size > 0
        )
        pose2d_is_valid = (
            pose_2d_data_filepath is None
            or (pose_2d_data_filepath.exists() and pose_2d_data_filepath.stat().st_size > 0)
        )

        if not rewrite_existing and holistic_is_valid and pose2d_is_valid:
            skipped_count += 1
            continue
        else:
           processed_count += 1

        process_video(
            input_video_path=video_path,
            model_complexity=model_complexity,
            holistic_data_output_filepath=holistic_data_filepath,
            pose_2d_data_output_filepath=pose_2d_data_filepath,
            frame_output_folder=frame_output_folder,
            print_progress_context=lambda: f"{print_prefix()} Video {i+1}/{len(video_paths)} {video_file_relative_stem}",
        )

    print(f"{print_prefix()} Processed {processed_count} videos, skipped {skipped_count} videos")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--video_folder', type=Path, required=True)
    parser.add_argument('--output_folder', type=Path, required=True)
    parser.add_argument('--log_level', type=str, default='INFO')
    parser.add_argument('--model-complexity', type=int, default=2)
    parser.add_argument('--frame_output_folder', type=Path, default=None)
    parser.add_argument('--rewrite_existing', action='store_true', default=False)
    args = parser.parse_args()
    
    compute_holistic_data(
        video_folder=args.video_folder,
        output_folder=args.output_folder,
        model_complexity=args.model_complexity,
        frame_output_folder=args.frame_output_folder,
        rewrite_existing=args.rewrite_existing,
    )
