#!/usr/bin/env bash
# Upload bittasker-dev-worker without inheriting secrets from an undeployed version.
set -euo pipefail
secrets="${DEV_WORKER_SECRETS_FILE:-.env.dev-worker-secrets}"
rm -f "$secrets"
cleanup() { rm -f "$secrets"; }
trap cleanup EXIT
node scripts/ci/dev-worker-secrets.mjs "$secrets"
if [ -s "$secrets" ]; then
	npx wrangler deploy --env dev --keep-vars --secrets-file "$secrets"
else
	npx wrangler deploy --env dev --keep-vars
fi
ENVIRONMENT=dev node scripts/purge-cache.js
