# AWS Security Hub Dashboard

This tool generates an interactive HTML dashboard that displays AWS Security Hub findings organized by account, region, and severity levels.

## Features

- **Per-Account Tables**: Shows findings breakdown by region and severity for each AWS account
- **Global Summary**: Consolidated view of all findings across accounts
- **Interactive Charts**: Visual representations using Chart.js
- **Severity-Based Coloring**: Color-coded tables based on finding severity
- **Responsive Design**: Works on desktop and mobile devices

## Requirements

- Python 3.6+
- boto3
- PyYAML
- AWS credentials configured for each profile
- Security Hub enabled in target regions

## Installation

```bash
pip install boto3 PyYAML
```

## Configuration

Create a `config.yaml` file with your AWS profiles and home region:

```yaml
report_name: "securityhub-dashboard"

home_region: "us-east-1"

profiles:
  - dev
  - staging
  - production
```

## Usage

```bash
python securityhub_dashboard.py config.yaml
```

## Output

The script generates an HTML dashboard in the `reports/` directory with:

- Findings tables per account showing breakdown by region and severity
- Global summary table showing findings per account
- Interactive charts for data visualization
- Severity levels: CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL

## AWS Permissions

Ensure your AWS profiles have the following permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "securityhub:GetFindings"
            ],
            "Resource": "*"
        }
    ]
}
```

## Notes

- Only active findings with "NEW" workflow state are included
- Findings are retrieved from the home region (where Security Hub aggregates findings)
- Tables are organized by the actual region where findings originated
- Security Hub must be enabled and configured for cross-region aggregation