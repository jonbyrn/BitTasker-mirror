# Rootstock Escrow Smart Contract

A comprehensive escrow smart contract for the Rootstock blockchain that facilitates secure, trustless transactions between Clients and Freelancers with automated timelocks, dispute resolution, tier-based fee systems, and automated platform fee distribution.

## Table of Contents

- [Contract Overview](#contract-overview)
- [Outcome Map](#outcome-map)
- [Features](#features)
- [Installation](#installation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contract Functions](#contract-functions)
- [Security Features](#security-features)
- [Events](#events)
- [Example Usage](#example-usage)
- [License](#license)

## Contract Overview

The `EscrowContract` is a production-ready smart contract built on Solidity 0.8.26 that implements a comprehensive escrow system with the following key characteristics:

- **Tier-based Fee System**: Three fee tiers (1.5%, 2.0%, 2.5%) for both Clients and Freelancers
- **Automated Platform Fee Distribution**: Fees automatically sent to immutable platform address
- **Smart Cancellation Logic**: 1-hour grace period + 24-hour cancellation window
- **Simplified Dispute Resolution**: Single freelancer amount proposal system
- **Gas-Optimized**: On-demand fee calculations reduce escrow creation costs
- **Automated Timelocks**: 7-day completion timelock, 14-day dispute timelock
- **Security**: Reentrancy protection, access controls, and pausable functionality
- **Modern Practices**: Uses `.call()` for transfers, OpenZeppelin security contracts

## Outcome Map

The following table outlines all possible escrow outcomes, restrictions, requirements, and fund transfers:

| **Outcome** | **Trigger** | **Who Can Initiate** | **Requirements** | **Fund Transfers** | **Platform Fees** |
|-------------|-------------|---------------------|------------------|-------------------|-------------------|
| **1. Escrow Creation** | `createEscrow()` | Client | • Valid Freelancer address<br>• Future start time<br>• Valid fee tiers (1-3)<br>• Non-zero payment | • Client pays: `fullAmount` (base + client fee)<br>• Escrow holds: `fullAmount` | • Client fee: 1.5-2.5%<br>• Freelancer fee: 1.5-2.5%<br>• Fees calculated on-demand |
| **2. Client Cancellation** | `cancelEscrow()` | Client | • State: `Funded`<br>• Within 1h grace period OR >24h before start | • Client receives: `fullAmount`<br>• Full refund including client fee | • No platform fees collected |
| **3. Freelancer Refund** | `refundClient()` | Freelancer | • State: `Funded`, `Completed`, or `InDispute` | • Client receives: `fullAmount`<br>• Full refund including client fee | • No platform fees collected |
| **4. Task Completion** | `completeTask()` | Freelancer only | • State: `Funded`<br>• After estimated start time | • No immediate transfers<br>• Sets 7-day timelock | • No platform fees collected |
| **5. Task Acceptance** | `acceptTask()` | Client only | • State: `Completed`<br>• Task marked complete | • Freelancer receives: `baseAmount - freelancerFee`<br>• Platform receives: `clientFee + freelancerFee` | • Both fees sent to platform address |
| **6. Task Dispute** | `disputeTask()` | Client only | • State: `Completed`<br>• After task completion<br>• Within 24h of start time OR after grace period | • No immediate transfers<br>• Sets 14-day dispute timelock | • No platform fees collected |
| **7. Dispute Proposal** | `proposeResolution()` | Client or Freelancer | • State: `InDispute`<br>• Max 2 proposals per party<br>• Freelancer amount > 0 and ≤ base amount | • No immediate transfers<br>• Proposal stored for acceptance | • No platform fees collected |
| **8. Proposal Acceptance** | `acceptProposal()` | Non-proposer party | • State: `InDispute`<br>• Valid proposal exists<br>• Not own proposal | • Freelancer receives: `proposedAmount - freelancerFee`<br>• Client receives: `remainder - clientFee`<br>• Platform receives: `recalculated fees` | • Fees sent to platform address |
| **9. Dispute Timeout (Client Refund)** | `resolveAfterTimelock()` | Client only | • State: `InDispute`<br>• 14-day timelock expired | • Client receives: `fullAmount`<br>• Full refund including client fee | • No platform fees collected |
| **10. Completion Timeout (Auto-pay)** | `resolveAfterTimelock()` | Either party | • State: `Completed`<br>• 7-day timelock expired | • Freelancer receives: `baseAmount - freelancerFee`<br>• Platform receives: `clientFee + freelancerFee` | • Both fees sent to platform address |
| **11. Contract Pause** | `pause()` | Owner only | • Owner privileges | • All main functions disabled<br>• View functions remain available | • No impact on existing escrows |

### Key Restrictions and Requirements

- **Fee Tiers**: Must be 1, 2, or 3 (invalid tiers rejected)
- **Proposal Limit**: Maximum 2 proposals per party per escrow
- **Time Restrictions**: Start time must be in future, completion after start
- **Access Control**: Only parties (Client/Freelancer) can perform escrow actions
- **State Validation**: Functions check current escrow state before execution
- **Amount Validation**: Freelancer amount must be > 0 and ≤ base amount
- **Cancellation Logic**: 1-hour grace period OR >24 hours before start time
- **Dispute Logic**: Only within 24h of start time OR after grace period
- **Platform Fee Distribution**: Automatic transfer to immutable platform address
- **Pausable**: Contract can be paused by owner (emergency stop)

## Features

### Core Functionality
- **Escrow Management**: Create and fund escrow contracts between Clients and Freelancers
- **Tier-based Fees**: Three fee tiers (1.5%, 2.0%, 2.5%) for both Clients and Freelancers
- **Automated Platform Fee Distribution**: Fees automatically sent to immutable platform address
- **Smart Cancellation System**: 1-hour grace period + 24-hour cancellation window
- **Freelancer Refund Option**: Freelancers can refund clients at any time
- **Automated Timelocks**: 7-day completion timelock, 14-day dispute timelock
- **Simplified Dispute Resolution**: Single freelancer amount proposal system
- **Auto-payment**: Automatic Freelancer payment after timelock expiration

### Security Features
- **Reentrancy Protection**: All state-changing functions protected with `nonReentrant`
- **Access Controls**: Only authorized parties can perform specific actions
- **Pausable Contract**: Owner can pause all main functions in emergencies
- **Input Validation**: Comprehensive validation of all inputs
- **Modern Transfer Methods**: Uses `.call()` instead of deprecated `transfer()`

### Advanced Features
- **Gas Optimization**: On-demand fee calculations reduce escrow creation costs
- **Proposal Limiting**: Maximum 2 dispute proposals per party per escrow
- **Fee Recalculation**: Dispute resolution recalculates fees on proposed amounts
- **Dust Prevention**: Precise amount calculations prevent dust accumulation
- **Immutable Platform Address**: Platform fee destination cannot be changed
- **Event Logging**: Comprehensive event emission for all actions

## Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Compile the contracts:**
```bash
npx hardhat compile
```

3. **Verify installation:**
```bash
npx hardhat test
```

## Testing

The project includes a comprehensive test script (`simplified-escrow-test-script.js`) that provides extensive testing capabilities.

### Test Script Usage

```bash
node simplified-escrow-test-script.js [scenario]
```

### Available Test Scenarios

#### Comprehensive Tests
- `(no parameter)` - Run ALL tests (default)
- `all` - Run ALL tests (explicit)

#### Security Tests
- `security` - Run 32 comprehensive security tests

#### Individual Escrow Scenarios
- `escrow1` - Tasker cancels >24h before completion
- `escrow2` - Taskee cancels escrow  
- `escrow3` - Tasker cancels <24h before completion
- `escrow4` - Taskee completes work, Tasker accepts
- `escrow5` - Taskee completes work, Tasker disputes
- `escrow6` - Dispute proposal and acceptance
- `escrow7` - Final dispute (timelock expires, Tasker gets refund)
- `escrow8` - Auto-pay Taskee after timelock
- `escrow9` - Tier-based fee system test
- `escrow10` - Fee tier validation test
- `escrow11` - Edge case testing
- `escrow12` - Comprehensive scenario testing

#### Grouped Tests
- `escrow` - Run ALL escrow scenario tests

#### Help
- `help` - Display usage instructions

### Test Features

- **Real Testnet Testing**: Deploys to Rootstock Testnet with real transactions
- **Comprehensive Coverage**: 32 security tests + 12 escrow scenarios
- **Real-time Results**: Shows test results as they complete
- **Detailed Logging**: Full transaction details and gas costs
- **Balance Tracking**: Monitors wallet balances throughout tests
- **Error Handling**: Comprehensive error detection and reporting

### Example Test Commands

```bash
# Run all tests
node simplified-escrow-test-script.js

# Run only security tests
node simplified-escrow-test-script.js security

# Run specific escrow scenario
node simplified-escrow-test-script.js escrow4

# Run all escrow scenarios
node simplified-escrow-test-script.js escrow
```

## Deployment

### Local Network (Hardhat)
```bash
npx hardhat run scripts/deploy.js --network localhost
```

### Rootstock Testnet
1. **Set environment variables:**
```bash
export PRIVATE_KEY="your_private_key_here"
export RPC_URL="https://public-node.testnet.rsk.co"
```

2. **Deploy:**
```bash
npx hardhat run scripts/deploy.js --network testnet
```

### Rootstock Mainnet
```bash
npx hardhat run scripts/deploy.js --network mainnet
```

## Contract Functions

### Core Escrow Functions

#### `createEscrow(address freelancer, uint256 estimatedStartTime, uint256 estimatedCompletionTime, uint256 clientFeeTier, uint256 freelancerFeeTier)`
- **Purpose**: Create a new escrow contract
- **Access**: Public (payable)
- **Requirements**: 
  - Valid Freelancer address (not zero, not self, not contract)
  - Future start time
  - Completion time after start time
  - Valid fee tiers (1-3)
  - Non-zero payment
- **Payment**: Client pays `baseAmount + clientFee` (full amount)
- **Returns**: Escrow ID
- **Events**: `EscrowCreated`

#### `completeTask(uint256 escrowId)`
- **Purpose**: Mark task as completed
- **Access**: Freelancer only
- **Requirements**:
  - Escrow state: `Funded`
  - After estimated start time
- **Events**: `TaskCompleted`

#### `acceptTask(uint256 escrowId)`
- **Purpose**: Accept completed task and pay Freelancer
- **Access**: Client only
- **Requirements**:
  - Escrow state: `Completed`
- **Transfers**: 
  - Freelancer receives `baseAmount - freelancerFee`
  - Platform receives `clientFee + freelancerFee`
- **Events**: `TaskAccepted`, `EscrowResolved`

#### `cancelEscrow(uint256 escrowId)`
- **Purpose**: Cancel escrow and refund Client
- **Access**: Client only
- **Requirements**:
  - Escrow state: `Funded`
  - Within 1-hour grace period OR >24 hours before start time
- **Transfers**: Client receives full refund including client fee
- **Events**: `EscrowCancelled`

#### `refundClient(uint256 escrowId)`
- **Purpose**: Freelancer refunds Client
- **Access**: Freelancer only
- **Requirements**:
  - Escrow state: `Funded`, `Completed`, or `InDispute`
- **Transfers**: Client receives full refund including client fee
- **Events**: `EscrowCancelled`

### Dispute Functions

#### `disputeTask(uint256 escrowId)`
- **Purpose**: Dispute completed task
- **Access**: Client only
- **Requirements**:
  - Escrow state: `Completed`
  - Within 24 hours of start time OR after grace period
- **Events**: `TaskDisputed`

#### `proposeResolution(uint256 escrowId, uint256 freelancerAmount)`
- **Purpose**: Propose dispute resolution
- **Access**: Client or Freelancer
- **Requirements**:
  - Escrow state: `InDispute`
  - Max 2 proposals per party
  - Freelancer amount > 0 and ≤ base amount
- **Events**: `DisputeProposed`

#### `acceptProposal(uint256 escrowId)`
- **Purpose**: Accept dispute proposal
- **Access**: Non-proposer party
- **Requirements**:
  - Escrow state: `InDispute`
  - Valid proposal exists
  - Not own proposal
- **Transfers**: 
  - Freelancer receives `proposedAmount - freelancerFee`
  - Client receives `remainder - clientFee`
  - Platform receives `recalculated fees`
- **Events**: `DisputeResolved`

#### `resolveAfterTimelock(uint256 escrowId)`
- **Purpose**: Resolve escrow after timelock expiration
- **Access**: Parties (varies by scenario)
- **Requirements**:
  - Timelock expired
  - Valid state
- **Transfers**: 
  - **Completion timeout**: Freelancer receives `baseAmount - freelancerFee`, Platform receives fees
  - **Dispute timeout**: Client receives full refund
- **Events**: `EscrowResolved`

### Utility Functions

#### `getDisputeProposal(uint256 escrowId)`
- **Purpose**: Get dispute proposal details
- **Access**: Client and Freelancer only
- **Returns**: Proposal details (proposer, freelancer amount, timestamp, accepted)

#### `pause()`
- **Purpose**: Pause contract (emergency stop)
- **Access**: Owner only
- **Effect**: Disables all main functions

#### `unpause()`
- **Purpose**: Unpause contract
- **Access**: Owner only
- **Effect**: Restores normal functionality

### View Functions

#### `nextEscrowId()`
- **Purpose**: Get next escrow ID
- **Access**: Public view
- **Returns**: Next escrow ID

#### `owner()`
- **Purpose**: Get contract owner
- **Access**: Public view
- **Returns**: Owner address

#### `paused()`
- **Purpose**: Check if contract is paused
- **Access**: Public view
- **Returns**: Boolean

#### `escrows(uint256)`
- **Purpose**: Get escrow details
- **Access**: Public view
- **Returns**: Escrow struct

#### `TIER_1_FEE()`, `TIER_2_FEE()`, `TIER_3_FEE()`
- **Purpose**: Get fee tier percentages
- **Access**: Public view
- **Returns**: Fee percentage in basis points

## Security Features

### Access Controls
- **Party Validation**: Only Client and Freelancer can perform escrow actions
- **Owner Functions**: Critical functions restricted to contract owner
- **State Validation**: Functions check current escrow state before execution
- **Immutable Platform Address**: Platform fee destination cannot be changed

### Reentrancy Protection
- **NonReentrant Modifier**: Applied to all state-changing functions
- **Modern Transfer Methods**: Uses `.call()` for secure transfers

### Input Validation
- **Address Validation**: Prevents zero addresses and self-escrow
- **Time Validation**: Ensures proper time ordering
- **Amount Validation**: Prevents invalid amounts and precision loss
- **Tier Validation**: Ensures valid fee tiers

### Emergency Features
- **Pausable Contract**: Owner can pause all main functions
- **Automated Fee Distribution**: Platform fees automatically sent to immutable address

## Events

The contract emits comprehensive events for all major actions:

### Core Events
- `EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 amount)`
- `TaskCompleted(uint256 indexed escrowId)`
- `TaskAccepted(uint256 indexed escrowId)`
- `TaskDisputed(uint256 indexed escrowId, address indexed disputer)`

### Dispute Events
- `DisputeProposed(uint256 indexed escrowId, address indexed proposer, uint256 freelancerAmount)`
- `DisputeResolved(uint256 indexed escrowId, uint256 clientAmount, uint256 freelancerAmount)`

### Resolution Events
- `EscrowCancelled(uint256 indexed escrowId, uint256 clientAmount, uint256 freelancerAmount)`
- `EscrowResolved(uint256 indexed escrowId, uint256 freelancerAmount, uint256 platformFee)`

## Example Usage

### Basic Escrow Flow

```javascript
const { ethers } = require("hardhat");

// Deploy contract
const EscrowContract = await ethers.getContractFactory("EscrowContract");
const escrowContract = await EscrowContract.deploy();

// Create escrow
const baseAmount = ethers.parseEther("1.0");
const clientFeePercentage = 250; // 2.5% (Tier 1)
const totalPayment = (baseAmount * (10000n + clientFeePercentage)) / 10000n;
const startTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
const completionTime = Math.floor(Date.now() / 1000) + 86400; // 1 day from now

const tx = await escrowContract.createEscrow(
    freelancerAddress, 
    startTime, 
    completionTime, 
    1, // Client fee tier
    1, // Freelancer fee tier
    { value: totalPayment }
);

// Mark task completed
await escrowContract.connect(freelancer).completeTask(escrowId);

// Accept task
await escrowContract.connect(client).acceptTask(escrowId);
```

### Dispute Resolution Flow

```javascript
// Dispute task
await escrowContract.connect(client).disputeTask(escrowId);

// Propose resolution
const freelancerAmount = ethers.parseEther("0.7");
await escrowContract.connect(client).proposeResolution(escrowId, freelancerAmount);

// Accept proposal
await escrowContract.connect(freelancer).acceptProposal(escrowId);
```

### Fee Tier Examples

```javascript
// Tier 1: 2.5% fees
await escrowContract.createEscrow(freelancer, startTime, completionTime, 1, 1, { value: totalPayment });

// Tier 2: 2.0% fees  
await escrowContract.createEscrow(freelancer, startTime, completionTime, 2, 2, { value: totalPayment });

// Tier 3: 1.5% fees
await escrowContract.createEscrow(freelancer, startTime, completionTime, 3, 3, { value: totalPayment });
```

### Cancellation and Refund Examples

```javascript
// Client cancels within grace period (1 hour) or >24h before start
await escrowContract.connect(client).cancelEscrow(escrowId);

// Freelancer refunds client (can be done anytime after funding)
await escrowContract.connect(freelancer).refundClient(escrowId);
```

## Configuration

### Fee Tiers
- **Tier 1**: 2.5% (250 basis points)
- **Tier 2**: 2.0% (200 basis points)  
- **Tier 3**: 1.5% (150 basis points)

### Timelock Periods
- **Completion Timelock**: 7 days
- **Dispute Timelock**: 14 days

### Platform Fee System
- **Automated Distribution**: Platform fees automatically sent to immutable address
- **Fee Collection Points**: Fees collected during task acceptance and dispute resolution
- **Immutable Address**: Platform fee destination cannot be changed after deployment
- **No Manual Withdrawal**: Fees are automatically distributed, no owner withdrawal needed

### Network Configuration
- **Rootstock Mainnet**: Chain ID 30
- **Rootstock Testnet**: Chain ID 31
- **Local Hardhat**: Chain ID 1337

## Key Changes and Improvements

### Recent Updates

#### Automated Platform Fee Distribution
- **Immutable Platform Address**: Platform fees automatically sent to a fixed address
- **No Manual Management**: Eliminates need for owner to manually withdraw fees
- **Gas Efficient**: Fees distributed during payout transactions

#### Simplified Dispute Resolution
- **Single Amount Proposal**: Only freelancer amount needed in proposals
- **Automatic Client Calculation**: Client amount calculated as remainder
- **Cleaner Interface**: Reduced complexity in dispute proposals

#### Smart Cancellation Logic
- **1-Hour Grace Period**: Clients can cancel within 1 hour of escrow creation
- **24-Hour Window**: Clients can cancel if >24 hours before start time
- **Dispute Requirement**: Within 24h of start, clients must dispute instead of cancel

#### Freelancer Refund Option
- **Anytime Refund**: Freelancers can refund clients at any stage
- **Full Refund**: Client receives complete amount including fees
- **Flexible Resolution**: Provides alternative to disputes

#### Gas Optimization
- **On-Demand Calculations**: Fees calculated during payouts, not escrow creation
- **Reduced Storage**: Lower gas costs for escrow creation
- **Efficient Processing**: Optimized for frequent escrow creation

#### Enhanced Security
- **Checks-Effects-Interactions**: Proper state change ordering
- **Input Validation**: Comprehensive validation of all parameters
- **Access Controls**: Strict party and state validation

## Security Test Results

~/Doc/d/dev/rootstock-escrow |   master !3 ?4 ·· INT ✘ | 4m 42s  | system  | 21:29:40  ─╮
╰─ node simplified-escrow-test-script.js security                                                      ─╯
================================================================================
🚀 COMPREHENSIVE ROOTSTOCK SIMPLIFIED ESCROW CONTRACT TEST SCRIPT
================================================================================
📋 ADDRESS MODE: FIXED ADDRESSES (Recommended)
   ✅ Using predefined wallet addresses for consistent testing
   ✅ Same addresses every run - easier to fund and track
   ✅ Better for repeated testing and debugging

🔧 TO USE DYNAMIC ADDRESSES:
   1. Edit the script and set USE_FIXED_ADDRESSES = false
   2. Run the script to generate new random addresses each time
   3. Fund the dynamically generated addresses as shown

💰 FUNDING INSTRUCTIONS:
   1. Go to Rootstock Testnet Faucet: https://faucet.rsk.co/
   2. Fund the addresses shown below (minimum 0.00001 RBTC each)
   3. Wait for confirmations before running tests
================================================================================

🎯 Running scenario: SECURITY

💰 Fetching current RBTC price...
   ✅ RBTC price: $116828.00 (CoinGecko)
📊 Test Amounts:
   - Small Amount: 0.00001 RBTC ($1.17)
   - Medium Amount: 0.0001 RBTC ($11.68)
   - Large Amount: 0.001 RBTC ($116.83)
   - Faucet Amount: 0.0005 RBTC ($58.41)

🔑 Using FIXED wallet addresses:
   Platform: 0x5360d463F26bf773B016F5dDFDcCaeBE8a74B9BA
   Client: 0x1Be31A94361a391bBaFB2a4CCd704F57dc04d4bb
   Freelancer: 0xf42138298fa1Fc8514BC17D59eBB451AceF3cDBa
   Malicious: 0x6b6C574b96891888A734581ab41dF72670B8A2B8
   Platform Fee Destination: 0x38738E06987725cDA930c84ac35C9f34519d9DFb

💰 WALLET BALANCE CHECK:
--------------------------------------------------
   PLATFORM_FEE_DESTINATION: 0x38738E06987725cDA930c84ac35C9f34519d9DFb
   Balance: 0.000000987805878049 RBTC ($0.12) - ✅ Funded
   PLATFORM: 0x5360d463F26bf773B016F5dDFDcCaeBE8a74B9BA
   Balance: 0.000189503073251527 RBTC ($22.14) - ✅ Funded
   CLIENT: 0x1Be31A94361a391bBaFB2a4CCd704F57dc04d4bb
   Balance: 0.000168305925987431 RBTC ($19.66) - ✅ Funded
   FREELANCER: 0xf42138298fa1Fc8514BC17D59eBB451AceF3cDBa
   Balance: 0.000528176477185173 RBTC ($61.71) - ✅ Funded
   MALICIOUS: 0x6b6C574b96891888A734581ab41dF72670B8A2B8
   Balance: 0.0004397910393824 RBTC ($51.38) - ✅ Funded
--------------------------------------------------
📊 Summary: 5/5 wallets funded
✅ All wallets funded - ready for comprehensive testing!

🔍 Verifying transaction confirmation...
   Latest block: 6833123
   Current balance: 0.000189503073251527 RBTC ($22.14)
   Transaction count: 370
   Gas estimation successful: 21000 gas
✅ Funds are confirmed and spendable

🔍 Verifying transaction confirmation...
   Latest block: 6833123
   Current balance: 0.000168305925987431 RBTC ($19.66)
   Transaction count: 894
   Gas estimation successful: 21000 gas
✅ Funds are confirmed and spendable

📦 Deploying EscrowContract to Rootstock Testnet...
0. Compiling EscrowContract...
Nothing to compile
   ✅ Compilation completed
1. Deploying EscrowContract...
   EscrowContract deployment transaction: 0xae6e8431356c52e99097e6991b2bc1916f2986b1e77eaf30f59b99265986a949
   Waiting for EscrowContract deployment confirmation...
   ⏳ EscrowContract deployment - waiting for confirmation...
   📝 Transaction hash: 0xae6e8431356c52e99097e6991b2bc1916f2986b1e77eaf30f59b99265986a949
   ✅ EscrowContract deployment confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 1847830 units, Cost: 0.00000828945407584 RBTC ($0.97)
✅ EscrowContract deployed to: 0xd45d44efDc0432CD3394Db7cDFE2232A9028C6D3
   Network: Rootstock Testnet (Chain ID: 31)
   Explorer: https://explorer.testnet.rsk.co/address/0xd45d44efDc0432CD3394Db7cDFE2232A9028C6D3
   Fee System: Tier-based (1.5%, 2.0%, 2.5%)

🔒 RUNNING SECURITY TESTS ONLY
==================================================

🔒 Testing Security Violations (Real Transactions)

📦 Deploying fresh EscrowContract for security testing...
   🔨 Compiling EscrowContract...
Nothing to compile
   ✅ Compilation completed
✅ Fresh contract deployed to: 0x05268e153cF820395A078E4A515103f420FF6355
📋 Creating fresh test escrow for security testing...
   ⏳ Fresh test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0xb547ca4166e9ccc5a8e342700e2d3068d75ac4ed5326e4c28b527d1ee265a9f5
   ✅ Fresh test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000996692200448 RBTC ($0.12)
💰 Malicious wallet balance: 0.0004397910393824 RBTC ($51.38)
🧪 Running 42 comprehensive security tests...

📋 Each test will create its own unique escrow to avoid race conditions


🧪 Test 1/39: Third party trying to cancel escrow
   ✅ Security working: Third party trying to cancel escrow blocked
      Error: VM Exception while processing transaction: revert Only parties

🧪 Test 2/39: Client trying to accept their own task
   ✅ Security working: Client trying to accept their own task blocked
      Error: VM Exception while processing transaction: revert Task not completed

🧪 Test 3/39: Third party trying to dispute
   ✅ Security working: Third party trying to dispute blocked
      Error: VM Exception while processing transaction: revert Only parties

🧪 Test 4/39: Third party trying to cancel as freelancer
   ✅ Security working: Third party trying to cancel as freelancer blocked
      Error: VM Exception while processing transaction: revert Only parties

🧪 Test 5/39: Third party trying to mark task completed
   ✅ Security working: Third party trying to mark task completed blocked
      Error: VM Exception while processing transaction: revert Only parties

🧪 Test 6/39: Client trying to mark task completed
   ✅ Security working: Client trying to mark task completed blocked
      Error: VM Exception while processing transaction: revert Only Taskee

🧪 Test 7/39: Third party trying to propose dispute resolution
   ✅ Security working: Third party trying to propose dispute resolution blocked
      Error: VM Exception while processing transaction: revert Only parties

🧪 Test 8/39: Third party trying to accept dispute proposal
   ✅ Security working: Third party trying to accept dispute proposal blocked
      Error: VM Exception while processing transaction: revert Only parties

🧪 Test 9/39: Third party trying to resolve dispute after timelock
   ✅ Security working: Third party trying to resolve dispute after timelock blocked
      Error: VM Exception while processing transaction: revert Only parties

🧪 Test 10/39: Third party trying to get dispute proposal
   ✅ Security working: Third party trying to get dispute proposal blocked
      Error: VM Exception while processing transaction: revert Only parties

🧪 Test 11/39: Non-owner trying to pause contract
   ✅ Security working: Non-owner trying to pause contract blocked
      Error: VM Exception while processing transaction: transaction reverted

🧪 Test 12/39: Non-owner trying to unpause contract
   ✅ Security working: Non-owner trying to unpause contract blocked
      Error: VM Exception while processing transaction: transaction reverted

🧪 Test 13/39: Third party trying to pause contract
   ✅ Security working: Third party trying to pause contract blocked
      Error: VM Exception while processing transaction: transaction reverted

🧪 Test 14/39: Third party trying to unpause contract
   ✅ Security working: Third party trying to unpause contract blocked
      Error: VM Exception while processing transaction: transaction reverted

🧪 Test 15/39: Client trying to create escrow with zero address
   ✅ Security working: Client trying to create escrow with zero address blocked
      Error: VM Exception while processing transaction: revert Invalid freelancer

🧪 Test 16/39: Client trying to create escrow with themselves as freelancer
   ✅ Security working: Client trying to create escrow with themselves as freelancer blocked
      Error: VM Exception while processing transaction: revert Cannot escrow with self

🧪 Test 17/39: Client trying to create escrow with contract address as freelancer
   ✅ Security working: Client trying to create escrow with contract address as freelancer blocked
      Error: VM Exception while processing transaction: revert Cannot escrow with contract address

🧪 Test 18/39: Client trying to create escrow with zero value
   ✅ Security working: Client trying to create escrow with zero value blocked
      Error: VM Exception while processing transaction: revert Amount > 0

🧪 Test 19/39: Client trying to create escrow with negative completion time
   ✅ Security working: Client trying to create escrow with negative completion time blocked
      Error: VM Exception while processing transaction: revert Completion must be after start

🧪 Test 20/39: Client trying to create escrow with invalid client fee tier (0)
   ✅ Security working: Client trying to create escrow with invalid client fee tier (0) blocked
      Error: VM Exception while processing transaction: revert Invalid client fee tier

🧪 Test 21/39: Client trying to create escrow with invalid client fee tier (4)
   ✅ Security working: Client trying to create escrow with invalid client fee tier (4) blocked
      Error: VM Exception while processing transaction: revert Invalid client fee tier

🧪 Test 22/39: Client trying to create escrow with invalid freelancer fee tier (0)
   ✅ Security working: Client trying to create escrow with invalid freelancer fee tier (0) blocked
      Error: VM Exception while processing transaction: revert Invalid freelancer fee tier

🧪 Test 23/39: Client trying to create escrow with invalid freelancer fee tier (4)
   ✅ Security working: Client trying to create escrow with invalid freelancer fee tier (4) blocked
      Error: VM Exception while processing transaction: revert Invalid freelancer fee tier

🧪 Test 24/39: Client trying to cancel already cancelled escrow
   ⏳ State transition test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0xffb7c932886a8531c64bcc2097a43ca01422734f5fce5ebf1d11860ee047b596
   ✅ State transition test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000996692200448 RBTC ($0.12)
   ⏳ First cancellation - waiting for confirmation...
   📝 Transaction hash: 0xd18622707c05ae829448129cd2c770b4650f1f7d3b325ca5e9d84392d1b1e061
   ✅ First cancellation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 65908 units, Cost: 0.000000295666451584 RBTC ($0.03)
   ✅ Security working: Client trying to cancel already cancelled escrow blocked
      Error: VM Exception while processing transaction: revert Invalid state

🧪 Test 25/39: Client trying to propose resolution for non-disputed escrow
   ⏳ Non-disputed test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0x89416c285c0ec28802d38c5a7834def9715f241ab39d5945fb4324d56c03984f
   ✅ Non-disputed test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000996692200448 RBTC ($0.12)
   ✅ Security working: Client trying to propose resolution for non-disputed escrow blocked
      Error: VM Exception while processing transaction: revert Not in dispute

🧪 Test 26/39: Client trying to propose resolution with zero amounts
   ⏳ Zero amounts test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0xc16631f78fd764f981b828035b8eb7d74cdd7e6ef6b8d646b72cb7a043c50537
   ✅ Zero amounts test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000996692200448 RBTC ($0.12)
   ⏳ Task completion - waiting for confirmation...
   📝 Transaction hash: 0xe934b8f3f7cdbb9733dd01668635aa9044bdc17e3212c46ee28055c2469e30c6
   ✅ Task completion confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 85130 units, Cost: 0.00000038189726624 RBTC ($0.04)
   ⏳ Task dispute - waiting for confirmation...
   📝 Transaction hash: 0x7a831dd9fe0d7e92a0c2fa13901c8cde21fdbdcfa0f394e6528733c6028c9819
   ✅ Task dispute confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 54949 units, Cost: 0.000000246503851552 RBTC ($0.03)
   ✅ Security working: Client trying to propose resolution with zero amounts blocked
      Error: VM Exception while processing transaction: revert Amount must be greater than 0

🧪 Test 27/39: Client can cancel within 1 hour grace period and get full refund
   📋 Creating escrow for grace period cancellation test...
   ⏳ Grace period cancellation test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0x13597ac6fad96b70750fb427a013ad4cff203190d57b74b71d8187b002d8103e
   ✅ Grace period cancellation test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000996692200448 RBTC ($0.12)
   ✅ Grace period escrow created with ID: 5
   ❌ Client cancelling escrow within grace period...
   ⏳ Grace period cancellation - waiting for confirmation...
   📝 Transaction hash: 0xce3840388d7945fe87de3589e8fbd8d92def8cb289690da210932f1ab922b49f
   ✅ Grace period cancellation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 65908 units, Cost: 0.000000295666451584 RBTC ($0.03)
   ✅ Escrow cancelled, gas used: 65908
   💰 Expected refund: 0.00001025 RBTC
   💰 Net refund (after gas): 0.000009954333548416 RBTC
   💰 Gas cost (paid by client): 0.000000295666451584 RBTC
   💰 Actual refund (net + gas): 0.00001025 RBTC
   💰 Expected balance after refund (minus gas): 0.000131734628230471 RBTC
   💰 Actual balance after refund: 0.000131734628230471 RBTC
   💰 Balance difference: 0.0 RBTC
   ✅ Security working: Client can cancel within 1 hour grace period and get full refund blocked

🧪 Test 28/39: Freelancer can refund client after escrow funding for full refund
   📋 Creating escrow for freelancer refund test...
   ⏳ Freelancer refund test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0x2920da297cb5455e9dfe0cb6d3cf75b428d110db723bd58dad448e80f6cc936e
   ✅ Freelancer refund test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000996692200448 RBTC ($0.12)
   ✅ Refund test escrow created with ID: 6
   💰 Freelancer refunding client after escrow funding...
   ⏳ Freelancer refund - waiting for confirmation...
   📝 Transaction hash: 0x2d66f4f4c3b924c1f8cd57b11f8969596845ce0202ce8388279cf8645a30f932
   ✅ Freelancer refund confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 65605 units, Cost: 0.00000029430717904 RBTC ($0.03)
   ✅ Freelancer refund completed, gas used: 65605
   💰 Expected refund: 0.00001025 RBTC
   💰 Actual refund (client receives): 0.00001025 RBTC
   💰 Gas cost (paid by freelancer): 0.00000029430717904 RBTC
   💰 Expected balance after refund (minus gas): 0.000130737936030023 RBTC
   💰 Actual balance after refund: 0.000130737936030023 RBTC
   💰 Balance difference: 0.0 RBTC
   ✅ Security working: Freelancer can refund client after escrow funding for full refund blocked

🧪 Test 29/39: Contract functions blocked when paused
   ⏳ Contract pause - waiting for confirmation...
   📝 Transaction hash: 0x9f624ffa6f888edd9735d4133734093daca9cba7dfcd0f90196c74ba46f403f9
   ✅ Contract pause confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 28204 units, Cost: 0.000000126524497792 RBTC ($0.01)
   ✅ Security working: Contract functions blocked when paused blocked
      Error: VM Exception while processing transaction: transaction reverted

🧪 Test 30/39: View functions work when paused (should work)
   📋 Creating escrow for view function test...
   ⏳ View test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0x7c146aa0a5fc5bcaff9553889b5df86af3ccf6823b5892d7e2f5be74ee767d0b
   ✅ View test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000996692200448 RBTC ($0.12)
   ✅ Escrow created with ID: 7
   ⏸️  Pausing contract...
   ⏳ Contract pause - waiting for confirmation...
   📝 Transaction hash: 0xe9fb31705a56a9601993ff4482fae4931b8f1bc3b6015bfded972bd35e75f730
   ✅ Contract pause confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 28204 units, Cost: 0.000000126406492256 RBTC ($0.01)
   👁️  Testing view functions while paused...
   ✅ View functions work: escrow amount=10250000000000
   ▶️  Unpausing contract...
   ⏳ Contract unpause - waiting for confirmation...
   📝 Transaction hash: 0x09dac8eedec83a461fa8ee4267fd6d7d4e8a9bc5a904dbdb8efb407465522876
   ✅ Contract unpause confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 27814 units, Cost: 0.000000124658565296 RBTC ($0.01)
   ✅ Legitimate behavior: View functions work when paused (should work) - Working correctly

🧪 Test 31/39: Client trying to make more than 2 dispute proposals
   ⏳ Proposal limit test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0x6f79c0fc6130e045c150e5dd250a2d17ee2b2a42036d33f006ce0ca98966bd42
   ✅ Proposal limit test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000995762616064 RBTC ($0.12)
   ⏳ Waiting for start time to pass...
   ⏳ Proposal limit test task completion - waiting for confirmation...
   📝 Transaction hash: 0xa5952e6aad5cc9736da0265af2810940732508da3bae4ea4fbd770912608d18f
   ✅ Proposal limit test task completion confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 85130 units, Cost: 0.00000038154108232 RBTC ($0.04)
   ⏳ Proposal limit test task dispute - waiting for confirmation...
   📝 Transaction hash: 0x64871973179d72b0cc0699585f4b9fede9e88d933db448c7d0c7cdc352872b35
   ✅ Proposal limit test task dispute confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 54949 units, Cost: 0.000000246273944936 RBTC ($0.03)
   📊 Amount Debug:
      baseAmount (input): 10000000000000
      clientFeePercentage: 250
      totalPayment sent: 10250000000000
      actual escrow.amount: 10250000000000
      amounts match: false
   📊 First Proposal:
      freelancerAmount1: 5000000000000
      baseAmount: 10000000000000
      escrow.amount: 10250000000000
      freelancer amount <= baseAmount: true
   ⏳ First proposal - waiting for confirmation...
   📝 Transaction hash: 0xc73c12ac595eba9addb9b4456b870c52c1292926222e16d11cf4608897c71396
   ✅ First proposal confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 112227 units, Cost: 0.000000502986151128 RBTC ($0.06)
   📊 Second Proposal:
      freelancerAmount2: 3000000000000
      baseAmount: 10000000000000
      freelancer amount <= baseAmount: true
   ⏳ Second proposal - waiting for confirmation...
   📝 Transaction hash: 0x24491034a889d99864d65f44097b97997f9d916fdd264b766d4f368b48537238
   ✅ Second proposal confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 52227 units, Cost: 0.000000234074311128 RBTC ($0.03)
   📊 Third Proposal (should fail):
      freelancerAmount3: 1000000000000
      baseAmount: 10000000000000
      freelancer amount <= baseAmount: true
   ✅ Security working: Client trying to make more than 2 dispute proposals blocked
      Error: VM Exception while processing transaction: revert Proposal limit reached

🧪 Test 32/39: Freelancer trying to make more than 2 dispute proposals
   ⏳ Freelancer proposal limit test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0xbadbd107d3ccffe4963e9899251c983fc480feda6ff0f683bb8168f8f0d938ff
   ✅ Freelancer proposal limit test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000995762616064 RBTC ($0.12)
   ⏳ Waiting for start time to pass...
   ⏳ Freelancer proposal limit test task completion - waiting for confirmation...
   📝 Transaction hash: 0xbd453fdeeab75b301d68c29ba5496597d9cd21fd25ec99c0050fea7475639351
   ✅ Freelancer proposal limit test task completion confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 85130 units, Cost: 0.00000038154108232 RBTC ($0.04)
   ⏳ Freelancer proposal limit test task dispute - waiting for confirmation...
   📝 Transaction hash: 0xde4ceaa270c03dac4506910badedf8bb12140c266086edc61695ded504740306
   ✅ Freelancer proposal limit test task dispute confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 54949 units, Cost: 0.000000246273944936 RBTC ($0.03)
   📊 Freelancer Amount Debug:
      baseAmount (input): 10000000000000
      clientFeePercentage: 250
      totalPayment sent: 10250000000000
      actual escrow.amount: 10250000000000
      amounts match: false
   📊 Freelancer First Proposal:
      freelancerAmount1: 5000000000000
      baseAmount: 10000000000000
      escrow.amount: 10250000000000
      freelancer amount <= baseAmount: true
   ⏳ Freelancer first proposal - waiting for confirmation...
   📝 Transaction hash: 0xfeebe86d5591dfafc961febf0c9894e0b3c5e65c4e9518f46b7ca10ce614a1c8
   ✅ Freelancer first proposal confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 112476 units, Cost: 0.000000504102135264 RBTC ($0.06)
   📊 Freelancer Second Proposal:
      freelancerAmount2: 3000000000000
      baseAmount: 10000000000000
      freelancer amount <= baseAmount: true
   ⏳ Freelancer second proposal - waiting for confirmation...
   📝 Transaction hash: 0x7f291e5f086983713e0b14ce61d4dea843699c729551fc0f77e5d1359db63c3f
   ✅ Freelancer second proposal confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 52476 units, Cost: 0.000000235190295264 RBTC ($0.03)
   📊 Freelancer Third Proposal (should fail):
      freelancerAmount3: 1000000000000
      baseAmount: 10000000000000
      freelancer amount <= baseAmount: true
   ✅ Security working: Freelancer trying to make more than 2 dispute proposals blocked
      Error: VM Exception while processing transaction: revert Proposal limit reached

🧪 Test 33/39: Client trying to resolve dispute before timelock expires
   ⏳ Dispute test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0xe60237fa8cf926e3f68e1fb6f8f3d6834465d4b82a36ceb77eb4c0d593f724dc
   ✅ Dispute test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000995226061024 RBTC ($0.12)
   ⏳ Waiting for start time to pass...
   ⏳ Dispute test task completion - waiting for confirmation...
   📝 Transaction hash: 0x78e7ffc88e2c03bd01bf4a9c95991369d3bbc5b9773aefea60c008e0f86c2d2d
   ✅ Dispute test task completion confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 85130 units, Cost: 0.00000038133549337 RBTC ($0.04)
   ⏳ Dispute test task dispute - waiting for confirmation...
   📝 Transaction hash: 0xe9a589be347d3c1ab5ca4221b6736e49d5d7d12a6987e937d7ac18c5e518f487
   ✅ Dispute test task dispute confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 54949 units, Cost: 0.000000246141243101 RBTC ($0.03)
   ✅ Security working: Client trying to resolve dispute before timelock expires blocked
      Error: VM Exception while processing transaction: revert Timelock not passed

🧪 Test 34/39: Client trying to cancel already cancelled escrow
   ⏳ Double cancel test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0xd0d0859f64cdcb80f771ad0821939eba612c0b1536e9a72b7d757aa6ed294077
   ✅ Double cancel test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000995226061024 RBTC ($0.12)
   ⏳ First cancellation - waiting for confirmation...
   📝 Transaction hash: 0xa14d80d815dce7c9465629e9f63622b8f4da408298e9b69a7be3ce332d155f92
   ✅ First cancellation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 65908 units, Cost: 0.000000295231524692 RBTC ($0.03)
   ✅ Security working: Client trying to cancel already cancelled escrow blocked
      Error: VM Exception while processing transaction: revert Invalid state

🧪 Test 35/39: Freelancer trying to complete already completed task
   ⏳ Double completion test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0x313bb8eaaaf6989bf9a688f10b3d1eeac2468232f0e3312a4f350717071ffef9
   ✅ Double completion test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000995226061024 RBTC ($0.12)
   ⏳ Waiting for start time to pass...
   ⏳ First task completion - waiting for confirmation...
   📝 Transaction hash: 0x20af4cc8443d397a5e4106329c60f05a4773611242be71bf55c2b95ccd073495
   ✅ First task completion confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 85130 units, Cost: 0.00000038133549337 RBTC ($0.04)
   ✅ Security working: Freelancer trying to complete already completed task blocked
      Error: VM Exception while processing transaction: revert Invalid state

🧪 Test 36/39: Client trying to accept task that's not completed
   ⏳ Accept test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0x00769f0b9d272c202c87e6fef2ed15cb3b6c8407e98a86cb45e4328c096aa7e1
   ✅ Accept test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000995226061024 RBTC ($0.12)
   ✅ Security working: Client trying to accept task that's not completed blocked
      Error: VM Exception while processing transaction: revert Task not completed

🧪 Test 37/39: Client trying to dispute task that's not completed
   ⏳ Dispute incomplete test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0xd0b68ef87d9f80802af0503df1b8a569e4c88bc6c63689d0d69dcbe749ca62c8
   ✅ Dispute incomplete test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000995226061024 RBTC ($0.12)
   ✅ Security working: Client trying to dispute task that's not completed blocked
      Error: VM Exception while processing transaction: revert Cannot dispute at this time

🧪 Test 38/39: Client trying to propose dispute resolution for non-disputed escrow
   ⏳ Non-disputed test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0x85b1993e4e738cce3296e2c05a4a33935060034232c3178f723ff751a0a6f26c
   ✅ Non-disputed test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000995226061024 RBTC ($0.12)
   ⏳ Waiting for start time to pass...
   ⏳ Non-disputed test task completion - waiting for confirmation...
   📝 Transaction hash: 0xa73991950a1064c770e5acf638b8e7f88a747289e9435a844f2b6810f5296b3a
   ✅ Non-disputed test task completion confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 85130 units, Cost: 0.00000038133549337 RBTC ($0.04)
   ✅ Security working: Client trying to propose dispute resolution for non-disputed escrow blocked
      Error: VM Exception while processing transaction: revert Not in dispute

🧪 Test 39/39: Client trying to accept dispute proposal that doesn't exist
   ⏳ No proposal test escrow creation - waiting for confirmation...
   📝 Transaction hash: 0xcc0e5929200308123ab7ef9c9a440ef5b02acb3c0545a051cc9586f2d53879e4
   ✅ No proposal test escrow creation confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 222176 units, Cost: 0.000000995226061024 RBTC ($0.12)
   ⏳ Waiting for start time to pass...
   ⏳ No proposal test task completion - waiting for confirmation...
   📝 Transaction hash: 0x0399563e0b8b73de5ebabe7b23fc620ce8d16f9242646445a50b6c50c42f404f
   ✅ No proposal test task completion confirmed (async confirmations() {
        return (await this.provider.getBlockNumber()) - this.blockNumber + 1;
    } confirmations)
   ⛽ Gas used: 85130 units, Cost: 0.00000038181877638 RBTC ($0.04)
   ✅ Security working: Client trying to accept dispute proposal that doesn't exist blocked
      Error: VM Exception while processing transaction: revert Not in dispute

📊 Security Test Summary: 39/39 tests passed
✅ All security tests passed - contract is secure!


✅ Security tests completed successfully!

📋 Test Summary:
   ✅ Contract deployment successful on Rootstock Testnet
   ✅ Security tests completed

🎉 Tests completed successfully!
📍 Contract address: 0xd45d44efDc0432CD3394Db7cDFE2232A9028C6D3
🔍 View on explorer: https://explorer.testnet.rsk.co/address/0xd45d44efDc0432CD3394Db7cDFE2232A9028C6D3

⏱️  EXECUTION SUMMARY:
   Total execution time: 30m 55s 140ms
   Total transactions: 39
   Total gas costs: 0.000030915218865195 RBTC ($3.61)
   Average gas cost per transaction: 0.00000079269791962 RBTC ($0.09)
