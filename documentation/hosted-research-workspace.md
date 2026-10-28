# Hosted research workspace for tablet analysis

Status (2026-10-28): **plan; the CHI25 read-only collection is deployed**.
Viona accepted that release and asked to use the learner menu with her research
account, add the discrepancy review desk and metric visualizers, and talk to a
Codex agent while doing research from her tablet at a cafe. Local workflows
are described in [research-workspace.md](research-workspace.md). The
[discrepancy hosting audit](../lab-log/2026-10-28-discrepancy-hosting-handoff.md)
records the verified feature branch, schema, sources, and portability limits.

## Proposed deployment

| Component                      | Host and responsibility                                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website                        | Existing SvelteKit/Vercel app: sign-in, learner menu, research navigation, visualizers, observations, and chat UI                                                                                                            |
| Research authority             | Existing Supabase Postgres: memberships, normalized catalog/ratings, append-only observations, analysis runs, conversation ownership and durable event cursors                                                               |
| Immutable files                | Private Supabase Storage: existing videos/raw poses/materials, additional reference inputs, versioned analysis outputs and source manifests; Drive remains the archive                                                       |
| Interactive visual metrics     | Tablet browser using existing TypeScript implementations; load the active segment and a small prefetch window; profile parsing/curves before adding a browser worker                                                         |
| Codex conversation and compute | Viona prefers investigating ChatGPT subscription access: an isolated persistent Node/Linux worker with Codex app-server is the candidate, subject to sign-in eligibility; website backend authorizes session and data access |
| Specialized processing         | A separate worker/sandbox only for jobs requiring custom native dependencies or resources; ordinary visual inspection needs no Python server                                                                                 |

