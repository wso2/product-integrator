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

# Usage: ./build.sh <ballerina_zip> <ballerina_version> <wso2_zip> <icp_zip> <version> <arch>
if [ "$#" -ne 6 ]; then
    echo "Usage: $0 <ballerina_zip> <ballerina_version> <wso2_zip> <icp_zip> <version> <arch>"
    exit 1
fi

BALLERINA_ZIP="$1"
BALLERINA_VERSION="$2"
WSO2_ZIP="$3"
ICP_ZIP="$4"
VERSION="$5"
ARCH="$6"

OUTPUT_PKG="WSO2_Integrator.pkg"
BUNDLE_IDENTIFIER="com.wso2.integrator"
EXTRACTION_TARGET="$WORK_DIR/payload"

# Extract Ballerina zip
print_info "Extracting Ballerina to package resources"
BALLERINA_TARGET="$WORK_DIR/payload/Library/Application Support/WSO2 Integrator/Ballerina"
rm -rf "$BALLERINA_TARGET"
mkdir -p "$BALLERINA_TARGET"
unzip -o "$BALLERINA_ZIP" -d "$EXTRACTION_TARGET"
BALLERINA_UNZIPPED_FOLDER=$(unzip -Z1 "$BALLERINA_ZIP" | head -1 | cut -d/ -f1)
BALLERINA_UNZIPPED_PATH="$EXTRACTION_TARGET/$BALLERINA_UNZIPPED_FOLDER"

# Create a temp directory for consolidation
BALLERINA_TEMP="$WORK_DIR/ballerina_temp"
rm -rf "$BALLERINA_TEMP"
mkdir -p "$BALLERINA_TEMP"

# Move distributions contents to temp
print_info "Consolidating Ballerina distributions"
if [ -d "$BALLERINA_UNZIPPED_PATH/distributions" ]; then
    DIST_FOLDER=$(ls "$BALLERINA_UNZIPPED_PATH/distributions" | head -1)
    if [ -n "$DIST_FOLDER" ]; then
        cp -r "$BALLERINA_UNZIPPED_PATH/distributions/$DIST_FOLDER"/* "$BALLERINA_TEMP/"
    fi
fi

# Move JDK to temp
print_info "Consolidating JDK"
JDK_FOLDER=""
if [ -d "$BALLERINA_UNZIPPED_PATH/dependencies" ]; then
    for jdk_folder in "$BALLERINA_UNZIPPED_PATH/dependencies"/*; do
        if [ -d "$jdk_folder" ]; then
            JDK_FOLDER=$(basename "$jdk_folder")
            cp -r "$jdk_folder" "$BALLERINA_TEMP/"
        fi
    done
fi

# Move consolidated contents to target
mv "$BALLERINA_TEMP"/* "$BALLERINA_TARGET"
rm -rf "$BALLERINA_UNZIPPED_PATH"
rm -rf "$BALLERINA_TEMP"

# Replace bal script with the one from balForWI
print_info "Replacing bal script with updated version from balForWI"
cp "$WORK_DIR/balForWI/bal" "$BALLERINA_TARGET/bin/bal"

chmod +x "$BALLERINA_TARGET/bin"/*

# Make postinstall script executable
if [ -f "$WORK_DIR/scripts/postinstall" ]; then
    chmod 755 "$WORK_DIR/scripts/postinstall"
    print_info "Postinstall script enabled"
fi

# Extract icp zip
ICP_TARGET="$WORK_DIR/payload/Library/Application Support/WSO2 Integrator/ICP"
rm -rf "$ICP_TARGET"
mkdir -p "$ICP_TARGET"
unzip -o "$ICP_ZIP" -d "$EXTRACTION_TARGET"
ICP_UNZIPPED_FOLDER=$(unzip -Z1 "$ICP_ZIP" | head -1 | cut -d/ -f1)
ICP_UNZIPPED_PATH="$EXTRACTION_TARGET/$ICP_UNZIPPED_FOLDER"
mv "$ICP_UNZIPPED_PATH"/* "$ICP_TARGET"
rm -rf "$ICP_UNZIPPED_PATH"
chmod +x "$ICP_TARGET/bin"/*

# Extract wso2 zip
WSO2_TARGET="$WORK_DIR/payload/Applications"
rm -rf "$WSO2_TARGET"
mkdir -p "$WSO2_TARGET"
unzip -o "$WSO2_ZIP" -d "$EXTRACTION_TARGET"
WSO2_UNZIPPED_FOLDER=$(unzip -Z1 "$WSO2_ZIP" | head -1 | cut -d/ -f1)
WSO2_UNZIPPED_PATH="$EXTRACTION_TARGET/$WSO2_UNZIPPED_FOLDER"
mv "$WSO2_UNZIPPED_PATH"/* "$WSO2_TARGET"
rm -rf "$WSO2_UNZIPPED_PATH"
chmod +x "$WSO2_TARGET/WSO2 Integrator.app/Contents/MacOS"/* 2>/dev/null || true
xattr -cr "$WSO2_TARGET/WSO2 Integrator.app"

rm -rf "$EXTRACTION_TARGET/__MACOSX"

# Build the component package
pkgbuild --root "$EXTRACTION_TARGET" \
         --scripts "$WORK_DIR/scripts" \
         --identifier "$BUNDLE_IDENTIFIER" \
         --version "$VERSION" \
         --install-location "/" \
         --ownership preserve \
         "$WORK_DIR/WSO2 Integrator.pkg"

sed -i '' "s/version=\"__VERSION__\"/version=\"$VERSION\"/g" "$WORK_DIR/Distribution.xml"


# Build the final product archive
productbuild --distribution "$WORK_DIR/Distribution.xml" \
             --resources "$WORK_DIR" \
             --package-path "$WORK_DIR" \
             "wso2-integrator-$VERSION-$ARCH.pkg"

sed -i '' "s/version=\"$VERSION\"/version=\"__VERSION__\"/g" "$WORK_DIR/Distribution.xml"


# Check if the build was successful
if [ -f "wso2-integrator-$VERSION-$ARCH.pkg" ]; then
    print_info "Successfully created: wso2-integrator-$VERSION-$ARCH.pkg"
    print_info "Package size: $(du -h "wso2-integrator-$VERSION-$ARCH.pkg" | cut -f1)"
else
    print_error "Failed to create pkg package"
    exit 1
fi

# Cleanup
rm -rf "${WSO2_TARGET:?}"/*
rm -rf "${ICP_TARGET:?}"/*
rm -rf "${BALLERINA_TARGET:?}"/*
rm -rf "$EXTRACTION_TARGET/Library"
rm -rf "$EXTRACTION_TARGET/Applications"
rm -rf "$WORK_DIR/WSO2 Integrator.pkg"

print_info "Done!"
