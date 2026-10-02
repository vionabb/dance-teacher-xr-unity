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
adds the local read model on top of it. Both are draft PRs. The active
annotation server and its SQLite database are outside this checkout and must
not be modified as part of the initial read-only work.

## Settled boundaries

- One SvelteKit research interface and one canonical JavaScript metric
  implementation; Python remains available as a worker for pipeline stages.
- Local SQLite for app-managed research metadata and future records; local
  hashed files for media, poses, and full per-frame outputs. Supabase continues
  to serve learner data and sign-in.
- Existing manual-review source databases remain the annotation authority
  until a separate verified authoring cutover. Frozen releases and their
  rebuildable catalog are read-only inputs.
- Prior-study human similarity ratings, pose-tracking usability judgments,
  manual corrections, and metric outputs retain distinct meanings and sources.

## First stack

1. Record the direction, data ownership, and first-slice acceptance criteria.
2. Add the local research store and a read-only adapter for a frozen review
   release and prior-study ratings. The first slice must not copy source media,
   change the active annotation database, or replace the current metric export.
3. Add a researcher-only read path in the SvelteKit app with focused checks of
   authorization, identity joins, and displayed provenance.

Later stacks can move the two current annotation workflows, extract a normal
metric batch runner from Vitest, and add Python job orchestration. Keep each
data-producing stage versioned and preserve exact input identities.

## Validation and current limits

- The frozen `20261002-first-manual-review` manifest and prior-study rating CSV
  imported into the isolated checkout's ignored `local-data/research.sqlite3`:
  154 video, 48 frame, and 1,570 human-rating records.
- A synthetic Vitest case verifies repeatable import, source-file immutability,
  frame-stage override provenance, and rejection of a changed source.
- The full Vite build passed after restoring three existing Git LFS JSON/CSV
  files from the original checkout into the isolated checkout for the build.
  They were restored to pointer form afterward and are not part of the PR.
- `/research/records` is local and development-only. Identity joins, pagination,
  researcher role authorization, annotation authoring, and job orchestration
  remain open. The active annotation database is still the writer.

## Next action

Verify the manual-review segment identities against prior-study study/dance/
participant/segment keys, recording exact matches and ambiguous or unmatched
cases. Then add the researcher authorization boundary before any remote serving.
