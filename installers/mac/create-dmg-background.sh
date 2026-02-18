#!/bin/bash

# Script to create a simple DMG background image using ImageMagick
# This creates a professional-looking background with WSO2 branding

OUTPUT_FILE="${1:-dmg-background.png}"
WIDTH="${2:-540}"
HEIGHT="${3:-360}"

# Check if ImageMagick is available
if ! command -v convert &> /dev/null; then
    echo "ImageMagick is not installed."
    echo "Install it using: brew install imagemagick"
    exit 1
fi

echo "Creating DMG background image..."

# Create a simple professional background with gradient
# You can customize colors and add text/logos here
convert -size ${WIDTH}x${HEIGHT} \
        xc:white \
        -pointsize 32 \
        -fill "#4A5568" \
        -font Helvetica-Bold \
        -gravity Center \
        -annotate +0-100 "WSO2 Integrator" \
        -pointsize 14 \
        -fill "#718096" \
        -annotate +0+50 "Drag installer to Applications folder to install" \
        "$OUTPUT_FILE"

if [ -f "$OUTPUT_FILE" ]; then
    echo "✓ Background image created: $OUTPUT_FILE"
    echo "  Dimensions: ${WIDTH}x${HEIGHT}"
    ls -lh "$OUTPUT_FILE"
else
    echo "✗ Failed to create background image"
    exit 1
fi
