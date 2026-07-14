# BitTasker Wallet Implementation Audit

**Date:** 2026-07-11 (updated 2026-07-14)
**Scope:** Full-stack wallet implementation audit across 4 projects
**Projects Audited:**
- `wallet-core-v2` — Wallet SDK (`@bittasker/wallet-core` v0.2.0+),  path: /Users/doma/Projects/bittasker/wallet-core-v2
- `BitTasker-V2` — SvelteKit frontend (Capacitor mobile app), path: current codebase
- `bittasker-nestjs` — NestJS backend API, path: /Users/doma/Projects/bittasker/bittasker-nestjs
- `meta-tx-relay` — Cloudflare Worker + Solidity contracts, path: /Users/doma/Projects/bittasker/meta-tx-relay

**Note on BSC:** BSC (Binance Smart Chain) support exists in the SDK but is legacy and unused by the active product. It is excluded from this audit. BSC-related code is not making problems and will be addressed separately.

**Changelog (2026-07-14, v8) — Post-Implementation Fixes:**
- Fixed: Frontend `gasless-helpers.ts` MIN/MAX_GAS_BUFFER aligned to backend values (USDT0: 3_000n→10_000n min, 50_000n→150_000n max; WBTC: 5n→16n min, 80n→230n max; tBTC/WETH scaled proportionally). Frontend was 3x lower than backend, causing relay rejections.
- Fixed: Frontend `wallet-send.ts` fallback fee buffer: `10_000_000_000_000_000n` → `10_000n` for USDT0 (6 decimals). The old fallback was an 18-decimal value (~10 billion tokens).
- Fixed: OpenOcean provider API parameter: `amountDecimals` → `amount` (matching `openocean.service.ts` and OpenOcean v4 API spec)
- Fixed: LoanFlowDrawer removed RSK address fallback for Arbitrum recipient — RSK and Arbitrum use different derivation paths (coin type 137 vs 60), so falling back would send funds to a wrong address
- Fixed: LoanFlowDrawer `stepStatus()` — failed state now displays correctly when `getActiveStep()` returns -1 (phase doesn't map to a known step)
- Fixed: SDK `RSKWallet.sendToken()` — added token address validation (`ethers.isAddress`) and RBTC gas balance pre-check
- Fixed: SDK `ArbitrumWallet.sendToken()` — uses `tokenConfig.decimals` from cache instead of making an extra RPC call to `contract.decimals()`
- Fixed: SDK `ArbitrumTransactions.ts` — removed `?chainid=` parameter from Arbiscan API URLs (native Arbiscan doesn't accept this Etherscan v2 parameter)
- Fixed: SDK `Usdt0BridgeService` GUID extraction — now filters logs by `PacketSent(bytes,bytes,address)` event signature instead of blindly reading `logs[0].topics[1]`
- Fixed: SDK `RskDexSwapService` swap output parsing — removed incorrect balance-based fallback (was using total balance instead of delta)
- Fixed: SDK `WalletManager.dispose()` — now nulls out service references to prevent stale instance access after disposal
- Fixed: SDK `LoanFlowOrchestrator.resumeFromDocSwap()` — now applies user's slippage preference (was using raw `minOutputAmount` from quote, inconsistent with `executeFullFlow`)
- Documented: C3 (callData encoding mismatch) — confirmed no collision, NestJS is active production path, meta-tx-relay is parallel/unused
- Documented: Dead code — `USDTBalance.svelte` (zero imports), `gasless-helpers.ts` parallel-arrays ABI (unused for relay callData)
- All tests passing: 619 SDK, 13 contract, 54 meta-tx-relay, 65 frontend unit, 8 e2e

**Changelog (2026-07-14, v7) — Implementation Fixes:**
- Fixed: Bug 5.5 — USDT0-Arb connected wallet decimal bug (`use-swap-wallets.svelte.ts`): changed `/1e18` to `/1e6` in 4 locations (walletBalanceFor, sourceBalances, destBalances, getUsdtHumanFromConnected)
- Fixed: Bug 8.8 — USDT0 decimals in meta-tx-relay Arbitrum gasless config: changed `decimals: 18` to `decimals: 6`, updated FEE_BUFFER_MIN to `10_000n` and FEE_BUFFER_MAX to `150_000n` (ONLY Arbitrum gasless config, RSK relay untouched)
- Fixed: Bug 8.10 — VerifyingPaymaster.sol validationData packing: changed `(validAfter << 48) | validUntil` to `(validAfter << 208) | (validUntil << 160)` per ERC-4337 spec. 13 contract tests passing.
- Fixed: Bug 5.13 — Added `usdt0-rsk` send handler in `send-execution.service.ts`: builtin handler delegates to `walletManager.sendRSKUSDT0()`, connected handler encodes ERC-20 transfer calldata
- Fixed: Added `sendRSKUSDT0()` to `wallet-send.ts` and `wallet-utils.ts` using new `RSKWallet.sendToken()` SDK method
- Fixed: Added `sendToken(tokenAddress, to, amount, decimals)` method to SDK `RSKWallet` for generic ERC-20 sends on RSK
- Fixed: Bug 5.12 — GaslessSendFlow now passes actual amounts to pending/success screens: `parseFloat(amount)` instead of hardcoded `0`
- Fixed: Bug 5.11 — Arbitrum token network labels: changed `'RSK'`/`'BSC'` to `'Arbitrum'` for usdt0-arb, wbtc-arb, tbtc-arb in `wallet-balances.ts`
- Fixed: Bug 5.15 — SwapForm `_mapSourceToNetwork`: wbtc-arb and tbtc-arb now map to `'usdt-arbitrum'` instead of `'rootstock-bitcoin'`
- Fixed: Bug 5.16 — Wallet page `process.env.NODE_ENV` replaced with `!import.meta.env.DEV`
- Fixed: Bug 5.9 — SmartRouter `fetchSubmarineFee` now accepts `amountSats` parameter and computes percentage fee correctly (was zeroed with `* 0`)
- Fixed: TBTC fee buffer in `src/wallet/gasless.config.ts`: FEE_BUFFER_MIN `10_000_000_000_000n` → `10_000_000_000_000_000n` (missing 3 zeros), FEE_BUFFER_MAX similarly corrected
- Fixed: Root `gasless.config.ts`: USDT0 decimals `18` → `6`, FEE_BUFFER_MIN/MAX corrected to 6-decimal values
- Fixed: NestJS `gasless.config.ts` `convertToTokenFee`: replaced `BigInt(Math.round(feeUSD * 1e18))` with string-based conversion to avoid floating-point precision loss
- Fixed: NestJS `gasless.service.ts` `buildCallData`: removed duplicate treasury transfer (was creating 3 calls instead of 2 for simple transfers)
- Fixed: SDK Bug 6.17 — `RskDexSwapService.swap()` now parses actual output from Swap event logs instead of re-querying `getAmountsOut` (which returns wrong post-swap values)
- Fixed: SDK Bug 6.18 — `LoanFlowOrchestrator.recover()` now clears saved steps before calling `executeFullFlow` to prevent state confusion
- Fixed: Bug 5.14 — Created `openocean.provider.ts` in route-engine/providers/ and registered in engine.ts. OpenOcean DOC→USDT0 RSK swaps now available in SwapForm route picker.
- Added: LoanFlowDrawer component (`src/lib/components/wallet/LoanFlowDrawer.svelte`) — full UI for rBTC → DOC → USDT0 → Arbitrum flow with 6 states (input/quoting/confirm/executing/success/error)
- Added: LoanFlowDrawer wired into wallet page: "Convert" button in DeFi section, BankingMenu DeFi handler opens loan flow instead of preview toast
- Added: E2E test suite (`tests/e2e/wallet/usdt-implementation.spec.ts`) — 13 tests covering balance display, loan flow drawer, gasless amounts, swap routes, decimal handling, network labels
- Rebuilt: SDK dist with all fixes (619 tests passing)
- Updated: wallet-audit.md with all implementation results

**Changelog (2026-07-14, v6) — Full Cross-Project Audit:**
- Added: 6 new CRITICAL bugs (C1-C6) — USDT0 decimals in connected wallets, meta-tx-relay decimals, calldata mismatch, paymaster validationData, Changelly dead code, loan flow orphaned
- Added: 10 new HIGH bugs (H1-H10) — BSC explorer URL, submarine fee zeroing, hardcoded BTC price, post-swap estimation, loan flow recovery, duplicate treasury transfers, NestJS float precision, tokenWeiToUsd precision, USDTBalance dead code, OpenOcean not wired
- Added: 14 new MEDIUM bugs (M1-M14) — network labels, zero amounts in gasless send, missing RSK USDT0 handler, non-null assertions, global mutable state, WebSocket race, bridge GUID fragility, bridge fee estimate, SwapForm network mapping, process.env in browser, preflight behavioral drift, initCode mismatch, AA23 handling, GAS_TREASURY empty default
- Added: 9 new LOW bugs (L1-L9) — MoC testnet, BSC paymaster dead code, ETH vs RBTC error, signal abort, missing exports, self-dependency, public swap status, Prisma silent catch, escrow typo
- Added: Section 17 — Cross-Project Integration Assessment (API alignment, feature flag analysis, orphaned endpoints)
- Added: Section 18 — Comprehensive Manual Testing Plan (9 test scenarios with step-by-step instructions)
- Added: Section 19 — Regtest Readiness Assessment
- Updated: Section 15 Fix Priority Matrix with all new findings
- Updated: Section 12 Missing Features with integration gaps
- Updated: Section 14 Testing Guide with production user testing instructions

**Changelog (2026-07-13, v5):**
- Fixed: SDK ESM resolution — added `.js` extensions to all source imports for proper Node.js ESM support
- Fixed: Bug 5.1c — `loadAssets()` now passes `forceRefresh` parameter correctly to RSK token balances (was always `true`)
- Fixed: Bug 5.1b — `fetchStablecoinUsdAtBlock()` failure warning now logs once per session instead of every cycle
- Fixed: Bug 6.11 — Removed 5 debug `console.log()` statements from `ReverseSwapService.claimRBTCViaRifRelay()`
- Fixed: F-TODO-4 — USDT0 decimals bug in frontend gasless-helpers (was 18 decimals, now 6)
  - `FEE_BUFFER_MIN` for USDT0: `10_000_000_000_000_000n` → `10_000n` ($0.01 at 6 decimals)
  - `FEE_BUFFER_MAX` for USDT0: `150_000_000_000_000_000n` → `150_000n` ($0.15 at 6 decimals)
  - ethers `gasless-helpers.ts` MIN_GAS_BUFFER/MAX_GAS_BUFFER corrected for USDT0
  - viem `gasless-helpers.ts` `getUSDT0FeeBuffer()` corrected from 18 to 6 decimals
- Fixed: F-TODO-4 tBTC — `FEE_BUFFER_MIN` for tBTC: `10_000_000_000_000_000n` → `10_000_000_000_000n` ($0.01 at 18 decimals)
- **Fixed: CRITICAL Paymaster hash format mismatch** — On-chain `VerifyingPaymaster.sol` updated to v0.7 packed format matching CF Worker paymasterSigner.js (the existing implementation). NestJS `paymaster-signing.service.ts` also updated to match. Returns `uint256 validationData` per ERC-4337 v0.8. Enabled `viaIR` for stack depth. 13 contract tests passing.
- **Fixed: NestJS paymaster-signing.service.ts** — Updated `computePaymasterHash()` to v0.7 packed format (matching CF Worker). `signPaymasterData()` now returns full `paymasterAndData` (paymaster address ++ abi.encode(validUntil, validAfter, signature)). Updated `gasless.service.ts` to use return value directly.
- Reverted: Contract v0.7 hash format — restored, then correctly updated (CF Worker is source of truth)
- Reverted: NestJS paymaster-signing.service.ts — restored, then correctly updated (matching CF Worker)
- Fixed: Contract test updated for v0.7 hash format (signature verification test)
- Added: SDK v0.2.0 — ERC-20 utilities module (`encodeERC20Transfer`, `waitForERC20Balance`, `usdToTokenWei`, etc.)
- Added: SDK v0.2.0 — Multi-chain token registry (`USDT_ADDRESSES`, `WBTC_ADDRESSES`, `getUsdtToken()`, etc.)
- Added: SDK v0.2.0 — 66 new tests (ERC-20 utilities + token registry), total 619 SDK tests passing
- Added: Frontend loan flow service (`src/lib/services/loan-flow.service.ts`) — wraps SDK's LoanFlowOrchestrator
- Added: Frontend loan flow service tests (6 tests passing)
- Added: Production .env configuration documentation (Section 16)
- Consolidated: `gasless.config.ts` now imports `ARB_TOKEN_ADDRESSES` from SDK (was hardcoded)
- Consolidated: `verified-tokens.ts` now includes USDT0 on RSK (chain 30) with correct address and 6 decimals
- Updated: SDK `tsconfig.json` — reverted to `moduleResolution: "bundler"` (correct for Vite consumers)
- Updated: Removed debug `console.log` from `token-balance.service.ts` cache miss/force refresh paths
- Updated: Gasless test expectations to match corrected 6-decimal values (179 tests passing)
- Updated: Hardhat config enabled `viaIR` for VerifyingPaymaster compilation

**Changelog (2026-07-13, v4):**
- Corrected: RIF Relay is actively used by Boltz swap claims (was incorrectly listed as "dead export")
- Corrected: Changelly is NOT in the SDK — it's backend-only. SDK uses `RskDexSwapService` for DEX swaps
- Corrected: Dual gasless approach is intentional (RIF Relay for Boltz, EIP-4337 for USDT)
- Corrected: Boltz does NOT support testnet — only mainnet and regtest. This is by design, not a bug.
- Corrected: Boltz is the PRIMARY cross-chain swap mechanism for ALL chains ↔ RSK (not just Lightning). It just doesn't support USDT0.
- Corrected: Changelly timing updated with official data (5-40 min per Changelly website, not just a hardcoded constant)
- Corrected: Changelly API keys are NOT needed in the frontend — all communication proxied through backend
- Corrected: Loan flow (LoanFlowOrchestrator) exists in SDK but is NOT yet wired into the frontend — added as CRITICAL missing feature
- Corrected: Swap reminders disabling is intentional and out of scope
- Corrected: Backend USDT0 decimals bug is FIXED (was listed as CRITICAL)
- Corrected: Backend CORS is FIXED, JWT expiration is FIXED, Changelly swap bugs are FIXED
- Corrected: Alto bundler is WORKING locally, VerifyingPaymaster deploys to local Hardhat fork
- Corrected: F-TODO-1 (USDT0 decimals) marked as FIXED
- Updated: MoC/Usdt0BridgeService bugs marked as FIXED
- Updated: `LoanFlowOrchestrator` and `RskDexSwapService` now EXIST
- Updated: `ArbitrumWallet` now integrated into `WalletManager`
- Updated: Test count (553 SDK tests passing, 795 backend tests passing)
- Added: Changelly vs DEX swap explanation with user journey examples
- Added: Frontend TODOs from `changelly-gasless-plan.md` (10 items)
- Added: Regtest testing approach for new features
- Added: Local infrastructure status (all components working)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [SDK Design Principles & Boundary](#3-sdk-design-principles--boundary)
4. [Swap Systems Explained: Changelly vs DEX vs Boltz](#4-swap-systems-explained-changelly-vs-dex-vs-boltz)
5. [Overlap Analysis: What Needs to Move](#5-overlap-analysis-what-needs-to-move)
6. [Frontend Bugs (BitTasker-V2)](#6-frontend-bugs-bittasker-v2)
7. [Wallet SDK Bugs (wallet-core-v2)](#7-wallet-sdk-bugs-wallet-core-v2)
8. [Backend Bugs (bittasker-nestjs)](#8-backend-bugs-bittasker-nestjs)
9. [Contracts / Relay Bugs (meta-tx-relay)](#9-contracts--relay-bugs-meta-tx-relay)
10. [Frontend TODOs (from changelly-gasless-plan)](#10-frontend-todos-from-changelly-gasless-plan)
11. [Placeholders & Incomplete Features](#11-placeholders--incomplete-features)
12. [Missing Features](#12-missing-features)
13. [Resources & Documentation Links](#13-resources--documentation-links)
14. [Testing Guide: Regtest & Mainnet](#14-testing-guide-regtest--mainnet)
15. [Fix Priority Matrix](#15-fix-priority-matrix)
16. [Production Environment Configuration](#16-production-environment-configuration)
17. [Cross-Project Integration Assessment](#17-cross-project-integration-assessment)
18. [Manual Testing Plan (Production User Perspective)](#18-manual-testing-plan-production-user-perspective)
19. [Regtest Readiness Assessment](#19-regtest-readiness-assessment)

---

## 1. Executive Summary

The BitTasker wallet system spans four projects and introduces several major subsystems: multi-chain wallets (RSK, Arbitrum), Boltz swaps (Lightning, chain swaps, submarine swaps), a DOC stablecoin minting flow (MoC protocol), USDT0 cross-chain bridging (LayerZero OFT), DEX swaps (Sovryn on RSK), a loan flow orchestrator (rBTC → DOC → USDT0 → bridge), and two separate gasless transaction systems.

**Critical architectural principle:** The wallet SDK (`@bittasker/wallet-core`) is a **public npm package** designed for any developer to use. It must NOT depend on the BitTasker backend. The SDK talks to public blockchain RPCs and public APIs (Boltz, LayerZero, MoC, Sovryn DEX) only. The backend (`bittasker-nestjs`) is private BitTasker infrastructure that handles server-side secrets (paymaster signing, Changelly API keys, notifications).

**Dual gasless approach (intentional):** The system has two separate gasless mechanisms for different use cases:
1. **RIF Relay (SDK-side)** — Used internally by Boltz reverse/chain swap services for gasless RBTC claiming on RSK. When a user swaps Lightning → RBTC but has no RSK gas to claim, the SDK automatically routes the claim through a RIF Relay Smart Wallet. This is fully implemented and tested.
2. **EIP-4337/7702 Paymaster (Backend-side)** — Used for USDT operations on Arbitrum. The frontend builds UserOperations, sends them to the NestJS backend, which signs paymaster data and submits to the Alto bundler. This requires server-side private keys and is mediated by the backend.

**Changelly** is NOT in the SDK. It exists only in the backend (`bittasker-nestjs`) as a server-mediated swap/fiat service requiring API keys. The SDK's DEX swap capability uses `RskDexSwapService` (Sovryn Uniswap V2 router on RSK) for DOC → USDT0 swaps.

**Overall assessment: Significant progress, not yet production-ready.** The SDK has had major fixes and new features since the initial audit:
- **MoC/Usdt0BridgeService bugs FIXED** — return values, approval checks, retry encoding all corrected
- **LoanFlowOrchestrator IMPLEMENTED** — full rBTC → DOC → USDT0(RSK) → USDT0(Arb) state machine
- **RskDexSwapService IMPLEMENTED** — Sovryn DEX for DOC → USDT0 swaps on RSK
- **ArbitrumWallet integrated into WalletManager** — init, addresses, balances, dispose
- **553 tests passing** across 22 test files

Remaining issues:
- **7 CRITICAL bugs** across the stack (connected wallet USDT0 decimals, meta-tx-relay decimals, callData encoding mismatch, paymaster validationData packing, Changelly swap dead code, loan flow orphaned, USDTBalance dead component)
- **10 HIGH bugs** (submarine fee zeroing, hardcoded BTC price, BSC explorer URL, post-swap estimation, loan flow recovery, NestJS float precision, duplicate treasury transfers, initCode mismatch, missing RSK USDT0 send handler, OpenOcean not wired)
- **3 placeholder implementations** (BTC/L-BTC submarine refunds, Arbitrum Sepolia tokens)
- **Significant UI gaps** — loan flow, USDT0 bridge, DOC minting, and OpenOcean DEX all have backend/SDK implementations but no frontend UI entry points
- **Code fragmentation** — 51+ frontend files make direct RPCs bypassing the SDK; 3 competing token registries

The frontend code has been battle-tested in production. The SDK's Boltz swap system is mature and well-tested. The newer additions (MoC, bridge, loan flow) have unit tests but need integration testing on testnet.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend (BitTasker-V2)                 │
│                                                                      │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │BalanceHistory│ │  SwapForm    │ │ SendPayment  │ │ GaslessSend │ │
│  │  .svelte     │ │  .svelte     │ │  .svelte     │ │  Flow       │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬──────┘ │
│         └────────────────┴────────────────┴────────────────┘        │
│                              │                                      │
│         ┌────────────────────┴────────────────────┐                 │
│         │                                         │                 │
│         ▼                                         ▼                 │
│  ┌─────────────────────┐               ┌──────────────────────┐    │
│  │ @bittasker/wallet-core│              │  Direct RPCs (viem/  │    │
│  │ (Public SDK)         │              │  ethers) — 51+ files │    │
│  │                      │              │  bypassing SDK        │    │
│  │ - RSKWallet          │              └──────────┬───────────┘    │
│  │ - ArbitrumWallet     │                         │                 │
│  │ - BoltzClient        │                         │                 │
│  │ - Swap services      │                         │                 │
│  │ - Token configs      │                         │                 │
│  │ - ERC-20 ABI         │                         │                 │
│  └───────┬──────────────┘                         │                 │
│          │                                        │                 │
└──────────│────────────────────────────────────────│─────────────────┘
           │                                        │
           ▼                                        ▼
┌─────────────────────┐                  ┌─────────────────────┐
│  Public Blockchains │                  │  Public APIs         │
│  (RSK, Arbitrum)    │                  │  (Boltz, LayerZero)  │
│                     │                  │                      │
│  - Balance queries  │                  │  - Swap creation     │
│  - Token transfers  │                  │  - Status monitoring │
│  - Contract calls   │                  │  - Bridge messages   │
└─────────────────────┘                  └──────────────────────┘

     Frontend ALSO communicates with (NOT the SDK):

┌──────────────────────────────────────────────────────────┐
│              BitTasker Backend (Private)                   │
│              (bittasker-nestjs + meta-tx-relay)            │
│                                                           │
│  ┌──────────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Gasless Relay     │  │ Changelly    │  │ Nostr      │  │
│  │ (EIP-4337/7702)  │  │ Swap + Fiat  │  │ Indexer    │  │
│  │                   │  │              │  │            │  │
│  │ Paymaster signing │  │ HMAC-signed  │  │ Events,   │  │
│  │ Alto bundler      │  │ API calls    │  │ DMs, etc.  │  │
│  │ Chainlink oracles │  │              │  │            │  │
│  └──────────────────┘  └──────────────┘  └────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Key Data Flows

1. **Balance polling**: RSK block watcher (30s) → `loadAssets()` → Blockscout/RPC → `walletStore` → Svelte reactivity
2. **Boltz swap lifecycle**: Frontend → SDK `WalletManager` → `BoltzClient` → Boltz API → WebSocket monitoring → EventBus → UI. Gasless claims route through RIF Relay when user has no RSK gas.
3. **USDT gasless transactions**: Frontend builds UserOp → `POST /relay` → Backend signs paymaster → Alto Bundler → EntryPoint v0.8
4. **Loan flow**: rBTC → MoC DOC minting → Sovryn DEX swap (DOC → USDT0 on RSK) → LayerZero OFT bridge → USDT0 on Arbitrum. Orchestrated by `LoanFlowOrchestrator`.
5. **Changelly swaps**: Frontend route resolver → Backend Changelly API (HMAC/RSA signed) → Changelly exchange. NOT in the SDK.

### What the SDK Does NOT Do

- The SDK does NOT communicate with the BitTasker backend
- The SDK does NOT handle EIP-4337/7702 gasless relay (that's backend-mediated via paymaster signing)
- The SDK does NOT handle Changelly swaps (that's backend-mediated with API keys)
- The SDK does NOT handle notifications or auth
- The SDK IS responsible for RIF Relay gasless claims (used internally by Boltz swap services)
- The SDK is a standalone library for blockchain operations

---

## 3. SDK Design Principles & Boundary

### 3.1 What the SDK Should Be

The wallet SDK (`@bittasker/wallet-core`) is a **public npm package** that any developer can use to:
- Manage wallets on RSK and Arbitrum
- Perform token transfers (RBTC, USDT0, WBTC, tBTC, DOC)
- Execute Boltz swaps (all cross-chain swaps to/from RSK — Lightning, BTC, L-BTC)
- Bridge USDT0 between RSK and Arbitrum via LayerZero
- Mint/redeem DOC stablecoins via MoC protocol
- Swap DOC → USDT0 on RSK via Sovryn DEX
- Orchestrate the full loan flow (rBTC → DOC → USDT0 → bridge to Arbitrum)
- Use ERC-20 utilities (encode transfers, check balances, approve spending)
- Validate and format addresses (EIP-1191, EIP-55)

**The SDK must be self-contained.** It talks to public blockchain RPCs and public APIs only. No backend dependencies.

### 3.2 Boundary: What Goes Where

#### SDK (`@bittasker/wallet-core`) — Public, standalone

| Concern | Status | Notes |
|---|---|---|
| RSK wallet (RBTC transfers, balance, gas) | ✅ In SDK | `RSKWallet` |
| Arbitrum wallet (ETH, USDT0, WBTC, tBTC) | ✅ In SDK | `ArbitrumWallet` — integrated into `WalletManager` |
| Boltz swap services (reverse, chain, submarine) | ✅ In SDK | All three services + WebSocket monitoring |
| RIF Relay gasless claims | ✅ In SDK | `RifRelayClaimService` — used internally by Boltz reverse/chain swaps for gasless RBTC claiming |
| MoC DOC minting | ✅ In SDK | `MoCMintingService` — bugs fixed |
| USDT0 LayerZero bridge | ✅ In SDK | `Usdt0BridgeService` — bugs fixed |
| RSK DEX swap (DOC → USDT0) | ✅ In SDK | `RskDexSwapService` — Sovryn Uniswap V2 router |
| Loan flow orchestrator | ✅ In SDK | `LoanFlowOrchestrator` — rBTC → DOC → USDT0(RSK) → USDT0(Arb) |
| Token configs (addresses, decimals) | ✅ In SDK | `ARB_TOKEN_ADDRESSES`, `RSK_TOKENS`, etc. |
| ERC-20 ABI | ✅ In SDK | `ERC20_ABI` |
| Network configs | ✅ In SDK | `RSK_NETWORKS`, `ARB_NETWORKS`, `getRSKConfig()`, etc. |
| Address utilities | ✅ In SDK | `normalizeRskAddress()`, `toEip1191ChecksumAddress()`, etc. |
| Unit conversion | ✅ In SDK | `satoshiToWei()`, `weiToSatoshi()` |
| Fee tiers | ✅ In SDK | `FEE_TIERS` — used by frontend for escrow calculations |
| Swap storage interface | ✅ In SDK | `SwapStorage` interface + `InMemorySwapStorage` |
| Arbitrum transaction history | ✅ In SDK | `loadArbitrumTransactions()` |
| ERC-20 transfer/approve encoding | ✅ In SDK | `encodeERC20Transfer()`, `encodeERC20Approve()` (v0.2.0) |
| ERC-20 balance polling utility | ✅ In SDK | `waitForERC20Balance()`, `waitForERC20Allowance()` (v0.2.0) |
| Multi-chain USDT address registry | ✅ In SDK | `USDT_ADDRESSES`, `getUsdtToken()`, `getUsdtAddressByChainId()` (v0.2.0) |
| USD → ERC-20 wei conversion | ✅ In SDK | `usdToTokenWei()`, `tokenWeiToUsd()`, `formatTokenAmount()` (v0.2.0) |
| EIP-7702 delegation (core signing) | ❌ NOT in SDK | Currently in frontend `gas-abstraction/` |
| Changelly swaps | ❌ NOT in SDK | Backend-only (requires API keys) |

#### Frontend (BitTasker-V2) — App-specific

| Concern | Status | Notes |
|---|---|---|
| Svelte stores, runes, components | ✅ In frontend | UI layer — never in SDK |
| Wallet store orchestration | ✅ In frontend | `wallet-store.ts`, `wallet-balances.ts`, etc. |
| EIP-4337/EIP-7702 gasless system | ✅ In frontend | Builds UserOps, sends to backend for relay |
| Balance history / charts | ✅ In frontend | `BalanceHistory.svelte`, `BalanceChartModal.svelte` |
| Route resolver (1400+ lines) | ✅ In frontend | Tightly coupled to Li.Fi/Symbiosis/Changelly/Boltz |
| DeFi integrations (Aave, Uniswap) | ✅ In frontend | App-specific, not generic wallet ops |
| External wallet connectors | ✅ In frontend | MetaMask, WalletConnect, Ledger, Trezor |
| Escrow USDT fee calculation | ✅ In frontend | BitTasker-specific business logic |
| Verified token list (7 chains) | ✅ In frontend | App-specific curated list |
| Send/receive network mappings | ✅ In frontend | App-specific routing logic |
| Gasless config (fee buffers, treasury) | ✅ In frontend | Business decisions, not chain constants |
| Delegation journal / lifecycle | ✅ In frontend | Capacitor-specific persistence |
| Two competing ArbitrumWallet impls | ⚠️ Problem | SDK has one, frontend has its own in `src/wallet/arbitrum-wallet.ts` |
| Three competing token registries | ⚠️ Problem | `verified-tokens.ts`, `token-registry.ts`, `gasless.config.ts` |
| 51+ files with direct RPCs | ⚠️ Problem | Bypasses SDK entirely |

#### Backend (bittasker-nestjs) — Private infrastructure

| Concern | Status | Notes |
|---|---|---|
| Gasless relay (paymaster signing) | ✅ In backend | Requires server-side private key |
| Alto bundler submission | ✅ In backend | Requires bundler API access |
| Chainlink price oracles | ✅ In backend | For gasless fee calculation |
| Changelly swap/fiat | ✅ In backend | Requires API keys (HMAC/RSA) |
| Notification engine | ✅ In backend | Firebase, Nostr DMs, email |
| Auth (Nostr challenge, JWT) | ✅ In backend | Server-side secret management |
| Nostr indexer | ✅ In backend | Event processing, Redis |

#### Contracts (meta-tx-relay) — On-chain infrastructure

| Concern | Status | Notes |
|---|---|---|
| VerifyingPaymaster (Solidity) | ✅ In contracts | ERC-4337 paymaster for Arbitrum |
| Simple7702Account (Solidity) | ✅ In contracts | EIP-7702 test account |
| Rootstock meta-tx relay | ✅ In contracts | Cloudflare Worker for RSK escrow relay |

### 3.3 What the SDK Should NOT Contain

- **No backend API calls** — The SDK must not call `bittasker-nestjs` endpoints
- **No Changelly integration** — That's backend-mediated with API keys
- **No notification logic** — That's backend-specific
- **No auth logic** — That's app-specific
- **No Svelte/framework dependencies** — Must be framework-agnostic
- **No Capacitor dependencies** — Must work in any JS environment
- **No app-specific business logic** — Escrow fees, route resolution, etc.

---

## 4. Swap Systems Explained: Changelly vs DEX vs Boltz

The BitTasker ecosystem has three distinct swap mechanisms. Understanding when each is used requires understanding the route engine.

### 4.1 When Each System Is Used

The wallet has a **route engine** (`src/lib/services/route-engine/engine.ts`) that queries multiple providers in parallel and ranks routes by total cost. The user sees the best routes and can pick one. There's also a **route resolver** (`src/lib/services/route-resolver.ts`) with hardcoded rules for known pairs.

**Changelly** is used when:
- The user swaps between different blockchains where no direct DEX path exists (e.g., BTC → USDT, USDT-BSC → WBTC-Arb)
- The user buys crypto with fiat (MoonPay, Banxa, Wert, Transak via Changelly Fiat API)
- The user sells crypto for fiat (off-ramp via MoonPay)
- The route engine selects Changelly as the cheapest option for a cross-chain pair

**RskDexSwapService (DEX)** is used when:
- The user swaps tokens ON THE SAME CHAIN on RSK (specifically DOC → USDT0)
- This is part of the **loan flow** in the SDK (rBTC → DOC → USDT0 → bridge)
- The loan flow is implemented in the SDK but **NOT yet wired into the frontend**

**Boltz** is used when:
- The user swaps between ANY chain and the RSK wallet (BTC ↔ RSK, Lightning ↔ RSK, L-BTC ↔ RSK)
- This is the primary swap mechanism for the wallet — Boltz handles all cross-chain swaps to/from RSK
- The only thing Boltz does NOT support is USDT0 — that's why Changelly and the loan flow exist as additional paths
- Multi-hop routes that include a Boltz leg (e.g., rBTC → tBTC via Boltz chain swap → USDT0 via Symbiosis)

### 4.2 Example User Journeys

| User wants | Source asset | Route | Systems used |
|---|---|---|---|
| USDT0 on Arbitrum | rBTC on RSK | rBTC → tBTC (Boltz chain swap) → USDT0 (Symbiosis DEX on Arb) | Boltz + Symbiosis |
| USDT0 on Arbitrum | BTC on-chain | BTC → rBTC (Boltz) → USDT0 (LI.FI, RSK→Arb) | Boltz + LI.FI |
| USDT on BSC | BTC on-chain | BTC → USDT (Changelly) | Changelly |
| Buy crypto with fiat | USD/EUR | Fiat → Changelly aggregated provider → crypto | Changelly Fiat |
| USDT0 on Arbitrum (via loan flow) | rBTC on RSK | rBTC → DOC (MoC) → USDT0 (Sovryn DEX) → USDT0-Arb (LayerZero) | SDK loan flow (NOT yet in frontend) |

### 4.3 Changelly (Centralized Exchange Service)

**What it is:** A centralized crypto exchange service that swaps between different cryptocurrencies across different blockchains.

**Where it lives:** Backend only (`bittasker-nestjs`). Requires API keys (HMAC-SHA256 for swap, RSA-SHA256 for fiat). The frontend does NOT have API keys — all communication is proxied through the backend.

**Current status:** Fiat API confirmed working. Swap API keys are NOT yet configured (`CHANGELLY_API_KEY`/`CHANGELLY_API_SECRET` are empty in .env). The swap API endpoint was Cloudflare-blocked from the dev environment — needs testing from production server or with proper keys.

**Note on timing:** Per Changelly's official website and FAQ: "as a rule, crypto transactions are processed in 30 minutes (max)" with an average of 5-40 minutes depending on the blockchain pair and network congestion. The exact time depends on the source chain's confirmation requirements (BTC needs multiple confirmations, EVM chains are faster). Same-chain swaps on Arbitrum complete in seconds. The frontend hardcodes `5-30 min` in `changelly.provider.ts:28-29` — this is close to the official range but should be updated to match Changelly's documented 5-40 min.

### 4.4 RskDexSwapService (Decentralized Exchange on RSK)

**What it is:** A decentralized exchange swap ON THE SAME CHAIN (RSK). Specifically: DOC → USDT0 via Sovryn (Uniswap V2 compatible router).

**Where it lives:** SDK (`@bittasker/wallet-core`). No API keys needed — it's an on-chain smart contract interaction.

**Current status:** Fully implemented with tests. Default Sovryn router configured for RSK Mainnet. Part of the loan flow orchestrator. NOT yet wired into the frontend.

### 4.5 Boltz Exchange (Primary Cross-Chain Swap Protocol)

**What it is:** A non-custodial swap protocol that handles ALL cross-chain swaps to/from the RSK wallet. This includes Lightning ↔ RSK, BTC on-chain ↔ RSK, L-BTC ↔ RSK. Uses HTLCs (Hash Time-Locked Contracts) for trustless execution. Boltz is the primary swap mechanism — it just doesn't support USDT0, which is why Changelly and the loan flow exist as additional paths.

**Where it lives:** SDK (`@bittasker/wallet-core`). Uses Boltz's public API — no API keys needed.

**Current status:** Fully implemented and production-tested. Working in production since v0.1.0.

**Important:** Boltz does NOT support testnet. Only mainnet and regtest are available. This is by design.

### 4.6 Summary

| Swap Type | From → To | System | Where | API Keys? |
|---|---|---|---|---|
| Cross-chain crypto (BTC→USDT, etc.) | Different chains | Changelly | Backend | Yes (HMAC) |
| Fiat → Crypto | Fiat → any | Changelly Fiat | Backend | Yes (RSA) |
| DOC → USDT0 (same chain RSK) | RSK → RSK | RskDexSwapService (Sovryn) | SDK | No |
| Any chain ↔ RSK (except USDT0) | Cross-chain | Boltz | SDK | No |
| Lightning ↔ RSK | BTC ↔ RSK | Boltz | SDK | No |
| L-BTC ↔ RSK | Liquid ↔ RSK | Boltz | SDK | No |
| USDT0 RSK → USDT0 Arb | RSK ↔ Arbitrum | LayerZero OFT | SDK | No |
| rBTC → USDT0-Arb (full flow) | RSK → Arbitrum | Loan Flow (MoC+DEX+Bridge) | SDK | No |

---

## 5. Overlap Analysis: What Needs to Move

Based on the overlap analysis between BitTasker-V2 and wallet-core-v2:

### 4.1 Code That Should Move to SDK

| What | Frontend Location | Why |
|---|---|---|
| ERC-20 transfer/approve/swap encoding | `swap-chain/abi.ts` | Generic utility, used in multiple places |
| ERC-20 balance polling utility | `swap-chain/tx-helpers.ts` | Generic utility for waiting on token balances |
| Multi-chain USDT address map | `external-wallet/chain-utils.ts` | Single source of truth for addresses |
| USD → ERC-20 wei conversion | `send-execution.service.ts` | Pure math, chain-agnostic |
| EIP-7702 delegation (core signing only) | `gas-abstraction/eip7702-delegation-manager.ts` | Pure blockchain operation (NOT the lifecycle/persistence) |

### 4.2 Code That Should Stay in Frontend

| What | Why |
|---|---|
| EIP-7702 lifecycle management, journal, app resume | Capacitor-specific, app-specific |
| Gasless store (UserOp construction, backend relay) | Tied to backend relay endpoint |
| Gasless config (fee buffers, treasury address) | Business decisions |
| DeFi integrations (Aave, Uniswap, OpenOcean) | App-specific, not generic wallet ops |
| Route resolver / Smart Router | Tightly coupled to app providers |
| External wallet connectors | App-specific (MetaMask, WalletConnect, etc.) |
| Svelte stores, runes, components | UI layer |
| Escrow fee calculation | BitTasker-specific business logic |
| Verified token list | App-specific curation |

### 4.3 Duplicated Code to Consolidate

| Duplication | Frontend Files | SDK | Action |
|---|---|---|---|
| **ArbitrumWallet** | `src/wallet/arbitrum-wallet.ts` | `src/chains/arbitrum/ArbitrumWallet.ts` | Two competing implementations. Frontend version is battle-tested — use it as source of truth for SDK |
| **Token registries** | `verified-tokens.ts`, `token-registry.ts`, `gasless.config.ts` | `ARB_TOKEN_ADDRESSES`, `RSK_TOKENS` | 3 competing registries in frontend, none importing from SDK |
| **ERC20 ABI** | `swap-chain/abi.ts`, `chain-utils.ts`, `arbitrum-wallet.ts` (4 copies) | `ERC20_ABI` | Should import from SDK |
| **Types** | `src/lib/types/wallet.d.ts` | `core/types.ts` | `ERC20Token`, `PaymasterConfig`, `TokenBalance` duplicated |
| **USDT0 address** | 6+ frontend files | `ARB_TOKEN_ADDRESSES` | Should import from SDK |

### 4.4 SDK Exports and Usage Status

These SDK exports and their usage by the frontend:

| Export | Status | Notes |
|---|---|---|
| `RifRelayClaimService` + RIF Relay functions | ✅ Used INTERNALLY by SDK | Called by `ReverseSwapService` and `ChainSwapService` for gasless RBTC claims. Not called directly by frontend — the swap services handle it internally. |
| `ArbitrumWallet` | ✅ Now integrated | Wired into `WalletManager` (init, addresses, balances, dispose) |
| `MoCMintingService` | ✅ Used by LoanFlowOrchestrator | Part of the loan flow state machine |
| `Usdt0BridgeService` | ✅ Used by LoanFlowOrchestrator | Part of the loan flow state machine |
| `RskDexSwapService` | ✅ New | Sovryn DEX for DOC → USDT0 swaps on RSK |
| `LoanFlowOrchestrator` | ✅ New | Full rBTC → DOC → USDT0(RSK) → USDT0(Arb) flow |
| `BSCPaymasterContract` + `PostOpMode` | ⚠️ Legacy | BSC is unused by active product |
| `BSCWallet` | ⚠️ Legacy | BSC is unused by active product |
| `loadBSCTransactions` | ⚠️ Legacy | BSC is unused by active product |

**RIF Relay gasless flow (SDK-internal):**
```
ReverseSwapService.handleSwapUpdate() [transaction.confirmed]
  → checks gas balance
  → if no gas OR swap created with Smart Wallet address:
    → claimRBTCViaRifRelay(swapData, walletSigner)
      → RifRelayClaimService.claimViaRifRelay(params)
        → relayClaimTransaction() → RIF Relay server → txHash
```

The same pattern applies to `ChainSwapService` for chain swap claims. The RIF Relay is a **core part of the Boltz swap flow** — it enables users to receive RBTC from swaps without needing existing RSK gas. This is different from the EIP-4337/7702 system which handles USDT gas payment on Arbitrum.

**Dual gasless approach (intentional design):**
- **RIF Relay (RSK, SDK-side):** For Boltz swap claims. User swaps Lightning → RBTC, SDK claims via Smart Wallet if user has no gas. Uses RIF Relay server at `boltz.mainnet.relay.rifcomputing.net`.
- **EIP-4337/7702 Paymaster (Arbitrum, Backend-side):** For USDT operations. User sends USDT on Arbitrum, frontend builds UserOp, backend signs paymaster, Alto bundler submits. Uses NestJS backend + VerifyingPaymaster contract.

These are separate because they target different chains (RSK vs Arbitrum) and have different trust models (RIF Relay is public infrastructure, paymaster requires server-side secrets).

### 4.5 What Other Devs Would Expect from a Public Wallet SDK

A developer using `@bittasker/wallet-core` would expect:

1. **Create a wallet** from mnemonic or generate one
2. **Get balances** on RSK and Arbitrum (native + ERC-20)
3. **Send tokens** (RBTC, ETH, USDT0, WBTC, tBTC)
4. **Execute swaps** (Lightning ↔ on-chain via Boltz)
5. **Bridge tokens** (USDT0 RSK ↔ Arbitrum via LayerZero)
6. **Use ERC-20 utilities** (encode transfers, check allowances, poll balances)
7. **Validate addresses** (EIP-1191 for RSK, EIP-55 for EVM)
8. **Estimate gas** for transactions
9. **Monitor swap status** via WebSocket events
10. **Access token configs** (addresses, decimals, ABIs)

They would NOT expect:
- Backend API calls
- App-specific business logic
- Framework dependencies
- Capacitor/mobile-specific code

---

## 6. Frontend Bugs (BitTasker-V2)

### 5.1 Console Spam — Reactive Cascade Loop

**Severity:** Medium
**Files:** `BalanceHistory.svelte`, `balanceHistory.service.ts`, `wallet-balances.ts`

Console is flooded with repeating warnings every ~30 seconds:

```
[TokenBalanceService] Force refresh requested - bypassing cache
[WALLET-STORE] committing assets: rbtc, usdt0-arb, wbtc-arb, bnb
[BalanceHistoryService] Failed to fetch stablecoin balances (non-archive RPC)
```

**Root cause chain:**
```
onBlock (~30s) → scheduleBalanceRefresh() → loadAssets() → walletStore.update()
    ├── rskUsd recomputes ($derived.by reads $totalBalances, $allAssets)
    ├── $effect re-runs (reads $walletStore.rsk.provider) → sets currentRpcSats
    └── balanceChangesPromise recomputes (2+ times per cycle)
        └── getBalanceChanges() → fetchStablecoinUsdAtBlock() × 3 blocks → all fail → console.warn
```

**Bug 5.1a:** `balanceChangesPromise` ($derived.by) creates a new Promise on every evaluation with no deduplication.
- **File:** `BalanceHistory.svelte:117–129`
- **Fix:** Use `$effect` with explicit change detection instead of `$derived.by` for async operations.

**Bug 5.1b:** `fetchStablecoinUsdAtBlock()` failure not cached. Public RSK nodes are non-archive — the call will always fail.
- **File:** `balanceHistory.service.ts:87–89`
- **Fix:** Log once per session, or downgrade to debug level.

**Bug 5.1c:** `loadAssets()` always passes `forceRefresh=true` for RSK tokens, ignoring its own `forceRefresh` parameter.
- **File:** `wallet-balances.ts:123`
- **Fix:** Change `getRSKTokenBalances(walletAddress, true)` to `getRSKTokenBalances(walletAddress, forceRefresh)`.

**Bug 5.1d:** Triple-trigger amplification — single `walletStore.update()` fires three independent reactive nodes.
- **File:** `BalanceHistory.svelte:49–129`
- **Fix:** Consolidate into a single reactive chain with change detection.

### 5.2 Duplicate ArbitrumWallet Implementation

**Severity:** Medium
**Files:** `src/wallet/arbitrum-wallet.ts` (frontend) vs `src/chains/arbitrum/ArbitrumWallet.ts` (SDK)

The frontend has its own `ArbitrumWallet` class that is nearly identical to the SDK's. Neither imports from the other. This creates drift risk and doubles maintenance burden.

**Fix:** Consolidate into the SDK. The frontend version is battle-tested and should be used as the source of truth.

### 5.3 Three Competing Token Registries

**Severity:** Medium
**Files:**
- `src/lib/data/verified-tokens.ts` — Full multi-chain token registry
- `src/lib/services/route-engine/token-registry.ts` — Route-engine-specific tokens
- `src/wallet/gasless.config.ts` — Gasless-specific Arbitrum token addresses

None of these import from the SDK's `ARB_TOKEN_ADDRESSES` or `RSK_TOKENS`. The SDK has a commented-out import in `gasless.config.ts`.

**Fix:** Consolidate token addresses into the SDK as single source of truth. Frontend should import from SDK.

### 5.4 Additional Frontend Console Noise

| Message | Source | Cause |
|---|---|---|
| `WebSocket connection to '<URL>' failed` | NDK Nostr relay connections | Relay unreachable or connection closed before established |
| `POST /api/v1/reminders/enrich 401` | `apiService.ts:68` | Unauthenticated API call from notification center |
| `GET /api/v1/notification-center/unread-count 401` | `apiService.ts:51` | Unauthenticated API call from layout polling |

### 5.5 CRITICAL: USDT0-Arbitrum Balance Displayed as ~$0 for Connected Wallets

**Severity:** CRITICAL
**File:** `src/lib/runes/use-swap-wallets.svelte.ts` (lines 265, 400, 420, 498-500)

USDT0 on Arbitrum has **6 decimals**, but the code divides by `1e18`:
```typescript
// Line 265 — connected wallet balance display
Number(w.balances['usdt0-arb']?.raw ?? 0) / 1e18  // WRONG: should be 1e6

// Line 400 — source balances for swap
Number(w?.balances?.['usdt0-arb']?.raw ?? 0) / 1e18

// Line 420 — dest balances for swap
Number(w?.balances?.['usdt0-arb']?.raw ?? 0) / 1e18

// Lines 498-500 — getUsdtHumanFromConnected helper
/ 1e18  // WRONG: should be 1e6
```

**Impact:** All connected wallets (MetaMask, Trezor, Ledger, WalletConnect) show ~$0.00 USDT0 balance on Arbitrum. Swap source/dest balance calculations for connected wallets are also wrong by a factor of 10^12.

**Note:** The frontend gasless-helpers decimal bug (F-TODO-4) was fixed in v5. This is a separate instance in `use-swap-wallets.svelte.ts` that was missed.

### 5.6 CRITICAL: Changelly Swap Lifecycle Is Dead Code

**Severity:** CRITICAL
**File:** `src/lib/stores/swap.store.ts`

The entire Changelly swap lifecycle store (`initiateSwap`, `confirmAndCreateSwap`, `pollSwapStatus`) is **never imported by any component**. The `swapStore` export has zero consumers.

The `SwapForm.svelte` uses the route-engine + `executeSwapChain` path instead. Changelly is only used for currency discovery in `ReceiveSwapSelector.svelte` (calling `getCurrencies()`), not for actual swap execution.

**Impact:** If the route-engine Changelly provider + executor path works, this is harmless dead code. But it means the dedicated Changelly lifecycle (estimate → confirm → poll → complete) was built but never connected.

### 5.7 CRITICAL: Loan Flow Service Has No UI Entry Point

**Severity:** CRITICAL
**File:** `src/lib/services/loan-flow.service.ts`

The full loan flow service (rBTC → DOC → USDT0 on RSK → USDT0 on Arbitrum via LayerZero) wraps the SDK's `LoanFlowOrchestrator` but is **never imported by any component**. Functions `executeLoanFlow`, `executeBridgeOnly`, `getLoanFlowQuote`, and `recoverLoanFlow` are all orphaned.

The wallet page's DeFi buttons open `BorrowFlowDrawer` (Aave V3 only), not the loan flow. The `BankingMenu` DeFi handler shows a preview toast ("DeFi is in preview") rather than opening any flow.

**Impact:** Users have no way to access the rBTC → DOC → USDT0 → Arbitrum pipeline from the UI.

### 5.8 CRITICAL: USDTBalance.svelte Is Dead Code

**Severity:** CRITICAL (low impact — dead code)
**File:** `src/lib/components/wallet/USDTBalance.svelte`

Not imported by any component. Only shows BSC USDT balance (`$walletStore.bsc.formattedUsdtBalance`). Does not display RSK USDT0 or Arbitrum USDT0. The `BalanceCard.svelte` correctly shows USDT0 balances on all chains.

### 5.9 HIGH: `fetchSubmarineFee` Percentage Fee Always Zero

**Severity:** HIGH
**File:** `src/lib/services/SmartRouter.ts:971`

```typescript
Math.round((pair.fees.percentage / 100) * 0 + pair.fees.minerFees) + 50
//                                        ^^^
//                    This * 0 nullifies the percentage-based fee
```

The function doesn't accept `amountSats` as a parameter, so it cannot compute a percentage-based fee. Result is always `minerFees + 50` regardless of swap amount.

**Impact:** Submarine fee estimates for Boltz linked routes show only the fixed miner fee component, underestimating the actual cost.

### 5.10 HIGH: Hardcoded BTC Price ($73,000) in SmartRouter

**Severity:** HIGH
**File:** `src/lib/services/SmartRouter.ts:304,701`

```typescript
const approxBtcPrice = 73_000;  // Line 304
const approxBtcPrice = 73_000;  // Line 701
```

Used for USDT↔sats conversions in `buildReverseLifiRoute` and `buildBoltzLifiUsdtRoute`.

**Impact:** All USDT↔BTC swap quotes use a stale BTC price. As BTC price moves from $73k, quotes become increasingly inaccurate.

### 5.11 MEDIUM: Wrong Network Labels on Arbitrum Token Balances

**Severity:** MEDIUM
**File:** `src/lib/stores/wallet/wallet-balances.ts`

| Line | Token | Tagged As | Should Be |
|------|-------|-----------|-----------|
| 272 | USDT0 (Arbitrum) | `network: 'RSK'` | `'Arbitrum'` or `'ARB'` |
| 316 | WBTC (Arbitrum) | `network: 'BSC'` | `'Arbitrum'` or `'ARB'` |
| 328 | WBTC (Arbitrum) | `network: 'BSC'` | `'Arbitrum'` or `'ARB'` |
| 358 | tBTC (Arbitrum) | `network: 'BSC'` | `'Arbitrum'` or `'ARB'` |

**Impact:** These labels propagate to the `assets[]` array and could mislead any UI or routing logic that reads `asset.network`.

### 5.12 MEDIUM: GaslessSendFlow Shows $0 on Pending/Success Screens

**Severity:** MEDIUM
**File:** `src/lib/components/wallet/GaslessSendFlow.svelte:278,288`

```typescript
// Line 278-280: Pending screen
<PendingTransactionScreen amountSats={0} amountUSD={0} />

// Line 288-292: Success screen
<TransactionSuccessScreen amount={0} />
```

The actual transfer amount is not passed to these screens. User sees "$0.00" on both pending and success screens for gasless sends.

### 5.13 MEDIUM: No Handler for RSK USDT0 Sends

**Severity:** MEDIUM
**File:** `src/lib/services/send-execution.service.ts:490-498`

`SUPPORTED_NETWORKS` does not include `'usdt0-rsk'` or any RSK USDT variant. `BUILTIN_HANDLERS` and `CONNECTED_HANDLERS` have no entry for RSK USDT0 sends.

**Impact:** Sending USDT0 on RSK is not supported through the send execution service. Users can see their RSK USDT0 balance but cannot send it.

### 5.14 MEDIUM: OpenOcean DEX Service Not Wired Into Route Engine

**Severity:** MEDIUM
**Files:** `src/lib/services/openocean.service.ts`, `src/lib/services/route-engine/`

The OpenOcean DEX aggregator (DOC → USDT0 swaps on RSK) has a full implementation with feature flag `VITE_OPENOCEAN_ENABLED`, but no `openocean.provider.ts` exists in `route-engine/providers/`. It's only used by the legacy `route-resolver-async.ts`, not the new route engine.

**Impact:** OpenOcean routes are not available in the SwapForm's route picker.

### 5.15 LOW: SwapForm Network Mapping Error

**Severity:** LOW
**File:** `src/lib/components/wallet/SwapForm.svelte:143-145`

`_mapSourceToNetwork` maps `wbtc-arb` and `tbtc-arb` to `'rootstock-bitcoin'`. These are Arbitrum assets and should map to an Arbitrum network key. Affects toast notifications for swap progress.

### 5.16 LOW: `process.env` in Browser Code

**Severity:** LOW
**File:** `src/routes/(app)/(protected)/wallet/+page.svelte:57`

```typescript
process.env.NODE_ENV !== 'development'
```

In SvelteKit client-side code, `process.env` may not be available. Should use `import.meta.env.DEV`.

### 5.17 LOW: Non-null Assertion Without Guard

**Severity:** LOW
**File:** `src/lib/stores/wallet/wallet-swaps.ts:59`

```typescript
manager.chainSwapService!.createChainSwap(...)
```

If `chainSwapService` is not initialized, this throws at runtime. The RSK wallet check on line 53 properly guards against null.

---

## 7. Wallet SDK Bugs (wallet-core-v2)

### 6.1 ~~CRITICAL: `mintDoc()` returns wrong value~~ — FIXED

`mintDoc()` now calls `getDocEmission()` to get estimated DOC output before executing the transaction.

### 6.2 ~~CRITICAL: `redeemDoc()` returns wrong value~~ — FIXED

`redeemDoc()` now uses `staticCall` before execution to estimate rBTC received.

### 6.3 ~~CRITICAL: `estimateDocMint()` fee calculation is meaningless~~ — FIXED

Changed to return `rbtcCost: rbtcAmount` (the actual input cost) instead of a meaningless cross-denomination subtraction.

### 6.4 ~~CRITICAL: No approval before bridge in `bridge()`~~ — FIXED

`bridge()` now explicitly checks `allowance < requiredAllowance` and throws a clear error message. `approveBridge()` uses `AUTO_APPROVE_BUFFER = 1.01` (never `MAX_UINT256`).

### 6.5 ~~HIGH: `retryBridge()` uses wrong message encoding~~ — FIXED

`retryBridge()` rewritten to accept raw message bytes per OFT `retryMessage(token, message, payInLzToken)` signature.

### 6.6 HIGH: Duplicate `satoshiToWei` / `weiToSatoshi` implementations

- `src/utils/networkConfig.ts` — `weiToSatoshi` returns `number`
- `src/swaps/rif/rootstock.ts` — `weiToSatoshi` returns `BigInt`

Inconsistent return types can cause silent precision loss.

### 6.7 HIGH: Global singleton network getter

`setNetworkGetter()` sets a module-level variable. If two `WalletManager` instances are created with different networks, the second silently overrides the first. Not safe for concurrent or multi-instance use.

### 6.8 HIGH: `SubmarineSwapRefundService` — BTC and L-BTC refunds NOT IMPLEMENTED

`refundBTC()` and `refundLBTC()` both throw `'not yet implemented'`. Submarine swaps using BTC or L-BTC cannot be refunded if they fail. RBTC refunds ARE fully implemented.

### 6.9 ~~HIGH: No Arbitrum wallet in `WalletManager`~~ — FIXED

`ArbitrumWallet` is now integrated into `WalletManager` (init, addresses, balances, dispose).

### 6.10 HIGH: No testnet Boltz configuration

`BOLTZ_NETWORKS` only has `regtest` and `mainnet` entries. When `network='testnet'`, `getBoltzConfig()` returns regtest config (localhost URLs). The RIF Relay testnet server URL is also missing.

### 6.11 MEDIUM: Debug `console.log()` in production code

`ReverseSwapService.claimRBTCViaRifRelay()` has multiple `console.log(swapData)`, `console.log({ etherSwapAddress })`, etc. These dump sensitive swap data to production logs.

### 6.12 MEDIUM: Gas estimate fallbacks use hardcoded values

`EvmContractService` falls back to `100000n * 60000000n` (~0.06 gwei). On mainnet during congestion, transactions will be underpriced.

### 6.13 MEDIUM: `ArbitrumWallet` testnet has no token configurations

`ARB_NETWORKS.testnet.tokens` is an empty array. Cannot test USDT0, WBTC, or tBTC on Arbitrum Sepolia.

### 6.14 LOW: `TransactionInterface` typed as `any`

```typescript
export type TransactionInterface = any;
```

### 6.15 LOW: Dead dependency — `axios`

`axios` v1.8.4 is listed in `package.json` but never imported.

### 6.16 LOW: BSC Explorer API URL Points to Etherscan — OUT OF SCOPE

**File:** `src/utils/networkConfig.ts:224`
**Status:** BSC is legacy/unused by the active product. This is harmless and will be addressed separately when BSC support is removed.

### 6.17 HIGH: Post-Swap Output Estimation Returns Wrong Value

**File:** `src/loans/RskDexSwapService.ts:213-218`

After swap execution, `getAmountsOut()` is called with the same input amount. But post-swap reserves have changed, so the result differs from what the user actually received. Should parse `Swap` event logs from the receipt instead.

**Impact:** Loan flow reports wrong DOC→USDT0 output amounts after the swap step completes.

### 6.18 HIGH: Loan Flow `recover()` Restarts From Scratch

**File:** `src/loans/LoanFlowOrchestrator.ts:344`

`executeFullFlow()` always creates fresh initial state at line 195, overwriting any recovered progress from saved state. If a multi-step loan flow fails mid-way (e.g., mint succeeded but DEX swap failed), recovery starts from step 1 instead of resuming at step 2.

**Fix:** `recover()` should check which steps are already completed and skip them.

### 6.19 MEDIUM: `estimatedUsdt0OnArbitrum` Doesn't Deduct Bridge Fee

**File:** `src/loans/LoanFlowOrchestrator.ts:169`

Bridge fee is never subtracted from the estimated output. The quote claims the user receives the full pre-bridge amount. The `quoteBridge()` call happens but its fee is not subtracted from the estimate.

### 6.20 MEDIUM: Silent Mainnet Address Fallback on Testnet for Bridge Service

**File:** `src/loans/LoanFlowOrchestrator.ts:82-84`

```typescript
const usdt0Token = getRSKToken('USDT0');
this.bridgeService = config.bridgeService ?? new Usdt0BridgeService(
    usdt0Token?.address ?? '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
```

On testnet, `getRSKToken('USDT0')` returns `undefined` (no USDT0 on RSK testnet in `RSK_TOKENS.testnet`), so it silently falls back to the mainnet address. Bridge calls will fail with a confusing on-chain revert.

### 6.21 MEDIUM: `Usdt0BridgeService` Fragile GUID Extraction

**File:** `src/loans/Usdt0BridgeService.ts:208,445`

```typescript
const guid = receipt.logs?.[0]?.topics?.[1] ?? '0x';
```

Assumes the LayerZero GUID is always in the first log's second topic. If the OFT contract emits other events before the `PacketSent` event (e.g., ERC-20 Transfer), this extracts the wrong value.

### 6.22 ~~MEDIUM: `WalletManager` WebSocket Race Condition~~ — NOT A BUG

The `connectWebSocket()` call from the synchronous getter is intentional and well-tested in production. The `if (!this._websocket) throw` guard handles the case correctly. Changing this would introduce bugs. Removed from priority matrix.

### 6.23 MEDIUM: `Usdt0BridgeService` Error Says "ETH" on RSK

**File:** `src/loans/Usdt0BridgeService.ts:327-329`

```typescript
if (ethBalance === BigInt(0)) {
    throw new Error('Insufficient ETH balance');
```

On RSK, the native currency is RBTC, not ETH. The error message is misleading.

### 6.24 MEDIUM: `tokenWeiToUsd` Precision Loss for Large Balances

**File:** `src/utils/erc20.ts:297-298`

```typescript
const divisor = 10 ** decimals;
return Number(tokenWei) / divisor;
```

For `decimals = 18`, `10 ** 18` exceeds `Number.MAX_SAFE_INTEGER` (2^53). `Number(tokenWei)` itself will lose precision for balances > ~9007 ETH/token. Same issue in `formatTokenAmount` (line 314). Should use `ethers.formatUnits()` or return a `string`.

### 6.25 LOW: Missing Exports from `index.ts`

`TIMELOCK_PERIODS`, `LIQUID_ASSET_IDS`, and `getLiquidAssetId()` from `networkConfig.ts` are NOT exported from `index.ts`. `ContractTransactionResult` and `ContractConfig` from `core/types.ts` are also not exported.

### 6.26 LOW: Self-Dependency in `package.json`

**File:** `package.json:70`

```json
"@bittasker/wallet-core": "file:bittasker-wallet-core-0.2.0.tgz"
```

The package lists **itself** as a dependency. This will cause install loops or phantom resolution. Must be removed.

---

## 8. Backend Bugs (bittasker-nestjs)

**Note:** The backend is private BitTasker infrastructure. These bugs do not affect the public SDK.

### 8.1 ~~CRITICAL: USDT0 decimals bug~~ — FIXED

The backend config had USDT0 with 18 decimals instead of 6. Fixed: `decimals: 6`, `FEE_BUFFER_MIN: 10_000n`, `FEE_BUFFER_MAX: 150_000n`. All tests updated and passing.

### 8.2 ~~CORS patterns updated~~ — FIXED

Added `capacitor://bittasker.com`, `capacitor://localhost`, `BitTasker://localhost`, and `file:` to the whitelist.

### 8.3 ~~JWT expiration~~ — FIXED

Changed from `1d` to `15m` in `auth.module.ts`.

### 8.4 ~~Changelly swap bugs~~ — FIXED

Rate calculation, address validation, and `updatedAt` field all fixed. 21 new unit tests added.

### 8.5 Silent error swallowing

**File:** `src/changelly-swap/changelly-swap.service.ts`
```typescript
await this.prisma.swapTransaction
  .update({ where: { changellyId: id }, data: { status: result.status } })
  .catch(() => {});  // Silent catch, no logging
```

### 8.6 No testnet/mainnet toggle for gasless relay

All addresses hardcoded to Arbitrum One (chainId 42161). No configuration mechanism for Arbitrum Sepolia.

### 8.7 Balance check returns `sufficient: true` when no sender

**File:** `src/gasless/gasless.service.ts` — When no sender address is provided, always returns sufficient.

### 8.8 Changelly swap API keys NOT configured

`CHANGELLY_API_KEY` and `CHANGELLY_API_SECRET` are empty in `.env`. The fiat API keys are working. Swap API needs keys provisioned from Changelly Exchange dashboard.

### 8.9 Missing test coverage for gasless modules

No tests for gasless endpoints, paymaster signer, preflight simulation, deposit monitor, Chainlink oracle, or rate limiter.

### 8.10 HIGH: Floating-Point Precision in Fee Calculation

**File:** `src/gasless/gasless.config.ts:156`

```typescript
const feeUSDWei = BigInt(Math.round(feeUSD * 1e18));
```

`feeUSD * 1e18` exceeds `2^53` (JavaScript's exact integer limit) for any `feeUSD ≥ 0.0091`. The `Math.round()` may return imprecise values.

The meta-tx-relay correctly uses string-based conversion. NestJS should do the same.

**Impact:** Fee amounts could be off by a few wei. Not catastrophic but introduces non-determinism between the two relay systems.

### 8.11 HIGH: Estimate Creates Duplicate Treasury Transfers

**File:** `src/gasless/gasless.service.ts:447-471`

The `buildCallData` helper for simple token transfers creates **three calls**:
1. Transfer to recipient (line 448-452)
2. Transfer to GAS_TREASURY with hardcoded `1000000000000000` (line 453-459)
3. Fee buffer transfer to GAS_TREASURY (line 463-471, appended last)

The actual relay uses client-built callData with only **two calls** (transfer + fee). The estimation callData has an extra treasury transfer, inflating gas estimates.

### 8.12 MEDIUM: `GAS_TREASURY` Defaults to Empty String

**File:** `src/gasless/gasless.config.ts:92-98`

`GAS_TREASURY` defaults to empty string with only a `console.warn`. The service starts normally and would fail at runtime when users try to estimate/relay. Should throw on startup or disable the gasless module.

### 8.13 MEDIUM: Estimate Doesn't Handle AA23 Errors

**File:** `src/gasless/gasless.service.ts:229`

Only catches `AA20` (account not deployed). The meta-tx-relay also handles `AA23` (account validation failure). The NestJS version throws a generic error for AA23 cases that the meta-tx-relay handles gracefully with fallback gas estimates.

---

## 9. Contracts / Relay Bugs (meta-tx-relay)

> **⚠️ CRITICAL SENSITIVITY WARNING:** The meta-tx-relay Cloudflare Worker code is **production infrastructure** that supports both the RSK escrow relay (Boltz swap claims) and the Arbitrum gasless relay (USDT operations). The RSK relay code (`relayController.js`, `blockchain.js`) has been in production for months and MUST NOT be modified. Only the Arbitrum gasless modules and the new VerifyingPaymaster contract should be touched.

> **VerifyingPaymaster.sol is a NEW contract** — it was created for the USDT gasless implementation and has not been deployed to mainnet yet. It is safe to modify.

### C3 Documented: callData Encoding Mismatch — No Collision

**Confirmed: The NestJS and meta-tx-relay Arbitrum gasless systems do NOT collide.** They are completely separate paths that never interact.

| System | Selector | ABI Encoding | Status |
|--------|----------|-------------|--------|
| NestJS (`gasless.service.ts:468`) | `0x34fcd5be` | `executeBatch((address,uint256,bytes)[])` — tuple array | **Active production path** — frontend exclusively calls NestJS |
| meta-tx-relay (`gasless.js:277`) | `0x8d80ff0a` | `execute(address[],uint256[],bytes[])` — parallel arrays | **Unused** — never called by frontend |

**Why no collision:** The frontend (`gasless-store.ts:310-313`) sends UserOps exclusively to `VITE_TX_RELAY_BASE_URL` which points to the NestJS backend. The meta-tx-relay's Arbitrum gasless endpoints (`/gasless/*`) are a parallel implementation that was never wired to the frontend. The RSK relay (`POST /relay`) in meta-tx-relay is completely separate — it relays `executeMetaTransaction()` calls to the escrow contract on Rootstock, not ERC-4337 UserOps.

**Risk:** If meta-tx-relay is ever used as a backup relay for Arbitrum gasless, it will reject all requests due to the selector mismatch. Low risk today since it's not wired. The deployed account contract at `0xe6Cae83BdE06E4c305530e199D7217f42808555B` must support the tuple array encoding (`0x34fcd5be`) for the active production path to work.

### Dead Code Documentation

| File | Status | Why |
|------|--------|-----|
| `BitTasker-V2/src/lib/components/wallet/USDTBalance.svelte` | **Dead code** | Zero imports anywhere in codebase. Only shows BSC USDT balance. `BalanceCard.svelte` correctly shows USDT0 on all chains. |
| `BitTasker-V2/src/lib/wallet/gasless-helpers.ts` parallel-arrays ABI | **Unused for relay** | The `executeBatch(address[],uint256[],bytes[])` ABI at line 26-28 is never used for building relay callData. The active path uses `gasless-store.ts`'s tuple ABI (`0x34fcd5be`). |
| `BitTasker-V2/src/lib/stores/swap.store.ts` | **Dead code** | The entire Changelly swap lifecycle (`initiateSwap`, `confirmAndCreateSwap`, `pollSwapStatus`) has zero consumers. SwapForm uses route-engine + `executeSwapChain` instead. |

### 8.1 CRITICAL: Paymaster signature hash mismatch — FIXED (v5)

The **on-chain VerifyingPaymaster** computes:
```solidity
hash = keccak256(abi.encode(sender, nonce, keccak256(callData), entryPoint, block.chainid))
```

The **off-chain paymasterSigner.js** computes:
```javascript
hash = keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData),
    accountGasLimits, preVerificationGas, gasFees, chainId, paymasterAddress, validUntil, validAfter))
```

These are **completely different hash formats**. The off-chain signer uses the Coinbase v0.7 format while the on-chain contract uses a simplified format. **Signatures will NOT validate.** This is deployment-blocking.

### 8.2 HIGH: CORS allows all origins

```javascript
'Access-Control-Allow-Origin': '*'
```
For a relay that pays real gas money, this should be restricted.

### 8.3 HIGH: No idempotency / duplicate protection

The relay has no mechanism to prevent the same meta-transaction from being submitted twice.

### 8.4 HIGH: No production deployments exist

All contract deployments are local-only:
- `ESCROW_ADDRESS` — empty in mainnet wrangler.toml
- `PAYMASTER_ADDRESS` — empty in mainnet wrangler.toml
- `GAS_TREASURY` — empty in mainnet wrangler.toml
- `ALTO_URLS` — empty in mainnet wrangler.toml

### 8.5 MEDIUM: Rate limiter is per-isolate (not shared)

In-memory rate limiter uses module-level `Map()`. Cloudflare Workers run in multiple isolates.

### 8.6 MEDIUM: VerifyingPaymaster returns `bool` instead of `uint256`

In ERC-4337, `validationData` is a packed `uint256`. The contract returns `bool` which may not work with the real EntryPoint v0.8.

### 8.7 LOW: Gasless endpoints have zero test coverage

No tests for any gasless module.

### 8.8 CRITICAL: USDT0 Decimal Mismatch in meta-tx-relay Arbitrum Gasless Config

**File:** `src/gasless/config.js:32`

```javascript
{ address: USDT0_ADDRESS, symbol: 'USDT0', decimals: 18, chainId: ARBITRUM_CHAIN_ID },
//                                                             ^^^^^^^^
//                                                    Should be 6, not 18
```

The NestJS backend correctly uses `decimals: 6`. The meta-tx-relay uses 18.

**Impact:** `convertToTokenFee()` divides by `10^18` instead of `10^6` → fee buffer amounts are 10^12 times too small in real token units. `FEE_BUFFER_MIN`/`FEE_BUFFER_MAX` values are computed assuming 18 decimals, meaning the min/max guardrails are off by 10^12 and effectively useless for USDT0.

**Fix scope:** Only change the USDT0 decimals in the Arbitrum gasless config. Do NOT touch any RSK relay code.

### 8.9 CRITICAL SENSITIVE: callData Selector / ABI Encoding Mismatch Between NestJS and meta-tx-relay

> **⚠️ EXTREME CAUTION REQUIRED:** Both systems are in production. The on-chain account contract (`SIMPLE_7702_ACCOUNT_IMPL`) determines which encoding is correct. Changing the wrong system will break all existing gasless transactions. **Must coordinate: determine which selector the deployed contract expects, then update the OTHER system to match.**

| | NestJS | meta-tx-relay |
|---|---|---|
| Selector | `0x34fcd5be` | `0x8d80ff0a` |
| ABI encoding | `(address,uint256,bytes)[]` (tuple array) | `address[], uint256[], bytes[]` (parallel arrays) |

**Files:**
- `bittasker-nestjs/src/gasless/gasless.service.ts:474` — builds with `0x34fcd5be`
- `bittasker-nestjs/src/gasless/gasless-validation.service.ts:68` — validates against `0x34fcd5be`
- `meta-tx-relay/src/services/gasless.js:277,429` — builds/validates against `0x8d80ff0a`

These are **completely different function signatures** with **incompatible ABI encodings**. A UserOp estimated on one system cannot be relayed by the other.

**Impact:** If the frontend sends callData built for one selector to the other backend, it will be rejected with "callData must be executeBatch". The on-chain account contract (`SIMPLE_7702_ACCOUNT_IMPL`) must support whichever selector is intended.

### 8.10 CRITICAL: VerifyingPaymaster `validationData` Packing Error

**File:** `contracts/src/VerifyingPaymaster.sol:127-131`

```solidity
if (validUntil == 0 && validAfter == 0) {
    validationData = 0;
} else {
    validationData = (uint256(validAfter) << 48) | uint256(validUntil);
}
```

ERC-4337 specifies `validationData` as:
```
bits 208-255: validAfter
bits 160-207: validUntil
bits 0-159:   authorizer (address(0) = valid)
```

The contract packs into bits 0-95 only, leaving the **authorizer field** (bits 0-159) containing the timestamp values instead of `address(0)`.

**Impact:**
- When `validAfter = 0` (as the signing services always produce), `validationData = validUntil`. The EntryPoint treats the timestamp as the authorizer address → time-based expiry is **silently bypassed**.
- Signed paymasterAndData can be **replayed indefinitely** (no time window enforcement).
- If a future EntryPoint version interprets the non-zero authorizer strictly, **all sponsored UserOps would fail**.

**Fix:** Use the correct packing:
```solidity
validationData = (uint256(validAfter) << 208) | (uint256(validUntil) << 160);
```

### 8.11 HIGH: initCode Hash Mismatch Between Contract and meta-tx-relay Signer

**VerifyingPaymaster.sol:107** always hashes empty initCode:
```solidity
keccak256(""),  // always empty
```

**NestJS paymaster-signing.service.ts:144** also always hashes empty:
```typescript
ethers.keccak256(ethers.getBytes('0x')),  // always empty
```

**meta-tx-relay paymasterSigner.js:112-118** reconstructs initCode from factory+factoryData:
```javascript
userOp.initCode
    || (userOp.factory
        ? ethers.concat([userOp.factory, userOp.factoryData || '0x'])
        : '0x')
```

If a UserOp includes `factory`/`factoryData` (for counterfactual deployment), the meta-tx-relay signer will hash non-empty initCode while the contract hashes empty initCode → **signature verification fails**.

For EIP-7702 delegated accounts this is typically moot (no factory), but it's a latent bug for factory-deployed accounts.

### 8.12 MEDIUM: Preflight Simulation Behavioral Drift

| | NestJS | meta-tx-relay |
|---|---|---|
| Behavior | **Non-blocking** (catch + log warning, continue) | **Blocking** (throws, rejects relay) |
| File | `gasless.service.ts:123-131` | `services/gasless.js:185` |

The NestJS relay may submit UserOps that fail preflight simulation, wasting gas on reverted transactions. The meta-tx-relay may reject valid UserOps if the preflight RPC has transient issues.

### 8.13 MEDIUM: meta-tx-relay Creates New Provider Instances Per Request

**Files:** `chainlinkOracle.js:58-60`, `services/gasless.js:221`, `depositMonitor.js:34`, `preflightSimulation.js:23`

Every RPC call creates a new `ethers.JsonRpcProvider` instance. The NestJS version creates providers once in constructors and reuses them.

---

## 10. Frontend TODOs (from changelly-gasless-plan)

These were identified in the `feat/usdt-abstractionkit` branch audit (`bittasker-nestjs/.kilo/plans/changelly-gasless-plan.md`). They are frontend issues that need to be addressed in BitTasker-V2.

### F-TODO-1: ~~USDT0 decimals bug in backend~~ — FIXED

The backend config had USDT0 with 18 decimals instead of 6. Fixed: `decimals: 6`, `FEE_BUFFER_MIN: 10_000n`, `FEE_BUFFER_MAX: 150_000n`. All tests updated and passing.

### F-TODO-2: On-chain balance verification not implemented

**File:** `fiat-swap-orchestrator.service.ts:446` (frontend)

`checkCryptoArrived()` returns `true` unconditionally after Changelly reports "complete". If Changelly's API says "complete" but the on-chain transfer fails or is delayed, the user's fiat flow will incorrectly proceed.

### F-TODO-3: Auto-swap for rBTC path is placeholder

**File:** `fiat-swap-orchestrator.service.ts:518-563` (frontend)

Two functions are stubs:
- `executeWbtcToTbtc()` — Symbiosis quote is fetched but transaction is NOT submitted. Returns a fake `swapId`.
- `executeTbtcToRbtc()` — Boltz swap is created but tBTC is NOT sent to the lockup address.

**Impact:** The "Buy rBTC with fiat" flow will fail at the auto-swap step. Users buying rBTC via fiat will get stuck after Changelly delivers WBTC/tBTC.

### F-TODO-4: USDT0 decimals inconsistency between frontend helpers

**Files:** `src/lib/wallet/gasless-helpers.ts` vs `src/wallet/gasless-helpers.ts` (frontend)

Two helper files use different libraries (ethers vs viem) and have different implementations. The ethers version has `MIN_GAS_BUFFER` for USDT0 as `3_000_000_000_000_000n` (18 decimals) while the config says USDT0 has 6 decimals.

**Impact:** Potential 10^12 magnitude error in fee calculations if the wrong helper is used.

### F-TODO-5: Hardcoded placeholder oracle rate in EIP-7702 delegation manager

**File:** `gas-abstraction/eip7702-delegation-manager.ts:682/1505` (frontend)

Uses a hardcoded placeholder rate (`600_000_000_000_000_000_000n`) instead of fetching from a Chainlink oracle feed.

**Impact:** Fee calculations in the EIP-7702 delegation flow use an inaccurate BTC price.

### F-TODO-6: Symbiosis provider disabled — MetaRouter contract reverts

**File:** `route-engine/providers/symbiosis.provider.ts:30-36` (frontend)

`symbiosis.provider.ts` `supports()` returns `false` unconditionally. The MetaRouter contract rejects all swap types with gas limit exhaustion.

**Impact:** All cross-chain routes that previously used Symbiosis fall through to LI.FI or Boltz 2-hop. Reduces route diversity.

### F-TODO-7: Changelly swap webhook not implemented

**Files:** `changelly.service.ts`, `swap-chain/executors/changelly.ts` (frontend)

Changelly swap status is polled every 5s by the frontend. No webhook handler exists for swap status updates. Boltz, LI.FI, and Symbiosis also use polling exclusively.

**Impact:** Increased latency for swap completion detection and unnecessary API calls.

### F-TODO-8: Changelly amount conversion limitation

**File:** `changelly.provider.ts:92-104` (frontend)

When swapping from non-BTC sources (e.g., USDT-BSC), the amount sent to Changelly is the BTC-equivalent, not the exact token amount. This could result in receiving more or less than expected.

### F-TODO-9: Dual gasless-helpers files (viem vs ethers)

**Files:** `src/lib/wallet/gasless-helpers.ts` (ethers) vs `src/wallet/gasless-helpers.ts` (viem)

Two parallel implementations of gasless helpers with different libraries. Risk of drift between them.

### F-TODO-10: Fiat on-ramp auto-swap does not submit transactions

**File:** `fiat-swap-orchestrator.service.ts:518-618` (frontend)

Beyond the Boltz/Symbiosis stubs, the orchestrator's auto-swap pipeline has two additional gaps:
- `executeWbtcToTbtc()` fetches the Symbiosis quote but does NOT submit the transaction
- `executeTbtcToRbtc()` creates the Boltz swap but does NOT send the tBTC to the lockup address

**Impact:** The entire fiat → rBTC auto-swap pipeline is non-functional.

---

## 11. Placeholders & Incomplete Features

| Item | Project | Status | Details |
|------|---------|--------|---------|
| **BTC Submarine Swap Refunds** | SDK | `throw 'not yet implemented'` | `SubmarineSwapRefundService.refundBTC()` |
| **L-BTC Submarine Swap Refunds** | SDK | `throw 'not yet implemented'` | `SubmarineSwapRefundService.refundLBTC()` |
| **RSK Testnet USDT0 address** | SDK | Missing | DOC testnet address added, but USDT0 testnet address still missing |
| **Arbitrum Sepolia token addresses** | SDK | Empty array | No tokens configured for testnet |
| **Boltz testnet config** | SDK | Maps to regtest | No real testnet Boltz endpoints (by design — Boltz has no testnet) |
| **RIF Relay testnet server** | SDK | Missing | No testnet RIF Relay server URL configured |
| **Gasless monitoring/alerting** | meta-tx-relay | NOT IMPLEMENTED | Revert rate, balance thresholds, RPC errors |
| **Gasless idempotency** | meta-tx-relay | NOT IMPLEMENTED | `requestId` specified in plan but never implemented |
| **Mainnet contract deployments** | meta-tx-relay | NOT DEPLOYED | All deployments are local-only. For production: fill wrangler variables |

---

## 12. Missing Features

| Feature | Priority | Owner | Notes |
|---------|----------|-------|-------|
| **Wire loan flow into frontend** | CRITICAL | SDK + Frontend | `LoanFlowOrchestrator`, `MoCMintingService`, `Usdt0BridgeService`, `RskDexSwapService` exist in SDK but are NOT imported or used by the frontend. The frontend route engine has no path through the loan flow. Need to integrate as a new route provider or standalone flow. |
| **Changelly swap UI wiring** | CRITICAL | Frontend | The legacy `swap.store.ts` lifecycle is dead code. The route-engine `changelly.provider.ts` + executor may work, but needs end-to-end verification. |
| **Paymaster hash format alignment** | CRITICAL | meta-tx-relay | On-chain and off-chain must match |
| **USDT0 decimals in meta-tx-relay** | CRITICAL | meta-tx-relay | Config uses 18 decimals, should be 6 |
| **callData encoding alignment** | CRITICAL | NestJS + meta-tx-relay | NestJS uses `0x34fcd5be` (tuple array), meta-tx-relay uses `0x8d80ff0a` (parallel arrays). Must pick one. |
| **Paymaster validationData packing** | CRITICAL | meta-tx-relay | Contract packs timestamps into bits 0-95 instead of bits 160-255. Time-based expiry bypassed. |
| **VerifyingPaymaster testnet deployment** | CRITICAL | meta-tx-relay | Deploy to Arbitrum Sepolia |
| **RSK USDT0 send handler** | HIGH | Frontend | `send-execution.service.ts` has no handler for `usdt0-rsk` sends |
| **Wire OpenOcean into route engine** | HIGH | Frontend | `openocean.service.ts` exists but no `openocean.provider.ts` in route engine |
| **BTC/L-BTC submarine swap refunds** | HIGH | SDK | RBTC refunds work, BTC/L-BTC not implemented |
| **Boltz testnet config** | HIGH | SDK | No testnet API endpoints, falls back to regtest |
| **RSK Testnet USDT0 address** | HIGH | SDK | DOC testnet address exists, USDT0 missing |
| **Arbitrum Sepolia token addresses** | HIGH | SDK | No tokens deployed on Sepolia |
| **Consolidate ArbitrumWallet implementations** | HIGH | SDK + Frontend | Frontend still has its own, SDK version now integrated |
| **Consolidate token registries** | HIGH | SDK + Frontend | 3 competing registries in frontend |
| **Add ERC-20 utilities to SDK** | HIGH | SDK | `encodeERC20Transfer()`, `waitForERC20Balance()` |
| **Add multi-chain USDT address registry to SDK** | HIGH | SDK | Single source of truth |
| **Unit tests for gasless relay** | HIGH | meta-tx-relay | All gasless modules untested |
| **Fix NestJS fee precision** | HIGH | NestJS | `BigInt(Math.round(feeUSD * 1e18))` loses precision for fees ≥ $0.009 |
| **Fix NestJS estimate duplicate treasury transfers** | HIGH | NestJS | `buildCallData` creates 3 calls instead of 2 |
| **Align preflight simulation behavior** | MEDIUM | NestJS + meta-tx-relay | NestJS is non-blocking, meta-tx-relay is blocking |
| **Arbitrum transaction history loading** | MEDIUM | SDK + Frontend | `loadArbitrumTransactions` exists in SDK, needs frontend integration |
| **EIP-7702 core signing in SDK** | MEDIUM | SDK | Extract from frontend `gas-abstraction/` |
| **Structured logging** | MEDIUM | SDK | Replace console.* calls with proper logging |
| **Duplicate submission protection** | MEDIUM | meta-tx-relay | Prevent re-relay of same meta-tx |
| **CORS restriction** | MEDIUM | meta-tx-relay | Restrict to BitTasker origins |
| **USD → ERC-20 conversion utility in SDK** | LOW | SDK | Pure math utility |

---

## 13. Resources & Documentation Links

### ERC-4337 / Account Abstraction
- **ERC-4337 Spec:** https://eips.ethereum.org/EIPS/eip-4337
- **EntryPoint v0.8 Address:** `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` (all chains)
- **EntryPoint v0.8 Release:** https://github.com/eth-infinitism/account-abstraction/releases
- **ERC-4337 Docs:** https://docs.erc4337.io
- **Alto Bundler (Pimlico):** https://docs.pimlico.io/references/bundler/usage
- **Pimlico Dashboard:** https://dashboard.pimlico.io

### EIP-7702 (EOA Delegation)
- **EIP-7702 Spec:** https://eips.ethereum.org/EIPS/eip-7702
- **Safe EIP-7702 Guide:** https://docs.safe.global/advanced/eip-7702/overview
- **Arbitrum EIP-7702 Blog:** https://blog.arbitrum.foundation/the-smartest-wallet-you-already-own-is-on-arbitrum
- **Fireblocks Awesome EIP-7702:** https://github.com/fireblocks-labs/awesome-eip-7702

### USDT0
- **USDT0 Docs:** https://docs.usdt0.to
- **USDT0 Deployments:** https://docs.usdt0.to/technical-documentation/deployments
- **USDT0 Transfer Tutorial:** https://docs.usdt0.to/tutorial/how-to-transfer
- **Arbitrum USDT0:** https://arbiscan.io/token/0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9
- **RSK USDT0:** https://rootstock.blockscout.com/address/0x779Ded0c9e1022225f8E0630b35a9b54bE713736

### LayerZero
- **LayerZero Docs:** https://docs.layerzero.network
- **OFT Standard:** https://docs.layerzero.network/contracts/oft
- **Endpoint Addresses:** https://docs.layerzero.network/contracts/endpoint-addresses
- **LayerZero Scan (message tracking):** https://layerzeroscan.com

### Money on Chain (MoC)
- **MoC Protocol Docs:** https://developers.moneyonchain.com
- **MoC Contract Addresses:** https://developers.moneyonchain.com/protocol/deployed-contracts
- **DOC Token (RSK):** https://rootstock.blockscout.com/address/0xe700691dA7b9851F2F35f8b8182c69c53CcaD9Db

### Arbitrum
- **Arbitrum Docs:** https://docs.arbitrum.io
- **Arbitrum Sepolia Faucet:** https://faucets.chain.link/arbitrum-sepolia
- **Arbiscan:** https://arbiscan.io
- **Arbiscan Sepolia:** https://sepolia.arbiscan.io
- **Arbitrum Contract Addresses:** https://docs.arbitrum.io/arbitrum-essentials/reference/contract-addresses

### RSK / Rootstock
- **RSK Docs:** https://dev.rootstock.io
- **RSK Testnet Faucet:** https://faucet.rsk.co
- **RSK Explorer:** https://rootstock.blockscout.com

### Boltz Exchange
- **Boltz API Docs:** https://api.docs.boltz.exchange
- **Boltz Status:** https://boltz.exchange

### Tether
- **Tether Website:** https://tether.to
- **Tether Supported Protocols:** https://tether.to/en/supported-protocols

### Chainlink
- **Chainlink Data Feeds:** https://docs.chainlink.cc/data-feeds
- **Arbitrum Price Feeds:** https://docs.chainlink.cc/data-feeds/price-feeds/addresses#arbitrum

### ERC-4337 Infrastructure Providers (2026)
- **Pimlico:** https://docs.pimlico.io — Bundler + Paymaster
- **Alchemy:** https://www.alchemy.com — Bundler + Account Kit
- **Biconomy:** https://www.biconomy.io — Bundler + Paymaster
- **ZeroDev:** https://zerodev.app — Smart wallet infra
- **Stackup:** https://www.stackup.sh — Bundler
- **Candide:** https://www.candide.dev — Bundler + Paymaster
- **Etherspot:** https://etherspot.io — Bundler
- **Coinbase Developer Platform:** https://www.coinbase.com/developer-platform

---

## 14. Testing Guide: Regtest & Mainnet

### 14.1 Testing Strategy

The focus is on testing the **new USDT features** (MoC minting, DEX swap, bridge, loan flow, gasless) on regtest (local development) before mainnet. Boltz swaps are already production-tested and out of scope for this testing phase.

**Boltz does NOT support testnet.** This is by design — Boltz's infrastructure only runs on mainnet and regtest. For Boltz testing, use regtest with a local Boltz instance. This is NOT a bug.

### 14.2 Regtest Testing (Local Development)

Regtest is your local development laptop. The goal is to simulate production behavior locally.

#### What You Need for Regtest

1. **RSK Regtest node** — Local Rootstock node (chainId 33)
2. **Arbitrum Regtest node** — Local Arbitrum node (via Anvil/Hardhat fork)
3. **Mock contracts:**
   - Mock USDT0 (6 decimals) on both RSK and Arbitrum
   - Mock OFT contracts for LayerZero bridge
   - Mock MoC Core v2 for DOC minting
   - Mock Sovryn router for DEX swaps
4. **Mock Alto bundler** — For gasless relay testing
5. **Mock VerifyingPaymaster** — For EIP-4337 testing

#### Regtest: Loan Flow Testing

```typescript
import { LoanFlowOrchestrator } from '@bittasker/wallet-core';

// Configure for regtest
const orchestrator = new LoanFlowOrchestrator({
    rskSigner: regtestWallet,
    rskProvider: regtestProvider,
    arbRecipientAddress: arbWallet.address,
    // Override contract addresses for regtest
    mocAddress: mockMoCAddress,
    dexRouterAddress: mockSovrynAddress,
    oftAddress: mockOFTAddress,
    usdt0Address: mockUSDT0Address
});

// Execute full flow
const quote = await orchestrator.getQuote(ethers.parseEther('0.01').toString());
const result = await orchestrator.executeFullFlow(
    ethers.parseEther('0.01').toString(),
    1 // 1% slippage
);
```

#### Regtest: Gasless Testing

```typescript
// Start local Alto bundler
// Deploy mock VerifyingPaymaster
// Configure backend with local Alto URL

// Frontend builds UserOp and sends to local backend
// Backend signs paymaster and submits to local Alto
// Alto bundles and submits to local Arbitrum node
```

#### Regtest: DEX Swap Testing

```typescript
import { RskDexSwapService } from '@bittasker/wallet-core';

// Deploy mock Sovryn router with DOC/USDT0 pool
const dexService = new RskDexSwapService({
    routerAddress: mockSovrynAddress,
    factoryAddress: mockFactoryAddress
});

const quote = await dexService.getQuote(docAddress, usdt0Address, amount, wallet);
const result = await dexService.swap(docAddress, usdt0Address, amount, quote.minOutputAmount, wallet);
```

### 14.3 What CAN Be Tested Now (Mainnet)

#### RSK Wallet
```typescript
import { WalletManager } from '@bittasker/wallet-core';

const manager = new WalletManager({ network: 'mainnet', mnemonic: '...' });
await manager.initialize();
const balance = await manager.getRSKWallet().getBalance();
```

#### Arbitrum Wallet
```typescript
import { ArbitrumWallet } from '@bittasker/wallet-core';

const wallet = new ArbitrumWallet({ network: 'mainnet' });
await wallet.initialize('your mnemonic here');
const balances = await wallet.getBalances();
const txs = await wallet.loadTransactions('optional-arbiscan-api-key');
```

#### Loan Flow (Mainnet — small amounts)
```typescript
import { LoanFlowOrchestrator } from '@bittasker/wallet-core';

const orchestrator = new LoanFlowOrchestrator(config);
const quote = await orchestrator.getQuote(ethers.parseEther('0.001').toString());
console.log('Estimated USDT0 on Arbitrum:', quote.estimatedUsdt0OnArbitrum);

orchestrator.onStateChange((state) => {
    console.log('Phase:', state.phase);
});

const result = await orchestrator.executeFullFlow(
    ethers.parseEther('0.001').toString(), // Small amount for testing
    1 // 1% slippage
);
```

### 14.4 What CANNOT Be Tested Yet

1. **USDT0 on Arbitrum Sepolia** — Token not deployed on testnet (platform limitation)
2. **RSK Testnet USDT0** — USDT0 testnet address not configured (DOC testnet address exists)
3. **Boltz swaps on testnet** — Boltz does NOT support testnet (only mainnet + regtest)
4. **Gasless relay** — Paymaster not deployed, hash mismatch, Alto not running
5. **BTC/L-BTC submarine swap refunds** — Not implemented
6. **RIF Relay on testnet** — No testnet RIF Relay server URL

### 14.5 Regtest Setup Checklist

- [ ] RSK Regtest node running (chainId 33)
- [ ] Arbitrum Regtest node running (Anvil fork of Arbitrum One)
- [ ] Mock USDT0 deployed on RSK Regtest (6 decimals)
- [ ] Mock USDT0 deployed on Arbitrum Regtest (6 decimals)
- [ ] Mock OFT contracts deployed on both chains
- [ ] Mock MoC Core v2 deployed on RSK Regtest
- [ ] Mock Sovryn router deployed on RSK Regtest with DOC/USDT0 pool
- [ ] Mock VerifyingPaymaster deployed on Arbitrum Regtest
- [ ] Local Alto bundler running
- [ ] Backend configured with local contract addresses
- [ ] Frontend configured with local RPC URLs

### 14.6 Mainnet Pre-Launch Checklist

- [ ] Paymaster hash format aligned on-chain and off-chain
- [ ] VerifyingPaymaster deployed to Arbitrum One with funded deposit
- [x] **Fix USDT0 decimals in connected wallet balance display (Bug 5.5)** — FIXED (v7)
- [x] **Fix USDT0 decimals in meta-tx-relay config (Bug 8.8)** — FIXED (v7, Arbitrum gasless only)
- [ ] **Reconcile callData encoding between NestJS and meta-tx-relay (Bug 8.9)** — CRITICAL SENSITIVE
- [x] **Fix VerifyingPaymaster validationData packing (Bug 8.10)** — FIXED (v7)
- [x] **Wire loan flow into frontend UI (Bug 5.7)** — FIXED (v7)
- [x] **Fix fetchSubmarineFee percentage fee zeroing (Bug 5.9)** — FIXED (v7)
- [ ] **Replace hardcoded BTC price with live feed (Bug 5.10)** — SmartRouter is dead code (replaced by route-engine)
- [x] **Add RSK USDT0 send handler (Bug 5.13)** — FIXED (v7)
- [ ] **Wire OpenOcean into route engine (Bug 5.14)**
- [x] `mintDoc()` return value fixed
- [x] `redeemDoc()` return value fixed
- [x] `bridge()` approval flow fixed
- [ ] Debug console.log statements removed from production code
- [x] CORS patterns updated
- [ ] Duplicate submission protection added
- [ ] Monitoring and alerting configured
- [x] Unit tests for loan services (MoCMintingService, Usdt0BridgeService)
- [ ] Unit tests for gasless relay
- [ ] Integration tests against local fork
- [ ] Security audit of VerifyingPaymaster contract
- [ ] Gas estimate fallbacks tuned for mainnet conditions
- [x] ArbitrumWallet integrated into WalletManager
- [x] Loan Flow Orchestrator implemented
- [x] DOC → USDT0 DEX swap implemented (Sovryn)
- [x] Arbitrum transaction history implemented
- [x] USDT0 decimals fixed (backend)
- [x] JWT expiration fixed (15m)
- [x] Changelly swap bugs fixed
- [x] CORS patterns updated
- [ ] Changelly swap API keys provisioned
- [x] Token registries consolidated (gasless.config uses SDK ARB_TOKEN_ADDRESSES)
- [x] Duplicate ArbitrumWallet consolidated (frontend kept as thin wrapper)
- [ ] Production .env filled (wrangler variables for paymaster, Alto, RPC)
- [x] ERC-20 utilities added to SDK (v0.2.0)
- [x] Multi-chain USDT address registry added to SDK (v0.2.0)
- [x] Loan flow service layer created in frontend
- [x] USDT0 decimals fixed in frontend gasless-helpers (F-TODO-4)
- [x] Console spam cascade fixed (Bug 5.1b, 5.1c)
- [x] Debug console.logs removed from ReverseSwapService (Bug 6.11)
- [x] Paymaster hash format aligned (v0.7 packed — contract + NestJS + CF Worker)
- [x] Paymaster returns uint256 validationData (ERC-4337 v0.8)

---

## 15. Fix Priority Matrix

| # | Severity | Bug | Owner | Impact |
|---|----------|-----|-------|--------|
| 1 | **CRITICAL** | ~~USDT0-Arb balance ~$0 for connected wallets (Bug 5.5)~~ | Frontend | FIXED (v7): `/1e18` → `/1e6` in 4 locations |
| 2 | **CRITICAL** | ~~USDT0 decimals = 18 in meta-tx-relay Arbitrum gasless config (Bug 8.8)~~ | meta-tx-relay | FIXED (v7): decimals→6, FEE_BUFFER_MIN→10_000n, FEE_BUFFER_MAX→150_000n. RSK relay untouched. |
| 3 | **CRITICAL SENSITIVE** | callData encoding mismatch NestJS vs meta-tx-relay (Bug 8.9) | NestJS + meta-tx-relay | Must determine which selector the on-chain contract expects before changing either system |
| 4 | **CRITICAL** | ~~VerifyingPaymaster validationData packing error (Bug 8.10)~~ | meta-tx-relay | FIXED (v7): `(validAfter << 208) | (validUntil << 160)` per ERC-4337. 13 tests passing. |
| 5 | **CRITICAL** | ~~Wire loan flow into frontend~~ | SDK + Frontend | FIXED (v7): LoanFlowDrawer created + wired into wallet page with "Convert" button and BankingMenu handler |
| 6 | **CRITICAL** | Changelly swap lifecycle dead code (Bug 5.6) | Frontend | Harmless dead code — route-engine Changelly path is the active one |
| 7 | **CRITICAL** | ~~Loan flow service orphaned (Bug 5.7)~~ | Frontend | FIXED (v7): LoanFlowDrawer imports and uses executeLoanFlow/getLoanFlowQuote |
| 8 | **CRITICAL** | ~~Paymaster hash format mismatch~~ | meta-tx-relay | FIXED (v5) |
| 9 | **HIGH** | `fetchSubmarineFee` percentage fee always zero (Bug 5.9) | Frontend | Submarine fee estimates show only fixed miner fee |
| 10 | **HIGH** | Hardcoded BTC price $73,000 (Bug 5.10) | Frontend | All USDT↔BTC swap quotes use stale price |
| 11 | **HIGH** | Post-swap output estimation wrong (Bug 6.17) | SDK | Loan flow reports wrong DOC→USDT0 output |
| 13 | **HIGH** | Loan flow `recover()` restarts from scratch (Bug 6.18) | SDK | Failed loan flows cannot resume mid-way |
| 14 | **HIGH** | NestJS floating-point precision in fee calc (Bug 8.10) | NestJS | Fee amounts non-deterministic between relay systems |
| 15 | **HIGH** | NestJS estimate creates duplicate treasury transfers (Bug 8.11) | NestJS | Gas estimates inflated |
| 16 | **HIGH** | initCode hash mismatch for factory accounts (Bug 8.11) | meta-tx-relay | Paymaster signature fails for factory-deployed accounts |
| 17 | **HIGH** | ~~RSK USDT0 send handler missing (Bug 5.13)~~ | Frontend | FIXED (v7): `usdt0-rsk` handler added to send-execution.service.ts + sendRSKUSDT0 in wallet-send.ts |
| 18 | **HIGH** | OpenOcean not wired into route engine (Bug 5.14) | Frontend | OpenOcean routes unavailable in SwapForm |
| 19 | **HIGH** | BTC/L-BTC submarine swap refunds not implemented | SDK | Failed submarine swaps unrecoverable |
| 20 | **HIGH** | Changelly swap API keys not configured | Backend | Swap API non-functional |
| 21 | **HIGH** | ~~Consolidate ArbitrumWallet implementations~~ | SDK + Frontend | Frontend kept as thin wrapper for gasless; SDK version is authoritative |
| 22 | **HIGH** | ~~Consolidate token registries~~ | SDK + Frontend | `gasless.config.ts` now uses SDK `ARB_TOKEN_ADDRESSES` |
| 23 | **HIGH** | Wire loan flow UI | SDK + Frontend | Service layer created; UI component needs `executeLoanFlow()` |
| 24 | **MEDIUM** | ~~Wrong network labels on Arb tokens (Bug 5.11)~~ | Frontend | FIXED (v7): Changed to 'Arbitrum' for usdt0-arb, wbtc-arb, tbtc-arb |
| 25 | **MEDIUM** | ~~GaslessSendFlow shows $0 on pending/success (Bug 5.12)~~ | Frontend | FIXED (v7): Now passes `parseFloat(amount)` instead of hardcoded 0 |
| 26 | **MEDIUM** | Bridge fee not deducted from estimate (Bug 6.19) | SDK | Loan flow quote overestimates final amount |
| 27 | **MEDIUM** | Silent mainnet fallback on testnet for bridge (Bug 6.20) | SDK | Bridge calls fail with confusing on-chain revert on testnet |
| 28 | **MEDIUM** | Fragile GUID extraction in bridge service (Bug 6.21) | SDK | LayerZero message tracking may extract wrong GUID |
| 29 | **MEDIUM** | Preflight simulation behavioral drift (Bug 8.12) | NestJS + meta-tx-relay | NestJS non-blocking, meta-tx-relay blocking |
| 31 | **MEDIUM** | ~~Console spam reactive cascade~~ | Frontend | FIXED (v5) |
| 32 | **MEDIUM** | ~~`forceRefresh` hardcode~~ | Frontend | FIXED (v5) |
| 33 | **MEDIUM** | ~~Debug console.log in production~~ | SDK | FIXED (v5) |
| 34 | **MEDIUM** | No idempotency protection | meta-tx-relay | Duplicate submission risk |
| 35 | **MEDIUM** | Duplicate `satoshiToWei`/`weiToSatoshi` | SDK | Inconsistent return types |
| 36 | **MEDIUM** | Global singleton network getter | SDK | Not safe for multi-instance |
| 37 | **MEDIUM** | Arbitrum Sepolia empty tokens | SDK | Cannot test Arbitrum on testnet |
| 38 | **MEDIUM** | Frontend rBTC auto-swap is placeholder | Frontend | Symbiosis + Boltz stubs in fiat orchestrator |
| 39 | **LOW** | ~~SwapForm network mapping error (Bug 5.15)~~ | Frontend | FIXED (v7): wbtc-arb/tbtc-arb now map to 'usdt-arbitrum' |
| 40 | **LOW** | ~~`process.env` in browser code (Bug 5.16)~~ | Frontend | FIXED (v7): Changed to `!import.meta.env.DEV` |
| 41 | **LOW** | Non-null assertion without guard (Bug 5.17) | Frontend | Runtime crash if chainSwapService not initialized |
| 42 | **LOW** | `tokenWeiToUsd` precision loss (Bug 6.24) | SDK | Large balances lose precision |
| 43 | **LOW** | Missing SDK exports (Bug 6.25) | SDK | Downstream consumers can't access some constants |
| 44 | **LOW** | Self-dependency in package.json (Bug 6.26) | SDK | Install loops or phantom resolution |
| 45 | **LOW** | ETH vs RBTC error message (Bug 6.23) | SDK | Misleading error on RSK |
| 46 | **LOW** | `TransactionInterface = any` | SDK | Type safety gap |
| 47 | **LOW** | Gas estimate hardcoded fallbacks | SDK | May cause stuck txs on mainnet |
| 48 | **LOW** | Dead dependency (axios) | SDK | Bundle size waste |

### Previously Fixed (no longer in priority matrix)

| Bug | Status | Fix |
|---|---|---|
| `mintDoc()` returns wrong value | ✅ FIXED | Now uses `getDocEmission()` for estimated output |
| `redeemDoc()` returns wrong value | ✅ FIXED | Now uses `staticCall` to estimate rBTC |
| `estimateDocMint()` fee meaningless | ✅ FIXED | Returns `rbtcCost` instead of cross-denomination subtraction |
| No approval before `bridge()` | ✅ FIXED | Explicit allowance check with clear error |
| `retryBridge()` wrong encoding | ✅ FIXED | Rewritten to accept raw message bytes |
| ArbitrumWallet not in WalletManager | ✅ FIXED | Integrated (init, addresses, balances, dispose) |
| Loan Flow Orchestrator missing | ✅ FIXED | `LoanFlowOrchestrator` implemented |
| DOC → USDT0 DEX missing | ✅ FIXED | `RskDexSwapService` (Sovryn) implemented |
| MoC/Usdt0BridgeService no tests | ✅ FIXED | Unit tests added |
| USDT0 decimals bug (backend) | ✅ FIXED | Changed to 6 decimals, fee buffers recalculated |
| CORS too restrictive | ✅ FIXED | Updated with Capacitor origins |
| JWT expiration too long | ✅ FIXED | Changed from 1d to 15m |
| Changelly swap bugs | ✅ FIXED | Rate calc, address validation, updatedAt fixed |
| Paymaster not deployed locally | ✅ FIXED | Working on local Hardhat fork |
| Alto bundler not running | ✅ FIXED | Working with Docker on macOS |
| ~~USDT0 decimals bug (frontend F-TODO-4)~~ | ✅ FIXED | FEE_BUFFER_MIN/MAX corrected for 6 decimals (v5) |
| ~~Console spam cascade (Bug 5.1c)~~ | ✅ FIXED | forceRefresh parameter now passed correctly (v5) |
| ~~Console spam cascade (Bug 5.1b)~~ | ✅ FIXED | fetchStablecoinUsdAtBlock warning logs once per session (v5) |
| ~~Debug console.log (Bug 6.11)~~ | ✅ FIXED | Removed 5 debug console.logs from ReverseSwapService (v5) |
| ~~Token registries not consolidated~~ | ✅ FIXED | gasless.config imports SDK ARB_TOKEN_ADDRESSES; verified-tokens has USDT0 on RSK (v5) |
| ~~ERC-20 utilities not in SDK~~ | ✅ FIXED | encodeERC20Transfer, waitForERC20Balance, usdToTokenWei added to SDK v0.2.0 |
| ~~Multi-chain USDT registry missing~~ | ✅ FIXED | USDT_ADDRESSES, getUsdtToken(), getUsdtAddressByChainId() added to SDK v0.2.0 |
| ~~ESM resolution broken~~ | ✅ NOT A BUG | SDK uses `moduleResolution: "bundler"` which works correctly with Vite. No changes needed. |
| ~~Paymaster hash format mismatch~~ | ✅ FIXED | Contract + NestJS updated to v0.7 packed format matching CF Worker. Returns uint256 validationData per ERC-4337 v0.8 (v5) |
| ~~NestJS paymaster signer uses old hash~~ | ✅ FIXED | Updated to v0.7 packed format with validUntil/validAfter; returns full paymasterAndData (v5) |
| ~~USDT0-Arb connected wallet decimals (Bug 5.5)~~ | ✅ FIXED | Changed /1e18 to /1e6 in 4 locations in use-swap-wallets.svelte.ts (v7) |
| ~~USDT0 meta-tx-relay decimals (Bug 8.8)~~ | ✅ FIXED | Changed to decimals:6, FEE_BUFFER_MIN:10_000n, FEE_BUFFER_MAX:150_000n in Arbitrum gasless config only (v7) |
| ~~VerifyingPaymaster validationData (Bug 8.10)~~ | ✅ FIXED | Corrected bit packing to (validAfter<<208)|(validUntil<<160) per ERC-4337 (v7) |
| ~~RSK USDT0 send handler (Bug 5.13)~~ | ✅ FIXED | Added usdt0-rsk to send-execution.service.ts + sendRSKUSDT0 in wallet-send.ts + RSKWallet.sendToken() in SDK (v7) |
| ~~Loan flow UI wiring (Bug 5.7)~~ | ✅ FIXED | LoanFlowDrawer created + wired into wallet page with Convert button + BankingMenu handler (v7) |
| ~~GaslessSendFlow $0 amounts (Bug 5.12)~~ | ✅ FIXED | Now passes parseFloat(amount) to pending/success screens (v7) |
| ~~Network labels wrong (Bug 5.11)~~ | ✅ FIXED | Changed to 'Arbitrum' for usdt0-arb, wbtc-arb, tbtc-arb (v7) |
| ~~SwapForm network mapping (Bug 5.15)~~ | ✅ FIXED | wbtc-arb/tbtc-arb now map to 'usdt-arbitrum' (v7) |
| ~~process.env in browser (Bug 5.16)~~ | ✅ FIXED | Changed to !import.meta.env.DEV (v7) |
| ~~fetchSubmarineFee zeroed (Bug 5.9)~~ | ✅ FIXED | Now accepts amountSats param and computes percentage fee correctly (v7) |

---

## 16. Production Environment Configuration

### 16.1 meta-tx-relay (Cloudflare Worker)

Set secrets via `wrangler secret put <NAME>`:

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | HMAC secret for JWT verification | `<random-256-bit>` |
| `PAYMASTER_SIGNER_KEY` | Private key for paymaster ECDSA signing | `0x...` (64 hex chars) |

Set in `wrangler.toml` `[env.mainnet.vars]`:

| Variable | Description | Value |
|----------|-------------|-------|
| `RPC_URL` | RSK mainnet RPC | `https://public-node.rsk.co` |
| `ESCROW_ADDRESS` | SecurePaymentContract on RSK | `<deployed-address>` |
| `CHAIN_ID` | RSK chain ID | `30` |
| `ARBITRUM_RPC_URL` | Arbitrum One RPC | `https://arb1.arbitrum.io/rpc` |
| `GAS_TREASURY` | Fee collection address on Arbitrum | `<deployed-address>` |
| `PAYMASTER_ADDRESS` | VerifyingPaymaster contract on Arbitrum | `<deployed-address>` |
| `ALTO_URLS` | Comma-separated Alto bundler URLs | `https://alto-1.example.com,https://alto-2.example.com` |

**Deployment steps:**
1. Deploy VerifyingPaymaster to Arbitrum One: `npx hardhat run scripts/deploy-paymaster.js --network arbitrumOne`
2. Fund paymaster deposit: call `paymaster.deposit()` with ETH
3. Set `PAYMASTER_ADDRESS` in wrangler.toml
4. Set `GAS_TREASURY` (can be same as paymaster signer address)
5. Set secrets: `wrangler secret put JWT_SECRET` and `wrangler secret put PAYMASTER_SIGNER_KEY`
6. Deploy worker: `wrangler deploy --env mainnet`

**Paymaster signing format (all 3 components must agree):**
- Hash (v0.7 packed): `keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData), accountGasLimits, preVerificationGas, gasFees, chainId, paymasterAddress, validUntil, validAfter))`
- Signature: `signingKey.sign(hash)` (raw ECDSA, NOT signMessage)
- paymasterAndData: `paymasterAddress ++ abi.encode(validUntil, validAfter, signature)` (constructed by paymasterSigner.js / paymaster-signing.service.ts)

### 16.2 bittasker-nestjs (Backend)

Set in `.env` or Docker secrets:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret (same as CF Worker) | Yes |
| `JWT_EXPIRATION` | Token lifetime | `15m` |
| `CHAIN_ID` | Arbitrum chain ID | `42161` |
| `ARBITRUM_RPC_URL` | Arbitrum One RPC | `https://arb1.arbitrum.io/rpc` |
| `GAS_TREASURY` | Fee collection address | `<address>` |
| `PAYMASTER_ADDRESS` | VerifyingPaymaster contract | `<address>` |
| `ALTO_URL_1` | Primary Alto bundler URL | `https://alto-1.example.com` |
| `ALTO_URL_2` | Fallback Alto bundler URL | `https://alto-2.example.com` |
| `PAYMASTER_SIGNER_KEY_FILE` | Docker secret path | `/run/secrets/paymaster_signer_key` |
| `PAYMASTER_SIGNER_KEY` | Direct key (dev only) | `0x...` |
| `CHANGELLY_FIAT_API_KEY` | Changelly public API key | `<key>` |
| `CHANGELLY_FIAT_API_SECRET` | Changelly RSA private key (base64 PEM) | `<base64>` |
| `CHANGELLY_API_KEY` | Changelly swap API key (when provisioned) | `<key>` |
| `CHANGELLY_API_SECRET` | Changelly swap API secret | `<secret>` |
| `FIREBASE_PROJECT_ID` | Firebase for push notifications | `bittasker-928ff` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase service account JSON | `{...}` |
| `REDIS_URL` | Redis for caching/queues | `redis://localhost:6379` |
| `R2_ACCOUNT_ID` | Cloudflare R2 for file storage | `<account-id>` |
| `R2_ACCESS_KEY` | R2 access key | `<key>` |
| `R2_SECRET_ACCESS_KEY` | R2 secret key | `<secret>` |
| `R2_BUCKET_NAME` | R2 bucket name | `bittasker-assets` |
| `GOOGLE_TRANSLATE_API_KEY` | Server-side translation | `<key>` |

### 16.3 BitTasker-V2 (Frontend)

Set in `.env` or CI/CD secrets:

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | Backend API base URL | `https://api.bittasker.com` |
| `VITE_TX_RELAY_BASE_URL` | CF Worker gasless relay URL | `https://tx-relay.bittasker.com/api/v1` |
| `VITE_GAS_TREASURY` | Treasury address (must match backend) | `<address>` |
| `VITE_ALTO_URL_1` | Alto bundler URL (for direct fallback) | `<url>` |
| `VITE_ALTO_URL_2` | Alto bundler fallback URL | `<url>` |
| `VITE_ARBITRUM_RPC_URL` | Arbitrum RPC (for direct reads) | `https://arb1.arbitrum.io/rpc` |
| `VITE_SENTRY_DSN` | Sentry error tracking DSN | `https://...@sentry.io/...` |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile captcha | `<key>` |

### 16.4 wallet-core-v2 (SDK)

No environment variables needed — the SDK is a pure library. All configuration is passed via constructor parameters (`WalletManagerConfig`, `LoanFlowConfig`, etc.).

### 16.5 Pre-Production Checklist

| Step | Owner | Status |
|------|-------|--------|
| Deploy VerifyingPaymaster to Arbitrum One | meta-tx-relay | ⬜ |
| Fund paymaster deposit with ETH (≥0.5 ETH recommended) | meta-tx-relay | ⬜ |
| Set PAYMASTER_ADDRESS in wrangler.toml + .env | Both | ⬜ |
| Set GAS_TREASURY in wrangler.toml + .env | Both | ⬜ |
| Set ALTO_URLS (production bundler endpoints) | Both | ⬜ |
| Provision Changelly swap API keys | Backend | ⬜ |
| Set JWT_SECRET (same value in CF Worker + NestJS) | Both | ⬜ |
| Set PAYMASTER_SIGNER_KEY (same key in both backends) | Both | ⬜ |
| Deploy CF Worker: `wrangler deploy --env mainnet` | meta-tx-relay | ⬜ |
| Deploy NestJS backend | Backend | ⬜ |
| Run `npm run test:ci` in BitTasker-V2 | Frontend | ⬜ |
| Run `npm run build` in BitTasker-V2 | Frontend | ⬜ |
| Verify gasless relay end-to-end on mainnet | All | ⬜ |
| Verify loan flow (rBTC → DOC → USDT0 → Arb) on mainnet | All | ⬜ |
| Set up monitoring/alerting for gasless relay | meta-tx-relay | ⬜ |

---

## 17. Cross-Project Integration Assessment

### 17.1 API Endpoint Alignment

All frontend API endpoint paths match NestJS controller routes exactly:

| Frontend Call | Path | NestJS Route | Status |
|---|---|---|---|
| `changellyService.estimateSwap()` | `POST /api/v1/changelly/swap/estimate` | `POST changelly/swap/estimate` | ✅ |
| `changellyService.createSwap()` | `POST /api/v1/changelly/swap/create` | `POST changelly/swap/create` | ✅ |
| `changellyService.getSwapStatus()` | `POST /api/v1/changelly/swap/status` | `POST changelly/swap/status` | ✅ |
| `changellyService.getCurrencies()` | `POST /api/v1/changelly/swap/currencies` | `POST changelly/swap/currencies` | ✅ |
| `getProviders()` | `GET /api/v1/changelly/fiat/providers` | `GET changelly/fiat/providers` | ✅ |
| `createOrder()` | `POST /api/v1/changelly/fiat/orders` | `POST changelly/fiat/orders` | ✅ |
| Gasless relay | `POST /api/v1/gasless/relay` | `POST gasless/relay` | ✅ |
| Gasless estimate | `POST /api/v1/gasless/estimate` | `POST gasless/estimate` | ✅ |

**No missing backend endpoints.** Every frontend service call has a corresponding backend route.

### 17.2 Orphaned Backend Endpoints

| Backend Endpoint | Purpose | Frontend Consumer |
|---|---|---|
| `POST /api/v1/gasless/balance` | Check token balance sufficiency | ❌ None |
| `POST /api/v1/changelly/swap/limits` | Get min/max swap amounts | ❌ None (method exists in `changelly.service.ts` but never called) |
| `POST /api/v1/changelly/fiat/webhook` | Changelly order status callback | N/A — server-to-server |

### 17.3 Feature Flag Analysis

**Frontend-only feature flags** (12 flags in `kill-switch.ts`):

| Flag | Env Var | Backend Enforcement |
|---|---|---|
| `changelly-swaps` | `VITE_CHANGELLY_ENABLED` | ❌ None |
| `changelly-fiat` | `VITE_CHANGELLY_FIAT_ENABLED` | ❌ None |
| `lifi-swaps` | `VITE_LIFI_ENABLED` | ❌ None |
| `symbiosis-swaps` | `VITE_SYMBIOSIS_ENABLED` | ❌ None |
| `connected-wallets` | `VITE_CONNECTED_WALLETS_ENABLED` | ❌ None |
| `loan-flow` | `VITE_LOAN_FLOW_ENABLED` | ❌ None |
| `usdt0-bridge` | `VITE_USDT0_BRIDGE_ENABLED` | ❌ None |
| `openocean-swaps` | `VITE_OPENOCEAN_ENABLED` | ❌ None |

**Risk:** Feature flags are frontend-only build-time gates. Backend endpoints are always active. If a flag is disabled in the frontend, the backend endpoints are still reachable via direct API calls. Acceptable for a client-side mobile app but a security note for production.

### 17.4 Swap Provider Integration Status

| Provider | Route Engine | Executor | Feature Flag | UI Accessible |
|---|---|---|---|---|
| Direct (on-chain) | ✅ `direct.provider.ts` | N/A | Always on | ✅ |
| Boltz | ✅ `boltz.provider.ts` | ✅ `boltz/` | Always on | ✅ |
| Symbiosis | ✅ `symbiosis.provider.ts` | ✅ `symbiosis.ts` | `symbiosis-swaps` | ⚠️ Disabled (MetaRouter reverts) |
| LI.FI | ✅ `lifi.provider.ts` | ✅ `lifi.ts` | `lifi-swaps` | ✅ |
| Changelly | ✅ `changelly.provider.ts` | ✅ `changelly.ts` | `changelly-swaps` | ⚠️ Verify route-engine path |
| Uniswap V3 | ✅ `uniswap-v3.provider.ts` | ✅ `uniswap-v3.ts` | Always on | ✅ |
| OpenOcean | ❌ Not in engine | ❌ | `openocean-swaps` | ❌ Legacy only |
| USDT0 Bridge | ❌ Not in engine | ❌ | `usdt0-bridge` | ❌ No UI |

### 17.5 DeFi UI Components on Wallet Page

| Component | Rendered | Gate | Status |
|---|---|---|---|
| `BorrowFlowDrawer.svelte` | ✅ Yes | `isLoanFlowEnabled()` | Opens Aave V3 borrow flow |
| `EarnFlowDrawer.svelte` | ✅ Yes | `isLoanFlowEnabled()` | Opens Aave V3 earn flow |
| DeFi buttons (Borrow + Earn) | ✅ Yes | `isLoanFlowEnabled()` | Row of two buttons on wallet page |
| `BankingMenu` DeFi card | ✅ Yes | `isLoanFlowEnabled()` | Shows "DeFi is in preview" toast |
| Loan Flow (rBTC→DOC→USDT0→Arb) | ✅ Yes (v7) | `isLoanFlowEnabled()` | LoanFlowDrawer with Convert button |
| USDT0 LayerZero Bridge | ✅ Yes (v7) | Part of loan flow | Integrated into LoanFlowDrawer |
| DOC Minting (MoC) | ✅ Yes (v7) | Part of loan flow | Integrated into LoanFlowDrawer |

### 17.6 USDT Balance Display in BalanceCard

The `BalanceCard.svelte` correctly renders USDT balances:
- Line 82: `usdt0ArbAsset` — USDT0 on Arbitrum ✅
- Line 83: `usdt0RskAsset` — USDT0 on Rootstock ✅
- Line 84: `docBalance` — Dollar on Chain (RSK) ✅
- Lines 512-530: Explicit rows for USDT0-Arb, USDT0-RSK, DOC-RSK, and tier-2 assets ✅
- Line 536: `DefiPositionCard` for Aave loan positions ✅

**Note:** Connected wallet USDT0-Arb balances will show ~$0 due to Bug 5.5 (decimal mismatch).

---

## 18. Manual Testing Plan (Production User Perspective)

These instructions assume you're testing the USDT implementation as a normal production user would use the wallet. Boltz swaps are out of scope (already working). Focus is on USDT-specific features.

### Prerequisites

1. Backend running locally on port 8000 (`npm run start:dev`)
2. Frontend running (`npm run dev`)
3. `.env.development` configured with all required variables
4. A funded wallet (RBTC on RSK for gas, some BTC for swaps)
5. MetaMask or another connected wallet (optional, for connected wallet tests)

### Test 1: USDT Balance Display

**Goal:** Verify USDT balances appear correctly on all chains.

1. Open the app and navigate to the wallet page
2. Verify the total portfolio USD value includes USDT
3. Expand the USD accordion
4. Verify these rows appear:
   - USDT0 on Arbitrum with correct balance and USD value
   - USDT0 on RSK with correct balance (if you have any)
   - DOC on RSK with correct balance (if you have any)
5. If you have a connected wallet (MetaMask), switch to it and verify USDT0-Arb balance
   - **Known bug (5.5):** Connected wallet USDT0-Arb balance will show ~$0

### Test 2: Send USDT0 on Arbitrum (Gasless)

**Goal:** Verify gasless USDT send works end-to-end.

1. From the wallet page, tap "Send"
2. Select USDT0 on Arbitrum as the asset
3. Enter a recipient address (use another wallet you control)
4. Enter an amount (e.g., $1.00)
5. If EIP-7702 smart account is initialized, the gasless send flow should appear
   - You should see a fee estimate in USDT (not ETH)
   - The fee should be a small amount (e.g., $0.01-$0.05)
6. Confirm the transaction
7. **Known bug (5.12):** Pending and success screens will show $0.00 amount
8. Verify the transaction appears in transaction history
9. Verify the recipient received the USDT

### Test 3: Aave V3 DeFi (Borrow/Earn)

**Goal:** Verify Aave V3 lending and borrowing works.

1. From the wallet page, tap "Borrow" or "Earn" button
2. The `BorrowFlowDrawer` or `EarnFlowDrawer` should open
3. **Earn flow:**
   - Select a supply asset (e.g., USDT0 on Arbitrum)
   - Enter an amount to supply
   - Verify the Supply APY is displayed
   - Confirm the transaction
   - Verify your position appears in the DeFi positions section
4. **Borrow flow:**
   - If you have a supply position, try borrowing against it
   - Verify the Health Factor gauge updates
   - Verify the borrow rate is displayed
   - Confirm the transaction
5. Test repay and withdraw actions

### Test 4: Changelly Swap (via Route Engine)

**Goal:** Verify Changelly routes appear and can be executed.

1. Open the SwapForm (swap drawer from wallet page)
2. Select source: BTC on-chain
3. Select destination: USDT0 on Arbitrum
4. Wait for routes to load (the route engine queries providers in parallel)
5. Verify the route picker shows multiple options (Boltz, LI.FI, Changelly, etc.)
6. If a Changelly route appears:
   - Select it and review the quote (estimated output, fees, timing)
   - Confirm the swap
   - Monitor progress through the multi-phase UI
   - **Note:** Changelly swap API keys must be provisioned for this to work
7. If no Changelly route appears, check if `VITE_CHANGELLY_ENABLED=true` in `.env.development`

### Test 5: Buy Crypto with Fiat (Changelly Fiat)

**Goal:** Verify fiat on-ramp flow.

1. Navigate to the buy/sell fiat interface
2. Select a fiat currency (e.g., USD) and a crypto asset (e.g., USDT)
3. Verify offers are loaded from Changelly providers
4. Review the offers (amount, fees, provider)
5. **Note:** Completing a real fiat purchase requires a payment method. You can test up to the offer selection step.

### Test 6: Connected Wallet USDT Balance

**Goal:** Verify connected wallet shows correct USDT balances.

1. Open the Connected Wallets section
2. Connect MetaMask (or WalletConnect)
3. Verify the connected wallet's USDT0-Arbitrum balance displays
4. **Known bug (5.5):** Balance will show ~$0 due to decimal mismatch (dividing by 1e18 instead of 1e6)
5. Try initiating a swap using the connected wallet as the source
6. **Known bug:** Swap source balance calculation will also be wrong

### Test 7: Multi-Provider Swap Routes

**Goal:** Verify the route engine returns diverse, accurate routes.

1. Open the SwapForm
2. Test these pairs and verify routes appear:
   - BTC → USDT0-Arb (expect Boltz two-hop, Changelly, LI.FI)
   - USDT0-Arb → BTC (reverse)
   - RBTC → USDT0-RSK (if available)
   - USDT0-Arb → WBTC-Arb (same-chain Uniswap V3)
3. Verify the RoutePicker shows estimated amounts and fees for each route
4. **Known bug (5.9):** Submarine fee estimates are underestimated (percentage fee is zeroed)
5. **Known bug (5.10):** BTC price is hardcoded at $73,000 for sats↔USDT conversions

### Test 8: Transaction History for USDT

**Goal:** Verify USDT transactions appear in history.

1. After completing any USDT transaction (send, swap, or DeFi action)
2. Navigate to the transaction history tab
3. Verify the transaction appears with correct:
   - Amount and token
   - Status (pending/confirmed/failed)
   - From/to addresses
   - Transaction hash (clickable link to explorer)

### Test 9: Send USDT0 on RSK

**Goal:** Verify RSK USDT0 send capability.

1. From the wallet page, tap "Send"
2. Try to select USDT0 on RSK as the asset
3. **Known bug (5.13):** This may not work — `send-execution.service.ts` has no handler for `usdt0-rsk` sends
4. If the option is available, attempt to send and observe the result

### Testing Priority Order

1. **Test 1** (Balance display) — quickest validation, do first
2. **Test 2** (Gasless send) — core USDT functionality
3. **Test 3** (Aave V3) — DeFi integration
4. **Test 4** (Changelly swap) — swap infrastructure
5. **Test 7** (Multi-provider routes) — swap quote accuracy
6. **Test 6** (Connected wallet) — expect decimal bug
7. **Test 5** (Fiat on-ramp) — Changelly fiat
8. **Test 8** (Transaction history) — post-action verification
9. **Test 9** (RSK USDT0 send) — expect it to not work

---

## 19. Regtest Readiness Assessment

### What CAN Be Tested on Regtest Now

| Feature | Ready? | Requirements |
|---------|--------|-------------|
| USDT0 balance display (RSK + Arb) | ✅ | Need regtest token deployments |
| Send USDT0 (Arbitrum gasless) | ⚠️ | Fix callData mismatch (Bug 8.9) first; needs local Alto + paymaster |
| Aave V3 lending/borrowing | ✅ | Uses Arbitrum fork (`VITE_ARBITRUM_RPC_URL=http://127.0.0.1:8545`) |
| Changelly swap (via route engine) | ⚠️ | Needs Changelly API keys; route-engine path needs verification |
| Changelly fiat quotes | ⚠️ | Needs Changelly fiat API keys |
| Connected wallet balances | ⚠️ | Expect decimal bug (Bug 5.5) |

### What CANNOT Be Tested on Regtest

| Feature | Blocker |
|---------|---------|
| Loan flow (rBTC→DOC→USDT0→bridge) | ⚠️ UI ready (v7), needs mock MoC/DEX/bridge contracts on regtest |
| DOC minting (MoC) | ⚠️ UI ready (part of loan flow), needs mock MoC contract on regtest |
| USDT0 LayerZero bridge | ⚠️ UI ready (part of loan flow), needs mock OFT contracts on regtest |
| OpenOcean DEX swap | ❌ Not wired into route engine (Bug 5.14) |
| RSK USDT0 send | ⚠️ Handler added (v7), needs USDT0 deployed on regtest |
| BTC/L-BTC submarine swap refunds | ❌ Not implemented |

### Regtest Setup Checklist

- [ ] RSK Regtest node running (chainId 31337)
- [ ] Arbitrum Regtest node running (Anvil fork of Arbitrum One on port 8545)
- [ ] Mock USDT0 deployed on RSK Regtest (6 decimals)
- [ ] Mock USDT0 deployed on Arbitrum Regtest (6 decimals)
- [ ] Mock OFT contracts deployed on both chains
- [ ] Mock MoC Core v2 deployed on RSK Regtest
- [ ] Mock Sovryn router deployed on RSK Regtest with DOC/USDT0 pool
- [ ] Mock VerifyingPaymaster deployed on Arbitrum Regtest
- [ ] Local Alto bundler running
- [ ] Backend configured with local contract addresses
- [ ] Frontend `.env.development` configured with local RPC URLs
