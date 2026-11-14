# LLM pose judge (exploratory)

Tests whether a multimodal Claude model can tell if a MediaPipe pose estimate is
correct when it sees the frame with the skeleton overlay burned in. Findings and
numbers: [`lab-log/2026-11-07-llm-pose-judge.md`](../../../lab-log/2026-11-07-llm-pose-judge.md)
(synthetic errors, reference videos) and
[`lab-log/2026-11-07-llm-pose-judge-manual-review.md`](../../../lab-log/2026-11-07-llm-pose-judge-manual-review.md)
(Viona's annotations, participant frames; nothing participant-related is committed).

This is exploratory research code. Nothing here is wired into the pipeline or the
frontend.

## Files

- `common.py`: pose CSV loading, overlay rendering (orange = subject's left,
  blue = subject's right, white = torso/face), and the synthetic perturbations.
- `build_dataset.py <out>`: picks visually stable, high-visibility frames from the
  reference videos, renders clean overlays plus one perturbed copy per frame, and
  six-frame sequence grids (0.2 s apart) in clean and perturbed versions.
  Writes `<out>/manifest.json` and `<out>/img/`.
- `make_natural_manifest.py <ds> <labels.json>`: builds the natural-failure manifest.
- `natural_candidates.py <out>`: finds frames where raw MediaPipe output is likely
  wrong (temporal spikes, left/right label jumps, low visibility) and renders them
  for manual labelling. Labels used in the run are in the lab-log assets
  (`natural_labels.json`).
- `run_judge.py`: sends each item to a model through headless Claude Code
  (`claude -p --input-format stream-json`, base64 images, no tools, custom system
  prompt) and appends one JSON line per item. Resumable. Conditions: `single`
  (overlay only), `single_raw` (raw frame + overlay), `sequence` (6-frame grid).
- `render_manual_review.py <code-repo-root> <out>`: part 2. Runs where the
  access-controlled data lives. Renders frames from Viona's 48 detailed manual
  reviews (corrected, unusable and unmarked frames, with correction magnitude in
  torso lengths) and 3×3 clip grids for the usability-rated segments and every
  human-rated CHI25 clip. Writes `manifest_frames.json` / `manifest_clips.json`.
  Conditions for it in `run_judge.py`: `single_upper`, `single_raw_upper`, `clip`.
- `analyze_manual.py <frames-manifest> <clips-manifest> <results-dir> <motion_metrics.csv> <summary.json>`:
  recall by correction magnitude, clip flag rate by usability rating, and metric vs
  human-rating Spearman with LLM-flagged clips removed against a random-removal baseline.
- `plot_manual.py <summary.json> <out-stem>`: the part-2 figure.
- `plot.py <summary.json> <out-stem>`: the detection-by-error-type figure.
- `analyze.py <results-dir> <summary.json>`: accuracy, precision/recall with
  "skeleton incorrect" as the positive class, specificity, AUC from the model's
  `p_incorrect`, per-perturbation rates, and bad-frame localisation for sequences.

## Inputs

Defaults resolve relative to this folder: `../../../data/reference_motions`
(override with `REFERENCE_MOTIONS`; needs `videos/` and `pose-raw/pose2d/`) and
the committed smoke-test corpus for `attention_zoom_out`. Only reference videos
were used, no participant recordings. Rendered frames are Drive-owned source data:
keep generated images under `temp/experiments/`, not in Git.

## Reproduce

```bash
cd motion-pipeline/adhoc_analysis/llm_pose_judge
OUT=../../temp/experiments/2026-11-07-llm-pose-judge
python build_dataset.py $OUT/ds          # needs numpy, opencv-python-headless
python natural_candidates.py $OUT/ds
python run_judge.py --ds $OUT/ds --model claude-haiku-5-5 --cond single --out $OUT/res/haiku_single.jsonl
python analyze.py $OUT/res $OUT/summary.json   # needs scikit-learn
```

For the natural-failure set: `python make_natural_manifest.py $OUT/ds ../../../lab-log/assets/2026-11-07-llm-pose-judge/natural_labels.json`,
then `run_judge.py ... --manifest $OUT/ds/natural/manifest.json`.
