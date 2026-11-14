"""Recall by correction magnitude on Viona's annotated frames, plus clip flag rate by usability rating.
usage: plot_manual.py <summary_mr.json> <out-stem>"""
import json, sys
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
S = json.load(open(sys.argv[1])); stem = sys.argv[2]
M = [("haiku_frames", "Haiku", "#9aa5b1"), ("haiku_frames_raw", "Haiku raw+overlay", "#52606d"), ("sonnet_frames", "Sonnet", "#3b82c4"), ("opus_frames", "Opus", "#c2410c")]
C = [("haiku_clips", "Haiku", "#9aa5b1"), ("sonnet_clips", "Sonnet", "#3b82c4"), ("opus_clips", "Opus", "#c2410c")]
fig, ax = plt.subplots(1, 2, figsize=(11, 4.2))
bins = ["<0.25T", "0.25-0.5T", "0.5-1T", ">=1T", "unusable_frame"]
w = 0.2
for k, (key, lab, col) in enumerate(M):
    r = S["frames"][key]["recall_by_magnitude"]
    ys = [r[b]["rate"] for b in bins]; lo = [r[b]["rate"]-r[b]["ci"][0] for b in bins]; hi = [r[b]["ci"][1]-r[b]["rate"] for b in bins]
    ax[0].bar([i+(k-1.5)*w for i in range(len(bins))], ys, w, yerr=[lo, hi], color=col, label=lab, capsize=2, error_kw={"lw": .7})
neg = S["frames"]["haiku_frames"]["flag_rate_negatives"]["manual_unmarked"]
n = [S["frames"]["haiku_frames"]["recall_by_magnitude"][b]["n"] for b in bins]
ax[0].set_xticks(range(len(bins))); ax[0].set_xticklabels([f"{b.replace('unusable_frame','marked\nunusable')}\nn={x}" for b, x in zip(bins, n)], fontsize=8)
ax[0].set_ylim(0, 1.05); ax[0].set_ylabel("flagged as incorrect"); ax[0].set_title("Frames: your corrections, by displacement (torso lengths)", fontsize=10)
ax[0].legend(fontsize=8, frameon=False, loc="upper left")
rat = ["perfect", "marginal", "correctable", "unusable"]
for k, (key, lab, col) in enumerate(C):
    r = S["usability"][key]["by_rating"]
    ax[1].bar([i+(k-1)*0.26 for i in range(4)], [r[x]["rate"] for x in rat], 0.26, color=col, label=lab,
              yerr=[[r[x]["rate"]-r[x]["ci"][0] for x in rat], [r[x]["ci"][1]-r[x]["rate"] for x in rat]], capsize=2, error_kw={"lw": .7})
nn = [S["usability"]["haiku_clips"]["by_rating"][x]["n"] for x in rat]
ax[1].set_xticks(range(4)); ax[1].set_xticklabels([f"{x}\nn={m}" for x, m in zip(rat, nn)], fontsize=8); ax[1].set_ylim(0, 1.05)
ax[1].set_title("Clips (9-frame grid): flag rate by your usability rating", fontsize=10); ax[1].legend(fontsize=8, frameon=False, loc="upper left")
for a in ax: a.spines[["top", "right"]].set_visible(False)
fig.tight_layout()
for ext in ("svg", "pdf", "png"): fig.savefig(f"{stem}.{ext}", dpi=150)
