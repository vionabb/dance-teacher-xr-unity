# Shared motion smoke-test inputs

This is a small, committed input corpus for validating the motion-pipeline and
future web-frontend smoke tests without downloading the full dataset. The
hierarchy is organized by pipeline stage. Files belonging to the same
smoke-test case share a filename stem, such as `attention_zoom_out`.

The manifest at [`manifest.json`](manifest.json) records which stage inputs are available for each case. Add future cases by adding files to the relevant stage directories and registering them in the manifest; do not create a directory per case.

The smoke suite discovers every manifest case automatically. A case may omit downstream stage fixtures; those isolated tests are skipped, while its raw video still participates in database, extraction, audio, and end-to-end smoke coverage.

## Stage directories

- `motionvideo/`: raw video inputs for database, pose-extraction, audio, and end-to-end tests.
- `database/`: database inputs for isolated downstream tests.
- `pose_raw/`: raw MediaPipe pose artifacts used to test preprocessing and metric stages.
- `audio_analysis/`: audio-analysis JSON inputs used by bundling and related stages.
- `complexity/`: per-file complexity inputs, stored under the `byfile/` layout expected by the pipeline.
- `dancetrees/`: DanceTree inputs before complexity enrichment.
- `dancetrees_with_complexity/`: enriched DanceTree inputs for bundle tests.

Generated outputs must go under an ignored directory such as `temp/smoketest/`; tests must never write into these fixture directories.

The separate [`userstudydata/manifest.json`](userstudydata/manifest.json)
registers two small participant-study cases. Their videos and canonical raw
pose artifacts are kept in this corpus rather than the frontend project,
matching production ownership in `motion-pipeline/temp/cached/userstudydata/`.

## Promoting a validated output

When a stage contract changes, run the stage into a clean temporary directory, inspect and validate its output, then explicitly promote the selected file:

From `motion-pipeline/`, run:

```bash
uv run --locked python script_invocations/promote_smoke_fixture.py \
  --source temp/smoketest/<run-id>/output.csv \
  --stage pose_raw \
  --destination-name attention_zoom_out.pose2d.raw.csv
```

Update `manifest.json` and this document when adding or replacing fixtures.
Ordinary pipeline commands must not use a smoke-test directory as their output
directory.
