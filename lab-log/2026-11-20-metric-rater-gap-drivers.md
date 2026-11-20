---
date: 2026-11-20
tags: [metrics, qijia2d, discrepancy-review, validation, human-ratings]
artifacts: [assets/2026-11-20-metric-rater-gap-drivers/gap_drivers_summary.json, assets/2026-11-20-metric-rater-gap-drivers/within_clip_qijia2d.json]
---

# What drives the Qijia2D vs. human-rating gaps (743 segments)

## User intent

The coordinator proposed "a batch analysis in the cloud, for example which joints
and segments drive the biggest metric–human gaps across all 743 segments". Viona
replied: "yes, please do". This is evidence for validating the metric. No thesis
changes were made.

## What was run

All 743 discrepancy-queue segments (591 Study 1, 152 Study 2; 85 participants). The
eligibility rule is `hostedTasks`: a human rating, a reference, and the current
metric release.

1. `python3 -I .github/research-storage.py table <research_* table> --out <name>.json`
   for `research_analysis_recording`, `research_human_rating`, `research_media`,
   `research_reference_segment` and `research_material`. Then the 743 participant
   pose CSVs and 14 reference pose CSVs were fetched into the git-ignored
   `local-data/research-chi25/`.
2. `cd svelte-web-frontend && node scripts/exportVectorFrames.mjs` writes
   `local-data/research-chi25/analysis/vector-frames.jsonl`. It uses
   `src/lib/research/vector-breakdown.ts`, which pairs rows, cuts at the segment
   duration and scores frames exactly as `qijiaSegmentSamples` does. It also keeps
   each vector's error, visibility and unit direction. Segment scores reproduce the
   review page's scores exactly (max abs diff 0.0).
3. `cd motion-pipeline && uv run python adhoc_analysis/metric_rater_gap/gap_drivers.py --out <dir>`
   writes the aggregate summary
   ([gap_drivers_summary.json](assets/2026-11-20-metric-rater-gap-drivers/gap_drivers_summary.json)).
   `plot_gap_drivers.py` draws the two figures. The figures live in the project
   files folder `metric-rater-gap/`, because cloud sessions cannot push LFS files.

Definitions match the review page. M is the mean frame score,
5 × (1 − mean vector error / 2). H is the mean of three 1–3 ratings mapped to 1–5.
The rank gap is the mid-rank percentile of M minus that of H. A negative gap means
the metric is harsher than the raters. CIs are 95% bootstrap intervals resampling
participants (1,000 draws).

## Findings

- **Baseline.** Spearman ρ(M, H) = 0.43 [0.33, 0.51] pooled.
- **Reference-clip offsets are the largest single driver.** Within one reference
  clip (study × dance × clip number) the median ρ is 0.57, and 17 of 18 cells are
  between 0.32 and 0.71. About 31% of rank-gap variance lies between these cells.
  The metric's typical score shifts from clip to clip in a way the raters' scores
  do not. If M is standardized within each reference clip, ρ rises to 0.51
  (+0.08 [+0.03, +0.13]). This would need a per-clip calibration, so it is a
  diagnostic, not a proposed metric.
- **One cell is broken.** In Study 1, pajama-party clip 1 has ρ = −0.24 (n = 43).
  Study 2 has no rated clip 1. *Inferred, not checked:* this fits Viona's earlier
  lead-in hypothesis (2026-11-05). It is the first cell to open in the review queue.
- **Forearms carry the signal; torso and upper arms add little or hurt.** The
  errors that best track H are the forearms (ρ(−error, H) = 0.40 left and 0.42
  right). The upper arms are at 0.18 and 0.25, and the torso vectors at 0.11–0.19.
  - A torso-only metric falls to ρ = 0.18, and an upper-arms-only metric to 0.26.
  - A forearms-only metric gives 0.47 (+0.04 [−0.01, +0.09]).
  - Dropping both upper arms gives +0.03 [−0.004, +0.07], and dropping the
    shoulder line gives +0.01 [+0.003, +0.015].
  - Forearms-only and drop-both-upper-arms both improve ρ in Study 1 and Study 2
    separately. However, these subsets were chosen by looking at this same data,
    so they are hypotheses that need held-out confirmation.
  - The drop-one-vector rows in the summary and figure are diagnostics only.
    Viona (2026-11-20): "we should never introduce something that weighs body
    parts different across left-right symmetry". Only left/right-symmetric
    variants are candidates.
- **What separates "metric harsher" from "metric kinder".** Every vector's
  contribution to the score deficit is larger in harsh-gap segments. Error in
  the upper arms (ρ with rank gap −0.47 and −0.44) and the torso (−0.28 to −0.37)
  goes with harsh gaps more than forearm error does (−0.26 to −0.28). The metric
  penalizes upper-arm and torso deviations that the raters appear to discount.
  Frames with any vector off by more than 90° also go with harsh gaps
  (ρ = −0.49). However, capping per-vector error at 90° or using the median frame
  does not improve ρ (0.425 and 0.412).
- **Human ceiling.** 39% of segments have H = 5 (all three raters gave 3/3). These
  make up 88% of the harshest 10% of gaps, so many "harsh" gaps are ties at the
  rating ceiling. The metric still separates segments there and the raters cannot.
