# Repository Summary

Use this document as a map, not as a substitute for current code, scoped `AGENTS.md` files, or subproject READMEs. See [the documentation guide](README.md) for targeted reading paths.

## Purpose and research context

This repository supports research on making online expressive-movement videos more useful for learning. Its active direction is a virtual dance coach that combines automatically generated lesson structure, browser-based practice, motion evaluation, and feedback.

Two related generations of work matter:

1. The [published CHI 2025 dance-learning work](papers/chi2025/chi2025.md) generated structured practice plans from in-the-wild dance videos and evaluated them in two user studies. It provides study videos, human ratings, and pose data that are now useful for technical validation.
2. The [adaptive virtual dance coach](papers/thesis/chapters/07-toward-an-adaptive-virtual-dance-coach.md) uses a different but still automated lesson structure. Phrase-level segments are grouped into stages of up to three segments, checkpoint activities combine learned segments, and each activity uses a fading-guidance sequence: `mark -> drill -> full out`.

The long-term goal is a closed coaching loop: estimate learner performance, interpret it meaningfully, choose feedback, and decide what the learner should practice next. The repository contains a working structured learning experience and several evaluation/feedback components, but the fully integrated learner-state-aware adaptive loop remains incomplete. See [experimental status](experimental-status.md).

Earlier notes call these projects thesis chapters 4 and 5. The current thesis export places them in chapters 6 and 7; use titles rather than chapter numbers in durable references.

## Active subsystems

### `svelte-web-frontend`

The SvelteKit application owns the interactive learning and evaluation experience:

- lesson and practice UI;
- webcam MediaPipe pose estimation;
- live and terminal motion evaluation;
- progress tracking and feedback;
- automatic practice-plan construction and teaching-agent logic;
- motion-metric tests and cross-language metric exports.

Start with [the frontend README](../svelte-web-frontend/README.md) and [frontend agent instructions](../svelte-web-frontend/AGENTS.md).

Important paths:

- `src/lib/ai/TeachingAgent/`: practice-plan and coaching coordination;
- `src/lib/ai/evaluation/`: frontend and user evaluation infrastructure;
- `src/lib/ai/motionmetrics/`: motion metrics, quantifiers, and tests;
- `src/lib/ai/motionmetrics/testdata/`: human ratings and checked-in fixtures;
- `src/lib/model/`: practice-plan and UI domain types;
- `src/lib/webcam/` and `src/lib/services/PoseEstimationService.ts`: live pose estimation;
- `src/lib/data/bundle/` and `static/bundle/`: pipeline-produced app data and media;
- `artifacts/`: generated metric database/CSV used for analysis;
- `testResults/`: generated/local test outputs and CHI study pose directories.

### `motion-pipeline`

The Python package owns offline and research-oriented processing:

- reference-video metadata and ingestion;
- MediaPipe pose extraction;
- explicit raw-to-clean pose preprocessing;
- audio timing and structural analysis;
- complexity computation;
- dance-tree and frontend bundle generation;
- CHI study pose preparation;
- statistical/model-fitting scripts;
- legacy BVH, retargeting, and NAO investigations.

Start with [the pipeline README](../motion-pipeline/README.md) and [pipeline agent instructions](../motion-pipeline/AGENTS.md).

Important paths:

- `motion_extraction/dancetree/`: main pipeline orchestration and bundle export;
- `motion_extraction/extract_holistic_data.py`: raw pose extraction;
- `motion_extraction/preprocess_pose_data.py`: clean pose generation;
- `motion_extraction/audio_analysis/`: tempo, similarity, and structural grouping;
- `motion_extraction/complexity_analysis/`: cumulative complexity and diagnostics;
- `motion_extraction/scripts/getposes.py`: ad hoc CHI study pose extraction;
- `motion_extraction/scripts/fit_metric_linear_model.py`: metric-to-human-rating analysis;
- `motion_extraction/rclone_transfer.py`: explicit cloud staging/publication;
- `.vscode/launch.json`: current example invocations and workstation-specific paths.

### Secondary and historical areas

- `dance-teacher-xr-unity/`: Unity/XR content.
- `aframe-xr-simple/`: A-Frame/XR prototype, if present in a historical checkout.
- BVH, Mecanim, retargeting, and NAO code in `motion-pipeline`: earlier investigations, not the main active chapter-focused workflow.

Do not infer current project priority from directory size alone.

## Critical workflows

### Reference video to frontend lesson

