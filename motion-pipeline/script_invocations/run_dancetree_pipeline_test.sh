#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${WORKSPACE_DIR}/.." && pwd)"
PYTHON_BIN="${WORKSPACE_DIR}/.env/bin/python3"

if [[ ! -x "${PYTHON_BIN}" ]]; then
    echo "Expected Python interpreter not found at ${PYTHON_BIN}" >&2
    exit 1
fi

exec "${PYTHON_BIN}" -m motion_extraction.dancetree.run_dancetree_pipeline \
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
