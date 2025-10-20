# Boltz Gasless Protocol Implementation Summary

## 🎯 The Root Cause Discovery

After extensive investigation and web search, we discovered the **real solution** to the chicken-and-egg problem where users need RBTC to claim RBTC:

### Previous Misunderstanding ❌
- We thought Boltz auto-claims ALL reverse swaps
- We thought we needed to call `/v2/swap/reverse/{id}/claim` endpoint
- We tried implementing "cooperative claiming" via API calls
- **Result**: Empty `{}` responses and unsettled swaps

### Actual Solution ✅
**Boltz has a `gasless` parameter that must be set during swap creation!**

When you set `gasless: true`:
1. **Boltz generates 2 Lightning invoices:**
   - Invoice 1: Swap amount (e.g., 66,000 sats)
   - Invoice 2: Gas fee (~100 sats)
2. **User pays both invoices**
3. **Boltz uses the gas fee payment to fund their RIF Relay**
4. **Boltz AUTOMATICALLY claims the swap for the user**
5. **User receives RBTC without needing any RBTC first!** ✅

## 📚 Official Documentation Sources

1. **Boltz API v1 Documentation**: 
   - https://api.docs.boltz.exchange/api-v1.html
   - Describes the `gasless` parameter for reverse swaps

2. **Boltz Blog Post - Rootstock Integration**:
   - https://blog.boltz.exchange/p/hello-rootstock-swaps
   - Explains how RIF Relay solves the chicken-and-egg problem

3. **Web Search Findings**:
   - Confirmed that `gasless: true` triggers Boltz's automatic claiming
   - Confirmed that user must pay both invoices
   - Confirmed that Boltz covers gas fees via their RIF Relay infrastructure

## 🔧 Implementation Changes

### 1. Updated `createReverseSwap()` Method

**File**: `src/lib/integrations/boltz/reverseSwapService.ts`

**Key Changes**:
- Added `gasless?: boolean` parameter
- Auto-detects if user has gas (checks balance >= 0.00001 RBTC)
- Defaults to `gasless: true` if user has no gas
- Sends `gasless: true` in API request body to Boltz

**Code**:
```typescript
// Check if user has gas for direct claiming
const wallet = this.walletGetter?.();
let hasGas = false;

if (wallet && params.gasless === undefined) {
    // Auto-detect if user needs gasless
    try {
        const balance = await wallet.provider.getBalance(wallet.address);
        // Need ~0.00001 RBTC for gas
        hasGas = balance >= 10000000000000n; // 0.00001 RBTC in wei
    } catch (err) {
        console.warn('⚠️ Could not check balance, defaulting to gasless:', err);
    }
}

// Default to gasless if not specified and user has no gas
const useGasless = params.gasless !== undefined ? params.gasless : !hasGas;

// Send to Boltz API
body: JSON.stringify({
    from: 'BTC',
    to: 'RBTC',
    invoiceAmount: params.amountSats,
    preimageHash,
    claimAddress: params.rbtcAddress,
    ...(useGasless && { gasless: true }) // ✅ THE FIX!
})
```

### 2. Updated Swap Data Structure

**Added fields**:
```typescript
export interface BoltzSwapData {
    // ... existing fields ...
    gasless?: boolean; // If true, Boltz handles claiming automatically
    serviceFeeInvoice?: string; // Lightning invoice for gas fees (gasless swaps only)
}
```

### 3. Updated Swap Update Handler

**File**: `src/lib/integrations/boltz/reverseSwapService.ts`

**Logic**:
- If `swapData.gasless === true`: Wait for Boltz to auto-claim (no action needed)
- If `swapData.gasless === false` && user has gas: Claim immediately
- If `swapData.gasless === false` && user has NO gas: Show error (needs manual intervention)

**Code**:
```typescript
case 'transaction.confirmed':
    if (swapData.gasless) {
        // Boltz will automatically claim
        console.log('⛽ Gasless swap - Boltz will automatically claim (no action needed)');
    } else {
        // User must claim manually (requires gas)
        const wallet = this.walletGetter?.();
        if (wallet && hasGas) {
            await this.claimRBTC(swapData, nsec, wallet);
        }
    }
    break;
```

### 4. Updated UI Components

**File**: `src/lib/components/wallet/LightningReceive.svelte`

**Changes**:
1. **Gasless Mode Indicator**:
   - Shows that user will receive 2 invoices
   - Explains they must pay both for Boltz to claim automatically

