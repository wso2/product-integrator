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
WI_EXTENSION_VERSION=$(node -p "require('./wi/wi-extension/package.json').version")

cat > lib/vscode/product.json <<EOF
{
    "wiversion": "${VERSION}",
    "quality": "stable",
    "nameShort": "WSO2 Integrator",
    "nameLong": "WSO2 Integrator",
    "applicationName": "wso2-integrator",
    "dataFolderName": ".wso2-integrator",
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
    "documentationUrl": "https://wso2.github.io/docs-integrator/",
    "keyboardShortcutsUrlMac": "https://go.microsoft.com/fwlink/?linkid=832143",
    "keyboardShortcutsUrlLinux": "https://go.microsoft.com/fwlink/?linkid=832144",
    "keyboardShortcutsUrlWin": "https://go.microsoft.com/fwlink/?linkid=832145",
    "introductoryVideosUrl": "https://go.microsoft.com/fwlink/?linkid=832146",
    "tipsAndTricksUrl": "https://go.microsoft.com/fwlink/?linkid=852118",
    "newsletterSignupUrl": "https://www.research.net/r/vsc-newsletter",
    "linkProtectionTrustedDomains": [
      "https://open-vsx.org",
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
    "runtimeEnv": {
      "common": {
        "WSO2_INTEGRATOR_RUNTIME": "true",
        "WSO2_INTEGRATOR_VERSION": "${VERSION}",
        "__meta": {
          "pathRemovePattern": "ballerina"
        }
      },
      "darwin": {
        "BALLERINA_HOME": "\${APP_ROOT}/Contents/components/ballerina",
        "WSO2_INTEGRATOR_BALLERINA_HOME": "\${APP_ROOT}/Contents/components/ballerina",
        "PATH": "\${APP_ROOT}/Contents/components/ballerina/bin"
      },
      "linux": {
        "BALLERINA_HOME": "\${APP_ROOT}/components/ballerina",
        "WSO2_INTEGRATOR_BALLERINA_HOME": "\${APP_ROOT}/components/ballerina",
        "PATH": "\${APP_ROOT}/components/ballerina/bin"
      },
      "win32": {
        "BALLERINA_HOME": "\${APP_ROOT}\\\\components\\\\ballerina",
        "WSO2_INTEGRATOR_BALLERINA_HOME": "\${APP_ROOT}\\\\components\\\\ballerina",
        "PATH": "\${APP_ROOT}\\\\components\\\\ballerina\\\\bin"
      }
    }
}
EOF

# copy resources
# from resources folder with relative path in lib folder. also replace existing resources using rsync
rsync -av --progress resources/ lib/
