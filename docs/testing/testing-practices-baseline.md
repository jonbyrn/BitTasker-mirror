# Testing Practices Baseline — What We Have and What’s Missing

**Purpose:** Define the baseline for good testing practices for the BitTasker team and close the gaps.  
**See also:** [state-of-testing.md](./state-of-testing.md) (what runs where), [pipeline-improvement.md](./pipeline-improvement.md) (CI and triage).

---

## 1. What we already have ✅

| Area | Status |
|------|--------|
| **CI runs tests** | Pipeline runs `test:ci` (unit + integration/routes + components) on MRs (as coverage job) and on dev/master (as unit job). |
| **Coverage in MRs** | Coverage job on merge requests; MR widget shows % and change vs. target; Cobertura for diff. |
| **Single “CI set”** | `npm run test:ci` is the one command that matches CI. |
| **Test layout** | Clear layout: `unit/`, `integration/`, `components/`, `_pending/`; Vitest excludes `_pending/`. |
| **Docs** | state-of-testing, pipeline-improvement, coverage-how-it-works, e2e-testing, branch strategy, coverage expansion plan, unit-testing strategy. |
| **Triage** | `npm run test:triage` and per-group scripts (`test:unit:stores`, etc.) for fixing tests. |
| **Principles (in plans)** | “Only test used code,” “fix or remove tests you break,” chunk strategy for coverage. |
| **Cache** | CI cache key from `package-lock.json`; only build uploads, others pull. |

---

## 2. What’s missing (gaps)

### 2.1 Written policy and contribution rules

| Gap | Why it matters |
|-----|----------------|
| **No CONTRIBUTING.md** | New contributors and the team don’t have a single place that says “run tests before pushing” and “where tests live.” |
| **No explicit “when to add tests”** | “Tests are part of done” exists in a plan but isn’t in a place everyone sees (e.g. CONTRIBUTING or README). |
| **No “fix or remove tests you break”** | Not written as a project rule; people may skip or leave broken tests. |

**Recommendation:** Add **CONTRIBUTING.md** (or a short **Testing** section in README) that states: (1) run `npm run test:ci` before pushing/creating an MR, (2) link to [state-of-testing.md](./state-of-testing.md), (3) “New helpers, stores, API services, or critical UI should include or extend tests where practical,” (4) “If you change behavior and tests fail, update or remove the tests; don’t leave them skipped without a tracked reason.”

---

### 2.2 Merge request and review standards

| Gap | Why it matters |
|-----|----------------|
| **No MR template** | No checklist reminding to run tests or add tests for new logic. |
| **No reviewer checklist** | Reviewers aren’t prompted to check “tests added/updated where appropriate.” |
| **Pipeline must succeed** | Should be enforced in GitLab (Settings → Merge requests) so red pipelines block merge. |

**Recommendation:**  
- Add a **merge request description template** (e.g. `.gitlab/merge_request_templates/Default.md`) with a checklist: “I ran `npm run test:ci` locally,” “New/changed logic has tests where applicable (or I documented why not).”  
- In **Settings → Merge requests**, enable **“Pipelines must succeed”** (and optionally “All threads resolved”).  
- In your **code review guidelines** (or CONTRIBUTING), add: “Check that tests were added or updated for the change where it makes sense.”

---

### 2.3 Local guardrails (hooks)

| Gap | Why it matters |
|-----|----------------|
| **No pre-push hook** | Easy to push without running tests; CI catches it but feedback is slower. |
| **No pre-commit (optional)** | No fast lint/format on commit; style and type issues can pile up. |

**Recommendation:**  
- **Pre-push:** Run `npm run test:ci` (and optionally `npm run check` and `npm run lint`). Use **Husky** + a `pre-push` script. Document that `git push --no-verify` is for emergencies and that CI must still pass.  
- **Pre-commit (optional):** Run lint and/or format on staged files (e.g. **lint-staged** + ESLint/Prettier) so commits stay quick.  
- Don’t run E2E in hooks (too slow and env-dependent).

---

### 2.4 Definition of done and coverage

| Gap | Why it matters |
|-----|----------------|
| **No written “definition of done”** | “Done” isn’t explicitly tied to tests, so features can be merged without any. |
| **Coverage is informational only** | No gate or guideline; coverage can drop with no process. |
| **.cursor rule is aspirational** | testing-overview.mdc mentions 80% thresholds and Gitea; reality is GitLab, ~22% coverage, no thresholds. |

**Recommendation:**  
- Add a short **Definition of done** (in CONTRIBUTING or docs): “Feature is done when: it works, it’s reviewed, and **testable business logic (helpers, stores, API, critical UI) has tests or existing tests were updated**.”  
- Keep coverage **non-blocking** for now but document: “We track coverage in MRs; avoid lowering coverage without a reason; new code in helpers/stores/API should add tests where practical.”  
- Optionally add a **soft gate** later (e.g. “warn if coverage drops” in CI).  
- Align **.cursor/rules/testing/testing-overview.mdc** with reality (GitLab CI, current commands, no fake thresholds) or mark it as “target state.”

---

### 2.5 Conventions and onboarding

