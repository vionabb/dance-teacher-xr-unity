# 
# 
# Prompt: Suppose I have a bunch of users’ dance performances which i’m comparing to a 
# reference dance, and that I have a bunch of human ratings of these dance performances 
# to use as a ground truth. I also have a collection of automatically calculated comparison 
# metrics, which output error at difference scales (some as accuracy percentile, some as 
# an error quantity with undetermined scale). 
# I want to determine which of these metrics is the best approximation of the human ratings. 
# I assume I should calculate the correlation of each one, and perhaps choose the one with 
# the best correlation?
# 
import pandas as pd
import numpy as np
from scipy.stats import spearmanr, pearsonr
from sklearn.linear_model import LinearRegression, ElasticNet
from sklearn.model_selection import cross_val_score, KFold
from sklearn.preprocessing import MinMaxScaler

import argparse
import pathlib
from sklearn.preprocessing import RobustScaler
from sklearn.metrics import r2_score
import matplotlib.pyplot as plt


CSV_COL_NAMES = [
    "userId", "danceId", "studyName", "workflowId", "clipNumber", "collectionId", "danceName", 
    "condition", "performanceSpeed", "frameCount", "qijia2d", "jules2d", "vectorAngle3D", 
    "temporalAlignmentSecs", "invalidFrameCount", "angle3D", "invalidPercent", "angle3D_warping_factor", 
    "angle3D_dtw_distance", "angle3D_dtw_dist_avg", "velocity_3d_MAE", "accel_3d_MAE", "jerk_2d_MAE", 
    "jerk_3d_MAE", "accel_2d_MAE", "velocity_2d_MAE", "humanRating", "rating1", "rating2", "rating3"
]

DEAULT_CSV_PATH = "../svelte-web-frontend/artifacts/motion_metrics.csv"
DEFAULT_TARGET_COL = "humanRating"
parser = argparse.ArgumentParser(description="Fit a linear model to predict human ratings from metrics.")
parser.add_argument("--data_path", type=pathlib.Path, default=pathlib.Path(DEAULT_CSV_PATH), help="Path to the CSV data file.")
parser.add_argument("--target_col", type=str, default=DEFAULT_TARGET_COL, help="Column name for human ratings.")
parser.add_argument("--output_dir", type=pathlib.Path, default=None, help="Directory to save scatterplot images. Defaults to model_fitting/metric_scatterplots next to data.")

args = parser.parse_args()

# Load data
data_path: pathlib.Path = args.data_path
df = pd.read_csv(args.data_path)

# Create output directory
output_dir = args.output_dir
if output_dir is None:
    output_dir = data_path.parent / "model_fitting"

# Accuracy metrics: those that are already in [0, 1] range, with 1 being a "good" score,
# corresponding to a low error and hopefully a 1 human rating.
accuracy_metrics = [
    "qijia2d",
    "jules2d",
    "vectorAngle3D",
]

# Error metrics: those that are in an unbounded range, where lower is better.
# These will be inverted and normalized to fit into the [0, 1] range.
error_metrics = [ 
    "angle3D_dtw_distance", 
    "angle3D_dtw_dist_avg", 
    "angle3D_warping_factor",
    "velocity_3d_MAE", 
    "accel_3d_MAE", 
    "jerk_3d_MAE"
]
all_metrics = accuracy_metrics + error_metrics
target_col = args.target_col

# Normalize metrics (invert error metrics to turn them into "accuracy-like" metrics)
normalized_df = df.copy()
for col in error_metrics:
    if col in normalized_df.columns:
        # Invert the error metric to make it "accuracy-like"
        normalized_df[col] = 1 / (1 + normalized_df[col])  # Adding 1 to avoid division by zero

scaler = RobustScaler()
normalized_df[error_metrics] = scaler.fit_transform(normalized_df[error_metrics])

# Check for NaN values and create a mask for valid rows

valid_rows = ~normalized_df[all_metrics].isna().any(axis=1) & ~df[target_col].isna()

