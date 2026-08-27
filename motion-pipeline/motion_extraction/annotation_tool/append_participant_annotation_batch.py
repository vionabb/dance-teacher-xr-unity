"""Append a compact, source-backed participant annotation batch to a manifest."""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import typing as t

import numpy as np
import pandas as pd

from motion_extraction.scripts.run_preprocessing_experiment import (
    PROFILES,
    _c2_frame_scores,
    _json_scalar,
    _pose_pixels,
    _write_review_frame,
)
from motion_extraction.preprocess_pose_data import preprocess_pose_dataframe
from dance_teacher_pose import PoseDataType, get_pose_data_schema


def _participant_rows(corpus_root: Path, participant_video_root: Path) -> pd.DataFrame:
    selection = pd.read_csv(corpus_root / "selection.tsv", sep="\t")
    exclusions = pd.read_csv(corpus_root / "exclusions.tsv", sep="\t")
    excluded = {Path(value).name for value in exclusions["source_video"]}
    physical_by_name = {path.name: path for path in participant_video_root.rglob("*.mp4")}
    rows: list[dict[str, t.Any]] = []
    for row in selection.to_dict("records"):
        if str(row["corpus"]) == "reference":
            continue
        name = Path(str(row["source_video"])).name
        if name in excluded:
            continue
        video = physical_by_name.get(name)
        if video is None:
            continue
        rows.append(
            {
                **row,
                "video_path": video,
                "relative_stem": f"{row['corpus']}/{Path(name).stem}",
            }
        )
    result = pd.DataFrame(rows)
    if result.empty:
        raise ValueError("No selected participant videos could be resolved")
    return result


def _profile_overlay(
    profile: str, clean: pd.DataFrame, position: int, artifact: str) -> dict[str, t.Any]:
    points = _pose_pixels(clean, position)
    landmarks = sorted(points)
    return {
        "overlay_id": profile,
        "artifact": artifact,
        "keypoints": {
            landmark: [float(x), float(y)] for landmark, (x, y) in points.items()
        },
        "visibility": {
            landmark: float(clean[f"{landmark}_vis"].iloc[position])
            for landmark in landmarks
            if f"{landmark}_vis" in clean
            and np.isfinite(clean[f"{landmark}_vis"].iloc[position])
        },
    }


