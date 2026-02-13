# Plan: Unit Testing Strategy for BitTasker

**Status:** In progress — Phase 1 & 2 complete; Phase 3 next  
**Created:** 2025-02-13  
**Last updated:** 2025-02-13  
**Goal:** Establish a strategy to add and maintain unit tests for code that is actually used in the app, starting with an audit of existing tests in `src/lib/tests`, then defining structure and priorities for future tests.

**Current status:** Audit done (72 files: Remove 2, Keep 12, Update 58). Phase 2 restructure complete; Update tests fixed: currencyFormatter, crypto → unit/helpers. CI runs 12 files / 140 tests, all passing. Next: Phase 3 (add tests) and/or fix more Update tests (validators, auth, deviceIdentity, etc.).

---

## 1. Current State

### 1.1 Test Infrastructure

| Item | Details |
|------|---------|
| **Runner** | Vitest (v3), configured in `vite.config.ts` |
| **Environment** | jsdom, `vitest-setup-client.ts`, `$app/environment` mocked |
| **Location** | All unit/integration tests under `src/lib/tests/` |
| **Triage** | `scripts/test-triage.js` + `vitest.triage.config.ts` — runs full suite once, groups by category, reports pass/fail |
| **CI** | `test:ci` runs `src/lib/tests/unit/` and `src/lib/tests/integration/routes/` (validated set; no separate ci/ directory) |

### 1.2 Existing Test Layout (High Level)

Tests are grouped by **type/surface**, not strictly by **source module**:

