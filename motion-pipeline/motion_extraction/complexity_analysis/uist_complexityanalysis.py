"""
    complexityanalysis.py

    This module implements various metics for complexity analysis of motion. 
    These functions can be used as difficulty heristics for pedagogical (lesson
    design) purposes, or as a view into motion similarity.

    The metrics implemented are:
        - Scalar sums of distance, velocity, acceleration, and jerk of 
          a selectable subset of joints.
        - Tempo (bpm) of accompanying music.
        - Length of motion (in frames).
"""
from enum import Enum, auto
import typing as t
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

from ..mp_utils import PoseLandmark as PoseLandmarks
from ..update_database import load_db

_HOLISTIC_DATA_LEGACY_SUFFIX = ".holisticdata.csv"
_HOLISTIC_DATA_RAW_SUFFIX = ".holisticdata.raw.csv"


def _clip_stem_from_holistic_csv_path(file_path: Path) -> str:
    name = file_path.name
    for suffix in (_HOLISTIC_DATA_RAW_SUFFIX, _HOLISTIC_DATA_LEGACY_SUFFIX):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return file_path.stem


def _collect_holistic_data_files(root_folder: Path) -> list[Path]:
    files_by_relative_stem: dict[str, Path] = {}
    for holistic_data_file in root_folder.rglob(_HOLISTIC_DATA_LEGACY_SUFFIX):
        relative_stem = holistic_data_file.relative_to(root_folder).as_posix()[: -len(_HOLISTIC_DATA_LEGACY_SUFFIX)]
        files_by_relative_stem[relative_stem] = holistic_data_file
    for holistic_data_file in root_folder.rglob(_HOLISTIC_DATA_RAW_SUFFIX):
        relative_stem = holistic_data_file.relative_to(root_folder).as_posix()[: -len(_HOLISTIC_DATA_RAW_SUFFIX)]
        files_by_relative_stem[relative_stem] = holistic_data_file
    return list(files_by_relative_stem.values())


class DVAJ(Enum):
    distance = auto()
    velocity = auto()
    acceleration = auto()
    jerk = auto()

class Stat(Enum):
    mean = auto()
    sum = auto()
    # MAX = "max"
    # MIN = "min"

def calc_scalar_dvaj(motion: pd.DataFrame, landmark_names: t.Collection[str]) -> pd.DataFrame:
    """
        Returns a dictionary of metrics for the given motion and joints.

        todo: normalize coordinates by torso length.

        The metrics are:
            - Distance
            - Velocity
            - Acceleration
            - Jerk
    """
    out_cols = []
    out_data = []

    # Calculate the scalar distance traveled each frame for each joint.
    for landmark in landmark_names:
        dist_col = f"{landmark}_{DVAJ.distance.name}"
        velocity_col = f"{landmark}_{DVAJ.velocity.name}"
        acceleration_col = f"{landmark}_{DVAJ.acceleration.name}"
        jerk_col = f"{landmark}_{DVAJ.jerk.name}"

        dist_data = motion[[f"{landmark}_x", f"{landmark}_y", f"{landmark}_z"]].diff().pow(2).sum(1).pow(0.5)
        velocity_data = dist_data.diff().abs()
        acceleration_data = velocity_data.diff().abs()
        jerk_data = acceleration_data.diff().abs()

        out_cols.extend([dist_col, velocity_col, acceleration_col, jerk_col])
        out_data.extend([dist_data, velocity_data, acceleration_data, jerk_data])

    return pd.concat(out_data, axis=1, keys=out_cols)


def get_all_landmarks_in_dataframe(frame: pd.DataFrame) -> t.List[str]:
    return list(set([
        col_name[:col_name.rfind('_')] if col_name.rfind('_') >= 0 else col_name
        for col_name in frame.columns
    ]))

def get_pose_landmarks_present_in_dataframe(frame: pd.DataFrame) -> t.List[str]: 
    all_landmarks = get_all_landmarks_in_dataframe(frame)
    lms = []
    for lm in all_landmarks:
        try:
            pose_landmark = PoseLandmarks[lm]
            lms.append(lm)
        except KeyError:
            pass
    return lms

def get_metric_name(measure: DVAJ, stat: Stat, target_landmark: str = None):
    if target_landmark is None:
        return f"{measure.name}_{stat.name}"
    else:
        return f"{target_landmark}_{measure.name}_{stat.name}"

def calc_dvaj_metrics(dvaj: pd.DataFrame) -> t.Dict[str, float]:
    landmark_names = get_pose_landmarks_present_in_dataframe(dvaj)
    
    metrics = {}
    frameCount = dvaj.shape[0]
    metrics['frameCount'] = frameCount
    landmarkCount = len(landmark_names)
    metrics['landmarkCount'] = landmarkCount

    for measure in DVAJ:
        # for landmark_name in landmark_names:
            # metrics[get_metric_name(measure, Stat.sum,  landmark_name)] = dvaj[f"{landmark_name}_{measure.name}"].sum()
            # metrics[get_metric_name(measure, Stat.mean, landmark_name)] = dvaj[f"{landmark_name}_{measure.name}"].mean()
        

        # Calculate the sum and average of the sum of all joints.
        dvaj_all_landmarks = dvaj[[f"{landmark}_{measure.name}" for landmark in landmark_names]].sum(axis=1)

        metrics[get_metric_name(measure, Stat.sum)]  = dvaj_all_landmarks.sum()
        metrics[get_metric_name(measure, Stat.mean)] = dvaj_all_landmarks.sum() / (landmarkCount * frameCount)
    
    return metrics

