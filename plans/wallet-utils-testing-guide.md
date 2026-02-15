# Wallet Utils — Review, Usage & Testing Guidelines

**Purpose:** Before writing tests for `$lib/utils/wallet/`, ensure we only test **used** code and that tests assert **behavior** with clear guidelines so we are not "writing tests to write tests."

---

## 1. Wallet Utils Inventory & Usage

| Module | Used? | Imported by | Notes |
|--------|-------|-------------|--------|
| **transactionHistory** | ✅ Yes | `wallet.store` (`processTransactions`, `ProcessedTransaction`) | Core: single-pass tx processing, internal txs, running balance. |
| **swapTransaction** | ✅ Yes | `wallet.store` (`isSwapCompleted`, `mapSwapToTransaction`, `shouldShowSwap`), `wallet/+page` (`getSwapType`) | Boltz swap → ProcessedTransaction, status constants, actions. |
| **functionParsing** | ✅ Yes | `transactionHistory` (`parseFunction`) | Extracts selector, decodes escrow/common functions. Used only transitively. |
| **contractDetection** | ✅ Yes | `functionParsing` (`hasContractInteraction`) | **Already tested:** `contractDetection.test.ts`. |
| **contractRegistry** | ✅ Yes | `contractDetection` (`isKnownContract`) | Env-based registry; used via contractDetection. |
| **contractErrorHandler** | ✅ Yes | `debug-smart-contract`, `ContractActions`, `escrowBid` (`getErrorMessage`, `extractContractError`) | Maps revert/errors → user-facing messages. |
| **loadContractsByAddress** | ✅ Yes | `debug-smart-contract` | Loads contracts for address; uses `rpcHelpers.callContractMethod`. Test in _pending. |
| **rpcHelpers** | ✅ Yes | `loadContractsByAddress` | Retry + timeout for RPC/contract calls. |
| **blockscoutTransactionStatus** | ✅ Yes* | *Commented in `PendingTransactionScreen`; used in tests | **Already tested:** `blockscoutTransactionStatus.test.ts`. |
| **balanceManager** | ❌ **No** | — | **Do not test.** Not imported anywhere. |

**Conclusion:** Test **transactionHistory** (used by store), **swapTransaction** (used by store + page), **contractErrorHandler** (used by UI + escrow), **rpcHelpers** (used by loadContractsByAddress). Optionally **contractRegistry** and **functionParsing** (unblock _pending or add unit tests). **Skip balanceManager.**

---

## 2. What “Doing It Right” Means

### 2.1 Only Test Used Code

- Before adding a test file, confirm the module is imported by routes, components, stores, or other used lib code (transitive is fine).
- Do **not** add tests for `balanceManager` or other unused modules just to increase coverage.

### 2.2 Assert Behavior, Not Implementation

| Do | Don’t |
|----|--------|
| Assert **outputs** and **return values** for given inputs | Assert internal function call order or private helpers |
| Assert **observable behavior**: e.g. “returns empty array when userAddress is invalid” | Assert “calls getContractAddresses once” unless that’s the contract we’re testing |
| Assert **shape** and **critical fields** of objects (e.g. `type`, `displayType`, `title`) | Assert every property or snapshot entire objects that include icons/functions |
| Test **branching logic** (send vs receive, swap vs contract, pending vs completed) | Test only the happy path |
| Test **error paths** and **edge inputs** (null, empty, invalid) | Ignore invalid inputs or errors |

### 2.3 Mock Only What You Must

- **Mock external I/O:** `fetch`, `getSwapAddress` (wallet-core), provider/RPC, `import.meta.env` where it changes behavior.
- **Mock i18n** for modules that use `t()` so we can assert on translation keys or stable strings.
- **Prefer testing pure logic** with real inputs (e.g. `getSwapType`, `isSwapCompleted`, `extractContractError` with mocked `t()`).
- **Avoid over-mocking:** If a small utility has no I/O, test it without mocks so behavior is real.

### 2.4 Test Naming and Structure

- **Describe** the module or group (e.g. `swapTransaction`, `contractErrorHandler`).
- **It** names: state the scenario and expected outcome, e.g.  
  `should return submarine when swap has invoice and lockupAddress`,  
  `should return user-friendly key for "only client can accept" revert`.
- One logical behavior per test; multiple assertions for the same outcome are fine (e.g. return value + key fields).

### 2.5 Coverage Is a By-Product

