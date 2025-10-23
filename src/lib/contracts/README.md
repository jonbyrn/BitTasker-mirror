# EVM Contract TypeChain Bindings

## Overview

This directory contains TypeChain-generated TypeScript bindings for EVM smart contracts used in Boltz swaps.

## Why TypeChain?

TypeChain generates type-safe wrappers for smart contracts, providing:

- ✅ **Type Safety**: Compile-time checking of contract method calls
- ✅ **Autocomplete**: IntelliSense support for contract methods and events
- ✅ **Error Prevention**: Catch parameter type mismatches before runtime
- ✅ **Better DX**: Clear documentation through TypeScript interfaces

## About boltz-core

**Note**: The `boltz-core` package focuses on **Bitcoin UTXO swaps** (P2WSH scripts, Taproot, MuSig2) and does NOT export EtherSwap contract ABIs. For EVM chains (RBTC, ETH), Boltz provides contract addresses via API, and we manage our own ABI bindings.

## Contracts

### EtherSwap

The EtherSwap contract enables atomic swaps on EVM chains (RBTC, Ethereum, etc.).

**Source**: https://github.com/BoltzExchange/boltz-core/blob/master/contracts/EtherSwap.sol

**Key Functions**:
- `claim(preimage, amount, refundAddress, timelock)`: Claim locked funds with preimage
- `lock(preimageHash, claimAddress, refundAddress, timelock)`: Lock funds for swap
- `refund(preimageHash, amount, claimAddress, timelock)`: Refund after timeout

**Events**:
- `Lockup(preimageHash, amount, claimAddress, refundAddress, timelock)`: Emitted when funds are locked
- `Claim(preimageHash, preimage)`: Emitted when funds are claimed
- `Refund(preimageHash)`: Emitted when funds are refunded

## Usage

### With TypeChain Factory (Recommended)

```typescript
import { EtherSwap__factory } from '$lib/contracts';

// Connect to deployed contract
const etherSwap = EtherSwap__factory.connect(
  contractAddress,
  walletSigner
);

// Call contract methods with full type safety
const tx = await etherSwap.claim(
  preimage,      // BytesLike - typed!
  amount,        // BigNumberish - typed!
  refundAddress, // AddressLike - typed!
  timelock       // BigNumberish - typed!
);

await tx.wait();
```

### With ethers Contract (Alternative)

```typescript
import { Contract } from 'ethers';
import EtherSwapAbi from '$lib/contracts/abis/EtherSwap.json';

const etherSwap = new Contract(
  contractAddress,
  EtherSwapAbi,
  walletSigner
);

// Less type safety, but works
const tx = await etherSwap.claim(preimage, amount, refundAddress, timelock);
```

### With Interface (For Event Parsing)

```typescript
import { Interface } from 'ethers';
import EtherSwapAbi from '$lib/contracts/abis/EtherSwap.json';

const iface = new Interface(EtherSwapAbi);

// Parse event from transaction receipt
for (const log of receipt.logs) {
  const parsed = iface.parseLog({
    topics: [...log.topics],
    data: log.data
  });
  
  if (parsed?.name === 'Lockup') {
    console.log('Lockup event:', parsed.args);
  }
}
```

## Regenerating Bindings

If the EtherSwap contract is updated:

```bash
# 1. Update ABI in src/lib/contracts/abis/EtherSwap.json

# 2. Regenerate TypeChain bindings
npx typechain --target ethers-v6 \
  --out-dir src/lib/contracts \
  'src/lib/contracts/abis/*.json'

# 3. Verify types compile
npm run check
```

## Files

```
contracts/
├── README.md                    # This file
├── abis/
│   └── EtherSwap.json          # Contract ABI
├── common.ts                    # TypeChain common types
├── EtherSwap.ts                 # Contract interface
├── index.ts                     # Exports
└── factories/
    └── EtherSwap__factory.ts   # Contract factory
```

## References

- [TypeChain Documentation](https://github.com/dethcrypto/TypeChain)
- [Boltz EtherSwap Source](https://github.com/BoltzExchange/boltz-core/blob/master/contracts/EtherSwap.sol)
- [Ethers v6 Documentation](https://docs.ethers.org/v6/)

