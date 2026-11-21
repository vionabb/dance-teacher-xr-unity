---
date: 2026-11-21
tags: [metrics, qijia2d, discrepancy-review, validation, human-ratings]
artifacts: [assets/2026-11-21-within-clip-all-segments/gap_drivers_summary.json, assets/2026-11-21-within-clip-all-segments/within_clip_qijia2d.json]
---

# Within-clip agreement on all 1,397 rated segments

## User intent

After the ratings were re-joined to recordings and the Study 2 segment-1
ratings were added (see [chi25-study-design.md](../documentation/chi25-study-design.md)),
the agent offered to rerun the within-clip analysis on all 1,397 segments, which
include Study 2 bartender, last-christmas and mad-at-disney for the first time.
Viona replied: "please do". No thesis changes.

## What was run

The same pipeline as [2026-11-20](2026-11-20-metric-rater-gap-drivers.md), on
fresh table dumps and 658 more pose files: `exportVectorFrames.mjs`, then
`gap_drivers.py --segments-out`, then `within_clip.py` with the same six
symmetric variants. One fix: `gap_drivers.py` now computes the rater spread
from the raters who scored a segment, since a few have only one or two.
Segment scores still reproduce the review page's (max abs diff 1e-15).

1,397 segments, 32 clips, 98 participants, 23,382 informative same-clip pairs.

## Results

Observed unless marked.

| Variant (symmetric) | Within ρ [95% CI] | Pairwise [95% CI] | Δ within ρ vs all 8 | Pooled ρ |
| --- | --- | --- | --- | --- |
| Qijia2D, all 8 vectors | 0.50 [0.41, 0.56] | 0.72 [0.69, 0.75] | — | 0.44 |
| Arms only (no torso) | 0.50 [0.42, 0.56] | 0.72 [0.69, 0.75] | +0.00 [−0.02, +0.02] | 0.45 |
| Forearms only | 0.48 [0.41, 0.54] | 0.72 [0.69, 0.74] | −0.01 [−0.04, +0.02] | 0.46 |
| No upper arms | 0.48 [0.40, 0.54] | 0.71 [0.68, 0.74] | −0.02 [−0.04, +0.00] | 0.47 |
| Upper arms only | 0.33 [0.25, 0.41] | 0.65 [0.61, 0.68] | −0.16 [−0.21, −0.11] | 0.21 |
| Torso only | 0.13 [0.04, 0.22] | 0.56 [0.52, 0.60] | −0.36 [−0.43, −0.28] | 0.15 |

- **The 743-segment conclusions hold.** Within-clip agreement is about the
  same (0.50 against 0.51; pairwise 72% against 73%). Pooled-only advantages
  of forearms and of dropping the upper arms still vanish within clips, and the
  arms still carry the ranking information.
- **Pajama-party clip 1 is negative in both studies:** ρ = −0.23 in Study 1
  and −0.21 in Study 2, with different participants. Observed. Inferred: this
  points at the clip, not at chance or one cohort, which fits Viona's lead-in
  hypothesis. Still needs her visual review.
- **Study 2 bartender clip 4 is weak** (ρ = 0.11, n = 39), and the metric is
  much harsher there than the raters (mean rank gap −23.6). New with this
  data; not yet looked at.
- Between-clip offsets explain 26% of rank-gap variance (31% before); the
  median within-clip ρ is 0.54 (0.57 before).
- Rating ceiling: 32% of segments got 5 (39% before); they make up 79% of the
  harshest rank-gap decile (88% before).
- Mirroring, timing shifts and legs are still not drivers: 25% of segments
  score higher mirrored, median best lag is 2 frames, median leg visibility
  0.04.

Per clip, Qijia2D (ρ below 0.2 in bold):

