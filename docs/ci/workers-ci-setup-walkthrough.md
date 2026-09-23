# Cloudflare Workers CI/CD Setup Walkthrough

This guide walks through setting up GitLab CI/CD to deploy BitTasker to Cloudflare Workers. Use this when working on the `feat/workers-deployment` branch.

**See also:** [workers-pipeline-migration.md](./workers-pipeline-migration.md) for why to use a GitLab pipeline, current vs target state, phased migration, and documentation maintenance.

## Overview

| Branch                    | Pipeline Behavior                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feat/workers-deployment` | Validate → **Deploy to development** (worker.dev.bittasker.com). Deploy job runs `npm run build` then `wrangler deploy --env dev`.                   |
| `dev`                     | Validate → **Deploy to staging** (staging.bittasker.com). Deploy job runs `npm run build` then `wrangler deploy --env staging`.                      |
| `main`                    | Validate → **Deploy to production** (worker.prod.bittasker.com). Deploy job runs `npm run build:production` then `wrangler deploy --env production`. |
| Other branches            | **Validate only** (test/lint/check can be enabled; no deploy)                                                                                        |

---

## How wrangler deploys from the pipeline

The pipeline runs in a GitLab runner (container). There is no browser and no interactive `wrangler login`. Wrangler gets credentials from **environment variables** that GitLab injects into the job:

| Variable                | Purpose                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token with Workers edit permission. Wrangler reads this (or `CF_API_TOKEN`) to authenticate. Set in GitLab CI/CD Variables (masked). |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID. Set in GitLab CI/CD Variables.                                                                               |

When the deploy job runs:

1. GitLab sets `CI=true` and injects your CI/CD variables into the job env.
2. The job runs `npm run build` – Vite bakes `VITE_*` from the **same env** into the client bundle, so you must add all required `VITE_*` (including `VITE_CLOUDFLARE_SITEKEY`) in GitLab Variables for the build to produce the right assets.
3. The job runs `npx wrangler deploy --env dev` (or `staging` / `production`). Wrangler uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the env, uploads `build/` and the Worker script to Cloudflare, and exits. No login step.

So: **add the token and account ID (and all build-time `VITE_*`) in GitLab CI/CD Variables**, and the pipeline can deploy without any interactive step.

---

## GitLab environments: development, staging, production

Create these environments in GitLab (**Settings** → **CI/CD** → **Environments**) and attach them to the deploy jobs so deployments are visible and (optionally) scoped with variables.

| Environment     | URL                               | Branch                                           | Purpose                                                                                                                                                                                                     |
| --------------- | --------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **development** | https://worker.dev.bittasker.com  | `feat/workers-deployment` (or branch you choose) | Test the **full pipeline path** (validate + deploy) without touching staging or production. Use to verify CI build env (e.g. Turnstile sitekey from GitLab vars), wrangler deploy from CI, and cache purge. |
| **staging**     | https://staging.bittasker.com     | `dev`                                            | Pre-production: QA, demos, integration tests. Mirrors production config; deploy from `dev` before merging to `main`.                                                                                        |
| **production**  | https://worker.prod.bittasker.com | `main`                                           | Live site. Deploy only from `main`; protect the branch (e.g. require MR and approvals).                                                                                                                     |

**Why have all three:**

- **Development:** Lets you prove the pipeline end-to-end (validation + deploy to a real Worker) on a feature branch. You can test that GitLab Variables (including `VITE_CLOUDFLARE_SITEKEY`) are used correctly in the build and that wrangler deploy works in CI before enabling staging/production deploys.
- **Staging:** Safe place to test changes and share with stakeholders before they go live.
- **Production:** Single, protected path to the live app.

You can scope CI/CD variables to an environment (e.g. different `VITE_CLIENT_URL` for development vs staging vs production) if needed.

---

## Build on GitLab, Cloudflare Only Receives the Result

**Where the build runs:** All build work happens in **GitLab CI**. The pipeline has two stages: **validate** and **deploy**.

1. **Validate** (stage):
   - **build**: Runs `npm ci` and `npm run build` once; publishes `build/` as an artifact. Uses CI/CD Variables for `VITE_*` (e.g. development values for dev pipeline).
   - **playwright**: Needs `build`. Receives the `build/` artifact and runs E2E (`npm run test:e2e`) with **preview only** (no second build). Unit tests (Vitest) are commented out; uncomment to run them in parallel with build if desired.
2. **Deploy** (only on deploy branches): Each deploy job **reuses** the `build/` artifact from the build job. It runs `npm ci` → `npx wrangler deploy --env <env>` → `node scripts/purge-cache.js`. No `npm run build` in deploy; the same bundle used for E2E is deployed.

**What Cloudflare does:** With **Workers + wrangler**, Cloudflare does **not** run a build. It only receives what GitLab sends:

- GitLab runs the SvelteKit build once in the **build** job and gets `build/`.
- E2E runs against that bundle via `vite preview`. Deploy uploads the same `build/` to the Worker.
- Cloudflare serves that uploaded content. No build step runs on Cloudflare.

So the pipeline is: **GitLab (build once → E2E with preview → deploy reuses build) → wrangler uploads to Cloudflare → Cloudflare serves.**

**Environments and variables:** For development-only pipelines, set `VITE_*` in CI/CD Variables (or scope to the "development" environment). When you add staging/production, use GitLab [environment-scoped variables](https://docs.gitlab.com/ee/ci/variables/#add-a-cicd-variable-to-a-project) so the **build** job gets the right `VITE_*` per branch (e.g. staging vars when branch is `dev`, production vars when branch is `master`), or add separate build jobs per environment (e.g. `build-staging`, `build-production`) if you need different build commands (e.g. `build:production`).

**What to do with existing Cloudflare automation (Pages):** Right now, a **Pages** project is likely connected to the repo (e.g. via webhook), so every push triggers a **full build on Cloudflare**. That is redundant once you use this pipeline. You have two options:

| Option                        | When to use                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Disable Pages auto-builds** | When you are ready to rely only on GitLab. In Cloudflare Dashboard → **Workers & Pages** → your **Pages** project → **Settings** → **Builds & deployments** → turn off automatic deployments (or disconnect the GitLab integration). Then only GitLab deploys (via wrangler to Workers); Cloudflare no longer builds on every push. |
| **Keep Pages as-is for now**  | Use this GitLab pipeline only for the **Workers** URLs (e.g. staging.bittasker.com, worker.prod.bittasker.com). Leave the Pages project connected so existing Pages URLs still update on push. When you are ready to fully switch, disable Pages auto-builds and point traffic to the Workers.                                      |

You do **not** need a new Cloudflare "app" for Workers: the same account and Workers are used; only the **source** of deployments changes (GitLab + wrangler instead of Pages building from Git).

---

## What the Existing Worker (`bittasker-dev-worker`) Is

The Worker you see in the dashboard **is** the Worker version of the BitTasker app. It does this:

| Piece                                       | Role                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Worker script** (`workers-site/index.js`) | Runs on every request: fetches the requested path from KV, serves `index.html` for SPA routes, adds caching headers, optionally gzip-compresses responses.                                                                                                                 |
| **KV namespace** `__STATIC_CONTENT`         | Stores the **built** static site (the contents of `build/` after `npm run build`). Wrangler uploads `build/` into this KV when you run `wrangler deploy`.                                                                                                                  |
| **Stream binding** (`[[stream]]`)           | Declared in `wrangler.toml` under `[[stream]]`. Grants the Worker (or client-side `VITE_STREAM_CUSTOMER_CODE`) access to Cloudflare Stream for video upload/playback via signed tokens and thumbnail generation.                                                           |
| **KV namespaces** (in `wrangler.toml`)      | In addition to the built-in `__STATIC_CONTENT` KV, additional KV namespaces may be defined in `wrangler.toml` under `[[kv_namespaces]]` for runtime data (e.g., caching, session state, feature flags). Each namespace binding is listed with its `binding` name and `id`. |
| **Variables & Secrets**                     | Runtime env (e.g. `VITE_*`) for the Worker; build-time `VITE_*` are baked into the bundle during `npm run build` before upload.                                                                                                                                            |

So: **build** produces `build/` → **wrangler deploy** uploads `build/` to KV and deploys the Worker script → the Worker serves those files from KV at `worker.dev.bittasker.com`. It's the same app, just served by a Worker instead of Pages.

**Why it triggers on your branch:** In the dashboard, **Build** is "Connect your Worker to a Git repository" with:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --env=staging`

