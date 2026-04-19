import dataclasses as dc
import dataclasses_json as dcj
import typing as t
import numpy as np
from pathlib import Path
from .audio_tools import calculate_8beat_segments_with_midpoints, load_audio, MusicPhrase
from .tempo_analysis import TempoInfo, calculate_tempo_info
from .similarity_analysis import calculate_cross_similarity, compute_segment_groupings

@dc.dataclass
class AudioAnalysisResult(dcj.DataClassJsonMixin):
    duration: float
    sample_rate: int
    tempo_info: TempoInfo
    musical_phrases: t.List[MusicPhrase]
    phrase_groupings: t.List[t.List[int]]
    cross_similarity: t.List[t.List[float]]

def analyze_audio_file(
    filepath: Path,
    output_plot_folder: t.Optional[Path] = None,
    display_title: t.Optional[str] = None,
) -> AudioAnalysisResult:
    # Load the audio file
    audio_array, sample_rate = load_audio(filepath, as_mono=True)
    return analyze_audio(
        audio_array,
        sample_rate,
        audio_name=filepath.stem,
        display_title=display_title,
        output_plot_folder=output_plot_folder,
    )

def analyze_audio(
    audio_array: np.ndarray, 
    sample_rate: int, 
    audio_name: t.Optional[str] = None,
    display_title: t.Optional[str] = None,
    output_plot_folder: t.Optional[Path] = None,
) -> AudioAnalysisResult:
    
    # Calculate the tempo information.
    tempo_plot_path = None if output_plot_folder is None else output_plot_folder / f'{audio_name}.tempo_analysis.pdf'
    tempo_info: TempoInfo = calculate_tempo_info(
        audio_array,
        sample_rate,
        audio_name=display_title if display_title is not None else audio_name,
        figure_output_filepath=tempo_plot_path,
    )

    duration = len(audio_array) / sample_rate

    # Create 8-bar segments.
    eight_beat_segments_with_midpoints = list(calculate_8beat_segments_with_midpoints(tempo_info.bpm, tempo_info.starting_beat_timestamp, duration))
    eight_beat_segments_noendpoints = [
        (times.start_time, times.end_time) 
        for times in eight_beat_segments_with_midpoints
    ]

    # Compute similarity of 8-bar segments, then group them into larger components.
    cross_similarity  = calculate_cross_similarity(audio_array, sample_rate, eight_beat_segments_noendpoints)
    segment_groupings = compute_segment_groupings(cross_similarity)
    
    return AudioAnalysisResult(
        duration=duration,
        sample_rate=sample_rate,
        tempo_info=tempo_info,
        musical_phrases=eight_beat_segments_with_midpoints,
        phrase_groupings=segment_groupings,
        cross_similarity=cross_similarity.tolist()
    )
