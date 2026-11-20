"""Plot aggregate-only figures from gap_drivers_summary.json (no participant data).

Usage: uv run python adhoc_analysis/metric_rater_gap/plot_gap_drivers.py <summary.json> <out_dir>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

BLUE, MUTED, INK, SURFACE = "#2a78d6", "#8a8984", "#0b0b0b", "#fcfcfb"
plt.rcParams.update(
    {
        "font.size": 9,
        "axes.edgecolor": MUTED,
        "axes.labelcolor": INK,
        "xtick.color": INK,
        "ytick.color": INK,
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "axes.spines.top": False,
        "axes.spines.right": False,
    }
)


def delta_plot(s: dict, out: Path) -> None:
    rows = [("Drop one vector", None)]
    rows += [(f"  − {k}", v) for k, v in s["drop_one_vector"].items()]
    rows += [("Keep only", None)]
    rows += [
        (f"  {k}", s["only_group"][k])
        for k in ["torso (0-3)", "upper arms", "forearms", "arms (4-7)"]
    ]
    rows += [("What-if", None)]
    short = {
        "trim first/last 15% of frames": "trim first/last 15% of frames",
        "best lag within ±0.5 s per segment (optimistic)": "best time shift ≤0.5 s per segment",
        "add 4 leg vectors (equal weight)": "add 4 leg vectors",
        "z-score M within each reference clip (needs per-clip calibration)": "standardize score per reference clip",
    }
    rows += [(f"  {short.get(k, k)}", v) for k, v in s["what_ifs"].items()]
    fig, ax = plt.subplots(figsize=(6, 5.4))
    y = list(range(len(rows)))[::-1]
    for yi, (label, v) in zip(y, rows):
        if v is None:
            continue
        lo, hi = v["ci95_delta"]
        ax.hlines(yi, lo, hi, color=BLUE, lw=2)
        ax.plot(v["delta_vs_all8"], yi, "o", color=BLUE, ms=6, mec=SURFACE, mew=2)
    ax.axvline(0, color=MUTED, lw=1)
    ax.set_yticks(y, [r[0] for r in rows])
    for t, (label, v) in zip(ax.get_yticklabels(), rows):
        if v is None:
            t.set_fontweight("bold")
    base = s["baseline_spearman_M_H"]
    ax.set_xlabel(f"Change in Spearman ρ vs. all 8 vectors (ρ = {base['rho']:.2f})")
    fig.suptitle(
        f"Qijia2D variants vs. human similarity, {s['n_segments']} segments\n"
        "dot = change in ρ, bar = 95% participant-cluster bootstrap CI",
        fontsize=9,
        x=0.02,
        ha="left",
    )
    ax.grid(axis="x", color="#e6e5e0", lw=0.6)
    fig.tight_layout()
    for ext in ("png", "pdf"):
        fig.savefig(out / f"fig_vector_ablation.{ext}", dpi=200)
    plt.close(fig)


def cell_plot(s: dict, out: Path) -> None:
    cells = sorted(s["by_study_dance_clip"].items(), key=lambda kv: kv[0])
    fig, ax = plt.subplots(figsize=(6, 4.6))
    y = list(range(len(cells)))[::-1]
    for yi, (k, c) in zip(y, cells):
        ax.plot([0, c["spearman"]], [yi, yi], color="#cde2fb", lw=2)
        ax.plot(c["spearman"], yi, "o", color=BLUE, ms=6, mec=SURFACE, mew=2)
        ax.text(
            1.0, yi, f"n={c['n']}", va="center", ha="right", fontsize=7, color=MUTED
        )
    pooled = s["baseline_spearman_M_H"]["rho"]
    ax.axvline(pooled, color=INK, lw=1, ls="--")
    ax.text(
        pooled, len(cells) - 0.3, f" pooled ρ = {pooled:.2f}", fontsize=8, va="bottom"
    )
    ax.axvline(0, color=MUTED, lw=1)
    labels = [k.replace("chi25_study", "S").replace("/", " · ") for k, _ in cells]
    ax.set_yticks(
        y,
        [
            lab.replace(" · ", " · ", 1).rsplit(" · ", 1)[0]
            + " · clip "
            + lab.rsplit(" · ", 1)[1]
            for lab in labels
        ],
    )
    ax.set_xlim(-0.4, 1.0)
    ax.set_xlabel("Spearman ρ, Qijia2D score vs. human rating")
    ax.set_title(
        "Agreement inside each reference clip is higher than pooled",
        fontsize=9,
        loc="left",
    )
    fig.tight_layout()
    for ext in ("png", "pdf"):
        fig.savefig(out / f"fig_within_clip_agreement.{ext}", dpi=200)
    plt.close(fig)


if __name__ == "__main__":
    summary = json.loads(Path(sys.argv[1]).read_text())
    target = Path(sys.argv[2])
    target.mkdir(parents=True, exist_ok=True)
    delta_plot(summary, target)
    cell_plot(summary, target)
