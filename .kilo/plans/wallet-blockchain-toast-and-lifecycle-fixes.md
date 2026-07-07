# Wallet: Production Readiness — Blockchain Toast + Lifecycle + UX Fixes

**Date**: 2026-07-06
**Status**: Planning — no changes yet
**Scope**: Full wallet production readiness — all critical, high, and medium severity issues

---

## Context

The wallet UX lifecycle audit (109 gaps across swap, send, receive, DeFi) identified issues
across all subsystems. This plan addresses ALL critical, high, and medium severity issues to
bring the wallet to production readiness. Low-severity issues are addressed as individual
tickets when touching the relevant code.

### Full Audit Findings — All In Scope

#### 🔴 CRITICAL (10)

| # | Area | Issue | Step |
|---|------|-------|------|
| C1 | Swap | Cancel button doesn't abort swap chain service | N/A — confirmed correct (no cancel once initiated) |
| C2 | Send | `isOnline` wired but unused — offline sends not blocked | 1 |
| C3 | Send | `successTxHash` unreachable — dead code | 4 |
| C4 | Send | Balance check bypassed when `feeEstimate === null` | 9 |
| C5 | Send | No navigation guard during pending send | 4 |
| C6 | Receive | Lightning invoice expiry not handled | 10 |
| C7 | Receive | No app resume handler | 1 |
| C8 | DeFi | Zero slippage protection on LP operations | 11 |
| C9 | DeFi | No real-time health factor monitoring | 12 |
| C10 | Send | `liquid-bitcoin` selectable but no handler | 13 |

#### 🟡 HIGH (31)

**Swap (14):**
| # | Issue | Step |
|---|-------|------|
| H1 | Silent failure — no routes found (no feedback) | 14 |
| H2 | Silent failure — price feeds fail (stale/zero prices) | 14 |
| H3 | Silent failure — balance insufficient but route exists | 14 |
| H4 | No offline feedback during swap confirmation | 1 |
| H5 | No timeout on confirmation screen | 5 |
| H6 | Missing app lifecycle handling | 1 |
| H7 | PendingSwaps collapsed when actionable | 15 |
| H8 | No feedback when gas estimation fails | 14 |
| H9 | Swap doesn't refresh balance after completion | 1 |
| H10 | No retry mechanism for failed swaps | 5 |
| H11 | Multi-hop swap has no per-hop progress indicator | 6 |
| H12 | Boltz API down → no specific error message | 14 |
| H13 | PARTIAL state has no clear user instructions | 15 |
| H14 | Swap state corruption has no recovery path | 15 |

**Send (7):**
| # | Issue | Step |
|---|-------|------|
| H15 | No loading indicator during LNURL resolution | 16 |
| H16 | LNURL amount bounds not surfaced to user | 16 |
| H17 | No retry button on send failure | 5 |
| H18 | No timeout for on-chain sends | 5 |
| H19 | `usdt-tron` selectable but no handler | 13 |
| H20 | Send button disabled with no explanation | 17 |
| H21 | No dust amount validation | 17 |

**Receive + Infrastructure (5):**
| # | Issue | Step |
|---|-------|------|
| H22 | Swap service down allows form submission with no limits | 18 |
| H23 | No incoming payment detection for direct receives | 2 |
| H24 | WalletConnect session expiry not detected | 19 |
| H25 | Disconnect allowed during pending swaps | 7 |
| H26 | No network reconnect handler | 1 |

**DeFi (5):**
| # | Issue | Step |
|---|-------|------|
| H27 | No oracle price feed failure handling | 20 |
| H28 | Borrow tx fails after collateral deposited (no rollback) | 20 |
| H29 | No impermanent loss warning for LP positions | 21 |
| H30 | Health factor gauge doesn't update real-time | 12 |
| H31 | Close position has no confirmation dialog | 21 |

#### 🟢 MEDIUM (31)

