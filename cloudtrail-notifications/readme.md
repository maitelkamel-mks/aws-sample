# Cloudtrail notifications

Related media : [LAWS Meetup #32 - Sécurité](https://youtu.be/Btg3UqJvhB4)

## cloudtrail-alert folder

This lambda query the Cloudtrail logs with Athena and send notifications via slack and email.

## cloudtrail-athena-updater

This lambda update the related Athena table with an up-to-date account partition.