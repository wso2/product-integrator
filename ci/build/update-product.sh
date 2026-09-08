#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)
VERSIONS_FILE="${REPO_ROOT}/ci/build/component-versions.properties"

if [ ! -f "${VERSIONS_FILE}" ]; then
  echo "Error: Versions file not found at ${VERSIONS_FILE}" >&2
  exit 1
fi

read_version() {
  local key="$1"
  awk -F= -v version_key="$key" '$1 == version_key { print substr($0, index($0, "=") + 1); exit }' "${VERSIONS_FILE}" | tr -d '\r'
}

# Accept integrator version as first arg (optional), otherwise read from source-of-truth file.
VERSION=${1:-"$(read_version "integrator.version")"}
BALLERINA_VSIX_PATH=${BALLERINA_VSIX_PATH:-""}
BALLERINA_EXTENSION_VERSION=${BALLERINA_EXTENSION_VERSION:-"$(read_version "ballerina.extension.version")"}
MI_VSIX_PATH=${MI_VSIX_PATH:-""}
MI_EXTENSION_VERSION=${MI_EXTENSION_VERSION:-"$(read_version "wso2.micro-integrator.extension.version")"}
WSO2_HURL_CLIENT_EXTENSION_VERSION=$(read_version "wso2.hurl-client.extension.version")
WSO2_MCP_SERVER_INSPECTOR_EXTENSION_VERSION=$(read_version "wso2.mcp-server-inspector.extension.version")
WSO2_STREAMING_INTEGRATOR_EXTENSION_VERSION=$(read_version "wso2.streaming-integrator.extension.version")

# Bundled component versions (Ballerina runtime, custom JRE, ICP) — surfaced in
# product.json so the in-app updater and Components UI can compare the bundled
# baseline against installed overrides.
BALLERINA_RUNTIME_VERSION=$(read_version "ballerina.version")
BALLERINA_JRE_VERSION=$(read_version "ballerina.jre.version")
ICP_VERSION=$(read_version "icp.version")

# Base URL of the WSO2-hosted update server. Left empty by default so the in-app
# component updater stays disabled until a live update server is provisioned; set
# WSO2_UPDATE_URL (e.g. https://updates.wso2.com/integrator) to enable checks.
WSO2_UPDATE_URL=${WSO2_UPDATE_URL:-""}

# Base64-encoded PEM public key that verifies the update manifest's cosign signature.
# Empty by default → manifest signature verification is skipped (relies on TLS + host
# allowlist + per-artifact sha256). Set WSO2_UPDATE_PUBLIC_KEY to `base64 < cosign.pub`
# to enforce signature verification.
WSO2_UPDATE_PUBLIC_KEY=${WSO2_UPDATE_PUBLIC_KEY:-""}
# GNU base64 wraps at 76 columns; a wrapped value pasted into the secret would break the JSON
# heredoc below. Whitespace is not part of base64, so stripping it is always safe.
WSO2_UPDATE_PUBLIC_KEY=$(printf '%s' "${WSO2_UPDATE_PUBLIC_KEY}" | tr -d '[:space:]')
# Decode-validate rather than pattern-match: a value that does not decode would ship inside
# product.json and surface only as every client failing verification. GNU base64 uses -d,
# BSD (macOS) historically -D; try both.
if [ -n "${WSO2_UPDATE_PUBLIC_KEY}" ]; then
  if ! printf '%s' "${WSO2_UPDATE_PUBLIC_KEY}" | base64 -d > /dev/null 2>&1 \
     && ! printf '%s' "${WSO2_UPDATE_PUBLIC_KEY}" | base64 -D > /dev/null 2>&1; then
    echo "Error: WSO2_UPDATE_PUBLIC_KEY is not valid base64 (expected: base64 < cosign.pub)." >&2
    exit 1
  fi
fi
if [ -n "${WSO2_UPDATE_PUBLIC_KEY}" ] && ! printf '%s' "${WSO2_UPDATE_PUBLIC_KEY}" | grep -Eq '^[A-Za-z0-9+/=]+$'; then
  echo "Error: WSO2_UPDATE_PUBLIC_KEY is not base64 (expected \`base64 < cosign.pub\`)." >&2
  exit 1
fi

