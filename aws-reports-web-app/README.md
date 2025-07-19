# AWS Reports Web Application

A modern Next.js web application for AWS cost reporting and Security Hub dashboard functionality with enterprise SSO integration, providing a unified, full-stack TypeScript solution for AWS management and reporting.

## Features

- **Comprehensive Cost Reporting**: AWS cost analysis with Cost Explorer API integration
  - **Service Filtering**: 60+ predefined AWS services with searchable multi-select dropdown
  - **Flexible Service Selection**: Show all services or filter to specific services of interest
  - **Multi-View Analysis**: Switch between Account totals, Service totals, and Individual account breakdowns
  - **Advanced Data Tables**: Sortable tables with horizontal scrolling and fixed columns
  - **Summary Rows**: Fixed total rows in table footers showing aggregate costs
  - **Interactive Visualizations**: Chart.js integration with bar charts and pie charts
  - **Multiple Time Granularities**: Hourly, Daily, Monthly, and Annual reporting options
  - **Multi-Format Export**: CSV, JSON, PDF, XLSX, and HTML export capabilities
  - **Client-Side Filtering**: Real-time tax/support exclusion without re-fetching data
  - **SSO Profile Support**: Full integration with enterprise SSO-managed AWS accounts
- **Security Dashboard**: Security Hub findings aggregation and analysis
  - Advanced table sorting with multiple severity levels
  - Profile-specific findings tracking with accurate mapping
  - Enhanced pagination controls with quick jumper and size changer
  - Real-time filtering by severity, workflow state, and compliance status
- **Enterprise SSO Integration**: Complete single sign-on authentication system
  - **SSO Login & Role Discovery**: One-click login to discover available AWS roles
  - **Interactive Role Selection**: Modal interface for selecting and managing AWS roles
  - **Automatic Profile Configuration**: Auto-save selected roles to persistent configuration
  - **Multi-Provider Support**: SoftID, LDAP, and OAuth2 authentication types
  - **Security Features**: Token encryption, session binding, and audit logging
  - **Proxy Support**: Enterprise proxy configuration for SSO connections
- **Multi-Account Support**: Manage multiple AWS profiles and accounts
- **HTTP Proxy Support**: Automatic proxy configuration when HTTP_PROXY environment variables are set
- **Real-time Filtering**: Interactive filtering and search capabilities
- **Data Export**: Export reports in HTML, PDF, and Excel formats
- **Cross-Platform Desktop App**: Electron-based desktop application for macOS, Windows, and Linux
- **Responsive Design**: Mobile-friendly interface using Ant Design
- **Configuration Management**: Web-based unified configuration for all AWS and SSO settings
- **Error Handling**: User-friendly error messages with troubleshooting guidance

## Prerequisites

- Node.js 18+ and npm
- React 18 (for Ant Design v5 compatibility)
- AWS CLI configured with profiles
- AWS credentials with appropriate permissions for:
  - Cost Explorer (for cost reporting)
  - Security Hub (for security findings)
- Optional: HTTP proxy configuration if required by your network environment

## Installation

### Web Application

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure AWS profiles:**
   Ensure your AWS credentials are configured using AWS CLI:
   ```bash
   aws configure --profile your-profile-name
   ```

3. **Run the development server:**
   ```bash
   npm run dev          # Uses Turbopack (faster)
   # OR
   npm run dev:webpack  # Uses traditional Webpack
   ```

### Desktop Application

1. **Run desktop app in development:**
   ```bash
   npm run electron:dev
   ```

2. **Build desktop app for production:**
   ```bash
   npm run electron:build        # Current platform
   npm run electron:build:mac    # macOS ARM64
   npm run electron:build:win    # Windows x64
   npm run electron:build:linux  # Linux x64
   npm run electron:build:all    # All platforms
   ```

