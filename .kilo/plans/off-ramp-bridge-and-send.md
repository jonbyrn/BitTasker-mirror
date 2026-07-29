# Architecture Plan: Off-Ramp Bridge-and-Send Flow

**Date**: 2026-06-29  
**Status**: DRAFT — awaiting human review  
**Author**: Kilo (Architect Agent)

---

## 1. Problem Statement

MoonPay off-ramp in El Salvador only supports USDT on ETH/BSC/Tron/Polygon/Solana and USDC. It does NOT support:
- USDT on Arbitrum (USDT0-Arb)
- rBTC (Rootstock)
- wBTC-Arb (Wrapped BTC on Arbitrum)

The sell tab currently calls `getSellOffers()` → returns "no offers" for these unsupported assets. Users with any of these assets cannot off-ramp to fiat.

## 2. Solution: Bridge-and-Send

A transparent 2-step flow hidden behind a single user action:

1. **LI.FI bridge**: User's asset → USDT-BSC (cheapest path, ~0.30%)
2. **MoonPay off-ramp**: USDT-BSC → fiat to user's bank (1.65% spread)

**Total cost**: ~1.97% (bridge + off-ramp). Much cheaper than BTC→fiat via MoonPay (3.53%).

**User experience**:
- User sees: "$50 in → ~$49 out, ~$1 fee, ~2 min"
- Steps: Enter amount → See quote → Click "Sell" → MoonPay opens → Copy deposit address → Paste in app → Bridge executes → Fiat arrives

---

## 3. Architecture Decisions

### 3.1 Separate orchestrator class (not extending FiatSwapOrchestrator)

**Decision**: Create `OffRampOrchestrator` as a new class, NOT extend `FiatSwapOrchestrator`.

**Rationale**:
- Buy orchestrator manages: Changelly order → payment monitoring → balance polling → multi-hop auto-swap
- Sell orchestrator manages: MoonPay order → deposit address pasting → LI.FI bridge → bridge status monitoring
- State machines are structurally different (different stages, different polling targets)
- Different localStorage key to avoid collisions
- `FiatSwapOrchestrator` is already 689 lines; extending it would violate the 500-line limit
- Both orchestrators share a few patterns (localStorage persistence, stage callbacks, visibilitychange) but those are trivial to duplicate — not worth a shared base class for ~30 lines of boilerplate

### 3.2 LI.FI execution: call lifiService directly (not executeLifiHop)

**Decision**: Use `lifiService.getStepTransaction()` + `sendEvmTransaction()` directly in the orchestrator. Do NOT call `executeLifiHop()` from `executors.ts`.

**Rationale**:
- `executeLifiHop()` requires `RouteHop` and `SwapChainState` types from swap-chain — tight coupling to swap routing infrastructure
- The off-ramp bridge is a fixed-route swap (any asset → USDT-BSC), not part of the swap chain routing system
- `sendEvmTransaction()` from `tx-helpers.ts` is the right level of abstraction — handles built-in vs connected wallet, receipt verification
- The orchestrator only needs: get quote → get tx data → approve if ERC-20 → send tx → poll status. This is ~40 lines, not worth importing the full swap-chain executor.
- We import `sendEvmTransaction`, `encodeERC20Approve`, and chain constants directly

### 3.3 Combined quote: LI.FI + MoonPay fee estimate

**Decision**: Fetch LI.FI quote for bridge cost, combine with hardcoded MoonPay fee estimate for display.

**Rationale**:
- MoonPay's `getSellOffers()` returns "Unsupported exchange pair" for USDT0-Arb/wBTC-Arb/rBTC — that's the whole reason for this feature
- MoonPay DOES support USDT-BSC off-ramp (1.65% spread, confirmed via API)
- The combined quote = LI.FI bridge cost (from `lifiService.getQuote()`) + MoonPay fee estimate (1.65% of bridge output)
- No need to call `getSellOffers()` for the bridge-and-send path — we know the route and costs
- For zero-fee payout methods (Revolut, PIX, Interac), the MoonPay spread is the only cost

### 3.4 Deposit address: user-paste pattern (not API response)

