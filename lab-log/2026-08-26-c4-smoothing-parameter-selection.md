---
date: 2026-08-26
tags: [pose-preprocessing, smoothing, c4, validation, human-annotation, motion-pipeline, experiment]
artifacts:
  - assets/2026-08-26-c4-smoothing-parameter-selection/tradeoffs.png
  - assets/2026-08-26-c4-smoothing-parameter-selection/numerical_summary.csv
  - assets/2026-08-26-c4-smoothing-parameter-selection/annotation_summary.csv
  - assets/2026-08-26-c4-smoothing-parameter-selection/grid-worker-check-report.md
---

# C4 smoothing-strength parameter selection

## Continuity note

This entry reconstructs the state of an in-progress investigation from its
work products (experiment outputs, the annotation database, and a prior
agent-session transcript excerpt), not from a fresh conversation with Viona.
Treat the "why" below as the investigating agent's reasoning, carried forward
for continuity, and re-confirm anything load-bearing against the cited
artifacts rather than this prose alone. See
[2026-08-25-preprocessing-cleanup.md](2026-08-25-preprocessing-cleanup.md) for
the original user intent this work continues (in particular: "Visually, to
me, the smoothing on C2 seems potentially appropriate. How do we determine
what the trusted 2D motion is?").

## Decisions

- `C2` bundles four operations (visibility masking, gap fill to 3 frames,
  outlier replacement, triangular-3 smoothing) and cannot isolate whether
  smoothing helps. The comparison was reframed as `C4` (gap fill to 2 frames
  only, everything else off) versus `C4` plus smoothing at varying strength.
- Parameterize the existing symmetric three-frame filter by strength `a`,
  weights `[a, 1-2a, a]`, so the current triangular-3 setting is the `a=0.25`
  case and weaker smoothing is one continuous dimension rather than a new
  filter family or window length. Implemented in
  `motion_extraction/scripts/run_c4_smoothing_grid.py` (default grid
  `a = 0, .05, .10, .15, .20, .25`).
- Closed the last open task in the `20260825-preprocessing-cleanup-v10`
  editable-pose-ground-truth annotation batch:
  `targeted-preprocess-01-bartender-frame-00208` (case
  `targeted-preprocess-01`) is marked `unclear` (DB revision 669 supersedes
  revision 432) and excluded from quantitative comparison, rather than forcing
  a judgment call the source frame does not support. All 75 tasks in that
  batch now have a final disposition: 74 `completed`, 1 `unclear`.
- Selection should come from a Pareto trade-off between artifact reduction and
  distortion, confirmed by blinded human review, not from minimizing
  acceleration/roughness alone — the same principle the 2026-08-25 entry
  established for C1–C4.

## Findings

### Numerical and annotation-based grid (`a = 0` to `0.25`)

Two grid runs exist under `motion-pipeline/temp/experiments/`:

- `20260826-c4-smoothing-grid-v2`: fine-grained low end, `a = 0, .01, .02, .03, .04, .05`.
- `20260826-c4-smoothing-grid-worker-check`: the script's default grid,
  `a = 0, .05, .10, .15, .20, .25`, copied here as
  [grid-worker-check-report.md](assets/2026-08-26-c4-smoothing-parameter-selection/grid-worker-check-report.md).
  Both point-check `C4` (`a=0`) as the reference row.

Both runs' `run_provenance.json` record a `created_utc` after revision 669's
`created_at` (11:33:49 UTC) — `grid-worker-check` at 12:10:47 UTC and `grid-v2`
at 12:24:35 UTC — so both already reflect the fully resolved 75-task
annotation batch (`annotation.selection.excluded_not_completed: 1` in
`grid-worker-check`'s provenance is exactly that excluded task). No re-run is
needed on that account. Reproduce `grid-worker-check` with:

```bash
cd code-ai-motion-coach/motion-pipeline
.venv/bin/python -m motion_extraction.scripts.run_c4_smoothing_grid \
  --corpus-root temp/experiments/20260813-preprocessing-lightweight \
  --annotations-db data/human-annotations/preprocessing-overlay-quality/annotations.sqlite3 \
  --annotation-manifest temp/experiments/20260825-preprocessing-cleanup-v10/annotation_tasks.json \
  --output-root temp/experiments/<new-output-dir> \
  --bootstrap-samples 500
```

Across the default grid (means across clips; full detail in
[numerical_summary.csv](assets/2026-08-26-c4-smoothing-parameter-selection/numerical_summary.csv)
and
[annotation_summary.csv](assets/2026-08-26-c4-smoothing-parameter-selection/annotation_summary.csv)):

| a | high-frequency energy reduction | path retention | peak-speed retention | annotation within-tolerance rate |
|---:|---:|---:|---:|---:|
| 0.00 | 0% | 100% | 100% | 71.6% |
| 0.05 | 29.1% | 89.9% | 88.3% | 65.1% |
| 0.10 | 53.0% | 80.6% | 76.9% | 59.8% |
| 0.15 | 71.6% | 72.2% | 66.5% | 58.2% |
| 0.20 | 85.0% | 65.2% | 57.3% | 54.2% |
| 0.25 (current triangular-3) | 93.1% | 59.9% | 49.3% | 51.1% |

Both artifact reduction and positional/annotation agreement degrade
monotonically with `a`; there is no free lunch in this range, which is why the
temporal (human motion) review below is load-bearing rather than a formality.

### Frequency response (analytic, verified)

For the corpus's verified 23.976 fps source, the symmetric filter's frequency
response is `H(f) = (1 - 2a) + 2a * cos(2*pi*f/fps)`. This was checked
analytically (not from a corpus spectral measurement) and matches the cited
figures:

| a | 1 Hz | 2 Hz | 3 Hz | 4 Hz | 6 Hz |
|---:|---:|---:|---:|---:|---:|
| 0.25 (current) | 98.3% | 93.3% | 85.4% | 75.0% | 50.0% |
| 0.10 | 99.3% | 97.3% | 94.1% | 90.0% | 80.0% |

The current `a=0.25` setting attenuates fast distal motion (4–6 Hz) far more
than it looks from the 1 Hz figure alone; `a=0.10` retains substantially more
of that band. This motivates including `a=0.10`/`a=0.15` as serious low-end
candidates rather than only comparing `a=0` against the current `a=0.25`.

### Temporal (human) review — scaffolded, not yet judged

`motion_extraction/annotation_tool/generate_temporal_comparison_tasks.py`
implements the blinded-paired-clip design (source window plus three
anonymized candidate overlays, labeled only A/B/C, with a private answer key).
A batch exists at
`motion-pipeline/temp/experiments/20260826-c4-smoothing-temporal-v1`
(6 tasks: 4 unique source-backed windows + 2 blinded repeats;
`task_type=temporal_pose_comparison`), with its profile-mapping answer key at
the sibling `20260826-c4-smoothing-temporal-v1-answer-key.csv` (private —
keep out of committed docs and lab-log assets).

As of this entry, the annotations database
(`motion-pipeline/data/human-annotations/preprocessing-overlay-quality/annotations.sqlite3`)
contains **zero** `temporal_pose_comparison` revisions. This step requires
Viona to actually run the annotation tool and make the blinded judgments; no
agent should fabricate or infer these results.

## Open questions / next steps

1. Run the temporal review: serve the `20260826-c4-smoothing-temporal-v1`
   batch and have Viona complete the 6 blinded comparisons (with
   "no discernible difference", a confidence rating, and awareness that the
   set includes a repeat/catch pair).
2. Apply the decision rule from the prior session's proposal once temporal
   judgments exist: choose the weakest `a` that (a) is positionally
   equivalent to `C4` within annotation repeatability, (b) materially reduces
   high-frequency artifact measures, (c) does not substantially attenuate real
   movement features, and (d) produces no consistent, confident human
   judgment of distortion. If none qualifies, retain `C4` with no smoothing.
   If two settings are indistinguishable to Viona, choose the weaker one.
3. Write the resulting decision into
   [documentation/preprocessing-cleanup-experiment-report.md](../documentation/preprocessing-cleanup-experiment-report.md)
   and update
   [documentation/project-state.md](../documentation/project-state.md).
   Normal pipeline calls remain `config=None` (`B0`) until a setting is
   deliberately wired in — do not change pipeline defaults as a side effect of
   this analysis.
