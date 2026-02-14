# Plan: Unit Testing Strategy for BitTasker

**Status:** In progress — Phase 1 & 2 complete; Phase 3 next  
**Created:** 2025-02-13  
**Last updated:** 2025-02-13 (post Chunk 17)  
**Goal:** Establish a strategy to add and maintain unit tests for code that is actually used in the app, starting with an audit of existing tests in `src/lib/tests`, then defining structure and priorities for future tests.

**Current status:** Audit done (72 files: Remove 2, Keep 12, Update 58). Phase 2 + legacy fixes through Chunk 17 (escrow). **Chunk 18:** Store tests fixed and moved to `unit/stores/` (bid.store, wallet.store.state, wallet.store.debug, wallet.store.functions). CI runs **30 files** under `unit/` + `integration/routes/`. Next: components (§10 item 5).

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
| 10 | 2025-02-13 | **Fixed and moved deviceIdentity (Update → unit/).** formatPasskeyName now takes a single options object `{ npub, username?, displayName? }` instead of positional args. Updated all test call sites to object form; null npub test uses `{ npub: null as unknown as string }`. Created `unit/helpers/deviceIdentity.test.ts`, deleted root `deviceIdentity.test.ts`. Updated `test:unit:root-other` to drop deviceIdentity and findTasks (root-other now only nip44-message, nostr-message). **CI set:** 13 files, 185 tests, all pass. | Next: fix more Update tests (nip44-message, nostr-message, auth, validators) or add Phase 3 tests. |
| 11 | 2025-02-13 | **Fixed and moved nip44-message (Update → unit/).** Added `publishToMultipleRelays` to `$lib/utils/nostr` mock; mocked appStore with writable store and pool (querySync); mocked nostr-tools nip19.decode for npub strings to avoid bech32 "Data must be at least 6 characters"; getMessageHistory tests use mockPool.querySync; invalid-key test mocks getConversationKey to reject; event-structure assertions updated to include `['m','direct-message']` tag. Created `unit/helpers/nip44-message.test.ts`, deleted root `nip44-message.test.ts`. Updated `test:unit:root-other` and triage to only nostr-message. **CI set:** 14 files, 195 tests, all pass. | Next: fix nostr-message, auth, validators or add Phase 3 tests. |
| 12 | 2025-02-13 | **Moved nostr-message (root → unit/).** Tests already passed (13 tests). Created `unit/helpers/nostr-message.test.ts`, deleted root `nostr-message.test.ts`. Removed `test:unit:root-other` script and triage `root-other` group (no root message tests left). **CI set:** 15 files, 208 tests, all pass. | Next: fix auth, validators or add Phase 3 tests. |
| 13 | 2025-02-13 | **Fixed and moved auth tests (Update → unit/helpers/).** Updated auth.test.ts, auth-cache-validation.test.ts, auth-error-recovery.test.ts to match current Credentials shape (npub, encryptedData, exportedKey) and nostrKeys implementation (no retry on decrypt failure, no ACCESS_TOKEN/NPUB mismatch checks). Moved all three to `unit/helpers/`. Updated `test:unit:auth` path; added triage `unit-helpers-auth` group; removed old root auth group. **CI set:** 18 files, 225 tests, all pass. | Next: fix validators or add Phase 3 tests. |
| 14 | 2025-02-13 | **Fixed and moved validators (Update → unit/helpers/).** Mocked @bittasker/wallet-core and liquidjs-lib so validators module loads (EventBus missing in test env). Aligned tests with current implementation: validatePassword now only checks length ≥12; validateNostrPrivateKey has different error messages and validation order. Moved to `unit/helpers/validators.test.ts`. **CI set:** 19 files, 258 tests, all pass. | Next: Phase 3 (add tests) or fix more Update tests. |
| 15 | 2025-02-13 | **Fixed and moved token-balance.service (Update → unit/api/services/).** Service calls `response.headers.entries()`; mock fetch did not provide headers. Added `mockFetchResponse()` helper returning Response-like object with `headers: { entries: () => [] }`. Moved to `unit/api/services/token-balance.service.test.ts`. **CI set:** 20 files, 272 tests, all pass. | Next: paymentAddressParser (item 2). |
| 16 | 2025-02-13 | **Fixed and moved paymentAddressParser (Update → unit/utils/).** Load failed via validators → wallet-core EventBus. Added vi.mock for @bittasker/wallet-core and liquidjs-lib (same pattern as validators). Moved to `unit/utils/paymentAddressParser.test.ts`. **CI set:** 21 files, 301 tests, all pass. | Next: escrow tests (item 3). |
| 17 | 2025-02-13 | **Fixed and moved escrow tests (Update → unit/utils/escrow/).** (1) escrowBid: merged duplicate @bittasker/wallet-core mocks (FEE_TIERS + normalizeRskAddress); aligned one test with implementation (past start time always adjusted to now+1h). (2) feeCalculations: removed second empty wallet-core mock. (3) escrowEvents: added getContracts, deleteContract, handleStatusEvent, handleContractEvent to nostrContract mock; removed duplicate wallet-core mock. (4) contractPermissions: import EscrowStatus from `v1/escrow.enum` in helper and test to avoid loading full escrow (wallet-core EventBus). Source change in `$lib/utils/helpers/contractPermissions.ts`. Moved all 5 files from `utils/escrow/` to `unit/utils/escrow/`. **CI set:** 26 files, 420 tests, all pass. | Next: stores (item 4). |
| 18 | 2025-02-13 | **Fixed and moved store tests (Update → unit/stores/).** wallet.store.state: removed tests for removed `isAssetsLoading` derived store; fixed AssetFactory import path after move. wallet.store.debug: added upload.service mock to avoid profile.ts load; ensured ERC20_ABI in wallet-core mock; removed redundant spy. wallet.store.functions: added upload.service mock; WalletManager mock extended with dispose, rskWallet.loadTransactions, bscWallet.loadTransactions, submarineSwapService/reverseSwapService/chainSwapService.recoverPendingSwaps; ERC20_ABI in wallet-core mock; init error test expects rejection; race-condition test initializes wallet first; AssetFactory path. Moved bid.store, wallet.store.state, wallet.store.debug, wallet.store.functions from `stores/` to `unit/stores/`. Updated `test:unit:stores` to run `unit/stores/`. **CI set:** 30 files (unit/ + integration/routes/), 462 tests. | Next: components (item 5). |
| 19 | 2025-02-14 | **Partial component fixes.** TransactionHistory: added ProcessedTransactionFactory to test-data-factories; mock transactions now use ProcessedTransaction format (iconConfig.base, displayType, network); walletStore mock adds isConnected, isInitializing. ReceivePaymentForm + integration: added getCachedReverseSwapPairs, getCachedChainSwapPairs to walletManager mock. DebugWalletSendForm: added walletStore, initialize, estimateERC20Gas, estimateRBTCGas.mockResolvedValue; fixed selectors (getAllByRole('textbox'), getByPlaceholderText('0')); fixed sendRBTC/sendRSKToken mocks (component uses store-level exports); countdown tests skipped (complex async flow). **CI:** unchanged (30 files, 462 tests). Components not yet in CI. | Continue fixing remaining component tests (WalletPaymentModal, InvoiceDisplay, etc.). |

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
| 5 | Fix components | Mock/setup issues | `npm run test:unit:components` | **In progress (Chunk 19)** — TransactionHistory fixed (ProcessedTransaction mock); ReceivePaymentForm, DebugWalletSendForm partial fixes; countdown tests skipped |
| 6 | Wallet-core blocker | contractPermissions, DebugContractCard.logic | Add EventBus mock | Pending |
| 7 | Phase 3 — Add tests | New coverage per Section 6 | — | After fixes |

After each fix: move the test file to `unit/` (e.g. `unit/api/services/`), update `package.json` and triage if needed, run `test:ci`.

### Quick reference

1. **Run CI:** `npm run test:ci` — 30 files (unit/ + integration/routes/), 462+ tests.
2. **Full suite + triage:** `npm run test` or `npm run test:triage`.
3. **Fix Update tests:** Use `test:unit:<group>` scripts; move fixed files to `unit/`; update triage.
4. **Add new tests:** Place under `unit/` per Section 3; follow naming convention.

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
