---
date: 2026-10-06
tags: [pose-preprocessing, motion-metrics, handoff]
artifacts: []
---

# Handoff: preprocessing and similarity validation

## Current state

- The source code is on `codex/preprocessing-metric-validation`. Commits
  `75e9233` and `b334f64` add the opt-in `qijia2d-quality-v1` TypeScript
  evaluator and tests. Legacy metric behavior and export are unchanged.
- The direct landmark and repair analyses, plus the paired 95-clip metric run,
  are complete under `motion-pipeline/temp/experiments/20261006-metric-baseline/`.
  Its scripts, row-level outputs, and provenance are Git-ignored and private.
  The non-identifying aggregate results and decisions are in the companion
  [lab entry](2026-10-06-preprocessing-metric-validation.md). An independent
  reviewer reproduced the calculations and checked frozen pose hashes,
  manifest joins, and person-group splits.
- No automatic usability exclusion or repair rule is validated. Current
  `calculationQuality` measures evidence sufficiency, not the chance a score
  matches human judgment. The fixed visibility gate loses substantial
  coverage without an established rating-correlation gain.
- No thesis chapter edit was made because these findings remain exploratory.

## Rerun

From the code repository root, with the motion-pipeline virtual environment
available (the same pinned environment as `motion-pipeline/.venv`):

```sh
motion-pipeline/.venv/bin/python motion-pipeline/temp/experiments/20261006-metric-baseline/landmark_signal_baseline.py
motion-pipeline/.venv/bin/python motion-pipeline/temp/experiments/20261006-metric-baseline/repair_baseline.py
node motion-pipeline/temp/experiments/20261006-metric-baseline/quality_aware_95.mjs
motion-pipeline/.venv/bin/python motion-pipeline/temp/experiments/20261006-metric-baseline/analyze_quality_95.py
```

The Node runner needs frontend dependencies installed. It checks the frozen
raw-pose hashes and reference windows for all 95 pairs before scoring and
writes `quality_aware_95.csv` and `quality_aware_95_provenance.json` beside
the script. `analyze_quality_95.py` writes `quality_aware_95_analysis.json`.
The Python scripts write `landmark_signal_results.json` and
`repair_results.json` plus clip counts. The source annotation database and
pose files are read-only inputs; the scripts write only to this experiment
directory. The copied aggregate assets in the lab entry do not include
participant rows or machine-specific source paths.

## Decision and single next action

Keep preprocessing and production similarity defaults unchanged. First,
construct a frozen, person-separated adjudication set containing the 161
unmarked positions selected by the exploratory isolated-jump rule and random
unselected controls, with source-video review and a recorded tolerance for
approximate landmark placement. Freeze the rule before using those judgments
to estimate false-correction cost. Then compare repair and quality-aware
similarity on a balanced direct-human-rating cohort, keeping both studies,
reference windows, and current-code raw control explicit. Do not infer
automatic exclusion or calibrated rating trust from the current selected
annotations.
