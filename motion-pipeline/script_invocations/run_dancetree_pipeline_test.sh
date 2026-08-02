#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${WORKSPACE_DIR}/.." && pwd)"
UV_BIN="${UV_BIN:-uv}"

if ! command -v "${UV_BIN}" >/dev/null 2>&1; then
    echo "Expected uv on PATH; install it and run 'uv sync --locked' in ${WORKSPACE_DIR}." >&2
    exit 1
fi

cd "${WORKSPACE_DIR}"

exec "${UV_BIN}" run --locked python -m motion_extraction.dancetree.run_dancetree_pipeline \
    --database_csv_path="${WORKSPACE_DIR}/data/db.csv" \
    --video_srcdir="${REPO_ROOT}/svelte-web-frontend/static/bundle/source_videos" \
    --holistic_data_srcdir="${REPO_ROOT}/svelte-web-frontend/static/bundle/holistic_data" \
    --pose2d_data_srcdir="${REPO_ROOT}/svelte-web-frontend/static/bundle/pose2d_data" \
    --temp_dir="${WORKSPACE_DIR}/data/temp/pipeline_test_run/temp_dir/" \
    --bundle_export_path="${WORKSPACE_DIR}/temp/pipeline_test_run/bundle/nonmedia/" \
    --bundle_media_export_path="${WORKSPACE_DIR}/temp/pipeline_test_run/bundle/media/" \
    --include_thumbnail_in_bundle \
    --include_audio_in_bundle \
    --holistic_debug_frames_dir="${WORKSPACE_DIR}/temp/pipeline_test_run/holistic_debug_frames/" \
    --debug_frame_whitelist="last-christmas-tutorial*" \
    --artifact_archive_root="${REPO_ROOT}/artifact-archive" \
    "$@"
