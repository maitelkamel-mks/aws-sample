import boto3
import os
import pandas
import uuid

bucket_name = os.environ['BUCKET_NAME']
table_name = os.environ['TABLE_NAME']

def lambda_handler(event, context):

    data = load_data()
    filepath, filename = create_file(data)
    presigned_url = upload_to_s3(filepath, filename)

    return {"presigned_url" : presigned_url }

## load data ##
def load_data():
    dynamodb = boto3.client('dynamodb')
    paginator = dynamodb.get_paginator('scan')

    data = []

    for page in paginator.paginate(TableName=table_name):
        for item in page['Items']:
            data.append(convert_to_json(item))

    data = sorted(data, key=lambda k: (k["accountId"], k["region"]))

    return data

def convert_to_json(item):
    return {
        "accountId": item["accountId"]["S"],
        "region": item["region"]["S"],
        "accountStatus": item["accountStatus"]["S"],
        "status": item["status"]["S"],
        "masterAccountId": item["masterAccountId"]["S"],
        "standards": item["standards"]["S"],
    }

## create file ##
def create_file(data):
    filename = str(uuid.uuid4()) + '.csv'
    filepath = f'/tmp/{filename}'
    dataframe = pandas.DataFrame(data = data)
    dataframe.to_csv(
        filepath,
        columns=['accountId', 'region', 'accountStatus', 'status', 'masterAccountId', 'standards']
    )
    return filepath, filename


## export to s3 ##
def upload_to_s3(filepath, filename):
    s3resource = boto3.resource('s3')
    s3client = boto3.client('s3')
    try:
        s3key = 'reporting/accesskeys/' + filename
        s3resource.meta.client.upload_file(
            filepath,
            bucket_name,
            s3key
        )
        presigned_url = s3client.generate_presigned_url(
             ClientMethod = 'get_object',
             Params = {
                 'Bucket': bucket_name,
                 'Key': s3key
             },
             ExpiresIn = 129600
        )
    except:
        raise
    return presigned_url