import os
import uuid
import boto3

account_id = os.environ['ORGANIZATION_ACCOUNT_ID']
operated_regions = os.environ['OPERATED_REGIONS'].split(',')

def lambda_handler(event, context):

    session = assume_role(account_id)
    
    organizations = session.client("organizations", region_name='us-east-1')
    result = fetch_organization_accounts(organizations)
   
    return result

def fetch_organization_accounts(organizations):
    result = {
        "AccountRegions" : []
    }

    paginator = organizations.get_paginator('list_accounts')

    for page in paginator.paginate():
        for account in page['Accounts']:

            account_id = account['Id']
            account_name = account['Name']
            account_status = account['Status']

            for region in operated_regions:
                result['AccountRegions'].append({
                    "accountId" : account_id,
                    "accountName" : account_name,
                    "accountStatus" : account_status,
                    "region" : region
                })

    return result

##########################
### Session management ###
##########################
def assume_role(account_id):
    client = boto3.client("sts")

    response = client.assume_role(
        RoleArn=f'arn:aws:iam::{account_id}:role/operation-readonly',
        RoleSessionName=str(uuid.uuid4()),
    )

    return boto3.Session(
        aws_access_key_id=response["Credentials"]["AccessKeyId"],
        aws_secret_access_key=response["Credentials"]["SecretAccessKey"],
        aws_session_token=response["Credentials"]["SessionToken"],
    )

##############################
### END Session management ###
##############################