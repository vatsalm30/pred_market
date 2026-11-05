#!/usr/bin/env bash
# Deploy the AWS half of the backend (DynamoDB, scheduler, ping Lambda).
#
# Required env: CRON_SECRET (same value as in Vercel)
# Optional env: AWS_REGION (default us-east-1), SITE_URL
set -euo pipefail

cd "$(dirname "$0")/.."

: "${CRON_SECRET:?set CRON_SECRET (same value as in Vercel)}"

aws cloudformation deploy \
  --region "${AWS_REGION:-us-east-1}" \
  --stack-name omnipred \
  --template-file aws/template.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    SiteUrl="${SITE_URL:-https://www.omnipred.com}" \
    CronSecret="$CRON_SECRET"

aws cloudformation describe-stacks --region "${AWS_REGION:-us-east-1}" --stack-name omnipred \
  --query 'Stacks[0].Outputs' --output table
