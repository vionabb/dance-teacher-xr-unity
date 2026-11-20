---
date: 2026-11-20
tags: [hypotheses, human-ratings, reference-videos, annotation, hosted-research, handoff]
artifacts: []
---

# Marking key moves in the reference videos

## Request (Viona, 2026-11-20, verbatim)

> yes please build on 414 stage 2. as the ui for that, i want to be able to
> insert and drag timespan tracks (like the error marking ui from the
> participant video annotation tasks) and describe the move in my own words.
> once i record all of them for the reference clips we can brainstorm how to
> make them more quantifiable

This follows her "did the thing" account of what the CHI25 raters judged
(`2026-11-20-rater-perception-did-the-thing.md`, on PR #454's branch) and is
stage 2 of the rating-relevant time spans plan
(`2026-11-06-rating-relevant-time-spans.md`, on PR #414's branch):
recognizable moves versus coincidental motion, marked before any stage result
is shown.

## What was built

Implemented, not evaluated. No move has been marked yet.

- A hosted research page, **Reference key moves** (`/research/key-moves`),
  with one marker per reference dance (Bartender, Last Christmas, Mad at
  Disney, Pajama Party). It works on the tablet and from cloud sessions, unlike
  PR #414's local-only start/end marker.
- The timeline (`SpanTimeline.svelte`) ports the error-marking interaction from
  the participant annotation tool (`annotation_tool/static/app.js`), which is
  plain JavaScript and could not be imported directly: drag on a track to
  insert a span, drag its edges to resize, tap to select. Additions: drag a
  span's middle to shift it, a tap inserts a 1 s span, zoom up to 8×, and
  clip boundaries on the ruler.
- Tracks are free-form rows Viona can add and name (for example "Arms" or
  "Whole body"). Moves in one track cannot overlap, so moves that happen at
  the same time go on separate tracks.
- Each move has a short name and a free-text description in her own words.
  It records whether the video was mirrored on screen when the description was
  written, so "left" and "right" stay interpretable. The page shows no
  ratings, scores or pose data.

## Storage and timing

- Each save appends one immutable revision of the whole set (tracks and moves)
  for one dance to `public.research_reference_key_move_revision` (migration
  `20261120030000_reference_key_moves.sql`). The newest revision per annotator
  and dance is current. History is linear: a stale tab gets a conflict instead
  of overwriting newer work. Every research member can read the revisions,
  including the research-agent viewer account; only editors can append.
- Times are native video frame indices (inclusive), stored with the video's
  frame rate and frame count; seconds are `frame / fps`. They never come from
  the reference pose CSV `timestamp` column, which is mislabeled
  (`2026-11-19-discrepancy-review-scorecard.md`).
- Frame rates were checked with ffprobe on the hosted objects (2026-11-20).
  Observed: Mad at Disney is 29.97 fps (544 frames); the other three are
  30 fps (Bartender 566, Last Christmas 452, Pajama Party 419 frames). The
  hosted catalog records 30 fps for every reference segment, so it is wrong
  for Mad at Disney. The verified values are in
  `svelte-web-frontend/src/lib/research/key-moves.ts`; a reference video with
  a different hash is refused until its timing is added.
- A move's clip is the clip whose start time (`research_reference_segment`)
  precedes the frame's midpoint. To pair a move with reference pose rows for
  clip N, subtract `start_seconds × fps` from the frame; for clips after the
  first this is not a whole number of frames.

## Handoff

- **Blocked on Viona:** paste the migration into the Supabase SQL editor
  (Supabase MCP writes time out), then mark and describe the moves in all four
  reference videos. No agent should infer moves for her.
- **Next action after the marks exist:** brainstorm with Viona how to make the
  moves quantifiable (her request), then run the rating-deduction check
  planned in the "did the thing" entry. Read revisions with
  `.github/research-storage.py table research_reference_key_move_revision`
  (added in PR #454) or the Supabase client as the research-agent user.
- Once PR #454 merges, add a pointer from each dance's section of
  `documentation/reference-clips.md` to its key moves, summarized in Viona's
  words.