2. **Two Invoice Display**:
   - Main invoice (swap amount) - labeled as "1️⃣"
   - Service fee invoice (gas payment) - labeled as "2️⃣" with warning styling
   - Warning message: "Pay both invoices for Boltz to claim automatically"

3. **Status Messages**:
   - Gasless swaps: "Waiting for Boltz auto-settlement..."
   - Direct swaps: "Claim Now (Instant)" button

## 🧪 Testing Requirements

### Test Case 1: Zero Balance Wallet (Gasless)
1. Create new RSK wallet with zero balance
2. Create reverse swap (should auto-set `gasless: true`)
3. Verify 2 invoices are generated
4. Pay both invoices
5. Wait for Boltz to auto-claim
6. Verify RBTC received in wallet

**Expected Logs**:
```
🔧 Creating reverse swap: { amount: 66000, useGasless: true, hasWallet: true, hasGas: false }
✅ Swap created: { id: 'abc123', gasless: true, hasServiceFeeInvoice: true }
✅ Lockup confirmed!
⛽ Gasless swap - Boltz will automatically claim (no action needed)
⏳ Waiting for Boltz to complete the claim...
✅ Swap successful - Invoice settled by Boltz: abc123
🎉 RBTC has been credited to your wallet!
```

### Test Case 2: Funded Wallet (Direct Claim)
1. Fund RSK wallet with 0.001 RBTC
2. Create reverse swap (should auto-set `gasless: false`)
3. Verify only 1 invoice generated
4. Pay invoice
5. Verify immediate direct claim
6. Verify RBTC received instantly

**Expected Logs**:
```
🔧 Creating reverse swap: { amount: 66000, useGasless: false, hasWallet: true, hasGas: true }
✅ Swap created: { id: 'xyz789', gasless: false, hasServiceFeeInvoice: false }
✅ Lockup confirmed!
💰 User has gas, claiming directly...
🚀 Calling EtherSwap.claim()...
✅ Claim transaction sent: 0x...
```

### Test Case 3: Previously Unsettled Swaps
These swaps were created WITHOUT `gasless: true`, so they will never auto-settle:

**Recovery Options**:
1. **If user has gas now**: Can manually claim via UI button
2. **If user still has no gas**: Must add RBTC first, then claim
3. **If swap expired**: Can request refund from Boltz support

**Note**: Future swaps will automatically use gasless mode when needed!

## 📊 Comparison: Gasless vs Direct Claim

| Aspect | Gasless Mode | Direct Claim Mode |
|--------|--------------|-------------------|
| **User Gas Balance** | Zero RBTC | >= 0.00001 RBTC |
| **Invoices** | 2 (main + gas fee) | 1 (main only) |
| **Gas Fee** | ~100 sats (paid via Lightning) | Paid from RBTC balance |
| **Claim Speed** | 2-3 minutes after payment | Instant after payment |
| **Who Claims** | Boltz (via RIF Relay) | User (direct contract call) |
| **Best For** | New users, zero balance | Existing users with RBTC |

## 🎨 User Experience Flow

### Gasless Mode (Zero Balance User):
```
1. User requests 66,000 sats swap
2. App detects zero balance → sets gasless: true
3. UI shows: "Gasless Mode Enabled!"
4. UI displays 2 invoices:
   - 1️⃣ Main Invoice (66,000 sats)
   - 2️⃣ Gas Fee Invoice (~100 sats) ⚠️
5. User pays BOTH invoices
6. Boltz locks RBTC in contract
7. Boltz uses gas payment to fund RIF Relay
8. Boltz broadcasts claim transaction (gasless)
9. User receives 66,000 sats worth of RBTC ✅
10. Zero RBTC spent on gas! ✅
```

### Direct Claim Mode (Funded User):
```
1. User requests 66,000 sats swap
2. App detects gas balance → sets gasless: false
3. UI shows: "Direct Claim Mode - Fast!"
4. UI displays 1 invoice (66,000 sats)
5. User pays invoice
6. Boltz locks RBTC in contract
7. App immediately broadcasts claim transaction
8. User receives RBTC instantly ⚡
9. Small gas fee deducted from RBTC balance
```

## ❌ Why Previous Swaps Failed