1. Source videos and metadata enter `motion-pipeline`.
2. MediaPipe extraction writes `*.pose2d.raw.csv` and `*.holisticdata.raw.csv`.
3. Preprocessing writes sibling `*.pose2d.clean.csv` and `*.holisticdata.clean.csv`.
4. Audio, segmentation, and complexity analyses create instructional structure.
5. Bundle export writes JSON plus media references for the frontend.
6. `TeachingAgent.ts` converts phrase nodes into the current staged practice plan.

The main orchestrator is `motion_extraction.dancetree.run_dancetree_pipeline`. Raw `pose2d` remains necessary for image-space overlays; analytical consumers should normally use the appropriate clean representation.

### CHI study data to metric analysis

1. Raw participant videos are access-controlled and live outside git.
2. `getposes.py` and related scripts prepare study pose data.
3. Generated/local pose directories are under `svelte-web-frontend/testResults/`.
4. Checked-in samples and fixture metadata live under `src/lib/ai/motionmetrics/testdata/`.
5. `allmetrics.spec.ts` computes metrics and writes:
   - `svelte-web-frontend/artifacts/motion_metrics.db`
   - `svelte-web-frontend/artifacts/motion_metrics.csv`
6. `fit_metric_linear_model.py` consumes the CSV to compare automatic metrics with human ratings.

Preserve metric column names and artifact paths across both languages.

## Data and provenance

The durable data guide is [dataset.md](dataset.md). Key distinctions:

- Google Drive is the source of truth for large research data.
- Raw user videos are sensitive, machine-local/access-controlled, and not in git.
- `svelte-web-frontend/testResults/` contains generated/local metric outputs and study pose directories; it is not all durable source data.
- `svelte-web-frontend/src/lib/ai/motionmetrics/testdata/study-poses/` contains checked-in pose fixtures.
- `artifact-archive/` is a local, user-triggered snapshot area.
- `lab-log/assets/` contains committed copies of artifacts referenced by the research narrative.
- Cloud agents stage data locally using configured rclone remotes; they never mount Drive.

The historical CHI raw-video location on the primary workstation is:

```text
/Users/viona/Library/CloudStorage/GoogleDrive-viona.blanchet.gr@dartmouth.edu/Shared drives/Human Motion Lab/2025-CHI-2D-Dance-TikTok-Teaching/UserVideos/AzureBlobFiles/
```

Treat this as provenance and a workstation hint, not a portable default. [The pipeline launch configuration](../motion-pipeline/.vscode/launch.json) contains more historical examples.

## Environment warm start

Open [the multi-root workspace](../dance-teacher-xr-unity.code-workspace) for cross-project work.

- Frontend: Node `>=24 <25`, pnpm `9.12.2`, then follow [the frontend README](../svelte-web-frontend/README.md).
- Python: create/use `motion-pipeline/.env`, install `requirements.txt`, and run with `motion-pipeline/` as the working directory; follow [the pipeline README](../motion-pipeline/README.md).
- Full local frontend data/auth flows may also require Docker, Supabase, and a validated media bundle.
- Do not install or download large data until the task actually needs it.

## Fast task routing

- Coaching flow or lesson structure: `svelte-web-frontend/src/lib/ai/TeachingAgent/`
- UI or webcam practice: `svelte-web-frontend/src/lib/pages/`, `src/lib/elements/`, `src/lib/webcam/`
- Motion metrics: `svelte-web-frontend/src/lib/ai/motionmetrics/`
- Metric/human-rating analysis: frontend metric tests plus `fit_metric_linear_model.py`
- Pose preprocessing: `extract_holistic_data.py` and `preprocess_pose_data.py`
- Lesson bundle generation: `motion_extraction/dancetree/`
- Audio or segmentation: `motion_extraction/audio_analysis/`
- Complexity analysis: `motion_extraction/complexity_analysis/`
- Research maturity or next steps: [experimental-status.md](experimental-status.md)
- Why a decision was made: [lab log](../lab-log/README.md)

## Cross-project hazards

Changes to any of the following can have nonlocal effects:

- raw/clean pose filename conventions;
- image-space versus normalized coordinate assumptions;
- frontend bundle schemas or media paths;
- metric names, directionality, scales, or CSV columns;
- generated artifact locations;
- lesson segmentation assumptions;
- workstation-specific launch arguments.

Inspect producers, consumers, tests, and documentation together when changing these interfaces.
