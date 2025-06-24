# AWS Reports Web Application

A modern Next.js web application for AWS cost reporting and Security Hub dashboard functionality, replacing the existing Python scripts with a unified, full-stack TypeScript solution.

## Features

- **Cost Reporting**: Interactive AWS cost analysis with Cost Explorer API integration
- **Security Dashboard**: Security Hub findings aggregation and analysis
- **Multi-Account Support**: Manage multiple AWS profiles and accounts
- **Real-time Filtering**: Interactive filtering and search capabilities
- **Data Export**: Export reports in CSV and JSON formats
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

## Installation

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

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Initial Setup

1. **Configure AWS Profiles:**
   - Go to Configuration → AWS Profiles tab
   - Your configured AWS profiles will be automatically detected
   - Ensure profiles have necessary permissions

2. **Configure Cost Reporting:**
   - Go to Configuration → Cost Configuration tab
   - Set up report preferences, profiles, and date ranges
   - Configuration will be saved to `finops-cost-report/config.yaml`

3. **Configure Security Hub:**
   - Go to Configuration → Security Configuration tab
   - Select profiles and home region for Security Hub
   - Configuration will be saved to `securityhub/config.yaml`

### Generating Reports

#### Cost Reports
1. Navigate to "Cost Reports" page
2. Select AWS profiles and date range
3. Choose granularity (Daily/Monthly)
4. Click "Generate Report"
5. Export data as CSV or JSON if needed

#### Security Dashboard
1. Navigate to "Security Hub" page
2. Select AWS profiles and regions
3. Click "Refresh Findings"
4. Use filters to narrow down results by severity, status, or compliance

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
- `GET /api/health` - Health check

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

2. **Docker Container:**
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