# Motion Pipeline Agent Instructions

Follow [../AGENTS.md](../AGENTS.md) first.

## Warm start

1. Read [README.md](README.md) for the environment and runnable workflows.
2. Treat [.vscode/launch.json](.vscode/launch.json) and [script_invocations/](script_invocations/) as canonical examples of current arguments.
3. Read [../documentation/technical-architecture.md](../documentation/technical-architecture.md) before changing raw/clean pose contracts or bundle interfaces.
4. Read [../documentation/dataset.md](../documentation/dataset.md) before accessing or publishing research data.

Run Python modules with `motion-pipeline/` as the working directory and use the project-local `.venv` created by `uv sync --locked`. Do not assume a root or shell-selected Python interpreter matches the editor.

## Important workflows and contracts

- Main reference-video workflow: `motion_extraction.dancetree.run_dancetree_pipeline`
- CHI study pose preparation: `motion_extraction/scripts/getposes.py` and related scripts
- Frontend metric model fitting: `motion_extraction/scripts/fit_metric_linear_model.py`
- Cloud data staging/publication: `motion_extraction.rclone_transfer`; never use an rclone mount
- Frontend boundary: bundle JSON/media and `svelte-web-frontend/artifacts/motion_metrics.csv`

If a change affects bundle schemas, raw/clean filename conventions, metric columns, or shared artifact paths, inspect the corresponding frontend consumers and update the canonical documentation when needed.

## Validation

Prefer the smallest applicable existing command:

- Focused Python tests: `uv run --locked pytest <test-file-or-node>`
- MediaPipe model setup: `uv run --locked python -m motion_extraction.prepare_mediapipe_models --download`
- Motion-pipeline acceptance gate: `./script_invocations/run_smoke_tests.sh`
- Equivalent marker invocation: `uv run --locked pytest -m smoke`
- Small pipeline smoke run: `./script_invocations/run_dancetree_pipeline_test_small.sh`
- Broader local pipeline run: `./script_invocations/run_dancetree_pipeline_test.sh`

Any agent change to motion-pipeline code or configuration must pass the acceptance gate before handoff. The gate uses the committed stage-first corpus under `data/smoketest/` and writes only to temporary output directories. Do not treat missing private or full-dataset media as a smoke-test failure when the committed corpus is available.

Smoke-test inputs are immutable contract fixtures. Do not point a normal pipeline output at `data/smoketest/`. If a contract change requires new inputs, generate outputs under `temp/`, validate them, promote selected files with `script_invocations/promote_smoke_fixture.py`, update `data/smoketest/manifest.json`, and review the resulting fixture diff.

## Python documentation

Add a concise docstring to new functions. Update a function's docstring whenever its parameters, return value, side effects, file outputs, or intended usage change. If the contract cannot be determined from callers and tests, surface the uncertainty rather than inventing it.
