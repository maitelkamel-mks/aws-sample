# AWS Cost Report Generator

A Python script that generates comprehensive AWS cost reports using the AWS Cost Explorer API. The tool creates detailed reports showing cost breakdowns by service, account, and time period with support for both Markdown and HTML output formats.

## Features

- **Multi-account support**: Generate reports across multiple AWS profiles
- **Service filtering**: Focus on specific AWS services or show all services
- **Time period flexibility**: Support for daily or monthly reporting periods
- **Multiple output formats**: Generate reports in Markdown, HTML, or both
- **Interactive HTML reports**: HTML reports include sortable tables and interactive charts
- **Cost exclusions**: Option to exclude taxes and support costs
- **Sorting options**: Sort by service name or total cost

## Prerequisites

- Python 3.6+
- AWS CLI configured with appropriate profiles
- Required Python packages:
  - `boto3`
  - `pyyaml`

## Installation

1. Clone or download the script
2. Install required dependencies:
```bash
pip install boto3 pyyaml
```
3. Ensure your AWS CLI is configured with the necessary profiles

## Usage

```bash
python aws_cost_report.py <config_file>
```

Example:
```bash
python aws_cost_report.py config.yaml
```

## Configuration

The tool uses a YAML configuration file to specify report parameters. Below are all available configuration options:

### Basic Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `report_name` | string | Yes | Base name for generated report files |
| `report_format` | string | Yes | Output format: "markdown", "html", or "both" |
| `sort_by` | string | Yes | Sort order: "name" or "total_cost" |

### AWS Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `profiles` | list | Yes | List of AWS profile names to include in the report |
| `services` | list | Yes | List of AWS service names to include. Use empty list `[]` to show all services |

### Time Period Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | string | Yes | Report start date in YYYY-MM-DD format |
| `end_date` | string | Yes | Report end date in YYYY-MM-DD format (exclusive) |
| `period` | string | Yes | Reporting granularity: "daily" or "monthly" |

### Cost Filtering

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `exclude_taxes` | boolean | No | false | Exclude tax charges from the report |
| `exclude_support` | boolean | No | false | Exclude AWS support charges from the report |

### Example Configuration

```yaml
# Basic report settings
report_name: "aws-cost-analysis"
report_format: "both"  # Options: "markdown", "html", "both"
sort_by: "total_cost"  # Options: "name", "total_cost"

# AWS profiles to include
profiles:
  - production
  - staging
  - development

# Services to include (empty list shows all services)
services:
  - Amazon Virtual Private Cloud
  - Amazon Simple Storage Service
  - AWS Lambda
  - Amazon DynamoDB
  - Amazon CloudFront

# Time period
start_date: "2025-01-01"
end_date: "2025-02-01"  # Exclusive end date
period: "monthly"  # Options: "daily", "monthly"

# Cost filtering (optional)
exclude_taxes: true
exclude_support: false
```

## Output

Reports are generated in the `reports/` directory with timestamped filenames:
- `{report_name}-{YYYYDDMM-HHMM}.md` for Markdown reports
- `{report_name}-{YYYYDDMM-HHMM}.html` for HTML reports

### Report Sections

Each report contains three main sections:

1. **Cost per service per account**: Detailed breakdown for each AWS profile
2. **Cost total per account**: Summary of costs across all services by account
3. **Cost total per service**: Summary of costs across all accounts by service

### HTML Report Features

HTML reports include additional features:
- Interactive sortable tables
- Responsive design with Bootstrap styling
- Chart.js visualizations:
  - Stacked bar charts showing costs over time
  - Pie charts showing cost distribution
- AWS-themed styling

## AWS Permissions

The script requires the following AWS permissions for each profile:
- `ce:GetCostAndUsage`

Ensure your AWS profiles have appropriate Cost Explorer permissions.

## Error Handling

The script includes comprehensive error handling for:
- Missing or invalid configuration files
- AWS authentication issues
- Cost Explorer API errors
- Invalid date formats
- Missing required configuration parameters

## Examples

### Monthly Report for Specific Services
```yaml
report_name: "monthly-core-services"
report_format: "html"
sort_by: "total_cost"
profiles:
  - production
services:
  - Amazon EC2-Instance
  - Amazon Simple Storage Service
  - Amazon RDS Service
start_date: "2025-01-01"
end_date: "2025-02-01"
period: "monthly"
exclude_taxes: true
exclude_support: true
```

### Daily Report for All Services
```yaml
report_name: "daily-all-services"
report_format: "both"
sort_by: "name"
profiles:
  - production
  - staging
services: []  # Empty list shows all services
start_date: "2025-01-01"
end_date: "2025-01-08"
period: "daily"
exclude_taxes: false
exclude_support: false
```

## AWS Service Names Reference

Common AWS service names for the `services` configuration:

- AWS AppSync
- AWS Backup
- AWS CloudFormation
- AWS CloudTrail
- AWS Config
- AWS Glue
- AWS Key Management Service
- AWS Lambda
- AWS Secrets Manager
- AWS Security Hub
- AWS Service Catalog
- AWS Step Functions
- AWS Support (Developer)
- AWS Support (Business)
- AWS Support (Enterprise)
- AWS Systems Manager
- AWS Transfer Family
- AWS WAF
- AWS X-Ray
- Amazon API Gateway
- Amazon CloudFront
- Amazon Cognito
- Amazon DynamoDB
- Amazon ElastiCache
- Amazon Elastic Compute Cloud - Compute
- Amazon Elastic File System
- Amazon Elastic Load Balancing
- Amazon Glacier
- Amazon GuardDuty
- Amazon Inspector
- Amazon Kinesis Firehose
- Amazon Location Service
- Amazon OpenSearch Service
- Amazon Relational Database Service
- Amazon Route 53
- Amazon Simple Email Service
- Amazon Simple Notification Service
- Amazon Simple Queue Service
- Amazon Simple Storage Service
- Amazon SimpleDB
- Amazon Virtual Private Cloud
- AmazonCloudWatch
- CloudWatch Events
- EC2 - Other
- Tax