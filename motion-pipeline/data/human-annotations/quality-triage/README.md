# Quality-triage annotations

This machine-local directory contains the durable annotation history for the
quality-triage batch, including quality triage, error marking, and video
quality-rating tasks. Use this database when serving the manifest below:

```bash
cd motion-pipeline
.venv/bin/python -m motion_extraction.annotation_tool.server \
  --experiment-root temp/experiments/20260828-quality-triage-batch-v1 \
  --database data/human-annotations/quality-triage/annotations.sqlite3
```

The batch manifest contains 97 tasks: 60 `quality_triage`, 17
`error_marking`, and 20 `video_quality_rating` tasks. The server reads the
manifest at startup and filters history by its `experiment_id` and annotator,
so using the preprocessing-overlay database or a different experiment root
makes prior quality-triage/error-marking judgments appear to be missing.

The separate preprocessing-overlay review database is at
`data/human-annotations/preprocessing-overlay-quality/annotations.sqlite3`;
it must not be substituted here. Live SQLite, WAL, and shared-memory files
are intentionally ignored by Git. They may contain judgments tied to
access-controlled participant artifacts. If archiving this database, stop the
server first and preserve the database together with any `-wal` and `-shm`
files.

Do not commit live judgments or participant-derived review images here.
