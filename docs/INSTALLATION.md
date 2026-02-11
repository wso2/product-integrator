# Installation Guide

This guide provides detailed information about installing WSO2 Integrator on different platforms.

## Available Installers

| OS | Format | Description |
|----|--------|-------------|
| **macOS** | `.pkg` | Universal installer. Supports both System-wide (Admin) and User-local (No Admin) installations. |
| **Windows** | `.msi` | Installs to User's Local AppData. No Admin privileges required. |
| **Linux (Debian/Ubuntu)** | `.deb` | Standard package. Requires `sudo` to install (System-wide). |
| **Linux (RedHat/CentOS)** | `.rpm` | Standard package. Requires `sudo` to install (System-wide). |
| **Linux (General)** | `.tar.gz` | Portable archive. Can be extracted and run anywhere **without root privileges**. |

---

## macOS (`.pkg`)

### Installation Path
`/Library/Application Support/WSO2Integrator/`

### Directory Structure
```
/Library/Application Support/WSO2Integrator/
├── WSO2 Integrator.app/                    # Main application
│   └── Contents/
│       ├── MacOS/                          # Application executable
│       ├── Resources/                      # Application resources & extensions
│       └── Frameworks/                     # Application frameworks
│
├── Ballerina/
│   ├── bin/                                # Ballerina CLI and tools
│   └── dependencies/                       # Bundled JRE
│       └── jdk-<version>/
│           ├── bin/
│           └── lib/
│
└── ICP/                                    # Integration Control Plane
    ├── bin/                                # ICP scripts and tools
    ├── lib/
    └── repository/
```

### Executables
- **Application:** `/Library/Application Support/WSO2Integrator/WSO2 Integrator.app`
- **Ballerina:** `/Library/Application Support/WSO2Integrator/Ballerina/bin/bal`

### Installation
```bash
# Double-click the .pkg file or run:
sudo installer -pkg WSO2_Integrator.pkg -target /
```

---

## Windows (`.msi`)

### Installation Path
`%LOCALAPPDATA%\Programs\WSO2 Integrator\`

### Directory Structure
```
%LOCALAPPDATA%\Programs\WSO2 Integrator\
├── Integrator/                             # Main application
│   ├── bin/                                # Application executable
│   ├── resources/                          # Application resources & extensions
│   └── locales/                            # Localization files
│
├── Ballerina/
│   ├── bin/                                # Ballerina CLI and tools
│   └── dependencies/                       # Bundled JRE
│       └── jdk-<version>/
│           ├── bin/
│           └── lib/
│
└── ICP/                                    # Integration Control Plane
    ├── bin/                                # ICP scripts and tools
    ├── lib/
    └── repository/
        ├── conf/                           # Configuration files
        └── deployment/
```

### Executables
- **Application:** `%LOCALAPPDATA%\Programs\WSO2 Integrator\Integrator\wso2-integrator.exe`
- **Ballerina:** `%LOCALAPPDATA%\Programs\WSO2 Integrator\Ballerina\bin\bal.bat`

### Environment Variables
- `BALLERINA_HOME` is automatically set during installation

### Installation
```powershell
# Double-click the .msi file or run:
msiexec /i WSO2_Integrator.msi
```

---

## Linux - Debian/Ubuntu (`.deb`)

### Installation Path
`/opt/wso2/integrator/`

### Directory Structure
```
/opt/wso2/integrator/
├── bin/                                    # Integrator binaries
├── resources/                              # Application resources & extensions
├── locales/                                # Localization files
│
├── ballerina/
│   ├── bin/                                # Ballerina CLI and tools
│   └── dependencies/                       # Bundled JRE
│       └── jdk-<version>/
│           ├── bin/
│           └── lib/
│
└── icp/                                    # Integration Control Plane
    ├── bin/                                # ICP scripts and tools
    ├── lib/
    └── repository/
        ├── conf/                           # Configuration files
        └── deployment/
```

### Executables
- **Application:** `/usr/bin/wso2-integrator` (symlink to `/opt/wso2/integrator/bin/wso2-integrator`)
- **Ballerina:** `/opt/wso2/integrator/ballerina/bin/bal`

### Post-Installation
- Symlinks are created in `/usr/bin/` for easy command-line access
- Desktop entry is registered for GUI access

### Installation
```bash
# Install the package
sudo dpkg -i wso2-integrator_<version>_amd64.deb