**Decision**: User copies the deposit address from MoonPay's checkout page and pastes it into the app.

**Rationale**:
- Changelly's `createOffRampOrder()` returns `redirectUrl` only, NOT a deposit address
- MoonPay's checkout page shows the deposit address after the user selects a payout method
- The redirect URL is single-use — cannot be reopened
- If user closes MoonPay before copying, "Start Over" creates a new order with a fresh URL
- Same pattern as the existing buy flow (user returns from checkout)

### 3.5 Address validation: ethers.getAddress() with fallback

**Decision**: Use `ethers.getAddress()` for EIP-55 checksum validation. It throws on invalid addresses.

**Rationale**:
- MoonPay's deposit address is a BSC EOA — standard `0x` + 40 hex chars
- `ethers.getAddress()` validates format AND checksum
- Already imported in the codebase (used by FiatSwapOrchestrator for Changelly address validation)
- No need for Changelly's `validateAddress` API — that's for Changelly's own addresses, not arbitrary BSC addresses

---

## 4. State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                       OffRampOrchestrator                           │
│                                                                     │
│  idle                                                               │
│    │  createQuote()                                                 │
│    ▼                                                                │
│  quote_loading ─────────────────────────────────────────────────────│
│    │  quote received                                                │
│    ▼                                                                │
│  quote_ready                                                        │
│    │  openMoonPay()                                                 │
│    ▼                                                                │
│  opening_moonpay                                                    │
│    │  user copies address, returns to app                           │
│    ▼                                                                │
│  awaiting_deposit_address                                           │
│    │  user pastes address, submits                                  │
│    ▼                                                                │
│  bridging ──────┐                                                   │
│    │            │  executeLifiBridge()                               │
│    │            │  pollLifiStatus()                                  │
│    ▼            │                                                   │
│  complete       │  LI.FI status === DONE                            │
│                 │                                                   │
│                 ▼                                                   │
│               failed ──► start_over ──► opening_moonpay             │
│                 │         (new MoonPay order, fresh redirectUrl)    │
│                 │                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Stage types**:
```typescript
type OffRampStage =
  | 'idle'
  | 'quote_loading'
  | 'quote_ready'
  | 'opening_moonpay'
  | 'awaiting_deposit_address'
  | 'bridging'
  | 'complete'
  | 'failed';
```

---

## 5. Type Contracts

### 5.1 OffRampOrchestrator types (new file)

```typescript
/** Asset that can be off-ramped via bridge-and-send */
export type OffRampAsset = 'rbtc' | 'usdt0-arb' | 'wbtc-arb' | 'btc-onchain';

/** Combined quote: LI.FI bridge cost + MoonPay off-ramp fee estimate */
export interface OffRampQuote {
  /** Input amount in the source asset (e.g., "50" for $50 USDT0) */
  inputAmount: string;
  /** Input asset */
  inputAsset: OffRampAsset;
  /** LI.FI bridge output in USDT-BSC (after bridge fees) */
  bridgeOutputAmount: string;
  /** LI.FI bridge fee as percentage (e.g., "0.30") */
  bridgeFeePercent: string;
  /** LI.FI bridge fee in USD */
  bridgeFeeUsd: string;
  /** Estimated MoonPay fee as percentage (e.g., "1.65") */
  moonpayFeePercent: string;
  /** Estimated MoonPay fee in USD */
  moonpayFeeUsd: string;
  /** Estimated fiat received by user (after all fees) */
  estimatedFiatReceived: string;
  /** Total fee in USD */
  totalFeeUsd: string;
  /** Estimated completion time in seconds */
  estimatedTimeSeconds: number;
  /** Chain ID of source token */
  fromChainId: number;
  /** Token address of source token */
  fromTokenAddress: string;
  /** Amount in smallest unit (wei/sats) for LI.FI */
  fromAmountWei: string;
  /** LI.FI route ID for later step tx */
  lifiRouteId?: string;
}

/** State persisted to localStorage */
export interface OffRampFlowState {
  stage: OffRampStage;
  /** Changelly/MoonPay external order ID */
  externalOrderId: string;
  /** Changelly/MoonPay order ID */
  orderId: string;
  /** MoonPay redirect URL (single-use) */
  redirectUrl: string;
  /** The quote that was used to create this flow */
  quote: OffRampQuote;
  /** User's source wallet ID ('builtin' or connected wallet ID) */
  sourceWalletId: string;
  /** User's source wallet address (for LI.FI fromAddress) */
  sourceAddress: string;
  /** Deposit address pasted by user (BSC USDT address) */
  depositAddress?: string;
  /** LI.FI bridge tx hash */
  bridgeTxHash?: string;
  /** LI.FI bridge status */
  lifiStatus?: 'PENDING' | 'DONE' | 'FAILED' | 'NOT_FOUND';
  /** Error message if stage === 'failed' */
  error?: string;
  /** Timestamp of last state update */
  updatedAt: number;
  /** Timestamp of flow creation */
  startedAt: number;
}

/** Parameters for creating the off-ramp orchestrator */
export interface CreateOffRampQuoteParams {
  asset: OffRampAsset;
  amount: string; // In asset's native unit (sats for BTC, USD for USDT0)
  sourceWalletId: string; // 'builtin' or connected wallet ID
  sourceAddress: string; // User's EVM address for LI.FI fromAddress
  country: string;
}
```

