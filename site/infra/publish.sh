#!/usr/bin/env bash
# Uploads a built site/dist to the site's bucket and invalidates the distribution (#181). The Site workflow
# (.github/workflows/site.yml) runs it; see docs/website.md.
#
# The order keeps every page pointing at files that exist: new hashed assets go up first, then the pages that name
# them, then the invalidation, and only once it completes are the previous build's assets deleted.
set -euo pipefail

if (($# != 2)); then
  echo "usage: $0 <bucket> <distribution-id>" >&2
  exit 2
fi
readonly bucket=$1
readonly distribution=$2

# Vite names every file under assets/ by its content hash, so a year-long cache never serves a stale one.
readonly ASSET_CACHE='public,max-age=31536000,immutable'
# Browsers revalidate pages every time; CloudFront keeps them (s-maxage) until the invalidation below.
readonly PAGE_CACHE='public,max-age=0,s-maxage=31536000,must-revalidate'

cd "$(dirname "$0")/../dist"

aws s3 sync assets "s3://$bucket/assets" --cache-control "$ASSET_CACHE"

# --delete skips what --exclude hides, so this leaves the previous build's assets for the last step.
aws s3 sync . "s3://$bucket" --exclude 'assets/*' --delete --cache-control "$PAGE_CACHE"

invalidation=$(
  aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' \
    --query Invalidation.Id --output text
)
echo "Waiting for invalidation $invalidation"
aws cloudfront wait invalidation-completed --distribution-id "$distribution" --id "$invalidation"

aws s3 sync assets "s3://$bucket/assets" --delete --cache-control "$ASSET_CACHE"