# Reject an artifact that declares no cosign signature. Left false until every artifact the
# manifest can reference is mirrored to the WSO2 bucket (only mirrored artifacts can be signed by
# us), because a third-party source URL would otherwise fail verification it can never pass.
WSO2_UPDATE_REQUIRE_ARTIFACT_SIGNATURE=${WSO2_UPDATE_REQUIRE_ARTIFACT_SIGNATURE:-"false"}
# Emitted unquoted into product.json, so it must be a JSON boolean; anything else would ship an
# invalid file discovered only at app startup.
case "${WSO2_UPDATE_REQUIRE_ARTIFACT_SIGNATURE}" in
  true|false) ;;
  "") WSO2_UPDATE_REQUIRE_ARTIFACT_SIGNATURE="false" ;;
  *) echo "Error: WSO2_UPDATE_REQUIRE_ARTIFACT_SIGNATURE must be 'true' or 'false', got '${WSO2_UPDATE_REQUIRE_ARTIFACT_SIGNATURE}'." >&2; exit 1 ;;
esac

# Stock VS Code update feed (Squirrel.Mac via darwinUpdateService). Set STOCK_UPDATE_URL
# ONLY for macOS builds — enabling it also activates the win32/linux stock update paths,
# which do not fit our MSI/DEB packaging. Empty → stock update service stays disabled.
STOCK_UPDATE_URL=${STOCK_UPDATE_URL:-""}
DARWIN_UNIVERSAL_ASSET_ID=${DARWIN_UNIVERSAL_ASSET_ID:-""}

require_non_empty() {
  local value="$1"
  local key="$2"
  if [ -z "${value}" ]; then
    echo "Error: ${key} must be defined in ${VERSIONS_FILE}" >&2
    exit 1
  fi
}

if [ -z "${VERSION}" ]; then
  echo "Error: integrator.version must be defined in ${VERSIONS_FILE}" >&2
  exit 1
fi

require_non_empty "${WSO2_HURL_CLIENT_EXTENSION_VERSION}" "wso2.hurl-client.extension.version"
require_non_empty "${WSO2_MCP_SERVER_INSPECTOR_EXTENSION_VERSION}" "wso2.mcp-server-inspector.extension.version"
require_non_empty "${MI_EXTENSION_VERSION}" "wso2.micro-integrator.extension.version"
require_non_empty "${WSO2_STREAMING_INTEGRATOR_EXTENSION_VERSION}" "wso2.streaming-integrator.extension.version"

if [[ -n "${BALLERINA_EXTENSION_VERSION}" && "${BALLERINA_EXTENSION_VERSION}" =~ ^[vV] ]]; then
  echo "Error: BALLERINA_EXTENSION_VERSION must be provided without a leading v. Example: 4.5.0" >&2
  exit 1
fi

if [[ -n "${MI_EXTENSION_VERSION}" && "${MI_EXTENSION_VERSION}" =~ ^[vV] ]]; then
  echo "Error: MI_EXTENSION_VERSION must be provided without a leading v. Example: 4.5.0" >&2
  exit 1
fi

if [ -z "${BALLERINA_EXTENSION_VERSION}" ] && [ -z "${BALLERINA_VSIX_PATH}" ]; then
  BALLERINA_EXTENSION_VERSION="latest"
fi
# The properties file is the single declaration; ci/build/apply-version.sh mirrors it into
# wi/wi-extension/package.json, which is what package-vsix.js names the .vsix from.
WI_EXTENSION_VERSION=$(read_version "wi.extension.version")
require_non_empty "${WI_EXTENSION_VERSION}" "wi.extension.version"
# The in-app updater compares against these as its bundled baseline; an empty one ships a
# product.json the updater mis-compares at runtime instead of failing this build.
require_non_empty "${BALLERINA_RUNTIME_VERSION}" "ballerina.version"
require_non_empty "${BALLERINA_JRE_VERSION}" "ballerina.jre.version"
require_non_empty "${ICP_VERSION}" "icp.version"