| # | Area | Issue | Step |
|---|------|-------|------|
| M1 | Swap | Stale route data | 14 |
| M2 | Swap | i18n gaps in fallback messages | 14 |
| M3 | Swap | Misleading swap labels | 14 |
| M4 | Swap | Missing guards for edge cases | 14 |
| M5 | Send | No fee spike warning | 17 |
| M6 | Send | No high fee warning | 17 |
| M7 | Send | Unit switch doesn't convert amount | 17 |
| M8 | Send | MAX button race condition | 17 |
| M9 | Send | Balance not refreshed after send | 1 |
| M10 | Send | `onSuccess` fires before confirmation | 5 |
| M11 | Send | External wallet cancellation not detected | 17 |
| M12 | Send | `close` hardcoded English | 22 |
| M13 | Send | Lightning timeout not i18n'd | 22 |
| M14 | Send | No aggregated validation summary | 17 |
| M15 | Send | BTC price=0 not surfaced | 8 |
| M16 | Send | Stuck tx no max polling | 5 |
| M17 | Receive | Share button logic inverted on web | 23 |
| M18 | Receive | Price failure shows $0.00 | 8 |
| M19 | Receive | No balance staleness indicator | 8 |
| M20 | Receive | Stale connected wallet balances | 1 |
| M21 | Receive | Chain switch error handling | 23 |
| M22 | Receive | Clipboard without Capacitor guard | 23 |

#### 🟢 LOW (37)

Addressed as individual tickets when touching relevant code. Key low items:
- EIP-55 checksum validation in address parser
- Whitespace stripping on paste
- QR error persistence on tab switch
- Stale connected wallet balance display
- Share button on web with `navigator.share`
- Various i18n polish items

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

### Phase 1 — Infrastructure (Steps 1-4)
1. **Step 1** — App resume + network reconnect
2. **Step 2** — Always-on block watcher + softCleanup fix
3. **Step 3** — Toast store
4. **Step 4** — Toast component

### Phase 2 — Send/Swap Flow (Steps 5-6)
5. **Step 5** — Arbitrum fast-path + block-based polling + retry semantics
6. **Step 6** — Swap flow integration + delete old components

### Phase 3 — Safety + Polish (Steps 7-8)
7. **Step 7** — Disconnect safety
8. **Step 8** — Balance staleness + price failure display

### Phase 4 — Send Flow Fixes (Steps 9, 16-17)
9. **Step 9** — Balance check when fee estimate null (C4)
16. **Step 16** — LNURL loading indicator + amount bounds (H15, H16)
17. **Step 17** — Send UX polish: disabled button tooltip, dust validation, unit conversion, fee warnings, wallet cancellation, validation summary (H20, H21, M5-M8, M11, M14)

### Phase 5 — Receive Flow Fixes (Steps 10, 18-19, 23)
10. **Step 10** — Lightning invoice expiry (C6)
18. **Step 18** — Swap service down — disable form (H22)
19. **Step 19** — WalletConnect session expiry detection (H24)
23. **Step 23** — Receive UX polish: share button, chain switch errors, Capacitor clipboard guard (M17, M21, M22)

### Phase 6 — DeFi Fixes (Steps 11-12, 20-21)
11. **Step 11** — LP slippage protection — 0.5% default (C8)
12. **Step 12** — Real-time health factor monitoring (C9, H30)
20. **Step 20** — DeFi error handling: oracle failures, borrow rollback (H27, H28)
21. **Step 21** — DeFi UX: IL warning, close confirmation (H29, H31)

### Phase 7 — Remaining Issues (Steps 13-15, 22)
13. **Step 13** — Remove unsupported networks from pickers (C10, H19)
14. **Step 14** — Swap silent failures: route/price/gas feedback (H1-H3, H8, H12, M1-M4)
15. **Step 15** — PendingSwaps UX: expand actionable, PARTIAL instructions, recovery path (H7, H13, H14)
22. **Step 22** — i18n sweep: hardcoded English in send/swap (M12, M13)

### Final
- `npm run check && npm run lint && npm run test:ci`

### Dependencies
- Phase 1 is prerequisite for Phase 2 (toast needs block watcher)
- Phase 2 is prerequisite for Phase 3 (disconnect safety needs toast store)
- Phases 4-7 are independent of each other (can be parallelized)
- Within each phase, steps can be parallelized if they touch different files

