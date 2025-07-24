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

This repository contains AWS utilities with a primary focus on the `aws-reports-web-app`, a **hybrid Next.js 15 application** that provides AWS cost reporting, Security Hub dashboards, and enterprise **multi-provider SSO integration**. The application is available both as a web application and as a cross-platform desktop application using Electron.

### Core Architecture Patterns

1. **Next.js App Router**: The application uses Next.js 15's App Router located in `src/app/`. API routes in `src/app/api/` handle AWS SDK interactions server-side.

2. **AWS Integration Layer**: Located in `src/lib/aws/`, this layer manages:
   - Multi-account support via STS role assumption
   - Cost Explorer API integration (`cost-explorer.ts`)
   - Security Hub API integration (`security-hub.ts`)
   - **Unified profile-based credential management** (`credentials.ts`)
   - Multi-provider SSO authentication (`src/lib/providers/`)
   - Provider registry and management (`src/lib/services/sso-provider-registry.ts`)

3. **Unified Configuration System**: 
   - **Single `config.yaml` file** containing all application settings
   - Unified configuration manager (`src/lib/config/index.ts`)
   - Web UI for configuration at `/config` routes
   - Schema validation using Zod (`src/lib/schemas/`)
   - Desktop-persistent storage in userData directory
   - Support for cost, security, proxy, and **multi-provider SSO configurations**

4. **Component Architecture**:
   - **Reusable shared components** in `src/components/common/`
   - **AWSProfileSelector** - Universal profile selector with CLI/SSO/hybrid support
   - **AWSErrorAlert** - Standardized AWS error handling with troubleshooting guidance
   - Feature-specific components co-located with their routes
   - Ant Design (antd) for UI components with proper context usage
   - Chart.js for data visualization

5. **State Management**:
   - **React Query (TanStack Query)** for server state with controlled caching
   - **Custom hooks** in `src/hooks/` for business logic
   - **useAWSProfiles** - Unified profile management hook with dual type support
   - No client-side global state management
   - **Controlled data loading** - manual refresh prevents unwanted API calls
   - **Cross-component synchronization** via React Query cache invalidation

6. **Electron Desktop Integration**:
   - Main process in `electron/main.js` handles window management and file system access
   - Preload script in `electron/preload.js` provides secure IPC communication
   - API wrapper in `src/lib/electron/api.ts` automatically detects Electron vs browser mode
   - Native file dialogs replace browser downloads in desktop mode

### Key Technical Decisions

- **TypeScript**: Strict mode enabled with comprehensive type safety
- **AWS SDK v3**: Modular imports for optimal bundle size
- **Error Handling**: Comprehensive error boundaries with user-friendly messages and AWS-specific troubleshooting
- **Multi-Provider SSO**: SAML, AWS Identity Center, and OIDC authentication with automatic role discovery
- **Security-First Design**: Token encryption, session binding, and comprehensive audit logging
- **Proxy Support**: HTTP/HTTPS proxy configuration for enterprise environments
- **Cross-Platform Desktop**: Electron enables native desktop apps for macOS, Windows, and Linux
- **Hybrid Architecture**: Same codebase runs as web app or desktop app with platform-specific optimizations
- **Unified Configuration**: Single configuration file approach for simplified management
- **Controlled Data Loading**: Manual refresh pattern prevents unnecessary API calls on parameter changes

### Working with AWS Services

When modifying AWS integrations:
1. All AWS SDK calls should be server-side only (API routes or server components)
2. Use the existing credential management system in `src/lib/aws/credentials.ts`
3. Follow the established error handling patterns with proper error messages
4. Respect the multi-account architecture using STS role assumption
5. For SSO integrations, use the multi-provider SSO registry in `src/lib/services/sso-provider-registry.ts` and provider implementations in `src/lib/providers/`
6. **Use the unified profiles API** at `/api/aws/profiles/unified` for consistent profile access

### Component Development Guidelines

When creating or modifying components:

1. **Use Reusable Components**: Always check `src/components/common/` for existing reusable components before creating new ones
2. **AWSProfileSelector Usage**: Use `AWSProfileSelector` for all profile selection needs - it supports CLI, SSO, and hybrid profiles automatically
3. **Error Handling**: Use `AWSErrorAlert` for consistent AWS error display with troubleshooting guidance
4. **Ant Design Context**: Always use `modal` from `App.useApp()` instead of static `Modal.confirm()` to respect theme context
5. **Profile Management**: Use `useAWSProfiles` hook for unified profile data access with automatic cache synchronization
6. **Form Integration**: When using AWSProfileSelector in forms, use `onChange={(value) => form.setFieldValue('field', value)}` pattern

