# Testing in CI — Pipeline, Triage, and Coverage in GitLab

How tests run in the pipeline, how to triage and fix tests by directory, how to validate pipeline changes, and how GitLab gets coverage into the MR widget and diff.

**See also:** [Testing README](./README.md) (state of tests, practices, commands).

---

## 1. Pipeline summary

- **Branch strategy:** Pipeline runs on **merge requests** (build + coverage) and on pushes to **`dev`** and **`master`** (build + coverage). No feature-branch names in config; see [Pipeline branch strategy](../ci/pipeline-branch-strategy.md).
- **Unit vs coverage:** **Coverage** runs on MRs and on push to dev/master (one test run per pipeline). So the **target branch (dev) has a stored coverage** and the MR widget can show “change vs. target”. The **unit** job (tests only, no coverage) does not run on MR or dev/master.
- **E2E (Playwright):** Commented out in CI until the dev backend is ready. Re-enable per [pipeline-branch-strategy.md § Re-enabling Playwright](../ci/pipeline-branch-strategy.md#6-re-enabling-playwright-e2e).

### Current CI test set

| What runs in CI      | Path                                      | Approx                     |
| -------------------- | ----------------------------------------- | -------------------------- |
| Unit                 | `src/lib/tests/unit/`                     | ~65 files                  |
| Integration (routes) | `src/lib/tests/integration/routes/`       | 1 file                     |
| Components           | `src/lib/tests/components/`               | ~13 files                  |
| **Total**            | unit/ + integration/routes/ + components/ | **~79 files, ~1046 tests** |

Command: `npm run test:ci` → `vitest run src/lib/tests/unit/ src/lib/tests/integration/routes/ src/lib/tests/components/`.

### Merge request coverage

On **merge request** pipelines, the **coverage** job runs tests with `--coverage`. On **push to dev/master**, the same **coverage** job runs so GitLab stores a coverage value for the target branch. Then:

- **MR widget** shows this MR’s coverage % and **change vs. target** (e.g. +0.5% or -0.2%).
- **MR diff** can show line-by-line coverage (green/orange) from the Cobertura artifact.

If you don’t see “change vs. target”, the target branch (dev) may not have had a successful coverage job yet—merge or push to dev once so it runs; after that, new MRs will show the comparison. Details: [§ Coverage in GitLab](#4-coverage-in-gitlab) below.

---

## 2. How to run CI tests and triage

**Locally (same as CI):**

```bash
npm run test:ci
```

**With coverage (what the MR coverage job runs):**

```bash
npm run test:ci -- --coverage
```

**Triage (pass/fail per directory):**

```bash
npm run test:triage
```

### Per-directory commands (fixing tests)

Use these to fix one area at a time, then run `npm run test:ci` before pushing:

| Command                         | Directory                                        | Use when                 |
| ------------------------------- | ------------------------------------------------ | ------------------------ |
| `npm run test:unit:validators`  | validators                                       | Fixing validators        |
| `npm run test:unit:formatters`  | currencyFormatter, dateFormatter                 | Fixing formatters        |
| `npm run test:unit:crypto`      | crypto, encoding                                 | Fixing crypto/encoding   |
| `npm run test:unit:auth`        | auth, auth-cache-validation, auth-error-recovery | Fixing auth tests        |
| `npm run test:unit:api`         | api/services/                                    | Fixing API service tests |
| `npm run test:unit:utils`       | utils/ (escrow, wallet, etc.)                    | Fixing util tests        |
| `npm run test:unit:stores`      | stores/                                          | Fixing store tests       |
| `npm run test:unit:components`  | components/                                      | Fixing component tests   |
| `npm run test:unit:integration` | integration/escrow/                              | Fixing integration tests |

**Workflow:** Fix a directory → run its script until green → run `npm run test:ci` → commit. See [README.md § Directory layout](./README.md#22-directory-layout) for where to place tests.

---

## 3. How to test the pipeline (after CI/config changes)

### Local checks (before push)

```bash
npm run test:ci
# Optional: npm run test:ci -- --coverage
```

If `test:ci` fails locally, the **unit** (and **coverage**) jobs will fail in CI.

### Push to dev or master

1. Push: `git push origin dev` (or `master`).
2. In GitLab: **CI/CD → Pipelines**. Confirm **build** and **unit** run; **coverage** does **not** run on branch pushes.

### Open a merge request (coverage + widget)

1. Create an MR into `dev` (or `master`). Pipeline runs with **build**, **unit**, **coverage**.
2. In the MR: check the **test coverage** in the widget (% and change vs. target).
3. In **Changes**: after the pipeline finishes, check for line-by-line coverage (green/orange) from the Cobertura report.

### Checklist

| Verify                | How                                                               |
| --------------------- | ----------------------------------------------------------------- |
| Unit tests pass in CI | **unit** (branch) or **coverage** (MR) job is green.              |
| Coverage only on MRs  | **coverage** job appears in MR pipelines only.                    |
| Deploy only on dev    | **deploy-development** runs when pipeline is for `dev`.           |
| Branch strategy       | [pipeline-branch-strategy.md](../ci/pipeline-branch-strategy.md). |

---

## 4. Coverage in GitLab

How the MR widget gets its percentage and how the diff gets line-by-line coverage.

### 4.1 Widget percentage — `coverage` regex

- **Where:** In `.gitlab-ci.yml`, the job that runs tests with coverage has a **`coverage:`** key with a **regex**.
- **What happens:** GitLab runs the regex against the **job log**; the **first capturing group** must match the number (e.g. Lines %). That value is stored as this pipeline’s coverage.
- **MR widget:** Compares **MR pipeline coverage** to **target branch’s last successful coverage** and shows current % and change (e.g. +1.2% or -0.5%).

**In BitTasker:** The regex matches the Vitest text table “All files” line and captures the **Lines** percentage:

```yaml
coverage: '/All files[^|]*\|[^|]*\|[^|]*\|[^|]*\|\s*(\d+\.?\d*)%?/'
```

### 4.2 Line-by-line coverage in the diff — Cobertura artifact

- **Where:** The same job uploads an artifact with **`reports: coverage_report`** and path to **Cobertura** XML (e.g. `coverage/cobertura-coverage.xml`).
- **What happens:** GitLab parses the XML and attaches covered/not covered to **source lines**; in the MR **Changes** tab the diff shows green/orange.
- The **widget percentage** comes from the regex (job log), **not** from the Cobertura file.

### 4.3 Summary

| What you see                      | Source                                           |
| --------------------------------- | ------------------------------------------------ |
| **Coverage % in MR widget**       | Regex on the **job log** (`coverage` keyword).   |
| **Change vs. target**             | MR pipeline % vs. target branch’s last stored %. |
| **Green/orange lines in MR diff** | **Cobertura artifact** (`coverage_report`).      |

### 4.4 What else is possible

- **Repository analytics → Test coverage:** Analyze → Repository analytics — coverage over time, CSV.
- **Coverage badge:** Settings → General → Badges — “Test coverage report” for default branch.
- **Coverage-Check approval rule (Premium/Ultimate):** Require extra approval if MR reduces coverage.
- **Multiple jobs / wildcard reports:** Aggregate coverage from several jobs or Cobertura files if you split tests.

**References:** [GitLab: Code coverage](https://docs.gitlab.com/ee/ci/testing/code_coverage.html), [Cobertura coverage report](https://docs.gitlab.com/ee/ci/testing/code_coverage/cobertura.html). BitTasker: `.gitlab-ci.yml` → `coverage` job; `vite.config.ts` → `test.coverage`.

---

## 5. Related files

| File                                  | Role                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| `.gitlab-ci.yml`                      | build, unit (branch), coverage (MR), deploy; Playwright commented out |
| `docs/ci/pipeline-branch-strategy.md` | When pipeline runs, unit vs coverage, re-enabling E2E                 |
| `package.json`                        | `test:ci`, `test:unit:*`, `test:triage`                               |
| `vite.config.ts`                      | Vitest + coverage (Cobertura path)                                    |
| `scripts/test-triage.js`              | Pass/fail per directory                                               |
| `playwright.config.ts`                | E2E; testDir = tests/e2e                                              |
