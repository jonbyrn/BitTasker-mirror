# RSK Escrow Contract Integration

A comprehensive integration system for the Simplified Escrow Smart Contract on the Rootstock (RSK) blockchain. This integration provides a complete TypeScript/Svelte interface for managing escrow transactions between clients and freelancers.

## 🚀 Quick Start

### 1. Environment Setup

Create a `.env.local` file in your project root with the following variables:

```bash
# Contract Configuration
VITE_ESCROW_CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
VITE_ESCROW_CONTRACT_ABI='[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"}]'

# Network Configuration
VITE_RSK_NETWORK=testnet
VITE_RSK_RPC_URL_MAINNET=https://public-node.rsk.co
VITE_RSK_RPC_URL_TESTNET=https://public-node.testnet.rsk.co
```

### 2. Initialize Wallet and Connect to Contract

```typescript
import { rskWallet } from '$lib/stores/rskWallet.store';

// Initialize RSK wallet
await rskWallet.initialize();

// Connect to escrow contract
await rskWallet.connectToEscrowContract();
```

### 3. Create an Escrow

```typescript
import { type FeeTier } from '$lib/contracts/SimplifiedEscrowContract';

const result = await rskWallet.createEscrow(
    '0x742d35Cc6C4C4A6b1E3E4C8d5A8B9F3D2E1C0A9B', // freelancer address
    '1.0', // base amount in RBTC
    Math.floor(Date.now() / 1000) + 3600, // start time (1 hour from now)
    Math.floor(Date.now() / 1000) + 86400, // completion time (1 day from now)
    1 as FeeTier, // client fee tier (2.5%)
    1 as FeeTier  // freelancer fee tier (2.5%)
);

console.log('Escrow created:', result.hash);
console.log('Escrow ID:', result.escrowId);
```

## 📁 File Structure

```
src/lib/
├── contracts/
│   ├── SimplifiedEscrowContract.ts  # Contract ABI and configuration
│   └── README.md                    # This file
│   └── escrow.config.ts            # Environment configuration
│   └── escrow-usage.ts             # Usage examples
├── stores/
│   └── rskWallet.store.ts          # Main wallet store with escrow functions
```

## 🔧 Configuration

### Contract Configuration

The system uses environment variables for production deployment while falling back to test data during development:

- **Test Mode**: Uses `TEST_CONTRACT_ADDRESS` and `TEST_CONTRACT_ABI`
- **Production Mode**: Uses environment variables for real contract deployment

### Fee Tiers

Three fee tiers are available for both clients and freelancers:

| Tier | Percentage | Label |
|------|------------|-------|
| 1    | 2.5%       | 2.5%  |
| 2    | 2.0%       | 2.0%  |
| 3    | 1.5%       | 1.5%  |

### Timelock Periods

- **Completion Timelock**: 7 days
- **Dispute Timelock**: 14 days

## 🏪 Store Integration

### Main Store

```typescript
import { rskWalletStore } from '$lib/stores/rskWallet.store';

// Access full store state
const state = get(rskWalletStore);
console.log('Connected:', state.contractConnected);
console.log('Escrows:', state.escrows);
console.log('Disputes:', state.disputeProposals);
```

### Derived Stores

```typescript
import {
    rskEscrows,
    rskActiveEscrows,
    rskClientEscrows,
    rskFreelancerEscrows,
    rskPendingEscrows,
    rskCompletedEscrows,
    rskDisputedEscrows,
    rskContractConnected
} from '$lib/stores/rskWallet.store';

// Subscribe to specific escrow data
rskActiveEscrows.subscribe(escrows => {
    console.log(`${escrows.length} active escrows`);
});
```

## 🔄 Escrow Lifecycle

### 1. Creation
```typescript
const result = await rskWallet.createEscrow(
    freelancerAddress,
    baseAmount,
    startTime,
    completionTime,
    clientFeeTier,
    freelancerFeeTier
);
```

### 2. Task Completion
```typescript
// Freelancer marks task as complete
await rskWallet.completeTask(escrowId);
```

### 3. Task Acceptance
```typescript
// Client accepts completed task
await rskWallet.acceptTask(escrowId);
```

### 4. Alternative: Cancellation
```typescript
// Either party can cancel before completion
await rskWallet.cancelEscrow(escrowId);
```

## ⚖️ Dispute Resolution

### 1. Initiate Dispute
```typescript
// Client disputes completed task
await rskWallet.disputeTask(escrowId);
```

### 2. Propose Resolution
```typescript
// Either party proposes fund distribution
await rskWallet.proposeResolution(
    escrowId,
    '0.3', // client amount
    '0.7'  // freelancer amount
);
```

### 3. Accept Proposal
```typescript
// Other party accepts the proposal
await rskWallet.acceptProposal(escrowId);
```

### 4. Timelock Resolution
```typescript
// Resolve after timelock expiration
await rskWallet.resolveAfterTimelock(escrowId);
```

## 💰 Fee Calculations

```typescript
import { 
    calculateFeeAmount,
    calculateTotalPayment,
    calculateFreelancerPayout
} from '$lib/contracts/SimplifiedEscrowContract';

const baseAmount = ethers.parseEther('1.0');
const feeTier = 1; // 2.5%

const clientFee = calculateFeeAmount(baseAmount, feeTier);
const totalPayment = calculateTotalPayment(baseAmount, feeTier);
const freelancerPayout = calculateFreelancerPayout(baseAmount, feeTier);
```

## ⛽ Gas Estimation

