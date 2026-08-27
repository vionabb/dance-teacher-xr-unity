# Conservative Gap Repair and Human Evaluation of Smoothing in Dance Pose Trajectories

## Abstract

Pose-estimation artifacts can contaminate motion analysis, while aggressive cleanup can erase genuine movement. We evaluated four optional cleanup profiles against existing preprocessing on five reference and twenty participant clips (5,972 frames), freshly processed through a shared extractor in 2D and holistic 3D. Direct measures included coverage, temporal roughness, baseline-relative displacement, natural gaps, controlled gaps and spikes, and boundary behavior. A gap-only profile capped at two frames repaired six naturally occurring whole-pose dropouts, changed no observed coordinates, and left edge and three-frame-or-longer gaps untouched. We consider this a low-risk provisional setting, without claiming that interpolated positions are ground truth; it has not yet replaced normal pipeline behavior. Visibility-aware profiles removed 25–35% of finite coordinates. Triangular smoothing substantially lowered second differences but changed nearly all eligible observations; because the unsmoothed baseline is not trusted 2D, this alone cannot establish distortion. We therefore built a resumable local annotation tool that prioritizes source-backed disagreement frames, lets an experimenter adjust a 2D skeleton and three-level occlusion states, and automatically ranks cleanup profiles while retaining one optional frame note in an append-only dataset. The initial 40-frame queue is limited to one readable reference clip. Smoothing remains an empirical human-judgment question rather than being accepted or rejected from roughness alone.

## 1. Introduction

MediaPipe pose sequences may contain low-confidence landmarks, short dropouts, isolated jumps, and jitter. These artifacts could interfere with motion metrics in an AI dance coach. Preprocessing is nevertheless supporting infrastructure rather than the primary research contribution. A proportionate solution should address common, clear artifacts while minimizing unverified alteration of observed movement.

This study asks two questions. First, can a narrow automatic operation safely repair recurrent missing data? Second, when smoothing appears visually promising, how can its fidelity be judged without treating the noisy baseline as ground truth?

## 2. Method

### 2.1 Corpus and profiles

The purposive corpus comprised five reference and twenty participant clips spanning two prior studies, multiple dances and conditions, segmented and whole performances, and unusual framing. It contained 5,972 frames. All poses had been regenerated through the current shared extractor in canonical 2D and holistic 3D formats; older participant caches were not used.

`B0` recenters on the hip midpoint, normalizes by torso length, and marks undefined frames unusable. `C1` masks body landmarks below visibility 0.20, fills bounded gaps up to three frames, and applies isolated-outlier logic. `C2` adds a centered triangular smoother with weights 0.25/0.50/0.25. `C3` uses more aggressive masking and outlier thresholds plus smoothing. `C4` performs only linear interpolation of bounded internal gaps up to two frames.

### 2.2 Automatic evaluation

We measured finite-coordinate and usable-frame coverage, per-clip 95th-percentile normalized acceleration, displacement from B0 on high-confidence observations, natural missing runs, controlled gaps and one-torso-length wrist spikes, unprompted outlier actions, and length/edge gap protection. An independent audit corrected the quality-root selection to exclude the generated unnormalized `base` trajectory and constrained claims about unlabelled natural corrections.

Roughness was interpreted only as trajectory behavior. A smoother series can be less noisy or less faithful. B0-relative displacement similarly measures change, not error, because B0 is not ground truth.

### 2.3 Human source-overlay evaluation

To investigate smoothing fidelity, the final runner identifies temporally separated windows with large B0–C2 disagreement on high-visibility wrists or ankles, then adds ordinary controls. Each selected window is expanded into five single-frame tasks with a large source image and separate full-resolution B0–C4 overlays.

The local annotation interface centers an editable skeleton over the source frame. A selected B0–C4 profile initializes coordinates and maps stored visibility to `Non-occluded` (1.0), `Semi-occluded` (0.5), or `Fully occluded` (0.0). Completed skeletons are treated as approximate rather than pixel-precise ground truth. The server ranks profiles using `0.8 × visibility-weighted coordinate error beyond an annotation-repeatability tolerance + 0.2 × mean visibility absolute error`; missing visible or semi-visible predictions receive a one-torso positional penalty. Fully occluded landmarks contribute visibility evidence but no positional error. Every revision records the initial and final points, actual per-landmark initializer sources, drag/change counts, global initializer, and an optional free-text frame note, while unclear/skip are retained.

