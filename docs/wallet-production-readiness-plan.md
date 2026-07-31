# Wallet Production Readiness

> Generated: 2026-07-29
> Status: Active — iterate until all items are resolved
> Last updated: 2026-07-29 22:15

---

## Table of Contents

1. [Critical Bugs](#1-critical-bugs)
2. [High UX Issues](#2-high-ux-issues)
3. [Medium Issues](#3-medium-issues)
4. [Low Polish](#4-low-polish)
5. [Test Gaps](#5-test-gaps)
6. [Implementation Order](#6-implementation-order)
7. [Test Plan](#7-test-plan)
8. [Test Infra Issues](#8-test-infra-issues)
9. [Discovered Issues](#9-discovered-issues)

---

## 1. Critical Bugs

### BUG-001: TransactionSuccessScreen Never Shows (All Paths)

**Severity:** CRITICAL

**Two separate root causes:**

**1a. GaslessSendFlow (Arbitrum) — Wrong RPC method in polling**
- **File:** `GaslessSendFlow.svelte:232-240`
- The `$effect` polls `eth_getUserOperationReceipt` with a bundle transaction hash, but this RPC method expects a UserOp hash. The bundler returns `null` for every poll. After 30 attempts (90s), polling silently exits. `step` stays `'pending'` forever.
- **Fix:** Replace `eth_getUserOperationReceipt` with `eth_getTransactionReceipt` (works with bundle tx hashes). Check `data.result.status === '0x1'` for success.

**1b. SendPaymentForm (RSK/BSC/all non-Arbitrum) — No success screen implemented**
- **File:** `SendPaymentForm.svelte:1002-1029`
- After `executeSend()` succeeds, the code registers a blockchain toast and immediately calls `onSuccess(txHash, network)`. The parent (`+page.svelte:738-740`) responds by closing the modal instantly. There is **no code path** that shows `TransactionSuccessScreen`. The `uiState.showSuccessScreen` state (line 111) is dead code — scaffolded but never wired up.
- **Fix:** Before calling `onSuccess`, set `uiState.showSuccessScreen = true` and render `TransactionSuccessScreen` in the template. Only call `onSuccess` when the user clicks "Done".

### BUG-003: Multi-Hop Swap Chain Send — No User Feedback

**Severity:** CRITICAL
**File:** `SendPaymentForm.svelte:1034-1041`

**Root cause:** After `startSwapChain()` succeeds:
1. `result.txHash` is `null` → skip
2. `result.pendingSwapChain` exists → sets state, shows `appStore.showSuccessToast()`
3. `onSuccess` is **never called** → modal stays open
4. Success toast at z-70 is hidden behind modal at z-100
5. User sees the send form with no indication of progress

**Fix:** Call `onSuccess()` after swap chain starts, OR show a "Swap in progress" screen inside the modal with link to Pending Swaps.

### BUG-004: No Loading State During Send Execution

**Severity:** HIGH
**File:** `SendPaymentDetailsTab.svelte` (no `isSending` prop), `SendPaymentForm.svelte:948-953`

**Root cause:** `sendState.isSending = true` is set in `SendPaymentForm`, but `SendPaymentDetailsTab` has no `isSending` prop. The send button is not disabled, no spinner shown. User can re-click send.

**Fix:** Pass `isSending` to `SendPaymentDetailsTab`. Disable button + show spinner when true.

---

## 2. High UX Issues

### UX-001: GaslessSendFlow Has No Max Button

**File:** `GaslessSendFlow.svelte:390-406`

The Arbitrum gasless send form uses a plain `<input type="number">` with no max button. Users must manually calculate sendable amount after fees.

**Fix:** Add a MAX button that reads token balance and subtracts estimated fee buffer.

### UX-002: GaslessSendFlow Has No Address Validation

**File:** `GaslessSendFlow.svelte:380-388`

Recipient input only checks `length > 0`. Invalid EVM addresses pass validation and fail on-chain with cryptic errors.

**Fix:** Validate with `ethers.isAddress()` before enabling "Estimate Fee". Show inline error.

### UX-003: No USDT0 Balance Shown in GaslessSendFlow

**File:** `GaslessSendFlow.svelte`

User has no reference for how much they can send. No balance display anywhere in the gasless flow.

**Fix:** Display USDT0 balance prominently above the amount input.

### UX-004: `SUPPORTED_SEND_NETWORKS` Missing Arbitrum

**File:** `use-send-form-validation.svelte.ts:120-125`

Only contains `rootstock-bitcoin`, `lightning-bitcoin`, `bitcoin`, `usdt-bsc`. Missing `usdt-arbitrum`. Masked by GaslessSendFlow redirect but a latent bug.

**Fix:** Add `'usdt-arbitrum'` and `'usdt0-arbitrum'` to the set.

### UX-005: `computeAvailableBalance` Ignores `usdt0-arb`

**File:** `use-send-form-validation.svelte.ts:170-204`

Falls through to RSK branch, returns rBTC balance instead of USDT0 balance. Masked by GaslessSendFlow redirect.

**Fix:** Add `usdt0-arb` case that reads USDT0 balance from `$allAssets`.

### UX-006: `getChainIdForNetwork` and `getUSDTContractAddressForNetwork` Missing Avalanche/Base

**File:** `chain-utils.ts:9-26, 50-69`

These functions have no entries for `usdt-avalanche` or `usdt-base`. Falls to RSK/BSC defaults. Only affects SEND (not RECEIVE), but still incorrect.

**Fix:** Add cases for `usdt-avalanche` (chainId 43114) and `usdt-base` (chainId 8453).

---

## 3. Medium Issues

### MED-001: GaslessSendFlow Errors Not i18n-ized

**File:** `GaslessSendFlow.svelte:79, 97, 112, 118, 189`

Hardcoded English strings: "Wallet not connected", "Insufficient balance", "Fee estimation failed", "Direct transaction failed".

**Fix:** Replace with `$t()` calls. Add keys to `swap.json`.

### MED-002: GaslessSendFlow Amount Input Uses `type="number"`

**File:** `GaslessSendFlow.svelte:399`

Allows negative values and scientific notation (e.g., `1e10`).

**Fix:** Change to `type="text"` with `inputmode="decimal"` and manual validation.

### MED-003: No ETH Fallback Guidance When Relay Fails

**File:** `GaslessSendFlow.svelte:142-167`

When relay fails and user has no ETH, shows generic error with "Retry" button. No guidance on what to do.

**Fix:** Show: "The gasless relay is unavailable and you have no ETH for gas. Please deposit a small amount of ETH on Arbitrum, or try again later."

### MED-004: Fee Not Shown in SendConfirmScreen (QR Scan Path)

**File:** `SendConfirmScreen.svelte:139-154`

QR scan confirmation path shows amount/network/address but not the fee estimate.

**Fix:** Pass `sendFee.feeEstimate` and display it.

### MED-005: Old ReceiveForm Shows "Coming Soon" for USD

**File:** `ReceiveForm.svelte:164-184`

Only supports Bitcoin networks. `ReceivePaymentForm` supports USDT0 but the older component doesn't.

**Fix:** Delete `ReceiveForm.svelte` (unused — verified not imported anywhere).

### MED-006: RSK Receive QR Uses `rsk:` URI

**File:** `RSKReceive.svelte:25`

Not recognized by generic Ethereum wallets. Should offer plain address QR option.

**Fix:** Use plain address QR by default, or offer both options.

### MED-007: Delayed Insufficient Balance Warning

**File:** `SendPaymentDetailsTab.svelte:1211`

Warning only appears after fee estimate completes. No preliminary warning based on amount alone.

**Fix:** Show preliminary warning when `amount > balance` before fees load.

### MED-008: Gasless Fee Reserve Notice Double-Subtraction

**File:** `SwapFormPhase.svelte:292` (ALREADY FIXED)

The notice subtracted `gaslessFeeReserve` from `amountInTokenUnits` even though the balance already had the reserve deducted. Fixed in current session.

---

## 4. Low Polish

### LOW-001: Redundant Copy Button in RSKReceive

**File:** `RSKReceive.svelte:119-161, 173-189`

Address is clickable AND has a "Copy Address" button. Both trigger the same function.

**Fix:** Keep inline click-to-copy only. Remove bottom button. (Not actually an issue per user.)

### LOW-002: Gasless Fee Notice Shows $0.00 Edge Case

**File:** `SwapFormPhase.svelte:292`

When `amountInTokenUnits < gaslessFeeReserve`, shows "$0.00" without explanation.

**Fix:** Show a warning when amount is less than the fee reserve.

---

## 5. Test Gaps

### GAP-001: No Playwright E2E Tests for Send Flow

No browser-based tests that click through the full send flow. Would have caught:
- Toast behind modal (z-index)
- No loading state during send
- No success screen for non-Arbitrum sends
- "Nothing happens" after multi-hop swap chain send

### GAP-002: No Component Tests for Post-Send States

No tests that render `SendPaymentForm` and verify:
- Success screen appears after send
- Modal closes after success
- Error message shown on failure
- Loading state disables button

### GAP-003: No Tests for TransactionSuccessScreen Transition

The success screen is never reached due to BUG-001. No test verifies the `step = 'success'` transition.

### GAP-004: No Tests for USDT0 Multi-Network Payer Sources

Avalanche, Base, Ethereum as payer sources in the receive flow have zero test coverage.

### GAP-005: No Behavioral Tests for GaslessSendFlow

The entire GaslessSendFlow component has no behavioral or component tests.

### GAP-006: No Tests for `SUPPORTED_SEND_NETWORKS` Validation

No test verifies which networks are supported for sending.

### GAP-007: No Tests for `computeAvailableBalance` Per-Network

No test verifies balance computation for each network (RSK, BSC, Arbitrum).

---

## 6. Implementation Order

| Phase | Priority | Items | Description |
|-------|----------|-------|-------------|
| **Phase 1** | P0 | BUG-001, BUG-003, BUG-004 | Critical bugs — user can't see send success |
| **Phase 2** | P1 | UX-001, UX-002, UX-003, UX-004, UX-005 | GaslessSendFlow missing basic functionality |
| **Phase 3** | P1 | UX-006, MED-005 | Config/validation gaps |
| **Phase 4** | P2 | MED-001, MED-002, MED-003 | GaslessSendFlow polish |
| **Phase 5** | P2 | MED-004, MED-006, MED-007 | Minor UX improvements |
| **Phase 6** | P3 | LOW-001, LOW-002 | Polish |
| **Phase 7** | P0 | GAP-001, GAP-002, GAP-003, GAP-004, GAP-005, GAP-006, GAP-007 | Test coverage for all fixes |

---

## 7. Test Plan

### 7.1 Playwright E2E Tests — Send Flow

**File:** `tests/e2e/wallet/send-flow.spec.ts`

Tests to write:
1. Open send modal → enter amount → click Send → verify confirmation dialog appears
2. Confirm send → verify loading state on button (spinner + disabled)
3. Send succeeds → verify success screen appears (not toast behind modal)
4. Success screen shows tx hash + explorer link + "Done" button
5. Click "Done" → verify modal closes
6. Toast is visible after modal closes
7. Send fails → verify error message shown in modal (not behind it)
8. Multi-hop swap chain → verify "Swap in progress" or success screen
9. GaslessSendFlow → verify fee estimate → confirm → verify success screen

### 7.2 Component Tests — SendPaymentForm Post-Send States

**File:** `src/lib/tests/components/wallet/SendPaymentForm.post-send.test.ts`

Tests to write:
1. Mock `executeSend` to succeed → verify `TransactionSuccessScreen` renders
2. Mock `executeSend` to fail → verify error message shown
3. Verify `isSending` disables the send button
4. Verify modal closes after clicking "Done" on success screen
5. Verify blockchain toast is registered after success
6. Verify multi-hop swap chain shows progress indicator

### 7.3 Component Tests — GaslessSendFlow

**File:** `src/lib/tests/components/wallet/GaslessSendFlow.test.ts`

Tests to write:
1. Fee estimation → confirm step renders
2. Send succeeds → verify `step = 'success'` transition (after BUG-001 fix)
3. Send fails → verify error step
4. Address validation rejects invalid addresses
5. MAX button fills amount with balance minus fee
6. Balance is displayed

### 7.4 Behavioral Tests — Validation Config

**File:** `src/lib/tests/unit/utils/send-validation.behavioral.test.ts`

Tests to write:
1. `SUPPORTED_SEND_NETWORKS` includes Arbitrum networks (after UX-004 fix)
2. `computeAvailableBalance` returns USDT0 balance for `usdt0-arb` (after UX-005 fix)
3. `getChainIdForNetwork` returns correct chain IDs for Avalanche/Base (after UX-006 fix)
4. `getUSDTContractAddressForNetwork` returns correct addresses for Avalanche/Base

### 7.5 Behavioral Tests — USDT0 Multi-Network Receive

**File:** `src/lib/tests/unit/utils/usdt-multinetwork-receive.behavioral.test.ts`

Tests to write:
1. Avalanche as payer source: `deriveChainInfo('usdt-avalanche')` returns chainId 43114
2. Base as payer source: `deriveChainInfo('usdt-base')` returns chainId 8453
3. Ethereum as payer source: `deriveChainInfo('usdt-ethereum')` returns chainId 1
4. Fee estimation from Avalanche → Arbitrum returns valid quote
5. Fee estimation from Base → Arbitrum returns valid quote
6. Fee estimation from Ethereum → Arbitrum returns valid quote
7. `getSourceFromNetwork('usdt-avalanche')` returns `usdt-bsc` (correct mapping)
8. All networks in `SOURCE_CHAIN_MAP` have correct contract addresses

### 7.6 Manual QA Checklist

**File:** `docs/wallet-manual-qa-checklist.md`

Checklist to create:
- [ ] Send RBTC → verify success screen appears
- [ ] Send USDT0 on Arbitrum → verify success screen appears
- [ ] Send USDT0 via swap chain → verify progress indication
- [ ] Verify toast is visible after send (not behind modal)
- [ ] Verify send button shows loading state during send
- [ ] Verify MAX button works for USDT0 on Arbitrum
- [ ] Verify balance is shown in GaslessSendFlow
- [ ] Verify invalid address is rejected in GaslessSendFlow
- [ ] Receive USDT0 on Arbitrum → verify address + QR code
- [ ] Receive USDT0 with Avalanche as payer source → verify fee estimate
- [ ] Verify gasless fee reserve notice shows correct amounts

---

## Appendix: Files Modified in Previous Session

### Swap Fixes (6 fixes)
| File | Change |
|------|--------|
| `src/lib/services/swap-chain/boltz/setup.ts` | Pre-flight RBTC balance check in `lockRskFunds()` |
| `src/lib/services/swap-chain/utils.ts` | `estimateRskGas()` function + constants |
| `src/lib/services/swap-chain/tx-helpers.ts` | Dynamic gas estimation in `sendEvmTransaction()` |
| `src/lib/services/swap-chain/orchestrator.ts` | Gas price stability check (cache + compare + warn >20%) |
| `src/lib/services/route-resolver.ts` | Added `hop2GasCostWei` field to `Route` type |
| `src/lib/services/route-engine/boltz-two-hop.ts` | Extract `hop2GasCostWei` in `composeTwoHopRoute()` |
| `src/lib/runes/use-swap-routes.svelte.ts` | Add hop2 gas to `totalFeeSats` |
| `src/lib/components/wallet/SwapForm.svelte` | `rskGasReserve` + pre-confirm check |
| `src/lib/utils/swap-error.ts` | `insufficient rbtc for gas` regex mapping |
| `src/lib/utils/swap-gas.ts` | Standardized RSK RPC URL |
| `static/locales/en/dashboard/wallet/swap.json` | `insufficient_rsk_gas` i18n key |

### Cosmetic Fix (current session)
| File | Change |
|------|--------|
| `src/lib/components/wallet/SwapFormPhase.svelte` | Removed double-subtraction of `gaslessFeeReserve` from display |

### Test Files Created
| File | Tests | Type |
|------|-------|------|
| `src/lib/tests/unit/swap-chain/setup-preflight.behavioral.test.ts` | 7 | Behavioral |
| `src/lib/tests/unit/wallet/swap-form-gas-reserve.behavioral.test.ts` | 37 | Behavioral |
| `src/lib/tests/unit/services/usdt-send.behavioral.test.ts` | 37 | Behavioral |
| `src/lib/tests/unit/utils/usdt-receive.behavioral.test.ts` | 31 | Behavioral |
| `src/lib/tests/unit/swap-chain/boltz-executors.behavioral.test.ts` | 36 | Behavioral |
| `src/lib/tests/unit/swap-chain/orchestrator.behavioral.test.ts` | 39 | Behavioral |
| `tests/e2e/e2e-rsk-gas-check.js` | 6 | E2E |
| `tests/e2e/e2e-alto-fee-buffer.js` | 7 | E2E |
| `tests/e2e/wallet/send-flow.spec.ts` | 8 | Playwright E2E |
| `src/lib/tests/unit/utils/send-validation.behavioral.test.ts` | 18 (11 pass, 7 expected failures) | Behavioral |
| `src/lib/tests/unit/utils/usdt-multinetwork-receive.behavioral.test.ts` | 17 | Behavioral |
| `src/lib/tests/components/wallet/GaslessSendFlow.test.ts` | 16 (timeout issues) | Component |
| `docs/wallet-manual-qa-checklist.md` | 22 test cases | Manual QA |

---

## 8. Test Infra Issues

### TEST-001: GaslessSendFlow Component Test Times Out

**File:** `src/lib/tests/components/wallet/GaslessSendFlow.test.ts`

**Problem:** The first test times out at 10s. The `render(GaslessSendFlow, ...)` call hangs because the component has too many transitive dependencies (sub-components, stores, effects) that are difficult to fully mock in jsdom.

**Root cause:** GaslessSendFlow renders `PendingTransactionScreen`, `TransactionSuccessScreen`, `GaslessConfirmDialog`, and `GaslessErrorDisplay` — each with their own store subscriptions, `$effect` blocks, and fetch calls. The jsdom environment cannot resolve all async operations.

**Fix options:**
1. **Extract testable logic into a rune/store** — Move the step state machine, polling logic, and fee estimation into a standalone `useGaslessSendFlow()` rune that can be tested without rendering the component
2. **Use `vi.useFakeTimers()`** more aggressively and mock ALL child components with simple stubs
3. **Split into two test files**: one for the state machine logic (no rendering), one for the template rendering (with all child components mocked)

### TEST-002: Send-Validation Expected Failures (7 tests)

**File:** `src/lib/tests/unit/utils/send-validation.behavioral.test.ts`

These 7 failures are **expected** — they document bugs that need fixing:

| Test | Issue | Fix Required |
|------|-------|-------------|
| `SUPPORTED_SEND_NETWORKS` includes `usdt-arbitrum` | UX-004 | Add to set |
| `SUPPORTED_SEND_NETWORKS` includes `usdt0-arbitrum` | UX-004 | Add to set |
| `computeAvailableBalance` returns USDT0 for `usdt0-arb` | UX-005 | Add case |
| `getChainIdForNetwork` returns 43114 for `usdt-avalanche` | UX-006 | Add case |
| `getChainIdForNetwork` returns 8453 for `usdt-base` | UX-006 | Add case |
| `getUSDTContractAddressForNetwork` returns 0x970223... for `usdt-avalanche` | UX-006 | Add case |
| `getUSDTContractAddressForNetwork` returns 0x420000... for `usdt-base` | UX-006 | Add case |

**These tests will pass once UX-004, UX-005, UX-006 are implemented.** They serve as automated acceptance criteria for the fixes.

### TEST-003: Playwright E2E Tests Require Dev Server

**File:** `tests/e2e/wallet/send-flow.spec.ts`

The Playwright tests require a running dev server with authentication. They cannot run in CI without:
1. A seeded test account (nsec + JWT)
2. A running dev server on port 5173 or 4173
3. Network access to RSK/Arbitrum RPCs

**Fix:** Add a `globalSetup` script that seeds auth state (similar to existing `tests/e2e/global-setup.ts`).

---

## 9. Discovered Issues

### BUG-005: `getSourceFromNetwork` Returns `'rbtc'` for Unknown Networks

**Severity:** LOW
**File:** `receive-network-mapping.ts:47-67`

When `getSourceFromNetwork` receives an unknown network string, it returns `'rbtc'` (the fallback at line 66) instead of `null` or `undefined`. This could cause the receive form to show Bitcoin options for an unrecognized network.

**Fix:** Return `null` for unknown networks. Add a null check in the caller.

### BUG-006: `PendingTransactionScreen` Has No `onSuccess` Callback

**Severity:** HIGH
**File:** `PendingTransactionScreen.svelte:34`

The component only has `onClose` callback. When it detects on-chain success via `getTransactionReceipt`, it cannot notify the parent to transition steps. This is the secondary cause of BUG-001.

**Fix:** Add `onSuccess?: (txHash: string) => void` callback prop. Call it when `receiptStatus` transitions to `'success'`.

### BUG-007: All Non-Arbitrum USDT Payer Sources Collapse to `usdt-bsc`

**Severity:** MEDIUM
**File:** `receive-network-mapping.ts:57-58`

`getSourceFromNetwork()` maps Ethereum, Avalanche, Base, Optimism, Polygon, TRON all to `'usdt-bsc'` via a catch-all `startsWith('usdt-')` rule. This means route resolution uses BSC routes instead of the actual payer chain. Fee estimation is unaffected (it uses the raw `payerNetwork` string with `deriveChainInfo()`).

**Fix:** Add specific mappings for each network, or pass the actual chainId to the route resolver instead of the collapsed source wallet.

### BUG-008: `generateReceiveInvoice` Errors for Non-Arbitrum USDT Networks

**Severity:** MEDIUM
**File:** `generate-receive-invoice.ts:187-189`

Ethereum, Avalanche, Base, Optimism, Polygon, TRON all fall through to `callbacks.onError('wallet.receive_form.network_not_available')` because they're not in the handler list `['usdt0-arbitrum', 'wbtc-arbitrum', 'tbtc-arbitrum']`.

**Fix:** Either add handlers for these networks (Changelly deposit address flow) or remove them from the payer source selector until the feature is implemented.

---

## 10. Changelly Deposit Address Implementation

### Context

The receive form shows Avalanche, Base, Ethereum, Optimism, Polygon, TRON as payer source options. The developer's intent (per their response) is: *"provide a Changelly swap address that gets swapped into the asset the user wants. This is for the use case where an external user/account has a different currency than we support."*

**Current state:** The Changelly backend integration is fully implemented (5 swap endpoints, HMAC signing, Prisma persistence, feature flags). The frontend has a Changelly provider, swap executor, and fee estimation. But the **receive flow is not wired to Changelly** — selecting "Ethereum" as payer source shows the user's own EOA address, not a Changelly deposit address.

### What Needs to Be Built

#### 10.1 Changelly Deposit Address Generation

**File:** `generate-receive-invoice.ts`

When the payer source is a non-direct network (Ethereum, Avalanche, Base, etc.):

1. Call `changellyService.createSwap({ from: 'usdt', to: 'usdt0', amount: probeAmount, address: userArbitrumAddress })`
2. Changelly returns `{ payinAddress, payoutAddress, id, status }`
3. Show `payinAddress` as the receive address (not the user's EOA)
4. Store the Changelly swap ID for monitoring

**Dependencies:** The Changelly `createTransaction` API is already implemented in the backend (`POST /api/v1/changelly/swap/create`). The frontend `changelly.service.ts` already has `createSwap()`.

#### 10.2 Changelly Swap Monitoring

**File:** New or extend `swap-chain/executors/changelly.ts`

After showing the deposit address:

1. Poll `changellyService.getSwapStatus(swapId)` every 10 seconds
2. When status changes to `'waiting'` → `'confirming'` → `'finished'`:
   - Notify the user (toast or in-app notification)
   - Update the receive form to show "Funds received"
3. If status is `'failed'` or `'refunded'`:
   - Show error to the user
   - Provide refund information

**Dependencies:** The Changelly status polling is already implemented in the swap chain executor (`executors/changelly.ts`). The polling logic can be reused.

#### 10.3 Fix `getSourceFromNetwork` Mappings

**File:** `receive-network-mapping.ts:47-67`

Add specific mappings for each network instead of the catch-all:

```typescript
case 'usdt-avalanche': return 'usdt-avalanche';
case 'usdt-base': return 'usdt-base';
case 'usdt-ethereum': return 'usdt-ethereum';
case 'usdt-optimism': return 'usdt-optimism';
case 'usdt-polygon': return 'usdt-polygon';
case 'usdt-tron': return 'usdt-tron';
```

Or, if these networks should always route through Changelly, add a `changelly-*` prefix:

```typescript
case 'usdt-avalanche': return 'changelly-usdt-avalanche';
case 'usdt-base': return 'changelly-usdt-base';
// etc.
```

#### 10.4 Fix Route Resolution for Changelly Receives

**File:** `route-resolver.ts`

Add Changelly routes for cross-chain USDT receives:

```
usdt-ethereum → Changelly → usdt0-arbitrum
usdt-avalanche → Changelly → usdt0-arbitrum
usdt-base → Changelly → usdt0-arbitrum
usdt-optimism → Changelly → usdt0-arbitrum
usdt-polygon → Changelly → usdt0-arbitrum
usdt-tron → Changelly → usdt0-arbitrum
```

These routes should use Changelly (not LI.FI/Symbiosis) because:
- Changelly provides a deposit address (payer doesn't need to interact with DeFi)
- LI.FI/Symbiosis require the payer to sign a swap transaction (not practical for receives)

#### 10.5 Update Fee Estimation

**File:** `use-receive-fees.svelte.ts`

When the payer source is a Changelly-routed network:

1. Call `changellyService.estimateSwap({ from: 'usdt', to: 'usdt0', amount })` instead of LI.FI/Symbiosis
2. Display Changelly's fee + estimated output
3. Show estimated arrival time (Changelly typically takes 5-30 minutes)

**Dependencies:** `changellyService.estimateSwap()` is already implemented. `changellyService.getLimits()` can validate minimum/maximum amounts.

#### 10.6 UI Updates

**File:** `ReceivePaymentForm.svelte`, `ReceiveSwapSelector.svelte`

1. When a Changelly-routed network is selected, show a notice: "Funds will be automatically converted to USDT0 on Arbitrum via Changelly"
2. Show the Changelly deposit address (not the user's EOA) with QR code
3. Add a "Monitoring" state that shows Changelly swap progress
4. Handle the "Other" tab Changelly currencies correctly (map to Changelly source, not `rbtc`)

#### 10.7 Remove Broken Payer Sources (Interim)

If the Changelly integration will take time, consider removing or disabling the non-functional payer sources (Avalanche, Base, Ethereum, Optimism, Polygon, TRON) from the ReceiveSwapSelector until the feature is complete. Currently they show fee estimates but generate no deposit address, which is confusing.

### Implementation Order

| Phase | Items | Description |
|-------|-------|-------------|
| **Phase 1** | 10.7 | Remove or disable broken payer sources (quick fix) |
| **Phase 2** | 10.3, 10.4 | Fix source mapping and route resolution |
| **Phase 3** | 10.1, 10.2 | Changelly deposit address generation + monitoring |
| **Phase 4** | 10.5 | Fee estimation via Changelly |
| **Phase 5** | 10.6 | UI updates (notices, progress, QR code) |

### Test Plan

| Test | File | What It Verifies |
|------|------|-----------------|
| Changelly deposit address generation | `receive-flow.behavioral.test.ts` | `createSwap` called with correct params for each network |
| Changelly swap monitoring | `changelly-monitor.test.ts` | Status polling, terminal states, error handling |
| Source mapping correctness | `receive-flow.behavioral.test.ts` | Each network maps to correct source (not collapsed to usdt-bsc) |
| Route resolution for Changelly receives | `route-resolver.test.ts` | Changelly routes exist for all cross-chain USDT pairs |
| Fee estimation via Changelly | `receive-flow.behavioral.test.ts` | `estimateSwap` called instead of LI.FI/Symbiosis |
| Deposit address display | Playwright e2e | QR code shows Changelly address, not user EOA |
