# AWS Reports Web Application - Technical Specifications

## Executive Summary

This document outlines the technical specifications for replacing the existing Python-based AWS cost reporting and Security Hub dashboard scripts with a modern, unified Next.js web application. The new application will consolidate both reporting functions into a single, full-stack TypeScript application.

## Current System Analysis

### Existing Finops Cost Report (aws_cost_report.py)
- **Purpose**: Generates AWS cost reports using Cost Explorer API
- **Output**: HTML/Markdown reports with tables and charts
- **Key Features**:
  - Multi-account cost analysis across profiles
  - Service-level cost breakdown
  - Time-period analysis (daily/monthly)
  - Interactive HTML reports with Chart.js visualizations
  - Configurable filtering (exclude taxes/support)
  - Bootstrap-styled responsive tables

### Existing Security Hub Dashboard (securityhub_dashboard.py)
- **Purpose**: Generates Security Hub findings dashboard
- **Output**: HTML dashboard with security findings analysis
- **Key Features**:
  - Multi-account security findings aggregation
  - Severity-based analysis (Critical, High, Medium, Low)
  - Regional findings distribution
  - Interactive filtering by account, region, severity, compliance status
  - Real-time table sorting and search
  - Chart.js visualizations for trends

## Technical Architecture

### Technology Stack

#### Full-Stack Framework
- **Framework**: Next.js 14+ with App Router
  - Server-side rendering and API routes in single application
  - TypeScript for type safety across frontend and backend
  - Built-in optimization for production builds
  - File-based routing and API endpoints

#### Frontend & UI
- **UI Library**: Ant Design (antd)
  - Consistent enterprise-grade components
  - Built-in table filtering, sorting, pagination
  - Responsive design system
- **Charts**: Chart.js with react-chartjs-2
- **State Management**: React Query (TanStack Query) for server state
- **Styling**: Tailwind CSS + Ant Design theme customization

#### Backend & AWS Integration
- **API Routes**: Next.js API routes for AWS service integration
- **AWS SDK**: AWS SDK for JavaScript v3
  - Modular imports for optimal bundle size
  - Built-in retry logic and error handling
- **Validation**: Zod for runtime type validation
- **Configuration**: YAML files (maintain existing format)

#### Data & Storage
- **Caching**: In-memory caching with Next.js unstable_cache
- **Session Storage**: Browser localStorage for UI preferences
- **File System**: Local file system for configuration and reports

#### Infrastructure
- **Containerization**: Single Docker container
- **Development**: Next.js dev server with hot reload
- **Production**: Standalone Next.js build

