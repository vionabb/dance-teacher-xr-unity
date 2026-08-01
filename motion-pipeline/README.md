# Motion Pipeline

Offline Python processing and research analysis for the dance-coaching project. For repository context and cross-project contracts, read [the repository summary](../documentation/repository-summary.md) and [technical architecture](../documentation/technical-architecture.md).

## Responsibilities

- Track reference-video metadata.
- Extract MediaPipe 2D and holistic landmarks.
- Preprocess raw pose data into analysis-space clean artifacts.
- Analyze audio timing and repeated structure.
- Compute and visualize motion complexity.
- Generate dance trees and frontend JSON/media bundles.
- Prepare prior user-study videos for metric analysis.
- Fit and compare automatic metrics against human ratings.

BVH, Mecanim, retargeting, and NAO teleoperation code records earlier investigations and is not the main active workflow.

## Environment

Run commands with this directory as the working directory. The VS Code settings and script wrappers expect a project-local `.env`.

Prerequisites:

- Python 3.9 or another version compatible with the pinned MediaPipe release;
- `ffmpeg` on `PATH`;
- access to source media only when the selected workflow needs it.

```bash
python3 -m venv .env
source .env/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

In VS Code, open [the repository multi-root workspace](../dance-teacher-xr-unity.code-workspace) and select `motion-pipeline/.env/bin/python` if the editor chose another interpreter. Interpreter drift is a common cause of imports working in one context but not another.

## Two distinct processing workflows

### Reference videos to frontend bundle

The primary orchestrator is:

```bash
python -m motion_extraction.dancetree.run_dancetree_pipeline --help
```

It performs metadata update, raw pose extraction, clean preprocessing, complexity analysis, audio/structural analysis, dance-tree enrichment, and bundle export.

Use these as canonical runnable examples:

- [.vscode/launch.json](.vscode/launch.json): current full and component-level launch arguments;
- [script_invocations/run_dancetree_pipeline_test_small.sh](script_invocations/run_dancetree_pipeline_test_small.sh): focused smoke run;
- [script_invocations/run_dancetree_pipeline_test.sh](script_invocations/run_dancetree_pipeline_test.sh): broader local run.

Absolute Google Drive paths in launch configurations are workstation examples, not portable defaults.

Pose artifacts use explicit naming:

- extraction: `*.pose2d.raw.csv`, `*.holisticdata.raw.csv`;
- preprocessing: `*.pose2d.clean.csv`, `*.holisticdata.clean.csv`.

Keep raw `pose2d` for source-aligned overlays. Prefer the appropriate clean artifact for analytical consumers.

### Prior user-study analysis

This is a separate, more ad hoc workflow:

- `motion_extraction/scripts/getposes.py`: extract poses from participant/reference videos;
- frontend motion-metric tests: evaluate study fixtures and export aggregate metrics;
- `motion_extraction/scripts/fit_metric_linear_model.py`: compare metrics with human ratings.

Study data locations and access rules are documented in [the dataset guide](../documentation/dataset.md).

## Validation

Run the narrowest existing test that covers the change:

```bash
.env/bin/python -m pytest motion_extraction/complexity_analysis/tests/test_pose_preprocessing.py
.env/bin/python -m pytest motion_extraction/complexity_analysis/tests/
```

For end-to-end changes, run the small pipeline script. It requires the referenced local media input:

```bash
./script_invocations/run_dancetree_pipeline_test_small.sh
```

Pipeline artifact capture is optional. Pass `--artifact_archive_root` to create a timestamped run folder; use step-specific `--suppress_*_artifacts` flags to reduce output.

## Data transfer for cloud agents

Never mount Google Drive. Stage inputs locally and publish only verified outputs:

```bash
python -m motion_extraction.rclone_transfer pull <remote-path> <local-dir>
python -m motion_extraction.rclone_transfer publish-artifacts <local-dir> <remote-path>
python -m motion_extraction.rclone_transfer publish-processed-bundle <local-bundle>
```

The processed-bundle publication command replaces the cache and should run only after frontend validation. See [the dataset guide](../documentation/dataset.md).

## Useful entry points

- Main orchestrator: `motion_extraction/dancetree/run_dancetree_pipeline.py`
- Raw extraction: `motion_extraction/extract_holistic_data.py`
- Preprocessing: `motion_extraction/preprocess_pose_data.py`
- Bundle export: `motion_extraction/dancetree/bundle_data.py`
- Audio analysis: `motion_extraction/audio_analysis/`
- Complexity analysis: `motion_extraction/complexity_analysis/`
- Metric fitting: `motion_extraction/scripts/fit_metric_linear_model.py`
