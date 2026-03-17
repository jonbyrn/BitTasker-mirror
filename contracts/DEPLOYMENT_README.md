# DirectSendRouter Smart Contract - Deployment Guide

## Overview

The DirectSendRouter is a gas-efficient USDT transfer routing contract for BSC (Binance Smart Chain) with automatic fee collection. This guide covers complete deployment and testing from development to mainnet.

**Contract**: DirectSendRouter v1.0
**Solidity**: 0.8.20
**Network**: BSC Testnet (97) & BSC Mainnet (56)
**Status**: Ready for Testnet Deployment ✓

## Quick Start (5 Minutes)

### 1. Prepare Environment

```bash
cd /home/scott/USDT/BitTasker/contracts

# Install dependencies (if not already done)
npm install

# Copy environment template
cp .env.bsc-testnet.example .env

# Edit .env with your values
# Required: DEPLOYER_PRIVATE_KEY, TREASURY_ADDRESS
nano .env
```

### 2. Get Testnet BNB

Visit: **https://testfaucet.binance.org/**

- Connect your deployer wallet
- Claim at least 0.1 BNB (0.5 BNB recommended)
- Wait for transaction confirmation

### 3. Deploy to Testnet

```bash
# Compile contracts
npm run compile

# Deploy with built-in tests
npm run deploy:testnet:full

# Run comprehensive test suite
npm run test:testnet
```

### 4. Verify on BSCscan

Visit: **https://testnet.bscscan.com**

- Search for contract address from deployment output
- Verify source code (automatic if API key provided)
- Check transactions and events

## Project Structure

```
contracts/
├── contracts/
│   ├── DirectSendRouter.sol       # Main contract
│   ├── ERC20Mock.sol              # Test USDT
│   └── ReentrancyAttacker.sol     # Security test
├── scripts/
│   ├── deploy.ts                  # Generic deployment
│   ├── deploy-bsc-testnet.ts      # Testnet deployment (NEW)
│   ├── test-bsc-testnet.ts        # Testnet testing (NEW)
│   ├── integration-test-local.ts  # Local integration test (NEW)
│   └── check-balance.ts           # Utility script (NEW)
├── test/
│   └── DirectSendRouter.test.ts   # Unit tests (27 tests)
├── hardhat.config.ts              # Network config
├── package.json                   # Updated with new scripts
├── .env.bsc-testnet.example       # Environment template (NEW)
├── README.md                       # Original readme
└── DEPLOYMENT_README.md           # This file
```

## Test Status

### ✓ All Tests Passing

```bash
# Unit Tests
npm test
# Output: 27 passing

# Integration Tests
npm run test:integration
# Output: 6 comprehensive tests passed

# Testnet Ready
npm run deploy:testnet:full
# Includes deployment + initialization tests
```

## Available NPM Scripts

| Script                        | Purpose               | Network     |
| ----------------------------- | --------------------- | ----------- |
| `npm run compile`             | Compile contracts     | Local       |
| `npm test`                    | Run unit tests        | Local       |
| `npm run test:integration`    | Run integration tests | Local       |
| `npm run test:gas`            | Measure gas usage     | Local       |
| `npm run deploy:testnet:full` | Deploy + test         | BSC Testnet |
| `npm run test:testnet`        | Comprehensive testing | BSC Testnet |
| `npm run deploy:mainnet`      | Deploy to mainnet     | BSC Mainnet |
| `npm run check:balance`       | Check account balance | BSC Testnet |
| `npm run coverage`            | Code coverage         | Local       |
| `npm run clean`               | Clean artifacts       | Local       |

## Environment Configuration

### Testnet (.env.bsc-testnet.example → .env)

```bash
# REQUIRED: Your deployer account private key
DEPLOYER_PRIVATE_KEY=your_key_here

# REQUIRED: Address to collect fees
TREASURY_ADDRESS=0x...

# Optional: Contract fee per transfer
FIXED_FEE_USDT=1

# Optional: RPC endpoint (default provided)
BSC_TESTNET_RPC=https://data-seed-prebsc-1-2.binance.org:8545

# Optional: For automatic BSCscan verification
ETHERSCAN_API_KEY=your_key_from_bscscan
```

### Mainnet Configuration (When Ready)

```bash
# Use mainnet deployer account with real BNB
DEPLOYER_PRIVATE_KEY=mainnet_key

# Real USDT address on BSC
USDT_CONTRACT_ADDRESS=0x55d398326f99059fF775485246999027B3197955

# Mainnet treasury address
TREASURY_ADDRESS=mainnet_treasury_address

# Mainnet RPC
BSC_MAINNET_RPC=https://bsc-dataseed1.defibit.io:443
GAS_PRICE_MAINNET=5
```

## Deployment Process

### Phase 1: Local Testing (Complete ✓)

All unit and integration tests passing:

```bash
npm test                    # 27 unit tests
npm run test:integration   # 6 integration tests
```

### Phase 2: BSC Testnet Deployment (Ready)

```bash
# Configure .env first
npm run deploy:testnet:full
```

