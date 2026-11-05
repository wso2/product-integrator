#!/usr/bin/env bash
# Names one publish's own artifacts directory, relative to the bucket's `artifacts/` prefix and to
# WSO2_UPDATE_ARTIFACTS_URL:
#
#     <product>/releases/<label>[-<kind>]-<UTC timestamp>
#
# Every publish writes under a directory nothing else ever writes to, so a later publish cannot
# change the bytes or signed statements an earlier document points at, and everything in it can be
# cached as immutable. Both publishers (build.yml for a release, publish-components.yml for a
# component-only publish) call this, so the layout cannot drift between them.
#
# Usage: artifacts-dir.sh [--at <epoch-seconds>] <label> [kind]
#   label  the app version (a release) or the app line (a component publish)
#   kind   optional, e.g. `components`, so a component publish is told apart from a release
#   --at   the moment to stamp; defaults to now. A component publish passes its document's sequence.
set -euo pipefail

# The product segment keeps this feed apart from integrator-support/ and agent-builder/.
PRODUCT=integrator

at=""
if [ "${1:-}" = "--at" ]; then
	at="${2:-}"
	if [[ ! "${at}" =~ ^[0-9]+$ ]]; then
		echo "--at needs epoch seconds, got '${at}'" >&2
		exit 1
	fi
	shift 2
fi
label="${1:-}"
kind="${2:-}"
if [ -z "${label}" ]; then
	echo "usage: artifacts-dir.sh [--at <epoch-seconds>] <label> [kind]" >&2
	exit 1
fi

if [ -n "${at}" ]; then
	# GNU date on the runners, BSD date for a local run.
	stamp=$(date -u -d "@${at}" +%Y%m%dT%H%M%SZ 2>/dev/null || date -u -r "${at}" +%Y%m%dT%H%M%SZ)
else
	stamp=$(date -u +%Y%m%dT%H%M%SZ)
fi

name="${label}${kind:+-${kind}}-${stamp}"
# One segment of a URL and of an S3 key. `+` is legal in a version, but some layers in front of the
# bucket decode it to a space, so it is refused rather than published as a URL that only works
# through some of them.
if [[ ! "${name}" =~ ^[0-9A-Za-z._-]+$ ]]; then
	echo "cannot name an artifacts directory after '${name}': only [0-9A-Za-z._-] is allowed" >&2
	exit 1
fi
echo "${PRODUCT}/releases/${name}"
