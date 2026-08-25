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

# Usage: ./build.sh <ballerina_zip> <ballerina_version> <wso2_zip> <icp_zip> <jre_zip> <version> <arch>
if [ "$#" -ne 7 ]; then
    echo "Usage: $0 <ballerina_zip> <ballerina_version> <wso2_zip> <icp_zip> <jre_zip> <version> <arch>"
    exit 1
fi

BALLERINA_ZIP="$1"
BALLERINA_VERSION="$2"
WSO2_ZIP="$3"
ICP_ZIP="$4"
JRE_ZIP="$5"
VERSION="$6"
ARCH="$7"

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

# Prune choreo-cli to darwin/$ARCH only
case "$ARCH" in
    amd64|arm64|x64) ;;
    *) print_error "Unsupported ARCH '$ARCH' for choreo-cli pruning (expected amd64, x64, or arm64)"; exit 1 ;;
esac
# choreo-cli uses Go/Docker naming (amd64), while VSCode/matrix uses x64 for Intel
if [ "$ARCH" = "x64" ]; then
    CHOREO_ARCH="amd64"
else
    CHOREO_ARCH="$ARCH"
fi
CHOREO_CLI_DIR="$WSO2_TARGET/WSO2 Integrator.app/Contents/Resources/app/extensions/wso2.wso2-integrator/resources/choreo-cli"
if [ -d "$CHOREO_CLI_DIR" ]; then
    print_info "Pruning choreo-cli binaries to darwin/$CHOREO_ARCH only"
    for VERSION_DIR in "$CHOREO_CLI_DIR"/*/; do
        [ -d "$VERSION_DIR" ] || continue
        rm -rf "${VERSION_DIR}linux"
        rm -rf "${VERSION_DIR}win32"
        for ARCH_DIR in "${VERSION_DIR}darwin"/*/; do
            [ -d "$ARCH_DIR" ] || continue
            if [ "$(basename "$ARCH_DIR")" != "$CHOREO_ARCH" ]; then
                rm -rf "$ARCH_DIR"
            fi
        done
        if [ -d "${VERSION_DIR}darwin" ] && [ ! -d "${VERSION_DIR}darwin/$CHOREO_ARCH" ]; then
            print_error "choreo-cli darwin/$CHOREO_ARCH not found after pruning in ${VERSION_DIR}"
            exit 1
        fi
    done
fi

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

# Remove unwanted Ballerina folders
rm -rf "$BALLERINA_TARGET/docs"
rm -rf "$BALLERINA_TARGET/examples"

# Extract JRE zip into shared dependencies directory
print_info "Extracting JRE to shared dependencies directory"
DEPENDENCIES_DIR="$COMPONENTS_DIR/dependencies"
rm -rf "$DEPENDENCIES_DIR"
mkdir -p "$DEPENDENCIES_DIR"
unzip -o "$JRE_ZIP" -d "$DEPENDENCIES_DIR"
JRE_FOLDER=$(unzip -Z1 "$JRE_ZIP" | awk -F/ 'NF > 1 && $1 != "__MACOSX" && $1 != "" {print $1}' | sort -u | head -1)
if [ -z "$JRE_FOLDER" ]; then
    print_error "Could not determine JRE folder from zip"
    exit 1
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

