# Hosted research workspace for tablet analysis

Status (2026-10-28): **plan; the CHI25 read-only collection is deployed**.
Viona accepted that release and asked to use the learner menu with her research
account, add the discrepancy review desk and metric visualizers, and talk to a
Codex agent while doing research from her tablet at a cafe. Local workflows
are described in [research-workspace.md](research-workspace.md). The
[discrepancy hosting audit](../lab-log/2026-10-28-discrepancy-hosting-handoff.md)
records the verified feature branch, schema, sources, and portability limits.

## Proposed deployment

| Component | Host and responsibility |
| --- | --- |
| Website | Existing SvelteKit/Vercel app: sign-in, learner menu, research navigation, visualizers, observations, and chat UI |
| Research authority | Existing Supabase Postgres: memberships, normalized catalog/ratings, append-only observations, analysis runs, conversation ownership and durable event cursors |
| Immutable files | Private Supabase Storage: existing videos/raw poses/materials, additional reference inputs, versioned analysis outputs and source manifests; Drive remains the archive |
| Interactive visual metrics | Tablet browser using existing TypeScript implementations; load the active segment and a small prefetch window; profile parsing/curves before adding a browser worker |
| Codex conversation and compute | Recommended: OpenAI Agents API managed Codex sessions with hosted sandboxes for Node/Python analysis; website backend authorizes session and data access |
| Specialized processing | A separate worker/sandbox only for jobs requiring custom native dependencies or resources; ordinary visual inspection needs no Python server |

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

| Input | Required work |
| --- | --- |
| Legacy reference segment poses | Register/upload 20 exact CSVs (9,461,451 bytes): Bartender 5, Last Christmas 4, Mad at Disney 5, Pajama Party 6. Use the hash-only inventory linked from the audit; reviewed poses are different artifacts. |
| Reference timing | Register dance/clip mapping, tutorial video identity, start/spacing, timestamps, mirroring and 30 FPS assumptions. Preserve row-index pairing and gaps. |
| Recording metadata | Add immutable recording/performance/segment metadata, ordered segments, durations and dimensions. Compute ffprobe/thumbnail metadata during import, not on web requests. Thumbnails can be deferred. |
| Identity aliases | Local segment IDs hash `study1`/`study2`; hosted IDs hash `chi25_study1`/`chi25_study2`. Join through study/source stem and verified video/pose hashes; preserve legacy IDs as aliases. |
| Normalized human ratings | Import exact study/dance/participant/segment/condition rows into study-scoped relations, preserving missingness, original scales, source-row identity and original/split-file hashes. Preserve `sheetmotion` = `sheet`. |
| Build/metric manifest | Version modules/configuration, coordinate space, pairing, coverage and input hashes. Browser-computed values remain diagnostic context until independently reproduced. |
| Optional analysis sources | Import frozen usability/review snapshots only for analyses needing those constructs. Discrepancy review does not require a usability judgment or the active legacy annotation DB. |

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

Recommended provider: the [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview),
which exposes a managed Codex harness, durable sessions and streaming. Its
[hosted sandboxes](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted)
can run pinned Node/Python tools and publish artifacts. Register accepted
outputs back in Supabase; expiring sandbox files are not the research archive.
The API is beta: verify project access and a minimal authenticated session
before selecting it. API model/container usage is a separate operating cost;
desktop subscription coverage is not assumed.
The current API documentation also specifies US-only data residency and no
Zero Data Retention support. Confirm that boundary for the selected research
inputs before enabling it; a self-hosted executor does not change the harness
retention policy.

Fallback for access/custom-compute requirements: an isolated persistent
Node/container service using Codex app-server over **stdio**, behind our
authenticated backend. Official [app-server documentation](https://learn.chatgpt.com/docs/app-server)
supports custom clients but marks WebSocket transport experimental/unsupported;
do not expose that listener directly as the website API. Subscription sign-in
would need a separately supported registration/token flow; never copy
workstation login credentials into the website.

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
4. **Codex conversation.** Verify API access, implement provider/session adapter
   and panel, then bounded data tools and persistent messages. Prove account
   isolation, cancellation, reconnect, visible failures and spending limits.
5. **Reproducible remote analysis.** Enable small Node/Python jobs and output
   registration. Reproduce a browser metric, export a plot, reconnect after
   tab closure and save an explicitly requested finding with lineage. Larger
   batch processing/pose extraction needs its own dependencies and acceptance.

Stages 2–5 include actual tablet Safari portrait/landscape, touch controls,
on-screen keyboard, slow/interrupted Wi-Fi, tab sleep/wake and signed-URL
renewal. Verify the workflow with the Mac off. Keep the accepted read-only
collection usable throughout. Routes, direct data requests, exports, writes
and agent sessions must enforce study/account scope.

## Next action

Finish review/merge of the menu PR, then implement the hosted catalog/reference
adapter. Production's older migration-history gap needs an audit before a
general `db push`; use reviewed targeted migrations for the new relations.
Before the Codex stage, configure a project-specific server-side
OpenAI credential and verify Agents API access; no key is needed in chat.
No new compute service or API spending was provisioned by this plan.
