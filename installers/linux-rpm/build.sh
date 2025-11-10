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
INTEGRATOR_TARGET="$WORK_DIR/package/usr/share/wso2-integrator"
BALLERINA_TARGET="$WORK_DIR/package/usr/lib64/ballerina"
ICP_TARGET="$WORK_DIR/package/usr/lib64/wso2/icp"
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
rm -rf "$INTEGRATOR_TARGET"
rm -rf "$BALLERINA_TARGET"
rm -rf "$ICP_TARGET"
mkdir -p "$INTEGRATOR_TARGET"
mkdir -p "$BALLERINA_TARGET"
mkdir -p "$ICP_TARGET"

# Extract ballerina zip
print_info "Extracting Ballerina runtime..."
unzip -q -o "$BALLERINA_ZIP" -d "$BALLERINA_TARGET"
# Move contents from the extracted folder to BALLERINA_TARGET
bal_extracted_dir=$(find "$BALLERINA_TARGET" -mindepth 1 -maxdepth 1 -type d | head -n 1)
if [ -n "$bal_extracted_dir" ]; then
    mv "$bal_extracted_dir"/* "$BALLERINA_TARGET"/
    rmdir "$bal_extracted_dir"
fi

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

# Create source tarball
print_info "Creating source tarball for version $VERSION..."
cd "$WORK_DIR"
tar -czf "$SOURCES_DIR/wso2-integrator-$VERSION.tar.gz" -C package .

# Prepare spec file with version
print_info "Preparing spec file with version $VERSION..."
sed "s/@VERSION@/$VERSION/g" "$WORK_DIR/wso2-integrator.spec" > "$SPECS_DIR/wso2-integrator.spec"

# Build RPM package
print_info "Building RPM package..."
rpmbuild --define "_topdir $BUILD_DIR" \
         --define "_rpmdir $RPMS_DIR" \
         --define "_builddir $BUILD_DIR/BUILD" \
         --define "_sourcedir $SOURCES_DIR" \
         --define "_specdir $SPECS_DIR" \
         --define "_srcrpmdir $BUILD_DIR/SRPMS" \
         --define "_buildrootdir $BUILD_DIR/BUILDROOT" \
         -ba "$SPECS_DIR/wso2-integrator.spec"

# rm -rf "$INTEGRATOR_TARGET"
# rm -rf "$BALLERINA_TARGET"
# rm -rf "$ICP_TARGET"

# Copy built RPM to current directory
print_info "Copying RPM package to current directory..."
find "$RPMS_DIR" -name "*.rpm" -exec cp {} "$WORK_DIR/" \;

# List built packages
print_info "Built RPM packages:"
ls -la "$WORK_DIR"/*.rpm 2>/dev/null || print_warning "No RPM files found in current directory"

print_info "RPM package build completed successfully!"
print_info "You can install the package using: sudo rpm -ivh wso2-integrator-*.rpm"
