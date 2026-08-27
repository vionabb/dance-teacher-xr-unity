"""Evaluate weaker symmetric three-frame smoothing added to preprocessing C4.

All research-data paths and the unique output directory are caller supplied.
The analysis compares candidates with C4 numerically and with adjusted
image-space annotations; it does not treat C4 as ground truth.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import typing as t

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from dance_teacher_pose import (
    PoseDataType,
    PosePreprocessingConfig,
    collect_pose_data_files,
    get_pose_data_schema,
    preprocess_pose_dataframe,
    relative_stem_from_pose_csv_path,
)
from motion_extraction.annotation_tool.server import AnnotationStore
from motion_extraction.scripts.run_preprocessing_experiment import (
    _load_corpus_membership,
    _pose_pixels,
    _visible_roots,
)


DEFAULT_WEIGHTS = (0.0, 0.05, 0.10, 0.15, 0.20, 0.25)
HIGH_FREQUENCY_BAND_CYCLES_PER_FRAME = (0.25, 0.50)
MINIMUM_SPECTRAL_RUN_FRAMES = 8
ANALYSIS_VERSION = "1.0"


def _candidate_config(neighbor_weight: float) -> PosePreprocessingConfig:
    """Return C4 with only the requested symmetric smoothing added."""

    return PosePreprocessingConfig(
        min_visibility=0.0,
        max_gap_frames=2,
        isolated_outlier_threshold=float("inf"),
        isolated_outlier_ratio=0.0,
        smoothing="triangular3" if neighbor_weight > 0 else "none",
        triangular3_neighbor_weight=neighbor_weight,
    )


def _finite_runs(mask: np.ndarray, minimum_length: int) -> list[slice]:
    """Return contiguous true runs meeting a minimum length."""

    runs: list[slice] = []
    position = 0
    while position < len(mask):
        if not mask[position]:
            position += 1
            continue
        start = position
        while position < len(mask) and mask[position]:
            position += 1
        if position - start >= minimum_length:
            runs.append(slice(start, position))
    return runs


def _band_energy(values: np.ndarray, low: float, high: float) -> float:
    """Return Hann-windowed spectral energy in a cycles/frame band."""

    centered = values - np.mean(values)
    spectrum = np.fft.rfft(centered * np.hanning(len(centered)))
    frequencies = np.fft.rfftfreq(len(centered), d=1.0)
    selected = (frequencies >= low) & (frequencies <= high)
    return float(np.square(np.abs(spectrum[selected])).sum())


def _motion_metrics(
    baseline: pd.DataFrame,
    candidate: pd.DataFrame,
    pose_data_type: PoseDataType,
    *,
    high_frequency_band: tuple[float, float] = HIGH_FREQUENCY_BAND_CYCLES_PER_FRAME,
    minimum_spectral_run_frames: int = MINIMUM_SPECTRAL_RUN_FRAMES,
) -> dict[str, float | int]:
    """Measure candidate roughness and retention against C4 on matched support."""

    fields = get_pose_data_schema(pose_data_type).coordinate_fields
    roots = _visible_roots(candidate, fields)
    accelerations: list[float] = []
    displacements: list[float] = []
    baseline_path_length = 0.0
    candidate_path_length = 0.0
    baseline_speeds: list[float] = []
    candidate_speeds: list[float] = []
    baseline_high_frequency_energy = 0.0
    candidate_high_frequency_energy = 0.0
    spectral_run_count = 0
    low, high = high_frequency_band

    for root in roots:
        columns = [f"{root}_{field}" for field in fields]
        baseline_values = baseline[columns].to_numpy(dtype=float)
        candidate_values = candidate[columns].to_numpy(dtype=float)

        if len(candidate_values) >= 3:
            acceleration = np.linalg.norm(
                np.diff(candidate_values, n=2, axis=0), axis=1
            )
            accelerations.extend(acceleration[np.isfinite(acceleration)].tolist())

        finite_points = np.isfinite(baseline_values).all(axis=1) & np.isfinite(
            candidate_values
        ).all(axis=1)
        displacement = np.linalg.norm(candidate_values - baseline_values, axis=1)
        displacements.extend(displacement[finite_points].tolist())

        if len(candidate_values) >= 2:
            finite_segments = finite_points[:-1] & finite_points[1:]
            baseline_speed = np.linalg.norm(np.diff(baseline_values, axis=0), axis=1)
            candidate_speed = np.linalg.norm(np.diff(candidate_values, axis=0), axis=1)
            baseline_matched = baseline_speed[finite_segments]
            candidate_matched = candidate_speed[finite_segments]
            baseline_path_length += float(baseline_matched.sum())
            candidate_path_length += float(candidate_matched.sum())
            baseline_speeds.extend(baseline_matched.tolist())
            candidate_speeds.extend(candidate_matched.tolist())

        for field_index in range(len(fields)):
            valid = np.isfinite(baseline_values[:, field_index]) & np.isfinite(
                candidate_values[:, field_index]
            )
            for run in _finite_runs(valid, minimum_spectral_run_frames):
                baseline_high_frequency_energy += _band_energy(
                    baseline_values[run, field_index], low, high
                )
                candidate_high_frequency_energy += _band_energy(
                    candidate_values[run, field_index], low, high
                )
                spectral_run_count += 1

    acceleration_array = np.asarray(accelerations)
    displacement_array = np.asarray(displacements)
    baseline_speed_array = np.asarray(baseline_speeds)
    candidate_speed_array = np.asarray(candidate_speeds)
    baseline_peak_speed = (
        float(np.max(baseline_speed_array)) if baseline_speed_array.size else np.nan
    )
    candidate_peak_speed = (
        float(np.max(candidate_speed_array)) if candidate_speed_array.size else np.nan
    )
    return {
        "visible_landmark_count": len(roots),
        "acceleration_sample_count": int(acceleration_array.size),
        "corrected_normalized_acceleration_p95": (
            float(np.quantile(acceleration_array, 0.95))
            if acceleration_array.size
            else np.nan
        ),
        "displacement_point_count": int(displacement_array.size),
        "displacement_vs_c4_median": (
            float(np.median(displacement_array)) if displacement_array.size else np.nan
        ),
        "displacement_vs_c4_p95": (
            float(np.quantile(displacement_array, 0.95))
            if displacement_array.size
            else np.nan
        ),
        "matched_segment_count": int(baseline_speed_array.size),
        "c4_path_length": baseline_path_length,
        "candidate_path_length": candidate_path_length,
        "path_length_retention_vs_c4": (
            candidate_path_length / baseline_path_length
            if baseline_path_length > 0
            else np.nan
        ),
        "c4_peak_speed": baseline_peak_speed,
        "candidate_peak_speed": candidate_peak_speed,
        "peak_speed_retention_vs_c4": (
            candidate_peak_speed / baseline_peak_speed
            if baseline_peak_speed > 0
            else np.nan
        ),
        "spectral_run_count": spectral_run_count,
        "c4_high_frequency_energy": baseline_high_frequency_energy,
        "candidate_high_frequency_energy": candidate_high_frequency_energy,
        "high_frequency_energy_reduction_vs_c4": (
            1.0
            - candidate_high_frequency_energy / baseline_high_frequency_energy
            if baseline_high_frequency_energy > 0
            else np.nan
        ),
    }


def _bootstrap_mean_interval(
    values: t.Sequence[float],
    *,
    samples: int,
    seed: int,
) -> tuple[float, float]:
    """Return a deterministic percentile interval from independent units."""

    finite = np.asarray(values, dtype=float)
    finite = finite[np.isfinite(finite)]
    if not finite.size:
        return np.nan, np.nan
    if finite.size == 1 or samples <= 0:
        value = float(finite.mean())
        return value, value
    rng = np.random.default_rng(seed)
    indices = rng.integers(0, len(finite), size=(samples, len(finite)))
    bootstrapped = finite[indices].mean(axis=1)
    low, high = np.quantile(bootstrapped, [0.025, 0.975])
    return float(low), float(high)


def _numerical_summary(
    by_clip: pd.DataFrame, bootstrap_samples: int, seed: int
) -> pd.DataFrame:
    """Summarize numerical metrics with clips as bootstrap units."""

    metric_columns = [
        "corrected_normalized_acceleration_p95",
        "displacement_vs_c4_median",
        "displacement_vs_c4_p95",
        "path_length_retention_vs_c4",
        "peak_speed_retention_vs_c4",
        "high_frequency_energy_reduction_vs_c4",
    ]
    rows: list[dict[str, t.Any]] = []
    for group_index, ((weight, modality), group) in enumerate(
        by_clip.groupby(["neighbor_weight", "pose_data_type"], sort=True)
    ):
        for metric_index, metric in enumerate(metric_columns):
            values = group[metric].to_numpy(dtype=float)
            finite = values[np.isfinite(values)]
            low, high = _bootstrap_mean_interval(
                finite,
                samples=bootstrap_samples,
                seed=seed + group_index * 100 + metric_index,
            )
            rows.append(
                {
                    "neighbor_weight": weight,
                    "pose_data_type": modality,
                    "metric": metric,
                    "clip_count": int(group["file"].nunique()),
                    "valid_clip_count": int(finite.size),
                    "mean": float(np.mean(finite)) if finite.size else np.nan,
                    "median": float(np.median(finite)) if finite.size else np.nan,
                    "bootstrap_mean_ci95_low": low,
                    "bootstrap_mean_ci95_high": high,
                }
            )
    return pd.DataFrame(rows)


def _score_annotation_task(
    task: dict[str, t.Any],
    ground_truth: dict[str, dict[str, t.Any]],
    predicted: dict[str, tuple[float, float]],
    tolerance_torso: float,
) -> list[dict[str, t.Any]]:
    """Score positional targets using the annotation store's tolerance contract."""

    scale = AnnotationStore._ground_truth_scale(task, ground_truth)
    rows: list[dict[str, t.Any]] = []
    position_weights = {"non_occluded": 1.0, "semi_occluded": 0.5}
    for landmark, truth in sorted(ground_truth.items()):
        occlusion = str(truth.get("occlusion", "non_occluded"))
        if occlusion == "fully_occluded":
            continue
        point = predicted.get(landmark)
        matched = point is not None and np.isfinite(point).all()
        error_px = (
            float(np.hypot(point[0] - truth["x"], point[1] - truth["y"]))
            if matched and point is not None
            else scale
        )
        error_torso = error_px / scale
        rows.append(
            {
                "landmark": landmark,
                "occlusion": occlusion,
                "position_weight": position_weights.get(occlusion, 0.0),
                "matched": int(matched),
                "error_px": error_px,
                "error_torso": error_torso,
                "excess_error_torso": max(0.0, error_torso - tolerance_torso),
                "within_active_tolerance": int(error_torso <= tolerance_torso),
                "normalization_scale_px": scale,
            }
        )
    return rows


