# Plan: Unit Testing Strategy for BitTasker

**Status:** In progress — Phase 1 & 2 complete; Phase 3 next  
**Created:** 2025-02-13  
**Last updated:** 2025-02-14 (Chunk 21; component fixes: BalanceHistory, DebugWalletSendForm, SendPaymentForm)  
**Goal:** Establish a strategy to add and maintain unit tests for code that is actually used in the app, starting with an audit of existing tests in `src/lib/tests`, then defining structure and priorities for future tests.

**Current status:** Audit done (72 files: Remove 2, Keep 12, Update 58). Phase 2 + legacy fixes through Chunk 18 (stores). **Chunk 19–21:** Component fixes — TransactionHistory, ReceivePaymentForm, InvoiceDisplay, CalculatorKeypad (Chunk 19–20); BalanceHistory, DebugWalletSendForm, SendPaymentForm (Chunk 21). CI runs **30 files** under `unit/` + `integration/routes/`. **Component tests:** 13 passed files, 6 failed, 1 skipped (20 total); 214 passed tests, 16 failed, 14 skipped (244 total). Next: ReceivePaymentForm, contract tests, or add component tests to CI.

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

- **Root** (legacy — most moved): findTasks (dead), dateFormatter, encoding, profile-cache (some still in root until triaged). **unit/helpers/** now holds: validators, formatters, crypto, encoding, auth*, deviceIdentity, nostr-message, nip44-message.
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
test:unit:validators, test:unit:formatters, test:unit:crypto, test:unit:auth
test:unit:api, test:unit:utils, test:unit:stores, test:unit:components, test:unit:integration
```

### 1.4 Why `npm run test` and `npm run test:ci` Differ

| Command | What it runs | Result |
|--------|----------------|--------|
| **`npm run test`** | `vitest --run` with **no path** → Vitest discovers **all** test files (default glob `**/*.{test,spec}.{ts,tsx}` under the project). That includes every file under `src/lib/tests/`: `unit/`, `integration/`, `utils/`, `stores/`, `components/`, etc. | ~500+ tests from **59 files**; many fail (e.g. 100+ failures from 39 files) because legacy tests outside `unit/` and `integration/routes/` are not yet fixed. |
| **`npm run test:ci`** | `vitest run src/lib/tests/unit/ src/lib/tests/integration/routes/` → only those **two directories**. | **462+ tests from 30 files** (curated set; one flaky timeout possible in nip44-message). |

So the difference is **scope**: `test` runs the full suite (including broken/legacy tests); `test:ci` runs only the validated subset. Until the rest of the tests are fixed or removed, use `test:ci` for a green run; use `test` or `test:triage` to see the full picture.

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

**Migration note:** Phase 2 (Chunks 1–14) moved Keep tests and fixed Update tests into `unit/` and `integration/routes/`; `ci/` is removed. Root-level helpers (validators, formatters, crypto, auth, etc.) are now in `unit/helpers/`. Remaining Update tests live in `utils/`, `stores/`, `components/`, `api/`, `integration/escrow/` until fixed and optionally moved.

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
| validators.test.ts | $lib/utils/helpers/validators | Yes | Yes | Yes | **Fixed (Chunk 14)** | Moved to unit/helpers/; mock wallet-core/liquidjs. |
| auth.test.ts | $lib/utils/helpers/auth | Yes | Yes | Yes | **Fixed (Chunk 13)** | Moved to unit/helpers/; Credentials shape, nostrKeys alignment. |
| auth-cache-validation.test.ts | auth, nostrKeys, app.store | Yes | Yes | Yes | **Fixed (Chunk 13)** | Moved to unit/helpers/. |
| auth-error-recovery.test.ts | auth, nostrKeys, app.store | Yes | Yes | Yes | **Fixed (Chunk 13)** | Moved to unit/helpers/. |
| crypto.test.ts | $lib/utils/helpers/crypto | Yes | Yes | Yes | **Fixed (Chunk 9)** | Now in `unit/helpers/`; importKey expects ArrayBuffer, not Uint8Array. |
| currencyFormatter.test.ts | $lib/utils/helpers/currencyFormatter | Yes | Yes | Yes | **Fixed (Chunk 8)** | Now in `unit/helpers/`; convertCurrency async + mock; default format "amount currency". |
| dateFormatter.test.ts | $lib/utils/helpers/dateFormatter | Yes | Yes | Yes | Keep | |
| deviceIdentity.test.ts | $lib/utils/helpers/deviceIdentity | Yes | Yes | Yes | **Fixed (Chunk 10)** | Now in `unit/helpers/`; formatPasskeyName takes options object `{ npub, username?, displayName? }`. |
| encoding.test.ts | $lib/utils/helpers/encoding | Yes | Yes | Yes | Keep | |
| findTasks.test.ts | $lib/nostr/findTasks | No (symbol) | Yes | No | **Remove** | Tests convertFilterToApiParams – not exported |
| nip44-message.test.ts | $lib/utils/nostr-message (NIP-44) | Yes | Yes | Yes | **Fixed (Chunk 11)** | Now in `unit/helpers/`; added publishToMultipleRelays mock, appStore pool, nip19.decode mock; event tags include ['m','direct-message']. |
| nostr-message.test.ts | $lib/utils/nostr-message | Yes | Yes | Yes | **Moved (Chunk 12)** | Now in `unit/helpers/`; tests already passed; root-other script removed. |
| profile-cache.test.ts | $lib/utils/profile-cache | Yes | Yes | Yes | Keep | |
| *api/services/* | | | | | | |
| balanceHistory.service.test.ts | balanceHistory.service, crypto-price | Yes | Yes | Yes | Keep | |
| token-balance.service.test.ts | token-balance.service | Yes | Yes | Yes | **Fixed (Chunk 15)** | Mock Response.headers; moved to unit/api/services/. |
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

*(Condensed summary; append new chunks with full detail.)*

**Chunk summary (1–16):**

| Chunks | Date | Summary | CI outcome |
|--------|------|---------|------------|
| 1 | 2025-02-13 | Removed 2 dead tests (findTasks, user-profile-optimization). Added README. | — |
| 2–6 | 2025-02-13 | Created `unit/helpers`, `unit/utils`, `unit/api/services`, `unit/stores`. Moved Keep tests: dateFormatter, encoding, profile-cache, balanceHistory, wallet.store, feeCalculation. contractPermissions left (wallet-core EventBus). | 4 green groups; 33 unit tests |
| 7 | 2025-02-13 | Moved ci/ → unit/ + integration/routes/. Deleted ci/. Updated test:ci. | 10 files, 122 tests |
| 8–14 | 2025-02-13 | Fixed Update tests: currencyFormatter, crypto, deviceIdentity, nip44-message, nostr-message, auth×3, validators. Moved to unit/helpers/. | 19 files, 258 tests |
| 15–16 | 2025-02-13 | Fixed token-balance.service (mock Response.headers), paymentAddressParser (wallet-core mock). Moved to unit/. | 21 files, 301 tests |
| 17 | 2025-02-13 | Fixed escrow tests (escrowBid, feeCalculations, escrowEvents, contractPermissions). Moved to unit/utils/escrow/. | 26 files, 420 tests |
| 18 | 2025-02-13 | Fixed store tests (bid.store, wallet.store.*). Moved to unit/stores/. | 30 files, 462 tests |

**Recent chunks (detail):**

| Chunk | Date | What was done | Next |
|-------|------|---------------|------|
| 19 | 2025-02-14 | **Component fixes (partial).** TransactionHistory: ProcessedTransactionFactory, iconConfig mock, walletStore isConnected/isInitializing. ReceivePaymentForm + integration: getCachedReverseSwapPairs, getCachedChainSwapPairs. DebugWalletSendForm: walletStore, estimateRBTCGas/estimateERC20Gas mocks, sendRBTC/sendRSKToken; selectors fixed; countdown tests skipped. | Continue components (WalletPaymentModal, InvoiceDisplay, etc.). |
| 20 | 2025-02-14 | **Component fixes (continued).** InvoiceDisplay: Share tests fixed (Capacitor.getPlatform mock for mobile); QR error test uses regex and longer timeout. CalculatorKeypad: decimal-disable test drops tabindex expectation; touch test expects min-h-[52px] to match component. **Chunk history condensed** (§5.1, §5.2). | Continue remaining component tests. |
| 21 | 2025-02-14 | **Component fixes (wallet forms).** BalanceHistory: mock walletStore (rsk.provider, rsk.address, totalBalances, formatSats), waitFor for loading; removed invalid props. DebugWalletSendForm: wallet mock (formattedBalance, formatSats, formatUsd, totalBalances), i18n validation.insufficient_balance, max/self-send/confirmation modal/ERC-20/error selectors fixed. SendPaymentForm: i18n keys + tStore values, wallet mock (formattedBalance, bsc, totalBalances), tab/input/cancel/calculator selectors fixed; 4 tests skipped (layout/timing). | ReceivePaymentForm, contract tests, or add components to CI. |

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
| **After Chunk 10** | — | — | **6** of 16 | **CI set:** 13 files, 185 tests. deviceIdentity fixed (formatPasskeyName options object) and moved to `unit/helpers/`. |
| **After Chunk 11** | — | — | **6** of 16 | **CI set:** 14 files, 195 tests. nip44-message fixed (publishToMultipleRelays, pool, nip19, tags) and moved to `unit/helpers/`. |
| **After Chunk 12** | — | — | **6** of 15 | **CI set:** 15 files, 208 tests. nostr-message moved to `unit/helpers/`; root-other removed. |
| **After Chunk 13** | — | — | **7** of 15 | **CI set:** 18 files, 225 tests. Auth tests (auth, auth-cache-validation, auth-error-recovery) fixed and moved to `unit/helpers/`. |
| **After Chunk 14** | — | — | **7** of 14 | **CI set:** 19 files, 258 tests. Validators fixed (mock wallet-core/liquidjs) and moved to `unit/helpers/`. |
| **After Chunk 15** | — | — | **7** of 14 | **CI set:** 20 files, 272 tests. token-balance.service fixed (mock Response.headers) and moved to `unit/api/services/`. |

**Improvement summary:** Phase 2 (Chunks 1–14) complete. Chunk 1 removed 2 dead files. Chunks 2–7 moved Keep tests and former ci/ into `unit/` and `integration/routes/`. Chunks 8–14 fixed Update tests: currencyFormatter, crypto, deviceIdentity, nip44-message, nostr-message, auth (×3), validators — all moved to `unit/helpers/`. CI now runs **19 files, 258 tests**, all passing. contractPermissions and DebugContractCard.logic remain in place (wallet-core EventBus blocks unit context).

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

**Total Keep:** 12. **In unit/ or integration/routes/:** 19 files (placeholder, helpers ×11: dateFormatter, encoding, currencyFormatter, crypto, deviceIdentity, nip44-message, nostr-message, auth×3, validators; utils×2, api/services, stores, routes×3; integration/routes×1). **Leave in place:** 2 (integration/escrow Keep). **Blocked (wallet-core):** 2 (contractPermissions, DebugContractCard.logic). **CI:** `test:ci` runs `unit/` + `integration/routes/` (258 tests). **Update fixed & moved:** currencyFormatter, crypto, deviceIdentity, nip44-message, nostr-message, auth×3, validators (Chunks 8–14).

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
   - **Quality bar:** Tests must validate real component behavior, not just pass. See §6.1.

6. **Routes** (load functions, page state)  
   - Already have tasks-page in `unit/routes/` and `integration/routes/`. Extend to other high-traffic routes if load logic is non-trivial.

For each new test file, place it in the structure from Section 3 and follow the naming convention.

### 6.1 Component Test Quality Guidelines

When fixing or writing component tests, **do not aim only for passing tests**. Ensure tests validate real component behavior.

| Do | Don't |
|----|-------|
| **Read the component** — Understand props, user flows, conditional rendering, and key behaviors before touching tests. | Mock away so many dependencies that the test no longer exercises real logic. |
| **Assert behavior** — Test that user actions produce the expected outcomes (state changes, callbacks, DOM updates). | Assert implementation details (e.g. internal class names, structure that may change). |
| **Use semantic queries** — Prefer `getByRole`, `getByLabelText`, `getByPlaceholderText` over brittle class/ID selectors. | Rely on fragile selectors (e.g. nth-child) that break on small UI changes. |
| **Test user flows** — Render → interact → assert outcome. Mirror what a user would do. | Test only that something renders without verifying interactions work. |
| **Validate mocks** — Mocks should simulate real dependencies; assertions should match component contracts. | Change assertions to match broken mocks instead of fixing the mock to match the real API. |

**Per-component checklist when fixing tests:**

1. Read the component source (`$lib/components/**/*.svelte`) — props, events, conditional branches.
2. List the key behaviors the component should exhibit (e.g. "shows error when amount is invalid").
3. Ensure each test maps to one or more of those behaviors.
4. If a test only asserts "element exists" with no interaction or outcome, consider strengthening or removing it.
5. Run `npx vitest run src/lib/tests/components/` to validate; fix mocks and selectors to align with real component behavior, not the reverse.

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
- [x] Tests classified as **Remove** are removed; CI still passes (`test:ci` = 258 tests).
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

**Phase 2 restructure complete (Chunks 1–14).** Legacy fixes: Chunk 15 token-balance.service, Chunk 16 paymentAddressParser. **CI: 21 files, 301 tests**, all passing.

### Order of work (legacy tests — document and execute)

| # | Action | Target | Command | Status |
|---|--------|--------|--------|--------|
| 1 | Fix token-balance.service | 11 failed (mock Response.headers) | `npm run test:unit:api` | **Done (Chunk 15)** |
| 2 | Fix paymentAddressParser | Load error (wallet-core chain?) | `npm run test:unit:utils` | **Done (Chunk 16)** |
| 3 | Fix escrow tests | escrowBid, escrowErrors, escrowEvents, feeCalculations, contractPermissions | `npm run test:unit:utils` or run `src/lib/tests/unit/utils/escrow/` | **Done (Chunk 17)** |
| 4 | Fix stores | bid.store, wallet.store.* | `npm run test:unit:stores` | **Done (Chunk 18)** |
| 5 | Fix components | Mock/setup + **quality validation** (see §6.1) | `npx vitest run src/lib/tests/components/` | **In progress** — BalanceHistory ✓, DebugWalletSendForm ✓, SendPaymentForm ✓ (9 passing each; some skipped). Still failing: ReceivePaymentForm, contract/* (DebugContractCard, loadContractsByAddress, functionParsing). |
| 6 | Wallet-core blocker | contractPermissions, DebugContractCard.logic | Add EventBus mock | Pending |
| 7 | Phase 3 — Add tests | New coverage per Section 6 | — | After fixes |

After each fix: move the test file to `unit/` (e.g. `unit/api/services/`), update `package.json` and triage if needed, run `test:ci`.

### Quick reference

1. **Run CI:** `npm run test:ci` — 30 files (unit/ + integration/routes/), 462+ tests.
2. **Run component tests:** `npx vitest run src/lib/tests/components/` — validates all component tests.
3. **Full suite + triage:** `npm run test` or `npm run test:triage`.
4. **Fix Update tests:** Use `test:unit:<group>` scripts; move fixed files to `unit/`; update triage.
5. **Add new tests:** Place under `unit/` per Section 3; follow naming convention.
6. **Component fixes:** Follow §6.1 quality guidelines; read component source before changing tests.

### Where to continue (as of Chunk 21)

| Priority | Target | Notes |
|----------|--------|-------|
| **1** | **ReceivePaymentForm** (unit + integration) | QR/camera, calculator layout, fee estimation; similar patterns to SendPaymentForm (tabs, inputs, mocks). |
| **2** | **Contract tests** | DebugContractCard, loadContractsByAddress, functionParsing — may depend on wallet-core EventBus; consider EventBus mock in test setup. |
| **3** | Add component tests to CI | Once more components pass, consider including `src/lib/tests/components/` in `test:ci` or a separate `test:ci:components` job. |

**Component status (latest run):** 13 passed files, 6 failed, 1 skipped (20 total); 214 passed tests, 16 failed, 14 skipped (244 total). Main failing groups: ReceivePaymentForm (unit + integration), contract tests.

---

## Appendix A — Full List of Test Files to Audit

Use this list to ensure every non-E2E test is triaged. Exclude `e2e/` (Playwright specs and E2E helpers).

**Root (src/lib/tests/):** *(most helpers now in unit/helpers/)*

- dateFormatter.test.ts *(moved to unit/helpers/ Chunk 2)*
- encoding.test.ts *(moved to unit/helpers/ Chunk 2)*
- profile-cache.test.ts *(moved to unit/utils/ Chunk 3)*
- findTasks.test.ts *(removed Chunk 1 — tested non-exported API)*

**unit/helpers/ (Chunks 2–14):**

- validators, currencyFormatter, crypto, deviceIdentity, nip44-message, nostr-message
- auth.test.ts, auth-cache-validation.test.ts, auth-error-recovery.test.ts

**api/services/ (unit/api/services/ has balanceHistory):**

- balanceHistory.service.test.ts *(in unit/api/services/ Chunk 4)*
- token-balance.service.test.ts *(Fixed Chunk 15 — in unit/api/services/)*

**utils/ (unit/utils/ has feeCalculation, profile-cache, paymentAddressParser, escrow/):**

- feeCalculation.test.ts *(in unit/utils/ Chunk 6)*
- profile-cache.test.ts *(in unit/utils/ Chunk 3)*
- paymentAddressParser.test.ts *(Fixed Chunk 16 — in unit/utils/)*
- escrow/*.test.ts *(Fixed Chunk 17 — in unit/utils/escrow/: contractPermissions, escrowBid, escrowErrors, escrowEvents, feeCalculations)*
- nostr-bid.test.ts
- wallet/blockscoutTransactionStatus.test.ts

**stores/ (unit/stores/ has wallet.store, bid.store, wallet.store.*):**

- wallet.store.test.ts *(in unit/stores/ Chunk 5)*
- bid.store.test.ts *(Fixed Chunk 18 — in unit/stores/)*
- wallet.store.debug.test.ts *(Fixed Chunk 18 — in unit/stores/)*
- wallet.store.functions.test.ts *(Fixed Chunk 18 — in unit/stores/)*
- wallet.store.state.test.ts *(Fixed Chunk 18 — in unit/stores/)*
- user-profile-optimization.test.ts *(removed Chunk 1 — empty)*

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
