# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Web Application Development (aws-reports-web-app)
```bash
cd aws-reports-web-app

# Install dependencies
npm install

# Run development server with Turbopack (faster)
npm run dev

# Run development server with Webpack
npm run dev:webpack

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Clean install (if dependencies issues)
npm run clean
```

### Desktop Application Development (Electron)
```bash
cd aws-reports-web-app

# Run desktop app in development mode
npm run electron:dev

# Build desktop app for current platform
npm run electron:build

# Build for specific platforms
npm run electron:build:mac     # macOS ARM64
npm run electron:build:win     # Windows x64
npm run electron:build:linux   # Linux x64
npm run electron:build:all     # All platforms

# Development with clean slate
npm run dev:clean && npm run electron:dev
```

## High-Level Architecture

This repository contains AWS utilities with a primary focus on the `aws-reports-web-app`, a Next.js 15 application that provides AWS cost reporting and Security Hub dashboards. The application is available both as a web application and as a cross-platform desktop application using Electron.

### Core Architecture Patterns

1. **Next.js App Router**: The application uses Next.js 15's App Router located in `src/app/`. API routes in `src/app/api/` handle AWS SDK interactions server-side.

2. **AWS Integration Layer**: Located in `src/lib/aws/`, this layer manages:
   - Multi-account support via STS role assumption
   - Cost Explorer API integration (`costExplorer.ts`)
   - Security Hub API integration (`securityHub.ts`)
   - Profile-based credential management (`profiles.ts`)

3. **Configuration System**: 
   - YAML configurations stored in `config/` directory
   - Web UI for configuration at `/config` routes
   - Schema validation using Zod (`src/lib/schemas/`)

4. **Component Architecture**:
   - Shared components in `src/components/`
   - Feature-specific components co-located with their routes
   - Ant Design (antd) for UI components
   - Chart.js for data visualization

5. **State Management**:
   - React Query (TanStack Query) for server state
   - Custom hooks in `src/hooks/` for business logic
   - No client-side global state management

6. **Electron Desktop Integration**:
   - Main process in `electron/main.js` handles window management and file system access
   - Preload script in `electron/preload.js` provides secure IPC communication
   - API wrapper in `src/lib/electron/api.ts` automatically detects Electron vs browser mode
   - Native file dialogs replace browser downloads in desktop mode

### Key Technical Decisions

- **TypeScript**: Strict mode enabled with comprehensive type safety
- **AWS SDK v3**: Modular imports for optimal bundle size
- **Error Handling**: Comprehensive error boundaries with user-friendly messages
- **Proxy Support**: HTTP/HTTPS proxy configuration for enterprise environments
- **Cross-Platform Desktop**: Electron enables native desktop apps for macOS, Windows, and Linux
- **Hybrid Architecture**: Same codebase runs as web app or desktop app with platform-specific optimizations

### Working with AWS Services

When modifying AWS integrations:
1. All AWS SDK calls should be server-side only (API routes or server components)
2. Use the existing credential management system in `src/lib/aws/profiles.ts`
3. Follow the established error handling patterns with proper error messages
4. Respect the multi-account architecture using STS role assumption

### Configuration Files

The application uses YAML configuration files that maintain compatibility with legacy Python tools:
- Cost configurations: Define AWS accounts, regions, and cost categories
- Security configurations: Specify Security Hub aggregation settings
- Located in the `config/` directory and managed via web UI

### Desktop Application Architecture

The Electron desktop application wraps the Next.js web app with native desktop features:

#### File Structure
```
electron/
├── main.js          # Main Electron process (window management, file system)
└── preload.js       # Secure IPC bridge between main and renderer

src/lib/electron/
└── api.ts           # API wrapper that detects Electron vs browser mode

scripts/
└── build-electron.sh  # Cross-platform build script with Sharp dependency handling
```

#### Key Features
- **Native File Access**: Direct access to AWS credentials (~/.aws/) and config files
- **Cross-Platform Builds**: Supports macOS ARM64, Windows x64, and Linux x64
- **Secure IPC**: All file system operations go through main process for security
- **Automatic Fallback**: Components automatically use browser APIs when not in Electron
- **Production Ready**: Builds to distributable packages (DMG, ZIP, EXE, AppImage)

#### Build Outputs
- **macOS**: DMG installer and ZIP archive for ARM64 (Apple Silicon)
- **Windows**: NSIS installer, portable EXE, and ZIP archive for x64
- **Linux**: AppImage, DEB, RPM, and TAR.GZ packages for x64

#### Development vs Production
- **Development**: Electron launches Next.js dev server automatically
- **Production**: Electron starts Next.js programmatically using the Next.js API