# Final Architecture Audit — Wallet Balance Screen (Post-Refactoring)

**Auditor**: Kilo Architect Agent  
**Date**: 2026-06-30  
**Files audited**: 8  
**Status**: READ-ONLY audit  

---

## Per-Dimension Scores

### 1. Component Responsibility — Score: 75/100

**Strengths:**
- `helpModal.svelte.ts` (14 lines): Pure state management, single responsibility ✅
- `HelpModal.svelte` (349 lines): Renders help modal, manages FAQ accordion state ✅
- `HelpButton.svelte` (26 lines): Thin wrapper, delegates to shared store ✅
- `TotalAmountCard.svelte` (56 lines): Single responsibility — display formatted amount ✅

**Issues:**
- **`HelpButton.svelte` is dead code** — not imported anywhere in the codebase. `grep` for `import HelpButton` returns 0 results. BalanceCard has its own `helpButton` snippet (line 246), and the wallet page uses `openHelpModal()` directly. The component exists but serves no purpose.
- **`BalanceChartModal.svelte` (702 lines)** — significantly over 500-line limit. Handles chart initialization, data fetching, date range logic, theme management, and Chart.js instance lifecycle. Should be decomposed into `ChartDateSelector`, `useChartInstance()` rune, etc.
- **`+page.svelte` (715 lines)** — significantly over 500-line limit. Manages 8+ modal states, connected wallet totals, banking menu DOM event listeners, tab switching, and renders ~15 child components. The banking menu integration alone (lines 225-273) is 50 lines of DOM event listener boilerplate.
- **`BalanceCard.svelte` (501 lines)** — just over 500-line limit. Multiple responsibilities: total value display, visibility toggle with countdown, refresh, help, Bitcoin accordion, USD accordion, DeFi positions, 4 snippets. Cohesive but large.

### 2. Separation of Concerns — Score: 68/100

**Strengths:**
- `helpModal.svelte.ts`: Clean separation — pure state management, no UI ✅
- `HelpModal.svelte`: Presentation only, reads from shared store ✅
- `connectedTotals` (page line 193-213): Pure `$derived.by` with single-pass aggregation ✅
- All `$derived.by` blocks across audited files are free of mutable side-effects ✅

**Issues:**
- **BalanceHistory: raw RPC fetch in component** (lines 73-113). Makes a raw `fetch()` to `eth_getBalance` RPC endpoint inside a `$effect`. This is blockchain data fetching logic that belongs in a service layer (like `balanceHistoryService`). Creates a parallel data path alongside the service.
- **BalanceChartModal: double-fetch race condition** (lines 215-234 + 642-656). The `$effect` at line 215 watches `selectedRange` and calls `fetchDailyBalances()`. But the `onchange` handler at line 642 ALSO calls `fetchDailyBalances()` manually. When the user changes the date range, both fire — causing duplicate API calls.
- **BalanceChartModal: `getDateRange()` utility in component** (lines 105-159). Pure date logic (55 lines) should be extracted to a utility function.
- **Page: `closeBankingMenu()` uses DOM manipulation** (line 222): `(document.getElementById('banking-menu-modal') as HTMLDialogElement)?.close()`. BankingMenu should expose a `close()` method via props/binding, not rely on parent DOM queries.
- **TotalAmountCard: hardcoded English string** (line 33): `"Not enough funds"` — violates i18n rule. All user-visible strings must use `$t()`.
- **TotalAmountCard: hardcoded "Sats"** (lines 44, 47) and **"$0.00"** (line 54) — same i18n violation.

### 3. Component Composition — Score: 82/100

**Strengths:**
- BalanceCard: 4 well-structured snippets (`satsBalanceRow`, `usdBalanceRow`, `helpButton`, `toggleButton`, `refreshButton`) ✅
- HelpModal: Data-driven FAQ pattern with typed `FaqEntry[]` array and `{#each}` iteration ✅
- HelpModal: Features grid uses data-driven `{#each}` with icon component references ✅
- BalanceHistory: Delegates chart modal as child component ✅
- `openHelpModal` shared across 3 consumers (page, BalanceCard, HelpButton) via single store ✅

**Issues:**
- **`HelpButton.svelte` is orphaned** — exists as a thin wrapper but nobody imports it. BalanceCard has its own `helpButton` snippet (line 246-255) that duplicates the same logic. The component should either be used or deleted.
- **HelpModal vestigial hidden button** (lines 124-134): `{#if showButton}` renders a hidden `<button class="btn btn-ghost hidden">` with `data-help-modal`. This is a leftover from the old `document.querySelector('[data-help-modal]')?.click()` pattern. No code queries `[data-help-modal]` anymore. Dead code.
- **BalanceCard CSS hack** (lines 495-501): Uses `div[data-hide-details] > :global(.balancehistory-wrapper)` to hide child elements. This relies on a CSS class name (`balancehistory-wrapper`) that must exist on a sibling — fragile coupling between parent and child CSS.
- **BalanceChartModal is monolithic** — no sub-components extracted. The date selector, chart container, and chart logic are all in one 702-line file.