# Make icp.sh resolve the JVM env-aware (§D8): prefer the resolved JDK home advertised by the
# product runtime environment (WSO2_INTEGRATOR_JRE_HOME — set once ICP/JRE are seeded to the data
# folder), else fall back to the JRE bundled next to ICP (../../dependencies). Replace icp's bare
# `java` calls with $WSO2_ICP_JAVA, then prepend a resolver that sets it (added AFTER the replace
# so its own `bin/java` isn't itself rewritten). Backward-compatible: with the env var unset it
# resolves to exactly the previous relative path.
ICP_SCRIPT="$ICP_TARGET/bin/icp.sh"
if [ -f "$ICP_SCRIPT" ]; then
    print_info "Modifying icp.sh to use JRE (env-aware, fallback $JRE_FOLDER)"
    sed -i '' -E "s|[[:<:]]java[[:>:]]|\"\$WSO2_ICP_JAVA\"|g" "$ICP_SCRIPT"
    ICP_TMP="$(mktemp)"
    {
        head -n 1 "$ICP_SCRIPT"
        cat <<EOF
WSO2_ICP_JAVA=""
_wso2_icp_sd="\$(cd "\$(dirname "\$0")" && pwd)"
if [ -n "\$WSO2_INTEGRATOR_JRE_HOME" ] && [ -x "\$WSO2_INTEGRATOR_JRE_HOME/bin/java" ]; then
  WSO2_ICP_JAVA="\$WSO2_INTEGRATOR_JRE_HOME/bin/java"
else
  WSO2_ICP_JAVA="\$_wso2_icp_sd/../../dependencies/$JRE_FOLDER/bin/java"
fi
EOF
        tail -n +2 "$ICP_SCRIPT"
    } > "$ICP_TMP"
    mv "$ICP_TMP" "$ICP_SCRIPT"
    # 755 explicitly, not +x: the temp file was created 0600, and an icp.sh that group/other cannot
    # READ cannot be executed by them either (the interpreter has to read it). Root-owned installs
    # (deb/rpm) would otherwise ship an ICP that only root can launch.
    chmod 755 "$ICP_SCRIPT"
fi

# Fix ZIP epoch timestamps — unzip preserves 1980-01-01 dates from ZIP archives
find "$WSO2_TARGET/WSO2 Integrator.app" -exec touch {} +

# -------------------------------------------------------------------
# Code-sign a fully-assembled app bundle (Developer ID + hardened runtime), inside-out:
# loose Mach-O + component executables, then nested bundles deepest-first, then the top
# app. Falls back to ad-hoc signing when no identity is configured (local/dev builds) so
# the app still launches. Reused for the full app and the stripped editor-only update
# bundle (§D8) — stripping files breaks the seal, so the editor-only copy is re-signed.
# -------------------------------------------------------------------
ENTITLEMENTS="$WORK_DIR/entitlements.plist"
sign_app_bundle() {
    local app="$1"
    if [ -n "${MAC_SIGNING_IDENTITY:-}" ]; then
        print_info "Signing app with Developer ID identity: $MAC_SIGNING_IDENTITY ($app)"
        # Executables and bundles get the entitlements (the union covers Electron + the bundled
        # JVM, which needs jit/unsigned-exec-memory/dyld-env/library-validation exceptions);
        # libraries get NONE -- entitlements on a dylib grant nothing and only widen what an
        # auditor has to reason about.
        local SIGN_OPTS=(--force --timestamp --options runtime --entitlements "$ENTITLEMENTS" --sign "$MAC_SIGNING_IDENTITY")
        local LIB_OPTS=(--force --timestamp --options runtime --sign "$MAC_SIGNING_IDENTITY")

        # 1) Loose Mach-O content: libraries and native node addons first (no entitlements), then
        #    executables inside the bundled components (Ballerina/JVM/ICP), then the repackaged CLI
        #    under Resources/app/bin -- a bare Mach-O there is covered by no other pass, and one
        #    unsigned executable fails notarization for the whole app.
        find "$app" -type f \( -name "*.dylib" -o -name "*.so" -o -name "*.node" -o -name "*.jnilib" \) -print0 \
            | while IFS= read -r -d '' f; do codesign "${LIB_OPTS[@]}" "$f"; done
        if [ -d "$app/Contents/components" ]; then
            find "$app/Contents/components" -type f -perm +111 ! -name "*.jar" -print0 \
                | while IFS= read -r -d '' f; do codesign "${SIGN_OPTS[@]}" "$f"; done
        fi
        if [ -d "$app/Contents/Resources/app/bin" ]; then
            find "$app/Contents/Resources/app/bin" -type f -perm +111 -print0 \
                | while IFS= read -r -d '' f; do
                    if file "$f" | grep -q "Mach-O"; then codesign "${SIGN_OPTS[@]}" "$f"; fi
                  done
        fi

        # 2) Nested bundles (Electron frameworks + helper .apps), deepest path first.
        find "$app" -type d \( -name "*.framework" -o -name "*.app" \) | awk '{ print length, $0 }' | sort -rn | cut -d' ' -f2- \
            | while IFS= read -r bundle; do
                [ "$bundle" = "$app" ] && continue
                codesign "${SIGN_OPTS[@]}" "$bundle"
              done

        # 3) The top-level app last, then verify the seal.
        codesign "${SIGN_OPTS[@]}" "$app"
        codesign --verify --deep --strict --verbose=2 "$app"
        print_info "App signed and verified: $app"
    else
        print_warning "MAC_SIGNING_IDENTITY not set — ad-hoc signing (not distributable or notarizable)"
        codesign --force --deep --sign - "$app"
    fi
}

