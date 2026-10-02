---
date: 2026-09-28
tags: [video-usability, human-annotation, sampling, automated-metrics]
artifacts: []
---

# Focused video-usability rating sample

Viona wants to do video-usability ratings for now. About 100 ratings may be
enough to test automated video-usability metrics. Keep the approximately 78
already completed.

## Batch and sampling decision

The completed set contains 78 ratings: 20 segments covering all four CHI study
reference videos, 34 participant clips from CHI25 Study 1, and 24 from Study 2.
The labels so far are 42 `perfect`, 27 `correctable`, 6 `unusable`, and 3
`marginal`.

Created the focused manifest at
`motion-pipeline/temp/experiments/20260928-video-usability-focused-100/` with
100 video-usability tasks only. It preserves the 78 completed task IDs and
uses the source experiment ID and SQLite database, so those revisions remain
the history authority. The annotation launcher now targets this focused
manifest and the original database.

The 22 added clips are from CHI25 Study 2, whose eligible corpus (1,081 clips)
is larger than Study 1's (675) and was underrepresented in the completed set.
The additions cover all 12 combinations of three dominant automatic-signal
families and four severity quartiles, with a second clip in 10 combinations.
Quartile 1 selections favor low-signal controls, quartile 4 selections favor
high-signal challenge cases, and quartile 2/3 selections are near their cell
medians. All four signals only guide sampling; they are not shown as human
labels. The selected 100 clips include all reference segments and have 34
Study 1 plus 46 Study 2 participant clips.

This is a signal-enriched diagnostic sample for exploratory metric testing,
not a representative sample for estimating dataset-wide usability prevalence.
The selection details and chosen task IDs are recorded in the generated
manifest's `participant_selection_provenance` and `selection_provenance.json`.

## Interface correction after Viona's review

Viona reported that the restarted server no longer showed the skeleton overlay
and now displayed a frame usability control that she had not used for her
earlier ratings. The clean clip files do not contain a burned-in pose; they
require the separate `landmarks.json` SVG overlay. The current client code
explicitly suppressed that overlay for video-usability tasks and displayed
frame controls for the shared triage workflow. The focused manifest now marks
all 100 tasks `video_rating_only: true`. The interface uses raw tracked pose
as a read-only overlay, hides the frame rating control and frame-marking
timeline, and allows completion from the overall rating alone. The existing
SQLite revisions and task IDs are unchanged. This corrects the active batch's
interface contract; it does not establish exactly which UI build was open
when the earlier 78 ratings were entered.
At restart, the previous LAN address `10.132.7.81` was no longer assigned to
this computer; the active Wi-Fi address was `192.168.1.21`. The maintained
launcher was updated to bind that private address.
The authenticated live state at `http://192.168.1.21:8765/` showed 100 tasks,
78 completed, 22 unjudged, and `video_rating_only` on every task. The focused
server tests passed (57 tests), and the Chrome interaction test confirmed the
pose overlay, hidden frame controls, and rating-only completion. The required
pipeline smoke gate reached 7 passed and 2 skipped, then failed in 2 audio
tests because this local virtual environment cannot import SciPy's native
`_spropack` library; that is unrelated to the annotation screen change.

## Current status and next step

Viona completed all 100 tasks. A read-only check of the latest `viona`
revisions in the source SQLite database found 100 completed ratings and no
missing ratings: 51 `perfect`, 32 `correctable`, 8 `marginal`, and 9
`unusable`. The 20 reference segments cover four source videos; the 80
participant clips cover 27 Study 1 and 34 Study 2 participants. All 80
participant clips have the three sampled automatic signals in the manifest:
crop violation fraction, windowed roughness, and false-tracking candidate
fraction. Reference segments do not have those per-segment signal values yet.

This was enough for an exploratory prediction test. The completed analysis,
uncertainty, and next validation decision are recorded in the
[first prediction test](2026-09-28-video-usability-prediction-baseline.md).
The sample was enriched using the same signals under test, so apparent
performance is not a population-level estimate. The rare classes (8 marginal,
9 unusable) make four-way prediction especially uncertain.
