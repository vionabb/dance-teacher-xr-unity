---
name: run-motion-pipeline-smoke
description: Run the motion-pipeline acceptance gate correctly, including the macOS-specific caveat for pose-extraction changes. Use before treating any change to motion-pipeline/ or pose-processing/ as complete, or when asked to run, validate, or check the smoke tests.
---

# Run motion-pipeline smoke gate

Per `motion-pipeline/AGENTS.md`, any agent change to motion-pipeline code or
configuration must pass this gate before handoff. It uses the committed
stage-first fixture corpus under `data/test-fixtures/smoketest/` and writes
only to temporary output directories — never edit that corpus directly.

## Standard run

```bash
cd motion-pipeline
./script_invocations/run_smoke_tests.sh
```

This does, in order: `uv run --locked python -m motion_extraction.prepare_mediapipe_models --download`
(prepares the pinned MediaPipe model asset), the focused `pose-processing`
tests, then the full `-m smoke` suite. Equivalent direct invocation once the
model is prepared: `uv run --locked pytest -m smoke`.

If `uv` is missing or the environment isn't set up: `uv sync --locked --group dev`
in `motion-pipeline/` first.

## macOS pose-extraction caveat — read before treating a failure as a regression

On macOS, MediaPipe pose extraction requires a GUI-authorized local process
because the pinned wheel (`mediapipe==0.10.21`) creates a native NSOpenGL
context. A sandboxed/headless process (including this agent's default
sandbox) cannot create that context and will fail with an OpenGL-related
error that is **not** a real pipeline regression.

If a change affects pose extraction specifically, additionally run the
focused wrapper in a GUI-authorized local process:

```bash
cd motion-pipeline
./script_invocations/run_pose_extraction_smoke.sh
```

Do not misclassify a sandbox-only OpenGL failure here as an extraction
regression — if this wrapper fails with an OpenGL/NSOpenGL context error and
the standard `run_smoke_tests.sh` run above passed, surface that distinction
explicitly rather than reporting a generic failure.

## Reporting

State clearly: which command(s) ran, pass/fail, and — if
`run_pose_extraction_smoke.sh` failed — whether it looks like the known
sandbox/OpenGL limitation or an actual regression.
