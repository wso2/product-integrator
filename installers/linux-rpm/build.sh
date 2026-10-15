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
BUILD_DIR="$WORK_DIR/rpm-build"
SOURCES_DIR="$BUILD_DIR/SOURCES"
SPECS_DIR="$BUILD_DIR/SPECS"
RPMS_DIR="$BUILD_DIR/RPMS"

print_info "Starting RPM package build process..."

# Create RPM build directory structure
print_info "Setting up RPM build environment..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}

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
     "$STAGE_DIR/usr/share/bash-completion/completions" -type f -print0 |
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

# Set executable permissions
print_info "Setting executable permissions..."
find "$INTEGRATOR_TARGET/bin" -type f -exec chmod +x {} \; 2>/dev/null || true
chmod +x "$INTEGRATOR_TARGET/wso2-integrator" 2>/dev/null || true

# Create source tarball
print_info "Creating source tarball for version $VERSION..."
cd "$WORK_DIR"
tar -czf "$SOURCES_DIR/$ARTIFACT_SLUG-$VERSION.tar.gz" -C package_stage .

# Prepare spec file with version and release
# RPM Version field doesn't allow hyphens, so split version and pre-release
# e.g., 1.0.0-m1 becomes Version: 1.0.0, Release: m1
# This produces RPM filename: wso2-integrator-1.0.0-m1.x86_64.rpm
if [[ "$VERSION" == *"-"* ]]; then
    RPM_VERSION=$(echo "$VERSION" | cut -d'-' -f1)
    RPM_RELEASE=$(echo "$VERSION" | cut -d'-' -f2-)
    print_info "Preparing spec file with version $RPM_VERSION and release $RPM_RELEASE (from $VERSION)..."
else
    RPM_VERSION="$VERSION"
    RPM_RELEASE="1"
    print_info "Preparing spec file with version $RPM_VERSION and release $RPM_RELEASE..."
fi
sed -e "s/@VERSION@/$RPM_VERSION/g" -e "s/@RELEASE@/$RPM_RELEASE/g" -e "s/@FULLVERSION@/$VERSION/g" \
    -e "s|@SLUG@|$ARTIFACT_SLUG|g" -e "s|@PRODUCT_NAME@|$PRODUCT_NAME|g" -e "s|@ICON_ID@|$ICON_ID|g" \
    "$WORK_DIR/wso2-integrator.spec" > "$SPECS_DIR/$ARTIFACT_SLUG.spec"

# Build RPM package
print_info "Building RPM package..."
# INSTALLER_PROFILE=editor-update (§D8): drop the bundled Ballerina from the staged tree
# before packaging — the client seeds/resolves it from the per-user data folder, and an rpm
# upgrade removes the old package's ballerina dir while the seeded copy survives.
if [ "${INSTALLER_PROFILE:-full}" = "editor-update" ]; then
    # W-B: truly editor-only — drop Ballerina, ICP and the JRE (all seeded to the data folder;
    # ICP requires the MI extension to read WSO2_INTEGRATOR_ICP_HOME before this build is published).
    rm -rf "$BALLERINA_TARGET" "$ICP_TARGET" "$DEPENDENCIES_DIR"
    print_info "editor-update profile: removed bundled Ballerina/ICP/JRE from package"
fi

rpmbuild --define "_topdir $BUILD_DIR" \
         --define "_rpmdir $RPMS_DIR" \
         --define "_builddir $BUILD_DIR/BUILD" \
         --define "_sourcedir $SOURCES_DIR" \
         --define "_specdir $SPECS_DIR" \
         --define "_srcrpmdir $BUILD_DIR/SRPMS" \
         --define "_buildrootdir $BUILD_DIR/BUILDROOT" \
         -ba "$SPECS_DIR/$ARTIFACT_SLUG.spec"

# Cleanup package staging directory
rm -rf "${INTEGRATOR_TARGET:?}"
rm -rf "$EXTRACTION_TARGET"

# Copy built RPM(s) from this run to the working directory.
# The full and editor-update builds share the same Version-Release, so they would
# produce identical filenames. Tag the editor-only build with -update as we copy so
# it stays distinct from — and never clobbers — the full first-install RPM produced
# by the earlier run (the package Version is unchanged, so it still upgrades a full
# install cleanly). BUILD_DIR/RPMS is wiped at the start of each run, so RPMS_DIR
# only ever holds the current build's RPM.
print_info "Copying RPM package to current directory..."
RPM_SUFFIX=""
if [ "${INSTALLER_PROFILE:-full}" = "editor-update" ]; then
    RPM_SUFFIX="-update"
fi
while IFS= read -r -d '' src; do
    base=$(basename "$src")
    cp "$src" "$WORK_DIR/${base%.rpm}${RPM_SUFFIX}.rpm"
done < <(find "$RPMS_DIR" -name "*.rpm" -print0)

# List built packages
print_info "Built RPM packages:"
ls -la "$WORK_DIR"/*.rpm 2>/dev/null || print_warning "No RPM files found in current directory"

print_info "RPM package build completed successfully!"
print_info "You can install the package using: sudo rpm -ivh $ARTIFACT_SLUG-*.rpm"
