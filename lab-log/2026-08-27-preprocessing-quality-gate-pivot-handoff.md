---
date: 2026-09-03
tags: [pose-preprocessing, validation, participant-data, motion-pipeline, human-annotation, handoff]
artifacts: []
---

# Handoff: corpus-wide quality triage + defect localization

**This file is a living document, not a dated narrative entry.** Maintain it in place across sessions — rewrite the status/next-action sections as work progresses rather than appending a history of them, and prune narrative once its outcome is captured below or in git history. It is the child/companion plan for [2026-08-27-preprocessing-quality-gate-pivot.md](2026-08-27-preprocessing-quality-gate-pivot.md); read that entry first for the "why." **If another session is active on this same branch/worktree, treat this doc as shared state**: check `git log`/recent commits before rewriting, and reconcile rather than clobber a section another session just changed.

## Status (as of 2026-09-03)

- **Phase 1 (pose extraction): complete.** 1,808/1,808 clips (52 reference + 675 study1 + 1,081 study2), canonical `pose2d`+`pose3d` via GPU, zero errors.
- **`quality_triage`: 60/60 complete**, under annotator `viona`. (An annotator-identity split — a typo login `vioina` holding the real 60/60 progress, separate from the correctly-spelled `viona` — was found 2026-09-01 and resolved 2026-09-02 by merging `vioina`'s completed judgments into `viona`; see commit `6038205` if the mechanics are ever needed again.)
- **`error_marking`: 1/17 pilot tasks touched.** `error-marking-009` is in progress (autosaving) under `viona`; the other 16 not started.
- **`video_quality_rating`: 0/20 pilot tasks done.**
- The `error_marking` screen went through a full timeline-driven UI redesign (2026-09-01 through 2026-09-03, many commits — see `git log` on this branch for the blow-by-blow). Current interaction model: one row per body part; create a mark by click-dragging a row, clicking a per-row **+** button at the current playhead frame, or dragging a mark's edge; click a mark to set cause(s)+note in a popup; segments colored by cause with a legend; horizontal scroll for long clips; inline body-part list editing; a playhead line; a frame scrubber (thin line + dot) with `‹`/`›` (±1 frame) and `‹⁵`/`⁵›` (±5 frame) step buttons.
- **Two Claude Code sessions are concurrently active on this branch (2026-09-03).** This session fixed a Safari bug (daisyUI's oklch-based button colors weren't rendering there — gave `.timeline-add-btn` explicit hex colors) and switched the timeline's row-label/track alignment to CSS `grid-rows-subgrid`. A second session is building a larger feature on the same screen: an interactive skeleton overlay for click/drag mark creation, auto-extending adjacent marks, drag-to-correct landmark position, and switching the body-part list to per-landmark. **Coordinate via SendMessage before editing `app.js`/`index.html`/`style.css` here** rather than assuming exclusive ownership.
- Corpus-wide **frame-quality map** (one pixel row per clip, one column per frame, colored white/yellow/red by defect severity) now supports `--corpora reference chi25_study1 chi25_study2` (added 2026-09-03) to include the reference corpus. Latest run: `temp/experiments/20260903-142352-frame-quality-map/` (not committed — `temp/` is gitignored, re-run to reproduce). Reference clips land in an "Other / unparsed" group since their filenames don't match the participant `userstudyN-<dance>-<condition>` pattern the dance-grouper expects.
- **Known gap**: zero automated test coverage for the `error_marking` screen's interaction logic (drag state machines, event delegation, client-side migrations) despite substantial and growing client-side complexity — all verification so far has been manual live-browser testing. Worth paying down given the larger feature landing on top of it now.

## Next actions

1. Pick up `error-marking-009` (in progress under `viona`) and continue through the 17-task `error_marking` pilot batch.
2. Rate the 20-video `video_quality_rating` pilot (Claude's own ratings for the same 20 are already recorded under annotator `claude`, for an agreement comparison once Viona's are in).
3. Spot-check the one clip with `finite_coordinate_fraction == 0` (fully undetected throughout, from the automatic-signals sweep) — genuinely bad clip, or a pipeline issue?
4. Decide whether to send the drafted MediaPipe GPU-memory-leak bug report (`/feedback`).
5. Once real `error_marking` ground truth exists: revisit whether occlusion errors are detectable from pose data (one naive proxy already failed — see "Decisions" below) against real per-frame labels instead of eyeballing one clip.
6. Add automated test coverage for the error-marking screen (see "Known gap" above) — increasingly overdue as more interaction logic lands.

## How to resume

**Server**: check first (`lsof -iTCP:8765 -sTCP:LISTEN`) before starting a new one — as of 2026-09-03 it's running locally on port 8765, pointed at `temp/experiments/20260828-quality-triage-batch-v1` / `data/human-annotations/quality-triage/annotations.sqlite3`. Restart with:
```
cd motion-pipeline && uv run python -m motion_extraction.annotation_tool.server \
  --experiment-root temp/experiments/20260828-quality-triage-batch-v1 \
  --database data/human-annotations/quality-triage/annotations.sqlite3 --port 8765
```

**Worktree data gotcha**: `data/reference_motions/{videos,pose-raw}` and `data/participant_motions` are gitignored and not shared between a worktree and the primary checkout. This worktree already has them symlinked back to the primary checkout — if a fresh worktree needs them, symlink rather than re-staging ~4.5GB. Never `git add -A`/`git add .` here: git doesn't treat a symlink-to-a-directory as ignored, so a broad add would stage a machine-local absolute path.

**Regenerate a fresh/larger triage batch**: `uv run python -m motion_extraction.annotation_tool.generate_quality_triage_tasks --signals-csv temp/experiments/20260828-quality-signals-canonical-sweep/automatic_quality_signals.csv --output-root temp/experiments/<new-name> --per-signal-count N --control-count N`. Append more `error_marking`/`video_quality_rating` tasks to the existing manifest with `append_error_marking_tasks.py` / `append_video_quality_rating_tasks.py`.

## `error_marking` / `video_quality_rating` schema

`error_marking_response_json` = `{"marks": [{"body_part": str, "start_frame": int, "end_frame": int, "causes": [str], "note": str}], "no_errors_found": bool, "note": str}` — validated in `server.py`'s `_validate_error_marking_response`. `body_part`/`causes` are open vocabularies (any string ≤64 chars), not closed enums, per Viona's request — editable in the UI, persisted in `localStorage` per-device (seeded defaults in both `server.py`'s `DEFAULT_ERROR_BODY_PARTS`/`DEFAULT_ERROR_CAUSES` and `app.js`'s `FALLBACK_ERROR_LISTS` — keep in sync by hand). Frame indices are local to the rendered `clip.mp4` (frame 0 = first frame of that window), not the original source video.

`quality_rating_response_json` = `{"lighting": str, "clothing": str, "note": str}`, both required on completion.

## Decisions already made (do not re-litigate without asking Viona)

- **Sampling**: automatic-flagged candidates plus random unflagged controls, so labels can validate both precision and recall of any detector.
- **Overlay always on**: every review item shows the skeleton overlay burned in, never raw video/frame alone — video quality and pose quality are independent judgments Viona wants visible together.
- **Cropping** is detected from hip/shoulder landmark position relative to frame bounds (Viona's own suggestion). **Hip out-of-frame is normal waist-up webcam framing** (18% of all frames corpus-wide) and is not treated as a defect on its own — any framing signal should weight/gate on the 6 arm/shoulder landmarks, not hips. Landmark `_vis` is not uniformly trustworthy as an out-of-frame proxy: wrist `_vis` is reasonably trustworthy (~5.5–8.7% false-confident); hip/shoulder `_vis` are not (~50–52%/~95–98%).
- **Occlusion-error detection from pose data alone is an open problem**, not solved or disproven — one naive wrist/shoulder-midline-crossing proxy failed (didn't discriminate on `quality-triage-033`). Don't build another automatic occlusion detector without validating against real per-frame `error_marking` labels first.
- The originally-planned Stage 2 (`defect_localization`, single warm-started span+cause) is **superseded by `error_marking`** (typed, multi-span, extensible vocabulary) — don't build `append_defect_localization_tasks.py` as originally scoped.
- **"Right hip"/"Left hip" are merged into "Hips"; "Torso" is relabeled "Shoulders"** (2026-09-01, Viona's request, migration-safe). Don't reintroduce separate hip sides without her asking again.
- The error-marking timeline's event listeners are **delegated to the stable `#error-marking-timeline` container**, never bound to individual segments/tracks/handles (those get destroyed/recreated on nearly every interaction). Keep this pattern for further additions — see `attachTimelineHandlers()` in `app.js`.
- A per-mark `note` exists alongside the whole-clip note — they answer different questions, don't conflate them.
- **CHI25's own 8 upper-body landmarks** (`LEFT`/`RIGHT_SHOULDER`, `_ELBOW`, `_WRIST`, `_HIP`) are the reference landmark set for framing analysis, matching what the thesis's automatic rating used — not all 33 MediaPipe landmarks.

## Reference numbers (full 1,808-clip corpus, canonical GPU-extracted pose2d)

| signal | median | 90th pct | notes |
| --- | --- | --- | --- |
| `crop_violation_fraction` | 0.05 | 1.00 | Reference corpus mean 0.004 (near-zero, professionally framed) vs. study1 0.24 / study2 0.42 (self-recorded) — validates the detector is tracking something real. |
| `normalized_acceleration_p95` | 1.07 | 1.74 | Needs fresh human-label comparison; thresholds don't carry over from the pre-GPU-model sweep. |
| `false_tracking_candidate_fraction` | 0.39 | 0.64 | Still needs calibration against real human judgment on this corpus — not a validated cutoff. |

Out-of-frame exclusion isn't viable as a blanket filter: 59.3% of clips have *some* out-of-frame CHI25 landmark. It's overwhelmingly a **hip** problem (18% of frames), not arms (wrists 9–10%, elbows 1.6%, shoulders <0.3%).

Frame-quality map (white=clean / yellow=correctable / red=uncorrectable): latest run including reference at `temp/experiments/20260903-142352-frame-quality-map/`; the prior study-only run (2026-08-31) was 63.9%/28.5%/7.6% frame-weighted, with 17/1,756 clips more than half red.

## Context

The 2026-08-27 pivot ([2026-08-27-preprocessing-quality-gate-pivot.md](2026-08-27-preprocessing-quality-gate-pivot.md)) paused smoothing-parameter work because source-video and pose-detection quality issues dominate the corpus and confound any smoothing comparison. This plan built a purpose-built annotation workflow to gather ground truth across the full corpus rather than relying on ~30 pre-existing, non-systematic human labels.

Committed on `worktree-preprocessing-quality-triage-handoff` (pushed to origin, no PR opened yet). Earlier versions of this document carried a full narrative — out-of-frame/hallucination methodology, the original single-`error_type` schema, a six-commit timeline-redesign walkthrough, the original Stage 2 architecture writeup — that has since settled into the "Decisions" and "Reference numbers" sections above and been trimmed. If the reasoning behind a specific past decision is needed, `git log -p -- lab-log/2026-08-27-preprocessing-quality-gate-pivot-handoff.md` has it.
