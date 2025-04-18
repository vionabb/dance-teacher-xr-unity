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

parser = argparse.ArgumentParser(description="Fit a linear model to predict human ratings from metrics.")
parser.add_argument("--data_path", type=pathlib.Path, default="", help="Path to the CSV data file.")
parser.add_argument("--target_col", type=pathlib.Path, default="", help="Column name for human ratings.")

args = parser.parse_args()


# Load data
data_path: pathlib.Path = args.data_path
df = pd.read_csv(args.data_path)

# Define your columns
accuracy_metrics = ["metric1", "metric3"]  # example
error_metrics = ["metric2", "metric4"]     # example
all_metrics = accuracy_metrics + error_metrics
target_col = "human rating"

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
normalized_df[all_metrics] = scaler.fit_transform(normalized_df[all_metrics])

# Compute correlations
correlations = []
for col in all_metrics:
    spearman_corr, _ = spearmanr(normalized_df[col], df[target_col])
    pearson_corr, _ = pearsonr(normalized_df[col], df[target_col])
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