"""Append balanced repeat-annotation tasks to an existing pose-review manifest."""

from __future__ import annotations

import argparse
import copy
import itertools
import json
from pathlib import Path
import sqlite3
import typing as t


def add_calibration_tasks(
    manifest: dict[str, t.Any],
    database_path: Path,
    annotator: str,
    repeat_count: int = 5,
) -> dict[str, t.Any]:
    """Return a manifest with balanced repeats of completed original tasks."""

    if any(task.get("calibration_of_task_id") for task in manifest["tasks"]):
        raise ValueError("manifest already contains calibration tasks")
    with sqlite3.connect(database_path) as connection:
        connection.row_factory = sqlite3.Row
        latest = connection.execute(
            """
            SELECT revisions.* FROM judgment_revisions revisions
            JOIN (
                SELECT task_id, MAX(revision_id) AS revision_id
                FROM judgment_revisions
                WHERE experiment_id = ? AND annotator = ?
                GROUP BY task_id
            ) selected ON selected.revision_id = revisions.revision_id
            WHERE revisions.status = 'completed'
            """,
            (manifest["experiment_id"], annotator),
        ).fetchall()
    completed = {str(row["task_id"]): row for row in latest}
    originals = [
        task
        for task in sorted(manifest["tasks"], key=lambda item: int(item["priority"]))
        if str(task["task_id"]) in completed and not task.get("calibration_of_task_id")
    ]
    if len(originals) < repeat_count:
        raise ValueError(f"need {repeat_count} completed tasks; found {len(originals)}")

    # Include a non-C1 original so all five initializer profiles can be assigned
    # without repeating the original initializer, then diversify across cases.
    originals.sort(
        key=lambda task: (
            completed[str(task["task_id"])]["ground_truth_initial_profile"] == "C1",
            int(task["priority"]),
        )
    )
    selected: list[dict[str, t.Any]] = []
    used_cases: set[str] = set()
    for task in originals:
        if str(task["case_id"]) not in used_cases:
            selected.append(task)
            used_cases.add(str(task["case_id"]))
        if len(selected) == repeat_count:
            break
    if len(selected) < repeat_count:
        remaining = [task for task in originals if task not in selected]
        selected.extend(remaining[: repeat_count - len(selected)])

    profiles = [str(item["overlay_id"]) for item in selected[0]["overlays"]]
    if repeat_count != len(profiles):
        raise ValueError("repeat_count must match the number of profiles for balanced assignment")
    assignments = next(
        (
            permutation
            for permutation in itertools.permutations(profiles)
            if all(
                profile
                != str(completed[str(task["task_id"])]["ground_truth_initial_profile"])
                for task, profile in zip(selected, permutation)
            )
        ),
        None,
    )
    if assignments is None:
        raise ValueError("could not balance alternate initializers")

    next_priority = max(int(task["priority"]) for task in manifest["tasks"]) + 1
    repeats: list[dict[str, t.Any]] = []
    for repeat_index, (original, initializer) in enumerate(
        zip(selected, assignments), start=1
    ):
        repeat = copy.deepcopy(original)
        repeat["task_id"] = f"tolerance-repeat-{repeat_index:02d}__{original['task_id']}"
        repeat["case_id"] = f"tolerance-{repeat_index:02d}"
        repeat["priority"] = next_priority + repeat_index - 1
        repeat["category"] = "annotation_tolerance_calibration"
        repeat["calibration_of_task_id"] = str(original["task_id"])
        repeat["calibration_of_revision_id"] = int(
            completed[str(original["task_id"])]["revision_id"]
        )
        repeat["calibration_repeat_index"] = repeat_index
        repeat["default_initial_profile"] = initializer
        repeats.append(repeat)

    result = copy.deepcopy(manifest)
    result["schema_version"] = "3.1"
    result["tasks"].extend(repeats)
    result["calibration_design"] = {
        "method": "repeat completed frames with balanced alternate initializers",
        "repeat_count": repeat_count,
        "profiles_each_used_once": profiles,
        "minimum_completed_repeats_for_empirical_tolerance": 3,
        "tolerance_statistic": "median of per-repeat p90 torso-normalized distances for landmarks non-occluded in both annotations",
        "selected_pairs": [
            {
                "repeat_task_id": repeat["task_id"],
                "original_task_id": repeat["calibration_of_task_id"],
                "original_revision_id": repeat["calibration_of_revision_id"],
                "original_initial_profile": completed[repeat["calibration_of_task_id"]][
                    "ground_truth_initial_profile"
                ],
                "repeat_initial_profile": repeat["default_initial_profile"],
            }
            for repeat in repeats
        ],
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--annotator", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repeat-count", type=int, default=5)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    result = add_calibration_tasks(
        manifest, args.database, args.annotator, args.repeat_count
    )
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
