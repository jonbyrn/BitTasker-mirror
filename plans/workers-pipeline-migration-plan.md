# Migration Plan: Manual Wrangler Deploys → GitLab CI/CD Pipeline

This plan describes how to move from deploying BitTasker to Cloudflare Workers manually (terminal + wrangler) to a full GitLab CI/CD pipeline that runs tests, builds, and deploys to Cloudflare. It also explains why this migration is worthwhile for BitTasker.

**Related docs:**

- **Setup walkthrough:** [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md) – step-by-step configuration (variables, branch strategy, troubleshooting).
- **Worker serving logic:** [../workers-site/README.md](../workers-site/README.md) – how the Worker and KV fit together.

---

## 1. Why migrate to a GitLab pipeline?

### Problems with manual deploys

| Issue | Impact |
|-------|--------|
| **No gate before deploy** | Broken builds or failing tests can be deployed if someone runs `wrangler deploy` without running tests or check locally. |
| **Inconsistent env** | Local `.env` may differ from staging/production; manual builds can bake in wrong `VITE_*` values. |
| **No single source of truth** | Different people may use different commands or env; hard to audit “what was deployed when and from where.” |
| **Cloudflare Build on every push** | If the Worker is connected to Git, Cloudflare runs a full build on every push to any branch. That’s slow, redundant, and often runs without secrets (e.g. Turnstile sitekey undefined). |
| **Cache and freshness** | After a deploy, cache may serve old assets; manual purge is easy to forget. In CI, purge can run automatically after deploy. |

### Benefits of a GitLab pipeline

| Benefit | Why it helps BitTasker |
|---------|-------------------------|
| **Validate before deploy** | Every deploy is preceded by the same steps: install, check, lint, test, build. Only green pipelines deploy. |
| **Controlled build env** | Staging and production builds use GitLab CI/CD variables (and optionally environment-scoped vars). No reliance on local `.env` for deployed assets. |
| **Auditability** | Pipelines are tied to commits and branches; you can see who deployed what and when. |
| **Single place to run builds** | GitLab runs the build; Cloudflare only receives the result via `wrangler deploy`. You can turn off Cloudflare’s Git-based build and avoid duplicate builds and missing build-time secrets. |
| **Cache purge in CI** | After deploy, `scripts/purge-cache.js` can run in CI (when `CI=true` and zone/token are set), so users get fresh assets without manual purge. |
| **Branch-based strategy** | `dev` → staging, `main` → production (or similar). Feature branches only validate; no accidental production deploy from a feature branch. |

### Fit for BitTasker’s use case

- **Static SvelteKit app on Workers:** Build once in GitLab with the right `VITE_*` (including Turnstile), then deploy the same artifact. No build on Cloudflare.
- **Multiple environments (dev, staging, production):** Each can have its own GitLab env and variables; deploy jobs run only for the right branch.
- **Team and future CI:** As more people contribute, a single pipeline reduces “it works on my machine” and keeps deploys consistent and traceable.

---

## 2. Current state vs target state

### Current state (manual)

- **Dev worker (worker.dev.bittasker.com):** `npm run deploy:workers:dev` from a developer’s machine (build + wrangler deploy + optional purge in CI only).
- **Staging:** `npm run deploy:workers` (build + wrangler deploy to staging + purge when `CI=true`).
- **Production:** `npm run deploy:workers:production` (build:production + wrangler deploy to production + purge when `CI=true`).
- **Cloudflare:** Worker may still have “Build” connected to Git, so pushes can trigger a Cloudflare build and overwrite a good deploy with a build that lacks secrets (e.g. Turnstile).
- **Validation:** Relies on developers running check/lint/test locally before deploying.

### Target state (GitLab pipeline)

- **All branches:** Pipeline runs a **validate** job (install, check, lint, test, build). No deploy.
- **`dev` branch:** After validate passes, **deploy-staging** runs: build with staging vars → `wrangler deploy --env staging` → purge cache (when vars set).
- **`main` branch:** After validate passes, **deploy-production** runs: build with production vars → `wrangler deploy --env production` → purge cache (when vars set).
- **Cloudflare:** No build step on Cloudflare; only receives deployments from GitLab. “Build” connected to Git can be disabled for this Worker (or repo) so Cloudflare doesn’t overwrite deploys.
- **Manual deploys:** Still available for one-off or emergency deploys (e.g. `npm run deploy:workers:dev`), but normal flow is merge to `dev` or `main` and let the pipeline deploy.

