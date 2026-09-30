---
date: 2026-09-30
tags: [metrics, visualization, frontend, study-data]
artifacts: []
---

# Qijia2D frame inspector and local dataset exploration

## User intent

Viona wants a frame visual that makes the metric calculation intuitive and exposes pose or skeleton conditions that produce surprising scores. Her Qijia2D example places participant and reference poses side by side, draws the eight normalized vectors, moves dotted reference directions onto the participant's landmarks, and connects the vector endpoints to show each orientation error. A color-coded error stack and a frame-error time series should make the total inspectable while scrubbing.

She also wants the locally hosted frontend to know about the staged participant dataset, with a path from home through a dataset explorer, performance and segment selection, into a review screen where she can choose a metric visualization and scrub the video.

After trying that flow, Viona asked to group the segments of a performance into one selection: choose a metric, choose a thumbnail-bearing performance, then inspect its full timeline. She wants the video and pose files to switch automatically at segment boundaries, the reference video to be visible, the participant view to dominate, and the error series to stay visible at the bottom as a scrubber. She asked to reduce explanatory chrome and make the arrows smaller while lengthening the drawn unit vectors.

## Decisions and findings

- Implement the first visualization for Qijia2D's existing eight image-space vectors. Show both the summed error (0–16) and its transformation to the existing 0–5 score; this is a diagnostic representation of the current implementation, not a new validated metric.
- Use the canonical raw segmented participant pose2d CSVs beside their exactly matching segmented MP4 stems in the staged local dataset. Whole-performance video files have no verified equivalent pose pairing in this flow.
- Reference segment poses exist locally for corresponding dance clips. The initial inspector withheld reference video while the offset and coordinate mapping were unverified. A later geometry check found visual alignment for bartender clip 1 at 0.99 s and clip 2 examples from the other three dances when the **video only** is horizontally flipped and CSV coordinates stay in native video pixel space. The segmenting script specifies the same flip. Confident scored landmarks overwhelmingly fit the native video dimensions; occasional out-of-bounds points remain possible. The clip spacing and clip-local CSV timestamps support a source seek of `(clipNumber - 1) × spacing + CSV timestamp / 1000`, with about one-frame uncertainty near cut boundaries. This is a supported diagnostic mapping, not quantitative validation of every tutorial clip or a change to metric pose pairing.
- For dataset clips, reproduce the current offline fixture's row-index pose pairing and shortest-sequence truncation. Label that alignment explicitly because it can create an apparent error under timing differences. The fixture's `actualTimesInMs` calculation currently uses `i / (speed × 30)` despite the milliseconds name; do not present it as verified milliseconds.
- Keep dataset access in development on loopback, reject cross-site browser requests, and serve selected media by catalog ID from known roots. Participant images or video frames must not be committed as evidence. A synthetic example can illustrate the interface in source-controlled assets.

## Implementation and checks

The research entry offers Qijia2D as the available metric. Its compact dataset screen offers study, dance, and pseudonymous participant-label filters and lazy performance thumbnails. Selecting a performance opens its entire ordered sequence directly. A fixed bottom error chart is also the accessible scrubber for the cumulative video duration; seeking or playback across a boundary switches participant video and raw pose automatically. The review gives the participant pane more space than the reference pane. The full tutorial video appears behind the segment reference pose with the supported video-only flip and clip-local timestamp seek. Normalized arrows, relocated dotted reference directions, connector errors, an eight-color 0–16 stack, and the 0–5 score remain visible. A local-file mode and synthetic example remain available.

The metric still compares pose CSV **rows** by index, while participant video seeking uses each row's preserved **source frame**. This matters when extraction dropped frames. Cumulative timeline position uses measured segment video durations. The UI flags low-visibility landmarks, invalid vectors, and confident scored joints outside video bounds. Crops prefer confident scored landmarks plus a nearby confident nose, so low-confidence outliers do not dominate the view. A pending seek target prevents an old media time update from resetting a cross-segment seek to the boundary.

Focused tests passed (27/27 for the updated API and inspector), targeted formatting/lint and production build passed. A full `pnpm check` still reports 56 pre-existing errors and 12 warnings in unrelated frontend files; it reported none in the changed work. The Svelte autofixer CLI could not run from the offline dependency cache. Browser review loaded a four-segment performance, confirmed tutorial playback and pose overlay, used the chart to seek directly to 5.00 s in segment 2 and 10.00 s in segment 3 without losing the target, and checked the fixed chart and participant-dominant layout at narrow, tablet, and laptop widths. Direct local media requests returned 200, while cross-site or mismatched-origin requests returned 404. No participant frame was saved or committed.

## Next research step

Use the inspector to examine selected high-error and low-visibility frames, note whether the underlying cause is motion difference, pose extraction, crop/coordinate mismatch, or row-index alignment, and decide whether Qijia2D or the fixture pairing needs refinement. No participant rating or coaching-validity result has been inferred from this implementation. The thesis chapter remains unchanged while metric behavior and findings are unsettled.
