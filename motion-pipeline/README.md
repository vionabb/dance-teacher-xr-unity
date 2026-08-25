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

`mediapipe==0.10.21` is deliberate: it includes the MediaPipe Tasks APIs and
the Holistic implementation needed by this project. The 1.0.0 Holistic task
graph aborts on macOS when its Metal service is unavailable, while the 0.10.21
batch path completes the smoke suite. The batch extractor therefore uses the
stable 0.10.21 Holistic API; task-based helpers remain available for pose and
GPU experiments.

The Holistic Landmarker task needs one model asset that is not bundled in the
Python wheel. Prepare it explicitly before running pose extraction:

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

### Participant-study analysis

Participant videos are prepared with the same pose stages as reference videos:

- `motion_extraction.study_pose_data` invokes the shared raw extraction and
  clean preprocessing stages for one participant study;
- `script_invocations/run_userstudy_pose_pipeline.sh` is the canonical command;
- frontend motion-metric tests evaluate the resulting participant pose pairs;
- `motion_extraction/scripts/fit_metric_linear_model.py` compares metrics with
  human ratings.

Study data locations and access rules are documented in [the dataset guide](../documentation/dataset.md).

## Validation

Run the narrowest existing test that covers the change:

```bash
uv run --locked pytest motion_extraction/complexity_analysis/tests/test_pose_preprocessing.py
uv run --locked pytest motion_extraction/complexity_analysis/tests/
```

### Smoke-test corpus and acceptance gate

The shared committed smoke-test inputs live in [`../data/test-fixtures/smoketest/`](../data/test-fixtures/smoketest/). Its hierarchy is stage-first: files for the same case share a stem across directories such as `pose_raw/`, `complexity/`, and `dancetrees/`. The available files and their purposes are recorded in [`../data/test-fixtures/smoketest/manifest.json`](../data/test-fixtures/smoketest/manifest.json).

Generated smoke outputs must go under `temp/` and must not overwrite committed inputs. When a stage contract changes, validate the output in a clean temporary run, then explicitly promote the reviewed file with [`script_invocations/promote_smoke_fixture.py`](script_invocations/promote_smoke_fixture.py), update the manifest, and commit the fixture change.

The required local acceptance command for motion-pipeline code changes is:

```bash
./script_invocations/run_smoke_tests.sh
```

It prepares the small MediaPipe model asset if needed, then runs `uv run --locked pytest -m smoke`, including stage-contract tests and the full reference-video smoke run. The suite uses only committed smoke inputs and does not download the full dataset. Metric changes should also run the relevant metric-regression cases when those cases are added.

The repository workflow [`.github/workflows/motion-pipeline-smoke.yml`](../.github/workflows/motion-pipeline-smoke.yml) runs the same command in a clean Linux environment. Configure its `motion-pipeline-smoke` job as a required pull-request check when enforcing acceptance through GitHub.

### macOS GUI-authorized pose-extraction smoke test

The pinned macOS MediaPipe wheel initializes a native NSOpenGL context when
the legacy Holistic graph starts, even though its inference delegate is CPU.
Codex's default sandbox does not have access to that native graphics service,
so run the pose-extraction smoke test in a GUI-authorized local process:

```bash
./script_invocations/run_pose_extraction_smoke.sh -q
```

In Codex, explicitly approve the command's local GUI/OpenGL access when
requested. This is a test-environment constraint, not evidence that pose
extraction will fail in a normal macOS login session. Keep the ordinary smoke
suite for all other stage contracts, and use this focused command whenever a
change affects MediaPipe extraction.

For end-to-end changes, run the small pipeline script. It requires the referenced local media input:

```bash
./script_invocations/run_dancetree_pipeline_test_small.sh
```

This wrapper now uses `../data/test-fixtures/smoketest/motionvideo/` by default. Set `SMOKE_VIDEO_DIR` or `SMOKE_OUTPUT_DIR` when debugging a different local input or retaining a named temporary run.

Pipeline artifact capture is optional. Pass `--artifact_archive_root` to create a timestamped run folder; use step-specific `--suppress_*_artifacts` flags to reduce output.

## Data transfer for cloud agents

Never mount Google Drive. Stage inputs locally and publish only verified outputs:

```bash
uv run --locked python -m motion_extraction.rclone_transfer pull <remote-path> <local-dir>
uv run --locked python -m motion_extraction.rclone_transfer publish-artifacts <local-dir> <remote-path>
uv run --locked python -m motion_extraction.rclone_transfer publish-processed-bundle <local-bundle>
```

