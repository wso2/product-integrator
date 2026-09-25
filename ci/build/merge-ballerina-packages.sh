#!/usr/bin/env bash
# Merge a staged Ballerina package overlay into an installer payload.
#
# The overlay is produced by ci/build/bundle-ballerina-packages.sh and handed to the installers as a
# build artifact. Every installer needs the same two copies and the same sanity checks, so they live
# here rather than pasted into each build.sh. installers/windows/scripts/merge-ballerina-packages.ps1
# is the PowerShell counterpart; keep the two in step.
#
# Usage: ci/build/merge-ballerina-packages.sh <overlay-root> <ballerina-home> <editor-app-dir>
#          <overlay-root>     BALLERINA_PACKAGES_DIR: the overlay ROOT, holding bundled-packages.txt
#                             and (when anything was staged) bala/
#          <ballerina-home>   the bundled distribution in the payload, or "" / a missing path when
#                             this payload ships none (the editor-only profiles)
#          <editor-app-dir>   the payload's editor root, i.e. what vscode.env.appRoot resolves to
#
# The overlay lands in two places:
#   1. <ballerina-home>/repo/bala, so a fresh install resolves the packages immediately;
#   2. <editor-app-dir>/ballerina-packages, where the WI extension finds them and repairs whichever
#      Ballerina home is actually active at startup.
# (2) is not redundant: a ballerina-runtime component update installs the STOCK upstream
# distribution over the bundled one, and a runtime already seeded to the user's data folder at the
# same version is never re-seeded, so without it only brand-new installs would ever get these
# packages. It is also the part an editor-only update replaces, so that path carries them too.
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <overlay-root> <ballerina-home> <editor-app-dir>" >&2
  exit 1
fi

OVERLAY_DIR="$1"
BALLERINA_HOME="$2"
EDITOR_APP_DIR="$3"

log()     { echo "[merge-ballerina-packages] $1"; }
fail()    { echo "[merge-ballerina-packages] ERROR: $1" >&2; exit 1; }

# The manifest, not the presence of bala/, is what says whether an overlay arrived. bala/ is absent
# whenever the flavor stages nothing (an empty directory does not survive a CI artifact round trip),
# so treating a missing directory as "nothing to do" would make a renamed artifact or a changed
# download path indistinguishable from an empty flavor -- and ship an installer that cannot build
# offline, silently, with CI green.
MANIFEST="${OVERLAY_DIR}/bundled-packages.txt"
if [ ! -f "${MANIFEST}" ]; then
  fail "overlay root '${OVERLAY_DIR}' has no manifest (${MANIFEST}).
       The pre-bundled Ballerina package overlay did not arrive. Refusing to ship a distribution
       that may not build offline."
fi

# Manifest lines are "<org>/<name>:<version>"; every other line is a '#' comment (the flavor header
# and the new/upgrade classification). Counting from the manifest keeps one source of truth rather
# than re-deriving it from the directory tree in each caller.
PACKAGE_COUNT=$(grep -c '^[^#]' "${MANIFEST}" || true)
PACKAGE_COUNT=${PACKAGE_COUNT:-0}

if [ "${PACKAGE_COUNT}" -eq 0 ]; then
  log "no pre-bundled Ballerina packages for this flavor (manifest lists none)"
  exit 0
fi

# Guarded rather than piped straight from `find`: under `set -o pipefail` a `find` on a missing
# directory fails the whole substitution and would abort this script before it could say why -- and
# a missing bala/ is exactly the case this check exists to report.
OVERLAY_BALA="${OVERLAY_DIR}/bala"
STAGED_COUNT=0
if [ -d "${OVERLAY_BALA}" ]; then
  STAGED_COUNT=$(find "${OVERLAY_BALA}" -mindepth 3 -maxdepth 3 -type d | wc -l | tr -d ' ')
fi
if [ "${STAGED_COUNT}" -ne "${PACKAGE_COUNT}" ]; then
  fail "overlay is incomplete: ${MANIFEST} lists ${PACKAGE_COUNT} package(s), but ${OVERLAY_BALA} holds ${STAGED_COUNT}."
fi

# Absent for the editor-only profiles, which ship no runtime at all. Not an error: the editor-payload
# copy below is exactly what those profiles rely on.
if [ -n "${BALLERINA_HOME}" ] && [ -d "${BALLERINA_HOME}" ]; then
  log "bundling ${PACKAGE_COUNT} pre-pulled Ballerina package(s) into the distribution repository"
  mkdir -p "${BALLERINA_HOME}/repo/bala"
  cp -R "${OVERLAY_BALA}"/. "${BALLERINA_HOME}/repo/bala/"
else
  log "no bundled Ballerina in this payload; staging for startup repair only"
fi

log "staging the same ${PACKAGE_COUNT} package(s) in the editor payload for startup repair"
rm -rf "${EDITOR_APP_DIR}/ballerina-packages"
mkdir -p "${EDITOR_APP_DIR}/ballerina-packages"
cp -R "${OVERLAY_BALA}" "${EDITOR_APP_DIR}/ballerina-packages/"
cp "${MANIFEST}" "${EDITOR_APP_DIR}/ballerina-packages/"
