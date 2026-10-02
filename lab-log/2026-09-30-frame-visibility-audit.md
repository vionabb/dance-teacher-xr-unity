---
date: 2026-09-30
tags: [human-annotation, pose-tracking, visibility, exploratory-analysis]
artifacts: []
---

# Visibility against the first frame-level corrections

Viona asked how the annotation work is progressing, which dance moments are
hard for pose tracking, and how strongly visibility predicts landmark errors.
She reports that limb occlusion can make the skeleton unstable. This is an
exploratory read of the active, selected `correctable` queue, not a final
detector evaluation.

At the September 30 read, all 154 overall-video tasks and 23 of 49 frame and
landmark tasks were completed. All five study reference segments in this
follow-up were completed. The latest saved revision was
`2026-09-30T11:11:06Z`. The remaining 26 frame tasks were unstarted.

Analysis matched the latest completed frame-task revision by `task_id` to the
203-task manifest, then aligned each annotated frame with its canonical raw
`pose2d` CSV row using `source_frame_start`. The extracted video landmark
positions were checked against the raw pose coordinates. The local reproducible
analysis script is
`motion-pipeline/temp/experiments/20260930-frame-visibility-audit/analyze.py`.
The 23 clips cover 2,569 frames. Legs were excluded because current annotation
scope is upper body. Of 20,376 valid upper-body frame-landmark pairs, 360 had a
saved position correction; the other pairs are *implicitly unmarked*, not
independently verified error-free ground truth. The 22 automatically marked
missing-pose frames are a separate failure mode and are not counted as
landmark corrections here.

Wrists accounted for 205/360 corrections and elbows for 134/360; together,
339/360 (94%) were arm landmarks. This held in both the five reference clips
(115/124) and the 18 participant clips (224/236). The reference segments
varied substantially: Last Christmas segment 1 had two corrected landmarks,
while Pajama Party segment 3 had 29. The pattern identifies troublesome
*body parts*; with this selected, still small set it does not establish a
recurrent choreographic moment across performances.

The raw pose `visibility` field was strongly associated with whether Viona
corrected an upper-body landmark. Below 0.5 visibility, 213/2,609 pairs
(8.2%) had corrections. At 0.95 or above, 52/12,605 (0.41%) did: about a
20-fold difference. Ranking lower visibility ahead of higher visibility gave
ROC AUC 0.832; a 400-resample clip bootstrap gave a 95% percentile interval
of 0.772–0.881. At a 0.5 cutoff, 213/360 corrections (59%) were caught, but
only 213/2,609 flagged pairs (8.2%) were corrected. Thus visibility is useful
for prioritizing review, but cannot serve alone as an error label. At least 52
corrections occurred at visibility 0.95 or above. Among corrected pairs,
visibility and correction distance normalized by image diagonal had Spearman
correlation -0.29, a weaker relationship than for correction occurrence.

The current response records no selected per-mark cause tags, so these data
cannot quantify what fraction was truly caused by limb occlusion. MediaPipe
visibility is a model output for whether a landmark is visible or occluded,
including out-of-frame cases; it is not a human occlusion annotation. This
analysis is subject to selected-video bias, correlated adjacent frames, sparse
annotation, and the fact that a correction records both a detected error and
Viona's choice to fix it. It does not assess legs or entirely absent poses.

Next: finish the remaining 26 frame tasks if feasible, then evaluate
visibility alongside temporal discontinuity, limb geometry, and left/right
swaps against these saved corrections, reserving clips for held-out testing.
