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
in an isolated checkout. The open stack is [#408](https://github.com/vionabb/dance-teacher-xr-unity/pull/408)
for the direction, [#409](https://github.com/vionabb/dance-teacher-xr-unity/pull/409)
for the local SQLite read model, and [#411](https://github.com/vionabb/dance-teacher-xr-unity/pull/411)
for the usability table and local whole-video authoring queue. The active
annotation server and its SQLite database remain outside this checkout; the
SvelteKit queue reads the legacy database without writing to it.

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
3. Add a local development read path in the SvelteKit app with focused checks of
   loopback access, identity joins, and displayed provenance. Add researcher-role
   authorization before research routes are served remotely.

Later stacks can move the two current annotation workflows, extract a normal
metric batch runner from Vitest, and add Python job orchestration. Keep each
data-producing stage versioned and preserve exact input identities.

## Next action

Review the open stack and test the new usability queue with eligible CHI25
segments. Keep research routes on local loopback. Before any remote deployment,
add researcher-role authorization to every research page, API, and media route.
Frame-correction authoring, metric batch jobs, and Python orchestration remain
later work.