SIGN_APP="$WSO2_TARGET/WSO2 Integrator.app"
sign_app_bundle "$SIGN_APP"

# Build the component package
pkgbuild --root "$EXTRACTION_TARGET" \
         --identifier "$BUNDLE_IDENTIFIER" \
         --version "$VERSION" \
         --install-location "/" \
         --ownership preserve \
         --component-plist "$WORK_DIR/component.plist" \
         "$WORK_DIR/WSO2 Integrator.pkg"

sed -i '' "s/version=\"__VERSION__\"/version=\"$VERSION\"/g" "$WORK_DIR/Distribution.xml"


# Build the final product archive. Signed with the Developer ID Installer identity
# when available — an unsigned .pkg cannot be notarized. (App bundles inside are
# already codesigned with the Application identity; the pkg wrapper needs its own.)
if [ -n "${MAC_INSTALLER_SIGNING_IDENTITY:-}" ]; then
    print_info "Signing installer package with: $MAC_INSTALLER_SIGNING_IDENTITY"
    productbuild --distribution "$WORK_DIR/Distribution.xml" \
                 --resources "$WORK_DIR" \
                 --package-path "$WORK_DIR" \
                 --sign "$MAC_INSTALLER_SIGNING_IDENTITY" \
                 --timestamp \
                 "wso2-integrator-$VERSION-$ARCH.pkg"
else
    print_warning "MAC_INSTALLER_SIGNING_IDENTITY not set — .pkg will be unsigned (not notarizable)"
    productbuild --distribution "$WORK_DIR/Distribution.xml" \
                 --resources "$WORK_DIR" \
                 --package-path "$WORK_DIR" \
                 "wso2-integrator-$VERSION-$ARCH.pkg"
fi

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
ditto "$WSO2_TARGET/$APP_NAME.app" "$DMG_STAGING/$APP_NAME.app" 

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
ATTACH_PLIST=$(hdiutil attach "$TEMP_DMG" -plist)
if [ -z "$ATTACH_PLIST" ]; then
    print_error "hdiutil attach returned empty output"
    exit 1
fi
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
# Something transiently holds a freshly-written volume — Spotlight indexing, fsevents, or the
# Finder used for the window layout above. Three attempts two seconds apart was not enough on a
# real arm64 runner: the build failed here after the app had been signed and the pkg written.
#
# So: escalate the backoff to ~30s total, name the holder when it fails (otherwise the next
# occurrence is just as mysterious as this one was), and fall back to diskutil, which can evict a
# volume hdiutil will not.
_detach_ok=0
for _retry in 1 2 3 4 5 6; do
    if hdiutil detach "$DMG_MOUNT_DIR" -force -quiet; then
        _detach_ok=1; break
    fi
    if [ "$_retry" -lt 6 ]; then
        _wait=$((_retry * 2))
        print_info "Detach attempt $_retry failed; who is holding it:"
        lsof +D "$DMG_MOUNT_DIR" 2>/dev/null | head -8 || true
        print_info "Retrying in ${_wait}s..."
        sleep "$_wait"
    fi
