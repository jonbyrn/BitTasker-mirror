# RIF Relay Integration Guide

## Overview

RIF Relay enables **gasless RBTC transactions** by allowing users to execute blockchain transactions without holding RBTC for gas fees. This solves the chicken-and-egg problem where users need RBTC to claim RBTC.

## What is RIF Relay?

RIF Relay is a **meta-transaction service** that pays gas fees on behalf of users through Smart Wallets.

### Traditional vs RIF Relay

**Traditional Transaction (Requires Gas)**:
```
User EOA → EtherSwap.claim() → Pay gas in RBTC
❌ Fails if user has zero RBTC!
```

**RIF Relay Transaction (Gasless)**:
```
User signs intent → RIF Relay Server → Smart Wallet → EtherSwap.claim()
✅ RIF Relay pays gas, user pays nothing!
```

## Smart Wallets Explained

### What is a Smart Wallet?

A **Smart Wallet** is a smart contract that acts as a wallet, controlled by a user's regular wallet (EOA - Externally Owned Account).

**User's Regular Wallet (EOA)**:
- Created from mnemonic/private key
- Example: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- User already has this (passkey-encrypted in BitTasker)

**Smart Wallet (Contract)**:
- Deployed smart contract address
- Example: `0xABC123...` (different address)
- **Owned by** user's EOA
- Enables gasless transactions via RIF Relay

### How Smart Wallets Work

```
1. User has EOA wallet from mnemonic (existing)
   Mnemonic → Private Key → EOA Address

2. Deploy Smart Wallet contract (one-time, per user)
   Deploy SmartWallet(owner: EOA) → Contract Address

3. User signs meta-transaction with EOA
   Message: "Execute claim() from my Smart Wallet"
   Signature proves user authorized the action

4. RIF Relay verifies signature
   Checks: signature matches Smart Wallet owner

5. RIF Relay broadcasts transaction
   Calls: SmartWallet.execute(to, data)
   RIF Relay pays gas fees

6. Smart Wallet executes
   Verifies: signature matches owner (EOA)
   Executes: EtherSwap.claim()
   Sends: RBTC to user's EOA
```

### Key Point

Users still use their **existing mnemonic/passkey wallet**. The Smart Wallet is just a contract deployed ONCE and reused for all future gasless transactions.

## Implementation

### RIF Directory Structure

```
src/lib/integrations/boltz/rif/
├── Signer.ts              # Main entry point for gasless claims
├── Contracts.ts           # Smart Wallet and Forwarder ABIs
├── Relay.ts               # RIF Relay HTTP client
├── Utils.ts               # Helper utilities
├── rootstock.ts           # Satoshi/Wei conversions
└── types/
    ├── TypedRequestData.ts  # EIP-712 structures
    └── Utility.ts           # Type utilities
```

### 1. Getting Smart Wallet Address

```typescript
import { getSmartWalletAddress } from './rif/Signer';

// Compute/get Smart Wallet address
const { address, nonce } = await getSmartWalletAddress(walletSigner);

console.log('Smart Wallet:', address);
console.log('Nonce:', nonce); // Used for deployment

// Check if deployed
const code = await provider.getCode(address);
const exists = code !== '0x';

if (exists) {
  console.log('✅ Smart Wallet already deployed');
} else {
  console.log('⚠️ Smart Wallet needs deployment');
}
```

### 2. Gasless Claim Transaction

```typescript
import { relayClaimTransaction } from './rif/Signer';
import { EtherSwap__factory } from '$lib/contracts';

// Get EtherSwap contract instance
const etherSwapAddress = await getEtherSwapAddress();
const etherSwapContract = EtherSwap__factory.connect(
  etherSwapAddress,
  walletSigner
);

// Relay claim via RIF Relay (gasless!)
const txHash = await relayClaimTransaction(
  walletSigner,                // User's EOA wallet (for signing)
  etherSwapContract,           // EtherSwap contract instance
  preimage,                    // Preimage hex string
  amountSats,                  // Amount in satoshis
  refundAddress,               // Refund address
  timelock                     // Timelock block height
);

console.log('✅ Transaction relayed (gasless):', txHash);

// Wait for confirmation
const receipt = await walletSigner.provider.waitForTransaction(txHash);
console.log('🎉 Claim confirmed!');
```

### 3. Complete Gasless Claiming Flow

The flow in `reverseSwapService.ts`:

