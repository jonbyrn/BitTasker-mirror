# USDT Integration Plan — EIP-7702 Gas Abstraction

> **Revision**: v4.4 — USDT Gas Abstraction + Changelly Swaps + RSK Migration

---

## Overview

Integrate USDT (USDT on BNB Smart Chain, extensible to additional chains) into the BitTasker wallet infrastructure alongside existing rBTC (Bitcoin on Rootstock)/RSK support. The key innovation is **gas fee abstraction** — users pay gas fees in USDT rather than the chain's native token (BNB), using EIP-7702 delegation via Candide AbstractionKit.

**EIP-7702 USDT gas is the only user-facing path.** All gas fees are paid in USDT via EIP-7702 delegation. There is no user-facing gas mode selector — USDT gas is the default and only visible option. **Hidden BNB fallback:** If the paymaster is unavailable and the user holds BNB, the app silently retries with BNB as gas. This is never exposed in the UI — the user sees only a slight delay while the fallback activates, then a normal success. This ensures funds can always move even if the gas sponsor is down.

**Wallet only holds rBTC and USDT.** The wallet displays exactly two balances: rBTC (on Rootstock) and USDT (on BNB Smart Chain). No other tokens are held or displayed. Changelly swaps deposit incoming crypto directly to USDT or rBTC — the user never sees intermediate tokens. The only exception is BNB, used invisibly for emergency gas recovery only. All swap-to-wallet flows use Changelly's receive address feature, not the wallet's own address for non-USDT/non-rBTC tokens.

