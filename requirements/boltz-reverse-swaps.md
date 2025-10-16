# Boltz Reverse Submarine Swaps: Lightning to Rootstock

## Overview

This document outlines the implementation approach for reverse submarine swaps from Lightning Network to Rootstock (RBTC) using Boltz API. This is critical for BitTasker's escrow system, allowing users to move funds from Lightning (where most users operate) to Rootstock smart contracts for escrow functionality.

## What are Reverse Submarine Swaps?

Reverse Submarine Swaps move bitcoin from **Lightning to an on-chain address** (in our case, Rootstock/RBTC). The process is trustless and atomic:

1. **Client generates preimage** - A random 32-byte preimage and its SHA256 hash
2. **Boltz creates hold invoice** - Using the hash, can only be settled when preimage is revealed
3. **User pays invoice** - Lightning payment pending, not executed yet
4. **Boltz locks RBTC** - On Rootstock chain using the same hash
5. **Client claims RBTC** - Reveals preimage to claim, which allows Boltz to settle Lightning invoice

## Rootstock Integration

Boltz has integrated with Rootstock using RIF Relay's sponsored transactions. This is particularly beneficial because:

- Users can obtain RBTC without needing pre-existing RBTC for gas fees
- Sponsored transactions eliminate the "chicken and egg" problem
- Seamless swaps between Bitcoin layers and RSK

## Fee Structure

### Service Fees
- **Boltz Service Fee**: 0.4% of the swap amount for reverse submarine swaps (Lightning → On-chain)
- This is a percentage-based fee applied to the total amount

### Network Fees
- **Lightning Routing Fees**: Incurred when sending funds over Lightning Network
- **RBTC Transaction Fees**: Depend on current network conditions
- **Boltz estimates fees** to ensure transactions confirm within reasonable time

### Fee Minimization Strategies

1. **Use RIF Relay Sponsored Transactions**
   - Eliminates need to hold RBTC for gas fees
   - Reduces number of transactions needed

2. **Monitor Network Conditions**
   - Perform swaps during low congestion periods
   - Lower on-chain fees during these times

3. **Optimize Swap Amounts**
   - Larger transactions may have lower percentage overhead
   - Always verify current fee structures before swapping

4. **Magic Routing Hints (MRH)**
   - Can skip swaps entirely in some scenarios
   - Direct payments between compatible wallets
   - Significant cost reduction when applicable

### Estimated Total Fees
For a typical reverse swap (Lightning → RBTC):
- Service Fee: 0.4% of amount
- Lightning routing: Variable (typically 0.01-0.1%)
- RBTC gas: Variable based on network (with RIF Relay sponsorship, potentially zero for user)

**Example for 100,000 sats swap:**
- Service fee: ~400 sats (0.4%)
- Lightning routing: ~10-100 sats
- RBTC gas: Potentially sponsored (zero to user)
- **Total: ~410-500 sats (0.41-0.5%)**

## API Endpoints

### Base URLs
- **Mainnet REST API**: `https://api.boltz.exchange/`
- **Mainnet WebSocket**: `wss://api.boltz.exchange/v2/ws`
- **Mainnet via Tor**: `http://boltzzzbnus4m7mta3cxmflnps4fp7dueu2tgurstbvrbt6xswzcocyd.onion/api/`
- **Regtest (Development)**: Available via local deployment

### Key Endpoints for Reverse Swaps

1. **Create Reverse Swap**: `POST /v2/swap/reverse`
2. **Get Swap Status**: `GET /v2/swap/reverse/{id}`
3. **Claim Swap**: `POST /v2/swap/reverse/{id}/claim`
4. **Get Chain Contracts**: `GET /v2/chain/RBTC/contracts`
5. **Broadcast Transaction**: `POST /v2/chain/RBTC/transaction`

## Reverse Swap States

Understanding swap states is critical for proper implementation:

1. **`swap.created`**: Initial state, Boltz waiting for Lightning invoice payment
2. **`minerfee.paid`**: (Optional) Prepaid miner fees via separate invoice (currently disabled)
3. **`transaction.mempool`**: Boltz's RBTC lockup transaction found in mempool (only after invoice paid)
4. **`transaction.confirmed`**: Lockup transaction confirmed in block (can be skipped with 0-conf)
5. **`invoice.settled`**: Client claimed RBTC and Boltz settled Lightning invoice (FINAL SUCCESS STATE)

