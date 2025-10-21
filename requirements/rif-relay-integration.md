# RIF Relay Integration Guide for BitTasker

## Overview

RIF Relay enables **gasless RBTC transactions** by allowing users to execute blockchain transactions without holding RBTC for gas fees. This solves the chicken-and-egg problem where users need RBTC to claim RBTC.

## What is RIF Relay?

RIF Relay is a **meta-transaction service** that pays gas fees on behalf of users through Smart Wallets.

### Traditional Transaction (Requires Gas)
```
User EOA → EtherSwap.claim() → Pay gas in RBTC
❌ Fails if user has zero RBTC!
```

### RIF Relay Transaction (Gasless)
```
User signs intent → RIF Relay Server → Smart Wallet → EtherSwap.claim()
✅ RIF Relay pays gas, user pays nothing!
```

## Smart Wallets Explained

### What is a Smart Wallet?

A **Smart Wallet** is a smart contract that acts as a wallet, controlled by a user's regular wallet (EOA).

**User's Regular Wallet (EOA)**:
- Created from mnemonic/private key
- Example: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- User already has this (passkey-encrypted)

**Smart Wallet (Contract)**:
- Deployed smart contract address
- Example: `0xABC...` (different address)
- **Controlled by** user's EOA
- Enables gasless transactions via RIF Relay

### How Smart Wallets Work

```
1. User creates EOA wallet from mnemonic (existing)
   Mnemonic → Private Key → EOA Address

2. Deploy Smart Wallet contract (one-time)
   Deploy SmartWallet(owner: EOA Address) → Contract Address

3. User signs meta-transaction with EOA private key
   Message: "Execute claim() from my Smart Wallet"
   Signature proves user authorized the action

4. RIF Relay Server receives signed meta-transaction
   Verifies signature matches Smart Wallet owner

5. RIF Relay broadcasts transaction
   Calls: SmartWallet.execute(to, data)
   RIF Relay pays gas fees

6. Smart Wallet verifies and executes
   Checks: signature matches owner (user's EOA)
   Executes: EtherSwap.claim() on behalf of user
   Sends RBTC to user's EOA
```

### Key Point

Users still use their **existing mnemonic/passkey wallet**. Smart Wallet is just a contract deployed ONCE and reused for all future gasless transactions.

## Smart Wallet Deployment

### One-Time Setup Per User

```typescript
async function ensureSmartWallet(
  userEOA: string,
  wallet: Wallet
): Promise<string> {
  // 1. Check if Smart Wallet already deployed
  const existing = await getSmartWalletAddress(userEOA);
  if (existing) {
    console.log('✅ Smart Wallet already exists:', existing);
    return existing;
  }

  // 2. Deploy new Smart Wallet
  console.log('🚀 Deploying Smart Wallet for:', userEOA);
  
  const deployRequest = {
    request: {
      from: userEOA,
      index: 0,  // Smart Wallet index (usually 0)
      recoverer: ethers.ZeroAddress,  // No recovery address
      data: '0x',  // No initialization data
      tokenAmount: '0',
      tokenGas: '0',
      validUntilTime: 0
    },
    relayData: {
      // Will be filled by RIF Relay client
    }
  };

  const smartWalletAddress = await rifRelayHttpClient.deploySmartWallet(
    deployRequest,
    wallet  // EOA wallet for signing
  );

  // 3. Save to Nostr profile for future use
  await saveSmartWalletToNostr(userEOA, smartWalletAddress, nsec);

  console.log('✅ Smart Wallet deployed:', smartWalletAddress);
  return smartWalletAddress;
}
```

### Deployment Costs

**One-time deployment fee**:
- Regtest: ~$0.01 (cheap gas)
- Mainnet: ~$0.10-0.50 (depends on gas prices)

**Who pays?**
- **Option A**: User pays (requires small RBTC for first deployment only)
- **Option B**: We sponsor (maintain funded wallet to cover deployments)

**After deployment**: ALL future claims are gasless!

## RIF Relay HTTP Client

Since `@rsksmart/rif-relay-client` depends on ethers v5 and we use v6, we implement a direct HTTP client.

### RIF Relay Server Endpoints