def _weighted_task_score(landmarks: pd.DataFrame) -> dict[str, float | int]:
    """Aggregate landmarks inside one task before any cross-task inference."""

    weights = landmarks["position_weight"].to_numpy(dtype=float)
    total = float(weights.sum())

    def weighted(column: str) -> float:
        values = landmarks[column].to_numpy(dtype=float)
        return float(np.average(values, weights=weights)) if total > 0 else np.nan

    return {
        "eligible_position_landmark_count": len(landmarks),
        "position_weight_total": total,
        "matched_landmark_count": int(landmarks["matched"].sum()),
        "mean_error_torso": weighted("error_torso"),
        "mean_excess_error_torso": weighted("excess_error_torso"),
        "within_tolerance_rate": weighted("within_active_tolerance"),
    }


def _load_annotation_scores(
    annotations_db: Path,
    manifest: dict[str, t.Any],
    cleans: dict[tuple[str, float], pd.DataFrame],
    weights: t.Sequence[float],
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, t.Any]]:
    """Score candidates against latest eligible adjusted-skeleton revisions."""

    store = AnnotationStore(annotations_db, manifest, read_only=True)
    with sqlite3.connect(
        f"{annotations_db.resolve().as_uri()}?mode=ro", uri=True
    ) as connection:
        annotators = [
            str(row[0])
            for row in connection.execute(
                "SELECT DISTINCT annotator FROM judgment_revisions "
                "WHERE experiment_id = ? ORDER BY annotator",
                (manifest["experiment_id"],),
            )
        ]

    landmark_rows: list[dict[str, t.Any]] = []
    task_rows: list[dict[str, t.Any]] = []
    exclusion_counts = {
        "latest_revision_count": 0,
        "excluded_not_completed": 0,
        "excluded_calibration": 0,
        "excluded_without_adjusted_skeleton": 0,
        "excluded_source_not_in_corpus": 0,
        "included_task_count": 0,
    }
    tolerances: dict[str, dict[str, t.Any]] = {}
    for annotator in annotators:
        latest = store.latest(annotator)
        tolerance = store._calibration_summary(annotator)
        tolerances[annotator] = tolerance
        for task_id, judgment in latest.items():
            exclusion_counts["latest_revision_count"] += 1
            task = store.tasks.get(task_id)
            if judgment.get("status") != "completed":
                exclusion_counts["excluded_not_completed"] += 1
                continue
            if task is None or task.get("calibration_of_task_id"):
                exclusion_counts["excluded_calibration"] += 1
                continue
            ground_truth = judgment.get("ground_truth_landmarks", {})
            if not ground_truth:
                exclusion_counts["excluded_without_adjusted_skeleton"] += 1
                continue
            source_file = str(task.get("source_file", ""))
            if not all((source_file, weight) in cleans for weight in weights):
                exclusion_counts["excluded_source_not_in_corpus"] += 1
                continue
            frame_position = int(task["frame_window"]["center_position"])
            quality = str(judgment.get("source_evidence_quality", "")).strip()
            quality = quality or "unclassified"
            case_key = "::".join(
                [
                    annotator,
                    str(task.get("category", "uncategorized")),
                    source_file,
                    str(task.get("case_id", task_id)),
                ]
            )
            exclusion_counts["included_task_count"] += 1
            for weight in weights:
                predicted = _pose_pixels(cleans[(source_file, weight)], frame_position)
                scored = _score_annotation_task(
                    task,
                    ground_truth,
                    predicted,
                    float(tolerance["active_tolerance_torso"]),
                )
                if not scored:
                    continue
                common = {
                    "neighbor_weight": weight,
                    "annotator": annotator,
                    "task_id": task_id,
                    "case_id": str(task.get("case_id", "")),
                    "case_key": case_key,
                    "category": str(task.get("category", "")),
                    "source_file": source_file,
                    "frame_position": frame_position,
                    "source_evidence_quality": quality,
                    "active_tolerance_torso": float(
                        tolerance["active_tolerance_torso"]
                    ),
                    "active_tolerance_source": str(
                        tolerance["active_tolerance_source"]
                    ),
                }
                task_landmarks = pd.DataFrame(scored)
                landmark_rows.extend([{**common, **row} for row in scored])
                task_rows.append(
                    {**common, **_weighted_task_score(task_landmarks)}
                )
    return pd.DataFrame(landmark_rows), pd.DataFrame(task_rows), {
        "annotators": annotators,
        "tolerances_by_annotator": tolerances,
        "selection": exclusion_counts,
    }


