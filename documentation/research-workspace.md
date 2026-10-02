# Research Workspace Direction

Status: **local read-model slice implemented; further integration tracked in [issue #407](https://github.com/vionabb/dance-teacher-xr-unity/issues/407)**. This document defines ownership and acceptance for the first local slice. [Technical architecture](technical-architecture.md) describes the wider app; the [dated lab log](../lab-log/2026-10-02-unified-research-workspace.md) records Viona's reasons for this direction.

## Purpose and runtime

The existing SvelteKit application will become one interface for research
inspection and the learner experience. A local persistent Node runtime will
serve research routes and can invoke Python workers for stages that remain in
the motion pipeline. The current Vercel deployment remains learner-facing
unless a later deployment decision explicitly expands it. Metric mathematics
will have one JavaScript/TypeScript implementation shared by live evaluation,
batch execution, and visual inspection; each metric may accept versioned
configurations.

## Data authority

| Data | Authority and first-slice access |
| --- | --- |
| Original reference and participant videos | Existing access-controlled Drive dataset; staged local files are a read-only cache. Do not copy participant media into Git, application static assets, or the research database. |
| Active manual judgments | The active annotation server's SQLite database remains the writer until a separate, checked cutover. Preserve append-only revisions and matching task manifest. |
| Frozen manual-review release | Immutable manifest, exact raw/reviewed pose artifacts, and a rebuildable read-only catalog under the existing manual-review root. The catalog is not an authoring database. |
| New research metadata and run records | A separate app-managed local SQLite database under a configured, Git-ignored local-data root. Back it up with a verified snapshot/restore procedure before it becomes authoritative for annotations. |
| Large derived outputs | Versioned local files with content hashes and registry entries; do not store frame arrays or video bytes in SQLite. |
| Learner accounts and learner-facing state | Existing Supabase project. Reuse sign-in for the research app, with an additional server-side researcher authorization check on every research page, API, and media route. |

The prior-study human similarity ratings and the new pose-tracking usability
reviews measure different constructs. Keep their source, rating scale, review
scope, and missingness explicit when joining them to a clip. The current
manual-review contract has [further authority and provenance rules](manual-review-data-contract.md).

## Shared identities and versioned contracts

Every research-facing record needs a schema version and enough identifiers to
reproduce its meaning:

- **Recording:** source corpus, source-video identity/hash, study, condition,
  and phase where known. A participant label or filename alone is not a key.
- **Segment:** recording identity plus the absolute source-frame interval.
  Keep timestamps and pairing/alignment policy separate from the identity.
- **Pose artifact:** exact content hash, extraction run/model/configuration,
  coordinate space, landmark schema, frame mapping, and raw, reviewed, or clean
  status. Pixel-space overlays use the matching raw or reviewed 2D stream;
  normalized clean data is an analytical input.
- **Manual review:** source database and manifest identity, experiment, task,
  annotator, revision, review scope, and frozen release. The effective video
  rating may include a later frame-stage override without erasing the earlier
  rating.
- **Metric run:** metric ID, code/semantic version, complete configuration,
  input and reference artifact IDs, frame-pairing policy, missing-data rule,
  coverage, run status, and result artifact hashes. Results from different
  configurations or inputs remain distinct.

Historical metric scores do not need numerical parity as metrics evolve.
Re-running a *recorded* version and configuration against its exact inputs
must, however, have a reproducible interpretation. The existing
`motion_metrics.csv`/SQLite export remains a compatibility interface until
its Python consumer is deliberately migrated.

## First functional slice

1. Create and version the local research SQLite schema in the Svelte project.
   Configure its location explicitly and keep its file outside Git.
2. Register one frozen manual-review release and the prior-study human-rating
   source without changing either source. Validate identities and hashes;
   show unmatched or ambiguous joins as such.
3. Serve a researcher-authorized, read-only clip view that names both rating
   constructs and links them to existing metric inspectors. Do not surface
   unvalidated metric results as coaching conclusions.
4. Test source immutability, repeatable import, provenance, and rejection of
   unauthorised requests with synthetic fixtures. Verify the app build without
   copying participant media into test or source artifacts.

Annotation authoring, batch metric jobs, and Python job orchestration are
subsequent stacks; see the [living handoff](../lab-log/2026-10-02-unified-research-workspace-handoff.md).

## Current local read model

The Svelte project's `scripts/importResearch.mjs` imports a frozen manual-review
release manifest and the prior-study human-rating CSV into a separate, versioned
SQLite database. Run it from `svelte-web-frontend/` with Node 24:

```sh
RESEARCH_SQLITE_PATH=../local-data/research.sqlite3 node scripts/importResearch.mjs \
  /path/to/frozen-release/manifest.json /path/to/humanratings.csv
```

The default database path is `../local-data/research.sqlite3` relative to the
Svelte project, and `/local-data/` is Git-ignored. Keep the same
`RESEARCH_SQLITE_PATH` when starting the development server. The importer
records SHA-256 hashes of both source files and rejects a changed source rather
than silently replacing imported rows. It never writes to the source manifest,
rating CSV, annotation database, or manual-review catalog. It stores review
provenance and human similarity ratings as separate tables. Source media and
per-frame arrays remain outside the database.

Open `/research/records` on the local development server to inspect the first
100 records of each source. This page is limited to development mode and
loopback clients, consistent with the existing local metric inspectors. The
current page does **not** join human ratings to manual reviews: those sources
still need a verified recording/segment identity map. It also does not offer
annotation authoring or metric calculations. Supabase researcher-role checks
must be added to every research page, API, and media route before research
access is served beyond the local development boundary. The currently deployed
Vercel app is not a research-data server.
