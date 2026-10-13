#!/usr/bin/env bash
# Builds the ballerina-runtime component: upstream's plain distribution (ballerina-<v>.zip, no update
# tool or JDK, same for every platform) with its launchers patched (ballerina-runtime/*.patch).
# Installers bundle this zip and the update source publishes the same one, so a seeded runtime and an
# updated one are identical.
#
# Usage: package-ballerina-runtime.sh <ballerina_version> <out_dir> [upstream_zip]
#   upstream_zip: use this file instead of downloading from ballerina-distribution
# Output: <out_dir>/ballerina-runtime-<ballerina_version>.zip
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 <ballerina_version> <out_dir> [upstream_zip]" >&2
  exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BALLERINA_VERSION="$1"
OUT_DIR="$2"
UPSTREAM_ZIP="${3:-}"

WORK=$(mktemp -d)
trap 'rm -rf "${WORK}"' EXIT

if [ -z "${UPSTREAM_ZIP}" ]; then
  # Pre-release tags carry a suffix the asset names drop (v2201.13.6-alpha2 -> ballerina-2201.13.6.zip).
  URL="https://github.com/ballerina-platform/ballerina-distribution/releases/download/v${BALLERINA_VERSION}/ballerina-${BALLERINA_VERSION%%-*}.zip"
  UPSTREAM_ZIP="${WORK}/upstream.zip"
  echo "Downloading ${URL}"
  curl -fsSL --retry 3 -o "${UPSTREAM_ZIP}" "${URL}"
fi

unzip -q "${UPSTREAM_ZIP}" -d "${WORK}/upstream"
TOP_DIRS=("${WORK}"/upstream/*/)
if [ "${#TOP_DIRS[@]}" -ne 1 ] || [ ! -f "${TOP_DIRS[0]}bin/bal" ] || [ ! -f "${TOP_DIRS[0]}bin/bal.bat" ]; then
  echo "Error: ${UPSTREAM_ZIP} is not a plain Ballerina distribution (one top folder with bin/bal and bin/bal.bat)" >&2
  exit 1
fi
# A swan-lake pack carries the update tool and a JDK; we ship our own JRE.
if [ -d "${TOP_DIRS[0]}dependencies" ] || [ -d "${TOP_DIRS[0]}distributions" ]; then
  echo "Error: ${UPSTREAM_ZIP} is a swan-lake pack; use ballerina-<version>.zip" >&2
  exit 1
fi

STAGE="${WORK}/stage"
mv "${TOP_DIRS[0]}" "${STAGE}"
rm -rf "${STAGE}/docs" "${STAGE}/examples"

# Our launcher changes ride on upstream's scripts as patches. No fuzz: if upstream reworks the lines
# they touch, fail here and refresh the patch (diff -u against the new upstream script).
apply_patch() {
  patch -s -N -F0 -p1 -d "${STAGE}" < "${SCRIPT_DIR}/ballerina-runtime/$1"
}
apply_patch bal.patch
# The patch is LF; restore CRLF after, since cmd.exe mis-parses labels and gotos in LF batch files.
tr -d '\r' < "${STAGE}/bin/bal.bat" > "${WORK}/bal.bat"
mv "${WORK}/bal.bat" "${STAGE}/bin/bal.bat"
apply_patch bal.bat.patch
awk '{ printf "%s\r\n", $0 }' "${STAGE}/bin/bal.bat" > "${WORK}/bal.bat"
mv "${WORK}/bal.bat" "${STAGE}/bin/bal.bat"
chmod +x "${STAGE}"/bin/*

mkdir -p "${OUT_DIR}"
OUT_ZIP="$(cd "${OUT_DIR}" && pwd)/ballerina-runtime-${BALLERINA_VERSION}.zip"
rm -f "${OUT_ZIP}"
(cd "${STAGE}" && zip -qrX "${OUT_ZIP}" .)
echo "Wrote ${OUT_ZIP}"