def _annotation_case_scores(task_scores: pd.DataFrame) -> pd.DataFrame:
    """Aggregate task scores to cases so adjacent frames are not independent."""

    metrics = [
        "mean_error_torso",
        "mean_excess_error_torso",
        "within_tolerance_rate",
    ]
    aggregations: dict[str, t.Any] = {
        metric: (metric, "mean") for metric in metrics
    }
    aggregations.update(
        {
            "task_count": ("task_id", "nunique"),
            "eligible_position_landmark_count": (
                "eligible_position_landmark_count",
                "sum",
            ),
            "matched_landmark_count": ("matched_landmark_count", "sum"),
        }
    )
    return (
        task_scores.groupby(
            [
                "neighbor_weight",
                "annotator",
                "case_key",
                "source_evidence_quality",
            ],
            as_index=False,
        )
        .agg(**aggregations)
        .sort_values(["neighbor_weight", "case_key"])
    )


def _annotation_summary(
    task_scores: pd.DataFrame,
    case_scores: pd.DataFrame,
    bootstrap_samples: int,
    seed: int,
) -> pd.DataFrame:
    """Summarize annotations with cases, rather than landmarks, as units."""

    metrics = [
        "mean_error_torso",
        "mean_excess_error_torso",
        "within_tolerance_rate",
    ]
    rows: list[dict[str, t.Any]] = []
    qualities = sorted(task_scores["source_evidence_quality"].unique())
    strata = [("overall", case_scores)]
    strata.extend(
        (
            quality,
            case_scores[case_scores["source_evidence_quality"] == quality],
        )
        for quality in qualities
    )
    for stratum_index, (stratum, stratum_cases) in enumerate(strata):
        for weight_index, (weight, group) in enumerate(
            stratum_cases.groupby("neighbor_weight", sort=True)
        ):
            source_tasks = task_scores[
                (task_scores["neighbor_weight"] == weight)
                & (
                    True
                    if stratum == "overall"
                    else task_scores["source_evidence_quality"] == stratum
                )
            ]
            for metric_index, metric in enumerate(metrics):
                values = group[metric].to_numpy(dtype=float)
                finite = values[np.isfinite(values)]
                low, high = _bootstrap_mean_interval(
                    finite,
                    samples=bootstrap_samples,
                    seed=(
                        seed
                        + 10_000
                        + stratum_index * 1_000
                        + weight_index * 10
                        + metric_index
                    ),
                )
                rows.append(
                    {
                        "neighbor_weight": weight,
                        "source_evidence_quality": stratum,
                        "metric": metric,
                        "case_count": int(group["case_key"].nunique()),
                        "task_count": len(source_tasks),
                        "eligible_position_landmark_count": int(
                            source_tasks["eligible_position_landmark_count"].sum()
                        ),
                        "mean": float(np.mean(finite)) if finite.size else np.nan,
                        "median": float(np.median(finite)) if finite.size else np.nan,
                        "bootstrap_case_mean_ci95_low": low,
                        "bootstrap_case_mean_ci95_high": high,
                    }
                )
    return pd.DataFrame(rows)


