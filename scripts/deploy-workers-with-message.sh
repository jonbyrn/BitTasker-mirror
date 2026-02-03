#!/usr/bin/env bash
# Deploy Worker to Cloudflare with version message and tag for better dashboard visibility.
# Uses GitLab CI variables (CI_COMMIT_AUTHOR, CI_COMMIT_REF_NAME, CI_COMMIT_SHORT_SHA) when set.
# Usage: ./scripts/deploy-workers-with-message.sh <env>
#   env: dev | staging | production

set -e

ENV="${1:?Usage: $0 <dev|staging|production>}"

# Build deploy message from GitLab CI vars (safe when not in CI)
if [ -n "${CI_COMMIT_AUTHOR:-}" ] || [ -n "${CI_COMMIT_SHORT_SHA:-}" ]; then
  DEPLOY_AUTHOR="${CI_COMMIT_AUTHOR:-unknown}"
  DEPLOY_BRANCH="${CI_COMMIT_REF_NAME:-}"
  DEPLOY_SHA="${CI_COMMIT_SHORT_SHA:-}"
  DEPLOY_MESSAGE="GitLab CI: ${DEPLOY_AUTHOR}, branch ${DEPLOY_BRANCH} @ ${DEPLOY_SHA}"
else
  DEPLOY_SHA=""
  DEPLOY_MESSAGE="Manual deploy"
fi

echo "Deploying to Cloudflare (env=$ENV) with message: $DEPLOY_MESSAGE"

UPLOAD_OUTPUT=$(npx wrangler versions upload --env "$ENV" --message "$DEPLOY_MESSAGE" --tag "${DEPLOY_SHA:-deploy}" 2>&1) || true
echo "$UPLOAD_OUTPUT"

# Parse "Worker Version ID: <uuid>" from wrangler output
VERSION_ID=$(echo "$UPLOAD_OUTPUT" | grep -E 'Worker Version ID:' | sed 's/.*Worker Version ID:[[:space:]]*//' | tr -d '\r\n ')

if [ -n "$VERSION_ID" ]; then
  echo "Deploying version $VERSION_ID to 100% traffic..."
  npx wrangler versions deploy --env "$ENV" --version-id "$VERSION_ID" --message "$DEPLOY_MESSAGE" -y
else
  echo "Could not get version ID from upload (e.g. first deploy or versions not supported). Falling back to wrangler deploy."
  npx wrangler deploy --env "$ENV"
fi
