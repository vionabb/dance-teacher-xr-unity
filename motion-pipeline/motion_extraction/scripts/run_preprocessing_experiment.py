"""Run the lightweight pose-preprocessing comparison on the staged corpus."""

from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import json
from pathlib import Path
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
from dance_teacher_pose.preprocessing import PREPROCESS_ACTIONS


PROFILES: dict[str, PosePreprocessingConfig | None] = {
    "B0": None,
    "C1": PosePreprocessingConfig(
        min_visibility=0.2,
        max_gap_frames=3,
        isolated_outlier_threshold=0.75,
        isolated_outlier_ratio=3.0,
        smoothing="none",
    ),
    "C2": PosePreprocessingConfig(
        min_visibility=0.2,
        max_gap_frames=3,
        isolated_outlier_threshold=0.75,
        isolated_outlier_ratio=3.0,
        smoothing="triangular3",
    ),
    "C3": PosePreprocessingConfig(
        min_visibility=0.5,
        max_gap_frames=3,
        isolated_outlier_threshold=0.5,
        isolated_outlier_ratio=2.0,
        smoothing="triangular3",
    ),
    "C4": PosePreprocessingConfig(
        min_visibility=0.0,
        max_gap_frames=2,
        isolated_outlier_threshold=float("inf"),
        isolated_outlier_ratio=0.0,
        smoothing="none",
    ),
}

POSE_EDGES = (
    ("LEFT_SHOULDER", "RIGHT_SHOULDER"),
    ("LEFT_SHOULDER", "LEFT_ELBOW"),
    ("LEFT_ELBOW", "LEFT_WRIST"),
    ("RIGHT_SHOULDER", "RIGHT_ELBOW"),
    ("RIGHT_ELBOW", "RIGHT_WRIST"),
    ("LEFT_SHOULDER", "LEFT_HIP"),
    ("RIGHT_SHOULDER", "RIGHT_HIP"),
    ("LEFT_HIP", "RIGHT_HIP"),
    ("LEFT_HIP", "LEFT_KNEE"),
    ("LEFT_KNEE", "LEFT_ANKLE"),
    ("RIGHT_HIP", "RIGHT_KNEE"),
    ("RIGHT_KNEE", "RIGHT_ANKLE"),
)
DISTAL_JOINTS = ("LEFT_WRIST", "RIGHT_WRIST", "LEFT_ANKLE", "RIGHT_ANKLE")


def _load_corpus_membership(corpus_root: Path) -> tuple[pd.DataFrame, pd.DataFrame, set[str]]:
    """Load selection/exclusion manifests and resolve the exact included stems."""

    selection_path = corpus_root / "selection.tsv"
    exclusions_path = corpus_root / "exclusions.tsv"
    selection = pd.read_csv(selection_path, sep="\t")
    exclusions = pd.read_csv(exclusions_path, sep="\t")
    excluded_names = {Path(path).name for path in exclusions["source_video"]}
    videos_by_name = {path.name: path for path in (corpus_root / "videos").rglob("*.mp4")}
    included_rows: list[dict[str, t.Any]] = []
    for row in selection.to_dict("records"):
        source_name = Path(str(row["source_video"])).name
        video_path = videos_by_name.get(source_name)
        if source_name in excluded_names or video_path is None:
            continue
        included_rows.append(
            {
                **row,
                "relative_stem": video_path.relative_to(corpus_root / "videos").with_suffix("").as_posix(),
                "resolved_video": video_path.relative_to(corpus_root).as_posix(),
            }
        )
    included = pd.DataFrame(included_rows)
    if len(included) != 25:
        raise ValueError(f"Expected 25 included clips after exclusions, found {len(included)}")
    return included, exclusions, set(included["relative_stem"])


def _visible_roots(dataframe: pd.DataFrame, coordinate_fields: t.Sequence[str]) -> list[str]:
    """Return complete coordinate roots that expose MediaPipe visibility."""

    roots: list[str] = []
    for column in dataframe.columns:
        if not column.endswith("_vis"):
            continue
        root = column[:-4]
        if root == "base" or root.startswith("preprocess_"):
            continue
        if all(f"{root}_{field}" in dataframe.columns for field in coordinate_fields):
            roots.append(root)
    return roots


def _direct_quality_summary(
    clean: pd.DataFrame,
    pose_data_type: PoseDataType,
) -> dict[str, float | int]:
    """Summarize coverage, frame usability, roughness, and cleanup actions."""

    fields = get_pose_data_schema(pose_data_type).coordinate_fields
    roots = _visible_roots(clean, fields)
    coordinate_columns = [f"{root}_{field}" for root in roots for field in fields]
    coordinate_values = clean[coordinate_columns].to_numpy(dtype=float)
    finite_fraction = float(np.isfinite(coordinate_values).mean()) if coordinate_values.size else np.nan

    accelerations: list[np.ndarray] = []
    for root in roots:
        values = clean[[f"{root}_{field}" for field in fields]].to_numpy(dtype=float)
        if len(values) < 3:
            continue
        acceleration = np.linalg.norm(np.diff(values, n=2, axis=0), axis=1)
        accelerations.append(acceleration[np.isfinite(acceleration)])
    all_acceleration = np.concatenate(accelerations) if accelerations else np.array([])
    result: dict[str, float | int] = {
        "frame_count": len(clean),
        "visible_landmark_count": len(roots),
        "finite_coordinate_fraction": finite_fraction,
        "usable_frame_fraction": float(clean["preprocess_is_usable"].mean()),
        "normalized_acceleration_p95": (
            float(np.quantile(all_acceleration, 0.95)) if all_acceleration.size else np.nan
        ),
    }
    for action in PREPROCESS_ACTIONS:
        column = f"preprocess_{action}_landmark_count"
        result[column] = int(clean[column].sum()) if column in clean else 0
    return result


