# GitLab CI/CD Environment Variables

## Overview

BitTasker uses **environment-scoped variables** in GitLab CI/CD to manage different configurations for development and production.

## How Environment Scoping Works

GitLab CI/CD allows you to create the same variable name with different values for different environments:

| Variable | Environment Scope | Value |
|----------|------------------|-------|
| `VITE_API_URL` | `development` | `https://api-dev.bittasker.com` |
| `VITE_API_URL` | `production` | `https://api.bittasker.com` |

Jobs that specify `environment: development` will receive the development value. Jobs that specify `environment: production` will receive the production value.

## Setting Up Environment-Scoped Variables

### Step 1: Navigate to CI/CD Variables

1. Go to your GitLab project
2. Settings → CI/CD → Variables
3. Click "Add variable"

### Step 2: Create Variable with Environment Scope

For each VITE_* variable, create TWO entries:

**Development:**
- Key: `VITE_API_URL`
- Value: `https://api-dev.bittasker.com`
- **Environment scope:** `development`
- Type: Variable
- Protected: No (or Yes if only protected branches should use it)
- Masked: No (VITE_* variables are public anyway)

**Production:**
- Key: `VITE_API_URL`
- Value: `https://api.bittasker.com`
- **Environment scope:** `production`
- Type: Variable
- Protected: Yes (recommended for production)
- Masked: No

### Step 3: Repeat for All VITE_* Variables

| Variable | Development Value | Production Value |
|----------|-------------------|------------------|
| `VITE_API_URL` | `https://api-dev.bittasker.com` | `https://api.bittasker.com` |
| `VITE_NOSTR_RELAY_URL` | `wss://relay1-dev.bittasker.com` | `wss://relay1.bittasker.com` |
| `VITE_NOSTR_TASK_RELAY_URL` | `wss://relay2-dev.bittasker.com` | `wss://relay2.bittasker.com` |
| `VITE_SENTRY_DSN` | (dev DSN) | (prod DSN) |
| ... | ... | ... |

## How Jobs Use Environment Variables

In `.gitlab-ci.yml`, jobs specify their environment:

```yaml
build:
  environment:
    name: development  # ← Gets development-scoped variables
  script:
    - npm run build

build-production:
  environment:
    name: production  # ← Gets production-scoped variables
  script:
    - npm run build:production
```

## Verifying Environment Variables

Add a debug step to your job to verify variables (remove after testing):

```yaml
build:
  script:
    - echo "VITE_API_URL=$VITE_API_URL"  # Should show dev URL
    - npm run build
```

## Common Issues

### Variable not available in job

**Cause:** Environment scope doesn't match job's environment.

**Fix:** Ensure the variable's environment scope matches the job's `environment.name`.

### Same value for both environments

**Cause:** Variable was created without environment scope (defaults to "All").

**Fix:** Delete the unscoped variable and create two scoped entries.

### Protected variable not available

**Cause:** Job runs on unprotected branch but variable is protected.

**Fix:** Either:
- Run the job on a protected branch (master, dev)
- Uncheck "Protected variable" when creating it

## Environment Scopes in BitTasker

| Environment | Used By | Protected Branches |
|-------------|---------|-------------------|
| `development` | `build`, `deploy-development` | `dev` |
| `production` | `build-production`, `deploy-production` | `master` |
| `internal-testing` | `android-build-internal` | (tag-based) |

## Required Variables for Workers Deploy

These variables are needed for Workers deployment:

| Variable | Scope | Description |
|----------|-------|-------------|
| `CLOUDFLARE_API_TOKEN` | All | Wrangler deployment token |
| `CLOUDFLARE_ACCOUNT_ID` | All | Your Cloudflare account ID |
| `VITE_API_URL` | development | API URL for dev |
| `VITE_API_URL` | production | API URL for prod |
| `VITE_NOSTR_RELAY_URL` | development | Nostr relay for dev |
| `VITE_NOSTR_RELAY_URL` | production | Nostr relay for prod |
| ... | ... | ... |

## Full List of VITE_* Variables

Copy from `.env.example` or `wrangler.toml` for the complete list:

```bash
VITE_CLIENT_HOSTNAME
VITE_APP_ID
VITE_APP_NAME
VITE_API_URL
VITE_NOSTR_RELAY_URL
VITE_NOSTR_RELAY_NESTJS
VITE_NOSTR_TASK_RELAY_URL
VITE_GOOGLE_MAPS_API_KEY
VITE_GOOGLE_MAPS_ID
VITE_CLOUDFLARE_SITEKEY
VITE_FIREBASE_WEB_API_KEY
VITE_FIREBASE_WEB_AUTH_DOMAIN
VITE_FIREBASE_WEB_PROJECT_ID
VITE_FIREBASE_WEB_STORAGE_BUCKET
VITE_FIREBASE_WEB_MESSAGING_SENDER_ID
VITE_FIREBASE_WEB_APP_ID
VITE_FIREBASE_VAPID_KEY
VITE_RSK_CONTRACT_ADDRESS_TESTNET
VITE_RSK_CONTRACT_ADDRESS_MAINNET
VITE_RSK_NETWORK
VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET
VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET
VITE_TX_RELAY_ENABLED
VITE_TX_RELAY_BASE_URL
VITE_BSC_NETWORK
SENTRY_ORG
SENTRY_PROJECT
VITE_SENTRY_DSN
VITE_E2E_TURNSTILE_BYPASS
VITE_BETA_WARNING
VITE_REVIEWS_ATTESTATION_API_URL
VITE_STREAM_CUSTOMER_CODE
```
