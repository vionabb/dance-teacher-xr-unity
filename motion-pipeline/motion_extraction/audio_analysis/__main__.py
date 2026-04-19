import argparse
from pathlib import Path
from .perform_analysis import perform_audio_analysis

if __name__ == '__main__':
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Perform audio analysis on a directory of audio files.')
    parser.add_argument('--videosrcdir', type=Path, help='The directory containing the input video files.', required=False)
    parser.add_argument('--audiosrcdir', type=Path, help='The directory containing the input audio files.', required=False)
    parser.add_argument('--destdir', type=Path, help='The directory to output the analysis results.')
    parser.add_argument('--audiocachedir', type=Path, help='The directory to cache audio files in.')
    parser.add_argument('--analysis_summary_out', type=Path, help='The path to save the analysis summary.')
    parser.add_argument('--database_csv_path', type=Path, default=None)
    parser.add_argument('--include_mem_usage', action='store_true', help='Whether to include memory usage in the output.', default=False)
    parser.add_argument('--skip_existing', action='store_true', help='Whether to skip existing analysis files.', default=False)
    parser.add_argument('--artifact_archive_root', type=Path, default=None)
    parser.add_argument('--artifact_output_dir', type=Path, default=None)
    args = parser.parse_args()

    perform_audio_analysis(
        videosrcdir=args.videosrcdir,
        audiosrcdir=args.audiosrcdir,
        audio_analysis_destdir=args.destdir,
        audiocachedir=args.audiocachedir,
        analysis_summary_out=args.analysis_summary_out,
        database_csv_path=args.database_csv_path,
        include_mem_usage=args.include_mem_usage,
        skip_existing=args.skip_existing,
        artifact_archive_root=args.artifact_archive_root,
        artifact_output_dir=args.artifact_output_dir,
    )
