# RIF Relay Integration for BitTasker

This folder contains the RIF Relay implementation for enabling gasless RBTC claims in BitTasker. It's based on the proven implementation from the Boltz web app.

## Overview

RIF Relay enables users to claim RBTC from reverse swaps without needing RBTC for gas fees. The relay server pays gas fees on behalf of the user, making it possible for users to receive their first RBTC without any initial balance.

## Architecture

### Smart Wallet System

When a user performs a gasless transaction:
1. Their EOA (Externally Owned Account) signs a transaction request
2. A Smart Wallet contract is deployed for them (if not already deployed)
3. The Smart Wallet executes the transaction on their behalf
4. RIF Relay server pays the gas fees

### Files

- **Signer.ts** - Main entry point for gasless claims
  - `relayClaimTransaction()` - Execute gasless claim via RIF Relay
  - `getSmartWalletAddress()` - Get/compute Smart Wallet address
  - EIP-712 typed data signing

- **Contracts.ts** - Smart contract ABIs and factories
  - Smart Wallet Factory ABI
  - Forwarder (Smart Wallet) ABI
  - Contract instance creation

- **Relay.ts** - RIF Relay HTTP API client
  - `getChainInfo()` - Get relay server info
  - `estimate()` - Estimate gas and fees
  - `relay()` - Submit transaction to relay

- **Utils.ts** - Helper utilities
  - Gas price calculation
  - Request validation
  - Timestamp helpers

- **rootstock.ts** - RSK-specific utilities
  - Satoshi ↔ Wei conversions
  - Hex prefix helper

- **types/** - TypeScript type definitions
  - TypedRequestData - EIP-712 structures
  - EnvelopingRequest - Relay request format

## Usage

The RIF Relay integration is automatically used by `reverseSwapService.ts` when:
1. A reverse swap lockup is confirmed
2. User has insufficient RBTC for gas, OR
3. Direct claim fails and RIF Relay is available

```typescript
import { relayClaimTransaction } from './rif/Signer';

// In claimRBTCViaRifRelay()
const txHash = await relayClaimTransaction(
  walletSigner,
  etherSwapContract,
  preimage,
  amount,
  refundAddress,
  timelock
);
```

## Configuration

Configuration is managed in `../config.ts`:

```typescript
// Mainnet (production)
{
  rifRelayServerUrl: 'https://boltz.mainnet.relay.rifcomputing.net',
  rifRelayEnabled: true,
  contracts: {
    smartWalletFactory: '0x44944a80861120B58cc48B066d57cDAf5eC213dd',
    deployVerifier: '0xc0F5bEF6b20Be41174F826684c663a8635c6A081',
    deployHeight: 6747215
  }
}

// Regtest (local testing)
{
  rifRelayEnabled: false,  // RIF Relay deprecated on regtest
  // ... regtest config
}
```

## Claim Strategy

The reverse swap service uses a smart fallback strategy:

```
1. Check user's RBTC balance
2. If balance >= gas estimate:
   → Try direct claim (cheaper, faster)
   → If fails AND RIF Relay available: fallback to RIF Relay
3. If balance < gas estimate:
   → Use RIF Relay (gasless)
4. If both fail:
   → Leave in 'transaction.confirmed' state for manual retry
```

## Network Support

- ✅ **Mainnet**: Fully supported via Boltz RIF Relay
- ❌ **Regtest**: Disabled (RIF Relay deprecated)
- ❌ **Testnet**: Not supported (Boltz doesn't support RSK testnet)

## Transaction Flow

### Gasless Claim Process

1. **Lockup Confirmed** (`transaction.confirmed`)
   - Boltz has locked RBTC in EtherSwap contract
   - User needs to claim with preimage

2. **Balance Check**
   - Check if user has sufficient RBTC for gas
   - Estimate: ~100,000 gas @ 0.06 gwei

3. **RIF Relay Execution** (if needed)
   - Get Smart Wallet address (deploy if needed)
   - Encode claim transaction data
   - Sign enveloping request (EIP-712)
   - Submit to RIF Relay server
   - Wait for confirmation

4. **Claim Complete** (`claimed`)
   - RBTC credited to user's wallet
   - Invoice settled by Boltz

## Security

- User's private key never leaves their device
- Smart Wallet is owned by user's EOA
- Transactions require user's signature
- RIF Relay cannot execute arbitrary transactions
- Only approved contract calls are relayed

## References

- Original Implementation: [Boltz Web App](https://github.com/BoltzExchange/boltz-web-app)
- RIF Relay Docs: https://dev.rootstock.io/developers/integrate/rif-relay/
- EIP-712: https://eips.ethereum.org/EIPS/eip-712
- Rootstock: https://rootstock.io/

## Testing

To test gasless claims:

1. Set environment to mainnet:
   ```bash
   VITE_BOLTZ_NETWORK=mainnet
   ```

2. Create a reverse swap with a wallet that has 0 RBTC

3. Pay the Lightning invoice

4. Wait for lockup confirmation

5. Service should automatically claim via RIF Relay

6. Verify in logs:
   - "🌐 Attempting gasless claim via RIF Relay..."
   - "RIF smart wallet exists: true/false"
   - "✅ Transaction relayed: 0x..."
   - "🎉 Successfully claimed via RIF Relay!"