### Application Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Next.js Application                     │
│                                                         │
│  ┌─────────────────┐    ┌─────────────────┐             │
│  │   Frontend      │    │   API Routes    │             │
│  │   (React)       │◄──►│   (Next.js)     │◄────────────┼─── AWS APIs
│  │                 │    │                 │             │   - Cost Explorer
│  │ - Dashboard     │    │ - /api/cost/*   │             │   - Security Hub
│  │ - Reports       │    │ - /api/security │             │   - STS
│  │ - Config UI     │    │ - /api/config   │             │
│  └─────────────────┘    └─────────────────┘             │
│           │                       │                     │
│           │              ┌─────────────────┐             │
│           │              │  In-Memory      │             │
│           └──────────────│  Cache          │             │
│                          └─────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Next.js App Structure
```
src/
├── app/                    # App Router pages and layouts
│   ├── dashboard/         # Dashboard pages
│   ├── cost/             # Cost reporting pages
│   ├── security/         # Security hub pages
│   ├── config/           # Configuration pages
│   └── api/              # API routes
│       ├── cost/         # Cost-related endpoints
│       ├── security/     # Security-related endpoints
│       └── config/       # Configuration endpoints
├── components/           # Reusable React components
├── lib/                 # Shared utilities and services
│   ├── aws/            # AWS service integrations
│   ├── config/         # Configuration management
│   └── types/          # TypeScript type definitions
└── hooks/              # Custom React hooks
```

### 2. Configuration Management
- **YAML Processing**: Node.js fs module for reading/writing YAML files
- **Validation**: Zod schemas for runtime validation
- **File Watching**: Next.js file system events for configuration changes
- **UI Editor**: React forms with Ant Design for editing configurations

### 3. AWS Integration Layer
- **Profile Manager**: AWS SDK credential provider chain
- **Session Management**: AWS STS assume role functionality
- **Rate Limiting**: Built-in AWS SDK retry logic with exponential backoff
- **Error Handling**: Comprehensive error boundaries and API error responses

### 4. Cost Reporting Service
- **Data Fetcher**: AWS Cost Explorer SDK with async/await patterns
- **Aggregation Engine**: In-memory data processing and transformation
- **Cache Layer**: Next.js unstable_cache for request-level caching
- **Export Service**: Client-side export generation (CSV, JSON)

### 5. Security Hub Service
- **Findings Collector**: AWS Security Hub SDK with pagination support
- **Severity Processor**: Client-side filtering and categorization
- **Compliance Tracker**: Real-time compliance status calculation
- **Data Refresh**: Manual refresh triggers with loading states

### 6. Frontend Components

#### Dashboard Views
- **Overview Dashboard**: High-level metrics for both cost and security
- **Cost Dashboard**: Detailed cost analysis with interactive charts
- **Security Dashboard**: Security findings with filtering and drilling down
- **Account Comparison**: Side-by-side account analysis

#### Interactive Features
- **Real-time Filtering**: Client-side filtering with React state
- **Export Options**: Client-side export generation
- **Drill-down Navigation**: Next.js router-based navigation
- **Time Range Selection**: Ant Design date pickers
- **Responsive Design**: Tailwind CSS responsive utilities

## API Design

### Next.js API Routes

#### Configuration
- `GET /api/config/cost` - Get cost report configuration
- `PUT /api/config/cost` - Update cost report configuration
- `GET /api/config/security` - Get security hub configuration
- `PUT /api/config/security` - Update security hub configuration

#### Cost Reporting
- `GET /api/cost/data` - Get cost data with query parameters
- `POST /api/cost/refresh` - Trigger cost data refresh
- `GET /api/cost/export` - Export cost data in specified format

#### Security Hub
- `GET /api/security/findings` - Get security findings with filters
- `GET /api/security/summary` - Get security summary by account/region
- `GET /api/security/compliance` - Get compliance status overview
- `POST /api/security/refresh` - Trigger findings refresh

#### System
- `GET /api/health` - Health check endpoint
- `GET /api/aws/profiles` - List available AWS profiles
- `POST /api/aws/validate` - Validate AWS credentials

### Request/Response Patterns
All API routes return consistent JSON responses with error handling:
```typescript
type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}
```

## Data Models

### TypeScript Type Definitions

#### Cost Report Models
```typescript
// Configuration types
interface CostConfig {
  report_name: string;
  report_format: 'markdown' | 'html' | 'both';
  sort_by: 'name' | 'total_cost';
  profiles: string[];
  services: string[];
  start_date: string; // ISO date string
  end_date: string;   // ISO date string
  period: 'daily' | 'monthly';
  exclude_taxes: boolean;
  exclude_support: boolean;
}

// Data types
interface CostData {
  profile: string;
  service: string;
  period: string;
  amount: number;
  currency: string;
  dimensions?: Record<string, string>;
}

interface CostSummary {
  profile: string;
  total_cost: number;
  period_costs: Record<string, number>;
  service_costs: Record<string, number>;
}

// API response types
interface CostReport {
  id: string;
  config: CostConfig;
  generated_at: string;
  data: CostData[];
  summary: CostSummary[];
  status: 'generating' | 'completed' | 'error';
}
```

#### Security Hub Models
```typescript
// Configuration types
interface SecurityConfig {
  report_name: string;
  profiles: string[];
  home_region: string;
}

// Data types
interface SecurityFinding {
  id: string;
  account: string;
  region: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  workflow_state: 'NEW' | 'NOTIFIED' | 'RESOLVED' | 'SUPPRESSED';
  compliance_status: 'PASSED' | 'WARNING' | 'FAILED' | 'NOT_AVAILABLE';
  product_name: string;
  created_at: string;
  updated_at: string;
  description?: string;
  remediation?: string;
}

interface SecuritySummary {
  account: string;
  region: string;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  total_count: number;
  compliance_summary: Record<string, number>;
}

// Dashboard aggregation types
interface SecurityOverview {
  total_findings: number;
  by_severity: Record<string, number>;
  by_account: Record<string, number>;
  by_region: Record<string, number>;
  compliance_overview: Record<string, number>;
}
```

#### Shared Types
```typescript
// API response wrapper
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// Filter and pagination types
interface FilterParams {
  accounts?: string[];
  regions?: string[];
  severities?: string[];
  compliance_status?: string[];
  date_range?: {
    start: string;
    end: string;
  };
  search?: string;
}

interface PaginationParams {
  page: number;
  limit: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}
```

## Security Considerations

### Authentication & Authorization
- Local application - minimal authentication required
- Optional JWT tokens for session management
- AWS credentials managed through standard AWS credential chain

### Data Security
- In-memory data handling (no persistent storage of sensitive data)
- Input validation and sanitization with Zod schemas
- HTTPS enforcement in production
- Secure environment variable handling

### Privacy
- No data transmission to external services
- Local file system storage only
- Client-side data processing where possible
- Configurable data retention policies

## Performance Requirements

### Response Times
- Dashboard load: < 2 seconds
- Cost report generation: < 30 seconds for 12 months of data
- Security findings refresh: < 15 seconds per account
- Interactive filtering: < 500ms

### Scalability
- Support up to 50 AWS accounts
- Handle 10,000+ security findings
- 12 months of cost data across all services
- Optimistic UI updates for better perceived performance

### Caching Strategy
- Next.js unstable_cache for AWS API responses
- Browser-level caching for static assets
- Client-side state management for UI interactions
- Configurable cache TTL based on data type:
  - Cost Explorer data: 1-hour TTL
  - Security Hub findings: 15-minute TTL
  - Configuration data: No cache (immediate updates)

## Development Environment

### Local Development Setup
```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Docker development
docker build -t aws-reports-app .
docker run -p 3000:3000 aws-reports-app
```

### Project Dependencies
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@aws-sdk/client-cost-explorer": "^3.0.0",
    "@aws-sdk/client-securityhub": "^3.0.0",
    "@aws-sdk/client-sts": "^3.0.0",
    "antd": "^5.0.0",
    "chart.js": "^4.0.0",
    "react-chartjs-2": "^5.0.0",
    "@tanstack/react-query": "^5.0.0",
    "zod": "^3.0.0",
    "yaml": "^2.0.0",
    "tailwindcss": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "@testing-library/react": "^14.0.0",
    "playwright": "^1.0.0"
  }
}
```

### Testing Strategy
- **Unit Tests**: Jest + React Testing Library
- **Integration Tests**: Jest for API route testing
- **E2E Tests**: Playwright for full user workflows
- **Type Checking**: TypeScript strict mode

## Deployment Options

### Local Development
- Single Next.js application with built-in dev server
- Hot reload for both frontend and API routes
- Environment variables for AWS configuration

### Production Deployment
- Standalone Next.js build
- Single Docker container
- Environment-based configuration
- Automated configuration backups

## Migration Strategy

### Phase 1: Core Infrastructure
- Setup FastAPI backend with basic AWS integration
- Create React frontend with routing and layout
- Implement configuration management

### Phase 2: Cost Reporting
- Migrate cost reporting functionality
- Implement caching and optimization
- Create interactive cost dashboard

### Phase 3: Security Hub
- Migrate security hub functionality
- Add real-time updates
- Implement advanced filtering

### Phase 4: Enhancement
- Add advanced visualizations
- Implement export features
- Performance optimization

## Maintenance & Monitoring

### Logging
- Structured logging with correlation IDs
- AWS API call logging with rate limit tracking
- Performance metrics collection

### Monitoring
- Health check endpoints
- Prometheus metrics export
- Error tracking and alerting

### Updates
- Dependency vulnerability scanning
- Automated security updates
- Configuration backup and restore

## Success Metrics

### User Experience
- 90% reduction in report generation time
- 100% feature parity with existing scripts
- Responsive design across all devices

### Technical Metrics
- 99% uptime for local application
- < 1% error rate for AWS API calls
- 50% reduction in resource usage through caching

### Business Value
- Real-time cost and security visibility
- Improved decision-making through interactive dashboards
- Reduced maintenance overhead