#!/bin/bash

# Build script for Electron that handles Sharp dependencies and cross-platform builds

# Parse command line arguments
PLATFORMS=""
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

echo "Building Electron app for platforms: $PLATFORMS"
if [ -z "$PLATFORMS" ]; then
    electron-builder
else
    electron-builder $PLATFORMS
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