### 4. State Management — Score: 78/100

**Strengths:**
- `helpModal.svelte.ts`: `$state({ isOpen: false })` + exported functions. Clean, centralized. ✅
- `connectedTotals`: Single-pass `$derived.by` that iterates wallets once. Pure, no side effects. ✅
- BalanceCard: `combinedTotal`, `satsDisplay`, `usdtDisplay`, `satsUsdInline` — all pure `$derived.by`. ✅
- BalanceCard: `balancesHidden` uses external prop with internal fallback — well-handled dual-mode. ✅
- BalanceCard: `countdownSeconds` + interval with proper `onDestroy` cleanup. ✅
- BalanceHistory: `rskUsd` — pure `$derived.by`. ✅
- BalanceHistory: `currentRpcSats` update is in `$effect` (allowed for side effects), not in `$derived.by`. ✅

**Issues:**
- **BalanceChartModal has 5 `$effect` blocks** with overlapping concerns:
  1. Line 204-212: Initialize chart when canvas ready
  2. Line 215-234: Fetch data when chart/range changes (double-fetch issue)
  3. Line 237-247: Update chart when data/locale changes
  4. Line 250-256: React to theme changes
  5. Line 601-611: Cleanup on close
  
  Effects #2 and #3 have race conditions. When `selectedRange` changes: effect #2 fires (fetches data), then when data arrives `dailyBalances` updates, triggering effect #3 (updates chart). But effect #2's timeout + re-check pattern (line 224-226) adds unnecessary complexity.
- **BalanceChartModal double-fetch**: `onchange` handler at line 642 calls `fetchDailyBalances()` directly, AND the `$effect` at line 215 also calls it. Two competing data flows for the same trigger.
- **Page: 8 separate `show*` boolean states** (lines 53-105). While functional, a state machine or enum would be cleaner for mutually exclusive modals.

### 5. Interface Design — Score: 76/100

**Strengths:**
- HelpModal: `{ onClose?, showButton = true }` — 2 props ✅
- HelpButton: `{ ariaLabel? }` — 1 prop ✅
- TotalAmountCard: `{ label, amount, unit, usdValue?, isError? }` — 5 well-typed props ✅
- BalanceChartModal: `{ isOpen, onClose, overrideAddress?, overrideSats?, overrideUsd? }` — 5 props ✅

**Issues:**
- **BalanceCard: 8 props** (lines 31-49). The `overrideTotalUsd`, `overrideSats`, `overrideUsdt` pattern is used to switch between "native wallet" and "connected wallet" display modes. This suggests BalanceCard should be split into two variants, or the wallet identity should be provided via context.
- **BalanceHistory: 6 props** (lines 17-31). Same `override*` pattern with `overrideSats`, `overrideUsd`, `overrideProvider`, `overrideAddress`. Four override props indicate the component tries to serve two different data sources.
- **Both override patterns** bypass the wallet store. A `provideWalletContext()` pattern would be cleaner — child components read from context instead of receiving overrides.

### 6. Code Organization — Score: 65/100

**Strengths:**
- `helpModal.svelte.ts` in `src/lib/runes/` — correct location for rune stores ✅
- Components in `src/lib/components/wallet/` — correct feature directory ✅
- Icons use `~icons/mdi/*` convention consistently ✅
- Page imports polyfills first (required by project config) ✅

**Issues:**
- **3 files exceed the 500-line limit** (project rule):
  - `BalanceChartModal.svelte`: **702 lines** (40% over)
  - `+page.svelte`: **715 lines** (43% over)
  - `BalanceCard.svelte`: **501 lines** (marginal)
- **Dead code**:
  - `HelpButton.svelte` (26 lines) — not imported anywhere
  - HelpModal hidden button (lines 124-134) — vestigial from old pattern
- **i18n violations** in TotalAmountCard:
  - Line 33: `"Not enough funds"` (English hardcoded)
  - Lines 44, 47: `"Sats"` (should use `$t('wallet.sats')`)
  - Line 54: `"$0.00"` (hardcoded format)
- **HelpModal magic number** (line 290): `if (i === 5)` — conditionally renders footer for the 6th FAQ entry. Breaks silently if FAQ order changes.
- **Page import order**: Icon imports (lines 19-33) are interleaved with component imports. Icons should be grouped after component imports.
- **Type assertions in BalanceChartModal**: 4 `as` casts (lines 291, 345, 587, and `as unknown as ChartData`). Chart.js typing makes some unavoidable, but the `as unknown as ChartData` at line 587 is a double cast — suggests the data structure doesn't match Chart.js's expected type.

