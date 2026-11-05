---
date: 2026-10-28
tags: [research-workspace, discrepancy-review, hosting, handoff]
artifacts:
  - assets/2026-10-28-discrepancy-hosting/reference-pose-inventory.json
---

# Discrepancy review and metric inspector hosting handoff

This is a dependency and integration assessment, not authorization to publish,
merge old history, change production, or transfer more participant data. The
hosting chat requested coordination following Viona's instruction to make the
desk and visualizers available from her tablet. The hosting lead owns the
production plan and the proposed Codex conversation component.

## Verified checkout and data state

Inspected feature checkout:
`/Users/viona/dev/phd-research-final-push/code-ai-motion-coach/.worktrees/discrepancy-review`.

- Branch: `codex/discrepancy-review`, with no configured upstream. Feature tip:
  `805cf7d1f64c6abea352002acd93adfba24e8c2c`.
- The working tree was clean before writing this handoff. No remote-tracking
  branch in this clone contains that tip. No push was performed in this task.
- Old feature base: `05f29271f4076d6cbe39dc3e8259dda0dda25652`.
- The local `origin/main` ref is stale (`47ee4f6`), so it must not be used as a
  deployment base. The separate hosting checkout's `origin/main` resolves to
  `9b130fd52004e9750ff33669a6e14bbb7075b79b`, with #428 and #429 in its log.
- The old feature ancestry still tracks the old human ratings CSV. Do not push
  this branch or merge its ancestry into rewritten history. The hosting clone
  has already moved its source to private `local-data/chi25-humanratings-source.csv`.
  No ratings file is included in this handoff.
- Read-only SQLite queries found 1,570 human rows, 195 frozen manual-review
  rows, zero local usability revisions, and **zero discrepancy observations**
  in the feature checkout's `local-data/research.sqlite3`. No existing
  `local-data/backups/` directory was found there; successful real observations
  have not been recorded in this database. Test saves were in disposable DBs.
- Port 5194 has **no listener** at inspection time. No process was stopped or
  restarted. Source media, local SQLite, and production were not modified.

Feature commits, oldest first:

| Commit | Scope |
| --- | --- |
| `9bb5475325e3fe0d3fe23852f066601604b72c15` | Queue, inspector annotation integration, local observations, guards, tests |
| `c59ff5112a8d69e254da73e97ce6b1a41af1fcdf` | Usage and implementation handoff |
| `14324be6eab83adabdd19e8afb46400c7f6d1e25` | Browser readiness, pagination and sort verification |
| `a505aeffe7941f02605ce3a50d089a4379583b6e` | Review-desk UX, playback boundaries, navigation, shortcuts |
| `805cf7d1f64c6abea352002acd93adfba24e8c2c` | Layout alternatives, rationale and validation record |

The changes from that old base include no metric-math module edits; the
Qijia2D/Viona2D math and original inspector infrastructure were already on the
base. The feature delta modifies the two inspector pages, research landing
page, hook, store and store tests, and adds the discrepancy queue/API/composer,
shared observation types and playback helper/tests. Preserve rewritten-main
fixes when applying these changes, especially `hooks.server.ts`,
`PoseDataTestFile.ts`, the store/importer and inspector page type fixes.

## Runtime and corpus inventory

Paths in this table are relative to the frontend unless stated otherwise.

| Dependency | Current implementation | Hosted boundary |
| --- | --- | --- |
| App runtime | Node 24.x, pnpm 9.12.2, Svelte 5.55.7, SvelteKit, Vite, Vercel adapter | Keep existing website/runtime; remove local-only adapters from hosted paths |
| Participant video/raw poses | Local read-only `data/participant_motions/chi25_study{1,2}`; matched MP4 and canonical raw `pose2d` CSV stems | Reuse existing authorized `research_media` rows/objects, validating exact input hashes |
| Reference segment poses | **20** legacy `*.clip-N.pose.csv` files in `testResults/tiktoks-pixelposes-segmented/`, total 9,461,451 bytes | Additional private reference-pose registry and upload needed; do not substitute reviewed or clean poses |
| Reference tutorial video | Four dance videos: bartender, last-christmas-tutorial, mad-at-disney-tutorial, pajamaparty-tutorial | Existing hosted reference-video materials can serve these if hashes match; attention video is not required here |
| Human similarity source | Private import input; stored normalized rows plus original source SHA-256 in local SQLite | Normalize study-scoped hosted ratings with immutable source/material IDs and hashes; keep the full source outside Git |
| Frozen usability/review import | Release manifest + ratings are inputs to `scripts/importResearch.mjs` | Existing SQLite initializer also imports review rows; discrepancy eligibility does not require a usability judgment or a reviewed-pose artifact |
| Observation persistence | Native `sqlite3`, ignored local DB, append-only table and per-save snapshots | Replace hosted writes with authenticated, durable Postgres records; do not use ephemeral deployment SQLite |
| Duration metadata | Node `child_process.spawn('ffprobe', ...)` against local videos | Store verified duration and dimensions during import, avoiding per-request filesystem/CLI probes |
| Thumbnails | Node `ffmpeg` against local video, in-memory cache | Optional private pre-generated thumbnails or a placeholder; not essential to annotation correctness |
| File validation/provenance | `fs`/`realpath`/`stat`, file SHA-256 on POST, hashes of local TypeScript source files | Use immutable registry hashes and a build/code manifest; no source-file path assumption in production |
| Python | No Python call in visual review or observation saving | Not required for browser visualizers; only later extraction, batch analysis or worker tasks need it |
| Legacy annotation DB/manifest | Required by the separate usability queue | Not required for the discrepancy task; leave that original writer and existing annotations untouched |

