# Organizations Operator Framework

**AWS Organizations management automation and multi-account operations orchestration**

A comprehensive framework for managing AWS Organizations at scale with automated cross-account operations, IAM role deployment, and Security Hub inventory management.

## 📋 Related Resources

- **Medium Article**: [AWS Organizations operator framework](https://medium.com/aws-tip/aws-organization-operator-framework-f53d43310d2c) - Detailed implementation guide

## 🏗️ Architecture Components

### IAM Roles (`roles/`)
**Cross-account access management for Organizations**

#### cross-account-roles.yml
- **Purpose**: Enable cross-account operations across the entire Organization
- **Deployment**: 
  - Deploy via CloudFormation Stack in the **Organization management account**
  - Deploy via CloudFormation StackSet in **all member accounts**
- **Functionality**: Provides standardized cross-account access patterns

#### operations-roles.yml  
- **Purpose**: Establish operational access in the dedicated operations account
- **Deployment**: Deploy in the **operations account** 
- **⚠️ IMPORTANT**: Must be deployed **FIRST** before other components
- **Functionality**: Foundation roles for centralized operations management

### Step Functions Orchestration (`step machine/`)
**SecurityHub inventory management with serverless orchestration**

**Deployment Options:**
- ✅ **AWS SAM** (included template)
- ✅ **Serverless Framework** 
- ✅ **Terraform**
- ✅ **CloudFormation**

**Components:**
- `template.yaml` - SAM template for complete deployment
- `samconfig.toml.template` - Configuration template for environment-specific settings

#### Lambda Functions (`src/`)

##### organization-fanout/
- **Purpose**: Distribute operations across Organization member accounts
- **Function**: Fan-out pattern for parallel multi-account processing
- **Use Case**: Trigger simultaneous operations across all accounts

##### securityhub-crawler/ 
- **Purpose**: Collect SecurityHub findings across member accounts
- **Function**: Aggregate security data from multiple regions and accounts
- **Use Case**: Centralized security posture assessment

##### securityhub-export/
- **Purpose**: Export and format SecurityHub data for reporting
- **Function**: Transform raw findings into consumable reports
- **Dependencies**: `requirements.txt` - Python dependencies for data processing
- **Use Case**: Generate security compliance reports

## 🚀 Features

- **Multi-Account Orchestration**: Coordinate operations across entire AWS Organization
- **Automated Role Deployment**: Standardized IAM roles via StackSets
- **Security Hub Automation**: Automated security findings collection and reporting
- **Serverless Architecture**: Cost-effective Lambda and Step Functions implementation
- **Flexible Deployment**: Multiple IaC options (SAM, Serverless, Terraform)

## 📋 Prerequisites

- AWS Organizations enabled with management account access
- CloudFormation StackSets enabled for multi-account deployment
- Security Hub enabled across target accounts and regions
- AWS Lambda and Step Functions access
- Appropriate IAM permissions for cross-account operations

## 🔐 Deployment Order

1. **Operations Account Setup**
   ```bash
   # Deploy foundation roles FIRST
   aws cloudformation create-stack \
     --stack-name operations-roles \
     --template-body file://roles/operations-roles.yml \
     --capabilities CAPABILITY_IAM
   ```

2. **Organization-wide Role Deployment**
   ```bash
   # Deploy to management account
   aws cloudformation create-stack \
     --stack-name cross-account-roles \
     --template-body file://roles/cross-account-roles.yml \
     --capabilities CAPABILITY_IAM
   
   # Deploy to all member accounts via StackSet
   aws cloudformation create-stack-set \
     --stack-set-name cross-account-roles \
     --template-body file://roles/cross-account-roles.yml \
     --capabilities CAPABILITY_IAM
   ```

3. **Step Functions Deployment**
   ```bash
   # Using SAM
   sam build
   sam deploy --guided
   
   # Or using your preferred IaC tool
   ```

## 🔐 AWS Permissions Required

- **Organizations**: Full access for management account operations
- **CloudFormation**: StackSet creation and management
- **IAM**: Role creation and cross-account trust relationships
- **Lambda**: Function creation and execution
- **Step Functions**: State machine creation and execution
- **SecurityHub**: Cross-account findings access

## 📚 Use Cases

- **Security Compliance**: Automated security posture assessment across all accounts
- **Operational Governance**: Standardized operational patterns for large Organizations
- **Cost Management**: Centralized billing and cost analysis coordination
- **Audit and Reporting**: Automated compliance reporting across the Organization

---

*Part of the [AWS Solutions Suite](../README.md) - Comprehensive AWS operational tools*