# Comprehensive Testing Pipeline Plan — BitTasker

**Status:** Discussion / planning  
**Created:** 2025-02-15  
**Goal:** Level up the team with sustainable testing practices, local hooks, and a faster, more reliable CI/CD pipeline that deploys to Cloudflare Workers.

This plan is for **discussion**. It proposes practices, hooks, and pipeline changes in a phased way so you can adopt them incrementally.

---

## 1. Current State Summary

| Area | Current | Notes |
|------|--------|------|
| **Unit tests** | ~670 tests, 43 files in CI (`unit/` + `integration/routes/` + `components/`) | `test:ci` — all pass. Coverage ~19% statements. |
| **Unit in CI** | **Commented out** in `.gitlab-ci.yml` | Validate job only runs build + Playwright. |
| **Check / Lint in CI** | Commented out | No type-check or lint gate. |
| **E2E** | Playwright, ordered suite (01→04), runs after build | Needs build artifact; full run is slow. |
| **Pipeline shape** | `validate` (build → playwright) → `deploy` | Single build reused by E2E and deploy. Unit not in chain. |
| **Local discipline** | None | No pre-commit/pre-push; no MR rule to run tests. |
| **Deploy** | `feat/workers-deployment` → dev worker | Staging/production jobs commented. |

**Pain points:**

- Pipeline feels slow (build + full E2E on every MR/target branch).
- Unit tests exist and are green locally but are **not run in CI**.
- No guardrails before commit/push — broken tests can be pushed.
- Team has neglected testing; current expansion (e.g. coverage plan) is corrective.

---

## 2. Good Practices to Introduce (Overview)

### 2.1 Testing culture

- **“Tests are part of the definition of done.”** — New features/changes should include or update tests when they touch testable logic (helpers, stores, services, critical UI).
- **“Fix or remove tests you break.”** — CI (and hooks) run a known-good set; if you change behavior, update tests or remove obsolete ones; no “skip” without a tracked reason.
- **Document where tests live** — Already in place (`unit/`, `integration/`, `components/`, `_pending/`); keep `docs/testing/` and `plans/` in sync so new joiners know how to run and add tests.

### 2.2 Local hooks (commit / push)

- **Pre-commit (optional but recommended):** Fast checks only: e.g. lint + type-check (`npm run check`, `npm run lint`). Avoid running the full unit suite on every commit so commits stay quick.
- **Pre-push (recommended):** Run the same set CI will run: `npm run test:ci` (and optionally `npm run check` + `npm run lint`). Fails push if tests fail, so CI is less likely to fail for “I forgot to run tests.”
- **E2E:** Do **not** run E2E in hooks — too slow and environment-dependent. Keep E2E in CI only (and optionally manual before merging).

### 2.3 CI/CD pipeline

- **Re-enable unit tests in CI** — Uncomment and fix the validate job that runs `test:ci` (and optionally check + lint). Run in **parallel** with `build` so total time doesn’t increase (or only slightly).
- **Keep a single build** — E2E and deploy keep reusing the same build artifact; no double build.
- **Optional: coverage report in CI** — Run `test:ci -- --coverage`, publish HTML (or a summary) as artifact; optionally enforce a **soft** gate (e.g. “no decrease on main”) later.
- **Faster feedback:** Run unit + check + lint first; only run build + E2E when those pass (or in parallel with build, with E2E depending on build).

### 2.4 Merge request rules (GitLab)

- **“Pipeline must succeed”** — So at least one round of (unit + build + E2E) is required before merge.
- **Optional:** “No merge if coverage drops on target branch” (needs coverage comparison; can be Phase 2).

### 2.5 Documentation and onboarding

- **Single “how we test” doc** — Point from README to `docs/testing/` (e2e, pipeline-improvement, and this plan once finalized).
- **Checklist for new features** — e.g. “If you add a helper/store/API, add or extend unit tests; if you change auth/tasks/wallet flows, consider E2E.”

---

## 3. Phased Rollout (So You Don’t Have to Do Everything at Once)

### Phase 1 — Low risk, high signal (weeks 1–2)

**Goal:** Get unit tests and static checks into CI; no change to deploy or E2E flow.

