"""Append a compact, source-backed batch for isolating cleanup operations.

This generator intentionally does not touch a live manifest or annotation
database.  Point it at a copy of a manifest, inspect the generated task
manifest and images, then let the experiment owner decide whether to replace
the served manifest.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import typing as t

import numpy as np
import pandas as pd

from dance_teacher_pose import PoseDataType, PosePreprocessingConfig, get_pose_data_schema
from dance_teacher_pose.preprocessing import PREPROCESS_ACTIONS
from motion_extraction.preprocess_pose_data import preprocess_pose_dataframe
from motion_extraction.scripts.run_preprocessing_experiment import (
    PROFILES,
    _c2_frame_scores,
    _json_scalar,
    _pose_pixels,
    _write_review_frame,
)


REFERENCE_STEMS = (
    "bartender",
    "last-christmas-tutorial",
    "mad-at-disney-tutorial",
    "pajamaparty-tutorial",
)

# These variants change exactly one family of operations relative to B0.  They
# are deliberately task-local, so the production B0--C4 profile definitions
# remain the primary experimental conditions.
ISOLATED_PROFILES: dict[str, PosePreprocessingConfig] = {
    "V1_visibility_mask": PosePreprocessingConfig(
        min_visibility=0.2, max_gap_frames=0, isolated_outlier_threshold=float("inf"),
        isolated_outlier_ratio=0.0, smoothing="none"
    ),
    "O1_outlier_replace": PosePreprocessingConfig(
        min_visibility=0.0, max_gap_frames=0, isolated_outlier_threshold=0.75,
        isolated_outlier_ratio=3.0, smoothing="none"
    ),
    "G1_short_gap_fill": PosePreprocessingConfig(
        min_visibility=0.0, max_gap_frames=3, isolated_outlier_threshold=float("inf"),
        isolated_outlier_ratio=0.0, smoothing="none"
    ),
    "S1_smoothing_only": PosePreprocessingConfig(
        min_visibility=0.0, max_gap_frames=0, isolated_outlier_threshold=float("inf"),
        isolated_outlier_ratio=0.0, smoothing="triangular3"
    ),
}


def _overlay(profile: str, clean: pd.DataFrame, position: int, artifact: str) -> dict[str, t.Any]:
    points = _pose_pixels(clean, position)
    return {
        "overlay_id": profile,
        "artifact": artifact,
        "keypoints": {name: [float(x), float(y)] for name, (x, y) in points.items()},
        "visibility": {
            name: float(clean[f"{name}_vis"].iloc[position])
            for name in sorted(points)
            if f"{name}_vis" in clean and np.isfinite(clean[f"{name}_vis"].iloc[position])
        },
    }


def _frame_quality(image: np.ndarray, raw: pd.DataFrame, position: int) -> dict[str, t.Any]:
    """Automatic evidence-quality candidates; the annotator remains authority."""
    gray = image.astype(float).mean(axis=2)
    vis_columns = [column for column in raw if column.endswith("_vis")]
    visibility = raw.iloc[position][vis_columns].to_numpy(dtype=float) if vis_columns else np.array([])
    median_visibility = float(np.nanmedian(visibility)) if np.isfinite(visibility).any() else float("nan")
    high_visibility_fraction = float(np.nanmean(visibility >= 0.5)) if visibility.size else float("nan")
    # This is a triage hint, not a claim about truth: dark/low-contrast frames
    # and frames with few confident landmarks should be inspected more closely.
    if (np.isfinite(median_visibility) and median_visibility < 0.25) or (np.isfinite(high_visibility_fraction) and high_visibility_fraction < 0.25):
        candidate = "weak"
    elif gray.mean() < 45 or gray.std() < 18 or median_visibility < 0.55:
        candidate = "constrained"
    else:
        candidate = "usable"
    def json_number(value: float, digits: int) -> float | None:
        return round(float(value), digits) if np.isfinite(value) else None

    return {
        "automatic_candidate": candidate,
        "mean_luminance_0_255": json_number(float(gray.mean()), 2),
        "luminance_contrast_sd": json_number(float(gray.std()), 2),
        "median_landmark_visibility": json_number(median_visibility, 4),
        "high_visibility_landmark_fraction": json_number(high_visibility_fraction, 4),
        "note": "Automatic triage only; confirm evidence quality from the source frame.",
    }


def _changed_positions(clean_a: pd.DataFrame, clean_b: pd.DataFrame, action: str | None = None) -> list[int]:
    if action is not None:
        column = f"preprocess_has_{action}"
        return np.flatnonzero(clean_b.get(column, pd.Series(0, index=clean_b.index)).to_numpy(dtype=int) > 0).tolist()
    fields = ("x", "y")
    roots = [column[:-2] for column in clean_a if column.endswith("_x") and f"{column[:-2]}_y" in clean_a]
    changed = np.zeros(len(clean_a), dtype=bool)
    for root in roots:
        a = clean_a[[f"{root}_{field}" for field in fields]].to_numpy(float)
        b = clean_b[[f"{root}_{field}" for field in fields]].to_numpy(float)
        changed |= np.isfinite(a).all(1) & np.isfinite(b).all(1) & (np.linalg.norm(a - b, axis=1) > 1e-7)
        changed |= np.isfinite(a).all(1) != np.isfinite(b).all(1)
    return np.flatnonzero(changed).tolist()


def _displacement_by_position(clean_a: pd.DataFrame, clean_b: pd.DataFrame) -> np.ndarray:
    """Mean normalized coordinate displacement, for ranking an isolated effect."""
    roots = [column[:-2] for column in clean_a if column.endswith("_x") and f"{column[:-2]}_y" in clean_a]
    values: list[np.ndarray] = []
    for root in roots:
        a = clean_a[[f"{root}_x", f"{root}_y"]].to_numpy(float)
        b = clean_b[[f"{root}_x", f"{root}_y"]].to_numpy(float)
        distance = np.linalg.norm(a - b, axis=1)
        distance[~(np.isfinite(a).all(1) & np.isfinite(b).all(1))] = np.nan
        values.append(distance)
    if not values:
        return np.full(len(clean_a), np.nan)
    stacked = np.asarray(values)
    counts = np.isfinite(stacked).sum(axis=0)
    totals = np.nansum(stacked, axis=0)
    return np.divide(totals, counts, out=np.full(len(clean_a), np.nan), where=counts > 0)


def _separated(candidates: list[tuple[str, int]], count: int, separation: int = 18) -> list[tuple[str, int]]:
    """Choose candidates separated within, but not across, source videos."""
    chosen: list[tuple[str, int]] = []
    for stem, position in candidates:
        if all(stem != old_stem or abs(position - previous) >= separation for old_stem, previous in chosen):
            chosen.append((stem, position))
        if len(chosen) == count:
            break
    return chosen


def _source_diverse(candidates: list[tuple[str, int]], count: int) -> list[tuple[str, int]]:
    """Prefer one event per source before accepting a second from any source."""
    first_pass: list[tuple[str, int]] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate[0] not in seen:
            first_pass.append(candidate)
            seen.add(candidate[0])
        if len(first_pass) == count:
            return first_pass
    return _separated(first_pass + candidates, count)


def _require_new_batch(manifest: dict[str, t.Any]) -> None:
    if "targeted_preprocessing_batch_design" in manifest or any(
        str(task.get("task_id", "")).startswith("targeted-preprocess-")
        for task in manifest.get("tasks", [])
    ):
        raise ValueError("manifest already contains the targeted preprocessing batch")


def append_targeted_preprocessing_tasks(
    manifest: dict[str, t.Any], corpus_root: Path, reference_video_root: Path, output_root: Path,
    participant_video_root: Path | None = None,
) -> tuple[dict[str, t.Any], pd.DataFrame]:
    """Render 18 deterministic targeted tasks and append them to a manifest."""
    _require_new_batch(manifest)
    import cv2

    raw_root = corpus_root / "raw" / "pose2d" / "reference"
    suffix = get_pose_data_schema(PoseDataType.pose2d).raw_suffix
    sources: dict[str, dict[str, t.Any]] = {}
    for stem in (*REFERENCE_STEMS, "attention_zoom_out"):
        raw_path = raw_root / f"{stem}{suffix}"
        video_path = reference_video_root / f"{stem}.mp4"
        if not raw_path.exists() or not video_path.exists():
            raise FileNotFoundError(f"Missing current raw pose or physical video for {stem}")
        raw = pd.read_csv(raw_path, index_col="frame")
        cleans = {name: preprocess_pose_dataframe(raw, PoseDataType.pose2d, config) for name, config in PROFILES.items()}
        cleans.update({name: preprocess_pose_dataframe(raw, PoseDataType.pose2d, config) for name, config in ISOLATED_PROFILES.items()})
        sources[stem] = {"raw": raw, "cleans": cleans, "video": video_path, "kind": "reference"}

    # C4 events are rare in the reference clips. Include current, physical
    # participant sources only as candidates for actual C4 repair events.
    if participant_video_root is not None:
        selection = pd.read_csv(corpus_root / "selection.tsv", sep="\t")
        exclusions = pd.read_csv(corpus_root / "exclusions.tsv", sep="\t")
        excluded_names = {Path(value).name for value in exclusions["source_video"]}
        physical_by_name = {path.name: path for path in participant_video_root.rglob("*.mp4")}
        for item in selection.to_dict("records"):
            corpus = str(item["corpus"])
            name = Path(str(item["source_video"])).name
            if corpus == "reference" or name in excluded_names:
                continue
            stem = f"{corpus}/{Path(name).stem}"
            raw_path = corpus_root / "raw" / "pose2d" / f"{stem}{suffix}"
            video_path = physical_by_name.get(name)
            if stem in sources or video_path is None or not raw_path.exists():
                continue
            raw = pd.read_csv(raw_path, index_col="frame")
            cleans = {name: preprocess_pose_dataframe(raw, PoseDataType.pose2d, config) for name, config in PROFILES.items()}
            cleans.update({name: preprocess_pose_dataframe(raw, PoseDataType.pose2d, config) for name, config in ISOLATED_PROFILES.items()})
            sources[stem] = {"raw": raw, "cleans": cleans, "video": video_path, "kind": "participant", "corpus": corpus}

    # 8 other-reference frames: one high B0/C2 disagreement and one ordinary
    # control from each previously unreviewed physical reference video.
    designs: list[dict[str, t.Any]] = []
    for stem in REFERENCE_STEMS:
        source = sources[stem]
        scores = _c2_frame_scores(source["raw"], source["cleans"]["B0"], source["cleans"]["C2"])
        if scores.empty:
            raise ValueError(f"No B0/C2 comparison candidates for {stem}")
        high = scores.sort_values("disagreement", ascending=False).iloc[0]
        ordinary = scores.iloc[(scores["disagreement"] - scores["disagreement"].median()).abs().argsort().iloc[0]]
        for category, row, title, instruction in (
            ("reference_high_disagreement", high, "Reference: smoothing contrast", "Adjust the skeleton to the source frame; this frame was selected because smoothing changes a visible joint."),
            ("reference_control", ordinary, "Reference: ordinary control", "Adjust the skeleton to the source frame; this ordinary frame checks whether cleanup changes an otherwise typical pose."),
        ):
            designs.append({"stem": stem, "position": int(row.frame_position), "category": category, "feature_variant": "C2_smoothing_context", "title": title, "instruction": instruction, "selection": {"joint": str(row.joint), "disagreement": float(row.disagreement)}})

    # Isolated C1 operations (2 visibility, 2 outlier) and two C2 smoothing
    # frames.  Action metadata guarantees an operation actually occurred.
    feature_specs = (
        ("visibility_masked", "V1_visibility_mask", 2, "C1 visibility masking", "Inspect low-confidence landmark evidence and whether masking is appropriate."),
        ("outlier_replaced", "O1_outlier_replace", 2, "C1 outlier replacement", "Inspect the apparent one-frame spike and whether replacement matches the source frame."),
        ("smoothed", "S1_smoothing_only", 2, "S1 smoothing only", "Inspect the source pose at this moment; this task isolates triangular smoothing without masking, gap filling, or outlier replacement."),
    )
    used: set[tuple[str, int]] = {(item["stem"], item["position"]) for item in designs}
    for action, variant, count, title, instruction in feature_specs:
        candidates: list[tuple[str, int]] = []
        for stem, source in sources.items():
            if source["kind"] != "reference":
                continue
            clean = source["cleans"][variant]
            for position in _changed_positions(clean, clean, action):
                if (stem, position) not in used:
                    candidates.append((stem, position))
        if variant == "S1_smoothing_only":
            # S1 modifies nearly every finite interior frame. Prioritize a
            # visible displacement and avoid giving both tasks to one source.
            displacement = {stem: _displacement_by_position(source["cleans"]["B0"], source["cleans"][variant]) for stem, source in sources.items() if source["kind"] == "reference"}
            candidates.sort(key=lambda item: float(np.nan_to_num(displacement[item[0]][item[1]], nan=-np.inf)), reverse=True)
            picks = _source_diverse(candidates, count)
        else:
            picks = _separated(candidates, count)
        if len(picks) != count:
            raise ValueError(f"Insufficient source-backed {action} events")
        for stem, position in picks:
            used.add((stem, position))
            designs.append({"stem": stem, "position": position, "category": f"isolated_{action}", "feature_variant": variant, "title": title, "instruction": instruction, "selection": {"action": action}})

    # C4 has a smaller two-frame gap limit.  Select actual interpolation events
    # where B0 and C4 differ, not merely a generic gap in the raw data.
    c4_candidates: list[tuple[str, int]] = []
    for stem, source in sources.items():
        for position in _changed_positions(source["cleans"]["B0"], source["cleans"]["C4"], "interpolated"):
            if position not in _changed_positions(source["cleans"]["B0"], source["cleans"]["C4"]):
                continue
            if (stem, position) not in used:
                c4_candidates.append((stem, position))
    picks = _source_diverse(c4_candidates, 4)
    if len(picks) != 4:
        raise ValueError("Insufficient actual C4 two-frame repair events")
    for stem, position in picks:
        used.add((stem, position))
        designs.append({"stem": stem, "position": position, "category": "c4_actual_short_gap_repair", "feature_variant": "C4_short_gap_repair", "title": "C4 short-gap repair", "instruction": "Inspect the source evidence and reconstruct the pose; C4 changes this frame through a natural short-gap interpolation.", "selection": {"action": "interpolated", "b0_c4_changed": True}})

    if len(designs) != 18:
        raise AssertionError(f"Expected 18 targeted tasks, got {len(designs)}")
    result = copy.deepcopy(manifest)
    next_priority = max(int(task["priority"]) for task in result["tasks"]) + 1
    artifact_root = output_root / "targeted_preprocessing_review"
    rows: list[dict[str, t.Any]] = []
    initializer_cycle = ("B0", "C1", "C2", "C3", "C4")
    for index, design in enumerate(designs, start=1):
        source = sources[design["stem"]]
        capture = cv2.VideoCapture(str(source["video"]))
        capture.set(cv2.CAP_PROP_POS_FRAMES, design["position"])
        ok, frame = capture.read()
        capture.release()
        if not ok:
            raise RuntimeError(f"Could not read {source['video']} frame {design['position']}")
        image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_dir = artifact_root / f"task_{index:02d}" / f"frame_{design['position']:05d}"
        source_path = frame_dir / "source.png"
        _write_review_frame(source_path, image)
        overlays = []
        for profile, clean in source["cleans"].items():
            overlay_path = frame_dir / f"{profile.lower()}.png"
            _write_review_frame(overlay_path, image, clean, design["position"])
            overlays.append(_overlay(profile, clean, design["position"], overlay_path.relative_to(output_root).as_posix()))
        raw = source["raw"]
        task = {
            "task_id": f"targeted-preprocess-{index:02d}-{design['stem']}-frame-{design['position']:05d}",
            "case_id": f"targeted-preprocess-{index:02d}", "task_type": "editable_pose_ground_truth",
            "priority": next_priority + index - 1, "category": design["category"], "targeted_preprocessing_batch": True,
            "task_title": design["title"], "task_instruction": design["instruction"], "feature_variant": design["feature_variant"],
            "source_grouping": {"kind": source["kind"], "video": design["stem"], "batch": "targeted_preprocessing", **({"corpus": source["corpus"]} if "corpus" in source else {})},
            "source_file": f"reference/{design['stem']}" if source["kind"] == "reference" else design["stem"],
            "frame_window": {"positions": [design["position"]], "labels": [_json_scalar(raw.index[design["position"]])], "center_position": design["position"], "center_label": _json_scalar(raw.index[design["position"]]), "parent_window_positions": [design["position"]], "parent_center_position": design["position"]},
            "selection_metrics": design["selection"], "requires_evidence_quality": True, "source_evidence_quality_candidate": _frame_quality(image, raw, design["position"]),
            "source_artifact": source_path.relative_to(output_root).as_posix(), "source_dimensions": {"width": int(image.shape[1]), "height": int(image.shape[0])},
            "overlays": overlays, "default_initial_profile": initializer_cycle[(index - 1) % len(initializer_cycle)],
        }
        result["tasks"].append(task)
        rows.append({"task_id": task["task_id"], "source": design["stem"], "position": design["position"], "category": design["category"], "feature_variant": design["feature_variant"], **_frame_quality(image, raw, design["position"])})
    result["targeted_preprocessing_batch_design"] = {
        "batch_id": "targeted-preprocessing-v1", "task_count": 18,
        "selection": "8 other-reference frames (high disagreement plus ordinary control per video); 6 action-verified isolated visibility/outlier/smoothing frames; 4 B0-to-C4 changed short-gap repair events.",
        "isolated_profiles": {name: {key: ("inf" if isinstance(value, float) and np.isinf(value) else value) for key, value in vars(config).items()} for name, config in ISOLATED_PROFILES.items()},
        "evidence_quality": "Automatic candidate metrics are task triage only; human source-evidence annotation remains required.",
        "initializer_cycle": list(initializer_cycle),
    }
    return result, pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--corpus-root", type=Path, required=True)
    parser.add_argument("--reference-video-root", type=Path, required=True)
    parser.add_argument("--participant-video-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    result, rows = append_targeted_preprocessing_tasks(manifest, args.corpus_root, args.reference_video_root, args.output_root, args.participant_video_root)
    args.output_manifest.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    rows.to_csv(args.output_root / "targeted_preprocessing_annotation_cases.csv", index=False)


if __name__ == "__main__":
    main()