def _sha256(path: Path) -> str:
    """Return the SHA-256 digest of one provenance input."""

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_safe(value: t.Any) -> t.Any:
    """Convert NumPy values and non-finite floats to strict JSON values."""

    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, np.generic):
        return _json_safe(value.item())
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def _write_plots(
    output_root: Path,
    numerical_by_clip: pd.DataFrame,
    annotation_summary: pd.DataFrame,
) -> None:
    """Write numerical and annotation tradeoff plots."""

    numerical = (
        numerical_by_clip.groupby(["neighbor_weight", "pose_data_type"], as_index=False)
        .agg(
            acceleration_p95=("corrected_normalized_acceleration_p95", "mean"),
            displacement_p95=("displacement_vs_c4_p95", "mean"),
            path_retention=("path_length_retention_vs_c4", "mean"),
            peak_retention=("peak_speed_retention_vs_c4", "mean"),
            high_frequency_reduction=(
                "high_frequency_energy_reduction_vs_c4",
                "mean",
            ),
        )
    )
    figure, axes = plt.subplots(1, 3, figsize=(12, 3.6))
    for modality, group in numerical.groupby("pose_data_type"):
        axes[0].plot(
            group["neighbor_weight"],
            group["acceleration_p95"],
            marker="o",
            label=modality,
        )
        axes[1].plot(
            group["displacement_p95"],
            group["high_frequency_reduction"],
            marker="o",
            label=modality,
        )
        for _, row in group.iterrows():
            axes[1].annotate(f"{row['neighbor_weight']:.2f}", (
                row["displacement_p95"],
                row["high_frequency_reduction"],
            ), fontsize=7)
    axes[0].set(
        xlabel="Neighbor weight a",
        ylabel="Mean clip acceleration p95",
        title="Roughness",
    )
    axes[1].set(
        xlabel="Mean clip displacement p95 vs C4",
        ylabel="Mean high-frequency energy reduction",
        title="Numerical tradeoff",
    )
    annotation = annotation_summary[
        (annotation_summary["source_evidence_quality"] == "overall")
        & (annotation_summary["metric"] == "mean_excess_error_torso")
    ].sort_values("neighbor_weight")
    axes[2].errorbar(
        annotation["neighbor_weight"],
        annotation["mean"],
        yerr=np.vstack(
            [
                annotation["mean"] - annotation["bootstrap_case_mean_ci95_low"],
                annotation["bootstrap_case_mean_ci95_high"] - annotation["mean"],
            ]
        ),
        marker="o",
        capsize=3,
    )
    axes[2].set(
        xlabel="Neighbor weight a",
        ylabel="Mean excess error / torso",
        title="Adjusted-annotation position error",
    )
    axes[0].legend(fontsize=8)
    axes[1].legend(fontsize=8)
    figure.tight_layout()
    figure.savefig(output_root / "tradeoffs.png", dpi=180)
    figure.savefig(output_root / "tradeoffs.pdf")
    plt.close(figure)


