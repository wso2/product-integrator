#!/usr/bin/env bash
# Resolve every *dependent* component to its newest nightly build (or its newest GA release when the
# upstream repo publishes no nightly) and pin the result into component-versions.properties.
#
# It runs on the `builds/nightly` branch before the build is dispatched, so the build itself just
# reads the committed file — which also makes every nightly reproducible from the commit this leaves
# behind.
# The product and extension versions are not touched here; ci/build/apply-version.sh owns those.
#
# Usage: ./ci/build/resolve-nightly-versions.sh [versions-file]
#        Defaults to the real file; pass a copy to dry-run against the live upstream repos.
# Requires: gh (authenticated), curl, jq.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)
VERSIONS_FILE=${1:-"${REPO_ROOT}/ci/build/component-versions.properties"}

if [ ! -f "${VERSIONS_FILE}" ]; then
  echo "Error: ${VERSIONS_FILE} not found" >&2
  exit 1
fi

# Replace `key=...` in place, preserving comments and ordering. When the key is absent it is
# inserted after `anchor=...` (or appended when no anchor is given or found).
#
# Two passes, because a `<key>.tag` line sits *after* its own anchor (`<key>`): a single pass would
# insert at the anchor and then hit the existing line further down, writing the key twice and growing
# the file by one duplicate on every run. Pass 1 decides whether the key is already present; pass 2
# replaces its first occurrence and drops any later duplicates, so this also repairs a file that has
# already accumulated them.
set_property() {
  local key="$1" value="$2" anchor="${3:-}" tmp
  tmp=$(mktemp)
  awk -v key="${key}" -v value="${value}" -v anchor="${anchor}" '
    NR == FNR { split($0, parts, "="); if (parts[1] == key) has_key = 1; next }
    {
      split($0, parts, "=")
      if (parts[1] == key) { if (!written) { print key "=" value; written = 1 } next }
      print
      if (!has_key && !written && anchor != "" && parts[1] == anchor) {
        print key "=" value; written = 1
      }
    }
    END { if (!written) print key "=" value }
  ' "${VERSIONS_FILE}" "${VERSIONS_FILE}" > "${tmp}"
  mv "${tmp}" "${VERSIONS_FILE}"
}

# Drop a `<key>.tag` line, so the pinned file stays as close as possible to the hand-maintained one.
unset_property() {
  local key="$1" tmp
  tmp=$(mktemp)
  awk -v key="${key}" '{ split($0, parts, "="); if (parts[1] != key) print }' \
    "${VERSIONS_FILE}" > "${tmp}"
  mv "${tmp}" "${VERSIONS_FILE}"
}

