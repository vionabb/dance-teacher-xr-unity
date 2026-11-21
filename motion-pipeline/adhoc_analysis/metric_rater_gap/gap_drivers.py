"""Which Qijia2D vectors and segment properties drive the metric-human rank gap?

Input: the per-frame, per-vector JSONL that
`svelte-web-frontend/scripts/exportVectorFrames.mjs` writes under the git-ignored
`local-data/research-chi25/analysis/`. Output: aggregate-only JSON (no participant
ids, frames or poses) to the directory given by --out.

Definitions match the discrepancy review (svelte-web-frontend/src/lib/research/segment-score.ts):
segment metric score M = mean over scored frames of 5 * (1 - mean valid vector error / 2);
human H = mean of three 1-3 ratings mapped to 1-5; rank gap = 100 * (mid-rank percentile of M
minus that of H) across all queue segments. Negative = metric harsher than raters.

Usage: uv run python adhoc_analysis/metric_rater_gap/gap_drivers.py --out <dir>
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import rankdata, spearmanr

REPO = Path(__file__).resolve().parents[3]
DEFAULT_INPUT = REPO / "local-data/research-chi25/analysis/vector-frames.jsonl"
VECTORS = [
    "shoulders (L→R)",
    "left torso side (shoulder→hip)",
    "hips (L→R)",
    "right torso side (hip→shoulder)",
    "left upper arm",
    "left forearm",
    "right upper arm",
    "right forearm",
]
LEG_VECTORS = [
    "left thigh",
    "left shin",
    "right thigh",
    "right shin",
]  # not scored by Qijia2D
GROUPS = {
    "torso (0-3)": [0, 1, 2, 3],
    "arms (4-7)": [4, 5, 6, 7],
    "left arm": [4, 5],
    "right arm": [6, 7],
    "upper arms": [4, 6],
    "forearms": [5, 7],
}
SQRT2 = np.sqrt(2)
MAX_LAG = 15  # frames (0.5 s at 30 fps)
BOOT = 1000


def mid_percentile(values: np.ndarray) -> np.ndarray:
    """Matches percentileRank in segment-score.ts: (below + ties/2) / n."""
    return (rankdata(values, method="average") - 0.5) / len(values)


def rank_gap(metric: np.ndarray, human: np.ndarray) -> np.ndarray:
    return 100 * (mid_percentile(metric) - mid_percentile(human))


def frame_scores(errors: np.ndarray, keep: list[int] | None = None) -> np.ndarray:
    """errors: frames x 8 with NaN for invalid. Score per frame over kept vectors."""
    e = errors if keep is None else errors[:, keep]
    valid = ~np.isnan(e)
    n = valid.sum(1)
    total = np.where(valid, e, 0).sum(1)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(n > 0, 5 * (1 - total / n / 2), np.nan)


def seg_score(errors: np.ndarray, keep: list[int] | None = None) -> float:
    s = frame_scores(errors, keep)
    return float(np.nanmean(s)) if np.isfinite(s).any() else np.nan


def unit_errors(p: np.ndarray, r: np.ndarray) -> np.ndarray:
    return np.linalg.norm(p - r, axis=-1)


def mirror(p: np.ndarray) -> np.ndarray:
    """Participant vectors as if the participant had been reflected left-right in the image."""
    refl = lambda v: v * np.array([-1.0, 1.0])
    out = np.empty_like(p)
    out[:, 0] = refl(-p[:, 0])
    out[:, 1] = refl(-p[:, 3])
    out[:, 2] = refl(-p[:, 2])
    out[:, 3] = refl(-p[:, 1])
    out[:, 4] = refl(p[:, 6])
    out[:, 5] = refl(p[:, 7])
    out[:, 6] = refl(p[:, 4])
    out[:, 7] = refl(p[:, 5])
    return out


def _array(
    frames: list[dict], key: str, dims: bool = False, width: int = 8
) -> np.ndarray:
    out = np.full((len(frames), width) + ((2,) if dims else ()), np.nan)
    for i, f in enumerate(frames):
        for v, x in enumerate(f[key]):
            if x is not None:
                out[i, v] = x
    return out


def load(path: Path) -> list[dict]:
    rows = []
    legs = len(LEG_VECTORS)
    for line in path.open():
        seg = json.loads(line)
        frames = seg["frames"]

        rows.append(
            {
                "segment": seg["segmentId"],
                "participant": f"{seg['study']}:{seg['participantId']}",
                "study": seg["study"],
                "dance": seg["dance"],
                "condition": seg["condition"],
                "clip": seg["clipNumber"],
                "human": seg["human"]["human_rating"],
                "raters": [seg["human"][f"rating_{k}"] for k in (1, 2, 3)],
                "row": np.array([f["row"] for f in frames], dtype=int),
                "time": np.array([f["time"] for f in frames]),
                "score": np.array(
                    [np.nan if f["score"] is None else f["score"] for f in frames]
                ),
                "err": _array(frames, "errors"),
                "pvis": _array(frames, "participantVisibility"),
                "rvis": _array(frames, "referenceVisibility"),
                "pvec": _array(frames, "participantVectors", True),
                "rvec": _array(frames, "referenceVectors", True),
                "plegs": _array(frames, "participantLegVectors", True, legs),
                "rlegs": _array(frames, "referenceLegVectors", True, legs),
                "plegvis": _array(frames, "participantLegVisibility", False, legs),
            }
        )
    return rows


def lagged_score(seg: dict, lag: int) -> float:
    """Participant row t compared with reference row t - lag (positive lag = participant late)."""
    # Rows may be sparse (frames without a participant pose are absent); index by row.
    n = int(seg["row"].max()) + 1 if len(seg["row"]) else 0
    if abs(lag) >= n:
        return np.nan
    p = np.full((n, 8, 2), np.nan)
    r = np.full((n, 8, 2), np.nan)
    p[seg["row"]] = seg["pvec"]
    r[seg["row"]] = seg["rvec"]
    if lag >= 0:
        pp, rr = p[lag:], r[: n - lag]
    else:
        pp, rr = p[: n + lag], r[-lag:]
    if len(pp) < n * 0.6:
        return np.nan
    return seg_score(unit_errors(pp, rr))


def features(rows: list[dict]) -> pd.DataFrame:
    recs = []
    for s in rows:
        e, scored = s["err"], np.isfinite(s["score"])
        valid = ~np.isnan(e)
        n = valid.sum(1, keepdims=True)
        share = np.where(valid, e, 0) / np.maximum(n, 1)
        contrib = 2.5 * share[scored].mean(0)  # sums to 5 - M
        m = float(np.nanmean(s["score"]))
        rec = {
            "segment": s["segment"],
            "participant": s["participant"],
            "study": s["study"],
            "dance": s["dance"],
            "condition": s["condition"],
            "clip": s["clip"],
            "H": s["human"],
            "M": m,
            "M_check": seg_score(e),
            # Some segments were scored by only one or two raters.
            "rater_sd": float(np.std([r for r in s["raters"] if r is not None])),
            "frames": int(scored.sum()),
            "invalid_vector_frac": float(np.isnan(e[scored]).mean()),
            "pvis_mean": float(np.nanmean(s["pvis"][scored])),
            "rvis_mean": float(np.nanmean(s["rvis"][scored])),
            "low_pvis_frac": float((s["pvis"][scored] < 0.5).mean()),
            "large_err_frac": float((e[scored] > SQRT2).mean()),
            "frame_score_sd": float(np.nanstd(s["score"])),
        }
        for v in range(8):
            rec[f"c{v}"] = float(contrib[v])
            rec[f"e{v}"] = float(np.nanmean(e[scored, v]))
            rec[f"big{v}"] = float((e[scored, v] > SQRT2).mean())
            rec[f"drop{v}"] = seg_score(e[scored], [k for k in range(8) if k != v])
        for g, keep in GROUPS.items():
            rec[f"only:{g}"] = seg_score(e[scored], keep)
            rec[f"drop:{g}"] = seg_score(
                e[scored], [k for k in range(8) if k not in keep]
            )
        # edges: first/last 15% of the segment's scored frames
        idx = np.flatnonzero(scored)
        k = max(1, round(0.15 * len(idx)))
        rec["M_trim15"] = (
            float(np.nanmean(s["score"][idx[k:-k]])) if len(idx) > 2 * k else np.nan
        )
        lags = {lag: lagged_score(s, lag) for lag in range(-MAX_LAG, MAX_LAG + 1)}
        best = max((v, lag) for lag, v in lags.items() if np.isfinite(v))
        rec["M_bestlag"], rec["best_lag"] = best
        rec["lag_gain"] = best[0] - lags[0]
        leg_err = unit_errors(s["plegs"], s["rlegs"])[scored]
        rec["leg_err"] = (
            float(np.nanmean(leg_err)) if np.isfinite(leg_err).any() else np.nan
        )
        rec["leg_vis"] = float(np.nanmean(s["plegvis"][scored]))
        rec["M_with_legs"] = seg_score(np.concatenate([e[scored], leg_err], axis=1))
        rec["M_mirror"] = seg_score(unit_errors(mirror(s["pvec"]), s["rvec"])[scored])
        recs.append(rec)
    df = pd.DataFrame(recs)
    df["rank_gap"] = rank_gap(df.M.to_numpy(), df.H.to_numpy())
    df["raw_gap"] = df.M - df.H
    return df


def cluster_boot(df: pd.DataFrame, stat, seed=0, n=BOOT):
    rng = np.random.default_rng(seed)
    groups = {k: v.index.to_numpy() for k, v in df.groupby("participant")}
    keys = list(groups)
    out = []
    for _ in range(n):
        pick = rng.choice(len(keys), len(keys), replace=True)
        idx = np.concatenate([groups[keys[i]] for i in pick])
        out.append(stat(df.loc[idx]))
    out = np.array(out)
    return [float(np.nanpercentile(out, 2.5)), float(np.nanpercentile(out, 97.5))]


def rho(a, b):
    return float(spearmanr(a, b, nan_policy="omit").statistic)


def summarize(df: pd.DataFrame) -> dict:
    out: dict = {"n_segments": len(df), "n_participants": int(df.participant.nunique())}
    out["score_reproduction_max_abs_diff"] = float((df.M - df.M_check).abs().max())
    base = lambda d: rho(d.M, d.H)
    out["baseline_spearman_M_H"] = {"rho": base(df), "ci95": cluster_boot(df, base)}

    def delta(col):
        f = lambda d: rho(d[col], d.H) - rho(d.M, d.H)
        return {
            "rho": rho(df[col], df.H),
            "delta_vs_all8": f(df),
            "ci95_delta": cluster_boot(df, f),
        }

    out["drop_one_vector"] = {VECTORS[v]: delta(f"drop{v}") for v in range(8)}
    out["drop_group"] = {g: delta(f"drop:{g}") for g in GROUPS}
    out["only_group"] = {g: delta(f"only:{g}") for g in GROUPS}
    out["single_vector_error_vs_H"] = {
        VECTORS[v]: {
            "rho_neg_error_H": rho(-df[f"e{v}"], df.H),
            "ci95": cluster_boot(df, lambda d, v=v: rho(-d[f"e{v}"], d.H)),
        }
        for v in range(8)
    }
    # Which contributions move with the rank gap (negative gap = metric harsher)?
    out["contribution_vs_rank_gap"] = {
        VECTORS[v]: {
            "rho": rho(df[f"c{v}"], df.rank_gap),
            "ci95": cluster_boot(df, lambda d, v=v: rho(d[f"c{v}"], d.rank_gap)),
        }
        for v in range(8)
    }
    terc = pd.qcut(
        df.rank_gap,
        [0, 0.1, 0.45, 0.55, 0.9, 1],
        labels=[
            "harshest 10%",
            "harsher",
            "agree (middle 10%)",
            "kinder",
            "kindest 10%",
        ],
    )
    shares = {}
    for label, d in df.groupby(terc, observed=True):
        c = d[[f"c{v}" for v in range(8)]].mean()
        shares[str(label)] = {
            "n": len(d),
            "mean_rank_gap": float(d.rank_gap.mean()),
            "mean_H": float(d.H.mean()),
            "mean_M": float(d.M.mean()),
            "deficit_points_by_vector": {
                VECTORS[v]: float(c.iloc[v]) for v in range(8)
            },
        }
    out["deficit_by_gap_band"] = shares
    out["segment_properties_vs_rank_gap"] = {
        col: {
            "rho": rho(df[col], df.rank_gap),
            "ci95": cluster_boot(df, lambda d, c=col: rho(d[c], d.rank_gap)),
        }
        for col in [
            "pvis_mean",
            "low_pvis_frac",
            "large_err_frac",
            "frame_score_sd",
            "lag_gain",
            "rater_sd",
            "clip",
        ]
    }
    out["max_invalid_vector_frac"] = float(df.invalid_vector_frac.max())
    out["abs_rank_gap_vs_rater_sd"] = rho(df.rater_sd, df.rank_gap.abs())
    out["by_group"] = {
        key: {
            str(k): {
                "n": len(d),
                "mean_rank_gap": float(d.rank_gap.mean()),
                "mean_H": float(d.H.mean()),
                "mean_M": float(d.M.mean()),
                "within_group_spearman": rho(d.M, d.H),
            }
            for k, d in df.groupby(key)
        }
        for key in ["study", "dance", "condition", "clip"]
    }
    df2 = df.copy()
    df2["sd_key"] = df2.study + "/" + df2.dance
    out["by_study_dance"] = {
        k: {
            "n": len(d),
            "mean_rank_gap": float(d.rank_gap.mean()),
            "within_spearman": rho(d.M, d.H),
        }
        for k, d in df2.groupby("sd_key")
    }
    # Pooled vs within-dance ranking: how much of the gap is between-dance offset?
    within = pd.concat(
        [
            pd.Series(rank_gap(d.M.to_numpy(), d.H.to_numpy()), index=d.index)
            for _, d in df2.groupby("sd_key")
        ]
    ).reindex(df.index)
    out["share_of_rank_gap_variance_between_study_dance"] = (
        float(1 - np.var(within) / np.var(df.rank_gap)) if np.var(df.rank_gap) else None
    )
    out["human_ceiling"] = {
        "frac_H_eq_5": float((df.H == 5).mean()),
        "frac_H_eq_5_in_harshest_10pct_rank_gap": float(
            (df.H[df.rank_gap <= df.rank_gap.quantile(0.1)] == 5).mean()
        ),
    }
    # Reference-clip offsets: same dance + clip number = same reference segment.
    df2["clip_key"] = df2["dance"] + "#" + df2["clip"].astype(str)
    cells = {}
    for k, d in df2.groupby(["study", "dance", "clip"]):
        cells["/".join(map(str, k))] = {
            "n": len(d),
            "spearman": rho(d.M, d.H),
            "mean_rank_gap": float(d.rank_gap.mean()),
            "mean_M": float(d.M.mean()),
            "mean_H": float(d.H.mean()),
        }
    out["by_study_dance_clip"] = cells
    out["median_within_cell_spearman"] = float(
        np.median([c["spearman"] for c in cells.values()])
    )
    cell_mean = df2.groupby(["study", "dance", "clip"]).rank_gap.transform("mean")
    out["share_of_rank_gap_variance_between_cells"] = float(
        np.var(cell_mean) / np.var(df.rank_gap)
    )
    df["M_clip_z"] = df2.groupby("clip_key").M.transform(
        lambda m: (m - m.mean()) / m.std()
    )
    df["H_clip_z"] = df2.groupby("clip_key").H.transform(
        lambda m: (m - m.mean()) / m.std()
    )
    out["what_ifs"] = {
        name: delta(col)
        for name, col in [
            ("trim first/last 15% of frames", "M_trim15"),
            ("best lag within ±0.5 s per segment (optimistic)", "M_bestlag"),
            ("add 4 leg vectors (equal weight)", "M_with_legs"),
            (
                "z-score M within each reference clip (needs per-clip calibration)",
                "M_clip_z",
            ),
        ]
    }
    resid = lambda d, a, b: (
        d[a].rank() - np.polyval(np.polyfit(d[b].rank(), d[a].rank(), 1), d[b].rank())
    )
    partial = lambda d: rho(resid(d, "H", "M"), -d.leg_err)
    out["legs"] = {
        "median_leg_visibility": float(df.leg_vis.median()),
        "frac_segments_leg_vis_ge_0.5": float((df.leg_vis >= 0.5).mean()),
        "rho_neg_leg_err_H": rho(-df.leg_err, df.H),
        "rho_leg_err_rank_gap": rho(df.leg_err, df.rank_gap),
        "partial_rho_H_given_M_vs_neg_leg_err": partial(df),
        "ci95_partial": cluster_boot(df, partial),
    }
    out["lag"] = {
        "median_best_lag_frames": float(df.best_lag.median()),
        "frac_best_lag_positive (participant late)": float((df.best_lag > 0).mean()),
        "frac_at_window_edge": float((df.best_lag.abs() == MAX_LAG).mean()),
        "median_gain": float(df.lag_gain.median()),
    }
    out["mirror"] = {
        "frac_segments_scoring_higher_mirrored": float((df.M_mirror > df.M).mean()),
        "median_mirror_minus_M": float((df.M_mirror - df.M).median()),
        "rho_mirror_gain_vs_rank_gap": rho(df.M_mirror - df.M, df.rank_gap),
    }
    # Joint model: standardized OLS of rank gap on per-vector contributions + quality/timing.
    cols = [f"c{v}" for v in range(8)] + ["pvis_mean", "lag_gain", "rater_sd"]
    cols = [c for c in cols if df[c].std() > 0]
    names = [
        VECTORS[int(c[1])] + " deficit" if c[0] == "c" and c[1:].isdigit() else c
        for c in cols
    ]

    def ols(d):
        X = d[cols].to_numpy()
        X = (X - X.mean(0)) / X.std(0)
        X1 = np.column_stack([np.ones(len(X)), X])
        y = d.rank_gap.to_numpy()
        b, *_ = np.linalg.lstsq(X1, y, rcond=None)
        return b, 1 - ((y - X1 @ b) ** 2).sum() / ((y - y.mean()) ** 2).sum()

    beta, r2 = ols(df)
    rng = np.random.default_rng(1)
    groups = {k: v.index.to_numpy() for k, v in df.groupby("participant")}
    keys = list(groups)
    boots = np.array(
        [
            ols(
                df.loc[
                    np.concatenate(
                        [groups[keys[i]] for i in rng.choice(len(keys), len(keys))]
                    )
                ]
            )[0][1:]
            for _ in range(BOOT)
        ]
    )
    out["ols_rank_gap"] = {
        "note": "rank gap (pct points) on per-SD predictors; rank gap is built from M, so vector deficits are partly mechanical",
        "r2": float(r2),
        "coef_pct_points_per_sd": {
            n: {
                "b": float(b),
                "ci95": [
                    float(np.percentile(boots[:, i], 2.5)),
                    float(np.percentile(boots[:, i], 97.5)),
                ],
            }
            for i, (n, b) in enumerate(zip(names, beta[1:]))
        },
    }
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument(
        "--segments-out",
        type=Path,
        help="optional per-segment table; keep under local-data/",
    )
    args = ap.parse_args()
    df = features(load(args.input))
    if args.segments_out:
        if "local-data" not in args.segments_out.resolve().parts:
            raise SystemExit("per-segment output must stay under local-data/")
        df.to_csv(args.segments_out, index=False)
    args.out.mkdir(parents=True, exist_ok=True)
    summary = summarize(df)
    (args.out / "gap_drivers_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=1)[:200])


if __name__ == "__main__":
    main()
