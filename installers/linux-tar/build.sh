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

# Usage: ./build.sh <ballerina_zip> <integrator_tar_gz> <icp_zip> [version]
if [ "$#" -lt 3 ]; then
    echo "Usage: $0 <ballerina_zip> <integrator_tar_gz> <icp_zip> [version]"
    exit 1
fi

BALLERINA_ZIP="$1"
INTEGRATOR_TAR_GZ="$2"
ICP_ZIP="$3"
VERSION="${4:-1.0.0}"

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

# Define paths
PACKAGE_NAME="wso2-integrator-${VERSION}"
TARGET_DIR="$WORK_DIR/${PACKAGE_NAME}"
BALLERINA_TARGET="${TARGET_DIR}/ballerina"
ICP_TARGET="${TARGET_DIR}/icp"

print_info "Starting Tarball package build process..."

# Clean and recreate package directories
print_info "Preparing package structure..."
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

# Extract integrator archive
print_info "Extracting WSO2 Integrator..."
tar -xzf "$INTEGRATOR_TAR_GZ" -C "$TARGET_DIR" --strip-components=1

# Extract ballerina zip
print_info "Extracting Ballerina runtime..."
mkdir -p "$BALLERINA_TARGET"
unzip -q -o "$BALLERINA_ZIP" -d "$BALLERINA_TARGET"
# Move contents from the extracted folder to BALLERINA_TARGET
bal_extracted_dir=$(find "$BALLERINA_TARGET" -mindepth 1 -maxdepth 1 -type d | head -n 1)
if [ -n "$bal_extracted_dir" ]; then
    mv "$bal_extracted_dir"/* "$BALLERINA_TARGET"/
    rmdir "$bal_extracted_dir"
fi

# Extract ICP zip
print_info "Extracting Integration Control Plane..."
mkdir -p "$ICP_TARGET"
unzip -q -o "$ICP_ZIP" -d "$ICP_TARGET"
# Move contents from the extracted folder to ICP_TARGET
icp_extracted_dir=$(find "$ICP_TARGET" -mindepth 1 -maxdepth 1 -type d | head -n 1)
if [ -n "$icp_extracted_dir" ]; then
    mv "$icp_extracted_dir"/* "$ICP_TARGET"/
    rmdir "$icp_extracted_dir"
fi

# Set executable permissions
print_info "Setting executable permissions..."
find "$TARGET_DIR/bin" -type f -exec chmod +x {} \; 2>/dev/null || true
chmod +x "$TARGET_DIR/wso2-integrator" 2>/dev/null || true
find "$BALLERINA_TARGET/bin" -type f -exec chmod +x {} \; 2>/dev/null || true
find "$ICP_TARGET/bin" -type f -exec chmod +x {} \; 2>/dev/null || true

# Build Tarball package
OUTPUT_TAR="$WORK_DIR/wso2-integrator-linux-${VERSION}.tar.gz"
print_info "Building Tarball package..."
tar -czf "$OUTPUT_TAR" "$PACKAGE_NAME"

# Check if the build was successful
if [ -f "$OUTPUT_TAR" ]; then
    print_info "Successfully created: $OUTPUT_TAR"
    print_info "Package size: $(du -h "$OUTPUT_TAR" | cut -f1)"
else
    print_error "Failed to create tarball package"
    exit 1
fi

# Cleanup extracted files
rm -rf "$TARGET_DIR"

print_info "Tarball package build completed successfully!"
