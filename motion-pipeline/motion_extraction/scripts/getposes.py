import argparse
import os
from pathlib import Path
import mediapipe as mp
from mediapipe.tasks.python import vision
import cv2
import csv
import itertools as it
from functools import reduce
import time

from motion_extraction.mp_utils import (
    POSE_LANDMARKER_HEAVY_MODEL_URL,
    PoseLandmark,
    build_base_options,
    ensure_task_model,
)

flat_map = lambda f, xs: reduce(lambda a, b: a + b, map(f, xs))

# Per mediapipe documentation, the landmarks are normalized to the image size and the z coordinate takes the same approx scale as x,
# with a greater values being further away from the camera (greater depth).
get_props_2d = lambda lm, width, height: [lm.x * width, lm.y * height, lm.z * width, lm.visibility]
get_props = lambda lm: [lm.x, lm.y, lm.z, lm.visibility]

map_props = lambda lms: flat_map(get_props, lms)
map_props_2d = lambda lms, width, height: flat_map(lambda lm: get_props_2d(lm, width, height), lms)

def write_mediapipe_landmarks_to_img(frame, pose_landmarks):
    visible_line_color = (255, 0, 0, 1)  # Blue color for visible landmarks, full opacity
    visible_lm_color = (0, 255, 0, 1)  # Green color for visible landmarks, full opacity
    invisible_color = (0, 0, 255, 0.5)  # Red color for invisible landmarks, semi-transparency
    width, height = frame.shape[1], frame.shape[0]
    for connection in vision.PoseLandmarksConnections.POSE_LANDMARKS:
        lm1 = connection.start
        lm2 = connection.end
        x1 = int(pose_landmarks[lm1].x * width)
        y1 = int(pose_landmarks[lm1].y * height)
        x2 = int(pose_landmarks[lm2].x * width)
        y2 = int(pose_landmarks[lm2].y * height)
        vis1 = pose_landmarks[lm1].visibility
        vis2 = pose_landmarks[lm2].visibility
        visAvg = (vis1 + vis2) / 2.0
        # lerp between the two colors based on visibility
        color = (
            int(visible_line_color[0] * visAvg + invisible_color[0] * (1 - visAvg)),
            int(visible_line_color[1] * visAvg + invisible_color[1] * (1 - visAvg)),
            int(visible_line_color[2] * visAvg + invisible_color[2] * (1 - visAvg)),
            int(visible_line_color[3] * visAvg + invisible_color[3] * (1 - visAvg))
        )
        cv2.line(frame, (x1, y1), (x2, y2), color, 2)
    for lm_index, landmark in enumerate(pose_landmarks):
        x = int(landmark.x * width)
        y = int(landmark.y * height)
        vis = landmark.visibility
        # lerp between the two colors based on visibility
        color = (
            int(visible_lm_color[0] * vis + invisible_color[0] * (1 - vis)),
            int(visible_lm_color[1] * vis + invisible_color[1] * (1 - vis)),
            int(visible_lm_color[2] * vis + invisible_color[2] * (1 - vis)),
            int(visible_lm_color[3] * vis + invisible_color[3] * (1 - vis))
        )
        
        cv2.circle(frame, (x, y), 7, color, -1)

        # draw landmark index slightly below the landmark
        # offset 15 pixels to left (to center the text)
        # offset 20 pixels below (to avoid overlap with the circle)
        black = (0, 0, 0, 1)  # black color for text
        cv2.putText(frame, str(lm_index), (x - 15, y + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, black, 1, cv2.LINE_AA)
    return frame

def process_video(pose_landmarker, video_path, csv_output_path, frame_dir: Path | None = None, output_normalized_coords: bool = False):

    start_time = time.time_ns()

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)

    POSE_LANDMARKS = list(PoseLandmark)
    PROPS = ['x', 'y', 'z', 'visibility']
    
    
    with open(csv_output_path, 'w', newline='') as csvfile:
        csvwriter = csv.writer(csvfile)
        
        csvwriter.writerow(
            ['frame', 'timestamp', 'is_valid'] + \
            [f'{lm.name}_{prop}_2d' for lm in POSE_LANDMARKS for prop in PROPS] + \
            [f'{lm.name}_{prop}_3d' for lm in POSE_LANDMARKS for prop in PROPS])
        frame_idx = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                # End of video reached
                break

            width, height = frame.shape[1], frame.shape[0]
            timestamp = frame_idx / fps
            timestamp_ns = int(timestamp * 1e9)
            # per https://github.com/google-ai-edge/mediapipe/issues/5265,
            # the metal implementaiton only supports image formats with an alpha channel
            frame_rgba = cv2.cvtColor(frame, cv2.COLOR_BGR2RGBA)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGBA, data=frame_rgba)            
            results = pose_landmarker.detect_for_video(mp_image, timestamp_ns)
            if not results.pose_landmarks or not results.pose_world_landmarks:
                csvwriter.writerow(
                    [frame_idx, timestamp, False] +
                    [None] * (len(POSE_LANDMARKS) * len(PROPS) * 2)
                )
            if results.pose_landmarks and results.pose_world_landmarks:
                PERSON_ID = 0 # only one person in the video
                csvwriter.writerow(
                    [frame_idx, timestamp, True] + 
                    (map_props_2d(results.pose_landmarks[PERSON_ID], width, height) 
                        if not output_normalized_coords else
                        map_props(results.pose_landmarks[PERSON_ID])
                    ) +
                    map_props(results.pose_world_landmarks[PERSON_ID])
                )
            
                if frame_dir is not None:
                    frame = write_mediapipe_landmarks_to_img(frame, results.pose_landmarks[PERSON_ID])
                    frame_path = frame_dir / video_path.name /f'{video_path.stem}.frame-{frame_idx:04d}.png'
                    frame_path.parent.mkdir(parents=True, exist_ok=True)
                    cv2.imwrite(str(frame_path), frame)

            frame_idx += 1
    cap.release()
    end_time = time.time_ns()
    elapsed_time = (end_time - start_time) / 1e9
    print(f'\tProcessed {frame_idx} frames in {elapsed_time:.2f} seconds ({frame_idx / elapsed_time:.2f} fps)')

