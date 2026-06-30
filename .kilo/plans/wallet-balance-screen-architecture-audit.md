# Architecture Audit: Wallet Balance Screen

**Date**: 2026-06-30
**Scope**: 6 files, ~3,041 total lines
**Verdict**: Significant refactoring needed to reach 90%+ across all dimensions

---

## Per-Dimension Scores

| # | Dimension | Score | Weight | Weighted |
|---|-----------|-------|--------|----------|
| 1 | Component Responsibility | **55%** | 20% | 11.0 |
| 2 | Separation of Concerns | **45%** | 20% | 9.0 |
| 3 | Component Composition | **40%** | 20% | 8.0 |
| 4 | State Management | **50%** | 15% | 7.5 |
| 5 | Interface Design | **55%** | 15% | 8.25 |
| 6 | Code Organization | **65%** | 10% | 6.5 |
| | **Weighted Overall** | | **100%** | **50.25%** |

---

## Top 10 Issues (Ranked by Impact)

### Issue 1: `+page.svelte` is a God Component (777 lines)
**File**: `+page.svelte` — entire file
**Impact**: CRITICAL
**Score impact**: Component Responsibility, Composition, State Management

The page component manages **14+ modal/drawer state variables**, computes 6 derived balance aggregations for connected wallets, handles banking menu DOM event listeners, renders inline testnet warnings, action buttons, and DeFi buttons. It should primarily be an orchestrator.

**Specific state variables that should be extracted**:
- `showReceiveModal`, `showSendModal`, `showBuySell`, `showSwap`, `showTransactionsModal`, `showConnectedTransactionsModal` (lines 90-102) → `useWalletModals()` composable
- `paymentRequestModal` complex object (lines 105-135) → `paymentRequestModalStore`
- `receiveFormState` (lines 177-184) → part of the receive flow composable
- `bankingMenuOpen`, `showBorrow`, `showEarn` (lines 274-276) → banking composable
- `connectedTotalUsd`, `connectedTotalSats`, `connectedTotalUsdt`, `connectedAggSats`, `connectedAggUsd` (lines 211-271) → `connectedWalletBalances` derived store in `connected-wallets.store.ts`

### Issue 2: BalanceCard Asset Row Duplication (~7x)
**File**: `BalanceCard.svelte:360-579`
**Impact**: HIGH
**Score impact**: Component Composition, Code Organization

The asset display pattern — `flex items-center justify-between` → icon + name → hidden/visible balance — is repeated **7 times** across the Bitcoin accordion (rBTC, wBTC, tBTC) and USD accordion (USDT0-Arb, DOC, USDT0-RSK, tier2). Each row is 20-30 lines of near-identical template.

**Fix**: Extract `<AssetRow>` component:
```svelte
{#snippet assetRow(icon, alt, name, balance, usdValue?, satsMode?)}
```
or a dedicated `AssetBalanceRow.svelte` component accepting `{icon, alt, name, balance?, usdValue?, hidden, satsMode}`.

### Issue 3: `document.querySelector('[data-help-modal]')` Anti-Pattern (5 occurrences)
**Files**: `+page.svelte:630`, `BalanceCard.svelte:152,321,327`, `HelpButton.svelte:13`
**Impact**: HIGH
**Score impact**: Separation of Concerns, Interface Design

Cross-component communication via DOM query selector is fragile, untyped, and violates Svelte's reactive paradigm. The `HelpButton.svelte` component exists but is **never imported** — instead the pattern is inlined.

**Fix**: Create a `helpModalOpen` writable store (`src/lib/stores/help-modal.store.ts`):
```typescript
import { writable } from 'svelte/store';
export const helpModalOpen = writable(false);
```
All callers write `helpModalOpen.set(true)`. `HelpModal.svelte` subscribes to it. Remove all `document.querySelector` calls. Remove `HelpButton.svelte` or rewrite it to use the store.

### Issue 4: Mutable Side-Effects Inside `$derived.by` Blocks
**File**: `+page.svelte:190-257`
**Impact**: HIGH
**Score impact**: State Management

`_lastConnectedTotal` (line 190), `_lastConnectedSats` (line 191), `_lastConnectedUsdt` (line 192) are mutable variables written inside `$derived.by` blocks (lines 229-232, 243-244). This creates hidden side effects in what should be pure derived computations. The intent is to "debounce" small balance fluctuations, but this approach:
- Violates the principle that derived values should be pure
- Can cause stale values if the conditions aren't met
- Makes the reactive graph unpredictable

