#!/usr/bin/env bash
# Builds the icp component: upstream's ICP distribution (same for every platform) with its launchers
# patched to run on our JRE (icp/*.patch). Installers bundle this zip and the update source publishes
# the same one, so a seeded ICP and an updated one are identical.
#
# Usage: package-icp.sh <icp_version> <out_dir> [upstream_zip]
#   upstream_zip: use this file instead of downloading from integration-control-plane
# Output: <out_dir>/icp-<icp_version>.zip
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 <icp_version> <out_dir> [upstream_zip]" >&2
  exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ICP_VERSION="$1"
OUT_DIR="$2"
UPSTREAM_ZIP="${3:-}"

WORK=$(mktemp -d)
trap 'rm -rf "${WORK}"' EXIT

if [ -z "${UPSTREAM_ZIP}" ]; then
  URL="https://github.com/wso2/integration-control-plane/releases/download/v${ICP_VERSION}/wso2-integration-control-plane-${ICP_VERSION}.zip"
  UPSTREAM_ZIP="${WORK}/upstream.zip"
  echo "Downloading ${URL}"
  curl -fsSL --retry 3 -o "${UPSTREAM_ZIP}" "${URL}"
fi

unzip -q "${UPSTREAM_ZIP}" -d "${WORK}/upstream"
TOP_DIRS=("${WORK}"/upstream/*/)
if [ "${#TOP_DIRS[@]}" -ne 1 ] || [ ! -f "${TOP_DIRS[0]}bin/icp.sh" ] || [ ! -f "${TOP_DIRS[0]}bin/icp.bat" ]; then
  echo "Error: ${UPSTREAM_ZIP} is not an ICP distribution (one top folder with bin/icp.sh and bin/icp.bat)" >&2
  exit 1
fi

STAGE="${WORK}/stage"
mv "${TOP_DIRS[0]}" "${STAGE}"

# Our launcher changes ride on upstream's scripts as patches. No fuzz: if upstream reworks the lines
# they touch, fail here and refresh the patch (diff -u against the new upstream script).
apply_patch() {
  patch -s -N -F0 -p1 -d "${STAGE}" < "${SCRIPT_DIR}/icp/$1"
}
apply_patch icp.sh.patch
# The patch is LF; restore CRLF after, since cmd.exe mis-parses labels and gotos in LF batch files.
tr -d '\r' < "${STAGE}/bin/icp.bat" > "${WORK}/icp.bat"
mv "${WORK}/icp.bat" "${STAGE}/bin/icp.bat"
apply_patch icp.bat.patch
awk '{ printf "%s\r\n", $0 }' "${STAGE}/bin/icp.bat" > "${WORK}/icp.bat"
mv "${WORK}/icp.bat" "${STAGE}/bin/icp.bat"
chmod +x "${STAGE}"/bin/*

mkdir -p "${OUT_DIR}"
OUT_ZIP="$(cd "${OUT_DIR}" && pwd)/icp-${ICP_VERSION}.zip"
rm -f "${OUT_ZIP}"
# Same inputs must give the same bytes: the CDN path has no build in it, so a re-publish of the same
# version overwrites the object that earlier signed documents point at.
(cd "${STAGE}" && find . -exec touch -h -d 2000-01-01T00:00:00Z {} + \
  && find . -mindepth 1 | LC_ALL=C sort | TZ=UTC zip -qX -@ "${OUT_ZIP}")
echo "Wrote ${OUT_ZIP}"
