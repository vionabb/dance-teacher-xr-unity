---
date: 2026-09-17
tags: [pose-preprocessing, quality-gate, human-annotation, triage, research-direction]
artifacts: []
---

# Video usability triage before detailed error annotation

The annotation workflow should mirror the intended analysis stream. First,
assess the usability of each video as a whole: have the annotator mark a set of
unusable frames and then assign the video one required four-point rating:
`unusable`, `marginal`, `correctable`, or `perfect`.

This first-stage triage is the quality gate. After a quality bar is defined,
only the videos that clear it should continue to detailed annotation. The
follow-up stage will assess bad-segment detection and whether problematic
portions can be corrected or should be ignored/discounted, either at the
frame level or for an individual part of the skeleton.

The UI/server implementation now supports a `video_usability_triage` task type
using the existing append-only annotation database contract. Whole-video
unusable and frame-level unusable flags may coexist so the triage record keeps
the evidence that motivated the rating; individual joint/body-part marks are
disabled when the whole video is unusable. The historical 20260828 batch and
its completed judgments must remain intact. A new full-video triage manifest
should be generated separately before collecting the next round of judgments.

Open decisions are the quality-bar threshold, how `marginal` and `correctable`
map to inclusion versus repair, whether to sample or triage the full corpus,
and how to generate the downstream detailed `error_marking` subset.