done
if [ "$_detach_ok" -eq 0 ]; then
    print_info "hdiutil could not detach; trying diskutil unmount force"
    if diskutil unmount force "$DMG_MOUNT_DIR" >/dev/null 2>&1; then
        _detach_ok=1
    fi
fi
if [ "$_detach_ok" -eq 0 ]; then
    print_error "Could not unmount $DMG_MOUNT_DIR; aborting before DMG conversion"
    lsof +D "$DMG_MOUNT_DIR" 2>/dev/null | head -20 || true
    exit 1
fi
DMG_MOUNT_DIR=""  # Clear only after successful detach so the trap can still retry on failure
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

# Sign the DMG container itself with the Application identity (the app inside is
# already signed); recommended for notarization and a cleaner Gatekeeper experience.
if [ -n "${MAC_SIGNING_IDENTITY:-}" ]; then
    print_info "Signing DMG with: $MAC_SIGNING_IDENTITY"
    codesign --force --timestamp --sign "$MAC_SIGNING_IDENTITY" "$WORK_DIR/$DMG_NAME"
fi

# -------------------------------------------------------------------
# Create the Squirrel.Mac auto-update payload: a zip of the SIGNED app.
# Squirrel verifies that the Developer ID signature matches on update, so a
# signed app zip is sufficient — it does not need to be notarized/stapled for
# the update mechanism (the DMG covers first-install Gatekeeper). Built with
# `ditto` to preserve symlinks and resource forks in the bundle.
# -------------------------------------------------------------------
MAC_ZIP="wso2-integrator-$VERSION-$ARCH-mac.zip"
print_info "Creating Squirrel.Mac update payload: $MAC_ZIP"
rm -f "$WORK_DIR/$MAC_ZIP"
# INSTALLER_PROFILE=editor-update (§D8): the Squirrel update payload is EDITOR-ONLY — strip the
# bundled Ballerina from a copy and re-sign it (the DMG/PKG first-install artifacts stay full).
# After Squirrel swaps the app, the seeded Ballerina in ~/.wso2-integrator survives the swap.
# Default (full) keeps the current behaviour for local/dev builds.
ZIP_SRC="$SIGN_APP"
if [ "${INSTALLER_PROFILE:-full}" = "editor-update" ]; then
    # W-B: truly editor-only Squirrel payload — drop the entire components tree (Ballerina, ICP,
    # JRE). All are seeded to ~/.wso2-integrator and survive the whole-.app swap; ICP requires the
    # MI extension to read WSO2_INTEGRATOR_ICP_HOME before this payload is published (go-live gate).
    print_info "editor-update profile: building editor-only Squirrel payload (runtimes relocated)"
    EDITOR_APP="$WORK_DIR/editor_update/WSO2 Integrator.app"
    rm -rf "$WORK_DIR/editor_update"
    mkdir -p "$WORK_DIR/editor_update"
    ditto "$SIGN_APP" "$EDITOR_APP"
    rm -rf "$EDITOR_APP/Contents/components"
    sign_app_bundle "$EDITOR_APP"
    ZIP_SRC="$EDITOR_APP"
fi
ditto -c -k --sequesterRsrc --keepParent "$ZIP_SRC" "$WORK_DIR/$MAC_ZIP"
if [ -f "$WORK_DIR/$MAC_ZIP" ]; then
    print_info "Successfully created: $MAC_ZIP ($(du -h "$WORK_DIR/$MAC_ZIP" | cut -f1))"
else
    print_error "Failed to create Squirrel.Mac update zip"
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
