"""Detection rate per injected error type, by model (single frames, overlay only)."""
import json, sys
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt, numpy as np
S = json.load(open(sys.argv[1])); out = sys.argv[2]
models = [("haiku_single", "Haiku 5.5", "#86b6ef"), ("sonnet_single", "Sonnet 5.5", "#2a78d6"), ("opus_single", "Opus 5.5", "#104281")]
cats = ["wrong_frame", "global_shift", "limb_rotate", "arm_swap", "lr_flip", "joint_displace", "leg_swap", "jitter", "none"]
names = {"none": "clean (kept)", "wrong_frame": "pose from other frame", "global_shift": "skeleton offset", "limb_rotate": "limb rotated",
         "arm_swap": "arms swapped", "lr_flip": "left/right colours flipped", "joint_displace": "one joint displaced", "leg_swap": "legs swapped", "jitter": "all joints jittered"}
fig, ax = plt.subplots(figsize=(6, 4.6)); h = 0.26; y = np.arange(len(cats))
for k, (run, lab, col) in enumerate(models):
    vals = [S[run]["per_perturbation_acc"][c]["rate"] for c in cats]
    ax.barh(y + (k-1)*h, vals, h*0.9, color=col, label=lab)
ns = [S["haiku_single"]["per_perturbation_acc"][c]["n"] for c in cats]
ax.set_yticks(y, [f"{names[c]} (n={n})" for c, n in zip(cats, ns)], fontsize=8); ax.invert_yaxis()
ax.set_xlim(0, 1); ax.set_xlabel("share judged correctly (errors: flagged; clean: passed)", fontsize=8)
ax.axhline(len(cats)-1.5, color="#bbbbbb", lw=0.8)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
ax.grid(axis="x", color="#e6e6e6", lw=0.6); ax.set_axisbelow(True); ax.tick_params(axis="x", labelsize=8)
ax.legend(fontsize=8, frameon=False, loc="lower left", bbox_to_anchor=(0, 1.0), ncol=3)
fig.suptitle("Haiku catches gross errors but misses swaps, flips and subtle offsets", fontsize=9.5, x=0.01, ha="left")
fig.text(0.01, 0.005, "Single frames with skeleton overlay; 147 clean MediaPipe frames + 147 synthetic errors, 8 reference dance videos.", fontsize=6.5, color="#666")
fig.tight_layout(rect=(0, 0.02, 1, 1)); fig.savefig(out + ".pdf"); fig.savefig(out + ".svg"); fig.savefig(out + ".png", dpi=200)