- **Root** (directly under `src/lib/tests/`): validators, formatters (currency, date), crypto, encoding, auth*, deviceIdentity, findTasks, nostr-message, nip44-message, profile-cache
- **api/** — API services: balanceHistory, token-balance
- **utils/** — escrow (v1), wallet (blockscout, paymentAddressParser, nostr-bid, feeCalculation, escrowErrors), test-data-factories, wallet-test-helpers
- **stores/** — wallet.store*, bid.store, user-profile-optimization
- **components/** — contract (DebugContractCard, escrow, loadContractsByAddress, functionParsing, contractDetection), bidding (BidAcceptanceForm), wallet (Debug*, SendPaymentForm, ReceivePaymentForm, TransactionHistory, etc.), messages (ChatMessage), AmountDisplay, BalanceHistory, CalculatorKeypad, InvoiceDisplay, TransactionSuccessScreen, WalletPaymentModal
- **(formerly ci/)** — now in `unit/` (placeholder, routes) and `integration/routes/` (tasks-page integration)
- **integration/** — escrow lifecycle, events, disputes, permissions, etc.
- **e2e/** — Playwright specs, fixtures, helpers (auth, wallet); some shared with E2E, not “unit”

So we have **many** tests, but:

- No single convention for “test next to source” vs “all tests in lib/tests”.
- Some tests may target **removed or renamed** code (e.g. `findTasks.test.ts` imports `convertFilterToApiParams` from `$lib/nostr/findTasks`, which is **not exported** there — dead code).
- Quality and coverage are uneven; the existing tests are not necessarily a model for “good” or “extensive” tests.
- E2E and unit/integration share the same `tests` tree (e2e subfolder).

### 1.3 npm Scripts (Relevant)

```text
test:unit          → vitest (watch)
test               → vitest run (full suite)
test:ci            → vitest run src/lib/tests/unit/ src/lib/tests/integration/routes/
test:triage        → node scripts/test-triage.js (grouped report)
test:unit:validators, test:unit:formatters, test:unit:crypto, test:unit:auth, test:unit:root-other
test:unit:api, test:unit:utils, test:unit:stores, test:unit:components, test:unit:integration
```

---

## 2. Strategy Overview

1. **Audit first** — For each existing test file, determine: does the **source under test** still exist and is it **used** in the app? Classify: **keep**, **update**, or **remove** (dead code).
2. **Stabilize structure** — Define a clear directory/naming convention under `src/lib/tests` so new tests can be added consistently.
3. **Prioritize live code** — When adding tests, focus on code that is **actually used** (routes, components, stores, API services, shared utils).
4. **Incremental delivery** — Fix or remove broken/obsolete tests first; then add new tests for high-value modules in a defined order.

No execution of test changes in this plan — this document is the **strategy and checklist** to be executed in a follow-up.

---

## 3. Directory Structure (Proposed)

Keep **all unit/integration tests under `src/lib/tests`** to avoid scattering test config and to keep a single place for Vitest/triage. Use subdirectories that mirror **source surface** so it’s obvious where to add a test for a given module.

Proposed layout:

```text
src/lib/tests/
├── README.md                    # Short doc: what lives here, how to add tests, link to this plan
├── unit/                        # Pure unit tests (no Svelte mount, minimal mocks)
│   ├── helpers/                 # $lib/utils/helpers/*
│   │   ├── validators.test.ts
│   │   ├── dateFormatter.test.ts
│   │   ├── currencyFormatter.test.ts
│   │   ├── encoding.test.ts
│   │   ├── crypto.test.ts
│   │   ├── paymentAddressParser.test.ts
│   │   └── escrowErrors.test.ts
│   ├── nostr/                   # $lib/nostr/* (non-component)
│   │   └── findTasks.test.ts    # only after fixing: test exported API used by app
│   ├── utils/                   # Other $lib/utils/* (escrow, wallet, etc.)
│   │   ├── escrow/
│   │   ├── wallet/
│   │   └── nostr-bid.test.ts
│   ├── api/                     # $lib/api/services/*
│   │   └── services/
│   ├── stores/                  # $lib/stores/* (logic/state, not Svelte)
│   │   ├── wallet.store*.test.ts
│   │   ├── bid.store.test.ts
│   │   └── task.store.test.ts   # if added
│   └── routes/                  # Route-level unit + component tests (implemented)
│       └── tasks-page.*.test.ts
├── components/                  # Svelte component tests (@testing-library/svelte)
│   ├── contract/
│   ├── bidding/
│   ├── wallet/
│   └── messages/
├── integration/                 # Multi-module / workflow tests
│   ├── routes/                  # Page-level integration (implemented: tasks-page)
│   └── escrow/
├── e2e/                         # Playwright specs, fixtures, helpers (unchanged)
# (no ci/ — validated tests live in unit/ and integration/routes/; test:ci runs those)
└── _fixtures/                   # Shared test data, mocks (optional)
    └── ...
```

**Naming:**

- One test file per source module or logical unit: `validators.test.ts`, `dateFormatter.test.ts`.
- Component tests: `ComponentName.test.ts` or `ComponentName.logic.test.ts` when testing extracted logic.
- Integration: `*.integration.test.ts` suffix.

**Migration note:** Phase 2 moved all Keep tests into `unit/` and `integration/routes/`; `ci/` is removed. Remaining tests still live in root, `utils/`, `stores/`, `components/`, `api/`, `integration/escrow/` until fixed and optionally moved.

---

## 4. Phase 1 — Audit Existing Tests (Do First)

For **each** test file in `src/lib/tests` (excluding `e2e/` and any pure E2E helpers), perform:

1. **Source check** — Do the imported `$lib/...` modules and exported symbols still exist?
2. **Usage check** — Is that code referenced from routes, components, or other app code (grep / search)?
3. **Classification:**
   - **Keep** — Source exists, used in app, tests pass.
   - **Update** — Source exists and is used, but tests fail or test the wrong API (e.g. renamed function); update tests.
   - **Remove** — Source removed or unused (dead code); remove or archive the test file.

Document results in a **triage table** (see below). This gives a clear “which tests still make sense” before restructuring.

### 4.1 Known Example: Dead Test

- **File:** `src/lib/tests/findTasks.test.ts`
- **Imports:** `convertFilterToApiParams` from `$lib/nostr/findTasks`
- **Reality:** `findTasks.ts` does **not** export `convertFilterToApiParams`; it uses `createTaskFilter` and other internals. The test is for removed/renamed API.
- **Action:** **Update** (repoint to current exported API if any) or **Remove** if no equivalent public API exists.

### 4.2 Triage Table (Template)

**Summary:** 72 test files audited (excluding e2e/). Full suite: 51 files failed, 20 passed, 1 skipped; 182 tests failed, 421 passed. Common causes: (1) `@bittasker/wallet-core` missing `EventBus` in test env; (2) API/signature changes (e.g. `convertCurrency` now async); (3) tests targeting removed exports (`convertFilterToApiParams`); (4) incomplete mocks in component tests.

| Test file | Source module(s) | Source exists? | Used in app? | Tests pass? | Classification | Notes |
|-----------|------------------|---------------|--------------|-------------|----------------|-------|
| *Root* | | | | | | |
| validators.test.ts | $lib/utils/helpers/validators | Yes | Yes | No (load error) | Update | wallet-core EventBus in chain |
| auth.test.ts | $lib/utils/helpers/auth | Yes | Yes | No (6 failed) | Update | |
| auth-cache-validation.test.ts | auth, nostrKeys, app.store | Yes | Yes | No | Update | |
| auth-error-recovery.test.ts | auth, nostrKeys, app.store | Yes | Yes | No | Update | |
| crypto.test.ts | $lib/utils/helpers/crypto | Yes | Yes | Yes | **Fixed (Chunk 9)** | Now in `unit/helpers/`; importKey expects ArrayBuffer, not Uint8Array. |
| currencyFormatter.test.ts | $lib/utils/helpers/currencyFormatter | Yes | Yes | Yes | **Fixed (Chunk 8)** | Now in `unit/helpers/`; convertCurrency async + mock; default format "amount currency". |
| dateFormatter.test.ts | $lib/utils/helpers/dateFormatter | Yes | Yes | Yes | Keep | |
| deviceIdentity.test.ts | $lib/utils/helpers/deviceIdentity | Yes | Yes | Partial (24 failed) | Update | formatPasskeyName behavior |
| encoding.test.ts | $lib/utils/helpers/encoding | Yes | Yes | Yes | Keep | |
| findTasks.test.ts | $lib/nostr/findTasks | No (symbol) | Yes | No | **Remove** | Tests convertFilterToApiParams – not exported |
| nip44-message.test.ts | nip44 utils | Yes | Yes | Partial (8 failed) | Update | |
| nostr-message.test.ts | $lib/utils/nostr-message | Yes | Yes | No | Update | |
| profile-cache.test.ts | $lib/utils/profile-cache | Yes | Yes | Yes | Keep | |
| *api/services/* | | | | | | |
| balanceHistory.service.test.ts | balanceHistory.service, crypto-price | Yes | Yes | Yes | Keep | |
| token-balance.service.test.ts | token-balance.service | Yes | Yes | No (11 failed) | Update | |
| *utils/* feeCalculation, paymentAddressParser, nostr-bid, escrow/* | (see notes) | Yes/N/A | Yes | Mixed | Keep/Update | feeCalculation local logic; paymentAddressParser load error; escrow Keep contractPermissions |
| *stores/* user-profile-optimization, wallet.store*, bid.store | (see notes) | N/A/Yes | No/Yes | N/A/Partial | **Remove**/Keep/Update | user-profile-optimization empty file – Remove |
| *components/* (20 files) | All exist, used | Yes | Yes | Mostly Partial/No | Update | Mock fixes needed (e.g. walletStore, getCachedReverseSwapPairs) |
| *ci/* (4 files) | task.store, findTasks, dateFormatter, types | Yes | Yes | Yes | Keep → **Moved (Chunk 7)** | Now in `unit/` and `integration/routes/`; see §5.1. |
| *integration/escrow/* (7 files) | escrow, escrowEvents, contractPermissions | Yes | Yes | Partial/Yes | Keep/Update | permissions + state-transitions Keep; rest Update |

Phase 1 audit complete. Full file list in Appendix A; per-file details in table above (see Appendix A). **Phase 1 totals:** Remove 2, Keep 12, Update 58. Audit “used in app” for the source files.

---

## 5. Phase 2 — Restructure and Clean Up

- **Remove** tests classified as dead (or move to `_archived/` if you want to keep history).
- **Fix** tests that are “Update” (correct imports and assertions to current API).
- **Optionally move** files into the proposed `unit/`, `components/`, `routes/`, `integration/` layout; if so, update:
  - `scripts/test-triage.js` — group `match` patterns so they still map to the new paths.
  - Any `test:unit:*` scripts in `package.json` that point at specific paths.
- Add **`src/lib/tests/README.md`** describing the structure and pointing to this plan (and to `docs/testing/` when the plan is finalized).

No new tests required in Phase 2 — only stabilize what exists and establish the structure.

### 5.1 Phase 2 Progress log

*(Append after each chunk so another agent can resume.)*

| Chunk | Date | What was done | Next / notes |
|-------|------|---------------|--------------|
| 1 | 2025-02-13 | Removed 2 dead tests: `findTasks.test.ts` (tested non-exported `convertFilterToApiParams`), `stores/user-profile-optimization.test.ts` (empty file, no source module). Added `src/lib/tests/README.md` with run commands and pointer to this plan. | — |
| 2 | 2025-02-13 | Created `src/lib/tests/unit/helpers/`. Moved `dateFormatter.test.ts` and `encoding.test.ts` from root into `unit/helpers/` (both pass: 12 + 6 tests). Added `unit-helpers` group in `scripts/test-triage.js`. Updated `package.json`: `test:unit:formatters` and `test:unit:crypto` now point at the new paths so existing scripts still work. | — |
| 3 | 2025-02-13 | Created `src/lib/tests/unit/utils/`. Moved `profile-cache.test.ts` from root to `unit/utils/profile-cache.test.ts` (16 tests, all pass). Added `unit-utils` group in `scripts/test-triage.js`. Triage now shows **2 green groups**: Unit (helpers) 2/2 18/18, Unit (utils) 1/1 16/16. | — |
| 4 | 2025-02-13 | Created `src/lib/tests/unit/api/services/`. Moved `balanceHistory.service.test.ts` from `api/services/` to `unit/api/services/` (22 tests, all pass). Added `unit-api` group in `scripts/test-triage.js`. Triage now shows **3 green groups**: Unit (helpers), Unit (utils), Unit (API services). Legacy `api/` group now only has token-balance.service (failing). | — |
| 5 | 2025-02-13 | Created `src/lib/tests/unit/stores/`. Moved `wallet.store.test.ts` from `stores/` to `unit/stores/` (14 tests, all pass). Added `unit-stores` group in `scripts/test-triage.js`. Triage now shows **4 green groups**: Unit (helpers), Unit (utils), Unit (API services), Unit (stores). **Note:** Tried moving `utils/escrow/contractPermissions.test.ts` to `unit/utils/escrow/`; it fails to load in test env (wallet-core EventBus missing). Left it in `utils/escrow/` until test env or mocks are fixed. | Chunk 6: Move more Keep tests or start fixing Update tests. contractPermissions can be moved in a later chunk once wallet-core/EventBus is mocked or test env is fixed. |
| 6 | 2025-02-13 | Moved `feeCalculation.test.ts` from `utils/` to `unit/utils/` (17 tests, all pass). Updated `package.json` so `test:unit:utils` runs both `src/lib/tests/utils/` and `src/lib/tests/unit/utils/`. Verified `DebugContractCard.logic.test.ts` fails to load in unit context (same wallet-core EventBus); left in `components/contract/`. **All movable Keep tests are now under unit/.** | Phase 2 restructure of Keep tests complete. Next: Phase 3 — fix Update tests or add wallet-core mocks for blocked tests. |
| 7 | 2025-02-13 | **Moved former ci/ tests into unit/ and integration/.** Replaced `ci/` with the new approach: validated tests live under `unit/` and `integration/routes/`. Created `unit/placeholder.test.ts` (smoke), `unit/routes/tasks-page.unit.test.ts`, `unit/routes/tasks-page.component.test.ts`; created `integration/routes/tasks-page.integration.test.ts`. Deleted `src/lib/tests/ci/` (all 4 files). Updated `test:ci` to run `src/lib/tests/unit/` and `src/lib/tests/integration/routes/` (10 files, 122 tests, all pass). Added triage groups `unit-routes` and `unit-root`; removed `ci-placeholder`. Updated README and this plan. | CI now runs the same validated set from unit/ + integration/routes/. No more ci/ directory. |
| 8 | 2025-02-13 | **Fixed and moved currencyFormatter (Update → unit/).** Source had changed: `convertCurrency` is now async and uses `cryptoPriceService.getExchangeRate`; default format for unknown currency is `amount currency`. Created `unit/helpers/currencyFormatter.test.ts` with vi.mock for crypto-price.service, async convertCurrency tests, and corrected format expectation ("100 EUR"). Deleted root `currencyFormatter.test.ts`. Updated `test:unit:formatters` to run both formatters from `unit/helpers/`. **CI set:** 11 files, 133 tests, all pass. | Next: fix more Update tests (e.g. crypto 1 failed, validators) or add Phase 3 tests. |
| 9 | 2025-02-13 | **Fixed and moved crypto (Update → unit/).** importKey test expected `Uint8Array` but implementation passes `ArrayBuffer`; fixed assertion to expect ArrayBuffer and verify bytes. Created `unit/helpers/crypto.test.ts`, deleted root `crypto.test.ts`. Updated `test:unit:crypto` to run both crypto and encoding from `unit/helpers/`. **CI set:** 12 files, 140 tests, all pass. | Next: fix more Update tests (validators, auth, deviceIdentity, etc.) or add Phase 3 tests. |

**If stuck:** Run `npm run test` and `npm run test:triage` to see current state. Triage groups are defined in `scripts/test-triage.js` (array `TEST_GROUPS`); paths are relative to `src/lib/tests/`. When moving a file, add or adjust a `match` regex so the file is still grouped (or leave in "Other" until a later chunk).

### 5.2 Test metrics (before / after each chunk)

*(Run `npm run test` and `npm run test:triage` after each chunk to fill the next row. This shows whether we’re improving pass rate and how each chunk affects the numbers.)*

| When | Test files (passed / failed / skipped) | Tests (passed / failed / skipped) | Triage: green groups | Notes |
|------|----------------------------------------|-----------------------------------|----------------------|-------|
| **Baseline (Phase 1 end)** | 20 passed, 51 failed, 1 skipped (72 total) | 421 passed, 182 failed, 7 skipped (610 total) | 0 of 11 | Snapshot before Phase 2. |
| **After Chunk 1** | 20 passed, 49 failed, 1 skipped (70 total) | 421 passed, 182 failed, 7 skipped (610 total) | 0 of 11 | Removed 2 dead files; no test count change (one file didn’t run, one was empty). |
| **After Chunk 2** | 20 passed, 49 failed, 1 skipped (70 total) | 421 passed, 182 failed, 7 skipped (610 total) | **1** of 12 | **Unit (helpers)** 2/2 files, 18/18 tests — first green group; dateFormatter + encoding moved to `unit/helpers/`. |
| **After Chunk 3** | 20 passed, 49 failed, 1 skipped (70 total) | 421 passed, 189 failed, 7 skipped (610 total) | **2** of 13 | **Unit (utils)** 1/1 files, 16/16 tests added as green. profile-cache moved to `unit/utils/`. |
| **After Chunk 4** | 20 passed, 49 failed, 1 skipped (70 total) | 421 passed, 189 failed, 7 skipped (610 total) | **3** of 14 | **Unit (API services)** 1/1 files, 22/22 tests. balanceHistory.service.test.ts moved to `unit/api/services/`. |
| **After Chunk 5** | 20 passed, 49 failed, 1 skipped (70 total) | 421 passed, 189 failed, 7 skipped (610 total) | **4** of 15 | **Unit (stores)** 1/1 files, 14/14 tests. wallet.store.test.ts moved to `unit/stores/`. contractPermissions left in utils/escrow (fails to load in unit context: wallet-core EventBus). |
| **After Chunk 6** | 20 passed, 49 failed, 1 skipped (70 total) | 421 passed, 189 failed, 7 skipped (610 total) | **4** of 15 | **Unit (utils)** now 2/2 files, 33/33 tests (feeCalculation + profile-cache). All movable Keep tests moved. |
| **After Chunk 7** | — | — | **6** of 16 | **CI set:** `unit/` + `integration/routes/` = 10 files, 122 tests, all pass. Unit (routes), Unit (smoke) added; `ci/` removed. Full-suite triage counts unchanged; CI runs only validated set. |
| **After Chunk 8** | — | — | **6** of 16 | **CI set:** 11 files, 133 tests. currencyFormatter fixed and moved to `unit/helpers/` (first Update test fixed and moved). |
| **After Chunk 9** | — | — | **6** of 16 | **CI set:** 12 files, 140 tests. crypto fixed (importKey ArrayBuffer) and moved to `unit/helpers/`. |

**Improvement summary:** Phase 2 (Chunks 1–9) complete. Chunk 1 removed 2 dead files. Chunks 2–6 moved all movable Keep tests into `unit/` (helpers, utils, api/services, stores, feeCalculation). Chunk 7 moved former ci/ into `unit/` (placeholder, routes) and `integration/routes/`. Chunk 8 fixed currencyFormatter (async convertCurrency, format default) and moved it to `unit/helpers/`. Chunk 9 fixed crypto (importKey ArrayBuffer assertion) and moved it to `unit/helpers/`. CI now runs **12 files, 140 tests**, all passing. contractPermissions and DebugContractCard.logic remain in place (wallet-core EventBus blocks unit context).

**Keep tests remaining (not yet under unit/):**

| File | Location | Move? | Blocker / note |
|------|----------|-------|----------------|
| contractPermissions.test.ts | utils/escrow/ | Later | Fails to load (wallet-core EventBus) in unit context. |
| feeCalculation.test.ts | unit/utils/ | **Done (Chunk 6)** | Moved to unit/utils/; 17 tests pass. |
| DebugContractCard.logic.test.ts | components/contract/ | No | Same wallet-core EventBus load failure when run in unit context; leave in place. |
| ci-placeholder.test.ts | unit/placeholder.test.ts | **Done (Chunk 7)** | Moved to unit/; smoke test. |
| tasks-page.unit.test.ts | unit/routes/ | **Done (Chunk 7)** | Moved to unit/routes/. |
| tasks-page.integration.test.ts | integration/routes/ | **Done (Chunk 7)** | Moved to integration/routes/. |
| tasks-page.component.test.ts | unit/routes/ | **Done (Chunk 7)** | Moved to unit/routes/. |
| escrow-permissions.integration.test.ts | integration/escrow/ | No | Integration test; keep in integration/. |
| escrow-state-transitions.integration.test.ts | integration/escrow/ | No | Integration test; keep in integration/. |

**Total Keep:** 12. **In unit/ or integration/routes/:** 12 files (placeholder, helpers ×4: dateFormatter, encoding, currencyFormatter, crypto; utils, api/services, stores, routes ×3; integration/routes ×1). **Leave in place:** 2 (integration/escrow Keep). **Blocked (wallet-core):** 2 (contractPermissions, DebugContractCard.logic). **CI:** `test:ci` runs `unit/` + `integration/routes/` (140 tests). **Update fixed:** currencyFormatter (Chunk 8), crypto (Chunk 9).

**How to read:** “Green groups” = triage categories where all files and tests pass. More green = better structure and clarity. Test/file counts may stay similar until we fix “Update” tests (Phase 2 fix work) or add tests (Phase 3).

---

## 6. Phase 3 — Add Tests for Key Parts (Priority Order)

Test **code that is actually used**. Suggested order:

1. **Utils/helpers** (pure functions, high impact, easy to test)  
   - Already have: validators, dateFormatter, currencyFormatter, encoding, crypto, paymentAddressParser, escrowErrors.  
   - Add or extend: any other `$lib/utils/helpers/*` used by forms, wallet, or tasks (e.g. task-id, contractStatusFormatter, budgetTier, dateTier).

2. **Stores** (state and derived logic)  
   - Already have: wallet.store, bid.store.  
   - Add: task.store (used by tasks list and task pages), auth.store / app.store (only pure logic or small, mockable surface).

3. **API services** (mock HTTP/storage, test request/response handling)  
   - Already have: balanceHistory, token-balance.  
   - Add: services used by critical flows (e.g. nostr/events, auth.service) where logic can be unit-tested without full E2E.

4. **Nostr / wallet utils** (used by tasks and wallet)  
   - Fix or remove findTasks.test; add tests for any **exported** findTasks API that the app uses.  
   - Escrow/utils already heavily tested; keep and maintain.

5. **Components** (only those on critical paths)  
   - Prioritize: forms and flows used in tasks, wallet, and auth (e.g. login, signup, create-task, send/receive payment).  
   - Debug* components are lower priority (dev-only).

6. **Routes** (load functions, page state)  
   - Already have tasks-page in `unit/routes/` and `integration/routes/`. Extend to other high-traffic routes if load logic is non-trivial.

For each new test file, place it in the structure from Section 3 and follow the naming convention.

---

## 7. Definition of “Used in the App”

A module is **used** if:

- It is imported by any Svelte route (`src/routes/**/+page.svelte`, `+layout.svelte`, `+page.ts`, `+layout.ts`), or
- It is imported by any component under `src/lib/components/`, or
- It is imported by another `$lib` module that is itself used (transitive).

Tools: `grep -r "from '\$lib/..." src/routes src/lib/components` and follow imports from there. Tests that only reference removed or unused code should be **Update** or **Remove** in the audit.

---

## 8. Success Criteria (Strategy Phase)

- [x] Audit table filled for all non-E2E tests (Phase 1) — completed 2025-02-13.
- [ ] All tests classified as **Keep** or **Update** pass (Phase 2 fix work; many Update tests still failing in full suite).
- [x] Tests classified as **Remove** are removed; CI still passes (`test:ci` = 122 tests).
- [x] `src/lib/tests/README.md` added describing layout and how to add tests.
- [x] Triage script and npm scripts updated for `unit/` and `integration/routes/` (Phase 2 Chunks 2–7).
- [ ] Priority list (Section 6) used when adding new tests (Phase 3); optional: fix Update tests first to grow green set.

---

## 9. References

- **Vitest:** `vite.config.ts` (test env, setupFiles), `vitest.triage.config.ts`, `vitest-setup-client.ts`
- **Triage:** `scripts/test-triage.js`, `npm run test:triage`
- **CI:** `test:ci` runs `src/lib/tests/unit/` and `src/lib/tests/integration/routes/`
- **Docs:** When this plan is done, move the stable parts to `docs/testing/` and keep `plans/` for in-progress work (see `plans/README.md`).

---

## 10. Next Steps (When Executing)

**Phase 2 restructure is complete.** Use these steps to keep moving forward:

1. **Run CI set:** `npm run test:ci` — should pass (10 files, 122 tests). Run full suite when needed: `npm run test` or `npm run test:triage`.
2. **Phase 3 — Add tests:** Use the priority order in Section 6. Add new test files under `unit/` (e.g. `unit/helpers/`, `unit/stores/`) or `integration/routes/`; follow naming in Section 3.
3. **Optional — Fix Update tests:** Pick a triage group (e.g. formatters, validators, auth), fix failing tests with `npm run test:unit:<group>`, then move fixed files into `unit/` and update triage/scripts so CI can be expanded later.
4. **Wallet-core blocker:** To unblock `contractPermissions` and `DebugContractCard.logic`, add EventBus mock or fix test env (see Phase 2 Chunk 5 note); then move those tests into `unit/` if desired.

---

## Appendix A — Full List of Test Files to Audit

Use this list to ensure every non-E2E test is triaged. Exclude `e2e/` (Playwright specs and E2E helpers).

**Root (src/lib/tests/):**

- auth.test.ts
- auth-cache-validation.test.ts
- auth-error-recovery.test.ts
- crypto.test.ts *(moved to unit/helpers/ Chunk 9)*
- currencyFormatter.test.ts *(moved to unit/helpers/ Chunk 8)*
- dateFormatter.test.ts
- deviceIdentity.test.ts
- encoding.test.ts
- findTasks.test.ts *(known: tests removed API)*
- nip44-message.test.ts
- nostr-message.test.ts
- profile-cache.test.ts
- validators.test.ts

**api/services/:**

- balanceHistory.service.test.ts
- token-balance.service.test.ts

**utils/:**

- feeCalculation.test.ts
- nostr-bid.test.ts
- paymentAddressParser.test.ts
- wallet/blockscoutTransactionStatus.test.ts
- escrow/contractPermissions.test.ts
- escrow/escrowBid.test.ts
- escrow/escrowErrors.test.ts
- escrow/escrowEvents.test.ts
- escrow/feeCalculations.test.ts

**stores/:**

- bid.store.test.ts
- user-profile-optimization.test.ts
- wallet.store.debug.test.ts
- wallet.store.functions.test.ts
- wallet.store.state.test.ts
- wallet.store.test.ts

**components/:**

- AmountDisplay.test.ts
- BalanceHistory.test.ts
- CalculatorKeypad.test.ts
- ChatMessage.test.ts
- InvoiceDisplay.test.ts
- ReceivePaymentForm.test.ts
- ReceivePaymentForm.integration.test.ts
- SendPaymentForm.test.ts
- TransactionHistory.test.ts
- TransactionSuccessScreen.test.ts
- WalletPaymentModal.test.ts
- bidding/BidAcceptanceForm.test.ts
- contract/contractDetection.test.ts
- contract/DebugContractCard.logic.test.ts
- contract/DebugContractCard.test.ts
- contract/escrow.test.ts
- contract/functionParsing.test.ts
- contract/loadContractsByAddress.test.ts
- wallet/DebugWalletAssetList.test.ts
- wallet/DebugWalletSendForm.test.ts

**ci/ (moved in Chunk 7 → unit/ and integration/routes/):**

- unit/placeholder.test.ts (was ci-placeholder.test.ts)
- unit/routes/tasks-page.unit.test.ts
- unit/routes/tasks-page.component.test.ts
- integration/routes/tasks-page.integration.test.ts

**integration/escrow/:**

- escrow-bid-acceptance.integration.test.ts
- escrow-dispute.integration.test.ts
- escrow-event-flow.integration.test.ts
- escrow-lifecycle.integration.test.ts
- escrow-permissions.integration.test.ts
- escrow-state-transitions.integration.test.ts
- escrow-two-party.integration.test.ts
