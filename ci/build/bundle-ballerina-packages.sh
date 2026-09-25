#!/usr/bin/env bash
# Resolve the Ballerina Central packages a product flavor pre-bundles (ci/build/ballerina-packages.properties)
# and stage them as an overlay for the bundled distribution's package repository.
#
# The installer scripts copy the staged tree into <ballerina>/components/.../repo/bala, which the
# Ballerina compiler resolves before it reaches Ballerina Central. That is what makes a freshly
# installed product able to build the projects its own templates generate without a network round
# trip — see ci/build/ballerina-packages.properties for why that matters.
#
# Resolution runs against the *same* distribution the installer bundles, so the closure staged here
# is only the delta: anything the distribution already ships at a compatible version is resolved
# from the distribution and never lands in the overlay.
#
# Versions are whatever Ballerina Central resolves as newest-compatible at build time; there is no
# pinning, because Ballerina honours a pin only through a *complete* Dependencies.toml and quietly
# discards a partial one as corrupted. <output-dir>/bundled-packages.txt is the record of what a
# given build actually staged.
#
# Usage: ci/build/bundle-ballerina-packages.sh <ballerina-zip> <output-dir> [flavor]
#          <ballerina-zip>  ballerina-<version>-swan-lake-<platform>.zip, as downloaded by the build.
#                           May be empty for a flavor that bundles nothing, which needs no distribution.
#          <output-dir>     created/replaced; <output-dir>/bala is the repo overlay, and
#                           <output-dir>/bundled-packages.txt records what was staged
#          [flavor]         product flavor (default: $PRODUCT_FLAVOR, else 'integrator')
#
#        ci/build/bundle-ballerina-packages.sh --packages-for <flavor>
#          Print the configured package list and exit. Lets a caller skip the (large) distribution
#          download for a flavor that bundles nothing, without restating the config in YAML.
#
# Env:
#   BALLERINA_BUNDLE_JDK   JDK home to run `bal` with. Defaults to the JDK inside the Ballerina zip,
#                          then JAVA_HOME_21_X64, then JAVA_HOME.
#
# A flavor with no packages configured produces an empty overlay and exits 0, so callers never have
# to branch on the flavor themselves.
#
# Requires: unzip, and a JDK the bundled Ballerina release accepts.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PACKAGES_FILE="${SCRIPT_DIR}/ballerina-packages.properties"

if [ "${1:-}" = "--packages-for" ]; then
  if [ "$#" -ne 2 ]; then
    echo "Usage: $0 --packages-for <flavor>" >&2
    exit 1
  fi
  awk -F= -v k="$2.packages" '$1 == k { print substr($0, index($0, "=") + 1); exit }' \
    "${PACKAGES_FILE}" | tr -d '\r'
  exit 0
fi

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <ballerina-zip> <output-dir> [flavor]" >&2
  exit 1
fi

BALLERINA_ZIP="$1"
OUTPUT_DIR="$2"
FLAVOR="${3:-${PRODUCT_FLAVOR:-integrator}}"

case "${FLAVOR}" in
  integrator|agent-builder) ;;
  *) echo "Error: unknown flavor '${FLAVOR}' (expected 'integrator' or 'agent-builder')" >&2; exit 1 ;;
esac

if [ ! -f "${PACKAGES_FILE}" ]; then
  echo "Error: ${PACKAGES_FILE} not found" >&2
  exit 1
fi

read_property() {
  awk -F= -v k="$1" '$1 == k { print substr($0, index($0, "=") + 1); exit }' "${PACKAGES_FILE}" | tr -d '\r'
}

PACKAGE_LIST=$(read_property "${FLAVOR}.packages")

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}/bala"
OUTPUT_DIR=$(cd "${OUTPUT_DIR}" && pwd)

# One line per staged package, for the build log and for anyone auditing what an installer carries.
# Written on every path -- including the ones that stage nothing -- so that a consumer can always
# tell "this flavor bundles nothing" from "the staging step never ran", and so the overlay is never
# a zero-file directory (an empty directory does not survive a CI artifact round trip).
write_manifest() {
  {
    echo "# flavor=${FLAVOR} distribution=${DIST_VERSION:-n/a}"
    find "${OUTPUT_DIR}/bala" -mindepth 3 -maxdepth 3 -type d \
      | sed "s|^${OUTPUT_DIR}/bala/||" \
      | awk -F/ '{ print $1 "/" $2 ":" $3 }' \
      | sort
  } > "${OUTPUT_DIR}/bundled-packages.txt"
}

