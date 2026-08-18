#!/usr/bin/env bash
# The one place a product or extension version is ever derived or written.
#
# Reads integrator.version and wi.extension.version from component-versions.properties, applies the
# rules below, writes both back, and mirrors wi.extension.version into wi/wi-extension/package.json
# (package-vsix.js names the .vsix from there, so the two must never diverge).
#
#   product    5.1.0-SNAPSHOT  -> 5.1.0-<yyyymmddHHmm>
#              5.1.0-alpha[N]  -> 5.1.0-alpha[N]            (kept as-is unless --mode release, which
#              5.1.0-rc.1      -> 5.1.0-rc.1                 strips to 5.1.0, or --force-product,
#              5.1.0-beta      -> 5.1.0-beta                 which timestamps it like -SNAPSHOT)
#   extension  1.2.0-SNAPSHOT  -> 1.1.<yymmddHH>     (even minor -> the odd pre-release minor below)
#              1.1.26073014    -> 1.1.<yymmddHH>     (odd minor kept, so the rule is repeatable)
#
# With no flags it is shape-based and idempotent: anything already concrete passes through verbatim.
# That is what makes it safe to run unconditionally in the build - on `builds/nightly` and on release
# branches the versions are already committed, so the build ships exactly what was pinned.
#
# Usage: ./ci/build/apply-version.sh [options]
#   --version <v>        set integrator.version explicitly (the release driver only)
#   --mode <m>           pre-release (default) | release; `release` strips any pre-release qualifier
#                        (-SNAPSHOT, -alpha1, -rc.1, ...) instead of timestamping, and rejects an odd
#                        extension minor (that is the pre-release line)
#   --force-product      re-derive the product timestamp even when the current value is concrete
#   --force-extension    re-derive the extension timestamp even when the current value is concrete
#   --versions-file <p>  default ci/build/component-versions.properties
#   --package-json <p>   default wi/wi-extension/package.json
#                        (both overridable so the script can be dry-run against copies)
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)

VERSIONS_FILE="${REPO_ROOT}/ci/build/component-versions.properties"
PACKAGE_JSON="${REPO_ROOT}/wi/wi-extension/package.json"
EXPLICIT_VERSION=""
MODE="pre-release"
FORCE_EXTENSION="false"
FORCE_PRODUCT="false"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) EXPLICIT_VERSION="${2:?--version needs a value}"; shift 2 ;;
    --mode) MODE="${2:?--mode needs a value}"; shift 2 ;;
    --force-extension) FORCE_EXTENSION="true"; shift ;;
    --force-product) FORCE_PRODUCT="true"; shift ;;
    --versions-file) VERSIONS_FILE="${2:?--versions-file needs a value}"; shift 2 ;;
    --package-json) PACKAGE_JSON="${2:?--package-json needs a value}"; shift 2 ;;
    *) echo "Error: unknown argument '$1'." >&2; exit 1 ;;
  esac
done

if [ "${MODE}" != "pre-release" ] && [ "${MODE}" != "release" ]; then
  echo "Error: --mode must be 'pre-release' or 'release', got '${MODE}'." >&2
  exit 1
fi

for required_file in "${VERSIONS_FILE}" "${PACKAGE_JSON}"; do
  if [ ! -f "${required_file}" ]; then
    echo "Error: ${required_file} not found" >&2
    exit 1
  fi
done

# One UTC clock read: the product and extension stamps must agree, and so must every job that
# consumes the file this run produces.
NOW_LONG=$(date -u +%Y%m%d%H%M)   # product:   5.1.0-202607301412
# yymmddHH, not yymmddHHmm: a 10-digit stamp (2607301412) exceeds 2^31, which the Marketplace
# rejects. Matches ballerina-vscode's convention (5.12.26061907).
# Consequence of the hour granularity: two builds in the same UTC hour derive the same extension
# version. Harmless for the once-daily nightly and for dev-builds (never published), but space
# consecutive release.yml pre-releases more than an hour apart.
NOW_SHORT=$(date -u +%y%m%d%H)    # extension: 1.1.26073014

read_version() {
  local key="$1"
  awk -F= -v version_key="$key" '$1 == version_key { print substr($0, index($0, "=") + 1); exit }' \
    "${VERSIONS_FILE}" | tr -d '\r'
}

# Replace `key=...` in place, preserving comments and ordering.
set_version() {
  local key="$1" value="$2" tmp
  tmp=$(mktemp)
  awk -v key="${key}" -v value="${value}" '
    BEGIN { found = 0 }
    { split($0, parts, "="); if (parts[1] == key) { print key "=" value; found = 1; next } print }
    END { if (!found) print key "=" value }
  ' "${VERSIONS_FILE}" > "${tmp}"
  mv "${tmp}" "${VERSIONS_FILE}"
}

base_of() { printf '%s' "${1%%-*}"; }

