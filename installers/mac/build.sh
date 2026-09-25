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

# The .app bundle is named after product.json nameLong, which depends on the
# product flavor ("WSO2 Integrator" / "WSO2 Agent Builder"), so detect it from
# the payload instead of hardcoding it.
APP_BUNDLE=$(cd "$WSO2_TARGET" && ls -d *.app 2>/dev/null | head -1)
if [ -z "$APP_BUNDLE" ]; then
    print_error "No .app bundle found in $WSO2_TARGET"
    exit 1
fi
APP_NAME="${APP_BUNDLE%.app}"
print_info "Detected app bundle: $APP_BUNDLE"

# The pkg identifier must match the app's darwinBundleIdentifier so each
# flavor keeps its own installer receipts (side-by-side installs).
case "$APP_NAME" in
    "WSO2 Agent Builder") BUNDLE_IDENTIFIER="com.wso2.agentbuilder" ;;
    *)                    BUNDLE_IDENTIFIER="com.wso2.integrator" ;;
esac
print_info "Package identifier: $BUNDLE_IDENTIFIER"

# Artifact file names carry the flavor slug so the two products' installers
# never collide on a release page or in the update bucket.
case "$APP_NAME" in
    "WSO2 Agent Builder") ARTIFACT_SLUG="wso2-agent-builder" ;;
    *)                    ARTIFACT_SLUG="wso2-integrator" ;;
esac
print_info "Artifact slug: $ARTIFACT_SLUG"