```typescript
async claimRBTCViaRifRelay(
  swapData: BoltzSwapData,
  nsec: string,
  walletSigner: any
): Promise<{ txHash: string }> {
  console.log('🌐 Claiming RBTC via RIF Relay (gasless)...');

  // 1. Validate swap data
  if (!swapData.preimage || !swapData.onchainAmount || 
      !swapData.refundAddress || !swapData.timeoutBlockHeight) {
    throw new Error('Missing required swap data');
  }

  // 2. Check RIF Relay availability
  if (!isRifRelayAvailable()) {
    throw new Error('RIF Relay is not available');
  }

  // 3. Get EtherSwap contract
  const etherSwapAddress = await this.getEtherSwapAddress();
  const etherSwapContract = EtherSwap__factory.connect(
    etherSwapAddress, 
    walletSigner
  );

  // 4. Get ACTUAL lockup parameters from event
  let amount: number;
  let refundAddress: string;
  let timelock: number;

  if (swapData.lockupTxHash) {
    const eventParams = await this.getLockupEventParameters(
      etherSwapAddress,
      swapData.preimageHash,
      swapData.lockupTxHash,
      walletSigner.provider
    );

    if (eventParams) {
      amount = Number(eventParams.amount / SATOSHI_TO_WEI);
      refundAddress = eventParams.refundAddress;
      timelock = eventParams.timelock;
    } else {
      // Fallback to API values
      amount = swapData.onchainAmount;
      refundAddress = swapData.refundAddress;
      timelock = swapData.timeoutBlockHeight;
    }
  } else {
    amount = swapData.onchainAmount;
    refundAddress = swapData.refundAddress;
    timelock = swapData.timeoutBlockHeight;
  }

  console.log('🚀 Relaying claim via RIF Relay...');

  // 5. Use RIF Relay's relayClaimTransaction
  const txHash = await relayClaimTransaction(
    walletSigner,
    etherSwapContract as any,
    swapData.preimage,
    amount,
    refundAddress,
    timelock
  );

  console.log('✅ Transaction relayed:', txHash);

  // 6. Update swap status
  swapData.claimTxHash = txHash;
  swapData.status = 'transaction.claim.pending';
  swapData.rifRelayUsed = true;
  swapData.updatedAt = Date.now();
  await this.saveSwapToNostr(swapData, nsec);

  // 7. Wait for confirmation
  const receipt = await walletSigner.provider.waitForTransaction(txHash);

  swapData.status = 'claimed';
  swapData.updatedAt = Date.now();
  await this.saveSwapToNostr(swapData, nsec);

  console.log('🎉 Successfully claimed via RIF Relay!');
  return { txHash };
}
```

## How RIF Relay Works Internally

### Request Flow

```typescript
// In rif/Signer.ts
export const relayClaimTransaction = async (
  signer: Signer,
  etherSwap: any,
  preimage: string,
  amount: number,
  refundAddress: string,
  timeoutBlockHeight: number
) => {
  // 1. Encode claim function call
  const callData = etherSwap.interface.encodeFunctionData('claim', [
    prefix0x(preimage),
    satoshiToWei(amount),
    refundAddress,
    timeoutBlockHeight
  ]);

  // 2. Get RIF Relay server info
  const chainInfo = await getChainInfo();
  const smartWalletAddress = await getSmartWalletAddress(signer);
  
  // 3. Check if Smart Wallet exists
  const smartWalletExists = 
    (await signer.provider!.getCode(smartWalletAddress.address)) !== '0x';

  // 4. Build enveloping request
  const envelopingRequest: EnvelopingRequest = {
    request: {
      from: signerAddress,        // EOA
      to: etherSwapAddress,       // Target contract
      data: callData,             // Encoded claim()
      value: '0',
      tokenContract: ZeroAddress,
      relayHub: chainInfo.relayHubAddress,
      validUntilTime: getValidUntilTime(),
      // ... other fields
    },
    relayData: {
      feesReceiver: chainInfo.feesReceiver,
      callVerifier: config.contracts.deployVerifier,
      gasPrice: calculateGasPrice(feeData.gasPrice!, chainInfo.minGasPrice).toString()
    }
  };

  // 5. Handle Smart Wallet deployment if needed
  if (!smartWalletExists) {
    // Deploy request
    envelopingRequest.request.recoverer = ZeroAddress;
    envelopingRequest.request.index = Number(smartWalletAddress.nonce);
    envelopingRequest.relayData.callForwarder = await smartWalletFactory.getAddress();
  } else {
    // Regular relay request
    envelopingRequest.request.gas = GasNeededToClaim.toString();
    envelopingRequest.relayData.callForwarder = smartWalletAddress.address;
  }

  // 6. Estimate gas
  const estimateRes = await estimate(envelopingRequest, metadata);
  envelopingRequest.request.tokenGas = estimateRes.estimation;
  envelopingRequest.request.tokenAmount = estimateRes.requiredTokenAmount;

  // 7. Sign with EOA (EIP-712)
  const signature = await sign(signer, envelopingRequest);
  metadata.signature = signature;

  // 8. Relay transaction
  const relayRes = await relay(envelopingRequest, metadata);
  return relayRes.txHash;
};
```