This design must operate with Viona's Mac off. A local preview or workstation
Codex process does not meet the cafe use case. Vercel dispatches durable work;
it is not the annotation database or a persistent Codex subprocess host. Its
[function runtime limits](https://vercel.com/docs/functions/limitations) are
another reason to detach jobs from a browser request.

## Additional hosted inputs

The deployed collection has 675 Study 1 and 1,081 Study 2 video/raw-pose pairs,
five reference videos, two study-specific ratings CSVs, and 48 reviewed-pose
samples. It supports source browsing but does not replace the local metric
catalog yet.

| Input                          | Required work                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy reference segment poses | Register/upload 20 exact CSVs (9,461,451 bytes): Bartender 5, Last Christmas 4, Mad at Disney 5, Pajama Party 6. Use the hash-only inventory linked from the audit; reviewed poses are different artifacts.             |
| Reference timing               | Register dance/clip mapping, tutorial video identity, start/spacing, timestamps, mirroring and 30 FPS assumptions. Preserve row-index pairing and gaps.                                                                 |
| Recording metadata             | Add immutable recording/performance/segment metadata, ordered segments, durations and dimensions. Compute ffprobe/thumbnail metadata during import, not on web requests. Thumbnails can be deferred.                    |
| Identity aliases               | Local segment IDs hash `study1`/`study2`; hosted IDs hash `chi25_study1`/`chi25_study2`. Join through study/source stem and verified video/pose hashes; preserve legacy IDs as aliases.                                 |
| Normalized human ratings       | Import exact study/dance/participant/segment/condition rows into study-scoped relations, preserving missingness, original scales, source-row identity and original/split-file hashes. Preserve `sheetmotion` = `sheet`. |
| Build/metric manifest          | Version modules/configuration, coordinate space, pairing, coverage and input hashes. Browser-computed values remain diagnostic context until independently reproduced.                                                  |
| Optional analysis sources      | Import frozen usability/review snapshots only for analyses needing those constructs. Discrepancy review does not require a usability judgment or the active legacy annotation DB.                                       |

The inspected discrepancy database has zero observations. Recheck immediately
before import; later local work must be preserved. Existing source/annotation
databases keep their current writer until a verified transition.

## Hosted observations

Port the review desk's point/interval/whole-segment notes, directions, tags,
metric selection, replay and JSON export. Keep observations distinct from
prior-study similarity ratings, usability judgments and agent explanations.

- Bind writes to the authenticated owner UUID, study, hosted recording, exact
  artifact versions, metric/build/configuration and clip-local interval.
  Validate duration/source consistency on the server and in the database;
  do not accept arbitrary client ownership or provenance.
- Keep viewers read-only. Grant editor/admin capability through the existing
  administrative workflow before enabling annotation writes. Start with
  owner-scoped reads/exports and INSERT-only observations; corrections append
  superseding records when correction UX exists.
- Add explicit grants and RLS together. `requireResearchStudies` checks
  membership, not editor rights. Follow [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
  for ownership and access checks at the data boundary.
- Use per-owner mutation UUIDs so a network retry returns the original save
  receipt instead of duplicating an observation.
- Scope drafts by account, study, recording and input versions. Distinguish
  pending, failed and acknowledged saves. Reconnect/tab wake must preserve
  interval/draft state; browser drafts alone are not cross-device persistence.
  Refresh expired video URLs without discarding work.
- Define managed DB backup retention, researcher export and a restore drill
  before authoring rollout. SQLite `VACUUM INTO` is a local backup mechanism.

## Codex panel and analysis boundary

Integrate a conversation panel with the selected recording, interval, metric
configuration and observations. Show which context is attached, stream
progress, allow Stop, and link plots/tables/results to their actual run.
Persist session ownership and event cursors so a tablet can sleep, reconnect
or change pages without losing completed work. Agent suggestions remain
distinct from explicitly saved researcher findings.

The prototype on `codex/research-hypotheses-prototype` already has a local chat
UI, structured commands and audited findings. Its backend starts a new
`codex exec` process per message, reads Markdown from disk and stores SQLite
state. Reuse explicit mutation semantics/UI where useful, replacing those
local dependencies. A web conversation is a hosted research session; it does
not automatically become this desktop chat or inherit its credentials/tools.

### Subscription route: preferred investigation

Viona selected **investigate ChatGPT subscription access** on 2026-10-28.
The official [plan-usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
documents an optional OAuth capability for open-source/local tools; it directs
paid or remotely hosted apps to an interest process. Public repository
visibility alone does not establish eligibility; no repository license file
was found in this audit. The [hosted client-ID process](https://developers.openai.com/siwc/request-client-id)
is limited to selected partners. Availability for this website is unverified.

There is a documented [self-hosted VM route](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)
for an OSS tool: register that tool/account with its own protected credentials,
authenticate locally, transfer that registration securely to the VM, and let
the VM own refreshes with a distinct stable host ID. This is not reuse of the
existing Codex desktop credential file. Whether a personal VM worker behind
this website qualifies needs confirmation; it is not a workaround for hosted
app eligibility. A multi-researcher hosted sign-in must have supported app
registration, with each researcher supplying their own account authorization.

If that route qualifies, host a pinned Codex app-server on an isolated
Node/Linux worker, with Python/analysis dependencies and durable state. The
[subscription app-server guide](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
documents supplying the dedicated OAuth token and resuming threads after
renewal. Use **stdio** behind the authenticated backend. The
[app-server authentication guidance](https://learn.chatgpt.com/docs/app-server#auth-endpoints)
explicitly excludes commercial or hosted services from native app-server
ChatGPT authentication. Its headless/device-code login instructions do not
authorize using that login as a website service. Use the supported SIWC
registration path if eligible; do not expose app-server as the public website API. The VM/container's operating cost is separate from model usage.

Bind a Supabase owner to the validated ChatGPT registration subject/workspace
and its threads; do not identify registrations by email alone. Keep tokens
encrypted outside the agent workspace. Serialize rotating-token refreshes and
stop requests on disconnect, following [account/session guidance](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).
Do not share Viona's subscription across other app users. Persist/replay
conversation state through the worker, and register durable outputs in
Supabase rather than relying on the sandbox filesystem.

Plan usage supports eligible Responses requests and local execution tools;
its [preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
are not the same as the managed Agents API. Test a complete inference turn,
token renewal, cancellation and thread resume before committing to the adapter.
The documented restrictions include `store: false`/streaming and no hosted
Code Interpreter or Files upload API on that route. The worker can run its own
Node/Python tools against authorized inputs instead.

### API alternative: not selected or provisioned

If Viona later chooses API billing, the [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview)
offers managed Codex sessions; [hosted sandboxes](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted)
can provide Node/Python execution without our own worker. Project API access,
model/container costs and the current US-only/non-ZDR data boundary require
verification. Do not silently fall back to API billing from subscription auth.

Expose bounded backend tools: authorized catalog lookup, selected artifact
retrieval, observation lookup, reproducible metric jobs and explicit finding
saves. Each call rechecks user scope; a session ID is not authorization. The
agent receives neither a Supabase service-role credential nor unrestricted
database/Storage access. Use bounded downloads or narrow capabilities for
selected artifacts. Prefer pose/ratings context for numerical analysis and
make attached media explicit.

Runs record requester, input/reference hashes, code version, configuration,
pairing/missing-data rules, logs, status and output hashes. Reuse the same
TypeScript metric library in browser and sandbox. Queue jobs with durable run
IDs so closing the tablet tab does not silently cancel them. Scope sandbox
writes to scratch/output files. Findings use the audited app tool; application
deployment continues through repository review.

## Implementation sequence

1. **Navigation and acceptance record (current PR).** Allow `/menu` for research
   accounts; link it with hosted collections. Record Viona's production
   acceptance. This does not populate the empty learner catalog.
2. **Hosted visualizers.** Transplant the reviewed feature delta onto rewritten
   main without merging old ancestry. Register the 20 reference inputs and
   normalized catalog/ratings; replace `/api/dev` reads with hosted adapters.
   Match local input hashes, frame pairing and diagnostic outputs across both
   studies/all four dances, missing rows and later-segment navigation.
3. **Discrepancy authoring.** Add schema/RLS/API and account-scoped drafts, then
   extend the access command with validated role selection and preservation of
   existing grants, and grant intended editor access administratively. The
   current command always grants `viewer`. Verify save/reload/export,
   retries, owner spoofing, cross-study/source-version denial, viewer denial
   and restore/export recovery.
4. **Codex conversation.** Resolve supported subscription registration/hosting,
   verify a dedicated sign-in and complete inference/refresh/resume, then
   implement the worker/session adapter, panel and bounded data tools. Prove
   account isolation, cancellation, reconnect, visible failures and usage limits.
5. **Reproducible remote analysis.** Enable small Node/Python jobs and output
   registration. Reproduce a browser metric, export a plot, reconnect after
   tab closure and save an explicitly requested finding with lineage. Larger
   batch processing/pose extraction needs its own dependencies and acceptance.

Stages 2–5 include actual tablet Safari portrait/landscape, touch controls,
on-screen keyboard, slow/interrupted Wi-Fi, tab sleep/wake and signed-URL
renewal. Verify the workflow with the Mac off. Keep the accepted read-only
collection usable throughout. Routes, direct data requests, exports, writes
and agent sessions must enforce study/account scope.

## Implementation checkpoint (2026-10-28)

The menu change merged as PR #430 (main `bc26597`) after Viona authorized the merge. Its GitHub code checks
pass; Vercel reports a deployment rate limit with a 24-hour retry. Production
has not yet received the new menu, visualizers or discrepancy authoring.

The next branch integrates both metric viewers and the discrepancy desk with
hosted catalog/reference adapters. It preserves the loopback-only local backend.
Hosted notes use study-specific editor/admin access, account ownership,
append-only rows, UUID retry receipts, explicit JSON-origin checks and bounded
request bodies. A database trigger records authoritative source and metric
provenance; submitted display context is labeled diagnostic. Input versions
and the built metric fingerprint must match before a save is allowed. A changed
metric release needs an explicit registry migration; inputs are not silently
replaced after observations reference them.

The importer dry run validates 20 additional reference CSVs, all 1,570 original
rating rows and 1,724 identified recordings. It finds 743 exact eligible
recording/rating/reference joins (591 Study 1, 152 Study 2). Of Study 2's
identified recordings, 450 match participant/dance/segment but differ in the
condition, and 447 have no such rating row. Do not drop condition from the join
or infer a correction. The 32 videos with missing participant identifiers stay
in the accepted raw collection. These counts describe data availability, not
metric validity or a representative review sample.

The migration and role matrix pass against isolated Postgres WASM with
synthetic accounts. Tests cover owner/study isolation, editor/viewer/revocation,
append-only permissions, interval/input-version validation, authoritative
provenance and retry uniqueness. The synthetic note JSON export/restore check
preserves every column. This is not a production backup or restore drill.

## Next action

1. Verify PR #430's production deployment once Vercel permits it. Review the hosted-analysis PR with its data/schema gates.
2. Apply only `20261028210107_hosted_discrepancy_review.sql` through the reviewed
   targeted workflow. Do not use general `db push` across production's older
   migration-history gap. Run `scripts/importChi25Analysis.mjs` with approved
   local source roots, first dry-run, then `--upload` with a temporary server-side
   admin configuration. It verifies existing video/pose/material hashes and
   downloads the 20 newly uploaded poses to verify their hashes.
3. Reconcile hosted counts and test authenticated read access and viewer denial
   before enabling editors. Confirm managed backup retention and perform a
   separate staging restore drill. `RESEARCH_ROLE=editor` with
   `scripts/manageResearchAccess.mjs` grants note authoring; its default preserves
   existing roles and creates new memberships as viewers. Media remain read-only.
4. Finish preview/production account tests, actual iPad Safari portrait/landscape,
   interrupted Wi-Fi, source refresh after tab sleep and large-performance
   profiling. Synthetic responsive Chromium tests do not establish device acceptance.
5. For the Codex stage, resolve hosted SIWC registration/eligibility and the
   repository's licensing decision. Native app-server ChatGPT login does not
   authorize a hosted website. No compute service, subscription authorization or
   API spending has been provisioned. The candidate architecture remains an
   isolated persistent worker behind the authenticated website and Supabase.
