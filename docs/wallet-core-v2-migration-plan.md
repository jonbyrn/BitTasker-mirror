# RGB & Arbitrum Code Migration: BitTasker-V2 → wallet-core-v2

## Background

BitTasker-V2's `swap-chain/` directory contains a RGB integration and Arbitrum gasless relay that significantly overlaps with wallet-core-v2's `swaps/rgb/` and `chains/arbitrum/` modules. This plan documents the incremental migration of shared functionality to wallet-core-v2, reducing duplication and creating a single source of truth.

## Current State

| Capability | wallet-core-v2 | BitTasker-V2 | Duplication |
|---|---|---|---|
| RGB REST API client | `RGBClient.ts` (full) | `RGBProvider.ts` (subset) | HIGH |
| EtherSwap lock/claim/refund | `EvmContractService.ts` | `abi.ts` + `claims.ts` + `setup.ts` | HIGH |
| ERC20Swap lock/claim/refund | ❌ Not implemented | `abi.ts` + `claims.ts` | — |
| RGB types | `types.ts` (full) | Inline `any` types | HIGH |
| Token address registry | `tokens/registry.ts` | `utils.ts` (scattered constants) | HIGH |
| Network config | `utils/networkConfig.ts` | `utils.ts` | HIGH |
| Lockup event parsing | `EvmContractService.ts:getLockupEventParameters()` | `polling.ts:waitForRGBLockup()` | HIGH |
| Swap renegotiation | `ChainSwapService.ts` | ❌ Not implemented | — |
| Refund services | `ChainSwapRefundService`, `SubmarineSwapRefundService` | Manual encoding only | MEDIUM |
| EIP-1191/55 address utils | `utils/rgbAddress.ts` | `claims.ts:toEip55()` | MEDIUM |
| RGB WebSocket monitoring | `RGBWebSocket` | REST polling only | LOW |
| ERC-4337 / EIP-7702 gasless relay | ❌ Not implemented | `gasless-store.ts` (full) | — |
| Multi-provider swap executors | ❌ Not implemented | `executors/` (LI.FI, Symbiosis, etc.) | — |
| Atomic claim+fee pattern | ❌ Not implemented | `tx-helpers.ts` | — |
| Multi-hop orchestration | ❌ Not implemented | `orchestrator.ts` | — |
| ERC20Swap EIP-712 claim signing | ❌ Not implemented | `claims.ts:signClaimAuthorization()` | — |

## Migration Phases

### Phase 1: Shared Types & Client (Low Risk)

**Goal:** Import wallet-core-v2's RGB client and types into BitTasker-V2.

| Step | Action | Files Affected |
|---|---|---|
| 1.1 | Import `RGBClient` from wallet-core-v2 into BitTasker-V2 | `RGBProvider.ts` |
| 1.2 | Import `types.ts` for typed swap structures | `swap-chain/rgb/setup.ts`, `polling.ts`, `recovery.ts` |
| 1.3 | Import `tokens/registry.ts` for canonical addresses | `swap-chain/utils.ts` |
| 1.4 | Import `utils/networkConfig.ts` for chain IDs, RPC URLs | `swap-chain/utils.ts` |
| 1.5 | Remove duplicated constants from BitTasker-V2 | `utils.ts` |
| 1.6 | Run existing BitTasker-V2 unit tests to verify no regressions | `RGBProvider.test.ts` |

**Risk:** Low — these are additive imports, no behavioral changes.

### Phase 2: Shared Contract Service (Medium Risk)

**Goal:** Move lock/claim/refund encoding to wallet-core-v2.

| Step | Action | Files Affected |
|---|---|---|
| 2.1 | Backport ERC20Swap ABIs from BitTasker-V2 to wallet-core-v2 | `abi.ts` → new `Erc20SwapService.ts` in wallet-core-v2 |
| 2.2 | Backport EIP-712 claim signing from BitTasker-V2 to wallet-core-v2 | `claims.ts` → `Erc20SwapService.ts` |
| 2.3 | Add `getLockupEventParameters()` to wallet-core-v2's `EvmContractService` | `EvmContractService.ts` |
| 2.4 | Import `EvmContractService` from wallet-core-v2 into BitTasker-V2 | `abi.ts`, `claims.ts`, `setup.ts` |
| 2.5 | Replace BitTasker-V2's inline lock/claim/refund encoding with wallet-core-v2 calls | `setup.ts`, `executors.ts`, `recovery.ts` |
| 2.6 | Add swap renegotiation support from wallet-core-v2 | `ChainSwapService.ts` → BitTasker-V2's `polling.ts` |
| 2.7 | Run full BitTasker-V2 test suite | All rgb tests |

