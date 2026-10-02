---
date: 2026-09-28
tags: [video-usability, annotation-notes, quality-gate, validation-design]
artifacts: [assets/2026-09-28-video-usability-error-audit/metrics.json, assets/2026-09-28-video-usability-tracking-model-freeze/freeze_manifest.json]
---

# What the video-usability notes say about prediction errors

After the first prediction test, Viona asked for the specific next step and
offered to rate roughly 30 more videos. We audited the latest note for each of
the 100 completed video ratings against the held-out participant predictions
and reference transfer scores. The local read-only run is under
`motion-pipeline/temp/experiments/20260928-video-usability-note-audit-v1/`.
From `motion-pipeline/`, reproduce it with:

```sh
.venv/bin/python temp/experiments/20260928-video-usability-note-audit-v1/audit.py > temp/experiments/20260928-video-usability-note-audit-v1/run_stdout.json
```

Only **16 of 100** ratings have notes; the five saved unusable reasons
duplicate their respective notes. The aggregate [audit counts](assets/2026-09-28-video-usability-error-audit/metrics.json)
record coverage and errors. Among the notes, six explicitly mention cropping
or camera proximity, three mention pose absence, five mention leg tracking
problems, and five say the upper body remains usable despite leg problems.
Themes overlap, and no note is not evidence that a failure mode was absent.
At the illustrative, uncalibrated 0.5 cutoff, the participant model missed
eight marginal/unusable clips; only two of those misses have notes. One cites
no pose record and another a seated person not attempting the dance. The
reference transfer miss is an all-cover segment with no person. These are
specific examples of content or pose availability beyond the existing three
crop/roughness/false-tracking signals.

One clip was rated `perfect` because pose tracking looked accurate, while its
note says the crop makes it unsuitable for analysis. Other `perfect` notes
explicitly tolerate an ending cover or a brief leg artifact. Viona clarified
that **the four-point overall rating means accuracy of visible pose tracking**.
She will use the optional text field to indicate when a particular video is
unsuitable for analysis despite accurate tracking. Preserve the existing
rating; it is consistent with this target. Analysis suitability is a separate
question, and optional notes are not systematic labels for that question.
The notes alone cannot quantify which failure mode dominates the unlabeled
corpus. A later analysis gate may need separate checks for dance/person
presence, source framing, and whether relevant motion is visible.

An independent read-only review checked all 16 notes and the prediction-error
join; it found no numerical issue and flagged the target ambiguity as the
main risk before collecting more ratings.

## Follow-up design

Viona offered around 30 more overall ratings. A prepared design uses **24
participant-disjoint random clips** (9 Study 1, 15 Study 2) as a small
independent pilot and **6 separate diagnostic clips** selected before ratings
for absent pose, long missing-pose runs, or severe crop. Keep the six out of
random-sample performance estimates. The selection seed and cohort were frozen
before the new labels. The pose-tracking prediction candidates and evaluation
endpoints were also frozen before seeing any of these labels.
The 24 random clips may have too few low-usability ratings for a meaningful
AUROC; report indeterminate results if so. The proposed estimand is
performance on one randomly chosen clip for a new participant, not the
clip-weighted full corpus. Brief optional notes about whether no-pose time
is a cover/introduction, absent-person content, or failed tracking of an
attempted dance would help interpret errors without frame-by-frame work.
Notes can also flag an accurately tracked but analysis-unsuitable clip.

The rating target is settled and Viona completed the 30 new ratings. The
[follow-up evaluation](2026-09-29-video-usability-followup-evaluation.md)
reports the frozen models on the 24 random ratings and the six diagnostics
separately. Do not treat these labels as analysis-suitability judgments.

The prepared manifest, deterministic selection script, and selection
provenance are under
`motion-pipeline/temp/experiments/20260928-video-usability-followup-130/`.
An independent read-only audit replayed the random and diagnostic selections,
confirmed the original 100 task objects are retained, and verified all 260
linked media files against their hashes. The launcher now points to this batch.
After restarting the server, authenticated `/api/state` for `viona` reported
130 video-only tasks, 100 completed, and 30 unjudged; unauthenticated access
returned HTTP 401. The process listened on the configured private LAN address.

Before opening the new ratings, we froze [the prediction protocol and model
hashes](assets/2026-09-28-video-usability-tracking-model-freeze/freeze_manifest.json)
using only the first 80 participant ratings for fitting; the 20 reference
segments remain an out-of-domain check. The primary test on the 24 new random
clips is the original three-signal model (`M0`) ranking `marginal`/`unusable`
versus `correctable`/`perfect`. A prespecified secondary model (`M1`) adds
raw-pose frame availability; its promising apparent performance on the first
sample is confounded because it also strongly flags a `perfect` reference
segment with an ending cover. It was proposed after inspecting the missed
all-cover reference; performance on those same reference segments is post hoc,
not independent validation. A second endpoint compares any concern versus
`perfect`. The six diagnostic clips stay outside the random validation estimate.
The frozen experiment script and model files remain in
`motion-pipeline/temp/experiments/20260928-video-usability-tracking-model-freeze-v1/`;
no follow-up ratings were used to fit or choose them.
