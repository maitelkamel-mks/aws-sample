#!/bin/bash

# Build script for Electron that handles Sharp dependencies and cross-platform builds

# Start total timer
BUILD_START_TIME=$(date +%s)

# Function to format duration
format_duration() {
    local duration=$1
    local hours=$((duration / 3600))
    local minutes=$(((duration % 3600) / 60))
    local seconds=$((duration % 60))
    
    if [ $hours -gt 0 ]; then
        printf "%dh %dm %ds" $hours $minutes $seconds
    elif [ $minutes -gt 0 ]; then
        printf "%dm %ds" $minutes $seconds
    else
        printf "%ds" $seconds
    fi
}

# Function to log with timestamp
log_with_timer() {
    local current_time=$(date +%s)
    local elapsed=$((current_time - BUILD_START_TIME))
    printf "[%s] %s\n" "$(format_duration $elapsed)" "$1"
}

log_with_timer "Starting Electron build process..."

# Parse command line arguments
PLATFORMS=""
ARCH_FLAG=""

for arg in "$@"; do
    case $arg in
        --mac)
            PLATFORMS="$PLATFORMS --mac"
            ;;
        --win)
            PLATFORMS="$PLATFORMS --win"
            ;;
        --linux)
            PLATFORMS="$PLATFORMS --linux"
            ;;
        --x64)
            ARCH_FLAG="--x64"
            ;;
        *)
            # Unknown argument, pass it through
            ;;
    esac
done

# If no platforms specified, build for current platform
if [ -z "$PLATFORMS" ]; then
    log_with_timer "No platform specified, building for current platform..."
    PLATFORMS=""
fi

# Start Next.js build timer
NEXTJS_START_TIME=$(date +%s)
log_with_timer "Building Next.js for Electron..."
ELECTRON_BUILD=true npm run build
NEXTJS_END_TIME=$(date +%s)
NEXTJS_DURATION=$((NEXTJS_END_TIME - NEXTJS_START_TIME))
log_with_timer "Next.js build completed in $(format_duration $NEXTJS_DURATION)"

log_with_timer "Handling Sharp binaries for cross-platform builds..."

# Detect current platform
CURRENT_ARCH=$(uname -m)
if [ "$CURRENT_ARCH" = "arm64" ]; then
    log_with_timer "Running on ARM64 Mac, creating x64 symlinks for cross-compilation..."
    
    # Create x64 directory symlinks pointing to arm64 for cross-compilation
    if [ -d "node_modules/@img/sharp-darwin-arm64" ] && [ ! -d "node_modules/@img/sharp-darwin-x64" ]; then
        ln -sf sharp-darwin-arm64 node_modules/@img/sharp-darwin-x64
        log_with_timer "Created symlink: sharp-darwin-x64 -> sharp-darwin-arm64"
    fi
    
    if [ -d "node_modules/@img/sharp-libvips-darwin-arm64" ] && [ ! -d "node_modules/@img/sharp-libvips-darwin-x64" ]; then
        ln -sf sharp-libvips-darwin-arm64 node_modules/@img/sharp-libvips-darwin-x64
        log_with_timer "Created symlink: sharp-libvips-darwin-x64 -> sharp-libvips-darwin-arm64"
    fi
else
    log_with_timer "Running on x64 platform, moving x64 binaries if needed..."
    # Backup existing x64 binaries if they exist (original logic)
    if [ -d "node_modules/@img/sharp-darwin-x64" ]; then
        mv node_modules/@img/sharp-darwin-x64 node_modules/@img/sharp-darwin-x64.bak
    fi

    if [ -d "node_modules/@img/sharp-libvips-darwin-x64" ]; then
        mv node_modules/@img/sharp-libvips-darwin-x64 node_modules/@img/sharp-libvips-darwin-x64.bak
    fi
fi

# Start Electron build timer
ELECTRON_START_TIME=$(date +%s)
log_with_timer "Building Electron app for platforms: $PLATFORMS $ARCH_FLAG"
if [ -z "$PLATFORMS" ]; then
    electron-builder $ARCH_FLAG
else
    electron-builder $PLATFORMS $ARCH_FLAG
fi
ELECTRON_END_TIME=$(date +%s)
ELECTRON_DURATION=$((ELECTRON_END_TIME - ELECTRON_START_TIME))
log_with_timer "Electron build completed in $(format_duration $ELECTRON_DURATION)"

log_with_timer "Cleaning up Sharp binaries..."

if [ "$CURRENT_ARCH" = "arm64" ]; then
    log_with_timer "Removing x64 symlinks created for cross-compilation..."
    
    # Remove symlinks if they exist and are symlinks
    if [ -L "node_modules/@img/sharp-darwin-x64" ]; then
        rm node_modules/@img/sharp-darwin-x64
        log_with_timer "Removed symlink: sharp-darwin-x64"
    fi
    
    if [ -L "node_modules/@img/sharp-libvips-darwin-x64" ]; then
        rm node_modules/@img/sharp-libvips-darwin-x64
        log_with_timer "Removed symlink: sharp-libvips-darwin-x64"
    fi
else
    log_with_timer "Restoring x64 binaries from backup..."
    # Restore binaries (original logic)
    if [ -d "node_modules/@img/sharp-darwin-x64.bak" ]; then
        mv node_modules/@img/sharp-darwin-x64.bak node_modules/@img/sharp-darwin-x64
    fi

    if [ -d "node_modules/@img/sharp-libvips-darwin-x64.bak" ]; then
        mv node_modules/@img/sharp-libvips-darwin-x64.bak node_modules/@img/sharp-libvips-darwin-x64
    fi
fi

# Calculate total build time
BUILD_END_TIME=$(date +%s)
TOTAL_DURATION=$((BUILD_END_TIME - BUILD_START_TIME))

log_with_timer "Electron build complete!"
echo ""
echo "📊 BUILD SUMMARY"
echo "================"
printf "Next.js build:   %s\n" "$(format_duration $NEXTJS_DURATION)"
printf "Electron build:  %s\n" "$(format_duration $ELECTRON_DURATION)"
printf "Total time:      %s\n" "$(format_duration $TOTAL_DURATION)"
echo ""
echo "📦 Built packages:"
ls -la dist/ | grep -E '\.(dmg|zip|exe|deb|rpm|AppImage|tar\.gz)$' || echo "No packages found in dist/"

# Verify Windows x64 builds if Windows was built
if echo "$PLATFORMS" | grep -q "win"; then
    echo ""
    echo "Verifying Windows x64 builds:"
    find dist/ -name "*x64*" -o -name "*win*" | while read file; do
        echo "✓ $file"
        if command -v file &> /dev/null && [ -f "$file" ]; then
            file_info=$(file "$file" 2>/dev/null || echo "")
            if echo "$file_info" | grep -q "x86-64\|AMD64\|64-bit"; then
                echo "  → Architecture: 64-bit ✓"
            elif echo "$file_info" | grep -q "386\|32-bit"; then
                echo "  → Architecture: 32-bit ⚠️"
            else
                echo "  → Architecture: Unable to determine"
            fi
        fi
    done
fi