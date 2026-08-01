# Technical Architecture

This document describes the technical architecture of the dance-teaching system in this repository and how it supports the chapter-5 research direction.

## 1. Overall purpose

The repository implements a hybrid system for dance learning:

- an offline motion-processing pipeline that turns raw dance videos into structured pose, audio, segmentation, and bundle artifacts; and
- a web-based coaching frontend that presents lessons, captures live webcam motion, evaluates the learner against a reference performance, and drives coaching decisions.

The system is designed around a closed loop:

1. a reference dance is analyzed offline,
2. the learner practices through a web interface,
3. the live webcam pose is estimated,
4. motion metrics compare the learner to the reference,
5. the coaching logic decides what to show or suggest next.

## 2. High-level structure

The project is organized into two major subsystems.

### 2.1 Offline analysis pipeline

The Python package in [motion-pipeline](motion-pipeline) handles heavy offline computation. Its responsibilities are to:

- ingest source videos and metadata,
- extract pose information with MediaPipe into explicit raw pose artifacts,
- preprocess pose data into clean coordinate representations for analysis,
- extract audio-derived timing and beat structure,
- compute motion complexity descriptors,
- generate dance-tree/segmentation outputs,
- export frontend bundle data.

This layer is intentionally computationally heavy and is not expected to run in the browser.

### 2.2 Live coaching frontend

The Svelte application in [svelte-web-frontend](svelte-web-frontend) provides the interactive experience. It is responsible for:

- lesson playback and practice-step UI,
- webcam pose estimation,
- real-time motion evaluation,
- progress tracking,
- post-attempt feedback and self-report flows,
- automated coaching decisions.

## 3. End-to-end data flow

A typical run of the system looks like this:

1. Raw video assets and study metadata are ingested by the motion pipeline.
2. The pipeline extracts pose data and stores raw pose exports.
3. A preprocessing step writes sibling clean pose exports, normalizes the pose data, and marks usable frames.
4. Audio, segmentation, and complexity analyses are computed.
5. The pipeline exports bundle data consumed by the frontend.
6. The frontend loads the reference motion and lesson structure.
7. During practice, the browser estimates the learner's live pose from webcam input.
8. Live metrics compare the learner's pose to the reference pose.
9. The teaching agent uses the metrics, progress state, and lesson structure to decide what the learner should do next.

This separation means the offline pipeline provides the analysis substrate, while the frontend turns that substrate into an interactive coaching experience.

## 4. Offline pipeline architecture

### 4.1 Pose extraction and preprocessing

The offline pipeline uses MediaPipe as the upstream pose-estimation component. The main modules are:

- [motion-pipeline/motion_extraction/extract_holistic_data.py](motion-pipeline/motion_extraction/extract_holistic_data.py)
- [motion-pipeline/motion_extraction/preprocess_pose_data.py](motion-pipeline/motion_extraction/preprocess_pose_data.py)

The preprocessing stage currently performs:

- explicit raw/clean artifact separation, with raw files retained as `*.pose2d.raw.csv` and `*.holisticdata.raw.csv`,
- sibling clean artifact generation as `*.pose2d.clean.csv` and `*.holisticdata.clean.csv`,
- root recentering around the hip midpoint,
- torso-length normalization,
- frame usability flags for invalid or insufficient pose information.

The broader preprocessing plan is intentionally phased.

- Phase 1, already implemented: root recentering, torso-length normalization, and explicit usability metadata.
- Phase 2, planned: joint-wise visibility thresholding plus short-gap interpolation.
- Phase 3, planned: joint-wise outlier flagging for discontinuous jumps plus short-gap interpolation.
- Phase 4, planned: smoothing, currently expected to use Savitzky-Golay filtering.

These steps matter because downstream metrics depend on a stable geometric pose representation rather than raw detector output alone.

The raw artifacts are still important and are not just intermediate leftovers. Raw `pose2d` remains the correct representation for image-space consumers such as browser-side skeleton overlays, because those overlays must line up with the original pixel coordinates of the source frames. Clean pose data is instead intended for most analytical consumers.

In practice, this means the preprocessing layer is both a data transformation stage and an interface boundary. Code that consumes pose data should communicate whether it expects:

- `pose2d` or `holisticdata`,
- raw or clean coordinates,
- image-space coordinates or normalized analysis-space coordinates.

### 4.2 Audio and structural analysis

The pipeline also derives structure from the dance itself. It computes:

- beat and tempo information,
- dance-tree segmentation,
- complexity signals over time,
- metadata helpful for instructional sequencing.

These analyses help the lesson system decide where the choreography can be broken into meaningful segments and practice steps.

