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
