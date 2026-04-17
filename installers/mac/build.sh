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

# Usage: ./build.sh <ballerina_zip> <ballerina_version> <wso2_zip> <icp_zip> <version> <arch>
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

OUTPUT_PKG="WSO2_Integrator.pkg"
BUNDLE_IDENTIFIER="com.wso2.integrator"
EXTRACTION_TARGET="$WORK_DIR/payload"

# Extract wso2 zip
WSO2_TARGET="$WORK_DIR/payload/Applications"
rm -rf "$WSO2_TARGET"
mkdir -p "$WSO2_TARGET"
unzip -o "$WSO2_ZIP" -d "$EXTRACTION_TARGET"
WSO2_UNZIPPED_FOLDER=$(unzip -Z1 "$WSO2_ZIP" | head -1 | cut -d/ -f1)
WSO2_UNZIPPED_PATH="$EXTRACTION_TARGET/$WSO2_UNZIPPED_FOLDER"
mv "$WSO2_UNZIPPED_PATH"/* "$WSO2_TARGET"
rm -rf "$WSO2_UNZIPPED_PATH"
chmod +x "$WSO2_TARGET/WSO2 Integrator.app/Contents/MacOS"/* 2>/dev/null || true
xattr -cr "$WSO2_TARGET/WSO2 Integrator.app"

rm -rf "$EXTRACTION_TARGET/__MACOSX"

# Extract Ballerina zip
print_info "Extracting Ballerina to package resources"
COMPONENTS_DIR="$WORK_DIR/payload/Applications/WSO2 Integrator.app/Contents/components"
BALLERINA_TARGET="$COMPONENTS_DIR/ballerina"
rm -rf "$BALLERINA_TARGET"
mkdir -p "$BALLERINA_TARGET"
unzip -o "$BALLERINA_ZIP" -d "$EXTRACTION_TARGET"
BALLERINA_UNZIPPED_FOLDER=$(unzip -Z1 "$BALLERINA_ZIP" | head -1 | cut -d/ -f1)
BALLERINA_UNZIPPED_PATH="$EXTRACTION_TARGET/$BALLERINA_UNZIPPED_FOLDER"

# Create a temp directory for consolidation
BALLERINA_TEMP="$WORK_DIR/ballerina_temp"
rm -rf "$BALLERINA_TEMP"
mkdir -p "$BALLERINA_TEMP"

# Move distributions contents to temp
print_info "Consolidating Ballerina distributions"
if [ -d "$BALLERINA_UNZIPPED_PATH/distributions" ]; then
    DIST_FOLDER=$(ls "$BALLERINA_UNZIPPED_PATH/distributions" | head -1)
    if [ -n "$DIST_FOLDER" ]; then
        cp -r "$BALLERINA_UNZIPPED_PATH/distributions/$DIST_FOLDER"/* "$BALLERINA_TEMP/"
    fi
fi

# Move distributions contents to target (without JDK)
mv "$BALLERINA_TEMP"/* "$BALLERINA_TARGET"

# Move JDK to shared dependencies directory
print_info "Moving JDK to shared dependencies directory"
DEPENDENCIES_DIR="$COMPONENTS_DIR/dependencies"
rm -rf "$DEPENDENCIES_DIR"
mkdir -p "$DEPENDENCIES_DIR"
if [ -d "$BALLERINA_UNZIPPED_PATH/dependencies" ]; then
    for jdk_folder in "$BALLERINA_UNZIPPED_PATH/dependencies"/*; do
        if [ -d "$jdk_folder" ]; then
            JDK_FOLDER=$(basename "$jdk_folder")
            cp -r "$jdk_folder" "$DEPENDENCIES_DIR/"
        fi
    done
fi


rm -rf "$BALLERINA_UNZIPPED_PATH"
rm -rf "$BALLERINA_TEMP"

# Replace bal script with the one from balscript and update version
print_info "Replacing bal script with updated version from balscript"
cp "$WORK_DIR/balscript/bal" "$BALLERINA_TARGET/bin/bal"
sed -i '' "s/@BALLERINA_VERSION@/$BALLERINA_VERSION/g" "$BALLERINA_TARGET/bin/bal"

chmod +x "$BALLERINA_TARGET/bin"/*


# Extract icp zip
ICP_TARGET="$COMPONENTS_DIR/icp"
rm -rf "$ICP_TARGET"
mkdir -p "$ICP_TARGET"
unzip -o "$ICP_ZIP" -d "$EXTRACTION_TARGET"
ICP_UNZIPPED_FOLDER=$(unzip -Z1 "$ICP_ZIP" | head -1 | cut -d/ -f1)
ICP_UNZIPPED_PATH="$EXTRACTION_TARGET/$ICP_UNZIPPED_FOLDER"
mv "$ICP_UNZIPPED_PATH"/* "$ICP_TARGET"
rm -rf "$ICP_UNZIPPED_PATH"
chmod +x "$ICP_TARGET/bin"/*

# Modify icp.sh to use the JDK from shared dependencies directory
ICP_SCRIPT="$ICP_TARGET/bin/icp.sh"
if [ -f "$ICP_SCRIPT" ]; then
    print_info "Modifying icp.sh to use JDK from dependencies ($JDK_FOLDER)"
    # Replace all java instances with the full path to the JDK java
    sed -i '' "s|java|\"\$SCRIPT_DIR\"/../../dependencies/$JDK_FOLDER/bin/java|g" "$ICP_SCRIPT"
fi




# Build the component package
pkgbuild --root "$EXTRACTION_TARGET" \
         --identifier "$BUNDLE_IDENTIFIER" \
         --version "$VERSION" \
         --install-location "/" \
         --ownership preserve \
         --component-plist "$WORK_DIR/component.plist" \
         "$WORK_DIR/WSO2 Integrator.pkg"

sed -i '' "s/version=\"__VERSION__\"/version=\"$VERSION\"/g" "$WORK_DIR/Distribution.xml"


# Build the final product archive
productbuild --distribution "$WORK_DIR/Distribution.xml" \
             --resources "$WORK_DIR" \
             --package-path "$WORK_DIR" \
             "wso2-integrator-$VERSION-$ARCH.pkg"

sed -i '' "s/version=\"$VERSION\"/version=\"__VERSION__\"/g" "$WORK_DIR/Distribution.xml"


# Check if the build was successful
if [ -f "wso2-integrator-$VERSION-$ARCH.pkg" ]; then
    print_info "Successfully created: wso2-integrator-$VERSION-$ARCH.pkg"
    print_info "Package size: $(du -h "wso2-integrator-$VERSION-$ARCH.pkg" | cut -f1)"
else
    print_error "Failed to create pkg package"
    exit 1
fi

# -------------------------------------------------------------------
# Build the DMG
# -------------------------------------------------------------------

APP_NAME="WSO2 Integrator"
DMG_NAME="wso2-integrator-$VERSION-$ARCH.dmg"
DMG_STAGING="$WORK_DIR/dmg_staging"

# Fix #4: include $ARCH in temp filename to avoid collisions across architectures
TEMP_DMG="$WORK_DIR/tmp_rw_$VERSION-$ARCH.dmg"

# Fix #3: cleanup trap — detach mounted image and remove temp artifacts on any exit
DMG_MOUNT_DIR=""
dmg_cleanup() {
    if [ -n "$DMG_MOUNT_DIR" ] && hdiutil info | grep -q "$DMG_MOUNT_DIR"; then
        print_warning "Trap: detaching leftover DMG mount at $DMG_MOUNT_DIR"
        hdiutil detach "$DMG_MOUNT_DIR" -force -quiet 2>/dev/null || true
    fi
    rm -f "$TEMP_DMG"
    rm -rf "$DMG_STAGING"
}
trap dmg_cleanup EXIT

print_info "Preparing DMG staging directory"
rm -rf "$DMG_STAGING"
mkdir -p "$DMG_STAGING"

# The .app is still fully assembled in WSO2_TARGET — reuse it directly
cp -r "$WSO2_TARGET/$APP_NAME.app" "$DMG_STAGING/"

# Fix #5: remove any leftover temp DMG before creation to avoid "File exists" error
rm -f "$TEMP_DMG"

print_info "Creating temporary writable DMG (auto-sized)"
hdiutil create \
    -srcfolder "$DMG_STAGING" \
    -volname "$APP_NAME" \
    -fs HFS+ \
    -format UDRW \
    "$TEMP_DMG"

print_info "Mounting temporary DMG for customisation"
# Fix #1: capture actual mountpoint from hdiutil attach output via -plist
# Note: -quiet suppresses plist output, so redirect stderr instead
ATTACH_PLIST=$(hdiutil attach "$TEMP_DMG" -plist 2>/dev/null)
DMG_MOUNT_DIR=$(echo "$ATTACH_PLIST" | python3 -c "
import sys, plistlib
pl = plistlib.loads(sys.stdin.buffer.read())
for e in pl.get('system-entities', []):
    mp = e.get('mount-point', '')
    if mp.startswith('/Volumes/'):
        print(mp)
        break
")

if [ -z "$DMG_MOUNT_DIR" ]; then
    print_error "Failed to determine DMG mount point"
    exit 1
fi
print_info "DMG mounted at: $DMG_MOUNT_DIR"
sleep 3

# Fix #2: create a POSIX symlink as fallback (works in CI without Finder)
ln -sf /Applications "$DMG_MOUNT_DIR/Applications"

# Fix #2: attempt Finder window layout but treat it as best-effort (non-fatal)
print_info "Configuring DMG window layout (best-effort)"
osascript <<APPLESCRIPT 2>/dev/null || print_warning "Finder AppleScript layout skipped (restricted environment)"
tell application "Finder"
    set dmgDisk to disk "$(basename "$DMG_MOUNT_DIR")"
    tell dmgDisk
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {400, 100, 840, 480}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 100
        set position of item "$APP_NAME.app" of container window to {130, 170}
        set position of item "Applications" of container window to {310, 170}
        close
        open
        update without registering applications
        delay 2
    end tell
end tell
APPLESCRIPT

print_info "Finalising DMG"
sync
sleep 3
hdiutil detach "$DMG_MOUNT_DIR" -force -quiet
DMG_MOUNT_DIR=""  # Clear so trap doesn't attempt a second detach
hdiutil convert "$TEMP_DMG" \
    -format UDZO \
    -imagekey zlib-level=9 \
    -o "$WORK_DIR/$DMG_NAME"

if [ -f "$WORK_DIR/$DMG_NAME" ]; then
    print_info "Successfully created: $DMG_NAME"
    print_info "Package size: $(du -h "$WORK_DIR/$DMG_NAME" | cut -f1)"
else
    print_error "Failed to create DMG package"
    exit 1
fi

# Temp files cleaned by the EXIT trap
trap - EXIT
dmg_cleanup

# Cleanup
rm -rf "${WSO2_TARGET:?}"/*
rm -rf "${ICP_TARGET:?}"/*
rm -rf "${BALLERINA_TARGET:?}"/*
rm -rf "$EXTRACTION_TARGET/Library"
rm -rf "$EXTRACTION_TARGET/Applications"
rm -rf "$WORK_DIR/WSO2 Integrator.pkg"

print_info "Done!"
