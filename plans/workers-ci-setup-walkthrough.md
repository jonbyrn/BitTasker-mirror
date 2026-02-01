# Cloudflare Workers CI/CD Setup Walkthrough

This guide walks through setting up GitLab CI/CD to deploy BitTasker to Cloudflare Workers. Use this when working on the `feat/workers-deployment` branch.

## Overview

| Branch | Pipeline Behavior |
|--------|-------------------|
| `feat/workers-deployment` | **Validate only**: test, lint, check, build |
| `dev` | Validate + **Deploy to staging** (staging.bittasker.com) |
| `main` | Validate + **Deploy to production** (worker.prod.bittasker.com) |

---

## Build on GitLab, Cloudflare Only Receives the Result

**Where the build runs:** All build work happens in **GitLab CI**:

1. **Validate** (every branch): `npm run build` produces the `build/` output and stores it as an artifact. This proves the project builds and tests pass.
2. **Deploy** (dev/main): The deploy job runs **another** build with the right env (e.g. `VITE_CLIENT_URL`, `VITE_ROBOTS_TXT` for staging vs production), then runs `wrangler deploy`, which **uploads** that `build/` folder and the Worker script to Cloudflare.

**What Cloudflare does:** With **Workers + wrangler**, Cloudflare does **not** run a build. It only receives what GitLab sends:

- GitLab runs the SvelteKit build and gets `build/`.
- `wrangler deploy` uploads `build/` (and `workers-site/index.js`) to the Worker.
- Cloudflare serves that uploaded content. No build step runs on Cloudflare.

So the pipeline is: **GitLab builds → GitLab deploys via wrangler → Cloudflare serves.** Cloudflare automation does not need to run any build.

**What to do with existing Cloudflare automation (Pages):** Right now, a **Pages** project is likely connected to the repo (e.g. via webhook), so every push triggers a **full build on Cloudflare**. That is redundant once you use this pipeline. You have two options:

| Option | When to use |
|--------|-------------|
| **Disable Pages auto-builds** | When you are ready to rely only on GitLab. In Cloudflare Dashboard → **Workers & Pages** → your **Pages** project → **Settings** → **Builds & deployments** → turn off automatic deployments (or disconnect the GitLab integration). Then only GitLab deploys (via wrangler to Workers); Cloudflare no longer builds on every push. |
| **Keep Pages as-is for now** | Use this GitLab pipeline only for the **Workers** URLs (e.g. staging.bittasker.com, worker.prod.bittasker.com). Leave the Pages project connected so existing Pages URLs still update on push. When you are ready to fully switch, disable Pages auto-builds and point traffic to the Workers. |

You do **not** need a new Cloudflare “app” for Workers: the same account and Workers are used; only the **source** of deployments changes (GitLab + wrangler instead of Pages building from Git).

---

## What the Existing Worker (`bittasker-dev-worker`) Is

The Worker you see in the dashboard **is** the Worker version of the BitTasker app. It does this:

| Piece | Role |
|-------|------|
| **Worker script** (`workers-site/index.js`) | Runs on every request: fetches the requested path from KV, serves `index.html` for SPA routes, adds caching headers, optionally gzip-compresses responses. |
| **KV namespace** `__STATIC_CONTENT` | Stores the **built** static site (the contents of `build/` after `npm run build`). Wrangler uploads `build/` into this KV when you run `wrangler deploy`. |
| **Variables & Secrets** | Runtime env (e.g. `VITE_*`) for the Worker; build-time `VITE_*` are baked into the bundle during `npm run build` before upload. |

So: **build** produces `build/` → **wrangler deploy** uploads `build/` to KV and deploys the Worker script → the Worker serves those files from KV at `worker.dev.bittasker.com`. It’s the same app, just served by a Worker instead of Pages.

