# AWS Reports Desktop App - Build Guide

This guide explains how to build the AWS Reports desktop application for different platforms.

## Available Build Commands

### Development
```bash
npm run electron:dev          # Run in development mode with hot reload
```

### Platform-Specific Builds
```bash
npm run electron:build:mac    # Build for macOS (DMG, ZIP)
npm run electron:build:win    # Build for Windows (NSIS, Portable, ZIP)
npm run electron:build:linux  # Build for Linux (AppImage, DEB, RPM, TAR.GZ)
npm run electron:build:all    # Build for all platforms
```

### Quick Builds
```bash
npm run electron:build        # Build for current platform only
```

## Build Outputs

### macOS
- **AWS Reports-{version}-arm64.dmg** - Installable disk image
- **AWS Reports-{version}-arm64-mac.zip** - Portable ZIP archive

### Windows
- **AWS Reports-{version}-x64-setup.exe** - NSIS installer
- **AWS Reports-{version}-x64-setup.zip** - Portable ZIP archive
- **AWS Reports-{version}-x64-portable.exe** - Portable executable

### Linux
- **AWS Reports-{version}-x64.AppImage** - Universal Linux package
- **AWS Reports-{version}-x64.deb** - Debian/Ubuntu package
- **AWS Reports-{version}-x64.rpm** - RedHat/CentOS package
- **AWS Reports-{version}-x64.tar.gz** - Generic archive

## Distribution for Non-Technical Users

### Windows Users
1. Download `AWS Reports-{version}-x64-setup.exe`
2. Run the installer and follow prompts
3. Launch from Start Menu or Desktop shortcut

### macOS Users
1. Download `AWS Reports-{version}-arm64.dmg`
2. Open DMG and drag app to Applications folder
3. Launch from Applications folder

### Linux Users
1. Download `AWS Reports-{version}-x64.AppImage`
2. Make executable: `chmod +x AWS*.AppImage`
3. Run directly: `./AWS*.AppImage`

## Prerequisites for Building

- Node.js 18+ installed
- All dependencies: `npm install`
- For Windows builds on macOS: No additional requirements (cross-compilation supported)
- For macOS builds: Xcode command line tools (macOS only)

## Troubleshooting

### Build Timeouts
If builds timeout, they may still complete successfully. Check the `dist/` folder for artifacts.

### Sharp Dependencies
The build script automatically handles Sharp native binary issues by temporarily moving incompatible binaries.

### Code Signing
- macOS: No code signing configured (unsigned builds)
- Windows: No code signing configured (may trigger security warnings)

For production distribution, consider setting up code signing certificates.

## Architecture Support

- **macOS**: ARM64 (Apple Silicon)
- **Windows**: x64 (64-bit Intel/AMD)
- **Linux**: x64 (64-bit Intel/AMD)

## Build Directory Structure

```
dist/
├── AWS Reports-0.1.0-arm64.dmg           # macOS installer
├── AWS Reports-0.1.0-arm64-mac.zip       # macOS portable
├── AWS Reports-0.1.0-x64-setup.exe       # Windows installer
├── AWS Reports-0.1.0-x64-setup.zip       # Windows portable
├── AWS Reports-0.1.0-x64.AppImage        # Linux AppImage
├── mac-arm64/                             # macOS unpacked
├── win-unpacked/                          # Windows unpacked
└── linux-unpacked/                       # Linux unpacked
```