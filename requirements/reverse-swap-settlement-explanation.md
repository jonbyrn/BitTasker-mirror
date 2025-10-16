# Understanding Invoice Settlement in Reverse Swaps

## The Problem You Encountered

When testing your Boltz reverse swap implementation, you found that:
- ✅ Invoice was created successfully
- ✅ Payment was sent from LND-1
- ✅ Payment reached Boltz
- ❌ Invoice remained in "pending" state and never settled

**Why?** Because in a reverse swap, **you control the settlement**, not Boltz!

## What is a HOLD/HODL Invoice?

A HOLD invoice (also called HODL invoice) is a special type of Lightning invoice that:
1. **Accepts the payment** from the sender
2. **Holds the funds** in HTLCs (Hash Time-Locked Contracts)
3. **Does NOT settle** until the preimage is revealed
4. Can be **cancelled** if the preimage is never revealed (sender gets refund)

This is different from a normal Lightning invoice, which settles immediately when paid.

## Reverse Swap Flow (Lightning → On-chain)

### Detailed Step-by-Step

```
┌─────────────┐           ┌───────────┐           ┌──────────────┐
│  BitTasker  │           │   Boltz   │           │  Lightning   │
│   (You)     │           │  Service  │           │   Network    │
└─────────────┘           └───────────┘           └──────────────┘
      │                         │                         │
      │ 1. Generate preimage    │                         │
      │    (32 random bytes)    │                         │
      │                         │                         │
      │ 2. Create hash          │                         │
      │    SHA256(preimage)     │                         │
      │                         │                         │
      │ 3. POST /swap/reverse   │                         │
      │    with hash + address  │                         │
      │────────────────────────>│                         │
      │                         │                         │
      │ 4. HOLD invoice back    │                         │
      │<────────────────────────│                         │
      │                         │                         │
      │ 5. Display invoice      │                         │
      │    to user              │                         │
      │                         │                         │
      │                         │   6. User pays invoice  │
      │                         │<────────────────────────│
      │                         │                         │
      │                         │   Payment HELD (not     │
      │                         │   settled) in HTLCs     │
      │                         │                         │
      │ 7. WebSocket: invoice.set                        │
      │<────────────────────────│                         │
      │                         │                         │
      │                         │ 8. Lock RBTC on-chain   │
      │                         │    in EtherSwap contract│
      │                         │    using same hash      │
      │                         │                         │
      │ 9. WebSocket: tx.mempool│                         │
      │<────────────────────────│                         │
      │                         │                         │
      │ 10. Call EtherSwap.claim()                       │
      │     with preimage       │                         │
      │─────────────────────────>│                         │
      │                         │                         │
      │                         │ 11. See preimage on-chain│
      │                         │     Extract it from tx  │
      │                         │                         │
      │                         │ 12. Settle HOLD invoice │
      │                         │     using preimage      │
      │                         │─────────────────────────>│
      │                         │                         │
      │ 13. WebSocket: invoice.settled ✅                │
      │<────────────────────────│                         │
      │                         │                         │
```

## Key Insights

### 1. You Control Settlement
- **You generate the preimage** - This is the secret that unlocks everything
- **You must claim first** - By calling the smart contract with the preimage
- **Boltz settles second** - After seeing your preimage on-chain

### 2. It's Atomic and Trustless
- If you don't claim, Boltz can refund their locked RBTC after timeout
- If Boltz doesn't lock RBTC, you don't claim, so the invoice expires
- Neither party can steal from the other

### 3. The Invoice Cannot Settle Until You Act
This is **BY DESIGN** and is what makes submarine swaps trustless:
- The payment is held in the Lightning network
- Only revealing the preimage allows Boltz to settle
- You only reveal the preimage by claiming your RBTC
- This creates a trustless atomic swap

## Your Implementation Fix

### Before (WRONG)
```typescript
case 'transaction.confirmed':
    // Waiting for confirmation before claiming
    // This means the invoice stays pending!
    await this.claimRBTC(swapData, nsec, wallet);
    break;
```

### After (CORRECT)
```typescript
case 'invoice.set':
    // Invoice paid and held - waiting for our action
    console.log('⚡ Invoice paid and held, waiting for RBTC claim...');
    break;

case 'transaction.mempool':
    // Boltz locked RBTC - we can claim immediately (0-conf)
    console.log('🔒 Lockup in mempool, claiming rBTC...');
    await this.claimRBTC(swapData, nsec, wallet);
    break;

case 'invoice.settled':
    // Success! Boltz settled after seeing our preimage
    console.log('✅ Swap complete!');
    break;
```

## Testing Your Fix

When you create a reverse swap and pay the invoice:

1. **Status: `swap.created`**
   - Invoice created, ready to pay

2. **Status: `invoice.set`** ← NEW
   - Payment received and held
   - Waiting for Boltz to lock RBTC

3. **Status: `transaction.mempool`**
   - Boltz locked RBTC
   - BitTasker claims RBTC (reveals preimage)
   - Preimage visible on-chain

4. **Status: `invoice.settled`** ✅
   - Boltz saw preimage on-chain
   - Boltz settled Lightning invoice
   - Swap complete!

## Why This Matters for Regtest

In your regtest environment:
- LND-1 pays the invoice → Payment is **HELD**
- Payment shows as "pending" in both LND-1 and LND-2
- **BitTasker must claim the RBTC** to reveal the preimage
- Only then can Boltz settle the invoice
- Then LND-2 will show the payment as settled

## Common Misconceptions

### ❌ "Boltz should settle the invoice when it receives payment"
**NO!** In a reverse swap, Boltz creates a HOLD invoice that cannot settle until the preimage is revealed.

### ❌ "The Lightning network settles the payment automatically"
**NO!** HOLD invoices require the preimage to be revealed manually. This is a feature, not a bug.

### ❌ "Something is broken because the invoice won't settle"
**NO!** It's working as designed. You must claim the on-chain funds first.

## Comparison: Submarine vs Reverse Swaps

### Submarine Swap (On-chain → Lightning)
- **Boltz generates preimage**
- **Boltz creates normal invoice**
- User pays on-chain
- Boltz claims on-chain (reveals preimage)
- **Boltz settles their own invoice** with preimage
- Invoice settles automatically

### Reverse Swap (Lightning → On-chain)
- **YOU generate preimage**
- **Boltz creates HOLD invoice**
- User pays Lightning (payment HELD)
- Boltz locks on-chain
- **YOU claim on-chain** (reveals preimage)
- Boltz sees preimage and settles invoice
- **Manual action required from you**

## Security Implications

This design ensures:
1. **Atomic swaps** - Either both sides happen, or neither
2. **No trust required** - Smart contracts enforce rules
3. **No counterparty risk** - Can't be rugged
4. **Timeout protection** - Funds can be recovered if swap fails

The fact that you must manually claim and reveal the preimage is what makes this secure and trustless!

## Summary

✅ **The invoice is NOT broken** - it's waiting for YOU to act
✅ **You must claim the RBTC** to reveal the preimage
✅ **Only then will Boltz settle** the Lightning invoice
✅ **This is by design** - it's what makes submarine swaps trustless

Your fix to listen for `transaction.mempool` and automatically claim is exactly the right approach!