The [reference-pose inventory](assets/2026-10-28-discrepancy-hosting/reference-pose-inventory.json)
records filenames, sizes and SHA-256 values only, with no pose coordinates.
Counts: Bartender 5, Last Christmas 4, Mad at Disney 5, Pajama Party 6.

The hosting checkout's material importer/migration currently supports five
reference videos, two study-split human CSVs and 48 reviewed-pose samples.
Those 55 materials **do not include these 20 legacy reference inputs**.
The private bucket's existing material `kind` constraint and importer need a
reviewed extension before these reference poses can be registered. Four
reviewed reference segments are not equivalent to the 20 raw legacy inputs.
Production counts were not queried again here; the delivered corpus counts
come from the hosting checkout's release record and code.

Current local configuration:

- `RESEARCH_SQLITE_PATH`, default `../local-data/research.sqlite3`.
- `RESEARCH_ANNOTATOR` (currently a trusted local-server display label, not
  an authenticated account identity).
- `MOTION_PIPELINE_USER_STUDY_DATA_DIR`.
- `MOTION_PIPELINE_REFERENCE_POSE_DIR`.
- `MOTION_PIPELINE_REFERENCE_VIDEO_DIR`.

These are local adapters, not production configuration requirements. Hosted
research should not require Viona's Mac or any of these filesystem paths.

## Identity and alignment contract

**ID mismatch must be handled explicitly.** Local IDs are the first 24 hex
characters of SHA-256(`study1`/`study2` + NUL + source stem). Hosted IDs hash
`chi25_study1`/`chi25_study2` + NUL + source stem. Thus the same recording has
different local and hosted IDs. Join/migrate using the study/source stem plus
verified video/pose hashes and retain the legacy ID as an alias if needed.
Never assume the old observation `segment_id` is a hosted `research_media.id`.

Performance IDs are local grouping IDs for study, participant, dance,
workflow, condition and phase; they are not currently hosted catalog entities.
The hosted adapter must expose an explicit performance/ordered-segment view
or a compatible DTO. A recording's workflow/phase must not be collapsed into
the rating join key. Display labels (`Participant 011`, etc.) depend on the
available sorted corpus; do not use them as stable identity or authorization.

Human rating joins use `(study, dance, participant ID, segment number,
condition)`. The study 1 `sheetmotion` video condition maps explicitly to
`sheet` in ratings. Whole-performance rows and missing participant identities
are not segment-eligible. A non-null source aggregate is required; individual
rater values may be missing. The discrepancy queue does not use the usability
queue's stricter rater-presence/ranking policy. Preserve the source mean's
1–5 scale and individual raters' original 1–3 scale.

Browser pairing is row-index pairing, truncated to the shorter participant /
reference sequence, with gaps preserved. Participant media time uses source
CSV frame numbers at the existing 30 FPS assumption. Reference tutorial timing
uses hard-coded clip spacing (4.498, 4.352, 4.04 and 2.682 seconds for the four
dances respectively) plus the reference pose timestamp, with horizontal
mirroring. Capture these values/version in a hosted reference-segment mapping;
do not infer them from the reviewed-pose samples or silently resample inputs.

## Existing observation contract

Current SQLite table:

```sql
CREATE TABLE discrepancy_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  segment_id TEXT NOT NULL,
  annotator TEXT NOT NULL,
  created_at TEXT NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  note TEXT NOT NULL,
  direction TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  metric TEXT NOT NULL,
  context_json TEXT NOT NULL
);
```

Authoring accepts point, interval or whole-segment observations; intervals
are clip-local video seconds, with nonnegative finite start/end and end >=
start. The POST additionally checks end against ffprobe duration (0.05 second
tolerance). Notes are required, trimmed and at most 4,000 characters.