**Output includes**:

- Contract addresses
- Deployment transaction hashes
- Initial test results
- Deployment record (deployments/bsc-testnet.json)
- BSCscan links

**Duration**: ~3-5 minutes (includes minting & testing)

### Phase 3: Testnet Verification

```bash
# Run comprehensive test suite
npm run test:testnet

# Manual verification on BSCscan
# https://testnet.bscscan.com/address/<CONTRACT_ADDRESS>
```

### Phase 4: Mainnet Deployment (After Testnet Success)

```bash
# 1. Update .env for mainnet
# 2. Ensure sufficient BNB (1+ BNB)
# 3. Deploy
npm run deploy:mainnet

# 4. Verify on BSCscan
# 5. Set up monitoring
```

## Contract Features

### Route Function

```solidity
function route(
  address recipient,
  uint256 amount,
  bytes32 sponsorId
) external nonReentrant returns (bool)
```

**Transfers USDT with automatic fee collection**

- User approves router for `amount + fee`
- Router transfers `amount` to recipient
- Router transfers `fee` to treasury
- Emits `Transfer` event with sponsor ID
- Gas: ~62,985-120,000 (varies)

### Pause/Unpause (Owner Only)

```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
function isPaused() external view returns (bool)
```

**Emergency control mechanism**

- Owner can pause all transfers
- Useful for security incidents
- Transfers blocked when paused

### Treasury Management (Owner Only)

```solidity
function setTreasury(address _treasury) external onlyOwner
```

**Update fee collection address**

- Change treasury wallet
- New transfers go to updated address
- Validated for zero address

## Test Coverage

### Unit Tests (27 tests - 100% coverage)

✓ Deployment tests (4)
✓ Route function tests (8)
✓ Pause/unpause tests (6)
✓ Reentrancy tests (1)
✓ Treasury tests (4)
✓ Gas efficiency test (1)
✓ Edge cases (3)

### Integration Tests (6 tests)

✓ Basic transfer with fee
✓ Multiple transfers
✓ Pause/unpause workflow
✓ Treasury update
✓ Event emission
✓ Gas analysis

### Test Commands

```bash
# Run all unit tests
npm test

# Run with detailed output
npx hardhat test --reporter spec

# Run specific test
npx hardhat test test/DirectSendRouter.test.ts

# Local integration test
npm run test:integration

# Testnet comprehensive tests
npm run test:testnet
```

## Deployment Records

### Testnet Record

**Location**: `deployments/bsc-testnet.json`

**Contains**:

- Contract addresses (Router, USDT Mock)
- Deployment transaction hashes
- Constructor parameters
- Block numbers
- Test results
- BSCscan links

**Example**:

```json
{
	"network": "bsc-testnet",
	"chainId": 97,
	"timestamp": "2026-03-15T...",
	"contracts": {
		"DirectSendRouter": {
			"address": "0x...",
			"deploymentTx": "0x..."
		},
		"USDTMock": {
			"address": "0x..."
		}
	}
}
```

### Mainnet Record

**Location**: `deployments/bsc-mainnet.json` (created after deploy)

**Same format as testnet but with**:

- Real USDT address
- Real treasury address
- Mainnet contract addresses
- Production block numbers

## Security Features

### Smart Contract Security

1. **ReentrancyGuard**: Prevents reentrancy attacks
2. **Ownable**: Access control for sensitive functions
3. **Input Validation**: All parameters validated
4. **Custom Errors**: Gas-efficient error handling
5. **Immutable Config**: USDT and fee cannot be changed

### Deployment Security

1. **Private Key Management**

   - Never commit .env with real keys
   - Use environment variables
   - Rotate keys after deployment

2. **Multi-sig Treasury** (Recommended)

   - Use Gnosis Safe or similar
   - Require multiple signatures
   - Prevents single point of failure

3. **Upgrade Path**
   - Current: Non-upgradeable
   - Future: Consider UUPS proxy if needed

## Troubleshooting

### Compilation Issues

```bash
# Clean and rebuild
npm run clean
npm run compile

# Check Solidity version (should be 0.8.20)
npx hardhat --version
```

### Deployment Failures

**"Invalid USDT address"**

- For testnet: Use deployed mock address or deploy new mock
- For mainnet: Use real USDT: `0x55d398326f99059fF775485246999027B3197955`

**"Insufficient gas"**

- Need more BNB in deployer account
- Check balance: `npm run check:balance`
- Get testnet BNB: https://testfaucet.binance.org/

**"Network timeout"**

- Check BSC RPC status
- Use alternative endpoint
- Check internet connection

### Test Failures

```bash
# Run with detailed output
npx hardhat test --reporter spec

# Common causes:
# - Insufficient allowance (need amount + fee)
# - Insufficient balance
# - Contract paused
# - Invalid parameters
```

## Verification on BSCscan

### Automatic Verification

If `ETHERSCAN_API_KEY` is set:

- Deployment script auto-verifies after 5 seconds
- Source code visible on BSCscan
- Can interact with contract in browser

### Manual Verification

