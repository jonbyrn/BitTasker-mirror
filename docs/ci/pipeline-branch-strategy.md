# Pipeline Branch Strategy

This document explains **when** the BitTasker GitLab pipeline runs and **what** to put in the job rules so you don’t hardcode feature branches.

**See also:** [workers-pipeline-migration.md](./workers-pipeline-migration.md) (environments, deploy flow), [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md) (variables, troubleshooting).

---

## 1. Recommended approach: long-lived branches only

**Do not hardcode feature branch names** (e.g. `feat/unit-test-audit`) in `.gitlab-ci.yml`. Use only:

- **`merge_request_event`** — pipeline runs when a merge request is created or updated (any source branch).
- **`dev`** — pipeline runs on push to the integration/development branch.
- **`master`** (or **`main`**) — pipeline runs on push to the default/production branch.

**Why:**

- Feature branches come and go; the pipeline config would need constant edits.
- For feature work you **open an MR** (e.g. `feat/xyz` → `dev`). The pipeline runs because of `merge_request_event`.
- When you **merge to `dev`**, the push to `dev` runs the pipeline and can deploy to the dev worker.
- One place to change branch names (e.g. switch from `master` to `main`) instead of many.

---

## 2. When the pipeline runs (current setup)

| Trigger | What runs | Deploy |
|--------|-----------|--------|
| **Merge request** (any source branch → dev or master) | build, coverage (tests + coverage for MR widget). No unit job (coverage runs the tests). | No. |
| **Push to `dev`** | build, unit (tests, no coverage). | Yes → deploy-development (worker.dev.bittasker.com). |
| **Push to `master`** | build, unit. | No (deploy-production is commented out until ready). |
| **Push to any other branch** (e.g. `feat/unit-test-audit`) | Nothing, unless an MR is open — then the **MR pipeline** runs (build + coverage). | No. |

So: **feature work = open an MR** to get CI. No need to add the feature branch name to the config.

---

## 3. Unit vs coverage: why only one test run per pipeline

- **On merge requests:** Only the **coverage** job runs (`npm run test:ci -- --coverage`). It runs the same tests as `test:ci` and adds the coverage report for the MR widget and Cobertura. We do **not** run the **unit** job on MRs, so we don’t run the test suite twice.
- **On branch pushes (dev, master):** Only the **unit** job runs (`npm run test:ci`). No coverage report needed for a branch push.

Result: **one test run per pipeline**, and coverage only where it’s useful (MRs).

---

## 4. If your default branch is `main` not `master`

In `.gitlab-ci.yml`, replace every:

```yaml
- if: $CI_COMMIT_BRANCH == "master"
```

with:

```yaml
- if: $CI_COMMIT_BRANCH == "main"
```

in the **build**, **unit**, and (when uncommented) **playwright** rules. Do the same in **deploy-production** when you enable it.

---

## 5. Temporarily running the pipeline (or deploy) from a feature branch

If you need to run the full pipeline or deploy from a feature branch (e.g. to test the pipeline or the dev worker):

**Option A — Run pipeline on push to that branch:**  
Add one rule to **build** and **unit** (and optionally **deploy-development** if you want deploy from that branch):

```yaml
- if: $CI_COMMIT_BRANCH == "feat/your-branch"
```

Remove it when you’re done.

**Option B — Only deploy from that branch:**  
Add the same rule only to **deploy-development**. Build/unit still only run on MR, dev, master; only deploy runs for that branch. Prefer Option A if you want validate before deploy.

---

## 6. Re-enabling Playwright (E2E)

When the backend is ready for E2E:

1. Uncomment the **playwright** job in `.gitlab-ci.yml`.
2. Add **playwright** back to **deploy-development** (and staging/production) **needs**:  
   `needs: [build, playwright]`.
3. Set CI/CD variables: `VITE_API_URL`, `VITE_E2E_TURNSTILE_BYPASS`, `VITE_NOSTR_RELAY_URL` (see [e2e-testing.md](../testing/e2e-testing.md)).

---

## 7. Cache (faster installs and less upload time)

The pipeline caches `node_modules/` and `.npm/` so `npm ci` can reuse downloaded packages.

- **Cache key:** Based on **`package-lock.json`** (checksum). Same lockfile across branches and MRs → same key → one shared cache. When you change dependencies, the key changes and a new cache is built.
- **Who updates the cache:** Only the **build** job uses `policy: pull-push`. The **unit**, **coverage**, and **deploy** jobs use `policy: pull` so they restore cache but **don’t upload** it. That saves about 1–2 minutes per job and avoids three jobs uploading the same cache.
- **“No URL provided” in logs:** The cache is stored **locally on the runner**. If you have one runner, that’s fine. With **multiple runners**, each has its own local cache unless you configure a **distributed cache** (e.g. S3) in the runner’s `config.toml` (see [GitLab: Caching](https://docs.gitlab.com/runner/configuration/advanced-configuration.html#the-runnerscache-section)).

---

## 8. Quick reference

| Branch / event | build | unit | coverage | deploy-development |
|----------------|-------|------|----------|--------------------|
| Merge request | ✅ | ❌ | ✅ | ❌ |
| Push to dev | ✅ | ✅ | ❌ | ✅ |
| Push to master | ✅ | ✅ | ❌ | ❌ |
| Push to other branch | ❌ | ❌ | ❌ | ❌ (MR pipeline runs when MR exists) |

**Cache:** Key = `package-lock.json` checksum. Build = pull-push; unit, coverage, deploy = pull only.
