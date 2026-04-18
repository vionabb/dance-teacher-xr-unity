# Repository Summary

## Purpose

This repository supports the final case study of the thesis in [thesis-draft.pdf](/Users/viona/dev/dance-teacher-xr-unity/thesis-draft.pdf). The draft frames the overall thesis as a progression toward automatic coaching for expressive movement; this repo is most directly aligned with the adaptive-coaching case study for AI-assisted dance learning.

The two primary active projects are:

1. `svelte-web-frontend`: a SvelteKit full-stack app for AI dance coaching, lesson delivery, practice workflows, motion metrics, and local/prod Supabase integration.
2. `motion-pipeline`: a Python preprocessing and analysis pipeline that turns raw dance videos into pose data, complexity outputs, audio-derived dance trees, frontend bundle JSON, and NAO teleoperation / retargeting artifacts.

There are also side projects at the repo root:

- `dance-teacher-xr-unity/`: Unity project content.
- `aframe-xr-simple/`: smaller A-Frame/XR prototype.

Those exist, but the main engineering surface area is in `svelte-web-frontend` and `motion-pipeline`.

## High-Level Architecture

The broad workflow is:

1. Raw/source dance videos are tracked in `motion-pipeline` database metadata and media folders.
2. `motion-pipeline` runs MediaPipe-based pose extraction to generate `holistic_data` and `pose2d_data`.
3. The pipeline computes cumulative complexity and audio analysis, then merges complexity into audio-derived dance trees.
4. The pipeline exports bundle JSON and media references consumed by the web app.
5. `svelte-web-frontend` serves the learning interface, practice/evaluation flows, and AI teaching logic.
6. The frontend motion-metric test suite can export aggregate metric results to CSV/SQLite.
7. `motion-pipeline/motion_extraction/scripts/fit_metric_linear_model.py` consumes that CSV to compare automatic metrics against human ratings.

## Key Projects

### `svelte-web-frontend`

Important areas:

- `src/routes`: SvelteKit routes/pages.
- `src/lib/ai`: AI teaching logic and motion evaluation code.
- `src/lib/ai/motionmetrics`: motion quantification metrics plus tests/specs.
- `scripts`: asset and bundle sync scripts, especially for Supabase/local storage.
- `supabase`: local schema/seed state.
- `static/bundle`: media assets expected by the app and pipeline.
- `artifacts`: generated research/debug artifacts, including the metrics database and CSV.
- `testResults`: per-test CSV/debug outputs.

Notable characteristics:

- Uses `pnpm`, Node `>=24 <25`, Svelte 5, Vitest, Supabase CLI, and SQLite.
- `package.json` includes the usual `dev`, `build`, `check`, `lint`, `test`, and `coverage` scripts.
- README expects the motion pipeline to populate bundle data before the app is useful locally.
- Local development also expects Supabase buckets for `holisticdata`, `pose2ddata`, `sourcevideos`, and `thumbnails`.

### `motion-pipeline`

Important areas:

- `motion_extraction`: main Python package.
- `motion_extraction/dancetree`: pipeline orchestration and bundle export.
- `motion_extraction/audio_analysis`: beat/BPM/similarity/tree generation.
- `motion_extraction/complexity_analysis`: cumulative complexity computation and dancetree enrichment.
- `motion_extraction/teleoperation`: realtime MediaPipe-driven NAO teleoperation.
- `motion_extraction/scripts`: ad hoc analysis utilities, including metric-model fitting.
- `data`: CSV db, generated analysis outputs, URDF/BVH/NAO artifacts, summaries.
- `docs/reports`: design notes and module reports.

Notable characteristics:

- Python environment is expected to be local to `motion-pipeline/.env`.
- Root-level VS Code usage should go through `dance-teacher-xr-unity.code-workspace`, which opens `motion-pipeline` as its own workspace folder so the local interpreter and `motion_extraction` import root resolve correctly.
- README positions `.vscode/launch.json` as the primary entrypoint for runnable tasks.
- The main orchestration script is `motion_extraction.dancetree.run_dancetree_pipeline`.

## Critical Data Flow: Frontend Metrics -> Python Model Fitting

This connection is important and should be preserved when changing schemas or filenames.

Source files:

- Frontend aggregator test: [allmetrics.spec.ts](/Users/viona/dev/dance-teacher-xr-unity/svelte-web-frontend/src/lib/ai/motionmetrics/allmetrics.spec.ts)
- Frontend metric DB helpers: [metricdb.ts](/Users/viona/dev/dance-teacher-xr-unity/svelte-web-frontend/src/lib/ai/motionmetrics/testdata/metricdb.ts)
- Python fitting script: [fit_metric_linear_model.py](/Users/viona/dev/dance-teacher-xr-unity/motion-pipeline/motion_extraction/scripts/fit_metric_linear_model.py)

Current behavior:

- `allmetrics.spec.ts` iterates study fixtures with ratings, computes multiple metrics, writes/updates a SQLite DB, then exports CSV.
- The exported CSV path is `svelte-web-frontend/artifacts/motion_metrics.csv`.
- The SQLite DB path is `svelte-web-frontend/artifacts/motion_metrics.db`.
- `fit_metric_linear_model.py` defaults to `../svelte-web-frontend/artifacts/motion_metrics.csv`, so it is intentionally coupled to that frontend artifact path.

Metrics currently covered in `allmetrics.spec.ts`:

