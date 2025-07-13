# AWS Reports Web Application

A modern Next.js web application for AWS cost reporting and Security Hub dashboard functionality, replacing the existing Python scripts with a unified, full-stack TypeScript solution.

## Features

- **Cost Reporting**: Interactive AWS cost analysis with Cost Explorer API integration
  - Service filtering with "Other" category aggregation (like finops-cost-report Python script)
  - Sortable tables with customizable pagination (10, 20, 50, 100 items per page)
  - Fixed total rows in table footers for easy reference
  - Visual charts and graphs for cost analysis
  - Multiple view modes: Account totals, Service totals, Individual account breakdown
  - Granularity options: Hourly, Daily, Monthly, Annual
- **Security Dashboard**: Security Hub findings aggregation and analysis
  - Advanced table sorting with multiple severity levels
  - Profile-specific findings tracking with accurate mapping
  - Enhanced pagination controls with quick jumper and size changer
  - Real-time filtering by severity, workflow state, and compliance status
- **Multi-Account Support**: Manage multiple AWS profiles and accounts
- **HTTP Proxy Support**: Automatic proxy configuration when HTTP_PROXY environment variables are set
- **Real-time Filtering**: Interactive filtering and search capabilities
- **Data Export**: Export reports in HTML, PDF, and Excel formats
- **Cross-Platform Desktop App**: Electron-based desktop application for macOS, Windows, and Linux
- **Responsive Design**: Mobile-friendly interface using Ant Design
- **Configuration Management**: Web-based configuration for AWS profiles and settings
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
   - Configuration will be saved to `finops-cost-report/config.yaml`

3. **Configure Security Hub:**
   - Go to Configuration → Security Configuration tab
   - Select profiles and home region for Security Hub
   - Configuration will be saved to `securityhub/config.yaml`

### Generating Reports

#### Cost Reports
1. Navigate to "Cost Reports" page
2. Select AWS profiles, date range, and services (optional)
3. Choose granularity (Hourly/Daily/Monthly/Annual)
4. **Service Filtering:**
   - Leave services empty to show all AWS services
   - Select specific services to show only those + "Other" category
   - "Other" aggregates costs from all unselected services
5. Click "Generate Report"
6. **Enhanced Table Features:**
   - Sort by service name, account name, or total cost (descending by default)
   - Customize page size and navigate through large datasets
   - View multiple perspectives: Account totals, Service totals, Individual account breakdown
   - Fixed total rows show aggregate costs at the bottom of each table
7. Export data as HTML, PDF, or Excel formats

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

The application creates and manages YAML configuration files:

- `finops-cost-report/config.yaml` - Cost reporting configuration
- `securityhub/config.yaml` - Security Hub configuration

These files are automatically created when you save configurations through the web interface.

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
   - The application automatically creates necessary directories
   - Ensure the application has write permissions to the project directory

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

## Migration from Python Scripts

This application replaces the existing Python scripts:
- `aws_cost_report.py` → Cost Reports dashboard
- `securityhub_dashboard.py` → Security Hub dashboard

Configuration files are compatible with the existing YAML format.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review AWS credentials and permissions
3. Check the browser console for error messages
4. Verify AWS services are enabled in your account