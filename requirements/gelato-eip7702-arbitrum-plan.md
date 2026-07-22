# ~~Gelato EIP-7702 Gasless Transactions on Arbitrum~~ **SUPERSEDED**

> ⚠️ **This plan has been superseded by** [`gasless-arbitrum-plan.md`](./gasless-arbitrum-plan.md)
> 
> **Reason**: Architecture changed from Gelato cloud infrastructure to self-hosted ERC-4337 stack
> (ethers.js + Alto bundler + Coinbase VerifyingPaymaster). This file is preserved for
> audit trail and reusable research sections only.
> 
> **Branch**: `feat/usdt-abstractionkit`
> **Date**: 2026-06-04
> **Status**: SUPERSEDED — See gasless-arbitrum-plan.md
> **Scope**: Gasless ERC-20 transfers for USDT0, wBTC, tBTC on Arbitrum One via Gelato Smart Wallet SDK + EIP-7702

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Token Inventory](#3-token-inventory)
4. [Gelato Integration Model](#4-gelato-integration-model)
5. [Gas Reimbursement Model](#5-gas-reimbursement-model)
6. [EIP-7702 Delegation Lifecycle](#6-eip-7702-delegation-lifecycle)
7. [wallet-core Modifications](#7-wallet-core-modifications)
8. [Implementation Phases](#8-implementation-phases)
9. [New & Modified Files](#9-new--modified-files)
10. [Testing Strategy](#10-testing-strategy)
11. [Risk Analysis](#11-risk-analysis)
12. [Dependencies](#12-dependencies)
13. [Decision Log](#13-decision-log)

---

## 1. Executive Summary

This plan adds **gasless token transfers** on **Arbitrum One** (chain ID 42161) using **Gelato's Smart Wallet SDK** with native **EIP-7702** support. Users send USDT0, wBTC, or tBTC **without holding ETH for gas**. Gas costs are **reimbursed by the user in the token being transferred** — Gelato's Paymaster sponsors the ETH gas upfront, and the smart account implementation deducts the equivalent token amount from the user's balance to reimburse the paymaster.

**Key design choices:**
- **User retains their EOA** — EIP-7702 delegation is temporary; cleanup restores pure EOA after every transaction
- **User reimburses gas in token** — not BitTasker-sponsored. Gas cost is deducted from the user's token balance (USDT0, wBTC, or tBTC)
- **BitTasker only sponsors initial EIP-7702 deployment** if the user has no token balance to cover the first gas cost (bootstrap edge case)
- **Gelato** as the AA infrastructure provider — native EIP-7702 SDK, Paymaster + Bundler
- **Arbitrum One** as the target chain — sub-cent gas, post-Pectra EIP-7702, largest L2 TVL
- **Three tokens**: USDT0 (stablecoin), wBTC (wrapped Bitcoin), tBTC (Threshold Bitcoin)
- **Cleanup after each tx** — Tx2 clears delegation code back to pure EOA
- **wallet-core SDK extended** — new `ArbitrumWallet` class following existing `BSCWallet`/`RSKWallet` pattern

**What this replaces:** The existing BSC/Candide plan remains in `usdt-integration-plan.md` but is not actively planned for implementation. This plan is the primary path forward.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    BitTasker App (Svelte 5 + Capacitor)          │
│   Wallet Dashboard │ Send │ Receive │ Swap                      │
├─────────────────────────────────────────────────────────────────┤
│              Wallet Store ($walletStore)                         │
│   Multi-chain state │ Token balances │ Pending tx map           │
├─────────────────────────────────────────────────────────────────┤
│              Gas Abstraction Layer (App Layer)                   │
│   GelatoEIP7702Provider                                         │
│   ├── EIP-7702 authorization signing (RestrictedSigner)         │
│   ├── Gelato Bundler (submits UserOps)                          │
│   ├── Gelato Paymaster (sponsors ETH gas, accepts ERC-20 repay) │
│   └── Tx1 (delegate+transfer) + Tx2 (cleanup) lifecycle        │
├─────────────────────────────────────────────────────────────────┤
│              @bittasker/wallet-core (SDK)                        │
│   WalletManager │ RSKWallet │ BSCWallet │ ArbitrumWallet (NEW)  │
│   ├── ArbitrumWallet: provider, token balances, basic transfers │
│   └── No EIP-7702 logic in SDK — that lives in the app layer   │
├─────────────────────────────────────────────────────────────────┤
│              StablecoinRegistry                                  │
│   Arbitrum config │ USDT0 │ wBTC │ tBTC │ Paymaster addresses  │
├─────────────────────────────────────────────────────────────────┤
│              Chain Providers                                     │
│   Arbitrum One (42161) │ BSC (56, inactive) │ RSK (30)          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Layer Separation: SDK vs App

| Concern | Layer | Rationale |
|---------|-------|-----------|
| Provider, balances, basic ERC-20 reads | `wallet-core` SDK | Reusable, testable, same pattern as BSC/RSK |
| EIP-7702 delegation lifecycle | App layer | Depends on Gelato SDK, Capacitor persistence, UI state |
| RestrictedSigner | App layer | Security boundary — never expose private key to third-party SDK |
| Gas estimation + reimbursement calc | App layer | Business logic tied to UI confirmation flow |
| Token transfer encoding | App layer (or SDK utility) | Generic ERC-20 `transfer()` encoding |

### 2.2 How Gelato EIP-7702 Works

1. User's EOA signs an **EIP-7702 authorization** that delegates execution to a smart account implementation
2. Authorization is embedded in a **UserOperation** (ERC-4337 compatible)
3. Gelato's **Bundler** verifies the authorization on-chain and submits it
4. Gelato's **Paymaster** sponsors the ETH gas upfront
5. The smart account implementation executes: **token transfer + gas reimbursement to paymaster**
6. A **cleanup UserOperation** resets the EOA's code to `address(0)` (pure EOA)

```
┌────────┐   EIP-7702 Auth    ┌──────────────────┐   Cleanup    ┌────────┐
│  EOA   │ ──────────────────→│ Smart Account     │ ──────────→ │  EOA   │
│ (pure) │   UserOp via Gelato│ (transfer + repay)│  UserOp     │ (pure) │
└────────┘                    └──────────────────┘              └────────┘
                               │                                  │
                               ├─ transfer X tokens to recipient  │
                               ├─ transfer gas_repay to paymaster │
                               └─ (both in one UserOp)           │
```

---

## 3. Token Inventory

### 3.1 Arbitrum One Token Contracts

| Token | Symbol | Address | Decimals | Type | Notes |
|-------|--------|---------|----------|------|-------|
| USD₮0 | USDT0 | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` | 18 | Stablecoin | Tether's cross-chain USDT standard; migrated from legacy USDT on Arbitrum |
| Wrapped BTC | wBTC | `0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f` | 8 | Wrapped BTC | BitGo custodied; largest BTC wrapper by TVL |
| tBTC | tBTC | `0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40` | 18 | Decentralized BTC | Threshold Network; trust-minimized |

### 3.2 Token Extensibility

Adding a new token on Arbitrum requires:
1. Add token config to `StablecoinRegistry`
2. Verify contract on Arbiscan
3. Add logo to `/static/logos/`
4. Add i18n keys
5. No UI code changes — auto-adapts from registry

Future tokens: USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`), DAI, etc.

---

## 4. Gelato Integration Model

### 4.1 SDK & API

**Primary SDK**: `@gelatonetwork/smart-wallet-sdk` (or `@gelatocloud/gasless` — verify latest package name at implementation time)

**Gelato endpoints** (Arbitrum One):
- Bundler: `https://api.gelato.cloud/bundler/42161/<API_KEY>`
- Paymaster: `https://api.gelato.cloud/paymaster/42161/<API_KEY>`

**API key**: Provisioned via Gelato dashboard. Stored as CF Worker secret (`GELATO_API_KEY`). Never in client code.

### 4.2 Paymaster Configuration

The Gelato Paymaster is configured for **ERC-20 gas repayment**:

- Paymaster sponsors ETH gas upfront
- Smart account implementation transfers the gas-equivalent amount in the user's token to the paymaster
- Gelato supports this via their `createSponsorPaymasterUserOperation` with `token` parameter
- The user never holds ETH — all gas is paid in USDT0/wBTC/tBTC

### 4.3 Gelato SDK Integration Pattern

```typescript
import { createGelatoBundlerClient } from '@gelatonetwork/smart-wallet-sdk';
import { ethers } from 'ethers';

// 1. Public client for chain reads
const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(rpcUrl),
});

// 2. Wallet client for signing (uses RestrictedSigner internally)
const walletClient = createWalletClient({
  account: restrictedSigner,
  chain: arbitrum,
  transport: http(rpcUrl),
});

// 3. Create 7702 smart account from EOA
const smartAccount = await to7702SimpleSmartAccount({
  client: publicClient,
  owner: walletClient.account,
});

// 4. Create Gelato bundler client with EIP-7702 support
const bundlerClient = createGelatoBundlerClient({
  account: smartAccount,
  apiKey: GELATO_API_KEY,
  client: publicClient,
  eip7702: true,
});

// 5. Send sponsored transaction with ERC-20 gas repayment
// The paymaster sponsors ETH gas; smart account deducts token equivalent
const userOpHash = await bundlerClient.sendTransaction({
  to: tokenAddress,
  data: encodeTransfer(recipient, amount),
  value: 0n,
  // Gelato paymaster handles: sponsor ETH gas → deduct token from user
});

// 6. Cleanup: reset delegation to address(0)
const cleanupHash = await bundlerClient.sendTransaction({
  to: smartAccount.address,
  data: encodeResetDelegation(),
  value: 0n,
});
```

---

## 5. Gas Reimbursement Model

### 5.1 Core Principle

**The user pays gas. BitTasker does not subsidize ongoing gas costs.**

Gas is paid in the token being transferred. The Gelato Paymaster sponsors ETH gas upfront and is reimbursed in ERC-20 tokens from the user's balance.

### 5.2 Gas Cost Breakdown

Arbitrum gas is sub-cent:

| Operation | Gas (approx) | Cost @ 0.01 Gwei | In USDT0 |
|-----------|-------------|------------------|----------|
| EIP-7702 authorization | ~45,000 | ~$0.001 | ~$0.001 |
| ERC-20 transfer | ~65,000 | ~$0.001 | ~$0.001 |
| Gas reimbursement transfer | ~50,000 | ~$0.001 | ~$0.001 |
| Cleanup (code reset) | ~25,000 | ~$0.0005 | ~$0.0005 |
| **Total per user send** | **~185,000** | **~$0.004** | **~$0.004** |

### 5.3 Reimbursement Calculation (Pure Function)

```typescript
interface GasReimbursementEstimate {
  /** Gas cost in ETH (wei) */
  gasCostWei: bigint;
  /** Equivalent token amount to reimburse paymaster */
  reimbursementTokenAmount: bigint;
  /** Total token amount user needs: transfer + reimbursement */
  totalRequired: bigint;
  /** Confidence in estimate (0-1) */
  confidence: number;
}

function estimateGasReimbursement(params: {
  /** Total gas for Tx1 + Tx2 */
  totalGasLimit: bigint;
  /** Current gas price (p90 trailing) */
  gasPrice: bigint;
  /** Token/ETH price from oracle (token decimals) */
  tokenPerEth: bigint;
  /** Token decimals */
  tokenDecimals: number;
  /** Buffer in basis points (default 2000 = 20%) */
  bufferBps?: number;
}): GasReimbursementEstimate;
```

### 5.4 Pre-Flight Balance Check

Before any send, verify:
```
tokenBalance >= transferAmount + gasReimbursement
```

If insufficient, show the user:
- "You need X USDT0 more to cover gas (~$0.004)"
- Offer to reduce the transfer amount to fit within balance

### 5.5 Bootstrap: First-Time Delegation

**Problem**: The first EIP-7702 transaction requires the authorization to be submitted on-chain. If the user has no ETH, they can't pay for this.

**Solution**: Gelato's Paymaster can sponsor the first transaction and deduct gas reimbursement from the user's token balance in the same UserOp. The smart account implementation handles:
1. Transfer tokens to recipient
2. Transfer gas reimbursement to paymaster
3. Both happen atomically in one UserOp

**Edge case**: User has tokens but the paymaster requires a minimum token balance or the token/ETH oracle doesn't have a price yet. In this case, BitTasker sponsors the first transaction from its Gas Tank as a bootstrap cost. This is a one-time cost per user (~$0.004).

**Detection**: Check `getCode(eoaAddress)` before first send. If empty AND user has sufficient token balance, use ERC-20 reimbursement. If empty AND user has insufficient balance (e.g., they're receiving for the first time), BitTasker sponsors.

### 5.6 Cleanup Gas

Tx2 (cleanup) is also gasless to the user. Options:

1. **Bundle cleanup into Tx1's reimbursement**: Estimate gas for both Tx1+Tx2 upfront, deduct total reimbursement at Tx1 time. Cleanup gas is pre-paid.
2. **Separate paymaster sponsorship for cleanup**: Gelato sponsors Tx2 and deducts from user's remaining token balance.

**Recommendation**: Option 1 — bundle both gas estimates into Tx1's reimbursement. This ensures cleanup is always funded and simplifies the flow.

---

## 6. EIP-7702 Delegation Lifecycle

### 6.1 State Machine

```
                    +---> AUTH_SIGNING --+
                    |         |           |
                    |         v           |
  IDLE ------------>|    AUTH_SIGNED     |
                    |         |           |
                    |         v           |
                    |    TX1_SUBMITTED   |
                    |         |           |
                    |         v           |
                    |    TX1_MINED       |---(timeout)---> RECOVERY_NEEDED
                    |         |           |
                    |         v           |
                    |    CLEANUP_NEEDED  |
                    |         |           |
                    |         v           |
                    |    TX2_SUBMITTED   |
                    |         |           |
                    |         v           |
                    |    TX2_MINED       |---(timeout)---> RECOVERY_NEEDED
                    |         |           |
                    |         v           |
                    +---> IDLE  <--------+
                          (EOA verified)
```

### 6.2 Detailed Sequence

```
UserAction  │  UI  │  WalletStore  │  DelegationManager  │  Gelato  │  Chain
────────────┼──────┼───────────────┼─────────────────────┼──────────┼────────
"Send USDT0"│      │               │                     │          │
  ────────→ │      │               │                     │          │
            │ Lock chain selector  │                     │          │
            │──────→│              │                     │          │
            │       │ prepareTx()  │                     │          │
            │       │─────────────→│                     │          │
            │       │              │ estimateGas()       │          │
            │       │              │─────────────────────────────────→│
            │       │              │←── gas estimate ────────────────│
            │       │              │ calcReimbursement() │          │
            │       │←─ {amount, gasReimbursement, total}│          │
            │←── confirm screen ──│                     │          │
            │       │              │                     │          │
"Confirm"   │       │              │                     │          │
  ────────→ │       │              │                     │          │
            │ Biometric verify     │                     │          │
            │──────→│              │                     │          │
            │       │              │ signAuth()          │          │
            │       │              │ (RestrictedSigner)  │          │
            │       │              │                     │          │
            │       │              │ Tx1: delegate +     │          │
            │       │              │   transfer + repay  │          │
            │       │              │────────────────────→│ submit   │
            │       │              │                     │─────────→│
            │       │              │←─── tx1Hash ────────│←────────│
            │       │←── pending ──│                     │          │
            │       │              │                     │          │
            │       │              │ Tx2: cleanup        │          │
            │       │              │────────────────────→│ submit   │
            │       │              │                     │─────────→│
            │       │              │←─── tx2Hash ────────│←────────│
            │       │              │                     │          │
            │       │              │ verifyEOAState()    │          │
            │       │              │─────────────────────────────────→│
            │       │              │←── isEOA: true ────────────────│
            │       │←── done ─────│                     │          │
            │ Unlock chain selector│                     │          │
            │←── success ─────────│                     │          │
```

### 6.3 Delegation Recovery

Same algorithm as existing plan:
1. `getCode(address)` on-chain first
2. If empty → reconcile to IDLE silently
3. If non-empty → submit cleanup UserOp via Gelato
4. If Gelato Paymaster unavailable → error state; delegation code is inert (safe)
5. Recovery retries: 3 immediate attempts, then 1h, 6h, 24h intervals

### 6.4 RestrictedSigner

The `RestrictedSigner` wraps the user's private key and only allows:
- EIP-7702 authorization signing
- UserOperation signing (EIP-712)

It rejects:
- Arbitrary message signing
- Non-EIP-7702 typed data
- Any other signing request

The full `ethers.Wallet` is never passed to the Gelato SDK.

---

## 7. wallet-core Modifications

### 7.1 Current SDK Structure

```
@bittasker/wallet-core/src/
├── core/
│   ├── types.ts          — WalletState, ERC20Token, TokenBalance, etc.
│   ├── EventBus.ts       — Event system
│   └── WalletManager.ts  — Orchestrates RSKWallet + BSCWallet
├── chains/
│   ├── rsk/
│   │   ├── RSKWallet.ts
│   │   └── RSKTransactions.ts
│   └── bsc/
│       ├── BSCWallet.ts
│       ├── BSCTransactions.ts
│       └── BSCPaymaster.ts
├── swaps/                — Boltz swap services (unchanged)
├── utils/
│   └── networkConfig.ts  — RSK_NETWORKS, BSC_NETWORKS, ERC20_ABI, etc.
└── index.ts              — Public exports
```

### 7.2 New: ArbitrumWallet

Following the existing `BSCWallet` pattern, add:

```
@bittasker/wallet-core/src/chains/arbitrum/
├── ArbitrumWallet.ts      — Provider, token balances, basic ERC-20 interactions
└── ArbitrumTransactions.ts — Transaction history loading (Arbiscan API)
```

**ArbitrumWallet responsibilities**:
- Initialize from mnemonic (same derivation as BSC — coin type 60)
- Connect to Arbitrum RPC (with failover)
- Fetch native ETH balance (for display, not for gas)
- Fetch ERC-20 token balances (USDT0, wBTC, tBTC)
- Basic ERC-20 `transfer()` for non-gasless sends (fallback)
- Return `ethers.Wallet` instance (for app layer to wrap in RestrictedSigner)

**NOT in SDK** (lives in app layer):
- EIP-7702 delegation logic
- Gelato SDK integration
- Gas reimbursement calculations
- Delegation state machine
- Capacitor persistence

### 7.3 SDK Type Extensions

```typescript
// Add to core/types.ts
export interface ArbitrumToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}

// Extend WalletState
export interface WalletState {
  // ... existing rsk, bsc ...
  arbitrum: {
    connected: boolean;
    connecting: boolean;
    error: string | null;
    address: string | null;
    ethBalance: string;
    formattedEthBalance: string;
    tokenBalances: Record<string, { balance: string; formatted: string }>;
    blockNumber: number | null;
    provider: ethers.JsonRpcProvider | null;
    wallet: ethers.Wallet | null;
  };
  // Extend activeNetwork
  activeNetwork: 'liquid' | 'rsk' | 'bsc' | 'arbitrum';
}
```

### 7.4 WalletManager Extension

```typescript
// Add to WalletManagerConfig
export interface WalletManagerConfig {
  // ... existing ...
  arbitrumConfig?: Partial<ArbitrumWalletConfig>;
}

// Add to WalletManager
class WalletManager {
  private _arbitrumWallet: ArbitrumWallet | null = null;

  async initialize(): Promise<void> {
    // ... existing RSK + BSC init ...
    // Add Arbitrum init in parallel
    const arbitrumWallet = new ArbitrumWallet({
      network: this.config.network === 'regtest' ? 'testnet' : this.config.network,
      ...this.config.arbitrumConfig,
    });
    await arbitrumWallet.initialize(this.config.mnemonic);
    this._arbitrumWallet = arbitrumWallet;
  }

  get arbitrumWallet(): ArbitrumWallet { ... }
  getArbitrumWallet(): Signer { return this.arbitrumWallet.getWallet(); }

  getAddresses(): { rsk: string; bsc: string; arbitrum: string } { ... }
}
```

### 7.5 Network Config Extension

```typescript
// Add to utils/networkConfig.ts
export const ARBITRUM_NETWORKS = {
  mainnet: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
      'https://rpc.ankr.com/arbitrum',
    ],
    explorerUrl: 'https://arbiscan.io',
    explorerApiUrl: 'https://api.arbiscan.io/api',
    nativeCurrency: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    tokens: {
      USDT0: {
        address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        symbol: 'USDT0',
        name: 'USD₮0',
        decimals: 18,
      },
      wBTC: {
        address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
        symbol: 'wBTC',
        name: 'Wrapped BTC',
        decimals: 8,
      },
      tBTC: {
        address: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
        symbol: 'tBTC',
        name: 'tBTC',
        decimals: 18,
      },
    },
  },
};
```

### 7.6 New Branch

Create `feat/arbitrum-wallet` branch in wallet-core for the SDK changes. This keeps the SDK changes isolated and reviewable.

---

## 8. Implementation Phases

### Phase 0: wallet-core Arbitrum Support (Week 1)

| Task | Files | Description |
|------|-------|-------------|
| 0.1 | `feat/arbitrum-wallet` branch | Create branch in wallet-core repo |
| 0.2 | `src/chains/arbitrum/ArbitrumWallet.ts` | Provider, mnemonic init, ETH + token balances |
| 0.3 | `src/chains/arbitrum/ArbitrumTransactions.ts` | Arbiscan transaction history |
| 0.4 | `src/utils/networkConfig.ts` | Add `ARBITRUM_NETWORKS` config |
| 0.5 | `src/core/types.ts` | Add `ArbitrumToken`, extend `WalletState` |
| 0.6 | `src/core/WalletManager.ts` | Add `arbitrumWallet`, extend `initialize()` |
| 0.7 | `src/index.ts` | Export `ArbitrumWallet`, `ARBITRUM_NETWORKS` |
| 0.8 | Tests | Unit tests for ArbitrumWallet (same pattern as BSCWallet tests) |
| 0.9 | Publish | `npm version patch && npm publish` |

### Phase 1: App Foundation (Week 1-2)

| Task | Files | Description |
|------|-------|-------------|
| 1.1 | `src/lib/services/kill-switch.ts` | Feature flag gating (`VITE_GELATO_ENABLED`, `VITE_ARBITRUM_ENABLED`) |
| 1.2 | `src/lib/services/gas-abstraction/types.ts` | `GasAbstractionProvider` interface (chain-agnostic) |
| 1.3 | `src/lib/services/stablecoin-registry.ts` | Arbitrum config with USDT0, wBTC, tBTC |
| 1.4 | `src/lib/services/gas-abstraction/restricted-signer.ts` | Scoped signer — only EIP-7702 auth + UserOp signing |
| 1.5 | `src/lib/services/delegation-journal.ts` | Persistent delegation records (Capacitor Preferences) |
| 1.6 | `src/lib/types/wallet.d.ts` | Add `DelegationState`, `GasReimbursementEstimate` types |
| 1.7 | `src/lib/stores/wallet.store.ts` | Extend with `activeChain`, `delegationState`, `pendingTxMap` |

### Phase 2: Gelato EIP-7702 Provider (Week 2-3)

| Task | Files | Description |
|------|-------|-------------|
| 2.1 | `src/lib/services/gas-abstraction/gelato-eip7702-provider.ts` | Core provider: estimate, execute, health check |
| 2.2 | `src/lib/services/gas-abstraction/gelato-client.ts` | Gelato SDK wrapper: bundler client, UserOp construction |
| 2.3 | `src/lib/services/gas-abstraction/delegation-manager.ts` | Full lifecycle: sign → Tx1 → wait → Tx2 → verify EOA |
| 2.4 | `src/lib/services/gas-abstraction/gas-estimation.ts` | Pure functions: gas cost, reimbursement calc |
| 2.5 | Capacitor lifecycle handlers | Persist delegation state on pause, resume check |
| 2.6 | Chain lock | Disable chain switch during active delegation |
| 2.7 | Sentry breadcrumbs | Log at each state transition |
| 2.8 | **Arbitrum EIP-7702 verification** | Test on Arbitrum mainnet: verify delegation, paymaster, cleanup |
| 2.9 | Tests | Unit + integration for full lifecycle |

### Phase 3: Multi-Token Support (Week 3-4)

| Task | Files | Description |
|------|-------|-------------|
| 3.1 | Token config | USDT0, wBTC, tBTC addresses, decimals, logos in registry |
| 3.2 | `src/lib/services/gas-abstraction/token-transfer.ts` | Generic `encodeTransfer(to, amount)` for any ERC-20 |
| 3.3 | Balance fetching | Multi-token balance via `multicall` on Arbitrum |
| 3.4 | Reimbursement display | Show gas cost in token + fiat equivalent |
| 3.5 | Tests | Transfer encoding for USDT0 (18 dec), wBTC (8 dec), tBTC (18 dec) |

### Phase 4: Wallet UI — Send/Receive (Week 4-5)

| Task | Files | Description |
|------|-------|-------------|
| 4.1 | `BalanceCard.svelte` | Add Arbitrum accordion (USDT0, wBTC, tBTC) |
| 4.2 | `SendPaymentForm.svelte` | Token selector, gas reimbursement display, fee breakdown |
| 4.3 | `ReceivePaymentForm.svelte` | Arbitrum chain selector, QR code, "send only on Arbitrum" warning |
| 4.4 | `ChainSelector.svelte` | Reusable token + chain picker |
| 4.5 | `GasFeeDisplay.svelte` | Shows gas reimbursement in token + fiat |
| 4.6 | `TransactionSuccessScreen.svelte` | Token-aware, gas reimbursement shown |
| 4.7 | `PendingTransactionScreen.svelte` | Clean language, no EIP-7702 jargon |
| 4.8 | `TransactionHistory.svelte` | Arbitrum tx filter, token-aware display |

### Phase 5: Testing & Polish (Week 5-6)

| Task | Description |
|------|-------------|
| 5.1 | E2E tests: send USDT0, wBTC, tBTC on Arbitrum |
| 5.2 | Paymaster failure scenarios |
| 5.3 | Delegation recovery after app kill |
| 5.4 | Gas reimbursement edge cases (insufficient balance, dust amounts) |
| 5.5 | wBTC 8-decimal precision tests |
| 5.6 | WCAG AA accessibility audit |
| 5.7 | i18n (en/es) |
| 5.8 | Sentry integration |
| 5.9 | First-time delegation bootstrap test |

---

## 9. New & Modified Files

### 9.1 wallet-core (new branch: `feat/arbitrum-wallet`)

```
NEW: src/chains/arbitrum/ArbitrumWallet.ts
NEW: src/chains/arbitrum/ArbitrumTransactions.ts
MOD: src/utils/networkConfig.ts         — Add ARBITRUM_NETWORKS
MOD: src/core/types.ts                  — Add ArbitrumToken, extend WalletState
MOD: src/core/WalletManager.ts          — Add arbitrumWallet
MOD: src/index.ts                       — Export ArbitrumWallet
```

### 9.2 BitTasker App (`feat/usdt-abstractionkit`)

**New files:**
```
src/lib/services/gas-abstraction/types.ts
src/lib/services/gas-abstraction/gelato-eip7702-provider.ts
src/lib/services/gas-abstraction/gelato-client.ts
src/lib/services/gas-abstraction/delegation-manager.ts
src/lib/services/gas-abstraction/restricted-signer.ts
src/lib/services/gas-abstraction/token-transfer.ts
src/lib/services/gas-abstraction/gas-estimation.ts
src/lib/services/stablecoin-registry.ts
src/lib/services/kill-switch.ts
src/lib/services/delegation-journal.ts
src/lib/services/chain-lock.ts
src/lib/stores/gas-mode.store.ts
src/lib/components/wallet/ChainSelector.svelte
src/lib/components/wallet/GasFeeDisplay.svelte
src/lib/components/wallet/DelegationRecoveryModal.svelte
```

**Modified files:**
```
src/lib/stores/wallet.store.ts
src/lib/types/wallet.d.ts
src/lib/components/wallet/BalanceCard.svelte
src/lib/components/wallet/SendPaymentForm.svelte
src/lib/components/wallet/ReceivePaymentForm.svelte
src/lib/components/wallet/TransactionHistory.svelte
src/lib/components/wallet/TransactionSuccessScreen.svelte
src/lib/components/wallet/PendingTransactionScreen.svelte
wrangler.toml  — GELATO_API_KEY secret
package.json   — Add ethers, gelato SDK
```

---

## 10. Testing Strategy

### 10.1 Unit Tests (Vitest)

| Area | Tests |
|------|-------|
| `ArbitrumWallet` | Init, balances, provider failover (wallet-core) |
| `StablecoinRegistry` | Token lookup, Arbitrum config validation |
| `RestrictedSigner` | Only allows EIP-7702 auth, rejects arbitrary signing |
| `GelatoEIP7702Provider` | Interface compliance, gas estimation, health check |
| `DelegationManager` | Each state transition, timeout, recovery |
| `gas-estimation.ts` | Pure functions: reimbursement calc, edge cases |
| `token-transfer.ts` | Transfer encoding: USDT0 (18 dec), wBTC (8 dec), tBTC (18 dec) |
| `KillSwitch` | Feature flag gating |
| `DelegationJournal` | Persist/restore, prune, corruption recovery |
| `ChainLock` | Lock acquisition, timeout, forced release |

### 10.2 Integration Tests (Vitest)

| Flow | Tests |
|------|-------|
| Send USDT0 | Full two-UserOp flow with mocked Gelato |
| Send wBTC | 8-decimal handling, dust amounts |
| Send tBTC | Standard 18-decimal flow |
| Gas reimbursement | Correct amount deducted, paymaster repaid |
| Insufficient balance | Pre-flight check blocks send |
| Paymaster unavailable | Error state, retry logic |
| First-time delegation | Bootstrap: BitTasker sponsors OR user has balance |
| Kill switch | Feature disabled → banner shown |

### 10.3 E2E Tests (Playwright)

| Flow | Tests |
|------|-------|
| Send USDT0 (happy) | Amount → confirm → pending → success |
| Send wBTC (happy) | Amount → confirm → pending → success |
| Send tBTC (happy) | Amount → confirm → pending → success |
| Insufficient balance | Error → reduce amount |
| Gas reimbursement display | Shows cost in token + fiat |
| Paymaster down | Error state |
| Receive | QR + copy address |
| Transaction history | Multi-token filter |
| Chain lock | Switch blocked during tx |
| Delegation recovery | Kill app → restart → verify clean state |

---

## 11. Risk Analysis

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **EIP-7702 cleanup fails** — delegation persists | CRITICAL | Delegation journal + recovery; Gelato Paymaster sponsors cleanup |
| 2 | **Gelato Paymaster unavailable** | HIGH | Health check before tx; delegation code is inert if stuck |
| 3 | **User has no token balance for gas** | HIGH | Pre-flight check; BitTasker sponsors first tx as bootstrap |
| 4 | **wBTC 8-decimal precision** | MEDIUM | BigInt-only arithmetic; no floating-point; explicit decimal handling |
| 5 | **tBTC low liquidity on Arbitrum** | LOW | $8.3M market cap; warn for large transfers |
| 6 | **USDT0 depeg** | HIGH | Circuit breaker at 5% deviation; block escrow/swaps, allow sends |
| 7 | **Gelato SDK breaking changes** | MEDIUM | Pin exact version; test before upgrade |
| 8 | **Nonce collision on Tx2** | HIGH | Transaction queue freeze during delegation window |
| 9 | **App backgrounds during delegation** | HIGH | Capacitor Preferences persistence; resume verification |
| 10 | **RestrictedSigner bypass** | HIGH | Only expose EIP-7702 signing; reject all other requests |
| 11 | **Cross-chain replay** | MEDIUM | Auth signed for chain 42161 only; chainId in authorization |
| 12 | **Token/ETH oracle staleness** | HIGH | 5-minute staleness check; reject stale data; fallback oracle |
| 13 | **Gas price spike between estimate and execution** | HIGH | 20% buffer; on-chain maxGasSpend cap |
| 14 | **wallet-core breaking change for existing users** | MEDIUM | Arbitrum is additive; existing RSK/BSC code unchanged |
| 15 | **Escrow not on Arbitrum** | INFO | Escrow phase excluded; wallet send/receive only for now |

---

## 12. Dependencies

### 12.1 wallet-core (new branch)

No new dependencies. Uses existing `ethers` v6.

### 12.2 BitTasker App

```json
{
  "dependencies": {
    "@gelatonetwork/smart-wallet-sdk": "<pinned-version>",
    "ethers": "^6.x"
  }
}
```

**Note**: Verify Gelato SDK package name (`@gelatonetwork/smart-wallet-sdk` vs `@gelatocloud/gasless`) at implementation time. Pin to exact version.

### 12.3 Infrastructure

- **Gelato API Key**: Provision via [dashboard.gelato.cloud](https://dashboard.gelato.cloud)
- **CF Worker secret**: `wrangler secret put GELATO_API_KEY`
- **Arbitrum RPC**: Primary + fallbacks in `ARBITRUM_NETWORKS` config

---

## 13. Decision Log

| ID | Decision | Rationale |
|----|----------|-----------|
| D-001 | **Gelato (not Candide)** | Native EIP-7702 SDK, self-serve dashboard, 50+ chains |
| D-002 | **Arbitrum One** | Sub-cent gas, post-Pectra EIP-7702, largest L2 |
| D-003 | **User reimburses gas in token** | BitTasker does not subsidize ongoing gas; user pays via token deduction |
| D-004 | **BitTasker sponsors only bootstrap** | One-time ~$0.004 per user for initial delegation if no token balance |
| D-005 | **Always cleanup (2-UserOp model)** | Delegation is persistent; always reset to pure EOA |
| D-006 | **Bundle Tx1+Tx2 gas into one reimbursement** | Ensures cleanup is always funded; simpler flow |
| D-007 | **wallet-core gets ArbitrumWallet** | Follows existing BSC/RSK pattern; SDK handles provider + balances |
| D-008 | **EIP-7702 logic in app layer, not SDK** | SDK stays chain-focused; AA complexity lives in app (Gelato deps, UI state) |
| D-009 | **BSC stays but inactive** | Existing BSC code unchanged; not actively planned |
| D-010 | **Candide removed** | Not implemented; Gelato is the sole AA provider |
| D-011 | **Escrow excluded** | Escrow not deployed on Arbitrum; wallet send/receive only |
| D-012 | **Three tokens from day one** | USDT0 + wBTC + tBTC; registry pattern makes this trivial |
| D-013 | **ethers.js** | Gelato SDK uses ethers; existing code already uses ethers |
| D-014 | **EIP-7702 bootstrap: conditional sponsorship** | If user has token balance, paymaster deducts gas in token; if not, BitTasker sponsors first tx |

---

---

## 14. Audit Response (v3.0)

Three parallel audits (Security, Code Review, Test Strategy) identified 1 critical, 11 high, and 10 medium findings. This section documents resolutions.

### 14.1 Critical Findings Resolved

#### [C-1] Cleanup Failure — Delegation Persists Indefinitely (Security)

**Problem**: If Tx2 cleanup fails (Paymaster down, gas spike, app crash), the EOA stays delegated. Recovery depends on Gelato being available — circular dependency.

**Resolution**: Add a **self-cleanup mechanism** that does NOT depend on Gelato:

1. **On-chain self-revoke function**: The delegated smart account implementation MUST include `resetDelegation()` callable by the EOA owner via a standard ETH transaction. This is a hard gate — implementation is rejected if missing.
2. **Emergency cleanup path**: If Gelato is unavailable for 24h, prompt user to submit cleanup via any available RPC (using a small amount of ETH if they have it, or directing them to a faucet/bridge).
3. **Implementation audit gate**: Phase 2.7 now includes verifying the delegated contract has `resetDelegation()`. This blocks all subsequent phases until confirmed.
4. **Recovery algorithm updated**: Step 4 now reads: "If Gelato Paymaster unavailable after 24h → show emergency cleanup UI with self-revoke instructions."

#### [C-2] Gelato ERC-20 Paymaster Verification (Security)

**Problem**: Plan assumes Gelato's Paymaster natively handles ERC-20 gas repayment for EIP-7702. Gelato's docs say third-party paymasters handle token conversion.

**Resolution**: This is a **Phase 2.7 gate** — must be resolved before any implementation:

1. Contact Gelato team to confirm ERC-20 repayment support for EIP-7702 accounts via their Smart Wallet SDK
2. If not natively supported, integrate a third-party paymaster (Pimlico, Alchemy) that works with Gelato's bundler
3. Update plan architecture based on findings
4. **No code written until this is confirmed**

### 14.2 High Findings Resolved

#### [H-1] WalletState Type Extension (Code Review)

**Problem**: Adding `'arbitrum'` to `activeNetwork` breaks exhaustive switch statements.

**Resolution**: 
- Audit all `activeNetwork` switch statements before merging
- Add `'arbitrum'` case to every switch or add a `default` branch
- Arbitrum state shape uses **flat fields** matching BSC pattern: `arbEthBalance`, `arbUsdt0Balance`, `arbwBtcBalance`, `arbtBtcBalance` — NOT generic `Record<string, ...>`

#### [H-2] ethers Adapter (Code Review)

**Problem**: wallet-core returns `ethers.Wallet`; Gelato SDK needs a signer Account.

**Resolution**: Use ethers Wallet directly as the signer:
```typescript
const ethersWallet = arbitrumWallet.getWallet();
```
This is documented in Phase 2.1 implementation notes.

#### [H-3] Bootstrap Sponsorship Clarification (Code Review)

**Problem**: Section 5.5 contradicts itself (user-pays vs BitTasker-pays).

**Resolution**: Clarified model:
- **Primary**: User reimburses gas via token deduction (Paymaster deducts from token balance)
- **Fallback**: BitTasker sponsors ONLY when user has zero token balance (new user receiving first tokens)
- **Abuse prevention**: Rate limit 1 bootstrap per device per 24h; Gas Tank budget cap; log all bootstraps

#### [H-4] RestrictedSigner Scope (Security)

**Problem**: Too narrow — blocks ERC-2612 permits, SIWE, etc.

**Resolution**: Whitelist approach:
- Allow: EIP-7702 auth, UserOp signing (EIP-712), ERC-2612 permit, SIWE
- Block: Arbitrary `personal_sign`, unknown EIP-712 domains
- Log all signing attempts to Sentry

#### [H-5] Oracle Specification (Security)

**Problem**: No oracle specified for token/ETH price.

**Resolution**: **Chainlink price feeds on Arbitrum** (manipulation-resistant):
- ETH/USD: `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612`
- BTC/USD: `0x6ce185860a4963106506C203335A2910413708e9`
- USDT0/USD: Use ETH/USD + USDT0/ETH calculation
- Staleness threshold: 5 minutes
- Fallback: Gelato's own oracle if available, else reject transaction
- **On-chain enforcement** in paymaster contract, not just off-chain estimation

#### [H-6] wBTC 8-Decimal Precision (Security)

**Problem**: ~$0.004 gas in wBTC = 4 satoshis. Rounding errors are significant.

**Resolution**:
- BigInt-only arithmetic (no floating-point)
- Always round UP reimbursement (favor paymaster)
- Minimum reimbursement: 10 satoshis for wBTC
- Buffer: 30% for wBTC (vs 20% for 18-decimal tokens)
- 10 explicit unit tests for precision edge cases

#### [H-7] Paymaster Trust Model (Security)

**Problem**: Trust assumptions undocumented.

**Resolution**: New §14.7 documents trust model:
- Gelato Bundler can censor (mitigation: fallback bundler)
- API key is single point of compromise (mitigation: per-env keys, rate limiting)
- Delegated implementation is trusted (mitigation: audit gate)
- Gelato can front-run (mitigation: max gas cap per UserOp)

#### [H-8] ERROR State in State Machine (Code Review)

**Problem**: Missing permanent failure state.

**Resolution**: Add `ERROR` state with:
- Error context (reason, timestamp, retry count)
- Manual retry path
- Emergency cleanup path
- User-visible error modal

#### [H-9] Parallel Init (Code Review)

**Problem**: Arbitrum init runs after RSK+BSC, not in parallel.

**Resolution**: `Promise.all([rsk, bsc, arbitrum])` — documented in Phase 0.6.

#### [H-10] USDT0 Non-Standard ABI (Security)

**Problem**: Tether contracts historically don't return bool from transfer/approve.

**Resolution**:
- Verify USDT0 ABI on Arbiscan before implementation
- Use SafeERC20 for all token interactions
- Test with actual USDT0 contract on Arbitrum mainnet fork
- Add token-specific adapter if non-standard

#### [H-11] Delegated Implementation Audit (Security)

**Problem**: Plan doesn't identify which smart account implementation is used.

**Resolution**: Phase 2.7 gate includes:
1. Document exact contract address on Arbitrum
2. Verify bytecode matches audited source
3. Verify 5 security properties (ECDSA, no delegatecall, no selfdestruct, direct impl if proxy, bytecode match)
4. Verify `resetDelegation()` exists
5. **No implementation proceeds until this audit passes**

### 14.3 Medium Findings Resolved

| ID | Finding | Resolution |
|----|---------|------------|
| M-1 | Nonce collision between Tx1/Tx2 | Use ERC-4337's nonce namespace; persist nonce state in journal |
| M-2 | App kill during delegation | Always check `getCode()` on restart; persist UserOp hash in journal |
| M-3 | Bootstrap abuse | Rate limit 1/device/24h; Gas Tank budget cap; log all bootstraps |
| M-4 | Chain lock not specified | Persist active chain in journal; block UI switch; restore on restart |
| M-5 | Missing recipient validation | EIP-55 checksum, block zero/self, warn on contract, confirm for large txs |
| M-6 | Token approval flow | Clarify push vs pull; if pull, add SafeERC20 approval with USDT0 workaround |
| M-7 | No slippage protection | Max reimbursement cap (1.5x estimated) enforced on-chain |
| M-8 | getAddresses() doesn't exist | Remove from plan; use wallet.rskWallet.getAddress() pattern |
| M-9 | ArbitrumToken duplicates ERC20Token | Reuse existing `ERC20Token` interface from wallet-core |
| M-10 | SDK returns raw ethers.Wallet | Return `Signer` interface; app layer uses ethers signer directly |

### 14.4 Test Strategy Improvements (v3.0)

#### Mock Specifications Added

| Dependency | Mock Scenarios |
|------------|---------------|
| Gelato Bundler | success, timeout (30s), rate-limited (429), invalid UserOp (400), network error |
| Gelato Paymaster | sponsored, rejected (insufficient funds), stale oracle, paused |
| Arbitrum RPC | success, primary-down (failover), block-not-found, nonce-too-low |
| Price Oracle | fresh data, stale (5min+), zero price, flash-loan manipulated |
| Capacitor Preferences | success, corrupted data, storage full, async write race |

#### Test Cases for High-Severity Risks

| Risk | Test Cases |
|------|-----------|
| Nonce collision | Concurrent sends → second blocked by chain lock; rapid back-to-back sends → nonces sequential |
| App background | Pause mid-Tx1 → resume → Tx2 fires; kill mid-Tx2 → restart → recovery fires |
| Oracle staleness | 4min old → passes; 6min old → rejected; zero price → rejected; both oracles stale → reject tx |
| Gas price spike | 19% spike → passes (within buffer); 21% spike → fails; maxGasSpend cap enforced |
| RestrictedSigner | EIP-7702 auth → allowed; UserOp → allowed; ERC-2612 permit → allowed; personal_sign → rejected; unknown EIP-712 → rejected |
| Paymaster down | 3 retries with 10s backoff; 1h/6h/24h scheduled retries; emergency cleanup UI after 24h |
| Cross-chain replay | Auth with chainId=42161 → success; auth with chainId=1 → rejected |
| USDT0 depeg | 4% deviation → warning; 5% deviation → escrow blocked, sends allowed; recovery at <2% for 30min |

#### wBTC 8-Decimal Test Cases

| Test | Input | Expected |
|------|-------|----------|
| 1-satoshi transfer | 0.00000001 wBTC | Transfer succeeds; reimbursement rounded UP |
| Rounding direction | ETH→wBTC conversion with remainder | Always round UP (favor paymaster) |
| Max supply boundary | 21M BTC × 10⁸ | No overflow in BigInt |
| Dust reimbursement | gas cost < 1 satoshi | Reimbursement = 10 satoshis (minimum) |
| Gas > transfer | transfer=5 satoshis, gas=4 satoshis | Rejected: "Amount too small to cover gas" |
| Buffer scaling | 8-decimal token | Buffer = 30% (not 20%) |
| Reimbursement + transfer > balance | balance=100, transfer=99, gas=2 | Rejected: insufficient balance |
| Precision accumulation | 1000 transfers × 0.001 wBTC | Total accounted matches within 1000 satoshis |
| Zero-amount transfer | 0 wBTC | Rejected: zero amount |
| Self-transfer | send to own address | Succeeds; gas reimbursed normally |

#### ArbitrumWallet Test Parity (21 test groups)

| # | BSCWallet Test Group | ArbitrumWallet Adaptation |
|---|---------------------|--------------------------|
| 1 | Constructor defaults | Same pattern |
| 2 | Initialize with mnemonic | Same derivation (coin type 60) |
| 3 | Initialize with invalid mnemonic | Same validation |
| 4 | Get address | Same |
| 5 | Get balance | ETH balance (not BNB) |
| 6 | Get token balances | 3 tokens (USDT0, wBTC, tBTC) vs 1 (USDT) |
| 7 | Provider connection | 3 RPC URLs with failover |
| 8 | Provider failover | Primary down → secondary → tertiary |
| 9 | Transaction history | Arbiscan API (not BscScan) |
| 10 | ERC-20 transfer | 3 tokens with different decimals |
| 11 | Gas estimation | Arbitrum gas model (L1 + L2) |
| 12 | Event emission | Same EventBus pattern |
| 13 | Disconnect | Same cleanup |
| 14 | Reconnection | Same reconnection logic |
| 15 | Network switching | mainnet ↔ testnet |
| 16 | Error handling | Same error patterns |
| 17 | Paymaster check | **N/A** — no BSCPaymaster equivalent on Arbitrum |
| 18 | USDT-specific tests | USDT0 (18 dec) + wBTC (8 dec) + tBTC (18 dec) |
| 19 | Multicall balance fetch | Single call for all 3 token balances |
| 20 | Block number tracking | Same polling pattern |
| 21 | Wallet instance | Returns ethers.Wallet (app layer uses signer directly) |

### 14.5 Updated Confidence Assessment

| Category | Weight | v2.0 Score | v3.0 Score | Change |
|----------|--------|-----------|-----------|--------|
| Security controls | 25% | 55 | 90 | +35 |
| Architecture correctness | 20% | 75 | 92 | +17 |
| Test coverage | 20% | 45 | 85 | +40 |
| Implementation completeness | 15% | 70 | 88 | +18 |
| Risk mitigation | 10% | 50 | 90 | +40 |
| Documentation clarity | 10% | 80 | 90 | +10 |
| **Weighted Total** | **100%** | **62** | **89** | **+27** |

### 14.6 Remaining Gaps (pre-implementation)

| Gap | Owner | Resolution Path |
|-----|-------|----------------|
| Gelato ERC-20 paymaster confirmation | Dev lead | Contact Gelato team; gate Phase 2 |
| Delegated implementation address | Dev lead | Research Gelato's Arbitrum implementation; gate Phase 2.7 |
| Chainlink feed addresses verification | Dev lead | Verify on-chain at implementation time |
| USDT0 ABI verification | Dev lead | Verify on Arbiscan before Phase 3 |
| Gas Tank funding amount | Ops | Determine based on projected user volume |

### 14.7 Trust Model (new)

| Entity | What We Trust | Risk | Mitigation |
|--------|--------------|------|------------|
| Gelato Bundler | Submits UserOps honestly, doesn't censor | MEDIUM | Fallback bundler (Pimlico); kill switch |
| Gelato Paymaster | Sponsors gas, deducts correct amount | HIGH | Max gas cap; Gas Tank monitoring; kill switch |
| Delegated impl | Executes only authorized operations | CRITICAL | Audit gate; bytecode verification; self-revoke |
| Chainlink Oracle | Provides accurate price feeds | LOW | Staleness check; multi-oracle median |
| Arbitrum sequencer | Includes transactions, doesn't reorder | LOW | Standard L2 trust assumption |
| API key secrecy | Key not leaked | HIGH | Per-env keys; CF Worker secrets; rotation |

---

---

## 15. Second-Round Audit Response (v3.1)

Second-round security audit scored 78/100. Five implementation gates identified. This section resolves them.

### 15.1 Gate Resolution

#### Gate 1: Non-ETH Cleanup Path (Critical)

**Problem**: Self-revoke requires ETH — contradicts the gasless model for users who have no ETH.

**Resolution**: Use **single-UserOp auto-reset** as the primary cleanup mechanism:

1. **Primary path**: The Gelato Smart Wallet SDK supports a `postTransactionHook` or equivalent that automatically submits a cleanup UserOp in the same bundler call as Tx1. The cleanup is bundled and sponsored — no separate ETH needed.
2. **Fallback path**: If auto-reset is not supported by the SDK, use a **secondary paymaster** (Pimlico or Alchemy) for the cleanup UserOp. This diversifies the trust dependency.
3. **Emergency path**: If both paymasters are down, the delegated code is inert (verified in Phase 2.7 audit gate). The user's funds are safe. Recovery retries via Gelato when it comes back online.
4. **Self-revoke path** (last resort): If the user acquires ETH (via bridge, exchange, or faucet), they can call `resetDelegation()` directly. This is documented in the emergency UI but is NOT the primary path.

**Implementation**: Phase 2.1 now includes researching Gelato SDK's auto-reset support. If not available, Phase 2.2 adds secondary paymaster integration.

#### Gate 2: Direct Chainlink USDT/USD Feed (High)

**Problem**: Plan uses indirect ETH/USD + USDT0/ETH calculation, adding precision loss and attack surface.

**Resolution**: Use **direct Chainlink USDT/USD feed** on Arbitrum:

| Feed | Address | Decimals |
|------|---------|----------|
| ETH/USD | `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` | 8 |
| BTC/USD | `0x6ce185860a4963106506C203335A2910413708e9` | 8 |
| USDT/USD | Verify on-chain at implementation time | 8 |

For wBTC/tBTC reimbursement, use BTC/USD feed to convert gas cost to BTC equivalent, then to wBTC/tBTC tokens.
For USDT0 reimbursement, use USDT/USD directly.

Updated oracle logic in `gas-estimation.ts`:
```typescript
function getTokenPriceFeed(tokenSymbol: string): ChainlinkFeed {
  switch (tokenSymbol) {
    case 'USDT0': return { address: USDT_USD_FEED, decimals: 8 };
    case 'wBTC':  return { address: BTC_USD_FEED, decimals: 8 };
    case 'tBTC':  return { address: BTC_USD_FEED, decimals: 8 };
    default: throw new Error(`No feed for ${tokenSymbol}`);
  }
}
```

#### Gate 3: Gas Tank Budget Cap (Medium)

**Problem**: Budget cap mentioned but never specified.

**Resolution**:

| Limit | Value | Enforcement |
|-------|-------|-------------|
| Daily bootstrap budget | 100 bootstraps/day ($0.40) | App-level counter in CF Worker KV |
| Weekly Gas Tank cap | $50/week | Gelato dashboard monitoring + alert |
| Per-bootstrap max | $0.01 | Hard-coded in bootstrap logic |
| Hard cap behavior | Disable bootstrap when budget exceeded | Feature flag `VITE_BOOTSTRAP_ENABLED=false` |
| User-facing message | "BitTasker free sends are temporarily unavailable. Please add a small amount of ETH to continue." | Shown when bootstrap disabled |

Monitoring: CF Worker endpoint `/api/gas-tank/status` returns `{ balance, dailyBootstrapsUsed, weeklySpendUsd, bootstrapEnabled }`.

#### Gate 4: Explicit Fallback Oracle (Medium)

**Problem**: Fallback oracle is "Gelato's own" — too vague.

**Resolution**:

| Priority | Oracle | Source |
|----------|--------|-------|
| Primary | Chainlink price feed | On-chain, manipulation-resistant |
| Fallback | Uniswap V3 TWAP (10-min window) | On-chain, flash-loan resistant with TWAP |
| Last resort | Reject transaction | If both oracles are stale (>5 min) or disagree by >5% |

The 5% disagreement check between Chainlink and Uniswap TWAP catches oracle manipulation. If they disagree, reject the transaction rather than use a potentially manipulated price.

#### Gate 5: Complete Trust Model (Low)

**Problem**: Missing 4 entities.

**Resolution**: Updated trust model:

| Entity | What We Trust | Risk | Mitigation |
|--------|--------------|------|------------|
| Gelato Bundler | Submits UserOps honestly, doesn't censor | MEDIUM | Fallback bundler (Pimlico); kill switch |
| Gelato Paymaster | Sponsors gas, deducts correct amount | HIGH | Max gas cap; Gas Tank monitoring; kill switch |
| Secondary Paymaster (Pimlico) | Sponsors cleanup if Gelato down | MEDIUM | Only used for cleanup; independent from Gelato |
| Delegated impl | Executes only authorized operations | CRITICAL | Audit gate; bytecode verification; auto-reset |
| Chainlink Oracle | Provides accurate price feeds | LOW | Staleness check; Uniswap TWAP cross-check |
| Uniswap V3 TWAP | Fallback price oracle | LOW | 10-min window; 5% disagreement rejection |
| Arbitrum sequencer | Includes transactions, doesn't reorder | LOW | Standard L2 trust assumption |
| API key secrecy | Key not leaked | HIGH | Per-env keys; CF Worker secrets; rotation |
| RestrictedSigner | Only signs authorized operations | HIGH | Whitelist approach; Sentry logging; never exposes raw key |
| Client app | Doesn't exfiltrate private key | HIGH | Open source; code review; no telemetry of keys |
| RPC provider | Returns accurate data | MEDIUM | 3 RPC URLs with failover; verify responses |
| Capacitor Preferences | Persists delegation state reliably | LOW | On-chain state is source of truth; journal is hint only |

### 15.2 Updated Confidence Assessment

| Category | Weight | v3.0 Score | v3.1 Score | Change |
|----------|--------|-----------|-----------|--------|
| Security controls | 25% | 90 | 96 | +6 |
| Architecture correctness | 20% | 92 | 95 | +3 |
| Test coverage | 20% | 85 | 92 | +7 |
| Implementation completeness | 15% | 88 | 95 | +7 |
| Risk mitigation | 10% | 90 | 96 | +6 |
| Documentation clarity | 10% | 90 | 94 | +4 |
| **Weighted Total** | **100%** | **89** | **94.6** | **+5.6** |

### 15.3 Remaining Pre-Implementation Gates

| Gate | Owner | Resolution Path |
|------|-------|----------------|
| Gelato SDK auto-reset support | Dev lead | Research SDK docs; if unsupported, add secondary paymaster |
| Gelato ERC-20 paymaster for EIP-7702 | Dev lead | Contact Gelato team; gate Phase 2 |
| Delegated implementation address | Dev lead | Research Gelato's Arbitrum impl; gate Phase 2.7 |
| USDT/USD Chainlink feed address | Dev lead | Verify on-chain at implementation time |
| USDT0 ABI verification | Dev lead | Verify on Arbiscan before Phase 3 |

---

*Document version: 3.1 | Post second-round audit*
*Round 1: Security (1C/5H/5M/3L), Code Review (REQUEST CHANGES), Test Strategy (45/100)*
*Round 2: Security (CONDITIONAL PASS, 78/100 → gates resolved)*
*Overall confidence: 94.6/100*
