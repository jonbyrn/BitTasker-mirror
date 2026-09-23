# USDT Implementation: BitTasker-V2 vs wallet-core-v2 Overlap Analysis

> **Date:** 2026-07-12
> **Goal:** Identify what USDT logic should move into `@bittasker/wallet-core` (the npm SDK) vs what should stay in the app.

---

## 1. Direct Duplicates

| Concern | wallet-core-v2 | BitTasker-V2 | Status |
|---|---|---|---|
| BSC USDT address | `networkConfig.ts` | `swap-chain/utils.ts`, `chain-utils.ts`, `stablecoin-registry.ts`, `abi.ts` (~5 places) | ✅ Consistent, duplicated |
| Arbitrum USDT0 address | `networkConfig.ts` | `gasless.config.ts`, `swap-chain/utils.ts`, `abi.ts`, `aave.service.ts`, `uniswap.service.ts` (~6 places) | ✅ Consistent, duplicated |
| RGB USDT0 address | `networkConfig.ts` | `openocean.service.ts` | ✅ Consistent |
| ERC20 ABI | `networkConfig.ts` | `swap-chain/abi.ts`, `chain-utils.ts`, `arbitrum-wallet.ts` (4 copies) | ⚠️ Multiple copies in app |
| `ERC20Token` type | `core/types.ts` | `src/lib/types/wallet.d.ts` | ⚠️ Type duplication |
| `PaymasterConfig` type | `core/types.ts` | `src/lib/types/wallet.d.ts` | ⚠️ Type duplication |
| `BSCUnit` type | `core/types.ts` | `src/lib/types/wallet.d.ts` | ⚠️ Type duplication |

---

## 2. Conflicts / Inconsistencies

| Issue | Severity | Details |
|---|---|---|
| `WalletManager` doesn't initialize Arbitrum | 🔴 High | SDK has `ArbitrumWallet` class but `WalletManager` doesn't wire it. BitTasker bypasses SDK for Arbitrum USDT0 via raw `ethers`. |
| BitTasker duplicates SDK types | 🟡 Medium | `ERC20Token`, `PaymasterConfig`, `BSCUnit` defined in both — drift risk |
| ERC20 ABI in 4+ places | 🟡 Medium | Should be a single import from SDK |
| USDT addresses scattered in app | 🟡 Medium | Same 3 addresses hardcoded in 6+ BitTasker files instead of importing from SDK |
| `Usdt0BridgeService` not wired in `WalletManager` | 🟡 Medium | Bridge exists in SDK but isn't accessible via the orchestrator |
| `MoCMintingService` has known bugs | 🟡 Medium | Wrong return values in `mintDoc`/`redeemDoc` (documented in `USDT0_IMPLEMENTATION_AUDIT.md`) |

---

## 3. What's Already Correctly in the SDK

BitTasker imports these from `@bittasker/wallet-core`:

- `BSCWallet` — USDT balance, send, paymaster check
- `BSCPaymasterContract` — USDT gas abstraction
- `ArbitrumWallet` — USDT0 balance/send (exists but not wired in WalletManager)
- `Usdt0BridgeService` — LayerZero OFT bridge (exists but not wired)
- `MoCMintingService` — DOC minting (has bugs)
- `getUSDTToken()`, `getRGBToken()`, `getArbConfig()` — token config getters
- `ERC20_ABI`, `PAYMASTER_ABI` — ABI constants
- `loadBSCTransactions()` — includes USDT token txs
- Core types: `WalletState`, `GasEstimation`, `Usdt0BridgeParams`, `LoanPhase`, `LoanFlowState`

---

## 4. Logic Only in BitTasker-V2 (candidates to move to SDK)

### Should move (pure logic, no UI deps)

| What | Location in BitTasker-V2 |
|---|---|
| USDT escrow fee calculation (5% flat) | `escrow-usdt.service.ts` |
| Escrow contract param derivation | `contract/v2/usdt-creation.ts` |
| ERC-20 transfer/approve/swap encoding | `swap-chain/abi.ts` |
| ERC-20 balance polling | `swap-chain/tx-helpers.ts` |
| Multi-chain USDT address map | `external-wallet/chain-utils.ts` |
| USD → ERC-20 wei conversion | `send-execution.service.ts` |
| Send/receive network mappings | `send-network-mapping.ts`, `receive-network-mapping.ts` |
| Stablecoin registry (BSC paymaster config) | `stablecoin-registry.ts` |
| Verified token list (7 chains) | `data/verified-tokens.ts` |
| EIP-7702 delegation manager | `gas-abstraction/eip7702-delegation-manager.ts` |
| Chainlink USDT price oracle | `backend/gasless/chainlink-oracle.service.ts` |
| DOC → USDT0 DEX swap (OpenOcean) | `openocean.service.ts` |
| Gasless config (addresses, fee buffers) | `wallet/gasless.config.ts` |

### Should NOT move (app/UI-specific)

| What | Why |
|---|---|
| Route resolver (1400+ lines) | Tightly coupled to LI.FI/Symbiosis/Changelly/RGB providers |
| Smart Router | App-specific orchestration |
| Off-ramp / fiat orchestrators | App-specific flows |
| Svelte stores, runes, components | UI layer |

---

## 5. Recommended: What to Add to the Wallet SDK

| Priority | What | Rationale |
|---|---|---|
| **P0** | Wire `ArbitrumWallet` into `WalletManager` | Arbitrum is first-class; SDK orchestrator must handle it |
| **P0** | Wire `Usdt0BridgeService` into `WalletManager` | Bridge is inaccessible without orchestrator wiring |
| **P1** | Multi-chain USDT address registry | Single source of truth for all USDT addresses (8+ chains) |
| **P1** | Generic ERC-20 utilities | `encodeERC20Transfer()`, `queryERC20Balance()`, `waitForERC20Balance()` — chain-agnostic |
| **P1** | USD → ERC-20 unit conversion | Pure utility, used in multiple places |
| **P1** | EIP-7702 delegation manager | Core gas abstraction logic, not UI-specific |
| **P2** | Escrow USDT fee/param derivation | Pure business logic |
| **P2** | Stablecoin registry (paymaster config) | Token + paymaster config belongs with chain config |
| **P2** | Chainlink USDT price oracle | Price feed logic |
| **P3** | DOC → USDT0 DEX swap | DEX integration for loan flow |

---

## 6. Summary

**No behavioral conflicts exist** — addresses, decimals, and chain IDs are consistent. The problem is **architectural fragmentation**:

1. Types are duplicated — BitTasker redefines `ERC20Token`, `PaymasterConfig`, `BSCUnit`
2. Constants are scattered — same USDT addresses in 6+ app files
3. ABIs are duplicated — `ERC20_ABI` in 4 places
4. SDK orchestrator is incomplete — `WalletManager` supports BSC but not Arbitrum
5. Pure logic is trapped in the app — escrow fees, ERC-20 utils, EIP-7702, address resolution

**The wallet SDK should contain:** chain interaction, types, token configs, utilities.
**The app should contain:** Svelte stores, runes, components, app-specific orchestration (routes, fiat, UI).
