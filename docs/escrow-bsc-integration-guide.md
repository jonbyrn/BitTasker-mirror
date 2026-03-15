# USDT-BSC Escrow Contract Integration Guide

## Overview

This guide describes how to integrate the escrow contract ABI loading, creation, and event decoding functions into the BitTasker application after contract deployment on BSC.

## Architecture

### Components

1. **ABI Loading** (`loadEscrowContractAbi`)
   - Loads contract ABI from deployment registry or cache
   - Returns null if ABI not available (fail-closed)
   - Caches for 1 hour to reduce lookups

2. **Escrow Creation** (`createEscrowOnBsc`)
   - Creates escrow on BSC by calling smart contract
   - Validates parameters before submission
   - Handles USDT approval if needed
   - Returns transaction hash

3. **Event Decoding** (`decodeBscEscrowEvent`)
   - Parses blockchain logs using ethers.js
   - Maps to application event types
   - Extracts and formats fields
   - Preserves USDT precision (6 decimals)

## Installation

The escrow functions are exported from the main escrow module:

```typescript
import { bscEscrow } from '$lib/utils/escrow/v1';

// Or import specific functions
import { loadEscrowContractAbi, createEscrowOnBsc, decodeBscEscrowEvent } from '$lib/utils/escrow/v1';
```

## Usage

### 1. Loading Escrow ABI

```typescript
import { loadEscrowContractAbi } from '$lib/utils/escrow/v1';

// Load ABI for BSC testnet (chain 97) or mainnet (56)
const abi = await loadEscrowContractAbi(97); // BSC testnet

if (!abi) {
  // Handle missing ABI - don't bypass
  console.error('Escrow contract not deployed on this chain');
  return;
}

// ABI is available and can be used
console.log('ABI loaded successfully');
```

### 2. Creating an Escrow

```typescript
import { createEscrowOnBsc } from '$lib/utils/escrow/v1';

try {
  const txHash = await createEscrowOnBsc({
    contractAddress: '0x...', // Deployed contract address
    escrowContractAbi: abi,   // From loadEscrowContractAbi
    senderAddress: userAddress,
    recipientAddress: freelancerAddress,
    amountUSDT: '100.5',      // 6 decimal USDT amount
    escrowId: 'escrow-123',   // Optional metadata
    taskId: 'task-456'        // Optional metadata
  });

  console.log('Escrow created:', txHash);
} catch (error) {
  if (error instanceof AbiNotAvailableError) {
    console.error('ABI not available - escrow creation blocked');
  } else if (error instanceof EscrowCreationError) {
    console.error('Escrow creation failed:', error.message);
  }
}
```

### 3. Decoding Escrow Events

```typescript
import { decodeBscEscrowEvent, filterEscrowEventsByType } from '$lib/utils/escrow/v1';

// From transaction receipt
const logs = receipt.logs;

const decodedEvents = logs
  .map(log => decodeBscEscrowEvent(log, abi))
  .filter(event => event !== null);

// Filter by type
const createdEvents = filterEscrowEventsByType(decodedEvents, 'CREATED');

if (createdEvents.length > 0) {
  const created = createdEvents[0];
  console.log(`Escrow created with ID: ${created.escrowId}`);
  console.log(`Amount: ${created.amountUSDT} USDT`);
}
```

## Integration Points

### After Contract Deployment

1. **Update deployment constants:**

```typescript
// src/lib/utils/constants/escrowDeployment.ts
export const ESCROW_DEPLOYMENTS: Record<...> = {
  97: { // BSC Testnet
    address: '0x...deployed_address',
    abi: require('./path/to/escrow-abi.json'),
    deploymentBlock: 12345,
    verified: true
  },
  56: { // BSC Mainnet
    address: '0x...deployed_address',
    abi: require('./path/to/escrow-abi.json'),
    deploymentBlock: 45678,
    verified: true
  }
};
```

2. **Wire into contract.store.ts:**

```typescript
import { createEscrowOnBsc, loadEscrowContractAbi } from '$lib/utils/escrow/v1';

// In bid acceptance handler
async function acceptBidAndCreateEscrow(bid: Bid) {
  // Load ABI first
  const abi = await loadEscrowContractAbi(97); // or 56 for mainnet
  if (!abi) {
    throw new Error('Escrow contract not deployed on this chain');
  }

  // Create escrow
  const txHash = await createEscrowOnBsc({
    contractAddress: ESCROW_CONTRACT_ADDRESS,
    escrowContractAbi: abi,
    senderAddress: clientAddress,
    recipientAddress: freelancerAddress,
    amountUSDT: bid.amount,
    escrowId: bid.escrowId,
    taskId: bid.taskId
  });

  // Update contract store with transaction hash
  await contractStore.updateContractStatus({
    escrowId: bid.escrowId,
    status: EscrowStatus.PendingFunding,
    transactionHash: txHash
  });
}
```

3. **Listen for escrow events:**

```typescript
import { decodeBscEscrowEvent } from '$lib/utils/escrow/v1';

// Set up event listener
async function setupEscrowEventListener(abi: ContractInterface) {
  const contract = new ethers.Contract(
    ESCROW_CONTRACT_ADDRESS,
    abi,
    provider
  );

  // Listen for events
  contract.on('EscrowCreated', async (escrowId, client, freelancer, amount) => {
    const logs = await provider.getLogs({...});

    logs.forEach(log => {
      const event = decodeBscEscrowEvent(log, abi);
      if (event) {
        // Update contract status
        contractStore.updateEscrowEvent({
          escrowId: event.escrowId,
          type: event.type,
          status: event.status,
          amountUSDT: event.amountUSDT
        });
      }
    });
  });
}
```

