# Lab Log Index

A concise, chronological synopsis of every entry below — 1-4 lines each — so the
evolution of the research direction can be read top to bottom without opening
every file. This index is a summary aid, not a replacement for the entries:
decisions, rationale, and the researcher's own words live in the linked entry.

Keep this file in sync with `lab-log/`: see the "Index page" section in
[README.md](README.md) for the maintenance rule.

---

- [2026-07-29 — Lab log setup](2026-07-29-lab-log-setup.md)
  Established the lab log itself: flat dated markdown files with YAML
  frontmatter, committed assets under `lab-log/assets/`, and a mandate to
  capture the researcher's own language rather than neutral technical prose.
  Every later entry follows these ground rules.

- [2026-07-30 — Cloud-accessible dataset and artifact workflow](2026-07-30-cloud-dataset-pipeline.md)
  Designed an rclone-staged Google Drive workflow so cloud agents can process
  dataset files without a mount, keeping the pipeline itself path-based.
  Fixed the lasting boundary: code and small smoke fixtures live in Git; the
  full/private dataset and generated artifacts stay in Drive.

- [2026-07-30 — Svelte web frontend structural refactoring](2026-07-30-svelte-frontend-refactor.md)
  Cleaned up organically-grown engineering debt in `svelte-web-frontend`: removed
  dead files, fixed a naming typo, relocated a misplaced model interface, and
  grouped evaluation infrastructure under `src/lib/ai/evaluation/`.

- [2026-08-01 — Documentation warm-start redesign](2026-08-01-documentation-warm-start.md)
  Rebuilt the documentation set for efficient agent warm-start: a canonical
  repository summary, a task-oriented documentation index, one owner per topic,
  and standardized chapter 6/7 terminology for the dance-learning and
  adaptive-coaching work.

- [2026-08-02 — Documentation consolidation](2026-08-02-documentation-consolidation.md)
  Moved research-maturity tracking into a code-repo-owned `project-state.md`
  and removed duplicated thesis/paper snapshots in favor of a single
  `research-context.md`, so the code repository stays self-sufficient.

- [2026-08-02 — Motion-pipeline refactor planning](2026-08-02-motion-pipeline-refactor-plan.md)
  Scoped a staged refactor of the organically-grown `motion-pipeline` package:
  classify code as active/historical before moving anything, lock the
  Python/MediaPipe environment, and establish a committed stage-first smoke
  corpus as the code-change acceptance gate.

- [2026-08-08 — MediaPipe macOS smoke-gate fix](2026-08-08-mediapipe-macos-smoke-fix.md)
  Diagnosed MediaPipe graph-creation failures on macOS across versions and
  pinned the pipeline to `mediapipe==0.10.21`'s stable Holistic batch path to
  keep the smoke-test acceptance gate green.

- [2026-08-13 — Lightweight pose-preprocessing validation](2026-08-13-lightweight-preprocessing-validation.md)
  First pass at pose-preprocessing validation: froze a 25-clip reference +
  participant corpus through the unified extractor and found sparse but
  concentrated whole-pose detection failures, motivating a lightweight cleanup
  candidate rather than a full MediaPipe reconstruction effort.

- [2026-08-25 — Lightweight pose-cleanup experiment](2026-08-25-preprocessing-cleanup.md)
  Compared preprocessing profiles `B0`/`C1`-`C4` automatically; provisionally
  accepted gap-only interpolation (`C4`, ≤2 frames) as low-risk. Built the
  reusable local annotation tool (editable skeleton, occlusion labels,
  source-evidence quality) to source-ground further judgments, leaving
  smoothing (`C2`) undecided pending human review.

- [2026-08-26 — C4 smoothing-parameter selection](2026-08-26-c4-smoothing-parameter-selection.md)
  Investigated weaker smoothing strengths as alternatives to the current
  triangular-3 filter; frequency-response analysis showed the current setting
  over-attenuates fast motion. Set up a blinded temporal-comparison annotation
  batch for Viona to judge — result pending at entry time.

