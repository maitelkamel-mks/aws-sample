import boto3
import datetime
import json
import os
import urllib3
from athena_from_s3 import AthenaHelper

def lambda_handler(event, context):

    print("1) Query cloudtrail")

    athena_helper = AthenaHelper()

    today = datetime.date.today()
    yesterday = today - datetime.timedelta(days=1)

    params = {
        "region": "eu-west-1",
        "database": "default",
        "bucket": os.environ["s3_query_results_bucket"],
        "path": "temp/athena/output",
        "query": f'select eventtime, \
                useridentity.arn as user \
                account, \
                region, \
                eventsource, \
                eventname \
                FROM "default"."cloudtrail_logs" \
                WHERE "timestamp" = \'{yesterday.strftime("%Y/%m/%d")}\' \
                    AND (lower(eventName) like \'%delete%\' OR lower(eventName) like \'%remove%\') \
                order by eventtime',
    }

    session = boto3.Session()

    ## Fucntion for obtaining query results and location
    location, data = athena_helper.query_results(session, params)

    if data != None and data is not False:
        send_email(data)
        send_slack_notification(data)


def send_email(data):

    ses = boto3.client('ses')

    sender = os.environ["email_sender"]
    recipients = [ os.environ["email_recipient"] ]

    html, txt = build_email_content(data)

    print("--------------------------------------------------")
    print(f"HTML: {html}")
    print("--------------------------------------------------")
    print(f"TXT: {txt}")
    print("--------------------------------------------------")

    response = ses.send_email(
        Source=sender,
        Destination={'ToAddresses': recipients},
        Message={
            'Subject': {
                'Data': "AWS - Resource deletion report",
                'Charset': 'UTF-8'
            },
            'Body': {
                'Html': {
                    'Data': html,
                    'Charset': 'UTF-8'
                },
                'Text': {
                    'Data': txt,
                    'Charset': 'UTF-8'
                }
            }
        }
    )

    print(response)

def build_email_content(data):
    html = f"<html><body><h1>AWS - Resource deletion report</h1><p>Hi,</p><p>Here are deletion actions done yesterday:</p><table border=\"1\" style=\"border-collapse : collapse; border: 2px solid; \"><tr><th>Event time</th><th>User</th><th>Account</th><th>Region</th><th>Event source</th><th>Event name</th></tr></thead><tbody>"
    txt = f"AWS - Resource deletion report\n\nHi,\n\nHere are deletion actions done yesterday:\n\n"
    
    for result in data:
        event_time = result["eventtime"]
        user = result["user"]
        account_id = result["account"]
        region = result["region"]
        event_source = result["eventsource"]
        event_name = result["eventname"]

        html += f"<tr><td>{event_time}</td><td>{user}</td><td>{account_id}</td><td>{region}</td><td>{event_source}</td><td>{event_name}</td></tr>"
        txt += f"{event_time} - {user} - {account_id} - {region} - {event_source} - {event_name}\n"

    html += "<tbody></table></body></html>"

    return html, txt


def send_slack_notification(data):

    for result in data:
        event_time = result["eventtime"]
        user = result["user"]
        account_id = result["account"]
        region = result["region"]
        event_source = result["eventsource"]
        event_name = result["eventname"]

        text = f"{event_time} | Resource deletion alert : {user} deleted a resource in {region} in the account {account_id} with the event {event_source}/{event_name}"

        post_message_to_slack(text)

def post_message_to_slack(text,):

    http = urllib3.PoolManager()

    body = {"channel": os.environ["slack_channel"], "text": text}

    response = http.request(
        "POST",
        os.environ["slack_webhook"],
        body=json.dumps(body),
        headers={"Content-Type": "application/json"},
    )

    print(response.data)