chmod +x "$WSO2_TARGET/$APP_BUNDLE/Contents/MacOS"/* 2>/dev/null || true
xattr -cr "$WSO2_TARGET/$APP_BUNDLE"

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
CHOREO_CLI_DIR="$WSO2_TARGET/$APP_BUNDLE/Contents/Resources/app/extensions/wso2.wso2-integrator/resources/choreo-cli"
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
COMPONENTS_DIR="$WORK_DIR/payload/Applications/$APP_BUNDLE/Contents/components"
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
find "$WSO2_TARGET/$APP_BUNDLE" -exec touch {} +

# Resolve the product-name placeholder in packaging metadata (same in-place
# substitute/restore pattern as __VERSION__ in Distribution.xml).
sed -i '' "s/__PRODUCT_NAME__/$APP_NAME/g" "$WORK_DIR/component.plist"
sed -i '' "s/__PRODUCT_NAME__/$APP_NAME/g" "$WORK_DIR/Distribution.xml"
sed -i '' "s/__BUNDLE_ID__/$BUNDLE_IDENTIFIER/g" "$WORK_DIR/Distribution.xml"
sed -i '' "s/__PRODUCT_NAME__/$APP_NAME/g" "$WORK_DIR/welcome.html"
sed -i '' "s/__PRODUCT_NAME__/$APP_NAME/g" "$WORK_DIR/conclusion.html"

# -------------------------------------------------------------------
# Code-sign a fully-assembled app bundle (Developer ID + hardened runtime), inside-out:
# natives inside jars, then every loose Mach-O, then nested bundles deepest-first, then
# the top app. Falls back to ad-hoc signing when no identity is configured (local/dev builds) so
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

        # 1) Native libraries INSIDE .jar archives. The notary service unpacks jars, so a JNI
        #    library shipped in a dependency jar is rejected exactly like a loose one -- that was
        #    the bulk of the first rejection (sqlite-jdbc, netty-tcnative, lz4-java, jansi, jffi).
        #    Extract, sign, write back into the same entry. Runs before anything is sealed.
        find "$app" -type f -name "*.jar" -print0 \
            | while IFS= read -r -d '' jar; do
                listing=$(unzip -Z1 "$jar" 2>/dev/null || true)
                natives=$(printf '%s\n' "$listing" | grep -E '\.(dylib|jnilib|so)$' || true)
                [ -n "$natives" ] || continue
                # Rewriting an entry invalidates a jarsigner signature. Say so rather than ship a
                # jar whose seal we broke -- and rather than fail a build over a jar we cannot fix.
                if printf '%s\n' "$listing" | grep -qE '^META-INF/.*\.(SF|DSA|RSA|EC)$'; then
                    # Not fatal: a jar we cannot fix should not block a release, and it cannot
                    # slip through either -- the notary step fails the build and prints Apple's
                    # log, which names the file. Annotated so it is visible without reading the
                    # build output line by line.
                    print_warning "jarsigner-signed, leaving its natives unsigned: $jar"
                    [ -n "${GITHUB_ACTIONS:-}" ] && echo "::warning::jarsigner-signed jar left unsigned, notarization may reject it: $jar"
                    continue
                fi
                jar_abs="$(cd "$(dirname "$jar")" && pwd)/$(basename "$jar")"
                jar_tmp=$(mktemp -d)
                (
                    cd "$jar_tmp"
                    printf '%s\n' "$natives" | while IFS= read -r entry; do
                        unzip -qo "$jar_abs" "$entry" || continue
                        [ -f "$entry" ] || continue
                        file -b "$entry" | grep -q "Mach-O" || continue
                        codesign "${LIB_OPTS[@]}" "$entry"
                        zip -q "$jar_abs" "$entry"
                        # Read the entry back OUT of the archive and verify it. Nothing else
                        # covers the write-back: `codesign --verify` on the app never looks
                        # inside a jar, so a botched rewrite would pass CI clean and surface
                        # as a native-load failure on a user's machine.
                        rm -rf .verify && mkdir .verify
                        ( cd .verify && unzip -qo "$jar_abs" "$entry" && codesign --verify "$entry" )
                        rm -rf .verify
                    done
                )
                rm -rf "$jar_tmp"
              done

        # 2) Every Mach-O in the bundle, wherever it lives and whatever it is called. Matching by
        #    extension and location missed six binaries that notarization rejected:
        #    chrome_crashpad_handler and ShipIt nested in frameworks, and choreo/tgrep/rg/
        #    spawn-helper under Resources -- none of which carry an extension. `file` is the only
        #    reliable test, and it is architecture-agnostic: an arm64 build ships x86_64 slices
        #    and an x64 build ships arm64 ones. Executables take the entitlements (the union
        #    covers Electron + the bundled JVM, which needs jit/unsigned-exec-memory/dyld-env/
        #    library-validation exceptions); libraries take none, since entitlements on a dylib
        #    grant nothing and only widen what an auditor has to reason about.
        find "$app" -type f \( -perm +111 -o -name "*.dylib" -o -name "*.so" -o -name "*.node" -o -name "*.jnilib" \) -print0 \
            | while IFS= read -r -d '' f; do
                # Match the Mach-O KIND, not just the string: `file` also says Mach-O for object
                # files, dSYM companions and kext bundles, none of which codesign will accept --
                # and under `set -e` one of those would stop the build.
                case "$(file -b "$f" | tr '\n' ' ')" in
                    *dSYM*|*kext*|*Mach-O*object*)
                        : ;;
                    *Mach-O*executable*)
                        # Entitlements stay where they were before this sweep existed: the bundled
                        # JVM and Ballerina launchers under components, and the repackaged CLI. The
                        # executables this sweep newly reaches -- rg, tgrep, choreo, spawn-helper,
                        # ShipIt, chrome_crashpad_handler -- get the hardened runtime and nothing
                        # else. Handing them disable-library-validation and
                        # allow-dyld-environment-variables would let DYLD_INSERT_LIBRARIES load
                        # arbitrary code into a Developer-ID-signed binary; spawn-helper starts
                        # user shells, so that is not theoretical.
                        case "$f" in
                            "$app"/Contents/components/*|"$app"/Contents/Resources/app/bin/*)
                                codesign "${SIGN_OPTS[@]}" "$f" ;;
                            *)  codesign "${LIB_OPTS[@]}" "$f" ;;
                        esac ;;
                    *Mach-O*shared\ library*|*Mach-O*bundle*|*Mach-O*dynamically\ linked*)
                        codesign "${LIB_OPTS[@]}" "$f" ;;
                esac
              done

        # 3) Nested bundles (Electron frameworks + helper .apps), deepest path first.
        find "$app" -type d \( -name "*.framework" -o -name "*.app" \) | awk '{ print length, $0 }' | sort -rn | cut -d' ' -f2- \
            | while IFS= read -r bundle; do
                [ "$bundle" = "$app" ] && continue
                codesign "${SIGN_OPTS[@]}" "$bundle"
              done

        # 4) The top-level app last, then verify the seal.
        codesign "${SIGN_OPTS[@]}" "$app"
        codesign --verify --deep --strict --verbose=2 "$app"
        print_info "App signed and verified: $app"
    else
        print_warning "MAC_SIGNING_IDENTITY not set — ad-hoc signing (not distributable or notarizable)"
        codesign --force --deep --sign - "$app"
    fi
}

SIGN_APP="$WSO2_TARGET/$APP_BUNDLE"
sign_app_bundle "$SIGN_APP"

# -------------------------------------------------------------------
# Build the DMG
# -------------------------------------------------------------------

# APP_NAME was detected from the payload above (flavor-dependent).
DMG_NAME="$ARTIFACT_SLUG-$VERSION-$ARCH.dmg"
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
# The device node backs the whole attached image; detaching IT is the one operation that works
# even when the volume itself is held (see the detach fallbacks below).
DMG_DEVICE=$(echo "$ATTACH_PLIST" | python3 -c "
import sys, plistlib
pl = plistlib.loads(sys.stdin.buffer.read())
for e in pl.get('system-entities', []):
    if e.get('mount-point', '').startswith('/Volumes/'):
        print(e.get('dev-entry', ''))
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
# The layout script above deliberately ends on `open`, so when it actually runs (it is
# best-effort and silently skipped on restricted runners) Finder is left holding the volume
# through an open window — a hold lsof cannot see (no file descriptors under the mount), which
# is why run 35460059131 failed every detach with an EMPTY "who is holding it". Undo that hold
# the same way it was created: close the window, then ask Finder itself to eject. Both are
# best-effort; the hdiutil loop below remains the mechanism of record.
osascript -e "tell application \"Finder\" to close (every window whose name is \"$(basename "$DMG_MOUNT_DIR")\")" 2>/dev/null || true
osascript -e "tell application \"Finder\" to eject disk \"$(basename "$DMG_MOUNT_DIR")\"" 2>/dev/null || true
sync
sleep 3
# Something transiently holds a freshly-written volume — Spotlight indexing, fsevents, or the
# Finder used for the window layout above. Three attempts two seconds apart was not enough on a
# real arm64 runner: the build failed here after the app had already been signed.
#
# So: escalate the backoff to ~30s total, name the holder when it fails (otherwise the next
# occurrence is just as mysterious as this one was), and fall back to diskutil, which can evict a
# volume hdiutil will not.
_detach_ok=0
for _retry in 1 2 3 4 5 6; do
    # The Finder eject above may already have detached it; hdiutil on a gone mount would "fail"
    # six times and abort a build whose volume is in exactly the state we want.
    if [ ! -d "$DMG_MOUNT_DIR" ]; then
        _detach_ok=1; break
    fi
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
if [ "$_detach_ok" -eq 0 ] && [ -n "$DMG_DEVICE" ]; then
    # Last resort: detach the DEVICE backing the image rather than the volume. This severs the
    # attachment even when a process holds the volume, which neither hdiutil-by-mountpoint nor
    # diskutil unmount can do.
    print_info "Trying device-level detach of $DMG_DEVICE"
    if hdiutil detach "$DMG_DEVICE" -force -quiet; then
        _detach_ok=1
    fi
fi
if [ "$_detach_ok" -eq 0 ]; then
    print_error "Could not unmount $DMG_MOUNT_DIR; aborting before DMG conversion"
    lsof +D "$DMG_MOUNT_DIR" 2>/dev/null | head -20 || true
    hdiutil info || true
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
MAC_ZIP="$ARTIFACT_SLUG-$VERSION-$ARCH-mac.zip"
print_info "Creating Squirrel.Mac update payload: $MAC_ZIP"
rm -f "$WORK_DIR/$MAC_ZIP"
# INSTALLER_PROFILE=editor-update (§D8): the Squirrel update payload is EDITOR-ONLY — strip the
# bundled Ballerina from a copy and re-sign it (the DMG, the first-install artifact, stays full).
# After Squirrel swaps the app, the seeded Ballerina in ~/.wso2-integrator survives the swap.
# Default (full) keeps the current behaviour for local/dev builds.
ZIP_SRC="$SIGN_APP"
if [ "${INSTALLER_PROFILE:-full}" = "editor-update" ]; then
    # W-B: truly editor-only Squirrel payload — drop the entire components tree (Ballerina, ICP,
    # JRE). All are seeded to ~/.wso2-integrator and survive the whole-.app swap; ICP requires the
    # MI extension to read WSO2_INTEGRATOR_ICP_HOME before this payload is published (go-live gate).
    print_info "editor-update profile: building editor-only Squirrel payload (runtimes relocated)"
    EDITOR_APP="$WORK_DIR/editor_update/$APP_BUNDLE"
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

print_info "Done!"