if [ -z "${PACKAGE_LIST}" ]; then
  write_manifest
  echo "[bundle-ballerina-packages] flavor '${FLAVOR}' bundles no extra packages; staged an empty overlay."
  exit 0
fi

# Split on commas, dropping surrounding whitespace so the properties file can stay readable.
IFS=',' read -r -a RAW_PACKAGES <<< "${PACKAGE_LIST}"
PACKAGES=()
for entry in "${RAW_PACKAGES[@]}"; do
  entry=$(printf '%s' "${entry}" | tr -d '[:space:]')
  if [ -n "${entry}" ]; then
    PACKAGES+=("${entry}")
  fi
done
if [ ${#PACKAGES[@]} -eq 0 ]; then
  write_manifest
  echo "[bundle-ballerina-packages] flavor '${FLAVOR}' bundles no extra packages; staged an empty overlay."
  exit 0
fi

# Deliberately checked here rather than up front: a flavor that bundles nothing never needs a
# distribution, so its caller is allowed to skip the download and pass an empty path.
if [ -z "${BALLERINA_ZIP}" ] || [ ! -f "${BALLERINA_ZIP}" ]; then
  echo "Error: flavor '${FLAVOR}' bundles ${PACKAGES[*]}, which needs the distribution zip, but '${BALLERINA_ZIP}' is not a file." >&2
  exit 1
fi
BALLERINA_ZIP=$(cd "$(dirname "${BALLERINA_ZIP}")" && pwd)/$(basename "${BALLERINA_ZIP}")

WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

echo "[bundle-ballerina-packages] flavor=${FLAVOR} packages=${PACKAGES[*]}"

# --- the distribution the installer will ship -------------------------------------------------
# Resolving against this exact release is the whole point: a newer `ballerina/ai` than the one the
# release bundles has to be staged, an equal-or-newer one must not be.
echo "[bundle-ballerina-packages] extracting ${BALLERINA_ZIP##*/}"
unzip -q -o "${BALLERINA_ZIP}" -d "${WORK_DIR}/zip"
DIST_DIR=$(find "${WORK_DIR}/zip" -maxdepth 3 -type d -path '*/distributions/ballerina-*' | head -1)
if [ -z "${DIST_DIR}" ] || [ ! -x "${DIST_DIR}/bin/bal" ]; then
  echo "Error: no Ballerina distribution with bin/bal found inside ${BALLERINA_ZIP}" >&2
  exit 1
fi
DIST_VERSION=$(basename "${DIST_DIR}" | sed 's/^ballerina-//')
echo "[bundle-ballerina-packages] resolving against distribution ${DIST_VERSION}"

# --- a JDK to run it with ----------------------------------------------------------------------
# The zip ships one under dependencies/; prefer it, because it is by definition the JDK this
# Ballerina release was built against. JAVA_HOME on a runner can be an older major the compiler
# refuses.
if [ -z "${BALLERINA_BUNDLE_JDK:-}" ]; then
  BALLERINA_BUNDLE_JDK=$(find "${WORK_DIR}/zip" -maxdepth 3 -type d -name 'jdk-*' | head -1)
fi
if [ -z "${BALLERINA_BUNDLE_JDK}" ] || [ ! -x "${BALLERINA_BUNDLE_JDK}/bin/java" ]; then
  BALLERINA_BUNDLE_JDK="${JAVA_HOME_21_X64:-${JAVA_HOME:-}}"
fi
if [ -z "${BALLERINA_BUNDLE_JDK}" ] || [ ! -x "${BALLERINA_BUNDLE_JDK}/bin/java" ]; then
  echo "Error: no usable JDK. Set BALLERINA_BUNDLE_JDK to a JDK home." >&2
  exit 1
fi
echo "[bundle-ballerina-packages] JDK: ${BALLERINA_BUNDLE_JDK}"

# BALLERINA_HOME_DIR is the user-level Ballerina directory (`~/.ballerina`). Pointing it at an empty
# scratch dir is what makes the result a clean delta rather than a snapshot of whatever this runner
# happened to have cached, and it keeps the run from depending on runner state at all.
BAL_USER_HOME="${WORK_DIR}/ballerina-user-home"
mkdir -p "${BAL_USER_HOME}"

run_bal() {
  ( cd "${PROBE_DIR}" && \
    JAVA_HOME="${BALLERINA_BUNDLE_JDK}" \
    BALLERINA_HOME="${DIST_DIR}" \
    BALLERINA_HOME_DIR="${BAL_USER_HOME}" \
    "${DIST_DIR}/bin/bal" "$@" )
}

# --- a probe package that imports everything ---------------------------------------------------
# Building one project that imports the whole list (rather than `bal pull` per package) is what
# resolves the *transitive* closure, at versions that are mutually compatible — `bal pull` fetches
# one package and leaves its dependencies to be fetched at build time, i.e. on the user's machine,
# which is exactly what this is meant to prevent.
PROBE_DIR="${WORK_DIR}/probe"
mkdir -p "${PROBE_DIR}"
cat > "${PROBE_DIR}/Ballerina.toml" <<EOF
[package]
org = "wso2"
name = "bundle_probe"
version = "0.1.0"
distribution = "${DIST_VERSION}"
EOF

{
  for pkg in "${PACKAGES[@]}"; do
    org="${pkg%%/*}"
    name="${pkg#*/}"
    if [ -z "${org}" ] || [ -z "${name}" ] || [ "${org}" = "${pkg}" ]; then
      echo "Error: malformed package entry '${pkg}' (expected <org>/<name>)" >&2
      exit 1
    fi
    echo "import ${org}/${name} as _;"
  done
} > "${PROBE_DIR}/main.bal"

echo "[bundle-ballerina-packages] resolving closure from Ballerina Central"
if ! run_bal build > "${WORK_DIR}/resolve.log" 2>&1; then
  echo "Error: could not resolve ${PACKAGES[*]} against distribution ${DIST_VERSION}." >&2
  cat "${WORK_DIR}/resolve.log" >&2
  exit 1
fi
sed 's/^/    /' "${WORK_DIR}/resolve.log"

CENTRAL_BALA="${BAL_USER_HOME}/repositories/central.ballerina.io/bala"
if [ ! -d "${CENTRAL_BALA}" ]; then
  # Every requested package was already in the distribution at a compatible version. Nothing to
  # stage, and nothing wrong — the installer still ships a product that resolves them offline.
  write_manifest
  echo "[bundle-ballerina-packages] distribution ${DIST_VERSION} already satisfies every requested package; overlay is empty."
  exit 0
fi

# --- prove the overlay is self-sufficient ------------------------------------------------------
# An offline rebuild against (distribution + this exact closure) is the same resolution the user's
# first build performs once the overlay is merged into the distribution repo. If anything is
# missing it fails here, in CI, instead of on a disconnected machine after install.
echo "[bundle-ballerina-packages] verifying the closure resolves offline"
# The compiled-module cache the first build left behind is derived state; dropping it forces this
# pass to resolve from the balas alone -- which is all the overlay actually carries.
rm -rf "${PROBE_DIR}/target" "${BAL_USER_HOME}/repositories/central.ballerina.io"/cache-*
if ! run_bal build --offline > "${WORK_DIR}/verify.log" 2>&1; then
  echo "Error: the staged closure does not resolve offline — the overlay is incomplete." >&2
  cat "${WORK_DIR}/verify.log" >&2
  exit 1
fi

cp -R "${CENTRAL_BALA}/." "${OUTPUT_DIR}/bala/"
write_manifest

STAGED_COUNT=$(find "${OUTPUT_DIR}/bala" -mindepth 3 -maxdepth 3 -type d | wc -l | tr -d ' ')
OVERLAY_SIZE=$(du -sh "${OUTPUT_DIR}/bala" | cut -f1 | tr -d ' ')
echo "[bundle-ballerina-packages] staged ${STAGED_COUNT} package(s), ${OVERLAY_SIZE}, into ${OUTPUT_DIR}/bala"
sed 's/^/    /' "${OUTPUT_DIR}/bundled-packages.txt"