- Goal: **confidence that wallet behavior is correct** and **regression safety**.
- Cover: public API, branches (send/receive/swap/contract, pending/completed/failed), invalid/empty inputs, and error handling.
- Do **not** chase line/statement coverage targets by testing trivial getters or implementation details.

---

## 3. Module-by-Module Testing Plan

### 3.1 swapTransaction (high value, mostly pure)

**Used by:** wallet.store, wallet/+page.

**Public surface to test:**

- **Constants:** `PENDING_STATUSES`, `COMPLETED_STATUSES`, `FAILED_STATUSES`, `FINAL_STATUSES` (optional; can test via behavior).
- **getSwapType(swapData):** Pure.  
  - submarine: has `invoice` and `lockupAddress`.  
  - reverse: has `invoice`, no `lockupAddress`.  
  - chain: otherwise.
- **isSwapCompleted(status):** Pure. True for statuses in `COMPLETED_STATUSES`.
- **isExpiredSwapSafeToDelete(swap, swapType):** Pure.  
  - submarine: expired and no `lockupTxHash`.  
  - reverse: expired → true.  
  - chain: expired and neither `lockupTxHash` nor `serverLockupTxHash`.
- **shouldShowSwap(status, swapType, swap):** Pure. Hide completed; hide expired when safe to delete.
- **mapSwapToTransaction(swap, swapType, currentBalanceSats):** Returns `ProcessedTransaction`. Mock `statusUI` if needed; assert `displayType`, `borderColor`, `title`, `network`, `value`, `hash` for submarine/reverse/chain and pending/completed/failed.
- **getSwapActions(swap, swapType):** Assert presence of `viewQR` for non-final; no need to test commented-out refund/renegotiate unless re-enabled.

**Guidelines:** No store or DOM. Mock only `statusUI` (and optionally env for explorer URL). Prefer real Boltz-like payloads (minimal objects with `status`, `id`, `createdAt`, type-specific fields).

---

### 3.2 contractErrorHandler (high value, pure mapping)

**Used by:** debug-smart-contract, ContractActions, escrowBid.

**Public surface:** `extractContractError(error)`, `getErrorMessage(error, showTechnical?)`.

**Approach:** Mock `svelte-i18n` `get(t)` to return the key (e.g. `(key) => key`). Then:

- **extractContractError:** For each handled revert string (e.g. "only client can accept", "escrow not funded", "insufficient balance", "user rejected", "execution reverted"), assert `userMessage` is the expected key and `errorCode` when present.
- **Unknown error:** Non-Error → unknown_error key; Error with long message → generic_error; otherwise pass-through message.
- **getErrorMessage:** Without technical: returns `userMessage`. With technical: contains both user message and technical details.

**Guidelines:** One or two tests per distinct mapping branch; one test for fallbacks. No need to test every possible string if one representative per branch is covered.

---

### 3.3 transactionHistory (high value, complex)

**Used by:** wallet.store.

**Public surface:** `processTransactions(rawTransactions, userAddress, network, currentBalanceSats)`, `clearContractAddressesCache()`.

**Dependencies:** `getSwapAddress` (wallet-core), `ESCROW_CONTRACT_ADDRESSES`, `fetch` (internal transactions), `parseFunction` (functionParsing), `weiToSatoshi`, `import.meta.env` (network, explorer URLs).

**Strategy:**

- **Option A (recommended):** Test `processTransactions` with **mocked** `getSwapAddress`, `fetch`, and optionally `parseFunction`. Use minimal `Transaction[]` and assert:
  - Invalid `userAddress` → empty array.
  - Simple send/receive (no contract) → correct `type`, `displayType`, `title`, `explorerUrl`, running balance direction.
  - Contract/EtherSwap tx (with mocked addresses) → `type: 'swap'` or `'contract'`, correct `methodName` / `subType` when applicable.
  - Internal escrow payout → `isInternalEscrowPayout`, `displayType: 'receive'`, title `funds_released`.
  - Sort order (newest first) and `balanceAfter` consistency.
- **Option B:** If we export pure helpers (e.g. `normalizeStatus`, `determineBoltzSwapType`, `isEscrowContract`), unit-test them in isolation; keep integration-style tests for `processTransactions` with mocks as above.

**Guidelines:** Mock `fetch` for internal-tx API; mock wallet-core `getSwapAddress` and optionally escrow constants so we don’t hit real network/env. Assert behavior (types, display fields, balances), not call counts of internal helpers.

