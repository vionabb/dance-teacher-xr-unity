import librosa
import numpy as np
import typing as t
import moviepy as mp
from pathlib import Path
import dataclasses as dc
import dataclasses_json as dcj

@dc.dataclass
class MusicPhrase(dcj.DataClassJsonMixin):
    start_time: float
    midpoints: t.List[float]
    end_time: float

def standardize_bpm_range(bpm_in: float, bpm_min: float = 80.0, bpm_max: float = 200.0) -> float:
    """
    Standardize the input BPM value to be within a specified range.

    If the input BPM value is less than the minimum BPM value, it is doubled until it is within the range.
    If the input BPM value is greater than the maximum BPM value, it is halved until it is within the range.

    Parameters:
    bpm_in (float): The input BPM value.
    bpm_min (float): The minimum BPM value allowed. Default is 80.0.
    bpm_max (float): The maximum BPM value allowed. Default is 200.0.

    Returns:
    The standardized BPM value within the specified range.
    """
    if bpm_in <= 0:
        raise ValueError('BPM must be greater than 0.')
    assert bpm_max >= bpm_min * 2, 'Maximum BPM must be at least twice the minimum BPM.'
        
    bpm = bpm_in
    while bpm < bpm_min:
        bpm *= 2
    while bpm > bpm_max:
        bpm /= 2
    return bpm


def calculate_8beat_segments_with_midpoints(bpm: float, beat_offset: float, duration: float) -> t.Iterable[MusicPhrase]:
    """Calculate musical phrases (based on 8-beat segments), aligned to the beat.
    The phrases include midpoints that divide the phrase into individual bars.
    Takes care not to subdivide into bars when the musical phrase is too short.

    Parameters:
    bpm (float): The tempo of the music in beats per minute.
    beat_offset (float): The offset of the first beat in seconds.
    duration (float): The duration of the music in seconds.

    Returns:
    A generator that yields a MusicPhrase for each 8-beat segment.
    """
    sec_per_beat = 60 / bpm
    beats_per_bar = 4
    secs_per_bar = sec_per_beat * beats_per_bar
    bars_per_segment = 2
    secs_per_segment = secs_per_bar * bars_per_segment

    ## Generate first segment
    # Edge case: single segment (< 1.5 segments; < 3 bars)
    if duration < beat_offset + secs_per_segment * 1.5:

        mid_points = []

        if duration > beat_offset + secs_per_bar * 0.75:
            # Add a midpoint at the end of the first bar
            mid_points.append(beat_offset + secs_per_bar)
        if duration > beat_offset + secs_per_bar * 1.25:
            # Add a midpoint at the end of the second bar
            mid_points.append(beat_offset + secs_per_segment)

        yield MusicPhrase(beat_offset, mid_points, duration)
        return
    
    # Typical case: multiple segments. Yield the first segment (special case to start at t=0).
    yield MusicPhrase(
        start_time=0, 
        midpoints=[beat_offset + secs_per_bar], 
        end_time=beat_offset + secs_per_segment
    )

    ## Generate middle segments (stop if we're within a segment and a half of the end)
    segment_start = secs_per_segment + beat_offset
    while segment_start + (1.5 * secs_per_segment) < duration:
        yield MusicPhrase(
            start_time=segment_start, 
            midpoints=[segment_start + secs_per_bar], # subdivide into two 4-beat bars
            end_time=segment_start + secs_per_segment
        )
        segment_start += secs_per_segment

    ## Generate last segment. This last one can be between 50% and 150% the length of a normal segment.
    duration_left = duration - segment_start    
    mid_points = []
    if duration_left > beat_offset + secs_per_bar * 0.75:
        mid_points.append(segment_start + beat_offset + secs_per_bar)
    if duration_left > beat_offset + secs_per_bar * 1.25:
        mid_points.append(segment_start + beat_offset + secs_per_segment)

    yield MusicPhrase(segment_start, mid_points, duration)

def save_audio_from_video(video_path: Path, output_audio_path: Path, as_mono: bool = False):
    """
    Extract the audio track from a video file and save it as a separate audio file.

    Parameters:
    video_path (Path): The path to the video file.
    output_audio_path (Path): The path to save the audio file.
    as_mono (bool): Whether to convert the audio to mono (default: False).
    """
    # Create the output directory if it doesn't exist
    output_audio_path.parent.mkdir(parents=True, exist_ok=True)

    # Use MoviePy to extract the audio track from the video file
    with mp.VideoFileClip(str(video_path)) as video_clip:
        audio_clip = video_clip.audio
        ffmpeg_params = []

        if as_mono:
            ffmpeg_params.extend(['-ac', '1'])

        audio_clip.write_audiofile( # type: ignore
            str(output_audio_path),
            ffmpeg_params=ffmpeg_params,
            # verbose=False, 
            logger=None
        ) 

def load_audio(path: Path, as_mono: bool = False) -> t.Tuple[np.ndarray, float]:
    """
    Load the audio from a file and return the audio array and sampling rate.

    Parameters:
    path (str): The path to the input file.

    Returns:
    tuple: A tuple containing the audio array and sampling rate.
    """
    # Check if the file is a video file
    audio_array, sample_rate = None, None # type: ignore
    if path.suffix in ('.mp4', '.avi', '.mov'):
        # Load the video file
        video = mp.VideoFileClip(str(path))

        if video.audio == None:
            raise Exception('No audio found in video file.')

        # Extract the audio from the video
        audio = video.audio

        if as_mono:
            audio.nchannels = 1
        
        # Convert the audio to a NumPy array
        audio_array: np.ndarray = audio.to_soundarray()

        # Get the sample rate of the audio
        sample_rate = float(audio.fps)

    # Otherwise, assume it's an audio file
    else:
        # Load the audio file with librosa
        audio_array, sample_rate = librosa.load(path, sr=None, mono=True)

        if len(audio_array) == 0:
            # print("Empty audio array. Trying again with duration set to the length of the audio file.")
            # See https://stackoverflow.com/questions/74496808/mp3-loading-using-librosa-return-empty-data-when-start-time-metadata-is-0
            import pydub
            import math
            mi = pydub.utils.mediainfo(path)
            duration = float(mi['duration'])
            # duration = math.floor(duration)
            audio_array, sample_rate = librosa.load(path, sr=None, mono=True, duration=duration)

        if len(audio_array) == 0:
            raise Exception("Couldn't load audio array.")
        
        # Convert the audio to mono if it's stereo
        if as_mono and audio_array.ndim > 1:
            audio_array = np.mean(audio_array, axis=0)

    return audio_array, sample_rate