# If there are dependency issues, run:
sudo apt-get install -f
```

### Uninstallation
```bash
sudo dpkg -r wso2-integrator
```

---

## Linux - RedHat/CentOS (`.rpm`)

### Installation Paths
- **Integrator:** `/usr/share/wso2-integrator/`
- **Ballerina:** `/usr/lib64/ballerina/`
- **ICP:** `/usr/lib64/wso2/icp/`

### Directory Structure
```
/usr/share/wso2-integrator/
├── bin/                                    # Integrator binaries
├── resources/                              # Application resources & extensions
└── locales/                                # Localization files

/usr/lib64/ballerina/
├── bin/                                    # Ballerina CLI and tools
└── dependencies/                           # Bundled JRE
    └── jdk-<version>/
        ├── bin/
        └── lib/

/usr/lib64/wso2/icp/
├── bin/                                    # ICP scripts and tools
├── lib/
└── repository/
    ├── conf/                               # Configuration files
    └── deployment/
```

### Executables
- **Application:** `/usr/bin/wso2-integrator` (symlink to `/usr/share/wso2-integrator/bin/wso2-integrator`)
- **Ballerina:** `/usr/bin/bal` (symlink to `/usr/lib64/ballerina/bin/bal`)

### Environment Variables
- `BALLERINA_HOME=/usr/lib64/ballerina` is set in `/etc/profile.d/wso2.sh`

### Installation
```bash
# Install the package
sudo rpm -ivh wso2-integrator-<version>.rpm

# Or using yum/dnf
sudo yum install wso2-integrator-<version>.rpm
```

### Uninstallation
```bash
sudo rpm -e wso2-integrator
```

---

## Linux - Tarball (`.tar.gz`)

### Installation Path
User-defined (extract anywhere)

### Directory Structure
```
wso2-integrator-<version>/
├── bin/                                    # Integrator binaries
├── resources/                              # Application resources & extensions
├── locales/                                # Localization files
│
├── ballerina/
│   ├── bin/                                # Ballerina CLI and tools
│   └── dependencies/                       # Bundled JRE
│       └── jdk-<version>/
│           ├── bin/
│           └── lib/
│
└── icp/                                    # Integration Control Plane
    ├── bin/                                # ICP scripts and tools
    ├── lib/
    └── repository/
        ├── conf/                           # Configuration files
        └── deployment/
```

### Installation & Usage
```bash
# Extract the tarball
tar -xzf wso2-integrator-linux-<version>.tar.gz
cd wso2-integrator-<version>

# Run the application
./wso2-integrator

# Use Ballerina
./ballerina/bin/bal version
./ballerina/bin/bal new my-project
```

### Notes
- No system-wide installation required
- All files remain in the extracted directory
- No root/sudo privileges needed
- Portable - can be moved to any location

---

## Verifying Installation

After installation, verify that everything is working correctly:

### Check Application Version
```bash
# macOS
/Library/Application\ Support/WSO2Integrator/WSO2\ Integrator.app/Contents/MacOS/wso2-integrator --version

# Linux (DEB/RPM)
wso2-integrator --version

# Linux (Tarball)
./wso2-integrator --version

# Windows
wso2-integrator.exe --version
```

### Check Ballerina
```bash
# macOS
/Library/Application\ Support/WSO2Integrator/Ballerina/bin/bal version

# Linux (DEB)
/opt/wso2/integrator/ballerina/bin/bal version

# Linux (RPM)
bal version  # (uses symlink in /usr/bin)

# Linux (Tarball)
./ballerina/bin/bal version

# Windows
bal version  # (if BALLERINA_HOME is set)
```

---

## Troubleshooting

### macOS: "App is damaged and can't be opened"
This happens due to Gatekeeper security. Run:
```bash
xattr -cr "/Library/Application Support/WSO2Integrator/WSO2 Integrator.app"
```

### Linux: Permission Denied
Ensure the executable has proper permissions:
```bash
chmod +x /opt/wso2/integrator/bin/wso2-integrator
chmod +x /opt/wso2/integrator/ballerina/bin/bal
```

### Windows: BALLERINA_HOME not set
Reinstall the MSI package or manually set:
```powershell
setx BALLERINA_HOME "%LOCALAPPDATA%\Programs\WSO2 Integrator\Ballerina"
```

---

## Upgrading

### Package-based Installations (DEB/RPM/MSI/PKG)
Simply install the new version over the existing installation. The installer will handle the upgrade.

### Tarball Installations
1. Extract the new version to a different directory
2. Copy any custom configurations from the old version
3. Remove the old directory
4. Update any scripts/shortcuts to point to the new location
