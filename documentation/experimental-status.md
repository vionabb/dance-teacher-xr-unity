# Experimental Status

This document summarizes the current status of the thesis-related research work in this repository, with a focus on the transition from the published chapter-4 study toward the new chapter-5 automatic-coaching research direction.

## Overview

The repository now serves two related purposes:

1. It preserves and references the evaluation assets from the earlier CHI user-study work (chapter 4), including user performance videos, reference TikTok videos, human ratings, and pose-derived artifacts.
2. It provides the technical scaffolding for the new chapter-5 work on automatic coaching, especially automated coaching decisions, lesson-plan generation, and feedback that closes the loop between motion analysis and instructional action.

## Current status by workstream

### Literature
- Status: In progress
- Current state: The thesis framing is moving toward a new chapter-5 angle around automatic coaching. The paper "Make it Simple, Make it Dance" and its concept of motion anchors are identified as relevant prior work and should be integrated into the related-work and framing sections.
- Next steps: Read and synthesize the paper, then incorporate the motion-anchor concept into the thesis narrative and related work.

### Metric development & technical evaluation
- Status: In progress
- Current state: The repository already supports pose extraction, metric analysis, and evaluation pipelines. An explicit preprocessing architecture is now in place: raw extraction artifacts are preserved as `*.pose2d.raw.csv` and `*.holisticdata.raw.csv`, and a sibling clean-data stage writes `*.pose2d.clean.csv` and `*.holisticdata.clean.csv`. Phase 1 of preprocessing currently covers root recentering, torso-length normalization, and frame usability metadata. The remaining technical milestones are to assess MediaPipe’s spatial and temporal accuracy in 2D and 3D, extend preprocessing for occlusion and discontinuities, and identify/select computational motion descriptors that capture stylistic differences.
- Next steps: Extend preprocessing with visibility-aware masking/interpolation, outlier handling, and smoothing; systematically evaluate the resulting 2D and 3D descriptor stability; define acceptance criteria for each metric; and document the validation process for the thesis/paper.

### System development
- Status: In progress
- Current state: The Svelte frontend and Python motion pipeline are already in place and support lesson playback, pose processing, and analysis workflows. The motion pipeline now distinguishes between raw pose data kept for image-space consumers such as skeleton overlays and clean pose data intended for most analytical consumers. Complexity analysis has been refactored toward explicit 2D-versus-3D and raw-versus-clean input assumptions, but the broader consumer migration is still in progress. The next system milestones are to port validated metrics to JavaScript, add post-activity self-report screens, and wire up automated coaching decisions with user feedback capture.
- Next steps: Continue migrating analytical consumers to explicit clean-data interfaces where appropriate, preserve raw `pose2d` for overlay and visual-reference use cases, reproduce Python metric outputs in JavaScript, add self-report UI screens, implement coaching-decision logic, and iterate on acceptance criteria for decision quality.

### User study & learning efficacy evaluation
- Status: Planned / not yet started
- Current state: The earlier chapter-4 study artifacts provide a valuable technical evaluation substrate, but a new user study for the chapter-5 system has not yet been run.
- Next steps: Finalize the study design, prepare human-subjects materials, recruit and schedule participants, run the protocol, analyze quantitative and qualitative data, and write the discussion section.

## What is already in place

- A working research codebase for pose extraction, analysis, and motion-metric evaluation.
- A Svelte-based frontend that can host lesson playback and coaching-related interfaces.
- A Python pipeline that can process videos into pose and analysis outputs.
- An explicit raw/clean pose-data contract for the offline pipeline, with phase-1 preprocessing already implemented.
- Study artifacts and references for technical evaluation, including pose exports and study media references.

## What remains to be completed

- Read and integrate the motion-anchor concept from the relevant literature.
- Assess MediaPipe’s accuracy and robustness for the planned use case.
- Extend preprocessing beyond phase 1 so it can handle low-visibility spans, short-gap interpolation, outlier masking, and smoothing.
- Implement and validate computational motion descriptors in Python.
- Finish migrating analytical consumers to explicit clean-data inputs where that improves reliability, while preserving raw pose data for visual and image-space uses.
- Port validated metrics to JavaScript and ensure parity with Python output.
- Add self-report screens and automated coaching-decision feedback loops.
- Finalize the chapter-5 study design and prepare for human-subjects work.
- Recruit participants and run the new user study once the system is mature enough.

## Practical note for future agents

When continuing this work, treat the repository as a technical platform for chapter-5 development rather than as the implementation home for the published chapter-4 paper itself. The chapter-4 study materials are valuable mainly as grounding data for evaluation and iteration.
