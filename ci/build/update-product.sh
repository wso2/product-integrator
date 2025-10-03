echo '{
    "quality": "stable",
    "nameShort": "WSO2 Integrator",
    "nameLong": "WSO2 Integrator",
    "applicationName": "wso2-integrator",
    "dataFolderName": ".wso2-integrator",
    "win32MutexName": "wso2-integrator",
    "licenseName": "MIT",
    "licenseUrl": "https://github.com/microsoft/vscode/blob/main/LICENSE.txt",
    "serverLicenseUrl": "https://github.com/microsoft/vscode/blob/main/LICENSE.txt",
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
	  "licenseFileName": "LICENSE.txt",
    "reportIssueUrl": "https://github.com/wso2/vscode-extensions/issues/new",
    "documentationUrl": "https://go.microsoft.com/fwlink/?LinkID=533484#vscode",
    "keyboardShortcutsUrlMac": "https://go.microsoft.com/fwlink/?linkid=832143",
    "keyboardShortcutsUrlLinux": "https://go.microsoft.com/fwlink/?linkid=832144",
    "keyboardShortcutsUrlWin": "https://go.microsoft.com/fwlink/?linkid=832145",
    "introductoryVideosUrl": "https://go.microsoft.com/fwlink/?linkid=832146",
    "tipsAndTricksUrl": "https://go.microsoft.com/fwlink/?linkid=852118",
    "newsletterSignupUrl": "https://www.research.net/r/vsc-newsletter",
    "linkProtectionTrustedDomains": [
      "https://open-vsx.org"
    ],
    "trustedExtensionAuthAccess": [
      "vscode.git", "vscode.github",
      "github.vscode-pull-request-github",
      "github.copilot", "github.copilot-chat",
      "wso2.ballerina", "wso2.ballerina-integrator",
      "wso2.wso2-platform",
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
        "name": "wso2.wso2-platform",
        "version": "1.0.11"
      },
      {
        "name": "redhat.vscode-yaml",
        "version": "1.18.0"
      },
      {
        "name": "anweber.httpbook",
        "version": "3.2.6"
      },
      {
        "name": "anweber.vscode-httpyac",
        "version": "6.16.7"
      },
      {
        "name": "wso2.ballerina",
        "version": "5.3.3"
      },
      {
        "name": "wso2.ballerina-integrator",
        "version": "1.2.1"
      }
	  ]
}
' > lib/vscode/product.json

# copy resources
# from resources folder with relative path in lib folder. also replace existing resources using rsync
rsync -av --progress resources/ lib/