Complexity analysis is being refactored so that it can operate explicitly on either 2D or 3D pose inputs. The current design direction is:

- keep raw-vs-clean assumptions explicit in code and naming,
- prefer clean pose data for most analytical pathways,
- allow both cleaned `pose2d` and cleaned `holisticdata` to serve as valid inputs to complexity computation,
- avoid silently mixing image-space and normalized coordinate assumptions inside the same analysis function.

### 4.3 Bundle export

The pipeline exports the data needed by the frontend, especially the dance bundle JSON and related media references. The main export logic is in:

- [motion-pipeline/motion_extraction/dancetree/bundle_data.py](motion-pipeline/motion_extraction/dancetree/bundle_data.py)

In practice, this is the bridge between offline analysis and the browser-based coaching experience.

## 5. Frontend architecture

### 5.1 Practice and lesson experience

The main practice experience is implemented around the practice page and lesson route structure in [svelte-web-frontend/src/routes](svelte-web-frontend/src/routes). The page coordinates:

- reference video playback,
- webcam display,
- skeleton overlays,
- recording and review UI,
- feedback presentation.

The overlay requirement is one reason the system keeps raw and clean pose data side by side. Browser overlays should use raw `pose2d` because they must preserve the original image-space geometry, while scoring and offline analysis should generally move toward clean pose inputs.

### 5.2 Webcam pose estimation

Live pose estimation runs in a worker so that the UI remains responsive while pose inference is happening. The relevant implementation is in:

- [svelte-web-frontend/src/lib/services/PoseEstimationService.ts](svelte-web-frontend/src/lib/services/PoseEstimationService.ts)
- [svelte-web-frontend/src/lib/webcam/pose-estimation.worker.ts](svelte-web-frontend/src/lib/webcam/pose-estimation.worker.ts)

The service receives camera frames, forwards them to the MediaPipe worker, and emits estimated 2D and 3D landmarks back into the practice page state.

### 5.3 Motion evaluation layer

Once a live pose is available, the frontend compares it against the reference pose for the current segment. The evaluation stack is centered around:

- [svelte-web-frontend/src/lib/ai/FrontendDanceEvaluator.ts](svelte-web-frontend/src/lib/ai/FrontendDanceEvaluator.ts)
- [svelte-web-frontend/src/lib/ai/UserDanceEvaluator.ts](svelte-web-frontend/src/lib/ai/UserDanceEvaluator.ts)
- [svelte-web-frontend/src/lib/ai/motionmetrics](svelte-web-frontend/src/lib/ai/motionmetrics)

This layer computes:

- live per-frame metrics during practice,
- summary metrics after a segment or attempt,
- time-series histories used for diagnostics and feedback.

The metric interface is modular, so new metrics can be added without changing the surrounding control flow.

## 6. Coaching and lesson-plan logic

The teaching agent is the main coordinator between evaluation and instructional action. Its implementation is in:

- [svelte-web-frontend/src/lib/ai/TeachingAgent/TeachingAgent.ts](svelte-web-frontend/src/lib/ai/TeachingAgent/TeachingAgent.ts)

Its role is to:

- organize the practice plan,
- track progress through activities and steps,
- decide what the learner should do next after a practice attempt,
- surface feedback and navigation options.

A key distinction for this work is that lesson-plan construction in chapter 5 is different from chapter 4, even though it is still automated. Chapter 4 used a more static lesson-plan generation setup tied to the earlier study workflow. Chapter 5 uses a different automated structure that is more directly shaped by segmentation, progress state, and coaching logic in the current system.

## 7. Why MediaPipe is a foundational dependency

MediaPipe is not merely one component among many; it is an upstream dependency for the whole coaching loop. The quality of the pose estimates directly affects:

- the reliability of the live evaluation metrics,
- the usefulness of the coaching feedback,
- the validity of any downstream decision-making.

For this reason, MediaPipe quality should be evaluated both as a detector problem and as a system-level constraint. The relevant questions are not only whether the detector is accurate in isolation, but whether its errors are small and stable enough that downstream metrics and coaching decisions remain meaningful under real-world webcam conditions.

## 8. Practical interpretation

The system is best understood as three layers:

- a data layer for pose extraction, preprocessing, and bundle export,
- an evaluation layer for metric computation and summary analysis,
- an interaction layer for lesson delivery, feedback, and coaching decisions.

The system becomes useful when these layers are aligned. If the detector is weak, the evaluation layer becomes noisy. If the evaluation layer is weak, coaching actions become brittle. If the interaction layer is poor, the system cannot convert analysis into meaningful learner support.