4. **Configure HTTP Proxy (Optional):**
   If your environment requires an HTTP proxy, set environment variables:
   ```bash
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   export NO_PROXY=localhost,127.0.0.1,.company.com
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Initial Setup

1. **Configure AWS Profiles:**
   - Go to Configuration → AWS Profiles tab
   - Your configured AWS profiles will be automatically detected
   - Ensure profiles have necessary permissions

2. **Configure Cost Reporting:**
   - Go to Configuration → Cost Configuration tab
   - Set up report preferences, profiles, service filters, and date ranges
   - Select specific AWS services or leave empty to show all services
   - Configuration will be saved to the unified `config.yaml` file

3. **Configure Security Hub:**
   - Go to Configuration → Security Configuration tab
   - Select profiles and home region for Security Hub
   - Configuration will be saved to the unified `config.yaml` file

4. **Configure Proxy (Optional):**
   - Go to Configuration → Proxy Settings tab
   - Enable proxy and configure URL, credentials, and exclusions
   - Alternatively, use environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`)

5. **Configure SSO (Enterprise):**
   - Go to Configuration → SSO Configuration tab
   - Configure your SSO provider settings (start URL, provider name, authentication type)
   - Click "SSO Login & Get Roles" to authenticate and discover available AWS roles
   - Select the AWS roles you want to add from the interactive modal
   - Roles are automatically saved to your configuration for future use
   - Configure security settings (SSL verification, token encryption, session binding)
   - Set up enterprise proxy settings if required

### Generating Reports

#### Cost Reports
1. Navigate to "Cost Reports" page
2. **Profile Selection:** Choose from configured AWS profiles (including SSO-managed profiles)
3. **Date Range:** Select start and end dates using the date picker
4. **Granularity Options:** Choose data aggregation level:
   - **Hourly**: Detailed hourly cost breakdown
   - **Daily**: Day-by-day cost analysis (recommended for most use cases)
   - **Monthly**: Monthly cost summaries
   - **Annual**: Client-side aggregation of monthly data into yearly overview
5. **Service Filtering:**
   - **Searchable Dropdown**: Select from 60+ predefined AWS services with search functionality
   - **Multi-Select**: Choose multiple services for focused analysis
   - **Selective Display**: Only selected services appear in reports and visualizations
   - **All Services Option**: Leave services empty to display all AWS service costs
6. **Display Options:**
   - **Tax Exclusion**: Toggle to exclude/include tax charges in reports
   - **Support Exclusion**: Toggle to exclude/include AWS support costs
   - **Real-Time Filtering**: Changes apply instantly without re-fetching data
7. Click "Fetch Cost Data" to generate comprehensive cost analysis
8. **Multi-View Analysis:**
   - **Account Totals Tab**: Cost per account across time periods
   - **Service Totals Tab**: Cost per service across all accounts
   - **Individual Profile Tabs**: Per-account service breakdown with dedicated tabs
9. **Table Features:**
   - **No Pagination**: Complete data displayed with horizontal scrolling
   - **Column Sorting**: Click any column header to sort (total costs default to descending)
   - **Fixed Columns**: Service/Account names fixed on left, totals on right
   - **Summary Rows**: Color-coded total rows always visible at bottom
10. **Visualizations:** Interactive Chart.js charts with bar and pie chart options for each view
11. **Export Options:** Multiple formats available via dropdown:
    - **CSV**: Raw data export
    - **JSON**: Structured data export
    - **PDF**: Professional reports with charts and tables
    - **XLSX**: Excel workbooks with multiple sheets
    - **HTML**: Self-contained interactive reports

#### Security Dashboard
1. Navigate to "Security Hub" page
2. Select AWS profiles and regions
3. Click "Refresh Findings"
4. Use filters to narrow down results by severity, status, or compliance
5. **Enhanced Table Features:**
   - Sort by any column (severity levels, total findings, account/region names)
   - Change page size (10, 20, 50, 100 items) using the dropdown
   - Jump to specific pages using the quick jumper
   - Total rows are fixed in table footers for easy reference
   - Each profile tab maintains its own sorting and pagination preferences

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── dashboard/         # Dashboard pages
│   ├── cost/             # Cost reporting pages
│   ├── security/         # Security hub pages
│   ├── config/           # Configuration pages
│   └── api/              # API routes
├── components/           # React components
├── lib/                 # Shared utilities
│   ├── aws/            # AWS service integrations
│   ├── config/         # Configuration management
│   └── types/          # TypeScript definitions
└── hooks/              # Custom React hooks
```

## Configuration Files

The application uses a **unified configuration system** that automatically migrates and consolidates all settings into a single file:

### Unified Configuration (Recommended)
- **Desktop App**: `{userData}/config.yaml` - All application settings in one file
- **Web App**: `config.yaml` - Single configuration file for all settings

### Configuration Structure
The unified configuration file contains all application settings:

```yaml
version: "1.0"
lastModified: "2024-01-15T10:30:00.000Z"

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

