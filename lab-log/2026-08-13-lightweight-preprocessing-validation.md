---
date: 2026-08-13
tags: [pose-preprocessing, validation, participant-data, motion-pipeline]
artifacts: []
---

# Lightweight pose-preprocessing validation

## User intent

> I’m not looking for an extremely thorough treatment of pre-processing, just some a sensible approach and some lightweight validation. This whole pre-processing step is just a small piece of the thing I’m building — My goal is simply to ensure motion artifacts don’t impede my later experimental goals; my goal isn’t to produce the absolute best mediapipe cleanup script possible.

The cached participant poses may use an older format. The current repository consolidates participant and reference-video extraction, so validation must regenerate canonical poses from source videos rather than reuse the legacy participant pose files.

## Decisions

- Evaluate preprocessing directly against the source-video motion, not through downstream metric correlations.
- Use a small corpus: all five CHI reference videos and twenty participant videos covering both studies, dances, study conditions, longer performances, short clips, and unusual framing.
- Generate both participant and reference poses through the same current shared extractor and canonical raw-pose contract.
- Keep two additional participant candidates only as an initial extraction pool; exclude them from later comparison because they duplicate short/framing edge cases already represented.
- Limit the initial comparison to the current preprocessing and one conservative cleanup candidate, followed by a small visual review.

## Findings

- Fresh extraction completed for five reference and twenty-two participant candidates: 27 videos and 6,041 frames.
- Every video produced paired canonical 2D and holistic raw artifacts; no output was missing or empty.
- Across the extraction pool, 142 frames (2.35%) had no detected pose. The distribution was concentrated rather than uniform: one reference video accounted for 120 missing frames and another for 15.
- The participant clips generally had few whole-pose detection failures, but low visibility for individual extremity landmarks remains common and is the more relevant input for conservative per-landmark cleanup.

## Next step

Implement and compare one conservative preprocessing candidate: visibility-aware masking, repair of only short internal gaps, isolated-jump handling, and light smoothing that does not cross discontinuities.
