from pathlib import Path
import typing as t
import cv2
import matplotlib
matplotlib.use("Agg")
from matplotlib import pyplot as plt
import mediapipe as mp
from mediapipe.python.solutions import holistic as mp_holistic
import numpy as np
import pandas as pd
from functools import reduce
import csv
import fnmatch

from .artifacts import build_artifact_report, resolve_artifact_output_dir
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

_QUALITY_JOINT_COLUMNS: t.Final[t.Dict[str, str]] = {
    "left_wrist": f"{PoseLandmark.LEFT_WRIST.name}_vis",
    "right_wrist": f"{PoseLandmark.RIGHT_WRIST.name}_vis",
    "nose": f"{PoseLandmark.NOSE.name}_vis",
    "left_foot": f"{PoseLandmark.LEFT_FOOT_INDEX.name}_vis",
    "right_foot": f"{PoseLandmark.RIGHT_FOOT_INDEX.name}_vis",
}


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


def _match_debug_frame_whitelist(relative_path: Path, whitelist: t.Sequence[str]) -> bool:
    patterns = list(whitelist) if len(whitelist) > 0 else ["*"]
    candidate_paths = [
        relative_path.as_posix(),
        relative_path.name,
        relative_path.stem,
        relative_path.with_suffix("").as_posix(),
    ]
    return any(
        fnmatch.fnmatchcase(candidate, pattern)
        for pattern in patterns
        for candidate in candidate_paths
    )


def _read_video_metadata(video_path: Path) -> t.Dict[str, float]:
    cap = cv2.VideoCapture(str(video_path))
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        fps = fps if fps > 0 else 30.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        return {
            "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0),
            "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0),
            "frame_count": frame_count,
            "fps": fps,
            "duration_seconds": frame_count / fps if fps > 0 else 0.0,
        }
    finally:
        cap.release()


def summarize_holistic_data_quality(
    *,
    dataframe: t.Optional[pd.DataFrame] = None,
    csv_path: t.Optional[Path] = None,
) -> pd.Series:
    if dataframe is None:
        if csv_path is None:
            raise ValueError("Either dataframe or csv_path must be provided.")
        dataframe = pd.read_csv(csv_path)

    summary: t.Dict[str, t.Union[int, float]] = {}

    pose_vis_columns = [column for column in dataframe.columns if column.endswith("_vis") and not column.startswith(("LEFTHAND_", "RIGHTHAND_"))]
    pose_detected_mask = dataframe[pose_vis_columns].notna().any(axis=1) if pose_vis_columns else pd.Series(False, index=dataframe.index)
    valid_pose_frame_count = int(pose_detected_mask.sum())
    invalid_pose_frame_count = int(len(dataframe.index) - valid_pose_frame_count)

    summary["valid_pose_frame_count"] = valid_pose_frame_count
    summary["invalid_pose_frame_count"] = invalid_pose_frame_count
    summary["max_people_detected_in_frame"] = 1 if valid_pose_frame_count > 0 else 0

    quantile_map = {
        "p10": 0.10,
        "q1": 0.25,
        "median": 0.50,
        "q3": 0.75,
        "p90": 0.90,
    }

    for joint_label, visibility_column in _QUALITY_JOINT_COLUMNS.items():
        if visibility_column in dataframe.columns:
            vis_series = dataframe[visibility_column].fillna(0.0)
        else:
            vis_series = pd.Series(0.0, index=dataframe.index)
        for quantile_name, quantile in quantile_map.items():
            summary[f"{joint_label}_{quantile_name}_visibility"] = float(vis_series.quantile(quantile))

    return pd.Series(summary)