# Check for metrics with excessive missing values
missing_warnings = []
for col in all_metrics:
    missing_fraction = df[col].isna().mean()
    if missing_fraction > 0.1:
        missing_warnings.append(f"WARNING: {col} has {missing_fraction:.1%} missing values.")

if missing_warnings:
    print("\n=== Missing Data Check ===")
    for warning in missing_warnings:
        print(warning)
    print()
else:
    print("=== Missing Data Check ===")
    print("✅ No metrics have excessive missing values (<= 10%).\n")

# Remove rows with NaN values in the target column
df = df[valid_rows]
normalized_df = normalized_df[valid_rows]

# Compute correlations
correlations = []
for col in all_metrics:
    spearman_corr, pearson_corr = (float(0), float(0))  # Default values
    if sum(valid_rows) > 0:  # Check if we have any valid data
        spearman_corr, _ = spearmanr(normalized_df.loc[valid_rows, col], df.loc[valid_rows, target_col])
        pearson_corr, _ = pearsonr(normalized_df.loc[valid_rows, col], df.loc[valid_rows, target_col])
    correlations.append({
        "metric": col,
        "spearman": spearman_corr,
        "pearson": pearson_corr
    })

correlations_df = pd.DataFrame(correlations).sort_values(by="spearman", ascending=False)
print("=== Correlation with Human Ratings ===")
print(correlations_df)

# Check for collinearity between features
print("\n=== Spearman Correlation Matrix Between Metrics ===")

# Create figure with two subplots with custom width ratios
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6), 
                              gridspec_kw={'width_ratios': [2, 1]})  # Left plot twice as wide as right

# First subplot: Metric-to-metric correlations
metric_corr_matrix = df[all_metrics].corr(method="spearman")
im1 = ax1.imshow(metric_corr_matrix, cmap='coolwarm', aspect='auto')
fig.colorbar(im1, ax=ax1)

# Add correlation values as text in first subplot
for i in range(len(all_metrics)):
    for j in range(len(all_metrics)):
        ax1.text(j, i, f"{metric_corr_matrix.iloc[i, j]:.2f}", 
                ha="center", va="center", 
                color="black" if abs(metric_corr_matrix.iloc[i, j]) < 0.7 else "white")

ax1.set_xticks(range(len(all_metrics)))
ax1.set_yticks(range(len(all_metrics)))
ax1.set_xticklabels(all_metrics, rotation=90)
ax1.set_yticklabels(all_metrics)
ax1.set_title('Metric-to-Metric Correlations')

# Second subplot: Metric-to-target correlations
target_correlations = correlations_df.sort_values('spearman', ascending=True)
target_matrix = target_correlations[['spearman']].values.reshape(-1, 1)
im2 = ax2.imshow(target_matrix, cmap='RdYlGn', aspect='auto')
fig.colorbar(im2, ax=ax2)

# Add correlation values as text
for i, v in enumerate(target_correlations['spearman']):
    ax2.text(0, i, f'{v:.2f}', 
             ha='center', va='center',
             color='black' if abs(v) < 0.7 else 'white')

ax2.set_yticks(range(len(target_correlations)))
ax2.set_yticklabels(target_correlations['metric'])
ax2.set_xticks([])  # Hide x-axis ticks since we only have one column
ax2.set_title(f'Correlations with {target_col}')

plt.tight_layout()
# Create output directory for correlation matrix
# Save the correlation matrix plot
corr_matrix_path = output_dir / "metric_correlation_matrix.png"
plt.savefig(str(corr_matrix_path), dpi=300, bbox_inches='tight')
plt.close()
print(f"Saved correlation matrix to {corr_matrix_path.relative_to(output_dir)}")


 # Create output directory for plots
scatterplot_output_dir = output_dir / "metric_scatterplots"
scatterplot_output_dir.mkdir(parents=True, exist_ok=True)

