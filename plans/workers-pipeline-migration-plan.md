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
| **No single source of truth** | Different people may use different commands or env; hard to audit "what was deployed when and from where." |
| **Cloudflare Build on every push** | If the Worker is connected to Git, Cloudflare runs a full build on every push to any branch. That's slow, redundant, and often runs without secrets (e.g. Turnstile sitekey undefined). |
| **Cache and freshness** | After a deploy, cache may serve old assets; manual purge is easy to forget. In CI, purge can run automatically after deploy. |

### Benefits of a GitLab pipeline

| Benefit | Why it helps BitTasker |
|---------|-------------------------|
| **Validate before deploy** | Every deploy is preceded by the same steps: install, check, lint, test, build. Only green pipelines deploy. |
| **Controlled build env** | Staging and production builds use GitLab CI/CD variables (and optionally environment-scoped vars). No reliance on local `.env` for deployed assets. |
| **Auditability** | Pipelines are tied to commits and branches; you can see who deployed what and when. |
| **Single place to run builds** | GitLab runs the build; Cloudflare only receives the result via `wrangler deploy`. You can turn off Cloudflare's Git-based build and avoid duplicate builds and missing build-time secrets. |
| **Cache purge in CI** | After deploy, `scripts/purge-cache.js` can run in CI (when `CI=true` and zone/token are set), so users get fresh assets without manual purge. |
| **Branch-based strategy** | `dev` → staging, `main` → production (or similar). Feature branches only validate; no accidental production deploy from a feature branch. |

### Fit for BitTasker's use case

- **Static SvelteKit app on Workers:** Build once in GitLab with the right `VITE_*` (including Turnstile), then deploy the same artifact. No build on Cloudflare.
- **Multiple environments (dev, staging, production):** Each can have its own GitLab env and variables; deploy jobs run only for the right branch.
- **Team and future CI:** As more people contribute, a single pipeline reduces "it works on my machine" and keeps deploys consistent and traceable.

---

## 2. Current state vs target state

### Current state (manual)

- **Dev worker (worker.dev.bittasker.com):** `npm run deploy:workers:dev` from a developer's machine (build + wrangler deploy + optional purge in CI only).
- **Staging:** `npm run deploy:workers` (build + wrangler deploy to staging + purge when `CI=true`).
- **Production:** `npm run deploy:workers:production` (build:production + wrangler deploy to production + purge when `CI=true`).
- **Cloudflare:** Worker may still have "Build" connected to Git, so pushes can trigger a Cloudflare build and overwrite a good deploy with a build that lacks secrets (e.g. Turnstile).
- **Validation:** Relies on developers running check/lint/test locally before deploying.

### Target state (GitLab pipeline) — current implementation

- **All branches:** Pipeline runs **validate** (install, test). Check, lint, and build are optional in validate (currently only the CI placeholder test runs; see `.gitlab-ci.yml`).
- **Deploy branches:** Two stages only: **validate** and **deploy**. There are **no separate build jobs**. Each deploy job runs: `npm ci` → `npm run build` (or `npm run build:production` for production) → `wrangler deploy --env <env>` → `scripts/purge-cache.js`.
- **`feat/workers-deployment`:** validate → **deploy-development** (build runs inside the job).
- **`dev`:** validate → **deploy-staging** (build runs inside the job).
- **`main`:** validate → **deploy-production** (build runs inside the job).
- **Other branches:** validate only; no deploy.
- **Cloudflare:** No build step on Cloudflare; only receives deployments from GitLab. Build connected to Git can be disabled for this Worker (or repo) so Cloudflare does not overwrite deploys.
- **Manual deploys:** Still available for one-off or emergency deploys (e.g. `npm run deploy:workers:dev`), but normal flow is push/merge to the branch that triggers the desired deploy.

---

## 3. Environments: development, staging, production

| Environment | GitLab env name | Worker URL | Branch | Purpose |
|-------------|-----------------|------------|--------|---------|
| **Development** | development | worker.dev.bittasker.com | feat/workers-deployment (or chosen branch) | Test the **full pipeline path** (validate + deploy) without touching staging or production. Proves that GitLab Variables (e.g. VITE_CLOUDFLARE_SITEKEY) are used in the build and that wrangler deploy works in CI. |
| **Staging** | staging | staging.bittasker.com | dev | Pre-production: QA, demos, integration tests. Mirrors production config; deploy from `dev` before merging to `main`. |
| **Production** | production | worker.prod.bittasker.com | main | Live site. Deploy only from `main`; protect the branch (e.g. require MR and approvals). |

