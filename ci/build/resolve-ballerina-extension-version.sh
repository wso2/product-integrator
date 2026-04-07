#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-marketplace}"
REQUESTED_VERSION="${2:-}"

fail() {
  echo "$1" >&2
  exit 1
}

normalize_version() {
  local version="$1"
  version="${version#"${version%%[![:space:]]*}"}"
  version="${version%"${version##*[![:space:]]}"}"
  version="${version#v}"
  printf '%s' "$version"
}

validate_version() {
  local version="$1"
  if [[ "$version" == *"/"* || "$version" == *".."* ]]; then
    fail "Invalid Ballerina extension version: $version"
  fi
}

resolve_marketplace_version() {
  local version_alias="${1:-}"
  local endpoint="https://open-vsx.org/api/wso2/ballerina"
  local response
  local resolved_version
  local pre_release
  local release_type

  if [[ -n "$version_alias" ]]; then
    endpoint="${endpoint}/${version_alias}"
  fi

  if ! response="$(curl -fsSL -H 'User-Agent: Product Integrator Build' "$endpoint")"; then
    if [[ -n "$version_alias" ]]; then
      fail "Failed to resolve Ballerina extension for marketplace version '$version_alias'."
    fi
    fail "Failed to resolve the latest Ballerina extension from marketplace."
  fi

  if ! resolved_version="$(printf '%s' "$response" | node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(0,'utf8')); if (typeof data.version !== 'string' || !data.version) process.exit(1); process.stdout.write(data.version);")"; then
    fail "Open VSX did not return a valid Ballerina extension version."
  fi

  pre_release="$(printf '%s' "$response" | node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Boolean(data.preRelease)));")"
  if [[ "$pre_release" == "true" ]]; then
    release_type="pre-release"
  else
    release_type="release"
  fi

  echo "Resolved Ballerina marketplace version ${resolved_version} (${release_type})" >&2
  printf '%s' "$resolved_version"
}

main() {
  local version
  version="$(normalize_version "$REQUESTED_VERSION")"
  validate_version "$version"

  case "$SOURCE" in
    github)
      if [[ -z "$version" ]]; then
        fail "ballerina_extension_version is required when ballerina_extension_source=github."
      fi
      echo "Resolved Ballerina GitHub version ${version}" >&2
      printf '%s' "$version"
      ;;
    marketplace)
      if [[ -z "$version" ]]; then
        resolve_marketplace_version
      else
        resolve_marketplace_version "$version"
      fi
      ;;
    *)
      fail "Unsupported ballerina_extension_source: $SOURCE"
      ;;
  esac
}

main
