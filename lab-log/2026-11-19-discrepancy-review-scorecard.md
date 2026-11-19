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

## Follow-up 2: reference video sync and a simpler skeleton

Viona said: "i'm not convinced the videos are properly sync'd". Her screenshot showed
reference row 47 badged 1410 ms, while participant row 47 is at 47/30 = 1.57 s.

- **First reading (wrong).** At first, judging only from the screenshot, I
  blamed the metric's row-index pairing for drifting. Viona picked "keep the
  metric, add a time-aligned view" on that basis. The first push of PR #452
  added a toggle built on that reading.
- **Checked against the real files.** Later the same day, cloud agents could
  read the bucket (PR #453). I read all 20 reference pose CSVs. In every file,
  the `timestamp` column steps exactly 30 ms per row (29.97 ms for
  mad-at-disney). The row counts, however, match one row per video frame at
  30 fps:
  - pajama-party clips are 80–81 rows over clip spacings of 2.682 s;
  - bartender clips are 135 rows over 4.498 s;
  - pajama-party's 419 rows / 30 = 13.97 s, against a 14.00 s timeline.
  The rows really are 1/30 s apart, so the `timestamp` column is mislabeled.
- **Consequence.** Row-index pairing is correct: both sides are 30 fps, and
  the metric and scores are unaffected. The review page, however, seeked the
  reference *video* by the mislabeled timestamp. That put the reference video
  10% behind its own pose overlay and behind the participant: about 0.16 s at
  row 47 and about 0.27 s by 2.7 s. That is the desync Viona saw.
- **Fix.** Seek the reference video to `clipStart + csvFrame / 30`, and show
  that time on the reference badge. The time-aligned toggle and the drift
  badge were removed, because the drift they described came from the
  mislabeled column.
- **Skeleton.** Viona also said the participant overlay was "too busy and
  uninformative" and asked to "bold and redden the segments that contribute to
  more error". In the focus view, the overlay is now the plain skeleton. Each
  scored body segment gets thicker and redder as its error grows. It reaches
  full red at a direction error of about 90°: |Δunit| = √2 for Qijia2D, and
  dissimilarity 0.5 for Viona2D. The vector arrows return under "Inspect
  metric details".
- **Open.** The reference CSV `timestamp` column should be regenerated or
  documented as mislabeled. Nothing else in the frontend reads it.
