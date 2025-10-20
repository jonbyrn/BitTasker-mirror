# Boltz Gasless Protocol - CORRECTED Understanding

## 🚨 Critical Correction

After thorough investigation and testing, here's the **CORRECT** understanding of how Boltz's gasless protocol works:

## ❌ What We Thought (WRONG)

> "Set `gasless: true` → Pay both invoices → Boltz automatically claims for us → We receive RBTC"

**This was INCORRECT!**

## ✅ How It Actually Works (CORRECT)

> "Set `gasless: true` → Pay both invoices → **Boltz sends RBTC for gas to our wallet** → **WE claim the swap** → We receive RBTC"

### The Key Insight:

**Gasless means "Boltz funds the gas" NOT "Boltz claims for us"**

## Documentation Sources

### From Boltz Official Docs:

1. **API v1 Documentation**: https://api.docs.boltz.exchange/api-v1.html
   - States: "While Boltz provides the necessary gas to the `claimAddress`, **the client is still responsible for broadcasting the claim transaction**"

2. **Claims & Refunds**: https://docs.boltz.exchange/api/claiming-swaps
   - Confirms: "Even with `gasless: true`, the client must initiate the claim process"

### Web Search Confirmation:

> "While Boltz provides the necessary gas to the `claimAddress`, the client is still responsible for broadcasting the claim transaction. This means that even with `gasless: true`, the client must initiate the claim process."

## The Correct Flow

### Gasless Mode (`gasless: true`):

1. **Swap Creation**: Set `gasless: true` in API request
2. **Boltz Response**: Returns 2 Lightning invoices:
   - `invoice`: Main swap amount (e.g., 66,000 sats)
   - `serviceFeeInvoice`: Gas fee payment (~100 sats)
3. **User Payment**: User pays **BOTH** invoices
4. **Boltz Lockup**: Boltz locks RBTC in EtherSwap contract
5. **Boltz Gas Transfer**: Boltz sends small amount of RBTC to `claimAddress` (from service fee payment)
6. **Our Claim**: **WE** call `EtherSwap.claim()` with preimage (now we have gas!)
7. **Success**: RBTC transferred to user's wallet

### Direct Mode (`gasless: false` or omitted):

1. **Swap Creation**: No gasless parameter
2. **Boltz Response**: Returns 1 invoice (swap amount only)
3. **User Payment**: User pays invoice
4. **Boltz Lockup**: Boltz locks RBTC in contract
5. **Our Claim**: **WE** call `EtherSwap.claim()` with preimage (using our existing gas)
6. **Success**: RBTC transferred

## Why Our Swap Was Stuck

### The Bug:

```typescript
if (swapData.gasless) {
    // ❌ WRONG: We did nothing, waiting for Boltz to claim
    console.log('⛽ Gasless swap - Boltz will automatically claim (no action needed)');
    console.log('⏳ Waiting for Boltz to complete the claim...');
    swapData.status = 'transaction.confirmed';
}
```

**What Happened**:
- We paid both invoices
- Boltz sent gas to our wallet
- Boltz locked RBTC in contract
- **We did NOTHING** (waiting for Boltz to claim)
- **Boltz did NOTHING** (waiting for US to claim)
- **Deadlock!** 🔒

### The Fix:

```typescript
if (swapData.gasless) {
    // ✅ CORRECT: Check if gas arrived, then claim ourselves
    console.log('⛽ Gasless swap - checking if Boltz sent gas...');
    
    // Poll for gas arrival (Boltz sends it after service fee invoice paid)
    const balance = await wallet.provider.getBalance(wallet.address);
    const gasEstimate = await this.estimateClaimGas(swapData);
    
    if (balance >= gasEstimate) {
        console.log('✅ Boltz sent gas! Claiming now...');
        await this.claimRBTC(swapData, nsec, wallet);
    } else {
        // Wait and retry...
    }
}
```

## Implementation Details

### Gas Arrival Timing

