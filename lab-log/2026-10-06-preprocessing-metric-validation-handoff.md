---
date: 2026-10-06
tags: [pose-preprocessing, motion-metrics, handoff]
artifacts: []
---

# Handoff: preprocessing and similarity validation

## Current state

- As of 2026-11-05, `codex/preprocessing-metric-validation` has been rebased
  onto GitHub `main` at `abd836a4`. Its five research commits are now
  `5d2edee0`, `dbdf30a9`, `56102d1a`, `8484d814`, and `2d5cc0b5`.
  The first two add the opt-in `qijia2d-quality-v1` TypeScript evaluator and
  tests. Legacy metric behavior and export are unchanged. The only rebase
  conflicts were chronological additions to `lab-log/index.md`; both October
  6 entries and the later October entries were preserved.
- On the rebased tree, the eight focused Vitest cases, `pnpm lint`, and
  `pnpm check` pass. The check used placeholder values for
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `ANTHROPIC_API_KEY`, and `OPENAI_API_KEY`; it reported zero errors and 12
  warnings in existing Svelte files. Without those local values, it reports
  eight missing static-environment exports. This is type-check validation,
  not a runtime or hosted acceptance test.
- The direct landmark and repair analyses, plus the paired 95-clip metric run,
  are complete under `motion-pipeline/temp/experiments/20261006-metric-baseline/`.
  Its scripts, row-level outputs, and provenance are Git-ignored and private.
  The non-identifying aggregate results and decisions are in the companion
  [lab entry](2026-10-06-preprocessing-metric-validation.md). An independent
  reviewer reproduced the calculations and checked frozen pose hashes,
  manifest joins, and person-group splits.
- A fixed person-grouped combination pilot is complete under
  `motion-pipeline/temp/experiments/20261006-heldout-metric-combination/`.
  Existing Qijia, Viona2D, and 3D-angle features did not beat a training-fold
  constant baseline on the 95 selected clips. This is not an untouched
  external validation cohort.
- A blinded 48-case first-pass adjudication manifest is prepared under
  `motion-pipeline/temp/experiments/20261006-repair-adjudication-v1/`.
  `blinded/first_pass_manifest.json` contains source cases in shuffled order;
  the full candidate pool and answer key live under `sealed/`. Never expose
  the sealed files during judging. The independent reviewer verified exact
  regeneration, source hashes, and selection probabilities. Nothing was
  added to the active annotation server or database.
- The `motion-pipeline/temp/experiments/20261006-*` scripts, row-level results,
  blinded manifest, and sealed answer key are ignored local research files in
  this checkout. They are not in the PR and must be located in authorized
  private storage if the next agent works on another machine. The checked-in
  `lab-log/assets/2026-10-06-preprocessing-metric-validation/` files contain
  aggregate summaries only; they cannot regenerate participant-level analyses.
- No automatic usability exclusion or repair rule is validated. Current
  `calculationQuality` measures evidence sufficiency, not the chance a score
  matches human judgment. The fixed visibility gate loses substantial
  coverage without an established rating-correlation gain.
- No thesis chapter edit was made because these findings remain exploratory.

## Rerun

From the code repository root, with the motion-pipeline virtual environment
available (the same pinned environment as `motion-pipeline/.venv`):

```sh
motion-pipeline/.venv/bin/python motion-pipeline/temp/experiments/20261006-metric-baseline/landmark_signal_baseline.py
motion-pipeline/.venv/bin/python motion-pipeline/temp/experiments/20261006-metric-baseline/repair_baseline.py
node motion-pipeline/temp/experiments/20261006-metric-baseline/quality_aware_95.mjs
motion-pipeline/.venv/bin/python motion-pipeline/temp/experiments/20261006-metric-baseline/analyze_quality_95.py
```

The Node runner needs frontend dependencies installed. It checks the frozen
raw-pose hashes and reference windows for all 95 pairs before scoring and
writes `quality_aware_95.csv` and `quality_aware_95_provenance.json` beside
the script. `analyze_quality_95.py` writes `quality_aware_95_analysis.json`.
The Python scripts write `landmark_signal_results.json` and
`repair_results.json` plus clip counts. The source annotation database and
pose files are read-only inputs; the scripts write only to this experiment
directory. The copied aggregate assets in the lab entry do not include
participant rows or machine-specific source paths.

The final held-out fitting pilot runs from the code repository root with:

```sh
motion-pipeline/.venv/bin/python motion-pipeline/temp/experiments/20261006-heldout-metric-combination/analyze.py
```

It writes `results.json` and private `grouped_predictions.csv` in its own
experiment directory. It checks the frozen joins and metric source versions,
fits preprocessing within each person-disjoint training fold, and trains on
one study before testing on the other. Its non-identifying aggregate is
linked from the lab entry.

The private adjudication queue is reproduced with:

```sh
motion-pipeline/.venv/bin/python motion-pipeline/temp/experiments/20261006-repair-adjudication-v1/prepare.py
```

It writes the sealed pool/key, blinded first-pass manifest, and a
non-identifying `selection_summary.json`. The aggregate summary is copied
into the companion lab entry. Do not publish the private case files, which
contain participant-derived frame and pose details.

## Review screen (2026-11-05)

