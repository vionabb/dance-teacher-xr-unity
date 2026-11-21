# Reference videos and clips: what we know

A running knowledge base of facts about each CHI25 reference dance and its clips:
how clips are cut, what data exists, how the metrics behave on each clip, and
open questions. Add to it whenever an analysis or review tells us something about
a specific clip.

Rules for this page:

- Give every fact a source (a lab-log entry, a file, or "Viona, date") and say
  whether it was **observed**, meaning checked against data, or **inferred**,
  meaning a hypothesis.
- Only aggregate numbers go here. No participant ids, frames or video stills
  (see [dataset.md](dataset.md)).
- Viona's own observations go under "Viona's notes" in her words. Agents never
  fill that section in for her.

## Shared facts (all dances)

- **How clips are cut.** Clip *N* of a reference starts at (*N* − 1) × the
  dance's clip spacing in the full tutorial video
  (`svelte-web-frontend/src/lib/server/participant-dataset-catalog.ts`). The
  last clip is shorter because it runs to the end of the video. Observed.
- **Mirroring.** All 20 reference segments are stored with `mirrored: true` and
  30 fps (`research_reference_segment`, source version
  `chi25-analysis-20261028-v1`). Observed. Only 18% of rated segments score
  higher when the participant's pose is mirrored, so participants mostly did
  not mirror the reference left/right
  ([2026-11-20](../lab-log/2026-11-20-metric-rater-gap-drivers.md)). Observed.
- **Timestamps.** The `timestamp` column of the reference pose CSVs steps
  30 ms per row, but rows are one per 30 fps frame. Pair and seek by row index
  ([2026-11-19](../lab-log/2026-11-19-discrepancy-review-scorecard.md)).
  Observed.
- **Lead-in and lead-out.** Viona (2026-11-05): "there are parts of the tiktok
  reference videos where the person is just waiting for the actual dance moves
  to start, or are backing up from turning off the camera at the beginning. the
  same thing occurs at the end sometimes". The plan is to mark the dance start
  and end in each video, using the marker in open PR #414 and the slider in
  PR #447. No marks exist yet (`lab-log/2026-11-06-rating-relevant-time-spans.md`
  on PR #414's branch).
- **Legs.** The legs are mostly out of frame in the participant recordings:
  median leg visibility is 0.05 across rated segments. Lower-body similarity
  cannot be checked from these poses
  ([2026-11-20](../lab-log/2026-11-20-metric-rater-gap-drivers.md)). Observed.
- **Human-rating ceiling.** 39% of the rated segments in the review queue got
  3/3 from all three raters (mapped to 5). Observed.
- **What raters judged.** Viona (2026-11-20): a 3/3 meant the participant "did
  the thing", visibly performing the key semantic moves at about the right
  time, judged as "good for a novice having tried to learn a tiktok dance for
  12 minutes". Raters did not compare joint angles or exact timing. This is a
  hypothesis, recorded in
  [2026-11-20](../lab-log/2026-11-20-rater-perception-did-the-thing.md). Once
  per-clip move lists exist, they belong in each dance's section below.

### Metric agreement per clip (Qijia2D, 2026-11-21)

Spearman ρ between the Qijia2D segment score and the human rating, computed
inside each clip, over all 1,397 rated segments after the rating re-join and
the Study 2 segment-1 supplement. Pairwise is the share of same-clip pairs with
different ratings that the metric orders the same way (ties count half). The
mean rank gap is the metric's percentile minus the raters' percentile, pooled
over all 1,397 segments; negative means the metric ranks the clip's
performances lower than the raters do. Source:
[2026-11-21](../lab-log/2026-11-21-within-clip-all-segments.md), which
supersedes the 743-segment table of
[2026-11-20](../lab-log/2026-11-20-metric-rater-gap-drivers.md). Observed.

