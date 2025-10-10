#!/bin/bash

# Upload build-time environment variables to Cloudflare Workers
# These variables are used during the build process (for VITE_* and PUBLIC_* vars)
# 
# Usage: 
#   ./scripts/upload-secrets.sh staging
#   ./scripts/upload-secrets.sh production
#
# Note: Since you update .env file manually for each environment,
# make sure .env has the correct values before running this script!

ENVIRONMENT=${1:-staging}

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
  echo "❌ Invalid environment. Use: staging or production"
  exit 1
fi

echo "🚀 Uploading build-time environment variables for: $ENVIRONMENT"
echo ""

# Complete list of environment variables
VARIABLES=(
  "VITE_API_URL"
  "PUBLIC_GRAPHQL_ENDPOINT"
  "PUBLIC_GOOGLE_CLIENT_ID"
  "PUBLIC_GOOGLE_IOS_CLIENT_ID"
  "PUBLIC_GOOGLE_REDIRECT_URI"
  "VITE_GOOGLE_MAPS_API_KEY"
  "VITE_GOOGLE_MAPS_ID"
  "VITE_X_CLIENT_ID"
  "VITE_X_CLIENT_SECRET"
  "VITE_X_REDIRECT_URI"
  "VITE_FACEBOOK_APP_ID"
  "VITE_FACEBOOK_REDIRECT_URI"
  "VITE_CLOUDFLARE_SITEKEY"
  "VITE_FIREBASE_WEB_API_KEY"
  "VITE_FIREBASE_WEB_AUTH_DOMAIN"
  "VITE_FIREBASE_WEB_PROJECT_ID"
  "VITE_FIREBASE_WEB_STORAGE_BUCKET"
  "VITE_FIREBASE_WEB_MESSAGING_SENDER_ID"
  "VITE_FIREBASE_WEB_APP_ID"
  "VITE_FIREBASE_VAPID_KEY"
  "VITE_BREEZ_API_KEY"
  "VITE_RSK_CONTRACT_ADDRESS"
  "VITE_BSCSCAN_API_KEY"
)

# Load .env file
ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env file not found!"
  exit 1
fi

echo "📄 Loading variables from: $ENV_FILE"
echo "⚠️  Make sure .env contains $ENVIRONMENT values!"
echo ""

# Fix Windows line endings (CRLF -> LF) if needed
if command -v dos2unix &> /dev/null; then
  dos2unix "$ENV_FILE" 2>/dev/null || true
fi

set -a
source "$ENV_FILE" 2>/dev/null || {
  echo "❌ Failed to load .env file. Trying alternative method..."
  # Alternative: read file line by line and export
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue
    # Remove quotes and whitespace
    value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" -e 's/\r$//')
    export "$key=$value"
  done < "$ENV_FILE"
}
set +a

# Upload each variable
SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

for VAR in "${VARIABLES[@]}"; do
  VALUE="${!VAR}"
  
  if [ -z "$VALUE" ]; then
    echo "⚠️  Skipping $VAR (empty or not defined)"
    ((SKIP_COUNT++))
    continue
  fi
  
  echo "⬆️  Uploading $VAR..."
  
  # For staging (default), use --env="" to explicitly target default environment
  # For production, use --env production
  if [ "$ENVIRONMENT" = "staging" ]; then
    echo "$VALUE" | npx wrangler secret put "$VAR" --env=""
  else
    echo "$VALUE" | npx wrangler secret put "$VAR" --env production
  fi
  
  if [ $? -eq 0 ]; then
    echo "✅ $VAR uploaded successfully"
    ((SUCCESS_COUNT++))
  else
    echo "❌ Failed to upload $VAR"
    ((FAIL_COUNT++))
  fi
  echo ""
done

echo ""
echo "════════════════════════════════════════"
echo "📊 Upload Summary for $ENVIRONMENT"
echo "════════════════════════════════════════"
echo "✅ Success: $SUCCESS_COUNT"
echo "❌ Failed:  $FAIL_COUNT"
echo "⚠️  Skipped: $SKIP_COUNT"
echo "════════════════════════════════════════"

if [ $FAIL_COUNT -gt 0 ]; then
  echo ""
  echo "❌ Some uploads failed. Please check the errors above."
  exit 1
fi

echo ""
echo "✨ All variables uploaded successfully!"
echo ""
echo "💡 Next steps:"
echo "   1. Verify variables in Cloudflare Dashboard:"
echo "      Workers & Pages > $ENVIRONMENT worker > Settings > Variables and Secrets"
echo "   2. Deploy your worker:"
if [ "$ENVIRONMENT" = "staging" ]; then
  echo "      npm run deploy:workers"
else
  echo "      npm run deploy:workers:production"
fi