| Study · dance · clip | n | ρ within clip | Pairwise | Mean rank gap | Mean metric | Mean human |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 · last-christmas · 1 | 51 | 0.38 | 0.66 | +26.9 | 4.27 | 3.85 |
| S1 · last-christmas · 2 | 50 | 0.54 | 0.74 | +24.3 | 4.28 | 3.87 |
| S1 · last-christmas · 3 | 49 | 0.63 | 0.78 | −2.9 | 4.05 | 3.87 |
| S1 · last-christmas · 4 | 49 | 0.54 | 0.76 | +27.8 | 4.40 | 4.07 |
| S1 · mad-at-disney · 1 | 47 | 0.58 | 0.76 | +2.6 | 4.12 | 4.05 |
| S1 · mad-at-disney · 2 | 47 | 0.48 | 0.72 | −3.1 | 4.08 | 4.12 |
| S1 · mad-at-disney · 3 | 47 | 0.60 | 0.80 | +2.2 | 4.14 | 4.12 |
| S1 · mad-at-disney · 4 | 47 | 0.58 | 0.76 | +6.5 | 4.14 | 3.94 |
| S1 · mad-at-disney · 5 | 47 | 0.36 | 0.65 | +12.5 | 4.13 | 3.68 |
| S1 · pajama-party · 1 | 48 | **−0.23** | 0.39 | −15.6 | 3.99 | 3.76 |
| S1 · pajama-party · 2 | 47 | 0.73 | 0.81 | +14.8 | 4.19 | 3.84 |
| S1 · pajama-party · 3 | 48 | 0.73 | 0.85 | −27.9 | 3.86 | 4.03 |
| S1 · pajama-party · 4 | 49 | 0.42 | 0.68 | −3.8 | 3.99 | 3.84 |
| S1 · pajama-party · 5 | 49 | 0.64 | 0.79 | −5.2 | 4.05 | 3.91 |
| S2 · bartender · 1 | 39 | 0.62 | 0.77 | −0.4 | 4.06 | 3.80 |
| S2 · bartender · 2 | 39 | 0.50 | 0.71 | −7.9 | 4.01 | 3.92 |
| S2 · bartender · 3 | 39 | 0.48 | 0.71 | −7.0 | 4.05 | 4.01 |
| S2 · bartender · 4 | 39 | **0.11** | 0.54 | −23.6 | 3.77 | 3.72 |
| S2 · last-christmas · 1 | 41 | 0.53 | 0.73 | +14.5 | 4.20 | 3.96 |
| S2 · last-christmas · 2 | 41 | 0.57 | 0.75 | +13.5 | 4.17 | 3.86 |
| S2 · last-christmas · 3 | 40 | 0.67 | 0.77 | −9.2 | 3.86 | 3.42 |
| S2 · last-christmas · 4 | 39 | 0.82 | 0.88 | +18.7 | 4.21 | 3.62 |
| S2 · mad-at-disney · 1 | 40 | 0.48 | 0.72 | −4.3 | 4.09 | 4.18 |
| S2 · mad-at-disney · 2 | 40 | 0.59 | 0.78 | −21.1 | 3.87 | 4.07 |
| S2 · mad-at-disney · 3 | 40 | 0.53 | 0.74 | +0.2 | 4.08 | 3.98 |
| S2 · mad-at-disney · 4 | 40 | 0.59 | 0.77 | +4.3 | 4.09 | 3.77 |
| S2 · mad-at-disney · 5 | 40 | 0.36 | 0.65 | +5.3 | 4.09 | 3.72 |
| S2 · pajama-party · 1 | 41 | **−0.21** | 0.41 | +8.0 | 4.04 | 3.41 |
| S2 · pajama-party · 2 | 41 | 0.37 | 0.66 | +4.3 | 4.03 | 3.72 |
| S2 · pajama-party · 3 | 41 | 0.70 | 0.79 | −29.0 | 3.63 | 3.59 |
| S2 · pajama-party · 4 | 41 | 0.51 | 0.73 | −19.9 | 3.67 | 3.52 |
| S2 · pajama-party · 5 | 41 | 0.64 | 0.79 | −20.1 | 3.79 | 3.50 |

With about 40–50 performances per clip, one clip's ρ has a 95% interval of
roughly ±0.25.

Figures (no participant data) are in the project files folder
`metric-rater-gap/all-1397-segments/`.

## Next

- Viona's visual review of pajama-party clip 1 (both studies) and Study 2
  bartender clip 4.
- Run Viona2D through the evaluator once its per-segment scores are exported.
