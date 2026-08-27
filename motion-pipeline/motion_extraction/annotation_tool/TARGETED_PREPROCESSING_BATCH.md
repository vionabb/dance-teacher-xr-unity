# Targeted preprocessing annotation batch

`append_targeted_preprocessing_tasks.py` appends a compact, source-backed
batch to a *copy* of an annotation manifest. It does not change the database
or an existing manifest in place.

The batch contains 18 frames:

- Eight frames from the four additional physical reference videos: one B0/C2
  disagreement frame and one ordinary control per video.
- Two action-verified frames each for isolated visibility masking, isolated
  outlier replacement, and **S1 smoothing-only** triangular smoothing. S1 has
  no visibility masking, gap filling, or outlier replacement, unlike C2.
- Four natural C4 interpolation events for which B0 and C4 truly differ. The
  selector prefers separate source clips; participant clips are only used here
  because short, bounded gaps are rare in the reference material.

Every task provides B0--C4 and the three isolated overlays, a deterministic
balanced initializer, a short instruction explaining the evidence to inspect,
and automatic source-evidence-quality candidates. `requires_evidence_quality`
asks the UI to collect the human quality judgment; the automatic candidate is
only a triage hint.

Example:

```sh
PYTHONPATH=pose-processing:motion-pipeline motion-pipeline/.venv/bin/python \
  -m motion_extraction.annotation_tool.append_targeted_preprocessing_tasks \
  --manifest temp/experiments/20260825-preprocessing-cleanup-v10/annotation_tasks.json \
  --corpus-root temp/experiments/20260813-preprocessing-lightweight \
  --reference-video-root ../data/reference_motions/videos/chi-studyvideos \
  --participant-video-root ../data/participant_motions \
  --output-root /tmp/targeted-preprocessing \
  --output-manifest /tmp/targeted-preprocessing/annotation_tasks.json
```

The generator rejects a manifest that already contains this batch ID or task
prefix, so it cannot silently duplicate targeted tasks.
