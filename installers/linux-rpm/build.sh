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

# Usage: ./build.sh <integrator_dist_zip> <integrator_tar_gz> <icp_zip> [version]
if [ "$#" -lt 3 ]; then
    echo "Usage: $0 <integrator_dist_zip> <integrator_tar_gz> <icp_zip> [version]"
    exit 1
fi

INTEGRATOR_DIST_ZIP="$1"
INTEGRATOR_TAR_GZ="$2"
ICP_ZIP="$3"
VERSION="${4:-1.0.0}"
JDK_FOLDER=""
BALLERINA_VERSION=""

# Check if input files exist
if [ ! -f "$INTEGRATOR_DIST_ZIP" ]; then
    print_error "Integrator dist ZIP file not found: $INTEGRATOR_DIST_ZIP"
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

detect_ballerina_version() {
    local extracted_root="$1"
    local dist_dir
    local jar_path

    dist_dir=$(find "$extracted_root/distributions" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)
    if [ -n "$dist_dir" ]; then
        basename "$dist_dir" | sed 's/^ballerina-//'
        return 0
    fi

    jar_path=$(find "$extracted_root/bre/lib" -maxdepth 1 -type f -name 'ballerina-lang-*.jar' 2>/dev/null | head -1)
    if [ -n "$jar_path" ]; then
        basename "$jar_path" | sed -E 's/^ballerina-lang-(.*)\.jar$/\1/'
        return 0
    fi

    return 1
}

# Define paths
INTEGRATOR_TARGET="$WORK_DIR/package/usr/share/wso2-integrator"
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
rm -rf "$INTEGRATOR_TARGET"
rm -rf "$EXTRACTION_TARGET"
mkdir -p "$INTEGRATOR_TARGET"
mkdir -p "$EXTRACTION_TARGET"

# Extract integrator archive
print_info "Extracting WSO2 Integrator..."
tar -xzf "$INTEGRATOR_TAR_GZ" -C "$INTEGRATOR_TARGET" --strip-components=1

# Extract Integrator distro zip
print_info "Extracting Integrator distribution to components..."
mkdir -p "$COMPONENTS_DIR"
unzip -o "$INTEGRATOR_DIST_ZIP" -d "$EXTRACTION_TARGET"
BALLERINA_UNZIPPED_FOLDER=$(unzip -Z1 "$INTEGRATOR_DIST_ZIP" | head -1 | cut -d/ -f1)
BALLERINA_UNZIPPED_PATH="$EXTRACTION_TARGET/$BALLERINA_UNZIPPED_FOLDER"
BALLERINA_VERSION=$(detect_ballerina_version "$BALLERINA_UNZIPPED_PATH") || {
    print_error "Failed to detect Ballerina version from Integrator distribution"
    exit 1
}
print_info "Detected Ballerina version: $BALLERINA_VERSION"

# Create a temp directory for consolidation
BALLERINA_TEMP="$WORK_DIR/ballerina_temp"
rm -rf "$BALLERINA_TEMP"
mkdir -p "$BALLERINA_TEMP"

# Support both the legacy split layout and the newer flat distro layout.
if [ -d "$BALLERINA_UNZIPPED_PATH/distributions" ]; then
    print_info "Detected split Ballerina layout. Consolidating distributions"
    DIST_FOLDER=$(ls "$BALLERINA_UNZIPPED_PATH/distributions" | head -1)
    if [ -n "$DIST_FOLDER" ]; then
        cp -r "$BALLERINA_UNZIPPED_PATH/distributions/$DIST_FOLDER"/* "$BALLERINA_TEMP/"
    fi
else
    print_info "Detected flat Ballerina distro layout. Copying runtime directly"
    cp -r "$BALLERINA_UNZIPPED_PATH"/* "$BALLERINA_TEMP/"
fi

# Move runtime contents to target
mkdir -p "$BALLERINA_TARGET"
mv "$BALLERINA_TEMP"/* "$BALLERINA_TARGET"

# Move JDK to shared dependencies directory when the source archive provides one
rm -rf "$DEPENDENCIES_DIR"
if [ -d "$BALLERINA_UNZIPPED_PATH/dependencies" ]; then
    print_info "Moving JDK to shared dependencies directory"
    mkdir -p "$DEPENDENCIES_DIR"
    for jdk_folder in "$BALLERINA_UNZIPPED_PATH/dependencies"/*; do
        if [ -d "$jdk_folder" ]; then
            JDK_FOLDER=$(basename "$jdk_folder")
            cp -r "$jdk_folder" "$DEPENDENCIES_DIR/"
        fi
    done
else
    print_warning "No shared dependencies directory found in Ballerina distribution. Skipping JDK copy."
fi

rm -rf "$BALLERINA_UNZIPPED_PATH"
rm -rf "$BALLERINA_TEMP"

# Replace bal script with the one from balscript
print_info "Replacing bal script with updated version from balscript"
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

# Modify icp.sh to use the JDK from shared dependencies directory when available
ICP_SCRIPT="$ICP_TARGET/bin/icp.sh"
if [ -f "$ICP_SCRIPT" ] && [ -n "$JDK_FOLDER" ]; then
    print_info "Modifying icp.sh to use JDK from dependencies ($JDK_FOLDER)"
    sed -i "s|java|\"\$SCRIPT_DIR\"/../../dependencies/$JDK_FOLDER/bin/java|g" "$ICP_SCRIPT"
elif [ -f "$ICP_SCRIPT" ]; then
    print_warning "No packaged JDK found for ICP. Leaving icp.sh Java resolution unchanged."
fi

# Set executable permissions
print_info "Setting executable permissions..."
find "$INTEGRATOR_TARGET/bin" -type f -exec chmod +x {} \; 2>/dev/null || true
chmod +x "$INTEGRATOR_TARGET/wso2-integrator" 2>/dev/null || true

# Create source tarball
print_info "Creating source tarball for version $VERSION..."
cd "$WORK_DIR"
tar -czf "$SOURCES_DIR/wso2-integrator-$VERSION.tar.gz" -C package .

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
sed -e "s/@VERSION@/$RPM_VERSION/g" -e "s/@RELEASE@/$RPM_RELEASE/g" -e "s/@FULLVERSION@/$VERSION/g" "$WORK_DIR/wso2-integrator.spec" > "$SPECS_DIR/wso2-integrator.spec"

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

# Cleanup package staging directory
rm -rf "${INTEGRATOR_TARGET:?}"
rm -rf "$EXTRACTION_TARGET"

# Copy built RPM to current directory
print_info "Copying RPM package to current directory..."
find "$RPMS_DIR" -name "*.rpm" -exec cp {} "$WORK_DIR/" \;

# List built packages
print_info "Built RPM packages:"
ls -la "$WORK_DIR"/*.rpm 2>/dev/null || print_warning "No RPM files found in current directory"

print_info "RPM package build completed successfully!"
print_info "You can install the package using: sudo rpm -ivh wso2-integrator-*.rpm"
