# Wallet: Blockchain Toast + Lifecycle Fixes

**Date**: 2026-07-06
**Status**: Planning — no changes yet
**Scope**: Phase 2 of wallet UX lifecycle remediation

---

## Context

The wallet UX lifecycle audit (109 gaps across swap, send, receive, DeFi) identified the
following issues. This plan addresses the cross-cutting infrastructure issues. Issues that are
specific to individual flows (e.g., LNURL validation, slippage protection) are tracked separately.

### Full Audit Findings

#### 🔴 CRITICAL (10)

| # | Area | Issue | Status in This Plan |
|---|------|-------|-------------------|
| C1 | Swap | Cancel button doesn't abort swap chain service | N/A — confirmed correct (no cancel once initiated) |
| C2 | Send | `isOnline` wired but unused in validation — offline sends not blocked | Addressed by Step 1 (network reconnect handler) |
| C3 | Send | `successTxHash` never populated — `TransactionSuccessScreen` is unreachable dead code | Addressed by Step 4 (toast replaces success screen) |
| C4 | Send | Insufficient balance check bypassed when `feeEstimate === null` | **Not in scope** — separate fix in `use-send-form-validation` |
| C5 | Send | No navigation guard during pending send | Addressed by Step 4 (toast persists across navigation) |
| C6 | Receive | Lightning invoice expiry not handled | **Not in scope** — separate fix in `PaymentRequestModal` |
| C7 | Receive | No app resume handler — stale data after backgrounding | Addressed by Step 1 |
| C8 | DeFi | Zero slippage protection on LP operations | **Not in scope** — separate fix in LP components |
| C9 | DeFi | No real-time health factor monitoring | **Not in scope** — separate fix in DeFi |
| C10 | Send | `liquid-bitcoin` selectable but has no send handler | **Not in scope** — separate fix in destination picker |

#### 🟡 HIGH (31)

**Swap (14):** H1-H3 (silent failures) — not in scope. H4 (offline feedback) — Step 1. H5 (no timeout) — Step 5. H6 (lifecycle) — Step 1. H7 (collapsed swaps) — not in scope. H8 (gas feedback) — not in scope. H9 (balance refresh) — Step 1. H10 (retry) — Step 5. H11 (per-hop progress) — Step 6. H12-H14 — not in scope.

**Send (7):** H15-H16 (LNURL) — not in scope. H17 (retry) — Step 5. H18 (timeout) — Step 5. H19-H21 — not in scope.

**Receive + Infrastructure (5):** H22 — not in scope. H23 (payment detection) — Step 2. H24 (WC expiry) — not in scope. H25 (disconnect safety) — Step 7. H26 (reconnect) — Step 1.

**DeFi (5):** H27-H31 — not in scope.

#### 🟢 MEDIUM (31)

M9 (balance refresh on send) — Step 1. M10 (onSuccess timing) — Step 5. M16 (stuck tx) — Step 5. M18 (price failure) — Step 8. M19 (staleness) — Step 8. M20 (connected wallet) — Step 1. All others — not in scope.

#### 🟢 LOW (37)

Not tracked in this plan — addressed as individual tickets when touching relevant code.

### Cross-Cutting User Journey Gaps

1. **No app-level resume handler** → Step 1
2. **No network reconnect handler** → Step 1
3. **No periodic background refresh** → Step 2 (block watcher)
4. **No disconnect safety** → Step 7
5. **Silent failures throughout** → Steps 4-6 (toast surfaces errors persistently)
6. **No operation timeout discipline** → Step 5 (block-based detection)
7. **Dead code paths** → Steps 4-6 (deleted components)

---

## Architecture

### New: `BlockchainToast` — Persistent floating toast for blockchain operations

A single component that replaces 5 full-screen components and handles all blockchain
operation status (sends, swaps, DeFi transactions) with block-based confirmation.

