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

# Product flavor decides the display name and the OS-level identity so the two
# apps keep ALL data separate and install/run side by side:
#  - DATA_FOLDER: user-installed extensions + CLI data (a shared folder lets an
#    Integrator-installed WI extension shadow the Agent Builder built-in)
#  - BUNDLE_ID: macOS Launch Services / Keychain / pkg receipts
#  - APP_SLUG: Windows mutex (side-by-side run), AppUserModelId (taskbar), and
#    the URL protocol (sign-in callbacks must reopen the SAME app; the
#    extension builds callbacks from vscode.env.uriScheme, so this is safe)
# applicationName and the extension/command ids stay wso2-integrator: one VSIX
# serves both flavors.
PRODUCT_FLAVOR=${PRODUCT_FLAVOR:-integrator}
case "${PRODUCT_FLAVOR}" in
  integrator)
    PRODUCT_NAME="WSO2 Integrator"
    DATA_FOLDER=".wso2-integrator"
    APP_SLUG="wso2-integrator"
    BUNDLE_ID="com.wso2.integrator"
    ;;
  agent-builder)
    PRODUCT_NAME="WSO2 Agent Builder"
    DATA_FOLDER=".wso2-agent-builder"
    APP_SLUG="wso2-agent-builder"
    BUNDLE_ID="com.wso2.agentbuilder"
    ;;
  *) echo "Error: unknown PRODUCT_FLAVOR '${PRODUCT_FLAVOR}' (expected 'integrator' or 'agent-builder')" >&2; exit 1 ;;
esac
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
# The properties file is the single declaration; ci/build/apply-version.sh mirrors it into
# wi/wi-extension/package.json, which is what package-vsix.js names the .vsix from.
WI_EXTENSION_VERSION=$(read_version "wi.extension.version")
require_non_empty "${WI_EXTENSION_VERSION}" "wi.extension.version"

cat > lib/vscode/product.json <<EOF
{
    "wiversion": "${VERSION}",
    "quality": "stable",
    "nameShort": "${PRODUCT_NAME}",
    "nameLong": "${PRODUCT_NAME}",
    "applicationName": "wso2-integrator",
    "dataFolderName": "${DATA_FOLDER}",
    "sharedDataFolderName": "${DATA_FOLDER}-shared",
    "builtInExtensionsEnabledWithAutoUpdates": [],
    "win32MutexName": "${APP_SLUG}",
    "licenseName": "MIT",
    "licenseUrl": "https://wso2.com/licenses/",
    "serverLicenseUrl": "https://wso2.com/licenses/",
    "serverGreeting": [],
    "serverLicense": [],
    "serverLicensePrompt": "",
    "serverApplicationName": "wso2-integrator",
    "serverDataFolderName": "${DATA_FOLDER}",
    "tunnelApplicationName": "wso2-integrator-tunnel",
    "win32DirName": "${APP_SLUG}",
    "win32NameVersion": "${APP_SLUG}",
    "win32AppUserModelId": "wso2.${APP_SLUG}",
    "win32ShellNameShort": "w&so2-integrator",
    "darwinBundleIdentifier": "${BUNDLE_ID}",
    "linuxIconName": "${BUNDLE_ID}",
    "urlProtocol": "${APP_SLUG}",
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
        "WSO2_PRODUCT_MODE": "${PRODUCT_FLAVOR}",
        "WSO2_PRODUCT_NAME": "${PRODUCT_NAME}",
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
