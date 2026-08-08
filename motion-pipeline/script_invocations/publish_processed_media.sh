#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UV_BIN="${UV_BIN:-uv}"

if [[ "${1:-}" != "--confirm" || -z "${2:-}" || -n "${3:-}" ]]; then
    echo "Usage: $0 --confirm /absolute/path/to/verified/bundle/media" >&2
    echo "This replaces the processedmediabundle: remote with the supplied directory." >&2
    exit 2
fi

LOCAL_BUNDLE="$2"
if [[ ! -d "${LOCAL_BUNDLE}" ]]; then
    echo "Processed media directory does not exist: ${LOCAL_BUNDLE}" >&2
    exit 1
fi

if [[ -z "$(find "${LOCAL_BUNDLE}" -type f -print -quit)" ]]; then
    echo "Refusing to replace the remote with an empty processed media directory." >&2
    exit 1
fi

if ! command -v "${UV_BIN}" >/dev/null 2>&1; then
    echo "Expected uv on PATH; install it and run 'uv sync --locked --group dev' in ${WORKSPACE_DIR}." >&2
    exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
    echo "Expected rclone on PATH and a configured processedmediabundle remote." >&2
    exit 1
fi

cd "${WORKSPACE_DIR}"
exec "${UV_BIN}" run --locked python -m motion_extraction.rclone_transfer publish-processed-bundle "${LOCAL_BUNDLE}"