So **Cloudflare** runs a build and deploy on every push to the connected repo (including your branch). That's the automation you want to replace with GitLab: run build + tests in GitLab, then only `wrangler deploy` from GitLab, and **disable** this Cloudflare Build so Cloudflare no longer builds on push.

**The gibberish on worker.dev.bittasker.com:** That output is almost certainly **gzip-compressed bytes** being sent without the browser being told they're gzip (e.g. missing or wrong `Content-Encoding: gzip`), so the browser shows raw bytes as text. The Worker's `compressResponse()` does gzip; if the response is streamed or modified in a way that drops the header, you get gibberish. To confirm: temporarily disable compression in the Worker (e.g. return the original `response` instead of `compressedResponse`); if the page loads, the bug is in compression. A fix is to ensure `Content-Encoding: gzip` is set when the body is gzip, and that the body is a proper gzip stream. Until then, disabling compression in the Worker is a valid workaround.

## Prerequisites

- GitLab project with CI/CD enabled
- Cloudflare account with Workers access
- Access to create CI/CD variables in GitLab

---

## Step 1: Create GitLab CI/CD Variables

Go to **GitLab** → **Your Project** → **Settings** → **CI/CD** → **Variables** → **Expand**.

**Before deploy works:** In the repo, open `wrangler.toml` and replace every `REPLACE_WITH_BITTASKER_ZONE_ID` with your **Zone ID** from **Cloudflare Dashboard → bittasker.com → Overview → Zone ID** (right sidebar). Use the same Zone ID for dev, staging, and production routes if they all use bittasker.com.