# Proxy configuration
proxy:
  enabled: true
  url: "http://proxy.company.com:8080"
  username: "proxy-user"
  password: "proxy-pass"
  no_proxy: ["localhost", "*.internal.com"]

# SSO configuration (Enterprise)
sso:
  enabled: true
  providerName: "Corporate SSO"
  startUrl: "https://websso-company.com/saml/login"
  authenticationType: "SoftID"  # Options: SoftID, LDAP, OAuth2
  sessionDuration: 36000
  region: "eu-west-1"
  samlDestination: "urn:amazon:webservices"
  
  # Provider-specific settings
  providerSettings:
    realm: "multiauth"
    module: "SoftID"
    gotoUrl: "https://websso-company.com/gardianwebsso/saml2/jsp/idpSSOInit.jsp"
    metaAlias: "/multiauth/idp6-20261219"
  
  # Enterprise proxy configuration for SSO
  proxy:
    enabled: true
    url: "https://proxy.company.com:3131"
  
  # Security settings
  security:
    sslVerification: true
    tokenEncryption: true
    sessionBinding: true
    auditLogging: true
  
  # AWS role profiles (auto-discovered via SSO login)
  profiles:
    - name: "prod-account-admin"
      accountId: "123456789012"
      roleName: "AdminRole"
      roleArn: "arn:aws:iam::123456789012:role/AdminRole"
      principalArn: "arn:aws:iam::123456789012:saml-provider/Corporate"
      description: "Production Account - Admin Role"
      region: "eu-west-1"
      type: "sso"
    - name: "dev-account-developer"
      accountId: "987654321098"
      roleName: "DeveloperRole"
      roleArn: "arn:aws:iam::987654321098:role/DeveloperRole"
      principalArn: "arn:aws:iam::987654321098:saml-provider/Corporate"
      description: "Development Account - Developer Role"
      region: "eu-west-1"
      type: "sso"