def check_csv_video_match(csv_path, video_path):
    cap = cv2.VideoCapture(str(video_path))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    with open(csv_path, 'r') as csvfile:
        csvreader = csv.reader(csvfile)
        row_count = sum(1 for row in csvreader) - 1  # subtract 1 for header

    if frame_count < 10:
        return True # don't overwrite if video is too short
    
    
    # Mediapipe won't detect landmarks 
    difference = abs(frame_count - row_count)
    min_frames = min(frame_count, row_count)
    percentage = difference / max(min_frames, 1) # avoid division by zero
    
    return difference <= 1 or percentage < 0.20

def main():
    parser = argparse.ArgumentParser(description='Process videos to extract pose estimations.')
    parser.add_argument('input_dir', type=Path, help='Input directory containing .mp4 files')
    parser.add_argument('output_dir', type=Path, help='Output directory to save .pose.csv files')
    parser.add_argument('-f', '--frame_dir', type=Path, default=None, help='Optional directory to save frames with pose visualizations')
    parser.add_argument('-o', '--overwrite', action='store_true', help='Overwrite existing pose files')
    parser.add_argument('-n', '--normalized', action='store_true', help='Use normalized coordinates for pose landmarks (default is pixel coordinates)')

    args = parser.parse_args()
    input_dir: Path = args.input_dir
    output_dir: Path = args.output_dir
    frame_dir: Path | None = args.frame_dir if hasattr(args, 'frame_dir') else None
    overwrite: bool = args.overwrite
    output_normalized_coords: bool = args.normalized

    file_list = list(input_dir.rglob('*.mp4'));
    relative_paths = [input_path.relative_to(input_dir) for input_path in file_list]
    longest_relpath_len = max(len(str(relpath)) for relpath in relative_paths)
    num_files = len(file_list)
    num_files_digits = len(str(num_files))

    
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode
    # model is located at same directory as this script
    model_path = ensure_task_model(
        Path(os.path.dirname(__file__)) / 'pose_landmarker_heavy.task',
        POSE_LANDMARKER_HEAVY_MODEL_URL,
    )

    options = PoseLandmarkerOptions(
        base_options=build_base_options(model_path),
        running_mode=VisionRunningMode.VIDEO,
    )

    # Disable non-fatal logging from the glog system
    os.environ['GLOG_minloglevel'] = '3'
    pose_type = 'norm_cords' if output_normalized_coords else 'pixel_cords'

    for file_i, relative_path in enumerate(relative_paths):
        input_path = input_dir / relative_path

        output_path = output_dir / relative_path.with_suffix(f'.{pose_type}.pose.csv')
        padded_relative_path = str(relative_path).ljust(longest_relpath_len, ' ')
        print(f'{str(file_i+1).zfill(num_files_digits)}/{num_files}: {padded_relative_path} ', end='')
        if not overwrite and output_path.exists():
            if check_csv_video_match(output_path, input_path):
                print(f'skipping              ')
                continue
            else:
                print(f'overwriting (mismatch)')
        else:
            print(f'creating         ')

        print("\t", end='') # indent the mediapipe output (for better formatted logs)

        with PoseLandmarker.create_from_options(options) as pose:    
            output_path.parent.mkdir(parents=True, exist_ok=True)
            process_video(pose, input_path, output_path, frame_dir, output_normalized_coords), 

if __name__ == '__main__':
    main()
