---
date: 2026-08-28
tags: [pose-preprocessing, validation, participant-data, motion-pipeline, human-annotation, handoff]
artifacts: []
---

# Handoff: corpus-wide quality triage + defect localization

**This file is a living document, not a dated narrative entry.** Unlike a normal lab-log entry (append/revise sparingly, faithful to the researcher's voice at the time), this file is maintained in place across sessions — overwrite the status/next-action sections as work progresses rather than appending a history of them. It is the child/companion plan for [2026-08-27-preprocessing-quality-gate-pivot.md](2026-08-27-preprocessing-quality-gate-pivot.md); read that entry first for the "why" (the temporal-comparison session that found a bigger, smoothing-invariant defect dominating the corpus, and the decision to quality-gate before further smoothing work).

## Status

**Phase 1 implemented and run once; awaiting Viona's review before Phase 2 starts (the phase's explicit exit criterion).** `motion_extraction/scripts/compute_automatic_quality_signals.py` and its focused test suite (`motion_extraction/tests/test_compute_automatic_quality_signals.py`, 7 tests, passing) are written and committed on this branch. A full sweep has been run locally (output under `motion-pipeline/temp/experiments/20260828-quality-signals-full-sweep/`, gitignored — not committed; re-run the command below to reproduce it) and its summary is below. Phases 2 and 3 are still design-only.

### Corpus-size correction: it's 1,808 clips, not 1,955

The "1,955 videos" figure used earlier in this thread was wrong — it came from a `find -iname "*.mp4" -o -iname "*.mov"` count that, for `chi25_study1`, silently combined two different granularities of the same recordings: 675 flat per-clip files directly under `videos/`, plus 147 *whole-session* recordings nested one directory deeper at `videos/userperformances-study1/` (matching `study_pose_data.py`'s `study1-whole` layout — a different unit entirely, not per-clip, and not what the annotation-tool workflow this plan is building should ever show someone). The correct per-clip corpus is **52 reference + 675 study1 + 1,081 study2 = 1,808**, which is exactly what the sweep enumerated. `discover_corpus()` in the new script only globs the flat `videos/*.mp4` level for each corpus (non-recursive) specifically to exclude the whole-session recordings — this was a deliberate design choice once discovered, not a bug to fix.

### Two further discoveries that shaped the script

1. **Neither participant study has been run through the canonical extraction pipeline.** `data/participant_motions/{chi25_study1,chi25_study2}/pose-raw/` has no `canonical/` subtree at all — only a `legacy/` one, containing raw MediaPipe output from an older extraction run that predates the `dance_teacher_pose` package's column contract entirely. Its columns are `{LANDMARK}_x_2d/_y_2d/_z_2d/_visibility_2d` (frame-normalized to [0, 1], plus a per-frame `is_valid` flag), not canonical pose2d's `{LANDMARK}_x/_y/_distance/_vis` (pixel-space). `compute_automatic_quality_signals.py`'s `adapt_legacy_pose2d()` renames these onto the canonical contract in memory (masking every coordinate field, not just visibility, on `is_valid=False` frames) so every signal function downstream only has to know one column layout — this avoids needing a fresh MediaPipe extraction pass (expensive, and per this repo's `AGENTS.md`, macOS extraction needs a GUI-authorized local process) just to compute quality signals. Each study has two matching legacy variants per segmentation granularity at the flat, per-clip level — `<study>-poses-segmented` (normalized, used here) and `<study>-pixelposes-segmented` (pixel-space, not used, redundant with the normalized one). Every one of the 675 study1 and 1,081 study2 per-clip videos has matching legacy pose data (0 missing at the per-clip level).
2. **Reference pose2d coverage is partial.** `data/reference_motions/pose-raw/pose2d/` only has data for the `gendered-dance-tutorials/` video subfolder (9 of 52 reference videos); `chi-studyvideos/`, `selenas-dancevideos/`, and `tiktok-reference-videos/` have no local raw pose data at all yet, and are reported as `pose_available=False` rather than as an error. Re-running extraction for these is a separate, later decision for Viona; do not extract more data proactively.

### Full-sweep results (1,808 clips enumerated, 1,765 with pose data: 9 reference + 675 study1 + 1,081 study2)

Reproduce with: `cd motion-pipeline && .venv/bin/python -m motion_extraction.scripts.compute_automatic_quality_signals --output-root temp/experiments/<new-name>` (takes about 3 minutes for the full corpus; add `--max-files N` to iterate faster).