**Why have all three:**

- **Development:** Lets you validate the entire CI/CD path on a feature branch. You can push to `feat/workers-deployment`, see validate + deploy-development run, and confirm worker.dev.bittasker.com works (e.g. Turnstile) before enabling staging or production deploys. No risk to staging/production.
- **Staging:** Safe place to test changes and share with stakeholders before they go live; typically deployed from `dev`.
- **Production:** Single, protected path to the live app; deployed only from `main`.

Create these in GitLab under **Settings** → **CI/CD** → **Environments** and attach them to the corresponding deploy jobs in `.gitlab-ci.yml`. You can scope CI/CD variables to an environment (e.g. different `VITE_CLIENT_URL` per env) if needed.

---

## 3.1 CI/CD best practices applied

| Practice | How we use it |
|----------|----------------|
| **Validate then deploy** | Validate runs first (tests); deploy jobs run only on their branch. Each deploy job runs its own `npm run build` (or `build:production`) then `wrangler deploy` and purge. No separate build stage. |
| **Cache dependencies** | All jobs use the same cache key (`$CI_COMMIT_REF_SLUG`) for `node_modules/` and `.npm/`. That speeds up `npm ci` and avoids re-downloading packages. |
| **Stages** | validate → deploy. Validation runs first; deploy jobs run only on the branch that targets that environment. Failed validation blocks deploy. |
| **Branch rules** | Each deploy job runs only on the branch that targets that environment (`feat/workers-deployment`, `dev`, `main`). Other branches only run validate. |
| **Single source of env** | Build-time `VITE_*` come from GitLab CI/CD variables (and optionally environment-scoped vars). No reliance on local `.env` for what gets deployed. |

---

## 4. Migration phases

### Phase 1: Pipeline runs and validates (no deploy yet)

**Goal:** GitLab runs the same validation on every push; no deployment from GitLab yet.