- A separate screen now exists at
  `motion-pipeline/motion_extraction/repair_adjudication/` (see its README).
  It has its own server and its own append-only SQLite file; triggers reject
  `UPDATE`/`DELETE`, and it refuses any database it did not create, including
  the active annotation database. It loads only the blinded manifest, refuses
  any input path with a `sealed` component, checks the frozen
  `blinded_first_pass_sha256` by default, and sends the browser only blind
  ID, frame, fps, landmark, tracked point, and optional context points. It
  records `acceptable_as_is`, `incorrect_correctable` (optional dragged
  point), or `unjudgeable`, with a note and the frames viewed.
- Validated with synthetic cases only: 19 focused tests, the existing
  annotation-tool tests, and a headless Chromium dry run at desktop and 375px
  width (landscape and portrait clips, drag-to-correct, save, export).
- The October v1 bundle is lost. On 2026-11-05 the private
  `20261006-repair-adjudication-v1/` folder (blinded manifest, sealed key,
  `prepare.py`, and the repair script) was not in Viona's main checkout, the
  other local worktrees, `~/.codex/worktrees`, or the Drive remotes. It was
  never committed. Viona never saw the v1 key.

## Rule v2 and the v2 blinded sample (2026-11-06)

Viona chose to rebuild rather than keep searching, and then to adopt the
re-implementation as the rule under test.

- `motion_extraction/repair_adjudication/isolated_jump.py` (rule v2) uses
  image pixels and a per-frame torso length (shoulder midpoint to hip
  midpoint), with the lab-log thresholds 0.15 / 0.3 / 0.8. Both neighbors
  must be inside the reviewed segment and on frames not marked unusable.
- On the frozen release `20261002-first-manual-review` (manifest sha
  `00695156…`, database snapshot `9393ac83…`, all 48 raw-pose hashes
  checked), the inputs reproduce exactly: 745 saved corrections, 735 targets,
  and 43,456 positions. The rule counts do not reproduce October's:
  42 marked targets flagged (35 moved closer) versus 35 (29), and 179
  unmarked flags versus 161. The mean target distance on all 735 is
  0.397 → 0.388 versus 0.327 → 0.320. Three torso definitions and
  image-normalized coordinates were tried; none matched, and fitting stopped
  there. The October figures came from a lost script and remain unverified.
- `prepare_sample.py` drew a stratified simple random first pass with seed
  20261106: 24 of 78 unmarked arm/shoulder flags, 12 of 101 unmarked hip
  flags, and 12 of 41,402 unmarked, unflagged positions where the rule was
  computable. Marked positions are never sampled. The 48 cases come from
  24 recordings, and their order and `V2-` blind IDs are shuffled.
  Regeneration was byte-identical. The aggregate is in
  [repair-adjudication-v2-selection.json](assets/2026-10-06-preprocessing-metric-validation/repair-adjudication-v2-selection.json).
  The blinded manifest sha `59805bdb…` is now the review screen's default.
- Source videos are the original files under the repository `data/`
  directory on Viona's MacBook. All 48 were hash-matched, and each has
  exactly as many frames as its raw pose. The pose pixel space equals the
  video dimensions (no rotation), so points are normalized by them. One case
  was opened in headless Chromium, and the overlay sat on the dancer.
- Storage: the complete private bundle (blinded, sealed, summary) and
  `video_info.json` are on Drive at `agentoutput:repair-adjudication/20261106-v2/`.
  Only `blinded/first_pass_manifest.json` and `selection_summary.json` are on
  the MacBook, in the ignored
  `motion-pipeline/temp/experiments/20261106-repair-adjudication-v2/`.
  The sealed key is deliberately not on the review machine.
- Viona's frame-review note on her first case reads: "estimated hip
  position is often inaccurate -- I didn't bother to mark these." Unmarked
  hips were therefore not treated as correct, which bears on the many hip flags.
- No judgments have been collected.

## Decision and single next action

Keep preprocessing and production similarity defaults unchanged. The single
next action is Viona's blinded source-video review of the 48 v2 cases, run
from `motion-pipeline` on her MacBook with this branch checked out:

```sh
.venv/bin/python -m motion_extraction.repair_adjudication.server \
  --blinded-manifest temp/experiments/20261106-repair-adjudication-v2/blinded/first_pass_manifest.json \
  --media-root ../data \
  --database temp/experiments/20261106-repair-adjudication-v2/adjudication.sqlite3
```

After the judgments are frozen, unseal the key from Drive and analyze arm
and hip strata separately with their inclusion probabilities. The original
brief for the review screen follows: build a small,
separate review screen with an append-only database for the prepared blinded
48 cases. Reuse source-video seeking and
landmark dragging where possible, but display only the blinded manifest and
record a distinct acceptable-as-is, incorrect/correctable, or unjudgeable
response by blind ID. Do not reopen the completed active frame tasks for this
protocol or alter their database. Start by inspecting the current hosted
discrepancy review and local annotation interfaces on `main`; keep this
adjudication protocol distinct from their existing records. After source-video
judgments, analyze arm and hip strata separately using the frozen inclusion
probabilities; only then estimate the exploratory rule's false-correction
cost.

A later balanced direct-human-rating cohort must test any predeclared
similarity metric with both studies, reference windows, and current-code raw
control explicit.
