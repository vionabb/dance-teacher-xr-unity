---
date: 2026-09-29
tags: [motion-metrics, pose-tracking, dataset-curation, correlation, validation]
artifacts: [assets/2026-09-29-usability-curation-correlation/canonical_raw_correlations.csv, assets/2026-09-29-usability-curation-correlation/cluster_bootstrap.csv]
---

# Raw-pose metric correlations at different tracking-quality cutoffs

Viona asked how aggressively curating by her overall visible-pose-tracking
ratings changes the association between motion metrics and existing human
motion ratings. She also plans to recompute the same metrics after applying
pose preprocessing. This entry freezes the **current canonical raw-pose
baseline**, not an automatic exclusion rule. The older frontend metric export
was generated from different pose files and was not used for these results.

The first 130 completed video tasks yielded 78 exact participant clips with a
human motion rating. After Viona completed the 24-task extension, 17 more clips
matched, giving **95 clips from 83 known people** (54 Study 1, 41 Study 2).
The remaining rated participant clips lacked a direct human-rating match or a
reliable person ID. All 20 reference segments were rated. The join requires
study, normalized dance name, person, workflow, and clip identity; no whole-
performance metric is assigned a segment's usability label. The 95 task and
rating identities are frozen in the access-controlled local experiment output.

Metrics were recomputed from the current canonical raw `pose2d` and `pose3d`
files for both participant and reference, using the same reference-segment
bounds as the annotation manifest. The isolated runner records code, manifest,
selector, and input hashes and writes under
`motion-pipeline/temp/experiments/20260929-usability-curation-correlation-v1/`.
It trims a spurious blank CSV tail and checks each participant pose count
against the manifest. All 95 clips paired and all 21 analyzed metric columns
are finite. Six clips have fewer pose frames than video frames; those are
actual source-pose gaps, not a join or parser mismatch. The metric called
`temporalAlignmentEvaluationSecs` was omitted because its current timing
calculation does not produce reliable seconds.

| Minimum participant tracking rating | Clips | Qijia 2D r | Viona 2D r | 3D angle r | 3D velocity error r* |
| --- | ---: | ---: | ---: | ---: | ---: |
| All four ratings | 95 | 0.080 | 0.053 | 0.040 | −0.147 |
| Exclude `unusable` | 82 | 0.102 | 0.091 | 0.117 | −0.243 |
| `correctable` or `perfect` | 76 | 0.113 | 0.080 | 0.152 | −0.191 |
| `perfect` only | 46 | 0.116 | 0.078 | 0.130 | −0.214 |

These are Pearson correlations with the direct 1–5 human motion rating, with
higher metric values oriented as better similarity. *The velocity-error metric
was sign-reversed for this table, so its negative values mean worse, rather
than better, correspondence in the expected direction. The
[full aggregate table](assets/2026-09-29-usability-curation-correlation/canonical_raw_correlations.csv)
also reports Spearman correlations, dance-centered correlations, all kinematic
variants, participant counts, and the corresponding cutoffs on both participant
and reference tracking quality.

The largest apparent gain among the three direct pose-similarity metrics is
the 3D angle correlation, from 0.040 on all 95 to 0.152 at
`correctable`/`perfect`. Its paired change has a 500-resample
participant-cluster bootstrap interval of **−0.015 to 0.269**; Qijia's paired
change has **−0.082 to 0.178**. The intervals include no gain. Spearman and
dance-centered comparisons do not establish a consistent cutoff effect.
Requiring a `perfect` reference as well reduces the strictest subset from 46
to 35 and yields correlations of 0.064, −0.009, and −0.002 for Qijia, Viona,
and 3D angle respectively. See the
[bootstrap summaries](assets/2026-09-29-usability-curation-correlation/cluster_bootstrap.csv).

The original 78-clip cohort showed the same weak pattern. The 95 clips remain
a selected overlap of video annotations and historical human motion ratings,
and the new random review arm was sampled from residual known-person groups.
These figures cannot estimate the benefit of a corpus-wide automated gate.
The four-point label measures visible tracking accuracy; optional notes about
analysis suitability are separate and were not converted into ratings.
Technical correlation is also not coaching validity.

**Decision:** Stricter curation alone does not rescue the current raw-pose
metric correlations in this observed sample. Keep all four thresholds as
explicit sensitivity analyses rather than choosing an exclusion threshold by
the largest observed r. Next, recompute on preprocessed poses with the **same
95 clips, reference segments, metric implementations, human ratings, and
cutoffs**, then compare paired changes and pose-retention coverage. Only after
that should metric-signal development or a larger validation cohort be chosen.
