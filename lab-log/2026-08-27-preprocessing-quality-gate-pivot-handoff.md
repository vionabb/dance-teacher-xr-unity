---
date: 2026-08-28
tags: [pose-preprocessing, validation, participant-data, motion-pipeline, human-annotation, handoff]
artifacts: []
---

# Handoff: corpus-wide quality triage + defect localization

**This file is a living document, not a dated narrative entry.** Unlike a normal lab-log entry (append/revise sparingly, faithful to the researcher's voice at the time), this file is maintained in place across sessions — overwrite the status/next-action sections as work progresses rather than appending a history of them. It is the child/companion plan for [2026-08-27-preprocessing-quality-gate-pivot.md](2026-08-27-preprocessing-quality-gate-pivot.md); read that entry first for the "why" (the temporal-comparison session that found a bigger, smoothing-invariant defect dominating the corpus, and the decision to quality-gate before further smoothing work).

## Status

**Phase 1 complete: the whole corpus (1,808/1,808 clips) has canonical `pose2d` + `pose3d`, computed via GPU, adapter-free, zero errors. Not yet committed on this branch as of this line — commit before doing anything else if it isn't. Awaiting Viona's review of the results below before Phase 2 (the triage/defect-localization annotation-tool UI) starts.**

**What happened, in order** (prompted by Viona: re-extract the whole corpus through the canonical pipeline instead of adapting participant studies' pre-canonical format in memory, and do it on GPU):
1. Confirmed via `gh issue view` on `google-ai-edge/mediapipe` that the combined Holistic Landmarker Task (pose+hands+face) has a real, upstream, 2+-year-open, unresolved crash on any empty-detection sub-packet (mediapipe#5181), reproducing the exact crash the 2026-08-08 lab-log entry hit. The *standalone* Pose Landmarker Task does not share that bug and does support a GPU (Metal) delegate on macOS — validated directly against both a synthetic blank frame and real corpus frames, landmark output matching the existing CPU `Holistic` output within ~0.01-0.015 normalized units.
2. Renamed holistic file/directory naming for clarity now that a third modality exists: `.holisticdata.raw.csv` → `.holistic.raw.csv` (`holisticdata/` → `holistic/`), and added `pose3d` as a new modality (world-space landmarks, own directory) — Viona wants it available for future 3D-motion investigation even though nothing consumes it yet.
3. Added `dance_teacher_pose.extraction.extract_pose_landmarker_video()` (new, GPU, pose-only) alongside the existing, untouched CPU `extract_holistic_video()` (still the only hand-data source; per Viona the frontend doesn't use hand/face features yet), plus `motion_extraction/corpus_videos.py` (shared enumeration) and `motion_extraction/scripts/extract_pose_landmarker_corpus.py` (the corpus-wide driver).
4. **Two real production failures during the actual full-corpus run, both now understood and fixed/mitigated:**
   - *System memory pressure*: two early attempts were `SIGKILL`'d (exit 137) with the machine down to ~91MB free RAM (confirmed via `vm_stat`/`log show`) — genuine external memory pressure, not this script leaking. Viona closed some apps.
   - *A real leak, found after freeing memory didn't fully fix it*: subsequent attempts still died, now via `SIGABRT` (exit 134). `log show --predicate 'eventMessage CONTAINS "jetsam"'` showed `killing largest compressed process Python ... 86396 MB` — an ~84GB *compressed* memory footprint, invisible to plain RSS sampling, almost certainly native-level (Metal/TFLite GPU delegate) resource accumulation across thousands of `detect()` calls in one long-lived process. Mitigated (not fixed at the source) by wrapping the extraction command in a bash retry-loop that restarts it on any non-zero exit — the script's existing resumability (skip clips whose output already exists) means each restart just continues. Took 24 restarts, ~2.5 hours wall-clock, to finish the full corpus. **A real MediaPipe bug report for this was drafted** (not yet sent — visible via `/feedback` if Viona wants to send it).
   - *A resumability bug this surfaced*: the "already done" check only tested file **existence**, not non-emptiness. One clip's `pose2d` output was left at 0 bytes by a kill mid-write, then silently skipped-as-complete on every subsequent restart, permanently stuck. Fixed in `extract_pose_landmarker_corpus.py` (`_is_complete_output` now also requires `size > 0`), with a regression test (`test_run_extraction_reprocesses_a_zero_byte_output_left_by_a_killed_run`). Re-running after the fix correctly re-extracted that one clip; final run is 1,808/1,808 with zero errors.
5. Removed the legacy-schema adapter from `compute_automatic_quality_signals.py` entirely; it now reads canonical `pose2d` exclusively. Re-ran the full sweep against the real corpus — see results below, which supersede the very first (legacy-adapted) sweep's numbers. **The two sweeps' numbers are not directly comparable** — the GPU Pose Landmarker is a genuinely different model from whatever produced the old legacy CSVs, so some signals shifted (e.g. `false_tracking_candidate_fraction` roughly doubled); this reflects a real model difference, not a bug, but means any threshold intuition from the first sweep should be re-formed against the numbers below, not assumed to carry over.

### Corpus-size correction: it's 1,808 clips, not 1,955

The "1,955 videos" figure used earlier in this thread was wrong — it came from a `find -iname "*.mp4" -o -iname "*.mov"` count that, for `chi25_study1`, silently combined two different granularities of the same recordings: 675 flat per-clip files directly under `videos/`, plus 147 *whole-session* recordings nested one directory deeper at `videos/userperformances-study1/` (matching `study_pose_data.py`'s `study1-whole` layout — a different unit entirely, not per-clip, and not what the annotation-tool workflow this plan is building should ever show someone). The correct per-clip corpus is **52 reference + 675 study1 + 1,081 study2 = 1,808**. `list_corpus_videos()` in `motion_extraction/corpus_videos.py` only globs the flat `videos/*.mp4` level for each corpus (non-recursive) specifically to exclude the whole-session recordings — this was a deliberate design choice once discovered, not a bug to fix.

### Full-sweep results, final (1,808/1,808 clips, canonical GPU-extracted pose2d, zero errors)

Reproduce with: `cd motion-pipeline && .venv/bin/python -m motion_extraction.scripts.compute_automatic_quality_signals --output-root temp/experiments/<new-name>` (~3 minutes). The extraction itself (`extract_pose_landmarker_corpus.py`) only needs to be re-run if pose data is missing or you want to re-extract; it's already complete for the whole corpus as of this writing.

| signal | median | 90th pct. | max | notes |
| --- | --- | --- | --- | --- |
| `finite_coordinate_fraction` / `usable_frame_fraction` | 1.00 | 1.00 | 1.00 (min 0.0) | Still overwhelmingly high corpus-wide (mean 0.977) — gaps/dropouts are not the dominant defect. One clip now has 0 coverage throughout (worth Viona spot-checking; may be a genuinely undetectable clip rather than a pipeline bug). |
| `crop_violation_fraction` (hip/shoulder within 3% of frame edge or off-frame) | 0.05 | 1.00 | 1.00 | 56% of clips have *some* violation, 43% a *sustained* one (≥10 contiguous frames). **Reference corpus now has full 52/52 coverage** (was 9/52 in the first sweep) and its mean `crop_violation_fraction` is 0.004 — essentially zero, as expected for professionally-framed tutorial videos, versus 0.24-0.42 for the two participant studies (self-recorded). This reference-vs-participant contrast is a strong validating signal that the crop detector is tracking something real about camera setup, not noise. |
| `normalized_acceleration_p95` (whole-clip roughness) | 1.07 | 1.74 | 5.16 | Higher than the first sweep's numbers (median 0.77 there) — expected given the different underlying pose model; needs fresh human-label comparison, not the old sweep's intuition. |
| `windowed_roughness_p95_max` | 1.00 | 2.06 | 5.18 | Same shape, longer tail, as expected from localizing to the worst window. |
| `false_tracking_candidate_fraction` | 0.39 | 0.64 | 0.88 | **Still flagged as needing calibration, more so now.** Roughly doubled versus the first sweep (median 0.21 → 0.39) purely from the model swap — reinforces that this heuristic's default thresholds are not portable across pose detectors and must be calibrated against real human judgment on *this* corpus's actual signal distribution, not carried over from any prior run or guessed. |

Per-corpus means: `reference` crop=0.004, roughness(p95)=1.05, windowed=1.88; `chi25_study1` crop=0.24, roughness=1.08; `chi25_study2` crop=0.42, roughness=1.22 — study2 reads as somewhat worse-framed and rougher than study1.

### What to look at next (Viona's review, not an agent's)

1. Skim the actual CSV (`temp/experiments/20260828-quality-signals-canonical-sweep/automatic_quality_signals.csv`) against clips you already have an opinion on, especially ones you've already annotated `usable`/`constrained`/`weak` — does `crop_violation_fraction` agree with your `cropped_body` tags? Does high `windowed_roughness_p95_max` line up with clips you called jittery?
2. Decide whether the `false_tracking_candidate_fraction` signal is worth keeping at all in its current form, and if so what threshold (or whether to drop the absolute-cutoff framing entirely and use it as a continuous ranking signal instead) — now doubly important given it shifted with the model change.
3. Spot-check the one clip with `finite_coordinate_fraction == 0` (fully undetected throughout) — genuinely bad clip, or a pipeline issue worth investigating further?
4. Decide whether to send the drafted MediaPipe GPU-memory-leak bug report (`/feedback`) — it's useful upstream context even though the retry-loop mitigation already got the corpus extracted.

### Working in a worktree against this data: a gotcha

`data/reference_motions/{videos,pose-raw}` and `data/participant_motions` are gitignored (patterns end in `/`, i.e. "match a real directory"), but a git worktree doesn't share the primary checkout's untracked local data cache. If you're in a worktree and need the real corpus, symlink the specific gitignored subdirectories back to the primary checkout rather than re-staging ~4.5GB via rclone. **Git's ignore matching does not treat a symlink-to-a-directory as a directory**, so these symlinks show up as untracked, not ignored — `git add -A` or `git add .` will happily stage them (an absolute, machine-local path that would break on any other machine or checkout). Always stage specific filenames explicitly in a worktree with this setup; never use a broad add.

## Context (why this work exists)

The 2026-08-27 pivot paused smoothing-parameter work because source-video quality issues (framing/crop, lighting, backdrop) and pose-detection quality issues (jitter, gaps, hallucinated/false limb tracking) dominate the corpus and confound any smoothing comparison. That entry's proposed next step was to validate automatic quality detectors against the ~30 existing human `usable`/`constrained`/`weak` labels — but Viona decided those labels are insufficient (a byproduct of other targeted sessions, not a systematic pass) to validate a detector's precision/recall. This plan extends the annotation tool with a purpose-built workflow to gather that ground truth efficiently across the full local corpus: **1,808 per-clip videos** (52 reference + 675 study1 + 1,081 study2 — see "Corpus-size correction" above for why this isn't 1,955), already staged locally via rclone (confirmed on disk 2026-08-28).

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

### 1. Automatic quality-signal sweep — `motion_extraction/scripts/compute_automatic_quality_signals.py`

**Superseded in one respect**: this section originally planned to read participant studies' pre-canonical `legacy/` pose data via an in-memory adapter. That adapter was built, used for one full sweep, then removed in favor of actually re-extracting the whole corpus through the canonical pipeline on GPU — see the Status section's "What changed since the first Phase 1 pass". The signal-computation logic below (crop, lighting, windowed roughness, false-tracking) is otherwise still accurate; only the pose-data *source* changed, to `motion_extraction/scripts/extract_pose_landmarker_corpus.py`'s canonical output via `motion_extraction/corpus_videos.py`'s shared enumeration (52 reference + 675 study1 + 1,081 study2 = 1,808, not the 822/1,955 figures originally written here).

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
