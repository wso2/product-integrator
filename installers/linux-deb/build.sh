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

# Usage: ./build.sh <ballerina_zip> <ballerina_version> <integrator_tar_gz> <icp_zip> <jre_zip> [version]
if [ "$#" -lt 5 ]; then
    echo "Usage: $0 <ballerina_zip> <ballerina_version> <integrator_tar_gz> <icp_zip> <jre_zip> [version]"
    exit 1
fi

BALLERINA_ZIP="$1"
BALLERINA_VERSION="$2"
INTEGRATOR_TAR_GZ="$3"
ICP_ZIP="$4"
JRE_ZIP="$5"
VERSION="${6:-1.0.0}"

# Product flavor drives the PACKAGE identity (package name, install dir, desktop
# entries, /usr/bin symlink); the payload binary name (applicationName) stays
# "wso2-integrator" for BOTH flavors on purpose — only the identity is flavored.
PRODUCT_FLAVOR="${PRODUCT_FLAVOR:-integrator}"
case "$PRODUCT_FLAVOR" in
    integrator)
        ARTIFACT_SLUG="wso2-integrator"
        PRODUCT_NAME="WSO2 Integrator"
        ICON_ID="com.wso2.integrator"
        ;;
    agent-builder)
        ARTIFACT_SLUG="wso2-agent-builder"
        PRODUCT_NAME="WSO2 Agent Builder"
        ICON_ID="com.wso2.agentbuilder"
        ;;
    *)
        print_error "Unknown PRODUCT_FLAVOR '$PRODUCT_FLAVOR' (expected 'integrator' or 'agent-builder')"
        exit 1
        ;;
esac
print_info "Product flavor: $PRODUCT_FLAVOR (slug: $ARTIFACT_SLUG)"

# Check if input files exist
if [ ! -f "$BALLERINA_ZIP" ]; then
    print_error "Ballerina ZIP file not found: $BALLERINA_ZIP"
    exit 1
fi

if [ ! -f "$INTEGRATOR_TAR_GZ" ]; then
    print_error "Integrator TAR.GZ file not found: $INTEGRATOR_TAR_GZ"
    exit 1
fi

if [ ! -f "$ICP_ZIP" ]; then
    print_error "ICP ZIP file not found: $ICP_ZIP"
    exit 1
fi

if [ ! -f "$JRE_ZIP" ]; then
    print_error "JRE ZIP file not found: $JRE_ZIP"
    exit 1
fi

# Define paths
STAGE_DIR="$WORK_DIR/package_stage"
INTEGRATOR_TARGET="$STAGE_DIR/usr/share/$ARTIFACT_SLUG"
COMPONENTS_DIR="$INTEGRATOR_TARGET/components"
BALLERINA_TARGET="$COMPONENTS_DIR/ballerina"
DEPENDENCIES_DIR="$COMPONENTS_DIR/dependencies"
ICP_TARGET="$COMPONENTS_DIR/icp"
EXTRACTION_TARGET="$WORK_DIR/extraction_temp"

print_info "Starting DEB package build process..."

# Clean and recreate package directories
print_info "Preparing package structure..."
# Render the committed package template into a fresh staging tree. Flavor
# placeholders (@SLUG@/@PRODUCT_NAME@/@ICON_ID@) resolve in the staged copy
# only, so the committed tree stays flavor-neutral and is never edited in place.
rm -rf "$STAGE_DIR"
cp -a "$WORK_DIR/package" "$STAGE_DIR"
# Payloads left behind by older in-place builds must not leak into the package.
rm -rf "$STAGE_DIR/usr/share/wso2-integrator" "$STAGE_DIR/usr/share/wso2-agent-builder"
print_info "Rendering package metadata for flavor '$PRODUCT_FLAVOR'..."
find "$STAGE_DIR/usr/share/applications" "$STAGE_DIR/usr/share/appdata" \
     "$STAGE_DIR/usr/share/bash-completion/completions" "$STAGE_DIR/DEBIAN" -type f -print0 |
    xargs -0 sed -i "s|@SLUG@|$ARTIFACT_SLUG|g; s|@PRODUCT_NAME@|$PRODUCT_NAME|g; s|@ICON_ID@|$ICON_ID|g"
