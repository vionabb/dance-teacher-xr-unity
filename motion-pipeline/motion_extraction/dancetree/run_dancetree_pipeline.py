from pathlib import Path
import typing as t
from ..stepone_get_holistic_data import compute_holistic_data
from ..update_database import update_database
from ..complexity_analysis import calculate_cumulative_complexity as cmplxty
from ..complexity_analysis.add_complexity_to_dancetree import add_complexities_to_dancetrees
from .bundle_data import bundle_dance_data_as_json
import shutil


def _audio_result_subdirectory(
    results_dir: Path,
    result_type: t.Literal['analysis', 'dancetrees', 'segmentsimilarity'],
    input_type: t.Literal['audio', 'video'] = 'video'
):
    return results_dir / result_type / input_type

def run_dancetree_pipeline(
    database_csv_path: Path,
    video_srcdir: Path,
    holistic_data_srcdir: Path,
    pose2d_data_srcdir: Path,
    temp_dir: Path,
    bundle_export_path: Path,
    bundle_media_export_path: Path,
    include_audio_in_bundle: bool = False,
    include_thumbnail_in_bundle: bool = False,
    rewrite_existing_holistic_data: bool = False,
    skip_existing_cumulative_complexity: bool = False,
    skip_existing_audioanalysis: bool = False,
    output_holistic_debug_frames: bool = False,
    complexity_diagnostics_dir: t.Optional[Path] = None,

):
    complexities_temp_dir = temp_dir / 'complexities'
    audio_results_temp_dir = temp_dir / 'audio_analysis'
    audio_analysis_tree_dir = _audio_result_subdirectory(
        results_dir=audio_results_temp_dir, 
        result_type='dancetrees', 
        input_type='video'
    )
    holistic_frames_dir = temp_dir / 'holistic_debug_frames' if output_holistic_debug_frames else None

    trees_with_complexity_dir = temp_dir / 'trees_with_complexity'

    audio_cache_dir =  bundle_media_export_path / 'audio' if include_audio_in_bundle \
                        else audio_results_temp_dir / 'audiocache'
    
    thumbnails_outdir = bundle_media_export_path / 'thumbnails' if include_thumbnail_in_bundle \
                        else None

    COMPLEXITY_MEASURE_WEIGHITNG = cmplxty.DvajMeasureWeighting.decreasing_by_quarter
    COMPLEXITY_LANDMARK_WEIGHITNG = cmplxty.PoseLandmarkWeighting.balanced
    COMPLEXITY_INCLUDE_BASE = True
    COMPLEXITY_BY_VISIBILITY = True

    complexity_method = cmplxty.get_complexity_creationmethod_name(
        measure_weighting_choice=COMPLEXITY_MEASURE_WEIGHITNG,
        landmark_weighting_choice=COMPLEXITY_LANDMARK_WEIGHITNG,
        weigh_by_visibility=COMPLEXITY_BY_VISIBILITY,
        include_base=COMPLEXITY_INCLUDE_BASE,
    )
    
    STEP_COUNT = 6
    current_step = 1
    step = lambda: f'Step {current_step}/{STEP_COUNT}:'

    current_step += 1
    update_database(
        database_csv_path=database_csv_path,
        videos_dir=video_srcdir,
        thumbnails_dir=thumbnails_outdir,
        print_prefix=lambda: f'{step()} update database:',
        replace_existing_thumbnails=False,
    )

    current_step += 1
    compute_holistic_data(
        video_folder=video_srcdir,
        output_folder=holistic_data_srcdir,
        pose2d_output_folder=pose2d_data_srcdir,
        frame_output_folder=holistic_frames_dir if output_holistic_debug_frames else None,
        rewrite_existing=rewrite_existing_holistic_data,
        print_prefix=lambda: f'{step()} compute holistic data:',
    )

    current_step += 1
    cmplxty.calculate_cumulative_complexities(
        srcdir=holistic_data_srcdir,
        other_files=[],
        destdir=complexities_temp_dir,
        measure_weighting=COMPLEXITY_MEASURE_WEIGHITNG,
        landmark_weighting=COMPLEXITY_LANDMARK_WEIGHITNG,
        diagnostic_output_dir=complexity_diagnostics_dir,
        include_base=True,
        weigh_by_visibility=True,
        print_prefix=lambda: f'{step()} calc. complexity:',
        skip_existing=skip_existing_cumulative_complexity,
    )
    
    current_step += 1
    if skip_existing_audioanalysis and audio_analysis_tree_dir.exists() and (audio_results_temp_dir / 'audio_analysis_summary.csv').exists():
        print(f"{step()} audio analysis: reusing existing audio analysis outputs")
    else:
        from ..audio_analysis.perform_analysis import perform_audio_analysis

        perform_audio_analysis(
            videosrcdir=video_srcdir,
            audiosrcdir=None,
            audio_analysis_destdir=audio_results_temp_dir,
            audiocachedir=audio_cache_dir if audio_cache_dir else temp_dir / 'audio_cache',
            analysis_summary_out=audio_results_temp_dir / 'audio_analysis_summary.csv',
            include_mem_usage=False,
            skip_existing=skip_existing_audioanalysis,
            print_prefix=lambda: f'{step()} audio analysis:',
        )

    current_step += 1
    add_complexities_to_dancetrees(
        tree_srcdir=audio_analysis_tree_dir,
        complexity_srcdir=complexities_temp_dir,
        database_path=database_csv_path,
        output_dir=trees_with_complexity_dir,
        complexity_method=complexity_method,
        trim_zero_complexity=True,
        get_print_prefix=lambda: f'{step()} add complexity:',
    )

    current_step += 1
    bundle_dance_data_as_json(
        dancetree_srcdir=trees_with_complexity_dir,
        db_csv_path=database_csv_path,
        audio_results_dir=audio_results_temp_dir,
        bundle_export_path=bundle_export_path,
        exclude_test=True,
        print_prefix=lambda: f'{step()} bundle data:',
    )

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--database_csv_path', type=Path)
    parser.add_argument('--video_srcdir', type=Path)
    parser.add_argument('--holistic_data_srcdir', type=Path)
    parser.add_argument('--pose2d_data_srcdir', type=Path)
    parser.add_argument('--temp_dir', type=Path)
    parser.add_argument('--bundle_export_path', type=Path)
    parser.add_argument('--bundle_media_export_path', type=Path)
    parser.add_argument('--include_audio_in_bundle', action='store_true')
    parser.add_argument('--include_thumbnail_in_bundle', action='store_true')
    parser.add_argument("--rewrite_existing_holistic_data", action='store_true')
    parser.add_argument("--skip_existing_cumulative_complexity", action='store_true')
    parser.add_argument("--skip_existing_audioanalysis", action='store_true')
    parser.add_argument("--output_holistic_debug_frames", action='store_true')
    parser.add_argument("--complexity_diagnostics_dir", type=Path, default=None)
    args = parser.parse_args()
    
    run_dancetree_pipeline(
        database_csv_path=args.database_csv_path,
        video_srcdir=args.video_srcdir,
        holistic_data_srcdir=args.holistic_data_srcdir,
        pose2d_data_srcdir=args.pose2d_data_srcdir,
        temp_dir=args.temp_dir,
        bundle_export_path=args.bundle_export_path,
        bundle_media_export_path=args.bundle_media_export_path,
        include_audio_in_bundle=args.include_audio_in_bundle,
        include_thumbnail_in_bundle=args.include_thumbnail_in_bundle,
        rewrite_existing_holistic_data=args.rewrite_existing_holistic_data,
        skip_existing_cumulative_complexity=args.skip_existing_cumulative_complexity,
        skip_existing_audioanalysis=args.skip_existing_audioanalysis,
        output_holistic_debug_frames=args.output_holistic_debug_frames,
        complexity_diagnostics_dir=args.complexity_diagnostics_dir,
    )
