"""Generate blinded, source-backed temporal pose-comparison tasks."""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import random
import shutil
import subprocess
import typing as t

import cv2
import numpy as np
import pandas as pd

from dance_teacher_pose import (
    PoseDataType,
    get_pose_data_schema,
    preprocess_pose_dataframe,
)
from motion_extraction.scripts.run_c4_smoothing_grid import _candidate_config
from motion_extraction.scripts.run_preprocessing_experiment import (
    POSE_EDGES,
    _pose_pixels,
    _visible_roots,
)


PROFILES: tuple[tuple[str, float], ...] = (
    ("C4", 0.0),
    ("C4+a=.01", 0.01),
    ("C4+a=.02", 0.02),
)
CANDIDATE_IDS = ("A", "B", "C")
WINDOW_SECONDS = 3.0


def _sha256(path: Path) -> str:
    """Return a file digest for task-selection provenance."""

    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require_encoder() -> str:
    """Return ffmpeg after confirming browser-compatible H.264 support."""

    executable = shutil.which("ffmpeg")
    if executable is None:
        raise RuntimeError(
            "ffmpeg is required to generate temporal comparison MP4 files"
        )
    result = subprocess.run(
        [executable, "-hide_banner", "-encoders"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or "libx264" not in result.stdout:
        raise RuntimeError(
            "ffmpeg with the libx264 encoder is required for browser-compatible MP4 output"
        )
    return executable


def _resolve_video(
    relative_stem: str, kind: str, reference_root: Path, participant_root: Path
) -> Path:
    """Resolve one selected corpus member without relying on stored private paths."""

    root = reference_root if kind == "reference" else participant_root
    relative = Path(relative_stem)
    if kind == "reference" and relative.parts[:1] == ("reference",):
        relative = Path(*relative.parts[1:])
    candidates = [root / relative.with_suffix(".mp4"), root / f"{relative.name}.mp4"]
    candidates.extend(sorted(root.rglob(f"{relative.name}.mp4")))
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError(
        f"required {kind} source video is unavailable for {relative_stem} under {root}"
    )


def _frame_scores(
    cleans: dict[str, pd.DataFrame], window_frames: int
) -> tuple[np.ndarray, np.ndarray]:
    """Return local artifact-removal and attenuation-risk scores per frame."""

    roots = _visible_roots(cleans["C4"], ("x", "y"))
    if not roots:
        raise ValueError("pose input has no complete visible 2D landmark roots")
    arrays = {
        name: np.stack(
            [
                clean[[f"{root}_x", f"{root}_y"]].to_numpy(dtype=float)
                for root in roots
            ],
            axis=1,
        )
        for name, clean in cleans.items()
    }
    baseline = arrays["C4"]
    strongest = arrays["C4+a=.02"]
    speed = np.linalg.norm(np.diff(baseline, axis=0), axis=2)
    acceleration = np.linalg.norm(np.diff(baseline, n=2, axis=0), axis=2)
    candidate_acceleration = np.linalg.norm(
        np.diff(strongest, n=2, axis=0), axis=2
    )
    displacement = np.linalg.norm(strongest - baseline, axis=2)
    artifact = np.zeros(len(baseline))
    attenuation = np.zeros(len(baseline))
    if len(baseline) >= 3:
        artifact[1:-1] = np.nanmean(
            np.maximum(0.0, acceleration - candidate_acceleration), axis=1
        )
    if len(baseline) >= 2:
        frame_speed = np.zeros(len(baseline))
        frame_speed[1:] = np.nanmean(speed, axis=1)
        attenuation = frame_speed * np.nanmean(displacement, axis=1)
    radius = max(1, window_frames // 4)
    kernel = np.ones(2 * radius + 1) / (2 * radius + 1)
    artifact = np.convolve(np.nan_to_num(artifact), kernel, mode="same")
    attenuation = np.convolve(np.nan_to_num(attenuation), kernel, mode="same")
    return artifact, attenuation


def _source_candidates(
    corpus_root: Path,
    numerical_output: Path,
    reference_video_root: Path,
    participant_video_root: Path,
) -> list[dict[str, t.Any]]:
    """Load source-backed best windows for both temporal review purposes."""

    by_clip_path = numerical_output / "numerical_by_clip.csv"
    included_path = numerical_output / "included_clips.tsv"
    if not by_clip_path.is_file() or not included_path.is_file():
        raise FileNotFoundError(
            "numerical output must contain numerical_by_clip.csv and included_clips.tsv"
        )
    numerical = pd.read_csv(by_clip_path)
    required_columns = {
        "neighbor_weight",
        "pose_data_type",
        "file",
        "high_frequency_energy_reduction_vs_c4",
        "peak_speed_retention_vs_c4",
    }
    if not required_columns.issubset(numerical):
        raise ValueError(
            f"numerical_by_clip.csv is missing columns: {sorted(required_columns - set(numerical))}"
        )
    numerical = numerical[
        (numerical["pose_data_type"] == "pose2d")
        & np.isclose(numerical["neighbor_weight"], 0.02)
    ].set_index("file")
    included = pd.read_csv(included_path, sep="\t")
    suffix = get_pose_data_schema(PoseDataType.pose2d).raw_suffix
    candidates: list[dict[str, t.Any]] = []
    for record in included.to_dict("records"):
        stem = str(record["relative_stem"])
        if stem not in numerical.index:
            continue
        kind = "reference" if str(record["corpus"]) == "reference" else "participant"
        raw_path = corpus_root / "raw" / "pose2d" / f"{stem}{suffix}"
        if not raw_path.is_file():
            raise FileNotFoundError(f"required raw pose input is unavailable: {raw_path}")
        video_path = _resolve_video(
            stem, kind, reference_video_root, participant_video_root
        )
        capture = cv2.VideoCapture(str(video_path))
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        capture.release()
        if not np.isfinite(fps) or fps <= 0 or frame_count <= 0:
            raise RuntimeError(f"could not read video timing metadata: {video_path}")
        raw = pd.read_csv(raw_path, index_col="frame")
        usable_count = min(len(raw), frame_count)
        if usable_count < 6:
            continue
        raw = raw.iloc[:usable_count]
        cleans = {
            name: preprocess_pose_dataframe(
                raw, PoseDataType.pose2d, _candidate_config(weight)
            )
            for name, weight in PROFILES
        }
        window_frames = max(6, min(usable_count, round(WINDOW_SECONDS * fps)))
        if window_frames % 2:
            window_frames += 1
        window_frames = min(window_frames, usable_count)
        artifact, attenuation = _frame_scores(cleans, window_frames)
        margin = window_frames // 2
        eligible = np.arange(margin, usable_count - (window_frames - margin) + 1)
        if not len(eligible):
            continue
        clip_metrics = numerical.loc[stem]
        for category, values, clip_factor in (
            (
                "artifact_rich",
                artifact,
                1.0
                + max(
                    0.0,
                    float(clip_metrics["high_frequency_energy_reduction_vs_c4"]),
                ),
            ),
            (
                "attenuation_risk",
                attenuation,
                1.0
                + max(
                    0.0, 1.0 - float(clip_metrics["peak_speed_retention_vs_c4"])
                ),
            ),
        ):
            center = int(eligible[np.argmax(values[eligible])])
            start = center - margin
            end = start + window_frames
            candidates.append(
                {
                    "relative_stem": stem,
                    "kind": kind,
                    "video_path": video_path,
                    "raw_path": raw_path,
                    "raw": raw,
                    "cleans": cleans,
                    "fps": fps,
                    "start_frame": start,
                    "end_frame": end,
                    "center_frame": center,
                    "selection_category": category,
                    "selection_score": float(values[center] * clip_factor),
                    "selection_reason": str(record.get("selection_reason", "")),
                    "corpus": str(record.get("corpus", "")),
                    "dance": str(record.get("dance", "")),
                    "condition": str(record.get("condition", "")),
                }
            )
    if not candidates:
        raise ValueError("no source-backed temporal windows could be selected")
    return candidates


def _select_diverse_windows(
    candidates: list[dict[str, t.Any]], count: int, seed: int
) -> list[dict[str, t.Any]]:
    """Prefer both source kinds and both temporal-risk categories."""

    rng = random.Random(seed)
    decorated = [(rng.random(), item) for item in candidates]
    ordered = [
        item
        for _, item in sorted(
            decorated, key=lambda pair: (-pair[1]["selection_score"], pair[0])
        )
    ]
    wishes = [
        ("reference", "artifact_rich"),
        ("participant", "attenuation_risk"),
        ("participant", "artifact_rich"),
        ("reference", "attenuation_risk"),
    ]
    selected: list[dict[str, t.Any]] = []
    used_windows: set[tuple[str, int, int]] = set()
    used_sources: set[str] = set()

    def add_best(kind: str | None, category: str | None) -> bool:
        pools = (
            [item for item in ordered if item["relative_stem"] not in used_sources],
            ordered,
        )
        for pool in pools:
            for item in pool:
                key = (
                    item["relative_stem"],
                    item["start_frame"],
                    item["end_frame"],
                )
                if key in used_windows:
                    continue
                if kind and item["kind"] != kind:
                    continue
                if category and item["selection_category"] != category:
                    continue
                selected.append(item)
                used_windows.add(key)
                used_sources.add(item["relative_stem"])
                return True
        return False

    for kind, category in wishes:
        if len(selected) == count:
            break
        add_best(kind, category)
    while len(selected) < count and add_best(None, None):
        pass
    if len(selected) != count:
        raise ValueError(
            f"need {count} unique temporal windows but only found {len(selected)}"
        )
    rng.shuffle(selected)
    return selected


def _encode_frames(
    ffmpeg: str,
    output: Path,
    frames: t.Iterable[np.ndarray],
    width: int,
    height: int,
    fps: float,
) -> None:
    """Encode BGR frames as fast-start H.264/yuv420p MP4."""

    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-s",
        f"{width}x{height}",
        "-r",
        f"{fps:.8f}",
        "-i",
        "pipe:0",
        "-an",
        "-vf",
        "pad=ceil(iw/2)*2:ceil(ih/2)*2",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdin is not None
    assert process.stderr is not None
    try:
        for frame in frames:
            process.stdin.write(np.ascontiguousarray(frame).tobytes())
        process.stdin.close()
        stderr = process.stderr.read().decode("utf-8", errors="replace")
        return_code = process.wait()
    except Exception:
        process.kill()
        process.wait()
        raise
    if return_code != 0:
        raise RuntimeError(f"ffmpeg failed while writing {output}: {stderr.strip()}")


def _draw_pose(frame: np.ndarray, points: dict[str, tuple[float, float]]) -> np.ndarray:
    """Draw a high-contrast pose overlay on a source frame."""

    rendered = frame.copy()
    for start, end in POSE_EDGES:
        if start not in points or end not in points:
            continue
        a = tuple(round(value) for value in points[start])
        b = tuple(round(value) for value in points[end])
        cv2.line(rendered, a, b, (40, 235, 198), 3, cv2.LINE_AA)
    for point in points.values():
        cv2.circle(
            rendered,
            tuple(round(value) for value in point),
            4,
            (20, 40, 245),
            -1,
            cv2.LINE_AA,
        )
    return rendered


def _render_unique_media(
    window: dict[str, t.Any],
    task_dir: Path,
    order: list[str],
    ffmpeg: str,
) -> tuple[str, dict[str, str]]:
    """Render synchronized source and anonymized candidate videos."""

    capture = cv2.VideoCapture(str(window["video_path"]))
    capture.set(cv2.CAP_PROP_POS_FRAMES, window["start_frame"])
    frames: list[np.ndarray] = []
    for _ in range(window["start_frame"], window["end_frame"]):
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    expected = window["end_frame"] - window["start_frame"]
    if len(frames) != expected:
        raise RuntimeError(
            f"could not read complete window from {window['video_path']}: "
            f"expected {expected} frames, got {len(frames)}"
        )
    height, width = frames[0].shape[:2]
    source_path = task_dir / "source.mp4"
    _encode_frames(ffmpeg, source_path, iter(frames), width, height, window["fps"])
    artifacts: dict[str, str] = {}
    profile_by_name = {name: window["cleans"][name] for name, _ in PROFILES}
    for candidate_id, profile_name in zip(CANDIDATE_IDS, order):
        candidate_path = task_dir / f"candidate_{candidate_id}.mp4"
        clean = profile_by_name[profile_name]
        rendered = (
            _draw_pose(frame, _pose_pixels(clean, position))
            for position, frame in zip(
                range(window["start_frame"], window["end_frame"]), frames
            )
        )
        _encode_frames(
            ffmpeg, candidate_path, rendered, width, height, window["fps"]
        )
        artifacts[candidate_id] = candidate_path.as_posix()
    return source_path.as_posix(), artifacts


def generate_temporal_comparison_tasks(
    corpus_root: Path,
    numerical_output: Path,
    reference_video_root: Path,
    participant_video_root: Path,
    output_root: Path,
    seed: int,
    task_count: int = 6,
) -> tuple[Path, Path]:
    """Generate a blinded task manifest and a sibling private answer-key CSV."""

    if task_count < 3:
        raise ValueError("task_count must be at least 3")
    if output_root.exists():
        raise FileExistsError(f"output root already exists: {output_root}")
    answer_key_path = output_root.with_name(f"{output_root.name}-answer-key.csv")
    if answer_key_path.exists():
        raise FileExistsError(f"answer key already exists: {answer_key_path}")
    for required in (
        corpus_root,
        numerical_output,
        reference_video_root,
        participant_video_root,
    ):
        if not required.is_dir():
            raise FileNotFoundError(f"required input directory is unavailable: {required}")
    ffmpeg = _require_encoder()
    repeat_count = min(2, task_count // 3)
    unique_count = task_count - repeat_count
    candidates = _source_candidates(
        corpus_root,
        numerical_output,
        reference_video_root,
        participant_video_root,
    )
    windows = _select_diverse_windows(candidates, unique_count, seed)
    rng = random.Random(seed)
    output_root.mkdir(parents=True)
    tasks: list[dict[str, t.Any]] = []
    keys: list[dict[str, t.Any]] = []
    unique_details: list[dict[str, t.Any]] = []

    def append_task(
        task_id: str,
        priority: int,
        window: dict[str, t.Any],
        order: list[str],
        source_artifact: str,
        candidate_artifacts: dict[str, str],
        repeat_of: str = "",
    ) -> None:
        relative_source = Path(source_artifact).relative_to(output_root).as_posix()
        task = {
            "task_id": task_id,
            "case_id": f"temporal-{priority:02d}",
            "task_type": "temporal_pose_comparison",
            "priority": priority,
            "category": window["selection_category"],
            "source_video": relative_source,
            "candidates": [
                {
                    "candidate_id": candidate_id,
                    "artifact": Path(candidate_artifacts[candidate_id])
                    .relative_to(output_root)
                    .as_posix(),
                }
                for candidate_id in CANDIDATE_IDS
            ],
            "frame_window": {
                "start_position": window["start_frame"],
                "end_position_exclusive": window["end_frame"],
                "center_position": window["center_frame"],
                "fps": window["fps"],
            },
            "source_provenance": {
                "relative_stem": window["relative_stem"],
                "source_kind": window["kind"],
                "corpus": window["corpus"],
                "dance": window["dance"],
                "condition": window["condition"],
                "selection_reason": window["selection_reason"],
                "selection_category": window["selection_category"],
                "selection_score": window["selection_score"],
            },
            "window_group_id": (
                repeat_of
                if repeat_of
                else f"{window['relative_stem']}:{window['start_frame']}:{window['end_frame']}"
            ),
            "repeat_of_task_id": repeat_of or None,
        }
        tasks.append(task)
        weights = dict(PROFILES)
        for candidate_id, profile_name in zip(CANDIDATE_IDS, order):
            keys.append(
                {
                    "task_id": task_id,
                    "repeat_of_task_id": repeat_of,
                    "candidate_id": candidate_id,
                    "profile_id": profile_name,
                    "neighbor_weight": weights[profile_name],
                    "min_visibility": 0.0,
                    "max_gap_frames": 2,
                    "isolated_outlier_threshold": "inf",
                    "isolated_outlier_ratio": 0.0,
                    "smoothing": (
                        "none" if weights[profile_name] == 0 else "triangular3"
                    ),
                    "relative_stem": window["relative_stem"],
                    "start_frame": window["start_frame"],
                    "end_frame_exclusive": window["end_frame"],
                    "selection_category": window["selection_category"],
                }
            )

    for index, window in enumerate(windows, start=1):
        order = [name for name, _ in PROFILES]
        rng.shuffle(order)
        task_id = f"temporal-window-{index:02d}"
        task_dir = output_root / "media" / task_id
        source, artifacts = _render_unique_media(window, task_dir, order, ffmpeg)
        append_task(task_id, index, window, order, source, artifacts)
        unique_details.append(
            {
                "task_id": task_id,
                "window": window,
                "order": order,
                "source": source,
                "artifacts": artifacts,
            }
        )

    repeat_sources = rng.sample(unique_details, repeat_count)
    for repeat_index, original in enumerate(repeat_sources, start=1):
        order = list(original["order"])
        while order == original["order"]:
            rng.shuffle(order)
        priority = unique_count + repeat_index
        task_id = f"temporal-repeat-{repeat_index:02d}"
        task_dir = output_root / "media" / task_id
        task_dir.mkdir(parents=True)
        source = task_dir / "source.mp4"
        shutil.copy2(original["source"], source)
        profile_to_artifact = {
            profile: original["artifacts"][candidate_id]
            for candidate_id, profile in zip(CANDIDATE_IDS, original["order"])
        }
        artifacts: dict[str, str] = {}
        for candidate_id, profile in zip(CANDIDATE_IDS, order):
            path = task_dir / f"candidate_{candidate_id}.mp4"
            shutil.copy2(profile_to_artifact[profile], path)
            artifacts[candidate_id] = path.as_posix()
        append_task(
            task_id,
            priority,
            original["window"],
            order,
            source.as_posix(),
            artifacts,
            original["task_id"],
        )

    manifest = {
        "schema_version": "1.0",
        "experiment_id": f"temporal-pose-comparison-{seed}",
        "task_type": "temporal_pose_comparison",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "seed": seed,
        "task_count": task_count,
        "unique_window_count": unique_count,
        "repeat_count": repeat_count,
        "candidate_labels": list(CANDIDATE_IDS),
        "response_choices": [
            *CANDIDATE_IDS,
            "no_discernible_difference",
            "cannot_judge",
        ],
        "confidence_choices": ["low", "medium", "high"],
        "design": {
            "window_seconds": WINDOW_SECONDS,
            "selection": (
                "Source-diverse windows prioritizing local acceleration reduction "
                "and fast-motion displacement, with reference and participant cases "
                "when available."
            ),
            "blinding": "Candidate identities are stored only in the sibling answer-key CSV.",
        },
        "input_provenance": {
            "numerical_by_clip_sha256": _sha256(
                numerical_output / "numerical_by_clip.csv"
            ),
            "included_clips_sha256": _sha256(
                numerical_output / "included_clips.tsv"
            ),
            "corpus_selection_sha256": (
                _sha256(corpus_root / "selection.tsv")
                if (corpus_root / "selection.tsv").is_file()
                else None
            ),
        },
        "tasks": tasks,
    }
    (output_root / "annotation_tasks.json").write_text(
        json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    with answer_key_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(keys[0]))
        writer.writeheader()
        writer.writerows(keys)
    return output_root / "annotation_tasks.json", answer_key_path


def main() -> None:
    """Parse explicit data roots and generate one new temporal-review batch."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus-root", type=Path, required=True)
    parser.add_argument("--numerical-output", type=Path, required=True)
    parser.add_argument("--reference-video-root", type=Path, required=True)
    parser.add_argument("--participant-video-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--task-count", type=int, default=6)
    args = parser.parse_args()
    manifest, answer_key = generate_temporal_comparison_tasks(
        args.corpus_root,
        args.numerical_output,
        args.reference_video_root,
        args.participant_video_root,
        args.output_root,
        args.seed,
        args.task_count,
    )
    print(f"Task manifest: {manifest}")
    print(f"Private answer key (outside served root): {answer_key}")


if __name__ == "__main__":
    main()