def _zero_quality_summary(frame_count: int) -> pd.Series:
    summary: t.Dict[str, t.Union[int, float]] = {
        "valid_pose_frame_count": 0,
        "invalid_pose_frame_count": frame_count,
        "max_people_detected_in_frame": 0,
    }
    for joint_label in _QUALITY_JOINT_COLUMNS.keys():
        for quantile_name in ("p10", "q1", "median", "q3", "p90"):
            summary[f"{joint_label}_{quantile_name}_visibility"] = 0.0
    return pd.Series(summary)

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
    debug_frame_whitelist: t.Optional[t.Sequence[str]] = None,
    rewrite_existing: bool = False,
    print_prefix: t.Callable[[], str]=lambda: '',
    artifact_archive_root: t.Optional[Path] = None,
    artifact_output_dir: t.Optional[Path] = None,
):
    if not output_folder.exists():
        output_folder.mkdir(parents=True)

    artifact_dir = resolve_artifact_output_dir(
        artifact_archive_root=artifact_archive_root,
        artifact_output_dir=artifact_output_dir,
        default_label="compute-holistic-data",
    )
    debug_frame_whitelist = list(debug_frame_whitelist) if debug_frame_whitelist is not None else ["*"]

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
    video_relative_stems = {video_path.relative_to(parent_folder).with_suffix("").as_posix() for video_path in video_paths}
    orphan_holistic_warnings: t.List[str] = []
    if output_folder.exists():
        for holistic_csv_path in output_folder.rglob("*.holisticdata.csv"):
            holistic_relative_stem = holistic_csv_path.relative_to(output_folder).with_suffix("").with_suffix("").as_posix()
            if holistic_relative_stem not in video_relative_stems:
                warning = (
                    f"WARNING: Found holistic CSV without a matching video file: "
                    f"{holistic_csv_path.relative_to(output_folder).as_posix()}"
                )
                print(f"{print_prefix()} {warning}")
                orphan_holistic_warnings.append(warning)

    cached_count = 0
    computed_count = 0
    summary_rows: t.List[pd.Series] = []
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

        status = "cached"
        if rewrite_existing or not holistic_is_valid or not pose2d_is_valid:
            status = "computed"
            computed_count += 1
            current_frame_output_dir = None
            if frame_output_folder is not None and _match_debug_frame_whitelist(video_file_relative, debug_frame_whitelist):
                current_frame_output_dir = frame_output_folder / video_file_relative.parent

            process_video(
                input_video_path=video_path,
                model_complexity=model_complexity,
                holistic_data_output_filepath=holistic_data_filepath,
                pose_2d_data_output_filepath=pose_2d_data_filepath,
                frame_output_folder=current_frame_output_dir,
                print_progress_context=lambda: f"{print_prefix()} Video {i+1}/{len(video_paths)} {video_file_relative_stem}",
            )
        else:
            cached_count += 1

        video_metadata = _read_video_metadata(video_path)
        if not holistic_data_filepath.exists() or holistic_data_filepath.stat().st_size == 0:
            warning = (
                f"WARNING: Holistic CSV is empty after processing and will be summarized as zero-quality: "
                f"{holistic_data_filepath.relative_to(output_folder).as_posix()}"
            )
            print(f"{print_prefix()} {warning}")
            orphan_holistic_warnings.append(warning)
            quality_summary = _zero_quality_summary(int(video_metadata["frame_count"]))
        else:
            quality_summary = summarize_holistic_data_quality(csv_path=holistic_data_filepath)
        summary_rows.append(
            pd.Series(
                {
                    "file": video_file_relative.as_posix(),
                    "status": status,
                    "width": video_metadata["width"],
                    "height": video_metadata["height"],
                    "duration_seconds": video_metadata["duration_seconds"],
                    "frame_count": video_metadata["frame_count"],
                    **quality_summary.to_dict(),
                }
            )
        )

    summary_df = pd.DataFrame(summary_rows)
    if not summary_df.empty:
        summary_df.sort_values(by="file", inplace=True)

    print(f"{print_prefix()} Computed {computed_count} videos, used cached holistic data for {cached_count} videos")

    if artifact_dir is not None:
        report = build_artifact_report(
            artifact_dir,
            title="Compute Holistic Data Report",
            intro=(
                f"Generated holistic pose CSV outputs for `{video_folder}` into `{output_folder}`."
            ),
        )
        report.add_heading("Run Summary")
        report.add_list(
            [
                f"Video source: `{video_folder}`",
                f"Holistic output: `{output_folder}`",
                f"Pose2D output: `{pose2d_output_folder}`" if pose2d_output_folder else "Pose2D output: disabled",
                f"Rewrite existing: `{rewrite_existing}`",
                f"Videos computed: `{computed_count}`",
                f"Videos cached: `{cached_count}`",
                "Maximum people detected per frame is currently a `0/1` metric because this holistic pipeline is single-person.",
            ]
        )
        if orphan_holistic_warnings:
            report.add_heading("Warnings")
            report.add_list(orphan_holistic_warnings)
        if not summary_df.empty:
            report.add_heading("Per-File Summary")
            report.add_dataframe(
                "holistic_summary",
                summary_df,
                max_rows_in_markdown=10,
                preview_rows=10,
            )
        report.write()

    return summary_df

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--video_folder', type=Path, required=True)
    parser.add_argument('--output_folder', type=Path, required=True)
    parser.add_argument('--log_level', type=str, default='INFO')
    parser.add_argument('--model-complexity', type=int, default=2)
    parser.add_argument('--frame_output_folder', type=Path, default=None)
    parser.add_argument('--debug_frame_whitelist', action='append', default=None)
    parser.add_argument('--rewrite_existing', action='store_true', default=False)
    parser.add_argument('--artifact_archive_root', type=Path, default=None)
    parser.add_argument('--artifact_output_dir', type=Path, default=None)
    args = parser.parse_args()
    
    compute_holistic_data(
        video_folder=args.video_folder,
        output_folder=args.output_folder,
        model_complexity=args.model_complexity,
        frame_output_folder=args.frame_output_folder,
        debug_frame_whitelist=args.debug_frame_whitelist,
        rewrite_existing=args.rewrite_existing,
        artifact_archive_root=args.artifact_archive_root,
        artifact_output_dir=args.artifact_output_dir,
    )
