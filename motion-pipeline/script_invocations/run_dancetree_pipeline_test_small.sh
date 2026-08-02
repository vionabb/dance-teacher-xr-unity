#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${WORKSPACE_DIR}/.." && pwd)"
UV_BIN="${UV_BIN:-uv}"

DEST_DIR="${WORKSPACE_DIR}/temp/pipeline_test_run_small/"

if ! command -v "${UV_BIN}" >/dev/null 2>&1; then
    echo "Expected uv on PATH; install it and run 'uv sync --locked' in ${WORKSPACE_DIR}." >&2
    exit 1
fi

cd "${WORKSPACE_DIR}"

exec "${UV_BIN}" run --locked python -m motion_extraction.dancetree.run_dancetree_pipeline \
    --database_csv_path="${DEST_DIR}/db.csv" \
    --video_srcdir="${REPO_ROOT}/svelte-web-frontend/static/bundle/source_videos/study2/" \
    --holistic_data_srcdir="${DEST_DIR}/holistic_data" \
    --pose2d_data_srcdir="${DEST_DIR}/pose2d_data" \
    --temp_dir="${DEST_DIR}/temp/" \
    --bundle_export_path="${DEST_DIR}/bundle/nonmedia/" \
    --bundle_media_export_path="${DEST_DIR}/bundle/media/" \
    --holistic_debug_frames_dir="${DEST_DIR}/holistic_debug_frames/" \
    --debug_frame_whitelist="*attention*" \
    --visibility_mode="interpolate" \
    --artifact_archive_root="${DEST_DIR}/artifact-archive" \
    "$@"