### Configuration System

The application uses a unified YAML configuration system:
- **Unified Configuration**: Single `config.yaml` file contains all settings (cost, security, proxy, multi-provider SSO)
- **Web UI Management**: Complete configuration through `/config` routes
- **Desktop Persistence**: Configurations stored in userData directory for desktop apps
- **Auto-Discovery**: SSO login automatically discovers and configures AWS roles
- **Legacy Migration**: Automatic migration from single-provider to multi-provider configurations
- **Schema Validation**: Comprehensive Zod schemas ensure data integrity
- **Cross-Component Sync**: Configuration changes automatically invalidate React Query caches

### Multi-Provider SSO Architecture

The application implements a comprehensive multi-provider SSO system supporting multiple authentication protocols simultaneously:

#### Core Architecture Components
```
src/lib/types/sso-providers.ts          # Complete type system for multi-provider SSO
src/lib/services/sso-provider-registry.ts # Central provider registry and orchestrator

src/lib/providers/
├── SAMLProvider.ts                      # SAML 2.0 enterprise authentication
├── AWSManagedSSOProvider.ts            # AWS Identity Center with device flow
├── OIDCProvider.ts                     # OpenID Connect with PKCE security
└── index.ts                            # Provider registry and exports

src/components/config/
├── MultiProviderSSOConfigForm.tsx      # Multi-provider configuration interface
├── MultiProviderProfilesDisplay.tsx    # Dense, editable profile table
└── RoleSelectionModal.tsx              # Interactive role selection with existing profile detection

src/hooks/
└── useAWSProfiles.ts                   # Unified profile management hook

src/components/common/
└── AWSProfileSelector.tsx              # Universal profile selector component
```

#### Implemented Providers

**1. SAML Provider (`SAMLProvider`)**
- Enterprise SAML 2.0 authentication with JSON API integration
- Automatic role discovery from SAML assertions
- Proxy support and comprehensive error handling
- Configuration: startUrl, realm, module, metaAlias, sessionDuration

**2. AWS Managed SSO Provider (`AWSManagedSSOProvider`)**
- AWS Identity Center integration with OAuth2 device authorization flow
- Multi-account role discovery and token refresh capabilities
- Configuration: startUrl, region, sessionDuration

**3. OIDC Provider (`OIDCProvider`)**
- Generic OpenID Connect 1.0 support with PKCE security
- Automatic discovery document parsing and token refresh
- Configuration: issuer, clientId, scopes, redirectUri, sessionDuration

#### Multi-Provider Features
- **Plugin Architecture**: Extensible provider system with standardized interface
- **Provider Registry**: Central orchestrator managing multiple providers simultaneously
- **Dynamic Configuration**: Auto-generating UI forms based on provider schemas
- **Health Monitoring**: Real-time provider health checks and session tracking
- **Legacy Migration**: Automatic migration from single-provider configurations
- **Session Management**: Multi-provider session tracking with expiration handling
- **Dense Profile Management**: Editable table interface for profile name updates and deletion
- **Cross-Component Synchronization**: Profile changes automatically propagate across all components

#### Multi-Provider API Routes
```
/api/aws/sso/multi-provider/config      # Multi-provider configuration management
/api/aws/sso/multi-provider/providers   # Provider discovery and schema information
/api/aws/sso/multi-provider/authenticate # Provider-specific authentication and role discovery
/api/aws/sso/multi-provider/update-roles # Update provider roles with merge logic (prevents data loss)
/api/aws/profiles/unified               # Unified CLI + SSO profiles with dual type support
```

#### Provider Interface
Each provider implements a standardized interface:
```typescript
interface SSOProvider {
  readonly id: string;
  readonly type: SSOProviderType;
  authenticate(credentials: AuthCredentials, config: ProviderConfig): Promise<AuthenticationResult>;
  discoverRoles(authResult: AuthenticationResult): Promise<SSOProfile[]>;
  validateConfig(config: ProviderConfig): ValidationResult;
  getConfigSchema(): ProviderConfigSchema;
  supportsFeature(feature: ProviderFeature): boolean;
}
```

