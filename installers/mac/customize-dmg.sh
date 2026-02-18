#!/bin/bash

# This script helps customize the DMG appearance
# It uses AppleScript to set proper window size, position, and background

set -e

DMG_MOUNT_POINT="${1:-.}"
DMG_NAME="${2:-WSO2 Integrator}"
PKG_FILE="${3:-wso2-integrator.pkg}"
BACKGROUND_IMAGE="${4}"

# Function to set DMG window properties
customize_dmg() {
    local mount_point=$1
    local dmg_name=$2
    local pkg_name=$3
    
    osascript <<EOF
tell application "Finder"
    tell disk "$dmg_name"
        open
        delay 1
        
        -- Set window properties
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {100, 100, 640, 480}
        
        -- Set icon view options
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 96
        set text size of viewOptions to 12
        
        -- Position installer package
        set position of item "$pkg_name" of container window to {90, 100}
        
        -- Position Applications folder link
        set position of item "Applications" of container window to {450, 100}
        
        -- Set background image if it exists
        try
            set background picture of viewOptions to file ".background/background.png"
        end try
        
        -- Close and reopen to apply changes
        close
        open
        delay 1
        close
    end tell
end tell
EOF
    
    echo "DMG appearance customized successfully"
}

# Execute customization if mount point is provided and exists
if [ -d "$DMG_MOUNT_POINT" ]; then
    echo "Customizing DMG at: $DMG_MOUNT_POINT"
    customize_dmg "$DMG_MOUNT_POINT" "$DMG_NAME" "$PKG_FILE"
else
    echo "Usage: $0 <mount_point> [dmg_name] [pkg_file] [background_image]"
    echo ""
    echo "Example:"
    echo "  $0 /Volumes/WSO2\\ Integrator 'WSO2 Integrator' 'wso2-integrator.pkg'"
fi
