#!/bin/bash

# Build script for Electron that handles Sharp dependencies and cross-platform builds

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
    echo "No platform specified, building for current platform..."
    PLATFORMS=""
fi

echo "Building Next.js for Electron..."
ELECTRON_BUILD=true npm run build

echo "Temporarily moving problematic Sharp binaries..."
# Backup existing x64 binaries if they exist
if [ -d "node_modules/@img/sharp-darwin-x64" ]; then
    mv node_modules/@img/sharp-darwin-x64 node_modules/@img/sharp-darwin-x64.bak
fi

if [ -d "node_modules/@img/sharp-libvips-darwin-x64" ]; then
    mv node_modules/@img/sharp-libvips-darwin-x64 node_modules/@img/sharp-libvips-darwin-x64.bak
fi

echo "Building Electron app for platforms: $PLATFORMS $ARCH_FLAG"
if [ -z "$PLATFORMS" ]; then
    electron-builder $ARCH_FLAG
else
    electron-builder $PLATFORMS $ARCH_FLAG
fi

echo "Restoring Sharp binaries..."
# Restore binaries
if [ -d "node_modules/@img/sharp-darwin-x64.bak" ]; then
    mv node_modules/@img/sharp-darwin-x64.bak node_modules/@img/sharp-darwin-x64
fi

if [ -d "node_modules/@img/sharp-libvips-darwin-x64.bak" ]; then
    mv node_modules/@img/sharp-libvips-darwin-x64.bak node_modules/@img/sharp-libvips-darwin-x64
fi

echo "Electron build complete!"
echo ""
echo "Built packages:"
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