#### Profile Type System
The application supports three profile types:
- **`'cli'`**: Pure CLI profiles from ~/.aws/credentials
- **`'sso'`**: Pure SSO profiles from multi-provider configuration
- **`'cli+sso'`**: Hybrid profiles that exist in both CLI and SSO configurations

### Unified Profile Management System

#### Core Profile Hook (`src/hooks/useAWSProfiles.ts`)
```typescript
// Universal profile data access
const { profiles, isLoading, error, refetch } = useAWSProfiles({
  format: 'detailed',        // 'detailed' | 'names'
  includeSso: true,          // Include SSO profiles
  enabled: true              // Auto-fetch control
});

// Profile names only (backward compatibility)
const { profiles: names } = useAWSProfileNames(true);

// CLI profiles only
const { profiles: cliProfiles } = useCLIProfiles();
```

#### AWSProfileSelector Component (`src/components/common/AWSProfileSelector.tsx`)
```typescript
// Multi-select with type badges
<AWSProfileSelector
  mode="multiple"
  value={selectedProfiles}
  onChange={(value) => setSelectedProfiles(value as string[])}
  showTypeBadges
  showRefresh
  placeholder="Select AWS profiles"
/>

// Single select for forms
<Form.Item name="profile">
  <AWSProfileSelector
    onChange={(value) => form.setFieldValue('profile', value)}
  />
</Form.Item>
```

#### Visual Indicators
- **CLI profiles**: Green user icon + "CLI" badge
- **SSO profiles**: Blue cloud icon + "SSO" badge  
- **Hybrid CLI+SSO profiles**: Both user + cloud icons + purple "CLI+SSO" badge
- **Authentication status**: Active/Inactive badges with color coding
- **Profile metadata**: Account IDs, regions, role information

### Cost Reporting Architecture

The cost reporting system implements performance-optimized data analysis with **controlled data loading**:

#### Cost Reporting Features
- **Service Filtering**: 60+ predefined AWS services with searchable multi-select
- **Client-Side Filtering**: Real-time tax/support exclusion without API re-fetching
- **Multi-View Analysis**: Account totals, Service totals, Individual account breakdowns
- **Advanced Tables**: Sortable columns, horizontal scrolling, fixed summary rows
- **Multi-Format Export**: CSV, JSON, PDF, XLSX, HTML with embedded visualizations
- **Chart.js Integration**: Interactive bar charts and pie charts
- **Manual Data Loading**: Data loads only on explicit button clicks, not parameter changes
- **Profile Persistence**: All profile tabs remain visible even when filtered services show 0 data

#### Controlled Data Loading Pattern
- **Query Parameters**: Profiles, date ranges, and granularity changes do NOT trigger automatic data loading
- **Manual Refresh**: Data loads only when "Generate Report" button is clicked
- **Parameter Capture**: Query parameters are captured at button click time and frozen until next click
- **Real-Time Filters**: Tax/support/service filters update display immediately without API calls
- **Profile Visibility**: All selected profiles remain visible in tabs even with 0 data after filtering

#### Implementation Details
- **No Caching**: React Query configured with `staleTime: 0` and `gcTime: 0` for always-fresh data
- **No Pagination**: Tables display complete datasets with horizontal scrolling
- **Client-Side Processing**: Filtering happens in browser after loading complete data
- **Export Consistency**: All formats honor the same filtering logic and captured parameters
- **Annual Aggregation**: Client-side processing of monthly data into yearly reports

### Security Hub Dashboard Architecture

The Security Hub dashboard implements the same controlled loading pattern as the cost reporting system:

#### Security Hub Features
- **Multi-Region Support**: Query multiple regions simultaneously with graceful error handling
- **Finding Categorization**: Severity-based filtering (Critical, High, Medium, Low)
- **Compliance Tracking**: Track compliance status across multiple accounts
- **Resource Analysis**: Detailed resource information extraction from findings
- **Workflow Management**: Support for finding workflow states (New, Notified, Resolved, Suppressed)
- **Enhanced Error Handling**: Special handling for regions where Security Hub is unavailable