---

## New Steps (9-23)

### Step 9: Balance Check When Fee Estimate Null (C4)

**Why**: `hasInsufficientBalance` is skipped when `feeEstimate === null` (fee fetch failed).
User can submit a send that will fail on-chain.

**Files**:
- `src/lib/runes/use-send-form-validation.svelte.ts`

**Changes**:
```
validateSendForm():
  - if (totalToSend > availableBalance && totalToSend > 0 && feeEstimate !== null) {
  + if (totalToSend > availableBalance && totalToSend > 0) {
  +   // Check against raw balance even when fee estimate is unavailable
  +   // (fee estimate failure doesn't mean the user has enough)
      return false;
  +   // The fee-inclusive check still runs when feeEstimate is available:
  +   // totalToSend + feeEstimate.totalFees > availableBalance
    }
```

**Lines**: ~5 changed
**Test coverage**: Validate with null fee estimate + amount > balance

---

### Step 10: Lightning Invoice Expiry (C6)

**Why**: Lightning invoices expire (typically 1 hour). No countdown, no expiry detection, no
regeneration. Payer tries to pay expired invoice → fails silently.

**Files**:
- `src/lib/components/wallet/PaymentRequestModal.svelte`
- `src/lib/utils/generate-receive-invoice.ts`

**Changes**:
```
PaymentRequestModal:
  + const expiresAt = $derived(swapData?.timeoutBlockHeight
  +   ? estimateExpiryFromBlockHeight(swapData.timeoutBlockHeight)
  +   : null);
  + const isExpired = $derived(expiresAt ? Date.now() > expiresAt : false);
  + const timeRemaining = $derived(expiresAt ? Math.max(0, expiresAt - Date.now()) : null);

  + {#if isExpired}
  +   <div class="alert alert-warning">
  +     <p>{$t('wallet.receive.invoice_expired')}</p>
  +     <button class="btn btn-primary btn-sm" onclick={onEdit}>
  +       {$t('wallet.receive.generate_new')}
  +     </button>
  +   </div>
  + {:else}
  +   <!-- existing QR/invoice display -->
  +   {#if timeRemaining !== null}
  +     <p class="text-xs text-base-content/60">
  +       {$t('wallet.receive.expires_in', { values: { time: formatDuration(timeRemaining) } })}
  +     </p>
  +   {/if}
  + {/if}
```

**Lines**: ~40 new
**Test coverage**: Expired invoice, active invoice with countdown, generate new

---

### Step 11: LP Slippage Protection (C8)

**Why**: `LPRemoveAction` passes `0n, 0n` for `amount0Min, amount1Min` — zero slippage
protection. MEV/sandwich attack vulnerability.

**Files**:
- `src/lib/components/wallet/defi/earn/LPRemoveAction.svelte`
- `src/lib/components/wallet/defi/earn/LPProvideAction.svelte`
- `src/lib/services/swap-chain/executors/uniswap-v3.ts`

**Changes**:
```
Constants:
  + const SLIPPAGE_BPS = 50; // 0.5% — industry standard default

LPRemoveAction:
  - uni.removeLiquidity(position.tokenId, removeLiquidityAmount, 0n, 0n, deadline, signer)
  + const amount0Min = expectedAmount0 * BigInt(10000 - SLIPPAGE_BPS) / 10000n;
  + const amount1Min = expectedAmount1 * BigInt(10000 - SLIPPAGE_BPS) / 10000n;
  + uni.removeLiquidity(position.tokenId, removeLiquidityAmount, amount0Min, amount1Min, deadline, signer)

LPProvideAction:
  + // Apply slippage to mint amount
  + const minLiquidity = expectedLiquidity * BigInt(10000 - SLIPPAGE_BPS) / 10000n;

uniswap-v3.ts:
  - amountOutMinimum: 1n
  + const SLIPPAGE_BPS = 50;
  + amountOutMinimum: expectedAmountOut * BigInt(10000 - SLIPPAGE_BPS) / 10000n

UI:
  + <p class="text-xs text-base-content/60">{$t('wallet.defi.slippage_protection', { values: { percent: '0.5' } })}</p>
```