require_semver() {
  local value="$1" key="$2"
  if [[ ! "${value}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: ${key} base '${value}' is not <major>.<minor>.<patch>." >&2
    exit 1
  fi
}

# --- product -----------------------------------------------------------------------------------
# The timestamp suffix must be dash-delimited, never a dot: Windows MSI/WiX needs a numeric a.b.c.d
# and the installer scripts split the version at the first '-'.
DECLARED_PRODUCT=$(read_version "integrator.version")
if [ -z "${DECLARED_PRODUCT}" ]; then
  echo "Error: integrator.version must be set in ${VERSIONS_FILE}." >&2
  exit 1
fi

if [ -n "${EXPLICIT_VERSION}" ]; then
  if [[ "${EXPLICIT_VERSION}" == *"-SNAPSHOT" ]]; then
    echo "Error: --version must be a concrete release version, got '${EXPLICIT_VERSION}'." >&2
    exit 1
  fi
  require_semver "$(base_of "${EXPLICIT_VERSION}")" "--version"
  PRODUCT_VERSION="${EXPLICIT_VERSION}"
else
  PRODUCT_BASE=$(base_of "${DECLARED_PRODUCT}")
  if [[ "${DECLARED_PRODUCT}" =~ -[A-Za-z][A-Za-z0-9.]*$ ]] && [ "${MODE}" = "release" ]; then
    require_semver "${PRODUCT_BASE}" "integrator.version"
    PRODUCT_VERSION="${PRODUCT_BASE}"
  elif [[ "${DECLARED_PRODUCT}" == *"-SNAPSHOT" ]] || [ "${FORCE_PRODUCT}" = "true" ]; then
    require_semver "${PRODUCT_BASE}" "integrator.version"
    PRODUCT_VERSION="${PRODUCT_BASE}-${NOW_LONG}"
  else
    PRODUCT_VERSION="${DECLARED_PRODUCT}"
  fi
fi

# --- extension ---------------------------------------------------------------------------------
DECLARED_EXTENSION=$(read_version "wi.extension.version")
if [ -z "${DECLARED_EXTENSION}" ]; then
  echo "Error: wi.extension.version must be set in ${VERSIONS_FILE}." >&2
  exit 1
fi

EXTENSION_BASE=$(base_of "${DECLARED_EXTENSION}")
require_semver "${EXTENSION_BASE}" "wi.extension.version"
EXTENSION_MAJOR=${EXTENSION_BASE%%.*}
EXTENSION_MINOR=${EXTENSION_BASE#*.}
EXTENSION_MINOR=${EXTENSION_MINOR%%.*}

if [ "${MODE}" = "release" ]; then
  if [ $((EXTENSION_MINOR % 2)) -ne 0 ]; then
    echo "Error: wi.extension.version '${DECLARED_EXTENSION}' has an odd minor, which is the" >&2
    echo "       pre-release line. Set it to the stable (even-minor) version before a release." >&2
    exit 1
  fi
  EXTENSION_VERSION="${EXTENSION_BASE}"
elif [[ "${DECLARED_EXTENSION}" == *"-SNAPSHOT" ]] || [ "${FORCE_EXTENSION}" = "true" ]; then
  # Even minor is the stable line; pre-releases ship on the odd minor below it. An already-odd minor
  # is kept as-is, so a derived version can be committed in place and re-derived next time.
  if [ $((EXTENSION_MINOR % 2)) -eq 0 ]; then
    if [ "${EXTENSION_MINOR}" -lt 1 ]; then
      echo "Error: wi.extension.version minor '${EXTENSION_MINOR}' must be above 0 so the" >&2
      echo "       pre-release line (minor - 1) stays valid." >&2
      exit 1
    fi
    EXTENSION_MINOR=$((EXTENSION_MINOR - 1))
  fi
  EXTENSION_VERSION="${EXTENSION_MAJOR}.${EXTENSION_MINOR}.${NOW_SHORT}"
else
  EXTENSION_VERSION="${DECLARED_EXTENSION}"
fi

# A VS Code extension version must be exactly three integers - this is the invariant the whole
# stamping exists for, so assert it rather than discovering it at packaging time.
if [[ ! "${EXTENSION_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: derived extension version '${EXTENSION_VERSION}' is not three integers." >&2
  exit 1
fi

# --- write -------------------------------------------------------------------------------------
set_version "integrator.version" "${PRODUCT_VERSION}"
set_version "wi.extension.version" "${EXTENSION_VERSION}"

VERSION="${EXTENSION_VERSION}" PACKAGE_JSON="${PACKAGE_JSON}" node -e '
  const fs = require("fs");
  const file = process.env.PACKAGE_JSON;
  const raw = fs.readFileSync(file, "utf8");
  const pkg = JSON.parse(raw);
  pkg.version = process.env.VERSION;
  // Preserve the trailing newline so the diff stays on the single version line.
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + (raw.endsWith("\n") ? "\n" : ""));
'

echo "integrator.version=${PRODUCT_VERSION} (was ${DECLARED_PRODUCT})"
echo "wi.extension.version=${EXTENSION_VERSION} (was ${DECLARED_EXTENSION})"
echo "${PACKAGE_JSON} version=${EXTENSION_VERSION}"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "integrator_version=${PRODUCT_VERSION}"
    echo "wi_extension_version=${EXTENSION_VERSION}"
  } >> "${GITHUB_OUTPUT}"
fi
