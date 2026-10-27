#!/usr/bin/env bash
# Deploys Productivity Tracker to AWS: S3 + CloudFront (client), EC2 (API), SSM Parameter Store (secrets).
# Usage: AWS_REGION=ap-south-1 ./deploy.sh
set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-south-1}}"
STACK="productivity-tracker"
HERE="$(cd "$(dirname "$0")" && pwd)"
CLIENT_HTML="$HERE/../client/index.html"
export AWS_DEFAULT_REGION="$REGION"

command -v aws >/dev/null || { echo "aws cli not found. Install it and run 'aws configure' first."; exit 1; }
aws sts get-caller-identity >/dev/null || { echo "AWS credentials not working. Run 'aws configure' (or 'aws sso login') first."; exit 1; }
echo "Deploying to account $(aws sts get-caller-identity --query Account --output text) in $REGION"

# 1. secrets -> SSM Parameter Store (only prompts if they don't exist yet)
if ! aws ssm get-parameter --name /productivity-tracker/MONGODB_URI >/dev/null 2>&1; then
  read -r -s -p "MongoDB Atlas connection string (mongodb+srv://...): " MONGO_URI; echo
  aws ssm put-parameter --name /productivity-tracker/MONGODB_URI --type SecureString --value "$MONGO_URI" >/dev/null
fi
if ! aws ssm get-parameter --name /productivity-tracker/JWT_SECRET >/dev/null 2>&1; then
  aws ssm put-parameter --name /productivity-tracker/JWT_SECRET --type SecureString --value "$(openssl rand -hex 32)" >/dev/null
fi

# 2. infrastructure
PL_ID="$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)"

aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file "$HERE/cloudformation.yaml" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides CloudFrontPrefixListId="$PL_ID"

out() { aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
BUCKET="$(out BucketName)"; DIST="$(out DistributionId)"; URL="$(out SiteUrl)"; EIP="$(out ApiElasticIp)"

# 3. client: point API_URL at the same origin (CloudFront routes /api/* to EC2); repo file stays untouched
BUILD="$(mktemp -d)"
if [ ! -f "$CLIENT_HTML" ]; then
  echo "client/index.html not found locally, downloading from GitHub"
  CLIENT_HTML="$BUILD/original.html"
  curl -fsSL https://raw.githubusercontent.com/Shyamcharan06/productivity-tracker/main/productivity-saas/client/index.html -o "$CLIENT_HTML"
fi
sed "s#const API_URL = '[^']*';#const API_URL = '/api';#" "$CLIENT_HTML" > "$BUILD/index.html"
grep -q "const API_URL = '/api';" "$BUILD/index.html" || { echo "API_URL rewrite failed"; exit 1; }
aws s3 cp "$BUILD/index.html" "s3://$BUCKET/index.html" --content-type text/html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null

cat <<EOF

Done.
  Site:        $URL
  API health:  $URL/api/health   (give the EC2 instance 2-3 minutes after first deploy)
  API IP:      $EIP

Last step: in MongoDB Atlas > Network Access, add $EIP/32 so the server can connect.
EOF
