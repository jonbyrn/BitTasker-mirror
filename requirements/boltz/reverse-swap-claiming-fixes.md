# Reverse Swap Claiming Fixes

## Issue Summary

The rBTC claiming process was failing with the error:
```
execution reverted (no data present; likely require(false) occurred
```

## Root Causes Identified

### 1. **Premature Claiming Attempts**
The code was attempting to claim rBTC when the swap status was `transaction.mempool`, meaning the lockup transaction was in the mempool but not yet mined/confirmed. The EtherSwap contract doesn't have the swap data until the lockup transaction is actually executed on-chain.

**Fix:** Only attempt to claim after `transaction.confirmed` status is received via WebSocket.

### 2. **Contract Query Method**
The code was using incorrect ABI assumptions and parameter formats when querying the EtherSwap contract's `swaps` mapping.

**Fix:** 
- Corrected the ABI structure to match Boltz's actual EtherSwap contract
- Added proper error handling and debugging for contract queries
- Added a 2-second delay before querying to ensure the lockup transaction is fully processed

### 3. **Module Compatibility Warnings**
Browser incompatibility warnings for Node.js modules (`events`, `util`) were appearing in the console.

**Fix:** These are actually coming from crypto libraries (hash-base, stream-browserify) used by bitcoinjs-lib. While they don't affect functionality, they can be resolved by:
- Ensuring vite.config.ts has proper polyfills configured
- These warnings don't prevent the swap from working

## Changes Made

### File: `src/lib/integrations/boltz/reverseSwapService.ts`

#### 1. Updated Imports
```typescript
import { Contract, keccak256, solidityPacked } from 'ethers';
```
Added keccak256 and solidityPacked for potential future use in swap hash calculations.

#### 2. Fixed EtherSwap ABI
```typescript
const ETHER_SWAP_ABI = [
	'function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timeoutBlockHeight) external',
	'function swaps(bytes32) view returns (address refundAddress, uint256 amount, address claimAddress, uint256 timeoutBlockHeight)'
];
```

Key points:
- The `claim` function takes the **preimage** (not preimage hash)
- The contract hashes the preimage internally
- The `swaps` mapping is queried using the preimage hash
- Returns struct: (refundAddress, amount, claimAddress, timeoutBlockHeight)

#### 3. Removed Premature Claiming on Mempool Status
**Before:**
```typescript
case 'transaction.mempool':
	await this.claimRBTC(swapData, nsec, wallet); // ❌ Too early!
	break;
```

**After:**
```typescript
case 'transaction.mempool':
	console.log('🔒 Lockup transaction in mempool, waiting for confirmation...');
	console.log('⏳ Swap will be ready to claim once the lockup transaction is confirmed');
	swapData.status = 'transaction.mempool';
	break;
```

#### 4. Enhanced Contract Query with Better Error Handling
Added:
- 2-second delay before querying contract
- Detailed logging of swap parameters
- Validation that swap exists (amount > 0)
- Parameter mismatch detection
- Helpful error messages explaining why queries might fail

#### 5. Improved Claim Function Call
```typescript
const tx = await etherSwapContract.claim(
	preimageBytes32,      // The actual preimage (not hash)
	amountWei,            // Amount in wei
	swapData.refundAddress,
	swapData.timeoutBlockHeight
);
```

## Testing Instructions

### 1. Create a New Reverse Swap

1. Open BitTasker wallet
2. Navigate to receive Lightning payment
3. Enter amount (e.g., 0.0005 BTC = 50,000 sats)
4. Generate invoice

### 2. Pay the Invoice from Regtest

```bash
docker exec -it boltz-scripts bash
lncli-sim 1 payinvoice <invoice>
```

### 3. Monitor the WebSocket Events

You should see these status transitions in the console:

1. **`swap.created`** - Invoice generated
2. **`invoice.set`** - Lightning invoice paid and held
3. **`transaction.mempool`** - Boltz's lockup transaction sent ✓ (NEW: We wait here now)
4. **`transaction.confirmed`** - Lockup transaction mined ✓ (We claim here)
5. **Claim attempt** - Our code calls the contract
6. **`invoice.settled`** - Success! Boltz sees our preimage on-chain

### 4. Expected Behavior

#### When lockup is in mempool:
```
🔒 Lockup transaction in mempool, waiting for confirmation...
⏳ Swap will be ready to claim once the lockup transaction is confirmed
```

