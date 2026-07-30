#!/usr/bin/env bash
set -euo pipefail

USAGE="Usage: ./ci/download-vsix.sh <owner/repo> <extension-version> [vsix-name] [root-dir] [release-tag]"
REPO=${1:?$USAGE}
VERSION=${2:?$USAGE}
VSIX_NAME=${3:-"ballerina-${VERSION}.vsix"}
ROOT_DIR=${4:-$(pwd)}
# A rolling tag (e.g. wso2/ballerina-vscode's `nightly`) does not match the version inside the vsix,
# so the tag can be given explicitly. Defaults to the conventional v<version> tag.
RELEASE_TAG=${5:-"v${VERSION#v}"}

# Normalize an optional leading "v" in tags and reject path-like values.
VERSION="${VERSION#v}"
if [[ "${VERSION}" == *"/"* || "${VERSION}" == *".."* ]]; then
  echo "Invalid extension version: ${VERSION}" >&2
  exit 1
fi
if [[ "${VSIX_NAME}" == *"/"* || "${VSIX_NAME}" == *".."* ]]; then
  echo "Invalid VSIX file name: ${VSIX_NAME}" >&2
  exit 1
fi
if [[ "${RELEASE_TAG}" == *"/"* || "${RELEASE_TAG}" == *".."* ]]; then
  echo "Invalid release tag: ${RELEASE_TAG}" >&2
  exit 1
fi

VSCODE_DIR="${ROOT_DIR}/lib/vscode"
VSIX_DIR="${VSCODE_DIR}/.build/vsix"
VSIX_RELATIVE_PATH=".build/vsix/${VSIX_NAME}"
VSIX_URL="https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${VSIX_NAME}"

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
  echo "Make sure the GitHub release tag ${RELEASE_TAG} exists in ${REPO} and includes the asset ${VSIX_NAME}." >&2
  echo "Attempted URL: ${VSIX_URL}" >&2
  exit 1
fi

printf '%s\n' "${VSIX_RELATIVE_PATH}"
