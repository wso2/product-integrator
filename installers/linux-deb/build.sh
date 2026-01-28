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
BALLERINA_VERSION="$2"
INTEGRATOR_TAR_GZ="$3"
ICP_ZIP="$4"
VERSION="${5:-1.0.0}"

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
INTEGRATOR_TARGET="$WORK_DIR/package/usr/share/wso2-integrator"
BALLERINA_TARGET="$WORK_DIR/package/usr/lib/ballerina"
ICP_TARGET="$WORK_DIR/package/usr/lib/wso2/icp"

print_info "Starting DEB package build process..."

# Clean and recreate package directories
print_info "Preparing package structure..."
rm -rf "$INTEGRATOR_TARGET"
rm -rf "$BALLERINA_TARGET"
rm -rf "$ICP_TARGET"
mkdir -p "$INTEGRATOR_TARGET"
mkdir -p "$BALLERINA_TARGET"
mkdir -p "$ICP_TARGET"

# Copy Ballerina zip to package (will be extracted during installation)
print_info "Copying Ballerina zip to package..."
cp "$BALLERINA_ZIP" "$BALLERINA_TARGET/ballerina.zip"
echo "$BALLERINA_VERSION" > "$BALLERINA_TARGET/ballerina_version"

# No longer extract Ballerina to payload - it will be done conditionally in postinst

# Extract integrator archive
print_info "Extracting WSO2 Integrator..."
tar -xzf "$INTEGRATOR_TAR_GZ" -C "$INTEGRATOR_TARGET" --strip-components=1

# Extract ICP zip
print_info "Extracting Integration Control Plane..."
unzip -q -o "$ICP_ZIP" -d "$ICP_TARGET"
# Move contents from the extracted folder to ICP_TARGET
icp_extracted_dir=$(find "$ICP_TARGET" -mindepth 1 -maxdepth 1 -type d | head -n 1)
if [ -n "$icp_extracted_dir" ]; then
    mv "$icp_extracted_dir"/* "$ICP_TARGET"/
    rmdir "$icp_extracted_dir"
fi

# Set executable permissions
print_info "Setting executable permissions..."
find "$INTEGRATOR_TARGET/bin" -type f -exec chmod +x {} \; 2>/dev/null || true
chmod +x "$INTEGRATOR_TARGET/wso2-integrator" 2>/dev/null || true
find "$BALLERINA_TARGET/bin" -type f -exec chmod +x {} \; 2>/dev/null || true

# Make DEBIAN scripts executable
chmod 755 "$WORK_DIR/package/DEBIAN/postinst"
chmod 755 "$WORK_DIR/package/DEBIAN/postrm"
chmod 755 "$WORK_DIR/package/DEBIAN/prerm"

# Update version in control file
print_info "Updating version in control file to $VERSION..."
sed -i "s/@VERSION@/$VERSION/" "$WORK_DIR/package/DEBIAN/control"

# Get the installed size
INSTALLED_SIZE=$(du -sk "$WORK_DIR/package" | cut -f1)

# Update or add Installed-Size field
if grep -q "^Installed-Size:" "$WORK_DIR/package/DEBIAN/control"; then
    sed -i "s/^Installed-Size:.*/Installed-Size: $INSTALLED_SIZE/" "$WORK_DIR/package/DEBIAN/control"
else
    echo "Installed-Size: $INSTALLED_SIZE" >> "$WORK_DIR/package/DEBIAN/control"
fi

# Build DEB package
OUTPUT_DEB="$WORK_DIR/wso2-integrator_${VERSION}_amd64.deb"
print_info "Building DEB package..."
dpkg-deb -b "$WORK_DIR/package" "$OUTPUT_DEB"

# Check if the build was successful
if [ -f "$OUTPUT_DEB" ]; then
    print_info "Successfully created: $OUTPUT_DEB"
    print_info "Package size: $(du -h "$OUTPUT_DEB" | cut -f1)"
else
    print_error "Failed to create deb package"
    exit 1
fi

# Cleanup extracted files
rm -rf "${INTEGRATOR_TARGET:?}"
rm -rf "${ICP_TARGET:?}"
rm -f "$WORK_DIR/package/DEBIAN/ballerina.zip"

# Revert version in control file back to @VERSION@
sed -i "s/^Version: $VERSION$/Version: @VERSION@/" "$WORK_DIR/package/DEBIAN/control"

print_info "DEB package build completed successfully!"
print_info "You can install the package using: sudo dpkg -i $OUTPUT_DEB"