def append_participant_batch(
    manifest: dict[str, t.Any],
    corpus_root: Path,
    participant_video_root: Path,
    output_root: Path,
    case_count: int = 12,
) -> tuple[dict[str, t.Any], pd.DataFrame]:
    """Select diverse participant cases, render frame artifacts, and append tasks."""

    if any(str(task["task_id"]).startswith("participant-cleanup-") for task in manifest["tasks"]):
        raise ValueError("manifest already contains participant annotation tasks")
    if case_count != 12:
        raise ValueError("this lightweight design uses exactly twelve participant cases")
    import cv2

    rows = _participant_rows(corpus_root, participant_video_root)
    raw_root = corpus_root / "raw" / "pose2d"
    suffix = get_pose_data_schema(PoseDataType.pose2d).raw_suffix
    score_rows: list[pd.DataFrame] = []
    pose_data: dict[str, tuple[pd.Series, pd.DataFrame, dict[str, pd.DataFrame]]] = {}
    for row in rows.itertuples(index=False):
        raw_path = raw_root / f"{row.relative_stem}{suffix}"
        if not raw_path.exists():
            continue
        capture = cv2.VideoCapture(str(row.video_path))
        readable = capture.isOpened()
        capture.release()
        if not readable:
            continue
        raw = pd.read_csv(raw_path, index_col="frame")
        cleans = {
            profile: preprocess_pose_dataframe(raw, PoseDataType.pose2d, config=config)
            for profile, config in PROFILES.items()
        }
        scores = _c2_frame_scores(raw, cleans["B0"], cleans["C2"])
        if scores.empty:
            continue
        scores["file"] = row.relative_stem
        scores["corpus"] = row.corpus
        scores["dance"] = row.dance
        scores["condition"] = row.condition
        score_rows.append(scores)
        pose_data[row.relative_stem] = (row, raw, cleans)
    if not score_rows:
        raise ValueError("No readable participant clips yielded eligible B0–C2 frames")
    all_scores = pd.concat(score_rows, ignore_index=True)

    high: list[pd.Series] = []
    high_quotas = {
        "study1_segmented": 3,
        "study2_segmented": 3,
        "study1_whole": 2,
    }
    for corpus, quota in high_quotas.items():
        candidates = all_scores[all_scores["corpus"] == corpus].sort_values(
            "disagreement", ascending=False
        )
        used_files: set[str] = set()
        for _, candidate in candidates.iterrows():
            if str(candidate["file"]) in used_files:
                continue
            high.append(candidate)
            used_files.add(str(candidate["file"]))
            if len(used_files) == quota:
                break
    if len(high) < 8:
        for _, candidate in all_scores.sort_values("disagreement", ascending=False).iterrows():
            if str(candidate["file"]) not in {str(item["file"]) for item in high}:
                high.append(candidate)
            if len(high) == 8:
                break
    high_frame_keys = {(str(item["file"]), int(item["frame_position"])) for item in high}
    ordinary_pool = all_scores[
        all_scores["disagreement"] <= all_scores["disagreement"].median()
    ].copy()
    ordinary_pool = ordinary_pool[
        ~ordinary_pool.apply(
            lambda row: (str(row["file"]), int(row["frame_position"])) in high_frame_keys,
            axis=1,
        )
    ]
    ordinary_pool = ordinary_pool[~ordinary_pool["file"].isin([item["file"] for item in high])]
    ordinary = ordinary_pool.sample(n=4, random_state=20260825)
    cases = [*[("high_disagreement", item) for item in high], *[("ordinary_control", item) for _, item in ordinary.iterrows()]]
    if len(cases) != case_count:
        raise ValueError("could not construct the requested participant case mix")

    output_root.mkdir(parents=True, exist_ok=True)
    artifact_dir = output_root / "participant_review"
    task_rows: list[dict[str, t.Any]] = []
    case_rows: list[dict[str, t.Any]] = []
    next_priority = max(int(task["priority"]) for task in manifest["tasks"]) + 1
    # Balance initialization across every candidate, including C4.  The
    # annotation record retains this provenance so a convenient initializer
    # cannot be mistaken for better preprocessing.
    initializer_cycle = ("B0", "C1", "C2", "C3", "C4")
    for case_index, (category, case) in enumerate(cases, start=1):
        relative_stem = str(case["file"])
        selection_row, raw, cleans = pose_data[relative_stem]
        center = int(case["frame_position"])
        positions = [center]
        capture = cv2.VideoCapture(str(selection_row.video_path))
        frames: dict[int, np.ndarray] = {}
        for position in positions:
            capture.set(cv2.CAP_PROP_POS_FRAMES, position)
            ok, frame = capture.read()
            if ok:
                frames[position] = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        capture.release()
        if len(frames) != len(positions):
            continue
        case_rows.append(
            {
                "case_id": case_index,
                "category": category,
                "source_file": relative_stem,
                "source_video": selection_row.video_path.relative_to(participant_video_root.parent).as_posix(),
                "corpus": selection_row.corpus,
                "dance": selection_row.dance,
                "condition": selection_row.condition,
                "center_position": center,
                "center_label": _json_scalar(raw.index[center]),
                "distal_joint": str(case["joint"]),
                "disagreement": float(case["disagreement"]),
                "visibility": float(case["visibility"]),
            }
        )
        for position in positions:
            frame_dir = artifact_dir / f"case_{case_index:02d}" / f"frame_{position:05d}"
            source_path = frame_dir / "source.png"
            _write_review_frame(source_path, frames[position])
            overlays: list[dict[str, t.Any]] = []
            for profile, clean in cleans.items():
                overlay_path = frame_dir / f"{profile.lower()}.png"
                _write_review_frame(overlay_path, frames[position], clean, position)
                overlays.append(
                    _profile_overlay(
                        profile,
                        clean,
                        position,
                        overlay_path.relative_to(output_root).as_posix(),
                    )
                )
            task_rows.append(
                {
                    "task_id": f"participant-cleanup-{case_index:02d}-frame-{position:05d}",
                    "case_id": f"participant-{case_index:02d}",
                    "task_type": "editable_pose_ground_truth",
                    "priority": next_priority + len(task_rows),
                    "category": category,
                    "participant_batch": True,
                    "source_file": relative_stem,
                    "source_corpus": selection_row.corpus,
                    "source_dance": selection_row.dance,
                    "source_condition": selection_row.condition,
                    "frame_window": {
                        "positions": [position],
                        "labels": [_json_scalar(raw.index[position])],
                        "center_position": position,
                        "center_label": _json_scalar(raw.index[position]),
                        "parent_window_positions": positions,
                        "parent_center_position": center,
                    },
                    "selection_metrics": {
                        "distal_joint": str(case["joint"]),
                        "visibility": float(case["visibility"]),
                        "frame_disagreement_normalized": float(case["disagreement"]),
                    },
                    "source_artifact": source_path.relative_to(output_root).as_posix(),
                    "source_dimensions": {
                        "width": int(frames[position].shape[1]),
                        "height": int(frames[position].shape[0]),
                    },
                    "overlays": overlays,
                    "default_initial_profile": initializer_cycle[(case_index - 1) % len(initializer_cycle)],
                }
            )
    if len(case_rows) != case_count:
        raise ValueError("not all selected participant cases yielded complete source frames")
    result = copy.deepcopy(manifest)
    result["tasks"].extend(task_rows)
    result["participant_batch_design"] = {
        "source": "physical data/participant_motions files matched by selected basename",
        "case_count": len(case_rows),
        "frames_per_case": 1,
        "case_mix": "eight high-disagreement cases (three study1_segmented, three study2_segmented, two study1_whole) plus four ordinary controls",
        "default_initializers": list(initializer_cycle),
    }
    return result, pd.DataFrame(case_rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--corpus-root", type=Path, required=True)
    parser.add_argument("--participant-video-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    result, cases = append_participant_batch(
        manifest, args.corpus_root, args.participant_video_root, args.output_root
    )
    args.output_manifest.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    cases.to_csv(args.output_root / "participant_annotation_cases.csv", index=False)


if __name__ == "__main__":
    main()
