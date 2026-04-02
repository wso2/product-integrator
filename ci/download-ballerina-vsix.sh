#!/usr/bin/env bash
set -euo pipefail

VERSION=${1:?Usage: ./ci/download-ballerina-vsix.sh <ballerina-extension-version>}
ROOT_DIR=${2:-$(pwd)}
VSCODE_DIR="${ROOT_DIR}/lib/vscode"
VSIX_DIR="${VSCODE_DIR}/.build/vsix"
VSIX_NAME="ballerina-${VERSION}.vsix"
VSIX_RELATIVE_PATH=".build/vsix/${VSIX_NAME}"
VSIX_URL="https://github.com/wso2/ballerina-vscode/releases/download/v${VERSION}/${VSIX_NAME}"

mkdir -p "${VSIX_DIR}"

echo "Downloading ${VSIX_NAME} from ${VSIX_URL}"
if ! curl -fL --retry 3 --retry-delay 2 -o "${VSIX_DIR}/${VSIX_NAME}" "${VSIX_URL}"; then
  echo "Failed to download ${VSIX_NAME}." >&2
  echo "Make sure the GitHub release tag v${VERSION} exists in wso2/ballerina-vscode and includes the asset ${VSIX_NAME}." >&2
  echo "Attempted URL: ${VSIX_URL}" >&2
  exit 1
fi

printf '%s\n' "${VSIX_RELATIVE_PATH}"
