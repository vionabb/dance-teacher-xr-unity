# Repository Summary

## Purpose

This repository supports the final case study of the thesis in [thesis-draft.pdf](thesis-draft.pdf). The draft frames the overall thesis as a progression toward automatic coaching for expressive movement; this repo is most directly aligned with the adaptive-coaching case study for AI-assisted dance learning.

The two primary active projects are:

1. `svelte-web-frontend`: a SvelteKit full-stack app for AI dance coaching, lesson delivery, practice workflows, motion metrics, and local/prod Supabase integration. It also contains a test suite of motion metrics, which use poses of user performances collected from the CHI 2025 paper and compares them to reference tiktok videos that the users were trying to learn. The benefit there is that we have human-rated similarity scores and we can thus see how correlated the metric outputs are to human ratings of the participants' performances.
2. `motion-pipeline`: a Python preprocessing and analysis pipeline that turns raw dance videos into pose data, complexity outputs, audio-derived dance trees, frontend bundle JSON, and NAO teleoperation / retargeting artifacts.
  - The NAO teleoperation and retargeting code is from an earlier stage of investigation and is not actively used. This includes BVH and Mecanim humanoid code and a teleoperation module.
  - There are two distinct types of motion processing workflows. One of them, centralized in `run_dancetree_pipeline.py`, takes at a bunch of reference videos, performs pose estimation and various processing & analysis steps, and produces json files and a media bundle for consumption by the frontend. The other is more adhoc, involving `getposes.py` and `measure_pose_quantities.py` and is used to prepare userstudy videos for analysis. That analysis is mostly done with the metric test suite in the frontend subproject, which outputs a csv consumed by `fit_metric_linear_model.py`.

## Lab Log

The `lab-log/` directory at the repo root is the running research narrative. It contains dated markdown entries documenting decisions, findings, and direction as development unfolds. Entries are written by agents (and the researcher) and are intended to give future agents and the researcher context for how the project evolved. Read `lab-log/README.md` for entry conventions and the artifact-copying rule. The entries are also the primary source for drafting the thesis chapters.

## Experimental purpose and chapter framing

- Chapter 4 versus chapter 5: Chapter 4 corresponds to an existing, published research paper on the earlier CHI user-study work. That paper evaluated how learners interacted with the system and how their performance was scored and compared to human judgments. Chapter 5 is a new research thrust focused on automatic coaching: the goal is to move beyond the earlier evaluation setup toward automated coaching decisions, lesson-plan generation, and potentially meaningful feedback that closes the loop between motion analysis and instructional action.

- Project purpose in this repository: This repository is not the implementation home for the published chapter-4 paper itself. Instead, it contains the technical scaffolding and evaluation resources used to support the new chapter-5 research direction. In particular, it holds or references the study assets needed to develop and validate coaching logic: user performance videos, reference TikTok videos, human ratings of performance, pose exports, and analysis artifacts for technical evaluation.

- Why these artifacts matter: The chapter-4 study provides a grounded evaluation substrate for the new coaching work. Once the motion metrics are technically validated, the AI coaching decision logic and UI updates are in place, and the system is ready for broader evaluation, a new user study can be run to evaluate the chapter-5 automatic-coaching system itself.

- Experimental direction for chapter 5: The focus is on building an automated coaching loop that can make instructional decisions, suggest or adapt lesson plans, and provide feedback that is meaningful to the learner. The repository supports this by providing pose data, metric pipelines, web-app interfaces, and analysis tools that can be used to prototype and evaluate those coaching behaviors. Note: the way lesson plans are constructed for the chapter-5 work differs from the chapter-4 approach — it remains an automated construction process, but follows the chapter-5 adaptive lesson-generation pipeline and decision logic implemented in the code (see `svelte-web-frontend/src/lib/ai/TeachingAgent` for relevant implementation).

## Data context and resources available for analysis

- Pose exports for CHI user-study videos: a curated set of pose outputs (used as study fixtures and for metric research) is available under the repository at [svelte-web-frontend/src/lib/ai/motionmetrics/testResults](/Users/viona/dev/dance-teacher-xr-unity/svelte-web-frontend/src/lib/ai/motionmetrics/testResults). This folder contains per-video pose CSV/JSON exports and derived pose artifacts produced from the CHI recordings; these are the canonical inputs used by the frontend motion-metrics tests and by the Python fitting scripts.

- Generated metric artifacts: The frontend test harness and CI-style specs also write metric DB/CSV artifacts to `svelte-web-frontend/artifacts` (e.g., `motion_metrics.csv`, `motion_metrics.db`) — those are the recommended artifacts for feeding into `motion-pipeline` model-fitting scripts such as `motion_extraction/scripts/fit_metric_linear_model.py`.

- Raw user videos (machine-local; not checked in): the original recorded videos for the CHI study are stored on the principal researcher's Google Drive at the following path on the development machine (machine-specific):

  /Users/viona/Library/CloudStorage/GoogleDrive-viona.blanchet.gr@dartmouth.edu/Shared drives/Human Motion Lab/2025-CHI-2D-Dance-TikTok-Teaching/UserVideos/AzureBlobFiles/

  Note: the `motion-pipeline/.vscode/launch.json` contains additional example Google Drive / local paths and is the canonical place to look for other developer-specific media locations. Treat these raw videos as local, access-controlled assets — they are not part of the git repo.

- Sensitive data & provenance: Because the raw videos are stored on a private Google Drive location, any agent or collaborator that needs to reproduce analyses must obtain access to that Drive or regenerate the pose exports from the raw video copies. The pose exports in `testResults` are sufficient for most metric-research workflows if access to raw videos is restricted.