def _natural_gap_runs(
    raw: pd.DataFrame,
    pose_data_type: PoseDataType,
    relative_stem: str,
) -> list[dict[str, t.Any]]:
    """Enumerate naturally missing body-landmark runs without modifying data."""

    fields = get_pose_data_schema(pose_data_type).coordinate_fields
    rows: list[dict[str, t.Any]] = []
    for root in _visible_roots(raw, fields):
        valid = raw[[f"{root}_{field}" for field in fields]].notna().all(axis=1).to_numpy()
        position = 0
        while position < len(valid):
            if valid[position]:
                position += 1
                continue
            start = position
            while position < len(valid) and not valid[position]:
                position += 1
            length = position - start
            rows.append(
                {
                    "pose_data_type": pose_data_type.value,
                    "file": relative_stem,
                    "landmark": root,
                    "start_position": start,
                    "gap_length": length,
                    "is_edge_gap": int(start == 0 or position == len(valid)),
                    "length_bin": (
                        str(length) if length <= 4 else "5-14" if length < 15 else "15+"
                    ),
                }
            )
    return rows


def _whole_pose_gap_events(
    raw: pd.DataFrame,
    pose_data_type: PoseDataType,
    relative_stem: str,
) -> list[dict[str, t.Any]]:
    """Locate runs where every body landmark is missing from a frame."""

    fields = get_pose_data_schema(pose_data_type).coordinate_fields
    roots = _visible_roots(raw, fields)
    if not roots:
        return []
    any_landmark_valid = pd.Series(False, index=raw.index)
    for root in roots:
        columns = [f"{root}_{field}" for field in fields]
        any_landmark_valid |= raw[columns].notna().all(axis=1)
    missing = (~any_landmark_valid).to_numpy()
    events: list[dict[str, t.Any]] = []
    position = 0
    while position < len(missing):
        if not missing[position]:
            position += 1
            continue
        start = position
        while position < len(missing) and missing[position]:
            position += 1
        events.append(
            {
                "pose_data_type": pose_data_type.value,
                "file": relative_stem,
                "start_position": start,
                "end_position": position - 1,
                "start_frame": raw.index[start],
                "end_frame": raw.index[position - 1],
                "gap_length": position - start,
                "is_edge_gap": int(start == 0 or position == len(missing)),
            }
        )
    return events


def _displacement_summary(
    raw: pd.DataFrame,
    baseline: pd.DataFrame,
    candidate: pd.DataFrame,
    pose_data_type: PoseDataType,
    min_visibility: float,
) -> dict[str, float | int]:
    """Measure B0 displacement on high-confidence finite raw landmarks.

    Touched/untouched is a conservative frame-level split: a landmark is in a
    touched frame when any cleanup action occurred on that frame.
    """

    fields = get_pose_data_schema(pose_data_type).coordinate_fields
    touched_frame = pd.Series(False, index=candidate.index)
    for action in PREPROCESS_ACTIONS:
        flag = f"preprocess_has_{action}"
        if flag in candidate:
            touched_frame |= candidate[flag].astype(bool)
    displacement: dict[str, list[float]] = {"touched": [], "untouched": []}
    for root in _visible_roots(raw, fields):
        columns = [f"{root}_{field}" for field in fields]
        eligible = (
            raw[columns].notna().all(axis=1)
            & raw[f"{root}_vis"].ge(min_visibility)
            & baseline[columns].notna().all(axis=1)
            & candidate[columns].notna().all(axis=1)
        )
        values = np.linalg.norm(
            candidate[columns].to_numpy(dtype=float)
            - baseline[columns].to_numpy(dtype=float),
            axis=1,
        )
        for group, group_mask in (
            ("touched", touched_frame),
            ("untouched", ~touched_frame),
        ):
            displacement[group].extend(values[(eligible & group_mask).to_numpy()].tolist())
    result: dict[str, float | int] = {}
    for group, values in displacement.items():
        array = np.asarray(values, dtype=float)
        result[f"{group}_coordinate_count"] = int(array.size)
        result[f"{group}_displacement_median"] = (
            float(np.median(array)) if array.size else np.nan
        )
        result[f"{group}_displacement_p95"] = (
            float(np.quantile(array, 0.95)) if array.size else np.nan
        )
    return result


def _trusted_center(
    raw: pd.DataFrame,
    fields: t.Sequence[str],
    min_visibility: float,
    half_width: int = 9,
) -> int | None:
    """Choose a finite wrist-and-anchor span near the clip middle."""

    root = "LEFT_WRIST"
    required_roots = [root, "LEFT_HIP", "RIGHT_HIP", "LEFT_SHOULDER", "RIGHT_SHOULDER"]
    required = [f"{item}_{field}" for item in required_roots for field in fields]
    if not all(column in raw for column in required):
        return None
    valid = raw[required].notna().all(axis=1)
    visibility_column = f"{root}_vis"
    if visibility_column in raw:
        valid &= raw[visibility_column].ge(min_visibility)
    candidates = [
        center
        for center in range(half_width, len(raw) - half_width)
        if valid.iloc[center - half_width : center + half_width + 1].all()
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda center: abs(center - len(raw) / 2))


def _point_error(
    expected: pd.DataFrame,
    actual: pd.DataFrame,
    rows: t.Sequence[int],
    columns: t.Sequence[str],
) -> float:
    """Return RMSE over selected coordinates, or NaN when not reconstructed."""

    expected_values = expected.iloc[list(rows)][list(columns)].to_numpy(dtype=float)
    actual_values = actual.iloc[list(rows)][list(columns)].to_numpy(dtype=float)
    if not np.isfinite(actual_values).all():
        return np.nan
    return float(np.sqrt(np.mean(np.square(expected_values - actual_values))))


