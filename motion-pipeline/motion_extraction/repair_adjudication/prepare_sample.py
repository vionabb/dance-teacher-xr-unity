"""Draw the sealed, blinded first-pass sample for repair adjudication (v2).

Reads a frozen manual-review release (manifest, judgment database snapshot,
raw 2D poses), applies :mod:`isolated_jump` to every reviewed segment, and
writes a new private bundle that must never be committed::

    <output-root>/blinded/first_pass_manifest.json   # served to the reviewer
    <output-root>/sealed/pool.json                    # every flagged position
    <output-root>/sealed/first_pass_answer_key.json   # stratum, proposal, rule values
    <output-root>/selection_summary.json              # aggregate counts and hashes only

Positions with a saved human correction are used only to evaluate the rule
and are never sampled. The first pass is a stratified simple random sample:
24 unmarked arm/shoulder flags, 12 unmarked hip flags, and 12 unmarked,
unflagged positions where the rule was computable. Inclusion probability is
``n / N`` within each stratum. Case order and blind IDs are shuffled. The
output root must not exist, so a frozen sample is never overwritten.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from collections import Counter
from pathlib import Path
import random
import sqlite3
import typing as t

from motion_extraction.repair_adjudication.isolated_jump import (
    ARM_LANDMARKS,
    HIP_LANDMARKS,
    UPPER_BODY_LANDMARKS,
    evaluate_segment,
)

STRATA = {"arm_flag": 24, "hip_flag": 12, "control": 12}
DEFAULT_SEED = 20261106
DATA_DIR_MARKER = "code-ai-motion-coach/data/"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _canonical_sha256(value: t.Any) -> tuple[bytes, str]:
    data = (json.dumps(value, indent=1, sort_keys=True) + "\n").encode("utf-8")
    return data, hashlib.sha256(data).hexdigest()


def _read_pose(path: Path) -> dict[int, dict[str, float]]:
    rows: dict[int, dict[str, float]] = {}
    with path.open(newline="") as stream:
        for row in csv.DictReader(stream):
            rows[int(float(row["frame"]))] = {
                key: float(value) if value not in ("", "nan", "NaN") else math.nan
                for key, value in row.items()
                if key != "frame"
            }
    return rows


def collect_positions(release_root: Path, release_id: str) -> tuple[list[dict[str, t.Any]], dict[str, t.Any]]:
    """Apply the rule to every reviewed segment of a frozen release.

    Verifies the database snapshot and every raw pose against the release
    hashes. Returns per-position records (with segment provenance and any
    saved correction) and the input provenance.
    """

    manifest_path = release_root / "releases" / release_id / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    by_source = {source["source_id"]: source for source in manifest["source_databases"]}
    videos = {item["raw_pose_sha256"]: item for item in manifest["archived_raw_poses"]}
    connections: dict[str, sqlite3.Connection] = {}
    positions: list[dict[str, t.Any]] = []
    mark_counts = Counter()
    for segment in manifest["reviewed_segments"]:
        source = by_source[segment["source_id"]]
        if segment["source_id"] not in connections:
            database = release_root / source["snapshot_blob_path"]
            if _sha256(database) != source["snapshot_sha256"]:
                raise ValueError(f"database snapshot hash mismatch: {database}")
            connections[segment["source_id"]] = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
        pose_path = release_root / segment["raw_pose_path"]
        if _sha256(pose_path) != segment["raw_pose_sha256"]:
            raise ValueError(f"raw pose hash mismatch: {pose_path}")
        row = connections[segment["source_id"]].execute(
            "SELECT frame_usability_response_json FROM judgment_revisions WHERE revision_id = ?",
            (segment["revision_id"],),
        ).fetchone()
        response = json.loads(row[0])
        unusable = {int(frame) for frame, label in (response.get("labels") or {}).items() if label == "unusable"}
        corrections: dict[tuple[str, int], list[float]] = {}
        for mark in response.get("marks") or []:
            for frame, xy in (mark.get("positions") or {}).items():
                mark_counts["saved"] += 1
                if mark["body_part"] not in UPPER_BODY_LANDMARKS:
                    mark_counts["outside_upper_body"] += 1
                elif int(frame) in unusable:
                    mark_counts["on_unusable_frame"] += 1
                else:
                    corrections[(mark["body_part"], int(frame))] = [float(xy[0]), float(xy[1])]
        pose = _read_pose(pose_path)
        start, end = segment["source_frame_start"], segment["source_frame_end_exclusive"]
        video = videos[segment["raw_pose_sha256"]]
        original = video["source_video_original_path"]
        if DATA_DIR_MARKER not in original:
            raise ValueError(f"cannot place source video under the data directory: {original}")
        records = evaluate_segment([pose.get(start + i) for i in range(end - start)], unusable)
        frame_points: dict[int, dict[str, list[float]]] = {}
        for record in records:
            frame_points.setdefault(record["frame"], {})[record["landmark"]] = record["xy"]
        for record in records:
            record.update(
                segment_id=segment["segment_id"],
                recording_id=segment["recording_id"],
                task_id=segment["task_id"],
                corpus=segment["source_corpus"],
                source_frame=start + record["frame"],
                video=original.split(DATA_DIR_MARKER, 1)[1],
                video_sha256=video["source_video_sha256"],
                correction=corrections.get((record["landmark"], record["frame"])),
                # Other finite upper-body landmarks on the same frame, drawn grey.
                context={
                    name: xy for name, xy in frame_points[record["frame"]].items() if name != record["landmark"]
                },
            )
        positions.extend(records)
    provenance = {
        "release_id": release_id,
        "release_manifest_sha256": _sha256(manifest_path),
        "database_snapshot_sha256": sorted({s["snapshot_sha256"] for s in manifest["source_databases"] if s["source_id"] in connections}),
        "reviewed_segments": len(manifest["reviewed_segments"]),
        "saved_corrections": mark_counts["saved"],
        "corrections_outside_upper_body": mark_counts["outside_upper_body"],
        "corrections_on_unusable_frames": mark_counts["on_unusable_frame"],
    }
    return positions, provenance


def rule_evaluation(positions: list[dict[str, t.Any]]) -> dict[str, t.Any]:
    """Aggregate the rule's effect on saved corrections and unmarked positions."""

    marked = [p for p in positions if p["correction"] is not None]
    flagged_marked = [p for p in marked if p["flagged"]]

    def distance(a, b, torso):
        return math.dist(a, b) / torso

    closer = sum(
        distance(p["midpoint"], p["correction"], p["torso"]) < distance(p["xy"], p["correction"], p["torso"])
        for p in flagged_marked
    )
    before = [distance(p["xy"], p["correction"], p["torso"]) for p in marked]
    after = [
        distance(p["midpoint"] if p["flagged"] else p["xy"], p["correction"], p["torso"]) for p in marked
    ]
    unmarked_flags = [p for p in positions if p["flagged"] and p["correction"] is None]
    moves = sorted(distance(p["xy"], p["midpoint"], p["torso"]) for p in unmarked_flags)
    return {
        "positions": len(positions),
        "marked_targets": len(marked),
        "flagged_marked": len(flagged_marked),
        "flagged_marked_closer": int(closer),
        "flagged_marked_by_joint": dict(sorted(Counter(p["landmark"] for p in flagged_marked).items())),
        "mean_target_distance_all_marked_before_after": [
            round(sum(before) / len(before), 3),
            round(sum(after) / len(after), 3),
        ] if marked else None,
        "flagged_unmarked": len(unmarked_flags),
        "flagged_unmarked_by_joint": dict(sorted(Counter(p["landmark"] for p in unmarked_flags).items())),
        "flagged_unmarked_move_mean": round(sum(moves) / len(moves), 3) if moves else None,
    }


