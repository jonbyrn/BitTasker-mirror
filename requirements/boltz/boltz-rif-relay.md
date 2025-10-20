# RIF Relay Integration Guide for BitTasker

## Executive Summary

After extensive investigation of the Boltz regtest environment and production API, we've confirmed that **RIF Relay IS integrated with Boltz** for gasless RBTC swaps. However, it requires client-side integration of the RIF Relay SDK to work properly.

**Key Finding**: Users can receive RBTC via Lightning → RBTC swaps WITHOUT having pre-existing RBTC for gas fees, but only if the client application (BitTasker) integrates the RIF Relay client library.

---

## Background: The Problem We Solved

### Initial Confusion
- We initially looked for a `serviceFeeInvoice` field in Boltz API responses
- Tested for "cooperative claim" endpoints that would auto-claim for users
- Both approaches were dead ends

### The Breakthrough
- Found official blog post: [RIF Relay Use Cases: Enabling Atomic Swaps](https://rif.technology/content-hub/rif-relay-use-cases-enabling-atomic-swaps/)
- Discovered that Boltz integrated RIF Relay at the **smart contract level**, not the API level
- The integration is invisible in API responses but works through transaction relaying

---

## How RIF Relay Works with Boltz

### The Flow (Lightning → RBTC)

```
1. BitTasker creates reverse swap via Boltz API
   POST /v2/swap/reverse
   {
     "from": "BTC",
     "to": "RBTC",
     "invoiceAmount": 100000,
     "preimageHash": "<hash>",
     "claimAddress": "<user_address>"
   }

2. Boltz returns Lightning invoice
   Response: { "id": "...", "invoice": "lnbc...", ... }

3. User pays Lightning invoice (from their Lightning wallet)

4. Boltz locks RBTC in EtherSwap smart contract
   Status: "transaction.confirmed"

5. BitTasker calls EtherSwap.claim() via RIF Relay
   ⚠️ THIS IS THE CRITICAL STEP ⚠️
   - Standard web3 call would require gas (user needs RBTC)
   - RIF Relay wrapped call is gasless (RIF Relay pays gas)

6. RBTC is sent to user's claimAddress
   Status: "invoice.settled"
```

### Key Contracts (Regtest)

```javascript
// From Boltz API: GET /v2/chain/RBTC/contracts
{
  "network": {
    "chainId": 33,
    "name": "Anvil"
  },
  "swapContracts": {
    "EtherSwap": "0x8464135c8F25Da09e49BC8782676a84730C318bC",
    "ERC20Swap": "0x71C95911E9a5D330f4D621842EC243EE1343292e"
  }
}

// RIF Relay Contracts (from localhost:8090/chain-info)
{
  "relayHubAddress": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  "relayVerifierAddress": "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
  "relayWorkerAddress": "0xaF15CcE685357ecEf970ED89eEcB7067ad70e372"
}
```

---

## What Needs to Change in BitTasker

### Current Implementation (Broken for Zero-Balance Users)

Your current `reverseSwapService.ts` likely has something like:

```typescript
// Current implementation (requires user to have RBTC for gas)
async claimRBTC(swapId: string, preimage: string) {
  const provider = new ethers.JsonRpcProvider(RSK_RPC_URL);
  const wallet = new ethers.Wallet(userPrivateKey, provider);
  const contract = new ethers.Contract(ETHERSWAP_ADDRESS, ABI, wallet);
  
  // This FAILS if user has no RBTC for gas!
  const tx = await contract.claim(
    preimage,
    amount,
    refundAddress,
    timeoutBlockHeight
  );
  
  await tx.wait();
}
```

### Required Integration: RIF Relay Client

You need to integrate the **RIF Relay SDK** to wrap transactions in relay requests:

```typescript
import { RelayClient } from '@rsksmart/rif-relay-client';
import { EtherSwap__factory } from './contracts'; // Generated from ABI

class BoltzRBTCSwapHandler {
  private relayClient: RelayClient;
  
  constructor() {
    // Initialize RIF Relay client
    this.relayClient = new RelayClient({
      // Production: Get this from Boltz or RIF Relay docs
      relayServerUrl: process.env.NODE_ENV === 'production' 
        ? 'https://rif-relay.boltz.exchange' // TODO: Find actual production URL
        : 'http://localhost:8090', // Regtest
      
      chainId: process.env.NODE_ENV === 'production' ? 30 : 33, // RSK mainnet: 30, regtest: 33
    });
  }
  
  async claimRBTCGasless(
    userAddress: string,
    userPrivateKey: string, // User's RSK private key (NOT their BTC key)
    swapDetails: {
      preimage: string;
      amount: string;
      refundAddress: string;
      timeoutBlockHeight: number;
      etherSwapAddress: string;
    }
  ): Promise<string> {
    // 1. Create provider and signer
    const provider = new ethers.JsonRpcProvider(
      process.env.NODE_ENV === 'production' 
        ? 'https://public-node.rsk.co' 
        : 'http://localhost:8545'
    );
    const wallet = new ethers.Wallet(userPrivateKey, provider);
    
    // 2. Get contract interface
    const etherSwap = EtherSwap__factory.connect(
      swapDetails.etherSwapAddress,
      wallet
    );
    
    // 3. Build the claim transaction (WITHOUT sending it)
    const claimTx = await etherSwap.claim.populateTransaction(
      swapDetails.preimage,
      ethers.parseUnits(swapDetails.amount, 'wei'),
      swapDetails.refundAddress,
      swapDetails.timeoutBlockHeight
    );
    
    // 4. Send via RIF Relay (GASLESS!)
    const relayedTx = await this.relayClient.relayTransaction({
      from: userAddress,
      to: swapDetails.etherSwapAddress,
      data: claimTx.data!,
      gas: '100000', // Estimate or use fixed value
    });
    
    console.log('Gasless claim transaction sent:', relayedTx.hash);
    
    // 5. Wait for confirmation
    const receipt = await provider.waitForTransaction(relayedTx.hash);
    
    return receipt.transactionHash;
  }
}
```

---

## Integration Steps for BitTasker

### 1. Install Dependencies

```bash
npm install @rsksmart/rif-relay-client ethers@6
```

### 2. Update Environment Variables

Add to `.env`:

```bash
# RSK / RBTC Configuration
RSK_RPC_URL=https://public-node.rsk.co  # Production
RSK_CHAIN_ID=30  # Production (regtest: 33)

# RIF Relay Configuration
RIF_RELAY_SERVER_URL=https://rif-relay.boltz.exchange  # TODO: Confirm with Boltz
# Or for testing:
# RIF_RELAY_SERVER_URL=http://localhost:8090
```

### 3. Generate TypeScript Contract Types

```bash
# Install typechain if not already installed
npm install --save-dev typechain @typechain/ethers-v6

# Generate types from EtherSwap ABI
npx typechain --target ethers-v6 --out-dir src/contracts ./abis/EtherSwap.json
```

You'll need the EtherSwap ABI. Get it from:
- Boltz backend source: https://github.com/BoltzExchange/boltz-backend
- Or from regtest: `docker exec boltz-backend cat /boltz-backend/node_modules/boltz-core/out/EtherSwap.sol/EtherSwap.json`

### 4. Update `reverseSwapService.ts`

Replace the RBTC claim logic with the gasless version shown above.

Key changes:
- Remove direct `contract.claim()` calls
- Add RIF Relay client initialization
- Use `populateTransaction()` + `relayClient.relayTransaction()`
- Handle user private keys securely (they need RSK key to sign relay request)

### 5. Handle User Key Management

**Critical**: Users need an RSK/EVM private key to sign the relay request (not for gas, but for authorization).

Options:
1. **Generate ephemeral key**: Create temporary key just for this swap
2. **Derive from seed**: Use HD wallet derivation from user's main seed
3. **Use MetaMask/WalletConnect**: Let user sign with their existing RSK wallet

Example with ephemeral key:
```typescript
// Generate new key for this swap
const ephemeralWallet = ethers.Wallet.createRandom();
const claimAddress = ephemeralWallet.address;

// Store private key securely until claim is done
await secureStorage.set(`swap_${swapId}_key`, ephemeralWallet.privateKey);

// Create swap with this address
const swap = await createReverseSwap({
  claimAddress: claimAddress, // Ephemeral address
  // ... other params
});

// Later, when claiming:
const privateKey = await secureStorage.get(`swap_${swapId}_key`);
await claimRBTCGasless(claimAddress, privateKey, swapDetails);
```

---

## Testing in Regtest

### Prerequisites
1. Regtest environment running: `./start.sh`
2. RIF Relay service healthy: `curl http://localhost:8090/chain-info`

### Test Script

```typescript
// test-rif-relay-claim.ts
import { BoltzRBTCSwapHandler } from './BoltzRBTCSwapHandler';
import { ethers } from 'ethers';

async function testGaslessClaim() {
  // 1. Create new wallet with ZERO balance
  const testWallet = ethers.Wallet.createRandom();
  console.log('Test wallet:', testWallet.address);
  console.log('Balance:', await provider.getBalance(testWallet.address)); // Should be 0
  
  // 2. Create swap via Boltz
  const swap = await boltzApi.createReverseSwap({
    from: 'BTC',
    to: 'RBTC',
    invoiceAmount: 100000,
    claimAddress: testWallet.address,
    preimageHash: generatePreimageHash(),
  });
  
  // 3. Pay invoice (simulate user paying)
  await payLightningInvoice(swap.invoice);
  
  // 4. Wait for lockup
  await waitForStatus(swap.id, 'transaction.confirmed');
  
  // 5. Claim via RIF Relay (GASLESS!)
  const handler = new BoltzRBTCSwapHandler();
  const txHash = await handler.claimRBTCGasless(
    testWallet.address,
    testWallet.privateKey,
    {
      preimage: swap.preimage,
      amount: swap.onchainAmount,
      refundAddress: swap.refundAddress,
      timeoutBlockHeight: swap.timeoutBlockHeight,
      etherSwapAddress: ETHERSWAP_ADDRESS,
    }
  );
  
  console.log('✅ Claimed without gas!', txHash);
  
  // 6. Verify balance increased
  const finalBalance = await provider.getBalance(testWallet.address);
  console.log('Final balance:', ethers.formatEther(finalBalance), 'RBTC');
}
```

---

## Production Considerations

### 1. Find RIF Relay Server URL

**TODO**: You need to find the production RIF Relay server URL that Boltz uses.

Options:
- Check Boltz Web App source code: https://github.com/BoltzExchange/boltz-web-app
- Ask Boltz team directly
- Check if Boltz hosts their own RIF Relay server

### 2. Error Handling

```typescript
try {
  const txHash = await claimRBTCGasless(...);
} catch (error) {
  if (error.message.includes('relay not ready')) {
    // Fallback: Show user error, suggest trying later
    throw new Error('Gasless claim temporarily unavailable. Please try again in a few minutes.');
  }
  
  if (error.message.includes('insufficient funds')) {
    // This shouldn't happen with RIF Relay, but handle it
    throw new Error('Unable to claim RBTC. Please contact support.');
  }
  
  // Generic error
  throw new Error('Failed to claim RBTC: ' + error.message);
}
```

### 3. Fallback Strategy

If RIF Relay is down or unavailable:

```typescript
async claimRBTC(swapDetails, userKey) {
  try {
    // Try gasless claim first
    return await this.claimRBTCGasless(swapDetails, userKey);
  } catch (relayError) {
    console.warn('RIF Relay failed, checking if user has gas:', relayError);
    
    // Check if user has enough RBTC for gas
    const balance = await provider.getBalance(swapDetails.claimAddress);
    const gasEstimate = await estimateClaimGas(swapDetails);
    
    if (balance >= gasEstimate) {
      console.log('User has gas, claiming directly');
      return await this.claimRBTCDirect(swapDetails, userKey);
    }
    
    // User has no gas and relay is down
    throw new Error(
      'Unable to claim RBTC: Gasless service unavailable and you have no RBTC for gas. ' +
      'Please add small amount of RBTC to your wallet or try again later.'
    );
  }
}
```

---

## Key Differences from Your Current Implementation

### Before (Requires Gas)
```typescript
// User MUST have RBTC in their wallet
const tx = await contract.claim(...);
await tx.wait();
```

### After (Gasless via RIF Relay)
```typescript
// User needs ZERO RBTC
const claimTx = await contract.claim.populateTransaction(...);
const relayedTx = await relayClient.relayTransaction({
  to: contract.address,
  data: claimTx.data,
});
```

---

## Expected User Experience

### Current Flow (Broken)
1. User gets task paid in Lightning ✅
2. BitTasker initiates Lightning → RBTC swap ✅
3. User needs RBTC for gas ❌ (They don't have any!)
4. Swap fails or gets stuck ❌

### New Flow (With RIF Relay)
1. User gets task paid in Lightning ✅
2. BitTasker initiates Lightning → RBTC swap ✅
3. BitTasker claims via RIF Relay (gasless) ✅
4. RBTC appears in user's wallet ✅
5. User has RBTC to spend ✅

---

## Resources

### Documentation
- [RIF Relay Integration Guide](https://dev.rootstock.io/developers/integrate/rif-relay/integrate/)
- [Boltz API v2 Documentation](https://api.docs.boltz.exchange/api-v2.html)
- [RIF Relay Use Case Blog Post](https://rif.technology/content-hub/rif-relay-use-cases-enabling-atomic-swaps/)

### Repositories
- [Boltz Backend](https://github.com/BoltzExchange/boltz-backend)
- [Boltz Web App](https://github.com/BoltzExchange/boltz-web-app) - **Check this for RIF Relay client usage example!**
- [RIF Relay Contracts](https://github.com/rsksmart/rif-relay-contracts)
- [RIF Relay Server](https://github.com/rsksmart/rif-relay-server)
- [RIF Relay Client](https://github.com/rsksmart/rif-relay-client)

### NPM Packages
- `@rsksmart/rif-relay-client` - Main client library
- `boltz-core` - Contains EtherSwap contract ABIs
- `ethers@6` - For web3 interactions

---

## Questions to Resolve

1. **What is the production RIF Relay server URL?**
   - Check Boltz Web App source
   - Or contact Boltz team

2. **Does Boltz host their own RIF Relay server or use public one?**
   - Important for reliability/SLA

3. **What's the gas limit for EtherSwap.claim()?**
   - Need accurate estimate for relay requests
   - Test in regtest to determine

4. **How to handle user keys securely?**
   - Ephemeral keys vs. derived keys
   - Key storage strategy

---

## Summary

**The Good News**: RIF Relay integration is possible and Boltz already supports it!

**The Work Required**: BitTasker needs to integrate the RIF Relay client SDK to wrap claim transactions in relay requests.

**The Result**: Users can receive RBTC from Lightning payments without ever needing RBTC for gas fees.

**Next Action**: Review the Boltz Web App source code to see exactly how they implement RIF Relay client integration, then replicate in BitTasker.

