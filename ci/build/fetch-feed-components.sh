#!/usr/bin/env bash
# Downloads the component artifacts the update feed serves that are NOT built in this repository:
# the JRE for every target and the five bundled WSO2 extensions, from the URLs
# ci/build/update-manifest.config.json names (the same URLs publish-update-source mirrors), so the
# release can publish them next to the cores. A downstream build (the support distribution) then
# has every input of this release on the release itself and fetches nothing from anywhere else.
#
# Usage: fetch-feed-components.sh --versions FILE --out DIR [--config FILE]
#                                 [--ballerina-source github|marketplace] [--mi-source github|marketplace]
# Output: DIR/<component id>/<file>, exactly as the generator would mirror them.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
VERSIONS=""; OUT=""; CONFIG="$SCRIPT_DIR/update-manifest.config.json"; BALLERINA_SOURCE=marketplace; MI_SOURCE=marketplace
while [ $# -gt 0 ]; do
  case "$1" in
    --versions) VERSIONS="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    --config) CONFIG="${2:?}"; shift 2 ;;
    --ballerina-source) BALLERINA_SOURCE="${2:?}"; shift 2 ;;
    --mi-source) MI_SOURCE="${2:?}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$VERSIONS" ] && [ -n "$OUT" ] || { echo "usage: $0 --versions FILE --out DIR [--config FILE] [--ballerina-source X] [--mi-source X]" >&2; exit 2; }
read_property() { awk -F= -v key="$1" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$VERSIONS" | tr -d '\r'; }
mkdir -p "$OUT"
fetch() {
  local id="$1" url="$2" name; name="${url##*/}"
  mkdir -p "$OUT/$id"
  echo "fetching $id: $url"
  curl -fsSL --retry 3 --retry-delay 5 -o "$OUT/$id/$name" "$url"
}
COUNT=$(jq '.components | length' "$CONFIG")
for ((i = 0; i < COUNT; i++)); do
  C=$(jq -c ".components[$i]" "$CONFIG")
  ID=$(jq -r '.id' <<< "$C"); KIND=$(jq -r '.kind' <<< "$C")
  URL=$(jq -r '.url // ""' <<< "$C")
  [ -n "$URL" ] || continue   # ballerina-runtime, icp and the WI extension are built here, not fetched
  VERSION=$(read_property "$(jq -r '.versionKey' <<< "$C")")
  [ -n "$VERSION" ] || { echo "error: no version for $ID in $VERSIONS" >&2; exit 1; }
  if [ "$ID" = "jre" ]; then
    for t in $(jq -r '.targets[]' "$CONFIG"); do
      P=$(jq -r --arg t "$t" '.platformTokens.jre[$t]' "$CONFIG")
      fetch "$ID" "$(printf '%s' "$URL" | sed "s/{version}/$VERSION/g; s/{jrePlatform}/$P/g")"
    done
    continue
  fi
  case "$ID" in wso2.ballerina) F="$BALLERINA_SOURCE" ;; wso2.micro-integrator) F="$MI_SOURCE" ;; *) F=marketplace ;; esac
  if [ "$F" != "marketplace" ]; then
    URL=$(jq -r --arg f "$F" '.sources[$f] // ""' <<< "$C"); [ -n "$URL" ] || { echo "error: $ID has no source URL for flavor $F" >&2; exit 1; }
  fi
  fetch "$ID" "$(printf '%s' "$URL" | sed "s/{version}/$VERSION/g")"
done
echo; find "$OUT" -type f | sort