**EIP-7702 Reality (audit finding #1 from security review):** Delegation is **persistent** — the account code set by EIP-7702 remains until explicitly cleared by a subsequent transaction. The plan now reflects this truth: each USDT-gas transaction includes an **explicit cleanup transaction** that restores the account to pure EOA state.

This plan also includes migrating existing RSK users to the industry-standard EVM derivation path `m/44'/60'/0'/0/0` (BIP44 coin type 60 for Ethereum, used by all major EVM wallets including MetaMask). Using coin type 60 ensures the same address is derived on all EVM-compatible chains (RSK, BSC, Polygon, etc.), giving the user a single address for rBTC, USDT, and future tokens. This plan is also designed for extensibility to USDC and other stablecoins. **Defensive programming is enforced throughout**: all financial calculations are pure functions, the delegation lifecycle is a typed state machine with exhaustive transitions, all async operations use `tryCatch()`, all inputs are validated at system boundaries, and on-chain state is always the source of truth.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [EIP-7702 Delegation Lifecycle](#2-eip-7702-delegation-lifecycle)
   - 2.4 [Gas Payment for Cleanup Transaction](#24-gas-payment-for-cleanup-transaction)
   - 2.5 [Nonce Management During Delegation Window](#25-nonce-management-during-delegation-window)
   - 2.6 [Delegation Recovery Algorithm](#26-delegation-recovery-algorithm)
   - 2.7 [Biometric Transaction Confirmation](#27-biometric-transaction-confirmation)
3. [Chain & Token Extensibility](#3-chain--token-extensibility)
4. [RSK Derivation Path Migration](#4-rsk-derivation-path-migration)
5. [Comprehensive UI Integration Points](#5-comprehensive-ui-integration-points)
6. [ASCII UI Mockups (Happy Path + Error States)](#6-ascii-ui-mockups)
7. [Implementation Phases](#7-implementation-phases)
8. [Testing Strategy](#8-testing-strategy)
9. [Risk Analysis & Mitigations](#9-risk-analysis--mitigations)
10. [Operational Safety: Kill Switch & Rollback](#10-operational-safety)
    - 10.2 [Rollback Procedure](#102-rollback-procedure)
    - 10.3 [Paymaster Pause Mechanism](#103-paymaster-pause-mechanism)
    - 10.4 [Paymaster Rate Limiting](#104-paymaster-rate-limiting)
    - 10.5 [Defensive & Deterministic Programming](#105-defensive--deterministic-programming)
11. [Dependencies & Tooling](#11-dependencies--tooling)
    - 11.2 [Testing wallet-core Changes Locally](#112-testing-wallet-core-changes-locally)
12. [Audit Trail & Confidence Tracking](#12-audit-trail)
13. [Feature Flag Dependency Map](#13-feature-flag-dependency-map)

---

## 1. Architecture Overview

### 1.1 System Layers

```
+------------------------------------------------------------------+
|                    BitTasker UI (Svelte 5)                         |
|   Wallet Dashboard | Send/Receive | Escrow | Swaps | Settings     |
+------------------------------------------------------------------+
|              Wallet Store ($walletStore + $gasModeStore)            |
|   Multi-chain state | Token Selection | Delegation State | Pending Tx Map  |
+------------------------------------------------------------------+
|              BitTasker Wallet SDK (@bittasker/wallet-core)          |
|   WalletManager | BSCWallet | RSKWallet | Paymaster | Swaps       |
+------------------------------------------------------------------+
|     EIP-7702 Layer (NEW)                                           |
|   GasAbstractionProvider interface | DelegationManager             |
|   Candide AbstractionKit adapter | RestrictedSigner               |
+------------------------------------------------------------------+
|     Changelly Layer (NEW)                                           |
|   Swap API (HMAC-SHA256 via CF Worker) | Fiat API (SDK direct)    |
+------------------------------------------------------------------+
|              Stability Layer (NEW)                                  |
|   Kill Switch | Chain Lock | Delegation Journal                    |
|   Capacitor Lifecycle Handlers                     |
+------------------------------------------------------------------+
|              Chain Providers                                        |
|   BSC (chainId 56) | RSK (chainId 30) | Future Chains              |
+------------------------------------------------------------------+
```

### 1.2 Key Components

| Component                            | Responsibility                                                                                                                      | Status     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `WalletManager`                      | Multi-chain orchestration, swap services                                                                                            | **Exists** |
| `BSCWallet`                          | BSC transactions, USDT balance                                                                                                      | **Exists** |
| `BSCPaymasterContract`               | Paymaster deposit checks, USDT/BNB price conversion                                                                                 | **Exists** |
| `GasAbstractionProvider` (interface) | Abstract gas payment — implementations swap out without UI changes                                                                  | **NEW**    |
| `EIP7702DelegationManager`           | Full lifecycle: sign → delegate → send → verify → **cleanup**                                                                       | **NEW**    |
| `RestrictedSigner`                   | Scoped signer wrapper — never exposes raw private key to SDK                                                                        | **NEW**    |
| `StablecoinRegistry`                 | Chain-agnostic registry of supported stablecoins and paymasters                                                                     | **NEW**    |
| `DerivationMigrator`                 | RSK path migration with two-phase commit and reorg resilience                                                                       | **NEW**    |
| `GasModeStore`                       | User preference + paymaster health + depeg circuit breaker                                                                          | **NEW**    |
| `KillSwitch`                         | Emergency disable (EIP-7702 + USDT independently)                                                                                   | **NEW**    |
| `DelegationJournal`                  | Persistent record of every delegation + outcome for recovery (prune completed entries older than 30 days; max 100 entries retained) | **NEW**    |
| `ChainLock`                          | Prevents chain switching during active transactions                                                                                 | **NEW**    |
| `FeatureFlagService`                 | Unified FF gating — VITE\_ env vars (build-time)                                                                                    | **NEW**    |

### 1.3 EIP-7702: Corrected Understanding

EIP-7702 introduces a transaction type where an EOA can set its smart contract code via an `authorization_list`. **This code persists** after the transaction completes — it does NOT auto-revoke. The account remains delegated until an explicit cleanup transaction clears the code.

**Our corrected model:**

- **Before transaction**: EOA — standard externally owned account
- **Transaction 1 (EIP-7702 delegation + business logic)**: EOA temporarily gets code that authorizes USDT gas payment. The business operation (transfer, escrow call) executes. Account now has persistent delegation code.
- **Transaction 2 (cleanup)**: A second EIP-7702 transaction sets delegation to `address(0)`, clearing the code. Account returns to pure EOA.
- **Total**: 2 transactions per user action when using USDT gas.

```
+--------+    Tx1: EIP-7702     +-------------------+    Tx2: cleanup     +--------+
|  EOA   | -------------------> | Delegated Account | ------------------> |  EOA   |
| (pure) |                      | (pays gas in USDT)|                    | (pure) |
+--------+                      +-------------------+                    +--------+
         < -- -- -- -- -- -- -- -- persistent code -- -- -- -- -- -- -- -->
         (code remains until Tx2 explicitly clears it)
```

---

---

## 2. EIP-7702 Delegation Lifecycle

### 2.1 State Machine

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

### 2.2 Detailed Sequence (with Cleanup)

```
UserAction  │  UI  │  WalletStore  │  DelegationManager  │  Chain
────────────┼──────┼───────────────┼─────────────────────┼─────────
"Send USDT" │      │               │                     │
  ────────→ │      │               │                     │
            │ Lock chain selector  │                     │
            │ (no switching now)   │                     │
            │──────→│              │                     │
            │       │ prepareTx()  │                     │
            │       │─────────────→│                     │
            │       │              │ estimateGasInUSDT() │
            │       │              │─────────────────────→│
            │       │              │←─── {usdtCost} ─────│
            │       │←─── estimate │                     │
            │←── confirm ──────── │                     │
            │       │              │                     │
"Confirm"   │       │              │                     │
  ────────→ │       │              │                     │
            │ Persist delegState   │                     │
            │ to Capacitor Prefs   │                     │
            │ (await Preferences.set() before proceeding) │
            │       │─────────────→│                     │
            │       │              │ signAuth()          │
            │       │              │ (RestrictedSigner)  │
            │       │              │ State: AUTH_SIGNED  │
            │       │              │                     │
            │       │              │ Tx1: delegate+send  │
            │       │              │─────────────────────→│
            │       │              │ State: TX1_SUBMITTED│
            │       │              │←─── tx1Hash ───────│
            │       │←─── tx1Hash ─│                     │
            │←── pending screen ──│                     │
            │       │              │                     │
            │       │              │ waitForBlock(tx1)   │
            │       │              │─────────────────────→│
            │       │              │←─── receipt ────────│
            │       │              │ State: TX1_MINED    │
            │       │              │ verifyTx1Success()  │
            │       │              │                     │
            │       │              │ Tx2: cleanup        │
            │       │              │ (set code=address(0))│
            │       │              │─────────────────────→│
            │       │              │ State: TX2_SUBMITTED│
            │       │              │←─── tx2Hash ───────│
            │       │              │                     │
            │       │              │ waitForBlock(tx2)   │
            │       │              │─────────────────────→│
            │       │              │←─── receipt ────────│
            │       │              │ State: TX2_MINED    │
            │       │              │ verifyEOAState()    │
            │       │              │─────────────────────→│
            │       │              │←─── isEOA: true ───│
            │       │              │ State: IDLE         │
            │       │←─── done ────│                     │
            │ Unlock chain selector│                     │
            │←── success ─────────│                     │
```

### 2.3 Key Design Decisions

**D-001: Two-Transaction Cleanup (REVISED)**

- Tx1: EIP-7702 delegation + business logic (USDT transfer, escrow call)
- Tx2: Cleanup transaction setting delegation to `address(0)`
- Both transactions are signed and submitted sequentially within a single user-facing flow
- The UI shows this as a single flow, not two separate transactions
- Cleanup tx uses minimal gas (simple code clear, ~21,000 gas)

**D-002: Paymaster as Gas Oracle**

- The paymaster provides the USDT/BNB exchange rate via on-chain oracle
- Gas estimation: `(gasLimit + cleanupGasLimit) × gasPrice × usdtPerBnb × 1.2` = usdtCost
- 20% buffer (increased from 10% per audit), dynamically scaled based on recent block gas prices (p90 percentile)
- On-chain gas cap enforced in the EIP-7702 authorization: `maxGasSpend` prevents unbounded charges
- **BSC gas is extremely cheap**: 0.1 Gwei standard (May 2026). A BEP-20 transfer costs ~$0.004. A full EIP-7702 pair (Tx1 + Tx2 = ~86,000 gas) costs ~$0.006 in raw BNB. With Candide paymaster markup, realistic user cost is ~$0.01–0.03 USDT per transaction.

**D-003: Hidden BNB Emergency Fallback**

- All gas is paid in USDT via EIP-7702 delegation. There is no user-facing gas mode choice.
- If a transaction fails due to paymaster unavailability (paused, underfunded, oracle failure), the app silently checks the user's BNB balance.
- If BNB is available: retry the transaction with BNB as gas (standard EIP-1559 transaction, no delegation needed). The user sees only a brief delay.
- If BNB is NOT available: show the existing error state explaining 'USDT gas payment is temporarily unavailable.'
- This fallback is NEVER shown in the UI as a choice or option — it is purely an emergency recovery path.

**D-004: Per-Transaction Delegation (Clarified)**

- Each user action gets Tx1 (delegate + business) + Tx2 (cleanup)
- No persistent session keys — but delegation IS persistent between Tx1 and Tx2
- The ~15-30 second window between Tx1 and Tx2 is the only delegation window
- Delegation journal provides recovery if Tx2 fails or app backgrounds

**D-005: Chain Lock During Transactions**

- Chain selector is disabled from "Confirm" click until state returns to IDLE
- If chain switch is attempted, show: "Complete or cancel your pending transaction first"
- Transaction queue prevents parallel EIP-7702 operations

**D-006: Capacitor Lifecycle Integration**

- Delegation state persisted to Capacitor Preferences at every state transition
- On app resume: check for incomplete delegations, verify on-chain, offer recovery
- Background polling paused when app backgrounds to save battery

**D-007: Restricted Signer (Security Audit Finding 6)**

- Never pass the full `ethers.Wallet` to Candide SDK
- `RestrictedSigner` implements `ethers.AbstractSigner` and only allows EIP-7702 authorization signing
- Validates nonce, chainId, and authorization structure before signing
- Rejects any other signing request
- The RestrictedSigner only accepts the exact EIP-7702 typed data structure (EIP-712 domain with specific struct types). It rejects all other signTypedData calls and validates the delegation contract address matches the registry's expected address.

**Integration with existing BSCWallet:** The `@bittasker/wallet-core` SDK's `BSCWallet.getWallet()` method returns `ethers.Wallet` (with private key). The EIP-7702 layer does NOT modify the SDK. Instead, a wrapper is added at the app layer: `src/lib/services/gas-abstraction/eip7702-provider.ts` creates a `RestrictedSigner` from the wallet's private key (accessed once during initialization), and the RestrictedSigner is passed to `abstractionkit` classes. The full `ethers.Wallet` is never passed to third-party code. The SDK's public API is unchanged; the protection is in how the app USES the key.

### 2.4 Gas Payment for Cleanup Transaction

Tx2 (cleanup) uses the paymaster for gas payment (paid in USDT). Both Tx1 and Tx2 are EIP-7702 transactions paid in USDT. If the paymaster is unavailable for Tx2, the hidden BNB fallback (D-003) is used to submit Tx2 — the user never sees this occur.

**Gas deduction model:** The paymaster deducts the total gas cost for BOTH Tx1 and Tx2 atomically at Tx1 submission time. This ensures sufficient USDT is reserved for cleanup before the business logic (which may move USDT) executes. The per-transaction edge case checklist (§10.5) enforces: `usdtBalance >= amount + estimatedMaxGasForBothTx`. If the user's USDT balance is insufficient to cover both the transfer amount AND the gas for both transactions, the transaction is rejected before Tx1 is submitted. This prevents the "Tx1 succeeded but insufficient USDT for Tx2" stranding scenario.

**maxGasSpend = min(calculatedEstimate x 1.2, userDefinedCap).** The user cap is the hard ceiling. Unused gas (difference between maxGasSpend and actual cost) is NOT refunded by the Candide paymaster v1.

**Pure function signatures for gas estimation:**

```typescript
// Pure function — no side effects, deterministic output for given inputs
function estimateGasCost(params: {
	gasLimit: bigint; // From eth_estimateGas
	cleanupGasLimit: bigint; // Fixed ~21,000 for code clear
	gasPrice: bigint; // From eth_gasPrice (p90 trailing)
	usdtPerBnb: bigint; // From paymaster oracle (18 decimals)
	bufferBps: number; // 1200 = 20% buffer
}): {
	totalGasWei: bigint; // Total gas in wei (BNB)
	totalUsdtCost: bigint; // Total cost in USDT (smallest unit)
	maxUsdtCost: bigint; // Capped at user-defined max
	confidence: number; // 0-1 based on oracle staleness
};

function validateGasCost(params: {
	usdtBalance: bigint;
	transferAmount: bigint;
	estimatedGas: bigint; // from estimateGasCost()
}): {
	sufficient: boolean;
	shortfall: bigint | null;
	requiredTotal: bigint;
};
```

**Delegation contract security properties:** The plan relies on the delegation code being inert without the user's private key. For this to hold, the delegation contract must satisfy ALL of the following, verified during Phase 2.6:

1. Enforces ECDSA signature verification (`ecrecover`) for ALL state-changing operations — no unsigned entry points
2. No `delegatecall` to arbitrary addresses — only to a fixed, verified implementation
3. No `selfdestruct` or upgrade mechanism that could change deployed bytecode retroactively
4. If the contract is a proxy, the delegation MUST target the implementation address directly (not the proxy), preventing retroactive impact from upgrades
5. Verified deployed bytecode matches audited source (bytecode hash comparison)
   If ANY of these properties is violated, the delegation contract is rejected and a replacement must be sourced before Phase 2 proceeds.

**If the paymaster is permanently unavailable:** There is no way to submit the cleanup transaction without BNB. This is acceptable only after the above security properties are verified, because: (a) the delegation code is inert (cannot execute without a transaction from the user's private key), (b) the paymaster unavailability means all USDT gas features are already disabled via kill switch. The trade-off to not implement a last-resort BNB airdrop mechanism was explicitly considered and rejected — the added complexity of a faucet contract gated by signed messages does not justify the protection against a scenario (permanent paymaster death + stuck delegation) where the inert code poses no security risk.

### 2.5 Nonce Management During Delegation Window

Tx1 uses nonce N, Tx2 uses nonce N+1. During the delegation window, ALL automatic transaction submission is frozen (not just manual chain switching). The chain lock prevents BOTH manual and automatic transactions.

### 2.6 Delegation Recovery Algorithm

Algorithm for recovery:

1. `getCode(address)` on-chain FIRST (not journal) -- verify real state
2. If code empty -- reconcile to IDLE silently, no user action needed
3. If code non-empty -- submit Tx2 with gas from paymaster
4. If Tx2 fails after 3 retries — attempt hidden BNB fallback (check BNB balance, submit cleanup tx with BNB gas). If no BNB available, surface recovery UI showing 'Cleanup pending. Your account will return to normal soon.'
5. If paymaster is paused — attempt hidden BNB fallback immediately for cleanup. If no BNB, surface recovery UI.

**Offline handling during delegation:** When the app has no network during delegation, queue recovery for reconnection, verify on-chain state before acting, show "Waiting for network" in PendingTransactionScreen.

**Recovery timeline (tiered):** Immediate retry on Tx2 failure (3 attempts with 10s backoff) → schedule retry at 1h, 6h, 24h intervals using Capacitor background task. After 24h, present Recovery UI. The 24h window is the max before user-visible intervention; the short-term retry handles transient RPC/paymaster failures invisibly.

**Hidden BNB fallback flow:** When any EIP-7702 transaction fails due to paymaster issues, the app: (1) checks on-chain BNB balance via `provider.getBalance(address)`, (2) if BNB > 0, constructs a standard (non-7702) transaction with the same calldata + BNB gas, (3) signs with the same wallet, (4) submits directly to the BSC RPC, (5) the user sees only 'Sending transaction...' — no BNB mention, no choice presented.

### 2.7 Biometric Transaction Confirmation

Before signing any USDT send, swap, or escrow funding transaction, the app requires biometric confirmation (Face ID, Touch ID, or Android biometric) via the Capacitor Biometric plugin (`@capacitor-community/biometric` or `@capacitor/biometric`).

**Flow:**

1. User taps "Confirm" on the review screen
2. OS biometric prompt appears: "Confirm sending 500.00 USDT"
3. On success: proceed to EIP-7702 delegation + sign + send
4. On failure or cancel: return to review screen, transaction not submitted

**Threshold:** Biometric required for ALL USDT sends and swaps regardless of amount. Gas-only transactions (cleanup Tx2) and Changelly swap polling do not require biometrics.

**Implementation:** The `signAuth()` step in the EIP-7702 delegation sequence (S2.2) is gated behind `BiometricAuth.verify({ reason: 'Confirm sending ${amount} ${token}' })`. This is ~50 lines of Capacitor code added to `eip7702-delegation-manager.ts`.

---

## 3. Chain & Token Extensibility

### 3.1 GasAbstractionProvider Interface (EIP Supersession Resilience)

```typescript
// src/lib/services/gas-abstraction/types.ts

interface GasAbstractionProvider {
	/** Estimate gas cost for a transaction, in the token that will be used */
	estimateGasInToken(tx: ethers.TransactionRequest): Promise<{
		gasLimit: bigint;
		gasPrice: bigint;
		totalTokenCost: bigint; // in token's smallest unit
		formattedTokenCost: string; // human readable
		fiatCost?: number; // USD equivalent
		confidence: number; // 0-1 reliability of estimate
	}>;

	/** Execute a transaction with token-based gas payment */
	executeWithTokenGas(
		tx: ethers.TransactionRequest,
		maxGasSpend: bigint // user-defined cap
	): Promise<{
		tx1Hash: string; // delegation + business tx
		tx2Hash: string; // cleanup tx
		waitForCompletion: () => Promise<TransactionReceipt>;
	}>;

	/** Check provider health and paymaster availability */
	healthCheck(): Promise<{
		providerOk: boolean;
		paymasterFunded: boolean;
		paymasterEstimatedRemainingTx: number;
		oracleStaleness: number; // seconds since last oracle update
		canExecute: boolean;
	}>;

	/** Does this provider support the given chain? */
	supportsChain(chainId: number): boolean;

	/** Per-transaction delegation — no persistent sessions */
	isSessionBased: false;
}
```

### 3.2 StablecoinRegistry Design

```typescript
// src/lib/services/stablecoin-registry.ts

interface StablecoinConfig {
	chainId: number;
	chainName: string;
	rpcUrls: string[]; // Multiple RPCs with failover
	explorerUrl: string;
	explorerApiUrl: string;
	nativeCurrency: {
		symbol: string;
		name: string;
		decimals: number;
	};
	tokens: StablecoinToken[];
	paymaster: {
		address: string;
		delegationContract: string; // EIP-7702 delegation target
		usdtPriceOracle: string; // Primary oracle
		fallbackOracle?: string; // Fallback oracle
		minDeposit: bigint;
		version: string; // e.g., "eip7702-v1"
		maxGasCapPerTx: bigint; // On-chain enforced max
	};
	confirmations: number; // Chain-specific safe confirmations
}

interface StablecoinToken {
	symbol: string; // 'USDT', 'USDC'
	name: string; // 'Tether USD', 'USD Coin'
	address: string; // Verified at startup via symbol()/decimals() call
	decimals: number;
	isGasToken: boolean;
	logoUrl: string;
	minGasReserve: string; // Minimum reserve for future gas (warn, don't block)
}

// Initial networks
const STABLECOIN_NETWORKS: Record<string, StablecoinConfig> = {
	'bsc-mainnet': {
		chainId: 56,
		chainName: 'BNB Smart Chain',
		rpcUrls: [
			'https://bsc-rpc.publicnode.com',
			'https://bsc-dataseed1.binance.org',
			'https://bsc-dataseed2.binance.org'
		],
		explorerUrl: 'https://bscscan.com',
		explorerApiUrl: 'https://api.bscscan.com/api',
		nativeCurrency: { symbol: 'BNB', name: 'BNB', decimals: 18 },
		tokens: [
			{
				symbol: 'USDT',
				name: 'Tether USD',
				address: '0x55d398326f99059fF775485246999027B3197955',
				decimals: 18,
				isGasToken: true,
				logoUrl: '/logos/usdt.svg',
				minGasReserve: '0.20' // ~10 tx at 0.02 USDT/tx; warning only, does not block
			}
		],
		paymaster: {
			address: '<CANDIDE_BSC_PAYMASTER>',
			delegationContract: '<CANDIDE_BSC_DELEGATION>',
			usdtPriceOracle: '<BSC_USDT_ORACLE>',
			fallbackOracle: '<BSC_FALLBACK_ORACLE>',
			minDeposit: 100000000000000000n,
			version: 'eip7702-v1',
			maxGasCapPerTx: 500000000000000000n // 0.50 USDT safety cap (~100× avg tx cost)
		},
		confirmations: 1 // BSC has fast blocks, low reorg risk
	},
	'bsc-testnet': {
		/* ... similar, with testnet addresses */
	}
};

// Future: 'polygon-mainnet', 'arbitrum-mainnet', 'base-mainnet'
```

The `explorerUrl` field (`https://bscscan.com`) is used to generate deep links for all USDT transaction views. Format: `{explorerUrl}/tx/{txHash}` for transaction links, `{explorerUrl}/address/{address}` for address links.

StablecoinRegistry types complement existing ERC20Token/PaymasterConfig types from @bittasker/wallet-core. The registry wraps chain-level configuration; the existing types handle individual token/paymaster interactions.

### 3.3 Adding a New Chain

1. Add `StablecoinConfig` entry to registry
2. Deploy/verify Candide paymaster + delegation contract on that chain
3. Add RPC URLs to the provider failover list
4. Add token logo to `/static/logos/`
5. Add translation keys for chain/token names
6. **No UI code changes needed** — UI auto-adapts from registry

---

## 4. RSK Derivation Path Migration

### 4.1 Migration Strategy (Two-Phase Commit)

```
+------------------------------------------------------------------+
|                   Migration State Machine                          |
|                                                                   |
|  NOT_STARTED → DETECTING → CHECK_BALANCE                        |
|       ├─ balance > 0: AWAITING_USER → MIGRATION_STARTED         |
|       │     → SWEEP_BROADCAST → SWEEP_CONFIRMING → SWEEP_COMPLETE|
|       │     → MIGRATION_COMPLETE                                 |
|       └─ balance == 0: MIGRATE_SILENTLY → MIGRATION_COMPLETE    |
|                                                                   |
|  Any state → *_FAILED (auto-revert to old path)                   |
+------------------------------------------------------------------+

Phase 1: DETECT legacy path (compare current address vs standard path)
Phase 2: CHECK_BALANCE — if rBTC balance > 0: AWAITING_USER (present list of active escrows, explain "why"). If balance == 0: MIGRATE_SILENTLY (no user prompt needed — just change derivation path and derive new address, no sweep required).
Phase 3: MIGRATION_STARTED (derive new wallet, record state)
Phase 4: SWEEP_BROADCAST (send all-old-balance - estimated-gas)
Phase 5: SWEEP_CONFIRMING (wait for 12 confirmations on RSK)
Phase 6: SWEEP_COMPLETE (verify new balance = old - gas)
Phase 7: MIGRATION_COMPLETE (record final state)
```

### 4.2 Key Safety Measures

- **Two-phase commit**: At each phase, verify on-chain state before proceeding
- **Reorg resilience**: 12 confirmations on RSK before declaring sweep complete
- **Idempotency**: If migration is interrupted, resume from last completed phase
- **Active escrow inventory**: Before migration, list ALL active escrows tied to old address; warn user
- **Indefinite old-address access**: Old derivation path preserved in wallet config; user can still sign from old address for contract interactions
- **180-day monitoring**: (extended from 30) old address monitored for incoming funds post-migration
- **Dust tolerance**: `send(max - gas)` with explicit dust threshold — residual < 0.00001 rBTC is acceptable
- **Master key interaction**: DerivationMigrator reads mnemonic via master key decryption; new path stored alongside existing mnemonic encryption

---

## 5. Comprehensive UI Integration Points

### 5.1 All Locations That Need USDT Awareness

| #   | Location                    | File                                                 | Change                                                                                                                                         |
| --- | --------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Wallet Dashboard**        | `wallet/+page.svelte`                                | Multi-chain layout, per-chain pending indicators                                                                                               |
| 2   | **Balance Card**            | `BalanceCard.svelte`                                 | USDT accordion (already partially exists, marked "Coming Soon")                                                                                |
| 3   | **Banking Menu**            | `BankingMenu.svelte` (NEW)                           | Consolidated entry point for Send, Receive, Buy, Sell                                                                                          |
| 4   | **Send Payment Form**       | `SendPaymentForm.svelte`                             | Launched from Banking menu; token selector, "pay gas with USDT", fee breakdown, chain lock                                                     |
| 5   | **Receive Payment Form**    | `ReceivePaymentForm.svelte`                          | Launched from Banking menu; chain selector, BSC USDT QR, token-specific warnings                                                               |
| 6   | **Payment Request Modal**   | `PaymentRequestModal.svelte`                         | Token-aware request, chain display                                                                                                             |
| 7   | **Transaction History**     | `TransactionHistory.svelte`                          | Multi-chain filter, USDT tx details                                                                                                            |
| 8   | **Swap Form**               | `SwapForm.svelte`                                    | rBTC↔USDT via Changelly (0.25% fee); rBTC↔BTC via Boltz                                                                                      |
| 9   | **Buy USDT Flow**           | NEW                                                  | Fiat-to-USDT via Changelly                                                                                                                     |
| 10  | **Sell USDT Flow**          | NEW                                                  | USDT-to-fiat via Changelly                                                                                                                     |
| 11  | **Amount Input**            | `AmountInputSection.svelte`                          | Extended with `mode` prop for send (calculator), buy (fiat currency buttons), and sell (max button). Single component handles all three flows. |
| 12  | **Amount Display**          | `AmountDisplay.svelte`                               | Multi-token (already generic)                                                                                                                  |
| 14  | **Transaction Success**     | `TransactionSuccessScreen.svelte`                    | Token-aware success, "Gas paid with USDT"                                                                                                      |
| 15  | **Pending Transaction**     | `PendingTransactionScreen.svelte`                    | Shows "Authorizing payment..." not EIP-7702 steps                                                                                              |
| 16  | **Task Escrow Creation**    | `v2/creation.ts`, escrow UI                          | Token selector in escrow, chain-aware pricing                                                                                                  |
| 17  | **Task Escrow Acceptance**  | Bid acceptance flow                                  | USDT escrow acceptance                                                                                                                         |
| 18  | **Task Payment Release**    | Task completion flow                                 | USDT release                                                                                                                                   |
| 19  | **Dispute Resolution**      | Dispute flow                                         | USDT dispute                                                                                                                                   |
| 20  | **Service Creation**        | Service listing flow                                 | USDT pricing option                                                                                                                            |
| 21  | **Bid Placement**           | Bid flow                                             | USDT bid amounts                                                                                                                               |
| 22  | **Balance History**         | `BalanceHistory.svelte`                              | Multi-token chart                                                                                                                              |
| 22  | **Wallet Setup/Onboarding** | Auth flow                                            | Chain selection, migration prompt (only shown if balance > 0)                                                                                  |
| 23  | **Secure Payments Page**    | `secure-payments/+page.ts`                           | Add USDT coverage                                                                                                                              |
| 24  | **Escrow Success Screen**   | `EscrowSuccessScreen.svelte`                         | Token-aware amounts                                                                                                                            |
| 25  | **Contract Card/Drawer**    | `ContractCardNDK.svelte`, `ContractDrawerNDK.svelte` | USDT amounts                                                                                                                                   |
| 26  | **Counter Offer Form**      | `CounterOfferForm.svelte`                            | USDT pricing                                                                                                                                   |
| 27  | **Service Quotes Inbox**    | `ServiceQuotesInbox.svelte`                          | USDT amounts                                                                                                                                   |
| 28  | **Dashboard Bids Panel**    | `DashboardBidsPanel.svelte`                          | USDT bid display                                                                                                                               |
| 29  | **Nostr Escrow Events**     | `nostr/events/contract.ts`                           | Chain/token context on events                                                                                                                  |

### 5.2 Escrow Pipeline Refactoring (Critical Scope)

The escrow contract pipeline in `src/lib/utils/contract/v2/` is hardcoded for rBTC. The following files need major refactoring for USDT:

| File                                | Current State                                | Required Change                                                               |
| ----------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| `v2/creation.ts`                    | Divides USD by BTC price, uses `parseEther`  | Token-aware: for USDT, skip BTC conversion; use token decimals                |
| `v2/blockchainWrites.ts`            | Defaults to `chain: 'rsk'`, RSK contract ABI | Chain-aware contract address selection; BSC contract ABI                      |
| `v2/service-creation.ts`            | rBTC-only pricing                            | Support USDT denomination                                                     |
| `v2/types.ts`                       | Has `chain: 'rsk' \| 'bsc'` already          | Minor extensions for token metadata                                           |
| `v2/createPaymentContractParams.ts` | rBTC validation                              | Token-aware validation                                                        |
| `contractRegistry.ts`               | Only has `bsc.mainnet` (no testnet)          | Add `bsc.testnet` entries; path: `src/lib/utils/wallet/contractRegistry.ts`   |
| `index.ts` (`initContract()`)       | RSK provider/contract setup                  | Add BSC contract address configuration to existing chain-aware initContract() |

---

## 6. UI Integration Points

USDT features are accessible via the consolidated Banking menu and Swap button on the wallet dashboard. Send, Receive, Buy, and Sell flows are launched from the Banking modal. Swaps are handled separately via Changelly integration.

**Component reuse policy**: Existing wallet screens are preserved and adapted, not replaced. `SendPaymentForm.svelte` and `ReceivePaymentForm.svelte` gain USDT awareness via token selection and chain switching — their core layout, validation, and transaction construction remain unchanged. All numeric amount input uses the existing `AmountInputSection.svelte` component with its `mode` prop (extended to support `send`, `buy`, `sell`, and `load` modes). ASCII mockups below show adapted states, not new components.

### 6.1 Wallet Dashboard — Consolidated Actions

The dashboard shows two asset accordions (BTC and USD) without inline action buttons. Primary actions are "Banking" and "Swap":

```
+-- Total Portfolio ───────────────────────────────────────────+
|  123,456 sats                                    [👁] [🔄]   |
|  ≈ $1,234.56                                                  |
+---------------------------------------------------------------+

[──────── Banking ────────]  [──────── Swap ──────────]
[  Send  ]  [ Receive ]     (quick shortcuts)

Your Assets

▸ BTC
  ┌──────────────────────────────────────────────────────────┐
  │  rBTC (Bitcoin on Rootstock)                             │
  │  0.0523 rBTC  ≈ $1,023.45                                │
  └──────────────────────────────────────────────────────────┘

▸ USD
  ┌──────────────────────────────────────────────────────────┐
  │  USDT on BNB Smart Chain                                 │
  │  500.00 USDT  ≈ $500.00                                  │
  └──────────────────────────────────────────────────────────┘
```

The accordions only show balances and network info. All financial operations (Send, Receive, Buy, Sell) are launched from the Banking modal.

### 6.2 Banking Menu

"Banking" opens a modal with options for all financial operations:

```
+-- Banking ──────────────────────────────────────────────────+
|                                                              |
|  Send USDT                           fee ~$0.02             |
|  Send rBTC on Rootstock              fee ~$0.00003          |
|  ─────────────────────────────────────────────────────────  |
|  Receive USDT on BNB Smart Chain                              |
|  Receive rBTC on Rootstock                                    |
|  ─────────────────────────────────────────────────────────  |
|  Buy USDT with card / bank transfer   fee ~1.5–3.5%         |
|  Sell USDT to bank account            fee ~1%                |
|                                                              |
+--------------------------------------------------------------+
```

When the Banking menu is first shown after the USDT update, a one-time tooltip highlights the new button: "Send, Receive, Buy, and Sell are now here." After the user taps Banking once, the tooltip is dismissed permanently.

### 6.3 Send USDT

When user taps "Send USDT on BNB Smart Chain" from Banking:

```
+-- Send USDT ────────────────────────────────────────────────+
|                                                              |
|        500.00                                                |
|        USDT                                                  |
|                                                              |
|  ┌───────┬───────┬───────┬───────┐                          |
|  │   1   │   2   │   3   │   ⌫   │                          |
|  ├───────┼───────┼───────┼───────┤                          |
|  │   4   │   5   │   6   │       │                          |
|  ├───────┼───────┼───────┤  MAX  │                          |
|  │   7   │   8   │   9   │       │                          |
|  ├───────┼───────┼───────┼───────┤                          |
|  │   .   │   0   │   ⌫   │  MAX  │                          |
|  └───────┴───────┴───────┴───────┘                          |
|                                                              |
|  To: [ 0x742d35Cc6634C0532925a3b844Bc9e7595f0bDc3 ]        |
|                                                              |
+--------------------------------------------------------------+
|  [Back]                              [Review]               |
+--------------------------------------------------------------+
```

Note: Uses existing `AmountInputSection.svelte` with `mode='send'`. `inputmode='decimal'` for mobile keyboards.

### 6.4 Send — Review & Confirm

```
+-- Confirm ──────────────────────────────────────────────────+
|                                                              |
|  Send USDT on BNB Smart Chain                                |
|                                                              |
|  Amount:         500.00 USDT                                 |
|  To:             0x742d...bDc3                               |
|  Network fee:    0.02 USDT                                   |
|  Total:          500.02 USDT                                 |
|                                                              |
|  Arrives in ~5 seconds                                       |
|                                                              |
+--------------------------------------------------------------+
|  [Back]                           [Send 500.02 USDT]        |
+--------------------------------------------------------------+
```

### 6.5 Receive USDT

```
+-- Receive ──────────────────────────────────────────────────+
|                                                              |
|  Select network: [🔶 BNB Smart Chain ▾]                      |
|                                                              |
|  ┌──────────────────────────────────────────────────────────┐|
|  │              ████████████████████████                    │|
|  │              ██                   ██                    │|
|  │              ██    [QR Code]      ██                    │|
|  │              ██                   ██                    │|
|  │              ████████████████████████                    │|
|  └──────────────────────────────────────────────────────────┘|
|                                                              |
|  Your USDT address:                                          |
|  ┌──────────────────────────────────────────────────────────┐|
|  │ 0x742d35Cc6634C0532925a3b844Bc9e7595f0bDc3    [Copy]   │|
|  └──────────────────────────────────────────────────────────┘|
|                                                              |
|  Only send USDT on BNB Smart Chain to this address.          |
|                                                              |
+--------------------------------------------------------------+
|  [Close]                         [Create Payment Request]    |
+--------------------------------------------------------------+
```

### 6.6 Buy USDT Amount

```
+-- Buy USDT ────────────────────────────────────────────────+
|                                                              |
|        100.00                                                |
|        USD                                                  |
|                                                              |
|  ┌───────┬───────┬───────┬───────┐                          |
|  │   1   │   2   │   3   │   C   │                          |
|  ├───────┼───────┼───────┼───────┤                          |
|  │   4   │   5   │   6   │   ⌫   │                          |
|  ├───────┼───────┼───────┼───────┤                          |
|  │   7   │   8   │   9   │   .   │                          |
|  ├───────┼───────┼───────┼───────┤                          |
|  │  USD  │   0   │  EUR  │       │                          |
|  └───────┴───────┴───────┴───────┘                          |
|                                                              |
|  You get: ~96.50 USDT on BNB Smart Chain                     |
|                                                              |
+--------------------------------------------------------------+
|  [Cancel]                         [Choose Payment Method]    |
+--------------------------------------------------------------+
```

### 6.7 Payment Method Selection

```
+-- Payment Method ───────────────────────────────────────────+
|                                                              |
|  Buy $100 of USDT                                            |
|                                                              |
|  ┌─ Debit / Credit Card ───────────────────────────────────┐|
|  │  Visa, Mastercard              fee: ~3.5%                │|
|  │  Min: $20, Max: $5,000                                  │|
|  │  Arrives in ~2 minutes                                   │|
|  └──────────────────────────────────────────────────────────┘|
|  ┌─ Apple Pay ─────────────────────────────────────────────┐|
|  │                                fee: ~3.5%                │|
|  │  Min: $10, Max: $1,000 (where available)                │|
|  │  Arrives in ~2 minutes                                   │|
|  └──────────────────────────────────────────────────────────┘|
|  ┌─ Bank Transfer (SEPA) ──────────────────────────────────┐|
|  │  European banks                 fee: ~1.5%                │|
|  │  Min: $50, Max: $25,000                                 │|
|  │  Arrives in 1-2 days                                     │|
|  └──────────────────────────────────────────────────────────┘|
|                                                              |
+--------------------------------------------------------------+
|  [Back]                                                      |
+--------------------------------------------------------------+
```

### 6.8 Buy Review & Confirm

```
+-- Confirm Purchase ─────────────────────────────────────────+
|                                                              |
|  Buy USDT with Visa ••••4242                                 |
|                                                              |
|  You pay:         100.00 USD                                 |
|  Provider fee:      3.50 USD    (3.5%)                       |
|  Network fee:       0.02 USDT   (BSC gas)                    |
|  You receive:     ~96.48 USDT                                |
|                                                              |
|  Arrives in ~2 minutes                                       |
|                                                              |
+--------------------------------------------------------------+
|  [Back]                         [Buy 96.48 USDT]            |
+--------------------------------------------------------------+
```

### 6.9 Sell USDT Amount

```
+-- Sell USDT ────────────────────────────────────────────────+
|                                                              |
|        500.00                                                |
|        USDT                                                  |
|                                                              |
|  ┌───────┬───────┬───────┬───────┐                          |
|  │   1   │   2   │   3   │   C   │                          |
|  ├───────┼───────┼───────┼───────┤                          |
|  │   4   │   5   │   6   │   ⌫   │                          |
|  ├───────┼───────┼───────┼───────┤                          |
|  │   7   │   8   │   9   │   .   │                          |
|  ├───────┼───────┼───────┼───────┤                          |
|  │  Max  │   0   │       │       │                          |
|  └───────┴───────┴───────┴───────┘                          |
|                                                              |
|  You receive: ~494.50 USD to bank                            |
|                                                              |
+--------------------------------------------------------------+
|  [Cancel]                           [Review]                |
+--------------------------------------------------------------+
```

### 6.10 Sell Review

```
+-- Confirm Sale ─────────────────────────────────────────────+
|                                                              |
|  Sell USDT to bank account ••6789                            |
|                                                              |
|  You send:         500.00 USDT                               |
|  Network fee:        0.02 USDT   (BSC gas)                   |
|  Provider fee:       5.00 USD    (1%)                        |
|  You receive:     ~494.50 USD                                |
|                                                              |
|  Arrives in 1-2 days (SEPA)                                  |
|                                                              |
+--------------------------------------------------------------+
|  [Back]                       [Sell 500.00 USDT]            |
+--------------------------------------------------------------+
```

### 6.11 Swap Form — Changelly

```
+-- Swap ─────────────────────────────────────────────────────+
|                                                              |
|  Swap any crypto to USDT or rBTC                             |
|                                                              |
|  ┌──────────────────┐       ┌──────────────────┐            |
|  │ From:            │       │ To:              │            |
|  │ [ETH on Ethereum ▾]│  ⇄   │ [USDT on BNB Smart Chain ▾] │|
|  │                  │       │                  │            |
|  │ [    1.50    ]   │       │ [   500.00   ]   │            |
|  └──────────────────┘       └──────────────────┘            |
|                                                              |
|  Rate: 1 ETH = 3,350 USDT                                    |
|  Fee: 0.25% via Changelly (swap partner)                     |
|  Estimated time: 5–30 minutes                                |
|                                                              |
|  You send:         1.50 ETH                                  |
|  Changelly fee:    0.00375 ETH  (0.25%)                      |
|  Network fee:      0.02 USDT     (BSC gas)                   |
|  You receive:   ~5,020 USDT                                   |
|                                                              |
|  Minimum received: ~4,970 USDT (1% slippage)                 |
|                                                              |
+--------------------------------------------------------------+
|  [Back]                            [Swap 1.50 ETH]          |
+--------------------------------------------------------------+
```

The "From" dropdown lists all tokens supported by Changelly that have a swap pair to USDT on BSC or rBTC on RSK. The "To" dropdown is always USDT on BSC or rBTC on RSK — the wallet never holds other tokens. If Changelly doesn't support a pair, that token is hidden.

### 6.12 Escrow Creation — With USDT Option

The existing escrow flow adds a token picker for the escrow payment:

```
+-- Fund Escrow ──────────────────────────────────────────────+
|                                                              |
|  Task: "Build dashboard component"                           |
|  For: @satoshidev                                            |
|                                                              |
|  Payment:                                                    |
|  ┌──────────────────────────────────────────────────────────┐|
|  │  (•)  rBTC on Rootstock                                 │|
|  │  ( )  USDT on BNB Smart Chain                            │|
|  └──────────────────────────────────────────────────────────┘|
|                                                              |
|  Amount: [  500.00  ] USDT                                   |
|                                                              |
|  Task amount:        500.00 USDT                             |
|  Platform fee (5%):   25.00 USDT                             |
|  Network fee:          0.04 USDT                             |
|  Total:              525.04 USDT                             |
|                                                              |
+--------------------------------------------------------------+
|  [Back]                      [Fund Escrow — 525.04 USDT]    |
+--------------------------------------------------------------+

### 6.13 Derivation Migration Prompt

Shown during wallet setup ONLY if a legacy derivation path is detected AND the user has an rBTC balance. If the balance is zero, migration happens silently — the derivation path switches and the new address is derived without any user prompt.

```

+-- Wallet Update ────────────────────────────────────────────+
| |
| Your wallet uses an older address format. |
| Updating gives you the same address on all EVM chains. |
| |
| Old: 0x1234...5678 |
| New: 0xabcd...ef01 (same address everywhere) |
| |
| Balance to move: 0.0523 rBTC |
| |
+--------------------------------------------------------------+
| [Remind Me Later] [Update] |
+--------------------------------------------------------------+

```

### 6.14 USDT Service Paused (Kill Switch Active)

Overlay on the wallet dashboard when USDT is globally disabled:

```

+-- USDT Temporarily Unavailable ─────────────────────────────+
| USDT features are paused for maintenance. |
| Your rBTC works as normal. |
+--------------------------------------------------------------+

```

### 6.15 Send — Insufficient Balance

```

+-- Insufficient Balance ─────────────────────────────────────+
| |
| You don't have enough USDT. |
| |
| Balance: 95.00 USDT |
| Needed: 100.02 USDT |
| Short: 5.02 USDT |
| |
+--------------------------------------------------------------+
| [Cancel] [Reduce Amount] |
+--------------------------------------------------------------+

```

### 6.16 Send — Network Unavailable

Shown when BSC RPC is unreachable or the gas sponsor is temporarily down:

```

+-- Network Unavailable ──────────────────────────────────────+
| |
| Can't reach BNB Smart Chain right now. |
| Your USDT is safe. Try again in a moment. |
| |
| Balances shown may be from a few minutes ago. |
| |
+--------------------------------------------------------------+
| [Cancel] [Retry] |
+--------------------------------------------------------------+

```

### 6.17 Transaction Failed

```

+-- Failed ───────────────────────────────────────────────────+
| |
| ✕ |
| |
| The transaction didn't go through. |
| Your USDT hasn't moved. |
| |
| [Try Again] [Close] |
| |
+--------------------------------------------------------------+

```

### 6.18 Transaction Success

Matches the existing `TransactionSuccessScreen`:

```

+-- Sent ─────────────────────────────────────────────────────+
| |
| ✓ |
| |
| 500.00 USDT |
| |
| to 0x742d...bDc3 on BNB Smart Chain |
| |
| [View in Block Explorer] |
| |
+--------------------------------------------------------------+
| [Done] |
+--------------------------------------------------------------+

```

### 6.19 Pending Transaction

Matches the existing `PendingTransactionScreen` pattern:

```

+-- Sending... ───────────────────────────────────────────────+
| |
| ⟳ |
| |
| 500.00 USDT to 0x742d...bDc3 |
| |
| This usually takes a few seconds. |
| You can close the app — we'll finish on our own. |
| |
| Transaction: 0x1234...5678 |
| [View in Block Explorer] |
| |
+--------------------------------------------------------------+

```

### 6.20 Transaction History — Multi-Chain

Existing history pattern, now showing BSC transactions:

```

+-- History ──────────────────────────────────────────────────+
| |
| [All ▾] [All chains ▾] |
| |
| ┌─ Sent ──────────────────────────────────────────────────┐|
| │ -500.00 USDT May 14, 3:45 PM │|
| │ to 0x742d...bDc3 on BNB Smart Chain │|
| │ fee: 0.02 USDT ✓ confirmed │|
| └──────────────────────────────────────────────────────────┘|
| ┌─ Received ──────────────────────────────────────────────┐|
| │ +0.01 rBTC May 14, 10:15 AM │|
| │ from 0xabcd...ef01 on Rootstock │|
| │ fee: 0.00003 rBTC ✓ confirmed │|
| └──────────────────────────────────────────────────────────┘|
| ┌─ Swapped ──────────────────────────────────────────────┐|
| │ 0.005 rBTC → 100 USDT May 13, 2:30 PM │|
| │ via Changelly swap ✓ completed │|
| └──────────────────────────────────────────────────────────┘|
| |
+--------------------------------------------------------------+

```

### 6.21 Rate Limit Reached

```

+-- Limit Reached ────────────────────────────────────────────+
| |
| You've reached the transaction limit. |
| Please wait a moment before trying again. |
| |
+--------------------------------------------------------------+
| [OK] |
+--------------------------------------------------------------+

```

### 6.22 Depeg Warning (Escrow Blocked)

```

+-- USDT Unavailable for Escrow ──────────────────────────────+
| |
| USDT is currently trading below its usual value. |
| Escrow and swap operations are paused for your safety. |
| |
| You can still send and receive USDT. |
| |
+--------------------------------------------------------------+
| [OK] |
+--------------------------------------------------------------+

````

### Skeleton / Loading States

Existing loading states are reused:

- Portfolio card: shimmer placeholder while balances load
- Send screen fee area: skeleton rect while fee is estimated
- QR code: skeleton rectangle with pulse animation
- Transaction list: shimmer rows while history loads

---

## 7. Implementation Phases

**Prerequisite:** Phase 2.6 (BSC EIP-7702 verification) MUST complete before any Phase 2 implementation work begins.

### Phase 1: Foundation + Safety Infrastructure (Week 1-2)

| Task | File(s)                    | Description                                                                                                       |
| ---- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1.1  | `kill-switch.ts`           | VITE_ feature flag gating                                                                                           |
| 1.2  | `gas-abstraction/types.ts` | `GasAbstractionProvider` interface (EIP-agnostic)                                                                 |
| 1.3  | `stablecoin-registry.ts`   | Chain/token registry with BSC mainnet + testnet configs, RPC failover, token address validation                   |
| 1.4  | `restricted-signer.ts`     | Scoped signer that never exposes raw private key to third-party SDKs                                              |
| 1.5  | `delegation-journal.ts`    | Persistent record of every delegation + outcome (to Capacitor Preferences)                                        |
| 1.6  | `wallet.d.ts`              | Add `DelegationState`, `GasMode`, `ChainEnvironment`, `TokenAmount`, `DelegationJournalEntry` types               |
| 1.7  | `wallet.store.ts`          | Extend with `activeChain`, `gasMode`, `delegationState`, `pendingTransactions` map (per chainId), chain lock flag |
| 1.8  | `gas-mode.store.ts`        | User preference store, paymaster health cache, depeg detection                                                    |

### Phase 2: EIP-7702 Delegation (Week 3-4)

| Task | File(s)                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | `eip7702-delegation-manager.ts` | Full lifecycle: sign auth → Tx1 (delegate+business) → wait mine → Tx2 (cleanup) → verify EOA                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2.2  | `eip7702-provider.ts`           | Create `src/lib/services/gas-abstraction/eip7702-provider.ts` implementing GasAbstractionProvider. Wire into wallet store's send flow. Do NOT modify @bittasker/wallet-core. Acceptance: (a) provider passes healthCheck() returning correct paymaster status, (b) estimateGasInToken() returns values within 5% of manual calculation, (c) executeWithTokenGas() completes full Tx1+Tx2 lifecycle with getCode verification, (d) RestrictedSigner rejects non-EIP-7702 signing, (e) all Sentry breadcrumbs logged at each state transition. |
| 2.3  | Capacitor lifecycle handlers    | Persist delegation state on pause, resume check on appStateChange                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2.4  | Chain lock                      | Disable chain switcher during active transactions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2.5  | Sentry breadcrumbs              | `addBreadcrumb()` at each delegation state transition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2.6  | **BSC EIP-7702 verification**   | Deploy test EIP-7702 tx on BSC testnet; verify chain supports the tx type; verify delegation contract satisfies the 5 security properties from §2.4 (ECDSA enforcement, no arbitrary delegatecall, no selfdestruct/upgrade, direct implementation if proxy, bytecode matches audited source); verify paymaster deducts total gas for BOTH Tx1+Tx2 atomically at Tx1 submission time                                                                                                                                                          |
| 2.7  | Tests                           | Unit + integration for full delegation lifecycle, restricted signer, kill switch                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Phase 2.5: Changelly Integration (Week 3)

| Task  | File(s)                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.5.1 | `changelly.service.ts`                         | Swap API wrapper (estimate, createTransaction, getStatus)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2.5.2 | CF Worker proxy                                | Swap API endpoint (HMAC-SHA256 signing). HMAC-SHA256 signing: Follow the pattern from `workers-site/handlers/stream.js` lines 57-92. Signature = crypto.createHmac('sha256', secret).update(nonce + JSON.stringify(body)).digest('hex'). If Changelly sends webhook callbacks for swap status updates, verify HMAC signature using the pattern from `verifyWebhookSignature` in `workers-site/handlers/stream.js`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2.5.3 | `@changelly/fiat-api-sdk-node`                 | Fiat on/off-ramp integration via CF Worker (NOT client-side). Create `workers-site/handlers/changelly-fiat.js` handling `/api/changelly/fiat/*`. Init `ChangellyFiatClient` with secrets from env. Client calls Worker endpoint, Worker calls SDK. Run `npm audit` on `@changelly/fiat-api-sdk-node` before deployment. Pin to exact version. Monitor for security advisories.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2.5.4 | `BankingMenu.svelte`                           | Consolidated banking modal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2.5.5 | `BuyUSDTForm.svelte` and `SellUSDTForm.svelte` | Buy/sell USDT flows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2.5.7 | Push notification service                      | Extend Firebase Cloud Messaging for USDT wallet events: incoming USDT deposit detected (BSC block listener on user's address), swap completed via Changelly, escrow funded/released in USDT, low gas reserve warning (< 0.20 USDT remaining). Use existing FCM infrastructure — add USDT-specific notification payloads with chainId, tokenSymbol, amount, txHash.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Proxy implementation requirements:**

- Route: `POST /api/v1/changelly/swap/*` handled by NestJS backend (`bittasker-nestjs/src/changelly-swap/`)
- Environment: `CHANGELLY_API_KEY` and `CHANGELLY_API_SECRET` stored via `wrangler secret put`
- Origin validation: check `Origin` header against allowlist (app domain)
- Rate limiting: max 30 requests per minute per wallet address
- Input sanitization: validate amounts, addresses, currencies before forwarding
- Error filtering: strip Changelly internal details from error responses before returning to client
- Auth: verify caller has valid app session before forwarding swap requests
- Follow existing pattern from `workers-site/handlers/stream.js` for HMAC-SHA256 header construction

### Phase 3: Derivation Path Migration (Week 3)

| Task | File(s)                            | Description                                                                                                                  |
| ---- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | `derivation-migrator.ts`           | Two-phase commit sweep, reorg resilience, escrow inventory check, idempotency                                                |
| 3.2  | `@bittasker/wallet-core` RSKWallet | Configurable derivation path                                                                                                 |
| 3.3  | Migration UI                       | Separate screen showing: active escrows list, progress with confirmations. Only shown if rBTC balance > 0; silent otherwise. |
| 3.4  | Tests                              | Migration unit tests, sweep tests, reorg simulation, escrow detection tests                                                  |

### Phase 4: Wallet UI — Send/Receive (Week 4-5)

| Task | File(s)                           | Description                                                                             |
| ---- | --------------------------------- | --------------------------------------------------------------------------------------- |
| 4.1  | `BalanceCard.svelte`              | Activate USDT accordion (already partially built), add per-chain pending indicators     |
| 4.2  | `SendPaymentForm.svelte`          | Token selector, "pay gas with" section, fee breakdown with confidence %, chain lock     |
| 4.3  | `ReceivePaymentForm.svelte`       | Chain selector, BSC USDT QR, "I understand" acknowledgment checkbox                     |
| 4.4  | `ChainSelector.svelte` (NEW)      | Reusable token+chain picker                                                             |
| 4.5  | `GasFeeDisplay.svelte` (NEW)      | Shows cost in selected gas token + fiat, confidence %, paymaster status dot             |
| 4.6  | `TransactionSuccessScreen.svelte` | Token-aware success, "Gas paid with USDT" label                                         |
| 4.7  | `PendingTransactionScreen.svelte` | 3-state cycle (like existing), clean language (no "EIP-7702"), estimated time remaining |

### Phase 5: Escrow & Task Payments (Week 5-6)

| Task | File(s)                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | `v2/creation.ts`              | In `v2/creation.ts`, add `deriveUSDTEscrowParams()`: for USDT, use `amount * 10**18` (no BTC price division). Keep `deriveContractCreationParams()` for rBTC. Export a unified `deriveEscrowParams(token, amount, price)` that dispatches based on token type.                                                                                                                                                                                                                                           |
| 5.2  | `v2/blockchainWrites.ts`      | Chain-aware contract address selection                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5.3  | `v2/service-creation.ts`      | USDT pricing options                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 5.4  | `contractRegistry.ts`         | Add `bsc.testnet` entries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 5.5  | `index.ts` (`initContract()`) | Chain-aware provider/contract initialization                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5.6  | Escrow creation UI            | Add token selector for escrow funding. When USDT selected, gas display switches to USDT estimate. Platform fee is 5% for USDT (each side: tasker and taskee); rBTC fee tiers are separate (1.5%–2.5% per existing fee tier system). ContractAddress resolved via contractRegistry. |
| 5.7  | Bid acceptance flow           | Bid acceptance: if escrow was created in USDT, acceptance tx uses USDT gas via EIP-7702. Same contract function, different chain.                                                                                                                                                                                                                                                                                                                                                                        |
| 5.8  | Task completion/release       | USDT release transactions with token-aware notifications                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5.9  | Dispute resolution            | USDT dispute handling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5.10 | Nostr escrow events           | In `src/lib/nostr/events/contract.ts`, extend event publishing to include `{ chainId, tokenSymbol, tokenAddress }` in escrow event tags.                                                                                                                                                                                                                                                                                                                                                                 |

### Phase 6: Swaps & Cross-Chain (Week 6-7)

| Task | File(s)             | Description                                                             |
| ---- | ------------------- | ----------------------------------------------------------------------- |
| 6.1  | `SwapForm.svelte`   | rBTC↔USDT via Changelly (0.25% fee); rBTC↔BTC via Boltz               |
| 6.2  | Swap refund monitor | Background monitoring of pending swaps; notify user on refundable state |
| 6.3  | Cross-chain receive | Generate cross-chain swap invoices (rBTC/BTC/Lightning only)            |
| 6.4  | Invoice detector    | Classify scanned addresses/invoices by chain and token                  |

### Phase 7: Polishing, Accessibility & Confidence Verification (Week 7-8)

| Task | Description                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1  | WCAG AA audit — all new components: minimum color contrast 4.5:1, aria-live="polite" on pending screen status, focus trap with auto-focus on primary action for modals, prefers-reduced-motion for spinners, 44x44px minimum touch targets, role="alert" on error messages, screen reader announcements for copy button, semantic HTML, keyboard nav (Tab/Enter/Escape) on all modals and forms |
| 7.2  | i18n — all new strings in en/es; verify with `find-missing-translations.py`                                                                                                                                                                                                                                                                                                                     |
| 7.3  | Offline UX — offline banner on wallet dashboard, disabled send when offline, cached balance display with "last updated" timestamp                                                                                                                                                                                                                                                               |
| 7.4  | Performance profiling — mobile focus: gas estimation latency, RPC failover speed                                                                                                                                                                                                                                                                                                                |
| 7.5  | Security audit — delegation cleanup finality, restricted signer, kill switch                                                                                                                                                                                                                                                                                                                    |
| 7.6  | Rollback drill — simulate critical bug, rebuild with flag disabled, redeploy, verify feature hidden                                                                                                                                                                                                                                                                                                                        |
| 7.7  | Mobile-native UX — env(safe-area-inset-\*) for iPhone notch, keyboard avoidance for send screen, pull-to-refresh on wallet dashboard, haptic feedback on tx completion                                                                                                                                                                                                                          |
| 7.8  | E2E tests — all critical paths (see §8)                                                                                                                                                                                                                                                                                                                                                         |
| 7.9  | Re-audit via swarm — all 4 dimensions must score ≥95%                                                                                                                                                                                                                                                                                                                                           |

## 8. Testing Strategy

### 8.1 Unit Tests (Vitest)

| Area                       | Tests                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `StablecoinRegistry`       | Token lookup, chain config validation, token address verification, RPC failover ordering        |
| `RestrictedSigner`         | Only allows EIP-7702 auth signing, rejects arbitrary message signing, validates chainId + nonce |
| `GasAbstractionProvider`   | Interface compliance for EIP7702 implementation                                                 |
| `EIP7702DelegationManager` | Each state transition, timeout handling, recovery from each state                               |
| `DerivationMigrator`       | Path detection, sweep calculation, two-phase commit, idempotency, escrow inventory              |
| `KillSwitch`               | Feature gating via VITE_ flags                                    |
| `DelegationJournal`        | Persist/restore, prune old entries, recovery from corrupted state                               |
| `GasModeStore`             | Preference persistence, paymaster health, depeg detection                                       |
| `ChainLock`                | Lock acquisition, timeout, forced release                                                       |

### 8.2 Integration Tests (Vitest)

| Flow           | Tests                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Send USDT      | Full two-tx flow with mocked chain, insufficient USDT, paymaster unavailable                             |
| Receive USDT   | Address generation, QR rendering, "I understand" acknowledgment                                          |
| Escrow USDT    | Contract interaction with token-aware pricing, both tokens on BSC                                        |
| Migration      | Sweep full cycle, reorg resilience (mock 12th confirmation drop), escrow detection                       |
| Swap rBTC↔BTC | Cross-chain swap with mock Boltz API, refund monitoring (USDT not included — Boltz does not support BSC) |
| Kill Switch    | Trigger conditions, feature gates, banner display                                                        |

### 8.3 E2E Tests (Playwright)

| Flow                       | Tests                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Wallet dashboard           | USDT accordion expanded, balance display, pending indicator                                 |
| Send USDT (happy)          | Amount entry → confirm → pending → success                                                  |
| Send USDT (insufficient)   | Enter amount > balance → error state → reduce amount                                        |
| Send USDT (paymaster down) | Mock paymaster unavailable → error state showing USDT service unavailable                   |
| Receive USDT               | Select BSC → acknowledge warning → QR visible → copy address                                |
| Escrow creation            | Token selector → amount → confirm → pending → success                                       |
| Transaction history        | Multi-chain filter, USDT tx details, gas display                                            |
| Gas settings               | Verify gas payment uses USDT by default                                                     |
| Migration                  | Detect legacy → view active escrows (only if balance exists) → migrate → verify new address |
| Chain lock                 | Start send → try switch chain → blocked modal                                               |
| VITE_ flags                | Feature flag disabled → USDT features hidden → banner shown                        |
| Depeg warning              | Mock price deviation → warning banner shown; sends and receives remain fully functional     |
| Push notifications         | USDT deposit triggers push, swap complete triggers push, low gas reserve warning appears    |

### 8.4 EIP-7702 Specific Tests

| Test                                              | Assertion                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Delegation created                                | `authorization_list` present in Tx1, nonce consumed                                                                                                    |
| Business logic executed                           | USDT transfer or escrow call successful                                                                                                                |
| Cleanup executed                                  | Tx2 clears code, `getCode(address)` returns `0x`                                                                                                       |
| Cleanup NOT executed (failure)                    | Recovery path triggers, delegation journal shows incomplete                                                                                            |
| Paymaster charged correctly                       | USDT deducted ≤ estimate + 20% buffer                                                                                                                  |
| On-chain gas cap enforced                         | `maxGasSpend` in auth honored, tx reverts if exceeded                                                                                                  |
| Restricted signer safety                          | raw `privateKey` never accessible by third-party code                                                                                                  |
| Cross-chain replay blocked                        | Auth signed for chain 56 rejected on chain 30                                                                                                          |
| App background + resume                           | Delegation state recovered from Capacitor Preferences                                                                                                  |
| App kill + restart                                | Delegation journal shows incomplete tx; recovery initiated                                                                                             |
| Two simultaneous sends                            | Second send blocked by chain lock                                                                                                                      |
| Emergency cleanup                                 | Paymaster is paused, delegation code stuck on account. Cleanup queued until paymaster availability resumes.                                            |
| State reconciliation                              | Tx1 and Tx2 both mined but app crashed before writing journal. On restart, on-chain verification (getCode) confirms clean state. No recovery UI shown. |
| Contract ABI compatibility                        | All contract ABIs return expected function signatures and event definitions                                                                            |
| Property-based fee calculation                    | Gas estimation formula verified across random input ranges: fuzz-test gasLimit, gasPrice, usdtPerBnb, buffer values                                    |
| Network disruption/reconnection during delegation | Connection drops mid-delegation, app queues recovery, reconnects, verifies on-chain state                                                              |
| State machine fuzz tests                          | Random state transitions from each delegation state; invalid transitions rejected, valid transitions produce expected outcomes                         |

---

## 9. Risk Analysis & Mitigations

| #   | Risk                                                                                       | Severity | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **EIP-7702 cleanup tx fails** — account stays delegated                                    | CRITICAL | Delegation journal monitors both txs; if Tx2 not mined within N blocks, retry with higher gas; if retries exhausted, surface recovery UI. If paymaster is unavailable, hidden BNB fallback is attempted for both Tx1 and Tx2.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2   | **Derivation migration loses funds**                                                       | CRITICAL | Two-phase commit; 12-confirmation wait on RSK; idempotent; escrow inventory check before allowing migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | **Race condition during chain switch**                                                     | CRITICAL | Chain lock: switcher disabled from Confirm click until IDLE; transaction queue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4   | **BSC does not support EIP-7702**                                                          | CRITICAL | Verify on BSC testnet BEFORE any implementation (Phase 2.6); if unsupported, fall back to ERC-4337 EntryPoint model or relay server                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | **Candide contracts compromised**                                                          | HIGH     | Pin exact audited versions; fork and verify bytecode; kill switch; review upgrade mechanism;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6   | **Paymaster underfunded mid-transaction**                                                  | HIGH     | On-chain deposit check before every tx (not cached); 2x safety margin; server-side monitoring alert; explicit user notification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7   | **USDT depeg**                                                                             | HIGH     | Circuit breaker at 5%+ deviation disables USDT escrow creation and swaps. Wallet sends and receives are NEVER blocked — the user can always move USDT to an exchange or another wallet. Two-of-three oracle median; re-peg threshold: <2% for 30 min to re-enable. When depeg is detected (>2% deviation for 5 minutes): escrow creation and swaps are blocked; sends and receives remain functional. The VITE_ feature flag is a separate mechanism that blocks ALL USDT operations. The depeg state auto-clears when the peg recovers (<2% deviation for 30 minutes). |
| 8   | **Gas price spike between estimate and mine**                                              | HIGH     | Dynamic buffer: p90 trailing gas price + 20%; on-chain `maxGasSpend` in auth; user-defined max in confirmation screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 9   | **Cross-chain swap asymmetric failure**                                                    | HIGH     | Background swap monitor polling all pending swaps; notification on refundable state; chain-specific confirmation counts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 10  | **App backgrounds during delegation**                                                      | HIGH     | Capacitor Preferences persistence at each state; resume detection + on-chain verification; Sentry breadcrumbs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 11  | **Private key exposure to Candide SDK**                                                    | HIGH     | RestrictedSigner wrapper; only exposes EIP-7702 auth signing; rejects all other requests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 12  | **Old RSK address referenced by active escrows after migration**                           | HIGH     | Pre-migration escrow inventory; block migration if active escrows exist; preserve old path for contract access; 180-day old address monitoring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 13  | **USDT approve race condition / non-standard ERC-20**                                      | MEDIUM   | Verify paymaster uses SafeERC20; test with BEP-20 USDT specifically; handle void-return transfers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 14  | **Single RPC URL failure**                                                                 | MEDIUM   | Multiple RPC URLs per chain with health check and automatic failover                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 15  | **Oracle returns stale/zero price**                                                        | MEDIUM   | Staleness check (reject > 5min, consistent with Risk 15); reject zero price; fallback oracle; if both oracles are stale, refuse to execute transaction (no hardcoded fallback)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 16  | **EIP superseded**                                                                         | MEDIUM   | GasAbstractionProvider interface abstracts the provider; version field in paymaster config enables client-side rejection of unsupported versions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 17  | **Insufficient USDT for both send amount + gas**                                           | MEDIUM   | Pre-flight balance check: `balance >= amount + maxGasInToken`; if not, show clear shortfall message; minGasReserve warning (not blocker)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 18  | **Approve circular dependency** (need BNB to approve paymaster — but BNB is not available) | MEDIUM   | The initial USDT approval for the paymaster is bundled into the first EIP-7702 transaction (Tx1 delegates + approves paymaster + executes business logic in one transaction). This eliminates the circular dependency entirely — the user never needs BNB even for the first transaction. The approval is for the exact amount + gas only (no infinite approval). SafeERC20 is used throughout. The hidden BNB fallback (D-003) covers the case where the paymaster is unavailable for the approval tx.                                                                                                                                                                          |
| 19  | **USDT blacklist**                                                                         | MEDIUM   | Client-side detection: if transfers consistently fail with specific revert, show "Your address may be restricted" error                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 20  | **Pending tx invisible when viewing other chain**                                          | MEDIUM   | `pendingTransactions` map per chainId; background polling for ALL chains; per-chain pending indicator on chain display                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 21  | **Privacy: delegation pattern reveals user behavior**                                      | LOW      | Privacy disclosure in wallet settings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 22  | **BSC chain reorganization**                                                               | LOW      | 1-confirmation is standard for BSC but monitor reorg depth; for high-value txs (>$10k), require 5+ confirmations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 23  | **Emergency cleanup path missing**                                                         | CRITICAL | Hidden BNB fallback (D-003) provides the emergency path. If BNB is unavailable AND the paymaster is broken, delegation code is inert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 24  | **Nonce collision on Tx2**                                                                 | HIGH     | If another tx uses nonce N+1 before Tx2 submits. Mitigation: transaction queue freeze during delegation window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 25  | **Feature flag served by same infrastructure it protects**                                  | HIGH     | Since feature flags are build-time VITE_ env vars embedded in the bundle, they are not affected by CF Worker outages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 26  | **Capacitor Preferences async write race with app termination**                            | MEDIUM   | Already mitigated: sequence diagram shows `await Preferences.set()` before proceeding to signAuth(). Cross-tab guard via Capacitor Preferences lock key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 27  | **Stale bundle**                                                                  | MEDIUM   | Requires redeploy to change feature availability. Users must update the app to receive new flags.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 28  | **Account delegated + user imports seed into another wallet during delegation window**     | MEDIUM   | Warn users not to use wallet with other apps during active transaction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 29  | **BSC chain halt during delegation**                                                       | LOW      | Account remains delegated until chain resumes. Recovery path runs automatically on resume.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 30  | **Oracle staleness for gas estimation**                                                    | HIGH     | 5-minute staleness check, reject stale data, use fallback oracle. This is the same oracle staleness concern as Risk 15, applied specifically to gas estimation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 31  | **Multiple browser tabs creating conflicting delegations**                                 | MEDIUM   | Lock via Capacitor Preferences prevents cross-tab conflicts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 32  | **Changelly API abuse via unauthenticated proxy**                                          | MEDIUM   | Per-wallet rate limiting in CF Worker proxy; input sanitization; auth check on all proxy requests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

---

## 10. Operational Safety: Kill Switch & Rollback

### 10.1 Feature Flag Architecture

All features with external dependencies are gated by VITE_ environment variables. Set to `false` during development or before a partnership is active; set to `true` after the dependency is provisioned. Requires redeploy. No runtime kill switch — the app must be rebuilt and redeployed to change feature availability.

| Feature               | VITE_ Flag                        | External Dependency         |
| --------------------- | --------------------------------- | --------------------------- |
| USDT Operations       | _(always on)_                     | BSC RPC, USDT contract      |
| EIP-7702 Gas          | _(always on when USDT is on)_     | Candide Paymaster + Bundler |
| Changelly Swaps       | `VITE_CHANGELLY_ENABLED`          | Changelly API               |
| Changelly Fiat Ramp   | `VITE_CHANGELLY_FIAT_ENABLED`     | Changelly Fiat SDK          |

**`.env` pattern:**

```bash
# Build-time feature flags — set to 'true' when external dependency is provisioned
VITE_CHANGELLY_ENABLED=true
VITE_CHANGELLY_FIAT_ENABLED=false

# Override @bittasker/wallet-core path for local testing (vitest only).
# Leave empty to use the npm package.
LOCAL_WALLET_CORE=
````

**Implementation pattern (`FeatureFlagService`):**

```typescript
// src/lib/services/feature-flags.ts
const FF_CHANGELLY_SWAPS = import.meta.env.VITE_CHANGELLY_ENABLED === 'true';
const FF_CHANGELLY_FIAT = import.meta.env.VITE_CHANGELLY_FIAT_ENABLED === 'true';
```

**VITE\_ flag visibility**: VITE* prefixed environment variables are statically embedded in the client bundle at build time and visible in source maps. Do NOT place secrets, API keys, or sensitive configuration values in VITE* flags. These flags control feature surface only (UI visibility, store initialization). Actual API credentials for Changelly and Candide are stored as CF Worker secrets (never in VITE\_ or client code).

**`.env` file in version control:** `.env.example` is committed with all feature flags set to `false`. Actual `.env` is in `.gitignore` (prevents accidental commits of API keys and enabled flags). CI/CD sets flags per environment via deployment secrets.

### 10.2 Rollback Procedure

Rolling back requires rebuilding the app with the feature's `VITE_` flag set to \`false\` and redeploying.

### 10.3 Paymaster Pause Mechanism

The Candide paymaster contract must implement OpenZeppelin's `Pausable`:

- `pause()` — triggered by **two-tier multisig**: any single keyholder can pause immediately (emergency pause, auto-escalated to full multisig for review within 1 hour)
- `unpause()` — requires full N-of-M multisig
- When paused: all EIP-7702 transactions using this paymaster revert
- Users are shown a clear message: 'USDT gas payment is temporarily unavailable. Transactions requiring gas will resume when service is restored.'

### 10.4 Paymaster Rate Limiting

To prevent a single user or attacker from rapidly draining the paymaster pool, the paymaster contract enforces the following rate limits on-chain:

| Limit                             | Value                                            | Enforcement                                            |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| Per-address transaction frequency | Max 5 EIP-7702 transactions per hour per address | Paymaster contract tracks per-address nonce window     |
| Global transaction rate           | Max 50 EIP-7702 transactions per hour total      | Paymaster contract sliding window counter              |
| Per-transaction value cap         | 5,000 USDT maximum per EIP-7702 transaction      | Enforced in the paymaster `validatePaymasterUserOp`    |
| Per-address daily value cap       | 25,000 USDT maximum per address per day          | Paymaster contract tracks per-address cumulative value |

These limits are calibrated to the paymaster's BNB pool size: `max_hourly_exposure = global_rate x per_tx_cap`. The pool size must sustain at minimum 4 hours of maximum throughput at current BNB prices. If the pool size changes, rate limits are adjusted via multisig. The operations team monitors the ratio of `pool_balance / max_hourly_exposure` and alerts at < 2x coverage. All limits are stored as configurable parameters on the paymaster contract and can be adjusted by the BitTasker operations team (via multisig) without requiring client updates. The client also performs a pre-flight check via `healthCheck()` (returning `estimatedRemainingTx` for the user address) to surface rate limit warnings before the user attempts a transaction.

**Implementation note:** If the deployed paymaster contract does not natively support these rate limits, they are enforced server-side via the CF Worker proxy. Client-side pre-flight checks are advisory only and provide UX feedback (rate limit warnings). The authoritative enforcement point is the Worker proxy or on-chain paymaster contract. Client-only enforcement is not acceptable for production. The per-transaction value cap and per-address daily cap are checked before submission. Global rate limiting is deferred to a server-side proxy or future contract upgrade. The specification defines the desired limits; the implementation location depends on the deployed paymaster's capabilities.

### 10.5 Defensive & Deterministic Programming Principles

The implementation of this plan MUST adhere to the following programming practices, consistent with the BitTasker project's CLAUDE.md requirements.

#### Deterministic Programming

- **Pure functions for all financial calculations**: Gas estimation, amount conversion, fee calculation, and USDT/BNB price conversion are implemented as pure functions with no side effects. Given the same inputs (gasLimit, gasPrice, oraclePrice, buffer), they produce identical outputs.
- **State machines with explicit transitions**: The delegation lifecycle (S2.1) uses a finite state machine with only valid transitions. Invalid state transitions are rejected at the type level using TypeScript's `never` type on exhaustive switch statements.
- **Single-writer principle**: Each store variable has exactly one module that writes to it. `delegationState` is only written by `DelegationManager`. `gasMode` is only written by `GasModeStore`. Multiple readers, single writer.
- **No randomness**: All values are deterministic. No `Math.random()`, no timestamp-based entropy. For retry jitter, use a deterministic exponential backoff sequence.

#### Defensive Practices

- **Validate at every boundary**: Every value from the chain (RPC responses, oracle prices, paymaster state), from user input (amounts, addresses), and from the Candide SDK (authorization objects, UserOperations) is validated before use.
- **All async operations use tryCatch()**: Every Promise is wrapped in `tryCatch()` from `src/lib/utils/tryCatch.ts`, returning `{ data, error }` tuples. No uncaught Promise rejections.
- **Null/undefined handling**: Every nullable value from the chain is checked before access. Use optional chaining (`?.`) and nullish coalescing (`??`). Never assume data exists.
- **Type safety**: Use project types from `src/lib/types/`. Never use `any` — use `unknown` + type guards. Run `npm run check` after type changes. No `eslint-disable`, `ts-ignore`, or `as any`.
- **Platform guards**: BSC RPC calls are guarded with `Capacitor.isNativePlatform()` checks. Browser localStorage access is wrapped in `if (browser)` checks.
- **Error surfaces to user**: Every error in the delegation flow produces a user-visible message or toast. No silent `catch (e) {}` blocks.
- **Sentry breadcrumbs**: Every delegation state transition, oracle query, paymaster health check, and transaction submission logs a Sentry breadcrumb.
- **Network awareness**: All BSC operations check `navigator.onLine` and the app's `network-status.ts` store before proceeding. Offline state shows cached data with staleness indicators.
- **App lifecycle**: Delegation polling pauses on `appStateChange` to background. Resumes and re-verifies on-chain state on foreground.
- **On-chain is source of truth**: The DelegationJournal is a recovery hint. On-chain state (`getCode(address)`, transaction receipts) is authoritative. Journal is never used to assert state — only to suggest which recovery path to attempt.

#### Edge Case Checklist (per transaction)

Before any USDT gas transaction is submitted, verify:

- [ ] USDT balance >= amount + estimatedMaxGas (with 20% buffer)
- [ ] Paymaster health check passed (funded, oracle not stale > 5min, not paused)
- [ ] Chain lock acquired (no other transaction in progress)
- [ ] Nonce verified against on-chain nonce (not cached)
- [ ] Delegation contract address matches registry
- [ ] maxGasSpend <= user-defined cap
- [ ] Network is online
- [ ] Sentry breadcrumb logged: "USDT gas tx starting"

---

## 11. Dependencies & Tooling

### 11.1 New Dependencies (Exact Versions Pinned)

```json
{
	"dependencies": {
		"abstractionkit": "0.3.8",
		"@changelly/fiat-api-sdk-node": "1.0.3"
	}
}
```

Pinned to exact version (not `^0.3.7`) per security audit recommendation. Update only after version audit and bytecode verification against deployed contracts.

### 11.1.1 Changelly

**Swap API v2** (`https://api.changelly.com/v2/`):
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/currencies/full` | GET | List supported currency pairs |
| `/estimate` | POST | Get floating/fixed rate quote |
| `/validate/{currency}/{address}` | GET | Validate payout address |
| `/transactions` | POST | Create swap transaction |
| `/transactions/{id}` | GET | Get transaction status |
| `/limits/{from}/{to}` | GET | Get min/max limits for a pair |

Auth: HMAC-SHA256. Each request includes headers `api-key`, `sign`, and `nonce`. Signature = HMAC-SHA256(secret, nonce + JSON.stringify(body)). See existing HMAC pattern in `workers-site/handlers/stream.js`.

**Fiat API** (`@changelly/fiat-api-sdk-node` v1.0.3):

- SDK exports `ChangellyFiatClient` with methods: `getProviderList()`, `getCurrencyList()`, `createOnRampTransaction()`, `createOffRampTransaction()`, `getTransactionStatus()`
- MUST run server-side in CF Worker (Node.js SDK, not compatible with Capacitor WebView)
- `CHANGELLY_FIAT_PRIVATE_KEY` and `CHANGELLY_FIAT_PUBLIC_KEY` via `wrangler secret put`

**API key**: Already obtained. Stored as CF Worker secrets (never in client code).
**Fees**: 0.25% crypto swap, 1–5% fiat ramp (varies by payment method).
**Supported**: 185 chains including BSC, 1,000+ tokens including USDT.

**Deploy secrets:** `wrangler secret put CHANGELLY_API_KEY` and `wrangler secret put CHANGELLY_API_SECRET` and `wrangler secret put CHANGELLY_FIAT_PRIVATE_KEY` and `wrangler secret put CHANGELLY_FIAT_PUBLIC_KEY`

**Integration pattern:** Fiat SDK runs in the same CF Worker proxy (never client-side). The `@changelly/fiat-api-sdk-node` is a Node.js SDK — it MUST run server-side in the Worker, not in the Capacitor app.

**KYC data:** KYC data (identity documents, bank details) flows directly between the user and Changelly's hosted widget. BitTasker infrastructure does not process or store KYC data.

**PCI/card data:** Card numbers, CVV, and billing details are entered through Changelly's PCI-compliant hosted widget. Card data never reaches BitTasker's servers, Workers, or client code. The app embeds Changelly's widget via redirect or iframe; all payment processing is handled by Changelly's payment processor partners.

### 11.2 Testing wallet-core Changes Locally

Phase 3.2 requires a configurable derivation path in `@bittasker/wallet-core`'s `RSKWallet`. To test this without publishing to npm:

**`.env` (`LOCAL_WALLET_CORE`):**

```bash
# Set to the absolute path of a local wallet-core checkout to override the
# npm package during vitest runs. Leave empty to use the published package.
LOCAL_WALLET_CORE=/home/foxx/Documents/dev-Bittasker/dev/wallet-core/src
```

**`vitest.config.ts`:**

```ts
import { defineConfig } from 'vitest/config';

const LOCAL_WALLET_CORE = process.env.LOCAL_WALLET_CORE;

export default defineConfig({
	resolve: LOCAL_WALLET_CORE ? { alias: { '@bittasker/wallet-core': LOCAL_WALLET_CORE } } : {}
});
```

When `LOCAL_WALLET_CORE` is empty or unset, vitest resolves `@bittasker/wallet-core` from `node_modules` as normal. When set, it aliases to the local checkout. No code changes, no package.json modifications, no risk of accidental commits. `npm run dev` and `npm run build` are unaffected — this only applies to vitest.

### 11.3 Existing Dependencies

- `ethers` v6 — signer, provider, contract interaction
- `@bittasker/wallet-core` — WalletManager, BSCWallet, BSCPaymaster, Boltz swaps
- `svelte-i18n` — i18n (keys already partially exist)
- `@capacitor/core` + `@capacitor/preferences` — delegation state persistence
- Tailwind CSS 4 + daisyUI — styling (no new CSS files)
- Firebase Cloud Messaging — push notifications (extended to cover USDT wallet events; see Phase 2.5.7)

### 11.4 AbstractionKit API

The `abstractionkit@0.3.8` library provides EIP-7702 delegation via `Calibur7702Account` and gas sponsorship via `CandidePaymaster`. The contracts are audited by OpenZeppelin and Cantina.

**Docs:** https://docs.candide.dev/wallet/abstractionkit/calibur-account/
**Paymaster docs:** https://docs.candide.dev/wallet/abstractionkit/paymaster/
**GitHub:** https://github.com/candidelabs/abstractionkit

```typescript
import { Calibur7702Account, CandidePaymaster } from 'abstractionkit';

// 1. Create account from EOA address (no private key needed for construction)
const smartAccount = new Calibur7702Account(eoaAddress, {
	entrypointAddress: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108', // EntryPoint v0.8
	delegateeAddress: '0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00' // Calibur singleton
});

// 2. Create UserOperation with EIP-7702 delegation authorization
// On first call: sets delegation code on EOA (Tx1)
// On subsequent calls: delegation already active, creates normal UserOp
const userOperation = await smartAccount.createUserOperation(
	transactions, // Array of { to, value, data } calls
	providerRpcUrl, // BSC RPC URL
	bundlerRpcUrl, // Candide bundler URL
	{
		eip7702Auth: {
			chainId: 56n // BSC mainnet; required for first UserOperation
		}
	}
);

// 3. Sponsor the UserOperation with USDT gas payment
const paymaster = new CandidePaymaster('https://api.candide.dev/public/v3/bsc');
const { userOperation: sponsoredOp } = await paymaster.createSponsorPaymasterUserOperation(
	smartAccount,
	userOperation,
	bundlerRpcUrl,
	undefined, // sponsorshipPolicyId (undefined = public gas policy)
	{ token: usdtTokenAddress } // Pay gas in USDT
);

// 5. Sign the sponsored UserOperation with RestrictedSigner
const signature = await restrictedSigner.signTypedData(
	smartAccount.getUserOperationDomain(),
	smartAccount.getUserOperationTypes(),
	sponsoredOp
);

// 6. Send via bundler (signature embedded in UserOperation before sending)
sponsoredOp.signature = signature;
const response = await smartAccount.sendUserOperation(sponsoredOp, bundlerRpcUrl);
const txHash = response.userOperationHash;

// 7. For cleanup (Tx2): create a UserOperation that resets delegation
// to address(0), sponsor + sign + send with same paymaster flow.
// The delegation is cleared when the UserOp executes.

// 8. Verify EOA state after cleanup
const code = await provider.getCode(eoaAddress);
const isEOA = code === '0x';
```

**Integration with RestrictedSigner:** The RestrictedSigner exposes only the `signTypedData` method needed for UserOperation signing (EIP-712). The full `ethers.Wallet` private key is never passed to `abstractionkit`. The `Calibur7702Account` constructor only needs the EOA address string, not the private key.

**Bundle for cleanup (Tx2):** The cleanup UserOperation is constructed with a single transaction that calls the delegation contract's code-reset function (sets code to `address(0)`). Both Tx1 and Tx2 UserOperations are sponsored through the same paymaster flow, paid in USDT.

### 11.5 Secrets Management Policy

All external API credentials (Changelly, Candide) follow these rules:

| Policy                 | Requirement                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Storage                | `wrangler secret put` — never in client code, `.env`, or git                                    |
| Rotation               | Every 90 days; documented in operational runbook                                                |
| Environment separation | Dev, staging, and production use separate API keys                                              |
| Access audit           | `wrangler secret list` reviewed monthly; access revoked on role change                          |
| Breach response        | Rotate compromised key within 1 hour; notify affected users; audit logs for unauthorized access |
| CI/CD                  | Secrets injected via deployment environment variables, never hardcoded in workflow files        |

**Pre-commit hook**: Add `.env-BACKUP-*` and all `.env*` files (except `.env.example`) to `.gitignore`. Add a pre-commit hook that rejects any file matching `.env*` except `.env.example`.

---

## 12. Audit Trail & Confidence Tracking

This document was developed through multiple audit rounds. The pre-v4.1 combined confidence score across all four dimensions (Security, UX, Completeness, Risk) reached **96%**, with all dimensions scoring **>=95%**.

### Confidence Gate (Must Pass Before Marking Complete)

- [ ] All EIP-7702 delegation tests pass (14 test scenarios in §8.4)
- [ ] All derivation migration tests pass (two-phase commit, reorg resilience, escrow inventory)
- [ ] All multi-chain integration tests pass
- [ ] All E2E tests pass (12 flows in §8.3)
- [ ] `npm run check` passes with zero type errors
- [ ] `npm run lint` passes
- [ ] `npm run test:ci` passes
- [ ] No `eslint-disable`, `ts-ignore`, or `as any` anywhere
- [ ] All user-facing strings translated (en/es) — verify with `find-missing-translations.py`
- [ ] WCAG AA accessibility audit passes: radio groups as `<fieldset><legend>`, focus indicators, aria-labels, keyboard nav
- [ ] Paymaster pause function deployed and verified (multisig)
- [ ] BSC EIP-7702 support verified on testnet (Phase 2.6 gate)
- [ ] RestrictedSigner verified: raw private key never passed to Candide SDK
- [ ] Delegation cleanup verified: `getCode(address) === '0x'` after every transaction
- [ ] Chain lock verified: cannot switch chain during active transaction
- [ ] Delegation state recovered after app kill + restart
- [ ] **Second swarm audit: all 4 dimensions >=95%**
- [ ] All delegation state transitions are type-checked (exhaustive switch on DelegationState)
- [ ] All gas calculation functions are pure (no side effects, deterministic output)
- [ ] All async operations use tryCatch() — verified by lint rule
- [ ] Hidden BNB fallback exists but is never exposed in UI; no user-facing gas mode choice
- [ ] All user-visible error states have deterministic, tested render paths
- [ ] **Third swarm audit: all 4 dimensions >=95% with v4.1 additions**
- [ ] `VITE_CHANGELLY_ENABLED=false` verified: no swap UI, no swap API calls, no swap store init
- [ ] `VITE_CHANGELLY_FIAT_ENABLED=false` verified: no fiat ramp UI, no fiat API calls, no fiat store init
- [ ] All VITE\_ feature flags documented in `.env.example`
- [ ] Feature flag gating applied to ALL external-dependency features (Changelly, Changelly Fiat)

---

## 13. Feature Flag Dependency Map

Every feature that depends on an external API/service must be gated by a VITE\_ environment variable. This ensures:

1. **Development can proceed** without all external dependencies provisioned
2. **Dead code** doesn't appear in production before partnerships are active

| Feature             | External Dependency    | VITE\_ Flag                   | Provisioned? | Notes                       |
| ------------------- | ---------------------- | ----------------------------- | ------------ | --------------------------- |
| USDT Operations     | BSC RPC, USDT contract | _(always on)_                 | Yes          | Built into wallet           |
| EIP-7702 Gas        | Candide Paymaster      | _(always on when USDT is on)_ | Pending      | Requires paymaster deposit  |
| Changelly Swaps     | Changelly API          | `VITE_CHANGELLY_ENABLED`      | Yes          | API key provisioned         |
| Changelly Fiat Ramp | Changelly Fiat SDK     | `VITE_CHANGELLY_FIAT_ENABLED` | No           | Requires separate agreement |

### How to add a new feature-flagged dependency

1. Add `VITE_YOUR_FEATURE_ENABLED=false` to `.env.example`
2. Gate all UI, store init, and API calls behind `FeatureFlagService.isEnabled('your_feature')`
3. Add to this table
4. Audit: verify `false` state hides everything; no API calls fire

---

## Appendix A: New Files

```
src/lib/services/gas-abstraction/types.ts            — GasAbstractionProvider interface
src/lib/services/gas-abstraction/eip7702-provider.ts — EIP-7702 implementation
src/lib/services/gas-abstraction/restricted-signer.ts— Scoped signer wrapper
src/lib/services/stablecoin-registry.ts              — Chain/token configuration
src/lib/services/derivation-migrator.ts              — RSK path migration (two-phase)
src/lib/services/kill-switch.ts                      — VITE_ feature flag gating
src/lib/services/delegation-journal.ts               — Persistent delegation records
src/lib/services/chain-lock.ts                       — Prevent chain switch during tx
src/lib/stores/gas-mode.store.ts                     — Gas preference + health state
src/lib/components/wallet/ChainSelector.svelte       — Reusable token+chain picker
src/lib/components/wallet/GasFeeDisplay.svelte       — Gas cost with confidence %
src/lib/components/wallet/DelegationRecoveryModal.svelte — Recovery UI for stuck delegations
src/lib/services/changelly.service.ts              — Changelly swap API client (calls NestJS backend)
src/lib/components/wallet/BankingMenu.svelte       — Banking entry point modal
src/lib/components/wallet/BuyUSDTForm.svelte       — Buy USDT flow
src/lib/components/wallet/SellUSDTForm.svelte      — Sell USDT flow
workers-site/handlers/changelly-fiat.js            — CF Worker proxy for fiat API
src/lib/services/feature-flags.ts                  — Two-tier feature flag service
```

## Appendix B: Modified Files

```
src/lib/stores/wallet.store.ts                       — Multi-chain + delegation state
src/lib/types/wallet.d.ts                            — 12+ new types
src/lib/utils/constants/wallet.constants.ts          — BSC gas constants
src/lib/utils/contract/v2/creation.ts                — Token-aware pricing
src/lib/utils/contract/v2/blockchainWrites.ts        — Chain-aware contract selection
src/lib/utils/contract/v2/service-creation.ts        — USDT pricing
src/lib/utils/contract/v2/types.ts                   — Token metadata
src/lib/utils/contract/v2/createPaymentContractParams.ts — Token-aware validation
src/lib/utils/wallet/contractRegistry.ts             — Add bsc.testnet (corrected path)
src/lib/utils/contract/index.ts                      — Chain-aware initContract()
src/lib/api/services/crypto-price.service.ts         — USDT price feed
src/lib/nostr/events/contract.ts                     — Chain/token context on events
src/lib/components/wallet/BalanceCard.svelte         — Activate USDT accordion
src/lib/components/wallet/SendPaymentForm.svelte     — Token selector, gas fee display
src/lib/components/wallet/ReceivePaymentForm.svelte  — Chain selector, acknowledgment
src/lib/components/wallet/PaymentRequestModal.svelte — Token-aware
src/lib/components/wallet/TransactionHistory.svelte  — Multi-chain filter
src/lib/components/wallet/SwapForm.svelte            — rBTC↔USDT via Changelly (0.25% fee); rBTC↔BTC via Boltz
src/lib/components/wallet/TransactionSuccessScreen.svelte — Token-aware
src/lib/components/wallet/PendingTransactionScreen.svelte — Clean 3-state, no jargon
src/lib/components/wallet/BuySellForm.svelte         — rBTC buy/sell (no USDT — Boltz doesn't support BSC)
src/lib/components/wallet/BalanceHistory.svelte      — Multi-token chart
src/lib/components/contracts/ContractCardNDK.svelte   — Token-aware amounts
src/lib/components/contracts/ContractDrawerNDK.svelte — Token-aware amounts
src/lib/components/bidding/CounterOfferForm.svelte   — USDT pricing
src/lib/components/service/quotes/ServiceQuotesInbox.svelte — USDT amounts
src/lib/components/bidding/DashboardBidsPanel.svelte — USDT bid display
src/routes/(protected)/dashboard/wallet/+page.svelte  — Multi-chain layout, kill switch banners
src/routes/(protected)/earning/contracts/+page.svelte — USDT contract states
```