def _synthetic_checks(
    raw: pd.DataFrame,
    config: PosePreprocessingConfig | None,
    pose_data_type: PoseDataType,
) -> dict[str, float | int] | None:
    """Inject recoverable and forbidden wrist gaps plus one modest spike."""

    fields = get_pose_data_schema(pose_data_type).coordinate_fields
    min_visibility = config.min_visibility if config is not None else 0.0
    center = _trusted_center(raw, fields, min_visibility)
    if center is None:
        return None
    columns = [f"LEFT_WRIST_{field}" for field in fields]
    expected = preprocess_pose_dataframe(raw, pose_data_type, config=config)

    gap_raw = raw.copy()
    gap_rows = list(range(center - 1, center + 2))
    gap_raw.iloc[gap_rows, gap_raw.columns.get_indexer(columns)] = np.nan
    gap_clean = preprocess_pose_dataframe(gap_raw, pose_data_type, config=config)

    safety_results: dict[str, int] = {}
    for label, start, end in (
        ("internal_4", center - 2, center + 2),
        ("internal_15", center - 7, center + 8),
    ):
        safety_raw = raw.copy()
        safety_raw.iloc[start:end, safety_raw.columns.get_indexer(columns)] = np.nan
        safety_clean = preprocess_pose_dataframe(safety_raw, pose_data_type, config=config)
        safety_results[f"{label}_gap_unfilled"] = int(
            safety_clean.iloc[start:end][columns].isna().all().all()
        )

    edge_raw = raw.iloc[center - 9 : center + 10].copy()
    edge_raw.iloc[:3, edge_raw.columns.get_indexer(columns)] = np.nan
    edge_clean = preprocess_pose_dataframe(edge_raw, pose_data_type, config=config)
    safety_results["edge_gap_unfilled"] = int(
        edge_clean.iloc[:3][columns].isna().all().all()
    )

    spike_raw = raw.copy()
    hip = (
        raw[[f"LEFT_HIP_{field}" for field in fields]].to_numpy(dtype=float)
        + raw[[f"RIGHT_HIP_{field}" for field in fields]].to_numpy(dtype=float)
    ) / 2.0
    shoulder = (
        raw[[f"LEFT_SHOULDER_{field}" for field in fields]].to_numpy(dtype=float)
        + raw[[f"RIGHT_SHOULDER_{field}" for field in fields]].to_numpy(dtype=float)
    ) / 2.0
    scale = float(np.nanmedian(np.linalg.norm(shoulder - hip, axis=1)))
    spike_raw.iloc[center, spike_raw.columns.get_loc(columns[0])] += scale
    spike_clean = preprocess_pose_dataframe(spike_raw, pose_data_type, config=config)

    gap_error = _point_error(expected, gap_clean, gap_rows, columns)
    spike_error = _point_error(expected, spike_clean, [center], columns)
    return {
        "synthetic_center_frame": int(raw.index[center]),
        "gap_recovered": int(np.isfinite(gap_error)),
        "gap_rmse_normalized": gap_error,
        "spike_rmse_normalized": spike_error,
        "spike_replaced": int(
            spike_clean.get(
                "preprocess_outlier_replaced_landmark_count",
                pd.Series(0, index=spike_clean.index),
            ).iloc[center]
            > 0
        ),
        "uncorrupted_span_unprompted_outlier_action_count": int(
            expected.get(
                "preprocess_outlier_replaced_landmark_count",
                pd.Series(0, index=expected.index),
            ).iloc[center - 9 : center + 10].sum()
        ),
        **safety_results,
    }


def _write_selected_plots(
    corpus_root: Path,
    output_root: Path,
    summary: pd.DataFrame,
    max_plots: int,
) -> None:
    """Plot wrist trajectories for files with the most cleanup activity."""

    if max_plots <= 0:
        return
    action_columns = [f"preprocess_{action}_landmark_count" for action in PREPROCESS_ACTIONS]
    candidate = summary[summary["pose_data_type"] == PoseDataType.pose2d.value].copy()
    candidate["action_total"] = candidate[action_columns].sum(axis=1)
    selected = candidate.groupby("file", as_index=False)["action_total"].max()
    selected = selected.sort_values("action_total", ascending=False).head(max_plots)
    plots_dir = output_root / "plots"
    plots_dir.mkdir(parents=True, exist_ok=True)
    raw_root = corpus_root / "raw" / "pose2d"
    suffix = get_pose_data_schema(PoseDataType.pose2d).raw_suffix
    for _, selection in selected.iterrows():
        relative_stem = str(selection["file"])
        raw_path = raw_root / f"{relative_stem}{suffix}"
        raw = pd.read_csv(raw_path, index_col="frame")
        figure, axis = plt.subplots(figsize=(8, 3))
        for profile, config in PROFILES.items():
            clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=config)
            axis.plot(clean.index, clean["LEFT_WRIST_x"], label=profile, linewidth=1)
        axis.set(title=relative_stem, xlabel="frame", ylabel="normalized left-wrist x")
        axis.legend(ncol=4, fontsize=8)
        figure.tight_layout()
        safe_name = relative_stem.replace("/", "__")
        figure.savefig(plots_dir / f"{safe_name}.png", dpi=150)
        plt.close(figure)


def _candidate_frame(
    raw: pd.DataFrame,
    cleans: dict[str, pd.DataFrame],
    choose_high_change: bool,
) -> int | None:
    """Choose one finite pose frame for a high-change or clean comparison."""

    fields = get_pose_data_schema(PoseDataType.pose2d).coordinate_fields
    roots = _visible_roots(raw, fields)
    columns = [f"{root}_{field}" for root in roots for field in ("x", "y")]
    baseline_values = cleans["B0"][columns].to_numpy(dtype=float)
    candidate_values = cleans["C3"][columns].to_numpy(dtype=float)
    finite = np.isfinite(baseline_values).all(axis=1) & np.isfinite(candidate_values).all(axis=1)
    positions = np.flatnonzero(finite)
    if not positions.size:
        return None
    displacement = np.full(len(raw), np.nan)
    displacement[finite] = np.mean(
        np.abs(candidate_values[finite] - baseline_values[finite]), axis=1
    )
    if choose_high_change:
        return int(positions[np.argmax(displacement[positions])])
    rng = np.random.default_rng(20260825 + len(raw))
    return int(rng.choice(positions))


def _pose_pixels(clean: pd.DataFrame, position: int) -> dict[str, tuple[float, float]]:
    """Reconstruct image-space pose points from normalized clean coordinates."""

    torso = float(clean["preprocess_torso_length"].iloc[position])
    root_x = float(clean["preprocess_root_x"].iloc[position])
    root_y = float(clean["preprocess_root_y"].iloc[position])
    pixels: dict[str, tuple[float, float]] = {}
    for landmark in {item for edge in POSE_EDGES for item in edge}:
        if not all(f"{landmark}_{field}" in clean for field in ("x", "y")):
            continue
        x = float(clean[f"{landmark}_x"].iloc[position])
        y = float(clean[f"{landmark}_y"].iloc[position])
        if np.isfinite([x, y, torso, root_x, root_y]).all():
            pixels[landmark] = (x * torso + root_x, y * torso + root_y)
    return pixels


