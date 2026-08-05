#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPOSITORY_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
UV_BIN="${UV_BIN:-uv}"

DEST_DIR="${SMOKE_OUTPUT_DIR:-${WORKSPACE_DIR}/temp/pipeline_test_run_small/}"
VIDEO_DIR="${SMOKE_VIDEO_DIR:-${REPOSITORY_DIR}/data/test-fixtures/smoketest/motionvideo/}"

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
    --temp_dir="${DEST_DIR}/temp/" \
    --bundle_export_path="${DEST_DIR}/bundle/nonmedia/" \
    --bundle_media_export_path="${DEST_DIR}/bundle/media/" \
    --visibility_mode="interpolate" \
    --suppress_update_database_artifacts \
    --suppress_compute_holistic_data_artifacts \
    --suppress_preprocess_pose_data_artifacts \
    --suppress_cumulative_complexity_artifacts \
    --suppress_audio_analysis_artifacts \
    --suppress_add_complexity_artifacts \
    --suppress_bundle_data_artifacts \
    "$@"
