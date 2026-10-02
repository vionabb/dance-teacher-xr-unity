# Manual review corpus

Status: **first release built and backed up; active server remains on its existing database**.
The catalog importer and release materializer are implemented in
`motion-pipeline/motion_extraction/manual_review_corpus.py`. See the
[dated rationale](../lab-log/2026-10-01-manual-review-corpus-proposal.md).

## Purpose

Make Viona's video-usability judgments, sparse frame states, landmark
corrections, and later manual reviews reusable across annotation batches,
preprocessing experiments, metric development, and reference selection. Keep
the history and its provenance intact. Archive the exact raw pose artifact
used during review and a complete reviewed pose artifact. Participant videos
can remain in their existing access-controlled location.

## Storage and authority

Use one access-controlled, Git-ignored working root such as
`motion-pipeline/local-data/manual-review/`, configured through a path setting
rather than embedded in experiment scripts. Back up consistent snapshots of
this root to `agentoutput:manual-review/` through rclone; the local root is a
working copy, not the only durable copy. It contains:

| Item | Role |
| --- | --- |
| `sources/` | Snapshots or registered locations of the original append-only SQLite databases and the exact task manifests used with them. Original revisions remain immutable. |
| `poses/raw/<artifact-id>/` | Immutable copy of the exact raw 2D pose file used during annotation, stored once per distinct extraction artifact. Its content hash identifies the observations, independently of the source video. |
| `poses/reviewed/<release-id>/` | Complete reviewed 2D pose files for the selected recordings or segments. Every frame and landmark is represented, including unchanged raw estimates. New reviews create a new release rather than altering a frozen file. |
| `catalog.sqlite3` | Deterministically rebuilt query index over annotation sources and pose artifacts: latest effective reviews, source identities, corrections, coverage, and provenance. Consumers query this instead of parsing each experiment's JSON. |
| `releases/<release-id>/manifest.json` | Frozen selection of annotation revision IDs, raw and reviewed pose hashes, frame mapping, and annotation policy. Evaluation splits remain unassigned. No videos are copied. |

The original authoring databases are the historical evidence; `catalog.sqlite3`
is a derived read model, not a second place to edit judgments. New annotation
batches are registered and imported incrementally by source database identity
plus revision ID. The active database should be copied with SQLite's backup
API, never by copying only a live `.sqlite3` file. Moving the live server to
the new root is a separate cutover after the catalog and backup are verified.
Never commit participant-derived rows or their media to Git.

## Google Drive backup and recovery

