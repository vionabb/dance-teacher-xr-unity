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
  (living document — status as of 2026-09-22) Full-corpus pose extraction and
  60 sampled coarse quality judgments are complete; three of 17 detailed-error
  tasks have unfinished drafts. The next work is a versioned three-stage video,
  frame, and landmark workflow, with an audit sample and preserved history.

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

- [2026-09-30 — Qijia2D frame inspector and local dataset exploration](2026-09-30-qijia2d-frame-inspector.md)
  Built a local performance inspector with paired videos, stable pose crops,
  vector errors, and one chart scrubber across segments. Missing Qijia2D frames
  stay unscored; the chart compares visibility rules and vector subsets.
  Pose pairing remains by row index with a flipped-video/native-pose reference overlay.

- [2026-09-30 — Viona2D inspector views](2026-09-30-viona2d-inspector-views.md)
  Built selectable vector lens, eight-pair audit, and angle-versus-length views
  on the same local performance timeline. Exposes the production blend and its
  unclamped 50–100 px angle weight for frame-by-frame debugging.

- [2026-10-01 — Switching metrics within a performance review](2026-10-01-metric-inspector-switching.md)
  Adds a Qijia2D/Viona2D choice inside the review, carrying the selected
  performance and full-timeline position across metric views.

- [2026-10-01 — Dance-first performance browsing](2026-10-01-dance-first-performance-browser.md)
  Organizes the local dataset by dance reference thumbnails, then participant
  performance cards; selecting another performance reuses the last viewed metric.
  Restores paired Study 2 recordings with unhyphenated dance filenames to the catalog.