### 5.2 i18n keys to add

```json
{
  "wallet.buy_sell.bridge_and_send": "Bridge & Send",
  "wallet.buy_sell.bridge_and_send_desc": "Your {asset} will be converted to USDT and sent to MoonPay for cash out.",
  "wallet.buy_sell.paste_deposit_address": "Paste your USDT (BSC) deposit address from MoonPay",
  "wallet.buy_sell.deposit_address_placeholder": "0x...",
  "wallet.buy_sell.deposit_address_invalid": "Invalid BSC address. Please check and try again.",
  "wallet.buy_sell.bridge_in_progress": "Bridging {asset} → USDT...",
  "wallet.buy_sell.bridge_complete": "Bridge complete! MoonPay is processing your payout.",
  "wallet.buy_sell.bridge_failed": "Bridge failed. Your funds are safe in your wallet.",
  "wallet.buy_sell.combined_fee": "~{percent}% total fee",
  "wallet.buy_sell.moonpay_fee": "MoonPay fee",
  "wallet.buy_sell.bridge_fee": "Bridge fee",
  "wallet.buy_sell.you_receive": "You receive",
  "wallet.buy_sell.estimated_time": "~{time} min",
  "wallet.buy_sell.open_moonpay": "Open MoonPay",
  "wallet.buy_sell.moonpay_redirect_note": "MoonPay will show a USDT deposit address. Copy it and come back here to paste it.",
  "wallet.buy_sell.start_over_moonpay": "Start over (creates new MoonPay order)",
  "wallet.buy_sell.deposit_address_label": "USDT (BSC) deposit address"
}
```

---

## 6. File Plan

### 6.1 NEW: `src/lib/services/off-ramp-orchestrator.service.ts`

**Lines**: ~400 (estimated)  
**Risk**: LOW — new file, no existing code affected  
**Dependencies**: `fiat-ramp.service.ts`, `lifi.service.ts`, `swap-chain/tx-helpers.ts`, `swap-chain/utils.ts`, `swap-chain/abi.ts`, `tryCatch`, `debug`, `Sentry`

