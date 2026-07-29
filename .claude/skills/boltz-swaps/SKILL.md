---
name: boltz-swaps
description: 'Use when working with boltz.exchange swap integration — submarine swaps, reverse swaps, chain swaps, API calls, WebSocket monitoring, bolt11 invoice handling, fee calculation, or swap error recovery. This skill covers boltz-specific API details NOT in the bittasker-wallet skill.'
---

# Boltz.exchange Atomic Swaps — BitTasker

Boltz.exchange provides non-custodial atomic swaps between Bitcoin on-chain and Lightning Network. This skill covers the boltz-specific API, lifecycle, and implementation details. For general Bitcoin/Lightning safety rules (amount display, key security, invoice validation), see the `bittasker-wallet` skill.

## Swap Types

### Submarine Swap (BTC On-Chain → Lightning)

User sends BTC to a boltz lockup address and receives a Lightning payment.

- **Direction:** RBTC on-chain → Lightning invoice paid to user
- **User action:** Send BTC to boltz-generated lockup address
- **Key detail:** On RSK (Rootstock), the swap uses RBTC, not mainnet BTC

### Reverse Submarine Swap (Lightning → BTC On-Chain)

User pays a Lightning invoice and receives BTC on-chain.

- **Direction:** User pays Lightning invoice → receives RBTC on-chain
- **User action:** Pay the Lightning invoice boltz provides
- **Key detail:** Boltz generates the invoice; user must pay it before timeout

### Chain Swap (L-BTC → RBTC)

Cross-chain swap between Liquid Bitcoin (L-BTC) and Rootstock RBTC.

- **Direction:** L-BTC locked on Liquid → RBTC received on Rootstock
- **User action:** Send L-BTC to boltz lockup address on Liquid
- **Key detail:** Two-hop process — server locks RBTC after confirming user L-BTC lockup

## Swap Lifecycle Status Machine

The boltz API uses granular status strings. These are defined in `src/lib/utils/wallet/swapTransaction.ts`:

### Pending (Non-Final) Statuses

| Status | Meaning |
|--------|---------|
| `swap.created` | Swap initiated, invoice/address generated |
| `invoice.set` | Lightning invoice has been set (reverse/chain swaps) |
| `transaction.mempool` | User's transaction seen in mempool |
| `transaction.confirmed` | User's transaction has enough confirmations |
| `transaction.claim.pending` | Boltz is claiming or sending the other side |
| `invoice.pending` | Lightning invoice is being paid |
| `minerfee.paid` | Miner fee refund paid (chain swaps) |
| `transaction.server.mempool` | Server lockup transaction in mempool (chain swaps) |
| `transaction.server.confirmed` | Server lockup confirmed (chain swaps) |

### Completed (Final, Success)

| Status | Meaning |
|--------|---------|
| `transaction.claimed` | Boltz claimed the on-chain funds |
| `invoice.settled` | Lightning invoice settled |
| `invoice.paid` | Lightning invoice paid |

### Failed (Final, Error)

| Status | Meaning | Recovery |
|--------|---------|----------|
| `swap.expired` | Swap timed out before completion | Retry swap; if user locked funds and swap expired, boltz auto-refunds or user must claim refund |
| `invoice.failedToPay` | Lightning invoice payment failed | Retry payment or cancel swap |
| `invoice.expired` | Lightning invoice expired before payment | Create new swap with fresh invoice |
| `transaction.failed` | On-chain transaction failed | Check mempool; retry with higher fee |
| `transaction.refunded` | Funds returned to user | Verify refund TX; create new swap if needed |
| `transaction.lockupFailed` | Lockup transaction failed (transitions to `swap.expired`) | Retry swap |

**Rule:** NEVER display an error without a recovery action. Every failed status above must map to a user-facing action.

### Final Status Detection

Use the exports from `src/lib/utils/wallet/swapTransaction.ts`:
- `PENDING_STATUSES` — swap still in progress
- `COMPLETED_STATUSES` — swap successful
- `FAILED_STATUSES` — swap failed (includes both final and transitional)
- `FINAL_STATUSES` — status that will absolutely not change further

**Safety check for deletion:** `isExpiredSwapSafeToDelete()` determines if an expired swap can be safely removed from history (only if the user never locked funds).

