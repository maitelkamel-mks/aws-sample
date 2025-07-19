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

This repository contains AWS utilities with a primary focus on the `aws-reports-web-app`, a Next.js 15 application that provides AWS cost reporting, Security Hub dashboards, and enterprise SSO integration. The application is available both as a web application and as a cross-platform desktop application using Electron.

### Core Architecture Patterns

1. **Next.js App Router**: The application uses Next.js 15's App Router located in `src/app/`. API routes in `src/app/api/` handle AWS SDK interactions server-side.

2. **AWS Integration Layer**: Located in `src/lib/aws/`, this layer manages:
   - Multi-account support via STS role assumption
   - Cost Explorer API integration (`costExplorer.ts`)
   - Security Hub API integration (`securityHub.ts`)
   - Profile-based credential management (`credentials.ts`)
   - Enterprise SSO authentication (`sso-service.ts`)
   - Token refresh and session management (`token-refresh-service.ts`)
   - Secure credential storage (`credential-storage.ts`)

3. **Unified Configuration System**: 
   - Single `config.yaml` file containing all application settings
   - Unified configuration manager (`src/lib/config/index.ts`)
   - Web UI for configuration at `/config` routes
   - Schema validation using Zod (`src/lib/schemas/`)
   - Desktop-persistent storage in userData directory
   - Support for cost, security, proxy, and SSO configurations

4. **Component Architecture**:
   - Shared components in `src/components/`
   - Feature-specific components co-located with their routes
   - Ant Design (antd) for UI components
   - Chart.js for data visualization

5. **State Management**:
   - React Query (TanStack Query) for server state
   - Custom hooks in `src/hooks/` for business logic (including `useTokenRefresh.ts`)
   - No client-side global state management
   - Client-side filtering for cost data without re-fetching

6. **Electron Desktop Integration**:
   - Main process in `electron/main.js` handles window management and file system access
   - Preload script in `electron/preload.js` provides secure IPC communication
   - API wrapper in `src/lib/electron/api.ts` automatically detects Electron vs browser mode
   - Native file dialogs replace browser downloads in desktop mode

### Key Technical Decisions

- **TypeScript**: Strict mode enabled with comprehensive type safety
- **AWS SDK v3**: Modular imports for optimal bundle size
- **Error Handling**: Comprehensive error boundaries with user-friendly messages
- **Enterprise SSO**: Full SAML/OAuth2 authentication with automatic role discovery
- **Security-First Design**: Token encryption, session binding, and comprehensive audit logging
- **Proxy Support**: HTTP/HTTPS proxy configuration for enterprise environments
- **Cross-Platform Desktop**: Electron enables native desktop apps for macOS, Windows, and Linux
- **Hybrid Architecture**: Same codebase runs as web app or desktop app with platform-specific optimizations
- **Unified Configuration**: Single configuration file approach for simplified management

### Working with AWS Services

When modifying AWS integrations:
1. All AWS SDK calls should be server-side only (API routes or server components)
2. Use the existing credential management system in `src/lib/aws/credentials.ts`
3. Follow the established error handling patterns with proper error messages
4. Respect the multi-account architecture using STS role assumption
5. For SSO integrations, use the SSO service layer in `src/lib/aws/sso-service.ts`
6. Implement proper token refresh mechanisms for long-running sessions

### Configuration System

The application uses a unified YAML configuration system:
- **Unified Configuration**: Single `config.yaml` file contains all settings (cost, security, proxy, SSO)
- **Web UI Management**: Complete configuration through `/config` routes
- **Desktop Persistence**: Configurations stored in userData directory for desktop apps
- **Auto-Discovery**: SSO login automatically discovers and configures AWS roles
- **Legacy Compatibility**: Maintains compatibility where needed
- **Schema Validation**: Comprehensive Zod schemas ensure data integrity

### SSO Integration Architecture

The application implements enterprise-grade SSO authentication:

#### SSO Components
```
src/components/auth/
├── SSOAuthForm.tsx       # Authentication form component
└── TokenRefreshStatus.tsx # Token status and refresh UI

src/components/config/
└── SSOConfigForm.tsx     # SSO configuration with login/role discovery

src/lib/aws/
├── sso-service.ts        # Core SSO authentication service
├── credential-storage.ts # Secure credential storage
└── token-refresh-service.ts # Automatic token refresh
```

#### SSO Features
- **Login & Role Discovery**: One-click authentication with automatic AWS role enumeration
- **Interactive Role Selection**: Modal interface for selecting and configuring multiple AWS roles
- **Automatic Configuration**: Selected roles auto-saved to unified configuration
- **Multi-Provider Support**: SoftID, LDAP, and OAuth2 authentication types
- **Enterprise Security**: Token encryption, session binding, audit logging
- **Proxy Integration**: Full proxy support for enterprise environments

#### SSO API Routes
- `/api/aws/sso/login` - Role discovery and authentication
- `/api/aws/sso/config` - SSO configuration management
- `/api/aws/sso/profiles` - Profile management
- `/api/aws/sso/refresh` - Token refresh functionality
- `/api/aws/sso/logout` - Session termination

### Cost Reporting Architecture

The cost reporting system implements performance-optimized data analysis:

#### Cost Reporting Features
- **Service Filtering**: 60+ predefined AWS services with searchable multi-select
- **Client-Side Filtering**: Real-time tax/support exclusion without API re-fetching
- **Multi-View Analysis**: Account totals, Service totals, Individual account breakdowns
- **Advanced Tables**: Sortable columns, horizontal scrolling, fixed summary rows
- **Multi-Format Export**: CSV, JSON, PDF, XLSX, HTML with embedded visualizations
- **Chart.js Integration**: Interactive bar charts and pie charts
- **Performance Optimized**: Single API call loads all data for dynamic filtering

#### Implementation Details
- **No Pagination**: Tables display complete datasets with horizontal scrolling
- **Client-Side Processing**: Filtering happens in browser after loading complete data
- **Export Consistency**: All formats honor the same filtering logic
- **Annual Aggregation**: Client-side processing of monthly data into yearly reports

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

## Git Commit Guidelines

### Commit Messages
- Do NOT include Claude Code attribution in commit messages
- Do NOT add "🤖 Generated with [Claude Code]" or "Co-Authored-By: Claude" lines
- Write commit messages as if they were created by the human developer
- Focus on the technical changes and their business value