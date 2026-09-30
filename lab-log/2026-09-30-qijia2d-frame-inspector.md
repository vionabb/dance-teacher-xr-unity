---
date: 2026-09-30
tags: [metrics, visualization, frontend, study-data]
artifacts: []
---

# Qijia2D frame inspector and local dataset exploration

## User intent

Viona wants a frame visual that makes the metric calculation intuitive and exposes pose or skeleton conditions that produce surprising scores. Her Qijia2D example places participant and reference poses side by side, draws the eight normalized vectors, moves dotted reference directions onto the participant's landmarks, and connects the vector endpoints to show each orientation error. A color-coded error stack and a frame-error time series should make the total inspectable while scrubbing.

She also wants the locally hosted frontend to know about the staged participant dataset, with a path from home through a dataset explorer, performance and segment selection, into a review screen where she can choose a metric visualization and scrub the video.

## Decisions and findings

- Implement the first visualization for Qijia2D's existing eight image-space vectors. Show both the summed error (0–16) and its transformation to the existing 0–5 score; this is a diagnostic representation of the current implementation, not a new validated metric.
- Use the canonical raw segmented participant pose2d CSVs beside their exactly matching segmented MP4 stems in the staged local dataset. Whole-performance video files have no verified equivalent pose pairing in this flow.
- Reference segment poses exist locally for corresponding dance clips. An exact offset into a full reference video has not been verified, so a dataset review should present a reference pose view without claiming synchronized reference video.
- For dataset clips, reproduce the current offline fixture's row-index pose pairing and shortest-sequence truncation. Label that alignment explicitly because it can create an apparent error under timing differences. The fixture's `actualTimesInMs` calculation currently uses `i / (speed × 30)` despite the milliseconds name; do not present it as verified milliseconds.
- Keep dataset access in development on loopback and serve selected media by catalog ID from known roots. Participant images or video frames must not be committed as evidence. A synthetic example can illustrate the interface in source-controlled assets.

## Implementation and checks

The local research entry opens a Qijia2D dataset explorer with study, dance, and pseudonymous participant-label filters. A performance exposes its paired segments; a segment opens the frame review. The review shows the participant video and pose, a pose-only reference, normalized vector arrows, relocated dotted reference directions, connector errors, an eight-color 0–16 stack, a frame-error series, and frame scrubbing. The metric choice remains visible in review; other metric visualizations are marked as planned. A local-file mode and synthetic example remain available.

The metric still compares pose CSV **rows** by index, while the participant video now seeks with each row's preserved **source frame**. This matters when extraction dropped frames. The reference pose row, source frame, and CSV timestamp are display context rather than an inferred synchronized video time. The UI flags low-visibility landmarks, invalid vectors, and out-of-video coordinates. Crops prefer confident landmarks used by the metric plus a nearby confident nose, so low-confidence outliers do not dominate the view.

Focused tests passed (13/13 after the alignment fix; 8/8 in the final inspector-only run). Targeted lint/format checks and a final production build passed. A full `pnpm check` still reports 56 pre-existing errors in unrelated frontend files; it reported none in the new work. The Svelte autofixer CLI could not run from the offline dependency cache. Browser review loaded a local segment, showed both poses and a score, verified video seeking while scrubbing, and checked narrow and desktop layouts. No participant frame was saved or committed.

## Next research step

Use the inspector to examine selected high-error and low-visibility frames, note whether the underlying cause is motion difference, pose extraction, crop/coordinate mismatch, or row-index alignment, and decide whether Qijia2D or the fixture pairing needs refinement. No participant rating or coaching-validity result has been inferred from this implementation. The thesis chapter remains unchanged while metric behavior and findings are unsettled.
