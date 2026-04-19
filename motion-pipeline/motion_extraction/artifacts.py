from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from pathlib import Path
import typing as t

from .reporting import AnalysisMarkdownReport


def timestamped_archive_name(label: str) -> str:
    timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    return f"{timestamp}-{label}"


def resolve_artifact_output_dir(
    *,
    artifact_archive_root: t.Optional[Path],
    artifact_output_dir: t.Optional[Path],
    default_label: str,
) -> t.Optional[Path]:
    if artifact_archive_root is not None and artifact_output_dir is not None:
        raise ValueError("artifact_archive_root and artifact_output_dir are mutually exclusive.")

    if artifact_output_dir is not None:
        artifact_output_dir.mkdir(parents=True, exist_ok=True)
        return artifact_output_dir

    if artifact_archive_root is None:
        return None

    archive_dir = artifact_archive_root / timestamped_archive_name(default_label)
    archive_dir.mkdir(parents=True, exist_ok=True)
    return archive_dir


def build_artifact_report(
    artifact_dir: Path,
    *,
    title: str,
    intro: t.Optional[str] = None,
) -> AnalysisMarkdownReport:
    return AnalysisMarkdownReport(output_dir=artifact_dir, title=title, intro=intro)


@lru_cache(maxsize=None)
def _load_title_lookup(database_csv_path: str) -> dict[str, str]:
    # Local import avoids a module cycle with update_database -> artifacts.
    from .update_database import load_db

    db = load_db(Path(database_csv_path))
    if "title" not in db.columns:
        return {}

    title_lookup: dict[str, str] = {}
    for clip_relative_stem, title in db["title"].items():
        if isinstance(title, str) and title.strip():
            title_lookup[str(clip_relative_stem)] = title
    return title_lookup


def resolve_artifact_clip_title(
    clip_relative_stem: str | Path,
    *,
    database_csv_path: t.Optional[Path],
    fallback_title: str,
) -> str:
    if database_csv_path is None:
        return fallback_title

    clip_key = Path(clip_relative_stem).as_posix()
    try:
        title_lookup = _load_title_lookup(str(database_csv_path.resolve()))
    except Exception:
        return fallback_title

    resolved_title = title_lookup.get(clip_key)
    if isinstance(resolved_title, str) and resolved_title.strip():
        return resolved_title
    return fallback_title