```


### Configuration Persistence
- **Desktop Application**: Configurations are stored in `{userData}/config.yaml` and persist across app updates and reinstalls
- **Web Application**: Configurations are stored in the working directory as `config.yaml`
- **Environment Variables**: Proxy settings can also be configured via `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` environment variables

### Configuration Locations by Platform
- **macOS**: `~/Library/Application Support/aws-reports-web-app/config.yaml`
- **Windows**: `%APPDATA%\aws-reports-web-app\config.yaml`
- **Linux**: `~/.config/aws-reports-web-app/config.yaml`

## API Endpoints

### Cost Reporting
- `GET /api/cost/data` - Fetch cost data
- `GET /api/cost/export` - Export cost data

### Security Hub
- `GET /api/security/findings` - Fetch security findings
- `GET /api/security/summary` - Get security summary

### Configuration
- `GET/PUT /api/config/cost` - Cost configuration
- `GET/PUT /api/config/security` - Security configuration

### System
- `GET /api/aws/profiles` - List AWS profiles
- `POST /api/aws/test-connectivity` - Test AWS connectivity for profiles
- `GET /api/health` - Health check (includes proxy configuration status)

## Development

### Building for Production
```bash
npm run build
npm start
```

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Clean Installation (if experiencing issues)
```bash
npm run clean
```

This command will:
- Remove node_modules and package-lock.json
- Clear npm cache
- Reinstall all dependencies fresh

### Development Options
```bash
npm run dev          # Development with Turbopack (faster builds)
npm run dev:webpack  # Development with Webpack (more compatible)
npm run dev:clean    # Clean install + development with Turbopack
```

## Deployment

The application can be deployed as:

1. **Standalone Next.js Application:**
   ```bash
   npm run build
   npm start
   ```

2. **Cross-Platform Desktop Application:**
   ```bash
   npm run electron:build:all
   ```
   Generates installers for:
   - **macOS**: DMG installer and ZIP archive (ARM64)
   - **Windows**: NSIS installer, portable EXE, and ZIP archive (x64)
   - **Linux**: AppImage, DEB, RPM, and TAR.GZ packages (x64)

3. **Docker Container:**
   ```bash
   docker build -t aws-reports-app .
   docker run -p 3000:3000 aws-reports-app
   ```

## Troubleshooting

### Common Issues

1. **"No AWS profiles found"**
   - Ensure AWS CLI is configured: `aws configure`
   - Check that `~/.aws/credentials` and `~/.aws/config` files exist

2. **"Failed to fetch cost data"**
   - Verify AWS credentials have Cost Explorer permissions
   - Ensure Cost Explorer is enabled in your AWS account
   - Check that the selected profiles are valid

3. **"Failed to fetch security findings"**
   - Verify Security Hub is enabled in the selected regions
   - Ensure AWS credentials have Security Hub permissions
   - Check that the selected profiles have access to Security Hub

4. **Configuration save errors**
   - The application uses a unified configuration file (`config.yaml`)
   - The application automatically creates necessary directories
   - Ensure the application has write permissions to the configuration directory
   - **Desktop App**: Configurations persist in user data directory across updates
   - **Web App**: Configurations are stored in the working directory

5. **Ant Design message warnings**
   - The application properly uses Ant Design's App component for message context
   - No static message method warnings should appear in production

6. **React version compatibility warnings**
   - Ensure you're using React 18.x for full Ant Design v5 compatibility
   - Run `npm ls react` to check your React version
   - If you see intermittent warnings, run `npm run clean` to clear cache and reinstall dependencies

7. **AWS profile connection errors**
   - The application displays detailed error messages for AWS connection issues
   - Check the dashboard for connection status and troubleshooting guidance
   - Error messages include specific steps to resolve credential problems
   - Special handling for SSO session expiration with exact commands to fix

8. **HTTP Proxy connection issues**
   - Check the health endpoint at `/api/health` to see proxy configuration status
   - Verify HTTP_PROXY, HTTPS_PROXY environment variables are set correctly
   - Ensure NO_PROXY includes localhost and internal domains
   - Proxy configuration is automatically detected and applied to all AWS SDK calls
   - Console logs will show "Using HTTP proxy" messages when proxy is active

9. **Table pagination and sorting issues**
   - Each table maintains its own pagination and sorting state independently
   - Page size changes are applied immediately and persist during the session
   - Total rows are always displayed in table footers and don't participate in sorting
   - If pagination controls appear disabled, ensure there's enough data to paginate

### AWS Permissions Required

#### Cost Explorer
- `ce:GetCostAndUsage`
- `ce:GetDimensionValues`
- `ce:GetUsageReport`

#### Security Hub
- `securityhub:GetFindings`
- `securityhub:DescribeHub`
- `securityhub:ListMembers`

## Key Features & Improvements

### Unified Configuration System
- **Single Configuration File**: All application settings in one unified `config.yaml` file
- **Comprehensive Coverage**: Includes cost, security, proxy, and SSO configurations in one place
- **Persistent Storage**: Desktop application configurations survive app updates and reinstalls
- **Environment Integration**: Supports both file-based configuration and environment variables
- **Auto-Discovery**: SSO login automatically discovers and configures AWS roles

### Enterprise-Ready SSO Integration
- **One-Click Authentication**: Login and discover available AWS roles with a single button
- **Interactive Role Management**: Select and configure multiple AWS roles through intuitive UI
- **Automatic Configuration**: Selected roles are immediately saved to persistent configuration
- **Multi-Provider Support**: Compatible with SoftID, LDAP, and OAuth2 authentication systems
- **Enterprise Security**: Built-in encryption, session binding, and comprehensive audit logging

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review AWS credentials and permissions
3. Check the browser console for error messages
4. Verify AWS services are enabled in your account