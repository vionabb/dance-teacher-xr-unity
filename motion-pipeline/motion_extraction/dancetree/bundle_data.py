from collections import defaultdict
import typing as t
from pathlib import Path
import json
import shutil
from ..artifacts import build_artifact_report, resolve_artifact_output_dir
from ..update_database import load_db
from .DanceTree import DanceTree, DanceTreeNode

from ..audio_analysis.perform_analysis import get_audio_analysis_filepath, get_audio_result_subdirectory, AudioAnalysisResult

def bundle_dance_data_as_json(
    dancetree_srcdir: Path,
    db_csv_path: Path,
    audio_results_dir: Path,
    bundle_export_path: Path,
    exclude_test: bool = True,
    print_prefix: t.Callable[[], str] = lambda: '',
    artifact_archive_root: t.Optional[Path] = None,
    artifact_output_dir: t.Optional[Path] = None,
):
    def print_with_prefix(*args, **kwargs):
        print(print_prefix(), *args, **kwargs)

    artifact_dir = resolve_artifact_output_dir(
        artifact_archive_root=artifact_archive_root,
        artifact_output_dir=artifact_output_dir,
        default_label="bundle-data",
    )

    print_with_prefix('Loading database...')
    db = load_db(db_csv_path)
    
    dancetree_filepaths = list(dancetree_srcdir.rglob('*.dancetree.json'))
    dancetrees = [
        DanceTree.from_json(filepath.read_text(encoding='utf-8'))
        for filepath in dancetree_filepaths
    ]

    dancetree_dict = defaultdict(list)
    dances = {}
    for i, tree in enumerate(dancetrees):
        if tree.clip_relativepath not in db.index:
            print_with_prefix(f'Warning: No database info for dancetree at: {tree.clip_relativepath}')
            continue
        db_info = db.loc[tree.clip_relativepath]
        if exclude_test and db_info['isTest']:
            continue

        dancetree_dict[tree.clip_relativepath].append(tree.to_dict())
        dances[tree.clip_relativepath] = db_info.to_dict()
        dances[tree.clip_relativepath]['clipRelativeStem'] = tree.clip_relativepath
    
    dances = list(dances.values())

    print_with_prefix('Saving dance and dancetree json files...')
    for dance in dances:
        relativeStem = Path(dance['clipRelativeStem'])
            
        audio_analysis_dir = get_audio_result_subdirectory(audio_results_dir, result_type='analysis')
        audio_analysis_filepath = get_audio_analysis_filepath(audio_analysis_dir, relativeStem)
        if audio_analysis_filepath.exists():
            data = json.loads(audio_analysis_filepath.read_text(encoding='utf-8'))
            audio_analysis = AudioAnalysisResult.from_dict(data)
            dance['debugAudioAnalysis'] = data
            dance['all_beat_times'] = audio_analysis.tempo_info.all_beats
            dance['audible_beat_times'] = audio_analysis.tempo_info.audible_beats
            dance['bpm'] = audio_analysis.tempo_info.bpm
            dance['beat_offset'] = audio_analysis.tempo_info.beat_offset
        else:
            print_with_prefix(f'\tWarning: No audio analysis for {relativeStem}')

    dances_export_path = bundle_export_path / 'dances.json'
    dancetrees_export_path = bundle_export_path / 'dancetrees.json'

    dances_export_path.parent.mkdir(parents=True, exist_ok=True)
    dances_export_path.write_text(json.dumps(dances, indent=2), encoding='utf-8')

    dancetrees_export_path.parent.mkdir(parents=True, exist_ok=True)
    dancetrees_export_path.write_text(json.dumps(dancetree_dict, indent=2), encoding='utf-8')
    print_with_prefix(f'Exported bundle with {len(dancetrees)} dancetrees to {bundle_export_path.resolve().as_posix()}')

    if artifact_dir is not None:
        report = build_artifact_report(
            artifact_dir,
            title="Bundle Data Report",
            intro=(
                f"Bundled dance tree data from `{dancetree_srcdir}` into `{bundle_export_path}`."
            ),
        )
        report.add_heading("Run Summary")
        report.add_list(
            [
                f"DanceTree source dir: `{dancetree_srcdir}`",
                f"Database CSV: `{db_csv_path}`",
                f"Audio results dir: `{audio_results_dir}`",
                f"Bundle export path: `{bundle_export_path}`",
                f"Exclude test clips: `{exclude_test}`",
                f"Dance count exported: `{len(dances)}`",
                f"DanceTree count loaded: `{len(dancetrees)}`",
            ]
        )
        report.write()

    return {
        "dance_count": len(dances),
        "dancetree_count": len(dancetrees),
        "bundle_export_path": bundle_export_path,
    }

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--dancetree_srcdir', type=Path, required=True)
    parser.add_argument('--db_csv_path', type=Path, required=True)
    parser.add_argument('--audio_results_dir', type=Path, required=True)
    parser.add_argument('--bundle_export_path', type=Path, required=True)
    parser.add_argument('--exclude_test', action='store_true', default=False)
    parser.add_argument('--artifact_archive_root', type=Path, default=None)
    parser.add_argument('--artifact_output_dir', type=Path, default=None)

    args = parser.parse_args()

    bundle_dance_data_as_json(
        dancetree_srcdir=args.dancetree_srcdir,
        db_csv_path=args.db_csv_path,
        audio_results_dir=args.audio_results_dir,
        bundle_export_path=args.bundle_export_path,
        exclude_test=args.exclude_test,
        artifact_archive_root=args.artifact_archive_root,
        artifact_output_dir=args.artifact_output_dir,
    )

    print(f'Done! Saved bundle to {args.bundle_export_path.resolve().as_posix()}')
