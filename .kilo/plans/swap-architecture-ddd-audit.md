# Swap Flow Architecture & DDD Audit

**Audit Date:** 2026-06-30
**Scope:** Full swap screen and flow — UI components, runes, services, utilities, tests
**Files Audited:** 28 files across 5 layers

## Overall Confidence: 72/100

The swap flow shows a system that has evolved organically through multiple refactoring phases. The Phase 1 rune extraction (calculator, routes, wallets) demonstrates strong architectural intent, but the execution is incomplete — SwapForm.svelte remains a 2102-line monolith that violates nearly every project rule. The route engine provider pattern is well-designed, but it coexists with legacy systems that are not fully decommissioned.

---

## Dimension Scores

| Dimension | Score | Notes |
|---|---|---|
| DDD Boundaries | 55/100 | Services separated by concern, but SwapForm is a god component |
| Separation of Concerns | 60/100 | Rune extraction sound; SwapForm still owns business logic |
| Dependency Direction | 70/100 | Correct direction; dual route systems coexist |
| Interface Design | 75/100 | Well-typed rune interfaces; cross-layer type deps |
| State Management | 65/100 | Single-writer in runes; three parallel state systems |
| Error Propagation | 72/100 | tryCatch + Sentry consistent; sanitization in component |
| Testability | 78/100 | Pure functions well-tested; SwapForm has no component tests |
| Extensibility | 68/100 | Provider pattern is clean; new assets need 5-6 file changes |

---

## Critical Issues (must fix)

### 1. SwapForm.svelte: 2102 lines — GOD COMPONENT
**File:** `src/lib/components/wallet/SwapForm.svelte`
**Lines:** 1-2102 (entire file)

Exceeds 500-line limit by 4x. Owns: gas price fetching (L504-548), error sanitization (L1282-1313), destination address resolution (L1083-1098), Arbitrum ETH balance checking (L1016-1052), source/dest option matrix (L292-461), wallet balance computation (L619-667), BTC/USD input mode sync (L224-251), swap execution orchestration (L1100-1268), and swap direction logic (L891-956).

**Suggested fix:** Extract remaining business logic into runes/services:
- Gas price fetching → `use-swap-fees.svelte.ts` rune
- Error sanitization → `swap-errors.ts` utility
- Dest options matrix → `swap-destinations.ts` data module
- Swap execution → delegate to existing `swap-chain` orchestrator

### 2. Dual Route Resolution Systems — 2412 lines of legacy
**Files:** `route-resolver.ts` (1540 lines) + `route-resolver-async.ts` (872 lines)

These coexist with `route-engine/` which provides the same functionality. The `route-resolver.ts` types are re-exported by `route-engine/types.ts`, creating cross-layer dependencies. SwapForm imports types from `route-resolver` while the rune imports from `route-engine`.

**Suggested fix:** Deprecate `route-resolver.ts` and `route-resolver-async.ts`. Migrate all consumers to `route-engine/`. Move canonical types to `route-engine/types.ts`.

### 3. boltz.ts: 1212 lines — exceeds limit
**File:** `src/lib/services/swap-chain/boltz.ts`
**Lines:** 1-1212

Contains swap execution, polling, claim functions, lockup scanning, and data persistence orchestration. `pollBoltzChainSwapCompletion` alone is 236 lines.

**Suggested fix:** Split into `boltz-executor.ts`, `boltz-poller.ts`, `boltz-claimer.ts`.

---

## High Issues (should fix)

### 1. $effect misuse for bidirectional sync
**File:** `SwapForm.svelte:230-251`

The Svelte 5 docs state `$effect` is an escape hatch and should NOT derive one value from another. This effect syncs `displayInputAmount` from `swapCalc.amount`.

**Fix:** Make `displayInputAmount` a `$derived` value.

### 2. Direct RPC calls in component
**File:** `SwapForm.svelte:504-548`

`fetchGasPrice()` makes raw `eth_gasPrice` JSON-RPC calls. This is service-layer logic.

**Fix:** Extract to `use-swap-fees.svelte.ts` rune or `gas-price.service.ts`.

### 3. Destination options hardcoded in component
**File:** `SwapForm.svelte:49-56, 292-461`

170 lines of option building with chain constants, self-send guards, and availability checks.

**Fix:** Extract to `src/lib/data/swap-destinations.ts`.

### 4. Two parallel swap lifecycle systems
**Files:** `swap.store.ts` vs SwapForm state

`swap.store.ts` manages Changelly swaps (idle→estimating→confirming→creating→polling→completed). SwapForm manages its own phase (form→confirm→executing→complete→failed). Neither references the other.

**Fix:** Clarify which lifecycle is canonical. If Changelly is deprecated, delete `swap.store.ts`.

### 5. Manual store subscriptions in rune
**File:** `use-swap-wallets.svelte.ts:148-183`

Subscribes to stores via manual `.subscribe()` inside `$effect` — a Svelte 4 pattern. Comment explains this is for "reliable reactivity" due to Svelte 5 proxy issues.

**Status:** Acceptable workaround; document with tracking issue.

### 6. SourceWallet type too wide
**File:** `route-resolver.ts:12-20`