The processed-bundle publication command replaces the cache and should run only after frontend validation. See [the dataset guide](../documentation/dataset.md).

### Persistent local video cache

Reference and participant videos are immutable inputs to this project. Cache
them once under the workspace `data/` tree, then point pipeline or analysis
runs at those directories; ordinary runs never copy or write video files.

```bash
./script_invocations/stage_video_cache.sh referencevideos
./script_invocations/stage_video_cache.sh participant-study1-videos
./script_invocations/stage_video_cache.sh participant-study2-videos
```

The staging command uses `rclone copy`, so it never deletes local cache files.
Run it deliberately to refresh a cache from Drive. Treat
`data/participant_motions/` is access-controlled participant data and is never
published or committed.

### Participant pose extraction

`script_invocations/run_userstudy_pose_pipeline.sh` reads one study's videos
from `data/participant_motions/<study>/videos/` and writes canonical raw pose
artifacts to `data/participant_motions/<study>/pose-raw/canonical/` and clean
artifacts to `pose-processed/canonical/<study>/` (with separate `holisticdata/`
and `pose2d/` modality directories).
The source videos are never copied or modified. Select the two pose stages with
`--start-at` and `--stop-after` when rerunning only extraction or preprocessing:

```bash
STUDY=study1-segmented ./script_invocations/run_userstudy_pose_pipeline.sh
STUDY=study1-segmented ./script_invocations/run_userstudy_pose_pipeline.sh \
  --start-at preprocess-pose-data --stop-after preprocess-pose-data
```

The frontend metric fixtures load paired `.pose2d.raw.csv` and
`.holisticdata.raw.csv` files from this canonical tree. Legacy combined
participant pose CSVs are retained only as an ignored migration archive.

### One-off staged reference-video run

For a full dataset run, stage a Drive subtree locally, process only local paths,
and validate every pipeline stage before the command succeeds:

```bash
./script_invocations/run_rclone_pipeline.sh \
  --remote-path referencevideos \
  --run-dir /private/tmp/motion-pipeline-reference-run \
  --include-audio-in-bundle \
  --include-thumbnail-in-bundle
```

The command uses `rclone copy dataset:<remote-path> ...`, then writes the
generated database, pose data, analysis outputs, bundle, and artifact archive
under `<run-dir>/output/`. Its `<run-dir>/run-manifest.json` records parameters,
source provenance, stage completion, and validation results.

### Cached reference-video and focused experiments

For ordinary reference-video work, stage `referencevideos/` once, then use the
persistent cache wrapper. It reads cached videos directly and writes generated
results only to the supplied run directory:

```bash
./script_invocations/run_rclone_pipeline_cached.sh \
  --run-dir temp/experiments/20260813-preprocess-baseline
```

The staged runner can execute one inclusive contiguous stage range. To protect
a verified generated-output baseline, it copies `output/` into a new, empty
experiment directory, validates each upstream stage required by the selected
range, and then runs only the requested stages. The persistent video cache is
neither copied nor written.

For example, rerun pose preprocessing against cached raw pose outputs and stop
before complexity analysis:

```bash
./script_invocations/run_rclone_pipeline_cached.sh \
  --run-dir temp/experiments/20260812-preprocess-interpolation \
  --reuse-from temp/experiments/20260813-preprocess-baseline \
  --start-at preprocess-pose-data \
  --stop-after preprocess-pose-data \
  --rewrite-existing-preprocessed-pose-data
```

The manifest is updated after every successful selected stage; on a failure it
records the exception and the stages that completed. A range beginning after
`update-database` requires `--reuse-from`, because its inputs must be validated
from a prior staged run.

After validating the generated media in the frontend, publication is a separate
explicit operation. It replaces the remote processed-media cache, so the
guarded script requires `--confirm`:

```bash
./script_invocations/publish_processed_media.sh \
  --confirm \
  /private/tmp/motion-pipeline-reference-run/output/bundle/media
```

Do not run this publication command until the bundle has been reviewed. The
pipeline runner never publishes automatically.

## Useful entry points

- Main orchestrator: `motion_extraction/dancetree/run_dancetree_pipeline.py`
- Raw extraction: `motion_extraction/extract_holistic_data.py`
- Preprocessing: `motion_extraction/preprocess_pose_data.py`
- Bundle export: `motion_extraction/dancetree/bundle_data.py`
- Audio analysis: `motion_extraction/audio_analysis/`
- Complexity analysis: `motion_extraction/complexity_analysis/`
- Metric fitting: `motion_extraction/scripts/fit_metric_linear_model.py`
