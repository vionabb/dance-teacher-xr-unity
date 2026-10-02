---
date: 2026-10-01
tags: [human-annotation, data-provenance, preprocessing, motion-metrics]
artifacts: []
---

# A canonical home for manual review

Viona wants a well-organized, extensible place for her manual usability
evaluations and frame corrections. She suggests applying manual corrections
at the start of preprocessing on clips she has already repaired, so that
metric development can use that work, and wants faster iteration on quality
and tracking-accuracy signals.

This is a good direction if the original observations, append-only human
history, derived latest judgments, and corrected pose outputs remain distinct.
The [proposed contract](../documentation/manual-review-data-contract.md)
defines a durable, access-controlled local review root containing registered
source databases, a rebuildable SQLite catalog, exact archived raw pose files,
complete reviewed pose files, and frozen releases. It keeps sparse corrections
as editing history rather than relying on them to reconstruct reviewed poses.
Viona pointed out that pose extraction may not be deterministic: a later run
could produce different original coordinates even for the same video. Each
reviewed artifact must therefore be built from, and paired with, the exact raw
artifact she annotated; a new extraction is a distinct source. Participant
videos need not be copied into this store. The contract proposes
an optional `raw -> manually reviewed -> automatically cleaned` 2D path while
keeping detector/repair evaluation blind to the very human corrections it is
trying to predict. No database has been moved and no preprocessing default has
been changed in this session.

A read-only inventory found the active `three-stage-20260923-video-first-001`
history in `motion-pipeline/temp/experiments/20260923-video-first-001/annotations.sqlite3`.
Older review histories also exist under `motion-pipeline/data/human-annotations/`.
In particular, the preprocessing-overlay and quality-triage databases both
contain revisions under `quality-triage-20260828`; those histories require
source-aware reconciliation before a canonical import. This is why a direct
file move or naïve union of latest rows would be unsafe.

The proposed next step at this point was a source-aware importer and first
frozen release without interrupting the live annotation server, followed by
source-alignment checks and an optional manual-review preprocessing stage.
The 2026-10-02 section below records the implementation and checks.

## 2026-10-02: Drive backup and new-machine recovery

Viona wants the canonical material backed up through the repository's rclone
Google Drive workflow rather than existing only on her local machine. She also
wants a new machine to become useful quickly after cloning the repo, signing
into Drive, and staging the dataset. The storage contract now treats the local
review root as a working copy with frozen releases and one in-place Drive backup. A new
backup/restore CLI takes a consistent SQLite snapshot of the live annotation
database, includes its current task manifest and referenced landmark JSON pose
streams, and later includes canonical raw/reviewed pose artifacts when that
corpus exists. It excludes task video copies; those remain separately staged
from the read-only dataset remote.

The existing `dataset` remote is read-only and `processedmediabundle` is a
replaceable frontend cache. Viona confirmed that the writable `agentoutput`
folder has an appropriate audience for this backup. She prefers one stable
`agentoutput:manual-review/` folder updated in place, relying on Google Drive
file history rather than duplicating every file across timestamped remote
snapshots. The remote folder identity and credentials stay outside Git. The
repository documents interactive rclone setup, staging commands, backup
publication, and checksum-verified restore. The active server database has
not been moved.

The first pre-migration backup was published on 2026-10-02 to
`agentoutput:manual-review/`. A SQLite backup of
`temp/experiments/20260923-video-first-001/annotations.sqlite3` was paired
with the current 203-task manifest at
`temp/experiments/20260929-frame-usability-correctable-203/annotation_tasks.json`
and its 154 referenced landmark JSON files. The snapshot contained 156 data
files (16.195 MiB). `rclone check` reported 156 matching remote files and zero
differences. A separate download to
`motion-pipeline/temp/manual-review-restore-check-20261002/` passed the
manifest's size and SHA-256 verification. No task videos were uploaded. This
backs up the present annotation history and UI pose streams; a complete raw
and reviewed pose corpus still needs the planned import and release process.
The `motion-pipeline/backup_current_annotation.py` helper reads the same active
paths as the maintained server launcher, so future batch switches update the
backup source as well.

## 2026-10-02: First canonical release

The importer now creates a source-aware catalog and a frozen release at
`motion-pipeline/local-data/manual-review/releases/20261002-first-manual-review/`.
Its inputs were copied without moving the live server database. The release
contains 3,640 revisions from four databases, retains the 60 overlapping
logical tasks by source identity, archives 138 manifest-pinned raw pose files,
preserves 154 completed video ratings, and writes 48 complete reviewed 2D
pose segments from completed detailed tasks. The 48 segments record 745
corrected landmark positions and 451 sparse manual frame labels. Two started
tasks remain in the catalog but have no metric-ready pose files.

Seven video-only ratings have truncated raw pose streams and one has no
comparable landmarks; they are retained with explicit alignment status.
Every archived raw file matched its manifest hash. Across 5,478 reviewed
pose rows, 1,490 x/y cells changed and every change matched a declared human
correction; unchanged cells matched the archived raw artifact. The corpus
contains no videos. The first pass excluded seven video ratings because it
required a complete pose frame window; that local-only diagnostic build was
moved under `motion-pipeline/temp/experiments/20261002-manual-review-first-attempt/`
before the corrected release was made. The current release has no completed
task exclusion. No train/validation/test split is assigned yet.

To make a later release from current sources, run from `motion-pipeline/`:

```bash
.venv/bin/python -m motion_extraction.manual_review_corpus --release-id YYYYMMDD-name
```

The older histories remain cataloged, but their manifests do not establish
exact raw-pose artifact identity and pixel alignment for safe reviewed-pose
materialization. This release makes no claim that those older corrections are
metric-ready. Manual corrections currently apply only to the matching 2D
source-image pose stream, never to a new extraction or 3D pose. The active
annotation server and metric defaults are unchanged.

The optional `motion_extraction.manual_review_preprocess` run at
`motion-pipeline/temp/experiments/20261002-manual-review-preprocess-v1/`
processed all 48 reviewed segments into 5,478 normalized clean 2D rows. It
kept 24 human-unusable frames and 22 automatic missing-pose flags in separate
mask columns. Its output hashes and absolute frame indices were checked. The
clean coordinates are normalized; existing raw-pixel metrics should consume
the released reviewed CSVs, not these clean CSVs.

The full snapshot was copied to `agentoutput:manual-review/` in place. `rclone
check` found 360 matching data files and zero differences. A separate restore
to `motion-pipeline/temp/manual-review-restore-check-full-20261002/` downloaded
the manifest-listed 360 files and passed size/SHA-256 verification, including
the release manifest, 48 reviewed segments, 154 video reviews, and 138 raw
pose archives. No task videos were copied. The maintained server launcher now
runs this backup after a graceful Ctrl-C shutdown; a forced termination does
not run the hook, so the standalone backup helper remains available. The
192 MiB local upload snapshot and temporary restore were removed after
verification; the canonical local corpus and Drive copy remain.

Independent review found no blocking integrity issue. The 451 manual frame
labels are sparse, and three detailed frame tasks override a parent
`correctable` video rating to `unusable`. Two of those are in the frozen 95
human-rated cohort, changing the effective cutoff counts from 95/82/76/46 to
95/80/74/46 (all / exclude unusable / correctable or perfect / perfect).
Downstream curation must resolve the effective rating by segment using the
frame-stage override. UI landmark JSON and source-video hashes are pinned and
verified at import, but the release does not archive those original bytes;
full future re-audit depends on the active-source backup and separately staged
study media.
