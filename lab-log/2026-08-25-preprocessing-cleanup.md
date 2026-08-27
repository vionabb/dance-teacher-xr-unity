---
date: 2026-08-25
tags: [pose-preprocessing, validation, participant-data, motion-pipeline, experiment, human-annotation]
artifacts:
  - assets/2026-08-25-preprocessing-cleanup/gap-event-study2-5180.png
  - assets/2026-08-25-preprocessing-cleanup/participant-annotation-cases.csv
  - assets/2026-08-25-preprocessing-cleanup/targeted-preprocessing-annotation-cases.csv
---

# Lightweight pose-cleanup experiment

## User intent

> My goal is simply to ensure motion artifacts don’t impede my later experimental goals; my goal isn’t to produce the absolute best mediapipe cleanup script possible.

> Visually, to me, the smoothing on C2 seems potentially appropriate. How do we determine what the trusted 2D motion is?

> Please give me the option also to indicate clusters of overlays that are similar in quality ... consider how my judgments can be preserved for future analysis purposes.

> The images are too small for me to evaluate. Please update the annotation UI so that I can judge one frame at a time by drag and dropping the various overlays between 4 different levels—a perfect, ok, poor, and bad tier. Don't expect me to annotate motion qualities ... based on static images. Rather, give me a way to input free-form text annotations for each frame-overlay.

> Allow me to manually adjust the 2D skeleton to create a ground truth and label landmarks as non-occluded, semi-occluded, or fully occluded.

> Completed skeletons can be trusted as approximately correct, rather than pixel-precise. Preserve the initializer and moved points, and add repeat tasks to estimate that positioning tolerance.

Preprocessing should be judged from pose-output quality rather than downstream metric correlations. The process should stay automatic where possible, use limited high-value human review, and preserve those judgments as a reusable source-grounded human-judgment dataset.

## Decisions

- Analyze the 25-clip corpus prepared on 2026-08-13: five reference videos and twenty participant videos, all freshly extracted through the current shared pose extractor. Do not reuse legacy participant pose caches.
- Compare the historical preprocessing (`B0`) with visibility/gap/outlier cleanup (`C1`), the same cleanup plus triangular smoothing (`C2`), a more aggressive smoothed profile (`C3`), and a gap-only profile (`C4`).
- Correct the experiment after independent review: exclude generated `base` coordinates from roughness, describe unlabelled natural outlier actions without calling them false positives, and restrict `C4` from three frames to the naturally evidenced maximum of two.
- Treat automatic roughness only as a screening statistic. Smoothing mechanically reduces acceleration and must be judged against source video before deciding whether it removes jitter or attenuates true movement.
- Select gap-only interpolation through at most two internal frames as a low-risk **provisional** setting. Keep normal pipeline behavior unchanged (`config=None`) until that selection is deliberately wired into a later pipeline step. Do not enable masking, outlier replacement, or smoothing based on the automatic sweep alone.
- Keep `C2` open as a candidate pending source-backed adjusted-skeleton judgments rather than rejecting smoothing from roughness or displacement alone. Optional frame notes remain complementary evidence.

## Automatic findings

- The final run analyzed exactly 25 clips and 5,972 frames in both 2D and holistic modalities; two intended exclusions were honored.
- The corpus contained six internal whole-pose dropouts: five one-frame events and one two-frame event. It also contained terminal gaps of 15 and 120 frames.
- `C4` performed exactly 231 landmark-frame interpolations per modality (`5 × 33 × 1 + 1 × 33 × 2`). It made no visibility masks, outlier replacements, or smoothing actions.
- `C4` changed none of 132,524 eligible high-confidence observed landmark-frame samples, each measured as a three-component vector. Weighted finite/usable coverage increased from 97.622% to 97.739%, exactly the seven repaired frames. It left edge gaps and synthetic gaps of three, four, and fifteen frames untouched.
- Revised [gap plots](assets/2026-08-25-preprocessing-cleanup/gap-event-study2-5180.png) make the relationship explicit: `C4` is a dashed bridge inside the missing interval, and the `C4 − B0` panel is zero wherever `B0` exists. Apparent C4 bumpiness outside a gap is the unchanged B0 trajectory hidden under the overplot, not a new C4 artifact.
- Visibility-based profiles removed substantial data. Finite-coordinate coverage was 72.26% for `C1/C2` and 62.95% for `C3`, versus 97.62% for `B0`.
- Corrected mean per-file 2D acceleration p95 was 1.127 (`B0`), 0.951 (`C1`), 0.343 (`C2`), 0.325 (`C3`), and 1.127 (`C4`). This establishes that C2 is smoother, not that it is more faithful.
- `C2` changed nearly every eligible observed sample; the medians across files of per-file median and p95 2D displacement were approximately 0.050 and 0.204 torso lengths. Whether those changes correct noisy tracking or distort real motion remains a human visual question.