| Study · dance · clip | n | ρ within clip | Pairwise | Mean rank gap | Mean metric | Mean human |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 · last-christmas · 1 | 51 | 0.38 | 0.66 | +26.9 | 4.27 | 3.85 |
| S1 · last-christmas · 2 | 50 | 0.54 | 0.74 | +24.3 | 4.28 | 3.87 |
| S1 · last-christmas · 3 | 49 | 0.63 | 0.78 | −2.9 | 4.05 | 3.87 |
| S1 · last-christmas · 4 | 49 | 0.54 | 0.76 | +27.8 | 4.40 | 4.07 |
| S1 · mad-at-disney · 1 | 47 | 0.58 | 0.76 | +2.6 | 4.12 | 4.05 |
| S1 · mad-at-disney · 2 | 47 | 0.48 | 0.72 | −3.1 | 4.08 | 4.12 |
| S1 · mad-at-disney · 3 | 47 | 0.60 | 0.80 | +2.2 | 4.14 | 4.12 |
| S1 · mad-at-disney · 4 | 47 | 0.58 | 0.76 | +6.5 | 4.14 | 3.94 |
| S1 · mad-at-disney · 5 | 47 | 0.36 | 0.65 | +12.5 | 4.13 | 3.68 |
| S1 · pajama-party · 1 | 48 | **−0.23** | 0.39 | −15.6 | 3.99 | 3.76 |
| S1 · pajama-party · 2 | 47 | 0.73 | 0.81 | +14.8 | 4.19 | 3.84 |
| S1 · pajama-party · 3 | 48 | 0.73 | 0.85 | −27.9 | 3.86 | 4.03 |
| S1 · pajama-party · 4 | 49 | 0.42 | 0.68 | −3.8 | 3.99 | 3.84 |
| S1 · pajama-party · 5 | 49 | 0.64 | 0.79 | −5.2 | 4.05 | 3.91 |
| S2 · bartender · 1 | 39 | 0.62 | 0.77 | −0.4 | 4.06 | 3.80 |
| S2 · bartender · 2 | 39 | 0.50 | 0.71 | −7.9 | 4.01 | 3.92 |
| S2 · bartender · 3 | 39 | 0.48 | 0.71 | −7.0 | 4.05 | 4.01 |
| S2 · bartender · 4 | 39 | **0.11** | 0.54 | −23.6 | 3.77 | 3.72 |
| S2 · last-christmas · 1 | 41 | 0.53 | 0.73 | +14.5 | 4.20 | 3.96 |
| S2 · last-christmas · 2 | 41 | 0.57 | 0.75 | +13.5 | 4.17 | 3.86 |
| S2 · last-christmas · 3 | 40 | 0.67 | 0.77 | −9.2 | 3.86 | 3.42 |
| S2 · last-christmas · 4 | 39 | 0.82 | 0.88 | +18.7 | 4.21 | 3.62 |
| S2 · mad-at-disney · 1 | 40 | 0.48 | 0.72 | −4.3 | 4.09 | 4.18 |
| S2 · mad-at-disney · 2 | 40 | 0.59 | 0.78 | −21.1 | 3.87 | 4.07 |
| S2 · mad-at-disney · 3 | 40 | 0.53 | 0.74 | +0.2 | 4.08 | 3.98 |
| S2 · mad-at-disney · 4 | 40 | 0.59 | 0.77 | +4.3 | 4.09 | 3.77 |
| S2 · mad-at-disney · 5 | 40 | 0.36 | 0.65 | +5.3 | 4.09 | 3.72 |
| S2 · pajama-party · 1 | 41 | **−0.21** | 0.41 | +8.0 | 4.04 | 3.41 |
| S2 · pajama-party · 2 | 41 | 0.37 | 0.66 | +4.3 | 4.03 | 3.72 |
| S2 · pajama-party · 3 | 41 | 0.70 | 0.79 | −29.0 | 3.63 | 3.59 |
| S2 · pajama-party · 4 | 41 | 0.51 | 0.73 | −19.9 | 3.67 | 3.52 |
| S2 · pajama-party · 5 | 41 | 0.64 | 0.79 | −20.1 | 3.79 | 3.50 |

With about 40–50 performances per clip, a single clip's ρ is noisy: its 95%
interval is roughly ±0.25. Treat one clip's number as a pointer for review, not
a result.

### Study 2 ratings missing from the queue

Observed 2026-11-20 in the hosted tables:

- Study 2 has 438 eligible segment ratings for bartender, last-christmas and
  mad-at-disney, plus 12 for pajama-party (450 in total), that are linked to no
  recording.
- Every one of those participants has exactly one recording of that dance, and
  its clip number matches the rating. Only the condition label differs between
  the ratings file and the recording. Sometimes the ratings file says
  `unknown`; other times the labels look permuted, for example a rating
  labeled `control` for an `emoji` recording.
- The import joins ratings to recordings on study, dance, participant, clip
  and condition (`scripts/importChi25Analysis.mjs`), so all of these drop out.
- The mismatch is a systematic rotation (observed 2026-11-20, per participant).
  The ratings file's condition for bartender equals the recording condition of
  that participant's mad-at-disney (36/36). For last-christmas it equals their
  bartender (36/36), and for mad-at-disney their last-christmas (37/37).
  Pajama-party agrees (38/38). Another 3–5 participants per dance are labeled
  `unknown`.
