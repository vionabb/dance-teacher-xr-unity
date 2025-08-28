from os import PathLike
from pathlib import Path
import pandas as pd
import json
import cv2
import typing as t
from enum import Enum
import unicodedata

class ClipType(str, Enum):
    video = 'video'
    mocap = 'mocap'

valid_file_endings = [
    # Case-insensitive for mp4, m4v, and mov
    '[mM][pP]4',
    '[mM]4[vV]',
    '[mM][oO][vV]',
]

def write_db(db: pd.DataFrame, db_csv_path: PathLike):
    # convert list items to strings
    db['tags'] = db['tags'].apply(lambda x: json.dumps(x))
    db['landmarkScope'] = db['landmarkScope'].apply(lambda x: json.dumps(x))
    
    float_rounding_decimals = 3
    def roundFloatList(x, decimals=float_rounding_decimals):
        return json.dumps([round(v, decimals) for v in x])
    
    if 'beatTimes' in db.columns:
        db['beatTimes'] = db['beatTimes'].apply(roundFloatList)

    # Get all columns of type float, and round them
    float_columns = db.select_dtypes(include='float').columns
    db[float_columns] = db[float_columns].round(float_rounding_decimals)

    lowercased_index = db.index.str.lower()
    db['lowercased_index'] = lowercased_index
    db.sort_values('lowercased_index', inplace=True)
    db.drop(columns=['lowercased_index'], inplace=True)

    db.to_csv(str(db_csv_path))

def load_db(db_csv_path: PathLike):
    db = pd.read_csv(str(db_csv_path), index_col='clipRelativeStem')

    # convert lists
    db['tags'] = db.get('tags', '[]').apply(lambda x: json.loads(x.replace("'",'"')))
    db['landmarkScope'] = db.get('landmarkScope', '[]').apply(lambda x: json.loads(x.replace("'",'"')))
    if 'beatTimes' in db.columns:
        db['beatTimes'] = db.get('beatTimes', '[]').apply(lambda x: json.loads(x.replace("'",'"')))

    # convert is_test to bool
    db['isTest'] = db['isTest'].astype(bool)

    # convert clipType to enum
    db['clipType'] = db['clipType'].apply(lambda x: ClipType[x])

    return db

def update_create_videoentry(
        entry: t.Dict, 
        video_path: Path, 
        clip_name: str, 
        clip_path: PathLike,
        relative_clip_stem: str,
        is_test: bool,
    ):
    if entry is None:
        entry = {}

    out_entry = {}

    out_entry['title'] = entry.get('title', clip_name)
    out_entry['clipName'] = clip_name
    out_entry['clipPath'] = Path(clip_path).as_posix()
    out_entry['clipRelativeStem'] = relative_clip_stem
    out_entry['clipType'] = ClipType.video.name
    out_entry['isTest'] = is_test

    out_entry['manualBPM'] = entry.get('manualBPM', 0.0)

    vid_data = cv2.VideoCapture(video_path.as_posix())
    frame_count = vid_data.get(cv2.CAP_PROP_FRAME_COUNT)
    out_entry['frameCount'] = int(frame_count)
    fps = vid_data.get(cv2.CAP_PROP_FPS)
    out_entry['fps'] = fps
    duration = frame_count / fps
    out_entry['duration'] = duration
    out_entry['width'] = int(vid_data.get(cv2.CAP_PROP_FRAME_WIDTH))
    out_entry['height'] = int(vid_data.get(cv2.CAP_PROP_FRAME_HEIGHT))

    out_entry['startTime'] = entry.get('startTime', 0)
    out_entry['endTime'] = entry.get('endTime', duration)

    out_entry['poseUpperBodyOnly'] = entry.get('poseUpperBodyOnly', False)
    out_entry['tags'] = entry.get('tags', [])
    out_entry['landmarkScope'] =     entry.get('landmarkScope', [
        'pose',
        'rightHand',
        'leftHand',
        'face'
    ])
    vid_data.release()

    return out_entry

def create_thumbnail(video_path: Path, relative_path: Path, timestamp: float, thumbnails_dir: Path, skip_existing: bool):
    thumbnail_path = relative_path.parent.joinpath(relative_path.stem + '.jpg')
    thumbnail_path = thumbnails_dir.joinpath(thumbnail_path)

    if thumbnail_path.exists() and skip_existing:
        return thumbnail_path
    
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    thumbnail_frame = int(fps * timestamp)
    success, image = cap.read()
    frame_i = 0
    while success and frame_i < thumbnail_frame:
        success, image = cap.read()
        frame_i += 1
    
    if success and frame_i == thumbnail_frame:
        thumbnail_path.parent.mkdir(exist_ok=True, parents=True)
        saved_successfully = cv2.imwrite(str(thumbnail_path), image)
        if not saved_successfully: 
            raise Exception(f'Unabled to save thumbnail {str(thumbnail_path)}')
    else:
        raise Exception(f'Unable to create thumbnail for {relative_path}. (got to frame {frame_i}, wanted to get thumbnail at frame {thumbnail_frame}, for timestamp {timestamp})')
    
    return thumbnail_path

