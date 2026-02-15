# Testing Pipeline Improvement

This document describes how BitTasker improves its testing practices and integrates them into the CI/CD pipeline. The goal is to move from shipping code with a broken, ignored test suite to a sustainable testing culture where developers run tests locally and CI enforces quality gates.

**Related docs:**

- **Pipeline migration:** [../ci/workers-pipeline-migration.md](../ci/workers-pipeline-migration.md) – GitLab CI/CD, deployment flow.
- **CI setup:** [../ci/workers-ci-setup-walkthrough.md](../ci/workers-ci-setup-walkthrough.md) – variables, branch strategy, troubleshooting.
- **Testing overview:** [../../.cursor/rules/testing/testing-overview.mdc](../../.cursor/rules/testing/testing-overview.mdc) – testing strategy and patterns.
- **E2E testing:** [e2e-testing.md](./e2e-testing.md) – auth flow, signup/onboarding, credentials, fixtures, run order.

---

## 0. Progress & Decisions (Latest)

**Update (2025-02-13):** Validated tests now live under **`unit/`** and **`integration/routes/`** (no separate `ci/` directory). `npm run test:ci` runs `src/lib/tests/unit/` and `src/lib/tests/integration/routes/`. See `plans/unit-testing-strategy.md` for the full layout and Phase 2 progress.

### Decisions Taken

