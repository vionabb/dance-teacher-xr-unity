# Preprocessing overlay-quality annotations

This machine-local directory is the durable default for the preprocessing
overlay review database. Start the local tool with:

```bash
.venv/bin/python -m motion_extraction.annotation_tool.server \
  --experiment-root temp/experiments/20260825-preprocessing-cleanup-v10 \
  --database data/human-annotations/preprocessing-overlay-quality/annotations.sqlite3
```

Live SQLite, WAL, and shared-memory files are intentionally ignored by Git.
They may contain judgments tied to access-controlled participant artifacts.
Periodically use the tool's JSONL export, verify it is nonempty, and copy the
export to the project's approved access-controlled archival location. If
archiving the SQLite database itself, stop the server first and preserve the
database together with any `-wal` and `-shm` files.

Do not commit live judgments or participant-derived review images here.
