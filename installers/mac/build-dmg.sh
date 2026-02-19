#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

WORK_DIR=$(pwd)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Usage: ./build-dmg.sh <ballerina_zip> <ballerina_version> <wso2_zip> <icp_zip> <version> <arch>
if [ "$#" -ne 6 ]; then
    echo "Usage: $0 <ballerina_zip> <ballerina_version> <wso2_zip> <icp_zip> <version> <arch>"
    exit 1
fi

BALLERINA_ZIP="$1"
BALLERINA_VERSION="$2"
WSO2_ZIP="$3"
ICP_ZIP="$4"
VERSION="$5"
ARCH="$6"

PKG_NAME="wso2-integrator-$VERSION-$ARCH.pkg"
DMG_NAME="wso2-integrator-$VERSION-$ARCH.dmg"
DMG_TEMP_NAME="wso2-integrator-$VERSION-$ARCH-temp.dmg"
DMG_MOUNT_POINT="/Volumes/WSO2 Integrator"
DMG_FOLDER="./dmg_folder"

print_info "=== Building DMG for WSO2 Integrator ==="

# Step 1: Extract the WSO2 Integrator app from the zip
print_info "Extracting WSO2 Integrator.app from $WSO2_ZIP..."
TEMP_EXTRACT="./temp_extract"
rm -rf "$TEMP_EXTRACT"
mkdir -p "$TEMP_EXTRACT"

unzip -q "$WSO2_ZIP" -d "$TEMP_EXTRACT"
WSO2_UNZIPPED_FOLDER=$(unzip -Z1 "$WSO2_ZIP" | head -1 | cut -d/ -f1)
WSO2_APP_PATH="$TEMP_EXTRACT/$WSO2_UNZIPPED_FOLDER/WSO2 Integrator.app"

if [ ! -d "$WSO2_APP_PATH" ]; then
    print_error "Could not find WSO2 Integrator.app in extracted files"
    rm -rf "$TEMP_EXTRACT"
    exit 1
fi

print_info "Found WSO2 Integrator.app"

# Step 2: Create temporary DMG folder structure
print_info "Creating DMG folder structure..."
rm -rf "$DMG_FOLDER"
mkdir -p "$DMG_FOLDER"

# Copy the app to DMG folder
print_info "Copying WSO2 Integrator.app to DMG..."
cp -R "$WSO2_APP_PATH" "$DMG_FOLDER/"
chmod -R +x "$DMG_FOLDER/WSO2 Integrator.app/Contents/MacOS"/* 2>/dev/null || true
xattr -cr "$DMG_FOLDER/WSO2 Integrator.app"

# Create Applications symlink
ln -s /Applications "$DMG_FOLDER/Applications"

# Clean up extraction
rm -rf "$TEMP_EXTRACT"

# Copy background image if it exists
if [ -f "$SCRIPT_DIR/dmg-background.png" ]; then
    mkdir -p "$DMG_FOLDER/.background"
    cp "$SCRIPT_DIR/dmg-background.png" "$DMG_FOLDER/.background/background.png"
    print_info "DMG background image added"
fi

# Copy README if it exists
if [ -f "$SCRIPT_DIR/DMG_README.md" ]; then
    cp "$SCRIPT_DIR/DMG_README.md" "$DMG_FOLDER/README.md"
    print_info "README file added to DMG"
fi

# Step 3: Create uncompressed temporary DMG
print_info "Creating temporary DMG..."
hdiutil create -volname "WSO2 Integrator" \
               -srcfolder "$DMG_FOLDER" \
               -ov -format UDRW \
               "$DMG_TEMP_NAME" 2>&1 | grep -v "copying"

if [ ! -f "$DMG_TEMP_NAME" ]; then
    print_error "Failed to create temporary DMG"
    exit 1
fi

print_info "Temporary DMG created: $DMG_TEMP_NAME"

# Step 4: Mount the temporary DMG and customize it
print_info "Mounting DMG for customization..."

# Check if volume is already mounted and unmount it
if [ -d "$DMG_MOUNT_POINT" ]; then
    hdiutil detach "$DMG_MOUNT_POINT" -force 2>/dev/null || true
    sleep 2
fi

# Attach the DMG
hdiutil attach "$DMG_TEMP_NAME" -mountpoint "$DMG_MOUNT_POINT" -nobrowse

print_info "DMG mounted at: $DMG_MOUNT_POINT"

# Step 5: Customize DMG appearance
print_info "Customizing DMG appearance..."

# Set window size, position and background
osascript <<EOF
tell application "Finder"
    tell disk "WSO2 Integrator"
        open
        delay 1
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {100, 100, 640, 480}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 96
        set position of item "WSO2 Integrator.app" of container window to {90, 100}
        set position of item "Applications" of container window to {450, 100}
        if file ".background/background.png" exists then
            set background picture of viewOptions to file ".background/background.png"
        end if
        close
        open
        delay 1
        close
    end tell
end tell
EOF

print_info "DMG appearance customized"

# Step 6: Prepare symlink for Applications
print_info "Setting up folder properties..."
chmod -N "$DMG_MOUNT_POINT" 2>/dev/null || true
# Set custom icon attributes if needed
SetFile -a C "$DMG_MOUNT_POINT" 2>/dev/null || true

# Step 7: Unmount and finalize
print_info "Finalizing DMG..."
hdiutil detach "$DMG_MOUNT_POINT" -force

sleep 2

# Step 8: Convert to compressed DMG
print_info "Compressing DMG..."
hdiutil convert "$DMG_TEMP_NAME" \
                -format UDZO \
                -imagekey zlib-level=9 \
                -o "$DMG_NAME" 2>&1 | grep -v "copying"

if [ ! -f "$DMG_NAME" ]; then
    print_error "Failed to create final DMG"
    rm -rf "$DMG_FOLDER" "$DMG_TEMP_NAME"
    exit 1
fi

print_info "DMG successfully created: $DMG_NAME"

# Step 9: Cleanup
print_info "Cleaning up temporary files..."
rm -f "$DMG_TEMP_NAME"
rm -rf "$DMG_FOLDER"

# Display final information
print_info "=== Build Complete ==="
DMG_SIZE=$(du -h "$DMG_NAME" | cut -f1)
print_info "DMG file: $DMG_NAME (${DMG_SIZE})"
print_info "DMG contains WSO2 Integrator.app - ready for drag-to-install!"
print_info "Users can drag the app to Applications folder to install"