**Lines**: ~30 changed across 3 files
**Test coverage**: Slippage calculation, min amount > 0, UI badge

---

### Step 12: Real-Time Health Factor Monitoring (C9, H30)

**Why**: No real-time health factor updates. User has no warning before liquidation.

**Files**:
- `src/lib/components/wallet/defi/HealthFactorGauge.svelte`
- `src/lib/stores/wallet/wallet-init.ts` (reuse block watcher)

**Changes**:
```
HealthFactorGauge:
  + import { blockchainToastStore } from '$lib/stores/wallet/blockchain-toast.store'
  + // On each block, refresh health factor for active loans
  + $effect(() => {
  +   // Subscribe to block events via toast store's onBlock
  +   // Refresh health factor data when block arrives
  + });

  + {#if healthFactor < 1.5}
  +   <div class="alert alert-warning text-xs">
  +     {$t('wallet.defi.health_factor_warning', { values: { factor: healthFactor.toFixed(2) } })}
  +   </div>
  + {/if}
  + {#if healthFactor < 1.1}
  +   <div class="alert alert-error text-xs">
  +     {$t('wallet.defi.health_factor_critical', { values: { factor: healthFactor.toFixed(2) } })}
  +   </div>
  + {/if}
```

**Lines**: ~50 new
**Test coverage**: Health factor thresholds, block-based refresh

---

### Step 13: Remove Unsupported Networks (C10, H19)

**Why**: `liquid-bitcoin` and `usdt-tron` appear in destination pickers but have no send
handlers. User gets cryptic runtime error.

**Files**:
- `src/lib/components/wallet/SendDestinationSelector.svelte`
- `src/lib/services/send-execution.service.ts`

**Changes**:
```
SendDestinationSelector:
  + const SUPPORTED_SEND_NETWORKS = new Set([
  +   'rootstock-bitcoin', 'usdt-bsc', 'lightning-bitcoin',
  +   'usdt-arbitrum', 'usdt-ethereum', 'usdt-polygon', 'bitcoin'
  + ]);
  + // Filter destinations to only supported networks
  + const availableDestinations = $derived(
  +   DESTINATIONS.filter(d => SUPPORTED_SEND_NETWORKS.has(d.network))
  + );

send-execution.service.ts:
  + // Add explicit error for unsupported networks with user-friendly message
  + if (!BUILTIN_HANDLERS[network] && !CONNECTED_HANDLERS[network]) {
  +   throw new Error(`Sending on ${network} is not yet supported. Coming soon!`);
  + }
```

**Lines**: ~15 changed
**Test coverage**: Unsupported network filtered from picker, error message

---

### Step 14: Swap Silent Failures (H1-H3, H8, H12, M1-M4)

**Why**: Multiple swap scenarios fail silently — no routes, price feeds down, gas estimation
fails, Boltz API down.

**Files**:
- `src/lib/runes/use-swap-routes.svelte.ts`
- `src/lib/runes/use-swap-input.svelte.ts`
- `src/lib/components/wallet/SwapForm.svelte`

**Changes**:
```
use-swap-routes:
  + // When no routes found, set explicit error state
  + if (routes.length === 0) {
  +   return { routes: [], error: 'wallet.swap.error.no_routes', errorValues: { source, dest } };
  + }

  + // When price feeds fail, show warning instead of stale fallback
  + if (liveBtcPrice === null || liveEthPrice === null) {
  +   gasDataAvailable = false;
  +   // Don't use hardcoded fallback prices for fee display
  + }

  + // When gas estimation fails, surface error
  + if (gasError) {
  +   return { ..., error: 'wallet.swap.error.gas_estimation_failed', errorValues: {} };
  + }

SwapForm:
  + // Show specific error for Boltz API failures
  + if (error?.message?.includes('boltz') || error?.message?.includes('Boltz')) {
  +   errorMessage = $t('wallet.swap.error.boltz_unavailable');
  + }
```