1. **CI: Re-enable unit + check + lint**
   - Uncomment the `validate` job that runs `npm run check`, `npm run lint`, `npm run test:ci`.
   - Run this job **in parallel** with `build` (same stage: `validate`).
   - Make **playwright** (E2E) `needs: [build]` only (no need to wait for unit). So: unit and build run in parallel; E2E runs after build; deploy after E2E.
   - If unit/check/lint fail, pipeline fails; E2E still runs (optional: later you can make E2E depend on unit so you don’t waste time on E2E when unit fails).

2. **Fix any flake** in `test:ci` so it’s green in CI (same command as locally).

3. **Docs:** Add one short section in `docs/testing/pipeline-improvement.md`: “CI now runs unit tests, check, and lint in validate; they run in parallel with build.”

**Outcome:** Every MR and target-branch push runs unit tests + check + lint. Team sees failing pipelines when they break tests or types.

---

### Phase 2 — Hooks and discipline (weeks 2–3)

**Goal:** Catch failures before push; make “run tests before push” the default.

1. **Add Husky + pre-push**
   - Install Husky; add `pre-push` hook that runs `npm run test:ci` (and optionally `npm run check` and `npm run lint`). If any fail, push is blocked.
   - Document in README: “We use a pre-push hook to run tests; use `git push --no-verify` only when necessary and fix CI right after.”

2. **Optional: pre-commit**
   - Lint + check only (no tests), so commits stay fast. Example: `npx lint-staged` running `eslint` and `svelte-check` on staged files only (requires lint-staged config).

3. **Docs:** Update `docs/testing/pipeline-improvement.md` with “Local hooks” and link to this plan.

**Outcome:** Most pushes already pass CI because pre-push ran the same tests. `--no-verify` remains for emergencies.

---

### Phase 3 — Pipeline speed and clarity (weeks 3–5)

**Goal:** Faster feedback and clear separation of “quick checks” vs “full validation.”

1. **Order of jobs**
   - Option A (simple): Keep current order; unit and build in parallel; E2E after build; deploy after E2E. No change to timing, just unit is now running.
   - Option B (faster feedback): Add a “quick” stage before build: e.g. `lint` + `check` + `test:ci` in one job (or two). Only if that passes, run `build` and then `playwright`. Red pipelines fail earlier when only static/unit fail (saves build + E2E time for those cases).

2. **Cache**
   - You already cache `node_modules/` and `.npm/`. Ensure cache key is consistent (e.g. `$CI_COMMIT_REF_SLUG` or lockfile hash) so cache hits are high.

3. **E2E**
   - Consider splitting E2E into “smoke” (one fast spec) vs “full” (all specs). Run smoke on every MR; run full suite on `dev`/`master` or on-demand. (Optional; depends on how long full E2E is.)

4. **Coverage in CI (optional)**
   - Run `npm run test:ci -- --coverage` in CI; store `coverage/` as artifact (e.g. `coverage/index.html`). Later: add a job that compares coverage to default branch and fails or warns if it drops (Phase 4).

**Outcome:** Pipeline is either faster (fail fast on unit) or at least not slower; structure is clear; coverage visible in artifacts.

---

### Phase 4 — Gates and culture (ongoing)

**Goal:** Enforce “no regression” and make testing part of the workflow.

1. **MR settings**
   - In GitLab: “Pipelines must succeed” before merge (if not already).
   - Optionally: “All threads resolved” and “Approval required” for `master`.

2. **Coverage gate (soft then hard)**
   - Publish coverage report in CI (Phase 3). Then: a job that compares coverage to `master` (or `dev`). First **warn** in MR (e.g. “Coverage dropped by X%”); later, optionally **fail** the pipeline if coverage drops below a threshold or below previous value.

3. **Team conventions**
   - In contribution/CONTRIBUTING or `docs/testing/`: “New helpers/stores/API logic should have unit tests”; “When you fix a bug, add a test that would have caught it if possible.”
   - Reference the coverage expansion plan for “what to test first” (helpers, stores, wallet, auth).

4. **Review checklist**
   - In MR template or docs: “Did you run `npm run test:ci` (and E2E if you changed auth/tasks/wallet)? Are new paths covered by tests where reasonable?”

**Outcome:** Merges only when pipeline is green; coverage trend is visible; team habit of “tests with code.”

