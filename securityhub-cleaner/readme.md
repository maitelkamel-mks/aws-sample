# AWS Security Hub Cleaner

This tool updates the workflow status of AWS Security Hub findings based on configurable search parameters. It supports multiple search criteria and includes a dry-run mode for safe testing.

## Features

- **Multiple Search Criteria**: Define multiple search parameters to target specific findings
- **Flexible Filtering**: Filter by product name, title, compliance status, severity, region, etc.
- **Dry Run Mode**: Test your configuration without making actual changes
- **Batch Updates**: Efficiently updates findings in batches
- **Cross-Account Support**: Process multiple AWS profiles
- **Detailed Reporting**: Shows what findings would be/were updated

## Requirements

- Python 3.6+
- boto3
- PyYAML
- AWS credentials configured for each profile
- Security Hub enabled in the home region

## Installation

```bash
pip install boto3 PyYAML
```

## Configuration

Create a `config.yaml` file with your search parameters:

```yaml
# Security Hub home region (where findings are aggregated)
home_region: "us-east-1"

# AWS profiles to process
profiles:
  - dev
  - staging
  - production

# New workflow status to apply
new_workflow_status: "SUPPRESSED"

# Search parameters
findings_search_parameters:
  - description: "Patch Manager findings"
    workflow_status: "NEW"
    product_name: "Patch Manager"
    
  - description: "S3 MFA delete findings"
    workflow_status: "NEW"
    title: "S3 general purpose buckets should have MFA delete enabled"
```

### Supported Search Parameters

- `workflow_status`: Current workflow status (NEW, NOTIFIED, RESOLVED, SUPPRESSED)
- `product_name`: AWS service or tool that generated the finding
- `title`: Exact title of the finding
- `compliance_status`: Compliance status (PASSED, WARNING, FAILED, NOT_AVAILABLE)
- `severity`: Severity level (CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL)
- `region`: AWS region where the finding originated
- `generator_id`: Specific rule or check identifier

## Usage

### Dry Run (Recommended First)
```bash
python securityhub_cleaner.py --dry-run
```

### Live Run
```bash
python securityhub_cleaner.py
```

### Custom Config File
```bash
python securityhub_cleaner.py custom_config.yaml --dry-run
```

## Output

The script provides detailed output showing:
- Which search parameters are being processed
- How many findings match each criteria
- Success/failure status of updates
- Summary statistics

Example output:
```
🔍 Running in DRY RUN mode - no changes will be made

📋 Processing profile: prod

  Processing: Patch Manager findings
    Filters: {'RecordState': [{'Value': 'ACTIVE', 'Comparison': 'EQUALS'}], 'WorkflowStatus': [{'Value': 'NEW', 'Comparison': 'EQUALS'}], 'ProductName': [{'Value': 'Patch Manager', 'Comparison': 'EQUALS'}]}
    Found 15 findings matching criteria
    [DRY RUN] Would update 15 findings to status: SUPPRESSED

📊 Summary:
   Total findings processed: 15
   Total findings updated: 15
   (Dry run - no actual changes made)
```

## AWS Permissions

Ensure your AWS profiles have the following permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "securityhub:GetFindings",
                "securityhub:BatchUpdateFindings"
            ],
            "Resource": "*"
        }
    ]
}
```

## Best Practices

1. **Always test with dry-run first** to verify your search parameters
2. **Start with specific filters** to avoid unintended bulk updates
3. **Use descriptive names** for your search parameters
4. **Monitor the output** to ensure expected results
5. **Keep backups** of your configuration files

## Notes

- Findings are retrieved from the home region where Security Hub aggregates findings
- The tool processes findings in batches for efficiency
- Failed updates are reported with details
- Only ACTIVE findings are processed (archived findings are ignored)