**Lines**: ~60 changed across 3 files
**Test coverage**: No routes, price failure, gas failure, Boltz down

---

### Step 15: PendingSwaps UX (H7, H13, H14)

**Why**: PendingSwaps collapses actionable swaps, PARTIAL state has no instructions, no
recovery path for corrupted state.

**Files**:
- `src/lib/components/wallet/PendingSwaps.svelte`

**Changes**:
```
  + // Auto-expand swaps that need user action (claim, refund)
  + const needsAction = $derived(swap.status === 'claimable' || swap.status === 'refundable');
  + let expanded = $state(needsAction); // starts expanded if needs action

  + // PARTIAL state instructions
  + {#if swap.status === 'partial'}
  +   <div class="alert alert-info text-xs">
  +     <p>{$t('wallet.pending_swaps.partial_instructions')}</p>
  +     <button class="btn btn-primary btn-xs" onclick={() => resumeSwap(swap)}>
  +       {$t('wallet.pending_swaps.resume')}
  +     </button>
  +   </div>
  + {/if}

  + // Recovery path for corrupted state
  + {#if swap.status === 'unknown' || swap.status === 'corrupted'}
  +   <div class="alert alert-warning text-xs">
  +     <p>{$t('wallet.pending_swaps.state_unknown')}</p>
  +     <button class="btn btn-error btn-xs" onclick={() => dismissSwap(swap)}>
  +       {$t('wallet.pending_swaps.dismiss')}
  +     </button>
  +   </div>
  + {/if}
```

**Lines**: ~40 changed
**Test coverage**: Auto-expand, PARTIAL instructions, corrupted state recovery

---

### Step 16: LNURL Loading + Amount Bounds (H15, H16)

**Why**: No loading indicator during LNURL resolution (2-5s). LNURL amount bounds not
surfaced to user.

**Files**:
- `src/lib/components/wallet/SendPaymentForm.svelte`
- `src/lib/runes/use-send-form-validation.svelte.ts`

**Changes**:
```
SendPaymentForm:
  + let isResolvingLNURL = $state(false);
  + // In applyParsedAddress:
  + isResolvingLNURL = true;
  + try { /* resolve LNURL */ }
  + finally { isResolvingLNURL = false; }

  + {#if isResolvingLNURL}
  +   <div class="flex items-center gap-2 text-sm text-base-content/60">
  +     <span class="loading loading-spinner loading-xs"></span>
  +     {$t('wallet.send.resolving_lnurl')}
  +   </div>
  + {/if}

use-send-form-validation:
  + // Surface LNURL amount bounds
  + if (lnurlMinSats && amountInSats < lnurlMinSats) {
  +   return { valid: false, error: 'wallet.send.error.below_lnurl_min', errorValues: { min: lnurlMinSats } };
  + }
  + if (lnurlMaxSats && amountInSats > lnurlMaxSats) {
  +   return { valid: false, error: 'wallet.send.error.above_lnurl_max', errorValues: { max: lnurlMaxSats } };
  + }
```

**Lines**: ~30 changed across 2 files
**Test coverage**: LNURL loading state, min/max bounds

---

### Step 17: Send UX Polish (H20, H21, M5-M8, M11, M14)

**Why**: Multiple send UX gaps: disabled button no tooltip, no dust validation, unit switch
doesn't convert, no fee warnings, wallet cancellation not detected, no validation summary.

**Files**:
- `src/lib/components/wallet/SendPaymentForm.svelte`
- `src/lib/components/wallet/send/SendPaymentDetailsTab.svelte`
- `src/lib/runes/use-send-form-validation.svelte.ts`

