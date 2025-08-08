# AWS Solutions Suite

Welcome to this comprehensive collection of AWS tools and solutions designed to help you manage, monitor, and optimize your AWS infrastructure. This repository contains multiple independent projects that address common AWS operational challenges.

## 🌟 Featured Projects

### 💰 [FinOps Cost Report Generator](./finops-cost-report/)
**Python-based AWS cost analysis and reporting tool**
- Comprehensive cost reports using AWS Cost Explorer API
- Multi-account support with service-level filtering
- Both Markdown and interactive HTML output formats
- Time period flexibility (daily/monthly reporting)
- Cost exclusions for taxes and support charges

### 🔐 [Security Hub Dashboard](./securityhub/)
**Interactive security findings visualization**
- HTML dashboard displaying Security Hub findings by account and region
- Severity-based color coding and interactive charts
- Cross-account security posture overview
- Responsive design for desktop and mobile

### 🧹 [Security Hub Cleaner](./securityhub-cleaner/)
**Automated Security Hub findings management**
- Bulk update Security Hub findings workflow status
- Flexible filtering by product, title, severity, compliance status
- Dry-run mode for safe testing before live updates
- Multi-account batch processing capabilities

### 📡 [CloudTrail Notifications](./cloudtrail-notifications/)
**Real-time AWS activity monitoring and alerting**
- Lambda-based CloudTrail log analysis using Athena
- Slack and email notifications for security events
- Automated Athena table partitioning for account management

### 🏢 [Organizations Operator Framework](./organizations-operator-framework/)
**AWS Organizations management automation**
- Cross-account IAM role deployment via CloudFormation StackSets
- Step Functions-based SecurityHub inventory management
- SAM template for serverless deployment
- Multi-account operations orchestration

## 🚀 Quick Start

Each project is self-contained with its own documentation. Choose the tools that best fit your needs:

| Tool | Use Case | Technology | Complexity |
|------|----------|------------|------------|
| **FinOps Cost Report** | Cost analysis & optimization | Python, boto3 | ⭐⭐ |
| **Security Hub Dashboard** | Security posture visualization | Python, HTML/JS | ⭐⭐ |
| **Security Hub Cleaner** | Findings management automation | Python, boto3 | ⭐ |
| **CloudTrail Notifications** | Activity monitoring & alerts | Lambda, Athena | ⭐⭐⭐ |
| **Organizations Framework** | Multi-account automation | CloudFormation, Step Functions | ⭐⭐⭐ |

## 📋 Prerequisites

### Common Requirements
- AWS CLI configured with appropriate profiles
- AWS credentials with necessary permissions (detailed in each project)
- Python 3.6+ (for Python-based tools)

### AWS Permissions
Each tool requires specific AWS permissions. Refer to individual project documentation for detailed IAM policy requirements.

## 🤝 Contributing

These tools are designed to be practical solutions for real AWS operational challenges. Feel free to:
- Report issues or suggest improvements
- Adapt the tools to your specific requirements
- Share your use cases and feedback

## 📚 Documentation

Each project includes comprehensive documentation:
- Detailed setup and configuration instructions
- Usage examples and best practices
- AWS permissions requirements
- Troubleshooting guides

## 🔗 Related Resources

- **LAWS Meetup**: [Security presentation](https://youtu.be/Btg3UqJvhB4) featuring CloudTrail notifications
- **Medium Article**: [AWS Organizations operator framework](https://medium.com/aws-tip/aws-organization-operator-framework-f53d43310d2c)

---

*Choose the right tool for your AWS operational needs and start optimizing your cloud infrastructure today!*