# WSO2 Integrator macOS Installers

This directory contains scripts and resources for building macOS installers for WSO2 Integrator.

## Available Installers

### 1. PKG Installer (Traditional)
**Build with:** `./build.sh`

Creates a standard macOS package (.pkg) that installs WSO2 Integrator directly.

**Pros:**
- Simple, direct installation
- Works with automation tools
- Smaller individual file

**Cons:**
- Less user-friendly
- No visual feedback
- Command-line required for advanced options

### 2. DMG Installer (Recommended)
**Build with:** `./build-dmg.sh`

Creates a Disk Image (.dmg) containing the PKG installer with a professional drag-to-install interface.

**Pros:**
- Professional appearance
- Familiar to macOS users (drag & drop)
- Better compression
- Includes applications folder link
- Customizable background and layout
- Standard distribution format

**Cons:**
- Slightly larger file size
- Requires macOS to build

## Quick Start

### Building a DMG (Recommended)

```bash
# 1. Optionally create a professional background image
./create-dmg-background.sh

# 2. Build the DMG installer
./build-dmg.sh <ballerina.zip> <version> <wso2.zip> <icp.zip> <version> <arch>
```

**Example:**
```bash
./build-dmg.sh \
    ballerina-1.0.0.zip \
    1.0.0 \
    wso2-integrator-1.0.0.zip \
    icp-1.0.0.zip \
    1.0.0 \
    x64
```

This will create:
- `wso2-integrator-1.0.0-x64.pkg` (package)
- `wso2-integrator-1.0.0-x64.dmg` (disk image)

### Building a PKG Only

```bash
./build.sh <ballerina.zip> <version> <wso2.zip> <icp.zip> <version> <arch>
```

## File Organization

```
installers/mac/
├── README.md                         # This file
├── build.sh                          # PKG builder script
├── build-dmg.sh                      # DMG builder script
├── create-dmg-background.sh          # Background image generator
├── customize-dmg.sh                  # DMG appearance customizer
├── dmg-advanced.sh                   # Advanced tools
├── dmg-config.sh                     # Configuration template
├── Distribution.xml                  # Installer configuration
├── conclusion.html                   # Installation completion message
├── license.txt                       # License agreement
├── welcome.html                      # Welcome screen
├── DMG_README.md                     # README included in DMG
└── scripts/
    ├── postinstall                   # Post-installation script
    └── preinstall                    # Pre-installation checks
```

## Customization

### 1. Modify Installation Flow
Edit `Distribution.xml` to change:
- Title and branding
- Welcome message
- System requirements
- Installation options

### 2. Add/Update Content Files
Replace with your own:
- `welcome.html` - Custom welcome message
- `license.txt` - Your license agreement
- `conclusion.html` - Custom completion message

### 3. Customize DMG Appearance
- Create `dmg-background.png` (540x360 px recommended)
- Edit `customize-dmg.sh` for window size/icon positions
- Modify `DMG_README.md` for DMG instructions

### 4. Pre/Post Installation Scripts
Edit `scripts/preinstall` and `scripts/postinstall` to:
- Check system requirements
- Set up application paths
- Configure environment variables
- Create symbolic links

## System Requirements

- **macOS version**: 10.13 (High Sierra) or later
- **Disk space**: ~2-3 GB (varies by components)
- **RAM**: 4 GB minimum (8 GB recommended)

**Check in Distribution.xml and update if needed.**

## Support

For issues or questions about the installer system, refer to the relevant documentation or contact WSO2 support.
