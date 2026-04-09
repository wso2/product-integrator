#!/usr/bin/env bash
set -euo pipefail

# Accept version as first arg, default to 1.0.0
VERSION=${1:-"1.0.0"}
BALLERINA_VSIX_PATH=${BALLERINA_VSIX_PATH:-""}
BALLERINA_EXTENSION_VERSION=${BALLERINA_EXTENSION_VERSION:-""}

if [[ -n "${BALLERINA_EXTENSION_VERSION}" && "${BALLERINA_EXTENSION_VERSION}" =~ ^[vV] ]]; then
  echo "Error: BALLERINA_EXTENSION_VERSION must be provided without a leading v. Example: 4.5.0" >&2
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
      "wso2.wso2-platform",
      "wso2.wso2-integrator"
    ],
    "trustedExtensionAuthAccess": [
      "vscode.git", "vscode.github",
      "github.vscode-pull-request-github",
      "github.copilot", "github.copilot-chat",
      "wso2.ballerina", "wso2.ballerina-integrator",
      "wso2.wso2-platform",
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
        "name": "redhat.vscode-yaml",
        "version": "latest"
      },
      {
        "name": "anweber.httpbook",
        "version": "latest"
      },
      {
        "name": "anweber.vscode-httpyac",
        "version": "latest"
      },
      {
        "name": "wso2.wso2-platform",
        "version": "1.0.23"
      },
      {
        "name": "wso2.hurl-client",
        "version": "latest"
      },
      {
        "name": "wso2.mcp-server-inspector",
        "version": "0.7.2"
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
      {
        "name": "wso2.micro-integrator",
        "version": "3.1.526032514"
      },
      {
        "name": "wso2.wso2-integrator",
        "vsix": "../../wi/wi-extension/wso2-integrator-${WI_EXTENSION_VERSION}.vsix",
        "version": "${WI_EXTENSION_VERSION}"
      }
    ],
    "runtimeEnv": {
      "common": {
        "WSO2_INTEGRATOR_RUNTIME": "true"
      },
      "darwin": {
        "BALLERINA_HOME": "\${APP_ROOT}/Contents/components/ballerina",
        "PATH": "\${APP_ROOT}/Contents/components/ballerina/bin:\$PATH"
      },
      "linux": {
        "BALLERINA_HOME": "\${APP_ROOT}/components/ballerina",
        "PATH": "\${APP_ROOT}/components/ballerina/bin:\$PATH"
      },
      "win32": {
        "BALLERINA_HOME": "\${APP_ROOT}\\\\components\\\\ballerina",
        "PATH": "\${APP_ROOT}\\\\components\\\\ballerina\\\\bin;\$PATH"
      }
    }
}
EOF

# copy resources
# from resources folder with relative path in lib folder. also replace existing resources using rsync
rsync -av --progress resources/ lib/
