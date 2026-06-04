# BitTasker Deployment Strategy

## Overview

BitTasker uses a **hybrid deployment strategy** with Cloudflare Pages as the primary frontend deployment and Cloudflare Workers available for testing and future migration.

## Current Strategy: Pages Primary

### Cloudflare Pages (Primary)

| Project | Branch | Domain | Purpose |
|---------|--------|--------|---------|
| `dev-pages` | `dev` | `dev.bittasker.com` | Development environment |
| `prod-pages` | `master` | `bittasker.com` | Production environment |

**How it works:**
- Pages projects are connected to the GitLab repository
- Pushes to `dev` trigger `dev-pages` build automatically
- Pushes to `master` trigger `prod-pages` build automatically
- Environment variables are configured in Cloudflare Pages dashboard

### Cloudflare Workers (Testing/Future)

| Worker | Subdomain | Purpose |
|--------|-----------|---------|
| `bittasker-dev-worker` | `bittasker-dev-worker.workers.dev` | Test Workers features |
| `bittasker-prod-worker` | `bittasker-prod-worker.workers.dev` | Test production config |

**How it works:**
- Worker routes to main domains are **DISABLED** in `wrangler.toml`
- Workers deploy to `.workers.dev` subdomain only
- Use for testing Cloudflare Stream API, Cron triggers, etc.
- GitLab CI deploys Workers on branch pushes (dev/master)

## Configuration Files

### wrangler.toml

Routes are commented out to prevent Workers from intercepting Pages traffic:

```toml
[env.production]
name = "bittasker-prod-worker"
workers_dev = true  # Enable workers.dev subdomain

# ROUTE DISABLED: Pages is primary for bittasker.com
# [env.production.route]
# pattern = "bittasker.com/*"
# zone_id = "..."
```

### .gitlab-ci.yml

Workers jobs are enabled but deploy to `.workers.dev` subdomain:

```yaml
deploy-production:
  environment:
    name: production
    url: https://bittasker-prod-worker.workers.dev  # Not main domain
```

## Migrating to Workers

When ready to migrate fully to Workers:

### Step 1: Verify Workers Configuration

1. Test Workers thoroughly on `.workers.dev` subdomain
2. Verify all VITE_* environment variables are set in GitLab CI/CD
3. Confirm Stream API, Cron triggers, and other features work

### Step 2: Enable Worker Routes

In `wrangler.toml`, uncomment the route sections:

```toml
[env.production.route]
pattern = "bittasker.com/*"
zone_id = "2f577970e10b49266dbfc1ff6c5c8dc4"
```

And set `workers_dev = false` to disable the workers.dev subdomain:

```toml
workers_dev = false
```

### Step 3: Update Pages

In Cloudflare Dashboard:
1. Go to Pages → `prod-pages` → Custom domains
2. Remove `bittasker.com` custom domain
3. The Worker route will now handle all traffic

### Step 4: Update GitLab CI

In `.gitlab-ci.yml`, update the environment URL:

```yaml
deploy-production:
  environment:
    name: production
    url: https://bittasker.com  # Main domain now served by Worker
```

And re-enable cache purge:

```yaml
script:
  - npx wrangler deploy --env production
  - ENVIRONMENT=production node scripts/purge-cache.js
```

## Environment Variables

See [environment-variables.md](./environment-variables.md) for how to configure GitLab CI/CD variables with environment scoping.

## Troubleshooting

### Workers intercepting Pages traffic

**Symptom:** Main domain shows wrong content or outdated build.

**Cause:** Worker route is active and taking precedence over Pages.

**Fix:**
1. Check `wrangler.toml` - routes should be commented out
2. In Cloudflare Dashboard → Workers → Your Worker → Triggers
3. Delete any active routes for the main domain

### Pages not picking up new builds

**Symptom:** Changes pushed to branch don't appear on the site.

**Cause:** Pages build may have failed or cache needs purging.

**Fix:**
1. Check Cloudflare Dashboard → Pages → Your Project → Deployments
2. Review build logs for errors
3. Purge Cloudflare cache: Dashboard → Caching → Purge Everything

### Environment variables not working

**Symptom:** App shows wrong API URL or missing config.

**Cause:** VITE_* variables not set at build time.

**Fix:**
1. For Pages: Check Cloudflare Dashboard → Pages → Settings → Environment variables
2. For Workers: Check GitLab CI/CD variables with correct environment scope
3. Trigger a new build after updating variables
