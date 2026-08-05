#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UV_BIN="${UV_BIN:-uv}"
VIDEO_DIR="${PIPELINE_VIDEO_DIR:-${WORKSPACE_DIR}/data/smoketest/motionvideo}"
DEST_DIR="${PIPELINE_OUTPUT_DIR:-${WORKSPACE_DIR}/temp/pipeline_test_run}"

if ! command -v "${UV_BIN}" >/dev/null 2>&1; then
    echo "Expected uv on PATH; install it and run 'uv sync --locked' in ${WORKSPACE_DIR}." >&2
    exit 1
fi

cd "${WORKSPACE_DIR}"

exec "${UV_BIN}" run --locked python -m motion_extraction.dancetree.run_dancetree_pipeline \
    --database_csv_path="${DEST_DIR}/db.csv" \
    --video_srcdir="${VIDEO_DIR}" \
    --holistic_data_srcdir="${DEST_DIR}/holistic_data" \
    --pose2d_data_srcdir="${DEST_DIR}/pose2d_data" \
    --temp_dir="${DEST_DIR}/temp" \
    --bundle_export_path="${DEST_DIR}/bundle/nonmedia" \
    --bundle_media_export_path="${DEST_DIR}/bundle/media" \
    --include_thumbnail_in_bundle \
    --include_audio_in_bundle \
    --holistic_debug_frames_dir="${DEST_DIR}/holistic_debug_frames" \
    --debug_frame_whitelist="last-christmas-tutorial*" \
    --artifact_archive_root="${DEST_DIR}/artifact-archive" \
    "$@"
