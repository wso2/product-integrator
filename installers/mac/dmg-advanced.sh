#!/bin/bash

# Advanced DMG Customization Script
# This script provides additional customization options for DMG installers

set -e

. scripts/dmg-config.sh 2>/dev/null || true

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

# Configuration with defaults
DMG_VOLUME="${DMG_VOLUME:-WSO2 Integrator}"
DMG_SIZE="${DMG_SIZE:-600}"  # Size in MB
WINDOW_WIDTH="${WINDOW_WIDTH:-640}"
WINDOW_HEIGHT="${WINDOW_HEIGHT:-480}"
WINDOW_X="${WINDOW_X:-100}"
WINDOW_Y="${WINDOW_Y:-100}"
ICON_SIZE="${ICON_SIZE:-96}"
PKG_ICON_X="${PKG_ICON_X:-90}"
PKG_ICON_Y="${PKG_ICON_Y:-100}"
APPS_ICON_X="${APPS_ICON_X:-450}"
APPS_ICON_Y="${APPS_ICON_Y:-100}"
BACKGROUND_IMAGE="${BACKGROUND_IMAGE}"
SHOW_TOOLBAR="${SHOW_TOOLBAR:-false}"
SHOW_STATUSBAR="${SHOW_STATUSBAR:-false}"
HIDE_HIDDEN_FILES="${HIDE_HIDDEN_FILES:-true}"

verify_dmg() {
    local dmg_file="$1"
    
    if [ ! -f "$dmg_file" ]; then
        print_error "DMG file not found: $dmg_file"
        return 1
    fi
    
    print_info "Verifying DMG integrity..."
    
    if hdiutil verify "$dmg_file"; then
        print_success "DMG integrity verified"
        return 0
    else
        print_error "DMG failed integrity check"
        return 1
    fi
}

get_dmg_info() {
    local dmg_file="$1"
    
    if [ ! -f "$dmg_file" ]; then
        print_error "DMG file not found: $dmg_file"
        return 1
    fi
    
    print_info "DMG Information:"
    echo ""
    echo "File: $dmg_file"
    echo "Size: $(du -h "$dmg_file" | cut -f1)"
    echo "Modified: $(stat -f %Sm -t '%Y-%m-%d %H:%M:%S' "$dmg_file")"
    echo ""
}

compress_dmg() {
    local input_dmg="$1"
    local output_dmg="${2:-${input_dmg%.dmg}-compressed.dmg}"
    
    if [ ! -f "$input_dmg" ]; then
        print_error "Input DMG not found: $input_dmg"
        return 1
    fi
    
    print_info "Compressing DMG (this may take a while)..."
    
    if hdiutil convert "$input_dmg" \
                       -format UDZO \
                       -imagekey zlib-level=9 \
                       -o "$output_dmg"; then
        print_success "Compressed DMG created: $output_dmg"
        
        local original_size=$(du -h "$input_dmg" | cut -f1)
        local compressed_size=$(du -h "$output_dmg" | cut -f1)
        echo "Original: $original_size"
        echo "Compressed: $compressed_size"
        
        return 0
    else
        print_error "Failed to compress DMG"
        return 1
    fi
}

show_help() {
    cat <<EOF
WSO2 Integrator - Advanced DMG Customization Tool

USAGE:
  $0 [command] [options]

COMMANDS:
  verify <dmg-file>              Verify DMG integrity
  info <dmg-file>                Display DMG information
  compress <input.dmg> [output]  Re-compress DMG with maximum compression
  
EXAMPLES:
  # Verify a DMG file
  $0 verify wso2-integrator-1.0.0-x64.dmg
  
  # Compress a DMG for distribution
  $0 compress wso2-integrator-1.0.0-x64.dmg
  
  # Show DMG contents and info
  $0 info wso2-integrator-1.0.0-x64.dmg

EOF
}

main() {
    case "${1:-help}" in
        verify)
            verify_dmg "$2"
            ;;
        info)
            get_dmg_info "$2"
            ;;
        compress)
            compress_dmg "$2" "$3"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main if script is executed directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
