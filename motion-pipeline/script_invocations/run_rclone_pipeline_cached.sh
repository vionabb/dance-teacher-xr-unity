#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UV_BIN="${UV_BIN:-uv}"
CODEWORKSPACE_ROOT="$(cd "${WORKSPACE_DIR}/.." && pwd)"

CACHED_REMOTE_PATH="${CACHED_REMOTE_PATH:-referencevideos}"
CACHED_VIDEO_DIR="${CACHED_VIDEO_DIR:-${CODEWORKSPACE_ROOT}/data/reference_motions/videos}"
REFERENCE_DATA_ROOT="${REFERENCE_DATA_ROOT:-${CODEWORKSPACE_ROOT}/data/reference_motions}"
RUN_DIR="${RUN_DIR:-${REFERENCE_DATA_ROOT}/pipeline-run}"

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
    --run-dir "${RUN_DIR}" \
    --video-srcdir "${CACHED_VIDEO_DIR}" \
    --database-csv-path "${REFERENCE_DATA_ROOT}/db.csv" \
    --holistic-data-srcdir "${REFERENCE_DATA_ROOT}/pose-raw/holisticdata" \
    --pose2d-data-srcdir "${REFERENCE_DATA_ROOT}/pose-raw/pose2d" \
    --holistic-processed-srcdir "${REFERENCE_DATA_ROOT}/pose-processed/holisticdata" \
    --pose2d-processed-srcdir "${REFERENCE_DATA_ROOT}/pose-processed/pose2d" \
    --temp-dir "${REFERENCE_DATA_ROOT}/processed" \
    --bundle-export-path "${REFERENCE_DATA_ROOT}/processed/bundle/nonmedia" \
    --bundle-media-export-path "${REFERENCE_DATA_ROOT}/processed/bundle/media" \
    "$@"
