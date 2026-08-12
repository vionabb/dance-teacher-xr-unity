#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UV_BIN="${UV_BIN:-uv}"

CACHED_REMOTE_PATH="${CACHED_REMOTE_PATH:-referencevideos}"
CACHED_RUN_DIR="${WORKSPACE_DIR}/temp/cached/${CACHED_REMOTE_PATH}"

if ! command -v "${UV_BIN}" >/dev/null 2>&1; then
    echo "Expected uv on PATH; install it and run 'uv sync --locked --group dev' in ${WORKSPACE_DIR}." >&2
    exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
    echo "Expected rclone on PATH and a configured dataset remote." >&2
    exit 1
fi

for arg in "$@"; do
    if [[ "${arg}" == "--run-dir" || "${arg}" == --run-dir=* ]]; then
        echo "run_rclone_pipeline_cached.sh manages --run-dir automatically: ${CACHED_RUN_DIR}" >&2
        echo "Use run_rclone_pipeline.sh if you need a custom run directory." >&2
        exit 2
    fi
done

cd "${WORKSPACE_DIR}"
exec "${UV_BIN}" run --locked python -m motion_extraction.run_staged_pipeline \
    --remote-path "${CACHED_REMOTE_PATH}" \
    --run-dir "${CACHED_RUN_DIR}" \
    "$@"