| signal | median | 90th pct. | max | notes |
| --- | --- | --- | --- | --- |
| `finite_coordinate_fraction` / `usable_frame_fraction` | 1.00 | 1.00 | 1.00 (min 0.47) | Coverage is overwhelmingly high corpus-wide — gaps/dropouts are not the dominant defect, consistent with the 2026-08-27 entry's read that framing and jitter dominate over dropouts. |
| `crop_violation_fraction` (hip/shoulder within 3% of frame edge or off-frame) | 0.35 | 1.00 | 1.00 | **Roughly bimodal**: 65% of clips have *some* violation, 53% have a *sustained* one (≥10 contiguous frames), and the 25th/75th percentiles are 0.0/0.99 — clips tend to be either framed fine throughout or cropped throughout, not intermittently. This lines up with `cropped_body` being the single most-tagged human factor in the existing ~30 labels, which is a good sign the signal is catching something real. |
| `normalized_acceleration_p95` (whole-clip roughness) | 0.77 | 1.18 | 2.54 | No obviously broken outlier tail; needs the human labels to know what magnitude actually reads as "jittery." |
| `windowed_roughness_p95_max` | 0.69 | 1.16 | 4.60 | Same shape as the whole-clip version but with a longer tail, as expected from localizing to the worst window rather than pooling the whole clip. |
| `false_tracking_candidate_fraction` | 0.21 | 0.45 | 0.79 | **Flagged as needing calibration, not a validated detector.** A median of ~1 frame in 5 across the *entire* corpus is implausibly high for a rare defect — the default thresholds (`velocity>0.5` torso-normalized, `visibility<0.5`) are very likely just picking up ordinary fast dance motion at low-confidence distal joints (wrists), not hallucinated tracking specifically. Needs comparison against real human judgments (e.g., the existing false-tracking free-text notes) before it should influence any Stage 1 sampling. |

Per-corpus means show reference clips (n=9, small sample) at `crop_violation_fraction=0.0` and `normalized_acceleration_p95=0.94` — both plausible for professionally-framed tutorial videos, but too small a sample to lean on.

### What to look at next (Viona's review, not an agent's)

1. Skim the actual CSV (`temp/experiments/20260828-quality-signals-full-sweep/automatic_quality_signals.csv`) against clips you already have an opinion on, especially ones you've already annotated `usable`/`constrained`/`weak` — does `crop_violation_fraction` agree with your `cropped_body` tags? Does high `windowed_roughness_p95_max` line up with clips you called jittery?
2. Decide whether the `false_tracking_candidate_fraction` signal is worth keeping at all in its current form, and if so what threshold (or whether to drop the absolute-cutoff framing entirely and use it as a continuous ranking signal instead).
3. Decide whether the reference-corpus and study1-whole-session pose-data gaps are worth closing before Phase 2, or whether Phase 2 should just proceed on the 1,765 clips that already have signals.

### Working in a worktree against this data: a gotcha

`data/reference_motions/{videos,pose-raw}` and `data/participant_motions` are gitignored (patterns end in `/`, i.e. "match a real directory"), but a git worktree doesn't share the primary checkout's untracked local data cache. If you're in a worktree and need the real corpus, symlink the specific gitignored subdirectories back to the primary checkout rather than re-staging ~4.5GB via rclone. **Git's ignore matching does not treat a symlink-to-a-directory as a directory**, so these symlinks show up as untracked, not ignored — `git add -A` or `git add .` will happily stage them (an absolute, machine-local path that would break on any other machine or checkout). Always stage specific filenames explicitly in a worktree with this setup; never use a broad add.

## Context (why this work exists)

The 2026-08-27 pivot paused smoothing-parameter work because source-video quality issues (framing/crop, lighting, backdrop) and pose-detection quality issues (jitter, gaps, hallucinated/false limb tracking) dominate the corpus and confound any smoothing comparison. That entry's proposed next step was to validate automatic quality detectors against the ~30 existing human `usable`/`constrained`/`weak` labels — but Viona decided those labels are insufficient (a byproduct of other targeted sessions, not a systematic pass) to validate a detector's precision/recall. This plan extends the annotation tool with a purpose-built workflow to gather that ground truth efficiently across the full local corpus: **1,955 videos** (52 reference + 822 study1 + 1,081 study2), already staged locally via rclone (confirmed on disk 2026-08-28).

## Decisions already made (do not re-litigate without asking Viona)

