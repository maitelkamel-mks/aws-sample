# AWS Reports Web Application

A modern **hybrid Next.js web application** for AWS cost reporting and Security Hub dashboard functionality with enterprise **multi-provider SSO integration**, providing a unified, full-stack TypeScript solution for AWS management and reporting. Available both as a web application and cross-platform desktop application.

## 🏗️ Architecture Overview

### **Hybrid Architecture (Web + Desktop)**
- **Next.js 15 App Router**: Modern web framework with server-side API routes
- **Electron Integration**: Cross-platform desktop wrapper with secure IPC communication
- **Universal Codebase**: Same React components work seamlessly in both browser and desktop environments
- **Platform Detection**: Automatic fallback between Electron and browser APIs

### **Key Architectural Features**
- **Controlled Data Loading**: Manual refresh pattern prevents unnecessary API calls on parameter changes
- **Multi-Provider SSO**: Comprehensive authentication system supporting SAML, AWS SSO, and OIDC simultaneously
- **Unified Configuration**: Single `config.yaml` file architecture containing all application settings
- **Reusable Components**: Comprehensive shared component library with consistent patterns
- **Profile Management**: Unified system handling CLI, SSO, and hybrid CLI+SSO profiles

## ✨ Features

### **Cost Reporting & Analysis**
- **Service Filtering**: 60+ predefined AWS services with searchable multi-select dropdown
- **Controlled Data Loading**: Data loads only on explicit button clicks, not parameter changes
- **Multi-View Analysis**: Account totals, Service totals, and Individual account breakdowns
- **Advanced Data Tables**: Sortable tables with horizontal scrolling and fixed columns
- **Interactive Visualizations**: Chart.js integration with bar charts and pie charts
- **Multiple Time Granularities**: Hourly, Daily, Monthly, and Annual reporting options
- **Multi-Format Export**: CSV, JSON, PDF, XLSX, and HTML export capabilities with embedded visualizations
- **Client-Side Filtering**: Real-time tax/support exclusion without re-fetching data
- **Profile Persistence**: All profile tabs remain visible even when filtered data shows 0

### **Security Hub Dashboard**
- **Multi-Region Support**: Query multiple regions simultaneously with graceful error handling
- **Finding Categorization**: Severity-based filtering (Critical, High, Medium, Low)
- **Compliance Tracking**: Track compliance status across multiple accounts
- **Resource Analysis**: Detailed resource information extraction from findings
- **Workflow Management**: Support for finding workflow states (New, Notified, Resolved, Suppressed)
- **Enhanced Table Features**: Advanced pagination, sorting, and quick navigation controls
- **Controlled Loading**: Same parameter capture mechanism as cost dashboard

### **Multi-Provider SSO System**
- **SAML Provider**: Enterprise SAML 2.0 authentication with JSON API integration
- **AWS Managed SSO Provider**: AWS Identity Center integration with OAuth2 device authorization flow
- **OIDC Provider**: Generic OpenID Connect 1.0 support with PKCE security
- **Provider Registry**: Central orchestrator managing multiple providers simultaneously
- **Dynamic Configuration**: Auto-generating UI forms based on provider schemas
- **Health Monitoring**: Real-time provider health checks and session tracking
- **Security-First Design**: Token encryption, session binding, and comprehensive audit logging
- **Role Discovery**: Automatic discovery and configuration of AWS roles from multiple providers

### **Profile Management**
- **Unified Profile System**: Handles CLI, SSO, and hybrid CLI+SSO profiles through consistent interface
- **Profile Types**: Support for `'cli' | 'sso' | 'cli+sso'` profile types
- **Authentication Status**: Real-time authentication state tracking
- **Cross-Component Synchronization**: Changes in one component automatically update all related pages
- **Reusable Components**: `AWSProfileSelector` component for consistent profile selection across the application

### **Desktop Application**
- **Cross-Platform Support**: Native builds for macOS ARM64, Windows x64, and Linux x64
- **Native File Access**: Direct access to AWS credentials and config files
- **Secure IPC**: All file system operations go through main process for security
- **Automatic Fallback**: Components automatically use browser APIs when not in Electron
- **Production Ready**: Builds to distributable packages (DMG, ZIP, EXE, AppImage, DEB, RPM)

