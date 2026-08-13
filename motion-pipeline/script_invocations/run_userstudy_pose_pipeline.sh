#!/bin/bash

# Extract participant videos from the persistent cache into canonical pose CSVs.
# The source cache is read-only; derived outputs stay under that cache's pose tree.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UV_BIN="${UV_BIN:-uv}"
STUDY="${STUDY:-study1-segmented}"
DATA_ROOT="${USER_STUDY_DATA_DIR:-${WORKSPACE_DIR}/temp/cached/userstudydata}"

if ! command -v "${UV_BIN}" >/dev/null 2>&1; then
    echo "Expected uv on PATH; install it and run 'uv sync --locked' in ${WORKSPACE_DIR}." >&2
    exit 1
fi

cd "${WORKSPACE_DIR}"
exec "${UV_BIN}" run --locked python -m motion_extraction.study_pose_data \
    --study "${STUDY}" \
    --data-root "${DATA_ROOT}" \
    "$@"