- [2026-08-27 — Pivot: quality-gate the corpus before optimizing smoothing](2026-08-27-preprocessing-quality-gate-pivot.md)
  The blinded smoothing comparisons came back indistinguishable, and free-text
  evidence (this session's and prior sessions') showed the real dominant
  artifacts — jitter, false/hallucinated limb tracking, framing and lighting —
  aren't smoothing-related at all. Paused smoothing-parameter selection and
  reordered the workstream around a quality gate: detect bad-quality video/pose
  data, fix what's fixable, exclude what isn't, before any further
  optimization. Live implementation plan and status:
  [2026-08-27-preprocessing-quality-gate-pivot-handoff.md](2026-08-27-preprocessing-quality-gate-pivot-handoff.md).

- [Handoff: corpus-wide quality triage + defect localization](2026-08-27-preprocessing-quality-gate-pivot-handoff.md)
  (living document — status as of 2026-09-29) Full-corpus pose extraction and
  all 154 video ratings are complete; three detailed-error drafts remain.
  Paired C4 metric analysis found little correlation change. The active queue
  adds 49 manual three-level frame tasks for correctable videos.

- [2026-09-17 — Video usability triage before detailed error annotation](2026-09-17-video-usability-triage.md)
  Reoriented the annotation stream around a first-stage full-video usability
  gate: mark unusable frames, then assign `unusable`/`marginal`/`correctable`/
  `perfect`. Use only the quality-clearing subset for downstream bad-segment
  detection and frame or skeleton-part repair/discounting.

- [2026-09-22 — Three-stage preprocessing annotation audit](2026-09-22-three-stage-preprocessing-annotation-audit.md)
  Set the video, frame, and landmark annotation sequence and audited live
  progress: 60 coarse triage judgments complete, three detailed-error drafts,
  no four-point video-usability tasks yet. Identified missing three-level frame
  flow and a manual-versus-automatic frame-flag provenance defect.

- [2026-09-28 — Focused video-usability rating sample](2026-09-28-video-usability-focused-sample.md)
  Preserved 78 completed ratings, including all four study reference videos,
  and added 22 stratified Study 2 clips. All 100 video ratings are complete.

- [2026-09-28 — First prediction test of video usability](2026-09-28-video-usability-prediction-baseline.md)
  Participant-held-out analysis found promising ranking of low-usability clips
  by three pose-quality signals in the selected sample. A reference-segment
  transfer check missed an all-cover unusable clip, so feature refinement and
  independent validation are needed before any pass/fail rule.

- [2026-09-28 — Video-usability prediction error and note audit](2026-09-28-video-usability-error-audit.md)
  Sixteen notes expose content, pose availability, and framing concerns. Viona
  clarified that the four-point rating measures visible pose-tracking accuracy;
  optional notes can flag analysis-unsuitable videos. The active
  24-random-plus-6-diagnostic follow-up preserves the first 100 ratings;
  candidate prediction models were frozen before the new labels.

- [2026-09-29 — Follow-up video-usability prediction evaluation](2026-09-29-video-usability-followup-evaluation.md)
  The 30 new ratings support provisional ranking but no automatic pass/fail gate:
  the frozen models missed concerning clips at an illustrative cutoff, and five
  random clips lack reliable person IDs. All 1,756 participant clips now have
  provisional scores. The later 24-clip known-ID follow-up is complete: its 12
  random checks had no concerning clips, so severe-case sensitivity remains
  unmeasured; the 12 separate diagnostics exposed M0 misses. A small frame
  pilot can use reviewed clips independently.

- [2026-09-29 — Raw-pose metric correlation under curation cutoffs](2026-09-29-usability-curation-correlation.md)
  Recomputed canonical raw-pose metrics for 95 exactly matched human-rated
  participant clips, including 17 from the newest video batch. Tightening the
  visible tracking-quality cutoff changed motion-rating correlations only
  modestly and uncertainly; preserve this cohort and all cutoffs for a paired
  comparison after pose preprocessing.

- [2026-09-29 — Paired C4 preprocessing and metric evaluation](2026-09-29-c4-paired-preprocessing-evaluation.md)
  Four paired raw/C4 arms on the same 95 clips found faithful short-gap
  interpolation but only tiny changes in motion-rating correlations. Study
  differences exceed the C4 effect; a separate three-level frame queue now
  targets the 49 videos Viona rated correctable.