Directions: `Metric seems too harsh`, `Metric seems too generous`,
`Agreement / comparison`, `Uncertain`.

Tags: `Tracking / occlusion`, `Timing / alignment`, `Amplitude / scale`,
`Body region weighting`, `Style / expression`, `Human rater disagreement`,
`Unclear / other`. Metric is `qijia2d` or `viona2d`. Client context is a JSON
object limited to 12,000 serialized characters; these constraints currently
live mainly at the POST boundary and need database-level equivalents for
hosted direct-API access.

Server-recorded context includes:

- Schema version 1, inspector version `2026-10-27`.
- Current inspector module and `EvaluationCommonUtils.ts` hashes.
- `row-index-truncate-shorter` pairing policy and
  `participant-segment-video-seconds` time basis.
- Video, raw participant pose and reference pose SHA-256 values and byte sizes.
- Full human source SHA-256, matched source human row, and selected segment /
  performance metadata, with the observation list omitted.
- Separately labeled `diagnosticClientContext`: metric configuration,
  browser-computed interval mean, valid sampled rows and total sampled rows.

The researcher is the authority for the note/direction/tags. The source human
rating is prior-study evidence; metric values are uncalibrated diagnostic
context. Browser-computed values are not independently verified server-side.
Current code hashes do not describe the entire transitive module graph; a
hosted build/code/configuration manifest should strengthen this provenance.

The local API only appends observations. It has no edit/delete/supersession
workflow, authenticated owner UUID, retry idempotency key, study FK or
per-researcher read/write policy. Reading/export currently returns every
observation in the local researcher DB; hosted authoring must not copy that
unscoped read behavior. Drafts are per-segment browser `localStorage`, not
cross-device sync or authoritative records. Hosted drafts must be scoped to
the signed-in account as well as segment to avoid same-browser account leaks.

Each successful insert is followed by `VACUUM INTO` a local snapshot. The
snapshot is opened, integrity-checked and checked for the inserted row. A
backup failure returns the committed observation ID plus `backupError`; the
UI does not falsely claim the write failed and encourage resubmission.
Do not copy that filesystem backup mechanism into serverless hosting. Define
managed database backup/retention and a restore drill separately from the
transactional save receipt, and keep researcher JSON export available.

## Work split and reusable interfaces

**Browser today:** MP4 playback/seeking; Papa CSV parsing; row pairing; crop
bounds; skeleton/vector overlays; Qijia2D configurable visibility/vector error
curves; Viona2D angle/length dissimilarity; per-interval mean/coverage;
selection/replay/looping; drafts; navigation; JSON export. The same TypeScript
metric modules should be reused, not rewritten in Python or SQL.

**Server today:** local file discovery/identity parsing, whole catalog and
performance DTOs, artifact streams/ranges, duration/thumbnail commands,
human-rating matching, SQLite authoring, source hashing and backup snapshots.
No metric batch job, pose extraction or agent conversation runs on these
review requests.

Portable UI/analysis:

- `src/lib/elements/DiscrepancyReview.svelte` (needs hosted data/write adapter,
  auth-aware owner/draft handling, and appropriate save/backup copy).
- `src/lib/elements/MetricSwitcher.svelte`.
- `src/lib/research/discrepancy.ts`, `review-playback.ts`, their tests.
- `src/routes/metrics/qijia2d/+page.svelte` and `viona2d/+page.svelte`
  (replace `/api/dev/...` data loading; retain rewritten-main fixes).
- Existing math modules `qijia2d-inspector.ts`, `viona2d-inspector.ts` and
  `EvaluationCommonUtils.ts`, with their browser dependencies.

A compatible catalog DTO can retain `performanceId`, ordered `segments`,
`clipNumber`, authenticated `videoUrl` / `poseUrl` / `referencePoseUrl`,
reference video URL/start/mirroring, duration and dimensions. Include immutable
artifact IDs/hashes so the save request identifies exactly what was viewed.
Use a server-validated input/version token or equivalent registry references;
the current local POST hashes whatever files exist at save time, without a
separate client-loaded-input version token.

## Recommended hosted integration boundary (not implemented)

1. **Transplant only reviewed feature changes onto rewritten main.** Do not
   merge/push the old branch, package its `.git`, copy source ratings into
   static assets, or overwrite hosting fixes with full old files. Review the
   net diff `05f2927..805cf7d` and manually adapt shared files. Keep the private
   source path and rewritten-main `PoseDataTestFile.ts` implementation.
2. **Immutable authorized analysis inputs.** Reuse `research_access`,
   `research_media`, private `research_material` and authenticated media routes.
   Register the additional 20 reference CSVs plus explicit dance/clip mapping,
   durations/dimensions, and normalized study-scoped human rows with hashes.
   Preserve both original full-source and hosted split-material hashes. The
   current material importer splits and reserializes the CSV, so those hashes
   necessarily describe different bytes.