Add these variables. Mark sensitive ones as **Masked**. For **Protected**: if a variable is Protected, it is only available on **protected branches** (e.g. `main`, `dev`). For the **development** environment, the deploy job runs on `feat/workers-deployment`, which is usually **not** protected—so either **uncheck Protected** for variables used by deploy-development, or protect that branch. Staging/production can keep Protected if their branches (`dev`, `main`) are protected.

### Required for deploy jobs (development, staging, production)

| Variable                       | Type     | Protected | Masked | Description                                                                             |
| ------------------------------ | -------- | --------- | ------ | --------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`         | Variable | ✅        | ✅     | API token with Workers edit permission. Wrangler uses this in CI (no `wrangler login`). |
| `CLOUDFLARE_ACCOUNT_ID`        | Variable | ❌        | ❌     | Your Cloudflare account ID (also in wrangler.toml)                                      |
| `CLOUDFLARE_CACHE_ZONE_ID`     | Variable | Optional  | ❌     | Zone ID for cache purge (purge-cache.js skips if unset)                                 |
| `CLOUDFLARE_CACHE_PURGE_TOKEN` | Variable | Optional  | ✅     | Token with "Purge Cache" permission (purge-cache.js skips if unset)                     |

### Build-Time Variables (VITE\_\*)

The SvelteKit build bakes these into the client bundle. **Set the values from your `wrangler.toml`**.

**Simplest approach:** Add these as **project-level** variables (no environment scope). Use your staging values—they work for both `validate` and `deploy-staging`. For production, either:

- Use the same values if staging and production share config, or
- Use GitLab [environment-scoped variables](https://docs.gitlab.com/ee/ci/variables/#add-a-cicd-variable-to-a-project) (scope `VITE_*` to `staging` vs `production`)

**Important:** The `validate` job runs `npm run build` without a local `.env`. Add at least the essential `VITE_*` variables so the build succeeds in CI.

### VITE_CLOUDFLARE_SITEKEY (Turnstile) at worker.bittasker.com

The Turnstile sitekey is **baked into the client bundle at build time**. It is **not** read from Worker secrets at runtime. So:

- **Local deploy:** Run `npm run build` with `VITE_CLOUDFLARE_SITEKEY` in your `.env`, then `wrangler deploy`. The built JS will have the key.
- **Cloudflare Git Build:** If the Worker is connected to Git, Cloudflare runs `npm run build` in its own environment. **Worker secrets (dashboard Variables & Secrets) are for the Worker runtime, not for the build step.** So the Cloudflare build often runs without `VITE_CLOUDFLARE_SITEKEY`, and the deployed bundle has `undefined`. **Fix:** In Cloudflare Dashboard → **Workers & Pages** → your Worker → **Settings** → **Build** → **Variables and secrets**, add a **build** variable: `VITE_CLOUDFLARE_SITEKEY` (value = your Turnstile site key, or mark as secret). Then trigger a new build (e.g. push a commit or "Retry deployment"). After that, the built assets will have the key inlined.
- **Cache:** If you deployed a good build but still see "expected string, got undefined", the browser or edge may be serving old JS. Try hard refresh (Ctrl+Shift+R / Cmd+Shift+R), incognito, or purge the zone cache in Cloudflare.

### Variables for E2E (Playwright in validate stage)

The pipeline runs the full E2E suite (`npm run test:e2e`) on MRs and on branches `feat/workers-deployment`, `dev`, and `main`. Set these so E2E can reach your backend and Nostr relay:

| Variable                    | Purpose                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `VITE_API_URL`              | Backend API base URL (signup, onboarding, passkey). Required for 01–02 and app behavior.   |
| `VITE_NOSTR_RELAY_URL`      | Nostr relay URL (e.g. `wss://relay.example.com`). Required for 04-messages (Messages E2E). |
| `VITE_E2E_TURNSTILE_BYPASS` | Set to `true` to bypass Turnstile in E2E (optional; script may warn if unset).             |

