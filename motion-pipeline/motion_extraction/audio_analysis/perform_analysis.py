from pathlib import Path
import typing as t
import time
import json
import shutil
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
try:
    import psutil
except ImportError:
    psutil = None

from ..artifacts import (
    build_artifact_report,
    resolve_artifact_clip_title,
    resolve_artifact_output_dir,
)
from .audio_analysis import AudioAnalysisResult, analyze_audio_file
from .audio_dance_tree import  create_dance_tree_from_audioanalysis
from .audio_tools import save_audio_from_video
from .similarity_analysis import plot_cross_similarity

ACCEPT_AUDIO_FILES = ['.mp3', '.wav', '.m4a', '.flac']
ACCEPT_VIDEO_FILES = ['.mp4', '.mov', '.avi', '.mkv']
ACCEPT_AUDIOVIDEO_FILES = ACCEPT_AUDIO_FILES + ACCEPT_VIDEO_FILES

def find_cached_audiofile(video_filepath: Path, input_dir_root: Path, cache_dir_root: Path, allowed_suffixes = ['.mp3', '.wav']) -> t.Union[Path, None]:
    relative_path = video_filepath.relative_to(input_dir_root)

    for suffix in allowed_suffixes:
        cached_audiofile = cache_dir_root / relative_path.with_suffix(suffix)
        if cached_audiofile.exists():
            return cached_audiofile
    
    return None

def get_memory_usage() -> str:
    if psutil is None:
        return "psutil unavailable"
    process = psutil.Process()
    memory_info = process.memory_info()
    memory_usage_MB = memory_info.rss / 1024 / 1024

    available_memory = psutil.virtual_memory().total
    available_memory_MB = available_memory / 1024 / 1024
    return f"{memory_usage_MB:,.2f} / {available_memory_MB:,.2f} MB"

def get_audio_result_subdirectory(
    results_dir: Path,
    result_type: t.Literal['analysis', 'dancetrees', 'segmentsimilarity'],
    input_type: t.Literal['audio', 'video'] = 'video'
):
    return results_dir / result_type / input_type

def get_audio_analysis_filepath(
    analysis_dir: Path,
    relative_stem: Path,
):
    return analysis_dir / relative_stem.with_suffix('.json')

