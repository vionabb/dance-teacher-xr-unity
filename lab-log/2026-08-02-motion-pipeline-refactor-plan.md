---
date: 2026-08-02
tags: [motion-pipeline, refactor, engineering-debt]
artifacts: []
---

# Motion-pipeline refactor planning

## User intent

> The structure of the motion-pipeline Python project emerged organically through a research project. It did not grow in a principled way that reflects best practices or makes it easy for future readers to consume. Some code is obsolete, incomplete, or has a name or location that is not semantically logical. The task is to make a plan to refactor the project to reduce engineering debt and streamline further development work.

## Findings

- The active reference-video workflow is coherent at the orchestration level: metadata update, raw pose extraction, clean preprocessing, complexity and audio analysis, dance-tree enrichment, then bundle export.
- The active workflow shares one package with historical BVH/Mecanim/NAO teleoperation work, ad-hoc analyses, checked-in historical data, and study-analysis scripts.
- The main cumulative-complexity module is 1,885 lines and combines computation, compatibility logic, diagnostic plotting, artifact writing, and CLI concerns.
- There is no packaging or test-runner configuration; the documented pytest command does not work in the project-local environment because pytest is not installed. The focused unittest suite does pass (19 tests).

## Direction

- Plan the refactor as a staged boundary-and-contract migration, preserving current bundle, raw/clean pose, and metric CSV contracts before changing internal names or locations.
- Explicitly classify components as active, experimental, historical/archival, or removable before deleting or moving anything.
- Establish a small, reproducible test and fixture baseline before the large module and package-layout migrations.

## Environment baseline decision

- The active reference-video pipeline now has one declarative project definition: `motion-pipeline/pyproject.toml`, `.python-version`, and a committed `uv.lock`. The local virtual environment is standardized as `.venv`; the old `.env` name was a virtual environment, not application configuration, and is retired for new setup.
- The first locked baseline is Python 3.10 with MediaPipe 0.10.21. This matches the environment that passes the existing 19 preprocessing/complexity tests. A second local environment resolved under the old permissive MediaPipe constraint to 0.10.35 and fails at import because the code still uses `mp.solutions`; MediaPipe upgrades therefore require an explicit compatibility migration or validation.
- The active pipeline is supported first on macOS Apple Silicon and Linux x86_64. Historical BVH, Mecanim, and NAO dependencies are opt-in rather than part of a default environment. Windows and the historical robotics workflow are unverified, not deleted.
