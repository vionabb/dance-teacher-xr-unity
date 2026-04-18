from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import re
import typing as t

import pandas as pd


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-").lower()
    return slug or "artifact"


def _escape_markdown_cell(value: object) -> str:
    if isinstance(value, (list, tuple, dict, set)):
        text = str(value)
        text = text.replace("|", "\\|")
        text = text.replace("\n", "<br>")
        return text
    if pd.isna(value):
        return ""
    text = str(value)
    text = text.replace("|", "\\|")
    text = text.replace("\n", "<br>")
    return text


def dataframe_to_markdown_table(dataframe: pd.DataFrame, *, index: bool = False) -> str:
    df = dataframe if index else dataframe.reset_index(drop=True)

    headers = [str(column) for column in df.columns]
    header_row = "| " + " | ".join(_escape_markdown_cell(column) for column in headers) + " |"
    separator_row = "| " + " | ".join("---" for _ in headers) + " |"

    body_rows = [
        "| " + " | ".join(_escape_markdown_cell(value) for value in row) + " |"
        for row in df.itertuples(index=False, name=None)
    ]

    return "\n".join([header_row, separator_row, *body_rows]) if body_rows else "\n".join(
        [header_row, separator_row]
    )


@dataclass
class SavedArtifact:
    title: str
    relative_path: str


class AnalysisMarkdownReport:
    def __init__(self, output_dir: Path, title: str, intro: str | None = None):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._parts: list[str] = [f"# {title}"]
        if intro:
            self._parts.extend(["", intro])

    def add_heading(self, title: str, *, level: int = 2) -> None:
        self._parts.extend(["", f"{'#' * level} {title}"])

    def add_paragraph(self, text: str) -> None:
        self._parts.extend(["", text])

    def add_list(self, items: t.Iterable[str]) -> None:
        rendered = [f"- {item}" for item in items]
        if rendered:
            self._parts.extend(["", *rendered])

    def add_code_block(self, text: str, *, language: str = "text") -> None:
        self._parts.extend(["", f"```{language}", text.rstrip(), "```"])

    def add_dataframe(
        self,
        name: str,
        dataframe: pd.DataFrame,
        *,
        max_rows_in_markdown: int = 20,
        preview_rows: int = 7,
        index: bool = False,
        csv_subdir: str = "tables",
        csv_filename: str | None = None,
    ) -> SavedArtifact | None:
        row_count = len(dataframe.index)
        column_count = len(dataframe.columns)
        self.add_paragraph(f"Rows: `{row_count}`. Columns: `{column_count}`.")

        if row_count <= max_rows_in_markdown:
            self._parts.extend(["", dataframe_to_markdown_table(dataframe, index=index)])
            return None

        csv_dir = self.output_dir / csv_subdir
        csv_dir.mkdir(parents=True, exist_ok=True)
        csv_name = csv_filename or f"{_slugify(name)}.csv"
        csv_path = csv_dir / csv_name
        dataframe.to_csv(csv_path, index=index)

        preview = dataframe.head(preview_rows)
        relative_path = os.path.relpath(csv_path, self.output_dir)
        self.add_paragraph(
            f"Showing the first `{min(preview_rows, row_count)}` rows below. "
            f"Full table: [{csv_name}]({relative_path})."
        )
        self._parts.extend(["", dataframe_to_markdown_table(preview, index=index)])
        return SavedArtifact(title=name, relative_path=relative_path)

    def add_figure(self, title: str, path: Path, *, caption: str | None = None) -> SavedArtifact:
        relative_path = os.path.relpath(path, self.output_dir)
        suffix = path.suffix.lower()

        if caption:
            self.add_paragraph(caption)

        if suffix in {".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp"}:
            self._parts.extend(["", f"![{title}]({relative_path})"])
        else:
            self._parts.extend(["", f"[{title}]({relative_path})"])

        return SavedArtifact(title=title, relative_path=relative_path)

    def write(self, filename: str = "report.md") -> Path:
        report_path = self.output_dir / filename
        report_path.write_text("\n".join(self._parts).strip() + "\n", encoding="utf-8")
        return report_path