## API Integration (REST)

Boltz exposes a REST API. Base URL depends on network:

| Network | Base URL |
|---------|----------|
| Mainnet | `https://boltz.exchange/api` |
| Testnet | `https://testnet.boltz.exchange/api` |

### Endpoints

#### POST `/v2/swap/submarine` — Create Submarine Swap

Creates a submarine swap (BTC on-chain → Lightning). Returns a lockup address and expected amount.

**Request body:**
```json
{
  "from": "BTC",
  "to": "BTC",
  "invoice": "<bolt11-invoice>",
  "refundPublicKey": "<user-refund-pubkey>"
}
```

**Response:** Swap object with `id`, `address`, `expectedAmount`, `timeoutBlockHeight`.

#### POST `/v2/swap/reverse` — Create Reverse Swap

Creates a reverse submarine swap (Lightning → BTC on-chain). Returns a Lightning invoice for the user to pay.

**Request body:**
```json
{
  "from": "BTC",
  "to": "BTC",
  "invoiceAmount": 100000,
  "claimPublicKey": "<user-claim-pubkey>"
}
```

**Response:** Swap object with `id`, `invoice` (bolt11 string), `lockupAddress`.

#### POST `/v2/swap/chain` — Create Chain Swap

Creates a chain swap (L-BTC → RBTC). Returns lockup details for the Liquid side.

**Request body:**
```json
{
  "from": "L-BTC",
  "to": "RBTC",
  "userLockAmount": 100000,
  "claimPublicKey": "<user-claim-pubkey>",
  "refundPublicKey": "<user-refund-pubkey>"
}
```

**Response:** Swap object with `id`, `lockupAddress`, `lockupAmount`.

#### GET `/v2/swap/:id` — Check Swap Status

Returns the current status and transaction details for a swap.

**Response fields:** `status`, `transaction` (lockup TX info), `reverseTransaction` (claim TX info).

#### GET `/v2/swap/:id/refund` — Get Refund Transaction

For submarine swaps where boltz failed to pay the invoice. Returns a signed refund transaction.

### Rate Limiting

Boltz API enforces rate limits. Implement exponential backoff on 429 responses:

```typescript
import { tryCatch } from '$lib/utils/tryCatch';

async function boltzFetch(url: string, retries = 3, delay = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url);
    if (response.status !== 429) return response;
    await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
  }
  throw new Error('Boltz rate limit exceeded after retries');
}
```

## WebSocket Monitoring

### Preferred Over Polling

WebSocket provides real-time swap status updates without rate limiting. Subscribe to swap status via boltz WebSocket:

**Endpoint:** `wss://boltz.exchange/v2/ws` (testnet: `wss://testnet.boltz.exchange/v2/ws`)

**Subscription message:**
```json
{
  "op": "subscribe",
  "channel": "swap.update",
  "id": "<swap-id>"
}
```

**Status update message:**
```json
{
  "event": "update",
  "channel": "swap.update",
  "args": [{ "status": "transaction.confirmed", "id": "<swap-id>" }]
}
```

### Implementation

Swap monitoring is handled in project services. Key patterns:

```typescript
// Reconnection with exponential backoff
let reconnectAttempt = 0;
const maxReconnectDelay = 30000;

function connect() {
  const ws = new WebSocket(WS_URL);
  ws.onclose = () => {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempt++), maxReconnectDelay);
    setTimeout(connect, delay);
  };
  ws.onmessage = (event) => {
    reconnectAttempt = 0; // Reset on successful message
    const update = JSON.parse(event.data);
    if (update.event === 'update') {
      updateSwapStore(update.args[0]);
    }
  };
}
```

**Rules:**
- Reconnect with exponential backoff (1s, 2s, 4s, ... capping at 30s)
- Reset backoff counter on successful message receipt
- Parse status updates and write to swap store immediately
- Never use polling when WebSocket is available — polling hits rate limits

## Invoice Handling (Bolt11)

### Validation Before Submission

Before submitting any invoice to boltz:

1. **Check amount:** Verify the invoice amount matches what the user expects. Never send an invoice without displaying the amount to the user.
2. **Check expiry:** Parse the invoice timestamp + expiry. Warn if expiry is less than 10 minutes.
3. **Check network:** Ensure the invoice is for the correct network (mainnet/testnet matching boltz endpoint).
4. **Check signature:** Validate the bolt11 signature is well-formed.