**Risk:** Medium — behavioral changes to lock/claim/refund encoding. Requires thorough testing.

### Phase 3: Shared Orchestration Primitives (High Risk)

**Goal:** Import shared primitives while keeping BitTasker-V2-specific orchestration.

| Step | Action | Files Affected |
|---|---|---|
| 3.1 | Import `ChainSwapRefundService` from wallet-core-v2 | `recovery.ts` |
| 3.2 | Import `SubmarineSwapRefundService` from wallet-core-v2 | `recovery.ts` |
| 3.3 | Import `RGBWebSocket` for real-time swap monitoring | `polling.ts` |
| 3.4 | Keep BitTasker-V2's multi-hop orchestrator in place | `orchestrator.ts` (no change) |
| 3.5 | Keep BitTasker-V2's gasless relay in place | `gasless-store.ts` (no change) |
| 3.6 | Keep BitTasker-V2's multi-provider executors in place | `executors/` (no change) |
| 3.7 | Run full E2E test suite | All swap tests |

**Risk:** High — changes to swap monitoring and refund flows. Requires live testing.

### Phase 4: Backport to wallet-core-v2 (Bidirectional)

**Goal:** Move BitTasker-V2-specific Arbitrum capabilities to wallet-core-v2.

| Step | Action | Direction |
|---|---|---|
| 4.1 | Add ERC20Swap support to wallet-core-v2 | BitTasker-V2 → wallet-core-v2 |
| 4.2 | Add EIP-712 claim signing to wallet-core-v2 | BitTasker-V2 → wallet-core-v2 |
| 4.3 | Add atomic claim+fee pattern to wallet-core-v2 | BitTasker-V2 → wallet-core-v2 |
| 4.4 | Add BTC↔tBTC bidirectional chain swap to wallet-core-v2 | BitTasker-V2 → wallet-core-v2 |
| 4.5 | Add ERC-4337/EIP-7702 gasless relay to wallet-core-v2 (optional) | BitTasker-V2 → wallet-core-v2 |

**Risk:** Medium — additive changes to wallet-core-v2. No impact on BitTasker-V2.

## Files to Migrate

### From BitTasker-V2 → wallet-core-v2

| BitTasker-V2 File | wallet-core-v2 Target | Content |
|---|---|---|
| `swap-chain/abi.ts` (ERC20Swap functions) | New `Erc20SwapService.ts` | `encodeERC20SwapLock()`, `encodeERC20SwapClaim()`, `encodeERC20SwapClaimWithSig()` |
| `swap-chain/rgb/claims.ts` (EIP-712 signing) | `Erc20SwapService.ts` | `signClaimAuthorization()` |
| `swap-chain/utils.ts` (Arbitrum constants) | `tokens/registry.ts` | TBTC, WBTC, USDT0 addresses |
| `swap-chain/rgb/recovery.ts` (scan/refund) | `ChainSwapRefundService.ts` | `scanUnclaimedLockups()`, `refundLockupDirect()` |

### From wallet-core-v2 → BitTasker-V2

| wallet-core-v2 File | BitTasker-V2 Target | Content |
|---|---|---|
| `swaps/rgb/RGBClient.ts` | `RGBProvider.ts` (replace) | Full RGB API client |
| `swaps/rgb/types.ts` | `swap-chain/rgb/types.ts` (new) | Typed swap structures |
| `swaps/rgb/EvmContractService.ts` | `abi.ts` + `claims.ts` (replace) | Lock/claim/refund encoding |
| `tokens/registry.ts` | `utils.ts` (replace constants) | Canonical addresses |
| `utils/networkConfig.ts` | `utils.ts` (replace constants) | Chain IDs, RPC URLs |
| `swaps/rgb/ChainSwapService.ts` (renegotiation) | `polling.ts` (add) | Swap renegotiation support |

## Testing Strategy

| Phase | Test Type | Scope |
|---|---|---|
| Phase 1 | Unit tests | Import verification, type compatibility |
| Phase 2 | Unit + integration tests | Lock/claim/refund encoding, EIP-712 signing |
| Phase 3 | E2E tests | Full swap flow on testnet |
| Phase 4 | E2E tests | wallet-core-v2 Arbitrum capabilities |

## Dependencies

- wallet-core-v2 must export `RGBClient`, `EvmContractService`, types, and token registry as public API
- BitTasker-V2 must update its `package.json` to import from wallet-core-v2
- Both projects must agree on shared type definitions

## Timeline Estimate

| Phase | Effort | Risk |
|---|---|---|
| Phase 1 | 1-2 days | Low |
| Phase 2 | 3-5 days | Medium |
| Phase 3 | 5-7 days | High |
| Phase 4 | 3-5 days | Medium |
| **Total** | **12-19 days** | — |