if [ "$ARTIFACT_SLUG" != "wso2-integrator" ]; then
    APPS_DIR="$STAGE_DIR/usr/share/applications"
    mv "$APPS_DIR/wso2-integrator.desktop" "$APPS_DIR/$ARTIFACT_SLUG.desktop"
    mv "$APPS_DIR/wso2-integrator-url-handler.desktop" "$APPS_DIR/$ARTIFACT_SLUG-url-handler.desktop"
    mv "$STAGE_DIR/usr/share/appdata/wso2-integrator.appdata.xml" "$STAGE_DIR/usr/share/appdata/$ARTIFACT_SLUG.appdata.xml"
    mv "$STAGE_DIR/usr/share/bash-completion/completions/wso2-integrator" "$STAGE_DIR/usr/share/bash-completion/completions/$ARTIFACT_SLUG"
    # No dedicated Agent Builder artwork exists yet — ship the existing art under
    # the flavored names so Icon= and the appdata screenshot resolve.
    mv "$STAGE_DIR/usr/share/pixmaps/com.wso2.integrator.svg" "$STAGE_DIR/usr/share/pixmaps/$ICON_ID.svg"
    mv "$STAGE_DIR/usr/share/pixmaps/wso2-integrator-front.png" "$STAGE_DIR/usr/share/pixmaps/$ARTIFACT_SLUG-front.png"
fi
rm -rf "$EXTRACTION_TARGET"
mkdir -p "$INTEGRATOR_TARGET"
mkdir -p "$EXTRACTION_TARGET"

# Extract integrator archive
print_info "Extracting WSO2 Integrator..."
tar -xzf "$INTEGRATOR_TAR_GZ" -C "$INTEGRATOR_TARGET" --strip-components=1