### Parsing

Use `lightning-invoice` or the project's `@bittasker/wallet-core` to decode bolt11 invoices:

```typescript
import type { SubmarineSwapData } from '@bittasker/wallet-core';

function displayInvoiceInfo(swap: SubmarineSwapData) {
  // invoiceAmount is already parsed by wallet-core
  const amount = swap.invoiceAmount ?? 0;
  const memo = swap.invoiceMemo ?? 'No memo';
  const expiryMs = swap.invoiceExpiry ?? 3600000;

  return {
    amountSats: amount,
    displayAmount: `${(amount / 100_000_000).toFixed(8)} BTC`,
    memo,
    expiresIn: formatDuration(expiryMs)
  };
}
```

### Display to User

Always show before user confirms:
- Invoice amount (BTC + fiat equivalent)
- Expiry time (absolute or countdown)
- Memo/description from invoice

## Fee Calculation

Boltz charges a service fee on top of network fees. Always calculate and display ALL fees before user confirms:

| Fee Type | Description | Who Pays |
|----------|-------------|----------|
| **Miner fee** | On-chain transaction fee for lockup TX | User |
| **Boltz service fee** | Boltz platform fee (typically 0.5%) | Included in swap rate |
| **Routing fee** | Lightning Network routing fee | Deducted from received amount |
| **Claim fee** | On-chain fee for claiming received BTC | User (for reverse swaps) |

**Display rule:** Show fees separately, never hide them in the total. Users must know:
- What they're sending (exact amount)
- What they're receiving (after all fees)
- Fee breakdown (miner + service + routing)

```typescript
interface SwapFeeDisplay {
  sendAmount: string;        // What user sends
  receiveAmount: string;     // What user receives (net of fees)
  minerFee: string;          // On-chain miner fee
  serviceFee: string;        // Boltz service fee
  routingFee: string;        // Lightning routing fee (if applicable)
  totalFees: string;         // Sum of all fees
  exchangeRate: string;      // Effective rate after fees
}
```

## Error States and Recovery

**Every error MUST include a recovery action.** Use the mapping from `src/lib/utils/wallet/swapTransaction.ts`:

| Error State | Meaning | Recovery Action |
|-------------|---------|-----------------|
| `swap.expired` (no lockup) | Swap timed out, user never sent funds | Create new swap |
| `swap.expired` (locked funds) | Swap timed out after user sent funds | Claim refund via boltz API; guide user |
| `invoice.failedToPay` | Lightning payment failed | Retry payment or create new swap |
| `invoice.expired` | Invoice expired before payment | Create new swap with fresh invoice |
| `transaction.failed` | On-chain TX rejected by mempool | Check fee rate; retry with higher fee |
| `transaction.refunded` | Boltz returned funds | Verify refund TX on explorer; create new swap |
| `transaction.lockupFailed` | Lockup TX failed | Create new swap; previous attempt is void |

**UI pattern for error display:**

```svelte
{#if swap.status === 'swap.expired' && !swap.lockupTxHash}
  <div class="alert alert-warning">
    <span>{$t('swap.error.expired_no_lockup')}</span>
    <button class="btn btn-sm btn-primary" onclick={createNewSwap}>
      {$t('swap.action.retry')}
    </button>
  </div>
{/if}
```

## Bitcoin Transaction Confirmation

For submarine swaps and reverse swap claims, monitor on-chain confirmations:

- **Source:** Boltz API status (`transaction.confirmed`) or mempool.space API
- **Confirmation thresholds:** Boltz typically requires 1 confirmation for small amounts, more for larger amounts
- **Display:** Show confirmation progress bar (e.g., "2/3 confirmations")
- **Reorg risk:** For 1-confirmation transactions, warn that a reorg could invalidate the swap. This is rare but possible.

```typescript
interface ConfirmationState {
  current: number;
  required: number;
  txHash: string;
  explorerUrl: string;
}
```

## Security