**Fix**: Move the debounce logic to a dedicated `stableBalance` utility:
```typescript
function createStableNumber(threshold = 0.005) {
  let last = 0;
  return (current: number) => {
    if (current === 0 && last > 0) return last;
    if (Math.abs(current - last) < threshold) return last;
    last = current;
    return current;
  };
}
```

### Issue 5: `text-white` Instead of `text-primary-content` (7 occurrences)
**Files**: `BalanceCard.svelte:206,247,254,264,275,279`, `HelpButton.svelte:19`
**Impact**: MEDIUM
**Score impact**: Code Organization, UI Quality

Using `text-white` on `bg-primary` elements is a daisyUI anti-pattern. If the theme changes the primary color to something light, white text becomes invisible. The correct class is `text-primary-content` which adapts to the theme.

### Issue 6: Debug Logging in Production Code
**File**: `+page.svelte:195-208`
**Impact**: MEDIUM
**Score impact**: Separation of Concerns

An entire `$effect` block exists solely to `console.log` connected wallet balances. This runs on every balance change in production, leaking internal state to browser consoles.

**Fix**: Remove entirely, or gate behind `if (dev)` from `$app/environment`.

### Issue 7: `HelpModal.svelte` Repetitive FAQ Sections (~280 lines of duplication)
**File**: `HelpModal.svelte:326-607`
**Impact**: MEDIUM
**Score impact**: Component Composition

Six FAQ items follow an identical pattern: collapse → button → content (description + bullet list). Each is ~45 lines. Also uses Svelte 4 syntax (`on:keydown` at line 55) and `{@html}` with i18n strings (lines 558-600 — XSS risk if translations are compromised).

**Fix**: Data-driven FAQ rendering:
```svelte
{#each faqs as faq, i}
  <FaqItem index={i} title={$t(faq.titleKey)} ... />
{/each}
```
Replace `{@html}` with structured content (split bullets into array). Fix `on:keydown` → `onkeydown`.

### Issue 8: BalanceChartModal Chart.js Config Extraction (~250 lines)
**File**: `BalanceChartModal.svelte:367-592`
**Impact**: MEDIUM
**Score impact**: Component Composition

Chart.js registration, initialization, and update logic consumes ~250 lines (35% of the file). Hardcoded colors (`#FF9315`, `#10b981`) should use CSS variables.

**Fix**: Extract to `src/lib/utils/charts/balanceChart.ts`:
```typescript
export function createBalanceChart(canvas: HTMLCanvasElement, options: ChartOptions): Chart
export function updateBalanceData(chart: Chart, data: DailyBalance[]): void
export function updateChartTheme(chart: Chart, isDark: boolean): void
```

### Issue 9: `BalanceHistory.svelte` Makes Raw RPC Calls
**File**: `BalanceHistory.svelte:66-106`
**Impact**: MEDIUM
**Score impact**: Separation of Concerns

A presentation component (`BalanceHistory`) makes direct `eth_getBalance` JSON-RPC calls via `fetch()`. This business logic belongs in a service layer.

**Fix**: Move to `balanceHistoryService.fetchCurrentRpcBalance(address, rpcUrl)` and call it from a `$derived` or store.

### Issue 10: Stale/Dead State Variables
**File**: `+page.svelte:96-101`
**Impact**: LOW-MEDIUM
**Score impact**: State Management

`loanFlowSwapDest` and `loanFlowBuyCrypto` are declared as `$state` but are **never assigned a non-undefined value** in this file. They are only reset to `undefined` on close (lines 663, 673). They are passed as props to BuySellForm/SwapForm but are always `undefined`. The comment says "Default asset overrides when opened from loan flow" — the wiring from BorrowFlowDrawer/EarnFlowDrawer was never completed.

**Fix**: Either wire up the callbacks from BorrowFlowDrawer/EarnFlowDrawer, or remove these dead state variables and their associated props.

---

## Bonus Issues (Lower Priority)

### Issue 11: `HelpModal.svelte` Uses Svelte 4 `on:keydown`
**File**: `HelpModal.svelte:55`
`<svelte:window on:keydown={handleKeydown} />` should be `<svelte:window onkeydown={handleKeydown} />`

### Issue 12: `HelpModal.svelte` Inline Style
**File**: `HelpModal.svelte:75`
`style="display:none"` — should use a Tailwind class or remove the element.