## 3. Results

### 3.1 Gap-only repair

The corpus contained five one-frame and one two-frame internal whole-pose dropouts, plus terminal gaps of 15 and 120 frames. C4 filled exactly the seven internal frames, corresponding to 231 landmark-frame interpolations per modality. It made no masking, outlier, or smoothing actions and changed none of 132,524 eligible high-confidence observed landmark-frame samples, each measured as a three-component vector. Weighted finite/usable coverage rose from 97.622% to 97.739%.

C4 left the natural terminal gaps and controlled edge, three-frame, four-frame, and fifteen-frame gaps untouched. Its mean per-file acceleration p95 was effectively unchanged from B0 (2D: 1.1273 vs. 1.1268; holistic: 0.4359 vs. 0.4376). The evidence supports low impact outside missing intervals, not anatomical correctness inside them.

### 3.2 Visibility, outliers, and smoothing

Finite-coordinate coverage fell to 72.26% for C1/C2 and 62.95% for C3. C1/C2 masked 49,680 landmark-frames and interpolated 2,772 per modality; C3 masked 59,866 and interpolated 3,226. These operations extend far beyond the six whole-pose dropouts.

Mean per-file 2D acceleration p95 fell from 1.127 for B0 to 0.343 for C2 and 0.325 for C3. Across files, C2’s median of per-file median displacement was approximately 0.050 torso lengths and its median per-file p95 was 0.204. These results establish strong smoothing and material change, but not whether the change is beneficial.

### 3.3 Initial human-review queue

The generated queue contains 40 reference-frame tasks derived from six high-disagreement windows and two ordinary controls, five repeat annotations for tolerance calibration, 12 participant-frame tasks, and 18 targeted follow-up tasks. The participant sources are the physical `data/participant_motions` files, matched unambiguously to the selected corpus rows; eight tasks target high B0–C2 disagreement across the three study corpora and four are ordinary controls. The follow-up adds two source-backed frames from each of the four other tutorial videos, isolates visibility masking, outlier replacement, and smoothing-only behavior, and includes four actual C4 interpolation events. Initializers cycle across B0–C4, and every new task requires a human `usable`/`constrained`/`weak` source-evidence classification. Each repeat profile serves once as an alternate initializer and never matches the pinned original initializer. A provisional 5%-of-torso tolerance is replaced after three valid repeats by the median of per-repeat p90 differences among landmarks non-occluded in both passes; semi-occluded repeatability is reported separately. All full-resolution source and overlays resolve. Follow-up annotations are pending, so no new preprocessing conclusion is claimed.

## 4. Discussion

The gap-only result provides a useful stopping point for automatic preprocessing. It targets the only repeated, unambiguous corpus artifact, is capped at the observed one- and two-frame range, and leaves observed data unchanged. It remains provisional because source video was unavailable at the repaired events and there is no independent track-reset detector.

C2 requires a different kind of evidence. Its smoothness may represent jitter removal, motion attenuation, or both in different regions. Treating B0 as trusted would incorrectly label every helpful correction as distortion. Short source-backed windows, adjusted skeletons, and frame notes directly answer which overlay follows the recorded body. An append-only schema allows these judgments to accumulate into a reusable source-grounded human-judgment corpus rather than disappear as informal impressions.

The current C2 bundle also confounds smoothing with C1’s visibility masking and outlier handling. If human review favors the smoothed traces, the next lightweight experiment should isolate triangular smoothing from masking/outlier rules and compare it using the same task generator.

## 5. Limitations

Both modalities derive from the same extraction and are not independent replications. Controlled corruptions covered one 2D landmark and limited patterns. Boundary safety is based on gap length and edge position, not a semantic discontinuity detector. The repaired natural gaps lack source-backed visual validation. Participant annotations are pending. No finding establishes downstream metric or coaching validity.

## 6. Conclusion

Internal interpolation through at most two frames is a low-risk provisional setting for this corpus, but normal pipeline calls still retain B0 until integration is explicitly chosen. Visibility masking and outlier handling should not be enabled as tested. C2 smoothing should remain undecided until the source-overlay queue is annotated and broadened with participant videos. The revision-preserving annotation workflow makes that decision tractable while creating reusable source-grounded human-judgment data for future research questions.