### Failure States

- **`invoice.expired`**: Boltz invoice expired, pending HTLCs cancelled
- **`swap.expired`**: Swap expired without invoice payment
- **`transaction.failed`**: Boltz unable to lock RBTC (Lightning HTLC cancelled, no fees charged)
- **`transaction.refunded`**: User didn't claim, Boltz auto-refunded its locked RBTC

## Implementation Flow for BitTasker

### 1. Preparation Phase

```typescript
// Generate random preimage (32 bytes)
const preimage = randomBytes(32);

// Calculate SHA256 hash
const preimageHash = crypto.sha256(preimage).toString('hex');

// User's RBTC address where funds will be claimed
const claimAddress = '<user-rbtc-wallet-address>';

// Amount to swap (in satoshis)
const invoiceAmount = 100_000; // 100k sats
```

### 2. Create Reverse Swap

```typescript
const createSwapResponse = await axios.post('https://api.boltz.exchange/v2/swap/reverse', {
  from: 'BTC',           // From Lightning (BTC represents Lightning)
  to: 'RBTC',            // To Rootstock
  invoiceAmount: 100000, // Amount in satoshis
  claimAddress: claimAddress,
  preimageHash: preimageHash
});

// Response contains:
// - id: Swap ID
// - invoice: Lightning invoice to pay
// - redeemScript: Smart contract details
// - lockupAddress: RBTC address where Boltz locks funds
// - onchainAmount: Amount that will be locked on RBTC
// - timeoutBlockHeight: Block height when swap expires
```

### 3. Subscribe to WebSocket Updates

```typescript
const webSocket = new WebSocket('wss://api.boltz.exchange/v2/ws');

webSocket.on('open', () => {
  webSocket.send(JSON.stringify({
    op: 'subscribe',
    channel: 'swap.update',
    args: [createSwapResponse.id]
  }));
});

webSocket.on('message', (rawMsg) => {
  const msg = JSON.parse(rawMsg.toString('utf-8'));
  
  if (msg.event === 'update') {
    handleSwapUpdate(msg.args[0]);
  }
});
```

### 4. Handle Swap Status Updates

```typescript
async function handleSwapUpdate(update) {
  switch (update.status) {
    case 'swap.created':
      // Display invoice to user for payment
      // Show QR code or copy button
      console.log('Waiting for Lightning payment...');
      break;
      
    case 'transaction.mempool':
    case 'transaction.confirmed':
      // Boltz has locked RBTC, now we can claim
      await claimRBTC(update);
      break;
      
    case 'invoice.settled':
      // SUCCESS! Swap completed
      console.log('Swap successful, RBTC received');
      webSocket.close();
      break;
      
    case 'invoice.expired':
    case 'swap.expired':
    case 'transaction.failed':
      // Handle failure - no funds lost, Lightning payment cancelled
      console.log('Swap failed:', update.status);
      break;
  }
}
```

### 5. Claim RBTC from Smart Contract

When `transaction.confirmed` status is received, claim the locked RBTC:

```typescript
async function claimRBTC(update) {
  // Get contract addresses
  const contracts = await axios.get('https://api.boltz.exchange/v2/chain/RBTC/contracts');
  
  const etherSwapContract = new Contract(
    contracts.data.swapContracts.EtherSwap,
    EtherSwapABI,
    walletSigner
  );
  
  // Claim using the preimage
  const tx = await etherSwapContract['claim(bytes32,uint256,address,uint256)'](
    preimage,
    BigInt(createSwapResponse.onchainAmount) * BigInt(10 ** 10), // Convert to wei
    createSwapResponse.refundAddress,
    createSwapResponse.timeoutBlockHeight
  );
  
  console.log(`Claimed RBTC in transaction: ${tx.hash}`);
}
```

## Smart Contract Integration

### EtherSwap Contract

Boltz uses the `EtherSwap` smart contract on Rootstock. Key functions:

