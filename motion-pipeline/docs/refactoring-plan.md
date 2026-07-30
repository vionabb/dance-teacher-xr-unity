# motion-pipeline Refactoring Plan

*Addresses [GitHub issue #379](https://github.com/vionabb/dance-teacher-xr-unity/issues/379)*

The structure of the `motion-pipeline` Python project emerged organically during
research and accumulated structural debt that makes it harder for future readers
(human and agent alike) to navigate.  This document records:

1. **What has already been done** in the initial refactoring pass.
2. **What is recommended next** — larger changes that require more planning or
   carry more risk.

---

## Already Completed

### File relocation

| Before | After | Reason |
|---|---|---|
| `motion_extraction/bvh_writer.py` | `motion_extraction/bvh/writer.py` | BVH writing belongs in the `bvh/` package alongside the parser and viewer; `bvh/__init__.py` re-exports `BVHWriteNode` and `write_bvh` for backward compatibility |
| `motion_extraction/view_urdf.py` | `motion_extraction/teleoperation/view_urdf.py` | NAO robot URDF visualisation is teleoperation-specific; was confusingly exposed at the package root |
| `docs/typical_hand_measurements.py` | `motion_extraction/hand_measurements.py` | File imports `motion_extraction.mp_utils` and contains production constants used by skeleton code; placing it in `docs/` was misleading |
| `docs/mecanim_utils.py` | `docs/reference/mecanim_utils.py` | Pure reference data (Unity Mecanim muscle name list); moved to `docs/reference/` to distinguish it from code |

### Bug fixed

* **`view_urdf.load_urdf`** ignored its `urdf_path` parameter and always opened the
  module-level `nao_urdf_path` constant (a hard-coded Windows path).  The function
  now correctly uses its argument.
* The module-level hardcoded Windows path has been replaced with a portable path
  derived from the file's location (`__file__`).

### Typos fixed

| File | Before | After |
|---|---|---|
| `motion_extraction/pose_visualization.py` | `POSE_CONNETIONS = POSE_CONNECTIONS` (misspelled alias) | Alias removed; `POSE_CONNECTIONS` used directly |
| `motion_extraction/reencode_videos_hevc.py` | `def reencode_videos_hvec(...)` | `def reencode_videos_hevc(...)` |

### Documentation added

* `adhoc_analysis/README.md` — explains that this directory contains historical,
  non-production research scripts and points new readers to `motion_extraction/`.

---

## Recommended Next Steps

These items are ordered roughly by impact-to-risk ratio.  None of them are
blocking; they are improvements that would make the codebase easier to understand
and extend.

### High impact, low risk

1. **Remove dead stubs**
   - `motion_extraction/bvh/writer.py` (`mediapipe_capture_pipeline` is an empty
     `pass` stub; it should either be implemented or deleted).
   - `motion_extraction/pose_visualization.py` (`visualize_skeleton` is an empty
     `pass` stub with no callers).

2. **Remove heavy commented-out code blocks**
   - `motion_extraction/bvh/writer.py` contains ~10 commented-out alternative
     Euler angle approaches.  These should be deleted once the chosen approach is
     validated; they add noise for future readers.

3. **Fix bare `except` clause** in `motion_extraction/convert_to_jointspace.py`
   (line ~77).  Replace with `except Exception as e: ...` and log the error.

4. **Add a `docs/reference/README.md`** explaining that `docs/reference/` is
   lookup-only data and not executable pipeline code.

### Medium impact, medium risk

5. **Split `motion_extraction/extract_holistic_data.py`** into:
   - `pose_extraction.py` — MediaPipe inference and CSV writing.
   - Debug/visualisation helpers consolidated into `pose_visualization.py`.
   The file is currently ~500 lines mixing I/O, inference, and plot rendering.

6. **Migrate `update_database.py` CSV storage to SQLite** (or add Pydantic
   validation on load).  The current CSV-based "database" lacks a schema and
   silently accepts malformed rows.

7. **Move `motion_extraction/scripts/replot_correlations.py` to data-driven form**:
   The correlation matrices are currently hardcoded scalars.  Reading them from the
   CSV output of `fit_metric_linear_model.py` would make replotting automatic.

### Lower priority

8. **Add `pytest` test suite** — Currently only `complexity_analysis/tests/` has
   unit tests.  Key candidates: `preprocess_pose_data.py`, `update_database.py`,
   `artifacts.py`.

9. **Replace `print()`-based progress reporting with `logging`** across the
   pipeline.  `utils.throttle` is a partial workaround; the logging module is more
   flexible.

10. **Consolidate `script_invocations/` shell scripts** into either the README or
    VS Code launch configs.  Having both is confusing to new contributors.

11. **Upgrade type hints** across older files to use modern `list[...]` /
    `dict[...]` / `X | Y` syntax (Python ≥ 3.10 style) for consistency with newer
    additions.

---

## Overall Structure (as of refactoring pass 1)

```
motion-pipeline/
├── adhoc_analysis/          # Historical research scripts (non-production)
│   └── README.md            # ← explains archived status
├── data/                    # Static data: URDF, BVH, CSV exports
├── docs/
│   ├── reference/           # Reference-only data (not executable)
│   │   └── mecanim_utils.py
│   └── reports/             # Design notes and module reports
├── motion_extraction/       # Main Python package
│   ├── audio_analysis/      # Beat/BPM/similarity/dancetree-from-audio
│   ├── bvh/                 # BVH format: parser, viewer, writer
│   │   ├── parser.py
│   │   ├── view_bvh.py
│   │   └── writer.py        # ← moved here from package root
│   ├── complexity_analysis/ # DVAJ complexity calculation + tests
│   ├── dancetree/           # Pipeline orchestration and bundle export
│   ├── motion_output_provider/  # Abstract output providers (BVH, NAO)
│   ├── scripts/             # Ad-hoc analysis utilities
│   ├── teleoperation/       # Real-time NAO teleoperation
│   │   └── view_urdf.py     # ← moved here from package root
│   ├── artifacts.py
│   ├── extract_holistic_data.py
│   ├── hand_measurements.py # ← moved here from docs/
│   ├── mp_utils.py
│   ├── MecanimHumanoid.py
│   ├── pose_visualization.py
│   ├── preprocess_pose_data.py
│   ├── reencode_videos_hevc.py
│   ├── reporting.py
│   ├── update_database.py
│   └── utils.py
├── p5_visualization/        # Legacy browser skeleton viewer (unmaintained)
├── paper/                   # Diagrams for the research paper
├── script_invocations/      # Example shell invocations (see also launch.json)
└── temp/                    # Gitignored scratch directory
```