def _c2_frame_scores(
    raw: pd.DataFrame,
    baseline: pd.DataFrame,
    candidate: pd.DataFrame,
    min_visibility: float = 0.8,
) -> pd.DataFrame:
    """Score B0–C2 disagreement on high-visibility distal joints per frame."""

    scores = np.full((len(raw), len(DISTAL_JOINTS)), np.nan)
    for joint_index, joint in enumerate(DISTAL_JOINTS):
        columns = [f"{joint}_x", f"{joint}_y"]
        if not all(column in raw for column in [*columns, f"{joint}_vis"]):
            continue
        eligible = (
            raw[columns].notna().all(axis=1)
            & raw[f"{joint}_vis"].ge(min_visibility)
            & baseline[columns].notna().all(axis=1)
            & candidate[columns].notna().all(axis=1)
        )
        displacement = np.linalg.norm(
            candidate[columns].to_numpy(dtype=float)
            - baseline[columns].to_numpy(dtype=float),
            axis=1,
        )
        scores[eligible.to_numpy(), joint_index] = displacement[eligible.to_numpy()]
    valid = np.isfinite(scores).any(axis=1)
    if not valid.any():
        return pd.DataFrame(
            columns=["frame_position", "frame_label", "joint", "disagreement", "visibility"]
        )
    safe_scores = np.where(np.isfinite(scores), scores, -np.inf)
    winning_joint = np.argmax(safe_scores, axis=1)
    positions = np.flatnonzero(valid)
    return pd.DataFrame(
        {
            "frame_position": positions,
            "frame_label": raw.index[positions],
            "joint": [DISTAL_JOINTS[winning_joint[position]] for position in positions],
            "disagreement": safe_scores[positions, winning_joint[positions]],
            "visibility": [
                raw[f"{DISTAL_JOINTS[winning_joint[position]]}_vis"].iloc[position]
                for position in positions
            ],
        }
    )


def _temporally_separated(
    candidates: pd.DataFrame,
    count: int,
    minimum_separation: int = 12,
) -> pd.DataFrame:
    """Greedily select high-ranked cases separated within each source clip."""

    if count <= 0:
        return candidates.head(0).copy()
    selected_rows: list[pd.Series] = []
    for _, row in candidates.iterrows():
        conflict = any(
            prior["file"] == row["file"]
            and abs(int(prior["frame_position"]) - int(row["frame_position"]))
            < minimum_separation
            for prior in selected_rows
        )
        if not conflict:
            selected_rows.append(row)
        if len(selected_rows) == count:
            break
    return pd.DataFrame(selected_rows, columns=candidates.columns)


def _draw_pose_overlay(axis: t.Any, image: np.ndarray, clean: pd.DataFrame, position: int) -> None:
    """Draw one reconstructed clean-pose skeleton over a source frame."""

    axis.imshow(image)
    pixels = _pose_pixels(clean, position)
    for start, end in POSE_EDGES:
        if start in pixels and end in pixels:
            axis.plot(
                [pixels[start][0], pixels[end][0]],
                [pixels[start][1], pixels[end][1]],
                color="#00e5ff",
                linewidth=1.5,
            )
    if pixels:
        points = np.asarray(list(pixels.values()))
        axis.scatter(points[:, 0], points[:, 1], s=7, c="#ff3366")
    axis.axis("off")


def _write_review_frame(
    path: Path,
    image: np.ndarray,
    clean: pd.DataFrame | None = None,
    position: int | None = None,
) -> None:
    """Write one full-resolution source or pose-overlay review frame."""

    import cv2

    rendered = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    if clean is not None and position is not None:
        pixels = _pose_pixels(clean, position)
        for start, end in POSE_EDGES:
            if start in pixels and end in pixels:
                cv2.line(
                    rendered,
                    tuple(int(round(value)) for value in pixels[start]),
                    tuple(int(round(value)) for value in pixels[end]),
                    (255, 229, 0),
                    4,
                    lineType=cv2.LINE_AA,
                )
        for x, y in pixels.values():
            cv2.circle(
                rendered,
                (int(round(x)), int(round(y))),
                6,
                (102, 51, 255),
                thickness=-1,
                lineType=cv2.LINE_AA,
            )
    path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(path), rendered):
        raise RuntimeError(f"Could not write review frame: {path}")


def _profile_provenance() -> dict[str, dict[str, t.Any] | None]:
    """Return JSON-safe profile settings for experiment and annotation manifests."""

    provenance: dict[str, dict[str, t.Any] | None] = {}
    for profile, config in PROFILES.items():
        if config is None:
            provenance[profile] = None
            continue
        values = asdict(config)
        provenance[profile] = {
            key: "inf" if isinstance(value, float) and not np.isfinite(value) else value
            for key, value in values.items()
        }
    return provenance


def _json_scalar(value: t.Any) -> t.Any:
    """Convert NumPy/Pandas scalar values to standard JSON scalar types."""

    return value.item() if hasattr(value, "item") else value