```bash
npx hardhat verify --network bscTestnet \
  0x<ROUTER_ADDRESS> \
  0x<USDT_ADDRESS> \
  0x<TREASURY_ADDRESS> \
  1000000
```

### View on Block Explorer

- **Testnet**: https://testnet.bscscan.com
- **Mainnet**: https://bscscan.com

Search for contract address to view:

- Source code (if verified)
- Transactions
- Events
- Token transfers

## Gas Analysis

### Route Function Gas Usage

- **Typical**: ~63,000 gas
- **Range**: 80,000-120,000 gas
- **Cost at 10 gwei**: ~$0.20-0.50 USD

### Other Operations

- **Pause**: ~30,000 gas
- **Unpause**: ~30,000 gas
- **SetTreasury**: ~50,000 gas

### View Gas Report

```bash
npm run test:gas
cat gas-report.txt
```

## Monitoring & Operations

### After Deployment

1. **Verify on BSCscan**: Check contract code is visible
2. **Test Transfers**: Execute test transfers
3. **Monitor Events**: Track Transfer events
4. **Set Up Alerts**: Configure monitoring
5. **Document**: Update operational runbooks

### Key Metrics to Track

- Transfer volume
- Fee collection rate
- Contract pauses (should be rare)
- Treasury balance
- Unusual transaction amounts

### Collecting Fees

Treasury wallet can withdraw collected USDT:

```javascript
const usdt = await ethers.getContractAt('IERC20', usdtAddress);
const balance = await usdt.balanceOf(treasuryAddress);
await usdt.transfer(withdrawalAddress, balance);
```

## Important Addresses

### BSC Testnet

| Component | Value                                         |
| --------- | --------------------------------------------- |
| Chain ID  | 97                                            |
| RPC       | https://data-seed-prebsc-1-2.binance.org:8545 |
| Explorer  | https://testnet.bscscan.com                   |
| Faucet    | https://testfaucet.binance.org/               |
| USDT      | ERC20Mock (deploy new)                        |

### BSC Mainnet

| Component | Value                                      |
| --------- | ------------------------------------------ |
| Chain ID  | 56                                         |
| RPC       | https://bsc-dataseed1.defibit.io:443       |
| Explorer  | https://bscscan.com                        |
| USDT      | 0x55d398326f99059fF775485246999027B3197955 |

## Files Reference

| File                        | Purpose                |
| --------------------------- | ---------------------- |
| `DirectSendRouter.sol`      | Main router contract   |
| `ERC20Mock.sol`             | Test USDT token        |
| `deploy-bsc-testnet.ts`     | Testnet deployment     |
| `test-bsc-testnet.ts`       | Testnet testing        |
| `integration-test-local.ts` | Local integration test |
| `hardhat.config.ts`         | Hardhat configuration  |
| `.env.bsc-testnet.example`  | Environment template   |
| `package.json`              | npm scripts            |

## Documentation Files

| Document                          | Purpose                                |
| --------------------------------- | -------------------------------------- |
| `DEPLOYMENT_GUIDE.md`             | Comprehensive guide (mainnet included) |
| `BSC_TESTNET_DEPLOYMENT_GUIDE.md` | Quick start for testnet                |
| `BSC_DEPLOYMENT_SUMMARY.md`       | Status overview                        |
| `DEPLOYMENT_README.md`            | This file                              |

## Next Steps

### Immediate (When Ready)

1. ✓ Review this guide
2. ✓ Prepare .env file
3. ✓ Get testnet BNB
4. ✓ Run: `npm run deploy:testnet:full`
5. ✓ Run: `npm run test:testnet`

### Short Term (1-2 weeks)

1. Review testnet results
2. Document any issues
3. Prepare mainnet configuration
4. Security audit (optional)
5. Plan mainnet deployment

### Long Term

1. Monitor testnet activity
2. Prepare mainnet funds
3. Deploy to mainnet
4. Set up monitoring
5. Create operational runbooks

## Summary Checklist

- [x] Contracts implemented
- [x] Tests passing (27 unit + 6 integration)
- [x] Deployment scripts ready
- [x] Testing scripts ready
- [x] Documentation complete
- [x] Environment templates created
- [x] Security features verified
- [x] Gas efficiency validated
- [ ] Testnet deployment
- [ ] Testnet verification
- [ ] Mainnet deployment
- [ ] Production monitoring

## Support & Resources

- **Hardhat Docs**: https://hardhat.org/docs
- **OpenZeppelin**: https://docs.openzeppelin.com/
- **BSC Docs**: https://docs.binance.org/smart-chain/
- **BSCscan**: https://bscscan.com

## Questions?

Refer to documentation files:

1. `DEPLOYMENT_GUIDE.md` - Detailed setup
2. `BSC_TESTNET_DEPLOYMENT_GUIDE.md` - Quick start
3. `BSC_DEPLOYMENT_SUMMARY.md` - Overview

---

**Status**: Ready for Testnet Deployment ✓
**Version**: 1.0.0
**Last Updated**: 2026-03-15
**Solidity**: 0.8.20
