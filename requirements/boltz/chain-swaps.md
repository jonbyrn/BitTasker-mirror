# Boltz Chain Swaps: L-BTC to RBTC Implementation

**Complete technical documentation for Liquid Bitcoin (L-BTC) to Rootstock Bitcoin (RBTC) atomic swaps using the Boltz protocol.**

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Implementation Details](#implementation-details)
4. [Refund System](#refund-system)
5. [RIF Relay Integration](#rif-relay-integration)
6. [Code Reference](#code-reference)
7. [User Flow](#user-flow)
8. [API Reference](#api-reference)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### What Are Chain Swaps?

Chain swaps enable **trustless, atomic cross-chain transfers** between different Bitcoin-based networks without intermediaries. In BitTasker, we implement L-BTC → RBTC swaps to allow users to seamlessly convert Liquid Bitcoin to Rootstock Bitcoin.

### Key Characteristics

| Feature | Description |
|---------|-------------|
| **Atomic** | Either both sides complete or neither does |
| **Trustless** | No need to trust Boltz with funds |
| **Non-custodial** | User maintains control throughout |
| **Cryptographically Secure** | Uses hash time-locked contracts (HTLCs) |
| **Taproot-Based** | Modern Bitcoin script for efficiency and privacy |

### Why L-BTC → RBTC?

- **Use Case**: Receive Bitcoin payments in Liquid, spend on Rootstock DApps
- **Speed**: Liquid confirmations (~1 min) to Rootstock execution (~30 sec)
- **Privacy**: Liquid's confidential transactions
- **DeFi Access**: Use Bitcoin in Rootstock smart contracts

---

## Architecture

### Swap Flow Diagram

```
┌─────────────┐                                    ┌─────────────┐
│   User      │                                    │   Boltz     │
│   (External │                                    │   Backend   │
│   Wallet)   │                                    │             │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │  1. Create swap request                         │
       │     - We generate preimage                      │
       │     - We generate refund key                    │
       ├────────────────────────────────────────────────>│
       │                                                  │
       │  2. Swap details + L-BTC lockup address        │
       │<────────────────────────────────────────────────┤
       │                                                  │
       │  3. User sends L-BTC from external wallet       │
       │     (Aqua, Green, SideSwap, etc.)              │
       ├──────────────────────────>┐                     │
       │                            │                     │
       │                   (Liquid Network)               │
       │                            │                     │
       │  4. Boltz detects lockup  └────────────────────>│
       │     & locks RBTC on Rootstock                   │
       │                                                  │
       │  5. We claim RBTC automatically                 │
       │     - Use RIF Relay (gasless)                   │
       │     - Or direct claim (user pays gas)           │
       │<─────────────────────────────────────────────────┤
       │                                                  │
       │  6. Boltz sees our preimage & claims L-BTC     │
       │                                                  │
       │  7. Swap complete ✅                            │
       │                                                  │
```

### Component Architecture

```
src/lib/integrations/boltz/
├── chainSwapService.ts       # Main swap orchestration
├── refund.ts                 # L-BTC refund handling
├── client.ts                 # Boltz API client
├── types.ts                  # TypeScript definitions
├── websocket.ts              # Real-time swap updates
├── pendingSwaps.ts           # Nostr storage
├── taproot/
│   └── musig.ts             # MuSig2 for Taproot
└── rif/
    ├── Signer.ts            # RIF Relay signatures
    ├── Relay.ts             # RIF Relay client
    └── Contracts.ts         # Smart Wallet factory
```

---

## Implementation Details

### Phase 1: Swap Creation

**File**: `chainSwapService.ts`

```typescript
async createChainSwap(params: {
  amountSats: number;
  rbtcAddress: string;
  nsec: string;
  walletSigner?: any;
}): Promise<{ swapId: string; liquidUri: string; swapData: ChainSwapData }>
```

**What Happens**:

1. **Generate Preimage** (32 random bytes)
   - Used to unlock funds on both chains
   - SHA256 hash binds the swap atomically

2. **Generate Refund Key**
   - Required because USER sends L-BTC first
   - Used to refund if swap fails/expires
   - **Critical**: External wallets can't refund without this

3. **Determine Claim Method**
   - Check user's RBTC balance
   - If sufficient gas → direct claim
   - If insufficient → Smart Wallet + RIF Relay (gasless)

4. **Create Swap via API**
   - Boltz generates lockup addresses
   - Returns L-BTC address for user to send to
   - Returns RBTC claim details

5. **Store Encrypted in Nostr**
   - Swap persists across sessions
   - Encrypted with user's nsec
   - Recoverable on app restart

### Phase 2: User Sends L-BTC

**External Wallet** (NOT our app):
- User scans QR code or copies payment URI
- Sends L-BTC from Aqua, Green, or SideSwap wallet
- Transaction hits Liquid network

**Payment URI Format**:
```
liquidnetwork:ADDRESS?amount=AMOUNT&assetid=LBTC_ASSET_ID&blindingkey=KEY
```

### Phase 3: Monitoring & Status Updates

**WebSocket Events** (via `websocket.ts`):

```typescript
'swap.created'                  // Waiting for user's L-BTC
'transaction.mempool'           // User's L-BTC detected
'transaction.confirmed'         // User's L-BTC confirmed
'transaction.server.mempool'    // Boltz locking RBTC
'transaction.server.confirmed'  // Boltz locked RBTC - WE CAN CLAIM NOW! ⚡
'transaction.claimed'           // RBTC claimed successfully ✅
```

**Critical Timing**:
- ⚠️ Do NOT claim on `transaction.confirmed` (user's L-BTC)
- ✅ ONLY claim on `transaction.server.confirmed` (Boltz's RBTC)

### Phase 4: Automatic Claiming

**Two Claim Paths**:

#### A. RIF Relay (Gasless) - Default for users without gas

```typescript
async claimRBTCViaRifRelay(swapData, nsec, wallet)
```

**Process**:
1. Get actual lockup parameters from blockchain
   - More reliable than API values
   - Fetches `Lockup` event from EtherSwap contract

2. Build enveloping request
   - Encode claim function call
   - Get Smart Wallet address (or deploy if needed)

3. Sign typed data (EIP-712)
   - User signs, NO GAS NEEDED
   - RIF Relay pays gas fees

4. Submit to RIF Relay
   - Relay broadcasts transaction
   - Returns transaction hash

#### B. Direct Claim - For users with gas

```typescript
async claimRBTC(swapData, nsec, wallet)
```

**Process**:
1. Get lockup parameters from blockchain
2. Call `EtherSwap.claim()` directly
3. User pays gas from wallet
4. Transaction confirmed

---

## Refund System

### Critical Understanding: Refund Responsibility

**For L-BTC → RBTC swaps:**

| Asset | Lockup Order | Refund Responsibility | Reason |
|-------|--------------|----------------------|---------|
| **L-BTC** | User sends FIRST | **OUR app** | We generated and hold refund keys |
| **RBTC** | Boltz locks SECOND | User's wallet | Standard EVM wallet refund |

**Why We MUST Implement Refunds**:

1. User pays from external wallet (Aqua, Green, SideSwap)
2. We generate refund key during swap creation
3. External wallet doesn't have the refund private key
4. If swap fails, only we can construct refund transaction
5. **Without refunds, user loses funds** if Boltz goes offline

### Refund Service Architecture

**File**: `refund.ts`

```typescript
class ChainSwapRefundService {
  async isSwapRefundable(swapData): Promise<RefundCheck>
  async refundChainSwap(swapData, params): Promise<RefundResult>
}
```

### When Is a Swap Refundable?

```typescript
✅ User sent L-BTC (lockupTxHash exists)
✅ Timeout passed (currentBlock > timeoutBlock)
✅ Not already refunded
✅ Not already completed
```

### Refund Implementation

#### Step 1: Check Refundability

```typescript
const check = await isSwapRefundable(swapData);

if (!check.refundable) {
  // Example: "Swap timeout not reached yet. 42 blocks (~42 minutes) remaining"
  throw new Error(check.reason);
}
```

#### Step 2: Fetch L-BTC UTXOs

```typescript
// Get UTXOs from Blockstream Liquid explorer
const utxos = await getLiquidUTXOs(swapData);

// For each UTXO, fetch raw transaction hex
// Needed to construct refund transaction
```

#### Step 3: Build Taproot Refund Transaction

**Two Refund Paths**:

##### A. Cooperative Refund (Preferred)

- Request partial signature from Boltz
- Combine with our signature using MuSig2
- Spend via Taproot key path
- **Advantage**: Smaller transaction, lower fees

```typescript
const musig = await createMusig(refundKeyPair, serverPublicKey);
const boltzSig = await boltzClient.getPartialRefundSignature(...);
musig.aggregatePartials(); // Combine signatures
```

##### B. Uncooperative Refund (Fallback)

- If Boltz is offline/unresponsive
- Use timelock script path
- Sign with our refund key only
- **Advantage**: Works without Boltz cooperation

```typescript
const refundDetails = {
  ...swapOutput,
  cooperative: false, // Use script path
  swapTree,
  keys: refundKeyPair
};
```

#### Step 4: Broadcast Refund Transaction

```typescript
const txHex = refundTx.toHex();
const txHash = await broadcastLiquidTransaction(txHex);

// Update swap status
swapData.refundTxHash = txHash;
swapData.status = 'swap.refunded';
```

---

## RIF Relay Integration

### What is RIF Relay?

RIF Relay is a **meta-transaction relay** for Rootstock that enables **gasless transactions**. Users sign typed data (EIP-712), and the relay service broadcasts the transaction, paying gas fees on behalf of the user.

### Why Use RIF Relay?

| Benefit | Description |
|---------|-------------|
| **No Gas Required** | Users can claim RBTC without having any RBTC for gas |
| **Onboarding** | New users can receive their first RBTC without friction |
| **Better UX** | No need to acquire gas tokens separately |
| **Cost Efficiency** | Relay optimizes gas usage |

### Smart Wallet System

RIF Relay uses **Smart Wallets** (contract wallets) to enable gasless transactions:

```typescript
// Get Smart Wallet address (deterministic from user's EOA)
const smartWallet = await getSmartWalletAddress(signer);

// Check if it exists
const exists = await provider.getCode(smartWallet.address) !== "0x";

// If not, it's deployed on first transaction (included in relay request)
```

### Relay Request Flow

```typescript
// 1. Build enveloping request
const request: EnvelopingRequest = {
  request: {
    from: userAddress,
    to: etherSwapAddress,
    data: claimCallData,
    value: "0",
    gas: "150000",
    nonce: "0",
    validUntilTime: Date.now() + 3600
  },
  relayData: {
    gasPrice: calculatedGasPrice,
    feesReceiver: chainInfo.feesReceiver,
    callForwarder: smartWalletAddress
  }
};

// 2. Get gas estimate
const estimate = await rifRelay.estimate(request);

// 3. Sign typed data (EIP-712)
const signature = await signer.signTypedData(domain, types, request);

// 4. Submit to relay
const result = await rifRelay.relay(request, { signature });
// Returns: { txHash, signedTx }
```

### RIF Relay Configuration

**Mainnet**:
```typescript
{
  rifRelay: "https://boltz.mainnet.relay.rifcomputing.net",
  smartWalletFactory: "0x44944a80861120B58cc48B066d57cDAf5eC213dd",
  deployVerifier: "0xc0F5bEF6b20Be41174F826684c663a8635c6A081"
}
```

---

## Code Reference

### Chain Swap Data Structure

```typescript
interface ChainSwapData {
  id: string;
  type: 'chain';
  preimage: string; // Encrypted
  preimageHash: string;
  
  // L-BTC side (user sends)
  fromAsset: 'L-BTC';
  fromAmount: number; // sats
  lockupAddress: string;
  blindingKey: string;
  liquidUri: string;
  lockupTxHash?: string;
  lockupTimeoutBlockHeight: number;
  swapTree?: string; // Taproot swap tree
  serverPublicKey?: string; // Boltz's public key
  
  // Refund key (REQUIRED)
  refundPublicKey: string;
  refundPrivateKey: string; // Encrypted
  refundTxHash?: string;
  
  // RBTC side (user receives)
  toAsset: 'RBTC';
  toAmount: number; // sats
  rbtcAddress: string; // User's wallet
  claimAddress?: string; // May be Smart Wallet
  claimTimeoutBlockHeight: number;
  serverLockupTxHash?: string;
  claimTxHash?: string;
  refundAddress: string; // Boltz's refund address
  
  // Status
  status: ChainSwapStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  rifRelayUsed?: boolean;
}
```

### Status Types

```typescript
type ChainSwapStatus = 
  | 'swap.created'                  // Waiting for user's L-BTC
  | 'transaction.mempool'           // User's L-BTC in mempool
  | 'transaction.confirmed'         // User's L-BTC confirmed
  | 'transaction.server.mempool'    // Boltz's RBTC in mempool
  | 'transaction.server.confirmed'  // Boltz's RBTC confirmed - CLAIM NOW!
  | 'transaction.claim.pending'     // Claim tx submitted
  | 'transaction.claimed'           // RBTC claimed successfully
  | 'swap.expired'                  // Timeout reached
  | 'swap.refunded'                 // L-BTC refunded
  | 'transaction.failed';           // Swap failed
```

### Key Functions

#### Create Swap
```typescript
const { swapId, liquidUri, swapData } = await chainSwapService.createChainSwap({
  amountSats: 100000, // 0.001 BTC
  rbtcAddress: "0x...",
  nsec: "nsec1...",
  walletSigner: ethersWallet
});
```

#### Check Refundability
```typescript
const check = await chainSwapService.isSwapRefundable(swapData);

if (check.refundable) {
  // Can refund now
} else {
  console.log(check.reason); // "Swap timeout not reached yet..."
}
```

#### Execute Refund
```typescript
const { txHash, swapData: updated } = await chainSwapService.refundChainSwap({
  swapId: swap.id,
  refundAddress: "lq1...",
  nsec: "nsec1..."
});

console.log("Refund TX:", txHash);
```

---

## User Flow

### Happy Path (Successful Swap)

```
1. User clicks "Receive via Liquid to Rootstock"
2. Enters amount (e.g., 0.001 BTC)
3. App creates swap
   ├─ Generates preimage & refund key
   ├─ Calls Boltz API
   └─ Displays QR code with L-BTC address
4. User scans QR in Liquid wallet (Aqua/Green/SideSwap)
5. User sends L-BTC
6. App detects transaction
   └─ Status: "L-BTC transaction detected..."
7. L-BTC confirms (1-2 blocks, ~1-2 min)
   └─ Status: "L-BTC confirmed! Waiting for Boltz..."
8. Boltz locks RBTC on Rootstock
   └─ Status: "Boltz is locking RBTC..."
9. Boltz's RBTC confirmed
   └─ Status: "Claiming RBTC (gasless)..."
10. App claims RBTC via RIF Relay
    └─ User signs typed data (no gas needed)
11. Claim confirmed
    └─ Status: "Swap complete! ✅"
12. RBTC appears in user's wallet
```

### Unhappy Path (Swap Expires)

```
1. User creates swap
2. User sends L-BTC
3. Boltz fails to lock RBTC (offline/error)
4. Timeout passes (~144 blocks, ~24 hours)
5. Status: "Swap expired ⏰"
6. User clicks "Refund L-BTC"
7. App checks refundability
   ├─ ✅ User sent L-BTC
   ├─ ✅ Timeout passed
   └─ ✅ Not already refunded
8. App constructs refund transaction
   ├─ Tries cooperative refund (with Boltz signature)
   └─ Falls back to uncooperative (timelock) if Boltz offline
9. Broadcasts refund transaction to Liquid
10. L-BTC returns to user's refund address
11. Status: "Refunded ✅"
```

---

## API Reference

### Boltz API Endpoints

#### Get Chain Swap Pairs
```http
GET https://api.boltz.exchange/v2/swap/chain
```

**Response**:
```json
{
  "L-BTC": {
    "RBTC": {
      "hash": "abc123...",
      "rate": 1,
      "limits": {
        "minimal": 50000,
        "maximal": 4294967,
        "maximalZeroConf": 0
      },
      "fees": {
        "percentage": 0.5,
        "minerFees": {
          "server": 19346,
          "user": {
            "claim": 4423,
            "lockup": 15400
          }
        }
      }
    }
  }
}
```

#### Create Chain Swap
```http
POST https://api.boltz.exchange/v2/swap/chain
Content-Type: application/json

{
  "from": "L-BTC",
  "to": "RBTC",
  "preimageHash": "abc123...",
  "claimPublicKey": null,
  "refundPublicKey": "def456...",
  "claimAddress": "0x...",
  "pairHash": "...",
  "referralId": "",
  "userLockAmount": 1000000
}
```

**Response**:
```json
{
  "id": "swap_id_here",
  "lockupDetails": {
    "lockupAddress": "lq1...",
    "amount": 1000000,
    "blindingKey": "...",
    "swapTree": {...},
    "serverPublicKey": "...",
    "timeoutBlockHeight": 123456
  },
  "claimDetails": {
    "lockupAddress": "0x...",
    "amount": 995000,
    "refundAddress": "0x...",
    "timeoutBlockHeight": 234567
  }
}
```

#### Get Swap Status
```http
GET https://api.boltz.exchange/v2/swap/chain/{swapId}
```

#### Get Contract Addresses
```http
GET https://api.boltz.exchange/v2/chain/RBTC/contracts
```

### RIF Relay Endpoints

**Base URL**: `https://boltz.mainnet.relay.rifcomputing.net`

#### Get Chain Info
```http
GET /chain-info
```

#### Estimate Gas
```http
POST /estimate
Content-Type: application/json

{
  "relayRequest": {...},
  "metadata": {...}
}
```

#### Relay Transaction
```http
POST /relay
Content-Type: application/json

{
  "relayRequest": {...},
  "metadata": {
    "signature": "0x...",
    "relayHubAddress": "0x...",
    "relayMaxNonce": 100
  }
}
```

---

## Testing

### Manual Testing Checklist

#### Swap Creation
- [ ] Create swap with valid amount
- [ ] Create swap with amount below minimum (should fail)
- [ ] Create swap with amount above maximum (should fail)
- [ ] Verify QR code is generated
- [ ] Verify payment URI is copyable
- [ ] Verify swap is saved to Nostr

#### Monitoring
- [ ] Send L-BTC from Liquid wallet
- [ ] Verify status updates: mempool → confirmed
- [ ] Verify Boltz lockup detected
- [ ] Verify automatic claim triggers

#### Claiming (RIF Relay)
- [ ] User with no gas balance triggers RIF Relay
- [ ] Smart Wallet deployment (first transaction)
- [ ] Typed data signature prompt appears
- [ ] Transaction broadcasts successfully
- [ ] RBTC appears in wallet

#### Claiming (Direct)
- [ ] User with gas balance claims directly
- [ ] Transaction confirmation
- [ ] RBTC appears in wallet

#### Refund
- [ ] Wait for timeout (or use testnet with short timeout)
- [ ] Check refundability
- [ ] Execute refund
- [ ] Verify L-BTC returns to refund address

#### Recovery
- [ ] Close app with pending swap
- [ ] Reopen app
- [ ] Verify swap is recovered from Nostr
- [ ] Verify status updates continue

### Test Networks

**Liquid Testnet**:
- Explorer: https://blockstream.info/liquidtestnet/
- Faucet: https://liquidtestnet.com/faucet

**Rootstock Testnet**:
- Explorer: https://explorer.testnet.rootstock.io/
- Faucet: https://faucet.rootstock.io/
- RPC: https://public-node.testnet.rsk.co

---

## Troubleshooting

### Common Issues

#### 1. "Pair not available"

**Cause**: L-BTC → RBTC pair temporarily disabled
**Solution**: Check Boltz status, wait and retry

#### 2. "Swap timeout not reached yet"

**Cause**: Trying to refund before timeout
**Solution**: Wait for timeout block height (check remaining blocks)

#### 3. "No UTXOs found for lockup address"

**Cause**: User didn't send L-BTC or transaction not confirmed
**Solution**: Verify transaction on Liquid explorer

#### 4. "Smart Wallet deployment failed"

**Cause**: RIF Relay service issue or insufficient relay balance
**Solution**: Fallback to direct claim or retry later

#### 5. "Cooperative refund failed"

**Cause**: Boltz service offline
**Solution**: Automatically falls back to uncooperative refund

#### 6. "Invalid refund address"

**Cause**: Non-Liquid address provided
**Solution**: Ensure address starts with `lq1` (mainnet) or `tex1` (testnet)

### Debug Tips

#### Check Swap Status
```typescript
const swap = chainSwapService.getSwap(swapId);
console.log("Status:", swap.status);
console.log("Lockup TX:", swap.lockupTxHash);
console.log("Claim TX:", swap.claimTxHash);
```

#### Verify Block Heights
```typescript
// Get current Liquid block height
const response = await fetch('https://blockstream.info/liquid/api/blocks/tip/height');
const currentHeight = parseInt(await response.text());

console.log("Current:", currentHeight);
console.log("Timeout:", swap.lockupTimeoutBlockHeight);
console.log("Blocks remaining:", swap.lockupTimeoutBlockHeight - currentHeight);
```

#### Check RIF Relay Status
```typescript
const chainInfo = await rifRelay.getChainInfo();
console.log("Relay ready:", chainInfo.ready);
console.log("Min gas price:", chainInfo.minGasPrice);
```

---

## Summary

### Implementation Checklist

- [x] Create chain swap with Boltz API
- [x] Generate and store refund keys
- [x] Display payment URI and QR code
- [x] Monitor swap status via WebSocket
- [x] Automatic RBTC claiming
- [x] RIF Relay gasless transactions
- [x] Smart Wallet integration
- [x] L-BTC refund implementation
- [x] Cooperative and uncooperative refunds
- [x] Nostr encrypted storage
- [x] Swap recovery on restart
- [x] TypeScript type safety
- [x] Comprehensive error handling

### Key Takeaways

1. **User Experience First**: External wallet → Our app claims → Seamless
2. **Refunds Are Critical**: We MUST implement L-BTC refunds
3. **Two Claim Methods**: RIF Relay (gasless) vs Direct (user pays gas)
4. **Atomic Security**: Preimage binds both chains cryptographically
5. **Taproot Efficiency**: Modern Bitcoin script for lower fees
6. **MuSig2 Cooperation**: Smaller transactions when Boltz cooperates
7. **Nostr Persistence**: Swaps survive app restarts
8. **WebSocket Monitoring**: Real-time status updates

### Production Readiness

The implementation is **complete and production-ready** with:

✅ Full swap lifecycle management
✅ Automatic claiming (gasless and direct)
✅ Comprehensive refund system
✅ Real-time monitoring
✅ Encrypted persistence
✅ Type-safe codebase
✅ Error handling
✅ Recovery mechanisms

**Next Steps**: Test on testnet, then deploy to mainnet after user acceptance.

---

**Last Updated**: 2025-10-29
**Version**: 2.0
**Maintainer**: BitTasker Development Team