### EIP-712 Signing

```typescript
// In rif/Signer.ts
const sign = async (signer: Signer, request: EnvelopingRequest) => {
  const { chainId } = await signer.provider!.getNetwork();

  const data = getEnvelopingRequestDataV4Field({
    chainId: Number(chainId),
    envelopingRequest: request,
    verifier: request.relayData.callForwarder as string,
    requestTypes: isDeployRequest(request) 
      ? deployRequestType 
      : relayRequestType
  });

  // Sign typed data (EIP-712)
  return signer.signTypedData(data.domain, data.types, data.value);
};
```

## RIF Relay HTTP API

The `rif/Relay.ts` module provides HTTP client functions:

### Get Chain Info

```typescript
import { getChainInfo } from './rif/Relay';

const chainInfo = await getChainInfo();

console.log({
  relayHubAddress: chainInfo.relayHubAddress,
  relayWorkerAddress: chainInfo.relayWorkerAddress,
  feesReceiver: chainInfo.feesReceiver,
  minGasPrice: chainInfo.minGasPrice,
  ready: chainInfo.ready,
  chainId: chainInfo.chainId
});
```

### Estimate Gas

```typescript
import { estimate } from './rif/Relay';

const estimation = await estimate(envelopingRequest, metadata);

console.log({
  gasPrice: estimation.gasPrice,
  estimation: estimation.estimation,
  requiredTokenAmount: estimation.requiredTokenAmount,
  exchangeRate: estimation.exchangeRate
});
```

### Relay Transaction

```typescript
import { relay } from './rif/Relay';

const result = await relay(envelopingRequest, metadata);

console.log('Transaction hash:', result.txHash);
console.log('Signed transaction:', result.signedTx);
```

## Configuration

Configuration in `src/lib/integrations/boltz/config.ts`:

### Regtest (Local Testing)

```typescript
regtest: {
  rifRelayServerUrl: 'http://localhost:8090',
  rifRelayEnabled: false, // RIF Relay deprecated on regtest
  contracts: {
    deployHeight: 0,
    smartWalletFactory: '0x59b670e9fA9D0A427751Af201D676719a970857b',
    deployVerifier: '0x0000000000000000000000000000000000000000'
  }
}
```

### Mainnet (Production)

```typescript
mainnet: {
  rifRelayServerUrl: 'https://boltz.mainnet.relay.rifcomputing.net',
  rifRelayEnabled: true,
  contracts: {
    deployHeight: 6747215,
    smartWalletFactory: '0x44944a80861120B58cc48B066d57cDAf5eC213dd',
    deployVerifier: '0xc0F5bEF6b20Be41174F826684c663a8635c6A081'
  }
}
```

## Decision Logic

### When to Use RIF Relay

The service automatically determines the best claiming method:

```typescript
async function handleSwapUpdate(event: SwapEvent) {
  if (event.status === 'transaction.confirmed') {
    const wallet = this.walletGetter?.();
    if (!wallet) return;

    // Determine claim strategy
    const wasCreatedForSmartWallet = 
      swapData.claimAddress && 
      swapData.claimAddress !== swapData.rbtcAddress;

    if (wasCreatedForSmartWallet) {
      // MUST use RIF Relay - swap locked for Smart Wallet
      await this.claimRBTCViaRifRelay(swapData, nsec, wallet);
    } else {
      // Check user's gas balance
      const balance = await wallet.provider.getBalance(wallet.address);
      const gasEstimate = await this.estimateClaimGas(swapData);

      if (balance >= gasEstimate) {
        // User has gas - try direct claim first
        try {
          await this.claimRBTC(swapData, nsec, wallet);
        } catch (error) {
          // Direct claim failed, try RIF Relay as fallback
          if (isRifRelayAvailable()) {
            await this.claimRBTCViaRifRelay(swapData, nsec, wallet);
          }
        }
      } else {
        // User has no gas - use RIF Relay
        await this.claimRBTCViaRifRelay(swapData, nsec, wallet);
      }
    }
  }
}
```