---

## 3. Migration phases

### Phase 1: Pipeline runs and validates (no deploy yet)

**Goal:** GitLab runs the same validation on every push; no deployment from GitLab yet.

1. **Ensure `.gitlab-ci.yml` is in the repo** with a **validate** job (install, check, lint, test, build) and optional **deploy** jobs **disabled** or not yet configured (e.g. comment out or use `rules` that never run).
2. **Configure GitLab CI/CD variables** needed for **validate** only (no Cloudflare secrets yet if you don’t deploy):
   - Any `VITE_*` required for `npm run build` (e.g. from `.env.example` or wrangler.toml), so the build step in CI succeeds.
3. **Fix validation so it’s green:** Uncomment or add check/lint/test as needed; use a single passing test or the placeholder test until the full suite is fixed.
4. **Merge to your main development branch** and confirm every push runs the pipeline and the validate job passes.

**Exit criteria:** Pushing to any branch runs the pipeline and the validate job passes consistently.

**Doc:** Update [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md) “Step 1” (variables) and “Step 3” (run pipeline on feature branch) so they match what’s required for validate only.

---

### Phase 2: Deploy staging from GitLab

**Goal:** Merging (or pushing) to `dev` triggers validate + deploy to the staging Worker (e.g. staging.bittasker.com).

1. **Add deploy-staging job** in `.gitlab-ci.yml` (or enable it if commented):
   - `needs: [validate]`
   - Script: install → build (with staging vars) → `wrangler deploy --env staging` → `ENVIRONMENT=staging node scripts/purge-cache.js`
   - `rules: if $CI_COMMIT_BRANCH == "dev"`
   - Environment: `staging`, URL: your staging Worker URL.
2. **Add GitLab CI/CD variables** used only by deploy:
   - `CLOUDFLARE_API_TOKEN` (masked, protected)
   - `CLOUDFLARE_ACCOUNT_ID`
   - For cache purge: `CLOUDFLARE_CACHE_ZONE_ID`, `CLOUDFLARE_CACHE_PURGE_TOKEN` (optional; purge skips if unset).
3. **Ensure staging build has all required `VITE_*`** in GitLab (e.g. `VITE_CLIENT_URL`, `VITE_CLOUDFLARE_SITEKEY`, etc.) so the staging bundle is correct.
4. **Merge to `dev`** (or push to `dev`) and confirm the pipeline runs validate then deploy-staging, and that the staging URL serves the new build.
5. **Optional:** Disable Cloudflare’s “Build” for this Worker (or for the repo) so Cloudflare doesn’t run its own build on push; only GitLab deploys.

**Exit criteria:** Pushing to `dev` results in a successful deploy to the staging Worker and the site works (e.g. Turnstile, env).

**Doc:** Walkthrough “Step 4” (test full deployment – merge to dev) should match this flow; add any staging-specific variables to “Step 1”.

---

### Phase 3: Deploy production from GitLab

**Goal:** Merging to `main` triggers validate + deploy to the production Worker (e.g. worker.prod.bittasker.com).

1. **Add deploy-production job** in `.gitlab-ci.yml`:
   - `needs: [validate]`
   - Script: install → `npm run build:production` → `wrangler deploy --env production` → `ENVIRONMENT=production node scripts/purge-cache.js`
   - `rules: if $CI_COMMIT_BRANCH == "main"`
   - Environment: `production`, URL: production Worker URL.
2. **Add production-only variables** in GitLab (can be environment-scoped to `production`):
   - Same Cloudflare token/account if same account; ensure token can deploy the production Worker.
   - Production `VITE_*` (e.g. `VITE_CLIENT_URL`, `VITE_ROBOTS_TXT=prod`, `VITE_CLOUDFLARE_SITEKEY`, etc.).
3. **Protect `main`** (e.g. require MR, approvals) so production deploys are intentional.
4. **Merge to `main`** (e.g. via MR from `dev`) and confirm deploy-production runs and the production site is correct.

**Exit criteria:** Only `main` deploys to production; production site works and cache purge runs when configured.

**Doc:** Walkthrough “Step 4” and “Step 5” should reflect production; document production-scoped variables and protection.

---

### Phase 4: Optional – deploy dev worker from GitLab