## Trusted-2D review

The selector still uses short source-backed windows to locate informative moments, prioritizing high-visibility wrists/ankles with large B0–C2 disagreement and then ordinary controls. The annotation unit is now one frame: a large source frame plus separate full-resolution B0–C4 overlays.

The local annotation tool now centers an editable skeleton over each source frame. A selected B0–C4 profile initializes coordinates and maps stored visibility to `Non-occluded` (1.0), `Semi-occluded` (0.5), or `Fully occluded` (0.0). The annotator can drag every landmark and change these states. Every new revision preserves the initial coordinate and its actual per-landmark source profile, final coordinate, global initializer, drag count, and occlusion-change count. Completed skeletons are treated as globally approved approximate ground truth. Profile ranking uses `0.8 × visibility-weighted positional error beyond the annotation tolerance + 0.2 × mean visibility absolute error`; missing visible or semi-visible predictions receive a one-torso positional penalty. Fully occluded landmarks contribute visibility evidence but no positional error.

Five additional repeat tasks were appended and pinned to the exact original revisions. They cover five cases and use each B0–C4 initializer once, always different from the original initializer. Until three valid repeats are complete, positional equivalence uses a provisional 5% of torso length. The empirical value is then the median across repeat frames of each frame's p90 normalized difference, using only landmarks marked non-occluded in both passes; semi-occluded repeatability is reported separately. This estimates workflow repeatability under alternate initialization, not absolute pixel precision. Historical stored scores remain provenance, while live state and exports recompute final scores with the active tolerance.

The initial queue contains six high-disagreement windows and two controls, expanded into 40 individual reference-frame tasks, followed by five tolerance repeats. A new 12-frame participant batch follows these: eight high B0–C2-disagreement cases (three `study1_segmented`, three `study2_segmented`, two `study1_whole`) and four ordinary controls. It uses the physical `data/participant_motions` archive, matched unambiguously by basename to the selected corpus rows, rather than the unavailable temporary-cache symlinks. The task manifest and [participant case ledger](assets/2026-08-25-preprocessing-cleanup/participant-annotation-cases.csv) preserve source, study corpus, dance, condition, selected joint, visibility, and disagreement. Initializers are balanced across B0–C4. Participant judgments are pending; this is broader coverage, not a finding.

After the completed first pass, an additional 18 targeted tasks were appended. Eight add the four previously unreviewed physical tutorial videos (`bartender`, `last-christmas`, `mad-at-disney`, and `pajama-party`), with one high B0–C2-disagreement frame and one ordinary control each. Six isolate one operation at a time: visibility masking (`V1`), outlier replacement (`O1`), and smoothing only (`S1`, triangular smoothing with no masking, gap filling, or outlier replacement). Four inspect genuine B0-to-C4 two-frame-or-shorter interpolation events, one from a reference tutorial and three from distinct participant clips. Every new task requires a human source-evidence classification—`usable`, `constrained`, or `weak`—plus optional factors (blur, low light, crop, silhouette, backdrop confusion) and a free-text note. The task-specific title/instruction tells the annotator what operation to inspect; no historical annotation is overwritten. The [targeted case ledger](assets/2026-08-25-preprocessing-cleanup/targeted-preprocessing-annotation-cases.csv) and tool [batch specification](../motion-pipeline/motion_extraction/annotation_tool/TARGETED_PREPROCESSING_BATCH.md) preserve selection provenance.

## Next step

Complete the 18 targeted tasks, including their required source-evidence classifications. Then recompute results by feature variant, source-evidence quality, moved landmarks, and initializer. Use the isolated `S1` tasks—not bundled C2—to decide whether smoothing is helpful; use the C4 repair-event tasks to assess interpolation directly. Keep C4’s two-frame gap repair provisional and provenance-marked; do not describe interpolated positions as ground truth. Normal pipeline preprocessing remains B0 until a configuration is explicitly integrated.
