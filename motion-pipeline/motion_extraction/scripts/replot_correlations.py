import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# -----------------------
# DATA
# -----------------------

metric_names = [
    "2D Pose Similarity (Baseline)",
    "2D Pose Similarity (Weighted)",
    "3D Joint Angle Similarity",
    "3D DTW Distance",
    "3D DTW Distance (Per Frame)",
    "DTW Warping Factor",
    "Velocity Error (3D)",
    "Acceleration Error (3D)",
    "Jerk Error (3D)"
]

corr_matrix = np.array([
    [ 1.00,  0.80,  0.88, -0.55, -0.60, -0.20, -0.12, -0.10, -0.10],
    [ 0.80,  1.00,  0.72, -0.49, -0.56, -0.13, -0.08, -0.06, -0.06],
    [ 0.88,  0.72,  1.00, -0.57, -0.67, -0.24, -0.14, -0.12, -0.12],
    [-0.55, -0.49, -0.57,  1.00,  0.64,  0.11, -0.36, -0.36, -0.36],
    [-0.60, -0.56, -0.67,  0.64,  1.00, -0.29,  0.19,  0.18,  0.18],
    [-0.20, -0.13, -0.24,  0.11, -0.29,  1.00, -0.02, -0.03, -0.03],
    [-0.12, -0.08, -0.14, -0.36,  0.19, -0.02,  1.00,  0.99,  0.99],
    [-0.10, -0.06, -0.12, -0.36,  0.18, -0.03,  0.99,  1.00,  1.00],
    [-0.10, -0.06, -0.12, -0.36,  0.18, -0.03,  0.99,  1.00,  1.00],
])

human_corr = np.array([
    0.40,
    0.39,
    0.38,
    0.37,
    0.38,
    0.13,
   -0.02,
   -0.03,
   -0.03
])

# -----------------------
# PLOT 1: CROSS-CORRELATION
# -----------------------

output_dir = Path(__file__).resolve().parent / "correlation_plots"
output_dir.mkdir(exist_ok=True)

fig, ax = plt.subplots(figsize=(6, 6))
im = ax.imshow(corr_matrix, vmin=-1, vmax=1)

ax.set_xticks(range(len(metric_names)))
ax.set_yticks(range(len(metric_names)))
ax.set_xticklabels(metric_names, rotation=90, ha="right")
ax.set_yticklabels(metric_names)

# annotate values
for i in range(len(metric_names)):
    for j in range(len(metric_names)):
        ax.text(j, i, f"{corr_matrix[i, j]:.2f}",
                ha="center", va="center", fontsize=8)

# ax.set_title("Metric-to-Metric Correlations")
fig.colorbar(im, ax=ax)

# plt.tight_layout()
plot1_path = output_dir / "metric_to_metric_correlations.pdf"
fig.savefig(plot1_path, format="pdf", bbox_inches="tight")
plt.close(fig)

# -----------------------
# PLOT 2: HUMAN CORRELATION
# -----------------------

fig, ax = plt.subplots(figsize=(3.5, 4.75))

im = ax.imshow(human_corr.reshape(-1, 1), vmin=-0.1, vmax=0.4, cmap="RdYlGn")

ax.set_yticks(range(len(metric_names)))
ax.set_yticklabels(metric_names)
ax.set_xticks([])

# annotate values
for i in range(len(metric_names)):
    ax.text(0, i, f"{human_corr[i]:.2f}",
            ha="center", va="center", fontsize=10)

# ax.set_title("Correlation with Human Ratings")

fig.colorbar(im, ax=ax)

# plt.tight_layout()
plot2_path = output_dir / "correlation_with_human_ratings.pdf"
fig.savefig(plot2_path, format="pdf", bbox_inches="tight")
plt.close(fig)

print(f"Saved: {plot1_path}")
print(f"Saved: {plot2_path}")