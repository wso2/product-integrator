#!/usr/bin/env bash
# Resolve the Ballerina Central packages a product flavor pre-bundles (ci/build/ballerina-packages.properties)
# and stage them as an overlay for the bundled distribution's package repository.
#
# ci/build/merge-ballerina-packages.sh copies the staged tree into <ballerina-home>/repo/bala, the
# distribution's own package repository, which the Ballerina compiler resolves before it reaches
# Ballerina Central. That is what makes a freshly installed product able to build the projects its
# own templates generate without a network round trip — see ci/build/ballerina-packages.properties
# for why that matters.
#
# Resolution runs against the *same* distribution the installer bundles, so the closure staged here
# is only the delta: anything the distribution already ships at a compatible version is resolved
# from the distribution and never lands in the overlay.
#
# Versions are whatever Ballerina Central resolves as newest-compatible at build time; there is no
# pinning, because Ballerina honors a pin only through a *complete* Dependencies.toml and quietly
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

if [ ! -f "${PACKAGES_FILE}" ]; then
  echo "Error: ${PACKAGES_FILE} not found" >&2
  exit 1
fi

read_property() {
  awk -F= -v k="$1" '$1 == k { print substr($0, index($0, "=") + 1); exit }' "${PACKAGES_FILE}" | tr -d '\r'
}

# Flavors are whatever the properties file declares, so adding one is a config change rather than a
# code change here. This matches the KEY rather than reading its value, because read_property cannot
# tell an undeclared flavor from one that deliberately bundles nothing — and quietly treating a
# typo'd flavor as "bundles nothing" would ship an installer missing every package it should carry.
require_flavor() {
  if ! awk -F= -v k="$1.packages" '$1 == k { found = 1 } END { exit !found }' "${PACKAGES_FILE}"; then
    echo "Error: no '$1.packages' entry in ${PACKAGES_FILE}. Declare the flavor there first." >&2
    exit 1
  fi
}

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <ballerina-zip> <output-dir> [flavor]" >&2
  exit 1
fi

BALLERINA_ZIP="$1"
OUTPUT_DIR="$2"
FLAVOR="${3:-${PRODUCT_FLAVOR:-integrator}}"
require_flavor "${FLAVOR}"

PACKAGE_LIST=$(read_property "${FLAVOR}.packages")

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}/bala"
OUTPUT_DIR=$(cd "${OUTPUT_DIR}" && pwd)

# One line per staged package, for the build log and for anyone auditing what an installer carries.
# Written on every path — including the ones that stage nothing — so that a consumer can always
# tell "this flavor bundles nothing" from "the staging step never ran", and so the overlay is never
# a zero-file directory (an empty directory does not survive a CI artifact round trip).
staged_packages() {
  find "${OUTPUT_DIR}/bala" -mindepth 3 -maxdepth 3 -type d \
    | sed "s|^${OUTPUT_DIR}/bala/||" \
    | awk -F/ '{ print $1 "/" $2 ":" $3 }' \
    | sort
}

# Classification lines for the manifest header and the build log: "new" for a package the
# distribution does not carry at all, "upgrade" for a newer version of one it does — naming the
# version being superseded, since that is the one other offline projects resolve today.
classify_staged() {
  local entry pkg dist_versions
  while IFS= read -r entry; do
    [ -n "${entry}" ] || continue
    pkg="${entry%:*}"
    dist_versions=$(awk -F: -v p="${pkg}" '$1 == p { printf "%s%s", sep, $2; sep = ", " }' "${DIST_INVENTORY:-/dev/null}")
    if [ -n "${dist_versions}" ]; then
      echo "upgrade: ${entry} (distribution ships ${dist_versions})"
    else
      echo "new:     ${entry}"
    fi
  done < <(staged_packages)
}

