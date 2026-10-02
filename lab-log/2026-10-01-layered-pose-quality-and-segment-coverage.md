---
date: 2026-10-01
tags: [pose-quality, human-annotation, reference-validation, preprocessing, motion-metrics, adaptive-coaching]
artifacts: []
---

# Layer pose-quality handling from reference selection to coaching

Viona's direction after the frame and landmark annotation pass is that pose
errors require several layers of handling, rather than a single filter or
repair step. She particularly noticed that occluding limbs can make the
skeleton unstable, and that many corrections seemed to occur in a few dance
segments where arms cross the body. This is a research direction and design
contract to investigate; the additional pipeline and coaching behavior below
is not yet implemented or validated.

## Direction Viona specified

1. **Reference side:** Hand-validate reference videos. A reference segment
   that cannot be corrected by hand should not be used in the new study.
   Extensive correction is a warning that its movement may also be hard to
   track in participants.
2. **Input quality:** Consider excluding videos with compounding problems such
   as baggy clothing, poor lighting, motion blur, and overly cropped framing.
   Keep source-video quality separate from the tracking-accuracy rating.
3. **Conservative repair:** Try preprocessing for small anomalies, especially
   one- or two-frame errors with high-visibility landmarks on both sides of
   the gap. Compare the existing sliding-window smoothing with curve-fitting
   approaches.
4. **Quality metadata:** Derive meaningful tracking confidence beyond raw
   visibility if possible, at landmark or coarser granularity. Carry it in
   processed pose files, and mark estimates or frames that are known unusable.
   Retain raw observations and repair provenance.
5. **Metric contracts:** Each metric must define how visibility, learned
   confidence, missing data, and unusable frames affect its output. Low
   measurement quality must not silently become a low performance score.
6. **Coaching behavior:** The agent should use metric output streams and their
   reliability to decide when it has insufficient evidence. It may say so,
   offer a choice, request another attempt, or suggest better environment or
   camera positioning rather than issue unsupported movement criticism.

These layers imply separate validation questions: whether a reference is fit
to use; whether a recording is assessable; whether a landmark can be repaired
without changing genuine motion; whether confidence is calibrated to human
errors; whether a metric remains meaningful under partial coverage; and
whether a coaching response is useful and honest. Repair should be evaluated
against held-out human corrections and clean spans, including preservation of
peaks and timing. Confidence needs separate calibration from MediaPipe
visibility, which estimates visibility/occlusion rather than localization
accuracy. Future data contracts should distinguish observed, automatically
repaired, human-corrected, missing, and unusable values, and report effective
coverage with metric scores. Study quality rules should be defined before
testing their effect on outcome correlations, with sensitivity analyses for
reasonable cutoffs.

## Coverage audit at a fixed database snapshot

The read-only SQLite snapshot was taken at revision 1742
(`2026-10-01T14:37:56Z`) under
`motion-pipeline/temp/experiments/20261001-annotation-coverage-audit/`.
The local analysis script there joins the latest saved ratings to the active
203-task manifest and the original 5,329-task source manifest. The snapshot
contains all 154 overall-video ratings (20 reference, 134 participant), with
72 Perfect, 49 Correctable, 14 Marginal, and 19 Unusable. The 49 detailed
frame tasks are precisely the initially Correctable videos; 48 are completed
and one resumed task is Started. Three participant frame reviews have since
recorded an Unusable video override, showing why the later review should take
precedence over the original rating for curation.

All 20 reference segments across the four dances have an overall rating:
14 Perfect, five Correctable, and one Unusable. The Correctable reference
segments are Bartender 2, Last Christmas 1 and 3, Mad At Disney 3, and Pajama
Party 3. Bartender 5 is Unusable. Four of the five Correctable reference
frame tasks are completed; Last Christmas 3 was Started at the snapshot. A
Perfect *overall* rating is not yet an exhaustive hand validation of every
reference landmark. Reference cuts in this manifest come from cumulative
segmented-pose row counts, which are not documented as authoritative study
boundaries.

The 134 rated participant clips cover all 18 participant clip-number segments
represented in the source studies: Bartender 1–4, Last Christmas 1–4, Mad At
Disney 1–5, and Pajama Party 1–5. Each has only 4–12 ratings. The extra
reference-only Bartender 5 and Pajama Party 6 have no participant clip-number
counterpart in the original 1,756-clip participant corpus. Thus the Unusable
Bartender reference segment cannot be compared with participant ratings from
these studies; its role in a new study needs an explicit decision.

Coverage is thin across conditions. Among 114 eligible study × dance × segment
× condition cells, 79 have at least one rating and 35 have none. Of the 79
covered cells, 43 have only one rating; no cell has more than four. The
existing 134 participant ratings are a signal-enriched sample of 1,756 clips,
so neither these fractions nor cell contrasts estimate population prevalence.
Some participant identities are missing and some people contribute multiple
clips. Condition comparisons therefore need a deliberate, balanced sample.

The repeated-segment impression is partly built into the task queue: detailed
frame work was offered only for the 49 Correctable overall ratings. The three
largest dance/segment groups contain 19 of those 49 tasks: Mad At Disney 1
(eight), Last Christmas 3 (six), and Bartender 2 (five). Arm-crossing is
Viona's visual hypothesis; no systematic occlusion/crossing cause tags have
been saved, so the database cannot yet confirm it as the cause. The earlier
[visibility audit](2026-09-30-frame-visibility-audit.md) did find that wrists
and elbows account for most corrected landmarks. In this expanded snapshot,
704 of 770 saved upper-body position corrections are at wrists or elbows;
eight older leg corrections are outside the current annotation scope.

The five Correctable reference clip numbers have 34 rated participant clips:
21/34 (62%) were less than Perfect. The 13 Perfect reference clip numbers
that have participant counterparts have 100 rated clips: 55/100 (55%) were
less than Perfect. This small descriptive difference does not establish that
reference correction burden predicts participant trackability. Particularly,
Mad At Disney 1 has eight Correctable and three Marginal participant ratings
among 12 even though its reference segment was Perfect. Pajama Party 4 has
four Unusable participant ratings among eight despite a Perfect reference.
Conversely, Bartender 2 and Last Christmas 3 merit targeted inspection: six
of eight sampled participant clips in each were less than Perfect, and their
references needed detailed correction. These are candidate failure patterns,
not validated segment effects.

## Next decision

First, resolve the reference set for the new study, especially Bartender 5,
and specify an explicit reference acceptance and correction-burden rule.
Then use a small, identity-aware, balanced video-rating sample to fill the
most informative missing condition cells and replicate the suspicious dance
segments alongside clean controls. Keep that sample separate from the earlier
signal-enriched ratings. Use the completed frame corrections to benchmark
confidence and conservative repair candidates on held-out clips before adding
new pose-file fields or changing metric semantics. The thesis chapter's metric
and coaching descriptions should be revisited only after those contracts and
evaluations are settled; no thesis claim is changed by this entry.
