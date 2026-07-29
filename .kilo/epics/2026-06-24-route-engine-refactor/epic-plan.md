# Route Engine Refactor — Epic Plan

## Goal
Replace 4 hardcoded routing files (~4139 lines) with a generic API-driven route engine (~670 lines) + token registry (~120 lines). Adding a new swap pair should require zero code changes.

## Current State (files to replace)
- `src/lib/services/route-resolver.ts` (1530 lines) — if/else per source→dest pair
- `src/lib/services/SmartRouter.ts` (901 lines) — per-pair builder methods
- `src/lib/services/route-resolver-async.ts` (872 lines) — async provider callers with manual switch
- `src/lib/runes/use-swap-routes.svelte.ts` (836 lines) — hardcoded executable routes per pair

## Architecture

### Token Registry (`src/lib/services/route-engine/token-registry.ts`)
- Maps token keys → { address, chain, decimals, symbol, native }
- Maps source wallets → available tokens
- Maps destinations → target tokens
- Pure data, no logic

### Provider Interface (`src/lib/services/route-engine/types.ts`)
```typescript
interface SwapProvider {
  name: string;
  supports(from: Token, to: Token): boolean;
  getQuote(from: Token, to: Token, amountSats: number, signal?: AbortSignal): Promise<Route | null>;
}
```

### Route Engine (`src/lib/services/route-engine/engine.ts`)
- `resolveRoutes(source, dest, amount)` — queries all providers in parallel via `Promise.allSettled`
- `shouldCheckBoltzOptimization(from, to)` — checks if Boltz 2-hop saves money
- `queryBoltzTwoHop(from, to)` — composes Boltz intermediary route
- Ranks by output amount, marks cheapest as recommended

### Providers (`src/lib/services/route-engine/providers/`)
- `symbiosis.provider.ts` — wraps existing `symbiosisService`
- `lifi.provider.ts` — wraps existing `lifiService`
- `changelly.provider.ts` — wraps existing `changellyService`
- `boltz.provider.ts` — wraps existing `BoltzProvider`

### Integration
- `use-swap-routes.svelte.ts` calls `routeEngine.resolveRoutes()` instead of hardcoded routes
- `SendPaymentForm.svelte` uses engine for route resolution
- `ReceivePaymentForm.svelte` uses engine for route resolution
- `swap-chain.service.ts` `executeHop()` stays as-is (already generic)

## Existing Services (DO NOT REWRITE — wrap them)
- `src/lib/services/symbiosis.service.ts` — `symbiosisService.getQuote()`
- `src/lib/services/lifi.service.ts` — `lifiService.getQuote()`
- `src/lib/services/changelly.service.ts` — `changellyService.estimateSwap()`, `getCurrencies()`
- `src/lib/services/BoltzProvider.ts` — `boltzProvider.getQuote()`

## Existing Types (reuse, don't recreate)
- `Route`, `RouteHop` from `route-resolver.ts`
- `SourceWallet`, `Destination` from `route-resolver.ts`
- `SmartRoute` from `SmartRouter.ts`

## Existing Tests (must still pass)
- `src/lib/tests/unit/services/route-resolver.test.ts` (507 lines)
- `src/lib/tests/unit/services/route-resolver-async.test.ts`

## Chain Constants
- RSK: 30 (mainnet), 31 (testnet), 33 (regtest)
- BSC: 56, 97
- Arbitrum: 42161, 421614
- Ethereum: 1, 11155111
- Polygon: 137, 80002
- Optimism: 10, 11155420
- Base: 8453, 84532
- Avalanche: 43114, 43113
- TRON: pseudo chain ID 0

## Token Addresses (from codebase)
- USDT0 Arb: 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9 (6 dec)
- USDT0 RSK: 0x779Ded0c9e1022225f8E0630b35a9b54bE713736 (6 dec)
- WBTC Arb: 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f (8 dec)
- tBTC Arb: 0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40 (18 dec)
- USDT BSC: 0x55d398326e56742D3996a506f824b80Fb4f6e961 (18 dec)
- DOC RSK: 0xe700691d713e8b95c02b126164164732f777734f (18 dec)

## Boltz 2-Hop Optimization Pairs
- RSK → Arbitrum (via tBTC): cheaper than direct bridge
- Arbitrum → RSK (via tBTC): cheaper than direct bridge
- RSK → BTC on-chain (direct Boltz)
- BTC on-chain → RSK (direct Boltz)

## Requirements
1. New files in `src/lib/services/route-engine/` directory
2. 80%+ test coverage on engine + providers
3. Existing route-resolver.ts tests must still pass (backward compat during migration)
4. `npm run check` and `npm run lint` must pass
5. No breaking changes to SwapForm, SendPaymentForm, ReceivePaymentForm
6. Provider failures must not block other providers (Promise.allSettled)
7. AbortSignal support for debounced queries
