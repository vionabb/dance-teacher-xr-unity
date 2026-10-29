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
   command validates `RESEARCH_ROLE` and preserves existing roles when omitted. Verify save/reload/export,
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

PR #430 merged at main `bc26597`. The signed-in Vercel dashboard still identifies
production as `9b130fd` (#429); the new menu is therefore not live yet.
[PR #431](https://github.com/vionabb/dance-teacher-xr-unity/pull/431) contains the
hosted viewers, review desk and cloud adapters. The browser now sends its compiled
metric release and the input version from the loaded performance; newer server
metadata cannot silently relabel an old tab or its draft.

The targeted production migration is applied. Supabase assigned version
`20261029031032`; the byte-identical repository migration was renamed to match
that recorded version. Do not apply the older filename again or run a general
`db push` across the project's older migration-history gap.

The insert-only production import is complete:

| Registry                         | Imported rows |
| -------------------------------- | ------------: |
| Legacy reference poses/clip maps |            20 |
| Original rating rows             |         1,570 |
| Identified recordings            |         1,724 |
| Exact reviewable joins           |           743 |
| Research observations            |             0 |

The raw collection remains 1,756 video/pose pairs. All original media/material
catalog rows are unchanged. The 20 new pose objects (9,461,451 bytes) were
read back and hash/size verified. The existing 55 materials remain, giving 75
materials in total. The current compiled metric fingerprint matches the registry.

Exact review coverage is 591 Study 1 and 152 Study 2 recordings. Of Study 2's
identified recordings, 450 match participant/dance/segment but differ in
condition, and 447 have no such rating row. Preserve condition in the join.
The 32 missing-participant-ID videos remain in the raw collection. These counts
are availability boundaries, not metric validation or representative sampling.

Live production read-only checks confirm both authorized accounts can read their
two studies; an unlisted account sees no registry, ratings, references, media or
private Storage objects. Anonymous registry reads/note inserts/source updates
are denied. Signed Storage HEAD returns 200 with CORS, byte-range reads return
206, and the public-object path is denied. These checks do not establish the
website's save/retry acceptance or actual tablet expiry recovery.

## Backup and authoring gate

Supabase Pro retains seven daily database backups. At inspection the dashboard
showed **No backups yet / Check again tomorrow**. Database backups exclude
Storage object bytes; keep the independent source/archive copies. See
[Supabase backup coverage](https://supabase.com/docs/guides/platform/backups).

Private before/after snapshots cover all eight research tables after import
(three existed before import). Every captured row restores identically into an
isolated Postgres WASM database. The restore recipe repairs the note identity
sequence and verifies that a restored nonzero ID permits the next append.
Auth identity stubs in that isolated test are referential placeholders, not
restored sign-in accounts. This is a scoped logical row-restore proof, not a
full managed-project/Auth/Storage disaster-recovery drill.

Snapshots and detailed verification live under ignored
`local-data/research-cloud-backups/` with private filesystem permissions. The
production import created no test observations. Local discrepancy data were
rechecked read-only before import: 1,570 ratings and zero observations.

Viona authorized the research Drive destination through rclone. The before-import,
after-import and post-editor-grant snapshots, their restore reports and the cloud
verification report are archived at
`agentoutput:2026-10-28-hosted-chi25-backups/`. A download-based rclone check
verified all seven files with zero differences. No credentials or Storage bytes
are in these snapshots.

The primary research account now has editor access to both studies; the older
account retains viewer access. The final access snapshot restores identically
and is included in that verified archive. Source media remain read-only, and
observations remain append-only: authenticated users cannot update/delete notes
or update the media table. Production still contains zero observations.

## Personal ChatGPT subscription path

Viona clarified that the agent should use **her own ChatGPT subscription**,
with no expected use by other researchers. Gate the agent separately from
study membership: one configured owner UUID, one validated ChatGPT
subject/workspace and one isolated worker. Do not make her plan available to
another portal account, including a future research editor.

The official [self-hosted VM guide](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)
documents SIWC for an open-source tool on a personal VM. It requires a dedicated
app registration, distinct persistent VM host ID, local OAuth completion,
protected transfer of that registration and worker-owned token refresh. The
[overview](https://developers.openai.com/siwc/token-sharing-open-source) separately
directs remotely hosted applications to its interest process. A private portal's
precise eligibility needs confirmation; a single user does not itself prove
that the hosted-app restriction is waived. Native app-server ChatGPT login is
not the supported authentication path for a hosted service.

The concrete next steps are: confirm the personal VM/portal classification
and the app's open-source/licensing status; obtain supported SIWC registration;
complete the owner's OAuth consent; then choose and approve a private Linux
worker's hosting cost. Keep tokens outside Vercel, Supabase tables, Git and the
agent's working directory. The worker supplies Node/Python tools and persistent
threads behind the existing authenticated website. Prove account binding,
refresh, cancellation, quota errors and thread resume before enabling it.
No model API billing, compute purchase or subscription registration has been
provisioned. API billing is not a fallback selected by Viona.

The [interest form](https://openai.com/form/sign-in-with-chatgpt-interest/) asks
for contact/name, organization, website, desired capabilities and a product
description. A truthful request is a private academic motion-analysis portal
for one researcher using her own plan and user-controlled worker; ask whether
the documented personal VM route covers it or a hosted client ID is required.
Submitting that external request and its contact details needs Viona's explicit
authorization. Do not represent an academic affiliation or commercial company
that she has not supplied.

## Deployment/operator steps

1. Scoped off-site snapshots, isolated row restores, editor grants and post-grant
   read-only verification are complete. Inspect the first managed daily backup
   when available; a full managed-project restore is not established by these checks.
2. All checks passed at `5be82a4`, and Vercel successfully deployed that preview
   as `8FqhxKTj3tQyTmCfVeYzzz9FRpSu`. The earlier deployment quota rejection no
   longer blocks this preview. PR #431 is ready for review, with production
   unchanged. Do not infer merge approval from signing in to the preview.
3. Live in-app-browser checks at that head confirm catalog access, both metric
   visualizers, loaded participant/reference videos, 743 review tasks (152 in
   Study 2), primary-account editing controls and secondary-account viewer
   controls. Next-segment navigation preserves the clip/timeline context. The
   app menu renders its empty learner catalog without a 500. No artificial
   production notes were created; live save/reload/retry with a real observation
   remains acceptance work. Transient fetch failures also exposed a Retry
   restoration bug; the focused follow-up adds recovery for the selected
   performance and a failed observation GET, with retained browser drafts.
4. Complete actual iPad Safari portrait/landscape, interrupted Wi-Fi, keyboard,
   tab sleep/signed-source renewal and large-performance profiling. Keep these
   manual/device checks distinct from the passing synthetic Chromium suite.