**Contents**:
- Type definitions (OffRampAsset, OffRampQuote, OffRampFlowState, OffRampStage)
- Constants (STORAGE_KEY, LIFI_POLL_INTERVAL_MS, LIFI_POLL_MAX_ATTEMPTS, USDT_BSC_DECIMALS)
- `OffRampOrchestrator` class:
  - `constructor()` — restores from localStorage
  - `async createQuote(params: CreateOffRampQuoteParams): Promise<OffRampQuote>` — calls `lifiService.getQuote()` with source asset → USDT-BSC, computes combined fees
  - `async openMoonPay(params): Promise<{ redirectUrl: string }>` — calls `changellyFiatService.createOffRampOrder()` with cryptoCurrency='USDT', cryptoAmount=bridgeOutputAmount, fiatCurrency='USD', providerCode='moonpay'
  - `setDepositAddress(address: string): void` — validates BSC address, stores in flow state
  - `async executeBridge(): Promise<void>` — calls `lifiService.getStepTransaction()`, handles ERC-20 approval if needed, calls `sendEvmTransaction()`
  - `startBridgeMonitoring(): void` — polls `lifiService.getStatus()` every 10s
  - `startOver(): void` — cancels current flow, returns to quote_ready (user must re-open MoonPay)
  - `cancel(): void` — clears flow, stops all polling
  - `onStageChange(callback): () => void` — subscribe to stage changes
  - `getActiveFlow(): OffRampFlowState | null`
  - `destroy(): void` — cleanup
  - Private: `persistFlow()`, `restoreFlow()`, `updateStage()`, `notifyListeners()`, `startLifiPolling()`, `stopLifiPolling()`
  - `trackCheckoutReturn()` — visibilitychange listener for MoonPay tab return

**Key implementation details**:
- `createQuote()` maps asset → LI.FI params:
  - `rbtc` → fromChain=30 (RSK), fromToken=NATIVE, fromAmount in wei (18 decimals)
  - `usdt0-arb` → fromChain=42161 (Arbitrum), fromToken=0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9, fromAmount in 6 decimals
  - `wbtc-arb` → fromChain=42161, fromToken=0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f, fromAmount in 8 decimals
  - `btc-onchain` → fromChain=42161 (treated same as wbtc-arb for LI.FI — BTC on-chain cannot be bridged via LI.FI; must swap through wBTC first. **Caveat**: btc-onchain sell is NOT supported by bridge-and-send — LI.FI has no Bitcoin mainnet support. This asset must remain excluded or use a different bridge.)
  - toChain=56 (BSC), toToken=0x55d398326f99059fF775485246999027B3197955 (USDT-BSC)
- `executeBridge()` mirrors `executeLifiHop()` logic but simplified:
  - Get step tx from LI.FI
  - If fromToken != NATIVE_TOKEN → approve ERC-20 for LI.FI router
  - Send swap tx via `sendEvmTransaction()`
  - Store tx hash, start polling
- `startBridgeMonitoring()` polls `lifiService.getStatus(txHash)`:
  - `DONE` → stage='complete'
  - `FAILED` → stage='failed'
  - `PENDING` → keep polling
  - Max 60 attempts (10 min at 10s intervals)
