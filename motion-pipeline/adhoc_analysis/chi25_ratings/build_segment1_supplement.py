"""Build the Study 2 segment-1 rating supplement from the collaborator sheets.

The hosted CHI25 ratings source has no Study 2 segment 1 for bartender,
mad-at-disney and pajama-party, and its last-christmas segment 1 holds rater 1's
score alone. The collaborator workbook (one sheet per dance and rater, 1-3
scale) has all of them. This script writes those rows in the hosted ratings
source's column layout, so scripts/addChi25RatingSource.mjs and the import can
turn them into research_human_rating rows with analysisHumanRating unchanged.

Rules, each checked against the hosted Study 2 segments 2-5 before writing
(the script stops if any check fails):
  rating1 = the "brianna" sheet, rating2 = "kaitlyn", rating3 = "sarah";
  humanRating = 2 * mean of the raters who scored it - 1;
  a segment with no score from any rater (all marked as a missing video) has
  no row, and every other segment has one.
The condition column is the recording's condition (from its workflow id) when
exactly one recording matches, otherwise "unknown". The join ignores it.

Usage (inputs and output are participant data: keep them in local-data/):
  uv run --no-project --with pandas,openpyxl python -I \
    motion-pipeline/adhoc_analysis/chi25_ratings/build_segment1_supplement.py \
    --sheets local-data/<...>/user2_segment_ratings.xlsx \
    --tables local-data/research-chi25/tables \
    --out local-data/chi25-humanratings-study2-segment1-supplement.csv
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

DANCES = {
    "last": "last-christmas",
    "disney": "mad-at-disney",
    "pajama": "pajama-party",
    "bartender": "bartender",
}
RATERS = ("brianna", "kaitlyn", "sarah")  # rating1, rating2, rating3
FIELDS = [
    "key",
    "dance",
    "study",
    "userId",
    "rating1",
    "rating2",
    "rating3",
    "condition",
    "segmentId",
    "autoRating",
    "humanRating",
    "lessonOrder",
    "reportedDifficulty",
    "reportedHelpfulness",
    "autoRatingPercentile",
    "humanRatingPercentile",
]


def score(value: object) -> int | None:
    text = str(value).strip()
    return int(float(text)) if text in {"1", "2", "3", "1.0", "2.0", "3.0"} else None


def human(scores: list[int]) -> str:
    value = 2 * sum(scores) / len(scores) - 1
    return f"{value:.10g}"


def load_sheets(path: Path) -> dict[tuple[str, str, str], dict[str, int | None]]:
    cells: dict[tuple[str, str, str], dict[str, int | None]] = {}
    for name, sheet in pd.read_excel(path, sheet_name=None).items():
        short, rater = name.split("_")
        if short not in DANCES or rater not in RATERS:
            sys.exit(f"unexpected sheet {name!r}")
        for _, row in sheet.iterrows():
            for column in sheet.columns:
                if str(column).startswith("seg"):
                    key = (DANCES[short], str(row["id"]).strip(), str(column)[3:])
                    cells.setdefault(key, {})[rater] = score(row[column])
    return cells


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--sheets", type=Path, required=True)
    parser.add_argument("--tables", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if "local-data" not in args.out.resolve().parts:
        sys.exit("write the supplement under local-data/ only")

    cells = load_sheets(args.sheets)
    hosted = json.loads((args.tables / "research_human_rating.json").read_text())
    recordings = json.loads(
        (args.tables / "research_analysis_recording.json").read_text()
    )
    by_key = {
        (r["dance"], r["participant_id"], r["source_segment"]): r
        for r in hosted
        if r["study"] == "chi25_study2"
    }

    checks: Counter[str] = Counter()
    for key, raters in cells.items():
        if key[2] == "1":
            continue
        row = by_key.get(key)
        scores = [raters.get(name) for name in RATERS]
        if not row:
            checks["no hosted row, no scores" if not any(scores) else "disagree"] += 1
            continue
        original = row["original_row"]
        stored = [
            int(original[f"rating{i}"]) if original[f"rating{i}"] else None
            for i in (1, 2, 3)
        ]
        same = (
            stored == scores
            and abs(
                float(original["humanRating"])
                - float(human([v for v in scores if v is not None]))
            )
            < 1e-6
        )
        checks["agree" if same else "disagree"] += 1
    if checks["disagree"] or not checks["agree"]:
        sys.exit(
            f"collaborator sheets do not reproduce hosted segments 2-5: {dict(checks)}"
        )

    recording_conditions: dict[tuple[str, str, str], list[str]] = {}
    for r in recordings:
        if r["study"] == "chi25_study2":
            key = (r["dance"], str(r["participant_id"]), str(r["clip_number"]))
            recording_conditions.setdefault(key, []).append(r["condition"])

    rows = []
    kept: Counter[str] = Counter()
    for key in sorted(cells, key=lambda k: (k[0], int(k[1]), k[2])):
        dance, user, segment = key
        if segment != "1":
            continue
        hosted_row = by_key.get(key)
        if hosted_row and dance != "last-christmas":
            sys.exit(f"segment 1 already hosted for {dance}; refusing to duplicate it")
        scores = [cells[key].get(name) for name in RATERS]
        if all(value is None for value in scores):
            kept[f"{dance}: skipped, no rater scored it"] += 1
            continue
        if any(value is None for value in scores):
            kept[f"{dance}: kept with fewer than three raters"] += 1
        conditions = recording_conditions.get(key, [])
        rows.append(
            {
                **dict.fromkeys(FIELDS, ""),
                "key": f"study2_{dance}_user{user}",
                "dance": dance,
                "study": "2",
                "userId": user,
                **{
                    f"rating{i + 1}": "" if value is None else str(value)
                    for i, value in enumerate(scores)
                },
                "condition": conditions[0] if len(conditions) == 1 else "unknown",
                "segmentId": "1",
                "humanRating": human([v for v in scores if v is not None]),
            }
        )
        kept[f"{dance}: kept"] += 1

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(buffer.getvalue())
    print(
        json.dumps(
            {"checked_against_hosted": dict(checks), "rows": len(rows), **kept},
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