1. **`lock()`** - Boltz calls this to lock RBTC
2. **`claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timeoutBlockHeight)`** - Client calls this to claim
3. **`refund()`** - For refunding after timeout (handled by Boltz automatically)

### Contract Verification

**CRITICAL**: Always verify the smart contract address:

```typescript
// Get current contract addresses
const contractsResponse = await axios.get('https://api.boltz.exchange/v2/chain/RBTC/contracts');

// Verify contract bytecode matches verified version
// Or hardcode verified contract address
const VERIFIED_ETHERSWAP_ADDRESS = '<verified-address>';

if (contractsResponse.data.swapContracts.EtherSwap !== VERIFIED_ETHERSWAP_ADDRESS) {
  throw new Error('Contract address mismatch - possible security issue!');
}
```

## Security Considerations

### Don't Trust, Verify!

1. **Verify Invoice Amount**
   - Decode Lightning invoice
   - Check amount matches expected value
   - Verify preimage hash matches

2. **Verify Contract Address**
   - Compare against known good contract
   - Check contract bytecode
   - Never trust API-provided addresses blindly

3. **Store Preimage Securely**
   - Required to claim RBTC
   - Loss of preimage = loss of funds
   - Store encrypted in secure storage

4. **Store All Swap Data**
   - Permanently store: preimage, swap ID, contract details
   - Needed for refunds if something goes wrong
   - Historical proof of payment

5. **Timelock Awareness**
   - Claim before timeout block height
   - Monitor blockchain height
   - Set up alerts before expiry

### Emergency Recovery

If swap fails or data is lost:

1. **Contract Logs Method**
   - Query `Lockup` event logs from EtherSwap contract
   - Indexed by `refundAddress`
   - Can reconstruct all necessary data

2. **Boltz Support**
   - Contact via Discord: https://t.me/breezsdk
   - Email: contact@boltz.exchange
   - They can assist with recovery

## WebSocket for Real-Time Updates

Since BitTasker is client-only, use WebSocket for real-time swap status updates:

```typescript
// Create WebSocket connection in client app
const webSocket = new WebSocket('wss://api.boltz.exchange/v2/ws');

webSocket.on('open', () => {
  // Subscribe to swap updates
  webSocket.send(JSON.stringify({
    op: 'subscribe',
    channel: 'swap.update',
    args: [swapId]
  }));
});

webSocket.on('message', async (rawMsg) => {
  const msg = JSON.parse(rawMsg.toString('utf-8'));
  
  if (msg.event === 'update') {
    // Update Nostr event with new status
    await updateSwapStatusInNostr(msg.args[0]);
    
    // Handle swap state changes
    await handleSwapUpdate(msg.args[0]);
  }
});

// Update Nostr storage when status changes
async function updateSwapStatusInNostr(update: any) {
  const swapEvent = await getSwapEventFromNostr(update.id);
  
  // Update content with new status and transaction data
  const updatedContent = {
    ...JSON.parse(swapEvent.content),
    status: update.status,
    lockupTxHash: update.transaction?.id,
    updatedAt: Date.now()
  };
  
  // Publish updated event to Nostr relays
  await publishSwapEvent(update.id, updatedContent);
}
```

## Libraries and Tools

### Recommended Libraries

1. **Boltz Core (TypeScript)** ⭐ Recommended
   - Official reference library
   - Full Rootstock support
   - Used by Boltz Web App
   - GitHub: https://github.com/BoltzExchange/boltz-core

2. **Boltz Rust**
   - Maintained by Bull Bitcoin and Boltz
   - Python bindings available
   - Used by Bull Bitcoin Mobile, Aqua Wallet
   - GitHub: https://github.com/SatoshiPortal/boltz-rust

3. **Boltz Client (Go)**
   - Full Go library
   - Used by BTCPay Plugin
   - Bitcoin, Lightning, Liquid support (no RBTC yet)
   - GitHub: https://github.com/BoltzExchange/boltz-client

### Essential npm Packages for SvelteKit

```bash
npm install axios
npm install ethers # For RBTC contract interaction
npm install bitcoinjs-lib # For crypto operations
npm install boltz-core # Official Boltz library
npm install nostr-tools # For Nostr storage and encryption (NIP-44)
```