#### Data Loading Behavior
- **Controlled Loading**: Same parameter capture mechanism as cost dashboard
- **Manual Refresh**: Data loads only when "Generate Report" button is clicked
- **Parameter Independence**: Profile/region changes don't trigger automatic API calls
- **Real-Time Filtering**: Finding filters update display without re-fetching data

#### Error Handling and Region Support
- **Graceful Region Handling**: Regions where Security Hub is unavailable are treated as "no data" rather than errors
- **Service Availability**: Automatically detects and handles regions where Security Hub service is not enabled
- **Enhanced AWS Error Parsing**: User-friendly messages with specific troubleshooting guidance
- **Partial Failures**: Continues processing even if some profile/region combinations fail

#### Implementation Details
- **Resource Name Extraction**: Intelligent extraction of resource names from various AWS resource types (EC2, S3, RDS, Lambda, etc.)
- **ARN Parsing**: Automatic parsing of AWS ARNs to extract meaningful resource identifiers
- **Finding Aggregation**: Client-side aggregation of findings by severity, account, region, and compliance status
- **No Caching**: Same React Query configuration as cost dashboard for always-fresh data

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

## Development Best Practices

### React Query Usage
- **Unified Query Keys**: Use consistent query keys like `['aws-profiles-unified']` for cross-component synchronization
- **Cache Invalidation**: Always invalidate related caches when making configuration changes
- **No Caching**: Use `staleTime: 0` for always-fresh data in reporting dashboards
- **Error Handling**: Implement proper error boundaries with user-friendly messages

### Component Development
- **Reusable First**: Always check for existing reusable components before creating new ones
- **Prop Consistency**: Use consistent prop patterns across similar components
- **TypeScript**: Maintain strict type safety throughout all components
- **Error Boundaries**: Implement comprehensive error handling with specific troubleshooting guidance

### API Development
- **Server-Side Only**: All AWS SDK operations must be in API routes, never client-side
- **Consistent Response Format**: Use standardized `ApiResponse` interface for all API responses
- **Error Parsing**: Implement AWS-specific error parsing with user-friendly messages
- **Multi-Account Support**: Use profile-based credential management with STS role assumption

### Configuration Management
- **Unified Approach**: All configuration should go through the unified `config.yaml` system
- **Schema Validation**: All configuration changes must be validated using Zod schemas
- **Legacy Migration**: Implement automatic migration paths for configuration changes
- **Cross-Component Sync**: Ensure configuration changes invalidate appropriate React Query caches

### Testing and Quality
- **TypeScript Compilation**: Always run `npm run build` to check for TypeScript errors
- **Linting**: Run `npm run lint` to ensure code quality
- **Error Testing**: Test error scenarios with invalid AWS credentials and network failures
- **Multi-Platform Testing**: Test desktop builds on different platforms when making Electron changes

## Git Commit Guidelines

### Commit Messages
- Do NOT include Claude Code attribution in commit messages
- Do NOT add "🤖 Generated with [Claude Code]" or "Co-Authored-By: Claude" lines
- Write commit messages as if they were created by the human developer
- Focus on the technical changes and their business value
- Use conventional commit format: `type(scope): description`

### Examples
```
feat(sso): implement multi-provider SSO with SAML and OIDC support
fix(profiles): resolve profile synchronization across components
refactor(components): create reusable AWSProfileSelector component
docs(readme): update architecture documentation with latest changes
```

## Important Implementation Notes

### Ant Design Usage
- Always use `modal` from `App.useApp()` instead of static `Modal.confirm()` to respect theme context
- Never use unsupported props like `size` on `Alert` or `Tag` components
- Ensure all components are wrapped in `App` component for proper context

### Profile Management
- All profile selectors should use the `AWSProfileSelector` component for consistency
- Profile changes automatically propagate across components via React Query cache invalidation
- Support for dual CLI+SSO profile types is built into the unified profile system

### Configuration Changes
- All configuration updates should invalidate relevant React Query caches
- Use backward-compatible query key invalidation for complete synchronization
- Test configuration changes across all application components

### Error Handling
- Implement AWS-specific error parsing with troubleshooting guidance
- Use consistent error message formatting across all components
- Provide specific resolution steps for common AWS authentication and permission issues

This architecture represents a mature, enterprise-grade AWS management application with sophisticated multi-provider authentication, controlled data loading patterns, reusable component architecture, and comprehensive cross-platform support.