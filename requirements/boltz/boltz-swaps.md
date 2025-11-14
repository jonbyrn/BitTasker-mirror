# Boltz Swap Integration Guide

## Overview

BitTasker integrates with Boltz Exchange to enable seamless Lightning ↔ RBTC (Rootstock Bitcoin) swaps. This document covers the complete implementation details for reverse swaps (Lightning → RBTC).

## Architecture

### Reverse Swap Flow (Lightning → RBTC)

```
User Requests RBTC
      ↓
Generate Preimage & Hash
      ↓
Create Reverse Swap via Boltz API
      ↓
User Pays Lightning Invoice
      ↓
Boltz Locks RBTC in EtherSwap Contract
      ↓
Monitor WebSocket for Lockup Confirmation
      ↓
Claim RBTC (Direct or RIF Relay)
      ↓
RBTC Transferred to User's Wallet
```

### Key Components

- **client.ts**: Boltz REST API client (Bitcoin-focused, minimal use for RBTC)
- **reverseSwapService.ts**: Main service for RBTC reverse swaps
- **websocket.ts**: Real-time swap status monitoring
- **config.ts**: Network configuration (regtest/mainnet)
- **types.ts**: TypeScript interfaces for swaps
- **rif/**: RIF Relay integration for gasless claiming

## Boltz API Integration

### Base URLs

- **Mainnet**: `https://api.boltz.exchange`
- **Regtest**: `http://localhost:9001`

### Key Endpoints

#### Create Reverse Swap

```http
POST /v2/swap/reverse
Content-Type: application/json

{
  "from": "BTC",
  "to": "RBTC",
  "invoiceAmount": 100000,
  "preimageHash": "9c14cdee009d71a2e1c67230440fd893735066383ffe8052888ad1507033d44b",
  "claimAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Response:**
```json
{
  "id": "nZGTEFt78VfI",
  "invoice": "lnbc1m1p...",
  "redeemScript": "...",
  "lockupAddress": "...",
  "onchainAmount": 99600,
  "timeoutBlockHeight": 2950,
  "refundAddress": "0x..."
}
```

#### Get Chain Contracts

```http
GET /v2/chain/RBTC/contracts
```

**Response:**
```json
{
  "network": {
    "chainId": 30,
    "name": "RSK"
  },
  "swapContracts": {
    "EtherSwap": "0xC0dE1234...",
    "ERC20Swap": "0x..."
  }
}
```

## WebSocket Monitoring

Connect to WebSocket for real-time updates:

```typescript
const ws = new WebSocket('wss://api.boltz.exchange/v2/ws');

ws.send(JSON.stringify({
  op: 'subscribe',
  channel: 'swap.update',
  args: [swapId]
}));

ws.onmessage = (event) => {
  const { status, transaction } = JSON.parse(event.data).args[0];
  console.log('Swap status:', status);
  
  if (status === 'transaction.confirmed') {
    // Ready to claim!
    await claimRBTC(swapData);
  }
};
```

## Swap Status States

| Status | Description | Action |
|--------|-------------|--------|
| `swap.created` | Swap created | User pays invoice |
| `invoice.set` | Invoice paid, held by Boltz | Wait for lockup |
| `transaction.mempool` | Lockup in mempool | Wait for confirmation |
| `transaction.confirmed` | Lockup confirmed | **Claim now** |
| `transaction.claim.pending` | Claim submitted | Wait |
| `invoice.settled` | Complete! | Success ✅ |
| `swap.expired` | Timeout | Failed ❌ |

**Important**: `invoice.set` means payment is held (HODL invoice) - this is normal!

## EtherSwap Contract

### Contract Interface

```typescript
const ETHER_SWAP_ABI = [
  // Claim function - msg.sender receives funds
  'function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timelock) external',
  
  // Query if swap exists
  'function swaps(bytes32) view returns (bool)',
  
  // Hash computation
  'function hashValues(bytes32 preimageHash, uint256 amount, address claimAddress, address refundAddress, uint256 timelock) pure returns (bytes32)',
  
  // Lockup event
  'event Lockup(bytes32 indexed preimageHash, uint256 amount, address claimAddress, address indexed refundAddress, uint256 timelock)',
  
  // Claim event  
  'event Claim(bytes32 indexed preimageHash, bytes32 preimage)'
];
```

### Critical: Use Event Parameters

**⚠️ Problem**: Boltz API returns estimated values that differ from actual locked amounts after fees.

**✅ Solution**: Always fetch actual parameters from the Lockup event.

```typescript
async function getLockupEventParameters(
  lockupTxHash: string,
  preimageHash: string,
  provider: Provider
): Promise<{
  amount: bigint;
  claimAddress: string;
  refundAddress: string;
  timelock: number;
}> {
  // Poll for receipt (RPC needs time to index)
  let receipt = null;
  for (let i = 0; i < 10; i++) {
    receipt = await provider.getTransactionReceipt(lockupTxHash);
    if (receipt) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  if (!receipt) {
    throw new Error('Transaction receipt not found');
  }

  // Parse Lockup event
  const iface = new Interface(ETHER_SWAP_ABI);
  
  for (const log of receipt.logs) {
    const parsed = iface.parseLog({
      topics: [...log.topics],
      data: log.data
    });

    if (parsed?.name === 'Lockup') {
      const eventPreimageHash = parsed.args[0];
      
      if (eventPreimageHash.toLowerCase() === preimageHash.toLowerCase()) {
        return {
          amount: parsed.args[1],        // ✅ EXACT amount
          claimAddress: parsed.args[2],
          refundAddress: parsed.args[3],
          timelock: Number(parsed.args[4])
        };
      }
    }
  }

  throw new Error('Lockup event not found');
}
```

## Claiming Strategies

### Strategy 1: Direct Claim (User Has Gas)

```typescript
async function claimRBTC(
  swapData: BoltzSwapData,
  wallet: Wallet
): Promise<string> {
  // 1. Get contract address
  const contracts = await fetch(`${boltzApiUrl}/v2/chain/RBTC/contracts`);
  const { swapContracts } = await contracts.json();
  const etherSwapAddress = swapContracts.EtherSwap;

  // 2. Get ACTUAL parameters from blockchain event
  const params = await getLockupEventParameters(
    swapData.lockupTxHash!,
    swapData.preimageHash,
    wallet.provider
  );

  // 3. Create contract instance
  const contract = new Contract(etherSwapAddress, ETHER_SWAP_ABI, wallet);

  // 4. Call claim
  const tx = await contract.claim(
    '0x' + swapData.preimage,
    params.amount,           // ✅ From event
    params.refundAddress,    // ✅ From event  
    params.timelock          // ✅ From event
  );

  await tx.wait();
  return tx.hash;
}
```

### Strategy 2: Gasless Claim (RIF Relay)

When user has zero RBTC balance, use RIF Relay for gasless claiming.

See [RIF_RELAY_INTEGRATION.md](./RIF_RELAY_INTEGRATION.md) for complete details.

## Smart Wallet Claim Strategy

### Problem: Claim Address Must Match

The EtherSwap contract uses `msg.sender` as the claim address:

```solidity
bytes32 swapHash = keccak256(
  preimageHash, 
  amount, 
  msg.sender,      // ← The caller
  refundAddress, 
  timelock
);
```

When claiming via RIF Relay, `msg.sender` is the **Smart Wallet**, not the user's EOA!

### Solution: Determine Claim Address at Swap Creation

```typescript
async function createReverseSwap(params: {
  amountSats: number;
  rbtcAddress: string;
  walletSigner?: any;
}) {
  let claimAddress = params.rbtcAddress; // Default to user's EOA
  let useSmartWallet = false;

  // Check if user needs gasless claiming
  if (isRifRelayAvailable() && params.walletSigner) {
    const balance = await params.walletSigner.provider.getBalance(params.rbtcAddress);
    const gasEstimate = 100000n * 60000000n; // ~0.006 RBTC
    
    if (balance < gasEstimate) {
      // User has no gas - compute Smart Wallet address
      const smartWallet = await getSmartWalletAddress(params.walletSigner);
      claimAddress = smartWallet.address; // ✅ Use Smart Wallet
      useSmartWallet = true;
    }
  }

  // Create swap with correct claim address
  const response = await fetch(`${boltzApiUrl}/v2/swap/reverse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'BTC',
      to: 'RBTC',
      invoiceAmount: params.amountSats,
      preimageHash,
      claimAddress // ✅ Smart Wallet OR user's EOA
    })
  });

  // Store which address was used
  const swapData: BoltzSwapData = {
    ...response,
    rbtcAddress: params.rbtcAddress,  // User's actual wallet
    claimAddress,                      // Address used for claiming
    rifRelayUsed: useSmartWallet
  };

  return swapData;
}
```

### Claiming Logic

```typescript
async function handleClaimRequest(swapData: BoltzSwapData, wallet: Wallet) {
  const wasCreatedForSmartWallet = 
    swapData.claimAddress && 
    swapData.claimAddress !== swapData.rbtcAddress;

  if (wasCreatedForSmartWallet) {
    // MUST use RIF Relay - swap locked for Smart Wallet
    await claimRBTCViaRifRelay(swapData, wallet);
  } else {
    // Can use direct claim OR RIF Relay fallback
    const balance = await wallet.provider.getBalance(wallet.address);
    const gasEstimate = await estimateClaimGas();

    if (balance >= gasEstimate) {
      await claimRBTC(swapData, wallet); // Direct
    } else {
      await claimRBTCViaRifRelay(swapData, wallet); // Gasless
    }
  }
}
```

## Error Handling

### Common Errors

**1. "swap has no Ether locked in the contract"**

- **Cause**: Wrong parameters (using API values instead of actual locked amounts)
- **Solution**: Use event parameters from `getLockupEventParameters()`

**2. "Transaction receipt not found"**

- **Cause**: RPC node hasn't indexed transaction yet
- **Solution**: Poll with retry logic (up to 10 attempts, 2s delay)

**3. "insufficient funds for gas"**

- **Cause**: User has zero RBTC
- **Solution**: Use RIF Relay for gasless claiming

**4. "execution reverted"**

- **Cause**: Mismatch between swap creation claim address and actual claimer
- **Solution**: Ensure claim method matches how swap was created

## Testing

### Regtest Environment

```bash
# 1. Start Boltz regtest
docker-compose up -d

# 2. Fund test wallet
cast send --rpc-url http://localhost:8545 \
  --private-key <ANVIL_KEY> \
  <USER_ADDRESS> \
  --value 0.01ether

# 3. Create reverse swap in BitTasker

# 4. Pay Lightning invoice
lncli-sim 1 payinvoice <INVOICE>

# 5. Watch for auto-claim
# Console should show:
# ✅ Lockup confirmed
# 🎯 Claiming with actual parameters
# ✅ Claim successful
# 🎉 RBTC received
```

## Production Considerations

### Fee Structure

- **Boltz Service Fee**: 0.4% of swap amount
- **Lightning Routing**: ~0.01-0.1% (variable)
- **RBTC Gas**: ~$0.01 (or $0 with RIF Relay)

**Example for 100,000 sats:**
- Service: ~400 sats
- Routing: ~10-100 sats  
- Gas: $0.01 or $0

### Rate Limits

- Boltz API has rate limiting
- Implement exponential backoff for retries
- Cache contract addresses (they rarely change)

### Security

- ✅ Validate all API responses
- ✅ Verify lockup transaction on-chain before claiming
- ✅ Always use event parameters for claiming
- ✅ Encrypt sensitive data (preimages) in Nostr storage
- ❌ Never expose private keys
- ❌ Never trust API amounts without verification

## Contract ABI Implementation

### Current: Using boltz-core ABI (Recommended)

We use Boltz's official EtherSwap ABI directly from `boltz-core`:

```typescript
import EtherSwapArtifact from 'boltz-core/out/EtherSwap.sol/EtherSwap.json';

const contract = new Contract(
  contractAddress,
  EtherSwapArtifact.abi,
  signer
);
```

**Benefits:**
- ✅ Always in sync with Boltz's actual contract
- ✅ Access to all contract functions
- ✅ No need to maintain separate ABI files
- ✅ Guaranteed compatibility

### Deprecated: TypeChain-Generated Bindings

**Note**: We previously used TypeChain to generate TypeScript bindings from the EtherSwap ABI. This provided excellent type safety but required manual maintenance to stay in sync with Boltz's contracts.

#### What TypeChain Provided

TypeChain generated type-safe wrappers:
- ✅ **Type Safety**: Compile-time checking of contract method calls
- ✅ **Autocomplete**: IntelliSense support for methods and events
- ✅ **Error Prevention**: Catch parameter mismatches before runtime
- ✅ **Better DX**: Clear documentation through TypeScript interfaces

#### Usage Pattern (Deprecated)

```typescript
import { EtherSwap__factory } from '$lib/contracts';

// The factory's connect() method was just a helper that did:
// new Contract(address, abi, signer)
const etherSwap = EtherSwap__factory.connect(
  contractAddress,
  walletSigner
);

// Full TypeScript types for all methods
const tx = await etherSwap.claim(
  preimage,      // BytesLike - typed!
  amount,        // BigNumberish - typed!
  refundAddress, // AddressLike - typed!
  timelock       // BigNumberish - typed!
);
```

#### Why We Switched

1. **Maintenance**: TypeChain bindings needed regeneration when contract changed
2. **Redundancy**: `boltz-core` already exports the official ABI
3. **Sync Risk**: Our generated ABI could drift from Boltz's actual contract
4. **Simplicity**: Direct ABI import is more straightforward

#### Migration Path

If you need to regenerate TypeChain bindings in the future:

```bash
# 1. Install TypeChain
npm install -D typechain @typechain/ethers-v6

# 2. Get latest ABI from boltz-core
# node_modules/boltz-core/out/EtherSwap.sol/EtherSwap.json

# 3. Generate bindings
npx typechain --target ethers-v6 \
  --out-dir src/lib/contracts \
  'path/to/abi/*.json'
```

**File Structure (Deprecated):**
```
contracts/
├── README.md
├── abis/
│   └── EtherSwap.json          # Contract ABI
├── common.ts                    # TypeChain common types
├── EtherSwap.ts                 # Contract interface
├── index.ts                     # Exports
└── factories/
    └── EtherSwap__factory.ts   # Contract factory with connect()
```

The `EtherSwap__factory.connect()` method was essentially:
```typescript
static connect(address: string, runner?: ContractRunner | null): EtherSwap {
  return new Contract(address, _abi, runner) as unknown as EtherSwap;
}
```

## References

- [Boltz API v2 Documentation](https://api.docs.boltz.exchange/api-v2.html)
- [Boltz Exchange](https://boltz.exchange/)
- [EtherSwap Contract Source](https://github.com/BoltzExchange/boltz-core/blob/master/contracts/EtherSwap.sol)
- [Boltz GitHub](https://github.com/BoltzExchange)
- [TypeChain Documentation](https://github.com/dethcrypto/TypeChain) (for reference)