def _stratum(position: dict[str, t.Any]) -> str | None:
    if position["correction"] is not None:
        return None
    if position["flagged"]:
        return "arm_flag" if position["landmark"] in ARM_LANDMARKS else "hip_flag"
    if "residual" in position:
        return "control"
    return None


def draw_sample(
    positions: list[dict[str, t.Any]],
    video_info: dict[str, dict[str, float]],
    seed: int = DEFAULT_SEED,
) -> dict[str, t.Any]:
    """Draw the stratified first pass and build the blinded and sealed documents.

    ``video_info`` maps a source-video sha256 to ``{"fps", "width", "height"}``
    measured from the actual file; tracked pixel points are normalized by it.
    """

    rng = random.Random(seed)
    strata: dict[str, list[dict[str, t.Any]]] = {name: [] for name in STRATA}
    for position in positions:
        name = _stratum(position)
        if name is not None:
            strata[name].append(position)
    key = lambda p: (p["segment_id"], p["frame"], p["landmark"])  # noqa: E731
    chosen: list[tuple[str, dict[str, t.Any]]] = []
    for name, size in STRATA.items():
        population = sorted(strata[name], key=key)
        if len(population) < size:
            raise ValueError(f"stratum {name} has only {len(population)} positions")
        chosen.extend((name, p) for p in rng.sample(population, size))
    rng.shuffle(chosen)
    blinded, answers = [], []
    for index, (name, position) in enumerate(chosen, start=1):
        info = video_info[position["video_sha256"]]
        width, height = float(info["width"]), float(info["height"])

        def normalize(xy):
            return [round(xy[0] / width, 6), round(xy[1] / height, 6)]

        blind_id = f"V2-{index:02d}"
        blinded.append(
            {
                "blind_id": blind_id,
                "video": position["video"],
                "frame_index": position["source_frame"],
                "fps": float(info["fps"]),
                "landmark": position["landmark"],
                "point": normalize(position["xy"]),
                "context_points": {k: normalize(v) for k, v in sorted(position["context"].items())},
            }
        )
        answers.append(
            {
                "blind_id": blind_id,
                "stratum": name,
                "inclusion_probability": STRATA[name] / len(strata[name]),
                "landmark": position["landmark"],
                "segment_id": position["segment_id"],
                "recording_id": position["recording_id"],
                "task_id": position["task_id"],
                "corpus": position["corpus"],
                "source_frame": position["source_frame"],
                "video": position["video"],
                "video_sha256": position["video_sha256"],
                "xy_pixels": position["xy"],
                "midpoint_pixels": position.get("midpoint"),
                "residual": position.get("residual"),
                "neighbor_gap": position.get("neighbor_gap"),
                "torso_pixels": position["torso"],
                "flagged": position["flagged"],
            }
        )
    population_sizes = {name: len(items) for name, items in strata.items()}
    pool = sorted(
        (
            {k: p.get(k) for k in ("segment_id", "recording_id", "corpus", "landmark", "source_frame", "xy", "midpoint", "residual", "neighbor_gap", "torso")}
            for p in strata["arm_flag"] + strata["hip_flag"]
        ),
        key=lambda p: (p["segment_id"], p["source_frame"], p["landmark"]),
    )
    return {
        "blinded": {"protocol": "repair-adjudication-v2-first-pass", "cases": blinded},
        "answer_key": {"seed": seed, "population_sizes": population_sizes, "cases": answers},
        "pool": {"population_sizes": population_sizes, "flagged_unmarked": pool},
        "population_sizes": population_sizes,
        "selected": [(name, p) for name, p in chosen],
    }