```
┌─────────────────────────────────────────────────────────┐
│  (existing page content — send form, wallet, etc.)      │
│                                                          │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🔵 Sending 0.5 RBTC                            │    │  ← collapsed
│  │ Confirming... (~1 min left)                     │    │
│  │                              [Details ▼] [✕]    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🟢 Sent 0.5 RBTC ✓                             │    │  ← success
│  │ Confirmed in 2 blocks • Tap to view explorer    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Key behaviors:**
- Fixed bottom, above the nav bar (`z-40`, below modals at `z-50`)
- Max 2 full toasts visible on mobile; rest collapse into "N more" pill
- Tap text area to expand → shows explorer link, amount, address, copy buttons
- Action buttons (`event.stopPropagation()`) don't trigger expand
- Auto-collapse on `beforeNavigate`
- Success: green checkmark, auto-dismiss after 8s (paused when expanded)
- Error: red, persists until dismissed, shows short error summary in collapsed view
- "Retry" navigates to pre-filled send form (never re-broadcasts blindly)
- Swaps: shows direction ("Swapping 0.5 BTC → RBTC") with phase progress
- Network-aware: shows "Waiting for connection..." when offline
- Stale timeout: if confirming > 10 min without block update → "Check status" state
- On app resume: immediately poll receipts for all pending toasts
- Persists across page navigations (global store, not component-local)
- All strings use `$t()` — no hardcoded English
- ARIA: `role="status"`, `aria-live="polite"`, keyboard dismiss via Escape
- Swipe-to-dismiss for success/error toasts (not confirming)
- Sentry breadcrumbs on add/success/error

### Chain-Specific Confirmation Counts

| Chain | Required Confirmations | Block Time | ETA |
|-------|----------------------|-----------|-----|
| RSK | 3 | ~30s | ~90s |
| BSC | 1 | ~3s | ~3s |
| Ethereum | 3 | ~12s | ~36s |
| Arbitrum | 1 | ~0.25s | ~0.25s |
| Bitcoin | 1 | ~10min | ~10min |
| Lightning | N/A (swap) | N/A | ~90s (RSK lockup) |

**Note**: `confirmationTime` in `send-network-mapping.ts` represents time per block, NOT
required confirmations. The toast uses a separate `requiredConfirmations` lookup.

### Exclusions

- **Arbitrum direct sends**: Fast-path only. Tx confirms in <1s → brief success toast via
  `appStore.showSuccessToast()`, no persistent toast.
- **PendingSwaps.svelte**: Stays as-is (management screen for multi-hop swaps).
- **PendingSwap.svelte**: Stays as-is.
- **PendingClaimBanner.svelte**: Stays as-is.

---

## Implementation Plan

### Step 1: App Resume + Network Reconnect Handler

**Why first**: Prerequisite for the toast — block subscription must survive backgrounding.

**Files**:
- `src/lib/stores/wallet/wallet-init.ts` — add resume handler (modify existing file)
- No new file — reuse existing `browserNetworkStatus` from `src/lib/utils/network-status.ts`

**Changes**:
```
wallet-init.ts:
  + import { browser } from '$app/environment'
  + import { browserNetworkStatus } from '$lib/utils/network-status'
  + import { Capacitor } from '@capacitor/core'
  + import { scheduleBalanceRefresh } from './wallet-balances'
  + import { loadTransactions } from './wallet-transactions'
  +
  + let resumeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  +
  + function scheduleResumeRefresh(): void {
  +   if (resumeRefreshTimer) clearTimeout(resumeRefreshTimer);
  +   resumeRefreshTimer = setTimeout(() => {
  +     resumeRefreshTimer = null;
  +     try {
  +       scheduleBalanceRefresh();
  +       loadTransactions();
  +       blockchainToastStore.checkPendingReceipts();
  +     } catch (err) {
  +       console.error('[wallet-init] Resume refresh error:', err);
  +     }
  +   }, 1000); // 1s debounce to coalesce resume + reconnect
  + }
  +
  + function setupAppLifecycleHandlers(): void {
  +   if (!browser) return;
  +
  +   // Capacitor app resume — dynamic import, platform guard
  +   if (Capacitor.isNativePlatform()) {
  +     import('@capacitor/app').then(({ App }) => {
  +       App.addListener('appStateChange', ({ isActive }) => {
  +         if (isActive) scheduleResumeRefresh();
  +       });
  +     });
  +   }
  +
  +   // Network reconnect — use existing browserNetworkStatus store
  +   browserNetworkStatus.subscribe((status) => {
  +     if (status.lastTransition === 'online' && state.sdkWalletManager) {
  +       scheduleResumeRefresh();
  +     }
  +   });
  + }
  +
  + // Call from initialize() after wireSwapUpdates()
