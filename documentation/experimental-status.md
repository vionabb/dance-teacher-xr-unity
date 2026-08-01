# Experimental Status

This document owns the current research maturity and known limitations. It should distinguish implemented behavior from exploratory code and future design.

## Research position

The repository connects two generations of dance-learning work:

- The [CHI 2025 study](papers/chi2025/chi2025.md) evaluated automatically generated practice plans and interface features in two user studies. Its videos, ratings, and pose exports now provide grounding data for metric evaluation.
- The [adaptive-coaching case study](papers/thesis/chapters/07-toward-an-adaptive-virtual-dance-coach.md) redesigned lesson structure around a guided learning journey and investigated feedback, motion quantification, audio grouping, complexity, and learner-state-aware sequencing.

The current system should be described as an operational research prototype, not a validated adaptive tutor.

## Implemented

- Offline reference-video processing and frontend bundle generation.
- Explicit raw and clean pose artifacts.
- Phase-1 preprocessing: root recentering, torso-length normalization, and frame-usability metadata.
- Browser lesson playback and webcam pose estimation.
- Automated checkpointed practice-plan construction from phrase segmentation.
- `mark -> drill -> full out` activities with fading guidance.
- Live visual and terminal feedback pathways.
- Multiple frontend motion metrics and study-fixture tests.
- CSV/SQLite metric export and Python comparison against human ratings.
- Cloud-agent data staging and publication helpers using non-mounted rclone remotes.

## Implemented but not fully validated

- Whether current motion metrics reliably capture learner-perceived or expert-perceived performance quality.
- Whether audio-derived groupings are pedagogically meaningful lesson units.
- Whether complexity heuristics correspond to learner difficulty.
- Whether generated natural-language feedback is specific, trustworthy, and instructionally useful.
- Robustness of 2D/3D MediaPipe-derived descriptors under occlusion, camera variation, low frame rates, and discontinuities.
- Consistency between raw/clean and 2D/3D assumptions across all analytical consumers.

## Partially scaffolded or exploratory

- Post-activity learner self-report and richer learner-state inputs.
- Coaching decisions that combine performance history with perceived difficulty, confidence, or affect.
- Adaptive sequencing beyond progressing to the next incomplete activity.
- Feedback policies that fade, reintroduce, or personalize support based on learner history.
- Complexity-aware progression and difficulty modeling.
- Visibility repair, outlier masking, interpolation, and smoothing beyond the current preprocessing phase.

## Historical findings that constrain current work

Two formative pilots are described in the adaptive-coaching thesis chapter:

1. The tree-based interface exposed many controls but did not make an effective practice strategy legible.
2. The checkpointed learning journey and `mark -> drill -> full out` sequence were clearer and better received.
3. Once lesson structure improved, evaluation quality became the central bottleneck.
4. Scalar scores and general LLM language did not provide sufficiently specific or trustworthy coaching.

Do not represent polished language generation as evidence that the underlying evaluation is pedagogically valid.

## Current workstreams

### Metric and pose-data validation

Status: **in progress**

- Extend preprocessing for visibility, short gaps, discontinuities, outliers, and smoothing.
- Evaluate detector and descriptor stability in 2D and 3D.
- Define metric semantics and acceptance criteria.
- Compare automatic metrics with human ratings without conflating correlation with coaching validity.

### System integration

Status: **in progress**

- Complete migration of analytical consumers to explicit pose contracts.
- Keep raw `pose2d` for source-aligned overlays.
- Maintain parity between tested metric behavior and live frontend use.
- Integrate self-report, performance history, and coaching decisions without hiding uncertainty.

### Adaptive coaching

Status: **partially scaffolded**

- Define a learner-state model appropriate to cognitive-stage choreography learning.
- Decide how feedback timing, specificity, and guidance should change with progress.
- Connect validated evaluation signals to sequencing decisions.

### New user study

Status: **not yet run**

A new study is needed to evaluate the current coaching system. Before recruitment, the system needs a stable protocol, human-subjects materials, validated instrumentation, and explicit success criteria that separate immediate performance, learning, trust, and perceived usefulness.

## Near-term priorities

1. Make pose/metric assumptions explicit and reproducible.
2. Establish technical validity and failure modes for candidate metrics.
3. Decide which signals are safe to use for learner-facing feedback.
4. Integrate self-report and performance history into a testable decision policy.
5. Define the study protocol and analysis plan before collecting new data.

Use the [lab log](../lab-log/README.md) for dated decisions and findings; keep this document at the level of current status.