**Note**: WebSocket support is built into browsers, so no separate `ws` package needed for client-side.

## Client-Side Implementation Best Practices

### Why Client-Side is Critical

BitTasker's client-only approach aligns perfectly with Boltz and Bitcoin best practices:

1. **Non-Custodial**: User maintains full control of funds and keys
2. **No Server Risk**: No backend to compromise or go offline
3. **Privacy**: Swap data only accessible to user via their Nostr keys
4. **Decentralized**: Works with any Nostr relay, no single point of failure
5. **Transparent**: Open source code can be audited by community

### Nostr Storage Benefits

1. **Persistence**: Swap data survives app uninstall/reinstall
2. **Multi-Device**: Access swap history from any device with nsec
3. **Backup**: Data backed up across multiple Nostr relays
4. **Recovery**: Can recover pending swaps even if app data is lost
5. **Privacy**: NIP-44 encryption ensures only user can read sensitive data

### Implementation Architecture

```
User's Browser/App
├── Swap Logic (boltz-core)
├── WebSocket (Boltz API updates)
├── RBTC Wallet (ethers.js)
├── Nostr Client (nostr-tools)
└── UI (SvelteKit)

Storage Flow:
1. Generate preimage → Encrypt with NIP-44
2. Create swap → Store event in Nostr
3. WebSocket update → Update Nostr event
4. Claim RBTC → Update final status in Nostr
5. Multi-device sync → Query Nostr relays
```

### Handling App Closure/Restart

Since there's no backend, the client must handle recovery:

```typescript
// On app startup, check for pending swaps
async function recoverPendingSwaps() {
  // Query Nostr for user's swap events
  const swapEvents = await queryNostrSwaps({
    authors: [userPubkey],
    kinds: [30078],
    '#t': ['boltz-swap']
  });
  
  // Filter for non-final states
  const pendingSwaps = swapEvents.filter(event => {
    const swap = JSON.parse(event.content);
    return !['invoice.settled', 'swap.expired', 'transaction.failed'].includes(swap.status);
  });
  
  // Reconnect WebSocket for each pending swap
  for (const swapEvent of pendingSwaps) {
    const swap = JSON.parse(swapEvent.content);
    await reconnectSwapWebSocket(swap.id);
    
    // Check current status from Boltz
    const currentStatus = await checkSwapStatus(swap.id);
    
    // Handle any missed state changes
    await handleSwapUpdate(currentStatus);
  }
}
```

## Integration Checklist

### Pre-Development
- [ ] Request Boltz API key: https://boltz.exchange/
- [ ] Study Boltz Core library source code
- [ ] Understand EtherSwap smart contract
- [ ] Set up development environment with Regtest

### Development
- [ ] Implement preimage generation and NIP-44 encryption
- [ ] Create swap creation logic in client app
- [ ] Implement WebSocket handler for status updates
- [ ] Build RBTC claim transaction logic
- [ ] Add contract address verification
- [ ] Implement invoice verification
- [ ] Create refund mechanism for failed swaps
- [ ] Add comprehensive error handling
- [ ] Implement Nostr event publishing for swap storage
- [ ] Build swap recovery from Nostr relays
- [ ] Add WebSocket reconnection and state recovery

### Security
- [ ] Implement "Don't Trust, Verify" for all critical data
- [ ] Secure preimage storage (NIP-44 encrypted in Nostr)
- [ ] Verify Lightning invoice amounts and hashes
- [ ] Verify smart contract addresses
- [ ] Add timeout monitoring and alerts
- [ ] Implement emergency recovery procedures
- [ ] Ensure Nostr events are only decryptable by user
- [ ] Handle key rotation and backup scenarios

### Testing
- [ ] Test on Regtest with local Boltz instance
- [ ] Test all swap states and transitions
- [ ] Test failure scenarios and refunds
- [ ] Test timeout scenarios
- [ ] Security audit of verification logic
- [ ] Load testing for concurrent swaps
- [ ] Test Nostr event storage and retrieval
- [ ] Test NIP-44 encryption/decryption of preimage
- [ ] Test multi-device sync via Nostr relays