```

**Audit fixes applied**:
- ✅ Platform guard: `Capacitor.isNativePlatform()` + dynamic import (matches `activityTracker.ts`)
- ✅ Browser guard: `if (!browser) return` (prevents SSR failure)
- ✅ No duplicate infrastructure: reuses existing `browserNetworkStatus` instead of new file
- ✅ Debounce: single `scheduleResumeRefresh()` coalesces resume + reconnect events
- ✅ `blockchainToastStore.checkPendingReceipts()` polls receipts on resume (fixes stale toast)
- ✅ Try-catch in callback body

**Lines**: ~35 new, 0 deleted, 0 new files
**Test coverage**: mock `Capacitor.isNativePlatform()`, mock `browserNetworkStatus`, verify callbacks

---

### Step 2: Always-On Block Watcher

**Why**: Currently `ensureInboundBlockWatch` only activates during inbound swap expectations.

**Files**:
- `src/lib/stores/wallet/wallet-init.ts` — expand block watcher

**Changes**:
```
wallet-init.ts:
  - function ensureInboundBlockWatch(): void {
  -   if (!state.sdkWalletManager?.rskWallet || state.unsubscribeBlockWatch) return;
  -   if (typeof state.sdkWalletManager.rskWallet.onBlock !== 'function') return;
  -   state.unsubscribeBlockWatch = state.sdkWalletManager.rskWallet.onBlock(() => {
  -     if (!isExpectingInbound()) return;
  -     scheduleBalanceRefresh();
  -   });
  - }
  + function ensureBlockWatch(): void {
  +   if (!state.sdkWalletManager?.rskWallet || state.unsubscribeBlockWatch) return;
  +   if (typeof state.sdkWalletManager.rskWallet.onBlock !== 'function') return;
  +   state.unsubscribeBlockWatch = state.sdkWalletManager.rskWallet.onBlock((blockNumber) => {
  +     try {
  +       scheduleBalanceRefresh();
  +       blockchainToastStore.onBlock('rsk', blockNumber);
  +     } catch (err) {
  +       console.error('[wallet-init] Block callback error:', err);
  +     }
  +   });
  + }
```

**Also fix `softCleanup()`** — currently disposes SDK but doesn't clean up block subscription:
```
softCleanup():
  + state.unsubscribeBlockWatch?.();
  + state.unsubscribeBlockWatch = null;
  // ... existing dispose logic
```

Then `ensureBlockWatch()` must be re-called on app resume (handled by `scheduleResumeRefresh`).

**Audit fixes applied**:
- ✅ Try-catch in block callback (prevents silent death)
- ✅ `softCleanup()` cleans up block subscription (prevents disposed provider access)
- ✅ Sentry breadcrumb on error

**Lines**: ~20 changed
**Test coverage**: Block callback error handling, softCleanup cleanup

---

### Step 3: Blockchain Toast Store

**Files**:
- `src/lib/stores/wallet/blockchain-toast.store.ts` — new file (~120 lines)

**Store shape** — must wrap in object to match `app.store.ts` pattern:
```typescript
// ❌ WRONG (plan's original): writable<BlockchainToastItem[]>([])
// → $blockchainToastStore.length works but $blockchainToastStore.toasts is undefined

// ✅ CORRECT: writable<{ toasts: BlockchainToastItem[] }>({ toasts: [] })
// → $blockchainToastStore.toasts.length works, matches app.store.ts
```

**Types**:
```typescript
interface BlockchainToastItem {
  id: string;                    // unique ID (txHash, swapId, or crypto.randomUUID())
  type: 'send' | 'swap' | 'defi';
  status: 'pending' | 'confirming' | 'success' | 'error' | 'stale';
  network: string;
  amount: number;                // sats
  amountUSD: number;
  asset: string;                 // 'rBTC', 'USDT', 'BTC' — for display
  recipient: string;             // shortened for display
  sourceAddress: string | null;  // user's wallet address (for disconnect matching)
  txHash: string | null;
  swapId: string | null;
  swapType: SwapType | null;
  currentBlock: number | null;
  requiredConfirmations: number; // from chain config (not time-derived)
  error: string | null;          // i18n key, not raw message
  errorValues: Record<string, unknown> | null; // interpolation values
  createdAt: number;
  expanded: boolean;
  _dismissTimer: ReturnType<typeof setTimeout> | null;
  actions: BlockchainToastAction[];
}

