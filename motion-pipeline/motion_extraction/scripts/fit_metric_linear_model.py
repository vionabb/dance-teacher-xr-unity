# 
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
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import cross_val_score, KFold
from sklearn.preprocessing import MinMaxScaler

import argparse
import pathlib
from sklearn.preprocessing import RobustScaler

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
parser.add_argument("--target_col", type=pathlib.Path, default=pathlib.Path(DEFAULT_TARGET_COL), help="Column name for human ratings.")

args = parser.parse_args()

# Load data
data_path: pathlib.Path = args.data_path
df = pd.read_csv(args.data_path)

# Define your columns
accuracy_metrics = ["qijia2d"]
error_metrics = ["jules2d", "angle3D_dtw_distance", "angle3D_dtw_dist_avg", "velocity_3d_MAE", "accel_3d_MAE", "jerk_3d_MAE"]
all_metrics = accuracy_metrics + error_metrics
target_col = "humanRating"

# Normalize metrics (invert error metrics to turn them into "accuracy-like" metrics)
normalized_df = df.copy()
scaler = MinMaxScaler()

for col in all_metrics:
    if col in error_metrics:
        # Invert so that lower error = higher "accuracy"
        normalized_df[col] = -df[col]  # make higher = better
    else:
        normalized_df[col] = df[col]

# Scale all to [0, 1]
scaler = RobustScaler()
normalized_df[all_metrics] = scaler.fit_transform(normalized_df[all_metrics])

# Check for NaN values and create a mask for valid rows
valid_rows = ~normalized_df[all_metrics].isna().any(axis=1) & ~df[target_col].isna()

# Remove rows with NaN values in the target column
df = df[valid_rows]
normalized_df = normalized_df[valid_rows]

# Compute correlations
correlations = []
for col in all_metrics:
                    
    # Use only valid rows for correlation calculation
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

# Optional: Predict human ratings using all metrics (linear regression)
X = normalized_df[all_metrics].values
y = df[target_col].values

model = LinearRegression()
cv = KFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(model, X, y, cv=cv, scoring="r2")

print("\n=== Linear Regression Prediction ===")
print(f"Mean R²: {np.mean(scores):.3f} ± {np.std(scores):.3f}")


# Fit the model on all data to get the coefficients
full_model = LinearRegression()
full_model.fit(X, y)

# Create a DataFrame with the feature names and their coefficients
coef_df = pd.DataFrame({
    'Metric': all_metrics,
    'Coefficient': full_model.coef_
})

# Sort by absolute coefficient value to see most impactful features
coef_df['AbsCoefficient'] = coef_df['Coefficient'].abs()
coef_df = coef_df.sort_values('AbsCoefficient', ascending=False)

print("\n=== Feature Importance (Regression Weights) ===")
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
    cv_scores = cross_val_score(LinearRegression(), X_selected, y, cv=cv, scoring="r2")
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