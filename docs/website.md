# Website hosting

`unmarkeditor.com` is served from a private S3 bucket behind a CloudFront distribution on CloudFront's Free flat-rate plan (#180). One CloudFormation stack, `unmark-site` in `us-east-1`, holds all of it: [`site/infra/stack.yml`](../site/infra/stack.yml), deployed by [`site/infra/deploy.sh`](../site/infra/deploy.sh).

## Account and access

The site lives in AWS account `913666147211` (`masoncodes`), not the default profile's account. Reach it through IAM Identity Center as `masoncodes-ci`, in the `AdministratorAccess` permission set; don't use the root user. Role sessions last 12 hours inside a 90-day sign-in session.

Add the `unmark` profile and its `sso-session` to `~/.aws/config`:

```ini
[profile unmark]
sso_session = unmark
sso_account_id = 913666147211
sso_role_name = AdministratorAccess
region = us-east-1
output = json

[sso-session unmark]
sso_start_url = https://d-906667c446.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
```

Sign in, and again whenever a command reports an expired SSO token:

```sh
aws sso login --profile unmark
```

Run every `aws` command for the site with `AWS_PROFILE=unmark`. `deploy.sh` sets it when `AWS_PROFILE` is unset, and stops unless the profile reaches `913666147211`.

## What the stack contains

| Resource | What it does |
| --- | --- |
| `SiteBucket` | `unmark-site-913666147211`, with all four public-access blocks on, no website hosting, and no versioning |
| `SiteBucketPolicy` | Lets only this distribution read objects (`s3:GetObject`), through its Origin Access Control. Without `s3:ListBucket`, a missing object is a 403 |
| `OriginAccessControl` | Signs the distribution's requests to the bucket with SigV4 |
| `WwwRedirect` | CloudFront Function on viewer request: `www.unmarkeditor.com/<path>` answers 301 to `https://unmarkeditor.com/<path>`, dropping the query string |
| `WebAcl` | WAF web ACL with no rules that allows everything; the Free plan requires one |
| `Certificate` | ACM certificate for `unmarkeditor.com` and `www.unmarkeditor.com`, validated by DNS records CloudFormation adds to the hosted zone |
| `Distribution` | Both names over HTTPS (TLS 1.2 or later, HTTP/2 and HTTP/3, IPv6), HTTP redirected to HTTPS, `index.html` as the root object. Uses the managed `CachingOptimized` cache policy and `SecurityHeadersPolicy` response-headers policy, since the Free plan forbids custom ones. A 403 or 404 from the bucket answers with `/404.html` and status 404, cached for 60 s |
| `ApexA`, `ApexAAAA`, `WwwA`, `WwwAAAA` | Route 53 alias records for both names, pointing at the distribution |
| `Plan` | The Free flat-rate plan subscription, covering the distribution, the web ACL, and the hosted zone |
| `GitHubOidcProvider` | IAM OIDC provider for `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com` |
| `DeployRole` | `unmark-site-deploy`, assumable only through that provider by a token whose `sub` is `repo:mlg87@10038207/unmark@1440804257:environment:site`: the repository issues immutable subjects, which add the owner's and repository's IDs to their names. It can list the bucket, put and delete its objects, and create and read invalidations on the distribution, nothing else |

The stack's outputs are `BucketName`, `DistributionId`, `DistributionDomainName`, and `DeployRoleArn`.

## How the site deploys

The Site workflow, [`.github/workflows/site.yml`](../.github/workflows/site.yml), builds `site/` and publishes it (#181). It runs:

- on every push to `main` that changes `site/` or the workflow itself;
- after every release: the Release workflow's `site` job dispatches it, so the download button names the new version. A `release` trigger wouldn't fire, because the release is created with `GITHUB_TOKEN`, whose events start no workflows;
- by hand: `gh workflow run site.yml --ref main`.

Its one job runs in the `site` environment, which allows deployments from `main` alone. It assumes `DeployRole` through OIDC, so no AWS keys are stored in GitHub. Runs share one concurrency group: a second deploy waits for the first instead of interleaving with it or cancelling it.

[`site/infra/publish.sh`](../site/infra/publish.sh) uploads `site/dist` in an order that never leaves a page naming a file that isn't there yet:

1. The new `assets/`, cached for a year (`public,max-age=31536000,immutable`): Vite names them by content hash.
2. Everything else, deleting pages that are gone, with `public,max-age=0,s-maxage=31536000,must-revalidate`: browsers revalidate every time, and CloudFront keeps them until the next invalidation.
3. An invalidation of `/*`, waiting for it to complete.
4. `assets/` again with `--delete`, removing the previous build's files now that no cached page names them.

The workflow reads three repository variables, set from the stack's outputs. They are variables, not secrets, because none is a credential:

| Variable | Stack output |
| --- | --- |
| `SITE_DEPLOY_ROLE_ARN` | `DeployRoleArn` |
| `SITE_BUCKET` | `BucketName` |
| `SITE_DISTRIBUTION_ID` | `DistributionId` |

After a template change that alters one of those outputs, set the variable again, for example `gh variable set SITE_BUCKET --body <BucketName>`.

## What it costs

- **CloudFront, WAF, and Route 53: $0.** The Free plan covers 1 million requests and 100 GB of data transfer a month, with no overage charges: past that, CloudFront may serve the site from fewer edge locations instead. It also covers the hosted zone's monthly fee and its DNS queries (alias queries to the distribution without limit, 1 million others), and gives 5 GB of S3 Standard storage credit.
- **Domain: $16 a year**, the Route 53 registration of `unmarkeditor.com` (#179).
- **S3 requests: cents.** The plan doesn't cover S3 request fees: the distribution's GETs on cache misses, and the PUTs that upload the site. Transfer from S3 to CloudFront is free.

## Deploy a template change

From the repository root, after editing `site/infra/stack.yml`:

```sh
site/infra/deploy.sh
```

It looks up the hosted zone, runs `aws cloudformation deploy`, and prints the stack's outputs. With no change to deploy it changes nothing and exits 0. The first deploy waits for the certificate to validate and the distribution to deploy, which takes several minutes.

The Free plan rejects distribution features outside its tier (custom cache or response-headers policies, more than 5 cache behaviors, sharing `WwwRedirect` with another distribution). A rejected change fails the `Plan` resource, and its `StatusReason` names the feature.

## Check the plan

```sh
AWS_PROFILE=unmark aws pricing-plan-manager list-subscriptions --region us-east-1
```

The subscription should show `planTier` `FREE`, `status` `ACTIVE`, and three `resourceArns`: the distribution, the web ACL, and the hosted zone.

## Tear it down

CloudFormation can't delete a bucket that holds objects, so empty it first:

```sh
AWS_PROFILE=unmark aws s3 rm s3://unmark-site-913666147211 --recursive
AWS_PROFILE=unmark aws cloudformation delete-stack --region us-east-1 --stack-name unmark-site
AWS_PROFILE=unmark aws cloudformation wait stack-delete-complete --region us-east-1 --stack-name unmark-site
```

Deleting the stack deletes the subscription first, which cancels the Free plan immediately, then the rest. The hosted zone and the domain registration aren't part of the stack, so they stay.
