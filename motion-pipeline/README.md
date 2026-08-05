# Motion Pipeline

Offline Python processing and research analysis for the dance-coaching project. For repository context and cross-project contracts, read [the repository README](../README.md) and [technical architecture](../documentation/technical-architecture.md).

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

Run commands with this directory as the working directory. The canonical environment is a project-local `.venv` created from `pyproject.toml` and the committed `uv.lock`; `.env` is a retired, machine-local convention and must not be used for new setup.

Prerequisites:

- [uv](https://docs.astral.sh/uv/);
- Python 3.10 (the project pin is in `.python-version`);
- `ffmpeg` on `PATH`;
- access to source media only when the selected workflow needs it.

```bash
uv sync --locked --group dev
```

This creates `motion-pipeline/.venv`. In VS Code, open [the repository multi-root workspace](../dance-teacher-xr-unity.code-workspace) and select that interpreter if the editor chose another one. Interpreter drift is a common cause of imports working in one context but not another.

The support target is Python 3.10 on macOS (Apple Silicon) and Linux (x86_64); this baseline has been clean-install validated on macOS, with Linux validation delegated to the follow-on CI step. Windows and the legacy robotics stack remain unverified; install the latter explicitly with `uv sync --group legacy-robotics` when working on it. `ffmpeg` is required for the active video/audio workflow, while `rclone` is needed only for cloud-transfer commands.

`mediapipe==0.10.21` is deliberate: the active pipeline imports both its Tasks API and its legacy Solutions API. Do not upgrade it independently; a future upgrade must first migrate or validate those two API usages.

The legacy Holistic API needs one model asset that is not bundled in the Python
wheel. Prepare it explicitly before running pose extraction:

```bash
uv run --locked python -m motion_extraction.prepare_mediapipe_models --download
```

## Two distinct processing workflows

### Reference videos to frontend bundle

The primary orchestrator is:

```bash
uv run --locked python -m motion_extraction.dancetree.run_dancetree_pipeline --help
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
uv run --locked pytest motion_extraction/complexity_analysis/tests/test_pose_preprocessing.py
uv run --locked pytest motion_extraction/complexity_analysis/tests/
```

### Smoke-test corpus and acceptance gate

The committed smoke-test inputs live in [`data/smoketest/`](data/smoketest/). Its hierarchy is stage-first: files for the same case share a stem across directories such as `pose_raw/`, `complexity/`, and `dancetrees/`. The available files and their purposes are recorded in [`data/smoketest/manifest.json`](data/smoketest/manifest.json).

Generated smoke outputs must go under `temp/` and must not overwrite committed inputs. When a stage contract changes, validate the output in a clean temporary run, then explicitly promote the reviewed file with [`script_invocations/promote_smoke_fixture.py`](script_invocations/promote_smoke_fixture.py), update the manifest, and commit the fixture change.

The required local acceptance command for motion-pipeline code changes is:

```bash
./script_invocations/run_smoke_tests.sh
```

It prepares the small MediaPipe model asset if needed, then runs `uv run --locked pytest -m smoke`, including stage-contract tests and the full reference-video smoke run. The suite uses only committed smoke inputs and does not download the full dataset. Metric changes should also run the relevant metric-regression cases when those cases are added.

The repository workflow [`.github/workflows/motion-pipeline-smoke.yml`](../.github/workflows/motion-pipeline-smoke.yml) runs the same command in a clean Linux environment. Configure its `motion-pipeline-smoke` job as a required pull-request check when enforcing acceptance through GitHub.

For end-to-end changes, run the small pipeline script. It requires the referenced local media input:

```bash
./script_invocations/run_dancetree_pipeline_test_small.sh
```

This wrapper now uses `data/smoketest/motionvideo/` by default. Set `SMOKE_VIDEO_DIR` or `SMOKE_OUTPUT_DIR` when debugging a different local input or retaining a named temporary run.

Pipeline artifact capture is optional. Pass `--artifact_archive_root` to create a timestamped run folder; use step-specific `--suppress_*_artifacts` flags to reduce output.

## Data transfer for cloud agents

Never mount Google Drive. Stage inputs locally and publish only verified outputs:

```bash
uv run --locked python -m motion_extraction.rclone_transfer pull <remote-path> <local-dir>
uv run --locked python -m motion_extraction.rclone_transfer publish-artifacts <local-dir> <remote-path>
uv run --locked python -m motion_extraction.rclone_transfer publish-processed-bundle <local-bundle>
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
