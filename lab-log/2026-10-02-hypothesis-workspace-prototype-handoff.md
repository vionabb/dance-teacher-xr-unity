# Hypothesis workspace handoff

Updated 2026-11-05. Continue on `codex/research-hypotheses-prototype` in
[PR #414](https://github.com/vionabb/dance-teacher-xr-unity/pull/414). This PR
reconciles the prototype with `main` at `abd836a` (research navigation #433),
including hosted research/discrepancy review, password login, and the earlier
test/type repairs. Keep this PR's review history; do not open a duplicate.

## Start here

Read `AGENTS.md`, `svelte-web-frontend/README.md`, and
[research-workspace.md](../documentation/research-workspace.md). The
[original request](2026-10-02-hypothesis-workspace-prototype.md),
[collection management](2026-10-03-hypothesis-collection-management.md), and
[review fixes](2026-10-05-hypothesis-pr-review.md) explain earlier decisions.
The [reconciliation entry](2026-11-05-hypothesis-main-reconciliation.md)
records this integration and its validation.

## Implemented and settled

- `/research/hypothesis` and `/research/hypothesis/<slug>` are development and
  loopback only. The shared navigation's **Hypotheses** link appears only for
  local research access. Hosted accounts retain main's existing tools.
- Five candidates read overview prose from cited lab-log Markdown. Newly
  created hypotheses have draft SQLite overviews. Workflow status is distinct
  from scientific support; the initial wording still needs Viona's review.
- Index chat adds, renames, changes status, removes, and restores hypotheses.
  Renaming keeps the URL. Removal is reversible and preserves the history.
  Detail chat supports explicit status commands and `Save a finding: ...`.
  Findings display their stored UTC timestamps consistently across locales.
- Explicit intent, complete target names, Unicode fallback URLs, duplicate
  handling, and stale-response checks retain the PR feedback fixes. A stale
  or duplicate operation saves an explanation without applying changes.
- Both conversations start a separate, read-only local Codex CLI invocation;
  they are not the live desktop task and cannot execute analyses or add tools.
- SQLite schema v4 retains main's discrepancy observations and the hypothesis
  tables in one atomic upgrade. Both observation types retain their backup
  behavior. Lab logs, original annotations, and participant media remain
  read-only inputs. No thesis claim changed.

## Resume and validate

Use Node 24 and pnpm 9.12.2. From `svelte-web-frontend/`:

```sh
pnpm install --frozen-lockfile
pnpm test -- --run src/lib/server/hypothesis-assistant.test.ts src/lib/server/hypothesis-detail-intent.test.ts src/lib/server/hypothesis-collection-intent.test.ts src/lib/server/research-hypotheses.test.ts src/lib/server/research-store.test.ts
pnpm check
pnpm lint
pnpm test:research-schema
node scripts/verifyHypothesisWorkspace.mjs
node scripts/verifyResearchNavigation.mjs
```

Provide the placeholder environment values described in the reconciliation
entry for `check`/build validation. The local UI script creates and removes a
disposable SQLite database with a synthetic finding. It uses loopback port 5202
(override `HYPOTHESIS_VERIFY_PORT`) and makes no Codex calls. The production navigation
script builds the app and uses synthetic auth on ports 5198/56438; it verifies
that authorized hosted users cannot GET or POST either hypothesis route.
Both scripts write ignored verification reports and screenshots under
`artifacts/`. They do not test a real Codex response.

For manual use, select an unused loopback port and an explicit, Git-ignored
`RESEARCH_SQLITE_PATH`, then run `pnpm exec vite dev --host 127.0.0.1 --port
<port> --strictPort`. Real chat requires an installed, signed-in Codex CLI.
Preserve running annotation services and existing research databases. Older
main/checkouts reject schema v4: use a separate database or a verified
pre-upgrade snapshot rather than changing the version marker. This PR adds
no hosted database migration and does not migrate local hypotheses to Supabase.

## Next agent's task

First review PR #414's shared-store migration and local navigation against the
recorded main SHA, then reproduce the focused and browser checks above. The
full frontend suite additionally needs the private CHI25 ratings CSV via
`HUMAN_RATINGS_PATH` and hydrated LFS fixtures; do not fabricate that source or
restore the removed ratings fixture to Git. See the reconciliation entry for
current results and remaining gates.

After that review, ask Viona to select the first hypothesis investigation and
agree its evidence source, tool output, and acceptance criterion before adding
a tool. Permanent deletion, citation/revision rules for findings and new
overviews, and hosted hypothesis/chat support remain separate decisions. A
hosted extension must use the existing research authorization on every page,
action, API, and media route and define durable ownership/storage and a worker
runtime; serving the local CLI/SQLite prototype remotely is not sufficient.