---

### 3.4 rpcHelpers (medium value)

**Used by:** loadContractsByAddress.

**Public surface:** `executeWithRetry(operation, operationName, config)`, `callContractMethod(contract, methodName, args, config)`.

**Approach:**

- **executeWithRetry:**  
  - Success on first try → returns result, no retries.  
  - Transient error (e.g. network, timeout, 429) → retries up to `maxRetries`, then throws.  
  - Non-transient error → throws immediately, no retry.  
  Use a fake `operation()` that throws or resolves; control transient vs non-transient via error shape.
- **callContractMethod:** Wraps contract call in `executeWithRetry`. Mock contract to resolve/reject; assert result or error propagates.

**Guidelines:** Mock `setTimeout`/timers if we need to assert retry delays; otherwise assert “succeeds after N retries” or “throws without retry” for non-transient.

---

### 3.5 contractRegistry (optional)

**Used by:** contractDetection (already tested). Can be tested in isolation for getters and `isKnownContract` with env stubbed.

- **getEscrowContractAddress**, **getEtherSwapContractAddress:** Stub `import.meta.env` (VITE_RSK_NETWORK, VITE_*_CONTRACT_ADDRESS_*), then assert returned address or null.
- **isKnownContract:** After init, assert known vs unknown address, contractType, isCurrent.
- **addLegacyContract** + **isKnownContract:** Add legacy, then assert isKnown and isCurrent: false.

**Guidelines:** Reset or stub env per test so RSK/BSC and mainnet/testnet branches are deterministic.

---

### 3.6 functionParsing (optional; unblock _pending or add unit)

**Used by:** transactionHistory only (transitive).

- **extractFunctionSelector:** Pure. Test with `0x` prefix, without prefix, too short, null/undefined.
- **decodeUnknownFunction:** Pure. Test known selectors (e.g. transfer) and unknown.
- **parseFunction:** Depends on `hasContractInteraction` and escrow ABI. Mock `contractDetection.hasContractInteraction` and optionally escrow ABI; assert `functionName`, `parameters`, `escrowId` for escrow data, or selector-only for unknown.

**Guidelines:** Existing _pending test can be fixed (EventBus/getWallet) and moved into CI; or add a smaller unit test set for `extractFunctionSelector` and `decodeUnknownFunction` without full parseFunction if that’s enough for confidence.

---

## 4. Implementation Order

1. **contractErrorHandler** — ✅ Done. `unit/utils/wallet/contractErrorHandler.test.ts`
2. **swapTransaction** — ✅ Done. `unit/utils/wallet/swapTransaction.test.ts`
3. **rpcHelpers** — ✅ Done. `unit/utils/wallet/rpcHelpers.test.ts`
4. **transactionHistory** — ✅ Done. `unit/utils/wallet/transactionHistory.test.ts` (mock wallet-core, fetch; stub env; assert send/receive, balance, explorer, cache clear).
5. **contractRegistry** (optional) — If we want stronger coverage of contract detection path.
6. **functionParsing** — Either unblock _pending test or add focused unit tests for pure parts.

---

## 5. Where Tests Live

- **Unit tests** for wallet utils: `src/lib/tests/unit/utils/wallet/` (e.g. `transactionHistory.test.ts`, `swapTransaction.test.ts`, `contractErrorHandler.test.ts`, `rpcHelpers.test.ts`).
- Align with existing `contractDetection.test.ts` (under `components/contract/`) and `blockscoutTransactionStatus.test.ts` (under `utils/wallet/`). For consistency, new wallet **utils** unit tests should live under `unit/utils/wallet/` (see coverage-expansion plan and test layout).

---

## 6. Checklist Before Submitting Tests

- [ ] Module is **used** (verified by grep on routes/components/stores).
- [ ] Tests assert **outcomes** (return values, key fields, error messages/keys), not implementation details.
- [ ] Mocks are only for **I/O and i18n**; pure logic is tested without over-mocking.
- [ ] **Edge cases** and **invalid inputs** are covered (empty, null, invalid address).
- [ ] Test names describe **scenario and expectation**.
- [ ] `npm run test:ci` passes and no new flakiness (e.g. no unconstrained timers or network in tests).

This document should be used as the single source of truth when implementing wallet utils tests so that we add **meaningful, behavior-focused** tests and avoid “testing for the sake of testing.”
