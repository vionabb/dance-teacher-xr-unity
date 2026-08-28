---
date: 2026-08-28
tags: [pose-preprocessing, validation, participant-data, motion-pipeline, human-annotation, handoff]
artifacts: []
---

# Handoff: corpus-wide quality triage + defect localization

**This file is a living document, not a dated narrative entry.** Unlike a normal lab-log entry (append/revise sparingly, faithful to the researcher's voice at the time), this file is maintained in place across sessions — overwrite the status/next-action sections as work progresses rather than appending a history of them. It is the child/companion plan for [2026-08-27-preprocessing-quality-gate-pivot.md](2026-08-27-preprocessing-quality-gate-pivot.md); read that entry first for the "why" (the temporal-comparison session that found a bigger, smoothing-invariant defect dominating the corpus, and the decision to quality-gate before further smoothing work).

## Status

**Not yet started.** This document currently holds the design only. No code has been written for any of the three phases below.

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
