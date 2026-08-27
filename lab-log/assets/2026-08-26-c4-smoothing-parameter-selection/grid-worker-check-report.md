# C4 plus symmetric smoothing grid

C4 is the numerical comparison reference, not raw-video ground truth. Adjusted skeletons are human image-space annotations with their own repeatability limits.

## Numerical summary (means across clips)

| a | modality | acceleration p95 | displacement p95 vs C4 | path retention | peak-speed retention | high-frequency energy reduction |
|---:|:---|---:|---:|---:|---:|---:|
| 0.00 | holistic_3d | 0.4376 | 0 | 1 | 1 | 0 |
| 0.00 | pose2d | 1.1268 | 0 | 1 | 1 | 0 |
| 0.05 | holistic_3d | 0.36935 | 0.021577 | 0.89942 | 0.8831 | 0.29126 |
| 0.05 | pose2d | 0.95688 | 0.055914 | 0.89136 | 0.88772 | 0.29121 |
| 0.10 | holistic_3d | 0.30359 | 0.043154 | 0.80616 | 0.76945 | 0.52999 |
| 0.10 | pose2d | 0.7891 | 0.11183 | 0.79002 | 0.77834 | 0.52993 |
| 0.15 | holistic_3d | 0.24194 | 0.064731 | 0.72244 | 0.66485 | 0.71619 |
| 0.15 | pose2d | 0.62671 | 0.16774 | 0.69857 | 0.6716 | 0.71615 |
| 0.20 | holistic_3d | 0.18879 | 0.086308 | 0.65168 | 0.57274 | 0.84985 |
| 0.20 | pose2d | 0.48 | 0.22366 | 0.62085 | 0.57458 | 0.84989 |
| 0.25 | holistic_3d | 0.15113 | 0.10789 | 0.59857 | 0.4925 | 0.93098 |
| 0.25 | pose2d | 0.37505 | 0.27957 | 0.5628 | 0.49531 | 0.93113 |

The high-frequency band is 0.25–0.50 cycles/frame (Nyquist), computed with a Hann window on contiguous finite runs of at least 8 frames.

## Adjusted-skeleton positional summary

| a | mean error / torso | mean error beyond tolerance / torso | within-tolerance rate |
|---:|---:|---:|---:|
| 0.00 | 0.0663 | 0.05744 | 71.624% |
| 0.05 | 0.072183 | 0.058994 | 65.084% |
| 0.10 | 0.078664 | 0.063776 | 59.804% |
| 0.15 | 0.085517 | 0.069573 | 58.192% |
| 0.20 | 0.092649 | 0.076182 | 54.152% |
| 0.25 | 0.10001 | 0.083985 | 51.116% |

Positional summaries exclude unclear/latest-noncompleted tasks, calibration tasks, tasks without an adjusted skeleton, and fully occluded positional targets. Semi-occluded targets receive the annotation-store weight of 0.5. Statistics are first aggregated by task and case; bootstrap intervals resample cases.

Active tolerance(s): viona=0.026208 torso (empirical_median_repeat_p90)

See `annotation_summary.csv` for overall, source-quality-stratified (including `unclassified`) estimates and case-bootstrap intervals.
