"""Enumerate every video in the reference + participant-study corpora.

Shared by ``scripts/compute_automatic_quality_signals.py`` (matches videos
against existing pose data) and ``scripts/extract_pose_landmarker_corpus.py``
(writes new pose data), so both use the same, once-validated notion of "the
corpus": flat per-clip videos only, deliberately excluding whole-session
recordings nested a level deeper under a participant study's ``videos/``
directory (see the 2026-08-28 entry in
``lab-log/2026-08-27-preprocessing-quality-gate-pivot-handoff.md`` for why --
those are a different unit, not per-clip, and were the source of an earlier
corpus-size miscount).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

PARTICIPANT_STUDIES = ("chi25_study1", "chi25_study2")


@dataclass(frozen=True)
class CorpusVideo:
    """One video and its identity within the corpus."""

    corpus: str
    relative_stem: str
    video_path: Path


def list_reference_videos(data_root: Path) -> list[CorpusVideo]:
    video_root = data_root / "reference_motions" / "videos"
    if not video_root.is_dir():
        return []
    return [
        CorpusVideo(
            "reference",
            video_path.relative_to(video_root).with_suffix("").as_posix(),
            video_path,
        )
        for video_path in sorted(video_root.rglob("*.mp4"))
    ]


def list_participant_videos(data_root: Path, study: str) -> list[CorpusVideo]:
    video_root = data_root / "participant_motions" / study / "videos"
    if not video_root.is_dir():
        return []
    return [
        CorpusVideo(study, video_path.stem, video_path)
        for video_path in sorted(video_root.glob("*.mp4"))
    ]


def list_corpus_videos(data_root: Path) -> list[CorpusVideo]:
    """Enumerate every reference and participant-study clip: 52 + 675 + 1,081 = 1,808."""

    videos = list(list_reference_videos(data_root))
    for study in PARTICIPANT_STUDIES:
        videos += list_participant_videos(data_root, study)
    return videos