3. **Hosted read-only visualizers first.** Protect every catalog, inspector,
   ratings, metadata, export and media endpoint using membership plus RLS.
   The helper `requireResearchStudies` returns studies but does not enforce
   editor/admin access, so it is sufficient for authorized analysis reads,
   not for writes. Reuse existing ten-minute signed video URL behavior and
   proxied CSV reads; add long-session refresh handling that preserves playhead
   and drafts, and retain the documented already-issued URL revocation window.
4. **Researcher-owned append-only writes.** A new durable observation relation
   should bind an authenticated owner UUID to the authorized study, hosted
   recording ID and exact input/configuration version. Require current
   `editor`/`admin` membership for INSERT; ordinary viewers remain read-only.
   Start with owner-scoped SELECT/INSERT and no UPDATE/DELETE grants. Sharing
   notes between researchers needs an explicit later access decision. Enforce
   both ownership and media-study consistency in the database, not only the
   Svelte route. Add a client mutation UUID unique per owner so a café network
   retry cannot create duplicate observations. Add superseding revisions only
   if correction UX is implemented, preserving original records.
5. **Auth-aware drafts and offline feedback.** Scope drafts to owner, study,
   recording and inputs. Keep failed/pending saves visibly unsaved and
   retryable. Do not imply offline durability or cross-device sync merely from
   localStorage. On sign-out or revocation stop serving protected context and
   follow a defined policy for private cached data and drafts.
6. **Separate operational recovery.** Define cloud backup availability,
   retention, exports and restore acceptance before authoring rollout. Preserve
   the original local DB; re-check observation count just before any migration.
   Zero today means there are no discrepancy rows to migrate from this DB,
   not that all future local edits may be discarded.
7. **Agent interaction is a separate boundary.** No agent/chat service exists
   in these feature commits. The hosting lead should design that authenticated
   service separately. It should consume authorized artifact/observation IDs,
   preserve provenance, and distinguish proposed machine explanations from
   researcher-authored findings. Do not turn an agent tool into unrestricted
   Storage or annotation-database access.

These proposed owner/INSERT checks follow [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
New relations also need explicit privileges; [Supabase's announced Data API
default change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
reaches existing projects on October 30, 2026. Include deliberate grants and
RLS in the same reviewed migration rather than relying on default exposure.
No production policy or migration was applied here.

## Tablet and café acceptance gates

Existing evidence is Chromium browser automation at 390×844, 844×390,
1024×768 and 1280×800, plus local save/reload and post-save focus in a disposable
DB. This is not real iPad Safari, touch-only or production acceptance.

Remaining gates:

- Actual iPad Safari portrait/landscape, on-screen keyboard and external
  keyboard, ensuring notes/save/next controls are not covered by the chart.
- Long-session video pause/reseek after signed URL expiry and account
  revocation, preserving interval and draft state on recoverable refresh.
- Slow/interrupted Wi-Fi, repeated save retries, tab sleep/wake and sign-out /
  account switches. Use an idempotent write contract and explicit save status.
- CPU/memory/network on a real tablet: the current inspector fetches and
  parses **all segments of a performance concurrently**, probes video metadata
  in browser media elements, and computes frame curves on the main thread.
  Prefer loading the active segment plus a small prefetch window; cache shared
  immutable reference inputs. A browser worker may help parsing/metrics if
  profiling warrants it; Python is not intrinsically required.
- Verify CSV fetch/MP4 redirect behavior in both Safari and the in-app browser,
  including Range requests, mirroring, seeking, missing samples and no false
  metric/human scale equivalence. Existing CSV download routes may need a
  metadata/JSON adapter rather than returning the full ratings source to UI.
- Anonymous, learner, viewer, editor in only one study, revoked member and
  second researcher tests: denied cross-study/direct-API writes, owner spoofing,
  unauthorized reads/exports and immutable-parent mismatches.

## Next action and coordination state

The hosting lead can now inventory/upload the missing reference inputs in a
reviewed stage and build a read-only hosted catalog adapter on rewritten main.
Authoring should be a subsequent reviewed relation/policy/API slice. No
source-code implementation or production change was made by this handoff.

The hosting lead read the handoff directly and copied this report and its
hash-only inventory onto rewritten history without the feature's old ancestry.
The active [hosted workspace plan](../documentation/hosted-research-workspace.md)
incorporates this audit, the accepted production collection, and the proposed
Codex boundary. The navigation change is on `codex/tablet-research-hosting`;
the next implementation stage is the hosted catalog/reference adapter.