### Issue 13: `BalanceCard.svelte` Calls Service Directly
**File**: `BalanceCard.svelte:130`
`balanceHistoryService.clearCaches()` in `handleRefresh()` — a presentation component reaching into a service layer. Should be handled by the wallet manager or a composable.

### Issue 14: `connectedAggSats` Near-Duplicate of `connectedTotalSats`
**File**: `+page.svelte:236-270`
`connectedTotalSats` sums `rbtc + wbtc` across wallets. `connectedAggSats` sums `rbtc + btc` across wallets. Same loop structure, different balance keys. Should be a single function parameterized by asset keys.

### Issue 15: `HelpButton.svelte` Exists But Is Never Used
**File**: `HelpButton.svelte` — 0 imports found
The component exists at 24 lines but is never imported anywhere. The help button pattern is inlined in BalanceCard and +page.svelte instead.

---

## Recommended Refactoring Plan (Prioritized)

### Phase 1: Quick Wins (1-2 hours, LOW risk)
1. **Replace `text-white` with `text-primary-content`** in BalanceCard.svelte and HelpButton.svelte (7 occurrences)
2. **Remove debug `$effect`** in +page.svelte:195-208
3. **Fix Svelte 4 syntax** in HelpModal.svelte:55 (`on:keydown` → `onkeydown`)
4. **Remove `style="display:none"`** in HelpModal.svelte:75, replace with Tailwind
5. **Remove or wire up dead state** (`loanFlowSwapDest`, `loanFlowBuyCrypto`) in +page.svelte

### Phase 2: Cross-Component Communication (2-3 hours, LOW risk)
6. **Create `helpModalOpen` store** in `src/lib/stores/help-modal.store.ts`
7. **Update HelpModal** to subscribe to the store
8. **Remove all `document.querySelector('[data-help-modal]')`** from +page.svelte, BalanceCard.svelte, HelpButton.svelte
9. **Delete HelpButton.svelte** (unused) or rewrite to use the store

### Phase 3: Extract Composables (3-4 hours, MEDIUM risk)
10. **Create `useWalletModals` composable** in `src/lib/composables/walletModals.svelte.ts` extracting all 14 modal state variables from +page.svelte
11. **Move connected wallet balance computation** to `connected-wallets.store.ts` as derived values
12. **Extract `createStableNumber` utility** and remove mutable side-effects from `$derived.by`

### Phase 4: Component Decomposition (4-6 hours, MEDIUM risk)
13. **Extract `AssetBalanceRow.svelte`** from BalanceCard (handles icon + name + hidden/visible balance)
14. **Extract `TestnetWarningBanner.svelte`** from +page.svelte:376-432
15. **Extract `WalletActionBar.svelte`** from +page.svelte:567-623 (action buttons + DeFi buttons)
16. **Make HelpModal FAQ data-driven** — extract FaqItem component, remove repetitive template

### Phase 5: Service Layer Extraction (3-4 hours, MEDIUM risk)
17. **Move RPC balance fetch** from BalanceHistory to `balanceHistoryService.fetchCurrentRpcBalance()`
18. **Move `balanceHistoryService.clearCaches()` call** out of BalanceCard into wallet manager
19. **Extract Chart.js logic** from BalanceChartModal into `src/lib/utils/charts/balanceChart.ts`
20. **Move `getDateRange` and `formatChange`** to utility files

---

## Target Scores After Refactoring

| Dimension | Current | Target | Key Lever |
|-----------|---------|--------|-----------|
| Component Responsibility | 55% | 92% | Extract modals composable, remove business logic from BalanceCard |
| Separation of Concerns | 45% | 93% | Store for help modal, service layer for RPC, remove debug logging |
| Component Composition | 40% | 91% | Extract AssetRow, TestnetWarning, WalletActionBar, data-driven FAQ |
| State Management | 50% | 90% | Remove mutable derived side-effects, remove dead state, stable balance util |
| Interface Design | 55% | 90% | Eliminate override props pattern via composables/stores |
| Code Organization | 65% | 92% | Extract CHAIN_LOGOS, formatChange, getDateRange to proper locations |
| **Weighted Overall** | **50.25%** | **91.5%** | |

---

## Confidence Assessment

- **Architecture correctness**: 95% — All issues identified are verified in source code
- **Risk assessment accuracy**: 90% — Phases 1-2 are low-risk; Phases 3-5 require careful testing
- **Completeness**: 92% — Focused on the 6 audited files; may miss upstream/downstream impacts (verified via grep that loanFlow vars have no external setters)
