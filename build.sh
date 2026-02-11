#!/bin/bash
set -e


# Default values
COMPILE_ONLY=false
PACKAGE_ONLY=false

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --compile-only) COMPILE_ONLY=true ;;
        --package-only) PACKAGE_ONLY=true ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Stages
configure() {
    # 1. Check Prerequisities
    echo "Checking prerequisites..."
    if ! command_exists node; then
        echo "Error: node is not installed."
        exit 1
    fi

    if ! command_exists npm; then
        echo "Error: npm is not installed."
        exit 1
    fi

    if ! command_exists quilt; then
        echo "Error: quilt is not installed. Please install it (e.g., brew install quilt)."
        exit 1
    fi

    # 2. Initialize Submodules
    echo "Initializing submodules..."
    git submodule update --init --recursive

    # 3. Install Dependencies
    echo "Installing dependencies..."
    cd lib/vscode
    npm ci
    cd ../..

    # 4. Apply Patches
    echo "Applying patches..."
    if quilt push -a; then
        echo "Patches applied successfully."
    else
        # Check if patches are already applied
        if [ $? -eq 2 ]; then
            echo "Patches seem to be already applied."
        else
            echo "Error applying patches."
            exit 1
        fi
    fi

    # 5. Update Product Branding
    echo "Updating product branding..."
    chmod +x ci/build/update-product.sh
    ./ci/build/update-product.sh
}

compile() {
    # 6. Compile
    echo "Compiling..."
    cd lib/vscode
    npm run compile
    cd ../..
}

package() {
    # 7. Package
    echo "Packaging..."
    cd lib/vscode

    OS="$(uname -s)"
    ARCH="${VSCODE_ARCH:-$(uname -m)}"

    if [ "$OS" = "Darwin" ]; then
        if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "x64" ]; then
            TARGET="vscode-darwin-x64-min-ci"
        elif [ "$ARCH" = "arm64" ]; then
            TARGET="vscode-darwin-arm64-min-ci"
        else
            echo "Unsupported Mac architecture: $ARCH"
            exit 1
        fi
    elif [ "$OS" = "Linux" ]; then
        if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "x64" ]; then
            TARGET="vscode-linux-x64-min-ci"
        elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
            TARGET="vscode-linux-arm64-min-ci"
        else
            echo "Unsupported Linux architecture: $ARCH"
            exit 1
        fi
    else
        echo "Unsupported OS: $OS"
        exit 1
    fi

    echo "Building target: $TARGET"
    npm run gulp $TARGET
}

# Execution Logic
if [ "$PACKAGE_ONLY" = true ]; then
    configure
    package
elif [ "$COMPILE_ONLY" = true ]; then
    configure
    compile
else
    # Default behavior: run everything
    configure
    compile
    package
fi

echo "Build complete!"

