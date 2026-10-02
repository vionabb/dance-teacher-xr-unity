---
date: 2026-09-29
tags: [video-usability, pose-tracking, prediction, validation, annotation-design]
artifacts: [assets/2026-09-29-video-usability-followup-eval/metrics.json, assets/2026-09-29-video-usability-followup-eval/new_24_evaluation.json]
---

# What the next 30 video ratings tell us

Viona completed the 30 follow-up whole-video ratings and asked whether we can
now guess usability for the rest of the dataset and move to frame annotations,
or should first gather more general or targeted video ground truth. As she
clarified before this batch, the four-point rating judges **accuracy of visible
pose tracking**. The optional note can separately say that a video is
unsuitable for motion analysis despite accurate tracking. It is not a
systematic analysis-suitability label.

The [aggregate evaluation](assets/2026-09-29-video-usability-followup-eval/metrics.json)
uses only the models and endpoints frozen before these ratings. Its reproducible
local script and task-level scores are under
`motion-pipeline/temp/experiments/20260929-video-usability-followup-eval-v1/`.
The 24 randomly selected clips and six signal-selected diagnostics were kept
separate. All 30 have completed latest `viona` revisions; the first of those
revisions postdates the frozen model. An independent read-only review reproduced
the scores and rating joins.

Among the random 24, nine were `perfect`, nine `correctable`, four `marginal`,
and two `unusable`. For the primary contrast (`marginal`/`unusable` versus
`correctable`/`perfect`), the original three-signal model M0 ranked clips with
AUROC **0.750** and average precision **0.683**; the prespecified secondary M1
model, which adds raw-pose availability, reached **0.926** and **0.905**. At an
*illustrative, post hoc* 0.5 cutoff, M0 found 3/6 concerning clips and M1
found 4/6, with no false alerts among 18 lower-concern clips. The bootstrap
intervals are wide, and neither model supplies a validated pass/fail rule.
The any-concern-versus-perfect ranking was stronger (M0 AUROC 0.904; M1 0.956),
but a high ranking score is not a reliable automated exclusion decision.

Five of the 24 random Study 2 clips lack person IDs. Their workflow IDs denote
study conditions shared by many people, so those five cannot be proven distinct
from training participants; both `unusable` ratings occur among them. On the
19 new clips with known user IDs, neither model has an advantage: both reach
primary AUROC **0.875** and average precision **0.778**, with only three
`marginal` and no `unusable` ratings. Two original training clips also lacked
person IDs, leaving a residual identity limitation. This sample was drawn from
groups remaining after earlier signal-guided ratings, so it does not estimate
clip-weighted full-corpus prevalence.

All four diagnostics chosen for low pose availability or long missing-pose
runs were rated `unusable`; M0 missed all four at illustrative 0.5, while M1
flagged all four. These clips were selected on that feature, so they show a
useful failure mode and feature response, not independent performance. The two
high-crop diagnostics were `correctable` and `perfect`: crop alone is not an
accurate tracking-failure label. Notes describe visible-person missing pose,
late localized artifacts, and separate analysis concerns in accurately tracked
clips. No optional note should be silently converted into a different rating.

**Decision:** Generate provisional scores across the remaining corpus for
ranking and targeted human review, but do not assign final automatic ratings,
exclude clips, or advance the whole corpus to frame tasks from these models.
The next video batch should favor known-ID participants, model disagreements,
low-pose or localized-error cases, and a genuinely random audit arm kept
separate from targeted cases. Another broad, signal-blind batch alone would
spend scarce review effort without resolving the demonstrated failure modes.
A small frame-annotation *method pilot* on already human-reviewed
`correctable` clips and `perfect` controls could proceed independently, after
checking their source content and notes; it would not certify a corpus-wide
automatic gate or analysis suitability. Do not activate frame tasks as part of
the present video-only batch.

## Provisional corpus scores and next focused video batch

The frozen models have now scored all **1,756 participant clips** in the source
manifest. The local, access-controlled score table and deterministic selection
are under `motion-pipeline/temp/experiments/20260929-video-usability-corpus-proposal-v1/`.
An independent read-only audit matched every source signal, raw-pose input,
frozen model output, and selected task. The M0 model puts 185 clips above an
illustrative 0.5 severe-score threshold; **185 is a count of provisional model
outputs, not a count of unusable videos**. Raw-pose availability is below half
on 27 clips. The score table does not create annotation labels or exclusions.

After excluding the 130 already rated tasks and known person IDs, 482 unrated
clips from 37 unseen known-ID groups remain eligible for the next sample. The
audited selection uses 24 distinct known-ID groups: **12 score-blind random**
clips (5 Study 1, 7 Study 2) first, then **12 separate diagnostics** (four
random draws from low/high M0 confidence bins, four largest M1–M0 disagreements,
and four closest to M0 score 0.5). The random arm is small and comes from this
residual group pool; it cannot establish full-corpus prevalence. Keep score,
arm, and selection reason out of the annotator-facing task.

The versioned extension now lives under
`motion-pipeline/temp/experiments/20260929-video-usability-targeted-154/`.
It preserves the first 130 task objects and their SQLite history and adds the
24 selected video-only tasks without displaying their arm or scores. A separate
read-only audit checked all 308 media hashes and the manifest/database join.
The LAN server was restarted with this manifest. Authenticated state for `viona`
reported **154 total, 130 completed, 24 unjudged**; unauthenticated state
returned HTTP 401. The next action is for Viona to rate those 24 clips, after
which the 12 random ratings and 12 diagnostics must be analyzed separately.

## Outcome of the 24 new ratings

Viona completed all 24 tasks, preserving the first 130 judgments. The
[frozen-score evaluation](assets/2026-09-29-video-usability-followup-eval/new_24_evaluation.json)
keeps the 12 score-blind random checks separate from the 12 diagnostics. The
random arm had nine `perfect` and three `correctable` ratings, with **no**
`marginal` or `unusable` examples. Severe-case AUROC and average precision are
therefore undefined in that arm; it cannot establish sensitivity. At the
illustrative 0.5 severe-score cutoff, M0 gave two false alerts and M1 one.

The diagnostic arm had four `unusable`, two `marginal`, four `correctable`, and
two `perfect` ratings. M1 flagged five of six concerning clips at 0.5 with no
false alerts; M0 flagged one of six and gave three false alerts. Four of the
diagnostics were selected because M1 scored them much higher than M0, so the
diagnostic ranking is **not** an independent comparison of the models. Viona's
notes in this batch describe tracking errors or missing poses; none supplies
a systematic label for analysis suitability. These results reinforce the
decision to use provisional scores for targeted review rather than automatic
corpus exclusion. Seventeen of the new tasks also have exact human motion
ratings and were added to the separate
[metric-curation analysis](2026-09-29-usability-curation-correlation.md).