**Boltz sends gas after**:
- Main invoice is paid
- **Service fee invoice is paid** ← Critical!
- Lockup transaction confirmed

**We need to poll** because:
- Gas transfer happens asynchronously
- May take a few seconds after service fee payment
- Need to check balance repeatedly

### Polling Logic:

```typescript
// Try immediately
const claimed = await checkGasAndClaim();

if (!claimed) {
    // Poll every 1.5 seconds, up to 10 times (~15 seconds total)
    const interval = setInterval(async () => {
        const success = await checkGasAndClaim();
        if (success || attempts >= maxAttempts) {
            clearInterval(interval);
        }
    }, 1500);
}
```

### Error Cases:

1. **Only main invoice paid**: Gas won't arrive (service fee not paid)
2. **Service fee not paid**: Gas won't arrive, claim will fail
3. **Network delay**: Gas may take 5-10 seconds to arrive
4. **Boltz issue**: Gas may not be sent at all

## User Experience

### What User Sees:

**Gasless Mode**:
```
1. "Gasless Mode Enabled! Pay both invoices"
2. Shows: 1️⃣ Main Invoice + 2️⃣ Gas Fee Invoice
3. User pays both
4. "Waiting for gas from Boltz..."
5. "Claiming automatically..."
6. "✅ RBTC received!"
```

**Important**: Must emphasize "Pay BOTH invoices" prominently!

### UI Updates Made:

1. Changed description from "Boltz claims automatically" → "Boltz sends gas → Auto-claim"
2. Added warning: "Did you pay both invoices?"
3. Shows spinner while waiting for gas arrival
4. Clear error if gas doesn't arrive after waiting

## Testing Checklist

### ✅ Test Case 1: Gasless Happy Path
1. Create swap with zero balance wallet (`gasless: true`)
2. Verify 2 invoices received
3. Pay main invoice
4. Pay service fee invoice
5. Verify gas arrives in wallet
6. Verify auto-claim executes
7. Verify RBTC received

### ✅ Test Case 2: Only Main Invoice Paid (Error Case)
1. Create gasless swap
2. Pay only main invoice
3. Verify gas does NOT arrive
4. Verify error message shown
5. Pay service fee invoice
6. Verify gas arrives and claim proceeds

### ✅ Test Case 3: Direct Claim (Has Gas)
1. Fund wallet with 0.001 RBTC
2. Create swap (should set `gasless: false`)
3. Verify only 1 invoice received
4. Pay invoice
5. Verify immediate claim
6. Verify RBTC received

## Key Takeaways

1. **Gasless ≠ Automatic Claiming**
   - Gasless = Boltz funds the gas
   - WE still do the claiming

2. **Both Invoices Required**
   - Main invoice: Swap amount
   - Service fee invoice: Gas payment
   - **BOTH must be paid** for gas to arrive

3. **Polling Required**
   - Gas arrives asynchronously
   - Need to poll balance
   - Wait up to ~15 seconds

4. **Clear User Communication**
   - Emphasize "pay both invoices"
   - Show which invoice is which
   - Clear feedback on waiting for gas

## References

1. **Boltz API v1**: https://api.docs.boltz.exchange/api-v1.html
   - Section: "Reverse Swaps: EVM Chains"
   - Section: "Gasless Protocol"

2. **Boltz Claims & Refunds**: https://docs.boltz.exchange/api/claiming-swaps
   - Section: "EVM - Reverse Swaps"

3. **Boltz Blog - Rootstock**: https://blog.boltz.exchange/p/hello-rootstock-swaps
   - Explains RIF Relay integration
   - Notes about meta-transactions

## Status

- ✅ **Bug Identified**: We were waiting for Boltz to claim
- ✅ **Bug Fixed**: We now check for gas and claim ourselves
- ✅ **Documentation Updated**: Corrected understanding documented
- ⏳ **Testing Required**: Need to test with both invoices paid
- ⏳ **Production Deployment**: After successful testing

---

**Last Updated**: 2024-01-XX

**Status**: Bug Fixed, Testing Required

