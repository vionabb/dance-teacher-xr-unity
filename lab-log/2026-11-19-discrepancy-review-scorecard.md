---
date: 2026-11-19
tags: [research-studio, discrepancy-review, qijia2d, ui]
artifacts: []
---

# Discrepancy review: play button, scorecard and interval what-if

## User intent

After the hosted queue came back (it had been empty because the metric release
rebind from PR #444 had not been run; Viona ran
`scripts/rebindMetricRelease.sql` in the Supabase SQL editor on 2026-11-19):

> on the discrepancy review, i should be able to just play the metrics

> i don't see a play button on the review page. i can only see by moving the
> slider. also, the discrepancy should be more obvious. what was the metric's
> rating? what is the discrepancy? how does changing the start and end and
> other settings affect the metric's score and resulting discrepancy? feel
> free to mock up a few changes to this review page

Three mockups were shared (A: play bar and scorecard, B: interval what-if,
C: queue sorted by discrepancy). Viona: "Please do all three then."

## Decisions

- **Play.** The review card gets a primary Play/Pause button that plays from
  the playhead to the segment end, and plain Space toggles it. Before this,
  the only control was a small "Replay interval" button.
- **Metric score per segment** = mean over valid frames of the inspector's
  existing Qijia2D frame score, 5 × (1 − mean vector error / 2). The row
  pairing and duration cut-off are the inspector's own
  (`src/lib/research/segment-score.ts`). The metric modules are unchanged, so
  the metric release fingerprint does not move.
- **Gap** = metric − human mean on a shared 0–5 axis. The human mean is the
  mean of three 1–3 ratings mapped to 1–5. The scales are not calibrated
  against each other, and the UI says so.
- **Rank gap** = the metric's percentile among all scored segments minus the
  human mean's percentile, in percentile points (mid-rank ties). It is shown
  only once every queue segment has a score. On the review card it is shown
  only when the first curve is the baseline (all 8 vectors, no visibility
  weighting). Agent recommendation: sort by rank gap by default, because it
  does not depend on the two scales lining up. Viona did not choose between
  the two definitions, so both are shown.
- **What-if.** The review card shows the metric score for the whole segment,
  for the selected interval and for the segment without the interval, plus
  the gap for whole and without, and says whether leaving the interval out
  shrinks or widens the gap. It follows the first chart curve, so curve
  settings change it as well.
- **Queue scoring** runs in the browser: batches of 25 sent to
  `/api/{research,dev}/discrepancy/scores`, which reads the same stored pose
  files. Results are cached in localStorage per backend and metric release.
  No schema change and no production write.

## Open questions / next steps

- Whether the thesis should use the raw gap or the rank gap. This is
  Viona's call.
- Viona2D has no 0–5 score, so its review card shows no gap.

## Follow-up (same day, after #450 merged)

Viona hit "Error: 404" on the review panel for Participant 079 · Pajama Party
segment 1, and asked: "also can you make it more like A?"

- **Cause.** That segment has no prior-study human rating, so it is not in the
  review queue. The panel showed the raw 404 and hid the Play button along
  with everything else. It now says the segment has no human rating and points
  to the queue, and Play stays available.
- **Layout like mockup A.** The scorecard (human mean, metric score, gap,
  rank gap, common 1–5 axis) is now a full-width band above the videos. The
  round Play/Pause sits in the timeline dock next to the error curve. The
  side panel keeps segment navigation, interval marking, the what-if table and
  notes. Both inspectors (Qijia2D and Viona2D) get the band and the Play
  button. Viona2D shows no gap because it has no 0–5 score.

## Follow-up 2: reference drift and a simpler skeleton

Viona said: "i'm not convinced the videos are properly sync'd". Her screenshot showed
reference row 47 at 1410 ms, while participant row 47 is at 47/30 = 1.57 s.

- **Finding.** Both videos show the same paired row. The pairing itself drifts.
  Qijia2D and Viona2D pair rows by index (`row-index-truncate-shorter`).
  Participant rows are 1/30 s apart. The reference row timestamps here step
  30 ms (inferred from one screenshot, not read from the CSV). So the paired
  reference falls behind the participant by about 10% of elapsed time: about
  0.16 s at row 47 and about 0.27 s by the end of a 2.7 s segment.
- **Decision (Viona, decision card).** Keep the metric pairing; add a display aid.
  The metric release and scores are unchanged.
- **Change.** The review now has a "Time-aligned reference" toggle. It shows
  the reference row and video nearest the participant's elapsed time. The
  badge names the row that was actually scored, and the reference arrows are
  hidden while the toggle is on. Without the toggle, the reference badge shows
  the drift ("0.16 s behind").
- **Skeleton.** Viona also said the participant overlay was "too busy and
  uninformative" and asked to "bold and redden the segments that contribute to
  more error". In the focus view, the overlay is now the plain skeleton. Each
  scored body segment gets thicker and redder as its error grows. It reaches
  full red at a direction error of about 90°: |Δunit| = √2 for Qijia2D, and
  dissimilarity 0.5 for Viona2D. The vector arrows return under "Inspect
  metric details".
- **Open.** Whether the reference timestamps really step 30 ms in every dance
  needs checking against the reference CSVs.