### **Enterprise Features**
- **HTTP Proxy Support**: Comprehensive proxy configuration for enterprise environments
- **Multi-Account Management**: Seamless switching between multiple AWS accounts
- **Error Handling**: User-friendly error messages with AWS-specific troubleshooting guidance
- **Configuration Management**: Web-based unified configuration for all AWS and SSO settings
- **Audit Logging**: Comprehensive security event logging for enterprise compliance

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** and npm
- **AWS CLI** configured with profiles
- **AWS credentials** with appropriate permissions for Cost Explorer and Security Hub
- **Optional**: HTTP proxy configuration if required by your network environment

### Installation

#### Web Application
```bash
# Install dependencies
npm install

# Configure AWS profiles
aws configure --profile your-profile-name

# Run development server
npm run dev          # Uses Turbopack (faster)
# OR
npm run dev:webpack  # Uses traditional Webpack
```

#### Desktop Application
```bash
# Run desktop app in development
npm run electron:dev

# Build desktop app for production
npm run electron:build        # Current platform
npm run electron:build:mac    # macOS ARM64
npm run electron:build:win    # Windows x64
npm run electron:build:linux  # Linux x64
npm run electron:build:all    # All platforms
```

#### Optional: HTTP Proxy Configuration
```bash
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,.company.com
```