**Goal:** If you want the dev Worker (worker.dev.bittasker.com) to be updated by GitLab instead of only manually:

1. Add a **deploy-dev** job (e.g. `rules: if $CI_COMMIT_BRANCH == "dev"` or a dedicated `dev-worker` branch).
2. Use `npm run build` (dev vars) and `wrangler deploy --env dev`, then `ENVIRONMENT=dev node scripts/purge-cache.js`.
3. Set dev `VITE_*` in GitLab for that job (or reuse staging vars if acceptable).

This is optional because dev is often updated manually or from the same pipeline as staging (e.g. both on `dev` branch: deploy to staging Worker and optionally to dev Worker).

---

## 4. What stays manual

- **Local development:** `npm run dev`, `npx wrangler dev` – unchanged.
- **One-off or emergency deploys:** You can still run `npm run deploy:workers:dev`, `npm run deploy:workers`, or `npm run deploy:workers:production` from a machine that has the right `.env` and wrangler login. The pipeline doesn’t remove that.
- **Secrets in Cloudflare:** Worker secrets (e.g. Turnstile secret key, API keys) remain in Cloudflare (dashboard or `wrangler secret put`). GitLab only needs build-time vars (e.g. `VITE_CLOUDFLARE_SITEKEY`) and deploy credentials (API token, optional purge token).

---

## 5. Documentation maintenance

To keep this migration and the pipeline understandable for the team:

### When to update the migration plan

- **Branch or env renames:** If you change the branch that deploys to staging/production (e.g. `dev` → `develop`, `main` → `master`), update Phase 2/3 and the “Target state” section.
- **New deploy targets:** If you add a deploy job (e.g. deploy-dev, or a separate preview env), add a short phase or subsection and reference the new job.
- **Removing manual deploy:** If you decide to rely only on the pipeline and document that manual deploy is deprecated, state it here and in the walkthrough.

### When to update the walkthrough

- **New required variables:** Any new GitLab CI/CD variable (e.g. `VITE_*`, Cloudflare token, purge) should be listed in “Step 1” with name, type, protected/masked, and description.
- **Troubleshooting:** New recurring issues (e.g. Turnstile undefined, wrangler auth, cache) should be added under “Troubleshooting” with cause and fix.
- **URL or Worker name changes:** Update table “Branch → Pipeline Behavior” and any URLs (staging, production, dev).

### When to update workers-site/README.md

- **New npm scripts:** e.g. `deploy:workers:dev` – document the command and which Worker/URL it deploys to.
- **Purge behavior:** If purge-cache.js behavior or env vars change, update the “purge” section there and in the walkthrough.

### Single source of truth

- **Pipeline definition:** `.gitlab-ci.yml` is the source of truth for stages, jobs, and rules. The plan and walkthrough should describe what’s in the file, not the other way around.
- **Required variables:** Keep a list in the walkthrough (Step 1); when adding a variable in GitLab, add it to the doc in the same change (or a follow-up).

---

## 6. Checklist before going “pipeline-only”

- [ ] Validate job is green on the branch you use (e.g. `dev`, `feat/workers-deployment`).
- [ ] All `VITE_*` and Cloudflare variables are set in GitLab for the deploy jobs that run.
- [ ] Deploy-staging has been run at least once from GitLab and the staging site works (e.g. Turnstile, API, env).
- [ ] Deploy-production has been run at least once from GitLab and the production site works.
- [ ] Cloudflare “Build” for this Worker (or repo) is disabled so only GitLab deploys.
- [ ] Team knows: merge to `dev` → staging deploy; merge to `main` → production deploy; manual deploy still available if needed.
- [ ] Walkthrough and this plan are updated with any project-specific branch names, URLs, and variables.

---

## 7. Quick reference

| Action | Command / Trigger |
|--------|-------------------|
| Validate only (any branch) | Push → GitLab runs validate job. |
| Deploy staging | Push or merge to `dev` → validate + deploy-staging. |
| Deploy production | Merge to `main` → validate + deploy-production. |
| Deploy dev worker manually | `npm run deploy:workers:dev` (local). |
| Deploy staging manually | `npm run deploy:workers` (local). |
| Deploy production manually | `npm run deploy:workers:production` (local). |

Pipeline config: `.gitlab-ci.yml`.  
Setup and variables: [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md).
