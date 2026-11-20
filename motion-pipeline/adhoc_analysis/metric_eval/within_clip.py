"""Within-clip agreement between any per-segment metric score and human ratings.

A metric is judged by whether, *for each reference clip*, it orders performances the
way human raters do. Clip-level offsets (one clip scoring lower for everyone) do not
count against it. Viona accepted this framing on 2026-11-20 while we work out what the
metrics capture of human similarity perception.

Input: a CSV with one row per rated segment and columns
  participant  cluster id for the bootstrap (kept local; never written to output)
  clip         reference-clip key (e.g. study/dance/clip)
  human        human rating
  <metric>...  one column per metric score (higher = more similar)

Reported per metric:
  within_rho      performance-weighted mean of per-clip Spearman rho
  pairwise        share of same-clip pairs the raters scored differently that the metric
                  orders the same way (metric ties count as half); pairs tied by raters
                  are skipped. 0.5 = chance.
  pooled_rho      Spearman over all segments ignoring clips (for reference only)
  per_clip        rho and pairwise per clip, with n
  vs_baseline     paired differences to the baseline metric
95% intervals resample participants with replacement (all of a participant's segments
move together), so clip and metric comparisons stay paired.

Usage:
  uv run python adhoc_analysis/metric_eval/within_clip.py segments.csv --out summary.json \
      --metric M="Qijia2D (8 vectors)" --metric forearms="Forearms only" --baseline M
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

MIN_CLIP_N = 10


def clip_rho(metric: np.ndarray, human: np.ndarray) -> float:
    if len(metric) < 3 or np.ptp(metric) == 0 or np.ptp(human) == 0:
        return np.nan
    return float(spearmanr(metric, human).statistic)


def clip_pairs(metric: np.ndarray, human: np.ndarray) -> tuple[float, int]:
    """(concordant credit, informative pairs) over pairs with different human ratings."""
    dh = np.sign(human[:, None] - human[None, :])
    dm = np.sign(metric[:, None] - metric[None, :])
    upper = np.triu(np.ones_like(dh, dtype=bool), 1) & (dh != 0)
    credit = np.where(dm[upper] == 0, 0.5, (dm[upper] == dh[upper]).astype(float))
    return float(credit.sum()), int(upper.sum())


def evaluate(df: pd.DataFrame, metrics: list[str]) -> dict:
    out = {}
    for m in metrics:
        rhos, weights, credit, pairs, per_clip = [], [], 0.0, 0, {}
        for clip, d in df.groupby("clip", sort=True):
            if len(d) < MIN_CLIP_N:
                continue
            r = clip_rho(d[m].to_numpy(), d.human.to_numpy())
            c, p = clip_pairs(d[m].to_numpy(), d.human.to_numpy())
            per_clip[str(clip)] = {
                "n": len(d),
                "rho": r,
                "pairwise": c / p if p else np.nan,
            }
            if np.isfinite(r):
                rhos.append(r)
                weights.append(len(d))
            credit += c
            pairs += p
        out[m] = {
            "within_rho": float(np.average(rhos, weights=weights)) if rhos else np.nan,
            "pairwise": credit / pairs if pairs else np.nan,
            "pooled_rho": clip_rho(df[m].to_numpy(), df.human.to_numpy()),
            "informative_pairs": pairs,
            "clips": len(per_clip),
            "per_clip": per_clip,
        }
    return out


STATS = ("within_rho", "pairwise", "pooled_rho")


def bootstrap(
    df: pd.DataFrame, metrics: list[str], baseline: str | None, n: int, seed: int
):
    rng = np.random.default_rng(seed)
    groups = [g.index.to_numpy() for _, g in df.groupby("participant")]
    draws = {m: {s: [] for s in STATS} for m in metrics}
    diffs = {m: {s: [] for s in STATS} for m in metrics if baseline and m != baseline}
    for _ in range(n):
        idx = np.concatenate(
            [groups[i] for i in rng.integers(0, len(groups), len(groups))]
        )
        res = evaluate(df.loc[idx].reset_index(drop=True), metrics)
        for m in metrics:
            for s in STATS:
                draws[m][s].append(res[m][s])
                if m in diffs:
                    diffs[m][s].append(res[m][s] - res[baseline][s])
    ci = lambda xs: [
        float(np.nanpercentile(xs, 2.5)),
        float(np.nanpercentile(xs, 97.5)),
    ]
    return (
        {m: {s: ci(v) for s, v in d.items()} for m, d in draws.items()},
        {m: {s: ci(v) for s, v in d.items()} for m, d in diffs.items()},
    )


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("segments", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--metric", action="append", required=True, help="column=label")
    ap.add_argument("--baseline")
    ap.add_argument("--participant-col", default="participant")
    ap.add_argument(
        "--clip-col",
        default="clip",
        help="column, or comma-separated columns joined into a key",
    )
    ap.add_argument("--human-col", default="human")
    ap.add_argument("--boot", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    labels = dict(
        item.split("=", 1) if "=" in item else (item, item) for item in args.metric
    )
    metrics = list(labels)
    raw = pd.read_csv(args.segments)
    clip_cols = args.clip_col.split(",")
    if len(clip_cols) > 1:
        raw["clip_key"] = raw[clip_cols].astype(str).agg("/".join, axis=1)
        args.clip_col = "clip_key"
    cols = [args.participant_col, args.clip_col, args.human_col, *metrics]
    df = raw[cols].set_axis(["participant", "clip", "human", *metrics], axis=1).dropna()
    point = evaluate(df, metrics)
    cis, diffs = bootstrap(df, metrics, args.baseline, args.boot, args.seed)
    summary = {
        "framing": "within-clip ranking agreement; clip-level offsets are not penalized",
        "n_segments": len(df),
        "n_participants": int(df.participant.nunique()),
        "dropped_rows_with_missing_values": len(raw) - len(df),
        "baseline": args.baseline,
        "metrics": {
            m: {
                "label": labels[m],
                **{s: point[m][s] for s in STATS},
                "ci95": cis[m],
                **(
                    {
                        "vs_baseline": {
                            s: {
                                "diff": point[m][s] - point[args.baseline][s],
                                "ci95": diffs[m][s],
                            }
                            for s in STATS
                        }
                    }
                    if m in diffs
                    else {}
                ),
                "informative_pairs": point[m]["informative_pairs"],
                "per_clip": point[m]["per_clip"],
            }
            for m in metrics
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(summary, indent=2, allow_nan=True))
    for m in metrics:
        s = summary["metrics"][m]
        line = f"{labels[m]:<34} within ρ {s['within_rho']:.3f} {np.round(s['ci95']['within_rho'], 3)}  pairwise {s['pairwise']:.3f} {np.round(s['ci95']['pairwise'], 3)}  pooled ρ {s['pooled_rho']:.3f}"
        if "vs_baseline" in s:
            v = s["vs_baseline"]
            line += f"  Δwithin {v['within_rho']['diff']:+.3f} {np.round(v['within_rho']['ci95'], 3)}  Δpairwise {v['pairwise']['diff']:+.3f} {np.round(v['pairwise']['ci95'], 3)}"
        print(line)


if __name__ == "__main__":
    main()