Open your browser to [http://localhost:3000](http://localhost:3000)

## 📋 Usage Guide

### Initial Setup

1. **Configure AWS Profiles:**
   - Go to Configuration → AWS Profiles tab
   - Your configured AWS profiles will be automatically detected
   - Ensure profiles have necessary permissions

2. **Configure Multi-Provider SSO (Enterprise):**
   - Go to Configuration → SSO Configuration tab
   - Add multiple SSO providers (SAML, AWS SSO, OIDC)
   - Configure provider-specific settings and security options
   - Test authentication and role discovery for each provider
   - Profiles are automatically synchronized across all application components

3. **Configure Cost/Security Reporting:**
   - Go to Configuration → Cost/Security Configuration tabs
   - Set up report preferences, profiles, service filters, and date ranges
   - Configuration saved to unified `config.yaml` file

### Data Loading Behavior

The application implements **controlled data loading** to prevent unwanted API calls:

- **Parameter Changes**: Modifying profiles, date ranges, or granularity settings does NOT trigger automatic data loading
- **Manual Loading**: Data is fetched only when you explicitly click the "Generate Report" button
- **Parameter Capture**: Query parameters are captured at button click time and frozen until next click
- **Real-Time Filters**: Filters like tax/support exclusions update display immediately without API calls
- **Fresh Data**: No caching is used - each button click fetches fresh data from AWS APIs
- **Profile Persistence**: All selected profiles remain visible in tabs even when filtered data shows 0

### Multi-Provider SSO Workflow

1. **Provider Configuration:**
   - Add multiple SSO providers with different authentication methods
   - Configure provider-specific settings (URLs, credentials, security options)
   - Test connectivity and authentication for each provider

2. **Role Discovery:**
   - Authenticate with each provider to discover available AWS roles
   - Use the interactive Role Selection Modal to choose roles
   - Profiles are automatically saved and synchronized across the application

3. **Profile Management:**
   - Edit profile names using inline editing in the SSO Profiles table
   - Delete profiles with confirmation dialogs
   - Changes automatically propagate to all profile selectors in the application

## 🏗️ Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── aws/           # AWS service endpoints
│   │   │   ├── profiles/  # Profile management
│   │   │   └── sso/       # Multi-provider SSO
│   │   ├── config/        # Configuration management
│   │   ├── cost/          # Cost reporting APIs
│   │   └── security/      # Security Hub APIs
│   ├── cost/              # Cost reporting pages
│   ├── security/          # Security Hub pages  
│   └── config/            # Configuration pages
├── components/            # React components
│   ├── common/           # Reusable shared components
│   │   ├── AWSProfileSelector.tsx    # Universal profile selector
│   │   └── AWSErrorAlert.tsx         # AWS error handling
│   ├── config/           # Configuration management UI
│   ├── cost/             # Cost reporting components
│   ├── security/         # Security Hub components
│   ├── dashboard/        # Dashboard components
│   └── layout/           # App-wide layout
├── lib/                  # Shared utilities
│   ├── aws/             # AWS service integrations
│   ├── config/          # Configuration management
│   ├── providers/       # SSO provider implementations
│   ├── services/        # Business logic services
│   └── types/           # TypeScript definitions
├── hooks/               # Custom React hooks
│   └── useAWSProfiles.ts # Unified profile management hook
└── electron/            # Desktop application
    ├── main.js          # Electron main process
    └── preload.js       # Secure IPC bridge
```

## ⚙️ Configuration System

### Unified Configuration Architecture

The application uses a **single configuration file approach** with automatic migration:

```yaml
version: "1.0"
lastModified: "2024-07-24T10:30:00.000Z"

# Cost reporting configuration
cost:
  profiles: ["profile1", "profile2"]
  services: ["EC2", "S3", "RDS"]
  start_date: "2024-01-01"
  end_date: "2024-01-31"
  period: "daily"
  exclude_taxes: false
  exclude_support: false

# Security Hub configuration
security:
  profiles: ["profile1", "profile2"]
  home_region: "us-east-1"

# Multi-Provider SSO configuration
multiProviderSSO:
  version: "1.0"
  providers:
    - id: "corporate-saml"
      type: "SAML"
      name: "Corporate SAML"
      settings:
        startUrl: "https://sso.company.com/saml/login"
        realm: "corporate"
        module: "SAML"
        sessionDuration: 43200
        profiles:
          - profileName: "prod-admin"
            accountId: "123456789012"
            roleName: "AdminRole"
            region: "us-east-1"
    - id: "aws-identity-center"
      type: "AWS_SSO"
      name: "AWS Identity Center"
      settings:
        startUrl: "https://d-1234567890.awsapps.com/start"
        region: "us-east-1"
        sessionDuration: 28800
        profiles:
          - profileName: "dev-developer"
            accountId: "987654321098"
            roleName: "DeveloperRole"
            region: "us-west-2"
  globalSettings:
    security:
      sslVerification: true
      tokenEncryption: true
      sessionBinding: true
      auditLogging: true

# Proxy configuration
proxy:
  enabled: true
  url: "http://proxy.company.com:8080"
  username: "proxy-user"
  password: "proxy-pass"
  no_proxy: ["localhost", "*.internal.com"]
```

### Configuration Persistence
- **Desktop Application**: `{userData}/config.yaml` persists across app updates
- **Web Application**: `config.yaml` in working directory
- **Environment Variables**: Proxy settings via `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`

### Configuration Locations by Platform
- **macOS**: `~/Library/Application Support/aws-reports-web-app/config.yaml`
- **Windows**: `%APPDATA%\aws-reports-web-app\config.yaml`
- **Linux**: `~/.config/aws-reports-web-app/config.yaml`

## 🔌 API Endpoints

### Profile Management
- `GET /api/aws/profiles/unified` - Get unified CLI + SSO profiles with dual type support
- `POST /api/aws/test-connectivity` - Test AWS connectivity for profiles

### Multi-Provider SSO
- `GET/POST /api/aws/sso/multi-provider/config` - Multi-provider SSO configuration management
- `POST /api/aws/sso/multi-provider/authenticate` - Provider-specific authentication and role discovery
- `GET /api/aws/sso/multi-provider/providers` - Provider discovery and schema information
- `POST /api/aws/sso/multi-provider/update-roles` - Update provider roles with merge logic

### Cost Reporting
- `GET /api/cost/data` - Fetch cost data with controlled loading
- `GET /api/cost/export` - Export cost data in multiple formats

### Security Hub
- `GET /api/security/findings` - Fetch security findings
- `GET /api/security/summary` - Get security summary
- `GET /api/security/export` - Export security data

### Configuration Management
- `GET/PUT /api/config/cost` - Cost configuration
- `GET/PUT /api/config/security` - Security configuration
- `GET/PUT /api/config/proxy` - Proxy configuration

### System
- `GET /api/health` - Health check with proxy configuration status

## 🛠️ Development

### Development Commands
```bash
# Web Development
npm run dev                    # Next.js with Turbopack (faster)
npm run dev:webpack           # Next.js with Webpack
npm run build                 # Production build
npm run start                 # Start production server
npm run lint                  # Code linting

# Desktop Development
npm run electron:dev          # Desktop app in development
npm run electron:build        # Cross-platform desktop builds
npm run electron:build:mac    # macOS ARM64 build
npm run electron:build:win    # Windows x64 build
npm run electron:build:linux  # Linux x64 build
npm run electron:build:all    # All platforms

# Maintenance
npm run clean                 # Clean install dependencies
npm run dev:clean            # Clean install + development
```

### Technology Stack
- **Frontend**: Next.js 15, React 18, TypeScript 5, Ant Design 5
- **State Management**: TanStack Query (React Query), Custom hooks
- **AWS Integration**: AWS SDK v3 with modular imports
- **Desktop**: Electron 37 with secure IPC
- **Data Visualization**: Chart.js with react-chartjs-2
- **Build Tools**: Turbopack (dev), Webpack (legacy), Electron Builder

### Cross-Platform Build System
- **Sharp Dependency Handling**: Automatic rebuilding for cross-platform compatibility
- **Performance Tracking**: Comprehensive build timing and performance metrics
- **Multi-Platform Support**: macOS ARM64, Windows x64, Linux x64
- **Build Outputs**: DMG, ZIP, EXE, AppImage, DEB, RPM packages

## 🚀 Deployment

### Deployment Options

1. **Standalone Next.js Application:**
   ```bash
   npm run build
   npm start
   ```

2. **Cross-Platform Desktop Application:**
   ```bash
   npm run electron:build:all
   ```

3. **Docker Container:**
   ```bash
   docker build -t aws-reports-app .
   docker run -p 3000:3000 aws-reports-app
   ```

## 🔧 Troubleshooting

### Common Issues

1. **"No AWS profiles found"**
   - Ensure AWS CLI is configured: `aws configure`
   - Check that `~/.aws/credentials` and `~/.aws/config` files exist

2. **"Failed to fetch cost/security data"**
   - Verify AWS credentials have appropriate permissions
   - Ensure Cost Explorer/Security Hub is enabled in your AWS account
   - Check that the selected profiles are valid and have access

3. **Multi-Provider SSO Issues**
   - Check provider configuration in the SSO Configuration tab
   - Verify SSO provider health status and connectivity
   - Review audit logs for authentication failures
   - Ensure proxy settings are correctly configured if in enterprise environment

4. **Profile Synchronization Issues**
   - Profile changes automatically propagate across all components
   - If profiles don't appear updated, check browser console for errors
   - React Query cache invalidation ensures cross-component synchronization

5. **Desktop Application Issues**
   - Configurations persist in userData directory across updates
   - Ensure the application has necessary file system permissions
   - Check that Electron security policies allow required operations

### AWS Permissions Required

#### Cost Explorer
- `ce:GetCostAndUsage`
- `ce:GetDimensionValues`
- `ce:GetUsageReport`

#### Security Hub
- `securityhub:GetFindings`
- `securityhub:DescribeHub`
- `securityhub:ListMembers`

#### Multi-Provider SSO
- `sts:AssumeRoleWithSAML` (for SAML providers)
- `sso:GetRoleCredentials` (for AWS SSO providers)
- `sts:AssumeRoleWithWebIdentity` (for OIDC providers)

## 🎯 Key Architectural Highlights

### **Enterprise-Ready Features**
- **Multi-Provider Authentication**: Simultaneous support for multiple SSO providers
- **Security-First Design**: Token encryption, session binding, comprehensive audit logging
- **Proxy Support**: Full HTTP/HTTPS proxy integration for enterprise environments
- **Cross-Platform Desktop**: Native file dialogs, userData directory persistence
- **Unified Configuration**: Single file approach with automatic migration capabilities

### **Performance Optimizations**
- **Controlled Data Loading**: Prevents unnecessary API calls through manual refresh pattern
- **Bundle Optimization**: AWS SDK v3 modular imports for optimal bundle size
- **Client-Side Filtering**: Real-time filtering without backend re-queries
- **Component Reusability**: Consistent patterns reduce code duplication and improve maintainability
- **Caching Strategy**: No caching ensures always-fresh data while preventing unwanted requests

### **Developer Experience**
- **TypeScript Strict Mode**: Comprehensive type safety throughout the application
- **Hot Reload**: Electron hot reload with Next.js dev server integration
- **Comprehensive Error Handling**: User-friendly error messages with specific troubleshooting guidance
- **Consistent Architecture**: Reusable components and patterns across the entire application

This architecture represents a **mature, enterprise-grade AWS management application** with sophisticated multi-provider authentication, controlled data loading patterns, and comprehensive cross-platform support. The application demonstrates strong architectural decisions with reusable components, consistent patterns, and robust error handling throughout.

## 📞 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review AWS credentials and permissions
3. Check the browser console for error messages
4. Verify AWS services are enabled in your account
5. Review audit logs for SSO authentication issues