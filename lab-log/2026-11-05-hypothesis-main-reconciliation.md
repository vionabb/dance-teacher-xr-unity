---
date: 2026-11-05
tags: [research-workspace, hypotheses, handoff, integration]
artifacts: [assets/2026-11-05-hypothesis-main-reconciliation/verification.json]
---

# Reconcile the hypothesis workspace with current main

Viona asked to reconcile the hypothesis work with latest main and prepare a PR
with handoff instructions for another agent. PR #414 remains open, so it is
updated in place. The current remote hypothesis branch uses rewritten history;
the reconciliation starts from remote head `f78c6a0` and merges main `abd836a`
(research shortcuts/shared navigation #433), retaining the intervening hosted
analysis, discrepancy, login, test, and type-check repairs.

The four conflicts were in the research homepage, SQLite store, workspace
documentation, and lab-log index. The homepage retains main's hosted/local
behavior. The hypothesis shortcut moves into the shared navigation and appears
only when the server grants local development access. The SQLite upgrade keeps
both discrepancy observations and hypothesis tables inside the atomic schema
transaction. A regression test starts with a populated main-v2 discrepancy
database, upgrades it, writes both observation types, and verifies that a
hypothesis snapshot retains the original discrepancy note. Both documentation
sections and all dated index entries are retained.

A remaining review note identified locale-dependent finding timestamps. The
detail page now displays the stored UTC value directly. A synthetic finding
is rendered with a UTC server and a French/Honolulu browser to verify stable
text and absence of hydration warnings. The exact non-command messages in the
outdated intent review thread are also included in the regression cases.

The [living handoff](2026-10-02-hypothesis-workspace-prototype-handoff.md) now
contains the implemented scope, settled decisions, setup and test commands,
database precautions, remaining data prerequisites, and the next agent's
concrete task. Hypothesis routes remain local; this change adds no hosted
database migration or new research finding. No thesis edit is warranted.

## Validation

The [synthetic verification report](assets/2026-11-05-hypothesis-main-reconciliation/verification.json)
records the completed checks. From `svelte-web-frontend/` with Node 24 and
pnpm 9.12.2:

- `pnpm install --frozen-lockfile` and `pnpm lint` passed.
- The five hypothesis/store test files in the handoff passed all 34 tests.
- `pnpm check` passed with zero errors and 12 existing warnings. For a
  service-free check, set `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder`, `OPENAI_API_KEY=placeholder`,
  and `ANTHROPIC_API_KEY=placeholder`. The earlier October type-error baseline
  is superseded by main's repairs.
- `pnpm test:research-schema` passed its isolated ownership, authorization,
  provenance, retry, and export/restore checks.
- `node scripts/verifyHypothesisWorkspace.mjs` passed desktop/mobile local
  navigation, index/detail conversation visibility, and five-candidate checks
  with a disposable database and no model calls, plus cross-locale timestamp
  and hydration verification.
- `node scripts/verifyResearchNavigation.mjs` built production and passed
  hosted navigation, login, mobile layout, private caching, and negative
  hypothesis GET/POST checks for an authorized synthetic account.
- Svelte autofixer reports no issues for the shared navigation or hypothesis
  detail component. Its research
  homepage advisories flag existing concatenated `resolve(...)` expressions;
  these expressions already resolve their routes and match main unchanged.
- Installed Codex CLI 0.155.1 still advertises all subprocess flags used by
  the prototype. A live model turn was not part of these synthetic checks.

`pnpm test -- --run` passed 214 tests, with six skipped tests. Four study-metric
suites cannot initialize because this checkout lacks the private ratings CSV.
Supply the authorized source via `HUMAN_RATINGS_PATH` to complete those suites;
do not restore that private source to Git. The canonical frontend smoke tests
passed after hydrating the three committed reference fixture files with:

```sh
git lfs pull --include='data/test-fixtures/smoketest/database/attention_zoom_out.csv,data/test-fixtures/smoketest/pose_raw/attention_zoom_out.*.csv' --exclude=''
```

The single next action is another agent's review of PR #414's reconciled
migration and local access boundary, using the living handoff. Selecting a
hypothesis-specific investigation still requires Viona's evidence/tool contract.