def update_database(
        database_csv_path: PathLike,
        videos_dir: PathLike, 
        thumbnails_dir: t.Optional[PathLike],
        replace_existing_thumbnails: bool = False,
        print_prefix: t.Callable[[], str] = lambda: '',
    ):

    def print_with_prefix(*args, **kwargs):
        print(print_prefix(), *args, **kwargs)

    database_csv_path = Path(database_csv_path)
    videos_dir = Path(videos_dir)
    thumbnails_dir = None if not thumbnails_dir else Path(thumbnails_dir)
    if thumbnails_dir:
        thumbnails_dir.mkdir(exist_ok=True, parents=True)

    video_paths: t.List[Path] = []
    for file_ending in valid_file_endings:
        video_paths.extend(videos_dir.rglob(f'*.{file_ending}'))    

    # Safety measure: ensure all paths are normalized (no unexpected unicode characters)
    invalid_video_paths = []
    for video_path in video_paths:
        if not unicodedata.is_normalized('NFKC', video_path.as_posix()):
            print_with_prefix(f'ERROR: Video path {video_path.as_posix()} is not normalized. This may cause problems with the database.')
            normalized_version = Path(unicodedata.normalize('NFKC', video_path.as_posix()))
            print_with_prefix(f'This is the normalized form: {normalized_version.as_posix()}')
            invalid_video_paths.append(video_path)
    if len(invalid_video_paths) > 0:
        raise Exception(f'Found {len(invalid_video_paths)} video paths that are not normalized. See above for details.')    

    old_db = pd.DataFrame()
    old_db_exists = database_csv_path.exists()
    if old_db_exists:
        old_db = load_db(database_csv_path)
    else:
        print_with_prefix(f'WARNING No database.csv file found at {database_csv_path}.', flush=True)
        database_csv_path.parent.mkdir(parents=True, exist_ok=True)

    clip_names = [
        video_path.stem
        for video_path in video_paths
    ]
    clip_names_set = set(clip_names)

    # Remove entries for videos that no longer exist (searching by clipName)
    if old_db_exists:
        old_db_by_clipname = old_db.set_index('clipName')
        old_db_clipnames = set(old_db_by_clipname.index)
    else:
        old_db_by_clipname = old_db
        old_db_clipnames = set()

    updating_clipnames = clip_names_set.intersection(old_db_clipnames)
    discarding_clipnames = old_db_clipnames - clip_names_set
    adding_clipnames = clip_names_set - old_db_clipnames

    discarded_entries = old_db_by_clipname.loc[list(discarding_clipnames)] # type: ignore
    count_new_entries = len(clip_names_set) - len(old_db_by_clipname)
        
    out_db = {}
    for video_path in video_paths:
        

        relative_path = video_path.relative_to(videos_dir)
        
        # print_with_prefix(f'Processing {relative_path.as_posix()}')
        clip_name = relative_path.stem
        relative_clip_stem = (relative_path.parent / relative_path.stem).as_posix()

        is_test = False
        if len(relative_path.parents) > 0 and \
            relative_path.parents[0].name.lower().startswith('test'):
            is_test = True

        prev_entry = {}
        if clip_name in updating_clipnames:
            prev_entry = old_db_by_clipname.loc[clip_name].to_dict()
        
        entry = update_create_videoentry(
            entry = prev_entry,  # type: ignore
            video_path = video_path, 
            clip_name = clip_name, 
            clip_path = relative_path,
            relative_clip_stem = relative_clip_stem,
            is_test=is_test
        )
        start_time: float = entry['startTime']
        if thumbnails_dir:
            thumbnail_path = create_thumbnail(
                video_path=videos_dir.joinpath(relative_path), 
                relative_path=relative_path, 
                timestamp=start_time, 
                thumbnails_dir=thumbnails_dir, 
                skip_existing=not replace_existing_thumbnails
            )            
            entry['thumbnailSrc'] = thumbnail_path.relative_to(thumbnails_dir).as_posix()

        out_db[relative_clip_stem] = entry
    
    new_db = list(out_db.values())

    df = pd.DataFrame.from_records(new_db)

    if df.empty:
        print_with_prefix(f'WARNING: No valid entries found.')
    else:
        df.set_index('clipRelativeStem', inplace=True)

    print_with_prefix(f'Discarded {len(discarded_entries)} entries')
    print_with_prefix(f'Added {count_new_entries} entries')
    print_with_prefix(f"Updated {len(old_db_by_clipname)} entries")

    write_db(df, database_csv_path)

if __name__ == "__main__":

    import argparse
    parser = argparse.ArgumentParser(description='Update the database json file with videos detected in the video directory.')
    parser.add_argument('--database_csv_path', type=Path, help='Path to the database.csv file')
    parser.add_argument('--videos_dir', type=Path, help='Path to the directory containing the videos')
    parser.add_argument('--thumbnails_dir', type=Path, help='Path to the directory where thumbnails should be saved')

    args = parser.parse_args()

    # try:
    update_database(
        database_csv_path=args.database_csv_path,
        videos_dir = args.videos_dir,
        thumbnails_dir = args.thumbnails_dir
    )
    # except Exception as e:
    #     import traceback
    #     print('Error while updating the database:')
    #     traceback.print_exc(file=sys.stderr)
        
    