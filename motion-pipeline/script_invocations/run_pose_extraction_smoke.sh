#!/bin/bash

# Run the MediaPipe extraction smoke test in a macOS GUI-authorized process.
# Codex's default sandbox cannot create the native NSOpenGL context that the
# pinned MediaPipe wheel initializes, even when inference uses the CPU delegate.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-${WORKSPACE_DIR}/.venv/bin/python}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
    echo "Expected the motion-pipeline virtual environment at ${PYTHON_BIN}." >&2
    echo "Run 'uv sync --locked --group dev' in ${WORKSPACE_DIR} first." >&2
    exit 1
fi

cd "${WORKSPACE_DIR}"
exec "${PYTHON_BIN}" -m pytest \
    motion_extraction/tests/test_smoke_pipeline.py \
    -k pose_extraction_stage_smoke \
    "$@"
