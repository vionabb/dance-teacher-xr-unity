# Technical Architecture

This document owns the current implementation structure and cross-project contracts. For purpose and task routing, start with the [repository README](../README.md). For research maturity, see [project state](project-state.md).

## System layers

The system has three coupled layers:

1. **Offline data and structure**: Python extraction, preprocessing, audio/complexity analysis, segmentation, and bundle export.
2. **Evaluation**: browser-side pose estimation, motion metrics, performance histories, and offline metric validation.
3. **Instruction**: lesson delivery, progress tracking, feedback, and teaching-agent decisions.

The intended loop is:

```text
reference video
  -> offline pose/audio/structure
  -> frontend lesson bundle
  -> learner webcam pose
  -> motion evaluation
  -> feedback and next-practice decision
```

The loop is only partially closed today: lesson structure and feedback paths work, but reliable learner-state-aware adaptive sequencing remains research in progress.

## Offline pipeline

### Reference-video workflow

The main orchestrator is [run_dancetree_pipeline.py](../motion-pipeline/motion_extraction/dancetree/run_dancetree_pipeline.py). It coordinates:

1. database update;
2. raw holistic and 2D pose extraction;
3. clean pose preprocessing;
4. cumulative complexity calculation;
5. audio analysis and structural grouping;
6. complexity injection into dance trees;
7. frontend bundle export.

[The pipeline launch file](../motion-pipeline/.vscode/launch.json) contains current example arguments. Its absolute paths are workstation-specific; use the test configuration or script wrappers for portable smoke runs.

### Pose data contract

[extract_holistic_data.py](../motion-pipeline/motion_extraction/extract_holistic_data.py) writes raw artifacts:

- `*.pose2d.raw.csv`
- `*.holisticdata.raw.csv`

[preprocess_pose_data.py](../motion-pipeline/motion_extraction/preprocess_pose_data.py) writes sibling clean artifacts:

- `*.pose2d.clean.csv`
- `*.holisticdata.clean.csv`

Current preprocessing includes root recentering, torso-length normalization, and frame-usability metadata. Visibility repair, outlier handling, and smoothing are active/incomplete research areas; check [project state](project-state.md) before assuming they are production-complete.

Every consumer should make these assumptions explicit:

- 2D or 3D/holistic landmarks;
- raw or clean data;
- image-space or analysis-space coordinates;
- handling of unusable or low-visibility frames.

Raw `pose2d` is the correct input for overlays aligned to source video pixels. Clean data is generally preferred for analytical comparisons. Never silently substitute one representation for the other.

### Audio, segmentation, and complexity

[audio_analysis/](../motion-pipeline/motion_extraction/audio_analysis/) derives tempo, beat, similarity, and grouping information. [complexity_analysis/](../motion-pipeline/motion_extraction/complexity_analysis/) computes motion/tempo-based complexity signals and diagnostics.

These outputs contribute structure to dance trees, but they are not validated learner-state or pedagogical-optimality measures. Complexity and audio grouping should not be described as adaptive coaching by themselves.

### Bundle boundary

[bundle_data.py](../motion-pipeline/motion_extraction/dancetree/bundle_data.py) exports the nonmedia bundle, including `dances.json` and `dancetrees.json`, plus media references consumed by:

- `svelte-web-frontend/src/lib/data/bundle/`
- `svelte-web-frontend/static/bundle/`

When changing bundle fields or filenames, inspect the frontend loader, sync scripts, Supabase metadata, and tests.

### Study-analysis workflow

The CHI study analysis path is distinct from the reference-video bundle pipeline:

- [getposes.py](../motion-pipeline/motion_extraction/scripts/getposes.py) prepares poses from study videos;
- frontend metric fixtures and tests evaluate participant performances against references;
- [fit_metric_linear_model.py](../motion-pipeline/motion_extraction/scripts/fit_metric_linear_model.py) consumes the exported metric CSV.

