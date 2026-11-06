---
date: 2026-11-06
tags: [hypotheses, human-ratings, metrics, reference-videos, handoff]
artifacts: []
---

# Time spans that matter for human-rated similarity

Viona wants to investigate whether parts of the videos are less important for human-rated similarity than others. In her words: "there are parts of the tiktok reference videos where the person is just waiting for the actual dance moves to start, or are backing up from turning off the camera at the beginning. the same thing occurs at the end sometimes, when the dance is over and they're walking back to turn off the camera. and within the videos, some motions correspond to more easily identifiable 'moves' (which i think the human raters naturally would have focused on when judging similarity) and some seem coincidental."

Stage 1 tests the lead-in and lead-out: Viona marks when the dance moves begin and end in each of the four reference videos, and each metric is recomputed on the first and last segments without the time outside those marks. Stage 2 tests recognizable moves against coincidental motion, using move spans she marks before seeing any stage results. This entry is a plan and tool record; no result exists yet.

## Evidence available

Checked 2026-11-05 against the private `chi25-humanratings-source.csv`
(143,554 bytes, SHA-256 `cc41e904…3971`; counts and column relationships
only, no rows copied into Git):

- 1,293 segment ratings (Study 1: 691, Study 2: 602) from 99 participants.
  Each has up to three rater scores on a 1–3 scale, mapped to a 1–5
  `humanRating`. Scores are concentrated at the top (rater 1: 643 threes,
  482 twos, 168 ones).
- There is no independent whole-video rating in Study 1: the `whole`
  `humanRating` equals the mean of the segment ratings in all 130
  performances. In Study 2 it differs from that mean in 117 of 147
  performances (mean difference about 0, maximum 0.83); its origin is
  unknown and was raised with Viona. Viona chose the within-video framing,
  so this does not block stage 1.
- Study 2 has no segment 1 for Bartender, Mad at Disney and Pajama Party, and
  no segment 5 for Bartender. The reason is not yet recorded.

## Current alignment

The offline metric fixture compares each participant segment with the
matching legacy reference segment clip
(`testResults/tiktoks-pixelposes-segmented/<dance>.clip-N.pose.csv`),
pairing rows by index from frame 0 and truncating to the shorter sequence.
Reference clip `N` starts at `(N - 1) × clip spacing` in the full tutorial
video (`participant-dataset-catalog.ts`: Bartender 4.498 s, Last Christmas
4.352 s, Mad at Disney 4.04 s, Pajama Party 2.682 s). The bundle trims only
Bartender's end for the app (14.9 of 18.867 s); validation does not use
that trim. Any lead-in or walk-off therefore counts fully in the first and
last segments.

## Agreed plan and acceptance criterion

Proposed 2026-11-05 and accepted by Viona on 2026-11-06 ("yes let's do
that").

1. Viona marks the dance start and end in each reference video at
   `/research/reference-spans` (local development only). Marks are stored as
   append-only revisions in the local research SQLite database (table
   `reference_dance_span_revisions`, schema v5) with the reference video's
   SHA-256, annotator and time, and trigger the usual verified snapshot.
2. For each metric, compute the segment score with and without reference
   frames outside the marked span, mapping full-video time to clip time with
   the clip spacing above. Participant frames are excluded at the same
   paired row indices.
3. Compare Spearman correlation with segment `humanRating`, full versus
   trimmed, on the segments that lose frames.
4. Acceptance: a span counts as less important only if excluding it raises
   the rank correlation by at least 0.05 and the 95% interval of the paired
   difference, from a participant-level bootstrap, excludes 0. The ceiling in
   the 1–3 ratings limits sensitivity and must be reported with the result.
5. Stage 2 move spans are marked before stage results are shown, so they
   cannot be tuned to the outcome.

## Handoff

- Implemented on `codex/research-hypotheses-prototype` (PR #414): the
  `rating-relevant-time-spans` hypothesis page and the reference start/end
  marker. Start the server with `RESEARCH_ANNOTATOR` set, an explicit
  `RESEARCH_SQLITE_PATH`, and `MOTION_PIPELINE_REFERENCE_VIDEO_DIR` pointing
  at the staged CHI study reference videos (`chi-studyvideos`).
- Verified 2026-11-06 in a cloud checkout with the four reference videos
  copied read-only from the `dataset:` remote and a disposable database:
  stepping, marking, saving, the superseding history, and the per-segment
  excluded-time table work at desktop and mobile widths. The synthetic mark
  was discarded with the database.
- Blocked on Viona: the eight start/end marks. No agent should infer them.
- Single next action after the marks exist: write the stage 1 analysis
  script over the marked spans and the private ratings (via
  `HUMAN_RATINGS_PATH`), with outputs under
  `temp/experiments/rating-relevant-time-spans/`.
