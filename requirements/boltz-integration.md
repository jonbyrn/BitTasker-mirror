# Boltz Integration Guide for BitTasker

## Overview

BitTasker integrates with Boltz Exchange to enable seamless Lightning ↔ RBTC swaps. This document covers the Boltz-specific integration details for reverse swaps (Lightning → RBTC).

## Reverse Swap Flow

### Complete Transaction Flow

```
1. User requests RBTC (e.g., 0.0007 BTC)
   ↓
2. BitTasker creates reverse swap via Boltz API
   POST /v2/swap/reverse
   {
     "from": "BTC",
     "to": "RBTC",
     "invoiceAmount": 70000,  // sats
     "preimageHash": "<sha256_hash>",
     "claimAddress": "<user_rsk_address>"
   }
   ↓
3. Boltz returns Lightning invoice
   Response: { "id": "abc123", "invoice": "lnbc...", ... }
   ↓
4. User pays Lightning invoice
   (from their Lightning wallet)
   ↓
5. Boltz locks RBTC in EtherSwap contract
   Status: "transaction.mempool" → "transaction.confirmed"
   ↓
6. BitTasker claims RBTC (requires gas)
   Calls: EtherSwap.claim(preimage, amount, refundAddress, timelock)
   ↓
7. RBTC transferred to user's wallet
   Status: "invoice.settled"
```

## API Endpoints

### Base URLs
- **Mainnet**: `https://api.boltz.exchange`
- **Regtest**: `http://localhost:9001`

### Key Endpoints

#### 1. Create Reverse Swap
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
  "blindingKey": "..."
}
```

#### 2. Get Swap Status
```http
GET /v2/swap/reverse/{id}
```

#### 3. Get Chain Contracts
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
    "EtherSwap": "0x...",
    "ERC20Swap": "0x..."
  }
}
```

## WebSocket Updates

Connect to WebSocket for real-time swap status updates:

```typescript
const ws = new WebSocket('wss://api.boltz.exchange/v2/ws');

ws.send(JSON.stringify({
  op: 'subscribe',
  channel: 'swap.update',
  args: [swapId]
}));

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Status:', update.status);
};
```

## Swap Status States

| Status | Description | Action Required |
|--------|-------------|-----------------|
| `swap.created` | Swap created, waiting for invoice payment | User needs to pay Lightning invoice |
| `invoice.set` | Invoice paid, payment held by Boltz | Wait for lockup (this is NORMAL) |
| `transaction.mempool` | Boltz lockup transaction in mempool | Wait for confirmation |
| `transaction.confirmed` | Lockup confirmed on blockchain | **Claim RBTC now** |
| `transaction.claim.pending` | Claim transaction submitted | Wait for confirmation |
| `invoice.settled` | Swap complete, RBTC claimed | Success! |
| `swap.expired` | Swap expired (timeout) | Refund may be possible |

**Important**: `invoice.set` means payment is held (IN_FLIGHT) by Boltz - this is normal behavior, not a failure!

## Event-Based Claiming

### The Problem

Boltz API returns **estimated** values that may differ from actual on-chain values after fee deductions.

**Example:**
- API says: `onchainAmount: 65076 sats`
- Actual locked: `64812 sats` (after fees)
- Using API value → claim fails!

### The Solution