### Production
- [ ] Permanently store all swap data in Nostr events
- [ ] Implement retry mechanisms for network failures
- [ ] Set up WebSocket reconnection logic
- [ ] Create user notification system (via Nostr or UI)
- [ ] Add support/help documentation
- [ ] Open source for community review (recommended)
- [ ] Test Nostr relay fallbacks for storage redundancy

## BitTasker Specific Implementation

### Reverse Swap Flow (Lightning → RBTC)

The primary use case is to enable users to swap their Lightning funds to RBTC for use in the platform.

1. **User Needs RBTC**
   ```
   User has Lightning funds → Wants RBTC for platform use (bids, escrow, etc.)
   ```

2. **Initiate Reverse Swap**
   ```
   - Generate preimage
   - Create swap with user's RBTC wallet address as claim address
   - Show Lightning invoice to user
   ```

3. **User Pays Lightning Invoice**
   ```
   - User pays from their Lightning wallet
   - Boltz detects payment and locks RBTC on-chain
   ```

4. **Claim RBTC to User Wallet**
   ```
   - BitTasker client app claims RBTC using preimage
   - Funds sent to user's RBTC wallet address
   - User can now use RBTC on platform
   ```

5. **RBTC Available for Platform Use**
   ```
   - User has RBTC in their wallet
   - Can be used for existing escrow system (connected to bids)
   - Can be used for any RBTC-based platform features
   ```

### Key Points

- **Swap Purpose**: Convert user's Lightning funds to RBTC for platform wallet
- **User Flow**: Lightning → RBTC (via swap) → Available for platform features

### Client-Side Implementation Considerations

- **Separate Preimages**: Each swap needs unique preimage
- **Concurrent Swaps**: Handle multiple simultaneous swaps in client app
- **Status Tracking**: Real-time updates via WebSocket subscription
- **Wallet Integration**: Ensure swapped RBTC arrives in user's platform wallet
- **Client-Only**: No backend server - all logic runs in client app

### Nostr Storage Schema

Swap data will be stored using Nostr events (NIP-78 Application-Specific Data or similar):

```typescript
interface BoltzSwapNostrEvent {
  kind: 30078,                   // Application-specific data (parameterized replaceable)
  tags: [
    ['d', '<swap-id>'],          // Unique identifier (Boltz swap ID)
    ['a', '<amount-sats>'], // Amount in satoshis
    ['s', '<current-status>'], // Current swap status
    ['r', '<address>'], // User's RBTC wallet address
  ],
  content: JSON.stringify({
    id: string;                  // Boltz swap ID
    preimage: string;            // Encrypted preimage (NIP-44 encrypted)
    preimageHash: string;        // SHA256 hash
    invoice: string;             // Lightning invoice
    amount: number;              // Amount in sats
    rbtcAddress: string;         // User's RBTC wallet address (claim destination)
    status: string;              // Current swap status
    lockupTxHash?: string;       // RBTC lockup transaction from Boltz
    claimTxHash?: string;        // RBTC claim transaction to user wallet
    createdAt: number;           // Unix timestamp
    updatedAt: number;           // Unix timestamp
    expiresAt: number;           // Timeout block height converted to timestamp
  }),
  created_at: number,
  pubkey: '<user-pubkey>'        // User's Nostr public key
}
```

**Key Nostr Integration Points:**

1. **Encrypted Storage**: Use NIP-44 to encrypt sensitive data (preimage)
2. **Event Type**: Use parameterized replaceable events (kind 30000-39999) for updates
3. **Recovery**: User can recover swap data from any Nostr relay using their nsec
4. **Multi-Device**: Swap data syncs across devices via Nostr relays
5. **Privacy**: Only user with private key can decrypt swap preimage

## Minimum Fee Implementation Approach

To achieve minimum fees for BitTasker users:

### 1. Batch Processing
- **Aggregate small swaps** into larger ones when possible
- Reduces percentage overhead of fixed costs
- Coordinate with users for optimal timing

### 2. RIF Relay Integration
- **Sponsored transactions** eliminate user gas fees
- Partner with RIF Relay for sponsored swaps
- Potentially negotiate volume discounts

