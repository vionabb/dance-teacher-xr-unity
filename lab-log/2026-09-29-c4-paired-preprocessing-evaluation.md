---
date: 2026-09-29
tags: [pose-preprocessing, motion-metrics, validation, dataset-curation, human-annotation]
artifacts: [assets/2026-09-29-c4-paired-preprocessing/correlations.csv, assets/2026-09-29-c4-paired-preprocessing/paired_bootstrap.csv, assets/2026-09-29-c4-paired-preprocessing/crossed_arms.csv, assets/2026-09-29-c4-paired-preprocessing/synthetic_gap_summary.csv]
---

# Paired C4 gap repair and motion-metric evaluation

Viona asked to recompute the current metrics with preprocessing and compare
them against canonical raw poses. This paired experiment held fixed the 95
participant segments with direct human motion-similarity ratings, their study
reference segments, metric implementations, and participant tracking-quality
cutoffs. It used the completed 154-video annotation batch. The four arms were
raw/raw, C4/raw, raw/C4, and C4/C4, with participant pose named first. All
underlying experiment outputs and rerun instructions remain in the ignored
`motion-pipeline/temp/experiments/20260929-c4-paired-metrics-v1/` and
`motion-pipeline/temp/experiments/20260929-c4-paired-analysis-v1/` directories.

C4 here filled internal one- or two-frame landmark gaps with the shared
preprocessor's interpolation stage. It did not smooth, remove outliers, mask
landmarks, or extend pose files missing whole tail frames. The stage was
applied before torso normalization so the metrics still received the same
raw pixel/world coordinate representation. An independent audit found 3,102
interpolated landmark-frame events across 24 of 198 pose files, with existing
finite values untouched. Only 17 of the 95 compared metric windows contained
a repair. The raw/raw arm reproduced the preceding baseline exactly; all
four arms retained the same 95 clip identities and finite analyzed metrics.

| Participant tracking cutoff | Clips | Qijia 2D raw → C4 | Viona 2D raw → C4 | 3D angle raw → C4 |
| --- | ---: | ---: | ---: | ---: |
| All | 95 | .080 → .086 | .053 → .055 | .040 → .045 |
| Exclude unusable | 82 | .102 → .121 | .091 → .098 | .117 → .122 |
| Correctable or perfect | 76 | .113 → .118 | .080 → .079 | .152 → .154 |
| Perfect | 46 | .116 → .120 | .078 → .079 | .130 → .134 |

These pooled Pearson correlations and the full metric/cutoff results are in
the [aggregate correlation table](assets/2026-09-29-c4-paired-preprocessing/correlations.csv).
At the `correctable`/`perfect` cutoff, the C4-minus-raw changes were +.0042,
−.0009, and +.0023 respectively. Person-cluster paired bootstrap 95% intervals
were [−.0006, +.0103], [−.0042, +.0022], and [−.0019, +.0084]. The
[bootstrap table](assets/2026-09-29-c4-paired-preprocessing/paired_bootstrap.csv)
also gives the other cutoffs. One exploratory exclude-unusable Qijia interval
was positive, but the neighboring cutoffs and other metrics did not show a
consistent effect. The [crossed-arm results](assets/2026-09-29-c4-paired-preprocessing/crossed_arms.csv)
attribute small Qijia changes to both participant and reference repairs.

Study differences are larger than this C4 effect in the selected 76-clip
subset: Study 1's raw Qijia, Viona, and 3D angle correlations are −.017,
−.045, and −.050 (46 clips); Study 2's are .346, .304, and .407 (30 clips).
That split needs investigation before inferring what any metric measures.
The temporal-alignment metric was omitted because its current units are
unreliable. Tracking usability and motion similarity are distinct judgments;
videos with unusable tracking can still have high human similarity ratings.

To check the interpolation itself, the experiment masked one or two observed
high-confidence frames in each of 90 eligible clips per pose modality, then
reconstructed them. The [aggregate holdout table](assets/2026-09-29-c4-paired-preprocessing/synthetic_gap_summary.csv)
reports median C4 error of .0145/.0186 torso lengths for 2D one-/two-frame
gaps, and .0349/.0380 for 3D. Torso scale used unmasked flanking frames only.
These sampled gaps favor shoulder and hip landmarks, so this is a plausibility
check, not an accuracy estimate for naturally missing frames.

**Decision:** C4 is a conservative short-gap repair, but it does not
meaningfully improve the observed motion-metric correlation and does not
justify an automatic corpus exclusion threshold. Preserve the paired variants
and investigate study-specific metric behavior. Viona requested three-level
manual frame usability labels for videos she rated `correctable`; a separate
49-video follow-up queue includes all five such reference segments. Following
her [workflow correction](2026-09-29-frame-usability-workflow.md), only frame
errors need manual labels; automatic missing-pose marks retain separate
provenance from both manual overrides and whole-video ratings.