print(f"\n=== Saving scatterplots to {scatterplot_output_dir} ===")
for col in all_metrics:
    plt.figure(figsize=(6, 4))
    plt.scatter(normalized_df[col], df[target_col], alpha=0.6)
    # Fit and plot a linear trendline
    z = np.polyfit(normalized_df[col], df[target_col], 1)
    p = np.poly1d(z)
    plt.plot(normalized_df[col], p(normalized_df[col]), "r--", linewidth=1)
    plt.xlabel(f"{col} (normalized)")
    plt.ylabel(f"{target_col}")
    plt.title(f"{col} vs. {target_col}")
    # Compute and annotate Spearman correlation and R²
    spearman_corr, _ = spearmanr(normalized_df[col], df[target_col])
    y_pred_line = p(normalized_df[col])
    r2_val = r2_score(df[target_col], y_pred_line)
    plt.annotate(f"Spearman r = {spearman_corr:.2f}\nR² = {r2_val:.2f}", xy=(0.05, 0.95), xycoords='axes fraction', fontsize=10, verticalalignment='top')
    plt.grid(True)
    plt.tight_layout()
    save_path = scatterplot_output_dir / f"{col}_vs_{target_col}.png"
    plt.savefig(str(save_path), dpi=300)
    plt.close()
    rel_path = save_path.relative_to(output_dir)
    print(f"Created scatterplot {rel_path}")

# Optional: Predict human ratings using all metrics (linear regression)
model_choice = "Ridge"
if model_choice == "LinearRegression":
    full_model_name = "Linear Regression"
    model = LinearRegression()  # the version fitted on a subset of data, for cross-validation
    full_model = LinearRegression()  # the version fitted on all data
elif model_choice == "ElasticNet":
    full_model_name = "ElasticNet"
    model = ElasticNet(random_state=42)      # the version fitted on a subset of data, for cross-validation
    full_model = ElasticNet(random_state=42) # the version fitted on all data
elif model_choice == "Ridge":
    full_model_name = "Ridge Regression"
    from sklearn.linear_model import Ridge
    model = Ridge()
    full_model = Ridge()

X = normalized_df[all_metrics].values
y = df[target_col].values

cv = KFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(model, X, y, cv=cv, scoring="r2")

print("\n=== Linear Regression Prediction [model={full_model_name}] ===")
print(f"Mean R²: {np.mean(scores):.3f} ± {np.std(scores):.3f}")


full_model.fit(X, y)

# Create a DataFrame with the feature names and their coefficients
coef_df = pd.DataFrame({
    'Metric': all_metrics,
    'Coefficient': full_model.coef_
})

# Sort by absolute coefficient value to see most impactful features
coef_df['AbsCoefficient'] = coef_df['Coefficient'].abs()
coef_df = coef_df.sort_values('AbsCoefficient', ascending=False)

print(f"\n=== Feature Importance (Regression Weights)[model={full_model_name}] ===")
print(coef_df[['Metric', 'Coefficient']])

# Optional: show intercept
print(f"\nIntercept: {full_model.intercept_:.3f}")

# Incremental feature elimination to see how model performs with fewer metrics
print("\n=== Incremental Feature Elimination ===")
print("Testing performance with fewer and fewer features")

# Sort features by absolute coefficient value
sorted_features = coef_df['Metric'].tolist()
n_features = len(sorted_features)

elimination_results = []

# Test models with decreasing number of features
for i in range(n_features, 0, -1):
    selected_features = sorted_features[:i]
    X_selected = normalized_df[selected_features].values
    
    # Cross-validate with selected features
    cv_scores = cross_val_score(ElasticNet(random_state=42), X_selected, y, cv=cv, scoring="r2")
    mean_r2 = np.mean(cv_scores)
    std_r2 = np.std(cv_scores)
    
    elimination_results.append({
        'num_features': i,
        'features': selected_features,
        'mean_r2': mean_r2,
        'std_r2': std_r2
    })
    
    print(f"{i} features: R² = {mean_r2:.3f} ± {std_r2:.3f}")
    print(f"   Features used: {', '.join(selected_features)}")

# Create DataFrame with results
elimination_df = pd.DataFrame(elimination_results)