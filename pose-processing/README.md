# Pose Processing

Shared pose schemas, MediaPipe Holistic extraction, and raw-to-clean
preprocessing for the reference-video and participant-study workflows.

The package owns the canonical artifact conventions:

- `*.pose2d.raw.csv` and `*.pose2d.clean.csv`;
- `*.holisticdata.raw.csv` and `*.holisticdata.clean.csv`.

Run its focused tests from the motion-pipeline environment:

```bash
uv run --locked pytest ../pose-processing/tests
```

The package is intentionally small. Artifact reports, dance-tree processing,
and study-specific metadata remain owned by their respective consumers.