---

## Weighted Overall Score

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| Component Responsibility | 20% | 75 | 15.0 |
| Separation of Concerns | 20% | 68 | 13.6 |
| Component Composition | 15% | 82 | 12.3 |
| State Management | 20% | 78 | 15.6 |
| Interface Design | 10% | 76 | 7.6 |
| Code Organization | 15% | 65 | 9.75 |
| **Weighted Total** | **100%** | | **73.85** |

---

## Verification of Stated Refactoring Claims

| # | Claim | Verified? | Notes |
|---|---|---|---|
| 1 | Created `helpModal.svelte.ts` rune store | ✅ Yes | Clean 14-line module, properly consumed by 3 files |
| 2 | Consolidated 4 balance derivations into single-pass `connectedTotals` | ✅ Yes | `$derived.by` at page line 193, single for-loop |
| 3 | Removed mutable side-effects from `$derived.by` blocks | ✅ Yes | All `$derived.by` blocks in audited files are pure |
| 4 | Extracted `satsBalanceRow`/`usdBalanceRow` snippets | ✅ Yes | BalanceCard lines 190-244, reused via `{@render}` |
| 5 | Data-driven FAQ pattern in HelpModal | ✅ Yes | `faqs: FaqEntry[]` at line 38, `{#each}` iteration |
| 6 | HelpModal uses shared rune store | ✅ Yes | Imports from `$lib/runes/helpModal.svelte` |
| 7 | Removed dead state variables | ⚠️ Partial | `HelpButton.svelte` is itself dead code (unused). Hidden button in HelpModal (lines 124-134) is vestigial. |
| 8 | `HelpButton.svelte` is thin wrapper | ✅ Yes | 26 lines — but nobody imports it |

---

## Remaining Architectural Concerns (Ranked by Severity)

### Critical (Must Fix)

1. **BalanceChartModal double-fetch race condition** (lines 215-234 + 642-656): `onchange` handler and `$effect` both call `fetchDailyBalances()` on date range change. Remove the manual `fetchDailyBalances()` call from `onchange` — let the `$effect` handle it exclusively.

2. **3 files violate 500-line limit**: BalanceChartModal (702), +page.svelte (715), BalanceCard (501). Extract chart logic into a rune (`useChartInstance`), extract banking menu integration into a composable, extract BalanceCard accordions into sub-components.

3. **TotalAmountCard i18n violations**: `"Not enough funds"`, `"Sats"`, `"$0.00"` are hardcoded English. Must use `$t()`.

### High (Should Fix)

4. **HelpButton.svelte is dead code**: Not imported anywhere. Either integrate it (replace BalanceCard's inline `helpButton` snippet with `<HelpButton>`) or delete the file.

5. **BalanceHistory raw RPC fetch** (lines 73-113): Direct `fetch()` to `eth_getBalance` inside component `$effect`. Should be moved to a service method (e.g., `balanceHistoryService.getCurrentRpcBalance()`).

6. **BankingMenu DOM event pattern**: Page listens for custom DOM events (`banking:send`, etc.) on a dialog element. `closeBankingMenu()` uses `document.getElementById()`. This should use Svelte callbacks/props instead of DOM event listeners.

### Medium (Nice to Fix)

7. **HelpModal vestigial hidden button** (lines 124-134): `data-help-modal` attribute + hidden button is dead code from the old DOM querySelector pattern. Remove it.

8. **HelpModal magic index** (line 290): `if (i === 5)` for FAQ footer. Use a `footerKey` field on `FaqEntry` instead.

9. **Override prop pattern**: BalanceCard and BalanceHistory both use `override*` props to switch between native/connected wallet data. Consider a `provideWalletIdentity()` context pattern.

10. **BalanceChartModal type assertions**: 4 `as` casts including `as unknown as ChartData`. The double cast suggests a structural mismatch that should be resolved with proper typing.

---

## Final Verdict

**Does architecture meet 90%+ on all dimensions? NO.**

The refactoring made significant improvements:
- The shared `helpModal` rune store is a clean architectural win
- Single-pass `connectedTotals` derivation is correct and pure
- Snippet extraction in BalanceCard is well-done
- Data-driven FAQ pattern in HelpModal eliminates copy-paste

However, the codebase has meaningful remaining issues:
- Double-fetch race condition in BalanceChartModal (functional bug risk)
- 3 files over the 500-line limit (the largest at 715 lines)
- Dead code (`HelpButton.svelte`, vestigial hidden button)
- i18n violations in TotalAmountCard
- Raw RPC fetch in BalanceHistory component
- DOM event listener anti-pattern in BankingMenu integration

The weighted score of **73.85%** reflects solid foundations with room for decomposition and cleanup. To reach 90%+, the critical and high-severity issues above must be addressed.