- `qijia2DPoseEvaluation`
- `jules2DPoseEvaluation`
- `skeleton3DVectorAngleEvaluation`
- `temporalAlignmentEvaluation`
- `kinematicErrorEvaluation`
- human rating fields and related study annotations

The Python script then:

- normalizes/inverts selected metrics,
- computes Pearson and Spearman correlations against `humanRating`,
- emits histograms and scatterplots,
- compares several regressors with cross-validated `R²`,
- performs feature elimination for linear models.

If metric column names or output paths change, this script will likely need updates too.

## Launch Configs Worth Knowing

The repo relies heavily on VS Code launch configs for canonical arguments.

For repo-root editing in VS Code:

- Open `dance-teacher-xr-unity.code-workspace` rather than the raw repo folder when you want both Python and Svelte/TypeScript tooling active at once.
- The workspace includes the repo root plus separate `motion-pipeline` and `svelte-web-frontend` folders so each project keeps its own `.vscode/settings.json` and `.vscode/launch.json` behavior.

### `svelte-web-frontend/.vscode/launch.json`

Useful entries:

- `Debug development server`: `pnpm run dev`
- browser launchers for Firefox/Chrome/Edge against `http://localhost:5173`
- `Sync Storage Assets` / `Portable Sync Storage Assets`
- `Sync Bundle Data`

This file is useful for remembering expected local workflows and sync scripts, but it is less central than the pipeline launch file.

### `motion-pipeline/.vscode/launch.json`

This is a major source of truth for sample invocations. Important entries:

- `Run DanceTree Pipeline`
- `VideoPipeline (1): Get MP Holistic Data`
- `VideoPipeline (2): Convert to Joint Space`
- `Complexity Metric (UIST)`
- `Calculate Cumulative Complexity`
- `Audio Analysis`
- `Update Database`
- `Add Complexities to DanceTrees`
- `Bundle Data for Frontend`
- `Nao Teleoperation`
- `Nao Teleoperation (Simulation)`

Important caveat:

- The current `Run DanceTree Pipeline` config on macOS points at Google Drive paths under `2026-Cognitive-Stage-Feedback/...`, not repo-local paths. Agents should treat those as user-machine-specific examples, not portable defaults.
- The teleoperation launch config currently uses `--webcam-index=3`, which is also machine-specific.

## Pipeline Orchestration Details

Primary orchestration file:

- [run_dancetree_pipeline.py](/Users/viona/dev/dance-teacher-xr-unity/motion-pipeline/motion_extraction/dancetree/run_dancetree_pipeline.py)

That pipeline currently performs, in order:

1. database update
2. holistic + pose2d extraction
3. cumulative complexity calculation
4. audio analysis
5. complexity injection into dance trees
6. frontend bundle export

Bundle export file:

- [bundle_data.py](/Users/viona/dev/dance-teacher-xr-unity/motion-pipeline/motion_extraction/dancetree/bundle_data.py)

Important bundle outputs:

- `dances.json`
- `dancetrees.json`

The bundle export also augments dances with audio-derived fields like beats, BPM, and debug audio analysis when present.

## Teleoperation / Robot Work

NAO-related work is real and not just historical residue.

Relevant files:

- [teleoperation.py](/Users/viona/dev/dance-teacher-xr-unity/motion-pipeline/motion_extraction/teleoperation/teleoperation.py)
- `motion_extraction/motion_output_provider/NaoTrajectoryOutputProvider.py`
- `motion-pipeline/data/urdf/...`
- `motion-pipeline/docs/reports/nao-teleoperation-module-report.md`

Current teleoperation stack uses MediaPipe pose inference, converts detections into holistic-style rows, and supports webcam/file-driven streaming for NAO control or simulation.

## Generated / Derived Artifacts To Be Aware Of

Examples of outputs that are expected to be generated rather than hand-edited:

- `svelte-web-frontend/artifacts/motion_metrics.csv`
- `svelte-web-frontend/artifacts/motion_metrics.db`
- `svelte-web-frontend/testResults/*`
- frontend bundle data under `svelte-web-frontend/src/lib/data/bundle`
- media bundle assets under `svelte-web-frontend/static/bundle`
- complexity outputs under `motion-pipeline/data/complexities` or temp dirs
- audio analysis outputs under `motion-pipeline/data/audio_analysis` or temp dirs

Agents should usually avoid manually editing generated outputs unless the task is explicitly about fixtures, seeds, or checked-in artifacts.

## Practical Orientation For Future Work

When entering this repo, the fastest useful scan is:

1. Read this file.
2. Check the relevant README(s).
3. Check the two `.vscode/launch.json` files for canonical args.
4. If working on metric research, inspect `svelte-web-frontend/src/lib/ai/motionmetrics` and `motion-pipeline/motion_extraction/scripts/fit_metric_linear_model.py`.
5. If working on lesson/bundle generation, inspect `motion-pipeline/motion_extraction/dancetree`.
6. If working on coaching behavior, inspect `svelte-web-frontend/src/lib/ai/TeachingAgent`.

## Summary Judgment

This repo is not a generic monorepo. It is a research codebase with a strong experimental workflow:

- offline Python preprocessing and analysis,
- a SvelteKit coaching frontend,
- explicit coupling between generated motion-analysis artifacts and frontend bundle data,
- an evaluation loop connecting frontend metric tests to Python statistical modeling,
- and ongoing ties to the thesis case-study narrative.

Changes that affect file formats, metric column names, bundle locations, launch arguments, or study fixture assumptions can have cross-project consequences.
