---
date: 2026-08-27
tags: [pose-preprocessing, validation, participant-data, motion-pipeline, experiment, human-annotation, direction-change]
artifacts:
  - assets/2026-08-27-preprocessing-quality-gate-pivot/temporal_comparison_summary.csv
  - assets/2026-08-27-preprocessing-quality-gate-pivot/quality_factor_evidence.csv
  - assets/2026-08-27-preprocessing-quality-gate-pivot/automatic_quality_signals_by_file_B0.csv
---

# Pivot: quality-gate the corpus before optimizing smoothing

## User intent

> I've finished the latest 6 comparisons. In general, I don't notice any differences between the candidates. It seems to me like other issues with the pose estimation (jitteriness or false tracking of a limb) are much larger issues. I don't think these comparisons will be useful for testing the effect of smoothing, or perhaps they're ill-parameterized for smoothing.

> It also makes me think that the initial stage of preprocessing should more be focused on (1) identifying bad-quality videos and bad-quality pose-detections and then (2) correcting the issues (such as short-gap jumps) that are fixable and marking unusable the sequences that have compromising unfixable errors (these should be eliminated from the dataset, as they won't be useful for further metric development — and also, when we work on the frontend, we'll want to test the quality of the user's video input and prompt them to adjust things if needed to ensure we have a good data source). Then, optimizations such as potential smoothing can be applied to the revised videos that are free of major quality issues.

## Findings: the temporal comparison itself

All 6 blinded `temporal_pose_comparison` judgments (4 unique source-backed windows + 2 blinded repeats, batch `20260826-c4-smoothing-temporal-v1`) came back `no_discernible_difference` across the `a` candidates compared, at medium-to-high confidence. See
[temporal_comparison_summary.csv](assets/2026-08-27-preprocessing-quality-gate-pivot/temporal_comparison_summary.csv)
(candidate-to-letter mapping intentionally omitted here — the private answer key stays out of committed docs so the corpus can support blinded re-comparison later).

Critically, the free-text notes on every task identify a *different* dominant artifact than smoothing strength, and several call out that the artifact is shared identically across all candidates being compared:

- "the tracking is equally jumpy/jittery across the conditions, perhaps due to the video angle / cropping. it doesn't seem like good input for tracking"
- "same as last case. the tracking seems similarly smooth & latent, it's just the false-position left-arm part that's wrong (and is wrong equally across the three candidates)"
- "All three seemed jittery, especially around the shoulders. I'd like to see an option with more smoothing"
- "tracking is pretty good overall, except for an artifact near the beginning where it erroneously thinks the person's left arm is above their head"

This is a methodological finding, not just a null result: the comparison can't be informative about smoothing when a bigger, smoothing-invariant artifact (occlusion-driven jitter, hallucinated limb position, framing/cropping) dominates the same window. Comparing smoothing strengths on clips that already carry a compromising defect confounds the two questions.

## Findings: this pattern is already in the prior annotation record

Re-reading the free-text notes and `source_evidence_quality`/`source_evidence_factors` fields from all completed `editable_pose_ground_truth` tasks (2026-08-13 through 2026-08-25 sessions) shows the same defects recurring well before this session, across both reference tutorials and participant clips. Full extraction in
[quality_factor_evidence.csv](assets/2026-08-27-preprocessing-quality-gate-pivot/quality_factor_evidence.csv)
(31 tasks with a note, a factor tag, or both). Representative quotes:

- Framing/cropping: "camera frame is oriented too high, the waist and below are clipped"; "camera is weirdly oriented upwards"; `cropped_body` is the single most common tagged factor (9 of 13 `usable`-tagged targeted tasks).
- Lighting: "very dark frame. it's difficult to make out the forearm b/c they blend into the dark torso"; "left knee is too dimly lit to be easily pinpointable"; `low_light` tagged separately.
- Blur / false tracking: "fast blurry arms, but they're not occluded" (5 consecutive frames, `pose-cleanup-01`); "pose estimation sometimes is hallucinating an upward left-arm position, probably due to arm blur looking similar to a pattern in the backdrop" (`pose-cleanup-02`) — this is the same "false tracking of a limb" failure mode named in this session's temporal notes, not a one-off.
- Backdrop/other: `backdrop_confusion`, `silhouette`("user's figure is kind of silhouetted"), and one case explicitly excluded from quantitative comparison because "the existing annotation is unclear and does not support a dependable source-grounded judgment."

None of these are smoothing defects. They are either **source-video** problems (framing, lighting, camera angle, backdrop) or **detector** problems (blur-driven false limb positions, occlusion-driven jitter) that a temporal-domain filter cannot fix and that the automatic sweep's roughness metric cannot distinguish from real fast motion.

## Findings: an automatic signal already exists and roughly tracks the same clips

The 2026-08-25 sweep already computes per-file `B0` (unprocessed) roughness (`normalized_acceleration_p95`) and coverage (`finite_coordinate_fraction`, `usable_frame_fraction`) as a side effect — see
[automatic_quality_signals_by_file_B0.csv](assets/2026-08-27-preprocessing-quality-gate-pivot/automatic_quality_signals_by_file_B0.csv).
It was previously used only as a smoothing-screening statistic, but cross-referencing it against the human evidence above shows it already correlates with independently human-flagged clips:

- Worst coverage: `reference/bartender` (78.8% finite) — the reference video most heavily tagged `cropped_body` across six separate targeted-review frames.
- Highest jitter: `user5474`'s mad-at-disney clip and `user5532`'s last-christmas clip (both `p95` roughness far above the corpus median) — `user5532`'s clip is one of the two clips selected into this session's temporal batch specifically because reviewers noted it looked like bad tracking input.

This doesn't prove the automatic signal is sufficient on its own, but it means a first-pass automatic quality gate is not starting from zero — it can be validated against annotation data that already exists rather than requiring a new labeling pass before any progress is possible.

## Decisions

- **Pause** the `C4` smoothing-parameter-selection thread ([2026-08-26 entry](2026-08-26-c4-smoothing-parameter-selection.md)). Do not apply its original decision rule ("if indistinguishable, choose the weaker `a`") — the comparison as designed cannot discriminate smoothing effects from larger, smoothing-invariant artifacts, so treating "no discernible difference" as a vote for weaker smoothing would overstate what was actually tested. No smoothing parameter is selected; `C4` (gap-fill only, ≤2 frames) remains the only preprocessing setting with a positive decision behind it, still provisional and not wired into normal pipeline calls.
- **Reorder the preprocessing workstream**: quality gating (identify + fix-or-exclude) becomes the next piece of work, ahead of any further smoothing/optimization experiments. Optimization candidates should be re-evaluated later on a corpus that has already had compromising defects removed, so a comparison isn't confounded by artifacts smoothing was never meant to address.
- Treat this as a two-tier problem, matching the vocabulary already embedded in the annotation tool's `source_evidence_quality`/`source_evidence_factors` fields:
  - **Source-video quality** (framing/crop, lighting, camera angle, backdrop, resolution/compression) — largely a capture-time problem. For the existing CHI corpus this means flag-and-exclude; for the upcoming study frontend this means a live capture-quality check that prompts the user to adjust before recording.
  - **Pose-detection quality** (jitter, gaps/dropouts, false/hallucinated limb tracking, discontinuities) — a downstream-of-capture problem. Some of it is fixable (short-gap interpolation, already validated as `C4`); some of it (sustained false tracking, long dropouts) is not fixable and should mark the affected span, or the whole clip/segment, unusable rather than silently degrading later metric development.
- Reuse rather than duplicate the existing `usable` / `constrained` / `weak` human classification and its factor vocabulary (`cropped_body`, `motion_blur`, `low_light`, `backdrop_confusion`, `silhouette`, `other`) as the target labels for validating any automatic detector, instead of inventing a new taxonomy.

## Proposed path forward

1. **Define the exclusion unit and schema.** Decide whether quality gating flags whole clips, contiguous sub-spans, or both, and what the flag needs to carry (rule that fired, human- vs. automatic-confirmed, which factor). This needs to land in the pose/bundle schema (`pose-processing/dance_teacher_pose/schema.py`) and in whatever manifest lists which clips feed metric development, so "excluded" is explicit and provenance-tracked rather than a clip quietly vanishing from an analysis.
2. **Validate automatic detectors against the existing human labels before trusting them.** The corpus already has ~30 human `usable`/`constrained`/`weak` judgments with factors — use those as ground truth to check candidate automatic signals (the existing per-file roughness/coverage stats, plus new ones: a blur/false-tracking heuristic, a framing/crop check from landmark position relative to frame bounds, a sustained-implausible-jump detector for the "false tracking" failure mode). Report precision/recall against the human labels; do not wire an automatic exclusion rule into the pipeline until that validation exists.
3. **Build the fix-or-exclude decision rule.** Fixable: short internal gaps (`C4`, already provisional), and candidate additions such as short track-discontinuity correction — the 2026-08-25 report already notes there is "no independent track-reset/discontinuity detector" yet. Unfixable: sustained low source-evidence quality, long dropouts, or sustained false tracking — mark the span/clip unusable and exclude it from metric-development analysis rather than attempting to repair it.
4. **Re-run the corpus gate and re-derive coverage/roughness numbers** on the gated corpus, so the 2026-08-25 automatic sweep numbers (which mixed good and bad clips together) get a cleaned-corpus counterpart.
5. **Only then revisit smoothing/other optimization**, on clips that have passed the quality gate, so a future temporal comparison isn't fighting an artifact smoothing can't touch.
6. **Frontend follow-on (separate, later deliverable):** once the offline detectors are validated, identify which are cheap enough to run live in the browser (framing/crop from landmark bounds, gross lighting/contrast, visibility/confidence thresholds) to prompt the study participant to adjust before recording, versus which require full-clip context and stay offline-only (sustained roughness percentile, long-window dropout patterns).

## Open questions

- What exclusion threshold is acceptable (e.g., fraction of `weak`-flagged frames within a clip) before dropping the whole clip versus only the affected span — this is a judgment call for Viona once the automatic-detector validation numbers exist, not something to infer from the data alone.
- Whether excluded CHI-corpus clips should be dropped from metric-development analysis only, or also flagged in any human-rating comparison that references them (the ratings themselves aren't invalidated, but a metric computed on a corrupted pose trace would be).

## Next step

Build and validate the automatic quality/defect detectors against the existing ~30 human-labeled `editable_pose_ground_truth` judgments (step 2 above) — this can start immediately since the ground truth already exists. Do not touch normal pipeline defaults or the thesis chapter until the exclusion schema and decision rule are settled.