```typescript
// Get relay server information
GET http://localhost:8090/chain-info

Response:
{
  "relayHubAddress": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  "relayWorkerAddress": "0xaF15CcE685357ecEf970ED89eEcB7067ad70e372",
  "relayManagerAddress": "0x...",
  "feesReceiver": "0x...",
  "minGasPrice": "60000000",
  "ready": true,
  "version": "2.0.0",
  "chainId": "33",
  "networkId": "33"
}
```

```typescript
// Relay a transaction (gasless)
POST http://localhost:8090/relay

Request:
{
  "relayRequest": {
    "request": {
      "from": "0xSmartWalletAddress",  // ✅ Smart Wallet, not EOA
      "to": "0xEtherSwapContract",
      "data": "0x...",  // Encoded claim() call
      "value": "0",
      "gas": "200000",
      "nonce": "0",
      "tokenContract": "0x0000000000000000000000000000000000000000",
      "tokenAmount": "0",
      "tokenGas": "0",
      "validUntilTime": "0",
      "relayHub": "0xRelayHubAddress"
    },
    "relayData": {
      "gasPrice": "60000000",
      "feesReceiver": "0x...",
      "callForwarder": "0xSmartWalletAddress",
      "callVerifier": "0x..."
    }
  },
  "metadata": {
    "relayHubAddress": "0x...",
    "relayMaxNonce": 1000000,
    "signature": "0x..."  // EOA signature
  }
}

Response:
{
  "txHash": "0x..."
}
```

### HTTP Client Implementation