## Type Definitions

All types are exported from `$lib/types/escrow`:

```typescript
import type {
  BscEscrowCreationParams,
  BscEscrowEvent,
  BscEscrowEventType,
  AbiLoadResult
} from '$lib/types/escrow';
```

### BscEscrowCreationParams

```typescript
interface BscEscrowCreationParams {
  contractAddress: string;          // Deployed contract address
  escrowContractAbi: ContractInterface | null; // From loadEscrowContractAbi
  signer?: Signer;                  // Optional, uses wallet if not provided
  senderAddress: string;            // Client address
  recipientAddress: string;         // Freelancer address
  amountUSDT: string;               // 6-decimal USDT amount
  escrowId?: string;                // Optional metadata
  taskId?: string;                  // Optional metadata
}
```

### BscEscrowEvent

```typescript
interface BscEscrowEvent {
  type: 'CREATED' | 'FUNDED' | 'COMPLETED' | 'DISPUTED' | 'RELEASED';
  escrowId: string;
  senderAddress: string;
  recipientAddress: string;
  amountUSDT: string;               // 6-decimal formatted
  status: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
}
```

## Error Handling

### AbiNotAvailableError

Thrown when ABI is required but not available.

```typescript
try {
  await createEscrowOnBsc(params);
} catch (error) {
  if (error instanceof AbiNotAvailableError) {
    // Contract not deployed on this chain
    console.error('Escrow contract not deployed');
  }
}
```

### EscrowCreationError

Thrown for contract creation failures.

```typescript
catch (error) {
  if (error instanceof EscrowCreationError) {
    // Get original error if needed
    console.error(error.originalError);

    // Show user-friendly message
    if (error.message.includes('insufficient balance')) {
      showToast('Not enough USDT to create escrow');
    }
  }
}
```

## USDT Amount Handling

All USDT amounts use 6 decimals (standard on BSC):

- Input: `'100.5'` → atomic units: `100500000`
- Output: `'100.500000'` ← formatted from atomic units

Precision is preserved throughout:

```typescript
// These are all equivalent
'100.5' === '100.500000' // Both represent 100.5 USDT
'0.000001' === '1 wei'   // Smallest unit
```

## Testing

Run the escrow tests:

```bash
# All escrow tests
npm test -- src/lib/tests/unit/utils/escrow/

# Specific test file
npm test -- src/lib/tests/unit/utils/escrow/loadEscrowAbi.test.ts

# With coverage
npm test -- --coverage src/lib/tests/unit/utils/escrow/
```

## Deployment Checklist

- [ ] Deploy escrow contract on BSC testnet
- [ ] Verify contract on BSCscan
- [ ] Extract contract ABI
- [ ] Update ESCROW_DEPLOYMENTS constants
- [ ] Test ABI loading: `loadEscrowContractAbi(97)`
- [ ] Test escrow creation on testnet
- [ ] Test event decoding with real logs
- [ ] Wire into contract.store.ts
- [ ] Set up event listeners
- [ ] Run full test suite
- [ ] Test bid acceptance flow end-to-end
- [ ] Deploy to production after verification

## Monitoring and Debugging

### Cache Statistics

```typescript
import { getAbiCacheStats, clearAbiCache } from '$lib/utils/escrow/v1';

// Check what's cached
console.log(getAbiCacheStats());
// { size: 2, chainIds: [97, 56] }

// Clear cache if needed
clearAbiCache(97); // Clear specific chain
clearAbiCache();   // Clear all
```

### Debug Logging

All functions use the debug module. Enable with:

```typescript
localStorage.setItem('debug', 'escrow:*');
```

Then reload the page to see detailed logs.

## Common Issues and Solutions

### Issue: "Escrow ABI not available for chain X"

**Solution:** Contract not deployed on that chain. Update ESCROW_DEPLOYMENTS after deployment.

### Issue: "Insufficient USDT balance"

**Solution:** User doesn't have enough USDT for escrow + fee. Show balance check before submission.

### Issue: "Transaction failed - insufficient gas"

**Solution:** Gas limit too low or network congestion. Increase gas estimate or retry.

### Issue: Event not decoded

**Solution:** Make sure ABI matches deployed contract. Verify event signature in ABI.

## Performance Considerations

- ABI loading is cached (1 hour TTL)
- Event decoding is done synchronously on logs
- Consider batching event decoding for large log arrays
- Use `filterEscrowEventsByType()` to find relevant events quickly

## Security Considerations

- ABI is loaded only from verified sources (deployment registry or cache)
- No fallback or bypass if ABI missing (fail-closed)
- All addresses validated with `ethers.isAddress()`
- Amounts validated to prevent overflow
- Custom error types prevent information leakage

## Further Reading

- [ethers.js Interface](https://docs.ethers.org/v6/api/contract/interface/)
- [USDT on BSC](https://bscscan.com/address/0x55d398326f99059fF775485246999027B3197955)
- [BitTasker Escrow Documentation](./escrow-lifecycle.md)