---

## 4. Hooks: What to Run Where

| Hook | Recommended command | Rationale |
|------|--------------------|-----------|
| **pre-commit** | `lint-staged` → ESLint + Prettier (and optionally `svelte-check`) on staged files only | Fast; keeps style and types in shape per commit. |
| **pre-push** | `npm run check && npm run lint && npm run test:ci` | Same as CI validate (minus build/E2E). Prevents “push then CI fails.” |
| **Not in hooks** | `npm run build`, `npm run test:e2e` | Too slow and/or environment-dependent. |

**Escape hatch:** `git push --no-verify` when necessary (e.g. WIP branch), with the convention that the next push or MR must fix any CI failure.

---

## 5. CI Pipeline Shape (Target, After Phase 1)

```text
Stage: validate
  - build          (npm ci, npm run build)  ──┐
  - unit           (npm ci, npm run check, lint, test:ci)  ──┘  parallel

Stage: validate (continued)
  - playwright     (needs: build; uses build artifact)

Stage: deploy
  - deploy-development  (needs: build, playwright)
```

- **unit** fails → pipeline fails (E2E still runs in current design; you can later make playwright `needs: [build, unit]` to save time).
- **build** fails → playwright and deploy are skipped (correct).
- **playwright** fails → deploy is skipped (correct).

Later (Phase 3 Option B) you can add an earlier “quick” stage so that when only unit/check/lint fail, you don’t run build or E2E.

---

## 6. What “Good” Looks Like in 2–3 Months

- **CI:** Every MR and target-branch push runs unit tests, check, lint, build, and E2E. Pipeline must pass to merge.
- **Local:** Pre-push runs `test:ci` (+ check + lint); pre-commit runs lint/format (and optionally check) on staged files. Developers rarely see CI fail for “forgot to run tests.”
- **Docs:** `docs/testing/` explains how to run tests, what runs in CI, and what runs in hooks; CONTRIBUTING or equivalent says “add tests for new logic.”
- **Coverage:** Coverage report in CI artifacts; team uses coverage expansion plan to prioritize what to test next; optional soft gate on coverage drop.
- **Culture:** “Fix or remove tests you break”; “new code, new tests” for business logic and critical paths.

---

## 7. Open Decisions to Discuss

1. **Pre-commit:** Do you want only pre-push (simpler), or also pre-commit with lint-staged for faster feedback on style/check?
2. **E2E dependency:** Should Playwright run only after unit passes (`needs: [build, unit]`) to save CI time when unit fails, or keep E2E independent of unit (current: only `needs: [build]`)?
3. **Coverage gate:** Start with “publish report only,” or add a “warn if coverage drops” job from the start?
4. **Branch strategy:** When you move from `feat/workers-deployment` to `dev` for deploy-development, should we document that in this plan and in `docs/ci/`?
5. **Speed:** Is the main slowness “build + E2E,” or also “no parallel unit”? That will drive whether we add a “quick stage” (Phase 3 Option B) early.

---

## 8. Next Steps

1. **Align on phases** — Agree which phases to adopt and in what order (e.g. Phase 1 → 2 → 3 → 4, or Phase 1 + 3 first, then 2 and 4).
2. **Implement Phase 1** — Uncomment and adjust the unit/check/lint job in `.gitlab-ci.yml`; run it in parallel with build; fix any CI-only failures.
3. **Document** — Update `docs/testing/pipeline-improvement.md` and, if you like, add a “Testing” section to the main README that points to `docs/testing/`.
4. **Phase 2** — Add Husky, pre-push (and optionally pre-commit + lint-staged); document hooks in README and testing docs.
5. **Revisit** — After Phase 2, decide on Phase 3 (quick stage, coverage artifact, E2E split) and Phase 4 (coverage gate, MR rules, conventions).

---

## 9. References

- **Current CI:** `.gitlab-ci.yml`
- **Unit strategy:** `plans/unit-testing-strategy.md`
- **Coverage expansion:** `plans/coverage-expansion-plan.md`
- **Pipeline improvement (existing):** `docs/testing/pipeline-improvement.md`
- **CI migration:** `docs/ci/workers-pipeline-migration.md`
- **E2E:** `docs/testing/e2e-testing.md`
