# CloudTrail Notifications

**Real-time AWS activity monitoring and alerting system**

Monitor AWS account activity through CloudTrail logs using Athena queries and receive notifications via Slack and email for security-relevant events.

## 📋 Related Resources

- **LAWS Meetup**: [Security presentation](https://youtu.be/Btg3UqJvhB4) - CloudTrail security monitoring implementation

## 🔧 Components

### cloudtrail-alert/
**Lambda function for CloudTrail log analysis and alerting**
- Queries CloudTrail logs stored in S3 using Amazon Athena
- Analyzes logs for suspicious or security-relevant activities  
- Sends real-time notifications via Slack and email
- Configurable alert rules and thresholds

**Files:**
- `cloudtrail-alert-delete-resource-report.py` - Main Lambda function for resource deletion monitoring
- `athena_from_s3.py` - Athena query utilities for S3-based CloudTrail logs

### cloudtrail-athena-updater/
**Lambda function for Athena table maintenance**
- Automatically updates Athena table partitions with new account data
- Ensures CloudTrail log queries remain current and performant
- Maintains proper table structure for multi-account environments

**Files:**
- `cloudtrail-athena-updater.py` - Main Lambda function for partition management
- `athena_from_s3.py` - Shared Athena utilities

## 🚀 Features

- **Real-time Monitoring**: Continuous analysis of CloudTrail events
- **Multi-Account Support**: Monitor activity across multiple AWS accounts
- **Flexible Alerting**: Configure custom alert rules and notification channels
- **Automated Maintenance**: Self-maintaining Athena table partitions
- **Scalable Architecture**: Lambda-based for cost-effective scaling

## 📋 Prerequisites

- AWS Lambda deployment capabilities
- CloudTrail enabled and logging to S3
- Amazon Athena access for log querying
- Slack webhook or email configuration for notifications
- Appropriate IAM permissions for Lambda functions

## 🔐 AWS Permissions Required

The Lambda functions require permissions for:
- **Athena**: Query execution and result access
- **S3**: Read access to CloudTrail logs
- **CloudTrail**: Read access to trail configurations
- **SNS/SES**: For email notifications (if configured)

## 📚 Usage

Deploy the Lambda functions using your preferred method:
- AWS SAM
- Serverless Framework  
- CloudFormation
- Terraform

Configure alerting rules and notification endpoints according to your security monitoring requirements.

---

*Part of the [AWS Solutions Suite](../README.md) - Comprehensive AWS operational tools*