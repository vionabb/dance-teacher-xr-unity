---
date: 2026-07-30
tags: [refactoring, engineering-debt, motion-pipeline, structure]
artifacts: []
---

# motion-pipeline structural refactoring — pass 1

## Context

"the structure of the motion-pipeline python project emerged organically through a research project. in this process, it did not grow in a principled way that reflects best practices makes it easy for future readers to consume. for example, there are parts of the codebase that are obsolete, some that are incomplete, and some whose name or location is not semantically logical."

This session completed the first pass of a planned structural refactoring (issue #379).

## Decisions

- **Moved `bvh_writer.py` → `bvh/writer.py`**: The BVH format already had a `bvh/` package for the parser and viewer; the writer was the odd file out sitting at the package root.  `bvh/__init__.py` now re-exports `BVHWriteNode` and `write_bvh` so any future callers can use the shorter `motion_extraction.bvh` path.

- **Moved `view_urdf.py` → `teleoperation/view_urdf.py`**: URDF visualisation is NAO-teleoperation-specific.  Having it at the `motion_extraction` root made it look like a general pipeline utility.  Importers updated accordingly.

- **Fixed a silent bug in `view_urdf.load_urdf`**: The function accepted a `urdf_path` argument but ignored it, always opening the module-level constant (a hard-coded Windows absolute path).  Fixed to use the parameter.  Also replaced the hard-coded path with a portable `Path(__file__)` relative default.

- **Moved `docs/typical_hand_measurements.py` → `motion_extraction/hand_measurements.py`**: The file imported from `motion_extraction.mp_utils` and defined production constants used by skeleton code.  Placing it in `docs/` implied it was documentation rather than code.

- **Moved `docs/mecanim_utils.py` → `docs/reference/mecanim_utils.py`**: This is purely a lookup table of Unity Mecanim muscle names — reference data, not runnable pipeline code.  The `reference/` sub-folder makes that clearer.

- **Removed `POSE_CONNETIONS` alias in `pose_visualization.py`**: The misspelled alias was defined and used two lines later in the same file.  Removed the alias; `POSE_CONNECTIONS` used directly.

- **Fixed `reencode_videos_hvec` function name typo** in `reencode_videos_hevc.py`: Renamed to `reencode_videos_hevc` to match the file and the codec name (HEVC = High Efficiency Video Coding).

- **Added `adhoc_analysis/README.md`**: This directory contains historical research scripts from early prototyping (complexity metric prototypes, ChatGPT integration tests, PyFEAT experiments, Study 1 plot scripts, etc.).  None of these are part of the production pipeline.  The README documents that and directs new readers to `motion_extraction/`.

- **Created `docs/refactoring-plan.md`**: Captures what was done in this pass and documents the remaining medium- and lower-priority items for future agents.

## Findings

The codebase had one concrete *bug* masked by poor naming: `view_urdf.load_urdf` silently ignored its argument.  This would have caused surprising failures any time a caller passed a non-default URDF path.

The `adhoc_analysis/` directory is entirely non-production but has no indication of that — a future agent or developer would need to read every file to discover this.  The README should clarify that immediately.

The `bvh/` package now forms a coherent unit (parser + viewer + writer).  Previously the writer was isolated at the package root while the parser and viewer sat in the package, which suggested they were unrelated.
