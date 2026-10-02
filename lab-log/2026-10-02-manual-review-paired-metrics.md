---
date: 2026-10-02
tags: [manual-review, pose-preprocessing, motion-metrics, technical-validation]
artifacts: [assets/2026-10-02-manual-review-paired-metrics/aggregate_comparison.csv]
---

# First paired use of manually reviewed pose data

Viona authorized importing her review history into a canonical corpus and
trying the corrected poses as an input to existing metrics. The first frozen
release is `20261002-first-manual-review`; its integrity, Drive backup, and
restore are recorded in the [corpus entry](2026-10-01-manual-review-corpus-proposal.md).
This experiment asks how the same motion-similarity metrics change when an
exact raw 2D pose segment is replaced by Viona's reviewed 2D segment. It does
not treat a changed score as evidence that the metric is more valid.

The frozen 95 participant clips and direct human similarity ratings came from
the prior raw/C4 experiment. Exactly 30 have a completed detailed participant
review (27 people), and four completed reference segments appear in 19 pairs;
eight pairs have both sides reviewed. There are 54 with neither side reviewed,
22 participant-only, 11 reference-only, and eight both. Source-pose hashes,
reference segment boundaries, reviewed-file hashes, and all 95 identities
were checked. Reviewed reference windows were inserted into their exact
full-length raw 2D files, preserving unreviewed rows. Every 3D input remained
raw. The new raw/raw control reproduced both prior Qijia 2D and Viona 2D
scores exactly for all 95 clips.

The ignored experiment at
`motion-pipeline/temp/experiments/20261002-manual-review-paired-metrics-v1/`
contains the preparation script, runner, input hashes, four arms, per-clip
deltas, and analysis outputs. `analyze_results.py` reproduces the aggregate
JSON, fixed-seed 5,000-draw person-cluster bootstrap JSON, and per-clip delta
CSV byte for byte; `paired_analysis_provenance.json` pins its script, 11
inputs, and three output hashes. The aggregate numbers are copied to the
[comparison table](assets/2026-10-02-manual-review-paired-metrics/aggregate_comparison.csv).
Manual arms use only clips with completed relevant reviews; all correlations
below compare the same clips and human ratings within an arm.

| 2D input arm | Pairs | Qijia Pearson raw → reviewed | Viona Pearson raw → reviewed |
| --- | ---: | ---: | ---: |
| Reviewed participant / raw reference | 30 | .114 → .123 | .092 → .105 |
| Raw participant / reviewed reference | 19 | .105 → .113 | .064 → .053 |
| Both reviewed | 8 | .032 → .058 | .044 → .042 |

On the 30 participant-reviewed pairs, the mean absolute manual score change
was .00237 for each metric, versus .00019 (Qijia) and .00012 (Viona) for C4
on those same pairs. Between-clip raw score standard deviations were .073
and .066. Person-cluster bootstrap 95% intervals for the Pearson correlation
change were [−.007, +.031] and [−.0001, +.044], respectively. On the 19
reference-reviewed pairs, corresponding intervals were [−.003, +.020] and
[−.043, +.025]. These are exploratory intervals on selected, small samples;
none establishes a correlation improvement. The eight fully reviewed pairs
are too few for a meaningful correlation claim. Study-specific results and
Spearman values are in the ignored `paired_analysis.json`.

Three detailed reviews override their parent `correctable` video rating to
`unusable`, including two in the frozen 95. Effective frozen cutoff sizes are
95 all / 80 excluding unusable / 74 correctable-or-perfect / 46 perfect,
compared with 95/82/76/46 using the earlier parent video ratings. The
experiment records both ratings and uses the completed frame-stage override
as effective. The historical C4 correlation report used parent ratings; its
cutoff tables should not be compared as though they used the effective rule.

**Interpretation:** manual corrections produce measurable but generally
small changes in these whole-clip 2D similarity scores. The reviewed set was
selected for correctable tracking problems and is not representative of all
95 clips. Sparse human corrections are also not full independent ground
truth for unmarked landmarks. This comparison did not exclude human-unusable
or automatically missing-pose frames inside the existing metrics; those
contracts remain to be defined. These results motivate direct evaluation of
per-landmark error signals against the correction marks, and a separate metric
sensitivity analysis on the corrected time spans. A whole-clip human-rating
correlation cannot by itself determine whether a correction was accurate or
whether the metric responded appropriately. No metric defaults, preprocessing
defaults, project-state claims, or thesis claims changed.

Next: evaluate landmark-level anomaly/confidence signals on the frozen raw
streams, holding manual corrections and frame unusability labels out as
targets; then inspect how candidate metrics respond within the marked error
spans. Keep splits grouped by recording/person and leave ambiguous or
unusable regions distinct from corrected coordinates.
