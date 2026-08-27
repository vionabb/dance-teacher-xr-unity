# Pose preprocessing cleanup experiment report

**Date:** 2026-08-25  
**Current decision:** Select internal gap interpolation up to two frames as a low-risk provisional setting, without enabling it in normal pipeline calls yet. Do not enable visibility masking or outlier replacement. Keep C2 smoothing undecided until source-backed adjusted-skeleton judgments are collected.

## Question and scope

This lightweight experiment asked whether simple preprocessing would prevent pose artifacts from obstructing later motion research. It evaluated pose output directly, not downstream metric correlations, and sought a proportionate engineering safeguard rather than optimal MediaPipe reconstruction.

The corpus contained five reference and twenty participant clips (5,972 frames). Both groups had been freshly extracted through the repository’s current shared extractor in canonical `pose2d` and `holistic_3d` formats; legacy participant caches were excluded.

## Profiles

| Profile | Visibility | Maximum internal gap | Outlier threshold / ratio | Smoothing |
|---|---:|---:|---:|---|
| `B0` | none | none | none | none |
| `C1` | 0.20 | 3 | 0.75 torso / 3.0 | none |
| `C2` | 0.20 | 3 | 0.75 torso / 3.0 | triangular-3 |
| `C3` | 0.50 | 3 | 0.50 torso / 2.0 | triangular-3 |
| `C4` | off | 2 | off | none |

Passing no config preserves historical output. Configured cleanup records per-frame masking, interpolation, replacement, and smoothing actions.

## Investigation method

The automatic sweep measured finite-coordinate and usable-frame coverage; per-file 95th-percentile normalized acceleration; displacement from B0 on high-confidence observations; natural gap runs; controlled internal gaps and isolated spikes; unprompted outlier actions on unlabelled natural spans; and protection of edge and longer gaps.

An independent evidence audit caught two interpretation problems. The first roughness calculation included the generated, unnormalized `base` trajectory; final results exclude `base` and preprocessing metadata and use the 33 MediaPipe pose landmarks. The audit also required that unlabelled natural corrections not be called false positives. Finally, because the corpus contained no natural three-frame gaps and synthetic three-frame median error was 0.158 torso lengths, the gap-only profile was capped at two frames.

Roughness reduction was not treated as fidelity. To decide whether C2 better matches a recorded pose, the final runner locates five-frame windows around high B0–C2 disagreements on high-visibility distal joints, plus ordinary controls, and expands them into full-resolution single-frame review tasks. Static frames are not used to judge temporal properties such as jitter, lag, or attenuation.

## Automatic results

### Coverage and roughness

Coverage is frame-weighted; roughness is the unweighted mean of per-file acceleration p95 after the audit correction.

| Profile | Finite coordinates | Usable frames | 2D roughness | 3D roughness |
|---|---:|---:|---:|---:|
| `B0` | 97.62% | 97.62% | 1.127 | 0.436 |
| `C1` | 72.26% | 94.84% | 0.951 | 0.365 |
| `C2` | 72.26% | 94.84% | 0.343 | 0.137 |
| `C3` | 62.95% | 86.65% | 0.325 | 0.131 |
| `C4` | 97.74% | 97.74% | 1.127 | 0.438 |

Visibility masking—not smoothing—caused the large C1/C2 coverage loss. C2/C3 are much smoother, but lower second differences do not establish anatomical accuracy.

### Gap-only C4

The raw corpus contained five one-frame and one two-frame internal whole-pose dropouts. `C4` filled exactly those seven frames: 231 landmark-frame interpolations per modality. It changed none of 132,524 eligible high-confidence observed landmark-frame samples, each measured as a three-component vector, and made no other action. Its coverage gain of 0.117 percentage points corresponds exactly to the repaired frames.

`C4` left the natural 15- and 120-frame terminal gaps untouched. In controlled checks it also left edge, three-frame, four-frame, and fifteen-frame gaps untouched. Its revised [gap plot](../lab-log/assets/2026-08-25-preprocessing-cleanup/gap-event-study2-5180.png) displays a bounded straight bridge and a difference panel that is zero wherever B0 exists.

This supports only a narrow statement: on this corpus, interpolation of internal gaps no longer than two frames is low-impact outside the missing interval. It does not prove that interpolated locations are anatomically correct, and the implementation has no independent track-reset/discontinuity detector.

