#!/usr/bin/env bash
# Deploys or updates the unmark-site stack (site/infra/stack.yml), then prints its outputs (#180).
# See docs/website.md for the account, the stack, and how to tear it down.
set -euo pipefail

readonly ACCOUNT_ID=913666147211
readonly DOMAIN=unmarkeditor.com
readonly REGION=us-east-1
readonly STACK=unmark-site

# The default profile is a different account, so the site's account is opted into, never assumed.
export AWS_PROFILE="${AWS_PROFILE:-unmark}"

cd "$(dirname "$0")/../.."

account="$(aws sts get-caller-identity --query Account --output text)"
if [[ $account != "$ACCOUNT_ID" ]]; then
  echo "AWS_PROFILE=$AWS_PROFILE reaches account $account, not $ACCOUNT_ID: run 'aws sso login --profile unmark'" >&2
  exit 1
fi

# list-hosted-zones-by-name starts at the given name, so the first zone is another domain's when ours is missing.
read -r zone_id zone_name < <(
  aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN." --max-items 1 \
    --query 'HostedZones[0].[Id,Name]' --output text
)
if [[ $zone_name != "$DOMAIN." ]]; then
  echo "No hosted zone for $DOMAIN: register the domain first" >&2
  exit 1
fi
zone_id="${zone_id#/hostedzone/}"

aws cloudformation deploy --region "$REGION" --stack-name "$STACK" \
  --template-file site/infra/stack.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "HostedZoneId=$zone_id"

aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
