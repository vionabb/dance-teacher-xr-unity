#!/bin/bash

# Copy a read-only video dataset into the persistent local cache. This is the
# only video-cache writer; pipeline runs receive the cache as a read-only input.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REMOTE_PATH="${1:-}"
CACHE_ROOT="${CACHE_ROOT:-${WORKSPACE_DIR}/temp/cached}"

if [[ "${REMOTE_PATH}" != "referencevideos" && "${REMOTE_PATH}" != "userstudydata" ]]; then
    echo "Usage: $0 {referencevideos|userstudydata}" >&2
    exit 2
fi

if ! command -v rclone >/dev/null 2>&1; then
    echo "Expected rclone on PATH and a configured read-only dataset remote." >&2
    exit 1
fi

CACHE_DIR="${CACHE_ROOT}/${REMOTE_PATH}"
mkdir -p "${CACHE_DIR}"
echo "Refreshing read-only video cache: dataset:${REMOTE_PATH} -> ${CACHE_DIR}"
exec rclone copy "dataset:${REMOTE_PATH}" "${CACHE_DIR}" --progress