def perform_audio_analysis(
        videosrcdir: t.Optional[Path],
        audiosrcdir: t.Optional[Path],
        audio_analysis_destdir: Path,
        audiocachedir: Path,
        analysis_summary_out: Path,
        database_csv_path: t.Optional[Path] = None,
        include_mem_usage: bool = False,
        skip_existing: bool = False,
        print_prefix: t.Callable[[], str] = lambda: '',
        artifact_archive_root: t.Optional[Path] = None,
        artifact_output_dir: t.Optional[Path] = None,
):
    def print_with_prefix(s: str="", **kwargs):
        print(f"{print_prefix()}{s}", **kwargs)

    artifact_dir = resolve_artifact_output_dir(
        artifact_archive_root=artifact_archive_root,
        artifact_output_dir=artifact_output_dir,
        default_label="audio-analysis",
    )
    artifact_plots_dir = None if artifact_dir is None else artifact_dir / "plots"
    artifact_similarity_dir = None if artifact_dir is None else artifact_dir / "cross_similarity"
    if artifact_plots_dir is not None:
        artifact_plots_dir.mkdir(parents=True, exist_ok=True)
    if artifact_similarity_dir is not None:
        artifact_similarity_dir.mkdir(parents=True, exist_ok=True)

    print_with_prefix(f"Running audio analysis...")
    force_redo_analysis = not skip_existing

    # Get the paths of the audio or video files (search recursively)
    input_video_filepaths = []
    input_video_cached_audio_filepaths = []
    input_audio_filepaths = []
    if videosrcdir:
        for filepath in videosrcdir.rglob('*'):
            if filepath.suffix.lower() in ACCEPT_VIDEO_FILES:
                input_video_filepaths.append(filepath)
    if audiosrcdir:
        for filepath in audiosrcdir.rglob('*'):
            if filepath.suffix.lower() in ACCEPT_AUDIO_FILES:
                input_audio_filepaths.append(filepath)

    print_with_prefix(f"Found {len(input_video_filepaths)} input video files and {len(input_audio_filepaths)} input audio files.")

    start_time = time.time()
    def print_with_time(s: str, **kwargs):
        mem_usage_str = f'\t{get_memory_usage()}\t' if include_mem_usage else ' '
        print_with_prefix(f"{time.time() - start_time:.2f}s:{mem_usage_str}{s}", **kwargs)

    analysis_summary = []

    # Find or cache audio from each video file
    if videosrcdir:
        print_with_time('Caching audio from video files...')
        for i, filepath in enumerate(input_video_filepaths):
            relative_filepath = filepath.relative_to(videosrcdir)
            # print_with_time(f"Extracting cached audio {i+1}/{len(input_video_filepaths)}: {relative_filepath}")
            # print_with_time(f"\t{i+1}/{len(input_video_filepaths)} ", end='')

            # Check if the audio file has already been cached
            cached_audio_filepath = find_cached_audiofile(filepath, videosrcdir, audiocachedir)
            if cached_audio_filepath is None:
                print_with_time(f"\t{i+1}/{len(input_video_filepaths)} Extracting audio from video --> ", end='')
                # Extract the audio from the video file
                cached_audio_filepath = audiocachedir / filepath.relative_to(videosrcdir).with_suffix('.mp3')
                save_audio_from_video(filepath, cached_audio_filepath, as_mono=True)
                print(f'{cached_audio_filepath.relative_to(audiocachedir)})')

            input_video_cached_audio_filepaths.append(cached_audio_filepath)

    all_input_filepaths = input_audio_filepaths + input_video_filepaths
    all_input_audiopaths = input_audio_filepaths + input_video_cached_audio_filepaths
    input_types: t.List[t.Literal["audio", "video"]] = ["audio"] * len(input_audio_filepaths) + ["video"] * len(input_video_filepaths) # type: ignore
    src_dirs = [audiosrcdir] * len(input_audio_filepaths) + [videosrcdir] * len(input_video_filepaths)

    print_with_time('Analyzing audio...')
    for i, (filepath, audio_filepath, input_type, src_dir) in enumerate(zip(all_input_filepaths, all_input_audiopaths, input_types, src_dirs)):

        relative_filepath = filepath.relative_to(src_dir)
        clip_relative_stem = relative_filepath.with_suffix("").as_posix()
        figure_display_title = resolve_artifact_clip_title(
            clip_relative_stem,
            database_csv_path=database_csv_path,
            fallback_title=filepath.stem,
        )

        # Save the analysis information (with same relative path as input file)
        analysis_destdir = get_audio_result_subdirectory(
            results_dir=audio_analysis_destdir, 
            input_type=input_type, 
            result_type='analysis'
        )
        analysis_output_filepath: Path = get_audio_analysis_filepath(analysis_dir=analysis_destdir, relative_stem=relative_filepath)
        analysis_destdir / relative_filepath.with_suffix('.json')
        plots_folder: Path = analysis_destdir / 'plots'
        
        analysis_result = None
        should_reanalyze_audio = True
        if skip_existing and analysis_output_filepath.exists():
            print_with_time(f"    {i+1}/{len(all_input_filepaths)} [{input_type} src] Exists: {analysis_output_filepath.relative_to(audio_analysis_destdir)}")
            # Try-catch is necessary because sometimes we update the format of the AudioAnalysisResult,
            # and the json files can be out of date, causing the AudioAnalysisResult.from_dict() to fail.
            # In this case, we'll reanalyze the audio.
            try:
                preexisting_analysis_filetext = analysis_output_filepath.read_text()
                analysis_result = AudioAnalysisResult.from_dict(json.loads(preexisting_analysis_filetext))
                should_reanalyze_audio = False
            except Exception as e:
                print_with_time(f"    {i+1}/{len(all_input_filepaths)} [{input_type} src] Error loading: {analysis_output_filepath.relative_to(audio_analysis_destdir)}: {e}. ")
                
        if should_reanalyze_audio:
            is_reanalyzing = analysis_output_filepath.exists()
            print_verb = "Re-Analyzing" if is_reanalyzing else "Analyzing   "
            print_with_time(f"    {i+1}/{len(all_input_filepaths)} [{input_type} src] {print_verb}: {relative_filepath}")
            analysis_result = analyze_audio_file(
                audio_filepath,
                output_plot_folder=plots_folder,
                display_title=figure_display_title,
            )
            analysis_output_filepath.parent.mkdir(parents=True, exist_ok=True)
            with open(analysis_output_filepath, 'w') as f:
                json.dump(analysis_result.to_dict(), f, indent=4)

        if artifact_plots_dir is not None:
            tempo_plot_path = plots_folder / f"{audio_filepath.stem}.tempo_analysis.pdf"
            if tempo_plot_path.exists():
                artifact_plot_path = artifact_plots_dir / relative_filepath.with_suffix(".tempo_analysis.pdf")
                artifact_plot_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(tempo_plot_path, artifact_plot_path)
            
        # Plot cross similarity matrix (if it doesn't already exist)
        similarity_dir = get_audio_result_subdirectory(
            results_dir=audio_analysis_destdir, 
            input_type=input_type, 
            result_type='segmentsimilarity'
        )
        cross_similarity_figpath = similarity_dir / relative_filepath.with_suffix('.pdf')
        if force_redo_analysis or not cross_similarity_figpath.exists():
            fig, ax = plot_cross_similarity(analysis_result.cross_similarity)
            ax.set_title(figure_display_title)
            cross_similarity_figpath.parent.mkdir(parents=True, exist_ok=True)
            fig.savefig(cross_similarity_figpath)
            plt.close(fig)
        if artifact_similarity_dir is not None and cross_similarity_figpath.exists():
            artifact_similarity_path = artifact_similarity_dir / relative_filepath.with_suffix(".pdf")
            artifact_similarity_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(cross_similarity_figpath, artifact_similarity_path)

        # Create / save dance tree files
        dance_tree_dir = get_audio_result_subdirectory(
            results_dir=audio_analysis_destdir, 
            input_type=input_type, 
            result_type='dancetrees'
        )

        clip_relativepath = clip_relative_stem
        dance_tree_filepath: Path = dance_tree_dir / relative_filepath.with_suffix('.dancetree.json')
        if force_redo_analysis or not dance_tree_filepath.exists():
            dance_tree = create_dance_tree_from_audioanalysis(
                tree_name=filepath.stem + " audio tree",
                clip_relativepath=clip_relativepath,
                analysis=analysis_result
            )
            dance_tree_filepath.parent.mkdir(parents=True, exist_ok=True)
            dance_tree_filepath.write_text(json.dumps(dance_tree.to_dict(), indent=4))
            
        # Append summary data (for the CSV file)
        analysis_summary.append(pd.Series({
            'bpm': analysis_result.tempo_info.bpm,
            'raw_bpm': analysis_result.tempo_info.raw_bpm,
            'plp_bpm': analysis_result.tempo_info.plp_bpm,
            'raw_plp_bpm': analysis_result.tempo_info.raw_plp_bpm,
            'beat_offset': analysis_result.tempo_info.beat_offset,
            'first_actual_beat': analysis_result.tempo_info.starting_beat_timestamp,
            'type': input_type,
        }, name=clip_relativepath)) # type: ignore

    # Save the analysis summary
    analysis_summary_out.parent.mkdir(parents=True, exist_ok=True)
    summary_df = pd.concat(analysis_summary, axis=1).T
    summary_df.index.name = 'filename'
    summary_df.sort_index(inplace=True)
    summary_df.to_csv(str(analysis_summary_out))

    if artifact_dir is not None:
        artifact_summary_path = artifact_dir / "analysis_summary.csv"
        shutil.copy2(analysis_summary_out, artifact_summary_path)

        report = build_artifact_report(
            artifact_dir,
            title="Audio Analysis Report",
            intro=(
                f"Analyzed audio inputs from `{videosrcdir}` and `{audiosrcdir}` into `{audio_analysis_destdir}`."
            ),
        )
        report.add_heading("Run Summary")
        report.add_list(
            [
                f"Video source dir: `{videosrcdir}`" if videosrcdir else "Video source dir: none",
                f"Audio source dir: `{audiosrcdir}`" if audiosrcdir else "Audio source dir: none",
                f"Analysis output dir: `{audio_analysis_destdir}`",
                f"Audio cache dir: `{audiocachedir}`",
                f"Summary CSV: `{analysis_summary_out}`",
                f"Copied artifact summary: `{artifact_summary_path.name}`",
                f"Input video count: `{len(input_video_filepaths)}`",
                f"Input audio count: `{len(input_audio_filepaths)}`",
                f"Skip existing: `{skip_existing}`",
            ]
        )
        report.add_heading("Analysis Summary")
        report.add_dataframe(
            "audio_analysis_summary",
            summary_df.reset_index(),
            max_rows_in_markdown=20,
            preview_rows=10,
        )
        report.write()

    print_with_time("Finished")
    return summary_df