# Pick a release from `repo` that actually carries an asset matching `asset_regex`, preferring a
# nightly-tagged one. Echoes "<nightly|latest>\t<tag>\t<asset-name>".
#
# Filtering on the asset matters: a release without the file we need is useless to us, and it is
# how wso2/ballerina-vscode's rolling `nightly` release is identified.
#
# The fallback skips alpha/beta/RC releases, so a repo that publishes no nightly pins to a real
# release rather than to whatever pre-release happens to be newest. That matters most for
# ballerina.version, icp.version and ballerina.jre.version, which are the runtime bits actually
# bundled into the product rather than just an extension vsix.
#
# The filter is on the *tag qualifier*, deliberately not on GitHub's `prerelease` flag: the two
# extension repos publish through the VS Code pre-release channel and so flag nearly everything
# `prerelease=true` (93 of wso2/mi-vscode's last 100 releases, 98 of wso2/ballerina-vscode's).
# Filtering on the flag would pin MI to v3.0.0 from Nov 2025 instead of the current v4.1.4. Tag
# shape agrees with the flag on all three runtime repos, where the concern is real, and keeps the
# newest genuine release on the two extension repos.
#
# It also cannot be filtered at the top of the pipeline, since the rolling `nightly` tag has to stay
# selectable by the line above — hence a carried field applied to the fallback line alone.
select_release() {
  local repo="$1" asset_regex="$2" candidates
  # The regex is embedded in a jq string literal, where a lone backslash is an invalid escape.
  local jq_regex="${asset_regex//\\/\\\\}"

  # Releases come back newest-first, so the head of each list is the newest match. The nightly line
  # is emitted first, so `head -1` prefers a nightly and otherwise falls back to the latest release.
  candidates=$(gh api "repos/${repo}/releases?per_page=100" --jq "
    [ .[] | select(.draft == false)
          | {tag: .tag_name,
             nightly: (.tag_name | test(\"nightly\"; \"i\")),
             qualified: (.tag_name | test(\"-(alpha|beta|rc|m[0-9]|snapshot|pre)\"; \"i\")),
             asset: ([.assets[]? | select(.name | test(\"${jq_regex}\")) | .name][0])}
          | select(.asset != null) ]
    | (map(select(.nightly))[0] // empty | \"nightly\t\(.tag)\t\(.asset)\"),
      (map(select(.qualified == false))[0] // empty | \"latest\t\(.tag)\t\(.asset)\")
  ")

  candidates=$(printf '%s\n' "${candidates}" | sed '/^[[:space:]]*$/d' | head -1)
  [ -n "${candidates}" ] || return 1
  printf '%s\n' "${candidates}"
}

# Resolve one GitHub-release-backed component.
#   $1 property key   $2 owner/repo   $3 asset regex (one capture group = the version)
#   $4 conventional tag prefix ("v" for most repos, "" for ballerina-custom-jre)
resolve_github_component() {
  local key="$1" repo="$2" asset_regex="$3" tag_prefix="$4"
  local selection source tag asset version

  if ! selection=$(select_release "${repo}" "${asset_regex}"); then
    echo "Error: no ${repo} release carries an asset matching ${asset_regex}." >&2
    exit 1
  fi

  IFS=$'\t' read -r source tag asset <<< "${selection}"

  # Prefer the tag as the version — it is what the download URLs are built from. A rolling tag such
  # as `nightly` is not version-like, so fall back to the version inside the asset name.
  version="${tag#[vV]}"
  if [[ ! "${version}" =~ ^[0-9] ]]; then
    version=$(printf '%s' "${asset}" | sed -nE "s/${asset_regex}/\1/p")
    if [ -z "${version}" ]; then
      echo "Error: could not extract a version from ${repo} asset '${asset}'." >&2
      exit 1
    fi
  fi

  set_property "${key}" "${version}"
  if [ "${tag}" = "${tag_prefix}${version}" ]; then
    unset_property "${key}.tag"
  else
    # The download URL cannot be derived from the version alone.
    set_property "${key}.tag" "${tag}" "${key}"
  fi

  echo "  ${key}=${version} (${source}: ${repo}@${tag}, asset ${asset})"
}

# Resolve an Open VSX marketplace component. These extensions publish no GitHub releases — the
# product pulls them from Open VSX by version — so `latest` is the only channel available. Open
# VSX's /latest already returns a pre-release build when that is the newest one, which is the
# closest equivalent to a nightly.
resolve_openvsx_component() {
  local key="$1" extension="$2" payload version

  if ! payload=$(curl -fsS --retry 3 --retry-delay 2 --max-time 60 \
      "https://open-vsx.org/api/wso2/${extension}/latest"); then
    echo "Error: failed to query Open VSX for wso2.${extension}." >&2
    exit 1
  fi

  version=$(printf '%s' "${payload}" | jq -r '.version // empty')
  if [ -z "${version}" ]; then
    echo "Error: Open VSX returned no version for wso2.${extension}." >&2
    exit 1
  fi

  set_property "${key}" "${version}"
  echo "  ${key}=${version} (open-vsx latest, preRelease=$(printf '%s' "${payload}" | jq -r '.preRelease // false'))"
}

echo "Resolving nightly component versions into ${VERSIONS_FILE}"
echo "GitHub-release components:"

resolve_github_component "ballerina.extension.version" \
  "wso2/ballerina-vscode" '^ballerina-(.+)\.vsix$' "v"

resolve_github_component "wso2.micro-integrator.extension.version" \
  "wso2/mi-vscode" '^micro-integrator-(.+)\.vsix$' "v"

resolve_github_component "ballerina.version" \
  "ballerina-platform/ballerina-distribution" '^ballerina-(.+)-swan-lake-linux\.zip$' "v"

resolve_github_component "icp.version" \
  "wso2/integration-control-plane" '^wso2-integration-control-plane-(.+)\.zip$' "v"

# ballerina-custom-jre tags its releases without a leading "v" (e.g. 4.0.0).
resolve_github_component "ballerina.jre.version" \
  "ballerina-platform/ballerina-custom-jre" '^ballerina-jre-linux-64-(.+)\.zip$' ""

echo "Open VSX components:"
resolve_openvsx_component "wso2.hurl-client.extension.version" "hurl-client"
resolve_openvsx_component "wso2.mcp-server-inspector.extension.version" "mcp-server-inspector"
resolve_openvsx_component "wso2.streaming-integrator.extension.version" "streaming-integrator"

echo
echo "Pinned ${VERSIONS_FILE}:"
cat "${VERSIONS_FILE}"
