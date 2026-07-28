#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${WORKSPACE_DIR}/.." && pwd)"
PYTHON_BIN="${WORKSPACE_DIR}/.env/bin/python3"

DEST_DIR="${WORKSPACE_DIR}/temp/pipeline_test_run_small/"


if [[ ! -x "${PYTHON_BIN}" ]]; then
    echo "Expected Python interpreter not found at ${PYTHON_BIN}" >&2
    exit 1
fi

exec "${PYTHON_BIN}" -m motion_extraction.dancetree.run_dancetree_pipeline \
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