- Citation of study in artifacts: When reusing or sharing analysis outputs, reference the CHI 2025 study (thesis chapter 4, described in docs/papers/chi2025.md) and note that chapter 5 (experimental system) is implemented in this repository; add provenance notes to any published CSV/figures indicating whether pose data are preprocessed exports or re-extracted from the raw videos.

## High-Level Architecture

The broad workflow is:

1. Raw/source dance videos are tracked in `motion-pipeline` database metadata and media folders.
2. `motion-pipeline` runs MediaPipe-based pose extraction to generate raw `holistic_data` and `pose2d_data` exports, now named with `.raw.csv` suffixes when written by `extract_holistic_data.py`.
3. `motion-pipeline` runs an explicit preprocessing step that writes sibling `.clean.csv` pose exports; current preprocessing covers root recentering and torso-length normalization.
4. The pipeline computes cumulative complexity and audio analysis, then merges complexity into audio-derived dance trees.
5. The pipeline exports bundle JSON and media references consumed by the web app.
6. `svelte-web-frontend` serves the learning interface, practice/evaluation flows, and AI teaching logic.
7. The frontend motion-metric test suite can export aggregate metric results to CSV/SQLite.
8. `motion-pipeline/motion_extraction/scripts/fit_metric_linear_model.py` consumes that CSV to compare automatic metrics against human ratings.

## Key Projects

### `svelte-web-frontend`

Important areas:

- `src/routes`: SvelteKit routes/pages.
- `src/lib/ai`: AI teaching logic and motion evaluation code.
  - `src/lib/ai/evaluation`: performance evaluation infrastructure (FrontendDanceEvaluator, UserDanceEvaluator, UserEvaluationTrackRecorder, performanceHistory, detectAchievements, SkeletonFeedbackVisualization).
  - `src/lib/ai/motionmetrics`: motion quantification metrics plus tests/specs.
  - `src/lib/ai/TeachingAgent`: AI lesson-plan orchestration.
  - `src/lib/ai/backend`: Supabase data backend and LLM client wrappers.
  - `src/lib/ai/EvaluationCommonUtils.ts`: shared math and pose-vector utilities used by both motionmetrics and evaluation code.
  - `src/lib/ai/feedback.ts`, `textual-distillation.ts`, `precomputed-feedback-msgs.ts`: feedback generation.
- `src/lib/model`: domain model types (PracticePlan, PracticeStep, TerminalFeedback, IPracticePage, settings).
- `src/lib/elements`: reusable Svelte UI components.
- `src/lib/pages`: full-page Svelte components used by routes (MainMenuPage, PracticePage, PerformanceReviewPage, SettingsPage).
- `src/lib/services`: service singletons (PoseEstimationService).
- `src/lib/webcam`: MediaPipe pose estimation utilities and streams.
- `scripts`: asset and bundle sync scripts, especially for Supabase/local storage.
- `src/lib/data/dances-store.ts`: frontend pose-data loader helpers now try raw bundle filenames first and fall back to legacy names during the migration.
- `scripts/syncBundleData.js`: bundle sync writes raw landmark paths into Supabase storage metadata.
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
- `motion_extraction/extract_holistic_data.py`: raw holistic and pose2d extraction entry point.
- `motion_extraction/convert_to_jointspace.py`: holistic-to-jointspace conversion entry point.
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

Practical note:

- Complexity plotting can now be filtered independently from complexity calculation. `run_dancetree_pipeline` accepts repeated `--complexity_plot_whitelist` values, and `calculate_cumulative_complexity` accepts repeated `--plot_whitelist` values. These wildcard patterns match relative stems such as `study2/*` and affect only generated plots/artifacts, not normalization or CSV outputs.
- `calculate_cumulative_complexity` also has diagnostic-only legacy investigation plot knobs: `--target_complexity_per_segment` and repeatable `--bodyparts_for_artifact_plotting`. `run_dancetree_pipeline` forwards the same options. These only change artifact plots/CSV diagnostics and do not change the exported complexity series used downstream.
- Complexity calculation now uses a single `--visibility_mode` switch for visibility handling. Supported modes are `none`, `weight`, and `interpolate`; `all` is also available on the standalone complexity script for batch comparisons. `run_dancetree_pipeline` forwards the same mode. `--visibility_repair_cutoff` and `--visibility_plot_alpha_floor` remain as supporting knobs for interpolation and visibility-styled diagnostics.
- Legacy artifact plotting now uses repeatable `--bodyparts_for_artifact_plotting` arguments instead of a single example body part. It defaults to `left_wrist` and emits one focused grouped-metric plot set per requested body part.

Important caveat:

- The current `Run DanceTree Pipeline` config on macOS points at Google Drive paths under `2026-Cognitive-Stage-Feedback/...`, not repo-local paths. Agents should treat those as user-machine-specific examples, not portable defaults.
- The teleoperation launch config currently uses `--webcam-index=3`, which is also machine-specific.

## Pipeline Orchestration Details

Primary orchestration file:

- [run_dancetree_pipeline.py](/Users/viona/dev/dance-teacher-xr-unity/motion-pipeline/motion_extraction/dancetree/run_dancetree_pipeline.py)

That pipeline currently performs, in order:

1. database update
2. holistic + pose2d raw extraction
3. pose-data preprocessing to sibling `.clean.csv` files
4. cumulative complexity calculation
5. audio analysis
6. complexity injection into dance trees
7. frontend bundle export

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