- **Verify before confirm:** Always display the swap amount, address, and fees on a confirmation screen. Require explicit user action — never auto-confirm swaps.
- **Never hardcode amounts:** Always fetch the current exchange rate from boltz. Rates change frequently; cached rates lead to incorrect user expectations.
- **Rate limiting:** Implement exponential backoff on 429 responses (see API section above).
- **No secrets in logs:** Never log or expose private keys, mnemonics, refund private keys, or claim private keys. These are handled by `@bittasker/wallet-core` and should never appear in console output, error messages, or Sentry breadcrumbs.
- **Refund key safety:** The refund public key sent to boltz must match a private key the user controls. If this key is lost, refunds become impossible.

## Memory Persistence

Active swaps are stored in the swap store for app-kill resilience:

- **Store:** `src/lib/stores/swap.store.ts` manages current swap state
- **Chain orchestration:** `src/lib/services/swap-chain.service.ts` persists multi-hop chains to Capacitor Preferences
- **Recovery:** On app restart, reload swap state from storage. If a swap was in progress during kill, re-subscribe to WebSocket updates for that swap ID
- **Cleanup:** Remove completed and safely-deletable expired swaps (use `isExpiredSwapSafeToDelete()` from `swapTransaction.ts`)

## Key Source Files

| File | Purpose |
|------|---------|
| `src/lib/utils/wallet/swapTransaction.ts` | Status constants, swap-to-transaction mapping, action resolution, safe-deletion logic |
| `src/lib/stores/swap.store.ts` | Current swap state, history, lifecycle tracking |
| `src/lib/services/swap-chain.service.ts` | Multi-hop swap orchestrator with state machine and persistence |
| `src/lib/utils/wallet/balanceManager.ts` | Balance management (incorporates swap amounts) |
| `src/lib/utils/wallet/blockscoutTransactionStatus.ts` | On-chain transaction confirmation via Blockscout |
| Static swap types | `@bittasker/wallet-core` — `BoltzSwapData`, `SubmarineSwapData`, `ChainSwapData` |

## Quick Reference

```
┌────────────────────────────────────────────────────────────────┐
│ SWAP TYPES                                                      │
│ Submarine:   BTC on-chain → Lightning (user sends, receives LN) │
│ Reverse:     Lightning → BTC on-chain (user pays LN, gets BTC)  │
│ Chain:       L-BTC → RBTC (cross-chain, two-hop)               │
├────────────────────────────────────────────────────────────────┤
│ API ENDPOINTS                                                   │
│ POST /v2/swap/submarine    Create submarine swap               │
│ POST /v2/swap/reverse      Create reverse swap                 │
│ POST /v2/swap/chain        Create chain swap                   │
│ GET  /v2/swap/:id          Check swap status                   │
│ GET  /v2/swap/:id/refund   Get refund transaction              │
│ WSS  /v2/ws                WebSocket status updates            │
├────────────────────────────────────────────────────────────────┤
│ FINAL STATUSES (from swapTransaction.ts)                        │
│ SUCCESS:  transaction.claimed, invoice.settled, invoice.paid   │
│ FAILURE:  swap.expired, invoice.failedToPay, invoice.expired,  │
│           transaction.failed, transaction.refunded             │
├────────────────────────────────────────────────────────────────┤
│ FEES                                                            │
│ Miner fee + Boltz service fee (0.5%) + Lightning routing fee    │
│ DISPLAY ALL FEES SEPARATELY. Never hide in total.              │
├────────────────────────────────────────────────────────────────┤
│ SECURITY                                                        │
│ • Verify amount + address on confirmation screen                │
│ • Never hardcode amounts — fetch live rate                     │
│ • Exponential backoff on 429 rate limits                       │
│ • No private keys in logs, errors, or Sentry                   │
├────────────────────────────────────────────────────────────────┤
│ RECOVERY RULE                                                   │
│ NEVER show an error without a recovery action.                 │
│ Every failed status → actionable next step for user.           │
├────────────────────────────────────────────────────────────────┤
│ SOURCE FILES                                                    │
│ swapTransaction.ts     Status constants, mappings, actions     │
│ swap.store.ts          Current swap state + history           │
│ swap-chain.service.ts  Multi-hop orchestrator                 │
│ balanceManager.ts      Balance tracking with swaps            │
│ blockscoutTransactionStatus.ts  Confirmation monitoring      │
│ @bittasker/wallet-core Swap data types                        │
└────────────────────────────────────────────────────────────────┘
```
