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

# Usage: ./build.sh <ballerina_zip> <wso2_zip> <icp_zip> <version>
if [ "$#" -ne 4 ]; then
    echo "Usage: $0 <ballerina_zip> <wso2_zip> <icp_zip> <version>"
    exit 1
fi

BALLERINA_ZIP="$1"
WSO2_ZIP="$2"
ICP_ZIP="$3"
VERSION="$4"

OUTPUT_PKG="WSO2 Integrator.pkg"
BUNDLE_IDENTIFIER="com.wso2.integrator"
EXTRACTION_TARGET="$WORK_DIR/payload"

# Extract ballerina zip
BALLERINA_TARGET="$WORK_DIR/payload/Library/Ballerina"
rm -rf "$BALLERINA_TARGET"
mkdir -p "$BALLERINA_TARGET"
unzip -o "$BALLERINA_ZIP" -d "$EXTRACTION_TARGET"
BALLERINA_UNZIPPED_FOLDER=$(unzip -Z1 "$BALLERINA_ZIP" | head -1 | cut -d/ -f1)
BALLERINA_UNZIPPED_PATH="$EXTRACTION_TARGET/$BALLERINA_UNZIPPED_FOLDER"
mv "$BALLERINA_UNZIPPED_PATH"/* "$BALLERINA_TARGET"
rm -rf "$BALLERINA_UNZIPPED_PATH"
chmod +x "$BALLERINA_TARGET/bin/"

# Extract icp zip
ICP_TARGET="$WORK_DIR/payload/Library/WSO2/ICP"
rm -rf "$ICP_TARGET"
mkdir -p "$ICP_TARGET"
unzip -o "$ICP_ZIP" -d "$EXTRACTION_TARGET"
ICP_UNZIPPED_FOLDER=$(unzip -Z1 "$ICP_ZIP" | head -1 | cut -d/ -f1)
ICP_UNZIPPED_PATH="$EXTRACTION_TARGET/$ICP_UNZIPPED_FOLDER"
mv "$ICP_UNZIPPED_PATH"/* "$ICP_TARGET"
rm -rf "$ICP_UNZIPPED_PATH"
chmod +x "$ICP_TARGET/bin/"

# Extract wso2 zip
WSO2_TARGET="$WORK_DIR/payload/Applications"
rm -rf "$WSO2_TARGET"
unzip -o "$WSO2_ZIP" -d "$EXTRACTION_TARGET"
WSO2_UNZIPPED_FOLDER=$(unzip -Z1 "$WSO2_ZIP" | head -1 | cut -d/ -f1)
WSO2_UNZIPPED_PATH="$EXTRACTION_TARGET/$WSO2_UNZIPPED_FOLDER"
mv "$WSO2_UNZIPPED_PATH" "$WSO2_TARGET"
rm -rf "$WSO2_UNZIPPED_PATH"
chmod +x "$WSO2_TARGET/WSO2 Integrator.app"/*
xattr -cr "$WSO2_TARGET/WSO2 Integrator.app"

rm -rf "$EXTRACTION_TARGET/__MACOSX"

# Make postinstall and preinstall executable if they exist
if [ -f "$WORK_DIR/scripts/postinstall" ]; then
    chmod 755 "$WORK_DIR/scripts/postinstall"
fi
if [ -f "$WORK_DIR/scripts/preinstall" ]; then
    chmod 755 "$WORK_DIR/scripts/preinstall"
fi

# Build the component package
pkgbuild --root "$EXTRACTION_TARGET" \
         --scripts "$WORK_DIR/scripts" \
         --identifier "$BUNDLE_IDENTIFIER" \
         --version "$VERSION" \
         --install-location "/" \
         "$WORK_DIR/WSO2 Integrator.pkg"

sed -i '' "s/version=\"__VERSION__\"/version=\"$VERSION\"/g" "$WORK_DIR/Distribution.xml"


# Build the final product archive
productbuild --distribution "$WORK_DIR/Distribution.xml" \
             --resources "$WORK_DIR" \
             --package-path "$WORK_DIR" \
             "WSO2_Integrator.pkg"

sed -i '' "s/version=\"$VERSION\"/version=\"__VERSION__\"/g" "$WORK_DIR/Distribution.xml"


# Check if the build was successful
if [ -f "$OUTPUT_PKG" ]; then
    print_info "Successfully created: $OUTPUT_PKG"
    print_info "Package size: $(du -h "$OUTPUT_PKG" | cut -f1)"
else
    print_error "Failed to create pkg package"
    exit 1
fi

rm -rf "$BALLERINA_TARGET"/*
rm -rf "$WSO2_TARGET"/*
rm -rf "$ICP_TARGET"/*

print_info "Done!"