def main() -> None:
    """Write a new private v2 adjudication bundle; refuse to overwrite one."""

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--release-root", type=Path, required=True)
    parser.add_argument("--release-id", default="20261002-first-manual-review")
    parser.add_argument("--video-info", type=Path, required=True, help="JSON: video sha256 -> {fps, width, height}")
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args()
    if args.output_root.exists():
        parser.error(f"{args.output_root} exists; a frozen sample is never overwritten")
    positions, provenance = collect_positions(args.release_root, args.release_id)
    video_info = json.loads(args.video_info.read_text(encoding="utf-8"))
    sample = draw_sample(positions, video_info, args.seed)
    (args.output_root / "blinded").mkdir(parents=True)
    (args.output_root / "sealed").mkdir()
    blinded_bytes, blinded_sha = _canonical_sha256(sample["blinded"])
    key_bytes, key_sha = _canonical_sha256(sample["answer_key"])
    pool_bytes, pool_sha = _canonical_sha256(sample["pool"])
    (args.output_root / "blinded" / "first_pass_manifest.json").write_bytes(blinded_bytes)
    (args.output_root / "sealed" / "first_pass_answer_key.json").write_bytes(key_bytes)
    (args.output_root / "sealed" / "pool.json").write_bytes(pool_bytes)
    selected = sample["selected"]
    summary = {
        "note": "Aggregate counts only. The blinded manifest and sealed files hold participant-derived frames and coordinates; never commit them.",
        "rule": "motion_extraction.repair_adjudication.isolated_jump (rule v2)",
        "seed": args.seed,
        "input": provenance,
        "rule_evaluation": rule_evaluation(positions),
        "population_sizes": sample["population_sizes"],
        "first_pass": {
            "count": len(selected),
            "by_stratum": dict(Counter(name for name, _ in selected)),
            "by_joint": dict(sorted(Counter(p["landmark"] for _, p in selected).items())),
            "by_corpus": dict(sorted(Counter(p["corpus"] for _, p in selected).items())),
            "distinct_segments": len({p["segment_id"] for _, p in selected}),
            "distinct_recordings": len({p["recording_id"] for _, p in selected}),
            "inclusion_probability": {name: STRATA[name] / n for name, n in sample["population_sizes"].items()},
        },
        "blinded_first_pass_sha256": blinded_sha,
        "first_pass_answer_key_sha256": key_sha,
        "pool_sha256": pool_sha,
        "video_info_sha256": _sha256(args.video_info),
    }
    (args.output_root / "selection_summary.json").write_text(json.dumps(summary, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("rule_evaluation", "population_sizes", "blinded_first_pass_sha256")}, indent=1))


if __name__ == "__main__":
    main()