def plot_dvaj(dvaj: pd.DataFrame, ax: plt.Axes = None):
    landmark_names = get_pose_landmarks_present_in_dataframe(dvaj)

    if ax is None:
        ax = plt.gca()

    for col in dvaj.columns:
        ax.plot(dvaj[col], label=col)
    ax.legend()
    



def analyze_complexities(
    files: t.Collection[Path], 
    start_frames: t.List[int],
    end_frames: t.List[int],
    extra_data: t.List[dict],
    landmarks: t.Collection[PoseLandmarks] = [
        PoseLandmarks.LEFT_WRIST, 
        PoseLandmarks.RIGHT_WRIST,
        PoseLandmarks.LEFT_ELBOW,
        PoseLandmarks.RIGHT_ELBOW,
        PoseLandmarks.LEFT_SHOULDER,
        PoseLandmarks.RIGHT_SHOULDER,
        PoseLandmarks.LEFT_HIP,
        PoseLandmarks.RIGHT_HIP,
        PoseLandmarks.LEFT_KNEE,
        PoseLandmarks.RIGHT_KNEE,
        PoseLandmarks.LEFT_ANKLE,
        PoseLandmarks.RIGHT_ANKLE,
        PoseLandmarks.LEFT_EYE,
        PoseLandmarks.RIGHT_EYE,
    ],
) -> pd.DataFrame:

    if len(files) == 0:
        return

    
    data = pd.read_csv(files[0])

    if start_frames[0] is not None and end_frames[0] is not None:
        data = data[start_frames[0]:end_frames[0]]
    elif start_frames[0] is not None:
        data = data[start_frames[0]:]
    elif end_frames[0] is not None:
        data = data[:end_frames[0]]

    lm_names = [lm.name for lm in landmarks]
    dvaj = calc_scalar_dvaj(data, lm_names)
    metrics = calc_dvaj_metrics(dvaj)
    extra_keys = list(extra_data[0].keys())

    cols = extra_keys + list(metrics.keys())
    row = extra_data[0].copy()
    row.update(metrics)

    cols = list(metrics.keys()) + ['bpm']
    metrics.update({'bpm': row['bpm']})
    output = pd.DataFrame(
        columns=cols, 
        data=[row], 
        index=[_clip_stem_from_holistic_csv_path(files[0])]
    )

    for i, file in enumerate(files[1:]):
        i = i + 1 # because we already did the first one
        data = pd.read_csv(file)

        if start_frames[i] is not None and end_frames[i] is not None:
            data = data[start_frames[i]:end_frames[i]]
        elif start_frames[i] is not None:
            data = data[start_frames[i]:]
        elif end_frames[i] is not None:
            data = data[:end_frames[i]]

        dvaj = calc_scalar_dvaj(data, lm_names)
        # plt.savefig(file.with_suffix('.png'))

        metrics = calc_dvaj_metrics(dvaj)

        row = extra_data[i].copy()
        row.update(metrics)
        
        new_row = pd.DataFrame(
            columns=cols, 
            data=[row], 
            index=[_clip_stem_from_holistic_csv_path(file)]
        )

        output = pd.concat([output, new_row])
    
    # wrist_cols = [key for key in metrics.keys() if key.lower().find('wrist') != -1]
    # output.drop(wrist_cols, axis=1)

    z_score_cols = []
    for measure in DVAJ:
        for metric in Stat:
            z_score_cols.append(f'{measure.name}_{metric.name}')
    z_score_cols.append('bpm')


    for col in z_score_cols:
        mean = output[col].mean()
        stddev = output[col].std()
        z_scores = (output[col] - mean) / stddev
        output[f'{col}_zscore'] = z_scores

    composite_score = output[[f'{col}_zscore' for col in z_score_cols]].mean(axis=1)
    output['composite_score'] = composite_score

    return output

if __name__ == "__main__":
    import argparse
    import sys
    from pathlib import Path

    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", type=Path, default=Path.cwd() / "metrics.csv")  
    parser.add_argument("--srcdir", type=Path, required=False)  
    parser.add_argument("--db", type=Path, required=False)
    parser.add_argument("--whitelist", "-wl", type=str, action='append')
    parser.add_argument("files", nargs="*", type=Path)
    args = parser.parse_args()

    # if srcdir is specified, add all files of the form "*.holisticdata{,.raw}.csv" in that directory to the list of files.
    if args.srcdir is not None:
        args.files.extend(_collect_holistic_data_files(args.srcdir))
    elif len(args.files) == 0:
        print("No files specified. Use --srcdir or specify files as arguments.")
        sys.exit(1)

    if args.whitelist is not None:
        args.files = [
            file for file in args.files 
            if any(wl in file.stem for wl in args.whitelist)
        ]

    db = {}
    if args.db is not None:
        db = load_db(args.db).to_dict('records')

    start_frames = []
    end_frames = []
    extra_data = []
    bpms = []
    fpses = []

    for file in args.files:
        file_clipname = _clip_stem_from_holistic_csv_path(file)
        matches_file = lambda db_entry: db_entry.get('clipName') == file_clipname
        db_entry = next((x for x in db if matches_file(x)), None)

        if db_entry is not None:
            startTime = db_entry['startTime']
            endTime = db_entry['endTime']
            fps = db_entry['fps']
            start_frames.append(int(startTime * fps))
            end_frames.append(int(endTime * fps))
            extra_data.append({
                'bpm': db_entry.get('bpm', None),
                'fps': fps,
                'duration': endTime - startTime,
            })
        else:
            start_frames.append(None)
            end_frames.append(None)
            extra_data.append({
                'bpm': None,
                'fps': None,
                'duration': None,
            })

    output = analyze_complexities(args.files, 
        start_frames, 
        end_frames, 
        extra_data
    )

    output.to_csv(args.destination, index=True)

    print('Metrics written to', args.destination)

    sys.exit(0)
