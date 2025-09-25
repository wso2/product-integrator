echo '{
    "quality": "stable",
    "nameShort": "wso2-integrator",
    "nameLong": "wso2-integrator",
    "applicationName": "wso2-integrator",
    "dataFolderName": ".wso2-integrator",
    "win32MutexName": "wso2-integrator",
    "licenseUrl": "https://github.com/wso2/vscode-extensions",
    "win32DirName": "wso2-integrator",
    "win32NameVersion": "wso2-integrator",
    "win32AppUserModelId": "wso2.wso2-integrator",
    "win32ShellNameShort": "w&so2-integrator",
    "darwinBundleIdentifier": "com.wso2.integrator",
    "linuxIconName": "com.wso2.integrator",
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
rsync -av --progress --ignore-existing resources/ lib/vscode/resources/