```typescript
export class RifRelayHttpClient {
  private config = getBoltzConfig();
  private relayMetadata: RelayMetadata | null = null;

  async getRelayMetadata(): Promise<RelayMetadata> {
    const response = await fetch(`${this.config.rifRelayServerUrl}/chain-info`);
    return await response.json();
  }

  async relayTransaction(
    smartWalletAddress: string,
    targetContract: string,
    encodedData: string,
    wallet: Wallet  // EOA wallet for signing
  ): Promise<string> {
    // 1. Get relay server info
    const metadata = await this.getRelayMetadata();
    
    if (!metadata.ready) {
      throw new Error('RIF Relay server not ready');
    }

    // 2. Get nonce for Smart Wallet
    const nonce = await wallet.provider.getTransactionCount(smartWalletAddress);

    // 3. Build relay request
    const relayRequest = {
      request: {
        from: smartWalletAddress,  // ✅ Smart Wallet executes
        to: targetContract,
        data: encodedData,
        value: '0',
        gas: '200000',
        nonce: nonce.toString(),
        tokenContract: ethers.ZeroAddress,
        tokenAmount: '0',
        tokenGas: '0',
        validUntilTime: '0',
        relayHub: metadata.relayHubAddress
      },
      relayData: {
        gasPrice: metadata.minGasPrice,
        feesReceiver: metadata.feesReceiver,
        callForwarder: smartWalletAddress,
        callVerifier: metadata.relayVerifierAddress
      }
    };

    // 4. Compute request hash
    const requestHash = this.computeRelayRequestHash(relayRequest);

    // 5. Sign with EOA private key (proves authorization)
    const signature = await wallet.signMessage(ethers.getBytes(requestHash));

    // 6. Submit to RIF Relay server
    const response = await fetch(`${this.config.rifRelayServerUrl}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relayRequest,
        metadata: {
          relayHubAddress: metadata.relayHubAddress,
          relayMaxNonce: 1000000,
          signature
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RIF Relay failed: ${error}`);
    }

    const result = await response.json();
    return result.txHash;
  }

  private computeRelayRequestHash(relayRequest: any): string {
    // EIP-712 structured data hashing
    // Based on RIF Relay specification
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'address',  // from (Smart Wallet)
          'address',  // to (target contract)
          'bytes',    // data
          'uint256',  // value
          'uint256',  // gas
          'uint256',  // nonce
          'address',  // relayHub
          'address',  // callVerifier
          'uint256'   // gasPrice
        ],
        [
          relayRequest.request.from,
          relayRequest.request.to,
          relayRequest.request.data,
          relayRequest.request.value,
          relayRequest.request.gas,
          relayRequest.request.nonce,
          relayRequest.request.relayHub,
          relayRequest.relayData.callVerifier,
          relayRequest.relayData.gasPrice
        ]
      )
    );
  }
}
```

## Gasless Claiming Flow

### Complete Implementation

```typescript
async function claimRBTCViaRifRelay(
  swapData: BoltzSwapData,
  nsec: string,
  wallet: Wallet  // User's EOA wallet
): Promise<{ txHash: string }> {
  console.log('🚀 Starting gasless claim via RIF Relay...');

  // 1. Ensure Smart Wallet exists
  const smartWalletAddress = await smartWalletService.ensureSmartWallet(
    wallet.address,
    wallet
  );

  console.log('✅ Using Smart Wallet:', smartWalletAddress);

  // 2. Get actual lockup parameters from blockchain
  const params = await getLockupEventParameters(
    swapData.lockupTxHash!,
    swapData.preimageHash,
    wallet.provider
  );

  // 3. Get EtherSwap contract address
  const contracts = await fetch(`${boltzApiUrl}/v2/chain/RBTC/contracts`);
  const { swapContracts } = await contracts.json();
  const etherSwapAddress = swapContracts.EtherSwap;

  // 4. Encode claim function call
  const contract = new Contract(etherSwapAddress, ETHER_SWAP_ABI, wallet);
  const preimageBytes32 = '0x' + swapData.preimage;
  
  const claimData = contract.interface.encodeFunctionData('claim', [
    preimageBytes32,
    params.amount,
    params.refundAddress,
    params.timelock
  ]);

  console.log('📝 Claim transaction encoded');

  // 5. Relay transaction via RIF Relay (gasless!)
  const txHash = await rifRelayHttpClient.relayTransaction(
    smartWalletAddress,  // Transaction FROM Smart Wallet
    etherSwapAddress,    // Transaction TO EtherSwap
    claimData,           // Encoded claim() call
    wallet               // EOA wallet for signing
  );

  console.log('✅ Transaction relayed (gasless):', txHash);

  // 6. Wait for confirmation
  const receipt = await wallet.provider.waitForTransaction(txHash);
  
  if (receipt?.status === 1) {
    console.log('✅ Claim confirmed! RBTC sent to:', wallet.address);
    swapData.status = 'invoice.settled';
    swapData.claimTxHash = txHash;
    await saveSwapToNostr(swapData, nsec);
  }

  return { txHash };
}
```

### Important Notes

1. **Transaction FROM Smart Wallet**: The claim transaction is executed FROM the Smart Wallet contract, not from user's EOA

2. **Funds Go to EOA**: Even though claim is from Smart Wallet, RBTC is sent to user's EOA (the `msg.sender` in the context)

3. **Signature with EOA**: User signs the meta-transaction with their EOA private key to prove they authorize the Smart Wallet

4. **RIF Relay Pays Gas**: The RIF Relay server pays all gas fees and gets reimbursed from their pool

## Fallback Strategy

Always check if user has gas before using RIF Relay:

```typescript
async function handleClaimRequest(
  swapData: BoltzSwapData,
  nsec: string,
  wallet: Wallet
) {
  // Check user's gas balance
  const balance = await wallet.provider.getBalance(wallet.address);
  const gasEstimate = await estimateClaimGas();

  if (balance >= gasEstimate) {
    console.log('💰 User has gas, using direct claim');
    return await claimRBTC(swapData, nsec, wallet);
  } else {
    console.log('⛽ User has no gas, using RIF Relay (gasless)');
    return await claimRBTCViaRifRelay(swapData, nsec, wallet);
  }
}
```

## Testing in Regtest

### 1. Check RIF Relay Server

```bash
# Check if server is running
curl http://localhost:8090/chain-info

# Expected response:
{
  "relayHubAddress": "0x...",
  "ready": true,
  ...
}
```

### 2. Test Smart Wallet Deployment

```typescript
// In BitTasker console
const smartWallet = await smartWalletService.ensureSmartWallet(
  userAddress,
  wallet
);

console.log('Smart Wallet:', smartWallet);
```

### 3. Test Gasless Claim

```typescript
// Create swap with ZERO balance wallet
const zeroBalanceWallet = ethers.Wallet.createRandom().connect(provider);
console.log('Balance:', await provider.getBalance(zeroBalanceWallet.address)); // 0

// Create reverse swap
const swap = await createReverseSwap({
  amountSats: 70000,
  rbtcAddress: zeroBalanceWallet.address
});

// Pay Lightning invoice
// ... (from Lightning wallet)

// Wait for lockup confirmation
// Gasless claim should automatically trigger

// Verify RBTC received
const finalBalance = await provider.getBalance(zeroBalanceWallet.address);
console.log('Final balance:', ethers.formatEther(finalBalance)); // Should be > 0
```

## Production Configuration

### Environment Variables

```bash
# Regtest
RSK_RPC_URL=http://localhost:8545
RSK_CHAIN_ID=33
RIF_RELAY_SERVER_URL=http://localhost:8090

# Mainnet
RSK_RPC_URL=https://public-node.rsk.co
RSK_CHAIN_ID=30
RIF_RELAY_SERVER_URL=https://rif-relay.rootstock.io  # TODO: Verify actual URL
```

### Finding Production RIF Relay URL

Options to find the production RIF Relay server:
1. Check Boltz Web App source: https://github.com/BoltzExchange/boltz-web-app
2. Ask Boltz team directly
3. Check RIF documentation: https://dev.rootstock.io/developers/integrate/rif-relay/

## Cost Analysis

### One-Time Costs (Per User)
- **Smart Wallet Deployment**: ~$0.10-0.50 (one-time)
  - Regtest: ~$0.01
  - Mainnet: depends on gas prices

### Per-Transaction Costs (Per Claim)
- **User Pays**: $0 (gasless!)
- **RIF Relay Pays**: ~$0.01-0.02 gas
- **RIF Relay Reimbursement**: From their sponsored pool

### Comparison

| Method | User Gas Cost | Setup Cost | Total for 10 Claims |
|--------|---------------|------------|---------------------|
| **Direct Claim** | ~$0.01 each | $0 | ~$0.10 |
| **RIF Relay** | $0 | ~$0.25 (Smart Wallet) | ~$0.25 |

**RIF Relay is cheaper** after ~3-4 claims!

## Error Handling

### Common Errors

1. **"Smart Wallet not deployed"**
   - **Solution**: Call `ensureSmartWallet()` before claiming

2. **"RIF Relay server not ready"**
   - **Solution**: Check `/chain-info` endpoint, verify server is running

3. **"Invalid signature"**
   - **Cause**: Wrong EOA wallet signing
   - **Solution**: Ensure correct wallet (owner of Smart Wallet) is signing

4. **"Relay transaction failed"**
   - **Cause**: Various (check RIF Relay server logs)
   - **Fallback**: Try direct claim if user has gas

### Error Recovery

```typescript
try {
  const { txHash } = await claimRBTCViaRifRelay(swapData, nsec, wallet);
  console.log('✅ Gasless claim succeeded:', txHash);
} catch (error) {
  console.error('❌ RIF Relay claim failed:', error);
  
  // Check if user has gas for direct claim
  const balance = await wallet.provider.getBalance(wallet.address);
  const gasRequired = await estimateClaimGas();
  
  if (balance >= gasRequired) {
    console.log('⚠️ Falling back to direct claim');
    return await claimRBTC(swapData, nsec, wallet);
  } else {
    throw new Error(
      'Unable to claim: RIF Relay unavailable and user has no gas. ' +
      'Please add small amount of RBTC to wallet or try again later.'
    );
  }
}
```

## Security Considerations

### Safe Practices

✅ **Do**:
- Verify Smart Wallet ownership before claiming
- Validate all RIF Relay server responses
- Use event parameters for claim (not API estimates)
- Store Smart Wallet address in encrypted Nostr profile
- Implement fallback to direct claim

❌ **Don't**:
- Expose user's EOA private key
- Trust Smart Wallet addresses without verification
- Skip signature verification
- Use API-provided amounts (use blockchain events)

## References

### Documentation
- [RIF Relay Integration Guide](https://dev.rootstock.io/developers/integrate/rif-relay/integrate/)
- [RIF Relay Architecture](https://dev.rootstock.io/developers/integrate/rif-relay/architecture/)
- [Smart Wallets Guide](https://dev.rootstock.io/developers/integrate/rif-relay/smart-wallets/)

### Repositories
- [RIF Relay Server](https://github.com/rsksmart/rif-relay-server)
- [RIF Relay Client](https://github.com/rsksmart/rif-relay-client)
- [RIF Relay Contracts](https://github.com/rsksmart/rif-relay-contracts)

### Blog Posts
- [RIF Relay Use Cases: Enabling Atomic Swaps](https://rif.technology/content-hub/rif-relay-use-cases-enabling-atomic-swaps/)
- [RIF Relay Overview](https://rif.technology/content-hub/rif-relay/)