def _write_report(
    output_root: Path,
    numerical_summary: pd.DataFrame,
    annotation_summary: pd.DataFrame,
    annotation_metadata: dict[str, t.Any],
) -> None:
    """Write a concise report that preserves the comparison's claim limits."""

    numerical = numerical_summary.pivot_table(
        index=["neighbor_weight", "pose_data_type"],
        columns="metric",
        values="mean",
    ).reset_index()
    annotation = annotation_summary[
        annotation_summary["source_evidence_quality"].eq("overall")
    ].pivot_table(index="neighbor_weight", columns="metric", values="mean")
    lines = [
        "# C4 plus symmetric smoothing grid",
        "",
        "C4 is the numerical comparison reference, not raw-video ground truth. "
        "Adjusted skeletons are human image-space annotations with their own "
        "repeatability limits.",
        "",
        "## Numerical summary (means across clips)",
        "",
        "| a | modality | acceleration p95 | displacement p95 vs C4 | path retention | "
        "peak-speed retention | high-frequency energy reduction |",
        "|---:|:---|---:|---:|---:|---:|---:|",
    ]
    for row in numerical.to_dict("records"):
        lines.append(
            f"| {row['neighbor_weight']:.2f} | {row['pose_data_type']} | "
            f"{row['corrected_normalized_acceleration_p95']:.5g} | "
            f"{row['displacement_vs_c4_p95']:.5g} | "
            f"{row['path_length_retention_vs_c4']:.5g} | "
            f"{row['peak_speed_retention_vs_c4']:.5g} | "
            f"{row['high_frequency_energy_reduction_vs_c4']:.5g} |"
        )
    lines.extend(
        [
            "",
            "The high-frequency band is 0.25–0.50 cycles/frame (Nyquist), "
            f"computed with a Hann window on contiguous finite runs of at least "
            f"{MINIMUM_SPECTRAL_RUN_FRAMES} frames.",
            "",
            "## Adjusted-skeleton positional summary",
            "",
            "| a | mean error / torso | mean error beyond tolerance / torso | "
            "within-tolerance rate |",
            "|---:|---:|---:|---:|",
        ]
    )
    for weight, row in annotation.sort_index().iterrows():
        lines.append(
            f"| {weight:.2f} | {row['mean_error_torso']:.5g} | "
            f"{row['mean_excess_error_torso']:.5g} | "
            f"{row['within_tolerance_rate']:.3%} |"
        )
    tolerances = annotation_metadata["tolerances_by_annotator"]
    lines.extend(
        [
            "",
            "Positional summaries exclude unclear/latest-noncompleted tasks, "
            "calibration tasks, tasks without an adjusted skeleton, and fully "
            "occluded positional targets. Semi-occluded targets receive the "
            "annotation-store weight of 0.5. Statistics are first aggregated by "
            "task and case; bootstrap intervals resample cases.",
            "",
            "Active tolerance(s): "
            + ", ".join(
                f"{annotator}={values['active_tolerance_torso']:.5g} torso "
                f"({values['active_tolerance_source']})"
                for annotator, values in tolerances.items()
            ),
            "",
            "See `annotation_summary.csv` for overall, source-quality-stratified "
            "(including `unclassified`) estimates and case-bootstrap intervals.",
            "",
        ]
    )
    (output_root / "report.md").write_text("\n".join(lines), encoding="utf-8")


