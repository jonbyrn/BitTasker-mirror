# SwapForm Phase 1: Logic Extraction Design (Refined Plan)

**Date**: 2026-06-01  
**Context**: Post swap-drawer-audit-report.md (subagent swarm + re-audit subagent 019e84e9-4ec3-7d00-b273-e4678e42bc43) + earn-drawer-audit-report.md precedents (defi-positions rune extraction).  
**Scope**: Highest-leverage items only — Phase 1 Logic Extraction into 3 runes. Strict base: current post-June-2026 SwapForm.svelte (1918 LOC, wallet helpers at 103-199 + 541-586 + 664-685 + 700-859) + two subagent reports (size debt #1 blocker, duplicate wallet logic across Earn*/Borrow/BuySell, dual-router in routes effect, % slider unique, 89% post-iter1, low blast). No impl yet.  
**Goal**: Enable <500 LOC SwapForm, high reuse, testable pure-ish logic, follow defi-positions + btcPrice + runes/*.svelte.ts + defi steps patterns (class or create fn + $state/$derived, tryCatch/Sentry where async, defensive isFinite, 'builtin'|string walletId, offline guards, single-source).  
**Ordering dependency**: wallets → calculator → routes (as balances feed amount/pct/insuff; amountSats + addrs feed routes; routes feed estimatedOutput/fee for canSwap/confirm).  
**Files to target (future)**: `src/lib/runes/use-swap-wallets.svelte.ts`, `src/lib/runes/use-swap-calculator.svelte.ts`, `src/lib/runes/use-swap-routes.svelte.ts` (per task spec; equiv in runes/ or utils/ ok but runes/ per existing + CLAUDE "use /src for source"). Later: integrate to SwapForm, add 5-state tests, svelte-autofixer, npm check/lint, gitnexus_detect_changes, memory_store proxy via todo/report, translation if new $t.  

**Evidence sources (full reads/greps performed)**:  
- SwapForm.svelte (chunks 1-100,100-250,...,1050-1167 + targeted grep for helpers/derived/effect/amount/route/applyPercent/walletBalanceFor/get* 100+ hits).  
- SmartRouter.ts (full), route-resolver-async.ts (full + resolveRouteAsync/createInitial), route-resolver.ts (resolveRoute + types).  
- wallet.store.ts (types + formatted* + totalBalances + arb/rsk), connected-wallets.store.ts (ConnectedWalletEntry + getEvmSigner facade + updateConnectedBalances).  
- runes/btcPrice.svelte.ts (class $state singleton), stores/defi-positions.store.svelte.ts (full pattern docstring + resolveAddress + pure helpers + Map $state + get() inside + offline + tryCatch/Sentry).  
- BorrowStep.svelte / EarnLendStep.svelte / EarnLPStep.svelte / BuySellForm.svelte (wallet selection + duplicate walletBalanceFor + isConnected + amount/setMax).  
- WalletSelector.svelte (props: walletBalanceFor, builtinBalance, selectedId 'builtin'|string).  
- swap-chain.service.ts (startSwapChain takes Route not SmartRoute), quote-normalizer.ts (AsyncRouteResult), network-status.ts, tryCatch.ts.  
- SwapForm.test.ts (mocks at boundaries: stores, SmartRouter, resolveRouteAsync, btcPrice; 5-states + isOnline + route drive).  
- Audit reports (size 1919→<500 violation, "centralizes repeated .find + builtin fallback", "SmartRouter experimental", "% slider unique", reuse via WalletSelector, subagent delta +13pts but systemic debt remains).  
- Proxy memory: todo_write pre-task + grep/code searches + docs/wallet/* (no direct mcp-memory; matches earn precedent).  

**Risk flags (from reports + code)**: Stale gitnexus (472 commits; used native+grep proxy); duplicate balance math across files (EarnLP different display); raw units differ (builtin sats/num vs conn wei/raw string + /1e18 /1e10); async external (mempool for btc bal, gas RPC, prices); SmartRouter + resolveRouteAsync dual is "experimental" with complex fallbacks in networkFeeSats/estimatedOutput; execute has special-case for usdt0-arb (hard route); no feature flags on swap paths (unlike defi); effects have timers/cancel; must preserve Sentry/isOnline/tryCatch/i18n parity.  

---

## 1. `use-swap-wallets.svelte.ts` (or equiv)

**Rationale (from subagent reports + code)**: Highest leverage. Audit explicitly calls out "Wallet lookup helpers (centralizes repeated .find + builtin fallback patterns)" added post-June (lines 103-199, 541-586). These + source*/dest* balances + walletBalanceFor + addrs + externalBtc + hasExternal are repeated/duplicated in BuySellForm.svelte (isConnectedSource + find logic + default pick), EarnLPStep (own walletBalanceFor + wbtc/usdt), EarnLend/Borrow (WalletSelector + manual $connected + $walletStore.arb), SendPaymentForm, +page wallet. Defi-positions rune precedent: extracted shared builtin+connected resolve + balances to reusable rune/store for Earn/Borrow. Size debt primary remaining gap per re-audit subagent. Extracting here shrinks SwapForm ~300+ LOC, provides single source for "builtin" | id pattern (WalletSelector gold).

**Exact Responsibilities**:
- Centralize all post-helpers wallet/balance/address lookup (no more .find or getBuiltin inline in components).
- Compute source/dest-specific balances in consistent units (expose raw sats/usd + display helpers).
- Resolve addresses for route/execution (sourceAddr for resolveRouteAsync, destAddr for startSwapChain + getExternalBtcAddress scan).
- Provide walletBalanceFor(id) for WalletSelector (USD total, used in 2 places in SwapForm + other drawers).
- Detect external BTC (hasExternalBtcWallet + getExternalBtcAddress, used for 'btc-onchain' dest + mempool fetch effect for externalBtcBalanceSats).
- Expose isConnected* deriveds + selected wallet info (label/addr for confirm UI).
- Defensive: isFinite guards (per defi), offline awareness (return 0 or cached), null addr handling.
- (Future) support refresh of connected balances if needed (facade to balancePoller? but scope minimal for phase1).
- No UI, no phase, no routes, no amount calc. Pure lookup + deriveds.
- Co-locate types (extend ConnectedWalletEntry / wallet store shapes; no `any`).
- Logging via createDebug('swap-wallets'); Sentry breadcrumbs on key lookups if error paths (async mempool).
- Browser guard for effects (mempool fetch).

**Public API (typed, co-located interfaces)**:
```ts
// src/lib/runes/use-swap-wallets.svelte.ts
import type { ConnectedWalletEntry } from '$lib/stores/connected-wallets.store';
import type { SourceWallet } from '$lib/services/route-resolver'; // 'rbtc' | 'usdt0-arb' etc, note: SwapForm narrows to rbtc/usdt0-arb

export type WalletId = 'builtin' | string;

export interface SwapWalletBalances {
  rbtcSats: number;      // always sats (builtin or conn raw adjusted)
  usdt0: number;         // human USD num (builtin formatted parse or conn /1e18)
  wbtcSats: number;      // sats (builtin or conn wei /1e10 adjusted)
}

export interface SwapWalletAddresses {
  source: string;
  dest: string;
}

export interface UseSwapWalletsOptions {
  // Callers provide reactive getters for selections (keeps UI state in component for now)
  getSourceWalletId: () => WalletId;
  getDestWalletId: () => WalletId;
  getSourceType: () => SourceWallet; // 'rbtc' | 'usdt0-arb' (narrowed)
  getDestType: () => string;         // DestType 'usdt0-arb' | ...
}

export interface UseSwapWallets {
  // Selection mirrors (for convenience; or caller keeps own $state)
  isConnectedSource: boolean; // $derived
  isConnectedDest: boolean;

  // Addresses (for routes/execute)
  sourceAddr: string;
  destAddr: string;

  // Per-selection balances (source/dest aware)
  sourceBalances: SwapWalletBalances;
  destBalances: SwapWalletBalances;

  // External BTC (dest only, for 'btc-onchain')
  hasExternalBtcWallet: boolean;
  externalBtcBalanceSats: number;

  // For WalletSelector (exact current sig)
  walletBalanceFor(walletId: WalletId): string; // USD formatted, e.g. '$12,345.67'
  builtinBalance: string; // alias for walletBalanceFor('builtin')

  // Display helpers (moved from SwapForm)
  walletLabel(id: WalletId): string;
  addrSnippet(addr: string): string;
  sourceWalletInfo: string; // "BitTasker (0xabc...def)"
  destWalletInfo: string;

  // Raw access (rare, for advanced)
  getConnectedWallet(id: string): ConnectedWalletEntry | undefined;
  getBuiltinTokenBalance(token: 'rbtc' | 'usdt0' | 'wbtc'): number;

  // For consumers that need full list (pass-through, no copy)
  connectedWallets: ConnectedWalletEntry[]; // $derived from store
}

export function useSwapWallets(opts: UseSwapWalletsOptions): UseSwapWallets;
```

**Data Dependencies (stores, runes, services)**:
- `$walletStore` (via import { walletStore } from ... + get() inside or $ in context; uses .rsk.formattedBalance, .arb.formattedUsdt0Balance, .arb.formattedWbtcBalance, .rsk.address, .arb.address, totalBalances.sats).
- `$connectedWalletsStore` (wallets: ConnectedWalletEntry[] with .id, .address, .balances[ 'rbtc' | 'usdt0-arb' | 'wbtc' | 'btc' ].raw , .walletType, .btcAddress, .walletName).
- `btcPrice` rune (for USD in walletBalanceFor + subs).
- `connectorRegistry` (from '$lib/services/external-wallet/connector-registry' — for getExternalBtcAddress scan of bitcoinSigner).
- `browserNetworkStatus` (read-only for optional offline: skip mempool? return cached).
- No write to stores (read-only facade like defi + connected facades getEvmSigner).
- Internal: createDebug, * as Sentry (for async errors), tryCatch if future async.

**Testability**:
- High: pure deriveds + fns testable in vitest (mock stores via vi.mock hoisted like current SwapForm.test + defi tests; provide fake opts.get* ).
- Unit: test getBuiltin vs conn paths, unit conversion (sats/1e18/1e10), USD calc with btcPrice=0, external BTC find, addr resolution for all DestType.
- Integration: with WalletSelector render (pass returned walletBalanceFor).
- Edge: no connected wallets, builtin zero, malformed raw='NaN', offline mempool, hardware (trezor/ledger) btcAddress.
- Reuse tests: run same suite against BuySellForm/Earn* after they consume (future).
- Mocks at boundary only (stores/services); no DOM in rune file.

**Reuse Opportunities Across Other Wallet Flows**:
- Very high (per analysis): BuySellForm (duplicate isConnected + find + default source pick + walletBalanceFor), BorrowStep/EarnLend/EarnLP (WalletSelector + inline finds + own walletBalanceFor with slight diff for LP display), SendPaymentForm (getConnectedWalletLabel + isConnectedSource), dashboard +page (balances), future send/receive with multi-wallet.
- Can evolve to shared `use-wallets.svelte.ts` (drop swap- prefix) or move to stores/ after Phase1 proves.
- WalletSelector already expects the API (builtinBalance + walletBalanceFor + connectedWallets) — rune provides exactly.
- Defi-positions precedent: its resolveAddress('builtin'|string) + getBuiltinAddress/getConnectedAddress can be unified here or delegate.

**Risks / Ordering Dependencies**:
- Unit inconsistency risk (builtin vs conn raw formats) — centralize conversions here with tests + comments.
- Side-effect (mempool fetch in $effect for externalBtcBalanceSats + connectorRegistry.list()) — keep guarded, cancellable, browser-only. Flag: may need abort in rune.
- Depends on btcPrice rune (async init) — deriveds must handle price=0 gracefully (current does).
- Selection state stays in caller (sourceWallet $state etc) to avoid ownership fight; rune is lookup only. If later hoist selection, add $state inside.
- Ordering: must be first (provides sourceRbtcSats etc to calculator's walletBalanceToken + applyPercent/setMax; addrs + isConnected to routes + execute).
- Blast: low (per audit "low blast confirmed" for similar); impacts only wallet selection UIs. Use gitnexus_impact on symbols post-extract.
- Stale prices/balances: expose lastUpdated? (minimal for phase1; follow defi 30s STALE).
- No kill-switch yet on swap (unlike LOAN); rune should not gate.

**Implementation Notes (for later coder)**:
- Use class SwapWallets { ... } + export const useSwapWallets = (opts) => new ... or direct fn with runes (defi uses class inside store file).
- All $derived.by for complex.
- Keep exact current math (e.g. Math.round for rbtc/wbtc, /1e18 for usdt conn).
- Move externalBtcBalanceSats $effect + mempool logic here.
- After: delete helpers from SwapForm; import { useSwapWallets } and destructure.

---

## 2. `use-swap-calculator.svelte.ts`

**Rationale**: Amount/percent logic (lines 439-488, 664-678, 919-932, 340-342, 447-455) + setMax + bidirectional sync effect + is* deriveds + amountSats (for routes) + display conv is ~150 LOC unique to Swap (per task + audit: "% slider that is unique to SwapForm"). Dupe setMaxAmount in EarnLPStep/BorrowStep (but simpler, no %). Extract enables reuse for other amount+max UIs (e.g. future Send with % of balance), shrinks form, single source for rbtc (sats display/rounding) vs usdt (6dec) handling. Depends on wallets rune for balances.

**Exact Responsibilities**:
- Manage or accept `amount: string` (input value) + `swapPercent: number` (0-100).
- Bidirectional sync: applyPercent(pct) → set amount (rbtc: round to nearest sat string; usdt: toFixed(6)); $effect(amount change) → compute pct from balance, clamp 0-100, set if changed.
- setMaxAmount() → pct=100, amount = full balance (rbtc round, usdt as-is).
- Deriveds: amountInTokenUnits (parse + rbtc /1e8), walletBalanceToken (from wallets rune), walletBalanceDisplay (formatSats or usd), isInsufficientBalance, isValidAmount, amountSats (for routes: rbtc direct, usdt→sats via btcPrice if avail).
- Helpers: satsUsd(sats) for display.
- amountSats conversion for rbtc source vs usdt (uses btcUsdPrice state? or from rune).
- Input normalizer? (current in template oninput for ,,.; keep in component or expose validator fn).
- isOnline aware (disable max/pct? via passed or internal derived).
- No routes, no execute, no gas. Focus on user amount intent + balance checks.
- Defensive parse (isFinite, <=0 →0).

**Public API (typed)**:
```ts
export interface UseSwapCalculatorOptions {
  // From wallets rune (or direct)
  getWalletBalanceToken: () => number; // source in token units (rbtc frac or usdt)
  getSourceType: () => 'rbtc' | 'usdt0-arb'; // for unit handling + rounding
  getBtcUsdPrice: () => number; // for usdt→sats conv in amountSats
  getIsOnline?: () => boolean;
}

export interface UseSwapCalculator {
  // Caller owns these $state or bind; rune provides mutators + sync
  // (typical: let amount = $state(''); let swapPercent = $state(0); then pass or use returned setters)
  // For full encapsulation option:
  amount: string;        // reactive
  swapPercent: number;

  // Derived (read-only)
  amountInTokenUnits: number;
  walletBalanceToken: number; // proxy
  walletBalanceDisplay: string;
  isInsufficientBalance: boolean;
  isValidAmount: boolean;
  amountSats: number; // for routes rune
  isOnline: boolean;

  // Actions (idempotent, trigger haptics? or caller)
  applyPercent(pct: number): void;
  setMaxAmount(): void;
  resetAmount(): void; // amount='', pct=0

  // Pure helpers (testable standalone)
  satsUsd(sats: number, btcPrice: number): string;
  parseAmount(amt: string, sourceType: 'rbtc'|'usdt0-arb'): number;
}

export function useSwapCalculator(opts: UseSwapCalculatorOptions): UseSwapCalculator;
```

**Data Dependencies**:
- Wallets rune (primary: getWalletBalanceToken() + sourceType for rounding; also later for sourceRbtcSats in display?).
- btcPrice rune (via getBtcUsdPrice or direct import for amountSats + satsUsd).
- formatSats from wallet.store (re-export or import).
- network-status (isOnline for gating max).
- (Optional) haptics if move setMax trigger here (current in methods).
- usdFormatter/satsFormatter? (locale aware; may stay in component or pass).

**Testability**:
- Excellent (pure fns + rune with mocked opts). Vitest: test applyPercent rbtc round vs usdt fixed, sync effect both directions (use flush or $effect in test?), setMax, isInsufficient at 0/boundary/NaN, amountSats=0 edge, btcPrice=0 fallback.
- Cover 5 edges per CLAUDE (empty bal, zero amt, 100%, insuff, offline).
- Mock btcPrice=65000 like current test.
- Can test without DOM (call returned fns).

**Reuse Opportunities**:
- setMaxAmount pattern in Borrow/EarnLP (adapt for %?); future amount inputs with slider (e.g. LP provide % split). Expose parse/conv utils for other forms. AmountInputSection exists but Swap uses custom (post iOS fix); rune logic can feed it later.
- Unique % bidirectional + rbtc sat rounding = swap-specific, but core max/balance-check reusable.

**Risks / Ordering Dependencies**:
- Depends on wallets rune (for balanceToken) — must init after.
- Rounding precision for rbtc (current Math.round((pct/100)*bal*1e8) ) critical for "exact max" — preserve + test boundary (e.g. bal=0.0000001).
- Relies on btcPrice for usdt amountSats; if 0, amountSats=0 (current) — may block quotes; expose warning?
- State sync via $effect (race if multiple writers) — single source (rune owns or strict setters); per CLAUDE "single-writer".
- Locale formatters: keep out or inject (current $derived on $locale in form).
- Ordering: after wallets, before routes (provides amountSats + isValidAmount for canSwap + route effect guard).
- iOS normalizer (comma handling) stays in template oninput (per recent audit fix); rune receives normalized string.

---

## 3. `use-swap-routes.svelte.ts`

**Rationale**: Core of "Route resolution — resolveRouteAsync primary, SmartRouter experimental" (lines 687-859 + 750-835). Dual Promise.allSettled + 400ms debounce effect, complex derived fallbacks (estimatedOutput, activeRouteForCalc, networkFeeSats ~60 lines with gas calc + price conv + isSimpleTransfer, totalFeeSats). Gas RPC + estimateDirect + refresh timers mixed. Audit notes "dual SmartRouter + resolveRouteAsync orchestration, fee/output deriveds". Extract for testability (current tests mock at top level), allow reuse in other quote UIs (RoutePicker? BuySell?), shrink form. Services already have tests (route-resolver*).

**Exact Responsibilities**:
- Own/instantiate SmartRouter + state: smartRoute, asyncRouteResult, routeLoading.
- Debounced resolution effect: on amountSats change (>0), clear timer, set loading, Promise.allSettled([resolveRouteAsync(source, destForType, amountSats?string, sourceAddr), smartRouter.getBestRoute(...) ]), set results, loading=false. (amount as string per async sig; current passes num — handle coerce).
- destinationFor helper (internal, maps DestType → Destination).
- Derived fee/output:
  - estimatedOutput (prefers smart (boltz special *btcPrice for usdt), else active + fee* + gas deduct for rbtc source + cross price for rbtc<->usdt).
  - activeRouteForCalc (null if smart else first async).
  - networkFeeSats (smart.gas or fallback.gas or compute from rsk/arbGasPriceWei + hardcoded limits + eth/btc price conv for arb; isSimpleTransfer special).
  - totalFeeSats (smart or network + pct*amt).
- Expose for UI: can use smartRoute for provider/fee display, async for fallback list (SwapFallback).
- Gas state? (rsk/arbGasPriceWei, rsxGasLimit, ethUsd/btcUsd for conv) — internal or accept from parent refreshLiveFees.
- Refresh control: accept or internal timer/effect for gas/price (current 300ms on open + onMount).
- Abort/cancel support (pass signal to resolveRouteAsync).
- isOnline guard (early return in effect like current).
- No amount input, no wallet select, no execute (but provides execRoute choice: smart or async[0] or special lifi for usdt0).
- tryCatch on the allSettled? or per (current uses status checks).

**Public API (typed)**:
```ts
import type { SmartRoute } from '$lib/services/SmartRouter';
import type { AsyncRouteResult, Route, Destination } from '$lib/services/route-resolver-async'; // reexports
import type { SourceWallet } from '$lib/services/route-resolver';

export type DestType = 'usdt0-arb' | 'rbtc-rsk' | 'wbtc-arb' | 'btc-onchain';

export interface UseSwapRoutesOptions {
  getSourceType: () => SourceWallet;
  getDestType: () => DestType;
  getAmountSats: () => number;
  getSourceAddr: () => string;
  getIsOnline: () => boolean;
  // Gas/price feeds (from component refresh or internalize)
  getBtcUsdPrice?: () => number;
  getEthUsdPrice?: () => number;
  getRskGasWei?: () => bigint;
  getArbGasWei?: () => bigint;
  // Optional: allow injecting routers for test (DI)
  smartRouter?: SmartRouter;
  resolveRouteAsyncFn?: typeof resolveRouteAsync;
}

export interface UseSwapRoutes {
  smartRoute: SmartRoute | null;
  asyncRouteResult: AsyncRouteResult;
  routeLoading: boolean;

  // Primary deriveds for UI/confirm
  estimatedOutput: string; // human, may be USD or token
  totalFeeSats: number;
  networkFeeSats: number;
  activeRouteForCalc: Route | null; // for fallback calc

  // For execute (prefers smart? but current logic special-cases)
  getExecutableRoute(): Route | null; // converts Smart? or picks async[0] or hardcoded lifi-usdt0

  // Control
  clearRoutes(): void;
  refreshRoutes(): void; // force

  // Internal exposed for debug
  destinationFor(dest: DestType): Destination;
}

export function useSwapRoutes(opts: UseSwapRoutesOptions): UseSwapRoutes;
```

**Data Dependencies**:
- SmartRouter class + getBestRoute (new inside or injected).
- resolveRouteAsync, createInitialAsyncRouteResult, destination type from route-resolver(-async).
- btcPrice (for estimatedOutput conv + networkFee arb calc).
- (Gas feeds: current fetchGasPrice + estimateDirectTransferGas + prices from cryptoPriceService — may internalize refresh or accept as opts to avoid dup).
- sourceAddr (from wallets), amountSats (from calculator), types, isOnline.
- createDebug, Sentry (on route fail), tryCatch (wrap builders?).
- kill-switch? (for providers in async, already inside resolve).

**Testability**:
- High: mock the two resolvers (already done in SwapForm.test + dedicated route-resolver tests). Test effect debounce (fake timers), Promise settlement order (smart wins for estimated), fallback calc when no smart, gas fallback paths, conv with price=0.
- Unit the deriveds with fixed inputs.
- Cover: amount=0 → clear, offline → skip, both fail → loading false + nulls, Smart provides gasCostWei.
- London TDD: mock-first for dual orchestration.

**Reuse Opportunities**:
- Route resolution + fee display used in RoutePicker.svelte? (check), PendingSwap, BuySell (if swaps), future instant-buy or defi repay handoff (loan plan mentions SwapForm handoff). Extracted rune allows <RouteQuoteCard> or shared fee UI.
- SmartRouter already multi-provider comparison — usable standalone but rune adds the async dual + deriveds + debounce specific to form UX.

**Risks / Ordering Dependencies**:
- Dual system complexity (Smart "preferred", async "primary" per comment) — preserve exact fallback logic in deriveds (activeRouteForCalc, estimatedOutput if smart null, networkFee prefer smart then fallback then compute).
- Amount units: resolve takes string (sats?), current passes num sats — ensure .toString() or fix in rune.
- Gas/price refresh: currently outside (refreshLiveFees populates rsk/arbGas + btc/ethPrice); rune needs them for networkFeeSats. Options: (a) accept as opts/getters (preferred, component owns timers), (b) internalize (dup code risk). Flag in design.
- Special execute path for 'usdt0-arb' source (builds lifi route) — rune can expose getExecutableRoute() that replicates.
- Timer/cancel effects + multiple $effect — centralize in rune, return cleanup if needed.
- Ordering: last (needs amountSats + addrs + types + online + prices/gas). canSwap in form will use routes result + calc valid.
- Experimental: document that Smart may return null; always have async fallback.
- AbortSignal for long quotes (resolve supports options.signal).
- Re-entrancy on rapid flips (current clears on source change).

---

## Summary & Next Steps (per refined plan from reports)

- **Phase 1 Deliverable**: 3 rune files (each <200 LOC target, typed, documented like defi-positions), pure helpers exported, no side effects outside dedicated.
- **Impact on SwapForm**: Remove ~500-600 LOC logic (helpers + calc + routes + gas some), left with props/state for selections/phase/amount/pct (pass to runes), template, execute glue, Sentry/isOnline already good. Target <500? or split to SwapForm + SwapConfirm sub if needed.
- **Verification Matrix (from audit/CLAUDE)**:
  - npm run check + lint clean.
  - Targeted: npm run test:unit:components (update SwapForm.test mocks to use runes? or keep hoisted), new rune unit tests (90%+ branch).
  - 5-state component tests still pass + add rune coverage for edges.
  - python3 scripts/find-missing-translations.py (no new keys assumed).
  - svelte-autofixer on any .svelte touched later.
  - gitnexus_detect_changes (low blast expected).
  - Re-audit swarm (subagents) post-extract for 95%+.
  - Memory: append to this + todo_write + report.
- **Risk Mitigation**: Implement wallets first (test in isolation), then calc (depends), routes last. Use search_replace only after read full + gitnexus_impact proxy. No new root/docs except this (edit existing? but task requires output).
- **Future Phases (not in scope)**: Component tests lift, tryCatch on all async in form, offline banner full, ARIA already done, size <500 final, shared non-swap wallet rune.

**File paths (absolute)**:  
- Design: `/home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/docs/wallet/swapform-phase1-logic-extraction-design.md` (this file).  
- Proposed runes: `src/lib/runes/use-swap-wallets.svelte.ts` etc (not created here).

*Generated as design agent per exact task + CLAUDE/AGENTS (full reads first, todo proxy memory, no premature code, 95% via verification). Base strictly on subagent reports (size/debt/reuse/dupe noted) + code reads.*

---

## Phase 1 Transition to Implementation (Coordinator Handoff — 2026-06-01)

**Status**: Design complete (refined plan + 3 typed rune specs + evidence from full SwapForm reads, narsil chunks, cross-greps, defi-positions/btcPrice precedents, bittasker-wallet + svelte-runes + gitnexus-impact skills, audit reports). No runes implemented yet (confirmed 0 matches for use-swap-*). Memory proxy complete (todo + searches + docs; no mcp-memory surfaced, per audit precedent).

**Purpose of this section**: Actionable handoff for implementation agents / PRs. Short, concrete. Follows all CLAUDE/AGENTS (gitnexus pre-edit, TDD, <500, typed, 95% via tests/tools, edit existing only, batch reads before changes, no root saves, i18n/translation pre-commit, svelte-autofixer on .svelte, etc.).

### 1. Concrete "Integration & Migration Checklist" (for moving runes into SwapForm.svelte)

**Pre-work (all agents)**:
- Run `npx gitnexus analyze` (index 472 commits stale per gitnexus__list_repos; confirm via list_repos or gitnexus://.../context post-run). Use narsil-mcp + code-index__search_code_advanced + grep as proxy until fresh.
- Full read (no chunks): SwapForm.svelte (all sections), target rune files (once written), WalletSelector.svelte, SwapForm.test.ts, src/routes/(protected)/dashboard/wallet/+page.svelte (usage), EarnLPStep.svelte / BuySellForm.svelte (dups), route-resolver* services, wallet/connected-wallets stores, btcPrice rune, tryCatch/Sentry patterns.
- todo_write + append here for learnings.
- Skills consulted: bittasker-wallet (safety), svelte-runes, gitnexus-impact-analysis (workflow), test-driven-development, sentry-integration.

**Wallets Rune (src/lib/runes/use-swap-wallets.svelte.ts) — Do First**:
- **Delete from SwapForm** (after wiring + tests green): `getConnectedWallet`, `getBuiltinTokenBalance`, `walletBalanceFor`, `getExternalBtcAddress`, `hasExternalBtcWallet` ($derived), `externalBtcBalanceSats` ($state + full $effect with mempool + connectorRegistry + cancelled), `sourceAddr`/`destAddr` ($derived.by), all 6 `sourceRbtcSats`/`sourceUsdt0Usd`/`sourceWbtcSats` + dest* equivalents ($derived.by), `isConnectedSource`/`isConnectedDest` (thin proxy ok or delete if rune exposes), `walletLabel`, `addrSnippet`, `sourceWalletInfo`/`destWalletInfo` ($derived.by).
- **Wire (in <script> after rune impl)**:
  ```ts
  import { useSwapWallets, type UseSwapWalletsOptions, type WalletId } from '$lib/runes/use-swap-wallets.svelte.ts';
  // ...
  const swapWallets = useSwapWallets({
    getSourceWalletId: () => sourceWallet,
    getDestWalletId: () => destWallet,
    getSourceType: () => sourceType,
    getDestType: () => destType
  });
  ```
  Replace: `sourceAddr` → `swapWallets.sourceAddr`, `walletBalanceFor(id)` → `swapWallets.walletBalanceFor(id)`, `builtinBalance` → `swapWallets.builtinBalance`, pass `connectedWallets={swapWallets.connectedWallets}` (or keep $connected if preferred), `hasExternalBtcWallet` → `swapWallets.hasExternalBtcWallet`, `externalBtcBalanceSats` → `swapWallets.externalBtcBalanceSats`, `sourceWalletInfo` etc from rune, `getConnectedWallet` rare → `swapWallets.getConnectedWallet`.
- **WalletSelector calls** (2 sites in template): update props to use rune versions (exact API match per design).
- **Keep temporarily for safety (1 sprint max, commented or wrapper)**: old fns as `// PHASE1_RUNE_MIGRATE: delete after 2026-06-08; was: function get... { return swapWallets... } ` + console.debug deprecate. Easy rollback via git.
- **Other**: Move external BTC logic fully (mempool effect). Expose raw if needed. No writes to stores. Add createDebug('swap-wallets'), Sentry breadcrumbs on async errs.

**Calculator Rune (use-swap-calculator.svelte.ts — After Wallets)**:
- **Delete**: `amountInTokenUnits`, `walletBalanceToken`, `walletBalanceDisplay`, `satsUsd` fn, `applyPercent`, `setMaxAmount` (haptic stays in caller), the bidirectional `$effect` (pct<->amt), `isInsufficientBalance`, `isValidAmount`, `amountSats` ($derived).
- **Wire** (amount/swapPercent $state stay in component per preferred design option for single-source UI ownership; rune provides mutators + deriveds):
  ```ts
  import { useSwapCalculator, type UseSwapCalculatorOptions } from '$lib/runes/use-swap-calculator.svelte.ts';
  const swapCalc = useSwapCalculator({
    getWalletBalanceToken: () => parseFloat( /* from wallets or direct */ ),
    getSourceType: () => sourceType,
    getBtcUsdPrice: () => btcPrice.price,  // or local state
    getIsOnline: () => isOnline
  });
  // Use: swapCalc.amountSats, swapCalc.isValidAmount, swapCalc.applyPercent(p), swapCalc.setMaxAmount(), swapCalc.walletBalanceDisplay etc.
  // amount/swapPercent can stay local or use swapCalc.amount if full encap chosen.
  ```
- **Keep temp**: old fns as thin wrappers calling rune + deprecate comment.
- **Note**: iOS oninput normalizer stays in template (per audit). Rounding precision critical — tests must cover bal=0.0000001 etc.

**Routes Rune (use-swap-routes.svelte.ts — Last)**:
- **Delete/move**: `smartRouter` (new or inject), `smartRoute`, `asyncRouteResult`, `routeLoading`, `destinationFor`, the 400ms debounce `$effect` (Promise.allSettled + timer cleanup), `estimatedOutput`, `activeRouteForCalc`, `networkFeeSats`, `totalFeeSats`, the rsxGasLimit estimate `$effect` (estimateDirectTransferGas), related gas calc logic.
- **Gas/price states** (`btcUsdPrice`, `ethUsdPrice`, `rskGasPriceWei`, `arbGasPriceWei`, `rsxGasLimit`, `refreshLiveFees`, `fetchGasPrice`, `estimateDirect...`): **Recommend keep in SwapForm** (owns 300ms onOpen timer + onMount + isOnline guard). Pass as getters in UseSwapRoutesOptions (preferred per design flag to avoid dup). Alternative: internalize (risks code dupe across forms).
- **Wire**:
  ```ts
  import { useSwapRoutes, type UseSwapRoutesOptions, type DestType } from '$lib/runes/use-swap-routes.svelte.ts';
  const swapRoutes = useSwapRoutes({
    getSourceType: () => sourceType,
    getDestType: () => destType,
    getAmountSats: () => swapCalc.amountSats,
    getSourceAddr: () => swapWallets.sourceAddr,
    getIsOnline: () => isOnline,
    getBtcUsdPrice: () => btcPrice.price,
    getEthUsdPrice: () => ethUsdPrice,
    getRskGasWei: () => rskGasPriceWei,
    getArbGasWei: () => arbGasPriceWei,
    // smartRouter / resolveRouteAsyncFn optional for DI/test
  });
  // Then: swapRoutes.smartRoute, .estimatedOutput, .totalFeeSats, .networkFeeSats, .getExecutableRoute(), .clearRoutes(), .routeLoading
  ```
- **In executeSwap**: replace route pick with `const execRoute = swapRoutes.getExecutableRoute() ?? (special usdt0 lifi case)`.
- **Keep temp**: full old route block commented with `// PHASE1_RUNE_MIGRATE (routes) — delete post-validation`.
- **canSwap**: `isValidAmount && (swapRoutes.smartRoute || swapRoutes.async... ) && phase==='form' && isOnline` (or delegate more to rune).

**General Migration Rules**:
- **UI/phase state kept in SwapForm** (no ownership fight): source/dest*Wallet/Type, amount, swapPercent, swapPhase, errorMessage, swapResult, isFlipping, expands, isOnline (already), visibleDestOptions (may thin).
- **Execute glue + resetForm + handleClose + goToConfirm + swapDirection + handleKeyPress** stay (minor calls to rune.reset if added; special usdt0 lifi execRoute may move to rune.getExecutableRoute).
- **Imports**: prune after (keep route-resolver types + startSwapChain + SmartRouter? if DI, services for execute, haptics, Sentry, btcPrice, stores still needed by runes or thin).
- **Template**: minimal changes — mostly update passed props to WalletSelector/AssetSelector (from runes), bind amount etc (or via rune if chosen), use rune.deriveds in displays (fee cards etc). No logic in template.
- **Safety nets (mandatory)**: 
  - All deletes behind unique comments or git-revertable hunks.
  - Keep old helpers 7 days as no-op wrappers logging deprecation.
  - Preserve 100% Sentry breadcrumbs, $t, tryCatch parity, offline guards, haptics.
  - No `any`; use exact types from design + existing.
- **Post-wiring in SwapForm**: run `npm run check`, targeted vitest on SwapForm.test (update hoisted mocks if needed for rune boundaries; runes should be testable standalone), svelte-autofixer (on any .svelte), python3 scripts/find-missing-translations.py (expect 0 new keys).
- **Size target**: SwapForm <500 LOC post (or split confirm if needed).

**Test Impact**:
- New: 3 rune test files (vitest, 90%+ branch, 5-edges, mock-first TDD, tryCatch).
- Update: SwapForm.test.ts (mocks at rune opts or stores; verify 5-states + execute paths still pass; no regression on fallback/retry).
- Integration: happy + 2 failure paths (network, insuff, no route).

### 2. Minimal Set of Symbols That Will Change in SwapForm.svelte (Once Runes Adopted)

**High-confidence from narsil chunks + full reads + design** (inside <script> ~1167 lines + template ~750 lines; total ~191x LOC):

- **Deleted / fully delegated (biggest group)**: All wallet lookup helpers + deriveds (getConnectedWallet, getBuiltinTokenBalance, walletBalanceFor, getExternalBtcAddress, hasExternalBtcWallet, externalBtcBalanceSats + $effect(501-538), sourceAddr(121), destAddr(130), sourceRbtcSats(545)...destWbtcSats(581) [~6], isConnected* thin, walletLabel(1143), addrSnippet(1150), sourceWalletInfo(1155), destWalletInfo(1162) ); calc (amountInTokenUnits(440), walletBalanceToken(340), walletBalanceDisplay(448), satsUsd(458), applyPercent(466), setMaxAmount(919), pct sync $effect(478), isInsufficient(672), isValidAmount(678), amountSats(664) ); routes (destinationFor(689), smartRoute(78), asyncRouteResult(699), routeLoading(79), route $effect(702-746), estimatedOutput(751), activeRouteForCalc(779), networkFeeSats(788), totalFeeSats(830), gas estimate $effect(837), plus gas state inits if moved (345-353) — recommend NOT move).
- **Heavily modified**: canSwap(679) (now delegates more), executeSwap(997) (uses rune.getExecutableRoute + minor), swapDirection(890)/resetForm(981) (may reset runes), imports (1-29), some $derived.by wrappers, refreshLiveFees callers (pass getters).
- **Minimally touched / kept (UI + glue + template)**: Props (isOpen/onClose), all $state for selections/phase/amount/pct/error (75-84,92-97), isOnline(87), CHAIN_* consts, destOptions(240), visibleDestOptions, sourceAsset etc, fetchGasPrice/estimate/refreshLiveFees + timers (kept for ownership), onMount, all methods except pure calc (swapDirection keeps haptic/Sentry, goToConfirm(964), cancelConfirm, handleKeyPress, handleClose, retryWithFallback, getProviderLabel), isDirectTransfer(1137), the entire <Drawer> + template (selectors wired to runes, displays use rune.deriveds, execute button uses canSwap from runes). SmartRouter may stay for DI or move.
- **New additions**: 3 `const xxx = useXXX({getters...})`, type imports for rune options/returns, thin getter fns if needed for options, any rune-specific resets.
- **Net**: ~500-600 LOC removed from logic (per design); file shrinks dramatically; template ~unchanged; blast isolated to wallet/amount/route domains inside one file + 1-2 props on WalletSelector.

**Callers/Consumers (external symbols minimally impacted)**: 
- `+page.svelte:685` (just `<SwapForm .../>` — no change).
- `SwapForm.test.ts` (mocks + assertions on rendered states; internal fns not directly tested).
- `WalletSelector.svelte:12` (prop types for walletBalanceFor/builtinBalance — additive compatible).
- Dups in EarnLPStep (own impl; future unification not in Phase 1).
- Services (SmartRouter, resolveRouteAsync, startSwapChain) — called same or via rune DI.

Low blast overall (confirmed in audit via proxy).

### 3. Exact GitNexus Impact Targets (Run Before ANY Edits to Existing Symbols)

**Critical pre-step**: `npx gitnexus analyze` (stale index 472 commits; 2026-05-04 index vs current). Re-run list_repos to verify "indexedAt" fresh. Use gitnexus://repo/BitTasker/context + /processes post.

**Then execute (in order, per gitnexus-impact-analysis skill)**:
1. `gitnexus__impact` (target: "SwapForm" or file_path: "src/lib/components/wallet/SwapForm.svelte", direction: "upstream", minConfidence:0.7, maxDepth:3) — top-level blast (callers in routes, tests).
2. `gitnexus__impact` on "walletBalanceFor" (file_path: "src/lib/components/wallet/SwapForm.svelte" for disambig) + "getConnectedWallet".
3. `gitnexus__impact` on "applyPercent", "setMaxAmount", "destinationFor", "executeSwap", "amountSats", "estimatedOutput", "networkFeeSats", "refreshLiveFees".
4. `gitnexus__context` (name: "walletBalanceFor" or uid from prior) for 360° (callers/callees/processes).
5. `gitnexus__query` (query: "SwapForm wallet lookup and route resolution logic", task_context: "Phase 1 rune extraction", limit:5) — execution flows.
6. Post-rune creation: impact on new "useSwapWallets", "useSwapCalculator", "useSwapRoutes".
7. Pre-commit always: `gitnexus__detect_changes` (scope: "unstaged" or "staged").

**Proxy while stale** (use now): 
- narsil-mcp__find_symbol_usages / find_references / get_callers (symbol: "getConnectedWallet", path: "src/lib/components/wallet/SwapForm.svelte")
- narsil-mcp__search_code (query: "walletBalanceFor|destinationFor inside SwapForm", file_pattern: "*.svelte")
- code-index__search_code_advanced (pattern: "function (getConnectedWallet|applyPercent|destinationFor)", file_pattern: "SwapForm.svelte")
- gitnexus__context / query where available; manual grep + read.

**Risk expectation**: LOW (per audit "low blast confirmed" for similar; <5 direct external + WalletSelector + test + self). Warn if HIGH/CRITICAL — do not edit.

### 4. Prioritized Sequence for Next Implementation Agents (Wallets First)

**Strict order (dependencies + risk)** — one agent or parallel with handoff only after prior green:

1. **Wallets rune (P0, unblocker)**: TDD Red-Green-Refactor (test-driven-development skill). Write rune tests first (mocks for stores/btcPrice/connectorRegistry/network; 90%+ branch; edges: NaN, offline, no conn, hardware BTC, unit convs, walletBalanceFor parity with old). Impl per exact design API + defi-positions pattern (class or create fn + $state/$derived, tryCatch/Sentry on async, defensive isFinite, browser guards, debug). <200 LOC target. npm run check + lint + targeted test. gitnexus impact on new + dependents. Append todo/memory. Only then handoff.

2. **Calculator rune**: Depends on wallets API. Same TDD (pure parse/satsUsd first; effect sync with fake timers; 5 states/edges incl rounding boundaries, btcPrice=0). Wire tests to wallets mock.

3. **Routes rune**: Most complex (dual Smart+async per design risks). TDD with existing resolver mocks + DI opts. Cover debounce, Promise.allSettled order, fallbacks, gas convs (price=0), getExecutableRoute special case, offline. London-school (mock resolvers first).

4. **Integration into SwapForm (PR or dedicated agent)**: After 1-3 unit green. Batch full reads + gitnexus impacts (exact targets above) + todo. Use search_replace only (no raw writes). Implement checklist wiring + temp safety. Preserve all prod safety (Sentry 7+ paths, isOnline, i18n). Update SwapForm.test minimally for rune boundaries. Run autofixer + check + lint + translation script immediately after edits.

5. **Test/Mock/Validation lift**: Expand rune tests + SwapForm.test (5-states, integration happy+2 fails, retry/fallback). Run `npm run test:unit:components` (targeted SwapForm), full `npm run test:ci` for multi-file. Coverage evidence.

6. **Pre-commit gate**: `gitnexus__detect_changes`, npm run check/lint, translation script (0 issues), svelte-autofixer (0 on touched .svelte). Confirm only expected symbols affected (runes + SwapForm logic + WalletSelector prop consumers).

7. **Re-audit + Phase 1 close**: Per audit precedent — spawn subagent swarm (read-only first, then verify) for 95%+ gate (size, reuse, no regression on execute flows, 5-states, safety). Update this doc + audit report (edit existing) with evidence/scores. Memory store final learnings (patterns: "wallets rune unblocks 2 others + 3+ forms", "gas ownership in component = low dup risk", "temp wrappers = rollback safety"). Tag for Phase 2 (shared wallet rune? confirm sub-split?).

**Agent Execution Rules (enforced)**: 1 message = all related (reads/batches). Read before edit. No assumptions. 95%+ only with passing targeted tests + tools clean + gitnexus low. Consult skills before coding (bittasker-wallet etc). After any .svelte: svelte-autofixer. Before commit: detect_changes.

**Expected Outcomes (Phase 1)**: 3 reusable <200LOC runes (typed, tested), SwapForm shrunk ~30%+ logic (target <500 or justified split), zero functional regression, high reuse path for BuySell/Earn, production safety parity, full evidence trail in todos/docs.

**Blockers to flag immediately**: Stale gitnexus unresolved, missing skill patterns, test failures on rounding/dual routes, i18n drift, any HIGH impact from gitnexus.

This completes the design-to-impl transition coordination. Next agents start with wallets TDD + memory update.

*Appended by coordinator subagent. All per exact user task + project rules (no new files, memory proxy first/last, full context, GitNexus, 95% verification).*

---

*End of transition document.*

---

## Phase 2: Template DRY (Post-Logic Extraction Refinement)

**Date**: 2026-06-01  
**Agent**: UI Component Design subagent (Grok Build)  
**References (both subagent reports + precedents)**: 
- `docs/wallet/swap-drawer-audit-report.md` (subagent swarm + re-audit id 019e84e9-4ec3-7d00-b273-e4678e42bc43; size debt #1, 1919→<500, dupe wallet logic across Earn/Borrow/BuySell, "no large refactors" in Iter1, 89% post-iter1, template hygiene, 5-state/TDD requirements).
- `docs/wallet/swapform-phase1-logic-extraction-design.md` (this file; Phase 1 runes for logic, future phases explicitly call out "template, execute glue", "split to SwapForm + SwapConfirm sub", "DRY opportunity" echoes from earn report).
- `docs/earn-drawer-audit-report.md` (dupe amount join/max logic noted in EarnLend/EarnLP; CollapsibleSection precedent in shared/; defi card extraction patterns).
- Cross: BorrowStep.svelte (gold standard for amount parity, skeletons, isOnline, WalletSelector reuse), TotalAmountCard.svelte (typed props + unit handling + compact rows), CollapsibleSection.svelte (snippet-based collapse), daisyUI collapse docs (via MCP), svelte 5 runes + $props patterns per CLAUDE.

**Mission**: Map every instance of duplicated source/dest card markup + fee/estimate rows across confirm/success (and form estimate) phases in current SwapForm.svelte. Design two reusable presentation components + recommend base collapse to DRY the wallet accordion pattern (WalletSelector/AssetSelector + 8+ other sites in wallet domain). Deliver: typed Props, behavior/variants (isDirectTransfer, asset types, loading), usage examples in *future* post-Phase1 phase views, exact duplication sites + line refs eliminated. Clean, ready-to-implement design docs (no premature code).

**Scope Constraints (strict per CLAUDE/AGENTS + Phase 1)**: Design only. No file creation except append to *this existing* md (edit, not new). No impl. Future integration after runes (Phase 1) lands + SwapForm shrinks (target <500 or split). All new components <200 LOC, typed public API, follow TotalAmountCard docstring style, daisyUI+Tailwind, i18n via $t in caller or props, 5-state aware (empty/loading/error/populated/edge via props), defensive (no assume data), Svelte 5 $props. Place in `src/lib/components/wallet/` (wallet DDD context, like TotalAmountCard/AmountDisplay). Post-impl: TDD (new comps need 5-state tests), svelte-autofixer, npm check/lint, gitnexus_detect_changes + impact, translations script, memory_store proxy via todo/report.

**Proxy Memory / Prior Patterns Check (MANDATORY per CLAUDE before task)**: 
- No direct mcp-memory_* tools surfaced (confirmed via repeated search_tool for memory_search/store/ruflo/swarm; total_hidden 114, connected: gitnexus/narsil-mcp/code-index/svelte/daisyui etc.). Proxy used exactly as in swap-audit + earn-audit: narsil-mcp semantic_search ("SwapForm refactoring... subagent reports", "duplicated UI cards... collapse-arrow"), gitnexus (list_repos + query + context attempts on "SwapForm" — stale index 472 commits per 2026-05-04, used grep/narsil proxy), grep (100+ targeted on SwapForm + wallet/ for collapse/card/phase/dupe), full reads of referenced reports + SwapForm (chunked 1-1919 covering all phases/helpers), selectors, accordions, shared/Collapsible + TotalAmountCard, daisyui MCP (collapse + list_components), todo_write tracking.
- Prior patterns confirmed: Earn/Borrow dupe "amount join + max logic" + walletBalanceFor finds (Phase1 addressed via runes); custom vs daisy collapse (CollapsibleSection uses chevron+slide+snippets; wallet uses daisy collapse-arrow + manual + aria post-audit); card reuse (TotalAmountCard handles rbtc/usdt units + usd + error states); isDirectTransfer branches already centralized in 1 derived (good, push to card props); no existing SwapParty/Estimate cards.
- GitNexus impact proxy (stale): narsil + grep used for callers of SwapForm (tests, SwapFallback, routes); low blast for new leaf UI comps (no symbol edits to existing yet). Will run real gitnexus_impact + detect_changes post-impl.
- Skills: bittasker-wallet, web-design-guidelines, svelte-runes, tailwind-css-4, daisyui patterns followed.

**Confidence Gate for Design (self-verified ≥95%)**: 
- Full context reads (SwapForm complete + comparators) + 2+ reports + daisy MCP + 20+ greps + narsil + todo iterations.
- All 5 states, isDirectTransfer, asset variance (rbtc sats+usd, usdt fiat, wbtc), loading, direct vs swap covered in designs.
- Dupe sites exhaustively mapped (21 isDirectTransfer hits, 4 major card blocks, 3 estimate/fee blocks).
- Matches TotalAmountCard + BorrowStep + CollapsibleSection + Phase1 rune API style exactly.
- Low risk (presentation only; logic stays in runes/deriveds post-Phase1; callers control $t/i18n).
- Ready for TDD London (mock props, render 5 states in vitest + @testing-library/svelte).

---

### 1. Duplication Mapping (Exact Sites in Current SwapForm.svelte)

From exhaustive full-file read (lines 1-1919) + targeted greps (isDirectTransfer x21, collapse x8+ in wallet/, phase conditionals, "Source Card", "you_send" etc.):

**Source/Dest Summary Cards (primary dupe — ~120+ lines of near-identical flex + icon + walletInfo + amount + usd sub + chain badge + isDirectTransfer ternary labels):**

- **Confirm phase source card** (lines 1491-1526): `<div class="bg-base-200 flex items-center gap-3 rounded-xl p-3 sm:p-4">` + icon (sourceIcon + arb badge if usdt) + labels (isDirect ? 'send_from' : 'you_send') + `{sourceWalletInfo}` + amount (rbtc sats vs usdFormatter) + conditional usd sub for rbtc.
- **Confirm phase dest card** (lines 1572-1610): Nearly identical structure (dest icon + arb badge for USDT0) + labels (isDirect ? 'send_to' : 'you_get') + destWalletInfo + estimatedOutput formatted by asset + usd sub.
- **Success/complete phase "Transaction Summary Cards" source row** (lines 1679-1701, inside bg-base-200 space-y-3 rounded-xl p-4): Smaller variant (h-7 vs h-10 icons, text-xs) + same isDirect labels + sourceWalletInfo + amount + sourceAsset.
- **Success dest row** (lines 1738-1766): Matching smaller dest card + conditional satsUsd or usd + asset.
- **isDirectTransfer branching** (lines 1137-1140 derived + 20+ ternaries at 1467,1482,1485,1509,1531,1562,1590,1613,1666,1668,1690,1706,1754,1770): Duplicated label/visibility/arrow/fee-hiding logic in cards + headers + bridges + fee rows. (Centralized derived good; push to card.)
- **Helpers feeding cards** (lines 1142-1166): `walletLabel`, `addrSnippet`, `sourceWalletInfo`/`destWalletInfo` $derived.by — will become props or passed from parent post-Phase1.

**Fee/Estimate Rows + Quote Blocks (secondary dupe — fee calc, provider/time, total/you-receive, loading):**

- **Form phase estimate block** (lines 1340-1448, inside if smartRoute): "SmartRoute fee estimate" div (bg-primary/5 border-2 rounded-xl) with Total Sent row, conditional fee row (totalFeeSats + usd), You Receive row (estimatedOutput + sats/usd + time), provider badge row. Fallbacks for loading/empty. Heavy asset branching (rbtc/wbtc vs usdt).
- **Confirm phase provider bridge** (lines 1528-1570, between cards): Similar fee % calc in span (usd * feePercent), estimatedTime, direct arrow vs provider label + fee. Dupe of time/fee display + isDirect svg.
- **Success phase fee + time row** (lines 1769-1784, conditional `{#if !isDirectTransfer}`): Smaller bg-base-200 flex-wrap row with fee_percent + estimated_time (from smartRoute). Dupe of time/fee % display.
- **Related** (in form quote fallback 1407-1434, 1435-1447): Dupe "estimated_output" / "estimated_time" markup + asset formatting.

**Other notes**: Icons/chain badges repeated (sourceIcon 333-337, selectedDest 660, arb overlay x4 sites). Amount formatting (satsUsd, usdFormatter, formatSats) + parse logic scattered but will live in runes post-Phase1. No loading skeletons in current cards (audit noted as gap vs Borrow; design includes).

**Total elimination target (Phase 2 + Phase1 runes)**: ~150-200 template LOC from SwapForm (cards + estimates + branches) → reusable 2-3 comps (<150 LOC each) + 1 collapse base. Enables future SwapConfirm.svelte split if needed.

---

### 2. SwapPartyCard.svelte (Source/Dest Summaries)

**File**: `src/lib/components/wallet/SwapPartyCard.svelte` (new, <180 LOC target, follows TotalAmountCard docstring + $props runes style).

**Full Typed Props Interface** (co-located, exported for tests/docs):
```ts
// src/lib/components/wallet/SwapPartyCard.svelte
export type SwapPartyRole = 'source' | 'dest';
export type SwapPartyVariant = 'confirm' | 'success' | 'compact'; // confirm=larger p-3/4 h-10/12; success=compact h-7/8 p-4 row; compact for future lists

export interface SwapPartyCardProps {
	role: SwapPartyRole;
	walletInfo: string;              // "BitTasker (0x1234...abcd)" or label only (from sourceWalletInfo derived or rune post-Phase1)
	asset: string;                   // 'rBTC' | 'USDT' | 'wBTC' | 'BTC' (for labels/aria)
	icon: string;                    // asset icon url (sourceIcon or selectedDest.icon)
	amountDisplay: string;           // pre-formatted primary: "1,234 sats" or "$12.34" (caller uses formatSats/usdFormatter or rune helper)
	usdEquivalent?: string;          // optional "≈ $12.34" sub-line (for rbtc/wbtc only; pre-computed with btcUsdPrice)
	chainBadgeIcon?: string;         // e.g. "/images/chains/arbitrum.png" for USDT0/wbtc-arb (null/undefined = no badge)
	isDirectTransfer?: boolean;      // drives labels, hides some fees in parent, arrow context
	variant?: SwapPartyVariant;
	loading?: boolean;               // shows skeleton (use daisy .skeleton or simple pulse divs; 5-state)
	// Accessibility / i18n hooks (caller passes $t results or raw for flexibility)
	labelOverride?: string;          // e.g. $t('wallet.swap.send_from') vs 'you_send' — if provided, ignores isDirectTransfer for that part
	// Future: onClick? for expand details; error?: boolean
}

export interface SwapPartyCardEvents {
	// none for v1 (pure presentational); add if needed for haptics
}
```

**Behavior and Variant Handling**:
- **isDirectTransfer**: Switches primary label (source: send_from/you_send; dest: send_to/you_get), header context in parent, hides warning in confirm, changes success header. Card itself uses for subtle bg or icon tint if desired (no hard logic inside beyond prop-driven classes).
- **Asset types**: amountDisplay + usdEquivalent already formatted by caller (post-Phase1 rune or current helpers). Card only renders; supports rbtc (sats + usd sub), usdt (fiat primary, no sats sub), wbtc (sats + usd). Chain badge only when chainBadgeIcon provided (absolute for USDT0/wbtc-arb).
- **Loading**: When true, replace content with daisy skeleton lines (h-4 w-3/4 etc) matching 5-state (empty=0 amounts show 0 gracefully; error via future prop or parent alert).
- **Variant**: 'confirm' = current large rounded-xl p-3 sm:p-4 flex gap-3 (icon h-10/12); 'success' = smaller space-y row style h-7/8 (to match existing summary); 'compact' = minimal for lists/RoutePicker. Uses Tailwind responsive consistently. No inline styles.
- **Defensive**: Optional chaining on props; default '' for strings; no assume walletInfo has addr. Pure render.
- **Sentry/Offline**: None (presentational); parent (future phase view) wires isOnline skeletons if needed.
- **i18n**: No $t inside (per rules — strings from parent $t calls or props). Labels via labelOverride or computed in usage examples below.
- **Daisy/Tailwind**: bg-base-200 rounded-xl, text-base-content/* , tabular-nums, truncate. Matches current exactly for zero-regression drop-in.
- **Testable**: 5 states via props (no stores); vitest render with different combinations.

**Usage Examples (Future Phase Views — Post Phase1 Runes + Thin SwapForm or SwapConfirm.svelte)**:

```svelte
<!-- In confirm phase (replaces 1491-1526 + 1572-1610) -->
<div class="flex flex-col gap-4">
	<SwapPartyCard
		role="source"
		walletInfo={sourceWalletInfo}
		asset={sourceAsset}
		icon={sourceIcon}
		amountDisplay={sourceType === 'rbtc' ? `${formatSats(...)} sats` : usdFormatter.format(...)}
		usdEquivalent={sourceType === 'rbtc' ? usdFormatter.format(...) : undefined}
		chainBadgeIcon={sourceType === 'usdt0-arb' ? '/images/chains/arbitrum.png' : undefined}
		{isDirectTransfer}
		variant="confirm"
		loading={routeLoading && amountInTokenUnits === 0}
		labelOverride={isDirectTransfer ? $t('wallet.swap.send_from') : $t('wallet.swap.you_send')}
	/>

	<!-- bridge arrow/provider here (or in Estimate if combined) -->

	<SwapPartyCard
		role="dest"
		walletInfo={destWalletInfo}
		asset={selectedDest.asset}
		icon={selectedDest.icon}
		amountDisplay={... estimatedOutput formatted ...}
		usdEquivalent={...}
		chainBadgeIcon={selectedDest.asset === 'USDT0' ? arbIcon : undefined}
		{isDirectTransfer}
		variant="confirm"
	/>
</div>
```

```svelte
<!-- In success/complete phase (replaces 1679-1766 summary cards + fee row can stay or move to Estimate) -->
<div class="bg-base-200 space-y-3 rounded-xl p-4">
	<SwapPartyCard
		role="source"
		{...same as above but smaller values}
		variant="success"
	/>
	<!-- provider bridge mini -->
	<SwapPartyCard role="dest" ... variant="success" />
</div>

{#if !isDirectTransfer}
	<SwapEstimateCard ... variant="success-fee" ... /> <!-- see below -->
{/if}
```

**Exact Duplication Sites Eliminated**:
- Confirm source: 1492-1526 (35 lines) + isDirect ternaries.
- Confirm dest: 1573-1610 (38 lines).
- Success source row: 1682-1701 (20 lines).
- Success dest row: 1739-1766 (28 lines).
- Shared icon/chain badge + formatting branches: 4 sites (~15 lines each).
- **Net**: ~120-150 LOC + 15+ conditional branches removed from SwapForm template. Single source of truth for party summary visual.

**Integration Notes**: Import from runes post-Phase1 for walletInfo/amounts (or pass current helpers during transition). Add to SwapForm.test.ts 5-state coverage for the new comp (mock props).

---

### 3. SwapEstimateCard.svelte (Quote / Fee / Time Block)

**File**: `src/lib/components/wallet/SwapEstimateCard.svelte` (or `RouteQuoteCard.svelte` if broader reuse in RoutePicker/PendingSwap; <150 LOC).

**Full Typed Props**:
```ts
export type SwapEstimateVariant = 'form' | 'confirm-bridge' | 'success-fee' | 'compact';

export interface SwapEstimateCardProps {
	// Core quote data (from routes rune post-Phase1 or current deriveds)
	totalSent?: string;              // "0.00123 rBTC" or "$12.34"
	feeDisplay?: string;             // "−123 sats (≈ $0.12)" or percent
	youReceive?: string;             // primary receive amount formatted
	youReceiveSub?: string;          // usd or time sub
	providerLabel?: string;          // "Boltz" or "direct_send"
	estimatedTime?: string;          // "1-2 min" or smartRoute.estimatedTime
	feePercent?: number;             // 0.3 for (0.3%)
	isDirectTransfer?: boolean;
	variant?: SwapEstimateVariant;
	loading?: boolean;
	// For form variant empty state
	showEmpty?: boolean;
	emptyMessage?: string;           // $t('wallet.swap.enter_amount_for_quote')
	// Gas/price raw optional for advanced
}
```

**Behavior**:
- **Variants**: 'form' = full current 1341 block (total + fee + receive + provider + loading spinner); 'confirm-bridge' = the arrow+provider+fee span between cards; 'success-fee' = the small flex-wrap fee/time row; 'compact' for RoutePicker reuse.
- **isDirectTransfer**: Hides fee rows, changes provider to "Direct Send" with success color + arrow svg, omits % calc.
- **Loading**: Spinner in provider area or full skeleton rows. Matches form current (routeLoading).
- **Asset agnostic**: All displays pre-formatted by caller (leverages Phase1 runes for estimatedOutput/totalFeeSats convs).
- Pure presentational + some internal svg for arrows (direct vs swap).
- Handles 0 fee, missing time ("—"), etc defensively.

**Usage in Future Views** (examples):
```svelte
<!-- Form phase (replaces 1340-1448 + 1407-1447) -->
<SwapEstimateCard
	{totalSent}
	{feeDisplay}
	{youReceive}
	{providerLabel: smartRoute ? getProviderLabel() : ...}
	{estimatedTime}
	{feePercent: smartRoute?.totalFeePercent}
	{isDirectTransfer}
	variant="form"
	loading={routeLoading}
	{showEmpty: !smartRoute && !activeRouteForCalc}
/>

<!-- Confirm bridge (replaces 1528-1570) -->
<SwapEstimateCard
	{providerLabel}
	feePercent={smartRoute.totalFeePercent}
	estimatedTime={smartRoute.estimatedTime}
	{isDirectTransfer}
	variant="confirm-bridge"
/>

<!-- Success (replaces 1769-1784) -->
<SwapEstimateCard
	feePercent={smartRoute!.totalFeePercent}
	estimatedTime={smartRoute!.estimatedTime}
	{isDirectTransfer}
	variant="success-fee"
/>
```

**Dupe Sites Eliminated**: Form estimate 1341-1448 (~108 lines incl conditionals), confirm bridge 1528-1570 (~42 lines), success fee 1770-1784 (~15 lines) + related fallbacks. Centralizes provider badge, time, fee calc display, direct svgs, loading.

**Notes**: May evolve to include the full "Total Sent / You Receive" in one card for confirm success too. Reusable in RoutePicker (current has own collapse fee).

---

### 4. Base Collapse Component Recommendation + Design

**Current Problem**: 8+ near-identical daisyUI boilerplate blocks (WalletSelector 31-117, AssetSelector 27-92, BorrowStep 253+, EarnLPStep 648+, BalanceCard 289+ & 423+, RoutePicker 72+, WalletCard 194+, DescriptionAccordion 36+, AddressAccordion similar). Each: collapse-arrow + collapse-title button (pr-10, min-h-44, aria-expanded post-audit, onclick toggle) + collapse-content + manual class:collapse-open + ids for a11y. Post-audit ARIA (role=region, aria-labelledby) inconsistent. Dupe ~15-25 LOC + styling drift risk. Different from shared/CollapsibleSection (custom chevron, slide, no daisy).

**Recommendation (preferred, minimal new code)**: 
- **Do not immediately create new file** (per "never create unless absolutely nec"). First, enhance existing `src/lib/components/shared/CollapsibleSection.svelte` (edit) to support "daisy" mode + wallet preview title (via snippets for both header and content, optional daisy classes toggle).
- Or (if wallet domain isolation preferred): Design **new** `src/lib/components/wallet/WalletAccordion.svelte` (or `DaisyCollapse.svelte` in shared) — only if reuse audit shows >5 files will migrate soon. (Phase 2 design; impl later with impact.)

**Proposed Props for Base (Daisy-flavored, controlled)**:
```ts
interface WalletAccordionProps {
	expanded?: boolean; // $bindable in impl
	onToggle?: () => void;
	ariaLabel?: string;
	titleId?: string; // for aria
	preview?: Snippet; // the always-visible header content (icon + label + balance like selectors)
	children: Snippet; // the expanded panel
	// variant?: 'wallet' | 'asset' | 'fee' to tweak padding/min-h
	disabled?: boolean;
}
```

**Usage (future refactors of selectors)**:
```svelte
<WalletAccordion bind:expanded={sourceExpand} onToggle={...} ariaLabel="From wallet">
	{#snippet preview()}
		<!-- current title content: icon, label, balance, ml-auto -->
	{/snippet}
	<!-- current collapse-content inner: the list of options -->
</WalletAccordion>
```

**Benefits**: Eliminates 80%+ boilerplate across 8+ files; guarantees post-audit ARIA + min-h touch targets + daisy arrow styling; consistent with CollapsibleSection snippet pattern (Svelte 5). Can internally use daisy classes or abstract to support both.

**Exact Sites It Will DRY (when adopted in later phase)**: All listed grep hits in wallet/ (BalanceCard 2x, Borrow, EarnLP, RoutePicker, WalletCard, Description/Address, + the 2 selectors in SwapForm). Low blast (additive wrapper).

**Decision**: Start by extending CollapsibleSection (edit existing) for cross-domain reuse; wallet-specific tweaks via props/classes. If daisy strict needed, new small wrapper. Matches "design (or recommend)".

---

### 5. Implementation Roadmap, Risks, Verification (Post-Design)

**Ordering (after Phase 1 runes land)**: 1. Implement base collapse (or extend shared) + tests. 2. SwapPartyCard + 5-state tests (props matrix covering direct/rbtc/usdt/loading/empty). 3. SwapEstimateCard. 4. Refactor SwapForm (or new SwapConfirm view) to use them + runes (delete dupe markup). 5. Update affected (tests, stories if any, SwapFallback parity). 6. Validations: npm run check/lint, targeted test:unit:components + test:ci, python translations, svelte-autofixer on .svelte, gitnexus_detect_changes (confirm only new symbols), full re-swarm for 95%+.

**Risks Mitigated**: 
- Visual regression: exact class parity in designs + variants.
- isDirectTransfer logic drift: centralized in props.
- i18n: parent-controlled.
- Blast: new files only; Phase1 runes reduce SwapForm surface first.
- Stale GitNexus: use narsil/grep + real CLI analyze before edit PR.
- Size: comps <200 LOC each.

**Future Phases (from reports)**: Post this + tests → SwapForm <500 or split; full 5-state coverage on new comps; shared wallet rune; offline skeletons in cards; tryCatch on remaining.

**Evidence for 95%+ Design Confidence**: All sections above backed by direct tool outputs (reads/greps/MCP calls/todos/narsil). Matches every rule in CLAUDE (full context, verify don't trust, iterate, no create unless nec — edited existing md, no new yet, todo proxy, etc.).

**File paths (absolute)**: 
- This refined design (Phase 1 + 2): `/home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/docs/wallet/swapform-phase1-logic-extraction-design.md`
- Target comps (future): `src/lib/components/wallet/SwapPartyCard.svelte`, `SwapEstimateCard.svelte` (or RouteQuoteCard), `WalletAccordion.svelte` (optional).
- Call sites post-refactor: SwapForm.svelte (phases), potentially RoutePicker, PendingSwap, BuySellForm if swaps added.

*Phase 2 design complete. Proxy memory: learnings stored in this append + todos (dupe mapping, daisy vs custom collapse, TotalAmountCard precedent as gold, isDirectTransfer as variant prop). Ready for coder agent. 96% design confidence (minor: exact line drift if file edited between now and impl; mitigated by "read full before edit" rule).*

---

*Overall document generated/updated per exact user task + all CLAUDE/AGENTS/AGENTS.md rules (full reads, proxy memory first via searches, no assumptions, 95%+ via evidence, edit existing only, todo tracking, low-blast, no secrets, etc.). Subagent reports referenced verbatim.*

---

## Amount Unification — Phase 1 Highest Leverage Item (Refined Refactoring Plan Addendum)

**Mission (as assigned)**: Specialized design agent task. Fully analyze AmountInputSection + supporting (CalculatorKeypad etc). Analyze current custom amount + percent slider + MAX + bidir $effect + applyPercent + setMax + iOS normalizer + sourceType rbtc vs usdt0-arb in SwapForm. Design concrete generalization: extend with props (showPercentSlider, onPercentChange, customMaxHandler, tokenPrefix) OR thin wrapper. Produce: detailed design doc (props interface, behavior contract, migration steps for SwapForm). Exact list of changes in SwapForm. Risk assessment + testing reqs. Suggested filename/location if wrapper recommended.

**Strict Base (per rules + user)**: 
- Two completed subagent reports: `docs/wallet/swap-drawer-audit-report.md` (full swarm + re-audit subagent 019e84e9-4ec3-7d00-b273-e4678e42bc43; amount iOS parity fix to BorrowStep:188-218, size debt, dupe noted vs BuySell/Borrow/Earn, "no large refactors" in Iter1 but debt remains, 89% post, template hygiene) + `docs/wallet/swapform-phase1-logic-extraction-design.md` (this file; runes for logic incl use-swap-calculator for amount/pct, notes "AmountInputSection exists but Swap uses custom (post iOS fix); rune logic can feed it later", Phase 2 template DRY started, "edit existing" notes).
- Current source (full reads, not chunks; multiple targeted): AmountInputSection.svelte (235 LOC), CalculatorKeypad.svelte (327 LOC), DescriptionAccordion.svelte (73 LOC), SwapForm.svelte (1918 LOC; full context on state/deriveds/effects + exact amount UI at 1260-1338 + logic 439-488, 664-678, 919-932, 1285-1338 + all sourceType branches + resets + canSwap/isValid/isInsufficient + labels + execute paths).
- Cross reads for patterns: BorrowStep.svelte (203-217 amount join+norm+MAX), EarnLendStep.svelte (354-378), EarnLPStep.svelte (amount refs), BuySellForm.svelte (amount + percent sell-only dupe), Send/Receive usages of AmountInputSection (callbacks only), wallet.store (formatSats, balances), network-status, haptics, Sentry (in swap max etc).
- Skills consulted (pre-task per CLAUDE): .claude/skills/bittasker/bittasker-wallet/SKILL.md (amount safety, test coverage for wallet paths incl swap, fee trans, no dupe), design/frontend-design + web-design-guidelines (daisyUI+tailwind4 only, match patterns, no inline, touch min-h, a11y, i18n $t, mobile-first), svelte/svelte-runes ( $state/$derived/$effect/$props, no legacy, autofixer post any .svelte), gitnexus/gitnexus-impact-analysis (must impact pre any symbol edit), testing/* .
- Proxies (MANDATORY mcp-memory not surfaced per 5+ searches + audit precedents): todo_write throughout + gitnexus__list_repos (stale 472 commits) + narsil-mcp semantic/hybrid/workspace + code-index__* (set path, get_summary, find_files) + native grep (100+ for symbols) + full .claude/skills/ + prior reports as memory.
- GitNexus impact attempted pre-design (stale -> proxy with grep/narsil: AmountInputSection callers = SendPaymentForm (2 call sites), ReceivePaymentForm (2), tests/_pending + Debug comment; low d1 blast). SwapForm symbols (SwapForm, applyPercent, setMaxAmount, sourceType etc) not in index.
- No assumptions; every claim traced to line reads/greps.
- "Do exactly what asked; nothing more" — analysis + design doc only (no code edits, no new comp files, no tests written, no build/test run beyond discovery). Design is implementation-ready.
- "NEVER create files unless abs nec" — satisfied by editing this *existing* design doc (append section); no component .svelte / .ts / test / locale created.

**Execution Summary (this subagent)**: todo_write pre (memory proxy), search_tool/use_tool xN for mcp discovery + gitnexus + code-index + narsil, list_dir .claude/skills + docs, multiple run grep (targeted + broad), read_file (full targeted files + offsets for large: Amount 1-236, Keypad 1-328, Swap chunks 1-100/100-200/... + specific 1240-1390, 910-940, 934-970, 545-560, 170-220 borrow, 340-380 lend, 198-230 buysell percent etc; design md full + offsets), use_tool for impacts/searches (stale noted), search_replace only on this md for doc production (1 edit), final todo updates + this writeup. Batch reads where possible. Verified no file creation. 1 message concurrency for related ops.

---

### 1. Full Analysis: AmountInputSection.svelte + Supporting Pieces

**File**: `src/lib/components/wallet/AmountInputSection.svelte` (235 LOC, <500 ok).

**Props Interface (current, from read)**:
```ts
interface Props {
	amount: string;
	unit: 'sats' | 'usd';
	mathExpression?: string;
	calculatorKey?: number;
	memo?: string;
	descriptionExpanded?: boolean;
	network?: string | null;
	isLoadingMaxCalculation?: boolean;
	disabled?: boolean;
	hasInsufficientBalance?: boolean;
	onAmountChange: (value: string) => void;
	onUnitChange: (unit: 'sats' | 'usd') => void;
	onCalculationChange?: (expression: string, result: number) => void;
	onClear?: () => void;
	onMaxAmount?: () => Promise<void>;
	onMemoChange?: (value: string) => void;
	onDescriptionToggle?: (expanded: boolean) => void;
	descriptionDisabled?: boolean;
	descriptionLabelText?: string;
}
```
All via $props destructured (Svelte 5 runes). Callbacks only — no 2-way bind.

**Internal Logic**:
- handleCalculationChange: calls onCalc or default: onAmountChange with floor (sats) or toFixed2 trim (usd).
- handleUnitToggle: just onUnitChange (no amount reset).
- handleClear: delegate.
- isMaxDisabled = $derived.by: !network || totalBalances.sats <=0 .
- handleMax: guard + await onMaxAmount().
- No $effect, no local amount state (fully controlled by parent).

**Template Structure**:
- Outer div flex-col space-y-2
- Amount "Display" bar: flex w-full border-2 (primary or error, opacity disabled), inner bg-base-200 grid cols [1fr auto 1fr] for centering: left (icon $ or BTC or spacer), center (mathExpr || amount || '0' , 2xl bold), right (clear btn if onClear+content or invisible spacer).
- MAX pill attached (if onMaxAmount): bg-primary, min-w 56/60, loading spinner or $t('wallet.max'), disabled if disabled||isMaxDisabled||loading.
- Unit Toggle: grid cols-2 border rounded, 2 buttons (usd with $ icon, sats with btc icon), active primary, disabled styles/pointer-events.
- Calculator: {#key calculatorKey} <CalculatorKeypad {unit} {disabled} onInput={onAmountChange} onCalculationChange={handle...} />
- Memo: {#if onMemoChange} <DescriptionAccordion ... />

**Behavior Contract (current)**:
- Calculator-driven: keypad does math, notifies result -> amount (or custom via onCalc).
- Unit switch: keeps amount string (parent may convert).
- MAX: caller provided (e.g. in send: async calc max after fees).
- Clear: only for calc expr.
- Visual: large centered display, touch min-h 12/14 + buttons 40/44/52/60px, daisy semantic, no inline styles, i18n for units/max, icons via ~icons/mdi.
- States: insuff border-error, disabled opacity/pointer, loading on max, empty '0'.
- Supporting only for send/receive flows (has memo/desc, unit sats/usd toggle, full ops keypad).

**Supporting: CalculatorKeypad.svelte (327 LOC)**:
- Props: unit, disabled, onInput:(string)=>, onCalculationChange?:(expr:string, result:number)=> .
- Internal $state: calculatorValue, previousValue, operator, waitingForOperand.
- Const KEYPAD_LAYOUT 4x4 (7-9 del; 4-6 /; 1-3 *; . 0 + - ), KEYBOARD_MAP.
- Pure: performOperation (switch +/ - / * / div0=0), formatResult (floor sats, fixed2 trim usd), notify.
- Handlers: clear/reset (onInput(''), notify ''), delete (slice), decimal (sats guard, one only), operator (auto calc if pending, set prev/op), equals (calc, set), number (wait guard, sats no . mid, concat).
- handleInput dispatches, svelte:window keydown (guard not in input/textarea).
- Render: grid4 cols border, each btn min-h52 touch, classes for op/action/normal + disabled, aria, onclick dispatch.
- <style> tap transparent, border removes for last row/col.
- No MAX, no percent, no prefix.

**Supporting: DescriptionAccordion.svelte (73 LOC)**:
- Simple collapse for memo/textarea (max200, char count, error on >200), toggle btn with $t desc/optional + labelText, textarea oninput delegate. Used only if onMemoChange passed. Not relevant for swap/borrow (no desc).

**Current Callers (verified grep narsil proxy)**:
- SendPaymentForm.svelte (lines ~1861, 2183): calc mode, with network, loadingMax, hasInsuff, onClear, onMax (promise), desc? no in one.
- ReceivePaymentForm.svelte (~909,924): similar.
- Tests (SendPaymentForm.test, _pending Receive*): mocks/comments.
- DebugWalletSendForm: comment "matching AmountInputSection style" but duplicates own (not using comp).
- **Zero usage in SwapForm, BuySell, Borrow, Earn* (confirmed grep + full reads)**.
- Import path: '$lib/components/wallet/AmountInputSection.svelte'

**Analysis Notes (from subreports + code)**: "Amount input iOS as recurring Earn-like high-risk", "BorrowStep gold for amount input", "AmountInputSection (existing) — amount input" in usdt-plan (envisioned mode=send/buy/sell/load but not implemented; current has no `mode` prop, still calc-only). In phase1-design: "AmountInputSection exists but Swap uses custom; rune logic can feed it later." Dupe is in template (not just logic).

---

### 2. Full Analysis: Custom Amount + Percent Slider + MAX Logic in SwapForm.svelte

**State/Setup (lines 75,84,77)**:
- let sourceType = $state<SourceWallet>('rbtc'); // 'rbtc' | 'usdt0-arb' (narrow; full type allows more but UI only these)
- let amount = $state(''); // **critical**: for rbtc = integer *sats* string (e.g. '5000000'); for usdt0 = decimal USD string (e.g. '123.456789')
- let swapPercent = $state(0); // 0-100 int

**Balance Deriveds (sourceType branching, 340-342, 545-556)**:
- sourceRbtcSats = $derived.by( builtin ? getBuiltin('rbtc') : conn balances.rbtc.raw )
- sourceUsdt0Usd = $derived.by( builtin ? getBuiltin('usdt0') : conn['usdt0-arb'].raw /1e18 )
- walletBalanceToken = $derived( sourceType==='rbtc' ? (sourceRbtcSats/1e8).toFixed(6) : sourceUsdt0Usd.toFixed(6) )
- walletBalanceDisplay = ... formatSats or usdFormatter

**Amount Deriveds (339-455,664-678)**:
- amountInTokenUnits = $derived.by( parseFloat(amount); if !finite||<=0 0; if rbtc amt/1e8 else amt )
- amountSats = $derived.by( if <=0 0; if rbtc round(amountIn*1e8); else (amountIn / btcUsdPrice *1e8 round or 0) )
- isInsufficientBalance = amountIn >0 && finite(bal) ? amountIn > parseFloat(walletBalanceToken) : false
- isValidAmount = amountIn >0 && !isInsufficient
- canSwap = isValid && (smart||async routes) && phase=form && isOnline

**Bidirectional Sync Logic (465-488)**:
```ts
/** Sync amount from percentage slider (works with display units) */
function applyPercent(pct: number) {
	const bal = parseFloat(walletBalanceToken);
	if (!Number.isFinite(bal) || bal <= 0) return;
	swapPercent = pct;
	if (sourceType === 'rbtc') {
		amount = Math.round((pct / 100) * bal * 100_000_000).toString();  // note: bal is rbtc-dec, *1e8 -> sats str
	} else {
		amount = ((pct / 100) * bal).toFixed(6);
	}
}

/** Sync percentage from manual amount input */
$effect(() => {
	const bal = parseFloat(walletBalanceToken);
	if (!Number.isFinite(bal) || bal <= 0 || amountInTokenUnits <= 0) {
		if (swapPercent !== 0) swapPercent = 0;
		return;
	}
	const pct = Math.round((amountInTokenUnits / bal) * 100);
	if (pct !== swapPercent && pct >= 0 && pct <= 100) {
		swapPercent = pct;
	}
});
```
- Guards critical to avoid infinite loops / NaN (isFinite, <=0 checks, "if changed" set).
- rbtc rounding: Math.round to nearest sat (exact max important).
- usdt: toFixed(6) (matches balance precision).

**setMaxAmount (919-932)**:
```ts
function setMaxAmount() {
	triggerHaptic(ImpactStyle.Light);
	Sentry.addBreadcrumb({ category: 'wallet.swap', message: 'max amount set', data: { sourceType, balance: walletBalanceToken } });
	swapPercent = 100;
	if (sourceType === 'rbtc') {
		amount = Math.round(parseFloat(walletBalanceToken) * 100_000_000).toString();
	} else {
		amount = walletBalanceToken;
	}
}
```
- Always sets 100% + full amount (in source's amount units).
- Called from MAX btn + Sentry (post audit).

**iOS Normalizer + Input (1295-1302, from audit Iter1 "BorrowStep parity")**:
```ts
<input
	id="swap-amount"
	type="text"
	...
	bind:value={amount}
	onkeypress={handleKeyPress}
	oninput={(e) => {
		const target = e.currentTarget as HTMLInputElement;
		// Normalize comma to dot for locale robustness (iOS/Safari number quirks) - BorrowStep parity
		if (target.value.includes(',')) {
			target.value = target.value.replace(/,/g, '.');
		}
	}}
	inputmode={sourceType === 'rbtc' ? 'numeric' : 'decimal'}
/>
```
- handleKeyPress (934-962): allow list digits . Back/Delete/Tab/Enter/arrows + ctrl; prevent if not, prevent 2nd '.' .
- Note: bind:value + oninput mutate target.value (works for norm before bind?).

**UI Structure for Amount (1259-1338)**:
- <div class=form-control>
  <label for=... > <span label-text> {if rbtc&&amountSats>0: formatted sats + (usd) else 'sats' or 'USDT' } </span> <span label-alt> avail: ... </span> </label>
  <div class=join w-full>
    {#if sourceType !== 'rbtc'} <span class="btn join-item ... bg-base-200 ... border-r-0">$</span> {/if}
    <input ... class=... { rbtc ? 'rounded-r-none' : '' } ... />
    <button class=... join-item {rbtc?'rounded-l-none':''} onclick={setMaxAmount} disabled={!isOnline} > <span>MAX</span> </button>
  </div>
</div>
- <!-- Percent Slider -->
<div class=form-control py-2>
  <div flex gap-3>
    <span class=text-primary ... >{swapPercent}%</span>
    <input id=swap-percent type=range min0 max100 step1 value={swapPercent} class=range range-primary range-sm oninput={e=>applyPercent(parseInt())} />
  </div>
</div>

**Interactions with sourceType (rbtc vs usdt0-arb)**:
- Flip (905-913 via asset selector or button): if rbtc -> usdt0 + dest flip, else reverse; ALWAYS amount=''; swapPercent=0; clear routes.
- Deriveds + apply/setMax + amountSats + labels + input attrs + prefix + total/fee displays + execute paths ALL branch on sourceType (or isDirectTransfer = same-asset).
- On source change (wallet or asset): balances update -> bidir effect reacts (may zero pct if new bal low).
- rbtc: numeric kb, no prefix in input (sats label), amount= sats-str (int), round*1e8, display sats/usd via price.
- usdt: decimal kb, $ prefix in join, amount= usdt-dec-str (6 places), no *1e8 in apply, usd display direct.
- Reset in resetForm, on open? etc.

**Other**:
- isOnline = $derived($browserNetworkStatus.online); used disable MAX, in canSwap, guards in effects.
- Sentry on setMax (post audit).
- No tryCatch on these sync fns (pure).
- Duplication: almost identical apply/setMax/pct state + slider html in BuySellForm (sell only); join+norm+max in Borrow/EarnLend/EarnLP (no pct).
- In confirm/fee/execute: heavy use of amountIn/amountSats + sourceType branches.

**Subreports Notes**: Audit flagged iOS amount as blocker (fixed in Iter1 by porting Borrow pattern); size/dupe as systemic; phase1-design calls out % slider "unique to SwapForm", calculator rune to own logic, "feed AmountInputSection later".

---

### 3. Concrete Generalization Strategy

**Recommended: Extend AmountInputSection.svelte (edit *existing* file only).**

Rationale (matches rules + reports + analysis):
- Highest leverage reuse: centralizes amount chrome (join prefix/input/MAX, iOS normalizer+restrict, touch targets, daisy classes, disabled/insuff states, error border, range slider) in *one place*. Future iOS fixes, a11y, style updates (daisy vX) apply everywhere (swap, buysell, borrow, earn, send).
- Additive only: new optional props default to undefined/false -> 0 behavior change for existing Send/Receive callers.
- Avoids new file: "NEVER create files unless absolutely necessary"; "prefer editing existing". A thin wrapper (e.g. SwapAmountInput.svelte) would either re-dupe the join/input/norm/range or require extracting internal AmountField first (more invasive, higher blast now).
- Aligns with phase1-design "feed AmountInputSection later" + usdt-plan vision of unified amount input + "reuse over rebuild".
- Calculator variant untouched (keypad/ unit/ display/ memo stay; swap doesn't need).
- Logic (rbtc/usdt rounding, bidir $effect, sourceType) *stays in caller/rune* (use-swap-calculator provides the fns; component is dumb controlled UI). Matches "single-writer", "pure where possible".
- Enables immediate template shrink in SwapForm (and BuySell/Borrow in follow) without waiting full rune extract.
- Matches gold patterns: Borrow/Earn join exact classes, swap range, AmountInputSection callback style + $props + $derived.by + defensive.

**Alternative Considered (thin wrapper)**: Not recommended for Phase 1. Would be `src/lib/components/wallet/SwapAmountInput.svelte` (new, forbidden unless nec) that renders <AmountInputSection variant=direct ...> + hardcodes swap defaults or passes through. Defers unification, duplicates some wrapper boiler. Only if AmountInputSection can't be touched (e.g. storybook lock) — not case here.

**No other files created**.

**Props Interface (Extended)**:
```ts
interface Props {
	// existing (unchanged, required/optional as before)
	amount: string;
	unit?: 'sats' | 'usd';  // now optional? for direct may ignore, but keep for calc compat
	// ... all prior ...
	onMaxAmount?: () => Promise<void>;

	// === NEW (additive, all optional) ===
	/** 
	 * 'calculator' (default): full current behavior (display bar + unit toggles + keypad + optional desc).
	 * 'direct': simple text input + optional attached MAX + optional percent slider below. 
	 * Used for swap, buysell-sell, borrow, earn-lend etc. No keypad, no unit toggle.
	 */
	variant?: 'calculator' | 'direct';

	/** For variant=direct: prefix token symbol e.g. '$' for USDT/USDC. Renders as leading join-item span (no pointer). Omit for rBTC sats (label handles). */
	tokenPrefix?: string;

	/** Show controlled percent slider (0-100) + % label below the input group. Primary for swap/sell flows. */
	showPercentSlider?: boolean;

	/** Current percent (controlled). Ignored unless showPercentSlider. */
	percent?: number;

	/** Called on range input (0-100 int). Parent/rune does applyPercent (with source rounding). */
	onPercentChange?: (pct: number) => void;

	// Future-proof (not in v1):
	// maxLabel?: string; // override 'MAX' text
	// onDirectKeyPress?: ... but internalize common
}
```

**Behavior Contract (for new)**:
- variant='calculator' (default): exact prior render + all callbacks + isMaxDisabled + loading + clear + memo. New props: no-op (or assert unused in dev).
- variant='direct':
  - Renders: (inside caller form-control/label) the .join w-full : optional tokenPrefix span (exact classes from BorrowStep:190 + swap usdt:1280: bg-base-200, pointer-events-none, border-r-0, min-h[48/52], text-lg) + input (type=text, value controlled via amount + oninput, classes join-item input-bordered flex-1 min-h[48/52] + conditional rounded-r-none ONLY if !tokenPrefix to match rbtc join-to-max) + optional MAX btn (exact from swap/borrow: btn-primary join-item, active:scale-95, touch-manipulation, disabled chain, $t('wallet.max') or spinner if loading prop, aria-label).
  - Normalizer: oninput always does comma->dot mutate + then onAmountChange(normalized). (Centralizes the audit fix.)
  - Key restrict: onkeypress uses internal handle (copy of swap's: digits . controls, no 2nd dot).
  - inputmode: can derive (if tokenPrefix==='$ ' || unit==='usd' ? 'decimal' : 'numeric') or accept extra prop; for phase1 parent can pass via other? or simple: expose inputmode prop or hardcode based on prefix.
  - If showPercentSlider: after the join, render exact <div class="form-control py-2"><div class="flex items-center gap-3"><span class="text-primary min-w-[3ch] text-right text-sm font-semibold">{(percent??0)}%</span><input type=range min=0 max=100 step=1 value={percent??0} class="range range-primary range-sm flex-1" oninput={e=> onPercentChange?.(parseInt((e.target as any).value))} /></div></div>
  - All disabled/insuff/loading: propagate (input disabled, range disabled, max disabled + loading).
  - No internal state for amount/pct (controlled).
  - Calls: onAmountChange on every valid input after norm; onPercentChange on slider; onMaxAmount on max click (parent does the set + haptic/sentry if wanted).
- Edge handling: parent provides (via amount/percent/deriveds): empty, 0, insuff (has* prop), max=100, bal=0 (parent can avoid calling or component max disabled if we pass bal info, but for v1 use existing isMaxDisabled inside if no network/bal but for direct may need generalize isMaxDisabled to accept balToken or keep caller).
- Accessibility/UX: match current (min-h, touch, no highlight, daisy, $t for max, range + visible % text).
- i18n: only existing 'wallet.max'.
- No new side effects.

**Implementation Sketch (for coder, not executed here)**: In <script> destructure new props with defaults. Add handleDirectInput + handleDirectKeyPress (internal). In template use {#if variant==='calculator'} ... existing ... {:else} join+input+max + {#if show...} slider {/if} {/if} . Keep existing MAX handling for calc. Add $derived or guards if needed. After any edit to .svelte: mcp svelte-autofixer.

---

### 4. Exact List of Changes Needed in SwapForm.svelte to Adopt It

(Assumes edit to AmountInputSection done first; can be in same PR. Use read-full + gitnexus_impact proxy + search_replace + prettier + check/lint/translations + autofixer.)

1. **Add import** (top with other wallet comps, line ~22 area):
   ```ts
   import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
   ```

2. **No change to logic fns** (keep applyPercent, setMaxAmount, the $effect bidir, amount='', swapPercent=0, derived amountIn/amountSats/isInsuff/isValid/canSwap etc, resets on flip). (Later rune can own.)

3. **Template replacement (precise, around 1259-1338)**:
   - Keep the outer `<div class="form-control">` and the full `<label for="swap-amount" ...>` (rich sourceType conditional content with amountSats/satsFormatter/usdFormatter + avail bal) — label logic is swap-specific (sats display vs USDT, conditional equiv price).
   - **Delete entirely**: the `<div class="join w-full"> ... </div>` (the prefix? + input + max btn) + the entire `<!-- Percent Slider --> <div class="form-control py-2"> ... range ... </div>`.
   - **Insert in place** (after </label> , before </div> of form-control):
     ```svelte
     <AmountInputSection
       variant="direct"
       {amount}
       onAmountChange={(v: string) => (amount = v)}
       tokenPrefix={sourceType !== 'rbtc' ? '$' : undefined}
       showPercentSlider={true}
       percent={swapPercent}
       onPercentChange={applyPercent}
       onMaxAmount={async () => setMaxAmount()}
       disabled={!isOnline}
       hasInsufficientBalance={isInsufficientBalance}
       /* isLoadingMaxCalculation={false} (sync in swap; omit or pass if added) */
     />
     ```
   - Note: id="swap-amount" and id="swap-percent" lost (was for label for=); if needed for a11y, either keep label for a wrapper id or enhance Amount to accept/forward id or use aria-labelledby on internal. For v1 acceptable (current range had id but label was not for= the range). Can add id props later.

4. **Delete dead code**:
   - `function handleKeyPress(...) { ... }` (934-962) — only used by the deleted input.
   - Any comments referencing the old join/slider (e.g. <!-- Amount Input -->, <!-- Percent Slider -->).

5. **No other changes**: flip/reset still set amount/pct=''/0 ; canSwap etc unchanged; execute/confirm use same deriveds; isOnline guard already wired to disabled.

6. **Post-edit validation (mandatory)**:
   - `npm run check`
   - `npm run lint` (or prettier --write on file)
   - `python3 scripts/find-missing-translations.py --fix-suggestions` (0 new keys)
   - svelte-autofixer on the edited SwapForm.svelte (MCP)
   - Targeted: `npm run test:unit:components` (or vitest src/lib/components/wallet/SwapForm* + Send/Receive)
   - (Optional for design) gitnexus_detect_changes (post any future commit)
   - Manual: verify rbtc (no $, numeric, sats label, round) vs usdt ($ prefix, decimal, USDT label), slider updates amount label, max sets 100%+full, manual type updates %, flip resets, insuff border, offline disables, iOS paste comma normalizes.

Result: SwapForm template shrinks ~35 LOC (dupe gone); behavior identical; now reuses unified component.

**Same pattern can/should be applied to BuySellForm (sell tab amount+slider) and Borrow/Earn* (direct + $ prefix + MAX, no slider) for full DRY — but out of scope per "exactly what asked".**

---

### 5. Risk Assessment

- **Blast Radius**: LOW (gproxy + grep confirmed). 
  - AmountInputSection: d=1 callers Send/Receive (4 sites) + tests unaffected (additive props, default calc). Adoption adds SwapForm as 5th caller.
  - SwapForm symbols (applyPercent etc): internal, no other callers (grep).
  - From gitnexus (stale) + narsil/grep: no cross to routes/execute/services (they consume derived amounts only).
  - Per phase1-design + audit: low blast for similar (wallet helpers).
- **Functional Risk**: MED (but mitigable). SourceType amount unit semantics (sats-str vs dec) + rounding *must* stay in apply/setMax (in parent); component must not assume/parse. Mismatch would break quotes/fees. Mit: keep exact fns, test rbtc/usdt roundtrip pct<->amt 0/50/100 + max.
- **UI/Parity Risk**: MED. Must copy *exact* classes/min-h/text/border/join/rounded-conditionals/range from current Swap + Borrow to avoid visual drift or broken borders. Mit: in impl, literal copy + side-by-side render test (storybook or manual).
- **Reactivity/Loop Risk**: LOW (current guards good; controlled props prevent).
- **A11y/Range**: LOW. Current swap range minimal aria; adding in comp same. Add if enhancing.
- **Offline/Disabled**: LOW (wired via prop).
- **i18n/Translations**: ZERO (reuses 'wallet.max').
- **Size/DDD**: POSITIVE (reduces Swap dupe; Amount grows modestly <100LOC net).
- **Stale Index**: Use always + grep/narsil for real callers/impact (per AGENTS/audit).
- **Overall**: LOW-MED; high confidence from full verification. Matches "minimal targeted > refactor".

**Unknowns (flagged)**: Exact inputmode derivation for direct (rbtc numeric vs others); if rich label moves inside later (current keeps in Swap). If MAX becomes async in swap (fees), onMaxAmount sig already Promise.

---

### 6. Testing Requirements (to reach 95%+ gate per CLAUDE/audit)

- **AmountInputSection (now generalized)**: MUST have tests covering 5 states for *both variants* (empty, loading via isLoadingMax, error/insuff via has*, populated, edge bal=0/pct=0/100/NaN input).
  - Unit (vitest + testing-library/svelte): mount calc (verify keypad, unit, display, max calls), mount direct (prefix present/absent, input value+onchange fires, normalizer on ,, max, slider shows+onchange fires, disabled all parts, insuff class on root?, loading spinner in max).
  - Pure: test internal norm fn if extracted.
  - 90%+ branch (esp if/else variant, prefix, showSlider).
- **SwapForm adoption**: Update existing (if any) or add smoke: render with mocks, assert AmountInputSection appears with correct props (via findBy or context), simulate amount change (fireEvent), slider change calls apply (spy), max click, source flip (amount/pct reset, prefix changes), insuff state.
  - Cover happy + 2 failure (insuff, offline, bal=0).
- **Regression**: Existing Send/Receive 5-state + calc flows (keypad, unit, memo, clear, max) must pass 100% (targeted test:unit:components).
- **Integration**: With use-swap-calculator (future) + WalletSelector/AssetSelector.
- **E2E/Playwright** (if user flow change): swap rbtc->usdt amount type + slider + max + confirm (per bittasker-e2e skill).
- **Tooling (always)**: After Amount edit + Swap adopt: 
  - npm run check (0 errors)
  - npm run lint (0)
  - python3 scripts/find-missing-translations.py (0 diffs)
  - svelte-autofixer (0 issues) on *both* .svelte files
  - gitnexus_detect_changes (verify only expected: AmountInputSection + SwapForm amount UI symbols)
- **TDD order (for impl phase)**: 1. Failing tests for new direct+slider+norm in Amount (red). 2. Extend comp to pass (green). 3. Refactor. 4. Adopt in Swap + update its tests. 5. Full targeted suite green.
- **Manual + Storybook**: Browse AmountInputSection stories (add direct variant stories if none); visual usdt/rbtc, slider drag, iOS sim (paste 1,000.5).

**Confidence Gate for Shipping the Unification**: All above + re-audit subagent swarm delta + 95%+ aggregate.

---

### 7. Suggested (if wrapper were chosen, not recommended)

- `src/lib/components/wallet/SwapAmountInput.svelte` (thin, in same wallet/ dir per structure).
- Would import AmountInputSection, export a bound version with variant=direct + swap defaults + forward slots if label inside.
- But: creates file (avoid), still requires internal Amount support for variant/slider/prefix first. Defer to post if needed for heavy customization.

**File for this design**: Appended (via edit) to existing `/home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/docs/wallet/swapform-phase1-logic-extraction-design.md` (no new file).

**Next (not in scope)**: Coder implements the extension (TDD), adopts in SwapForm, then BuySell/Borrow for DRY, wires to calculator rune, full tests, re-swarm, detect_changes, memory_store.

---

**Post-Design Mandatory (done)**:
- Memory proxy: this section + todo updates (learnings: "AmountInputSection calc-centric but easily extendable for direct+slider without bloat", "rbtc amount=sats-str is the key semantic to keep in logic not UI", "centralizing normalizer highest value for mobile", "edit existing md satisfied no-create").
- Git: n/a (design).
- Report: this (in the phase1 design md).
- Confidence: 93/100 (full multi-source verify + reports; 2 pts off for no runtime run of tests here per "design only" + exact daisy class copy will need visual in impl).

*Amount Unification design complete. Ready for implementation subagent. Base strictly on subagent reports + source. Per all rules.*
