import boto3
import os
from athena_from_s3 import AthenaHelper


s3_location_bucket = os.environ
s3_location_prefix = "AWSLogs/"
s3_location = f"s3://{s3_location_bucket}/{s3_location_prefix}"
s3_query_results_bucket = os.environ["s3_query_results_bucket"]
s3_query_results_prefix = "temp/athena/output"
isorg = True

def lambda_handler(event, context):
    regions = get_regions()
    accounts = list_account_partition()
    query = generate_table_query(accounts, regions)
    update_table_query(query)


def get_regions():
    account_client = boto3.client('account')

    regions = []

    paginator = account_client.get_paginator('list_regions')

    for page in paginator.paginate():
        for region in page['Regions']:
            regions.append(region['RegionName'])

    return regions

def list_account_partition():
    s3_client = boto3.client('s3')
    
    accounts_list = []

    response = s3_client.list_objects_v2(
        Bucket=s3_location_bucket,
        Prefix=s3_location_prefix,
        Delimiter='/'
    )

    account_index = 2 if isorg else 1

    for prefix in response["CommonPrefixes"]:
        account = prefix['Prefix'].split('/')[account_index]
        accounts_list.append(account)

    return accounts_list

def generate_table_query(accounts, regions):
  query = f'CREATE EXTERNAL TABLE cloudtrail_logs ( \n\
        eventversion string, \n\
        useridentity struct<type:string,principalid:string,arn:string,accountid:string,invokedby:string,accesskeyid:string,username:string,sessioncontext:struct<attributes:struct<mfaauthenticated:string,creationdate:string>,sessionissuer:struct<type:string,principalid:string,arn:string,accountid:string,username:string>>>, \n\
        eventtime string, \n\
        eventsource string, \n\
        eventname string, \n\
        awsregion string, \n\
        sourceipaddress string, \n\
        useragent string, \n\
        errorcode string, \n\
        errormessage string, \n\
        requestparameters string, \n\
        responseelements string, \n\
        additionaleventdata string, \n\
        requestid string, \n\
        eventid string, \n\
        resources array<struct<arn:string,accountid:string,type:string>>, \n\
        eventtype string, \n\
        apiversion string, \n\
        readonly string, \n\
        recipientaccountid string, \n\
        serviceeventdetails string, \n\
        sharedeventid string, \n\
        vpcendpointid string) \n\
    PARTITIONED BY ( \n\
        account string, \n\
        region string, \n\
        timestamp string) \n\
    ROW FORMAT SERDE \'com.amazon.emr.hive.serde.CloudTrailSerde\' \n\
    STORED AS INPUTFORMAT \'com.amazon.emr.cloudtrail.CloudTrailInputFormat\' \n\
    OUTPUTFORMAT \'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat\' \n\
    LOCATION \'{s3_location}\' \n\
    TBLPROPERTIES ( \n\
        \'projection.account.type\'=\'enum\', \n\
        \'projection.account.values\'=\'{",".join(accounts)}\', \n\
        \'projection.enabled\'=\'true\', \n\
        \'projection.region.type\'=\'enum\', \n\
        \'projection.region.values\'=\'{",".join(regions)}\', \n\
        \'projection.timestamp.format\'=\'yyyy/MM/dd\', \n\
        \'projection.timestamp.interval\'=\'1\', \n\
        \'projection.timestamp.interval.unit\'=\'DAYS\', \n\
        \'projection.timestamp.range\'=\'2020/01/01,NOW\', \n\
        \'projection.timestamp.type\'=\'date\', \n\
        \'storage.location.template\'=\'{s3_location}${{account}}/CloudTrail/${{region}}/${{timestamp}}\' \n\
    )'
  
  return query

def update_table_query(query):
    session = boto3.Session()
    athena_helper = AthenaHelper()

    ## DROP TABLE
    print("Dropping table")
    params = {
        "region": "eu-west-1",
        "database": "default",
        "bucket": s3_query_results_bucket,
        "path": s3_query_results_prefix,
        "query": "DROP TABLE cloudtrail_logs",
    }
    athena_helper.query_results(session, params)

    ## CREATE TABLE
    print("Creating table")
    params["query"] = query
    athena_helper.query_results(session, params)


if __name__ == "__main__":
    lambda_handler(None, None)