- **Kindest 10%.** In these segments the raters gave a mean H of 2.99, while M was
  4.33 with low error on every vector. Nothing in the eight vectors explains them.
  Rater disagreement goes with kinder gaps (ρ = +0.22). Lower-body error could not
  be tested: participant leg visibility has a median of 0.05, and only 4% of
  segments have a mean leg visibility of at least 0.5. The legs are mostly out of
  frame, so adding leg vectors lowers ρ (−0.06).
- **Not drivers.** The following do not explain the gaps:
  - Tracking visibility: ρ with rank gap is 0.02.
  - Timing: the best shift within ±0.5 s has a median of +3 frames (participant
    late), but rescoring at each segment's best shift does not raise ρ (−0.02).
  - Left/right mirroring: only 18% of segments score higher when mirrored.
  - Segment edges: trimming 15% at each end lowers ρ (−0.04).
  - Dance or study offsets alone explain 3.5% of rank-gap variance.

## Open / next

- Viona to review Study 1 pajama-party clip 1 in the discrepancy queue, and say
  whether the lead-in or something else explains its negative ρ. This needs her
  visual judgment.
- Whether to test the reweighted vector sets (forearms-only, no upper arms; symmetric only) on
  held-out data, for example Viona's own ratings or the new study, before any
  metric change. The metric modules are unchanged, so the metric release
  fingerprint did not move.
- Whether thesis framing should report pooled ρ or within-clip ρ. This is
  Viona's call.

## Follow-up: within-clip evaluator (same day)

Viona asked: "is there a way to design our metric-evaluation suite to do analysis
comparing only how rankings compare within clips? so a metric is good if, for a
particular clip, it results in a similar ranking of performance to human ratings".
She accepted that this does not test absolute calibration: "i think this is fine
for now as we figure out what the metrics capture thats similar to human
similarity perception and what they leave out". She also set a design rule: "we
should never introduce something that weighs body parts different across
left-right symmetry". Only symmetric variants were evaluated below.

`motion-pipeline/adhoc_analysis/metric_eval/within_clip.py` takes any table with
one row per segment, holding a participant column, a clip key, the human rating
and one or more metric columns. For each metric it reports:

- **within ρ:** per-clip Spearman ρ, averaged with weights equal to clip size;
- **pairwise:** among same-clip pairs that the raters scored differently, the
  share the metric orders the same way. A metric tie counts as half, and 0.5 is
  chance;
- **pooled ρ:** for reference;
- a per-clip table, 95% participant-cluster bootstrap intervals, and paired
  differences against a baseline metric.

Synthetic tests are in `test_within_clip.py`. The command:

```
uv run python adhoc_analysis/metric_eval/within_clip.py <segments.csv> --clip-col study,dance,clip \
  --human-col H --baseline M --metric M="Qijia2D, all 8 vectors" --metric "only:forearms=Forearms only" ...
```

The input `segments.csv` is the per-segment table from `gap_drivers.py
--segments-out`; it stays in `local-data/`. The output is
[within_clip_qijia2d.json](assets/2026-11-20-metric-rater-gap-drivers/within_clip_qijia2d.json).

All 743 segments, 18 clips, 85 participants, 11,359 informative same-clip pairs:

| Variant (symmetric) | Within ρ [95% CI] | Pairwise [95% CI] | Δ within ρ vs all 8 | Pooled ρ |
| --- | --- | --- | --- | --- |
| Qijia2D, all 8 vectors | 0.51 [0.40, 0.59] | 0.73 [0.68, 0.77] | — | 0.43 |
| Arms only (no torso) | 0.51 [0.40, 0.59] | 0.73 [0.69, 0.77] | +0.00 [−0.02, +0.02] | 0.44 |
| Forearms only | 0.50 [0.40, 0.58] | 0.73 [0.69, 0.77] | −0.01 [−0.05, +0.02] | 0.47 |
| No upper arms | 0.49 [0.38, 0.58] | 0.72 [0.68, 0.76] | −0.02 [−0.05, +0.01] | 0.46 |
| Upper arms only | 0.40 [0.30, 0.48] | 0.68 [0.64, 0.72] | −0.11 [−0.16, −0.06] | 0.26 |
| Torso only | 0.20 [0.09, 0.29] | 0.59 [0.54, 0.63] | −0.32 [−0.39, −0.22] | 0.18 |

What this changes:

- Within a clip, Qijia2D orders about **73% of differently rated pairs** the
  way the raters do.
- **The forearm advantage was a clip-offset effect.** Forearms-only beat all 8
  vectors on pooled ρ (0.47 against 0.43), but within clips it is no better
  (−0.01). The same holds for dropping the upper arms. The earlier
  vector-subset findings therefore mostly reflect which clips are hard for the
  metric, not which body parts raters attend to.
- Torso-only and upper-arms-only are clearly worse within clips too. The arms
  carry the ranking information, and adding the torso neither helps nor hurts
  (+0.00).

Next: show the within-clip rank gap in the discrepancy queue, so the queue
surfaces the disagreements this evaluator counts. Then run Viona2D through the
same evaluator once its per-segment scores are exported.
