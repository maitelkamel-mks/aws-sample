import boto3
import botocore
import os
import uuid
import json

def lambda_handler(event, context):

    account_id = event['accountId']
    account_name = event['accountName']
    account_status = event['accountStatus']
    region = event['region']
    
    result = {
        "accountId" : account_id,
        "accountName" : account_name,
        "accountStatus" : account_status,
        "region" : region,
        "status" : "DISABLED",
        "masterAccountId" : "",
        "standards" : "[]"
    }

    if account_status == "ACTIVE":
        try:
            session = assume_role(account_id)
            securityhub = session.client("securityhub", region_name=region)
            result = fetch_security_hub_configuration(securityhub, result)
        except Exception as e:
            if "AccessDenied" in str(e):
                result["status"] = "ACCESS_DENIED"
            else:
                raise e

    return result

def fetch_security_hub_configuration(securityhub, result):

    ## STATUS

    hub_details = None

    try:
        hub_details = securityhub.describe_hub()
    except botocore.exceptions.ClientError as err:
        print("Security hub is not enabled")
        result["status"] = "DISABLED"
        return result

    if "HubArn" in hub_details:
        result["status"] = "ENABLED"

        ## STANDARDS
        paginator = securityhub.get_paginator("get_enabled_standards")

        standards = []
        for page in paginator.paginate():
            if "StandardsSubscriptions" in page:
                for subscription in page["StandardsSubscriptions"]:
                    standard_subscription_arn = subscription["StandardsSubscriptionArn"]
                    standard_arn = subscription["StandardsArn"]
                    arn_part_1 = standard_arn.split("/")[0]
                    standard_name = standard_arn.replace(arn_part_1 + "/", "")

                    ## get number of enabled controls
                    nb_enabled_controls = 0
                    paginator2 = securityhub.get_paginator('describe_standards_controls')
                    for page2 in paginator2.paginate(StandardsSubscriptionArn=standard_subscription_arn):
                        if 'Controls' in page2:
                            for control in page2['Controls']:
                                if control['ControlStatus'] == 'ENABLED':
                                    nb_enabled_controls += 1

                    standards.append({
                        "name": standard_name,
                        "nbEnabledControls": nb_enabled_controls,
                    })
        standards.sort(key=lambda x: x["name"])
        result["standards"] = json.dumps(standards)

    ## MASTER
    master_details = securityhub.get_master_account()
    if "Master" in master_details:
        if master_details["Master"]["MemberStatus"] == "Enabled":
            result["masterAccountId"] = master_details["Master"]["AccountId"]

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