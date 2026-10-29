---
date: 2026-10-28
tags: [research-studio, hosting, discrepancy-review, supabase, codex]
artifacts:
  - assets/2026-10-28-hosted-cloud-readiness/verification.json
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

## Validation

Final local validation passes: 31 focused tests across eight files, the isolated
Postgres schema/role suite, `pnpm check` (zero errors, 12 existing warnings),
`pnpm lint` and the production build. The combined synthetic browser script
covers both metric components, the root catalog links, queue pagination,
owner/input draft separation, viewer controls, failed/reloaded/changed retries,
media reload/denial, crop metadata and portrait/landscape tablet plus phone
widths. A rapid-navigation run initially recorded canceled dynamic imports;
moving the pointer away before navigation prevents unintended hover prefetch,
and the combined suite passes without discarding page errors. Diagnostics are
retained in the script for future failures. Temporary synthetic configuration
was removed afterward.

Svelte autofixer passes on the portable UI and recovery components. The root
catalog's resolved path-plus-query expressions still receive navigation
warnings from the analyzer; type checking and browser link checks pass. Required
daisyUI Blueprint tools were unavailable. These are synthetic browser and local
database checks, not production or actual iPad acceptance.

## Resumption

Review the canonical rollout steps. Media-source recovery is integrated and
synthetically verified; production HEAD/CORS and actual iPad acceptance remain.
Draft [PR #431](https://github.com/vionabb/dance-teacher-xr-unity/pull/431) is
published on the newly merged main. Its first CI run is pending. Keep production
data and access unchanged until the targeted import and backup gates are ready.
The single next action is to prepare that reviewed targeted import and verify
managed backups; Vercel deployment remains rate-limited. Never push the old discrepancy branch ancestry.

## Authorized production import and readiness follow-up

Viona explicitly requested finishing production import and backup verification
while Vercel is blocked, and clarified that the web agent should use her own
ChatGPT subscription; she does not anticipate another portal user. The hosting
chat continues to own cloud mutations and deployment preparation.

Applied the reviewed schema through Supabase MCP. Its recorded migration version
is `20261029031032`; the SQL file was renamed byte-for-byte to align with remote
history. The insert-only importer completed: 20 additional private reference
poses/maps, 1,570 ratings, one metric manifest and 1,724 analysis recordings.
There are 743 exact review tasks (591 Study 1,152 Study 2). The 1,756 original
media pairs and all 55 prior material rows remain unchanged; materials now total 75.
No production test observations were written.

The before/after snapshots restore every research row identically in isolated
Postgres WASM. Snapshot SHA-256 values are respectively
`83abc62f80b738224f35a88cceba81d4f565401959e7ebeee4f21b5f48046656`
and `b08e014a732c56ba811af5786da5fd4ebec24db3d04dc1691e74bee3e7e77d2b`.
These private snapshots cover research rows only; they do not back up Auth
credentials or Storage bytes. The restore recipe now advances the note identity
sequence and proves that a restored nonzero ID permits the next append.

Production read-only checks verified authorized study visibility, zero rows and
zero private objects for an unlisted account, anonymous denial, all 20 reference
pose hashes/byte counts, current metric-manifest agreement and signed video
HEAD 200/CORS plus 206 byte ranges. The public Storage URL remains denied.
Pro shows daily backup scheduling with seven-day retention, but no first backup
available yet. Automatic review rejected the initial Drive attempt before upload;
Viona subsequently authorized the research Drive via rclone. Seven files now
match on download-based verification at
`agentoutput:2026-10-28-hosted-chi25-backups/`: before/after/post-grant snapshots,
their restore reports and the cloud verification report. The primary account is
now editor for both studies, while the older account remains viewer. Source
updates and observation updates/deletes remain denied. The post-grant snapshot
SHA-256 is `7b15cdbdffa008ea0651d605e4706e7dc913aa560a832d039596377e194a726f`;
its isolated restore and next-append identity proof pass. No production test
notes were created.

The other chat independently reviewed the boundary and found a stale-tab
provenance gap. Imported its fix as `dbb3bb4`: the composer binds notes/drafts to
the loaded performance input version and the browser's compiled metric release;
missing or changed bindings are rejected. Current retries remain idempotent.
All 35 focused tests pass after integration; the combined synthetic browser suite
also passes with stale-draft retention and source-recovery cases. Schema/RLS,
`pnpm check` (zero errors, 12 existing warnings), lint and production build pass.

Signed-in Vercel dashboard inspection still identifies production as 9b130fd
(#429). The owner 100/day quota is documented; neither the inspected dashboard
nor GitHub's 24-hour retry hint establishes an absolute reset timestamp. No
manual deployment attempts were made. Existing advisor warnings concern the
legacy signup function/Auth settings and intentional authenticated GraphQL
schema discoverability; all research tables have RLS and live denial checks pass.

The canonical hosted-workspace document now records the single-owner SIWC/VM
path, its unresolved hosted-app eligibility/licensing boundary, the external
interest-request content needed if required, and the remaining operator/device
gates. No subscription credentials or API/compute billing were provisioned.

[Production verification summary](assets/2026-10-28-hosted-cloud-readiness/verification.json) contains counts/statuses only, with no credentials or account identifiers.
