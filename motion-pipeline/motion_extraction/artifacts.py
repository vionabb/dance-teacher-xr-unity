from __future__ import annotations

from datetime import datetime
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