See [docs/testing/e2e-testing.md](../testing/e2e-testing.md) for the full list and run order.

### Minimum VITE\_ Variables (from wrangler.toml)

Copy these from `wrangler.toml` `[env.staging.vars]` and `[env.production.vars]`:

- `VITE_CLIENT_URL`
- `VITE_NOSTR_RELAY_URL`
- `VITE_NOSTR_RELAY_NESTJS`
- `VITE_RGB_NETWORK`
- `VITE_BSC_NETWORK`
- `VITE_STREAM_CUSTOMER_CODE`

For production builds, the `static/robots.txt` on the master branch allows crawling and references the sitemap. On dev/staging branches it blocks all crawlers. This is managed per-branch (no env var needed).

### Creating the Cloudflare API Token

1. Cloudflare Dashboard → **My Profile** → **API Tokens**
2. **Create Token** → **Edit Cloudflare Workers** template
3. Permissions: Account › Workers Scripts › Edit, Account › Workers KV Storage › Edit
4. Account Resources: Include › Your account
5. Create and copy the token

---

## Step 2: Create GitLab environments

In GitLab go to **Settings** → **CI/CD** → **Environments** and ensure you have:

- **development** (URL: https://worker.dev.bittasker.com) – used by `deploy-development`
- **staging** (URL: https://staging.bittasker.com) – used by `deploy-staging`
- **production** (URL: https://worker.prod.bittasker.com) – used by `deploy-production`

If you use different branch names (e.g. `develop`, `master`), update the `rules` in `.gitlab-ci.yml` for each deploy job.

---

## Step 3: Test full path – validate + build + deploy to development

1. Ensure **development** has the required variables (or use project-level variables): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and all dev `VITE_*` (including `VITE_CLOUDFLARE_SITEKEY`) so the build and deploy succeed.
2. Commit and push to `feat/workers-deployment`.
3. Go to **CI/CD** → **Pipelines** and open the pipeline for that push.
4. **validate** runs first (currently runs the CI placeholder test; check, lint, and build are commented out in `.gitlab-ci.yml`). Then **deploy-development** runs: `npm run build`, `wrangler deploy --env dev`, purge cache (if zone/token set).

### Expected output

- ✅ validate: passes
- ✅ deploy-development: runs (branch is feat/workers-deployment), runs build then wrangler deploy to worker.dev.bittasker.com
- ⏭️ deploy-staging, deploy-production: skipped (branch is not dev/main)

5. Open https://worker.dev.bittasker.com and confirm the app (and e.g. Turnstile on signup) works. That proves the full path: GitLab build env → wrangler deploy from CI → live Worker.

---

## Step 4: Deploy staging (merge to dev)

1. Merge `feat/workers-deployment` into `dev`.
2. Push to `dev`.
3. Pipeline runs validate → deploy-staging (build runs inside deploy-staging; deploy-development is skipped; branch is dev).
4. Verify at https://staging.bittasker.com (or your staging URL).

---

## Step 5: Disable Cloudflare Pages (When Ready)

After Workers deployment is verified:

1. **Cloudflare Dashboard** → **Workers & Pages** → **Pages**
2. Find your BitTasker Pages project
3. **Settings** → **Builds & deployments** → **Disable** automatic deployments
4. Or delete the Pages project if no longer needed

---

## Troubleshooting

### Environment variables not injected (wrangler "set CLOUDFLARE_API_TOKEN", Sentry "No auth token")

**Symptom:** The deploy job runs with environment "development" and you have variables scoped to "development", but wrangler says `CLOUDFLARE_API_TOKEN` is not set and/or Sentry says no auth token. The job is clearly using the development environment (you see it under Operate → Environments → development).

**Cause:** In GitLab, variables marked **Protected** are only available on **protected branches** (and protected tags). The branch `feat/workers-deployment` is usually **not** protected (only `main` and often `dev` are). So any variable with "Protected" checked is **not** injected when the pipeline runs on `feat/workers-deployment`, even if it is scoped to the development environment.

**Fix (choose one):**

1. **Uncheck "Protected"** for variables used by the development deploy job (e.g. `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SENTRY_AUTH_TOKEN`, and dev `VITE_*`). They remain **Masked**, so values are not printed in logs. This is the usual approach so feature branches can deploy to development.
2. **Or** protect the branch `feat/workers-deployment` (Settings → Repository → Protected branches → add `feat/workers-deployment`). Then protected variables are injected when that branch runs. Use only if you want development deploys to require a protected branch.

**Verify:** After changing Protected, re-run the pipeline. Optionally enable debug: in GitLab CI/CD → Variables, add a variable `DEBUG_CI_VARS` = `1` (scope: development). Re-run the deploy-development job; the script will print `CI_VARS_CHECK: CLOUDFLARE_API_TOKEN=set` (or empty) without exposing values. Remove `DEBUG_CI_VARS` when done.

**Environment scope:** Variables scoped to "development" are only available to jobs that have `environment: name: development`. The deploy-development job has that, so scope is correct; the usual issue is Protected + unprotected branch.

### Build fails with "VITE\_\* is undefined"

- Add the missing `VITE_*` variable to GitLab CI/CD variables
- Ensure it is available in the deploy job (not just validate)
- If scoped to "development", ensure the deploy job uses `environment: development` and (if variable is Protected) the branch is protected or the variable is unchecked Protected

### Wrangler deploy fails with "register a workers.dev subdomain" or "deploy to one or more routes"

**Symptom:** In CI, wrangler says: "You can either deploy your worker to one or more routes by specifying them in your wrangler.toml file, or register a workers.dev subdomain here: ..."

**Cause:** In non-interactive mode (CI), wrangler does not prompt to register workers.dev. If there are no **routes** in wrangler.toml for that environment, wrangler has nowhere to attach the Worker and fails.

**Fix:** In `wrangler.toml`, for each environment (dev, staging, production) that you deploy from CI, add a **route** and set **workers_dev = false** so wrangler doesn't ask about workers.dev. Use **zone_id** (not zone_name) so CI doesn't fail with "Could not find zone" (see next section). Replace `REPLACE_WITH_BITTASKER_ZONE_ID` with your Zone ID from **Cloudflare Dashboard → bittasker.com → Overview → Zone ID** (right sidebar):

```toml
[env.dev.route]
pattern = "worker.dev.bittasker.com/*"
zone_id = "REPLACE_WITH_BITTASKER_ZONE_ID"
```

After that, `wrangler deploy --env dev` in CI will attach the Worker to that route and succeed.

### Wrangler deploy fails with "Could not find zone for bittasker.com"

**Symptom:** In CI, wrangler says: "Could not find zone for `bittasker.com`. Make sure the domain is set up to be proxied by Cloudflare."

**Cause:** Wrangler looks up the zone by **name** using the API token's account. That fails if (1) the zone **bittasker.com** is in a **different Cloudflare account** than the one in `CLOUDFLARE_ACCOUNT_ID` (e.g. Worker in one account, zone in another), or (2) the API token doesn't have **Zone > Zone > Read** permission.

**Fix:**

1. **Use zone_id instead of zone_name** in `wrangler.toml` for each env's route. Get the Zone ID from **Cloudflare Dashboard → bittasker.com → Overview → Zone ID** (right sidebar). Replace `REPLACE_WITH_BITTASKER_ZONE_ID` in wrangler.toml with that value (same Zone ID for dev, staging, production if they all use bittasker.com).
2. **Same account:** Ensure the Cloudflare account that has the **Worker** (Workers & Pages) is the **same account** that has the zone **bittasker.com** (Websites / Domain management). If they're in different accounts, either move the zone to the Worker's account or use an API token from the account that has the zone, with Workers edit permission for the Worker's account (if supported).
3. **Token permissions:** Ensure the API token has **Zone > Zone > Read** and **Zone > Workers Routes > Edit** for the zone (or account) so wrangler can attach the route.

### Wrangler deploy fails with "Authentication error"

- Verify `CLOUDFLARE_API_TOKEN` is set and valid (and that it is injected: see "Environment variables not injected" above if the branch is not protected)
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

## Playwright E2E (smoke tests)

A **playwright** job runs in the **validate** stage on MRs and on branches `feat/workers-deployment`, `dev`, and `main`. It uses the official Playwright Docker image (Node 20 + Chromium) and runs only the smoke suite:

- **CI:** `npx playwright test --project=chromium tests/e2e/smoke.spec.ts`
- The app is started automatically by Playwright's `webServer` (`npm run dev` in `playwright.config.ts`).

**Run locally (one-time setup):**

```bash
npx playwright install chromium   # install browser
npm run dev                        # in one terminal
npm run test:playwright run -- --project=chromium tests/e2e/smoke.spec.ts   # in another
```

Or let Playwright start the server: `npx playwright test tests/e2e/smoke.spec.ts --project=chromium` (no need to run `npm run dev` separately).

To run Playwright on every branch (not only MRs and deploy branches), remove or relax the `rules` under the `playwright` job in `.gitlab-ci.yml`.

---

## Files in this setup

| File                                      | Role                                                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitlab-ci.yml`                          | Defines stages: **validate**, **deploy**. Validate runs unit test + optional **playwright** job (smoke E2E). Deploy jobs run `npm run build` (or `build:production`) then `wrangler deploy` and purge. No separate build stage. |
| `package.json`                            | Includes `wrangler` and scripts `deploy:workers:dev`, `deploy:workers`, `deploy:workers:production`                                                                                                                             |
| `scripts/purge-cache.js`                  | Runs after deploy in CI (when `CI=true` and zone/token set); skips locally                                                                                                                                                      |
| `docs/ci/workers-ci-setup-walkthrough.md` | This guide                                                                                                                                                                                                                      |
| `docs/ci/workers-pipeline-migration.md`   | Migration plan and environment rationale                                                                                                                                                                                        |
| `tests/e2e/smoke.spec.ts`                 | Playwright smoke tests (homepage load, app shell). Run in CI via **playwright** job.                                                                                                                                            |
| `playwright.config.ts`                    | Playwright config; `webServer` starts `npm run dev` for local and CI.                                                                                                                                                           |

No changes to `wrangler.toml` or `workers-site/` for the pipeline; they define Worker config and serving logic.