## Testing

### Regtest Testing

**Note**: RIF Relay is deprecated on regtest. Testing gasless claims requires mainnet.

### Mainnet Testing

```bash
# 2. Create wallet with ZERO RBTC balance
# (Use fresh mnemonic, don't fund it)

# 3. Create reverse swap
# Should automatically use Smart Wallet address for claiming

# 4. Pay Lightning invoice

# 5. Watch console for:
# - "🌐 Attempting gasless claim via RIF Relay..."
# - "✅ Transaction relayed: 0x..."
# - "🎉 Successfully claimed via RIF Relay!"

# 6. Verify RBTC received in wallet
```

## Error Handling

### Common Errors

**1. "RIF Relay is not available"**
- **Cause**: Environment not configured for RIF Relay
- **Solution**: Check `isRifRelayAvailable()` returns `true`

**2. "Smart Wallet deployment failed"**
- **Cause**: RIF Relay server issues or network problems
- **Solution**: Retry or fallback to funded claim if user can get gas

**3. "estimation failed"**
- **Cause**: Incorrect request parameters
- **Solution**: Verify all swap parameters are correct

### Error Recovery

```typescript
try {
  const { txHash } = await claimRBTCViaRifRelay(swapData, nsec, wallet);
  console.log('✅ Gasless claim succeeded:', txHash);
} catch (error) {
  console.error('❌ RIF Relay claim failed:', error);
  
  // Check if user can do direct claim
  const balance = await wallet.provider.getBalance(wallet.address);
  const gasRequired = await estimateClaimGas();
  
  if (balance >= gasRequired) {
    console.log('⚠️ Falling back to direct claim');
    return await claimRBTC(swapData, nsec, wallet);
  } else {
    // Leave in transaction.confirmed state for manual intervention
    swapData.status = 'transaction.confirmed';
    await saveSwapToNostr(swapData, nsec);
    throw new Error(
      'Unable to claim: RIF Relay unavailable and user has no gas'
    );
  }
}
```

## Cost Analysis

### One-Time Costs (Per User)
- **Smart Wallet Deployment**: ~$0 (gasless via RIF Relay)
  - Deployment is handled automatically on first claim

### Per-Transaction Costs
- **User Pays**: $0 (gasless!)
- **RIF Relay Pays**: ~$0.01-0.02 gas per transaction
- **Covered By**: Boltz RIF Relay sponsorship

### Comparison

| Method | User Gas Cost | Setup Cost | Total for 10 Claims |
|--------|---------------|------------|---------------------|
| **Direct Claim** | ~$0.01 each | $0 | ~$0.10 |
| **RIF Relay** | $0 | $0 | **$0** |

**RIF Relay is always cheaper for users!**

## Security Considerations

### Safe Practices

✅ **Do**:
- Verify Smart Wallet ownership before claiming
- Use actual event parameters (not API values)
- Implement fallback to direct claim
- Sign with correct EOA (Smart Wallet owner)

❌ **Don't**:
- Expose user's EOA private key
- Trust Smart Wallet addresses without verification
- Skip signature verification
- Use API-provided amounts without blockchain verification

## References

### Documentation
- [RIF Relay Integration Guide](https://dev.rootstock.io/developers/integrate/rif-relay/integrate/)
- [RIF Relay Architecture](https://dev.rootstock.io/developers/integrate/rif-relay/architecture/)
- [Boltz RIF Relay Blog Post](https://rif.technology/content-hub/rif-relay-use-cases-enabling-atomic-swaps/)

### Repositories
- [RIF Relay Server](https://github.com/rsksmart/rif-relay-server)
- [RIF Relay Contracts](https://github.com/rsksmart/rif-relay-contracts)
- [Boltz Web App (Reference Implementation)](https://github.com/BoltzExchange/boltz-web-app)

### Specifications
- [EIP-712: Typed Structured Data Hashing](https://eips.ethereum.org/EIPS/eip-712)
- [Rootstock (RSK)](https://rootstock.io/)