interface BlockchainToastAction {
  labelKey: string;              // i18n key, e.g. 'wallet.toast.retry'
  variant: 'primary' | 'ghost' | 'error';
  onClick: () => void;
}
```

**Store API**:
```typescript
function createBlockchainToastStore() {
  const state = writable<{ toasts: BlockchainToastItem[] }>({ toasts: [] });

  return {
    subscribe: state.subscribe,

    add(item: Omit<BlockchainToastItem, 'createdAt' | 'expanded' | '_dismissTimer'>): void
    // - Checks for duplicate ID → updates existing instead
    // - Enforces MAX_TOASTS (10) → removes oldest completed/errored
    // - Sentry.addBreadcrumb({ category: 'blockchain-toast', message: 'registered' })

    patch(id: string, changes: Partial<BlockchainToastItem>): void
    // - Renamed from 'update' to avoid collision with svelte store's update()
    // - Cancels _dismissTimer if status changes from 'success'

    remove(id: string): void
    // - Clears _dismissTimer before removing

    onBlock(network: string, blockNumber: number): void
    // - Updates currentBlock on matching 'confirming' toasts
    // - Checks stale timeout (10 min without block update → 'stale')
    // - Re-verifies recent successes (within 6 blocks) for reorg protection

    onSuccess(id: string): void
    // - Sets status='success', starts 8s auto-dismiss timer
    // - Stores timer in _dismissTimer
    // - No-op if already 'success' (prevents double-fire)
    // - Sentry.addBreadcrumb

    onError(id: string, errorKey: string, values?: Record<string, unknown>): void
    // - Sets status='error', clears any auto-dismiss timer
    // - Sentry.captureException

    checkPendingReceipts(): void
    // - Called on app resume
    // - Polls getTransactionReceipt for all 'confirming' toasts
    // - Updates to 'success' or 'error' based on receipt

    dismissActive(): void
    // - Called on Escape key press
    // - Collapses the most recently expanded toast
  };
}

export const blockchainToastStore = createBlockchainToastStore();
```

**Audit fixes applied**:
- ✅ Store wraps in object (matches `app.store.ts`, template access works)
- ✅ `patch()` instead of `update()` (no collision with svelte store)
- ✅ Duplicate ID handling in `add()`
- ✅ MAX_TOASTS enforcement (10 max, removes oldest completed)
- ✅ `_dismissTimer` stored on item, cancelled on status change (prevents onSuccess/onBlock race)
- ✅ `sourceAddress` field for disconnect matching (not recipient)
- ✅ `error` is i18n key + `errorValues` for interpolation
- ✅ `requiredConfirmations` from chain config (not time-derived)
- ✅ `stale` status for stuck transactions (10 min timeout)
- ✅ `checkPendingReceipts()` for app resume
- ✅ `dismissActive()` for keyboard dismiss
- ✅ Sentry breadcrumbs on add/success/error
- ✅ `asset` field for display ("0.5 RBTC" not "0.5 sats")
- ✅ `labelKey` on actions (i18n, not hardcoded)

**Lines**: ~120 new
**Test coverage**: All store methods + edge cases (duplicate, max, stale, race)

---

### Step 4: Blockchain Toast Component

**Files**:
- `src/lib/components/wallet/BlockchainToast.svelte` — new file (~300 lines)

**Key design decisions** (from UX audit):
- **z-40** (below modals at z-50, above content)
- **Max 2 full toasts on mobile**, rest in "N more" pill
- **Human-readable time** in collapsed view ("~1 min left"), block detail in expanded only
- **Type badge** ("Send" / "Swap") + distinct icons
- **Error summary** in collapsed view ("Send failed — insufficient funds")
- **Tap text area to expand**, action buttons use `event.stopPropagation()`
- **Swipe-to-dismiss** for success/error (not confirming)
- **Auto-collapse on `beforeNavigate`**
- **8s auto-dismiss** for success (paused when expanded)
- **Keyboard dismiss** via Escape (`<svelte:window onkeydown>`)
- **ARIA**: `role="status"`, `aria-live="polite"`, `aria-label` on progress/buttons
- **Network-aware**: "Waiting for connection..." overlay when offline
- **Stale state**: "Check status" button when confirming > 10 min
- **All strings via `$t()`**
- **Match existing `Toast.svelte` transitions**: `in:fly={{ y: 40, duration: 300, easing }}` / `out:fade={{ duration: 200 }}`
- **Match existing banner style**: `border-primary/50 shadow-primary/40 ring-1 ring-black/5`
- **btn-sm minimum** for all interactive elements (44px touch target)
- **Delay toast entry by 350ms** after send (keyboard dismiss animation)
- **Cap expanded height at 40vh** with internal scroll
- **Compact 2-column grid** for expanded details

**Retry semantics** (from UX audit — CRITICAL):
```
// "Retry" NEVER re-broadcasts a signed transaction.
// For sends: navigate to send form pre-filled with same recipient + amount.
// For swaps: call resumeSwapChain() if PARTIAL, otherwise start fresh.
// For DeFi: navigate to the DeFi form pre-filled.
```

**Sub-components** — inline within `BlockchainToast.svelte` (not separate files):
- Status icon (spinner / check / error / stale) — ~20 lines inline
- Expanded details (2-column grid with copy buttons) — ~40 lines inline
- "N more" pill — ~15 lines inline

**Lines**: ~300 new
**Test coverage**: All states + expand/collapse + auto-dismiss + keyboard + swipe

---

### Step 5: Arbitrum Fast-Path + Block-Based Polling + Retry Semantics

**Files**:
- `src/lib/components/wallet/SendPaymentForm.svelte` — fast-path + toast registration
- `src/lib/components/wallet/PendingTransactionScreen.svelte` — block-based polling (temporary)

**SendPaymentForm.svelte changes**:
```
handleSend():
  + import { blockchainToastStore } from '$lib/stores/wallet/blockchain-toast.store'
  +
  + // Arbitrum fast-path
  + if (sendState.pendingNetwork === 'usdt-arbitrum') {
  +   appStore.showSuccessToast($t('wallet.send.sent_successfully'), 2000);
  +   walletManager.loadAssets();
  +   clearPendingSendState();
  +   return;
  + }
  +
  + // All other chains: register blockchain toast
  + const requiredConfirmations = REQUIRED_CONFIRMATIONS[sendState.pendingNetwork] ?? 3;
  + blockchainToastStore.add({
  +   id: crypto.randomUUID(),
  +   type: 'send',
  +   status: 'confirming',
  +   network: sendState.pendingNetwork!,
  +   amount: sendState.pendingAmount!,
  +   amountUSD: sendState.pendingAmountUSD ?? 0,
  +   asset: getAssetForNetwork(sendState.pendingNetwork!),
  +   recipient: sendState.pendingAddress!,
  +   sourceAddress: getSourceAddress(sendState.pendingNetwork!),
  +   txHash: sendState.pendingTxHash!,
  +   swapId: sendState.pendingSwapId ?? null,
  +   swapType: null,
  +   currentBlock: null,
  +   requiredConfirmations,
  +   error: null,
  +   errorValues: null,
  +   actions: [{
  +     labelKey: 'wallet.toast.view_details',
  +     variant: 'ghost',
  +     onClick: () => { /* expand toast */ }
  +   }]
  + });
  + clearPendingSendState();