def _write_c2_distortion_review(
    corpus_root: Path,
    output_root: Path,
    included_stems: t.Iterable[str],
    max_cases: int,
) -> None:
    """Write source-backed frame tasks and contextual strips for all profiles."""

    if max_cases <= 0:
        return
    import cv2

    raw_root = corpus_root / "raw" / "pose2d"
    suffix = get_pose_data_schema(PoseDataType.pose2d).raw_suffix
    scored: list[pd.DataFrame] = []
    pose_data: dict[
        str, tuple[pd.DataFrame, dict[str, pd.DataFrame], Path]
    ] = {}
    availability_rows: list[dict[str, t.Any]] = []
    for relative_stem in sorted(included_stems):
        video_path = corpus_root / "videos" / f"{relative_stem}.mp4"
        capture = cv2.VideoCapture(str(video_path))
        readable = capture.isOpened()
        capture.release()
        availability_rows.append(
            {
                "file": relative_stem,
                "source_video": video_path.relative_to(corpus_root).as_posix(),
                "readable": int(readable),
            }
        )
        raw_path = raw_root / f"{relative_stem}{suffix}"
        if not readable or not raw_path.exists():
            continue
        raw = pd.read_csv(raw_path, index_col="frame")
        cleans = {
            profile: preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=config)
            for profile, config in PROFILES.items()
        }
        baseline = cleans["B0"]
        candidate = cleans["C2"]
        frame_scores = _c2_frame_scores(raw, baseline, candidate)
        if frame_scores.empty:
            continue
        frame_scores["file"] = relative_stem
        scored.append(frame_scores)
        pose_data[relative_stem] = (raw, cleans, video_path)
    pd.DataFrame(availability_rows).to_csv(
        output_root / "c2_review_source_availability.csv", index=False
    )
    if not scored:
        pd.DataFrame().to_csv(output_root / "c2_review_cases.csv", index=False)
        pd.DataFrame().to_csv(output_root / "c2_review_answer_key.csv", index=False)
        return

    all_scores = pd.concat(scored, ignore_index=True)
    high_count = min(6, max_cases)
    high = _temporally_separated(
        all_scores.sort_values("disagreement", ascending=False), high_count
    )
    remaining = all_scores.merge(
        high[["file", "frame_position"]].assign(selected=1),
        on=["file", "frame_position"],
        how="left",
    )
    remaining = remaining[remaining["selected"].isna()].drop(columns="selected")
    ordinary_pool = remaining[
        remaining["disagreement"] <= remaining["disagreement"].median()
    ].copy()
    ordinary_pool["random_order"] = np.random.default_rng(20260825).random(
        len(ordinary_pool)
    )
    ordinary = _temporally_separated(
        ordinary_pool.sort_values("random_order"), min(2, max_cases - len(high))
    ).drop(columns="random_order", errors="ignore")
    cases = pd.concat(
        [high.assign(category="high_disagreement"), ordinary.assign(category="ordinary_control")],
        ignore_index=True,
    )

    artifact_dir = output_root / "c2_distortion_review"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    case_rows: list[dict[str, t.Any]] = []
    answer_rows: list[dict[str, t.Any]] = []
    annotation_tasks: list[dict[str, t.Any]] = []
    for case_index, case in cases.iterrows():
        relative_stem = str(case["file"])
        raw, cleans, video_path = pose_data[relative_stem]
        baseline = cleans["B0"]
        candidate = cleans["C2"]
        center = int(case["frame_position"])
        positions = list(range(max(0, center - 2), min(len(raw), center + 3)))
        capture = cv2.VideoCapture(str(video_path))
        frames: dict[int, np.ndarray] = {}
        for position in positions:
            capture.set(cv2.CAP_PROP_POS_FRAMES, position)
            ok, frame = capture.read()
            if ok:
                frames[position] = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        capture.release()
        if len(frames) != len(positions):
            continue
        a_is_c2 = bool(case_index % 2)
        a_pose, b_pose = (candidate, baseline) if a_is_c2 else (baseline, candidate)
        figure, axes = plt.subplots(3, len(positions), figsize=(2.4 * len(positions), 7))
        for column, position in enumerate(positions):
            axes[0, column].imshow(frames[position])
            axes[0, column].set_title(f"frame {raw.index[position]}", fontsize=8)
            axes[0, column].axis("off")
            _draw_pose_overlay(axes[1, column], frames[position], a_pose, position)
            _draw_pose_overlay(axes[2, column], frames[position], b_pose, position)
        axes[0, 0].set_ylabel("Source", fontsize=9)
        axes[1, 0].set_ylabel("A", fontsize=9)
        axes[2, 0].set_ylabel("B", fontsize=9)
        window_scores = all_scores[
            (all_scores["file"] == relative_stem)
            & all_scores["frame_position"].isin(positions)
        ]["disagreement"]
        figure.suptitle(
            f"Case {case_index + 1:02d} · {case['category']} · center joint {case['joint']} · "
            f"center Δ={case['disagreement']:.3f}, window max Δ={window_scores.max():.3f}",
            fontsize=9,
        )
        figure.tight_layout()
        artifact_name = f"case_{case_index + 1:02d}.png"
        figure.savefig(artifact_dir / artifact_name, dpi=140)
        plt.close(figure)
        source_artifact_name = f"case_{case_index + 1:02d}__source.png"
        source_figure, source_axes = plt.subplots(
            1, len(positions), figsize=(2.4 * len(positions), 2.4)
        )
        for column, position in enumerate(positions):
            source_axes[column].imshow(frames[position])
            source_axes[column].set_title(f"frame {raw.index[position]}", fontsize=8)
            source_axes[column].axis("off")
        source_figure.tight_layout()
        source_figure.savefig(artifact_dir / source_artifact_name, dpi=140)
        plt.close(source_figure)
        profile_artifacts: dict[str, str] = {}
        for profile, clean in cleans.items():
            profile_artifact_name = (
                f"case_{case_index + 1:02d}__{profile.lower()}.png"
            )
            profile_figure, profile_axes = plt.subplots(
                1, len(positions), figsize=(2.4 * len(positions), 2.4)
            )
            for column, position in enumerate(positions):
                _draw_pose_overlay(profile_axes[column], frames[position], clean, position)
                profile_axes[column].set_title(
                    f"frame {raw.index[position]}", fontsize=8
                )
            profile_figure.tight_layout()
            profile_figure.savefig(artifact_dir / profile_artifact_name, dpi=140)
            plt.close(profile_figure)
            profile_artifacts[profile] = (
                f"c2_distortion_review/{profile_artifact_name}"
            )
        source_artifact = f"c2_distortion_review/{source_artifact_name}"
        case_rows.append(
            {
                "case_id": case_index + 1,
                "category": case["category"],
                "file": relative_stem,
                "center_frame_position": center,
                "center_frame_label": raw.index[center],
                "distal_joint": case["joint"],
                "visibility": case["visibility"],
                "center_disagreement_normalized": case["disagreement"],
                "window_max_disagreement_normalized": window_scores.max(),
                "artifact": f"c2_distortion_review/{artifact_name}",
                "source_artifact": source_artifact,
                **{
                    f"{profile}_artifact": artifact
                    for profile, artifact in profile_artifacts.items()
                },
            }
        )
        answer_rows.append(
            {
                "case_id": case_index + 1,
                "A": "C2" if a_is_c2 else "B0",
                "B": "B0" if a_is_c2 else "C2",
            }
        )
        task_positions = sorted(
            positions,
            key=lambda position: (abs(position - center), position),
        )
        for task_position in task_positions:
            frame_label = _json_scalar(raw.index[task_position])
            frame_directory = (
                artifact_dir
                / f"case_{case_index + 1:02d}"
                / f"frame_{task_position:05d}"
            )
            source_frame_path = frame_directory / "source.png"
            _write_review_frame(source_frame_path, frames[task_position])
            frame_overlays: list[dict[str, t.Any]] = []
            for profile, clean in cleans.items():
                pose_points = _pose_pixels(clean, task_position)
                overlay_path = frame_directory / f"{profile.lower()}.png"
                _write_review_frame(
                    overlay_path,
                    frames[task_position],
                    clean=clean,
                    position=task_position,
                )
                frame_overlays.append(
                    {
                        "overlay_id": profile,
                        "artifact": overlay_path.relative_to(output_root).as_posix(),
                        "keypoints": {
                            landmark: [float(x), float(y)]
                            for landmark, (x, y) in sorted(
                                pose_points.items()
                            )
                        },
                        "visibility": {
                            landmark: float(clean[f"{landmark}_vis"].iloc[task_position])
                            for landmark in sorted({item for edge in POSE_EDGES for item in edge})
                            if f"{landmark}_vis" in clean
                            and np.isfinite(clean[f"{landmark}_vis"].iloc[task_position])
                            and landmark in pose_points
                        },
                    }
                )
            frame_score = all_scores[
                (all_scores["file"] == relative_stem)
                & (all_scores["frame_position"] == task_position)
            ]
            if frame_score.empty:
                frame_joint = str(case["joint"])
                frame_visibility = float(case["visibility"])
                frame_disagreement = None
            else:
                score = frame_score.iloc[0]
                frame_joint = str(score["joint"])
                frame_visibility = float(score["visibility"])
                frame_disagreement = float(score["disagreement"])
            annotation_tasks.append(
                {
                    "task_id": (
                        f"pose-cleanup-{case_index + 1:02d}-frame-{task_position:05d}"
                    ),
                    "case_id": str(case_index + 1),
                    "task_type": "editable_pose_ground_truth",
                    "priority": len(annotation_tasks) + 1,
                    "category": case["category"],
                    "source_file": relative_stem,
                    "frame_window": {
                        "positions": [int(task_position)],
                        "labels": [frame_label],
                        "center_position": int(task_position),
                        "center_label": frame_label,
                        "parent_window_positions": [
                            int(position) for position in positions
                        ],
                        "parent_center_position": center,
                    },
                    "selection_metrics": {
                        "distal_joint": frame_joint,
                        "visibility": frame_visibility,
                        "frame_disagreement_normalized": frame_disagreement,
                        "parent_center_disagreement_normalized": float(
                            case["disagreement"]
                        ),
                        "parent_window_max_disagreement_normalized": float(
                            window_scores.max()
                        ),
                    },
                    "source_artifact": source_frame_path.relative_to(
                        output_root
                    ).as_posix(),
                    "source_dimensions": {
                        "width": int(frames[task_position].shape[1]),
                        "height": int(frames[task_position].shape[0]),
                    },
                    "overlays": frame_overlays,
                }
            )
    pd.DataFrame(case_rows).to_csv(output_root / "c2_review_cases.csv", index=False)
    pd.DataFrame(answer_rows).to_csv(output_root / "c2_review_answer_key.csv", index=False)
    (output_root / "annotation_tasks.json").write_text(
        json.dumps(
            {
                "schema_version": "3.0",
                "experiment_id": output_root.name,
                "task_type": "editable_pose_ground_truth",
                "profile_provenance": _profile_provenance(),
                "landmarks": sorted({item for edge in POSE_EDGES for item in edge}),
                "pose_edges": [list(edge) for edge in POSE_EDGES],
                "occlusion_states": [
                    {"id": "non_occluded", "label": "Non-occluded", "visibility": 1.0},
                    {"id": "semi_occluded", "label": "Semi-occluded", "visibility": 0.5},
                    {"id": "fully_occluded", "label": "Fully occluded", "visibility": 0.0},
                ],
                "tier_definitions": [
                    {"value": 1, "id": "perfect", "label": "Perfect"},
                    {"value": 2, "id": "ok", "label": "OK"},
                    {"value": 3, "id": "poor", "label": "Poor"},
                    {"value": 4, "id": "bad", "label": "Bad"},
                ],
                "tasks": annotation_tasks,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def _write_overlay_contact_sheets(
    corpus_root: Path,
    output_root: Path,
    summary: pd.DataFrame,
    max_overlays: int,
) -> None:
    """Write bounded source-frame contact sheets for all four profiles."""

    if max_overlays <= 0:
        return
    import cv2

    action_columns = [f"preprocess_{action}_landmark_count" for action in PREPROCESS_ACTIONS]
    pose_summary = summary[summary["pose_data_type"] == PoseDataType.pose2d.value].copy()
    pose_summary["action_total"] = pose_summary[action_columns].sum(axis=1)
    by_file = pose_summary.groupby("file", as_index=False)["action_total"].max()
    high_count = min(4, max_overlays, len(by_file))
    high = by_file.nlargest(high_count, "action_total")["file"].tolist()
    remaining = by_file[~by_file["file"].isin(high)].sort_values("action_total")
    clean_pool = remaining.head(max(4, len(remaining) // 2))["file"].tolist()
    clean_count = min(4, max_overlays - high_count, len(clean_pool))
    rng = np.random.default_rng(20260825)
    clean = (
        sorted(rng.choice(clean_pool, size=clean_count, replace=False).tolist())
        if clean_count
        else []
    )

    raw_root = corpus_root / "raw" / "pose2d"
    raw_suffix = get_pose_data_schema(PoseDataType.pose2d).raw_suffix
    overlay_dir = output_root / "overlay_contact_sheets"
    overlay_dir.mkdir(parents=True, exist_ok=True)
    selection_rows: list[dict[str, t.Any]] = []
    for category, files in (("high_change", high), ("random_clean", clean)):
        for relative_stem in files:
            raw = pd.read_csv(raw_root / f"{relative_stem}{raw_suffix}", index_col="frame")
            cleans = {
                profile: preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=config)
                for profile, config in PROFILES.items()
            }
            position = _candidate_frame(raw, cleans, category == "high_change")
            if position is None:
                continue
            video_path = corpus_root / "videos" / f"{relative_stem}.mp4"
            capture = cv2.VideoCapture(str(video_path))
            capture.set(cv2.CAP_PROP_POS_FRAMES, position)
            ok, frame = capture.read()
            capture.release()
            image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if ok else None
            figure, axes = plt.subplots(
                1, len(PROFILES), figsize=(3 * len(PROFILES), 4), sharex=True, sharey=True
            )
            for axis, (profile, clean) in zip(axes, cleans.items()):
                if image is not None:
                    axis.imshow(image)
                pixels = _pose_pixels(clean, position)
                for start, end in POSE_EDGES:
                    if start in pixels and end in pixels:
                        axis.plot(
                            [pixels[start][0], pixels[end][0]],
                            [pixels[start][1], pixels[end][1]],
                            color="#00e5ff",
                            linewidth=2,
                        )
                if pixels:
                    points = np.asarray(list(pixels.values()))
                    axis.scatter(points[:, 0], points[:, 1], s=10, c="#ff3366")
                if image is None:
                    axis.invert_yaxis()
                    axis.set_aspect("equal")
                    axis.text(
                        0.5,
                        0.02,
                        "source video unavailable; reconstructed coordinates only",
                        transform=axis.transAxes,
                        ha="center",
                        fontsize=6,
                    )
                axis.set_title(profile)
                axis.axis("off")
            figure.suptitle(f"{category}: {relative_stem}, frame {raw.index[position]}", fontsize=9)
            figure.tight_layout()
            output_name = f"{category}__{relative_stem.replace('/', '__')}.png"
            figure.savefig(overlay_dir / output_name, dpi=130)
            plt.close(figure)
            selection_rows.append(
                {
                    "category": category,
                    "file": relative_stem,
                    "frame_position": position,
                    "frame_label": raw.index[position],
                    "source_video": video_path.relative_to(corpus_root).as_posix(),
                    "artifact": f"overlay_contact_sheets/{output_name}",
                }
            )
    pd.DataFrame(selection_rows).to_csv(output_root / "overlay_selection.csv", index=False)


def _write_gap_event_plots(
    corpus_root: Path,
    output_root: Path,
    events: pd.DataFrame,
) -> None:
    """Plot trajectories around every internal whole-pose gap (six in this corpus)."""

    if events.empty:
        return
    selected = events[
        (events["pose_data_type"] == PoseDataType.pose2d.value)
        & (events["is_edge_gap"] == 0)
    ].copy()
    selected["selected_for_gap_plot"] = 1
    plot_dir = output_root / "whole_pose_gap_plots"
    plot_dir.mkdir(parents=True, exist_ok=True)
    raw_root = corpus_root / "raw" / "pose2d"
    suffix = get_pose_data_schema(PoseDataType.pose2d).raw_suffix
    for event_number, (_, event) in enumerate(selected.iterrows(), start=1):
        relative_stem = str(event["file"])
        raw = pd.read_csv(raw_root / f"{relative_stem}{suffix}", index_col="frame")
        start = int(event["start_position"])
        end = int(event["end_position"])
        left = max(0, start - 10)
        right = min(len(raw), end + 11)
        figure, (axis, difference_axis) = plt.subplots(
            2,
            1,
            figsize=(8, 4),
            sharex=True,
            gridspec_kw={"height_ratios": [3, 1]},
        )
        clean_by_profile: dict[str, pd.DataFrame] = {}
        for profile, config in PROFILES.items():
            clean = preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=config)
            clean_by_profile[profile] = clean
            axis.plot(
                clean.index[left:right],
                clean["LEFT_WRIST_x"].iloc[left:right],
                label=profile,
                linewidth=2 if profile == "B0" else 1,
                alpha=0.65 if profile == "B0" else 1.0,
                linestyle="--" if profile == "C4" else "-",
                zorder=4 if profile == "C4" else 2,
            )
        axis.axvspan(raw.index[start], raw.index[end], color="#ff3366", alpha=0.2)
        axis.set(
            title=f"Whole-pose gap {event_number}: {relative_stem}",
            ylabel="normalized left-wrist x",
        )
        axis.legend(ncol=len(PROFILES), fontsize=7)
        c4_minus_b0 = (
            clean_by_profile["C4"]["LEFT_WRIST_x"]
            - clean_by_profile["B0"]["LEFT_WRIST_x"]
        )
        difference_axis.plot(
            c4_minus_b0.index[left:right],
            c4_minus_b0.iloc[left:right],
            color="#6a3d9a",
            linewidth=1.25,
        )
        difference_axis.axhline(0.0, color="black", linewidth=0.7, alpha=0.5)
        difference_axis.axvspan(
            raw.index[start], raw.index[end], color="#ff3366", alpha=0.2
        )
        difference_axis.set(
            xlabel="frame",
            ylabel="C4 − B0",
            title="Zero indicates equality; missing values remain blank",
        )
        difference_axis.title.set_fontsize(8)
        figure.tight_layout()
        output_name = f"gap_{event_number:02d}__{relative_stem.replace('/', '__')}.png"
        figure.savefig(plot_dir / output_name, dpi=150)
        plt.close(figure)
        selected.loc[event.name, "artifact"] = f"whole_pose_gap_plots/{output_name}"
    selected.to_csv(output_root / "whole_pose_gap_plot_selection.csv", index=False)


def run_experiment(
    corpus_root: Path,
    output_root: Path,
    max_files: int | None,
    max_plots: int,
    max_overlays: int,
    max_c2_review_cases: int,
) -> None:
    """Run all profiles and write reproducible CSV/JSON/PNG evidence."""

    if output_root.exists():
        raise FileExistsError(f"Output directory already exists; choose a unique path: {output_root}")
    output_root.mkdir(parents=True)
    included, exclusions, included_stems = _load_corpus_membership(corpus_root)
    included.to_csv(output_root / "included_clips.tsv", sep="\t", index=False)
    exclusions.to_csv(output_root / "excluded_clips.tsv", sep="\t", index=False)
    (output_root / "profiles.json").write_text(
        json.dumps(_profile_provenance(), indent=2)
        + "\n",
        encoding="utf-8",
    )

    quality_rows: list[dict[str, t.Any]] = []
    synthetic_rows: list[dict[str, t.Any]] = []
    natural_gap_rows: list[dict[str, t.Any]] = []
    whole_pose_gap_rows: list[dict[str, t.Any]] = []
    analyzed_stems: set[str] = set()
    for pose_data_type, raw_subdir in (
        (PoseDataType.pose2d, "pose2d"),
        (PoseDataType.holistic_3d, "holistic"),
    ):
        raw_root = corpus_root / "raw" / raw_subdir
        files = collect_pose_data_files(raw_root, pose_data_type, preferred_versions=("raw",))
        files = [
            path
            for path in files
            if relative_stem_from_pose_csv_path(path, raw_root, pose_data_type)
            in included_stems
        ]
        if max_files is not None:
            files = files[:max_files]
        for raw_path in files:
            relative_stem = relative_stem_from_pose_csv_path(raw_path, raw_root, pose_data_type)
            analyzed_stems.add(relative_stem)
            raw = pd.read_csv(raw_path, index_col="frame")
            natural_gap_rows.extend(_natural_gap_runs(raw, pose_data_type, relative_stem))
            whole_pose_gap_rows.extend(
                _whole_pose_gap_events(raw, pose_data_type, relative_stem)
            )
            baseline = preprocess_pose_dataframe(raw, pose_data_type, config=None)
            for profile, config in PROFILES.items():
                clean = baseline if config is None else preprocess_pose_dataframe(
                    raw, pose_data_type, config=config
                )
                quality_rows.append(
                    {
                        "profile": profile,
                        "pose_data_type": pose_data_type.value,
                        "file": relative_stem,
                        **_direct_quality_summary(clean, pose_data_type),
                        **_displacement_summary(
                            raw,
                            baseline,
                            clean,
                            pose_data_type,
                            min_visibility=0.5,
                        ),
                    }
                )
                if pose_data_type is PoseDataType.pose2d:
                    result = _synthetic_checks(raw, config, pose_data_type)
                    if result is not None:
                        synthetic_rows.append(
                            {"profile": profile, "file": relative_stem, **result}
                        )

    quality = pd.DataFrame(quality_rows)
    quality.to_csv(output_root / "pose_quality_by_file.csv", index=False)
    synthetic = pd.DataFrame(synthetic_rows)
    synthetic.to_csv(output_root / "synthetic_checks_by_file.csv", index=False)
    aggregate_columns = [
        "finite_coordinate_fraction",
        "usable_frame_fraction",
        "normalized_acceleration_p95",
        *[f"preprocess_{action}_landmark_count" for action in PREPROCESS_ACTIONS],
        "touched_coordinate_count",
        "touched_displacement_median",
        "touched_displacement_p95",
        "untouched_coordinate_count",
        "untouched_displacement_median",
        "untouched_displacement_p95",
    ]
    quality.groupby(["profile", "pose_data_type"])[aggregate_columns].agg(
        ["mean", "median", "sum"]
    ).to_csv(output_root / "pose_quality_aggregate.csv")
    if not synthetic.empty:
        synthetic.groupby("profile").agg(
            clips=("file", "count"),
            gap_recovery_rate=("gap_recovered", "mean"),
            gap_rmse_median=("gap_rmse_normalized", "median"),
            spike_replacement_rate=("spike_replaced", "mean"),
            spike_rmse_median=("spike_rmse_normalized", "median"),
            unprompted_outlier_actions=(
                "uncorrupted_span_unprompted_outlier_action_count",
                "sum",
            ),
            edge_gap_safety_rate=("edge_gap_unfilled", "mean"),
            internal_4_gap_safety_rate=("internal_4_gap_unfilled", "mean"),
            internal_15_gap_safety_rate=("internal_15_gap_unfilled", "mean"),
        ).to_csv(output_root / "synthetic_checks_aggregate.csv")
    natural_gaps = pd.DataFrame(natural_gap_rows)
    natural_gaps.to_csv(output_root / "natural_gap_runs.csv", index=False)
    if not natural_gaps.empty:
        natural_gaps.groupby(
            ["pose_data_type", "length_bin", "is_edge_gap"], dropna=False
        ).size().rename("run_count").to_csv(output_root / "natural_gap_runs_aggregate.csv")
    whole_pose_gaps = pd.DataFrame(whole_pose_gap_rows)
    whole_pose_gaps.to_csv(output_root / "whole_pose_gap_events.csv", index=False)
    _write_selected_plots(corpus_root, output_root, quality, max_plots)
    _write_overlay_contact_sheets(corpus_root, output_root, quality, max_overlays)
    _write_gap_event_plots(corpus_root, output_root, whole_pose_gaps)
    _write_c2_distortion_review(
        corpus_root,
        output_root,
        analyzed_stems,
        max_c2_review_cases,
    )
    (output_root / "run_provenance.json").write_text(
        json.dumps(
            {
                "created_utc": datetime.now(timezone.utc).isoformat(),
                "corpus_root": str(corpus_root.resolve()),
                "selection_manifest": str((corpus_root / "selection.tsv").resolve()),
                "exclusions_manifest": str((corpus_root / "exclusions.tsv").resolve()),
                "intended_included_clip_count": len(included),
                "excluded_clip_count": len(exclusions),
                "analyzed_clip_count": len(analyzed_stems),
                "analyzed_stems": sorted(analyzed_stems),
                "max_files_per_modality": max_files,
                "high_confidence_visibility_threshold": 0.5,
                "displacement_touch_scope": "frame-level: any cleanup action on frame",
                "c2_review_requested_case_count": max_c2_review_cases,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    """Parse CLI arguments and execute the experiment."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--max-files", type=int, default=None)
    parser.add_argument("--max-plots", type=int, default=6)
    parser.add_argument("--max-overlays", type=int, default=8)
    parser.add_argument("--max-c2-review-cases", type=int, default=8)
    args = parser.parse_args()
    run_experiment(
        args.corpus_root,
        args.output_root,
        args.max_files,
        args.max_plots,
        args.max_overlays,
        args.max_c2_review_cases,
    )


if __name__ == "__main__":
    main()
