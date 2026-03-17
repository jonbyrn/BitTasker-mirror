# DirectSendRouter Deployment Guide

## Overview

This guide covers deploying the DirectSendRouter smart contract to BSC (Binance Smart Chain) testnet and mainnet. The DirectSendRouter is a gas-efficient contract that routes USDT transfers with fixed fee collection to a treasury address.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [BSC Testnet Deployment](#bsc-testnet-deployment)
4. [BSC Mainnet Deployment](#bsc-mainnet-deployment)
5. [Verification & Testing](#verification--testing)
6. [Security Considerations](#security-considerations)
7. [Operational Guide](#operational-guide)

## Prerequisites

### Environment Setup

1. **Node.js & npm**: v18+ required
2. **Hardhat**: Already configured in `/contracts`
3. **Private Key**: A funded account with testnet BNB for gas
4. **BSCscan API Key**: For contract verification

### Required Dependencies

All dependencies are in `contracts/package.json`:

- `@openzeppelin/contracts` - Security libraries (ERC20, ReentrancyGuard, Ownable)
- `hardhat` - Development framework
- `ethers` - Web3 library
- `@nomicfoundation/hardhat-verify` - Contract verification

### Installation

```bash
cd contracts
npm install
```

## Architecture Overview

### DirectSendRouter Contract

**Location**: `/home/scott/USDT/BitTasker/contracts/contracts/DirectSendRouter.sol`

**Key Features**:

- Routes USDT transfers with fixed fee collection
- Uses ReentrancyGuard for reentrancy protection
- Implements Ownable for administrative control
- Immutable USDT token and fee parameters
- Pause/unpause functionality
- Custom errors for gas efficiency
- Event logging with sponsor ID tracking

**Constructor Parameters**:

```solidity
constructor(
  address _usdt,           // USDT contract address
  address _treasury,       // Treasury wallet for fee collection
  uint256 _fixedFee        // Fixed fee in atomic units (6 decimals for USDT)
)
```

**Key Functions**:

- `route(address recipient, uint256 amount, bytes32 sponsorId)` - Transfer with fee
- `pause()` - Pause router (owner only)
- `unpause()` - Unpause router (owner only)
- `setTreasury(address _treasury)` - Update treasury address (owner only)
- `isPaused()` - Check pause status

### Mock USDT Contract

**Location**: `/home/scott/USDT/BitTasker/contracts/contracts/ERC20Mock.sol`

Used for testnet deployment to simulate USDT token with minting capabilities.

## BSC Testnet Deployment

### Chain Information

- **Chain ID**: 97
- **Network Name**: bscTestnet
- **RPC Endpoint**: https://data-seed-prebsc-1-2.binance.org:8545
- **Block Explorer**: https://testnet.bscscan.com

### Environment Configuration

Create a `.env` file in the `/contracts` directory:

```bash
# Private key of deployer account (with testnet BNB)
DEPLOYER_PRIVATE_KEY=0x... (without 0x prefix: abc123...)

# Testnet configuration
BSC_TESTNET_RPC=https://data-seed-prebsc-1-2.binance.org:8545
GAS_PRICE_TESTNET=10  # Gwei (adjust if needed)

# Contract configuration
TREASURY_ADDRESS=0x... (address for fee collection)
FIXED_FEE_USDT=1     # Fee per transfer in USDT

# Verification (optional)
ETHERSCAN_API_KEY=... (from bscscan.com)
```

### Funding Test Account

1. Get testnet BNB from [BSC Faucet](https://testfaucet.binance.org/)
2. Verify balance: `npm run balance:testnet` (if script available)
3. Need at least 0.5 BNB for deployment and testing

### Deployment Steps

**Step 1: Compile Contracts**

```bash
cd contracts
npm run compile
```

Verify compilation succeeds without errors.

**Step 2: Deploy to Testnet**

```bash
npm run deploy:testnet
```

The script will:

1. Deploy ERC20Mock (test USDT)
2. Deploy DirectSendRouter
3. Mint test USDT
4. Test basic functionality (transfer, fee collection)
5. Save deployment record to `deployments/bsc-testnet.json`

**Expected Output**:

```
DirectSendRouter - BSC Testnet Deployment
Network: bscTestnet (Chain ID: 97)
Deployer: 0x...

Step 1: Deploying USDT Mock Contract
✓ USDT Mock deployed to: 0x...
✓ Deployment tx: 0x...

Step 2: Deploying DirectSendRouter
✓ DirectSendRouter deployed to: 0x...
✓ Deployment tx: 0x...

Step 3: Verifying Initial State
✓ USDT Contract: 0x...
✓ Treasury: 0x...
✓ Fixed Fee: 1.000000 USDT
✓ Paused: false

... (additional test output)

DEPLOYMENT SUMMARY
Network:                BSC Testnet (Chain ID 97)
DirectSendRouter:       0x...
USDT Mock:              0x...
Treasury:               0x...
Fixed Fee:              1.000000 USDT

✓ Deployment complete!
```

**Step 3: Verify Deployment**

Check the deployment record:

```bash
cat deployments/bsc-testnet.json
```

Record the addresses:

- **DirectSendRouter**: `0x...`
- **USDT Mock**: `0x...`
- **Transaction Hashes**: Included in deployment record

**Step 4: Verify on BSCscan** (if API key available)

Automatic verification during deployment or manual:

```bash
npx hardhat verify --network bscTestnet <ROUTER_ADDRESS> <USDT_ADDRESS> <TREASURY_ADDRESS> <FIXED_FEE>
```

Example:

```bash
npx hardhat verify --network bscTestnet 0x1234... 0x5678... 0x9abc... 1000000
```

Visit: https://testnet.bscscan.com/address/<ROUTER_ADDRESS>

### Testing on Testnet

Run comprehensive test suite:

```bash
npm run test:testnet
```

This will:

1. Load deployment record from `bsc-testnet.json`
2. Mint USDT to test accounts
3. Test USDT approval
4. Test transfer with fee collection
5. Test multiple transfers
6. Test pause/unpause
7. Test event emission
8. Test treasury management
9. Test input validation

**Test Results**: All tests should pass with "✓"

## BSC Mainnet Deployment

### Chain Information

- **Chain ID**: 56
- **Network Name**: bscMainnet
- **RPC Endpoint**: https://bsc-dataseed1.defibit.io:443
- **Block Explorer**: https://bscscan.com
- **USDT Contract**: `0x55d398326f99059fF775485246999027B3197955`

### Pre-Deployment Checklist

Before deploying to mainnet:

- [ ] Test deployment on testnet first (REQUIRED)
- [ ] All tests passing on testnet
- [ ] Code audit/review completed
- [ ] Treasury address confirmed
- [ ] Fee amount finalized and tested
- [ ] Sufficient mainnet BNB for gas (>1 BNB recommended)
- [ ] BSCscan API key available
- [ ] Backup of private key
- [ ] Mainnet RPC endpoints tested
- [ ] Emergency pause mechanism ready

### Environment Configuration for Mainnet

Update `.env` file:

```bash
# Mainnet configuration
BSC_MAINNET_RPC=https://bsc-dataseed1.defibit.io:443
GAS_PRICE_MAINNET=5  # Gwei (adjust based on network)

# Use REAL USDT on mainnet
USDT_CONTRACT_ADDRESS=0x55d398326f99059fF775485246999027B3197955

# Treasury for mainnet (MUST be correct)
TREASURY_ADDRESS=0x... (MAINNET TREASURY)

# Fixed fee (recommend testing value first)
FIXED_FEE_USDT=1.0

# Must have BSCscan API key for verification
ETHERSCAN_API_KEY=...
```

### Mainnet Deployment Process

**Step 1: Final Testing**

Ensure testnet deployment is complete and all tests pass:

```bash
cd contracts
npm run test
npm run test:testnet
```

**Step 2: Deploy Script Execution**

```bash
npm run deploy:mainnet
```

**CRITICAL**: This will deploy to MAINNET using REAL USDT. Ensure:

- Private key is correct
- Treasury address is correct
- Fee amount is appropriate

**Step 3: Verification**

After deployment:

```bash
# Verify on BSCscan (automatic or manual)
npx hardhat verify --network bscMainnet <ROUTER_ADDRESS> <USDT_ADDRESS> <TREASURY_ADDRESS> <FIXED_FEE>
```

Visit: https://bscscan.com/address/<ROUTER_ADDRESS>

**Step 4: Operational Setup**

After successful deployment:

1. **Transfer initial USDT**: Send USDT to contract for operational testing
2. **Configure monitoring**: Set up block explorer notifications
3. **Test transfers**: Execute test transfers with real accounts
4. **Documentation**: Update operational runbooks

### Monitoring Post-Deployment

Track on BSCscan:

- https://bscscan.com/address/<ROUTER_ADDRESS> - Router contract
- https://bscscan.com/token/<USDT_ADDRESS>?a=<ROUTER_ADDRESS> - Token transfers

Set up alerts for:

- Pause events
- Unusual transfer amounts
- Treasury withdrawals

## Verification & Testing

### Unit Tests

Run local unit tests:

```bash
npm run test
```

Tests cover:

- Deployment validation
- Route function (transfer + fee)
- Pause/unpause functionality
- Reentrancy protection
- Treasury management
- Input validation
- Edge cases

### Integration Tests

Run testnet integration tests:

```bash
npm run deploy:testnet
npm run test:testnet
```

Validates:

- Contract deployment
- USDT minting
- Approval mechanism
- Transfer with fee collection
- Multiple transfers
- Event emission
- Pause/unpause workflow
- Treasury updates

### Gas Analysis

Check gas usage:

```bash
npm run test:gas
cat gas-report.txt
```

**Expected Gas for route()**:

- ~80,000-120,000 gas (2 transferFrom calls)
- Cost at 5 gwei: ~$0.02-0.03 USD (varies with BNB price)

## Security Considerations

### Code Security Features

1. **ReentrancyGuard**: Prevents reentrancy attacks

   - Uses checks-effects-interactions pattern
   - Guards all external function calls

2. **Ownable**: Access control for sensitive functions

   - Only owner can pause/unpause
   - Only owner can change treasury

3. **Input Validation**:

   - Recipient address validation
   - Amount validation
   - Balance and allowance checks

4. **Custom Errors**: Gas-efficient error handling
   - Reduces bytecode size
   - Saves gas on failure cases

### Deployment Security

1. **Private Key Management**:

   - Never commit `.env` file with real private keys
   - Use environment variables
   - Rotate keys after deployment

2. **Multi-sig Treasury** (Recommended):

   - Use Gnosis Safe or similar
   - Require multiple signatures for withdrawals
   - Prevents single point of failure

3. **Upgrade Path**:

   - Current contract is non-upgradeable
   - Consider UUPS proxy for future versions
   - Plan for emergency pause capability

4. **Testnet First**:
   - Always deploy to testnet first
   - Complete testing before mainnet
   - Use same configuration as mainnet

### Audit Recommendations

Before mainnet deployment:

1. **Internal Review**: Security team review
2. **External Audit**: Consider OpenZeppelin or similar
3. **Formal Verification**: Optional for critical paths
4. **Monitoring Setup**: Real-time alerts for anomalies

## Operational Guide

### Treasury Management

**View treasury balance**:

```bash
# Testnet
npx hardhat run scripts/check-balance.ts --network bscTestnet

# Mainnet
npx hardhat run scripts/check-balance.ts --network bscMainnet
```

**Change treasury address**:

Only owner can update:

```javascript
// Via Hardhat console or script
const router = await ethers.getContractAt('DirectSendRouter', routerAddress);
await router.setTreasury(newTreasuryAddress);
```

### Emergency Pause

In case of detected issues:

```javascript
const router = await ethers.getContractAt('DirectSendRouter', routerAddress);
await router.pause(); // Prevents all transfers
```

Resume with:

```javascript
await router.unpause();
```

### Collecting Treasury Fees

Treasury can withdraw collected USDT:

```javascript
const usdt = await ethers.getContractAt('IERC20', usdtAddress);
const balance = await usdt.balanceOf(treasuryAddress);
await usdt.transfer(withdrawalAddress, balance);
```

### Monitoring Events

Track transfers via event logs:

```javascript
const filter = router.filters.Transfer();
const events = await router.queryFilter(filter, startBlock, endBlock);

// Each event contains:
// - from: sender
// - to: recipient
// - amount: transfer amount
// - fee: collected fee
// - sponsorId: tracking ID
```

### Troubleshooting

**Deployment fails with "Invalid USDT address"**:

- Verify USDT_CONTRACT_ADDRESS is correct
- Ensure address is checksummed properly
- For testnet, deploy mock first

**Transfers fail with "InsufficientAllowance"**:

- User must approve router + fee amount
- Example: `approve(router, amount + fee)`
- Check allowance: `allowance(user, router)`

**Verification fails on BSCscan**:

- Wait 30 seconds after deployment
- Ensure exact constructor arguments match
- Check Solidity version (0.8.20)
- Verify contract code matches uploaded source

**Network RPC endpoint fails**:

- Check BSC testnet/mainnet status
- Use alternative RPC endpoints:
  - Testnet: https://rpc.ankr.com/bsc_testnet_chapel
  - Mainnet: https://rpc.ankr.com/bsc

## Deployment Records

### Testnet Deployment Record

Location: `deployments/bsc-testnet.json`

Contains:

- Contract addresses (Router, USDT Mock)
- Deployment transaction hashes
- Constructor parameters
- Test results and balances
- BSCscan links

### Mainnet Deployment Record

Location: `deployments/bsc-mainnet.json` (created after mainnet deploy)

Contains:

- Production contract addresses
- Real USDT address used
- Treasury address
- Fixed fee
- Deployment block numbers
- Verification status

## Additional Resources

- **DirectSendRouter Contract**: `contracts/DirectSendRouter.sol`
- **Test Suite**: `test/DirectSendRouter.test.ts`
- **Deploy Scripts**: `scripts/deploy.ts`, `scripts/deploy-bsc-testnet.ts`
- **Hardhat Config**: `hardhat.config.ts`
- **OpenZeppelin Docs**: https://docs.openzeppelin.com/contracts/
- **BSC Documentation**: https://docs.binance.org/smart-chain/
- **Hardhat Docs**: https://hardhat.org/docs

## Support & Questions

For issues or questions:

1. Review this guide thoroughly
2. Check Hardhat and OpenZeppelin documentation
3. Review contract code comments
4. Test on testnet first
5. Check BSCscan for similar contracts

---

**Last Updated**: 2026-03-15
**Contract Version**: 1.0.0
**Solidity Version**: 0.8.20