def run_analysis(
    corpus_root: Path,
    annotations_db: Path,
    annotation_manifest: Path,
    output_root: Path,
    *,
    weights: t.Sequence[float] = DEFAULT_WEIGHTS,
    bootstrap_samples: int = 2000,
    seed: int = 20260826,
) -> None:
    """Run the grid and write reproducible tables, JSON, report, and plots."""

    if output_root.exists():
        raise FileExistsError(
            f"Output directory already exists; choose a unique path: {output_root}"
        )
    for required in (
        corpus_root / "selection.tsv",
        corpus_root / "exclusions.tsv",
        annotations_db,
        annotation_manifest,
    ):
        if not required.is_file():
            raise FileNotFoundError(required)
    validated_weights = tuple(float(weight) for weight in weights)
    if len(set(validated_weights)) != len(validated_weights):
        raise ValueError("weights must be unique")
    for weight in validated_weights:
        _candidate_config(weight)
    if bootstrap_samples < 0:
        raise ValueError("bootstrap_samples must be non-negative")

    input_hashes = {
        "selection_manifest_sha256": _sha256(corpus_root / "selection.tsv"),
        "exclusions_manifest_sha256": _sha256(corpus_root / "exclusions.tsv"),
        "annotation_manifest_sha256": _sha256(annotation_manifest),
        "annotations_db_sha256": _sha256(annotations_db),
    }
    output_root.mkdir(parents=True)
    included, exclusions, included_stems = _load_corpus_membership(corpus_root)
    included.to_csv(output_root / "included_clips.tsv", sep="\t", index=False)
    exclusions.to_csv(output_root / "excluded_clips.tsv", sep="\t", index=False)
    manifest = json.loads(annotation_manifest.read_text(encoding="utf-8"))

    numerical_rows: list[dict[str, t.Any]] = []
    pose2d_cleans: dict[tuple[str, float], pd.DataFrame] = {}
    analyzed_by_modality: dict[str, list[str]] = {}
    for pose_data_type, raw_subdir in (
        (PoseDataType.pose2d, "pose2d"),
        (PoseDataType.holistic_3d, "holistic"),
    ):
        raw_root = corpus_root / "raw" / raw_subdir
        raw_paths = collect_pose_data_files(
            raw_root, pose_data_type, preferred_versions=("raw",)
        )
        raw_paths = [
            path
            for path in raw_paths
            if relative_stem_from_pose_csv_path(path, raw_root, pose_data_type)
            in included_stems
        ]
        analyzed_by_modality[pose_data_type.value] = []
        for raw_path in raw_paths:
            stem = relative_stem_from_pose_csv_path(
                raw_path, raw_root, pose_data_type
            )
            analyzed_by_modality[pose_data_type.value].append(stem)
            raw = pd.read_csv(raw_path, index_col="frame")
            baseline = preprocess_pose_dataframe(
                raw, pose_data_type, config=_candidate_config(0.0)
            )
            for weight in validated_weights:
                candidate = (
                    baseline
                    if weight == 0.0
                    else preprocess_pose_dataframe(
                        raw,
                        pose_data_type,
                        config=_candidate_config(weight),
                    )
                )
                numerical_rows.append(
                    {
                        "neighbor_weight": weight,
                        "pose_data_type": pose_data_type.value,
                        "file": stem,
                        **_motion_metrics(baseline, candidate, pose_data_type),
                    }
                )
                if pose_data_type is PoseDataType.pose2d:
                    pose2d_cleans[(stem, weight)] = candidate

    numerical_by_clip = pd.DataFrame(numerical_rows).sort_values(
        ["neighbor_weight", "pose_data_type", "file"]
    )
    numerical_summary = _numerical_summary(
        numerical_by_clip, bootstrap_samples, seed
    )
    annotation_landmarks, annotation_tasks, annotation_metadata = (
        _load_annotation_scores(
            annotations_db,
            manifest,
            pose2d_cleans,
            validated_weights,
        )
    )
    if annotation_tasks.empty:
        raise ValueError("No eligible adjusted-skeleton annotations were found")
    annotation_cases = _annotation_case_scores(annotation_tasks)
    annotation_summary = _annotation_summary(
        annotation_tasks, annotation_cases, bootstrap_samples, seed
    )

    numerical_by_clip.to_csv(output_root / "numerical_by_clip.csv", index=False)
    numerical_summary.to_csv(output_root / "numerical_summary.csv", index=False)
    annotation_landmarks.to_csv(
        output_root / "annotation_landmark_errors.csv", index=False
    )
    annotation_tasks.to_csv(output_root / "annotation_task_scores.csv", index=False)
    annotation_cases.to_csv(output_root / "annotation_case_scores.csv", index=False)
    annotation_summary.to_csv(output_root / "annotation_summary.csv", index=False)
    _write_plots(output_root, numerical_by_clip, annotation_summary)
    _write_report(
        output_root,
        numerical_summary,
        annotation_summary,
        annotation_metadata,
    )

    configs = {
        f"{weight:.2f}": {
            key: ("inf" if isinstance(value, float) and not np.isfinite(value) else value)
            for key, value in asdict(_candidate_config(weight)).items()
        }
        for weight in validated_weights
    }
    provenance = {
        "analysis_version": ANALYSIS_VERSION,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "command": sys.argv,
        "corpus_root": str(corpus_root.resolve()),
        "annotations_db": str(annotations_db.resolve()),
        "annotation_manifest": str(annotation_manifest.resolve()),
        "output_root": str(output_root.resolve()),
        **input_hashes,
        "weights": validated_weights,
        "candidate_configs": configs,
        "c4_role": "numerical comparison reference; not asserted as ground truth",
        "corrected_acceleration_scope": (
            "MediaPipe-visible landmark roots only; generated base and preprocess "
            "columns excluded; finite three-frame differences only"
        ),
        "metric_definitions": {
            "displacement_vs_c4": (
                "Euclidean torso-normalized landmark displacement on points finite "
                "in both candidate and C4"
            ),
            "path_length_retention_vs_c4": (
                "candidate/C4 summed landmark path length over identical finite "
                "consecutive-frame segments"
            ),
            "peak_speed_retention_vs_c4": (
                "candidate/C4 maximum one-frame landmark displacement over "
                "identical finite consecutive-frame segments"
            ),
            "annotation_position": (
                "image-space candidate error normalized by adjusted-skeleton torso; "
                "fully occluded targets excluded and semi-occluded targets weighted 0.5"
            ),
        },
        "high_frequency_band_cycles_per_frame": HIGH_FREQUENCY_BAND_CYCLES_PER_FRAME,
        "spectral_method": (
            f"Hann-windowed energy on contiguous matched finite runs of at least "
            f"{MINIMUM_SPECTRAL_RUN_FRAMES} frames"
        ),
        "bootstrap": {
            "samples": bootstrap_samples,
            "seed": seed,
            "numerical_unit": "clip",
            "annotation_unit": "case after task aggregation",
        },
        "intended_included_clip_count": len(included),
        "analyzed_stems_by_modality": {
            modality: sorted(stems)
            for modality, stems in analyzed_by_modality.items()
        },
        "annotation": annotation_metadata,
    }
    (output_root / "run_provenance.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    summary = {
        "numerical_summary": numerical_summary.to_dict("records"),
        "annotation_summary": annotation_summary.to_dict("records"),
        "annotation_selection": annotation_metadata["selection"],
    }
    (output_root / "summary.json").write_text(
        json.dumps(_json_safe(summary), indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    """Parse explicit inputs and run the smoothing grid."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus-root", type=Path, required=True)
    parser.add_argument("--annotations-db", type=Path, required=True)
    parser.add_argument("--annotation-manifest", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument(
        "--weights",
        type=float,
        nargs="+",
        default=DEFAULT_WEIGHTS,
        help="Symmetric neighbor weights (default: 0 .05 .10 .15 .20 .25)",
    )
    parser.add_argument("--bootstrap-samples", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=20260826)
    args = parser.parse_args()
    run_analysis(
        args.corpus_root,
        args.annotations_db,
        args.annotation_manifest,
        args.output_root,
        weights=args.weights,
        bootstrap_samples=args.bootstrap_samples,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