- Resolution (2026-11-20): every Study 2 recording's workflow id matches its
  stored condition in Viona's workflow table
  ([chi25-study-design.md](chi25-study-design.md)), so the ratings file is the
  rotated source.
- Re-joined (2026-11-20, at Viona's request): `relinkChi25Ratings.mjs --apply`
  linked 493 recordings (84 Study 1, 409 Study 2) on study, dance, participant
  and clip, giving 1,236 rated segments. On 2026-11-21 a three-rater Study 2
  segment-1 source from the collaborator sheets added and linked 161 more
  (all four dances), giving 1,397. Observed. The per-clip table above predates
  the re-join and covers the original 743 segments only.

## bartender

- Video `bartender.mp4`. Clip spacing 4.498 s; 5 clips. Clip 5 has a 12 KB pose
  file (the others are about 680 KB), so it holds only a few frames. Observed.
- Used in Study 2 only. The original ratings cover clips 2–4; clip 1 was
  added from the collaborator sheets on 2026-11-21. There is no rating for
  clip 5. Observed (`lab-log/2026-11-06-rating-relevant-time-spans.md`).
- The app bundle trims the end at 14.9 of 18.867 s, but validation does not
  use that trim. Observed (same entry).
- In the review queue since the 2026-11-20 re-join (clips 2–4) and the
  2026-11-21 supplement (clip 1). Observed.
- **Clip 4 has weak agreement, ρ = 0.11 (n = 39),** and the metric is much
  harsher than the raters there (mean rank gap −23.6). Observed 2026-11-21. Not
  yet reviewed; a candidate for the discrepancy queue.
- Viona's notes: _(none yet)_

## last-christmas

- Video `last-christmas-tutorial.mp4`. Clip spacing 4.352 s; 4 clips of
  131/131/130/60 pose rows. Observed.
- Study 1: 175 rated segments in the queue before the re-join, plus 24 after
  it. Study 2: clips 2–4 joined the queue on 2026-11-20; clip 1 joined on
  2026-11-21 with all three raters. Observed.
- Clip 1 has the weakest agreement for this dance in Study 1 (ρ = 0.38). Clips 1, 2 and 4
  have large positive mean rank gaps: the metric is kinder than the raters on
  this dance in general. Observed. Inferred: this is a clip-level offset, not a
  per-performance problem.
- Viona's notes: _(none yet)_

## mad-at-disney

- Video `mad-at-disney-tutorial.mp4`. Clip spacing 4.04 s; 5 clips of
  122/121/121/121/59 pose rows. The timestamp step is 29.97 ms instead of
  30 ms. Observed.
- Study 1: 200 rated segments in the queue before the re-join, plus 35 after
  it. Study 2 clips 2–5 joined the queue on 2026-11-20 and clip 1
  on 2026-11-21.
  Observed.
- This is a consistent dance: clips 1–4 have ρ between 0.48 and 0.60 in both
  studies. Clip 5, the short last clip, is lower in both (0.36 and 0.36), and
  the metric is kinder there (+12.5 and +5.3). Observed 2026-11-21. Inferred:
  it may contain lead-out.
- Viona's notes: _(none yet)_

## pajama-party

- Video `pajamaparty-tutorial.mp4`. Clip spacing 2.682 s, the shortest of the
  four dances. There are 6 reference clips of 81/80/81/80/81 rows plus a short
  clip 6; clips 1–5 are rated. Observed.
- Study 1: 216 rated segments in the queue before the re-join, plus 25 after
  it. Study 2: 152 (clips 2–5) before, plus 12 from the re-join and 41 for
  clip 1 from the 2026-11-21 supplement. Observed.
- **Clip 1 has negative agreement in both studies:** ρ = −0.23 in Study 1
  (n = 48) and −0.21 in Study 2 (n = 41), with different participants. These
  are the only negative clips. Observed 2026-11-21. Inferred, not checked:
  the replication points at the clip itself and fits Viona's lead-in
  hypothesis. It is the first clip to review in the discrepancy queue.
- Clip 3 has a large negative rank gap in both studies (−27.9 and −29.0): the
  metric is harsher than the raters there, yet agreement within the clip is
  high (0.73 and 0.70). Observed. Inferred: a hard move for the metric that the
  raters forgive, consistently across people.
- Viona's notes: _(none yet)_
