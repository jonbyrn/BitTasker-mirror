# RIF Relay Implementation Reference

⚠️ **DEPRECATED - DO NOT IMPORT FROM THIS FOLDER**

This folder contains the reference implementation of RIF Relay from the Boltz web app.
It is kept here for documentation purposes only.

## Active Implementation

The active RIF Relay implementation for BitTasker is located at:
```
src/lib/integrations/boltz/rif/
```

This implementation has been adapted from the Boltz reference to work with BitTasker's:
- Configuration system (`src/lib/integrations/boltz/config.ts`)
- TypeScript setup
- Project structure

## What is RIF Relay?

RIF Relay enables gasless transactions on the Rootstock (RSK) network. Users can perform blockchain transactions without holding RBTC for gas fees. Instead:

1. A Smart Wallet is deployed for the user (gasless, one-time)
2. Transactions are relayed through the Smart Wallet
3. RIF Relay server pays gas fees on behalf of the user
4. Service fees are covered by the relayer

## Key Components

### Contracts.ts
- Smart Wallet Factory ABI and interface
- Forwarder (Smart Wallet) ABI
- Factory methods for creating contract instances

### Signer.ts
- `relayClaimTransaction()` - Main function for gasless RBTC claims
- `getSmartWalletAddress()` - Compute Smart Wallet address
- EIP-712 typed data signing for relay requests

### Relay.ts
- HTTP client for RIF Relay server API
- `getChainInfo()` - Get relay server configuration
- `estimate()` - Estimate gas and fees
- `relay()` - Submit transaction to relay server

### Utils.ts
- Helper functions for gas price calculation
- Request validation utilities
- Timestamp helpers

### Types
- TypedRequestData - EIP-712 type definitions
- EnvelopingRequest structure

## Network Configuration

From Boltz mainnet config:
```typescript
{
  rifRelay: "https://boltz.mainnet.relay.rifcomputing.net",
  contracts: {
    deployHeight: 6747215,
    smartWalletFactory: "0x44944a80861120B58cc48B066d57cDAf5eC213dd",
    deployVerifier: "0xc0F5bEF6b20Be41174F826684c663a8635c6A081"
  }
}
```

## References

- Original Source: [Boltz Web App](https://github.com/BoltzExchange/boltz-web-app)
- RIF Relay Docs: https://dev.rootstock.io/developers/integrate/rif-relay/
- Rootstock Network: https://rootstock.io/