### 3. Smart Fee Calculation
```typescript
async function calculateOptimalSwapAmount(baseAmount: number) {
  // Get current fee structure
  const pairs = await axios.get('https://api.boltz.exchange/v2/swap/reverse/pairs');
  
  // Calculate total fees
  const serviceFee = baseAmount * 0.004; // 0.4%
  const estimatedLightningFee = baseAmount * 0.001; // ~0.1%
  
  // RIF Relay sponsored = 0 gas for user
  const totalFee = serviceFee + estimatedLightningFee;
  
  return {
    baseAmount,
    totalFee,
    totalCost: baseAmount + totalFee,
    effectiveFeeRate: (totalFee / baseAmount) * 100
  };
}
```

### 4. Fee Transparency
- Show exact fee breakdown to users
- Compare costs with alternatives
- Educate users on when to swap

### 5. Alternative for Large Amounts
For escrows above certain threshold (e.g., 1M sats):
- Consider direct Lightning → Bitcoin → RBTC bridge
- May have better rates for large amounts
- Compare Boltz fees with alternatives

## Resources

### Documentation
- **Boltz API Docs**: https://api.docs.boltz.exchange/
- **Swagger API**: https://api.boltz.exchange/swagger
- **RIF Relay**: https://rootstock.io/rif/relay/

### Support
- **Telegram**: https://t.me/breezsdk
- **Discord**: https://discord.gg/QBvZGcW
- **Email**: contact@breez.technology

### Code Examples
- **Boltz Web App**: https://github.com/BoltzExchange/boltz-web-app
- **Boltz Core**: https://github.com/BoltzExchange/boltz-core
- **Reference Regtest**: https://github.com/BoltzExchange/regtest

### Lightning Nodes
- **CLN Node**: [View on Amboss](https://amboss.space/node/02d96eadea3d780104449aca5c93461ce67c1564e2e1d73225fa67dd3b997a6018)
- **LND Node**: [View on Amboss](https://amboss.space/node/026165850492521f4ac8abd9bd8088123446d126f648ca35e60f88177dc149ceb2)

## Next Steps for BitTasker

1. **Proof of Concept**: Build simple reverse swap Lightning → RBTC to user wallet
2. **Wallet Integration**: Ensure swapped RBTC arrives in user's platform RBTC wallet
3. **User Flow**: Design UX for swap initiation, payment, and monitoring
4. **Testing**: Extensive testing on Regtest and testnet
5. **Security Audit**: Review all verification and storage logic
6. **Production Deployment**: Start with small amounts, scale gradually
7. **User Education**: Create guides on using Lightning → RBTC swaps and fee optimization

**Note**: The reverse swap feature is independent of the existing RBTC escrow system (which is bid-based). Users will swap Lightning → RBTC to get funds into their platform wallet, then can use that RBTC for bids, escrow, or other platform features.

## Conclusion

Boltz reverse submarine swaps provide a robust, trustless solution for moving Lightning funds to Rootstock. With fees around 0.4-0.5% and RIF Relay's sponsored transactions, this is an economical solution for BitTasker users.

### BitTasker's Advantages

**Client-Side Implementation:**
- ✅ Fully non-custodial - users control their keys and funds
- ✅ No backend servers - eliminates single points of failure
- ✅ Nostr storage - swap data accessible across devices
- ✅ NIP-44 encryption - sensitive data protected by user's keys
- ✅ Multi-relay backup - data persistence and redundancy

**Key Success Factors:**

1. **Security**: Implement "Don't Trust, Verify" for all critical data
2. **Recovery**: Handle app restarts and recover pending swaps from Nostr
3. **User Experience**: Clear communication about fees, timing, and status
4. **Data Persistence**: Store all swap data in encrypted Nostr events
5. **Offline Resilience**: Client can recover state from Nostr on reconnection

### Getting Started

1. Start with **Boltz Core TypeScript library** for battle-tested swap logic
2. Use **nostr-tools** for encrypted storage (NIP-44)
3. Implement **WebSocket** for real-time updates
4. Build **recovery logic** for app restarts
5. Test thoroughly on **Regtest** before production

This client-only architecture aligns perfectly with Bitcoin's ethos of self-sovereignty while providing the UX of modern web apps through Nostr's decentralized storage.

