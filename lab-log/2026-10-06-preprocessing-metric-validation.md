---
date: 2026-10-06
tags: [pose-preprocessing, human-annotation, motion-metrics, technical-validation]
artifacts:
  - assets/2026-10-06-preprocessing-metric-validation/aggregate-results.json
  - assets/2026-10-06-preprocessing-metric-validation/quality-aware-95-aggregate.json
  - assets/2026-10-06-preprocessing-metric-validation/heldout-combination-aggregate.json
  - assets/2026-10-06-preprocessing-metric-validation/repair-adjudication-selection.json
  - assets/2026-10-06-preprocessing-metric-validation/repair-adjudication-v2-selection.json
---

# Testing correction signals and measurement-aware similarity

Viona asked us to test automatic usability exclusion, likely-error detection,
small-gap correction, smoothing, and their effects on downstream similarity.
She also asked for a similarity result that says how much evidence supports its
calculation. This is an exploratory technical evaluation, not a settled quality
gate or a claim that the coach can give valid movement feedback.

## Frozen inputs and comparison boundaries

The detailed-error analysis uses the latest completed `viona` revision of each
`frame_usability` task in the 203-task manifest and exact canonical raw 2D
poses. Forty-eight completed clips provide 745 saved position corrections;
eight are outside the current eight-landmark upper-body analysis and two are
on manually unusable frames, leaving 735 target positions. The source SQLite
database reached revision 1744 on October 3. Its two revisions after the
first manual-review release did not change the last completed task's 43 saved
positions or 20 frame labels. All 48 raw CSVs hash-match the frozen release.
The repeatable, private analysis scripts and detailed outputs are under
`motion-pipeline/temp/experiments/20261006-metric-baseline/`; this directory
contains participant-derived rows and stays outside Git.

The correction targets are selected human edits on clips originally judged
correctable, not exhaustive ground truth. An unmarked position means no saved
edit under this review protocol, not verified anatomical correctness.

For whole-video automatic usability, the relevant independent check remains
the [September 29 frozen M0/M1 follow-up](2026-09-29-video-usability-followup-evaluation.md),
not a refit on all 154 selected ratings. On its 24 randomly selected clips,
M0 and M1 ranked six marginal/unusable ratings with AUC 0.750 and 0.926,
respectively, but five clips lacked reliable person IDs. Among 19 known-ID
clips, both models tied at AUC 0.875 with no unusable example. The later 12
random ratings had no marginal/unusable examples, so severe-case sensitivity
could not be estimated. Those models remain review-priority tools, not
automatic exclusion gates.

## Likely-error identification

On 43,456 finite upper-body landmark-frame pairs outside 24 human-unusable
frames, 735 have a saved position correction. Low visibility alone ranked the
marked positions with ROC AUC 0.803 and average precision 0.064. A one-frame
midpoint residual reached AUC 0.884 and average precision 0.161, catching 51%
of saved marks in the top 5% of ranked pairs. A regularized classifier using
visibility, midpoint residual, neighboring motion, and bone-length deviation
reached AUC 0.904 and average precision 0.173 with entire canonical
person/recording groups held out. The corpus-aware grouping has 43 groups;
an initial 46-group calculation was rejected after independent review found
that it put three Study 2 people on both sides of a fold. The corrected
scripts and four output JSON files were independently rerun byte for byte.

The non-identifying counts and metrics are in the [aggregate results](assets/2026-10-06-preprocessing-metric-validation/aggregate-results.json).
These values support review prioritization. The classifier is uncalibrated,
and sparse corrections do not support an automatic error or exclusion cutoff.
Visibility is particularly weak for hips and misses some high-visibility arm
errors; temporal inconsistency is a useful complementary signal.

## Direct correction comparison

An exploratory isolated-jump rule replaced a point with its neighboring
midpoint when its residual exceeded 0.15 torso lengths, the two neighbors
were within 0.3 torso lengths, and both neighbor visibilities exceeded 0.8.
Those thresholds were chosen after inspecting signal rankings, before looking
at correction distances; they were not preregistered or tested on a separate
holdout. It selected 35 of 735 saved correction positions: 29 moved closer to
Viona's correction and six moved farther. Mean target distance on those 35
fell from 0.311 to 0.165 torso lengths. Across all 735 targets, including 700
unchanged positions, the mean fell from 0.327 to 0.320. The rule also selected
161 unmarked positions, moving those by a mean 0.343 torso lengths (95th
percentile 1.012). Those changes need source-video adjudication before use.