Includes `'usdt-bsc'`, `'usdt0-rsk'`, `'doc-rsk'` which are not used in the main swap flow. Forces every switch statement to handle unreachable cases.

**Fix:** Narrow per bounded context or use discriminated unions.

---

## Medium Issues

1. **`SwapForm.svelte:245-251`** — `$effect` sets `btcUsdInputMode = true` when source is NOT BTC-denominated (line 248). Should likely be `false` or unchanged.

2. **`boltz.ts:86-138`** — `console.warn` for debug logging in production code instead of `d.log`.

3. **`connected-wallet-reverse-swap.ts:111`** — Doubled URL path: `BOLTZ_BASE_URL` is `https://api.boltz.exchange/v2`, then `/v2/swap/reverse` is appended, resulting in `.../v2/v2/swap/reverse`.

4. **`fiat-swap-orchestrator.service.ts:505-582`** — Placeholder addresses (`0x0000...`) and hardcoded amounts in production code.

5. **`SwapForm.svelte:120-121`** — Local `smartRoute` state parallel to `swapRoutes.engineResult` — acknowledged migration artifact.

6. **`use-swap-routes.svelte.ts:565-574`** — Backward-compat shims add dead surface area.

7. **`route-resolver-async.ts:415-419`** — Fragile amount conversion with special-case for WBTC decimals.

8. **`SwapForm.svelte:1100-1268`** — `executeSwap()` is 168 lines with deep nesting and inline route conversion.

---

## Positive Findings

- **Rune extraction pattern is well-designed.** Three runes use getter-based DI, co-located typed interfaces, and factory functions — exactly the project's Svelte 5 guidelines.

- **Route engine provider pattern is extensible.** `SwapProvider` interface with `supports()` + `getQuote()` makes adding new providers straightforward. `buildBoltzTwoHopRoute` cleanly composes multi-hop routes.

- **Defensive patterns are consistently applied.** `isFiniteNum` guards, `tryCatch` wrappers, `AbortSignal` support, and network-awareness checks throughout.

- **Test coverage for pure functions is strong.** `route-resolver.test.ts` (507 lines), `boltz-two-hop.test.ts` (607 lines), `swap-preimage.test.ts` (48 lines), `swapTransaction.test.ts` (324 lines). Mock-first DI correctly applied.

- **Swap chain decomposition is modular.** `swap-chain/` splits orchestrator, state, persistence, executors, boltz, recovery with clean barrel re-exports.

- **Nostr persistence is zero-knowledge.** NIP-44 encryption to user's own pubkey. Three-tier persistence (in-memory → Preferences → Nostr).

- **Sentry integration is thorough.** Breadcrumbs at key decision points with structured data for Capacitor app debugging.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      UI LAYER                                │
│  SwapForm.svelte (2102 lines — GOD COMPONENT)               │
│  ├── SwapPartySelector, SwapEstimateCard, SwapPartyCard     │
│  ├── SwapFallback, AmountInputSection, PendingSwaps          │
│  └── ALSO: gas fetching, error sanitization, dest resolution │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     RUNE LAYER                               │
│  use-swap-calculator (310 LOC) — amount/percent/derived      │
│  use-swap-routes (613 LOC) — route orchestration             │
│  use-swap-wallets (507 LOC) — wallet lookup/balances         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   SERVICE LAYER                              │
│  route-engine/ (NEW) — providers, 2-hop, ranking             │
│  route-resolver.ts (LEGACY — 1540 LOC, still used)           │
│  route-resolver-async.ts (LEGACY — 872 LOC)                  │
│  swap-chain/ — orchestrator, boltz, executors, persistence   │
│  connected-wallet-reverse-swap.ts — LN→RBTC                  │
│  fiat-swap-orchestrator.service.ts — fiat on-ramp            │
│  swap.store.ts — Changelly state (LEGACY?)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   UTILITY/DATA LAYER                         │
│  swapAdapter.ts (Nostr storage), swap-preimage.ts            │
│  swapTransaction.ts, swapStatusMap.ts                        │
│  walletStore, connectedWalletsStore, btcPrice rune           │
│  Capacitor Preferences, Nostr relays                         │
└─────────────────────────────────────────────────────────────┘
```

**Legacy Parallel System:**
```
SwapForm → route-resolver.ts + route-resolver-async.ts → LI.FI/Symbiosis (direct)
         ↕ coexists with
SwapForm → use-swap-routes rune → route-engine/ → providers/ → LI.FI/Symbiosis (wrapped)
```

---

## Recommended Remediation Priority

1. **Phase A — SwapForm decomposition** (highest impact)
   - Extract gas fetching → rune
   - Extract error sanitization → utility
   - Extract dest options → data module
   - Extract executeSwap → service wrapper
   - Target: < 800 lines

2. **Phase B — Route system consolidation**
   - Deprecate route-resolver.ts + route-resolver-async.ts
   - Move types to route-engine/types.ts
   - Update all imports

3. **Phase C — boltz.ts decomposition**
   - Split into executor, poller, claimer

4. **Phase D — State system cleanup**
   - Clarify swap.store.ts status (delete if deprecated)
   - Remove backward-compat shims in use-swap-routes
