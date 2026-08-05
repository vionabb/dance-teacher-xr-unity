---
date: 2026-08-02
tags: [motion-pipeline, refactor, engineering-debt, testing, dataset]
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

## Smoke-test and dataset paradigm

The repository should contain as little research data as possible while still making the motion pipeline testable without downloading the full dataset. The full/private dataset remains external, with Google Drive as the source of truth for dataset access and agent-produced research artifacts.

- `motion-pipeline/data/` is for deliberately committed inputs and supporting assets, not a general-purpose output directory. The committed smoke corpus is organized by pipeline stage first under [`data/test-fixtures/smoketest/`](../data/test-fixtures/smoketest/), with a shared case filename stem within each stage. The manifest records which files belong to each smoke-test case and also supports future metric-iteration use.
- Smoke fixtures include the raw video and selected intermediate inputs needed to exercise stages in isolation. They are treated as immutable test inputs. Tests and ordinary pipeline runs write generated files under `motion-pipeline/temp/` or another explicitly supplied external destination; generated outputs must not be written directly under `data/`.
- When a stage contract changes, a newly generated output can become a committed intermediate input only after it has been validated and intentionally promoted with the smoke-fixture promotion workflow. Promotion also requires updating the manifest; it is not an automatic side effect of running the pipeline.
- The deterministic local and CI acceptance gate is [`script_invocations/run_smoke_tests.sh`](../motion-pipeline/script_invocations/run_smoke_tests.sh). It uses the locked `uv` environment, prepares the pinned MediaPipe model asset, and runs the smoke-marked tests against the committed corpus. The corresponding GitHub workflow checks out Git LFS content so binary smoke fixtures are real files rather than LFS pointer text.
- This corpus is intentionally useful for both code-change validation and future inner-loop work on motion metrics. Adding a new smoke input is a data-contract decision: keep it small and representative, place it under the appropriate stage, document it in the manifest, and keep any generated result outside `data/` until it has been reviewed for promotion.

This establishes a clear boundary for the larger refactor: code and small, selected fixtures are versioned; full/private data and generated research outputs are staged or published through the external dataset/artifact workflow.