write_manifest() {
  {
    echo "# flavor=${FLAVOR} distribution=${DIST_VERSION:-n/a}"
    if [ -n "${DIST_INVENTORY:-}" ] && [ -f "${DIST_INVENTORY}" ]; then
      classify_staged | sed 's/^/# /'
    fi
    staged_packages
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
# Resolving against this exact release is the whole point: a `ballerina/ai` newer than the one the
# release bundles has to be staged, whereas if the release already ships an equal or newer one,
# nothing should be staged for it at all.
echo "[bundle-ballerina-packages] extracting ${BALLERINA_ZIP##*/}"
unzip -q -o "${BALLERINA_ZIP}" -d "${WORK_DIR}/zip"
DIST_DIR=$(find "${WORK_DIR}/zip" -maxdepth 3 -type d -path '*/distributions/ballerina-*' | head -1)
if [ -z "${DIST_DIR}" ] || [ ! -x "${DIST_DIR}/bin/bal" ]; then
  echo "Error: no Ballerina distribution with bin/bal found inside ${BALLERINA_ZIP}" >&2
  exit 1
fi
DIST_VERSION=$(basename "${DIST_DIR}" | sed 's/^ballerina-//')
echo "[bundle-ballerina-packages] resolving against distribution ${DIST_VERSION}"

# What the distribution ships on its own, captured now because the verification step below copies
# the overlay into this same repository. Used to tell a genuinely absent package from an UPGRADE of
# one the distribution already carries — the latter changes which version other offline projects in
# this product resolve to, so it is reported rather than left for someone to notice.
DIST_INVENTORY="${WORK_DIR}/distribution-packages.txt"
find "${DIST_DIR}/repo/bala" -mindepth 3 -maxdepth 3 -type d \
  | sed "s|^${DIST_DIR}/repo/bala/||" \
  | awk -F/ '{ print $1 "/" $2 ":" $3 }' \
  | sort > "${DIST_INVENTORY}"

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

# $1 is the user-level Ballerina directory to run against; the rest are `bal` arguments.
run_bal() {
  local home_dir="$1"; shift
  ( cd "${PROBE_DIR}" && \
    JAVA_HOME="${BALLERINA_BUNDLE_JDK}" \
    BALLERINA_HOME="${DIST_DIR}" \
    BALLERINA_HOME_DIR="${home_dir}" \
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
if ! run_bal "${BAL_USER_HOME}" build > "${WORK_DIR}/resolve.log" 2>&1; then
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

# The resolved graph, kept alongside the overlay: it names the exact version of every package the
# staged closure was resolved against, which is the record of what a given build actually shipped.
if [ -f "${PROBE_DIR}/Dependencies.toml" ]; then
  cp "${PROBE_DIR}/Dependencies.toml" "${OUTPUT_DIR}/resolved-dependencies.toml"
fi

# --- prove the overlay is self-sufficient, in the layout it actually ships in -------------------
# Verifying against BAL_USER_HOME would only prove the dependency SET is complete: `bal` would still
# be finding those packages in the central cache, which is not where the product puts them. So put
# the closure where the installers put it — the distribution's own repo/bala — and resolve with a
# pristine user home. That is exactly what a user's first build does after install.
#
# DIST_DIR is this script's own throwaway extraction (WORK_DIR), so mutating it affects nothing the
# installers later read.
echo "[bundle-ballerina-packages] verifying the closure resolves from the distribution repository"
cp -R "${CENTRAL_BALA}/." "${DIST_DIR}/repo/bala/"
VERIFY_HOME="${WORK_DIR}/verify-user-home"
mkdir -p "${VERIFY_HOME}"
# The generated Dependencies.toml is dropped too: a user's first build starts without one, and
# keeping it would let a recorded version stand in for resolution that has to happen for real.
rm -rf "${PROBE_DIR}/target" "${PROBE_DIR}/Dependencies.toml"
if ! run_bal "${VERIFY_HOME}" build --offline > "${WORK_DIR}/verify-offline.log" 2>&1; then
  echo "Error: the staged closure does not resolve from <ballerina-home>/repo/bala — the overlay is incomplete." >&2
  cat "${WORK_DIR}/verify-offline.log" >&2
  exit 1
fi

# Offline success alone does not prove the product never reaches out: with the network up, `bal` is
# free to prefer a newer version from Central. Resolve once more WITH network against another
# pristine home and assert nothing was downloaded — the actual claim being made, which is that a
# connected first build does not have to pull either.
ONLINE_HOME="${WORK_DIR}/online-user-home"
mkdir -p "${ONLINE_HOME}"
rm -rf "${PROBE_DIR}/target" "${PROBE_DIR}/Dependencies.toml"
if ! run_bal "${ONLINE_HOME}" build > "${WORK_DIR}/verify-online.log" 2>&1; then
  echo "Error: the probe package does not build against the staged distribution with network access." >&2
  cat "${WORK_DIR}/verify-online.log" >&2
  exit 1
fi
# Guarded rather than piped straight from `find`: the success case is that this directory does not
# exist at all, and under `set -o pipefail` a failing `find` in a command substitution would abort
# the script — silently, on the one path that means everything worked.
ONLINE_BALA="${ONLINE_HOME}/repositories/central.ballerina.io/bala"
PULLED=0
if [ -d "${ONLINE_BALA}" ]; then
  PULLED=$(find "${ONLINE_BALA}" -mindepth 3 -maxdepth 3 -type d | wc -l | tr -d ' ')
fi
if [ "${PULLED}" -ne 0 ]; then
  echo "Error: a connected build still pulled ${PULLED} package(s) from Ballerina Central, so the overlay does not cover what the product needs:" >&2
  find "${ONLINE_BALA}" -mindepth 3 -maxdepth 3 -type d | sed "s|.*/bala/||;s|^|    |" >&2
  exit 1
fi

cp -R "${CENTRAL_BALA}/." "${OUTPUT_DIR}/bala/"
write_manifest

STAGED_COUNT=$(staged_packages | wc -l | tr -d ' ')
OVERLAY_SIZE=$(du -sh "${OUTPUT_DIR}/bala" | cut -f1 | tr -d ' ')
echo "[bundle-ballerina-packages] staged ${STAGED_COUNT} package(s), ${OVERLAY_SIZE}, into ${OUTPUT_DIR}/bala"
classify_staged | sed 's/^/    /'

# Called out separately because it is the one consequence that reaches beyond the packages asked
# for: a superseded module stays in the repository, but the newer one wins, so EVERY offline project
# in this product resolves the staged version. Reviewing this line each time the pinned distribution
# moves is cheaper than discovering the change from a bug report.
UPGRADE_COUNT=$(classify_staged | grep -c '^upgrade:' || true)
if [ "${UPGRADE_COUNT:-0}" -gt 0 ]; then
  echo "[bundle-ballerina-packages] note: ${UPGRADE_COUNT} of these supersede a module distribution ${DIST_VERSION} already ships."
  echo "[bundle-ballerina-packages] Offline projects in this product will resolve the staged version instead of the bundled one."
fi
