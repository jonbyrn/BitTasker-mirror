# GitLab CI/CD Environment Variables

## Overview

BitTasker uses **environment-scoped variables** in GitLab CI/CD to manage different configurations for development and production.

## How Environment Scoping Works

GitLab CI/CD allows you to create the same variable name with different values for different environments:

| Variable       | Environment Scope | Value                           |
| -------------- | ----------------- | ------------------------------- |
| `VITE_API_URL` | `development`     | `https://api-dev.bittasker.com` |
| `VITE_API_URL` | `production`      | `https://api.bittasker.com`     |

Jobs that specify `environment: development` will receive the development value. Jobs that specify `environment: production` will receive the production value.

## Setting Up Environment-Scoped Variables

### Step 1: Navigate to CI/CD Variables

1. Go to your GitLab project
2. Settings → CI/CD → Variables
3. Click "Add variable"

### Step 2: Create Variable with Environment Scope

For each VITE\_\* variable, create TWO entries:

**Development:**

- Key: `VITE_API_URL`
- Value: `https://api-dev.bittasker.com`
- **Environment scope:** `development`
- Type: Variable
- Protected: No (or Yes if only protected branches should use it)
- Masked: No (VITE\_\* variables are public anyway)

**Production:**

- Key: `VITE_API_URL`
- Value: `https://api.bittasker.com`
- **Environment scope:** `production`
- Type: Variable
- Protected: Yes (recommended for production)
- Masked: No

### Step 3: Repeat for All VITE\_\* Variables

| Variable                    | Development Value                | Production Value             |
| --------------------------- | -------------------------------- | ---------------------------- |
| `VITE_API_URL`              | `https://api-dev.bittasker.com`  | `https://api.bittasker.com`  |
| `VITE_NOSTR_RELAY_URL`      | `wss://relay1-dev.bittasker.com` | `wss://relay1.bittasker.com` |
| `VITE_NOSTR_TASK_RELAY_URL` | `wss://relay2-dev.bittasker.com` | `wss://relay2.bittasker.com` |
| `VITE_SENTRY_DSN`           | (dev DSN)                        | (prod DSN)                   |
| ...                         | ...                              | ...                          |

## How Jobs Use Environment Variables

In `.gitlab-ci.yml`, jobs specify their environment:

```yaml
build:
  environment:
    name: development # ← Gets development-scoped variables
  script:
    - npm run build

build-production:
  environment:
    name: production # ← Gets production-scoped variables
  script:
    - npm run build:production
```

## Verifying Environment Variables

Add a debug step to your job to verify variables (remove after testing):

```yaml
build:
  script:
    - echo "VITE_API_URL=$VITE_API_URL" # Should show dev URL
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

**Cause:** Variable is marked **Protected** but the pipeline ref is not protected.

For **branch** jobs: protected variables only run on protected branches (`dev`, `master`).

For **tag** jobs (Android `v1.1.8-alpha.6`, `v1.2.0`): protected variables only run on **protected tags**. Protecting `dev` does **not** protect release tags.

**Fix (recommended for Android):**

1. **Settings → Repository → Protected tags** → add `v*` (or `v*-*` for pre-releases)
2. Enable **Settings → CI/CD → Job token permissions** → allow job token to read CI/CD variables (API fallback in `.gitlab/ci/fetch-ci-vars.yml`)

**Alternative:** Uncheck **Protected** on `ANDROID_KEYSTORE_*` (less secure).

If the job log shows `protected=false` and `ANDROID_KEYSTORE_BASE64 is empty`, this is the cause—not a bad base64 value.

## Environment Scopes in BitTasker

| Environment        | Used By                                 | Protected Branches |
| ------------------ | --------------------------------------- | ------------------ |
| `development`      | `build`, `deploy-development`           | `dev`              |
| `production`       | `build-production`, `deploy-production` | `master`           |
| `internal-testing` | `android-build-internal`                | (tag-based)        |

## Required Variables for Workers Deploy

These variables are needed for Workers deployment:

| Variable                | Scope       | Description                |
| ----------------------- | ----------- | -------------------------- |
| `CLOUDFLARE_API_TOKEN`  | All         | Wrangler deployment token  |
| `CLOUDFLARE_ACCOUNT_ID` | All         | Your Cloudflare account ID |
| `VITE_API_URL`          | development | API URL for dev            |
| `VITE_API_URL`          | production  | API URL for prod           |
| `VITE_NOSTR_RELAY_URL`  | development | Nostr relay for dev        |
| `VITE_NOSTR_RELAY_URL`  | production  | Nostr relay for prod       |
| ...                     | ...         | ...                        |

## Android release variables (Play Store + Zapstore)

Production releases use git tags `vX.Y.Z` on `master`. Configure these in **Settings → CI/CD → Variables** (not environment-scoped unless you choose to):

| Variable                                                                  | Used by                                                                            | Masked                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ANDROID_KEYSTORE_*`, `PLAY_STORE_CREDENTIALS_JSON`                       | Play Store                                                                         | See [play-store-pipeline.md](./play-store-pipeline.md) |
| `CI_API_TOKEN`                                                            | `android-release-prepare` (GitLab Release + update `ANDROID_RELEASE_VERSION_CODE`) | Yes                                                    |
| `ANDROID_RELEASE_VERSION_CODE`                                            | Bootstrap: current Play Store versionCode (e.g. `15`); auto-updated by prepare     | No                                                     |
| `ZAPSTORE_KEYSTORE_*`, `ZAPSTORE_PUBLISHER_NSEC`, `ZAPSTORE_GITLAB_TOKEN` | Zapstore child pipeline                                                            | See [zapstore-pipeline.md](./zapstore-pipeline.md)     |

`VERSION_NAME` and `VERSION_CODE` are computed in **`android-release-prepare`** (dotenv artifact). Gradle release builds fail if they are unset. Assigned `versionCode` is stored in the **GitLab Release** for the tag and in **`ANDROID_RELEASE_VERSION_CODE`**.

## Full List of VITE\_\* Variables

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
VITE_RGB_CONTRACT_ADDRESS_TESTNET
VITE_RGB_CONTRACT_ADDRESS_MAINNET
VITE_RGB_NETWORK
VITE_RGB_CONTRACT_ADDRESS_V2_TESTNET
VITE_RGB_CONTRACT_ADDRESS_V2_MAINNET
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
