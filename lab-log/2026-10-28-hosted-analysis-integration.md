---
date: 2026-10-28
tags: [research-studio, hosting, discrepancy-review, supabase, codex]
artifacts: []
---

# Hosted analysis integration checkpoint

Viona accepted the existing read-only production release and requested researcher
access to the learner menu, the discrepancy review desk, both metric viewers,
and an in-site Codex conversation for tablet research with the Mac off. She
selected investigating ChatGPT subscription access rather than API billing.
The canonical design and remaining rollout gates are in
[hosted research workspace](../documentation/hosted-research-workspace.md).

Coordinated with the human-authorized **Add Rating Discrepancy Annotations** chat.
Imported its portable UI and local-backend follow-up as textual changes on the
rewritten repository ancestry. No old feature ancestry or ratings CSV was
reintroduced. The UI evidence and contract are recorded in
[the UI entry](2026-10-28-hosted-discrepancy-ui.md).

This branch adds the hosted registry/importer, immutable reference inputs,
account-owned append-only notes, RLS, authoritative database provenance,
request guards and hosted page/API adapters. Metric calculations remain
unchanged. The importer dry run found 1,724 identified recordings and 743 exact
rating/reference matches; 32 missing-ID videos remain in the raw collection.
It preserves all 1,570 source rating rows without coercing the anomalous whole
aggregate. Condition disagreements are excluded from the review queue.

The proposed transaction-wrapped production fixture test was rejected by
automatic review because it would temporarily modify real memberships and run
DDL. No SQL from that attempt executed. Replaced it with the isolated local
Postgres WASM harness `scripts/verifyHostedAnalysisSchema.mjs`, using synthetic
accounts and metadata. Its schema/role/version/provenance/retry/append-only
matrix and a lossless synthetic-note JSON export/restore pass. Production
migration, uploads, editor grants and managed backup/restore acceptance are
still pending. Do not rerun the rejected fixture method in production.

The subscription investigation checked both SIWC and native app-server login.
Official app-server guidance explicitly excludes native ChatGPT login for
hosted services. The SIWC hosted-registration route remains an eligibility
gate; the documented OSS VM procedure does not bypass it. No credentials were
moved and no model/compute billing was enabled.

PR #430's code checks pass, but Vercel reports a deployment rate limit and a
24-hour retry. Viona authorized merging it, and it merged as `bc26597`. This limits deployment;
it does not establish that the hosted analysis feature is live. No thesis
claims or evaluated outcomes changed.

## Resumption

Review the canonical rollout steps. Finish media-source reload integration and
its focused checks, publish the hosted-analysis PR on the newly merged main, and keep
production data and access unchanged until the targeted import and backup gates
are ready. Never push the old discrepancy branch ancestry.