- [2026-09-29 — Combined frame and landmark error annotation](2026-09-29-frame-usability-workflow.md)
  Viona kept the compact three-level frame control and automatic missing-pose
  marks, then added the established per-landmark timeline and drag correction
  flow to the same 49-video pass. Knee/ankle annotation is now out of scope;
  a reversible Give up action records an unusable override for costly videos.
  Phone frame tasks now center a zoomable video with Auto subject following,
  two-finger pan and pinch zoom, and a frame scrubber above the bottom controls; secondary
  tools remain in an overflow menu. Keyboard arrows step frames, phone
  completion confirms, and return visits resume at the last viewed frame.

- [2026-09-30 — Qijia2D frame inspector and local dataset exploration](2026-09-30-qijia2d-frame-inspector.md)
  Built a local performance inspector with paired videos, stable pose crops,
  vector errors, and one chart scrubber across segments. Missing Qijia2D frames
  stay unscored; the chart compares visibility rules and vector subsets.
  Pose pairing remains by row index with a flipped-video/native-pose reference overlay.

- [2026-09-30 — Viona2D inspector views](2026-09-30-viona2d-inspector-views.md)
  Built selectable vector lens, eight-pair audit, and angle-versus-length views
  on the same local performance timeline. Exposes the production blend and its
  unclamped 50–100 px angle weight for frame-by-frame debugging.

- [2026-09-30 — Visibility against frame-level corrections](2026-09-30-frame-visibility-audit.md)
  First 23 completed frame tasks: upper-body corrections concentrate at wrists
  and elbows; low raw-pose visibility predicts correction priority but misses
  some errors. The selected sparse labels do not establish occlusion causality.

- [2026-10-01 — Switching metrics within a performance review](2026-10-01-metric-inspector-switching.md)
  Adds a Qijia2D/Viona2D choice inside the review, carrying the selected
  performance and full-timeline position across metric views.

- [2026-10-01 — Dance-first performance browsing](2026-10-01-dance-first-performance-browser.md)
  Organizes the local dataset by dance reference thumbnails, then participant
  performance cards; selecting another performance reuses the last viewed metric.
  Restores paired Study 2 recordings with unhyphenated dance filenames to the catalog.

- [2026-10-01 — Layered pose quality and segment coverage](2026-10-01-layered-pose-quality-and-segment-coverage.md)
  Viona set a reference-first, quality-aware path through conservative repair,
  confidence, metric contracts, and coaching abstention. All reference and
  participant dance segments have overall ratings, but condition cells are
  sparse; apparent hard segments are hypotheses for balanced follow-up.

- [2026-10-01 — Canonical manual-review corpus and first release](2026-10-01-manual-review-corpus-proposal.md)
  Established a source-aware review catalog and frozen 2026-10-02 release:
  3,640 revisions, 154 video ratings, 138 exact raw poses, and 48 complete
  reviewed 2D segments. Verified Drive backup and restore, and ran optional
  2D preprocessing; the live annotation database remains in place.

- [2026-10-02 — First paired use of manually reviewed poses](2026-10-02-manual-review-paired-metrics.md)
  Compared exact reviewed 2D inputs with raw/C4 on 30 participant-reviewed,
  19 reference-reviewed, and 8 fully reviewed human-rated pairs. The raw
  control matched exactly; whole-clip similarity correlations changed little.

- [2026-10-02 — Toward one research workspace](2026-10-02-unified-research-workspace.md)
  Viona chose one SvelteKit interface for research and learner work, local
  SQLite for research records, and shared versioned data contracts. The local
  read model imports frozen reviews and CHI25 human ratings separately; the
  usability queue selects rated segments to fill sparse coverage cells.
- [2026-10-02 — Unified research workspace handoff](2026-10-02-unified-research-workspace-handoff.md)
  Tracks the four open PRs, local usability and frame-correction authoring,
  the October 2 main merge and Vercel preview repair, and remaining researcher
  authorization, metric-runner, and pipeline-job work.

- [2026-10-03 — Bring frame corrections into the research workspace](2026-10-03-frame-review-in-svelte.md)
  Ports the 49-case sparse frame review into the local Svelte interface while
  retaining the original Python validator and SQLite revision history.
