---
date: 2026-10-05
tags: [research-workspace, hypotheses, prototype, pr-review]
artifacts: []
---

# Hypothesis prototype PR feedback

Viona asked to address the feedback on PR #414. The review identified
loose per-page intent checks, overlapping collection titles, failed Unicode
and duplicate creation, stale responses overwriting later changes, a possible
Codex stdin error, and a schema version marker committed before table creation.
The reviewer reproduced the overlapping-title and Unicode-title failures.

The detail conversation now accepts explicit status commands and findings
introduced by `Save a finding: ...`; negation and discussion suppress proposed
writes. Collection commands distinguish complete names, including overlapping
and duplicate titles. Unicode titles receive a stable ASCII hash URL when
normalization yields no ASCII name. Duplicate URL names preserve the turn as
conversation with an explanation and apply no changes.

Collection reads capture a consistent revision. The write transaction checks
it after acquiring the SQLite lock. A stale response preserves the conversation
but applies no operations, so concurrent requests cannot reverse each other's
rename or visibility changes. A detail discussion does not invalidate the
collection revision; a detail status or finding change does. The Codex
subprocess handles stdin errors, including EPIPE after a failed spawn. Schema
creation and migration now commit all tables and the version marker together.

Older code still refuses a newer schema version, which protects research state
from unsupported writers. Returning to older code requires a separate database
path or a verified pre-upgrade snapshot. No research result or thesis claim
changed.

Validation: 31 focused regression tests passed and exercise the review's
messages, ambiguous names, Unicode and normalized URL collisions, retained
conversations, concurrent writes, detail/index revision interactions, failed
subprocess input, and schema DDL rollback. Changed-file ESLint and the production
build passed.
`pnpm check`, with placeholder environment values, still reports 56 errors
and 12 warnings outside the changed files. The earlier full-suite fixture and
DTW failures are recorded in the handoff.