**Changes**:
```
SendPaymentDetailsTab:
  + // Disabled button tooltip
  + <button disabled={!isFormValid} class="tooltip" data-tip={!isFormValid ? disabledReason : ''}>
  +   {$t('wallet.send.send_button')}
  + </button>

  + // Fee spike warning
  + {#if feeEstimate && feeEstimate.totalFees > amountInSats * 0.2}
  +   <div class="alert alert-warning text-xs">
  +     {$t('wallet.send.high_fee_warning', { values: { percent: Math.round(feeEstimate.totalFees / amountInSats * 100) } })}
  +   </div>
  + {/if}

SendPaymentForm:
  + // Unit conversion
  + function handleUnitChange(newUnit: 'sats' | 'usd') {
  +   const converted = newUnit === 'usd'
  +     ? satsToUsd(amountInSats, btcPrice)
  +     : usdToSats(parseFloat(amountInput), btcPrice);
  +   amountInput = converted.toString();
  +   formInput.unit = newUnit;
  + }

  + // Wallet cancellation detection
  + if (externalConfirmSource && error?.message?.includes('rejected')) {
  +   externalConfirmSource = null;
  +   appStore.showInfoToast($t('wallet.send.wallet_cancelled'));
  + }

use-send-form-validation:
  + // Dust amount validation
  + const DUST_LIMITS: Record<string, number> = {
  +   'rootstock-bitcoin': 1, // RSK has no dust limit
  +   'usdt-bsc': 1,
  +   'bitcoin': 546, // Bitcoin dust limit
  + };
  + if (amountInSats < (DUST_LIMITS[network] ?? 0)) {
  +   return { valid: false, error: 'wallet.send.error.below_dust', errorValues: { min: DUST_LIMITS[network] } };
  + }
```

**Lines**: ~80 changed across 3 files
**Test coverage**: Disabled tooltip, fee warning, unit conversion, dust limit, wallet cancel

---

### Step 18: Swap Service Down (H22)

**Why**: When Boltz is down, user can still enter amounts and hit "Create Swap" — it fails
with a confusing error. Should disable the form with explicit message.

**Files**:
- `src/lib/components/wallet/SwapReceive.svelte`

**Changes**:
```
  + const swapServiceAvailable = $derived(swapLimits !== null && !error);
  + {#if !swapServiceAvailable}
  +   <div class="alert alert-warning">
  +     <p>{$t('wallet.receive.swap_service_unavailable')}</p>
  +   </div>
  + {/if}
  + <button disabled={!swapServiceAvailable || isCreatingSwap}>
  +   {$t('wallet.receive.create_swap')}
  + </button>
```

**Lines**: ~15 changed
**Test coverage**: Service down disables form, error message shown

---

### Step 19: WalletConnect Session Expiry (H24)

**Why**: WalletConnect sessions can expire or be revoked by the wallet app. No detection,
no notification, operations fail silently.

**Files**:
- `src/lib/stores/connected-wallets.store.ts`

**Changes**:
```
  + // Listen for WC session events
  + connector.on('session_delete', (event) => {
  +   const walletId = findWalletBySession(event.topic);
  +   if (walletId) {
  +     updateWalletStatus(walletId, 'disconnected');
  +     appStore.showWarningToast($t('wallet.connected.session_expired', { values: { name: walletName } }));
  +   }
  + });
  + connector.on('session_expire', (event) => {
  +   // same handling
  + });
```

**Lines**: ~25 new
**Test coverage**: Session expiry detection, toast notification, wallet status update

---

### Step 20: DeFi Error Handling (H27, H28)

**Why**: Oracle price feed failures silently use stale prices. Borrow transaction fails after
collateral is deposited — no rollback.

**Files**:
- `src/lib/components/wallet/defi/loan-wizard/ReviewConfirmStep.svelte`
- `src/lib/components/wallet/defi/position/AddCollateralForm.svelte`

**Changes**:
```
ReviewConfirmStep:
  + // Oracle failure detection
  + if (!btcPrice || btcPrice === 0) {
  +   errorMsg = $t('wallet.defi.oracle_unavailable');
  +   isProcessing = false;
  +   return;
  + }

  + // Borrow failure after collateral — show specific error
  + if (supplyTx && !borrowTx) {
  +   errorMsg = $t('wallet.defi.borrow_failed_after_collateral');
  +   // Show "Your collateral is deposited. Try borrowing again."
  + }

AddCollateralForm:
  + // Show current oracle price with staleness indicator
  + {#if !btcPrice || btcPrice === 0}
  +   <div class="alert alert-warning text-xs">
  +     {$t('wallet.defi.oracle_unavailable')}
  +   </div>
  + {/if}
```

