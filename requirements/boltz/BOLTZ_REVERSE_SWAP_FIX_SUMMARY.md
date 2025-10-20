# Boltz Reverse Swap Implementation Fix - Summary

## Problem Identified

The reverse swap claiming was failing because of a fundamental misunderstanding of how the Boltz EtherSwap contract works.

### Root Cause

**Incorrect assumption**: The code was trying to query the contract using just the `preimageHash`:
```typescript
const swapDetails = await etherSwapContract.swaps(preimageHashBytes32);
```

**Reality**: The EtherSwap contract uses a different indexing mechanism:
- The `swaps` mapping is `mapping(bytes32 => bool)` (not a struct)
- The key is computed by `hashValues(preimageHash, amount, claimAddress, refundAddress, timelock)`
- This is a **keccak256 hash** of ALL swap parameters combined

### Additional Issues

1. **Wrong ABI**: Expected struct return from `swaps()`, but it only returns `bool`
2. **Unnecessary querying**: No need to check if swap exists - just call `claim()` directly
3. **Wrong claim function understanding**: The claim function auto-uses `msg.sender` as `claimAddress`
4. **Premature claiming**: Code was trying to claim on `transaction.mempool` instead of `transaction.confirmed`

## Changes Implemented

### 1. Updated EtherSwap ABI (`reverseSwapService.ts`)

**Before:**
```typescript
const ETHER_SWAP_ABI = [
    'function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timeoutBlockHeight) external',
    'function swaps(bytes32) view returns (address refundAddress, uint256 amount, address claimAddress, uint256 timeoutBlockHeight)'
];
```

**After:**
```typescript
const ETHER_SWAP_ABI = [
    // Main claim function - auto-uses msg.sender as claimAddress
    'function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timelock) external',
    
    // Query function - returns bool indicating if swap exists
    'function swaps(bytes32) view returns (bool)',
    
    // Hash computation helper
    'function hashValues(bytes32 preimageHash, uint256 amount, address claimAddress, address refundAddress, uint256 timelock) public pure returns (bytes32)',
    
    // Events
    'event Lockup(bytes32 indexed preimageHash, uint256 amount, address claimAddress, address indexed refundAddress, uint256 timelock)',
    'event Claim(bytes32 indexed preimageHash, bytes32 preimage)'
];
```

### 2. Simplified `claimRBTC()` Function

**Removed ~80 lines** of incorrect contract querying logic and replaced with direct claim call:

```typescript
// Old approach (WRONG):
// 1. Query contract with preimageHash
// 2. Validate swap exists
// 3. Check parameters
// 4. Call claim

// New approach (CORRECT):
// 1. Prepare parameters
// 2. Call claim() directly
// 3. Contract handles all validation
const tx = await etherSwapContract.claim(
    preimageBytes32,
    amountWei,
    refundAddress,
    timelock
);
```

### 3. Fixed Status Handling

Updated `handleSwapUpdate()` to:
- Log detailed parameters when `transaction.confirmed` is received
- Only attempt claiming on `transaction.confirmed` (not `transaction.mempool`)
- Keep status as `transaction.confirmed` on failure for manual retry
- Add better error messages

### 4. Improved UI Messages (`LightningReceive.svelte`)

Added proper status labels:
- `swap.created`: "Invoice ready - waiting for payment"
- `invoice.set`: "Invoice paid! Waiting for lockup..." ✅ This is NORMAL
- `transaction.mempool`: "Boltz locking funds..."
- `transaction.confirmed`: "Ready to claim rBTC!"
- `transaction.claim.pending`: "Claiming rBTC..."
- `transaction.claim.failed`: "Claim failed - retry"
- `claimed`: "rBTC claimed successfully!"

### 5. Enhanced Manual Claim Button

- Only shows when status is `transaction.confirmed` or `transaction.claim.failed`
- Shows "Retry Claim" for failed attempts
- Provides helpful messages for other states:
  - "Pay the Lightning invoice to continue"
  - "Payment received! Waiting for Boltz to lock funds..."
  - "Lockup in progress... Will be ready to claim soon"

## How It Works Now

### Correct Reverse Swap Flow

1. **Create Swap**
   - Generate preimage (32 random bytes)
   - Calculate preimageHash (SHA256 of preimage)
   - Send to Boltz API with claimAddress and amount
   - Store swap data in Nostr (encrypted)

2. **User Pays Invoice**
   - Status: `invoice.set` (payment is HELD by Boltz - this is normal!)
   - WebSocket receives update

3. **Boltz Locks Funds**
   - Boltz calls EtherSwap.lock() with:
     - `preimageHash` (SHA256)
     - `amount` in wei
     - `claimAddress` (your RSK address)
     - `refundAddress` (Boltz's address)
     - `timelock` (block height)
   - Contract stores: `swaps[hashValues(...)] = true`
   - Status: `transaction.mempool` → `transaction.confirmed`

4. **Claim rBTC**
   - Wait for `transaction.confirmed` status
   - Call EtherSwap.claim() with:
     - `preimage` (raw 32 bytes)
     - `amount` (same as lockup)
     - `refundAddress` (same as lockup)
     - `timelock` (same as lockup)
   - Contract:
     - Hashes preimage with SHA256
     - Computes swap hash using hashValues()
     - Checks if swap exists and is locked
     - Transfers rBTC to `msg.sender` (your wallet)

5. **Settlement**
   - Boltz sees claim transaction on-chain
   - Boltz extracts preimage from transaction
   - Boltz settles Lightning invoice with preimage
   - Status: `invoice.settled`

## Testing Instructions

1. **Create a reverse swap**
   ```bash
   # In Bittasker app:
   # - Navigate to wallet
   # - Go to Lightning Receive tab
   # - Enter amount (e.g., 0.0006 BTC for testnet)
   # - Click "Generate Lightning Invoice"
   ```

2. **Pay the invoice**
   ```bash
   # In Boltz regtest container:
   lncli-sim 1 payinvoice <invoice>
   # Confirm with 'yes'
   ```

3. **Monitor status updates**
   - Should see: `swap.created` → `invoice.set` → `transaction.mempool` → `transaction.confirmed`
   - Each status should show appropriate message in UI

4. **Automatic claiming**
   - Should trigger automatically when status reaches `transaction.confirmed`
   - Check console logs for detailed claiming process
   - Should see transaction hash and confirmation

5. **Verify success**
   - Status should update to `claimed`
   - rBTC balance should increase
   - Lightning invoice should show as `SETTLED` in LN node

## Key Takeaways

1. **EtherSwap uses complex indexing**: Not just preimageHash, but hash of ALL parameters
2. **No need to query**: The claim() function validates everything
3. **Wait for confirmation**: Don't claim until `transaction.confirmed`
4. **Invoice HELD is normal**: `invoice.set` means payment received, not failed
5. **Contract does validation**: If parameters are wrong, claim will revert with clear error

## Files Modified

- `src/lib/integrations/boltz/reverseSwapService.ts` (simplified by ~80 lines)
- `src/lib/components/wallet/LightningReceive.svelte` (improved UX)

## References

- [Boltz EtherSwap Contract](https://github.com/BoltzExchange/boltz-core/blob/master/contracts/EtherSwap.sol)
- [Boltz API v2 Documentation](https://api.docs.boltz.exchange/api-v2.html)
- [Boltz Regtest Environment](https://github.com/BoltzExchange/regtest)

