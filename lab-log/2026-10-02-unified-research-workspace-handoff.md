---
date: 2026-10-02
tags: [research-workspace, handoff]
artifacts: []
---

# Unified research workspace: current handoff

## Status

The architecture direction is recorded in the [dated entry](2026-10-02-unified-research-workspace.md).
The owning [workspace direction](../documentation/research-workspace.md) and
[issue #407](https://github.com/vionabb/dance-teacher-xr-unity/issues/407)
record the accepted data boundary and first-slice acceptance.
Implementation started from `main` at `b1a475eb72ee28fff659f4980fdb60c59771249c`
in an isolated checkout. [PR #408](https://github.com/vionabb/dance-teacher-xr-unity/pull/408)
records the direction; [PR #409](https://github.com/vionabb/dance-teacher-xr-unity/pull/409)
adds the local read model on top of it. [PR #411](https://github.com/vionabb/dance-teacher-xr-unity/pull/411)
adds the usability table and a local-only authoring queue on top of #409.
[PR #413](https://github.com/vionabb/dance-teacher-xr-unity/pull/413)
adds the frame correction tool on top of #411. All four PRs are open for review.
The original annotation SQLite database remains outside this checkout; #413
writes frame revisions to it through the original Python validator.
On October 2, `origin/main` at `2b8212a` was merged into the top stack branch
for #411. The Vercel preview build exposed a Linux `GLIBC_2.38` requirement
when the local research SQLite module loaded during build. A separate mainline
deployment failed when the updated Vite parser encountered optional TypeScript
parameters in the two metric inspector pages. The top branch now defers native
SQLite loading until a local research operation and uses explicit `| undefined`
parameter types in those pages. Its exact-lockfile local production build,
frontend lint, and focused research tests pass. The
[Vercel preview rebuild](https://vercel.com/j55blanchets-projects/dance-teacher-xr-unity/3tv5SVJxzK36mGW8jHmBVak3qAV8)
for #411 completed successfully, and the frontend smoke check passed. The
production deployment from `main` still needs these changes merged through
the normal review path.
The same current `main` merge was propagated through #408, #409, and #411.
The Vite parser fix now lives in #408, and the research-store SQLite loading
fix lives in #409; #411 retains its separate legacy-annotation SQLite loading
fix. Each layer can be reviewed and deployed independently.

## Settled boundaries

- One SvelteKit research interface and one canonical JavaScript metric
  implementation; Python remains available as a worker for pipeline stages.
- Local SQLite for app-managed research metadata and future records; local
  hashed files for media, poses, and full per-frame outputs. Supabase continues
  to serve learner data and sign-in.
- Existing manual-review source databases remain the authority for their
  existing tasks and frame corrections. New whole-video usability ratings are
  appended to the local research SQLite database with verified snapshots.
  Frozen releases and their rebuildable catalog remain read-only inputs.
- Prior-study human similarity ratings, pose-tracking usability judgments,
  manual corrections, and metric outputs retain distinct meanings and sources.

## First stack

1. Record the direction, data ownership, and first-slice acceptance criteria.
2. Add the local research store and a read-only adapter for a frozen review
   release and prior-study ratings. The first slice must not copy source media,
   change the active annotation database, or replace the current metric export.
3. Add a researcher-only read path in the SvelteKit app with focused checks of
   authorization, identity joins, and displayed provenance.

The fourth stack moves frame correction authoring into Svelte while retaining
the legacy revision store. Later work can reconcile both usability authoring
paths, extract a normal metric batch runner from Vitest, and add Python job
orchestration. Keep each data-producing stage versioned and preserve exact
input identities.

## Validation and current limits

- The frozen `20261002-first-manual-review` manifest and prior-study rating CSV
  imported into the isolated checkout's ignored `local-data/research.sqlite3`:
  154 video, 48 frame, and 1,570 human-rating records.
- A synthetic Vitest case verifies repeatable import, source-file immutability,
  frame-stage override provenance, and rejection of a changed source.
- The full Vite build passed after restoring three existing Git LFS JSON/CSV
  files from the original checkout into the isolated checkout for the build.
  They were restored to pointer form afterward and are not part of the PR.
- After merging current `main`, `pnpm install --frozen-lockfile` and a production
  build with local placeholder Supabase values passed using the updated
  SvelteKit/Vite lockfile. The Git LFS files are still locally materialized for
  the running research preview and remain excluded from commits.
- `/research/records` now shows all 134 CHI25 participant video reviews in a
  study/dance/user/condition/segment table, plus 20 reference reviews. Seven
  participant source filenames have no user ID; they remain visible and cannot
  join to the CHI25 human-rating CSV.
- The rating queue currently finds 691 unrated clips with exact segment-level
  prior-study human similarity ratings from at least one of the three raters.
  It uses the explicit study 1 `sheetmotion`/`sheet` source-name equivalence.
  The queue fills sparse coverage cells and alternates the suspected problem
  segments in the October 1 lab log with comparison segments within ties.
- Whole-video ratings live in `local-data/research.sqlite3`; a verified
  snapshot is made after each save. Frame corrections in #413 use the original
  annotation DB and its append-only `judgment_revisions` history.
  The local rating page plays the frozen clip with a tracked baseline skeleton
  overlay. Safari
  playback was checked. The Codex in-app browser crashed when playback was
  tried, although its read-only table and media HTTP endpoints worked.
- #413 reads all 49 follow-up frame cases, resumes existing revisions, and
  offers sparse labels and landmark correction at `/research/frames`. A
  synthetic test verified an append and stale-revision rejection; the live
  database was only read during validation. Playwright captures and viewport
  assertions passed at 375×667, 390×844, 994×575, and desktop; production
  build and focused lint pass. Repository-wide `svelte-check` still has 64
  pre-existing errors and 12 warnings outside the new frame files.
- Researcher role authorization, pagination, and job orchestration remain
  open. All research routes remain dev-loopback only.

## Next action

Review the open stack and test new usability reviews on eligible CHI25
segments. Compare the resulting balanced sample with the October 1 coverage
targets. Keep research routes on local loopback. Before any remote serving,
add researcher-role authorization to every research page, API, and media route.
Try the frame editor in #413 with the paired local manifest and annotation
database. Metric batch jobs and Python orchestration remain later work.