- **Sampling**: automatic-flagged candidates **plus** random unflagged controls, so resulting labels can validate both precision and recall of any detector.
- **Overlay always on**: every review item shows the skeleton overlay burned in, never raw video/frame alone. Viona's own reasoning: pose estimation can perform fine on a poor-looking video, or poorly on a good-looking one — video quality and pose quality are independent judgments and both need to be visible together.
- **Two-stage workflow**: a fast Stage 1 pass classifies each item fine vs. problematic (no factor detail — kept fast on purpose); only problematic items get an auto-generated Stage 2 follow-up task where Viona localizes the specific bad span and its cause, **warm-started** with a guessed span/cause from the automatic signals that she adjusts rather than marking from scratch.
- **Review-unit routing**: statically-flagged candidates (crop, lighting) shown as a single frame; temporally-flagged candidates (roughness, false-tracking) and random controls shown as a short clip. Both always carry the burned-in overlay.
- Cropping is detected automatically from hip/shoulder landmark position relative to frame bounds (Viona's own suggestion).
- New `SOURCE_EVIDENCE_FACTORS` tags `false_tracking` and `track_discontinuity` will be added — both named explicitly in the 2026-08-27 lab log's "Proposed path forward" but not covered by the current tag set (`motion_blur` conflates video-side blur with detector-side hallucination).
- `_load_corpus_membership` (in `run_preprocessing_experiment.py`) is **not reusable** for corpus-wide enumeration — it hard-asserts exactly 25 rows and is scoped to one staged experiment. Use `dance_teacher_pose.schema.collect_pose_data_files` directly against each corpus's raw-pose root instead (confirmed paths below).
- No blur/optical-flow/false-tracking detector exists anywhere in the repo today — this is genuinely new code, not a refactor of something existing. The only prior art is a single-frame luminance/contrast snippet in `append_targeted_preprocessing_tasks.py` (~line 83-97).

## Full architecture

See the complete design in [the plan artifact this session produced](#full-plan-text-below) — reproduced in full below so it survives independent of any local `~/.claude/plans/` file, which is not part of this repository and will not be available to a future session or a different machine.

### 1. Automatic quality-signal sweep — `motion_extraction/scripts/compute_automatic_quality_signals.py` (not yet created)

Enumerate the entire corpus via `collect_pose_data_files` per corpus root:
- Reference: `data/reference_motions/pose-raw/` (52 clips)
- Study1: `data/participant_motions/chi25_study1/pose-raw/legacy/...` (822 clips)
- Study2: `data/participant_motions/chi25_study2/pose-raw/legacy/...` (1,081 clips)

Per clip, compute:
- **Reuse as-is**: `normalized_acceleration_p95`, `finite_coordinate_fraction`, `usable_frame_fraction` — same as `_direct_quality_summary()` in `motion_extraction/scripts/run_preprocessing_experiment.py:122-154`, on B0 (unprocessed) clean pose.
- **New — frame-bounds crop signal**: read **raw** pose2d (pixel-space — clean pose is torso-normalized and cannot see frame position) for `LEFT_HIP`/`RIGHT_HIP`/`LEFT_SHOULDER`/`RIGHT_SHOULDER`, plus video width/height via `cv2.VideoCapture` (frame dimensions are not persisted anywhere else). Flag fraction of frames where these land near/off the frame edge.
- **New — lighting signal**: extend the existing `mean_luminance_0_255`/`luminance_contrast_sd` snippet in `append_targeted_preprocessing_tasks.py` to sample across a clip, not one frame.
- **New — windowed roughness**: rolling-window version of the p95 roughness calc (not just whole-clip), needed both to flag temporally-local problems and to drive Stage 2 warm-start localization.
- **New — coarse false-tracking heuristic**: frames where landmark velocity is kinematically implausible *and* visibility/confidence is low, co-occurring.

Output: one CSV row per clip under `temp/experiments/<name>/automatic_quality_signals.csv`, following the shape of the existing `pose_quality_by_file.csv`, plus `run_provenance.json`. Support `--max-files`; 1,955 clips will take a while — validate on a small slice first.

### 2. Stage 1 triage task generator — `annotation_tool/generate_quality_triage_tasks.py` (not yet created)

Modeled on `generate_temporal_comparison_tasks.py` (the only existing generator that renders overlay video, via ffmpeg/libx264 + `_encode_frames`/`_draw_pose`; frame items reuse the `_write_review_frame` overlay-image pattern from `append_targeted_preprocessing_tasks.py`).

- Stratified sampling: flagged candidates grouped by which signal fired (crop, lighting, roughness/jitter, false-tracking) + a random unflagged sample as controls, using `_select_diverse_windows()`-style seeded sampling already in `generate_temporal_comparison_tasks.py:253-311`.
- Emits `task_type: "quality_triage"` tasks into a fresh manifest, following the existing manifest-header shape (`schema_version`, `experiment_id`, `task_type`, `seed`, `input_provenance` with sha256s, `tasks`).

### 3. Stage 2 follow-up generator — `annotation_tool/append_defect_localization_tasks.py` (not yet created)

Reads the triage SQLite database for the latest `quality_triage` judgments with verdict `problematic` lacking a follow-up task (idempotent — matches the `_require_new_batch`-style guard used by other `append_*` scripts). For each: computes a warm-start suggestion (sub-span where windowed-roughness/crop-violation is most extreme, reusing signal #1's output), renders a wider-context overlay clip, appends a `task_type: "defect_localization"` task (`suggested_span`, `suggested_factors`, `generated_from_task_id`) to the **same manifest** — Viona restarts the annotation server to pick up new follow-ups (no live in-session generation; that would require rendering video inside the request path).

### Server changes — `annotation_tool/server.py` (not yet made)

Following the existing `ALTER TABLE ... ADD COLUMN` migration pattern (lines 103-162) and the `task_type`-branching pattern already used for `temporal_pose_comparison` (lines 181-432):
- New columns: `triage_response_json` (`{verdict, note}`), `marked_spans_json` (`[{start, end, factors}]`).
- New `TRIAGE_VERDICTS = {"fine", "problematic", "cannot_judge"}` + `_validate_triage_response` mirroring `_validate_temporal_response`.
- `append()`: `quality_triage` requires ground_truth/source_evidence empty + validates `triage_response`; `defect_localization` validates `marked_spans` shape and reuses existing `source_evidence_quality`/`source_evidence_factors` validation for the overall verdict.
- Extend `SOURCE_EVIDENCE_FACTORS` (line 34-41) with `false_tracking`, `track_discontinuity`.
- No new HTTP endpoints — `POST /api/judgments`, `GET /api/state`, `GET /api/export.*` are already generic enough.

### Frontend changes — `static/index.html`, `static/app.js`, `static/style.css` (not yet made)

Following the `isTemporalTask(task)` / `renderTemporalTask()` / two-more-branches-in-`render()`-and-`payload()` pattern exactly (app.js:108, 157-193, 403-458):
- **`#triage-screen`**: overlay-burned `<video>` or `<img>` (routed by `task.review_unit`), three buttons only — "Looks fine" / "Has a problem" / "Can't judge".
- **`#defect-screen`**: clip playback reusing existing temporal-screen video plumbing; new "Set start"/"Set end" buttons bound to `video.currentTime`, supporting multiple marked spans each with its own factor-tag checkboxes (reusing `renderSourceEvidence`/`sourceEvidencePayload` chip-list pattern, app.js:195-213), plus overall-quality radio and notes.
- Warm start: `#defect-screen` pre-populates one span row from `task.suggested_span` and pre-checks `task.suggested_factors` on load.

## Implementation phasing (build/validate in this order)

1. **Signals only** — `compute_automatic_quality_signals.py`, run over the full corpus (start with `--max-files` on a slice). **Review the resulting CSV with Viona before writing any UI** — this validates the signals are worth surfacing at all.
2. **Triage end-to-end** — generator #2 + server + `#triage-screen`. Run a real triage session against a small batch first.
3. **Defect localization follow-up** — generator #3 + server + `#defect-screen` + warm start, triggered from Stage 2's `problematic` verdicts.

## Verification

- After each phase's annotation-tool changes: `cd motion-pipeline && .venv/bin/python -m pytest motion_extraction/tests/test_annotation_tool.py -q && node --check motion_extraction/annotation_tool/static/app.js`.
- New focused tests: validation branches for both new task types (mirror `test_temporal_responses_are_typed_append_only_and_exported`, `test_completed_temporal_response_validation_is_separate_from_skeleton_scores`), the two new generator scripts (mirror `test_temporal_generator_blinds_profiles_and_links_permuted_repeats`), and warm-start span computation.
- Manual end-to-end: run a triage session, mark one item `problematic`, run `append_defect_localization_tasks.py`, restart the server, confirm the follow-up task appears with a pre-populated warm-start span.

## Next action for whoever picks this up

Start Phase 1: write `motion_extraction/scripts/compute_automatic_quality_signals.py` per the spec above, run it with `--max-files` on a small slice of each corpus first to sanity-check the new crop/lighting/windowed-roughness/false-tracking signals against a few clips Viona already has an opinion on, then run the full sweep. Do this work in its own worktree/branch per [`../AGENTS.md`](../AGENTS.md)'s branching guidance, and update the **Status** section at the top of this file before ending the session — overwrite it, don't append a log.