Quarter/half/quarter triangular smoothing lowered mean distance on marked
positions from 0.327 to 0.284 torso lengths, but touched nearly all eligible
positions. On 41,849 unmarked frame steps, the mean of the fastest 5% of raw
speeds fell from 0.279 to 0.173 torso lengths per frame (38% attenuation).
That is mechanical peak reduction, not proof of either improvement or harm:
unmarked positions are not a trusted clean-motion target. Smoothing and the
isolated-jump rule remain experimental. Prior C4 interpolation of internal
one- or two-frame missing gaps remains the only provisional repair; it has
synthetic reconstruction evidence but little effect on current whole-clip
metric correlations. No automatic repair or exclusion default changes here.

## Metric contract

The opt-in `qijia2d-quality-v1` evaluator now accepts explicit manual
unusability, landmark visibility and provenance, provisional predicted
usability as a diagnostic, and a caller-supplied calibrated reliability value
with stated source/version. It reports similarity separately from comparison
coverage, visibility evidence, a descriptive calculation-quality value, and
the possible 0–5 completion range for excluded comparisons. Unknown quality
does not become zero quality. No default visibility cutoff or provisional
prediction changes a score. This describes measurement sufficiency, not the
probability that a performance rating is correct. The existing live Qijia
metric and CSV export remain unchanged. See the [architecture contract](../documentation/technical-architecture.md).

## Downstream similarity and coverage

The paired 95-clip comparison uses the same exact raw participant/reference
pose files and human ratings in every arm. The current raw control matched the
new evaluator's no-gate, equal-frame-mean output for all 95 clips. The
September 29 export came from code before the invalid-vector handling change:
23 scores differ from current code even on identical raw files. Historical
Qijia Pearson correlation was 0.0804; the current-code control is 0.0559.
All changes below use the latter control. The source files, selectors,
reference windows, and review manifest are pinned by hash in the ignored
experiment provenance. The [aggregate analysis](assets/2026-10-06-preprocessing-metric-validation/quality-aware-95-aggregate.json)
includes Spearman, dance-centered, and study-specific results.

With an opt-in 0.5 visibility gate on all four vector endpoints and the same
per-frame aggregation as current Qijia, correlation rose from 0.0559 to
0.1099. The 83-person clustered paired difference interval was
[-0.0608, 0.1726], so this does not establish improvement. Study 1 changed
0.0143→0.1511, while Study 2 changed 0.1177→0.0506. Mean valid vector
coverage fell from 0.9684 to 0.7017, and 12/95 clips had under half of the
expected comparisons. The mean possible score range for excluded comparisons,
scaled to 0–1, widened from 0.0316 to 0.2983. Pooling valid vectors over
frames instead of averaging frame means yielded 0.1113, a similar correlation
but a distinct aggregation rule. The gate raised most individual scores; it
did not reliably align them with human ratings.

Frozen manual-unusable masks were available for 30 participant-reviewed and
19 reference-reviewed pairs, eight with both sides reviewed. Applied without
imputing unknown masks, they changed five scores and current-code correlation
from 0.0559 to 0.0561. This does not test comprehensive frame exclusion.
Both studies span human ratings 1–5 with similar rating spread. The 23 clips
affected by Qijia's historical semantics are distributed across studies, so
that change alone does not explain their different metric behavior. A
descriptive coverage split leaves only 35 clips with at least 0.8 coverage
after the visibility gate; it is too small and selected to set a threshold.

## Can the current pose metrics be combined instead?

A final small pilot joined current-code Qijia to the historical Viona2D and
3D-angle exports on the same 95 exact pairs. The latter two implementations
and their shared utilities are unchanged since the frozen export. A fixed
five-fold test held out entire study-plus-person groups (83 groups). Median
imputation, standardization, and ridge fitting happened inside each training
fold; the comparison also included training-fold grand-mean and dance-mean
baselines. The [non-identifying aggregate](assets/2026-10-06-preprocessing-metric-validation/heldout-combination-aggregate.json)
records all arms and the two leave-one-study-out tests. An independent rerun
matched the prediction CSV byte for byte and checked person-disjoint folds.