### C1–C3

C1/C2 masked 49,680 landmark-frames and interpolated 2,772 per modality; C3 masked 59,866 and interpolated 3,226. These actions are far broader than the six whole-pose dropouts. Synthetic spike recovery was 36.4% for C1/C2 and 54.5% for C3. The outlier rules also made 26 and 150 unprompted actions on unlabelled natural spans, respectively.

C2 touched nearly the complete corpus. Across files, the median of per-file median displacement was approximately 0.050 torso lengths and the median of per-file p95 displacement was 0.204. That is a meaningful change, but not automatically a distortion: B0 is not reference truth, and a smoothed point can be closer to the person than the raw estimate.

## Determining trusted 2D

Relative 2D fidelity is established by comparison with source video, not by agreement with B0 or by minimum acceleration. The high-value selection unit is a short temporal window, but the requested annotation unit is one frame so spatial alignment and missing limbs can be judged at useful scale.

The reusable local tool presents a large source frame with an editable 2D skeleton. The annotator drags landmarks onto the recorded person and labels each `Non-occluded`, `Semi-occluded`, or `Fully occluded`; a selected profile supplies initial coordinates and visibility-derived labels. Completed skeletons are treated as globally approved approximate rather than pixel-precise ground truth. The server automatically ranks B0–C4 using visibility-weighted positional error beyond an annotation-repeatability tolerance (80%) and visibility-state error (20%). Fully occluded landmarks test whether a profile reports low visibility but do not contribute an unknowable positional target. One optional free-text observation records frame-level qualitative context for later coding.

Judgments are stored in an append-only SQLite revision table rather than browser storage. Each revision retains schema, experiment, profile, case/frame, artifact, annotator, adjusted pixel coordinates, three-level occlusion labels, initialization profile, automatic scores, an optional frame note, timestamp, and the superseded revision. The interface resumes at the first unfinished case and exports the full history as CSV or JSONL. This design can be reused for later human-in-the-loop research questions.

The queue contains 40 original reference-frame tasks, five repeat annotations pinned to their original revisions, a 12-frame participant batch, and 18 new targeted tasks. The participant batch uses the physical `data/participant_motions` files matched unambiguously by basename, not broken temporary-cache symlinks. The targeted batch adds two frames from each of the four other physical tutorial videos, isolates visibility masking, outlier replacement, and smoothing-only behavior, and includes four genuine C4 interpolation events. New tasks balance B0–C4 initializers and require a three-level human source-evidence-quality classification plus optional limitation factors. Repeat initializers use B0–C4 once each and always differ from the corresponding original initializer. The provisional positional tolerance is 5% of torso length; after three valid repeats, it is replaced by the median of per-repeat p90 differences for landmarks non-occluded in both annotations. Semi-occluded repeatability is reported separately. The targeted annotations are pending, so this adds discriminating coverage without yet supporting a new preprocessing conclusion.

## Decisions

- `C4` with a strict two-frame limit: accept as a **provisional**, provenance-marked setting. It addresses the only recurrent unambiguous artifact established by the corpus and preserves observed positions. Normal pipeline calls still use `config=None`; integration is a separate follow-up decision.
- `C3`: do not enable. It has the greatest coverage loss and broadest unprompted correction behavior.
- `C1`: do not enable as a bundle. Visibility masking is too broad relative to observed whole-pose gaps.
- `C2`: do not decide from the automatic sweep. Its smoothing may be appropriate; source-backed adjusted-skeleton judgments and frame notes must determine whether it improves fidelity enough to justify its changes. A later experiment should also separate smoothing from C1’s masking/outlier operations.

## Reproducibility and evidence

The final experiment is generated from `motion-pipeline/` with:

```bash
MPLCONFIGDIR=/tmp/preprocessing-mpl \
  .venv/bin/python -m motion_extraction.scripts.run_preprocessing_experiment \
  --corpus-root temp/experiments/20260813-preprocessing-lightweight \
  --output-root temp/experiments/20260825-preprocessing-cleanup-v10 \
  --max-plots 6 \
  --max-overlays 8
```

Selected durable evidence and the research narrative are linked from the [lab log](../lab-log/2026-08-25-preprocessing-cleanup.md). Full per-file and review artifacts remain regenerable under the experiment output root.
