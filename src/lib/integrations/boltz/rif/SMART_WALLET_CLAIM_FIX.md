# Smart Wallet Claim Address Fix

## Problem

When using RIF Relay for gasless claims, the transaction was failing with:
```
VM Exception while processing transaction: revert EtherSwap: swap has no Ether locked in the contract
```

## Root Cause

The EtherSwap contract uses `msg.sender` (the transaction caller) as part of the swap lookup hash:

```solidity
bytes32 swapHash = keccak256(preimageHash, amount, msg.sender, refundAddress, timelock);
```

When a swap was created:
- **claimAddress** = User's wallet (`0xE1d3...d41`)
- Boltz locked RBTC for this address

When claiming via RIF Relay:
- **msg.sender** = Smart Wallet (`0x78af...Da52`)
- Contract looked for a swap with Smart Wallet as claimAddress
- No swap found → revert

## Solution

The swap must be created with the **same address that will claim it**:

### For Users WITH Gas
- Create swap with **user's wallet address**
- Claim directly (user pays gas)
- `msg.sender` = user's wallet ✅

### For Users WITHOUT Gas  
- Create swap with **Smart Wallet address**
- Claim via RIF Relay (gasless)
- `msg.sender` = Smart Wallet ✅

## Implementation

### 1. Updated `BoltzSwapData` Interface

Added `claimAddress` field to track which address was used:

```typescript
export interface BoltzSwapData {
  rbtcAddress: string;      // User's actual wallet
  claimAddress?: string;    // Address used for claiming (may be Smart Wallet)
  rifRelayUsed?: boolean;   // Track if RIF Relay was/will be used
  // ... other fields
}
```

### 2. Updated `createReverseSwap()` Method

Now checks user's gas balance and decides claim address upfront:

```typescript
async createReverseSwap(params: {
  amountSats: number;
  rbtcAddress: string;
  walletSigner?: any;  // NEW: Required for Smart Wallet computation
  // ...
}) {
  let claimAddress = params.rbtcAddress; // Default
  let useSmartWallet = false;

  if (isRifRelayAvailable() && params.walletSigner) {
    const balance = await params.walletSigner.provider.getBalance(params.rbtcAddress);
    const gasEstimate = 100000n * 60000000n;
    
    if (balance < gasEstimate) {
      // User has no gas - use Smart Wallet
      const smartWallet = await getSmartWalletAddress(params.walletSigner);
      claimAddress = smartWallet.address;
      useSmartWallet = true;
    }
  }

  // Create swap with computed claim address
  await fetch('/v2/swap/reverse', {
    body: JSON.stringify({
      claimAddress: claimAddress  // Smart Wallet OR user wallet
    })
  });
}
```

### 3. Updated Claim Strategy

The claim method now respects how the swap was created:

```typescript
case 'transaction.confirmed':
  const wasCreatedForSmartWallet = 
    swapData.claimAddress && 
    swapData.claimAddress !== swapData.rbtcAddress;

  if (wasCreatedForSmartWallet) {
    // MUST use RIF Relay - swap locked for Smart Wallet
    await this.claimRBTCViaRifRelay(swapData, nsec, wallet);
  } else {
    // Can use direct claim OR RIF Relay fallback
    if (hasGas) {
      await this.claimRBTC(swapData, nsec, wallet);
    } else {
      await this.claimRBTCViaRifRelay(swapData, nsec, wallet);
    }
  }
```

### 4. Updated Component

`LightningReceive.svelte` now passes wallet signer:

```typescript
const result = await reverseSwapService.createReverseSwap({
  amountSats,
  rbtcAddress: $rskConnection.address,
  nsec: nsecHex,
  walletSigner: $rskConnection.wallet  // NEW
});
```

## How It Works Now

### Scenario 1: User Has No Gas (First-Time User)

1. **Swap Creation:**
   - Check balance: 0 RBTC
   - Compute Smart Wallet address: `0x78af...Da52`
   - Create swap with `claimAddress = 0x78af...Da52`
   - Boltz locks RBTC for Smart Wallet

2. **User Pays Invoice:**
   - Lightning payment received
   - Boltz confirms lockup

3. **Automatic Claim:**
   - Detect `swapData.claimAddress !== swapData.rbtcAddress`
   - Use RIF Relay (gasless)
   - Smart Wallet calls `claim()`
   - `msg.sender` = Smart Wallet ✅
   - Contract finds swap and transfers RBTC
   - Smart Wallet forwards RBTC to user's wallet

### Scenario 2: User Has Gas

1. **Swap Creation:**
   - Check balance: 0.001 RBTC
   - Use user's wallet address: `0xE1d3...d41`
   - Create swap with `claimAddress = 0xE1d3...d41`
   - Boltz locks RBTC for user's wallet

2. **User Pays Invoice:**
   - Lightning payment received
   - Boltz confirms lockup

3. **Automatic Claim:**
   - Detect `swapData.claimAddress === swapData.rbtcAddress`
   - Use direct claim (cheaper)
   - User's wallet calls `claim()`
   - `msg.sender` = user's wallet ✅
   - Contract finds swap and transfers RBTC

## Key Points

1. **Claim address is determined at swap creation** based on user's gas balance
2. **Smart Wallet is computed deterministically** from user's EOA address
3. **RBTC always ends up in user's wallet** - Smart Wallet is just a forwarder
4. **No manual intervention needed** - strategy is automatic
5. **Backward compatible** - old swaps without `claimAddress` default to `rbtcAddress`

## Testing

To test the fix:

1. **Test with 0 RBTC:**
   ```bash
   # User has no gas
   # Should create swap with Smart Wallet address
   # Should claim via RIF Relay
   ```

2. **Test with sufficient RBTC:**
   ```bash
   # User has gas
   # Should create swap with user's wallet
   # Should claim directly
   ```

3. **Verify in logs:**
   ```
   🔧 Creating reverse swap:
     userWallet: 0xE1d3...d41
     claimAddress: 0x78af...Da52  (or same as userWallet)
     usingSmartWallet: true/false
   ```

## Benefits

- ✅ Gasless claims work for first-time users
- ✅ Direct claims still work for users with gas
- ✅ Automatic strategy selection
- ✅ No manual configuration needed
- ✅ Backward compatible with existing swaps