**Lines**: ~30 changed across 2 files
**Test coverage**: Oracle failure, borrow failure after collateral

---

### Step 21: DeFi UX — IL Warning + Close Confirmation (H29, H31)

**Why**: No impermanent loss warning for LP positions. Close position has no confirmation
dialog — user can accidentally close a profitable position.

**Files**:
- `src/lib/components/wallet/defi/earn/EarnLPPositionCard.svelte`
- `src/lib/components/wallet/defi/earn/LPCloseAction.svelte`

**Changes**:
```
EarnLPPositionCard:
  + // IL warning when position has significant divergence
  + {#if impermanentLossPercent > 5}
  +   <div class="alert alert-warning text-xs">
  +     {$t('wallet.defi.impermanent_loss_warning', { values: { percent: impermanentLossPercent.toFixed(1) } })}
  +   </div>
  + {/if}

LPCloseAction:
  + // Confirmation before closing
  + let showConfirm = $state(false);
  + {#if !showConfirm}
  +   <button class="btn btn-error btn-sm" onclick={() => showConfirm = true}>
  +     {$t('wallet.defi.close_position')}
  +   </button>
  + {:else}
  +   <div class="alert alert-warning">
  +     <p>{$t('wallet.defi.close_position_confirm')}</p>
  +     <button class="btn btn-error btn-sm" onclick={handleClose}>{$t('common.confirm')}</button>
  +     <button class="btn btn-ghost btn-sm" onclick={() => showConfirm = false}>{$t('common.cancel')}</button>
  +   </div>
  + {/if}
```

**Lines**: ~40 changed across 2 files
**Test coverage**: IL warning threshold, close confirmation dialog

---

### Step 22: i18n Sweep (M12, M13)

**Why**: Hardcoded English in send/swap flows. All user-facing strings must use `$t()`.

**Files**:
- `src/lib/components/wallet/SendPaymentForm.svelte` — 3 strings
- `src/lib/components/wallet/PendingSwaps.svelte` — remaining ~10 strings
- `src/lib/components/wallet/SwapForm.svelte` — fallback strings
- `static/locales/en/dashboard/wallet.json` — new keys
- `static/locales/es/dashboard/wallet.json` — Spanish translations

**Changes**: Find-and-replace hardcoded strings with `$t()` calls. Add missing i18n keys.
Run `python3 scripts/find-missing-translations.py --fix-suggestions` after.

**Lines**: ~40 changed across 5 files
**Test coverage**: Translation verification script

---

### Step 23: Receive UX Polish (M17, M21, M22)

**Why**: Share button inverted on web, chain switch errors not handled, clipboard without
Capacitor guard.

**Files**:
- `src/lib/components/wallet/InvoiceDisplay.svelte`
- `src/lib/components/wallet/ChainSelector.svelte`
- `src/lib/components/wallet/TransactionSuccessScreen.svelte`

**Changes**:
```
InvoiceDisplay:
  - {#if Capacitor.getPlatform() !== 'web' || !navigator.share}
  + {#if navigator.share || Capacitor.getPlatform() !== 'web'}
  +   <!-- Show share button whenever any sharing mechanism is available -->

ChainSelector:
  + // Handle chain switch rejection
  + try { await switchChain(chainId); }
  + catch (err) {
  +   if (err?.code === 4001) { // user rejected
  +     appStore.showInfoToast($t('wallet.connected.chain_switch_cancelled'));
  +   } else {
  +     appStore.showErrorToast($t('wallet.connected.chain_switch_failed'));
  +   }
  + }

TransactionSuccessScreen:
  - await navigator.clipboard.writeText(hash);
  + if (Capacitor.isNativePlatform()) {
  +   const { Clipboard } = await import('@capacitor/clipboard');
  +   await Clipboard.write({ string: hash });
  + } else {
  +   await navigator.clipboard.writeText(hash);
  + }
```

**Lines**: ~30 changed across 3 files
**Test coverage**: Share button visibility, chain switch rejection, clipboard fallback

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
