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
INTEGRATOR_TARGET="$STAGE_DIR/wso2-integrator"
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

# Extract Ballerina zip
print_info "Extracting Ballerina to components..."
mkdir -p "$COMPONENTS_DIR"
unzip -o "$BALLERINA_ZIP" -d "$EXTRACTION_TARGET"
BALLERINA_UNZIPPED_FOLDER=$(unzip -Z1 "$BALLERINA_ZIP" | head -1 | cut -d/ -f1)
BALLERINA_UNZIPPED_PATH="$EXTRACTION_TARGET/$BALLERINA_UNZIPPED_FOLDER"

# Create a temp directory for consolidation
BALLERINA_TEMP="$WORK_DIR/ballerina_temp"
rm -rf "$BALLERINA_TEMP"
mkdir -p "$BALLERINA_TEMP"

# Move distributions contents to temp
print_info "Consolidating Ballerina distributions..."
if [ -d "$BALLERINA_UNZIPPED_PATH/distributions" ]; then
    DIST_FOLDER=$(ls "$BALLERINA_UNZIPPED_PATH/distributions" | head -1)
    if [ -n "$DIST_FOLDER" ]; then
        cp -r "$BALLERINA_UNZIPPED_PATH/distributions/$DIST_FOLDER"/* "$BALLERINA_TEMP/"
    fi
fi

# Move distributions contents to target (without JDK)
mkdir -p "$BALLERINA_TARGET"
mv "$BALLERINA_TEMP"/* "$BALLERINA_TARGET"

# Remove unwanted Ballerina folders
rm -rf "$BALLERINA_TARGET/docs"
rm -rf "$BALLERINA_TARGET/examples"

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

rm -rf "$BALLERINA_UNZIPPED_PATH"
rm -rf "$BALLERINA_TEMP"

# Replace bal script with the one from balscript
print_info "Replacing bal script with updated version from balscript..."
cp "$WORK_DIR/balscript/bal" "$BALLERINA_TARGET/bin/bal"
sed -i "s/@BALLERINA_VERSION@/$BALLERINA_VERSION/g" "$BALLERINA_TARGET/bin/bal"
chmod +x "$BALLERINA_TARGET/bin"/*

# Extract ICP zip
print_info "Extracting Integration Control Plane..."
mkdir -p "$ICP_TARGET"
unzip -o "$ICP_ZIP" -d "$EXTRACTION_TARGET"
ICP_UNZIPPED_FOLDER=$(unzip -Z1 "$ICP_ZIP" | head -1 | cut -d/ -f1)
ICP_UNZIPPED_PATH="$EXTRACTION_TARGET/$ICP_UNZIPPED_FOLDER"
mv "$ICP_UNZIPPED_PATH"/* "$ICP_TARGET"
rm -rf "$ICP_UNZIPPED_PATH"
chmod +x "$ICP_TARGET/bin"/*

# Make icp.sh resolve the JVM env-aware (§D8): prefer the resolved JDK home in WSO2_INTEGRATOR_JRE_HOME
# (set once ICP/JRE are seeded to the data folder), else the JRE bundled next to ICP. Backward-compatible: with the
# env var unset it resolves to the previous relative path. The resolver is prepended AFTER the
# replace so its own `bin/java` is not itself rewritten.
ICP_SCRIPT="$ICP_TARGET/bin/icp.sh"
if [ -f "$ICP_SCRIPT" ]; then
    print_info "Modifying icp.sh to use JRE (env-aware, fallback $JRE_FOLDER)"
    sed -i "s|\bjava\b|\"\$WSO2_ICP_JAVA\"|g" "$ICP_SCRIPT"
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
OUTPUT_TAR="$WORK_DIR/wso2-integrator-${VERSION}-linux-x64${TAR_SUFFIX}.tar.gz"
print_info "Creating TAR.GZ archive: $OUTPUT_TAR"
tar -czf "$OUTPUT_TAR" -C "$STAGE_DIR" wso2-integrator

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