The constant baseline had mean absolute rating error 0.966 and held-out
R² −0.055. Qijia, Viona2D, and 3D angle alone had errors 0.991, 0.985,
and 0.999; a three-pose ridge combination was worse at 1.030 and R² −0.168.
Adding dance indicators was worse still (1.037). No tested model beat the
constant baseline. Training on one study and testing on the other also gave
no substantive gain over a dance-mean baseline. Pooled out-of-fold rank
correlations are not interpreted: even the fold-constant model has a negative
pooled rank correlation because fold means differ. The fixed small sample and
repeated historical inspection mean this is not an untouched external test of
metric design. The five person-disjoint folds were not also balanced by study
or dance; their target means range 3.456–4.544. This is an exploratory failure
of the existing features, not proof that pose similarity cannot predict
perception.

## Frozen next review sample

A private, deterministic adjudication pool now contains all 161 positions
selected for isolated-jump repair that had no saved human correction, plus 30
random eligible unselected controls. The fixed rule selected 90 unmarked hips
but only nine of its 35 marked correction targets were hips. This asymmetry
could reflect false hip alarms or different human correction priorities;
unmarked positions cannot settle it. The [aggregate selection](assets/2026-10-06-preprocessing-metric-validation/repair-adjudication-selection.json)
records counts, hashes, and sampling probabilities without identities or
coordinates. A first pass samples 24 arm/shoulder flags, 12 hip flags, and
12 controls across 22 recording groups. Its 48 cases are shuffled and blind
to selection arm, midpoint proposal, and rule values. The response choices
include acceptable as-is, incorrect/correctable with optional moved point,
and unjudgeable. An independent replay verified every case and byte-identical
regeneration. The sealed answer key and participant-derived cases remain only
in `motion-pipeline/temp/experiments/20261006-repair-adjudication-v1/`.

The active frame editor can display and scrub these clips but cannot run this
blind protocol without revealing prior marks or mixing new answers into the
active annotation history. A small dedicated review screen and separate
append-only database are needed before collecting these judgments. No active
server, database, or source data was changed. Arm and hip results should be
reported separately and weighted by their recorded selection probabilities
before an overall false-correction estimate.

**Update 2026-11-06.** The v1 private folder above was lost before any
judging, and its scripts were never committed. With Viona's approval, the
rule was re-implemented and committed as rule v2, and a new sealed 48-case
sample was drawn. On the same frozen inputs, rule v2 does not reproduce the
October counts: it flags 42 marked targets (35 move closer) and 179 unmarked
positions, versus 35 (29) and 161 above. The October rule figures therefore
remain unverified. Details are in the [handoff](2026-10-06-preprocessing-metric-validation-handoff.md)
and the [v2 selection aggregate](assets/2026-10-06-preprocessing-metric-validation/repair-adjudication-v2-selection.json).

## Decision and next step

Use the temporal residual and visibility jointly to prioritize review, and
keep the isolated-jump repair and smoothing out of normal preprocessing.
The quality-aware contract is useful for abstaining or requesting a better
recording when evidence coverage is poor, but a blanket visibility gate is not
a demonstrated similarity improvement. Combining the current pose-shape
descriptors has not supplied a short cut either. The shortest credible path is
to retain the current raw score as control, validate localized temporal-error
handling and conservative repair on held-out people, then test a predeclared
metric design on a balanced, person-aware human-rating cohort. The blinded
first-pass cases are prepared; the next implementation step is a separate
review screen and database for their judgments. Source-video review must then
decide whether each selected-but-unmarked position is acceptable,
incorrect/correctable, or unjudgeable. Until then, the rule's false-correction
cost is unknown. The 95 selected clips do not
establish an automatic corpus gate or a generally valid similarity metric.
The dissertation's implemented/planned claims were inspected; these
exploratory results do not warrant changing the thesis chapter yet. The
current action and commands are in the companion
[handoff](2026-10-06-preprocessing-metric-validation-handoff.md).