```

**Retry action** (set when error occurs):
```
// For sends: navigate to pre-filled send form
actions: [{
  labelKey: 'wallet.toast.retry',
  variant: 'primary',
  onClick: () => {
    goto(`/wallet?send=${encodeURIComponent(toast.recipient)}&amount=${toast.amount}`);
  }
}]
```

**Error message mapping**:
```
const ERROR_KEY_MAP: Record<string, string> = {
  'insufficient_funds': 'wallet.toast.error.insufficient_funds',
  'insufficient_gas': 'wallet.toast.error.insufficient_gas',
  'nonce_too_low': 'wallet.toast.error.nonce_too_low',
  'execution_reverted': 'wallet.toast.error.execution_reverted',
  'timeout': 'wallet.toast.error.timeout',
  'network_error': 'wallet.toast.error.network_error',
};

function mapErrorToKey(error: string): { key: string; values: Record<string, unknown> } {
  for (const [pattern, key] of Object.entries(ERROR_KEY_MAP)) {
    if (error.toLowerCase().includes(pattern)) return { key, values: {} };
  }
  return { key: 'wallet.toast.error.generic', values: { detail: error } };
}
```

**PendingTransactionScreen block-based polling**:
```
onMount():
  - pollingInterval = setInterval(pollForConfirmation, 3000);
  + // Block-based confirmation — only checks when new block arrives
  + const provider = getProvider(network === 'rootstock-bitcoin' ? 'rsk' : 'bsc');
  + let unsubscribe: (() => void) | null = null;
  + if (provider?.on) {
  +   unsubscribe = provider.on('block', async () => {
  +     try {
  +       const receipt = await provider.getTransactionReceipt(txHash);
  +       if (receipt) {
  +         receiptStatus = receipt.status === 1 ? 'success' : 'error';
  +         unsubscribe?.();
  +       }
  +     } catch (err) {
  +       if (err?.code === 'NETWORK_ERROR' || err?.message?.includes('disposed')) {
  +         unsubscribe?.(); // Stop on disposed provider
  +       }
  +     }
  +   });
  + }