1. **Ensure `.gitlab-ci.yml` is in the repo** with a **validate** job (install, test; check/lint/build optional) and **deploy** jobs that run only on their branches (or deploy jobs disabled or not yet configured, e.g. comment out or use `rules` that never run). Deploy jobs each run build inside the job; there are no separate build jobs.
2. **Configure GitLab CI/CD variables** needed for **validate** only (no Cloudflare secrets yet if you don't deploy):
   - Any `VITE_*` required for `npm run build` (e.g. from `.env.example` or wrangler.toml), so the build step in CI succeeds.
3. **Fix validation so it's green:** Uncomment or add check/lint/test as needed; use a single passing test or the placeholder test until the full suite is fixed.
4. **Merge to your main development branch** and confirm every push runs the pipeline and the validate job passes.

**Exit criteria:** Pushing to any branch runs the pipeline and the validate job passes consistently.

**Doc:** Update [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md) "Step 1" (variables) and "Step 3" (run pipeline on feature branch) so they match what's required for validate (and build when you enable it).

---

### Phase 1.5: Deploy development from GitLab (test full path)

**Goal:** Pushing to `feat/workers-deployment` (or the branch you use) triggers validate → build → deploy to the **development** Worker (worker.dev.bittasker.com), so you can test the full path without touching staging or production.

1. **Add deploy-development** in `.gitlab-ci.yml` (or ensure it exists):
   - **deploy-development:** runs only on `feat/workers-deployment`, `needs: [validate]`, script: `npm ci` → `npm run build` → `npx wrangler deploy --env dev` → `ENVIRONMENT=dev node scripts/purge-cache.js`.
   - `rules: if $CI_COMMIT_BRANCH == "feat/workers-deployment"`, environment: `development`, URL: https://worker.dev.bittasker.com
2. **Create "development" environment** in GitLab (**Settings** → **CI/CD** → **Environments**).
3. **Set GitLab CI/CD variables** needed for deploy (project-level or scoped to development): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and all dev `VITE_*` (including `VITE_CLOUDFLARE_SITEKEY`) so the build in CI bakes them into the bundle.
4. **Push to `feat/workers-deployment`** and confirm validate → deploy-development run (build runs inside the job).
5. **Verify** worker.dev.bittasker.com (e.g. signup page and Turnstile). That proves: GitLab build env → wrangler deploy from CI → live Worker.

**Exit criteria:** Pushing to the chosen branch results in a successful deploy to the development Worker and the site works (e.g. Turnstile).

**Doc:** Walkthrough Step 3 (test full path – validate + deploy to development) should match this flow.

---

### Phase 2: Deploy staging from GitLab

**Goal:** Merging (or pushing) to `dev` triggers validate → build → deploy to the staging Worker (e.g. staging.bittasker.com).

1. **Add deploy-staging** in `.gitlab-ci.yml` (or enable if commented):
   - **deploy-staging:** runs only on `dev`, `needs: [validate]`, script: `npm ci` → `npm run build` → `npx wrangler deploy --env staging` → `ENVIRONMENT=staging node scripts/purge-cache.js`.
   - `rules: if $CI_COMMIT_BRANCH == "dev"`, environment: `staging`, URL: your staging Worker URL.
2. **Add GitLab CI/CD variables** for deploy and build:
   - `CLOUDFLARE_API_TOKEN` (masked, protected)
   - `CLOUDFLARE_ACCOUNT_ID`
   - For cache purge: `CLOUDFLARE_CACHE_ZONE_ID`, `CLOUDFLARE_CACHE_PURGE_TOKEN` (optional; purge skips if unset).
3. **Ensure staging build has all required `VITE_*`** in GitLab (e.g. `VITE_CLIENT_URL`, `VITE_CLOUDFLARE_SITEKEY`, etc.) so the staging bundle is correct.
4. **Merge to `dev`** (or push to `dev`) and confirm the pipeline runs validate → deploy-staging (build runs inside deploy-staging), and that the staging URL serves the new build.
5. **Optional:** Disable Cloudflare's "Build" for this Worker (or for the repo) so Cloudflare doesn't run its own build on push; only GitLab deploys.

**Exit criteria:** Pushing to `dev` results in a successful deploy to the staging Worker and the site works (e.g. Turnstile, env).

**Doc:** Walkthrough "Step 4" (test full deployment – merge to dev) should match this flow; add any staging-specific variables to "Step 1".

---

### Phase 3: Deploy production from GitLab

**Goal:** Merging to `main` triggers validate → build → deploy to the production Worker (e.g. worker.prod.bittasker.com).

1. **Add deploy-production** in `.gitlab-ci.yml`:
   - **deploy-production:** runs only on `main`, `needs: [validate]`, script: `npm ci` → `npm run build:production` → `npx wrangler deploy --env production` → `ENVIRONMENT=production node scripts/purge-cache.js`.
   - `rules: if $CI_COMMIT_BRANCH == "main"`, environment: `production`, URL: production Worker URL.
2. **Add production-only variables** in GitLab (can be environment-scoped to `production`):
   - Same Cloudflare token/account if same account; ensure token can deploy the production Worker.
   - Production `VITE_*` (e.g. `VITE_CLIENT_URL`, `VITE_ROBOTS_TXT=prod`, `VITE_CLOUDFLARE_SITEKEY`, etc.).
3. **Protect `main`** (e.g. require MR, approvals) so production deploys are intentional.
4. **Merge to `main`** (e.g. via MR from `dev`) and confirm deploy-production runs (build runs inside the job) and the production site is correct.

**Exit criteria:** Only `main` deploys to production; production site works and cache purge runs when configured.

**Doc:** Walkthrough "Step 4" and "Step 5" should reflect production; document production-scoped variables and protection.

---

### Phase 4: Optional – change which branch deploys to development

**Goal:** By default, `feat/workers-deployment` triggers deploy-development. You can change the branch (e.g. any feature branch, or a dedicated `dev-worker` branch) by editing the `rules` for `deploy-development` in `.gitlab-ci.yml`. For example, to deploy development from any branch except `dev` and `main`, you could use:

```yaml
rules:
  - if: $CI_COMMIT_BRANCH != "dev" && $CI_COMMIT_BRANCH != "main"
```

Use this only if you want development to be updated from multiple branches; otherwise keeping a single branch (e.g. `feat/workers-deployment`) keeps deploys predictable.

---

## 5. What stays manual

- **Local development:** `npm run dev`, `npx wrangler dev` – unchanged.
- **One-off or emergency deploys:** You can still run `npm run deploy:workers:dev`, `npm run deploy:workers`, or `npm run deploy:workers:production` from a machine that has the right `.env` and wrangler login. The pipeline doesn't remove that.
- **Secrets in Cloudflare:** Worker secrets (e.g. Turnstile secret key, API keys) remain in Cloudflare (dashboard or `wrangler secret put`). GitLab only needs build-time vars (e.g. `VITE_CLOUDFLARE_SITEKEY`) and deploy credentials (API token, optional purge token).

---

## 6. Documentation maintenance

To keep this migration and the pipeline understandable for the team:

### When to update the migration plan

- **Branch or env renames:** If you change the branch that deploys to staging/production (e.g. `dev` → `develop`, `main` → `master`), update Phase 2/3 and the "Target state" section.
- **New deploy targets:** If you add a deploy job (e.g. deploy-dev, or a separate preview env), add a short phase or subsection and reference the new job.
- **Removing manual deploy:** If you decide to rely only on the pipeline and document that manual deploy is deprecated, state it here and in the walkthrough.

### When to update the walkthrough

- **New required variables:** Any new GitLab CI/CD variable (e.g. `VITE_*`, Cloudflare token, purge) should be listed in "Step 1" with name, type, protected/masked, and description.
- **Troubleshooting:** New recurring issues (e.g. Turnstile undefined, wrangler auth, cache) should be added under "Troubleshooting" with cause and fix.
- **URL or Worker name changes:** Update table "Branch → Pipeline Behavior" and any URLs (staging, production, dev).

### When to update workers-site/README.md

- **New npm scripts:** e.g. `deploy:workers:dev` – document the command and which Worker/URL it deploys to.
- **Purge behavior:** If purge-cache.js behavior or env vars change, update the "purge" section there and in the walkthrough.

### Single source of truth

- **Pipeline definition:** `.gitlab-ci.yml` is the source of truth for stages, jobs, and rules. The plan and walkthrough should describe what's in the file, not the other way around.
- **Required variables:** Keep a list in the walkthrough (Step 1); when adding a variable in GitLab, add it to the doc in the same change (or a follow-up).

---

## 6. Checklist before going "pipeline-only"

- [ ] Validate job is green on the branch you use (e.g. `feat/workers-deployment`, `dev`).
- [ ] All `VITE_*` and Cloudflare variables are set in GitLab for the deploy jobs that run (development, staging, production as needed).
- [ ] Deploy-development has been run at least once from GitLab (push to `feat/workers-deployment`) and worker.dev.bittasker.com works (e.g. Turnstile).
- [ ] Deploy-staging has been run at least once from GitLab and the staging site works (e.g. Turnstile, API, env).
- [ ] Deploy-production has been run at least once from GitLab and the production site works.
- [ ] Cloudflare "Build" for this Worker (or repo) is disabled so only GitLab deploys.
- [ ] Team knows: push to `feat/workers-deployment` → development deploy; merge to `dev` → staging deploy; merge to `main` → production deploy; manual deploy still available if needed.
- [ ] Walkthrough and this plan are updated with any project-specific branch names, URLs, and variables.

---

## 8. Quick reference

| Action | Command / Trigger |
|--------|-------------------|
| Validate only (other branches) | Push → GitLab runs validate job; no deploy. |
| Deploy development | Push to `feat/workers-deployment` → validate → deploy-development (build runs in job; worker.dev.bittasker.com). |
| Deploy staging | Push or merge to `dev` → validate → deploy-staging (build runs in job). |
| Deploy production | Merge to `main` → validate → deploy-production (build runs in job). |
| Deploy dev worker manually | `npm run deploy:workers:dev` (local). |
| Deploy staging manually | `npm run deploy:workers` (local). |
| Deploy production manually | `npm run deploy:workers:production` (local). |

Pipeline config: `.gitlab-ci.yml`.  
Setup and variables: [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md).