# Testing Reverse Swaps in Regtest

## Quick Test Guide

### Prerequisites
1. Regtest environment running (localhost:9001)
2. BitTasker connected to regtest backend
3. RSK wallet connected in BitTasker
4. User's private key (nsec) available

### Test Steps

#### 1. Create Reverse Swap
```typescript
import { reverseSwapService } from '$lib/integrations/boltz/reverseSwapService';

// Make sure wallet getter is set first
reverseSwapService.setWalletGetter(() => {
    // Return your connected RSK wallet signer
    return walletSigner;
});

// Create swap
const result = await reverseSwapService.createReverseSwap({
    amountSats: 100000,
    rbtcAddress: '<your-rbtc-address>',
    description: 'Test swap',
    nsec: '<your-nsec>'
});

console.log('Invoice:', result.invoice);
console.log('Swap ID:', result.swapId);
```

#### 2. Pay Invoice from LND-1
```bash
# In your regtest environment
lncli-1 payinvoice <invoice-from-step-1>
```

#### 3. Monitor Console Output

You should see this sequence in BitTasker console:

```
✅ Swap created: <swap-id>
📡 WebSocket: Subscribed to swap updates

⚡ Invoice paid and held, waiting for RBTC claim...
   Status: invoice.set

🔒 Lockup transaction in mempool, attempting to claim rBTC...
   Status: transaction.mempool

🔐 Claiming rBTC with params:
   preimage: 0x<preimage-hex>
   amount: <amount-wei>
   refundAddress: <refund-address>
   timeoutBlockHeight: <timeout>

📤 Claim transaction sent: <tx-hash>

✅ Claim transaction confirmed: <receipt-hash>

✅ Swap successful - Invoice settled by Boltz: <swap-id>
   Status: invoice.settled
```

#### 4. Verify Settlement

Check LND-1:
```bash
lncli-1 listpayments
```

Should show payment as **SUCCEEDED** (not PENDING)

Check Boltz status:
```bash
curl http://localhost:9001/v2/swap/<swap-id>/status
```

Should return:
```json
{
  "status": "invoice.settled"
}
```

## Expected Timeline

| Event | Time | Status | Action |
|-------|------|--------|--------|
| Swap created | T+0s | `swap.created` | Display invoice to user |
| Invoice paid | T+1s | `invoice.set` | Payment held in HTLCs |
| RBTC locked | T+2s | `transaction.mempool` | **Auto-claim triggered** |
| Claim tx sent | T+3s | `transaction.claim.pending` | Waiting for confirmation |
| Claim confirmed | T+10s | - | Preimage revealed on-chain |
| Invoice settled | T+11s | `invoice.settled` | ✅ Complete! |

## Troubleshooting

### Invoice Stays "Pending"
**Symptom:** Payment sent but shows as pending in both LND nodes

**Cause:** BitTasker didn't claim the RBTC, so preimage was never revealed

**Check:**
1. Is `walletGetter` set? 
   ```typescript
   reverseSwapService.setWalletGetter(() => yourWallet);
   ```

2. Is RSK wallet connected?
   ```typescript
   console.log('Wallet signer:', walletSigner);
   ```

3. Are you receiving WebSocket events?
   ```typescript
   // Check console for WebSocket messages
   ```

### Claim Transaction Fails
**Symptom:** Error when calling `claim()` on EtherSwap contract

**Common Issues:**
1. **Wrong amount conversion**
   - Must convert sats to wei: `sats * 10^10`

2. **Missing swap parameters**
   - Need: preimage, amount, refundAddress, timeoutBlockHeight

3. **Wrong contract address**
   - Verify EtherSwap address from API

4. **Insufficient gas**
   - RSK wallet needs RBTC for gas

### WebSocket Not Connecting
**Symptom:** No status updates after creating swap

**Check:**
```typescript
// In browser console
import { boltzWebSocket } from '$lib/integrations/boltz/websocket';
console.log('WebSocket state:', boltzWebSocket);
```

**Fix:** Ensure WebSocket connects to correct endpoint
```typescript
// Should be: ws://localhost:9001/v2/ws for regtest
```

## Manual Claim (If Auto-Claim Fails)

If automatic claiming fails, you can manually claim:

```typescript
const swap = reverseSwapService.getSwap('<swap-id>');
const wallet = getYourRSKWallet();

await reverseSwapService.claimRBTC(
    swap,
    '<your-nsec>',
    wallet
);
```

## Testing Edge Cases

### 1. Test Without Wallet Connected
```typescript
// Don't set walletGetter
const result = await reverseSwapService.createReverseSwap({...});

// Pay invoice
// Should log: "❌ Wallet not available for claiming. User must claim manually."
// Status should stay at transaction.mempool
```

### 2. Test Manual Recovery
```typescript
// After app restart
await reverseSwapService.recoverPendingSwaps('<nsec>');

// Should re-subscribe to any pending swaps
// Should resume auto-claiming if swap still pending
```

### 3. Test Expiration
```typescript
// Create swap but don't pay invoice
// Wait for expiration (usually 24 hours, but faster in regtest)
// Should receive status: invoice.expired
```

## Success Criteria

✅ Invoice created successfully
✅ Payment accepted and held (invoice.set)
✅ RBTC locked on-chain (transaction.mempool)
✅ Claim transaction sent automatically
✅ Claim transaction confirmed
✅ Invoice settled by Boltz (invoice.settled)
✅ User receives RBTC in wallet

## Next Steps After Testing

Once basic flow works:
1. Test with different amounts
2. Test error scenarios (insufficient balance, etc.)
3. Test recovery from pending swaps
4. Add UI progress indicators for each state
5. Add manual claim button as fallback
6. Test on mainnet with small amounts

## Key Metrics to Monitor

- **Time to claim**: Should be < 5 seconds after lockup
- **Gas used**: Track for cost optimization
- **Success rate**: Should be close to 100% when wallet connected
- **Recovery rate**: Pending swaps should resume after restart