**Why it triggers on your branch:** In the dashboard, **Build** is “Connect your Worker to a Git repository” with:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --env=staging`

So **Cloudflare** runs a build and deploy on every push to the connected repo (including your branch). That’s the automation you want to replace with GitLab: run build + tests in GitLab, then only `wrangler deploy` from GitLab, and **disable** this Cloudflare Build so Cloudflare no longer builds on push.

**The gibberish on worker.dev.bittasker.com:** That output is almost certainly **gzip-compressed bytes** being sent without the browser being told they’re gzip (e.g. missing or wrong `Content-Encoding: gzip`), so the browser shows raw bytes as text. The Worker’s `compressResponse()` does gzip; if the response is streamed or modified in a way that drops the header, you get gibberish. To confirm: temporarily disable compression in the Worker (e.g. return the original `response` instead of `compressedResponse`); if the page loads, the bug is in compression. A fix is to ensure `Content-Encoding: gzip` is set when the body is gzip, and that the body is a proper gzip stream. Until then, disabling compression in the Worker is a valid workaround.

## Prerequisites

- GitLab project with CI/CD enabled
- Cloudflare account with Workers access
- Access to create CI/CD variables in GitLab

---

## Step 1: Create GitLab CI/CD Variables

Go to **GitLab** → **Your Project** → **Settings** → **CI/CD** → **Variables** → **Expand**.

Add these variables. Mark sensitive ones as **Masked** and **Protected** where appropriate.

### Required for All Deployments

| Variable | Type | Protected | Masked | Description |
|----------|------|-----------|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Variable | ✅ | ✅ | API token with Workers edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | ❌ | ❌ | Your Cloudflare account ID (also in wrangler.toml) |
| `CLOUDFLARE_CACHE_ZONE_ID` | Variable | ✅ | ❌ | Zone ID for cache purge (production) |
| `CLOUDFLARE_CACHE_PURGE_TOKEN` | Variable | ✅ | ✅ | Token with "Purge Cache" permission |

### Build-Time Variables (VITE_*)

The SvelteKit build bakes these into the client bundle. **Set the values from your `wrangler.toml`**.

**Simplest approach:** Add these as **project-level** variables (no environment scope). Use your staging values—they work for both `validate` and `deploy-staging`. For production, either:

- Use the same values if staging and production share config, or
- Use GitLab [environment-scoped variables](https://docs.gitlab.com/ee/ci/variables/#add-a-cicd-variable-to-a-project) (scope `VITE_*` to `staging` vs `production`)

**Important:** The `validate` job runs `npm run build` without a local `.env`. Add at least the essential `VITE_*` variables so the build succeeds in CI.

### Minimum VITE_ Variables (from wrangler.toml)

Copy these from `wrangler.toml` `[env.staging.vars]` and `[env.production.vars]`:

- `VITE_CLIENT_URL`
- `VITE_NOSTR_RELAY_URL`
- `VITE_NOSTR_RELAY_NESTJS`
- `VITE_RSK_NETWORK`
- `VITE_BSC_NETWORK`

For production builds, also set:

- `VITE_ROBOTS_TXT` = `prod` (enables crawling)

For staging:

- `VITE_ROBOTS_TXT` = `dev` (disallows crawling)

### Creating the Cloudflare API Token

1. Cloudflare Dashboard → **My Profile** → **API Tokens**
2. **Create Token** → **Edit Cloudflare Workers** template
3. Permissions: Account › Workers Scripts › Edit, Account › Workers KV Storage › Edit
4. Account Resources: Include › Your account
5. Create and copy the token

---

## Step 2: Verify Branch Strategy

Ensure your GitLab project uses:

- `dev` for staging deployments
- `main` for production deployments

If you use different branch names (e.g. `develop`, `master`), update the `rules` in `.gitlab-ci.yml`:

```yaml
# In deploy-staging
rules:
  - if: $CI_COMMIT_BRANCH == "develop"  # Change from "dev" if needed

# In deploy-production
rules:
  - if: $CI_COMMIT_BRANCH == "master"   # Change from "main" if needed
```

---

## Step 3: Run Pipeline on feat/workers-deployment

1. Commit and push to `feat/workers-deployment`
2. Go to **CI/CD** → **Pipelines**
3. The **validate** stage should run (test, lint, build)
4. **Deploy** stages will not run (only on dev/main)

### Expected Output

- ✅ validate: check, lint, test, build all pass
- ⏭️ deploy-staging: skipped (branch is not dev)
- ⏭️ deploy-production: skipped (branch is not main)

---

## Step 4: Test Full Deployment (Merge to dev)

1. Merge `feat/workers-deployment` into `dev`
2. Push to `dev`
3. Pipeline runs validate + deploy-staging
4. Verify at https://staging.bittasker.com (or your staging URL)

---

## Step 5: Disable Cloudflare Pages (When Ready)

After Workers deployment is verified:

1. **Cloudflare Dashboard** → **Workers & Pages** → **Pages**
2. Find your BitTasker Pages project
3. **Settings** → **Builds & deployments** → **Disable** automatic deployments
4. Or delete the Pages project if no longer needed

---

## Troubleshooting

### Build fails with "VITE_* is undefined"

- Add the missing `VITE_*` variable to GitLab CI/CD variables
- Ensure it is available in the deploy job (not just validate)

### Wrangler deploy fails with "Authentication error"

- Verify `CLOUDFLARE_API_TOKEN` is set and valid
- Ensure token has Workers edit permission
- Check `CLOUDFLARE_ACCOUNT_ID` matches wrangler.toml

### Cache purge skipped

- `purge-cache.js` only runs when `CI=true` (GitLab sets this)
- Requires `CLOUDFLARE_CACHE_ZONE_ID` and `CLOUDFLARE_CACHE_PURGE_TOKEN`
- If unset, it skips gracefully (deployment still succeeds)

### Deploy jobs not running

- Check branch name matches `rules` in `.gitlab-ci.yml`
- Ensure validate stage passed (deploy needs validate)

### Local deploy still works

- `npm run deploy:workers` and `npm run deploy:workers:production` are unchanged
- They use your local `.env`; CI uses GitLab variables

---

## Files Changed in This Setup

| File | Change |
|------|--------|
| `.gitlab-ci.yml` | New – defines validate and deploy jobs |
| `package.json` | Added `wrangler` as devDependency |
| `plans/workers-ci-setup-walkthrough.md` | This guide |

No changes to `wrangler.toml`, `workers-site/`, or build scripts.