| Gap | Why it matters |
|-----|----------------|
| **Where to put new tests** | New joiners may not know: unit vs integration vs components, and that `_pending/` is excluded. |
| **Mocking conventions** | No short guide on how to mock stores, Capacitor, i18n, or fetch in tests. |
| **README doesn’t point to “how we test”** | README has testing bullets but no clear “Start here: docs/testing/state-of-testing.md.” |

**Recommendation:**  
- In **state-of-testing.md** (or a short **testing-conventions.md**), add: “New unit tests for `$lib/utils/helpers/X` → `src/lib/tests/unit/helpers/X.test.ts`; for stores → `unit/stores/`; for API → `unit/api/`; for Svelte components → `components/`. Integration tests for a route → `integration/routes/` or `integration/escrow/`. Do not put tests in `_pending/` unless they’re broken and being fixed.”  
- Add a **Testing** section in **README** that links to **docs/testing/state-of-testing.md** and says: “Run `npm run test:ci` before pushing; see [State of testing](docs/testing/state-of-testing.md) for what runs in CI and how to run tests.”  
- Optionally add a short **Mocking** subsection (in testing-conventions or state-of-testing): point to existing mocks in `src/lib/mocks/`, vitest-setup-client, and “mock at the boundary (e.g. store or API), not every internal.”

---

### 2.6 Flaky and pending tests

| Gap | Why it matters |
|-----|----------------|
| **No policy for flaky tests** | If a test is flaky, team may skip it or ignore it; no rule to fix or quarantine. |
| **_pending/ not tracked in backlog** | Easy to forget to fix or remove. |

**Recommendation:**  
- State in CONTRIBUTING or testing docs: “**Flaky tests:** Fix or quarantine (move to `_pending/` with a comment and an issue or note). Don’t leave flaky tests in the CI set.”  
- In **state-of-testing** and **_pending/README.md**, keep the list of pending tests and link to issues or “why excluded.” Consider a backlog item: “Unblock and re-enable _pending tests (or remove if obsolete).”

---

### 2.7 E2E and check/lint in CI

| Gap | Why it matters |
|-----|----------------|
| **E2E disabled in CI** | No automated E2E until backend is ready; team should know when to run it locally. |
| **check and lint not in CI** | Type and lint errors can be merged. |

**Recommendation:**  
- Document: “E2E is not in CI yet; run `npm run test:e2e` locally before merging for changes that touch auth, wallet, or messages.”  
- When the team is ready: **re-enable `npm run check` and `npm run lint`** in the same job as `test:ci` (or a preceding job) so the pipeline enforces types and lint.

---

## 3. Prioritized action list

### High impact, low effort (do first)

1. **README: add “Testing” section** — One short paragraph + link to `docs/testing/state-of-testing.md` and “run `npm run test:ci` before pushing.”  
2. **GitLab: Pipelines must succeed** — In Settings → Merge requests, require pipeline success before merge.  
3. **CONTRIBUTING.md** — Create with: “Run `npm run test:ci` before push/MR,” “New testable logic should have tests,” “Fix or remove tests you break,” link to state-of-testing and this baseline.  
4. **MR description template** — Checklist: “I ran `npm run test:ci`,” “New/changed logic has tests (or I documented why not).”

### Medium effort, high impact

5. **Pre-push hook** — Husky + `npm run test:ci` (and optionally check + lint); document `--no-verify`.  
6. **Definition of done** — Add to CONTRIBUTING or docs: done = works + reviewed + tests for testable logic.  
7. **Reviewer checklist** — In CONTRIBUTING or MR template: “Reviewer: confirm tests added/updated where appropriate.”

### When the team is ready

8. **Re-enable check + lint in CI** — Same job as unit/coverage or a separate fast job.  
9. **Testing conventions doc** — Where to put tests, where to mock, link to existing mocks.  
10. **Align .cursor testing-overview** — Match GitLab, real commands, and current coverage; or mark as target state.  
11. **Soft coverage gate (optional)** — e.g. “warn if coverage drops” in CI; later “fail if below X%” if desired.  
12. **Pre-commit (optional)** — lint-staged + format/lint on staged files.

---

## 4. One-paragraph “testing policy” (copy-paste for CONTRIBUTING)

You can use this as the Testing section of CONTRIBUTING.md or README:

> **Testing:** Run `npm run test:ci` before pushing or opening a merge request. The same suite runs in CI (on MRs with coverage, on dev/master without). New or changed helpers, stores, API services, or critical UI should include or extend tests where practical. If you change behavior and tests fail, update or remove the tests; don’t leave them skipped without a tracked reason (e.g. in `_pending/` with a note). See [State of testing](docs/testing/state-of-testing.md) for what runs where and how to run tests.

---

## 5. References

| Doc | Content |
|-----|--------|
| [state-of-testing.md](./state-of-testing.md) | What exists, what runs in CI, layout, commands |
| [pipeline-improvement.md](./pipeline-improvement.md) | CI test set, triage, per-dir commands |
| [coverage-how-it-works.md](./coverage-how-it-works.md) | MR coverage widget, Cobertura |
| [../ci/pipeline-branch-strategy.md](../ci/pipeline-branch-strategy.md) | When pipeline runs, cache |
| `plans/testing-pipeline-comprehensive-plan.md` | Phased rollout (hooks, gates, culture) |
| `plans/unit-testing-strategy.md` | Unit layout, principles |
| `plans/coverage-expansion-plan.md` | Coverage phases, next targets |
