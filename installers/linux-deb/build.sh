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

# Usage: ./wso2integrator-deb.sh <ballerina_zip> <wso2_zip>
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <ballerina_zip> <wso2_zip> <output_deb>"
    exit 1
fi

BALLERINA_ZIP="$1"
WSO2_ZIP="$2"
OUTPUT_DEB="$3"

EXTRACTION_TARGET="$WORK_DIR/package/usr/share"
# Extract ballerina zip
BALLERINA_TARGET="$WORK_DIR/package/usr/share/ballerina-home"
rm -rf "$BALLERINA_TARGET"
unzip -o "$BALLERINA_ZIP" -d "$EXTRACTION_TARGET"

# Extract wso2 zip
WSO2_TARGET="$WORK_DIR/package/usr/share/wso2-integrator"
rm -rf "$WSO2_TARGET"
unzip -o "$WSO2_ZIP" -d "$EXTRACTION_TARGET"



# Make postinst executable
chmod 755 "$WORK_DIR/package/DEBIAN/postinst"
chmod 755 "$WORK_DIR/package/DEBIAN/postrm"
chmod 755 "$WORK_DIR/package/DEBIAN/prerm"

# Get the original installed size
INSTALLED_SIZE=$(du -sk "$WORK_DIR/package" | cut -f1)

# Update or add Installed-Size field
if grep -q "^Installed-Size:" "$WORK_DIR/package/DEBIAN/control"; then
    sed -i "s/^Installed-Size:.*/Installed-Size: $INSTALLED_SIZE/" "$WORK_DIR/package/DEBIAN/control"
else
    echo "Installed-Size: $INSTALLED_SIZE" >> "$WORK_DIR/package/DEBIAN/control"
fi

dpkg-deb -b "$WORK_DIR/package" "$OUTPUT_DEB"

# Check if the build was successful
if [ -f "$OUTPUT_DEB" ]; then
    print_info "Successfully created: $OUTPUT_DEB"
    print_info "Package size: $(du -h "$OUTPUT_DEB" | cut -f1)"
else
    print_error "Failed to create deb package"
    exit 1
fi

rm -rf "$BALLERINA_TARGET/*"
rm -rf "$WSO2_TARGET/*"

print_info "Done!"