cat > lib/vscode/product.json <<EOF
{
    "wiversion": "${VERSION}",
    "quality": "stable",
    "nameShort": "WSO2 Integrator",
    "nameLong": "WSO2 Integrator",
    "applicationName": "wso2-integrator",
    "dataFolderName": ".wso2-integrator",
    "sharedDataFolderName": ".wso2-integrator-shared",
    "builtInExtensionsEnabledWithAutoUpdates": [],
    "win32MutexName": "wso2-integrator",
    "licenseName": "MIT",
    "licenseUrl": "https://wso2.com/licenses/",
    "serverLicenseUrl": "https://wso2.com/licenses/",
    "serverGreeting": [],
    "serverLicense": [],
    "serverLicensePrompt": "",
    "serverApplicationName": "wso2-integrator",
    "serverDataFolderName": ".wso2-integrator",
    "tunnelApplicationName": "wso2-integrator-tunnel",
    "win32DirName": "wso2-integrator",
    "win32NameVersion": "wso2-integrator",
    "win32AppUserModelId": "wso2.wso2-integrator",
    "win32ShellNameShort": "w&so2-integrator",
    "darwinBundleIdentifier": "com.wso2.integrator",
    "linuxIconName": "com.wso2.integrator",
    "urlProtocol": "wso2-integrator",
    "licenseFileName": "LICENSE.txt",
    "reportIssueUrl": "https://github.com/wso2/product-integrator/issues",
    "documentationUrl": "https://wso2.com/integration-platform/docs/",
    "keyboardShortcutsUrlMac": "https://go.microsoft.com/fwlink/?linkid=832143",
    "keyboardShortcutsUrlLinux": "https://go.microsoft.com/fwlink/?linkid=832144",
    "keyboardShortcutsUrlWin": "https://go.microsoft.com/fwlink/?linkid=832145",
    "introductoryVideosUrl": "https://go.microsoft.com/fwlink/?linkid=832146",
    "tipsAndTricksUrl": "https://go.microsoft.com/fwlink/?linkid=852118",
    "newsletterSignupUrl": "https://www.research.net/r/vsc-newsletter",
    "linkProtectionTrustedDomains": [
      "https://*.wso2.com",
      "https://devant.dev",
      "https://console.devant.dev"
    ],
    "trustedExtensionProtocolHandlers": [
      "wso2.wso2-integrator"
    ],
    "trustedExtensionAuthAccess": [
      "vscode.git", "vscode.github",
      "github.vscode-pull-request-github",
      "github.copilot", "github.copilot-chat",
      "wso2.ballerina", "wso2.ballerina-integrator",
      "wso2.wso2-integrator",
      "wso2.micro-integrator"
    ],
    "aiConfig": {
      "ariaKey": "wso2-integrator"
    },
    "extensionsGallery": {
      "serviceUrl": "https://open-vsx.org/vscode/gallery",
      "itemUrl": "https://open-vsx.org/vscode/item"
    },
    "win32ContextMenu": {
      "x64": {
        "clsid": "{D5A1C07C-A03F-4c26-B1FC-3D1444FDD333}"
      },
      "arm64": {
        "clsid": "{D5A1C07C-A03F-4c26-B1FC-3D1444FDD444}"
      }
    },
	  "builtInExtensions": [
      {
        "name": "wso2.hurl-client",
        "version": "${WSO2_HURL_CLIENT_EXTENSION_VERSION}"
      },
      {
        "name": "wso2.mcp-server-inspector",
        "version": "${WSO2_MCP_SERVER_INSPECTOR_EXTENSION_VERSION}"
      },
$(if [ -n "${BALLERINA_VSIX_PATH}" ]; then
cat <<BALLERINA_VSIX_ENTRY
      {
        "name": "wso2.ballerina",
        "vsix": "${BALLERINA_VSIX_PATH}",
        "version": "${BALLERINA_EXTENSION_VERSION}"
      },
BALLERINA_VSIX_ENTRY
else
cat <<BALLERINA_MARKETPLACE_ENTRY
      {
        "name": "wso2.ballerina",
        "version": "${BALLERINA_EXTENSION_VERSION}"
      },
BALLERINA_MARKETPLACE_ENTRY
fi)
$(if [ -n "${MI_VSIX_PATH}" ]; then
cat <<MI_VSIX_ENTRY
      {
        "name": "wso2.micro-integrator",
        "vsix": "${MI_VSIX_PATH}",
        "version": "${MI_EXTENSION_VERSION}"
      },
MI_VSIX_ENTRY
else
cat <<MI_MARKETPLACE_ENTRY
      {
        "name": "wso2.micro-integrator",
        "version": "${MI_EXTENSION_VERSION}"
      },
MI_MARKETPLACE_ENTRY
fi)
      {
        "name": "wso2.streaming-integrator",
        "version": "${WSO2_STREAMING_INTEGRATOR_EXTENSION_VERSION}"
      },
      {
        "name": "wso2.wso2-integrator",
        "vsix": "../../wi/wi-extension/wso2-integrator-${WI_EXTENSION_VERSION}.vsix",
        "version": "${WI_EXTENSION_VERSION}"
      }
    ],
    "wso2UpdateUrl": "${WSO2_UPDATE_URL}",
    "wso2UpdatePublicKey": "${WSO2_UPDATE_PUBLIC_KEY}",
    "wso2UpdateRequireArtifactSignature": ${WSO2_UPDATE_REQUIRE_ARTIFACT_SIGNATURE},
    "updateUrl": "${STOCK_UPDATE_URL}",
$(if [ -n "${DARWIN_UNIVERSAL_ASSET_ID}" ]; then
cat <<DARWIN_UNIVERSAL_ASSET_ID_ENTRY
    "darwinUniversalAssetId": "${DARWIN_UNIVERSAL_ASSET_ID}",
DARWIN_UNIVERSAL_ASSET_ID_ENTRY
fi)
    "bundledComponents": {
      "ballerina-runtime": "${BALLERINA_RUNTIME_VERSION}",
      "jre": "${BALLERINA_JRE_VERSION}",
      "icp": "${ICP_VERSION}"
    },
    "runtimeEnv": {
      "common": {
        "WSO2_INTEGRATOR_RUNTIME": "true",
        "__meta": {
          "pathRemovePattern": "ballerina"
        }
      },
      "darwin": {
        "BALLERINA_HOME": "\${COMPONENT:ballerina-runtime|\$APP_ROOT/Contents/components/ballerina}",
        "WSO2_INTEGRATOR_BALLERINA_HOME": "\${COMPONENT:ballerina-runtime|\$APP_ROOT/Contents/components/ballerina}",
        "PATH": "\${COMPONENT:ballerina-runtime|\$APP_ROOT/Contents/components/ballerina}/bin",
        "WSO2_INTEGRATOR_ICP_HOME": "\${COMPONENT:icp|\$APP_ROOT/Contents/components/icp}",
        "WSO2_INTEGRATOR_JRE_DIR": "\${COMPONENT:jre|\$APP_ROOT/Contents/components/dependencies}"
      },
      "linux": {
        "BALLERINA_HOME": "\${COMPONENT:ballerina-runtime|\$APP_ROOT/components/ballerina}",
        "WSO2_INTEGRATOR_BALLERINA_HOME": "\${COMPONENT:ballerina-runtime|\$APP_ROOT/components/ballerina}",
        "PATH": "\${COMPONENT:ballerina-runtime|\$APP_ROOT/components/ballerina}/bin",
        "WSO2_INTEGRATOR_ICP_HOME": "\${COMPONENT:icp|\$APP_ROOT/components/icp}",
        "WSO2_INTEGRATOR_JRE_DIR": "\${COMPONENT:jre|\$APP_ROOT/components/dependencies}"
      },
      "win32": {
        "BALLERINA_HOME": "\${COMPONENT:ballerina-runtime|\$APP_ROOT\\\\components\\\\ballerina}",
        "WSO2_INTEGRATOR_BALLERINA_HOME": "\${COMPONENT:ballerina-runtime|\$APP_ROOT\\\\components\\\\ballerina}",
        "PATH": "\${COMPONENT:ballerina-runtime|\$APP_ROOT\\\\components\\\\ballerina}\\\\bin",
        "WSO2_INTEGRATOR_ICP_HOME": "\${COMPONENT:icp|\$APP_ROOT\\\\components\\\\icp}",
        "WSO2_INTEGRATOR_JRE_DIR": "\${COMPONENT:jre|\$APP_ROOT\\\\components\\\\dependencies}"
      }
    }
}
EOF

# copy resources
# from resources folder with relative path in lib folder. also replace existing resources using rsync
rsync -av --progress resources/ lib/
