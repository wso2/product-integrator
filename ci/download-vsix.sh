#!/usr/bin/env bash
set -euo pipefail

REPO=${1:?Usage: ./ci/download-vsix.sh <owner/repo> <extension-version> [vsix-name] [root-dir]}
VERSION=${2:?Usage: ./ci/download-vsix.sh <owner/repo> <extension-version> [vsix-name] [root-dir]}

# Normalize an optional leading "v" in tags and reject path-like values.
VERSION="${VERSION#v}"
VSIX_NAME=${3:-"ballerina-${VERSION}.vsix"}
ROOT_DIR=${4:-$(pwd)}

if [[ "${VERSION}" == *"/"* || "${VERSION}" == *".."* ]]; then
  echo "Invalid extension version: ${VERSION}" >&2
  exit 1
fi
if [[ "${VSIX_NAME}" == *"/"* || "${VSIX_NAME}" == *".."* ]]; then
  echo "Invalid VSIX file name: ${VSIX_NAME}" >&2
  exit 1
fi

VSCODE_DIR="${ROOT_DIR}/lib/vscode"
VSIX_DIR="${VSCODE_DIR}/.build/vsix"
VSIX_RELATIVE_PATH=".build/vsix/${VSIX_NAME}"
VSIX_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${VSIX_NAME}"

mkdir -p "${VSIX_DIR}"

echo "Downloading ${VSIX_NAME} from ${VSIX_URL}" >&2
if ! curl -fL \
  --retry 3 \
  --retry-delay 2 \
  --connect-timeout 15 \
  --max-time 300 \
  -o "${VSIX_DIR}/${VSIX_NAME}" \
  "${VSIX_URL}"; then
  echo "Failed to download ${VSIX_NAME}." >&2
  echo "Make sure the GitHub release tag v${VERSION} exists in ${REPO} and includes the asset ${VSIX_NAME}." >&2
  echo "Attempted URL: ${VSIX_URL}" >&2
  exit 1
fi

printf '%s\n' "${VSIX_RELATIVE_PATH}"