1. **Validated tests in unit/ and integration/routes/** – CI runs `src/lib/tests/unit/` and `src/lib/tests/integration/routes/`. As we fix tests elsewhere, we move them into the appropriate `unit/` subdir or `integration/routes/` and they join the CI run.

2. **Test triage script** – `scripts/test-triage.js` runs all tests once and groups results by directory. Use `npm run test:triage` to see pass/fail per group and identify where to focus.

3. **Unit layout** – `unit/` contains: placeholder (smoke), helpers, utils, api/services, stores, routes (tasks-page unit + component). `integration/routes/` contains tasks-page integration tests.

### Current CI Test Set

| What runs in CI | Path | Tests |
|-----------------|------|-------|
| Unit (all) | `src/lib/tests/unit/` | 113 |
| Integration (routes) | `src/lib/tests/integration/routes/` | 9 |
| **Total** | unit/ + integration/routes/ | **122** |

### Merge Request coverage report

When a pipeline runs for a **merge request**, the **`coverage`** job runs unit tests with `--coverage` and reports to GitLab so that:

- **Merge request widget** shows the **coverage percentage** and **change vs. target branch** (e.g. +1.2% or -0.5%). GitLab extracts the percentage from the job log using the `coverage` regex in `.gitlab-ci.yml`.
- **Merge request diff** can show **line-by-line coverage** (green/orange) if the Cobertura artifact is parsed successfully; see [GitLab Code coverage](https://docs.gitlab.com/ee/ci/testing/code_coverage.html).

The coverage job runs **only** on `merge_request_event` to keep pushes to `dev`/`master` fast. To verify or change the regex, run `npm run test:ci -- --coverage` locally and match the "All files" line in the text table; the first capturing group in the regex should be the **Lines** percentage.

### How to Run CI Tests

**Locally:**
```bash
npm run test:ci
```

**In CI:** The GitLab pipeline validate job runs `npm run test:ci`, which executes `vitest run src/lib/tests/unit/ src/lib/tests/integration/routes/`. No extra configuration needed. On merge requests, the **coverage** job also runs and reports coverage to the MR.

### How to Run Other Directories (Step-by-Step Fixing)

Use these commands to run each directory independently and fix tests before moving them into `unit/` or `integration/`:

| Command | Directory | Use when |
|---------|-----------|----------|
| `npm run test:unit:validators` | validators.test.ts | Fixing validators |
| `npm run test:unit:formatters` | currencyFormatter, dateFormatter | Fixing formatters |
| `npm run test:unit:crypto` | crypto, encoding | Fixing crypto/encoding |
| `npm run test:unit:auth` | auth, auth-cache-validation, auth-error-recovery | Fixing auth tests |
| *(removed)* | root-other (nostr-message, etc.) moved to unit/helpers | All message tests now in unit/helpers |
| `npm run test:unit:api` | api/services/ | Fixing API service tests |
| `npm run test:unit:utils` | utils/ (escrow, wallet, etc.) | Fixing util tests |
| `npm run test:unit:stores` | stores/ | Fixing store tests |
| `npm run test:unit:components` | components/ | Fixing component tests |
| `npm run test:unit:integration` | integration/escrow/ | Fixing integration tests |

**Workflow:**
1. Pick a directory (suggested order: formatters → crypto → validators → api → utils → stores → components → integration).
2. Run `npm run test:unit:<directory>` to see failures.
3. Fix or skip tests until the directory passes.
4. Move the fixed test files into the appropriate `unit/` subdir or `integration/` (see `plans/unit-testing-strategy.md`).
5. Run `npm run test:ci` to confirm CI still passes.
6. Commit. CI will now run the expanded set.

---

## 1. Current State

### 1.1 Test Suite Overview

| Category          | Location                         | Count | Framework | CI Status              |
|-------------------|----------------------------------|-------|-----------|------------------------|
| **CI tests**      | `src/lib/tests/unit/` + `integration/routes/` | 10    | Vitest    | ✅ Run in CI           |
| **Unit tests**    | `src/lib/tests/` (remainder)     | ~56   | Vitest    | Run per-directory only |
| **Integration**   | `src/lib/tests/integration/`     | 8     | Vitest    | Not in CI              |
| **Component**     | `src/lib/tests/components/`      | ~20   | Vitest    | Not in CI              |
| **E2E (Playwright)** | `tests/e2e/`                  | 2     | Playwright| ✅ Smoke + signup-onboarding (build+preview, stable in CI) |
| **E2E (orphaned)**   | `src/lib/tests/e2e/`          | 8+    | Playwright| ⚠️ Not wired (wrong dir) |

**Latest run (npm run test):**
- 47 test files failed | 21 passed
- 174 tests failed | 459 passed
- 4 errors (e.g. mock/import issues)

### 1.2 Known Issues

1. **CI runs validated set:** `.gitlab-ci.yml` validate job runs `npm run test:ci` (i.e. `src/lib/tests/unit/` and `src/lib/tests/integration/routes/`). Check, lint, build are still commented out.
2. **Playwright split:** Config points to `./tests/e2e` (smoke.spec.ts). E2E specs in `src/lib/tests/e2e/` are not run by default.
3. **Stale script references:** `scripts/playwright.js` `wallet:unit` references non-existent files.
4. **Mock gaps:** Tests fail due to incomplete mocks (e.g. `@bittasker/wallet-core` missing `FEE_TIERS` export).
5. **Outdated tests:** Many tests were written for older APIs or UI and no longer reflect current behavior.
6. **No test discipline:** No pre-commit hooks, no MR requirement to run tests, no convention for "add tests with features."

---

## 2. Goals

1. **Re-establish a passing baseline** – Identify and fix or exclude broken tests so CI can run a real subset.
2. **Incremental pipeline integration** – Add validated test directories to CI one at a time.
3. **Developer workflow** – Make it easy to run relevant tests during development.
4. **Sustainable practices** – "Add tests with new features" and "fix or remove tests you break."

---

## 3. Strategy: Curated CI Directory (Option B)

Validated tests live in `src/lib/tests/unit/` and `src/lib/tests/integration/routes/`; CI runs those. As tests are fixed, they are moved into the appropriate `unit/` or `integration/` subdir. See section 0 and `plans/unit-testing-strategy.md` for current set and workflow.

---

## 4. Staged Implementation Plan

### Phase 1: Triage and Tooling

**Goal:** Understand what passes, what fails, and why. Add npm scripts for targeted runs.

1. **Add npm scripts** (see package.json): `test:ci`, `test:unit:*` per directory.
2. **Triage script** – `scripts/test-triage.js`; use `npm run test:triage` to track progress.
3. **Document triage results** in a table (e.g. in this doc): Directory | Total | Pass | Fail | Blockers.
4. **Fix `scripts/playwright.js`** – Remove or update references to non-existent tests.

### Phase 2: Establish a "Green Set" — IN PROGRESS

Run each directory with `npm run test:unit:<dir>`, fix tests, move fixed files into `ci/`. Suggested order: formatters → crypto → validators → api → utils → stores → components → integration.

### Phase 3: Expand the Green Set (ongoing)

One directory per MR; consider separate CI job for integration tests. E2E: see [e2e-testing.md](./e2e-testing.md).

### Phase 4: Developer Workflow and Conventions (ongoing)

Pre-commit (optional), MR guidelines, documentation. Re-enable check and lint in CI (see [../ci/workers-pipeline-migration.md](../ci/workers-pipeline-migration.md)).

---

## 5. Quick Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run test:ci` | **CI tests only** – runs `src/lib/tests/unit/` and `src/lib/tests/integration/routes/` |
| `npm run test` | Full unit test run (currently many failures) |
| `npm run test:unit` | Vitest watch mode |
| `npm run test:triage` | Pass/fail report per directory |
| `npm run test:unit:validators` | Validators only |
| `npm run test:unit:formatters` | Currency + date formatters |
| `npm run test:unit:crypto` | Crypto + encoding |
| `npm run test:unit:auth` | Auth tests |
| *(removed)* | root-other: nostr-message, nip44-message now in unit/helpers |
| `npm run test:unit:api` | API services |
| `npm run test:unit:utils` | Utils (escrow, wallet, etc.) |
| `npm run test:unit:stores` | Stores |
| `npm run test:unit:components` | Components |
| `npm run test:unit:integration` | Integration (escrow) |
| `npm run test:playwright run` | Playwright E2E (uses tests/e2e/) |
| `npm run test:playwright run tests/e2e/smoke.spec.ts` | Smoke only |

---

## 6. How to test the pipeline (after CI config changes)

### 1. Local checks (before you push)

Run the same commands CI runs so you don’t waste a pipeline on a failing step:

```bash
# What the unit job runs
npm run test:ci

# What the coverage job runs (MRs only) — optional; can be slow
npm run test:ci -- --coverage
```

If `test:ci` fails locally, the **unit** (and **coverage**) jobs will fail in CI. Fix tests first, then push.

### 2. Push to your branch and watch the pipeline

1. Commit your CI/config changes on `feat/unit-test-audit`.
2. Push: `git push origin feat/unit-test-audit`.
3. In GitLab: **CI/CD → Pipelines**. Open the new pipeline.
4. Confirm:
   - **build** and **unit** run (and are picked up by a **self-hosted** runner if you use tags).
   - After both pass, **playwright** runs.
   - **coverage** does **not** run (it only runs on merge requests).
   - If all validate jobs pass, **deploy-development** runs (because the branch is `feat/unit-test-audit`).

### 3. Open a merge request to test coverage and MR widget

1. Create an MR **from** `feat/unit-test-audit` **into** `dev` (or `master`).
2. Push a commit or use the existing one; the MR pipeline runs.
3. In the pipeline, confirm:
   - **build**, **unit**, **coverage**, and **playwright** all run.
   - **coverage** job produces the Cobertura artifact and the `coverage` regex extracts a percentage.
4. In the **merge request**:
   - Check the MR widget for **test coverage** (current % and change vs. target branch).
   - Open the **Changes** tab and see if the diff shows line-by-line coverage (green/orange) once the pipeline has finished and GitLab has parsed the report.

### 4. Quick checklist

| What to verify | How |
|----------------|-----|
| Unit tests pass in CI | **unit** job is green. |
| Coverage runs only on MRs | **coverage** appears in MR pipelines; not in branch-only pipelines. |
| Self-hosted runner is used | Job logs or runner list show the job ran on a runner with tag `self-hosted`. |
| Deploy only on feat/unit-test-audit | **deploy-development** runs when pipeline is for `feat/unit-test-audit`; not for other branches (e.g. a random feature branch). |

---

## 7. Related Files

| File | Role |
|------|------|
| `.gitlab-ci.yml` | Pipeline: build, unit, coverage (MR only), playwright, deploy |
| `package.json` | `test:ci`, `test:unit:*`, `test:triage` scripts |
| `src/lib/tests/unit/`, `src/lib/tests/integration/routes/` | Validated tests run in CI |
| `scripts/test-triage.js` | Triage script – pass/fail per directory |
| `playwright.config.ts` | E2E config; testDir = tests/e2e |
| `tests/e2e/01-signup-onboarding.spec.ts` | Auth: creates users + credentials |
| `tests/e2e/02-credentials-login.spec.ts` | Auth: validates passkey login |

---

*Last updated: 2025-02-04*