# Prune choreo-cli to linux/amd64 only
CHOREO_CLI_DIR="$INTEGRATOR_TARGET/resources/app/extensions/wso2.wso2-integrator/resources/choreo-cli"
if [ -d "$CHOREO_CLI_DIR" ]; then
    print_info "Pruning choreo-cli binaries to linux/amd64 only"
    for VERSION_DIR in "$CHOREO_CLI_DIR"/*/; do
        [ -d "$VERSION_DIR" ] || continue
        rm -rf "${VERSION_DIR}darwin"
        rm -rf "${VERSION_DIR}win32"
        rm -rf "${VERSION_DIR}linux/arm64"
    done
fi

# Extract the packaged ballerina-runtime (ci/build/package-ballerina-runtime.sh)
print_info "Extracting Ballerina to components..."
mkdir -p "$BALLERINA_TARGET"
unzip -q -o "$BALLERINA_ZIP" -d "$BALLERINA_TARGET"

# Pre-bundled Ballerina Central packages. ci/build/merge-ballerina-packages.sh owns the merge; see
# ci/build/ballerina-packages.properties for what is bundled and why.
if [ -n "${BALLERINA_PACKAGES_DIR:-}" ]; then
    "$(cd "$(dirname "$0")/../.." && pwd)/ci/build/merge-ballerina-packages.sh" \
        "$BALLERINA_PACKAGES_DIR" "$BALLERINA_TARGET" "$INTEGRATOR_TARGET/resources/app"
fi

# Extract JRE zip into shared dependencies directory
print_info "Extracting JRE to shared dependencies directory"
rm -rf "$DEPENDENCIES_DIR"
mkdir -p "$DEPENDENCIES_DIR"
unzip -o "$JRE_ZIP" -d "$DEPENDENCIES_DIR"
JRE_FOLDER=$(unzip -Z1 "$JRE_ZIP" | awk -F/ '{print $1}' | sort -u | grep -v '^$' | head -1)
if [ -z "$JRE_FOLDER" ]; then
    print_error "Could not determine JRE folder from zip"
    exit 1
fi

chmod +x "$BALLERINA_TARGET/bin"/*

# Extract the packaged icp (ci/build/package-icp.sh): launchers already patched for our JRE
print_info "Extracting Integration Control Plane..."
mkdir -p "$ICP_TARGET"
unzip -q -o "$ICP_ZIP" -d "$ICP_TARGET"

# # Update dashboard.sh to set JAVA_HOME to point to shared JDK
# print_info "Updating dashboard.sh to point to shared JDK"
# DASHBOARD_SCRIPT="$ICP_TARGET/bin/dashboard.sh"
# if [ -f "$DASHBOARD_SCRIPT" ]; then
#     cat > "$DASHBOARD_SCRIPT.tmp" << 'DASHBOARD_EOF'
# # Set JAVA_HOME for installers
# SCRIPT_DIR="$( cd "$( dirname "$0" )" && pwd )"
# # Find JDK folder dynamically in the shared dependencies directory
# for jdk in "$SCRIPT_DIR"/../../dependencies/jdk-*; do
#     if [ -d "$jdk" ]; then
#         export JAVA_HOME="$jdk"
#         break
#     fi
# done
# DASHBOARD_EOF
#     # Insert the Java home setup after the PRG and PRGDIR definitions (line 18-19)
#     head -n 19 "$DASHBOARD_SCRIPT" > "$DASHBOARD_SCRIPT.new"
#     cat "$DASHBOARD_SCRIPT.tmp" >> "$DASHBOARD_SCRIPT.new"
#     tail -n +20 "$DASHBOARD_SCRIPT" >> "$DASHBOARD_SCRIPT.new"
#     mv "$DASHBOARD_SCRIPT.new" "$DASHBOARD_SCRIPT"
#     rm "$DASHBOARD_SCRIPT.tmp"
#     chmod +x "$DASHBOARD_SCRIPT"
# fi

# Set executable permissions
print_info "Setting executable permissions..."
find "$INTEGRATOR_TARGET/bin" -type f -exec chmod +x {} \; 2>/dev/null || true
chmod +x "$INTEGRATOR_TARGET/wso2-integrator" 2>/dev/null || true

# Make DEBIAN scripts executable
chmod 755 "$STAGE_DIR/DEBIAN/postinst"
chmod 755 "$STAGE_DIR/DEBIAN/postrm"
chmod 755 "$STAGE_DIR/DEBIAN/prerm"

# Update version in control file
print_info "Updating version in control file to $VERSION..."
sed -i "s/@VERSION@/$VERSION/" "$STAGE_DIR/DEBIAN/control"

# INSTALLER_PROFILE=editor-update (§D8): drop the bundled Ballerina to produce the small
# editor-only update package. The client seeds/resolves Ballerina from the per-user data
# folder; on upgrade dpkg removes the old package's ballerina dir, but the seeded copy survives.
# Stripped BEFORE Installed-Size is computed, so apt's free-space check sees the real size
# rather than the full package's.
DEB_SUFFIX=""
if [ "${INSTALLER_PROFILE:-full}" = "editor-update" ]; then
    # W-B: truly editor-only — drop Ballerina, ICP and the JRE. All are seeded to the data folder;
    # ICP requires the MI extension to read WSO2_INTEGRATOR_ICP_HOME before this build is published.
    rm -rf "$BALLERINA_TARGET" "$ICP_TARGET" "$DEPENDENCIES_DIR"
    DEB_SUFFIX="-update"
    print_info "editor-update profile: removed bundled Ballerina/ICP/JRE from package"
fi

# Get the installed size
INSTALLED_SIZE=$(du -sk "$STAGE_DIR" | cut -f1)

# Update or add Installed-Size field
if grep -q "^Installed-Size:" "$STAGE_DIR/DEBIAN/control"; then
    sed -i "s/^Installed-Size:.*/Installed-Size: $INSTALLED_SIZE/" "$STAGE_DIR/DEBIAN/control"
else
    echo "Installed-Size: $INSTALLED_SIZE" >> "$STAGE_DIR/DEBIAN/control"
fi

# Build DEB package
OUTPUT_DEB="$WORK_DIR/${ARTIFACT_SLUG}_${VERSION}_amd64${DEB_SUFFIX}.deb"
print_info "Building DEB package..."
dpkg-deb -b "$STAGE_DIR" "$OUTPUT_DEB"

# Check if the build was successful
if [ -f "$OUTPUT_DEB" ]; then
    print_info "Successfully created: $OUTPUT_DEB"
    print_info "Package size: $(du -h "$OUTPUT_DEB" | cut -f1)"
else
    print_error "Failed to create deb package"
    exit 1
fi

# Cleanup extracted files
rm -rf "$EXTRACTION_TARGET"


print_info "DEB package build completed successfully!"
print_info "You can install the package using: sudo dpkg -i $OUTPUT_DEB"