onDestroy():
  + unsubscribe?.(); // Clean up block subscription
```

**Audit fixes applied**:
- ✅ Arbitrum fast-path with 2s toast duration
- ✅ `crypto.randomUUID()` instead of `Date.now()` for IDs
- ✅ `requiredConfirmations` from chain config (not `Math.ceil(confTime/30)`)
- ✅ `sourceAddress` field for disconnect matching
- ✅ Error message mapping to i18n keys
- ✅ Retry navigates to pre-filled form (never re-broadcasts)
- ✅ Try-catch in block callback with disposed provider guard
- ✅ `onDestroy` cleanup for block subscription
- ✅ Remove existing `appStore.showSuccessToast()` in non-Arbitrum path (avoid duplicate)
- ✅ All strings via `$t()`

**Lines**: ~70 changed in SendPaymentForm, ~25 changed in PendingTransactionScreen
**Test coverage**: Arbitrum fast-path, toast registration, retry navigation, block-based polling

---

### Step 6: Swap Flow Integration

**Files**:
- `src/lib/components/wallet/SwapForm.svelte` — register toast + delete phase components
- `src/lib/services/swap-chain/state.ts` — multi-subscriber `onSwapProgress`
- `src/lib/components/wallet/SwapExecutingPhase.svelte` — DELETE
- `src/lib/components/wallet/SwapSuccessPhase.svelte` — DELETE
- `src/lib/components/wallet/SwapFailedPhase.svelte` — DELETE

**Fix `onSwapProgress` — single-callback → multi-subscriber**:
```
state.ts:
  - let swapProgressCallback: ((step, msg) => void) | null = null;
  - export function onSwapProgress(cb) { swapProgressCallback = cb; return () => { swapProgressCallback = null; }; }
  - export function setSwapProgress(step, msg) { currentSwapProgressStep = step; swapProgressCallback?.(step, msg); }
  +
  + const swapProgressListeners = new Set<(step: SwapProgressStep, message: string) => void>();
  + export function onSwapProgress(cb: (step: SwapProgressStep, message: string) => void): () => void {
  +   swapProgressListeners.add(cb);
  +   return () => { swapProgressListeners.delete(cb); };
  + }
  + export function setSwapProgress(step: SwapProgressStep, message: string): void {
  +   currentSwapProgressStep = step;
  +   for (const cb of swapProgressListeners) {
  +     try { cb(step, message); } catch (err) { console.error('[swap-progress] Listener error:', err); }
  +   }
  + }
