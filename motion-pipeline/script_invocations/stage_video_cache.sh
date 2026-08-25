#!/bin/bash

# Populate durable data inputs from the read-only Google Drive dataset.
# Videos use rclone copy (existing files are retained); raw pose artifacts use
# rclone sync because the Drive copy is authoritative for these expensive files.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CODEWORKSPACE_ROOT="$(cd "${WORKSPACE_DIR}/.." && pwd)"
KIND="${1:-}"
DATA_ROOT="${DATA_ROOT:-${CODEWORKSPACE_ROOT}/data}"

case "${KIND}" in
    referencevideos)
        REMOTE_PATH="${REFERENCE_VIDEO_REMOTE_PATH:-referencevideos}"
        LOCAL_PATH="${DATA_ROOT}/reference_motions/videos"
        MODE="copy"
        ;;
    participant-study1-videos)
        REMOTE_PATH="${PARTICIPANT_STUDY1_VIDEO_REMOTE_PATH:-userstudydata/chi2025-performancevideos/userperformances-study1-segmented}"
        LOCAL_PATH="${DATA_ROOT}/participant_motions/chi25_study1/videos/userperformances-study1-segmented"
        MODE="copy"
        ;;
    participant-study2-videos)
        REMOTE_PATH="${PARTICIPANT_STUDY2_VIDEO_REMOTE_PATH:-userstudydata/chi2025-performancevideos/userperformances-study2-segmented}"
        LOCAL_PATH="${DATA_ROOT}/participant_motions/chi25_study2/videos/userperformances-study2-segmented"
        MODE="copy"
        ;;
    reference-raw-poses)
        REMOTE_PATH="${REFERENCE_RAW_POSE_REMOTE_PATH:-}"
        LOCAL_PATH="${DATA_ROOT}/reference_motions/pose-raw"
        MODE="sync"
        ;;
    participant-study1-raw-poses)
        REMOTE_PATH="${PARTICIPANT_STUDY1_RAW_POSE_REMOTE_PATH:-}"
        LOCAL_PATH="${DATA_ROOT}/participant_motions/chi25_study1/pose-raw"
        MODE="sync"
        ;;
    participant-study2-raw-poses)
        REMOTE_PATH="${PARTICIPANT_STUDY2_RAW_POSE_REMOTE_PATH:-}"
        LOCAL_PATH="${DATA_ROOT}/participant_motions/chi25_study2/pose-raw"
        MODE="sync"
        ;;
    *)
        echo "Usage: $0 {referencevideos|participant-study1-videos|participant-study2-videos|reference-raw-poses|participant-study1-raw-poses|participant-study2-raw-poses}" >&2
        echo "Set the matching *_RAW_POSE_REMOTE_PATH for raw-pose synchronization." >&2
        exit 2
        ;;
esac

if [[ "${MODE}" == "sync" && -z "${REMOTE_PATH}" ]]; then
    echo "Set the remote path, e.g. REFERENCE_RAW_POSE_REMOTE_PATH=referencevideos/pose-raw." >&2
    exit 2
fi

if ! command -v rclone >/dev/null 2>&1; then
    echo "Expected rclone on PATH and a configured read-only dataset remote." >&2
    exit 1
fi

mkdir -p "${LOCAL_PATH}"
echo "Refreshing ${MODE} data cache: dataset:${REMOTE_PATH} -> ${LOCAL_PATH}"
exec rclone "${MODE}" "dataset:${REMOTE_PATH}" "${LOCAL_PATH}" --progress