### Escrow Creation
```typescript
const gasEstimate = await rskWallet.estimateEscrowCreationGas(
    freelancerAddress,
    baseAmount,
    startTime,
    completionTime,
    clientFeeTier,
    freelancerFeeTier
);

console.log('Gas needed:', gasEstimate.gasLimit);
console.log('Total cost:', gasEstimate.totalCostFormatted, 'RBTC');
```

### Contract Functions
```typescript
const gasEstimate = await rskWallet.estimateContractGas('completeTask', escrowId);
```

## 📊 Data Monitoring

### Real-time Updates
```typescript
// Monitor escrow changes
rskEscrows.subscribe(escrows => {
    escrows.forEach(escrow => {
        console.log(`Escrow ${escrow.id}: ${EscrowStatus[escrow.status]}`);
    });
});

// Monitor contract connection
rskContractConnected.subscribe(connected => {
    if (connected) {
        console.log('✅ Contract connected');
    } else {
        console.log('❌ Contract disconnected');
    }
});
```

### Manual Refresh
```typescript
// Refresh escrow data
await rskWallet.refreshEscrows();

// Check specific escrow
const escrow = await rskWallet.getEscrow(escrowId);

// Check dispute proposal
const proposal = await rskWallet.getDisputeProposal(escrowId);
```

### Configuration Status
```typescript
import { 
    logConfigurationStatus,
    validateContractConfig,
    getContractDeploymentStatus
} from '$lib/config/escrow.config';

// Log current configuration
logConfigurationStatus();

// Validate configuration
const validation = validateContractConfig();
console.log('Valid:', validation.isValid);

// Check deployment status
const status = getContractDeploymentStatus();
console.log('Deployed:', status.isDeployed);
console.log('Network:', status.network);
```

## 🔍 Error Handling

```typescript
try {
    await rskWallet.createEscrow(/* ... */);
} catch (error) {
    if (error.message.includes('insufficient funds')) {
        // Handle insufficient balance
    } else if (error.message.includes('Contract not connected')) {
        // Handle contract connection issues
    } else {
        // Handle other errors
    }
}
```

## 📱 Svelte Component Integration

```svelte
<script lang="ts">
    import { onMount } from 'svelte';
    import { rskWallet } from '$lib/stores/rskWallet.store';
    import { rskActiveEscrows, rskContractConnected } from '$lib/stores/rskWallet.store';
    
    let loading = $state(false);
    
    onMount(async () => {
        loading = true;
        try {
            await rskWallet.initialize();
            await rskWallet.connectToEscrowContract();
        } catch (error) {
            console.error('Failed to initialize:', error);
        } finally {
            loading = false;
        }
    });
    
    async function createEscrow() {
        try {
            const result = await rskWallet.createEscrow(
                freelancerAddress,
                '1.0',
                startTime,
                completionTime,
                1,
                1
            );
            console.log('Escrow created:', result);
        } catch (error) {
            console.error('Failed to create escrow:', error);
        }
    }
</script>

{#if loading}
    <p>Connecting to contract...</p>
{:else if $rskContractConnected}
    <div>
        <h2>Active Escrows: {$rskActiveEscrows.length}</h2>
        
        {#each $rskActiveEscrows as escrow}
            <div class="escrow-card">
                <h3>Escrow #{escrow.id}</h3>
                <p>Amount: {escrow.baseAmount} RBTC</p>
                <p>Status: {escrow.status}</p>
            </div>
        {/each}
        
        <button onclick={createEscrow}>Create New Escrow</button>
    </div>
{:else}
    <p>Failed to connect to contract</p>
{/if}
```

## 🧪 Testing

See `src/lib/contracts/escrow-usage.ts` for comprehensive usage examples including:

- Complete escrow workflow
- Dispute resolution workflow  
- Gas estimation examples
- Error handling patterns
- Store subscription examples

## 🔒 Security Considerations

1. **Private Key Management**: The wallet uses the same mnemonic as the main wallet with RSK derivation path `m/44'/137'/0'/0/0`
2. **Gas Estimation**: All functions include gas estimation with 10% buffer
3. **Input Validation**: Contract addresses, amounts, and parameters are validated
4. **Error Handling**: Comprehensive error handling for all contract interactions
5. **Event Filtering**: Only processes events where the user is involved (client or freelancer)

## 🌐 Network Support

- **RSK Mainnet**: Chain ID 30
- **RSK Testnet**: Chain ID 31 (default for safety)

## 📝 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `VITE_ESCROW_CONTRACT_ADDRESS` | Deployed contract address | No | Test address |
| `VITE_ESCROW_CONTRACT_ABI` | Contract ABI JSON | No | Test ABI |
| `VITE_RSK_NETWORK` | Default network | No | `testnet` |
| `VITE_RSK_RPC_URL_MAINNET` | Mainnet RPC URL | No | Public RSK node |
| `VITE_RSK_RPC_URL_TESTNET` | Testnet RPC URL | No | Public RSK testnet node |

## 🚀 Production Deployment

1. Deploy your escrow contract to RSK
2. Set environment variables with actual contract address and ABI
3. Test on testnet first
4. Deploy to mainnet with proper testing

```bash
# Example production environment
VITE_ESCROW_CONTRACT_ADDRESS=0xYourActualContractAddress
VITE_ESCROW_CONTRACT_ABI='[...your actual ABI...]'
VITE_RSK_NETWORK=mainnet
```

The system will automatically detect production configuration and use real contract data instead of test data.

## 🤝 Contributing

1. Follow the existing code patterns
2. Add comprehensive error handling
3. Include TypeScript types
4. Update documentation
5. Add usage examples

## 📄 License

This integration follows the same license as the main project.
