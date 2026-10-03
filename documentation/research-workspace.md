# Research Workspace Direction

Status: **local read model and whole-video usability authoring implemented; further integration tracked in [issue #407](https://github.com/vionabb/dance-teacher-xr-unity/issues/407)**. This document defines ownership and acceptance for the local research workspace. [Technical architecture](technical-architecture.md) describes the wider app; the [dated lab log](../lab-log/2026-10-02-unified-research-workspace.md) records Viona's reasons for this direction.

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

| Data                                      | Authority and first-slice access                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Original reference and participant videos | Existing access-controlled Drive dataset; staged local files are a read-only cache. Do not copy participant media into Git, application static assets, or the research database.                                                                                                                             |
| Active manual judgments                   | The original annotation SQLite database remains the writer for its existing tasks and frame corrections. New whole-video usability ratings entered in SvelteKit are append-only revisions in the app-managed local research SQLite database. Preserve both provenance chains and the matching task manifest. |
| Frozen manual-review release              | Immutable manifest, exact raw/reviewed pose artifacts, and a rebuildable read-only catalog under the existing manual-review root. The catalog is not an authoring database.                                                                                                                                  |
| New research metadata and run records     | A separate app-managed local SQLite database under a configured, Git-ignored local-data root. Every new usability rating triggers a verified SQLite snapshot under `local-data/backups/`. Restore is a manual file replacement from a chosen verified snapshot while the server is stopped.                  |
| Large derived outputs                     | Versioned local files with content hashes and registry entries; do not store frame arrays or video bytes in SQLite.                                                                                                                                                                                          |
| Learner accounts and learner-facing state | Existing Supabase project. The first research slice is limited to local development on loopback. Before any remote research serving, reuse sign-in and add a server-side researcher authorization check on every research page, API, and media route. |

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
  coordinate space, landmark schema, frame mapping, and raw, tracked/baseline,
  reviewed, or clean status. Label overlays by the stream actually displayed;
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
Re-running a _recorded_ version and configuration against its exact inputs
must, however, have a reproducible interpretation. The existing
`motion_metrics.csv`/SQLite export remains a compatibility interface until
its Python consumer is deliberately migrated.

## First functional slice

1. Create and version the local research SQLite schema in the Svelte project.
   Configure its location explicitly and keep its file outside Git.
2. Register one frozen manual-review release and the prior-study human-rating
   source without changing either source. Validate identities and hashes;
   show unmatched or ambiguous joins as such.
3. Serve a read-only clip view on the local development server, restricted to
   loopback. Name both rating constructs and link them to existing metric
   inspectors. Do not surface unvalidated metric results as coaching conclusions.
4. Test source immutability, repeatable import, provenance, and rejection of
   research requests outside the local development boundary with synthetic
   fixtures. Verify the app build without copying participant media into test
   or source artifacts. Require researcher-role authorization before any remote
   research serving.

Frame-by-frame annotation authoring, batch metric jobs, and Python job
orchestration are subsequent stacks; see the [living handoff](../lab-log/2026-10-02-unified-research-workspace-handoff.md).

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

Open `/research/records` on the local development server to inspect all
whole-video usability reviews and the first 100 imported human-similarity
ratings. The usability table exposes paper, study, participant ID, dance,
condition, and segment. It joins similarity only on an exact study, dance,
participant ID, segment, and condition identity. The known study 1 naming
equivalence `sheetmotion` (video filename) = `sheet` (ratings CSV) is explicit;
seven original reviews with a missing participant ID remain visible but cannot
be joined to human ratings.

## Local whole-video usability queue

Set these variables on the local development server alongside
`RESEARCH_SQLITE_PATH`:

```sh
RESEARCH_VIDEO_MANIFEST_PATH=/path/to/annotation_tasks.json
RESEARCH_LEGACY_ANNOTATIONS_SQLITE_PATH=/path/to/annotations.sqlite3
RESEARCH_ANNOTATOR=your-name
```

The manifest and legacy SQLite database must belong to the same experiment.
The legacy database is opened read-only. The **Rate more videos’ usability**
button takes the researcher to the highest-ranked unrated task. Eligibility
requires an exact segment-level entry in the imported CHI25 ratings CSV with
a human similarity mean and at least one of its three individual prior-study
rater values. Whole-video aggregate rows, missing participant IDs, and clips
without that match cannot be rated through this queue. The similarity score
and task selection reason stay hidden on the rating form to avoid influencing
the usability judgment.

The current queue ranks the sparsest study × dance × segment × condition cell
first, then participants with fewer existing reviews. Within those coverage
tiers it alternates the suspected tracking-problem segments from the
[October 1 lab log](../lab-log/2026-10-01-layered-pose-quality-and-segment-coverage.md)
with comparison segments. A stable hash breaks remaining ties. Each saved
rating records the frozen task-manifest, video, and tracked-landmarks hashes and
creates a verified local database snapshot. The app checks the video and
landmarks hashes again before writing. The overlay is the baseline tracked
skeleton reconstructed into image coordinates from preprocessing-usable frames;
it is not the original raw `pose2d` stream.

All research pages, APIs, and media routes in this slice require development
mode and a loopback client. Media is streamed from the local manifest root;
neither participant videos nor research records are published by the deployed
Vercel app. Add server-side researcher-role authorization to every research
route before any remote serving. Metric calculations and frame-correction
authoring are not part of this slice.

## Hypothesis page prototype

The local development app exposes `/research/hypothesis` and individual
`/research/hypothesis/<slug>` pages. The initial registry identifies five
research questions from the dated lab log: landmark error signals, recurring
segment risk, reference versus participant trackability, metric sensitivity
to manual corrections, and confidence-aware coaching. These are candidate
questions or design directions, not confirmed conclusions. Each overview reads
opening prose from its cited lab-log Markdown file at request time; the full
source entry is available on the page. Hypothesis-specific investigation
sections and links can differ by slug.

The app-managed research SQLite database stores append-only conversation,
status, and finding records. Each conversation save makes a verified local
snapshot. Statuses describe the research workflow (`candidate`,
`investigating`, `evidence-review`, `resolved`, `archived`) rather than an
automatic scientific verdict. The index conversation can create hypotheses,
rename them, change workflow status, remove them from the index, and restore
them. Removal is reversible: the URL, conversation, and findings remain.
Renaming changes the displayed title but preserves the URL and history. New
hypotheses begin as candidates with a draft overview stored in SQLite; the
five seeded overviews continue to read their cited lab-log Markdown at request
time. The index lists removed hypotheses separately so they can be found and
restored.

Both conversation panels invoke a separate read-only Codex CLI turn for each
message; it is not the live Codex desktop task. The index assistant receives
the current catalog and recent collection conversation; each detail assistant
receives its overview and recent per-hypothesis conversation. The server
validates structured operations against the catalog and explicit requests,
then writes append-only records and a verified snapshot. For collection
changes, name the exact current title or URL name and the
requested action and value (for example, `Mark Recurring tracking risk by
segment as investigating`). If the assistant proposes an ambiguous or
mismatched operation, the entire turn is recorded as conversation without a
collection change. The detail panel can
save an explicitly requested finding and discuss a prospective analysis;
running that analysis or adding a custom tool still requires a Codex task with
an implementation brief. The initial pages do not ingest the live annotation
history or execute new hypothesis-specific analyses.

The local CLI call requires a working Codex sign-in on the serving machine.
This prototype inherits the development-mode and loopback-client boundary.
Before using it remotely, add researcher-role authorization to every page and
action. Before treating these pages as the durable research record, review the
initial hypothesis wording, decide whether lab-log prose should remain the
canonical overview for newly added hypotheses, and define an evidence-link
and revision policy for saved findings. See the [dated prototype entry](../lab-log/2026-10-02-hypothesis-workspace-prototype.md)
and its [handoff](../lab-log/2026-10-02-hypothesis-workspace-prototype-handoff.md).
