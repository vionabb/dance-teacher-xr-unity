---
date: 2026-09-22
tags: [pose-preprocessing, human-annotation, quality-gate, research-direction]
artifacts: []
---

# Three-stage preprocessing annotation and current data audit

Viona wants to finish preprocessing soon by reviewing small batches (about five videos at a time): (1) rate pose-estimation usability on every segment of the four CHI reference videos and a quality-diverse participant sample using the existing four-point scale; (2) on included videos, label frames `good`, `flawed`, or `unusable` in a focused interface; (3) correct landmarks only on frames labelled `flawed`, with those frames highlighted in the detailed-error timeline. A small audit sample of accepted and rejected material will check missed errors. Keep the original poses, judgments, corrections, and their provenance. The exit criteria are a grounded description of quality by video, frame, and landmark, and a defensible process for obtaining metric-ready input. Viona also wants to examine how preprocessing changes similarity-metric correlations with human ratings, then make metrics quality-aware.

## Read-only status check

On 2026-09-22, the live local server reported experiment `quality-triage-20260828`: 97 tasks, comprising 60 `quality_triage`, 17 `error_marking`, and 20 `video_quality_rating`. For `viona`, 60 were completed, 3 started, and 34 untouched. The quality-triage database's latest `viona` judgments rate 33 of the 60 sampled frames/clips `problematic` and 27 `fine`. These are coarse, signal-selected windows and controls, not four-point ratings of every segment.

The three started `error_marking` tasks are `000`, `001`, and `009`; none is completed. `000` has an `unusable` draft video rating, 28 saved bad-frame indices, and two usable overrides. Of those 28 indices, seven coincide with automatically missing tracking, so the saved total is not 28 independent manual judgments. `001` has three landmark marks and three corrected landmark-frame positions. `009` has 53 marks and 184 corrected landmark-frame positions across 73 frames, but its draft predates the required four-point video rating. Its work should be preserved, not counted as a completed case.

The older single-frame overlay-review experiment has 74 completed judgments and one `unclear` under `viona`; 28 tasks contain coordinate changes, totaling 112 changed landmarks, and 71 landmark occlusion states changed. These can inform correction validation but are not frame-usability labels. The 20 `video_quality_rating` tasks ask about lighting and clothing; Viona has not rated them, although another annotator has. A separate `vioina` identity and a copied set of 60 `viona` triage judgments also exist. The copied judgments disagree with the quality-triage database on six verdicts, so the paired manifest and quality-triage database should remain the authority for this experiment; copied rows must not be pooled as extra judgments.

## Implementation gap

The server and UI support a `video_usability_triage` task type and the four ratings `unusable`, `marginal`, `correctable`, `perfect`, but the live manifest contains zero such tasks and there is no generator for the proposed reference/participant batch. This task type suppresses the live skeleton overlay, so its source clip must show pose evidence another way. If the task has no landmark artifact, the current missing-tracking helper treats every frame as automatically unusable. Frame usability is currently binary. There is no focused `good`/`flawed`/`unusable` task, nor a path that carries `flawed` frame labels into the detailed timeline. The existing `error_marking` interface and append-only corrections can serve stage 3.

One provenance defect matters before collecting new labels: the browser saves `bad_frames` as the union of manually marked frames and automatically missing-tracking frames. On reload, saved indices populate the manual list, so an automatically flagged frame can appear manually confirmed. `usable_frames` retains explicit overrides, but manual versus automatic unusable-frame provenance is not reliably preserved in the stored response. The new workflow should store these separately and migrate old drafts without discarding them.

The next concrete work item is a small new manifest and task flow for the first two stages, with stable source-video and frame indexing, three-level frame labels, and separate automatic/manual provenance. Keep the historical manifest and databases intact. Define the audit sample and quality bar before selecting the stage-3 correction tasks.
