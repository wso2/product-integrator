#!/usr/bin/env bash
# Resolve each tracked component to its newest nightly build (or its newest release when the upstream
# repo publishes no nightly) and pin the result into component-versions.properties.
#
# It runs on the `builds/nightly` branch before the build is dispatched, so the build itself just
# reads the committed file — which also makes every nightly reproducible from the commit this leaves
# behind.
#
# Not touched here, on purpose:
#   integrator.version, wi.extension.version   ci/build/apply-version.sh owns those
#
# Usage: ./ci/build/resolve-nightly-versions.sh [versions-file]
#        Defaults to the real file; pass a copy to dry-run against the live upstream repos.
# Requires: gh (authenticated), curl, jq, unzip.
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

# List releases from `repo` that carry an asset matching `asset_regex`, with a nightly-tagged one
# first and then every other release most-recently-updated first. Each line is
# "<nightly|latest>\t<tag>\t<asset-name>".
#
# Filtering on the asset matters: a release without the file we need is useless to us, and it is
# how wso2/ballerina-vscode's rolling `nightly` release is identified.
#
# No qualifier filtering, on every route. Skipping alpha/beta/RC tags made the nightly resolve
# *backwards*: a staging line deliberately pins pre-releases, so filtering dragged ballerina.version
# and icp.version onto older GA builds the release line was not targeting. The rule is simply the
# newest thing upstream published that carries the asset we need.
#
# There is no per-route switch, so this applies to the `main` fallback too, not just a staging source:
# a nightly off `main` will bundle an upstream pre-release runtime as readily as a staging one. That is
# intended — the nightly is itself a pre-release — but it is a wider blast radius than the staging
# case that motivated it, so it is stated rather than implied.
#
# Sorted on the matched asset's `updated_at`, not on the API's default order: releases come back
# ordered by `created_at`, a release object has no `updated_at` of its own, and the asset timestamp
# is what actually moves when a rolling release republishes its file.
release_candidates() {
  local repo="$1" asset_regex="$2" candidates
  # The regex is embedded in a jq string literal, where a lone backslash is an invalid escape.
  local jq_regex="${asset_regex//\\/\\\\}"

  # Emit at most one rolling nightly, then every eligible fallback. Keeping all fallbacks lets
  # callers reject an asset whose contents do not satisfy a product-level compatibility contract.
  candidates=$(gh api "repos/${repo}/releases?per_page=100" --jq "
    [ .[] | select(.draft == false)
          | {tag: .tag_name,
             nightly: (.tag_name | test(\"nightly\"; \"i\")),
             published: .published_at,
             asset: ([.assets[]? | select(.name | test(\"${jq_regex}\"))][0])}
          | select(.asset != null)
          | {tag, nightly, name: .asset.name, ts: (.asset.updated_at // .published)} ]
    | sort_by(.ts) | reverse
    | (map(select(.nightly))[0] // empty | \"nightly\t\(.tag)\t\(.name)\"),
      (map(select(.nightly == false))[] | \"latest\t\(.tag)\t\(.name)\")
  ")

  candidates=$(printf '%s\n' "${candidates}" | sed '/^[[:space:]]*$/d')
  [ -n "${candidates}" ] || return 1
  printf '%s\n' "${candidates}"
}

# Pick the preferred metadata-only candidate. Runtime distributions and extensions without an
# embedded-form contract do not need their (potentially large) assets downloaded during resolution.
select_release() {
  local repo="$1" asset_regex="$2" candidates
  candidates=$(release_candidates "${repo}" "${asset_regex}") || return 1
  printf '%s\n' "${candidates}" | sed -n '1p'
}

# Pick the first VSIX candidate containing `required_entry`. A rolling release can retain its tag
# while temporarily publishing an older/incomplete asset, so filename matching alone is not enough
# for extensions whose files are consumed directly by the product's embedded creation UI.
#
# Returns 0 with the selection, 1 when no inspected candidate qualified, or 2 when a candidate could
# not be inspected at all. The distinction matters: a rate-limited download or a truncated archive says
# nothing about that release's contents, and treating it as a rejection would silently pin an older
# extension — the outcome this check exists to prevent.
#
# Only the first MAX_INSPECTED_CANDIDATES are inspected. Every candidate costs a full VSIX download
# (tens of MB), and `release_candidates` can return up to a page of releases, so an unsatisfiable
# contract would otherwise spend an hour and a chunk of the rate limit rediscovering that releases
# predating the required entry do not contain it.
MAX_INSPECTED_CANDIDATES=5
select_compatible_vsix_release() {
  local repo="$1" asset_regex="$2" required_entry="$3"
  local candidates source tag asset check_dir archive entries
  local total inspected=0

  candidates=$(release_candidates "${repo}" "${asset_regex}") || return 1
  total=$(printf '%s\n' "${candidates}" | grep -c '' || true)
  while IFS=$'\t' read -r source tag asset; do
    [ -n "${tag}" ] || continue

    if [ "${inspected}" -ge "${MAX_INSPECTED_CANDIDATES}" ]; then
      echo "Error: none of the first ${inspected} ${repo} candidates contain ${required_entry}" >&2
      echo "       ($(( total - inspected )) newer-to-older candidates were not inspected; raise" >&2
      echo "       MAX_INSPECTED_CANDIDATES if an older release is genuinely expected to qualify)." >&2
      return 1
    fi
    inspected=$(( inspected + 1 ))

    check_dir=$(mktemp -d)
    archive="${check_dir}/${asset}"
    echo "  checking ${repo}@${tag} for ${required_entry}" >&2

    if ! gh release download "${tag}" --repo "${repo}" --pattern "${asset}" \
        --dir "${check_dir}" --clobber >&2; then
      rm -rf "${check_dir}"
      echo "Error: could not download ${asset} from ${repo}@${tag}." >&2
      return 2
    fi

    if ! entries=$(unzip -Z1 "${archive}"); then
      rm -rf "${check_dir}"
      echo "Error: ${asset} from ${repo}@${tag} is not a readable zip archive." >&2
      return 2
    fi
    rm -rf "${check_dir}"

    # Matched from a here-string, not a pipe. `grep -q` exits on its first match, so piping the
    # listing in leaves the writer with unread data: it takes SIGPIPE, the pipeline reports 141, and
    # under `pipefail` the test reads as false *because* the entry was found. The listing only has to
    # exceed the 64KB pipe buffer after the matched line for that to happen, which makes it depend on
    # where the entry sits in the archive — a silent, layout-dependent rejection of a good release.
    if grep -Fxq "${required_entry}" <<< "${entries}"; then
      printf '%s\t%s\t%s\n' "${source}" "${tag}" "${asset}"
      return 0
    fi

    echo "  rejecting ${repo}@${tag}: ${asset} lacks ${required_entry}" >&2
  done <<< "${candidates}"

  echo "Error: all ${inspected} eligible ${repo} candidates lack ${required_entry}." >&2
  return 1
}

# Resolve one GitHub-release-backed component.
#   $1 property key   $2 owner/repo   $3 asset regex (one capture group = the version)
#   $4 conventional tag prefix ("v" for most repos, "" for ballerina-custom-jre)
#   $5 optional required VSIX entry; when set, incompatible candidates are skipped
resolve_github_component() {
  local key="$1" repo="$2" asset_regex="$3" tag_prefix="$4" required_entry="${5:-}"
  local selection source tag asset version status

  status=0
  if [ -n "${required_entry}" ]; then
    selection=$(select_compatible_vsix_release "${repo}" "${asset_regex}" "${required_entry}") || status=$?
  else
    selection=$(select_release "${repo}" "${asset_regex}") || status=$?
  fi

  # An inspection failure is not evidence that the candidate was unsuitable, so stop rather than
  # fall through to an older release. The error itself has already been printed.
  if [ "${status}" -eq 2 ]; then
    echo "       Refusing to fall back to an older ${repo} release on an inconclusive check." >&2
    exit 1
  fi

  if [ -z "${selection}" ]; then
    echo "Error: no compatible ${repo} release carries an asset matching ${asset_regex}." >&2
    if [ -n "${required_entry}" ]; then
      echo "       Required VSIX entry: ${required_entry}" >&2
    fi
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
  "wso2/ballerina-vscode" '^ballerina-(.+)\.vsix$' "v" \
  'extension/resources/jslibs/federation/remoteEntry.js'

resolve_github_component "wso2.micro-integrator.extension.version" \
  "wso2/mi-vscode" '^micro-integrator-(.+)\.vsix$' "v"

resolve_github_component "ballerina.version" \
  "ballerina-platform/ballerina-distribution" '^ballerina-(.+)-swan-lake-linux\.zip$' "v"

resolve_github_component "icp.version" \
  "wso2/integration-control-plane" '^wso2-integration-control-plane-(.+)\.zip$' "v"

resolve_github_component "ballerina.jre.version" \
  "ballerina-platform/ballerina-custom-jre" '^ballerina-jre-linux-64-(.+)\.zip$' ""

echo "Open VSX components:"
resolve_openvsx_component "wso2.hurl-client.extension.version" "hurl-client"
resolve_openvsx_component "wso2.mcp-server-inspector.extension.version" "mcp-server-inspector"
resolve_openvsx_component "wso2.streaming-integrator.extension.version" "streaming-integrator"

echo
echo "Pinned ${VERSIONS_FILE}:"
cat "${VERSIONS_FILE}"
