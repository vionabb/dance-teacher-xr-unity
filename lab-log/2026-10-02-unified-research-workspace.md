---
date: 2026-10-02
tags:
  [
    research-workspace,
    architecture,
    annotation,
    motion-metrics,
    data-provenance,
  ]
artifacts: []
---

# Toward one research workspace

## Viona's direction

Viona wants faster development of the system as a whole, with more consistent
and reproducible treatment of inputs and outputs. The annotation tools and
metric visualizations have helped her see patterns in the processing pipeline;
she expects to build more inspection tools for research and development, and
some visualizations may eventually become useful in the learner experience.
The aim is less fragmentation and duplication, and more speed in understanding
what happens at every stage.

The existing Svelte application should gradually become a tool for managing
the research project as well as the learner-facing experience. Viona wants one
URL and interface; Python workers are acceptable for processing. She wants
one canonical JavaScript implementation of each evolving motion metric, usable
with different configurations in live evaluation, batch runs, and inspectors.
Historical metric-score parity is not a requirement. She is willing to change
data contracts where that makes the project easier to organize and manage.

## Decisions for the first implementation

- Start from the latest `main` in an isolated checkout and use stacked pull
  requests. Make this lab-log entry before implementation.
- Begin with a local research workspace because the dataset is already staged
  on Viona's machine. Keep source media and large pose outputs as versioned
  local artifacts, and use a local SQLite database for research metadata and
  future app-managed records. The existing Supabase project remains responsible
  for learner-facing data and authentication. Cloud research-data storage can
  be reconsidered if multi-machine or multi-researcher access becomes valuable.
- Define stable recording, segment, pose-artifact, review-release, and metric-run
  identities with explicit schema versions, configuration, coordinate space,
  missing-data behavior, and provenance. Preserve distinct raw, manually
  reviewed, and automatically cleaned pose streams.
- Treat the frozen manual-review corpus as a read-only source initially. Its
  original annotation databases remain the authoring history, and its catalog
  is a rebuildable read model. A later migration of annotation authoring must
  preserve append-only revisions and be a separately verified cutover.
- Move only current whole-video usability review and follow-up frame and
  landmark correction into the unified interface first. Preserve older review
  histories for inspection without treating their corrections as automatically
  aligned, metric-ready pose data.
- Show prior-study human similarity ratings alongside video-usability ratings
  with their different meanings and sources visible. No metric visualization
  or joined rating by itself establishes coaching validity.

## Current evidence and limits

The first frozen manual-review release contains 154 completed whole-video
ratings and 48 completed detailed reviews tied to exact raw 2D pose artifacts.
The live annotation server still writes to its original SQLite database; the
release is backed up separately. The recent Qijia2D and Viona2D inspectors
already offer a local research browser, but their dataset routes are
development-only and do not yet run pipeline jobs or author annotations.

The local SvelteKit Node runtime can orchestrate Python workers and expose job
status through the same interface. The current Vercel deployment remains a
different execution environment, so local research operations need an explicit
server/runtime boundary and researcher-only authorization before expansion.

The first implementation stack adds a separate local SQLite read model. A
frozen review release and the prior-study ratings imported as 154 video reviews,
48 frame reviews, and 1,570 human similarity rows. The inspector deliberately
lists the sources separately until clip identities are verified; this import
does not make the annotation server or release catalog editable through Svelte.

## Next step

Use the [living handoff](2026-10-02-unified-research-workspace-handoff.md) for
the staged implementation, validation, and remaining cutover decisions.
No dissertation results or claims change from this architecture decision.

## Later on October 2: first local usability review loop

The first research page now lists whole-video usability judgments by CHI25
paper, study, user ID, dance, condition, and segment. It keeps pose-tracking
usability distinct from the three other raters' prior-study motion-similarity
scores. The imported release has 134 participant reviews and 20 reference
reviews; seven participant filenames lack a user ID and therefore cannot be
joined to the human-rating source.

The **Rate more videos’ usability** action considers only an unrated segment
with an exact matching CHI25 similarity record containing a mean and at least
one individual rater value. The known study 1 `sheetmotion`/`sheet` naming
difference is normalized only for that match. With the current frozen task
manifest and ratings CSV, 691 segments meet the rule. Whole-video similarity
aggregates are excluded.

The [October 1 coverage analysis](2026-10-01-layered-pose-quality-and-segment-coverage.md)
points to filling empty study × dance × segment × condition cells, then
replicating thin cells while comparing suspected problem segments with other
segments. The queue follows that ordering, balances participants secondarily,
and alternates suspected and comparison segments within a coverage tier. The
selection reason and similarity score are hidden while rating to reduce bias.

New usability responses are append-only in the app's Git-ignored local SQLite
database, with source-manifest, video, and raw-landmarks hashes and a verified
snapshot after each save. The existing Python annotation database and source
artifacts are read-only to this interface. Research and media routes remain
restricted to the local development server; this change does not publish
participant data or research records.
