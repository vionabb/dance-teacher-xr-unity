#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UV_BIN="${UV_BIN:-uv}"

if ! command -v "${UV_BIN}" >/dev/null 2>&1; then
    echo "Expected uv on PATH; install it and run 'uv sync --locked --group dev' in ${WORKSPACE_DIR}." >&2
    exit 1
fi

cd "${WORKSPACE_DIR}"
exec "${UV_BIN}" run --locked pytest -m smoke "$@"
