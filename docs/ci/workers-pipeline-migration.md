# Migration: Manual Wrangler Deploys → GitLab CI/CD Pipeline

This document describes how to move from deploying BitTasker to Cloudflare Workers manually (terminal + wrangler) to a full GitLab CI/CD pipeline that runs tests, builds, and deploys to Cloudflare. It also explains why this migration is worthwhile for BitTasker.

**Related docs:**

- **Setup walkthrough:** [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md) – step-by-step configuration (variables, branch strategy, troubleshooting).
- **Worker serving logic:** [../../workers-site/README.md](../../workers-site/README.md) – how the Worker and KV fit together.

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
|---------|------------------------|
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

- **Merge requests:** Pipeline runs **validate**: build + coverage (tests with coverage for MR widget). No deploy.
- **Push to dev:** validate (build + unit) → **deploy-development** (reuses build artifact). Deploys to worker.dev.bittasker.com.
- **Push to master:** validate (build + unit). deploy-production is commented out until ready.
- **Other branches:** No pipeline on push; pipeline runs when an MR is open (merge_request_event). See [pipeline-branch-strategy.md](./pipeline-branch-strategy.md).
- **No feature-branch names** in `.gitlab-ci.yml`; only `merge_request_event`, `dev`, and `master` (or `main`).
- **Playwright (E2E):** Commented out until dev backend is ready. Deploy needs only [build].
- **Cloudflare:** No build on Cloudflare; GitLab builds and deploys via wrangler.
- **Manual deploys:** Still available (e.g. `npm run deploy:workers:dev`) for one-off or emergency use.

---

## 3. Environments: development, staging, production

| Environment | GitLab env name | Worker URL | Branch | Purpose |
|-------------|-----------------|------------|--------|---------|
| **Development** | development | worker.dev.bittasker.com | dev | Validate + deploy from `dev`. Use for integration testing and demos before production. |
| **Staging** | staging | staging.bittasker.com | dev (when deploy-staging uncommented) | Pre-production; deploy from `dev` before merging to `main`. |
| **Production** | production | worker.prod.bittasker.com | main / master | Live site. Deploy only from default branch; protect with MR and approvals. |

**Why have all three:**

- **Development:** Lets you validate the entire CI/CD path on a feature branch. You can push to `feat/workers-deployment`, see validate + deploy-development run, and confirm worker.dev.bittasker.com works (e.g. Turnstile) before enabling staging or production deploys. No risk to staging/production.
- **Staging:** Safe place to test changes and share with stakeholders before they go live; typically deployed from `dev`.
- **Production:** Single, protected path to the live app; deployed only from `main`.

Create these in GitLab under **Settings** → **CI/CD** → **Environments** and attach them to the corresponding deploy jobs in `.gitlab-ci.yml`. You can scope CI/CD variables to an environment (e.g. different `VITE_CLIENT_URL` per env) if needed.

---

## 4. Migration phases

- **Phase 1:** Pipeline runs validate only (no deploy). See walkthrough Step 1 (variables for build).
- **Phase 1.5:** Deploy development from GitLab (push to `feat/workers-deployment`). See walkthrough Step 3.
- **Phase 2:** Deploy staging (merge to `dev`). See walkthrough Step 4.
- **Phase 3:** Deploy production (merge to `main`). Add production variables; protect `main`.
- **Phase 4 (optional):** Change which branch deploys to development (edit `rules` in `.gitlab-ci.yml`).

Full step-by-step: [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md).

---

## 5. What stays manual

- **Local development:** `npm run dev`, `npx wrangler dev` – unchanged.
- **One-off or emergency deploys:** You can still run `npm run deploy:workers:dev`, `npm run deploy:workers`, or `npm run deploy:workers:production` from a machine that has the right `.env` and wrangler login. The pipeline doesn't remove that.
- **Secrets in Cloudflare:** Worker secrets (e.g. Turnstile secret key, API keys) remain in Cloudflare (dashboard or `wrangler secret put`). GitLab only needs build-time vars (e.g. `VITE_CLOUDFLARE_SITEKEY`) and deploy credentials (API token, optional purge token).

---

## 6. Documentation maintenance

- **Pipeline definition:** `.gitlab-ci.yml` is the source of truth for stages, jobs, and rules.
- **Setup and variables:** Keep the list in [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md); when adding a variable in GitLab, update the doc in the same change.

---

## 7. Quick reference

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
