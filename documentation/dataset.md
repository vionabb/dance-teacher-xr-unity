# Dataset and Artifact Guide

This document owns data provenance, sensitivity, storage, and transfer rules. Google Drive is the source of truth for large research datasets; git contains code, metadata, small fixtures, and selected research artifacts.

## Data classes

| Data | Location | Durability and access |
| --- | --- | --- |
| Reference videos | Drive `referencevideos/` | Read-only source data for dances/motions to teach |
| Prior user-study data | Drive `userstudydata/` | Read-only, access-controlled research data |
| Drive archive | Drive `archive/` | Read-only historical material not needed for current work |
| Agent research outputs | Drive `agent-output/` | Writable publication area for selected, validated results |
| Processed frontend media | Drive `processed-media-bundle/` | Writable cache; replace only after frontend validation |
| Generated local analysis | `artifact-archive/`, subproject artifact/temp folders | Local working outputs; often ignored by git |
| Research narrative assets | `lab-log/assets/` | Committed copies used by lab-log entries |
| Checked-in metric fixtures | `svelte-web-frontend/src/lib/ai/motionmetrics/testdata/` | Small durable fixtures and human-rating metadata |
| Generated metric outputs | `svelte-web-frontend/testResults/` | Local/generated results and browser profiles |
| Persistent local video cache | `motion-pipeline/temp/cached/{referencevideos,userstudydata}/` | Read-only local inputs; ignored by git |
| Canonical participant pose cache | `motion-pipeline/temp/cached/userstudydata/chi2025-poses/canonical/` | Derived, access-controlled raw/clean pose artifacts |

Never infer consent, redistribution permission, or de-identification from the existence of a local file. Treat raw participant videos as sensitive and access-controlled.

## CHI study resources

The earlier CHI studies provide participant performances, reference videos, human ratings, and derived poses used for technical validation.

- Participant videos and derived pose files: `motion-pipeline/temp/cached/userstudydata/`
- Canonical participant pose directories: `motion-pipeline/temp/cached/userstudydata/chi2025-poses/canonical/<study>/`
- Human ratings and fixture definitions: `svelte-web-frontend/src/lib/ai/motionmetrics/testdata/`
- Aggregate metric outputs: `svelte-web-frontend/artifacts/motion_metrics.csv` and `.db`

Historical raw-video path on the primary workstation:

```text
/Users/viona/Library/CloudStorage/GoogleDrive-viona.blanchet.gr@dartmouth.edu/Shared drives/Human Motion Lab/2025-CHI-2D-Dance-TikTok-Teaching/UserVideos/AzureBlobFiles/
```

Additional historical/testbench paths are documented as launch arguments in `motion-pipeline/.vscode/launch.json`. They are workstation hints, not repository defaults.

## Workstation access

When `.github/localenvironment.json` exists, it maps the local synchronized Drive dataset and agent-output roots. The file is machine-specific and gitignored; use `.github/example-localenvironment.json` as the schema.

Prefer project helpers or explicit local paths over copying absolute paths into source code. Do not commit credentials, service-account JSON, Drive folder IDs, or local environment files.

## Persistent local video cache

The local cache is the default input for repeated pipeline and study-analysis
work. Stage each immutable Drive subtree once, then let individual runs write
only generated outputs elsewhere:

```bash
cd motion-pipeline
./script_invocations/stage_video_cache.sh referencevideos
./script_invocations/stage_video_cache.sh userstudydata
```

`stage_video_cache.sh` uses `rclone copy`; it never deletes cache files. It is
the only cache writer. The reference-video pipeline and study-analysis commands
must treat cached videos as read-only and must not copy them into new run
directories. `userstudydata/` remains access-controlled even when cached
locally.

## Cloud-agent access

[setup-rclone.sh](../.github/setup-rclone.sh) configures three remotes from agent secrets:

- `dataset`: read-only complete dataset root;
- `agentoutput`: read/write `agent-output/`;
- `processedmediabundle`: read/write processed bundle cache.

Cloud agents must use explicit copy/sync operations, never an rclone mount:

```bash
# Stage source data locally.
rclone copy dataset:<remote-path> <local-dir>

# Publish selected research artifacts.
rclone copy <local-dir> agentoutput:<dated-task-path>

# Replace the validated frontend media cache; this deletes stale remote files.
rclone sync <local-bundle> processedmediabundle:
```

The Python wrapper `python -m motion_extraction.rclone_transfer` provides corresponding pull and publication commands. Run processing against local staged directories.

`rclone sync` is intentionally reserved for publishing a validated processed-media bundle. Use `copy` for ordinary inputs and research artifacts.

The preferred reference-video workflow is
`motion-pipeline/script_invocations/run_rclone_pipeline_cached.sh`. It reads
the persistent `referencevideos/` cache directly, writes only generated output
to the chosen run directory, and validates the database, raw pose, clean pose,
complexity, audio, enriched DanceTree, and bundle outputs after each stage. A
`run-manifest.json` records the local-video-cache provenance, parameters, and
validated stages. The older `run_rclone_pipeline.sh` remains available when an
isolated, one-off Drive staging run is specifically needed.

Processed media is promoted separately with
`motion-pipeline/script_invocations/publish_processed_media.sh --confirm
<local-bundle-media-dir>`. This calls `rclone sync` against
`processedmediabundle:` and can delete stale remote cache files; it is never
invoked by the processing runner. Do not publish until the frontend has
validated the generated bundle.

## Publishing rules

- Publish only outputs that are complete enough to survive beyond the current run.
- Organize `agent-output/` by dated task, for example `2026-08-01_metric-validation/`.
- Include the script/command, parameters, and source-data provenance required to reproduce research-facing results.
- Validate regenerated media in the frontend before replacing `processed-media-bundle/`.
- Do not publish raw participant videos or sensitive intermediate data into broader-access output areas.

## Local archive versus lab log

- `artifact-archive/` is a user-triggered timestamped snapshot and may remain local/ignored.
- `lab-log/assets/` contains committed copies of figures/data referenced by a dated research entry.
- Drive `agent-output/` preserves selected outputs beyond a local checkout.

An important artifact may appear in all three locations for different purposes. The lab-log copy must never link outside the repository.

## Provenance checklist

Before using or sharing an analysis result, record:

1. source dataset and study;
2. raw versus derived/pose data;
3. extraction/preprocessing version and options;
4. metric version and directionality;
5. inclusion/exclusion criteria;
6. whether the output is exploratory or validated;
7. any access or redistribution restrictions.