#### When lockup is confirmed:
```
🔒 Lockup confirmed, attempting to claim rBTC...
📋 Boltz contracts response: {...}
📍 Using EtherSwap contract: 0x8464135c8F25Da09e49BC8782676a84730C318bC
🔍 Attempting to query swap from contract...
⏳ Waiting 2 seconds for lockup transaction to be fully processed...
🔍 Querying contract with preimage hash: 0x430ea0...
📋 Raw swap details from contract: [...]
✅ Swap found in contract and parameters validated
✅ Ready to claim 500000000000000 wei (50000 sats)
🎯 Calling contract claim function with params: {...}
Claim transaction sent: 0x...
✅ rBTC claimed successfully!
```

### 5. If Issues Persist

Check these in the Boltz backend logs:
```bash
docker logs boltz-backend | grep -i "rbtc\|swap\|claim"
```

Look for:
- Lock transaction confirmation
- Swap creation in contract
- Our claim transaction

Check the Anvil (regtest RSK) logs:
```bash
docker logs anvil
```

Look for:
- Lock transaction execution
- Claim transaction execution
- Any revert reasons

## Key Insights

### Why the Error Occurred

The error `execution reverted (no data present; likely require(false) occurred` happens when:

1. **The swap doesn't exist in the contract** - This was our case. We were querying before the lockup transaction was mined.

2. **Wrong parameters** - If we query with the wrong hash, the contract returns empty data which causes the revert.

3. **Already claimed** - If the swap was already claimed, it's been removed from the contract.

### Boltz Reverse Swap Flow (Lightning → RBTC)

```
User generates preimage & hash
       ↓
Creates reverse swap via Boltz API
       ↓
Boltz creates HODL invoice with that hash
       ↓
User pays Lightning invoice
       ↓
[Lightning payment is HELD, not settled]
       ↓
Boltz sends lockup transaction to RSK
       ↓
transaction.mempool status ← [WAIT HERE, DON'T CLAIM YET]
       ↓
Lockup transaction mined
       ↓
transaction.confirmed status ← [CLAIM NOW]
       ↓
User calls contract.claim(preimage, ...)
       ↓
Contract verifies hash & transfers RBTC
       ↓
Boltz sees preimage on-chain
       ↓
Boltz settles Lightning invoice
       ↓
invoice.settled ← [SUCCESS!]
```

### Important Notes

1. **Atomicity**: The swap is atomic because:
   - Lightning payment can't be settled until we reveal the preimage
   - We can only get the RBTC by revealing the preimage on-chain
   - If we don't claim, both parties can refund after timeout

2. **Timing**: 
   - `transaction.mempool`: Transaction submitted but not mined (30-60 seconds on regtest with auto-mining)
   - `transaction.confirmed`: Transaction mined (NOW we can claim)

3. **Contract Interaction**:
   - Query uses: `swaps(preimageHash)` - returns swap details
   - Claim uses: `claim(preimage, amount, refund, timeout)` - verifies and transfers

## Troubleshooting

### If claiming still fails:

1. **Check the lockup transaction is actually confirmed:**
   ```javascript
   const tx = await provider.getTransaction(swapData.lockupTxHash);
   const receipt = await provider.getTransactionReceipt(swapData.lockupTxHash);
   console.log('Confirmations:', receipt.confirmations);
   ```

2. **Verify the swap exists in the contract:**
   ```javascript
   const swapDetails = await etherSwapContract.swaps('0x' + swapData.preimageHash);
   console.log('Amount:', swapDetails[1].toString()); // Should be > 0
   ```

3. **Check your wallet has enough gas:**
   ```javascript
   const balance = await provider.getBalance(walletAddress);
   console.log('Wallet balance:', balance.toString());
   ```

4. **Verify the preimage hash is correct:**
   ```javascript
   const crypto = require('crypto');
   const hash = crypto.createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
   console.log('Calculated hash:', hash);
   console.log('Expected hash:', swapData.preimageHash);
   ```

## Next Steps

1. Test with multiple swap amounts
2. Test claim failures and refund scenarios
3. Add retry logic for claim attempts
4. Implement timeout monitoring for refunds
5. Add UI indicators for each swap state
6. Store swap history in Nostr for recovery