Always fetch **actual parameters from blockchain events**:

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
  // 1. Poll for transaction receipt (RPC needs time to index)
  let receipt = null;
  for (let i = 0; i < 10; i++) {
    receipt = await provider.getTransactionReceipt(lockupTxHash);
    if (receipt) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  if (!receipt) {
    throw new Error('Transaction receipt not found after 10 attempts');
  }

  // 2. Parse Lockup event
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
          amount: parsed.args[1],        // EXACT amount
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

### EtherSwap Contract ABI

```typescript
const ETHER_SWAP_ABI = [
  // Claim function (msg.sender receives funds)
  'function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timelock) external',
  
  // Lockup event (emitted when Boltz locks funds)
  'event Lockup(bytes32 indexed preimageHash, uint256 amount, address claimAddress, address indexed refundAddress, uint256 timelock)',
  
  // Claim event (emitted when claim succeeds)
  'event Claim(bytes32 indexed preimageHash, bytes32 preimage)'
];
```

## Direct Claiming (User Has Gas)

When user has sufficient RBTC for gas fees:

```typescript
async function claimRBTC(
  swapData: BoltzSwapData,
  wallet: Wallet
): Promise<string> {
  // 1. Get contract address from Boltz API
  const contracts = await fetch(`${boltzApiUrl}/v2/chain/RBTC/contracts`);
  const { swapContracts } = await contracts.json();
  const etherSwapAddress = swapContracts.EtherSwap;

  // 2. Get actual lockup parameters from blockchain event
  const params = await getLockupEventParameters(
    swapData.lockupTxHash!,
    swapData.preimageHash,
    wallet.provider
  );

  // 3. Create contract instance
  const contract = new Contract(etherSwapAddress, ETHER_SWAP_ABI, wallet);

  // 4. Convert preimage to bytes32
  const preimageBytes32 = '0x' + swapData.preimage;

  // 5. Call claim function
  const tx = await contract.claim(
    preimageBytes32,
    params.amount,
    params.refundAddress,
    params.timelock
  );

  // 6. Wait for confirmation
  const receipt = await tx.wait();
  
  return receipt.hash;
}
```

### Gas Estimation

```typescript
async function estimateClaimGas(): Promise<bigint> {
  const gasLimit = 200000n; // EtherSwap.claim() gas limit
  const gasPrice = await provider.getFeeData();
  return gasLimit * (gasPrice.gasPrice || 60000000n);
}

// Check if user has enough gas
async function userHasGas(wallet: Wallet): Promise<boolean> {
  const balance = await wallet.provider.getBalance(wallet.address);
  const required = await estimateClaimGas();
  return balance >= required;
}
```

## Error Handling

### Common Errors

1. **"execution reverted"**
   - **Cause**: Wrong parameters (amount/refundAddress/timelock)
   - **Solution**: Always use event parameters, not API values

2. **"swap doesn't exist"**
   - **Cause**: Using API's estimated amount instead of actual locked amount
   - **Solution**: Parse Lockup event from transaction receipt

3. **"Transaction receipt not found"**
   - **Cause**: RPC node hasn't indexed transaction yet
   - **Solution**: Poll with retries (up to 10 attempts, 2s delays)

4. **"insufficient funds for gas"**
   - **Cause**: User has zero RBTC balance
   - **Solution**: Use RIF Relay for gasless claiming (see rif-relay-integration.md)

### Example Error Handler

```typescript
try {
  const txHash = await claimRBTC(swapData, wallet);
  console.log('✅ Claim successful:', txHash);
} catch (error) {
  if (error.message.includes('execution reverted')) {
    console.error('❌ Claim failed: Invalid parameters');
    // Try re-fetching event parameters
  } else if (error.message.includes('insufficient funds')) {
    console.error('❌ User needs RBTC for gas');
    // Fallback to RIF Relay gasless claim
  } else {
    console.error('❌ Claim failed:', error);
  }
}
```

## Testing in Regtest

### Prerequisites
1. Boltz regtest environment running
2. RSK node (Anvil) running at `localhost:8545`
3. Lightning node for paying invoices

### Test Flow

```bash
# 1. Fund test wallet with RBTC (for gas)
cast send --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  <USER_ADDRESS> \
  --value 0.01ether

# 2. Create reverse swap in BitTasker
# 3. Copy Lightning invoice

# 4. Pay invoice from Lightning node
lncli-sim 1 payinvoice <INVOICE>

# 5. Watch BitTasker console for:
#    - transaction.mempool
#    - transaction.confirmed
#    - Auto-claim triggered
#    - invoice.settled
```

## Production Considerations

### Fee Structure
- **Boltz Service Fee**: 0.4% of swap amount
- **Lightning Routing**: ~0.01-0.1% (variable)
- **RBTC Gas**: User pays (unless using RIF Relay)

**Example for 100,000 sats:**
- Service: ~400 sats
- Routing: ~10-100 sats
- Gas: ~$0.01 (or $0 with RIF Relay)

### Rate Limits
- Boltz API has rate limiting
- Implement exponential backoff for retries
- Cache contract addresses (they don't change often)

### Security
- **Never** expose user private keys
- Validate all Boltz API responses
- Verify lockup transaction on-chain before claiming
- Use event parameters, not API estimates

## References

- [Boltz API v2 Documentation](https://api.docs.boltz.exchange/api-v2.html)
- [Boltz Exchange](https://boltz.exchange/)
- [Boltz GitHub](https://github.com/BoltzExchange)
- [EtherSwap Contract](https://github.com/BoltzExchange/boltz-core/blob/master/contracts/EtherSwap.sol)

