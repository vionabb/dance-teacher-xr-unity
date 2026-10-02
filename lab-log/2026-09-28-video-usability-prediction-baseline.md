---
date: 2026-09-28
tags: [video-usability, quality-gate, prediction, technical-validation]
artifacts: [assets/2026-09-28-video-usability-prediction-baseline/metrics.json, assets/2026-09-28-video-usability-prediction-baseline/reference-transfer-metrics.json]
---

# First prediction test of video usability

Viona completed the focused 100-video rating batch and asked whether the
automatic measures can predict her judgments. This first test asks whether
three existing pose-quality signals rank clips with lower human usability
ratings when the participant being predicted is absent from model training.
The prespecified primary contrast for this exploratory run is `marginal` or
`unusable` versus `correctable` or `perfect`; a secondary contrast is any
concern versus `perfect`. This is a test of association and held-out ranking,
not a final operational pass/fail rule or a coaching metric.

## Inputs and method

The latest completed `viona` revision for each task in the focused manifest
yielded 100 ratings: 51 `perfect`, 32 `correctable`, 8 `marginal`, and 9
`unusable`. The 80 participant clips comprise 37, 27, 8, and 8 of those
ratings, respectively, across 61 participant groups. The remaining 20
segments cover all four study reference videos. They lacked stored
per-segment automatic signals and were excluded from the participant-held-out
model; a separate transfer check computed their signals below.

The three participant features were already stored in the manifest: crop
violation fraction, worst-window pose roughness, and false-tracking candidate
fraction. A fixed logistic model used training-fold median imputation,
standardization, and regularization `C=1`. Each participant was held out
entirely in turn. One roughness value was missing and imputed inside its
training fold. The ordinal check used a fixed ridge model (`alpha=10`). No
features, model settings, or classification thresholds were selected by
maximizing these ratings. Intervals are 2,000 participant-group resamples of
the fixed held-out predictions, so they omit model-refit uncertainty.

The local run and its detailed report are under
`motion-pipeline/temp/experiments/20260928-video-usability-prediction-v1/`.
To reproduce from `motion-pipeline/`:

```sh
.venv/bin/python temp/experiments/20260928-video-usability-prediction-v1/analyze.py > temp/experiments/20260928-video-usability-prediction-v1/run_stdout.json
```

The aggregate [metrics](assets/2026-09-28-video-usability-prediction-baseline/metrics.json)
record the exact estimates, input manifest hash, and analysis settings. The
participant-level predictions remain only in the access-controlled temporary
experiment directory.

## Findings

| Participant-held-out contrast | Positive clips | AUROC (group-resample interval) | Average precision | No-signal AP |
| --- | ---: | ---: | ---: | ---: |
| Marginal or unusable | 16/80 | 0.864 (0.743–0.959) | 0.743 | 0.200 |
| Any concern | 43/80 | 0.913 (0.837–0.968) | 0.914 | 0.538 |

At an illustrative 0.5 cutoff, the first model found 8 of 16 marginal or
unusable clips and gave 1 false alarm; it **missed the other 8**. That cutoff
was not calibrated for the full corpus. Continuous four-level severity had a
held-out Spearman correlation of 0.732 and mean absolute error of 0.524 rating
levels versus 0.786 for a training-mean baseline. Rounding it to four classes
got 50/80 correct but classified **none of the eight unusable participant
clips** as unusable. Exact four-class prediction is not ready.

The signal-enriched last 22 clips contained 8 marginal/unusable ratings,
versus 8 in the 58 earlier participant clips. Study 1 has only two such
clips; Study 2 has fourteen. Sampling used these same three signals, so
sample discrimination and average precision cannot be generalized to the
unselected corpus. The earlier and later annotation UI conditions may also
have differed; the exact earlier build is not established. Two clips have
missing participant IDs and use distinct workflow IDs as groups, leaving a
small residual grouping uncertainty. The results reflect one annotator's
judgments, not inter-rater agreement or coaching validity.

An independent read-only evidence review confirmed the manifest/database
join, participant-held-out processing, AUROC/average-precision calculations,
and cutoff confusion counts; it found no blocking analysis issue.

## Study reference-segment transfer check

All 20 reference segments were scored in a separate, descriptive check. The
same three signal functions and canonical sweep parameters were applied to
each segment. Each source's full raw pose was preprocessed once before slicing
into the manifest's segment bounds. Recomputing the three whole-source values
exactly matched all 12 values in the prior canonical sweep. The fixed logistic
models were fitted on all 80 participant clips and applied to the 20 reference
segments without using any reference rating in training or feature selection.
The run is under
`motion-pipeline/temp/experiments/20260928-video-usability-reference-segments-v1/`;
its aggregate [reference transfer metrics](assets/2026-09-28-video-usability-prediction-baseline/reference-transfer-metrics.json)
preserve the calculations and provenance. To reproduce from `motion-pipeline/`:

```sh
MPLCONFIGDIR=/private/tmp/mplconfig-video-reference XDG_CACHE_HOME=/private/tmp/xdg-cache-video-reference .venv/bin/python temp/experiments/20260928-video-usability-reference-segments-v1/analyze.py > temp/experiments/20260928-video-usability-reference-segments-v1/run_stdout.json
```

For any concern (6/20 reference segments), AUROC was 0.643 and average
precision 0.553 versus a 0.300 constant-score baseline. Only one reference
segment was rated unusable, so its category has no stable performance
estimate. It ranked 18th of 20 on the any-concern score. Its annotation note
describes a cover screen with no person, and none of its 26 frames had a
finite pose x-coordinate. The three current signals treated crop and false
tracking as zero and roughness as missing, so they failed to flag this
absent-person segment. A different segment rated perfect had only 41 of 135
frames with any finite pose x; its note says to ignore an ending cover.
Thus a naive pose-coverage cutoff is not automatically the answer. These are
cover-screen/content and segment-policy cases, not evidence of detector
failure on a visible dancer. Segment boundaries were inferred from cumulative
frontend CSV lengths, which adds uncertainty. An independent read-only review
confirmed the feature provenance, scores, ranks, and annotator notes.

## Decision and next action

The signals provide promising **exploratory participant ranking evidence** but
miss an entire cover-screen segment in the reference transfer check. Do not
set an automatic exclusion threshold or claim four-class or reference-video
prediction from this run. The next technical action is to specify and test a
pose-availability or person-presence signal that respects the difference
between an all-cover segment and a usable segment with a cover at its end.
The subsequent [annotation-note audit](2026-09-28-video-usability-error-audit.md)
found a rating-target ambiguity to resolve before collecting validation labels.
After fixing and freezing candidate features and a decision rule, evaluate on
a prespecified independent sample drawn without selecting on those signals.
Include enough low-usability clips to measure misses and a genuinely random
component for population calibration. Ask Viona for further ratings only after
that sample and its purpose are concretely designed.
