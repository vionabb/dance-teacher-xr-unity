#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UV_BIN="${UV_BIN:-uv}"

CACHED_REMOTE_PATH="${CACHED_REMOTE_PATH:-referencevideos}"
CACHED_VIDEO_DIR="${CACHED_VIDEO_DIR:-${WORKSPACE_DIR}/temp/cached/${CACHED_REMOTE_PATH}}"

if ! command -v "${UV_BIN}" >/dev/null 2>&1; then
    echo "Expected uv on PATH; install it and run 'uv sync --locked --group dev' in ${WORKSPACE_DIR}." >&2
    exit 1
fi

for arg in "$@"; do
    if [[ "${arg}" == "--remote-path" || "${arg}" == --remote-path=* || "${arg}" == "--video-srcdir" || "${arg}" == --video-srcdir=* ]]; then
        echo "run_rclone_pipeline_cached.sh always reads ${CACHED_VIDEO_DIR} as its video source." >&2
        exit 2
    fi
done

if [[ ! -d "${CACHED_VIDEO_DIR}" ]]; then
    echo "Expected cached videos at ${CACHED_VIDEO_DIR}." >&2
    echo "Stage them first with ./script_invocations/stage_video_cache.sh ${CACHED_REMOTE_PATH}." >&2
    exit 1
fi

cd "${WORKSPACE_DIR}"
exec "${UV_BIN}" run --locked python -m motion_extraction.run_staged_pipeline \
    --video-srcdir "${CACHED_VIDEO_DIR}" \
    "$@"