```

**SwapForm.svelte changes**:
```
executeSwap():
  + blockchainToastStore.add({
  +   id: crypto.randomUUID(),
  +   type: 'swap',
  +   status: 'confirming',
  +   network: sourceNetwork,
  +   amount: swapCalc.amount,
  +   amountUSD: swapCalc.amountUSD,
  +   asset: getAssetForNetwork(sourceNetwork),
  +   recipient: destination,
  +   sourceAddress: getSourceAddress(sourceNetwork),
  +   txHash: null,
  +   swapId: null,
  +   swapType: swapType,
  +   currentBlock: null,
  +   requiredConfirmations: REQUIRED_CONFIRMATIONS[sourceNetwork] ?? 3,
  +   error: null,
  +   errorValues: null,
  +   actions: []
  + });

  // Existing onSwapProgress callback now ALSO updates the toast:
  unsubscribeProgress = onSwapProgress((step, message) => {
    // Keep local state for any remaining UI
    swapProgressStep = step;
    swapProgressMessage = message;
    // Update toast
    blockchainToastStore.patch(toastId, {
      status: step === 'complete' ? 'success' : 'confirming',
      // ... map step to toast state
    });
  });

  // On success:
  + blockchainToastStore.onSuccess(toastId);

  // On failure:
  + blockchainToastStore.onError(toastId, mapErrorToKey(errorMessage).key);

  // Remove phase-specific template:
  - {#if swapPhase === 'executing'}<SwapExecutingPhase />{/if}
  - {#if swapPhase === 'success'}<SwapSuccessPhase />{/if}
  - {#if swapPhase === 'failed'}<SwapFailedPhase />{/if}
  + <!-- Toast handles all phases via global store -->

  // Clean up local state variables that are no longer needed:
  - let swapPhase = $state<'form' | 'confirm' | 'executing' | 'success' | 'failed'>('form');
  - let swapProgressStep = $state<string>('');
  - let swapProgressMessage = $state<string>('');
  + let swapPhase = $state<'form' | 'confirm' | 'executing'>('form');
  + // progress step/message still needed for potential inline display
```

**Audit fixes applied**:
- ✅ `onSwapProgress` supports multiple subscribers (toast + local state)
- ✅ Try-catch in each listener (one failing doesn't break others)
- ✅ Local state cleanup after deleting phase components
- ✅ `crypto.randomUUID()` for swap toast IDs
- ✅ `sourceAddress` for disconnect matching
- ✅ Error mapping via `mapErrorToKey`

**Lines**: ~40 changed in SwapForm, ~15 changed in state.ts, 361 lines deleted (3 components)
**Test coverage**: Multi-subscriber onSwapProgress, toast registration, phase mapping

---

### Step 7: Disconnect Safety

**Files**:
- `src/lib/components/wallet/DisconnectDialog.svelte` — add pending swap warning
- `src/lib/components/wallet/ConnectedWallets.svelte` — pass pending swap count

**Changes**:
```
ConnectedWallets.svelte:
  + import { blockchainToastStore } from '$lib/stores/wallet/blockchain-toast.store'
  + const pendingSwapsForWallet = $derived(
  +   $blockchainToastStore.toasts.filter(t =>
  +     t.type === 'swap' && t.status !== 'success' && t.status !== 'error'
  +     && t.sourceAddress?.toLowerCase() === wallet.address.toLowerCase()
  +   )
  + );
  + // Pass to dialog:
  + <DisconnectDialog pendingSwaps={pendingSwapsForWallet} ... />

DisconnectDialog.svelte:
  + let { ..., pendingSwaps = [] }: { ...; pendingSwaps?: BlockchainToastItem[] } = $props();
  + {#if pendingSwaps.length > 0}
  +   <div class="alert alert-warning mb-3">
  +     <p>{$t('wallet.connected.pending_swap_warning', { values: { count: pendingSwaps.length } })}</p>
  +   </div>
  + {/if}
```

**Audit fixes applied**:
- ✅ Matches on `sourceAddress` (not `recipient` — recipient is destination, not user's wallet)
- ✅ `pendingSwaps` typed in props with default `[]`

**Lines**: ~30 new across 2 files
**Test coverage**: Disconnect with/without pending swaps

---

### Step 8: Balance Staleness Indicator

**Files**:
- `src/lib/stores/wallet/wallet-state.ts` — track `lastBalanceRefresh` timestamp
- `src/lib/components/wallet/BalanceCard.svelte` — show staleness indicator

**Changes**:
```
wallet-state.ts:
  + lastBalanceRefresh: Date.now()  // updated by loadAssets()

BalanceCard.svelte:
  + const staleness = $derived.by(() => {
  +   const age = Date.now() - $walletStore.lastBalanceRefresh;
  +   if (age < 60_000) return null;  // < 1 min: fresh
  +   if (age < 300_000) return 'recent';  // < 5 min: slightly stale
  +   return 'stale';  // > 5 min: stale
  + });

  + {#if staleness === 'stale'}
  +   <button class="text-xs text-base-content/40" onclick={handleRefresh}>
  +     {$t('wallet.toast.updated_ago', { values: { time: formatAge(lastRefresh) } })}
  +   </button>
  + {/if}
```

**Lines**: ~30 new across 2 files
**Test coverage**: Staleness calculation, refresh trigger

---

## What Gets Deleted

| Component | Lines | Reason |
|-----------|-------|--------|
| `SwapExecutingPhase.svelte` | 70 | Replaced by toast |
| `SwapSuccessPhase.svelte` | 244 | Replaced by toast |
| `SwapFailedPhase.svelte` | 47 | Replaced by toast |
| `TransactionSuccessScreen.svelte` | 357 | Replaced by toast (was dead code) |
| `PendingTransactionScreen.svelte` | 402 | Replaced by toast (keep temporarily for swap fallback) |
| **Total deleted** | **1,120** | |

## What Gets Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/stores/wallet/blockchain-toast.store.ts` | ~120 | Global toast state |
| `src/lib/components/wallet/BlockchainToast.svelte` | ~300 | Toast UI component |
| **Total created** | **~420** | |

## What Gets Modified

| File | Lines Changed | Change |
|------|--------------|--------|
| `wallet-init.ts` | ~55 | App lifecycle + always-on block watcher + softCleanup fix |
| `state.ts` (swap-chain) | ~15 | Multi-subscriber onSwapProgress |
| `SendPaymentForm.svelte` | ~50 | Arbitrum fast-path + toast registration |
| `SwapForm.svelte` | ~40 | Toast registration + remove phase components |
| `PendingTransactionScreen.svelte` | ~25 | Block-based polling |
| `DisconnectDialog.svelte` | ~20 | Pending swap warning |
| `ConnectedWallets.svelte` | ~15 | Pass pending swap count |
| `BalanceCard.svelte` | ~20 | Staleness indicator |
| `wallet-state.ts` | ~5 | `lastBalanceRefresh` timestamp |
| `en/dashboard/wallet.json` | ~25 | New i18n keys |
| `es/dashboard/wallet.json` | ~25 | Spanish translations |
| **Total modified** | **~295** | |

## Net Impact

- **New**: ~420 lines
- **Deleted**: ~1,120 lines
- **Modified**: ~295 lines
- **Net**: ~-405 lines (reduction)

---

## i18n Keys

### New keys for `wallet.toast.*`:
```json
{
  "wallet.toast": {
    "sending": "Sending {amount} {asset}",
    "swapping": "Swapping {fromAmount} {fromAsset} → {toAsset}",
    "confirming": "Confirming...",
    "confirming_time": "Confirming... (~{time} left)",
    "confirmed": "Confirmed ✓",
    "error_generic": "Transaction failed",
    "error_insufficient_funds": "Insufficient balance",
    "error_insufficient_gas": "Not enough {asset} for network fees",
    "error_nonce_too_low": "Transaction conflict — please retry",
    "error_execution_reverted": "Transaction rejected by network",
    "error_timeout": "Transaction timed out",
    "error_network_error": "Network error — check your connection",
    "retry": "Retry",
    "view_details": "Details ▼",
    "hide_details": "Details ▲",
    "view_explorer": "View in Explorer",
    "copy_tx_hash": "Copy Transaction ID",
    "copy_address": "Copy Address",
    "dismiss": "Dismiss",
    "check_status": "Check Status",
    "waiting_for_connection": "Waiting for connection...",
    "stale_warning": "No updates for a while — tap to check",
    "more_operations": "{count} more operations",
    "aria_status": "{type} {status}: {amount} {asset}",
    "aria_progress": "Confirmation {current} of {total}",
    "updated_ago": "Updated {time} ago"
  },
  "wallet.connected": {
    "pending_swap_warning": "This wallet has {count} pending swap(s). Disconnecting may make it harder to recover funds if the swap fails."
  }
}
```

---

## Execution Order

1. **Step 1** — App resume + network reconnect (prerequisite)
2. **Step 2** — Always-on block watcher + softCleanup fix (prerequisite)
3. **Step 3** — Toast store (prerequisite for component)
4. **Step 4** — Toast component
5. **Step 5** — Arbitrum fast-path + block-based polling + retry semantics
6. **Step 6** — Swap flow integration + delete old components
7. **Step 7** — Disconnect safety
8. **Step 8** — Balance staleness indicator
9. **Final** — `npm run check && npm run lint && npm run test:ci`

Steps 1-2 can be done together (same file). Steps 3-4 depend on 1-2. Steps 5-6 depend on 3-4.
Steps 7-8 are independent.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Block subscription fails silently | Try-catch in callback + Sentry capture + fallback to `setInterval(poll, 10000)` |
| Toast doesn't dismiss on app kill | In-memory store — cleared on restart. Swap state persists via Preferences. |
| Multiple toasts stack too high | Max 10 total, max 2 full on mobile, rest in pill |
| Connected wallet has no provider for block watch | Explorer API fallback (Blockscout for RSK/Arb, BscScan for BSC) |
| Arbitrum fast-path shows success before finality | Acceptable — Arbitrum finality ~0.25s |
| onSwapProgress multi-subscriber breaks existing tests | Tests mock the callback — multi-subscriber is transparent |
| softCleanup breaks block watcher | Block subscription cleaned up in softCleanup, re-established on resume |
| Reorg changes confirmed tx to unconfirmed | Re-verify recent successes within 6 blocks of confirmation |
| Retry re-broadcasts stale transaction | Retry navigates to pre-filled form — user must re-confirm |
| Toast covers modal | z-40 (below modals at z-50) |
