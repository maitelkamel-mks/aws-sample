# Organization Operator Framework

Related article : [AWS Organizations operator framework](https://medium.com/aws-tip/aws-organization-operator-framework-f53d43310d2c)

## IAM roles

 - cross-account-roles : to be deployed by Cloudformation Stack in the Organization account, and by Stackset in all accounts of the Organization
 - operations-roles : to be deployed in the operations account. MUST BE DEPLOYED FIRST

## Step machine

Here an example of a SecurityHub inventory with a SAM template. But it can also be deployed by Serverless framework or Terraform.