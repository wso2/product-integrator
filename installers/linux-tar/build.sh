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

# Product flavor drives the archive name and top-level directory; the payload
# binary name (applicationName) stays "wso2-integrator" for both flavors.
PRODUCT_FLAVOR="${PRODUCT_FLAVOR:-integrator}"
case "$PRODUCT_FLAVOR" in
    integrator)    ARTIFACT_SLUG="wso2-integrator" ;;
    agent-builder) ARTIFACT_SLUG="wso2-agent-builder" ;;
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
STAGE_DIR="$WORK_DIR/staging"
INTEGRATOR_TARGET="$STAGE_DIR/$ARTIFACT_SLUG"
COMPONENTS_DIR="$INTEGRATOR_TARGET/components"
BALLERINA_TARGET="$COMPONENTS_DIR/ballerina"
DEPENDENCIES_DIR="$COMPONENTS_DIR/dependencies"
ICP_TARGET="$COMPONENTS_DIR/icp"
EXTRACTION_TARGET="$WORK_DIR/extraction_temp"

print_info "Starting TAR.GZ package build process..."

# Clean and recreate staging directories
print_info "Preparing package structure..."
rm -rf "$STAGE_DIR"
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
print_info "Extracting JRE to shared dependencies directory..."
rm -rf "$DEPENDENCIES_DIR"
mkdir -p "$DEPENDENCIES_DIR"
unzip -o "$JRE_ZIP" -d "$DEPENDENCIES_DIR"
JRE_FOLDER=$(unzip -Z1 "$JRE_ZIP" | awk -F/ 'NF > 1 && $1 != "__MACOSX" && $1 != "" {print $1}' | sort -u | head -1)
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

# Pack into tar.gz
# INSTALLER_PROFILE=editor-update (§D8): drop the bundled Ballerina — the client seeds/resolves
# it from the per-user data folder. (A tar extract-over never deletes, so this is purely a
# smaller download; seeding still guarantees the runtime survives.)
TAR_SUFFIX=""
if [ "${INSTALLER_PROFILE:-full}" = "editor-update" ]; then
    # W-B: truly editor-only — drop Ballerina, ICP and the JRE (all seeded to the data folder;
    # ICP requires the MI extension to read WSO2_INTEGRATOR_ICP_HOME before this build is published).
    rm -rf "$BALLERINA_TARGET" "$ICP_TARGET" "$DEPENDENCIES_DIR"
    TAR_SUFFIX="-update"
    print_info "editor-update profile: removed bundled Ballerina/ICP/JRE from archive"
fi
OUTPUT_TAR="$WORK_DIR/${ARTIFACT_SLUG}-${VERSION}-linux-x64${TAR_SUFFIX}.tar.gz"
print_info "Creating TAR.GZ archive: $OUTPUT_TAR"
tar -czf "$OUTPUT_TAR" -C "$STAGE_DIR" "$ARTIFACT_SLUG"

# Verify output
if [ -f "$OUTPUT_TAR" ]; then
    print_info "Successfully created: $OUTPUT_TAR"
    print_info "Package size: $(du -h "$OUTPUT_TAR" | cut -f1)"
else
    print_error "Failed to create TAR.GZ package"
    exit 1
fi

# Cleanup
print_info "Cleaning up staging directories..."
rm -rf "$STAGE_DIR"
rm -rf "$EXTRACTION_TARGET"

print_info "TAR.GZ package build completed successfully!"
print_info "You can extract the package using: tar -xzf $OUTPUT_TAR"