Do not force this ad hoc research workflow through the bundle pipeline unless the data contract is intentionally redesigned.

## Frontend

### Lesson construction

[TeachingAgent.ts](../svelte-web-frontend/src/lib/ai/TeachingAgent/TeachingAgent.ts) constructs the current automated `PracticePlan` from phrase nodes in a motion segmentation:

- phrase segments become learning activities;
- up to three segment activities are grouped before a checkpoint;
- checkpoints combine the current group;
- a finale covers the full choreography;
- activities use `mark`, `drill`, and `full out` steps.

This differs from the earlier CHI study's automatically compiled practice plans. Both are automated, but the current system uses a checkpointed learning journey tied to current segmentation and progress logic.

### Practice-step policy

The step sequence implements fading guidance:

| Step | Typical role |
| --- | --- |
| Mark | Slow, reference-led rehearsal using reduced/representative motion |
| Drill | Reference plus webcam, with concurrent and terminal feedback |
| Full out | Full-speed, more performance-like attempt with reduced concurrent guidance |

Step creation is split across `src/lib/ai/TeachingAgent/marking-step.ts`, `drill-step.ts`, and `fullout-step.ts`.

### Live pose estimation

[PoseEstimationService.ts](../svelte-web-frontend/src/lib/services/PoseEstimationService.ts) coordinates browser pose estimation, with worker code under `src/lib/webcam/`. The worker boundary keeps inference from blocking UI work.

### Evaluation

The current evaluation stack lives under:

- [evaluation/](../svelte-web-frontend/src/lib/ai/evaluation/)
- [motionmetrics/](../svelte-web-frontend/src/lib/ai/motionmetrics/)

It supports live per-frame signals, attempt summaries, histories, visualization, and offline metric experiments. Metric outputs are not automatically equivalent to learner state or pedagogical quality; downstream coaching must preserve that distinction.

## Metric validation boundary

[allmetrics.spec.ts](../svelte-web-frontend/src/lib/ai/motionmetrics/allmetrics.spec.ts) evaluates study fixtures and writes:

- `svelte-web-frontend/artifacts/motion_metrics.db`
- `svelte-web-frontend/artifacts/motion_metrics.csv`

[metricdb.ts](../svelte-web-frontend/src/lib/ai/motionmetrics/testdata/metricdb.ts) owns the export schema. The Python fitting script depends on that path and column contract.

When adding or changing a metric:

1. define its semantics, range, and directionality;
2. update focused frontend tests;
3. check export schema effects;
4. check Python normalization/model-fitting assumptions;
5. distinguish technical correlation from validated coaching usefulness.

## Data locations

- Persistent reference inputs: `data/reference_motions/{videos,pose-raw}/`.
  `data/reference_motions/db.csv` is the committed reference-video database.
- Persistent participant inputs: `data/participant_motions/<study>/{videos,pose-raw}/`.
- Generated reference outputs: `data/reference_motions/{pose-processed,audio-analysis,processed}/`.
- Generated participant outputs: `data/participant_motions/<study>/pose-processed/`.
- Generated/local metric output: `svelte-web-frontend/testResults/`
- Checked-in metric fixtures: `svelte-web-frontend/src/lib/ai/motionmetrics/testdata/`
- Cross-language metric artifacts: `svelte-web-frontend/artifacts/`
- Frontend bundle JSON: `svelte-web-frontend/src/lib/data/bundle/`
- Frontend bundle media: `svelte-web-frontend/static/bundle/`
- Shared smoke-test fixtures: `data/test-fixtures/smoketest/`
- Pipeline temporary/generated data: `motion-pipeline/data/` and `motion-pipeline/temp/`
- Research data source of truth: Google Drive, described in [dataset.md](dataset.md)

## Legacy boundaries

BVH, Mecanim, Unity, retargeting, and NAO teleoperation code records earlier spatial/robot investigations. It is not part of the main browser-coaching loop. Changes there should not expand the primary warm-start path unless that work becomes active again.