Use the repository's existing writable `agentoutput` remote. Viona confirmed
its audience is appropriate for participant-derived review data. The backup
has one stable Drive folder, `agentoutput:manual-review/`, updated with
`rclone copy`. Google Drive file history retains earlier versions of files;
routine backups do not create a new remote folder per snapshot. [Drive revision
retention](https://rclone.org/drive/#revisions) is limited by Google's policy,
so historical research states live in the append-only annotation database and
frozen corpus releases rather than depending on remote file history. The
`dataset` remote remains read-only and `processedmediabundle` remains a replaceable
frontend cache. Keep remote folder IDs and credentials outside Git.

A local consistent snapshot is the input to each `rclone copy`. It contains a
consistent SQLite backup of every authoring database, the exact task
manifests, the catalog and released raw/reviewed pose artifacts
that exist at snapshot time, and a manifest of relative paths, sizes, and
SHA-256 hashes. For the current pre-migration experiment, back up its live
database with SQLite's backup API and include the manifest and available
landmark JSON pose streams, while labeling that snapshot **annotation history,
not yet a complete reviewed-pose release**. Exclude task video copies. Upload
the checksum manifest last so an interrupted transfer cannot look complete.
Do not delete remote files during routine backup. Restore only files named by
the current manifest; older remote files outside it are ignored. Frozen corpus
releases remain distinct research versions, while routine backups of the same
source file update its one Drive path.

Recovery on a new machine first stages the current manifest-listed files into
a new local directory, verifies every hash and required file, then makes it
available as a working
copy. Never overwrite a running annotation database or silently merge two
histories. Verify the matching source videos separately from the read-only
`dataset` remote before resuming annotation or metric work. A backup is not
established until a restore and checksum verification have succeeded.

## Identities and records

Use a stable `recording_id` derived from corpus and source-video identity,
including its hash. The exact raw pose artifact has a separate content-hash
identity so multiple extractions of one recording remain distinct. Record the
pose-extraction run, code/model version, and settings separately; these
describe how the artifact was produced but do not replace its content identity.
A `segment_id` adds its absolute source-frame interval. These are independent
of annotation `task_id`, which
may be regenerated or reused in later batches. Every review retains its
`experiment_id`, source database, manifest hash, task ID, annotator, revision
ID, timestamp, status, task type, and review scope. The catalog may expose a
latest effective view, but it must also let analyses recover the exact source
revision and any overridden judgment.

The normalized review entities are:

1. **Video assessment:** visible tracking accuracy rating, a separate
   analysis-suitability/recording-quality assessment when explicitly collected,
   note, and any later unusable override. An optional note is not a systematic
   suitability label.
2. **Frame assessment:** sparse manual Good/Flawed/Unusable states, distinct
   from automatic missing-pose detections and their algorithm/version.
3. **Landmark correction:** landmark, task-relative frame and absolute source
   frame, original pixel coordinate from the archived raw artifact, corrected
   pixel coordinate, mark span/cause, source coordinate system/dimensions, and
   revision provenance. These sparse records are audit history, not the sole
   representation of the reviewed pose. Preserve older leg marks, but record
   that the current detailed-review protocol excludes legs.
4. **Review coverage:** which clip and body parts were actually reviewed,
   whether the task was completed or abandoned, and whether an unmarked frame
   is an implicit no-error observation under that protocol. Do not promote
   every unmarked landmark to independently verified ground truth.

Keep human correction, raw detector estimate, automatic repair, missing pose,
and human-declared unusability as different states. An occluded landmark may
have a useful human estimate, but that estimate need not be treated as exact
ground truth. A correction made against one raw-pose extraction cannot be
silently applied to a different extraction or frame alignment.

## Preprocessing boundary

For a matching source video, exact archived raw pose artifact, frame mapping,
and coordinate system, an explicit `apply_manual_review` stage materializes a
complete **reviewed pose** file. It replaces only the coordinates Viona
actually moved; every other coordinate is copied from that same archived raw
artifact. Store the complete result, its source revision IDs, manual unusable
masks, and per-landmark/per-frame provenance in the release. The automatic
detection/repair and normalization stages consume the frozen reviewed artifact
and produce a separate clean pose. Raw and reviewed files are never
overwritten. The present corrections are 2D source-image coordinates; do not
transplant them directly into 3D pose.

Never reconstruct a reviewed pose by rerunning extraction. The same video may
yield different detector output across runs, environments, or model versions.
A new extraction is a new raw artifact and needs its own review/alignment
decision. If the exact raw artifact used for annotation cannot be recovered,
mark that review incomplete for pose reconstruction; preserve its judgments
and correction history without presenting a regenerated pose as equivalent.

Use two experiment modes:

- **Detector/repair evaluation:** Use the frozen raw pose artifact as input;
  withhold human corrections and use the frozen reviewed artifact, correction
  provenance, and frame labels as comparison targets. Split by
  recording/person and keep adjacent segments together where needed to avoid
  leakage.
- **Metric development on reviewed material:** Apply eligible human
  corrections before preprocessing, and report results beside raw-input and
  automatic-only results. Carry usable coverage and provenance into metric
  outputs so a score cannot hide how much motion was manually repaired.

This makes manual work useful immediately on reviewed clips without claiming
that the automatic pipeline can reproduce those corrections on unseen clips.

## First release and checks

The first release is `20261002-first-manual-review`, under
`motion-pipeline/local-data/manual-review/releases/`. The importer captured
3,640 revisions from four source databases, including 60 overlapping logical
tasks retained by their distinct source identities. It archived 138 exact raw
pose files, preserved 154 completed video ratings, and materialized 48
completed detailed reviews with 745 corrected landmark positions. Two
started tasks remain in the catalog but are excluded from metric-ready files.
Seven video ratings have `incomplete_raw_pose` alignment status and one has
`unverified_no_landmarks`; these ratings remain available but have no
reviewed pose file. Among the 48 detailed files, 5,478 rows were checked
against raw, with 1,490 changed x/y cells and zero unexplained changes.
No source videos were copied into the corpus. The release records grouping
keys, but no train/validation/test split has yet been assigned.

Three detailed reviews explicitly override an earlier `correctable` whole-video
rating to `unusable`. For curation, join the video and detailed reviews by
`segment_id` and give the completed frame-stage override precedence. Retain
the earlier rating as history. The current manifest records both values rather
than a precomputed effective-rating column.

From `motion-pipeline/`, refresh the source-aware catalog and create a new
immutable release after further annotation (use a new release ID):

```bash
.venv/bin/python -m motion_extraction.manual_review_corpus --release-id YYYYMMDD-name
```

Earlier histories are queryable in the catalog. Their old manifests do not
pin the exact raw pose artifact in the way the current manifest does, so
they are not silently promoted to reviewed pose files.

The first release followed these checks:

1. Inventory the active video-first database and older annotation databases
   with their manifests. The older preprocessing-overlay and quality-triage
   databases both contain revisions for `quality-triage-20260828`; reconcile
   that overlap by origin and revision rather than taking the latest timestamp
   across databases.
2. Freeze a read-only annotation snapshot and copy the exact raw pose files
   used in review. Validate video/pose hashes, frame offsets, source
   dimensions, and a sample of corrected coordinates against those raw CSVs.
   Compare task and revision counts against the live source before promotion.
3. Build the catalog as an idempotent import and publish a versioned first
   release with complete reviewed pose files. Validate that every uncorrected
   coordinate equals the archived raw artifact. Record source revision IDs,
   both pose hashes, review scope, effective-rating rules, and held-out splits
   in its manifest.
4. Add the optional manual-review preprocessing stage and evaluate it first
   on reviewed 2D clips. Only after that evidence should the live server's
   database path or downstream metric defaults change.

The optional stage is now available as
`motion_extraction.manual_review_preprocess`. It consumes the frozen release,
verifies input hashes, and writes normalized clean 2D poses and separate
manual-unusable/automatic-missing frame masks under a new ignored
`temp/experiments/` directory. The first run,
`20261002-manual-review-preprocess-v1`, produced 48 clean segments (5,478
source-frame rows); its masks include 24 human-unusable frames and 22
automatic missing-pose frames. Existing raw-pixel metrics must use the
reviewed source-image pose CSVs, since shared cleaning also recenters and
normalizes coordinates. No default pipeline or metric input has changed.

The complete release was published to `agentoutput:manual-review/` with the
existing snapshot helper. The upload check found 360 matching data files and
zero differences. The launcher now invokes the same helper after a graceful
Ctrl-C shutdown; a forced termination does not run that hook. The server
continues to use its original SQLite database.

The design is intentionally small: SQLite, manifests, exact raw pose files,
and complete reviewed pose files are sufficient at the current scale. Sparse
correction records retain the editing history. Other CSV/Parquet analysis
tables can be generated from a release without becoming a second annotation
authority.