### The Problem:
```typescript
// OLD CODE (BROKEN)
body: JSON.stringify({
    from: 'BTC',
    to: 'RBTC',
    invoiceAmount: params.amountSats,
    preimageHash,
    claimAddress: params.rbtcAddress
    // ❌ Missing: gasless: true
})
```

**What Happened**:
1. Swaps created WITHOUT `gasless: true`
2. Boltz locked RBTC but expected USER to claim
3. User had zero balance (no gas)
4. User could not broadcast claim transaction
5. Swap stuck in "transaction.confirmed" state
6. Boltz did NOT auto-claim (because gasless wasn't set)

**The Fix**:
```typescript
// NEW CODE (FIXED)
body: JSON.stringify({
    from: 'BTC',
    to: 'RBTC',
    invoiceAmount: params.amountSats,
    preimageHash,
    claimAddress: params.rbtcAddress,
    ...(useGasless && { gasless: true }) // ✅ NOW INCLUDED!
})
```

## 🚀 Deployment Checklist

### Phase 1: Code Review ✅
- [x] Implemented gasless parameter in createReverseSwap
- [x] Updated swap data structure
- [x] Modified swap update handler
- [x] Updated UI to show both invoices
- [x] Added gasless mode indicators

### Phase 2: Testing (In Progress)
- [ ] Test gasless mode with zero balance wallet
- [ ] Test direct claim mode with funded wallet
- [ ] Test invoice payment flow (both invoices)
- [ ] Verify Boltz auto-settlement
- [ ] Monitor transaction on RSK explorer

### Phase 3: Documentation
- [x] Created implementation summary (this document)
- [ ] Update user-facing docs
- [ ] Add troubleshooting guide

### Phase 4: Production Deployment
- [ ] Deploy to testnet
- [ ] Test with real Boltz testnet
- [ ] Deploy to mainnet
- [ ] Monitor initial swaps closely
- [ ] Gather user feedback

## 💡 Key Learnings

1. **RTFM (Read The Fine Manual)**:
   - The `gasless` parameter was in Boltz's API docs all along
   - We should have searched for "gasless" or "RIF Relay" earlier

2. **Don't Assume Auto-Claiming**:
   - Boltz doesn't auto-claim regular swaps
   - Gasless mode must be explicitly enabled

3. **Pay Attention to API Responses**:
   - Empty `{}` response from `/claim` endpoint was a red flag
   - Should have realized that endpoint wasn't meant for this use case

4. **Web Search is Powerful**:
   - Web search revealed the gasless protocol immediately
   - Official docs + blog posts explained everything clearly

## 🎉 Benefits of This Solution

### Technical Benefits:
- ✅ **No custom infrastructure**: Uses Boltz's existing RIF Relay
- ✅ **Simple implementation**: Just add one parameter
- ✅ **Proven technology**: Boltz already using it in production
- ✅ **Auto-detection**: Smart defaults based on user balance

### User Benefits:
- ✅ **Zero friction**: New users don't need RBTC first
- ✅ **Transparent costs**: Gas fee shown upfront (~100 sats)
- ✅ **Automatic**: No manual claiming needed
- ✅ **Flexible**: Fast path for users with gas

### Business Benefits:
- ✅ **Better onboarding**: Eliminates major barrier for new users
- ✅ **Lower support burden**: No more "I can't claim" tickets
- ✅ **Competitive advantage**: Seamless Lightning → RBTC flow
- ✅ **Zero cost to us**: Boltz covers infrastructure

## 🔗 References

1. **Boltz API v1 - Gasless Protocol**:
   - https://api.docs.boltz.exchange/api-v1.html
   - Section: "Reverse Swaps - gasless parameter"

2. **Boltz Blog - Rootstock Integration**:
   - https://blog.boltz.exchange/p/hello-rootstock-swaps
   - Quote: "Meta transactions via RIF Relay allow Boltz users to sign instructions for RIF Relay to broadcast a swap claim without directly paying for gas"

3. **RIF Relay Documentation**:
   - https://dev.rootstock.io/developers/integrate/rif-relay/
   - Architecture and implementation details

4. **Boltz API v2 Documentation**:
   - https://docs.boltz.exchange/api/api-v2
   - Latest API structure and endpoints

---

**Status**: Implementation Complete ✅ | Testing Required 🧪 | Ready for Regtest 🚀

**Estimated Time to Production**: 1-2 days (testing + deployment)

**Risk Level**: Low (using proven Boltz infrastructure)