- localStorage key: `bittasker_off_ramp_flow` (separate from buy flow's `bittasker_fiat_flow`)

### 6.2 MODIFY: `src/lib/components/wallet/BuySellForm.svelte`

**Lines**: ~1518 currently → ~1700 estimated (net +180)  
**Risk**: MEDIUM — large component, multiple UI states affected  
**Scope of changes**:

#### Script block changes (~+120 lines):

1. **Import OffRampOrchestrator** and types
   ```typescript
   import { OffRampOrchestrator } from '$lib/services/off-ramp-orchestrator.service';
   import type { OffRampQuote, OffRampFlowState, OffRampAsset } from '$lib/services/off-ramp-orchestrator.service';
   ```

2. **New state variables** (~+15 lines):
   ```typescript
   const offRampOrchestrator = new OffRampOrchestrator();
   let offRampFlow = $state<OffRampFlowState | null>(offRampOrchestrator.getActiveFlow());
   let offRampQuote = $state<OffRampQuote | null>(null);
   let depositAddress = $state('');
   let depositAddressError = $state('');
   let isBridgeAndSend = $state(false); // Whether current sell tab uses bridge-and-send
   ```

3. **Subscribe to off-ramp orchestrator** (~+8 lines):
   ```typescript
   $effect(() => {
     const unsub = offRampOrchestrator.onStageChange((state) => {
       offRampFlow = { ...state };
     });
     return unsub;
   });
   ```

4. **Derive isBridgeAndSend** (~+5 lines):
   ```typescript
   // Bridge-and-send is needed when Changelly doesn't support the asset for off-ramp
   let needsBridgeAndSend = $derived(
     activeTab === 'sell' && (selectedCrypto === 'rbtc' || selectedCrypto === 'usdt0-arb' || selectedCrypto === 'wbtc-arb')
   );
   ```
   Note: `btc-onchain` is excluded because LI.FI doesn't support Bitcoin mainnet. BTC→fiat works via existing Changelly path.

5. **fetchOffers modification** (~+20 lines): When `needsBridgeAndSend` is true, skip `getSellOffers()` call. Instead, call `offRampOrchestrator.createQuote()` to get the combined quote. Store result in `offRampQuote`.

6. **handleSubmit modification** (~+40 lines): When `needsBridgeAndSend` is true:
   - If stage is `quote_ready` → call `offRampOrchestrator.openMoonPay()` → open redirect → track return → transition to `opening_moonpay`
   - If stage is `awaiting_deposit_address` → validate pasted address → call `offRampOrchestrator.setDepositAddress()` → call `offRampOrchestrator.executeBridge()`
   
7. **handleClose modification** (~+3 lines): Also destroy offRampOrchestrator, reset offRampFlow/offRampQuote/depositAddress

8. **switchTab modification** (~+5 lines): Reset offRamp state when switching tabs

#### Template block changes (~+60 lines):

1. **Replace sell tab amount/offer UI** when `needsBridgeAndSend`:
   - Instead of the Changelly offer accordion, show:
     - Combined quote card: "$50 in → ~$49 out, ~$1 fee, ~2 min"
     - Fee breakdown: Bridge fee + MoonPay fee
     - Sell button (same position as current)
   
2. **New UI state: `opening_moonpay`** — inline status row (same pattern as buy flow):
   - Spinner + "Opening MoonPay..." + "Start Over" button
   
3. **New UI state: `awaiting_deposit_address`** — paste address form:
   - Label: "Paste your USDT (BSC) deposit address from MoonPay"
   - Input field with BSC address validation
   - "Continue" button (submits bridge)
   - "Start Over" button
   
4. **New UI state: `bridging`** — inline status row:
   - Spinner + "Bridging {asset} → USDT..." + progress text
   
5. **New UI state: `complete`** — success inline status:
   - Checkmark + "Bridge complete! MoonPay is processing your payout."
   
6. **New UI state: `failed`** — error inline status:
   - Error icon + error message + "Start Over" button

**What stays unchanged**:
- Tab bar, country/state selectors, SwapPartySelector, percent slider (still used for sats input)
- Buy tab logic is completely untouched
- The existing sell flow for BTC-onchain (Changelly direct off-ramp) is untouched

### 6.3 MODIFY: `static/locales/en/dashboard/wallet.json` and `es/dashboard/wallet.json`

**Lines**: ~+18 keys per locale file  
**Risk**: LOW — additive only  
**Scope**: Add keys listed in section 5.2 under `wallet.buy_sell.*`

### 6.4 NO CHANGES NEEDED

- `fiat-ramp.service.ts` — `createOffRampOrder()` already works for USDT-BSC→USD via MoonPay
- `lifi.service.ts` — `getQuote()`, `getStepTransaction()`, `getStatus()` already work
- `swap-chain/executors.ts` — not imported by orchestrator (uses tx-helpers directly)
- `swap-chain/utils.ts` — constants imported but not modified
- `swap-chain/tx-helpers.ts` — `sendEvmTransaction()` imported but not modified
- `route-resolver.ts` — not involved in the sell flow

---

## 7. Blast Radius Analysis

| File | Action | Risk | Affected Symbols | Reason |
|------|--------|------|-----------------|--------|
| `off-ramp-orchestrator.service.ts` | CREATE | LOW | 0 (new) | New file, no existing code affected |
| `BuySellForm.svelte` | MODIFY | MEDIUM | `fetchOffers()`, `handleSubmit()`, `handleClose()`, `switchTab()`, template | 1518-line component; changes gated behind `needsBridgeAndSend` flag; buy tab untouched; existing BTC-onchain sell path untouched |
| `wallet.json` (en) | MODIFY | LOW | 0 | Additive i18n keys only |
| `wallet.json` (es) | MODIFY | LOW | 0 | Additive i18n keys only |

**Risk assessment**: MEDIUM overall. The BuySellForm is the only risky file because it's large and has complex state. However, all changes are gated behind the `needsBridgeAndSend` derived flag — the buy tab and BTC-onchain sell tab are completely untouched.

**Mitigations**:
- All off-ramp orchestrator state is in separate variables (`offRampFlow`, `offRampQuote`, `depositAddress`) — no mutation of existing state
- The `needsBridgeAndSend` flag controls which UI path is rendered — clean branching
- The orchestrator pattern is proven by the buy flow's `FiatSwapOrchestrator`

---

## 8. Function Signatures

### OffRampOrchestrator public API

```typescript
class OffRampOrchestrator {
  constructor();

  /**
   * Get a combined quote (LI.FI bridge + MoonPay fee estimate).
   * Stage transitions: idle → quote_loading → quote_ready
   */
  async createQuote(params: {
    asset: OffRampAsset;
    amount: string;
    sourceWalletId: string;
    sourceAddress: string;
    country: string;
  }): Promise<OffRampQuote>;

  /**
   * Create a MoonPay off-ramp order and return the redirect URL.
   * Stage transitions: quote_ready → opening_moonpay
   */
  async openMoonPay(): Promise<{ redirectUrl: string }>;

  /**
   * Set the deposit address pasted by the user.
   * Validates BSC address format.
   * Stage transitions: opening_moonpay → awaiting_deposit_address
   * (also called directly when user returns from MoonPay and pastes address)
   */
  setDepositAddress(address: string): void;

  /**
   * Execute the LI.FI bridge from user's asset to USDT-BSC at depositAddress.
   * Stage transitions: awaiting_deposit_address → bridging
   */
  async executeBridge(): Promise<void>;

  /**
   * Start monitoring the LI.FI bridge transaction.
   * Stage transitions: bridging → complete | failed
   */
  startBridgeMonitoring(): void;

  /**
   * Start over: cancel current flow, go back to awaiting_deposit_address.
   * Creates a new MoonPay order with a fresh redirect URL.
   * Stage transitions: any → opening_moonpay
   */
  async startOver(): Promise<void>;

  /**
   * Cancel the entire flow. Clears persisted state.
   * Stage transitions: any → idle
   */
  cancel(): void;

  /**
   * Subscribe to stage changes. Returns unsubscribe function.
   */
  onStageChange(callback: (state: OffRampFlowState) => void): () => void;

  /**
   * Get the current flow state (may be null if idle).
   */
  getActiveFlow(): OffRampFlowState | null;

  /**
   * Track when user returns from MoonPay checkout (visibilitychange).
   * Transitions stage to awaiting_deposit_address when user returns.
   */
  trackCheckoutReturn(): void;

  /**
   * Cleanup — call on component destroy.
   */
  destroy(): void;
}
```

### Pure helper functions (in orchestrator file)

```typescript
/**
 * Map an OffRampAsset to LI.FI bridge parameters.
 * Returns { fromChain, fromToken, fromDecimals } for the source asset.
 */
function lifiParamsForAsset(asset: OffRampAsset): {
  fromChain: number;
  fromToken: string;
  fromDecimals: number;
};

/**
 * Convert an amount string to LI.FI's smallest-unit format.
 * E.g., "50" USDT0 (6 decimals) → "50000000"
 * E.g., "50000" sats rBTC (18 decimals for LI.FI) → "500000000000000"
 */
function toAmountWei(amount: string, asset: OffRampAsset): string;

/**
 * Validate a BSC address (0x + 40 hex chars, EIP-55 checksum).
 * Returns null if valid, error message if invalid.
 */
function validateBscAddress(address: string): string | null;

/**
 * Estimate MoonPay fiat received from USDT-BSC amount.
 * MoonPay charges 1.65% spread on USDT.
 * Returns estimated USD received.
 */
function estimateMoonPayFiat(usdtAmountUsd: number): number;
```

---

## 9. Implementation Order

### Phase 1: Orchestrator (no UI changes)
1. Create `src/lib/services/off-ramp-orchestrator.service.ts`
   - Define types (OffRampAsset, OffRampQuote, OffRampFlowState, OffRampStage)
   - Implement `createQuote()` with LI.FI integration
   - Implement `openMoonPay()` with changellyFiatService integration
   - Implement `setDepositAddress()` with BSC validation
   - Implement `executeBridge()` with sendEvmTransaction
   - Implement `startBridgeMonitoring()` with LI.FI status polling
   - Implement localStorage persistence (same pattern as FiatSwapOrchestrator)
   - Implement visibilitychange tracking
   - Implement `startOver()`, `cancel()`, `destroy()`

### Phase 2: i18n keys
2. Add new keys to `static/locales/en/dashboard/wallet.json`
3. Add new keys to `static/locales/es/dashboard/wallet.json`

### Phase 3: UI integration
4. Modify `BuySellForm.svelte` script block:
   - Import orchestrator
   - Add state variables
   - Derive `needsBridgeAndSend`
   - Modify `fetchOffers()` for bridge-and-send path
   - Modify `handleSubmit()` for bridge-and-send flow
   - Modify `handleClose()` and `switchTab()`

5. Modify `BuySellForm.svelte` template block:
   - Add bridge-and-send quote display (quote_ready state)
   - Add deposit address input (awaiting_deposit_address state)
   - Add bridge progress display (bridging state)
   - Add completion/failed display
   - Add opening_moonpay inline status

### Phase 4: Verification
6. Run `npm run check` — zero new type errors
7. Run `npm run lint` — zero warnings
8. Run `npm run test:unit:components` — existing tests pass
9. Manual Playwright test: sell tab with USDT0-Arb → bridge-and-send flow

---

## 10. Architecture Questions — Answered

### Q1: Separate class or extend existing?
**A**: Separate class. See decision 3.1.

### Q2: Reuse executeLifiHop() or call LI.FI service directly?
**A**: Call LI.FI service directly. See decision 3.2.

### Q3: How to get combined quote?
**A**: `lifiService.getQuote()` for bridge cost + hardcoded MoonPay 1.65% estimate. See decision 3.3.

### Q4: What if LI.FI bridge succeeds but MoonPay doesn't detect deposit?
**A**: This is unlikely because MoonPay monitors BSC for USDT deposits automatically. However, as a safety net:
- The orchestrator persists the LI.FI tx hash
- User can check MoonPay order status via the Changelly `getTransactionStatus()` API
- If MoonPay doesn't detect within 30 min, stage transitions to `failed` with actionable message: "Bridge completed but MoonPay hasn't detected the deposit. Contact MoonPay support with order ID: {orderId}"
- The tx hash is stored so support can trace the funds

### Q5: How to validate the pasted deposit address?
**A**: `ethers.getAddress()` validates format + EIP-55 checksum. Returns checksummed address on success, throws on invalid. See decision 3.5.

---

## 11. Self-Scoring

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture correctness | 95% | State machine is clean, separation of concerns clear, reuses existing services. Lost 5% because btc-onchain edge case needs more thought (LI.FI doesn't support Bitcoin mainnet). |
| Reuse effectiveness | 98% | Uses existing `changellyFiatService.createOffRampOrder()`, `lifiService.getQuote/getStepTransaction/getStatus()`, `sendEvmTransaction()`, `encodeERC20Approve()`, chain constants. Only new code is the orchestrator glue + UI states. |
| Risk assessment accuracy | 95% | BuySellForm MEDIUM risk is accurate (large file, complex state). Orchestrator LOW risk is accurate (new file). Lost 5% because I haven't verified LI.FI actually has liquidity for rBTC→USDT-BSC (RSK chain support in LI.FI needs validation). |

**Overall confidence**: 96%

**Open risk**: LI.FI may not support RSK (chain 30) as a source chain for USDT-BSC bridging. If LI.FI doesn't support rBTC, the rBTC off-ramp path would need an intermediate hop (rBTC → USDT0-Arb via Symbiosis, then USDT0-Arb → USDT-BSC via LI.FI). This should be validated with a live LI.FI API call during Phase 1 implementation.
