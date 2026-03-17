# BSC Testnet Deployment Quick Start Guide

## Quick Setup (5 Minutes)

### 1. Prepare Environment

```bash
cd /home/scott/USDT/BitTasker/contracts

# Install dependencies
npm install

# Create .env file
cat > .env << 'EOF'
# Private key (WITHOUT 0x prefix)
DEPLOYER_PRIVATE_KEY=your_private_key_here

# BSC Testnet RPC (default provided)
BSC_TESTNET_RPC=https://data-seed-prebsc-1-2.binance.org:8545

# Contract config
TREASURY_ADDRESS=0x1234567890123456789012345678901234567890
FIXED_FEE_USDT=1

# Optional: For BSCscan verification
ETHERSCAN_API_KEY=your_bscscan_api_key
EOF
```

### 2. Get Testnet BNB

1. Visit: https://testfaucet.binance.org/
2. Connect wallet with deployer address
3. Claim 0.1 BNB (minimum 0.5 BNB recommended)
4. Wait for transaction to confirm

### 3. Deploy to Testnet

```bash
# Compile contracts
npm run compile

# Deploy with all tests included
npm run deploy:testnet
```

### 4. Run Comprehensive Tests

```bash
npm run test:testnet
```

## What Gets Deployed

### DirectSendRouter Contract

- **Purpose**: Routes USDT transfers with fixed fee collection
- **Features**:
  - Transfer routing with automatic fee collection
  - Pause/unpause capability
  - Treasury management
  - Reentrancy protection
  - Event logging

### ERC20Mock Contract

- **Purpose**: Mock USDT token for testing
- **Testnet Only**: Not used on mainnet (real USDT used instead)

## Deployment Output

The deployment script provides:

1. **Contract Addresses**

   - DirectSendRouter: `0x...`
   - USDT Mock: `0x...`

2. **Transaction Hashes**

   - Deployment transactions with links

3. **Initial Test Results**

   - Transfer to recipient: ✓
   - Fee collection: ✓
   - Pause/Unpause: ✓

4. **Deployment Record**
   - Saved to: `deployments/bsc-testnet.json`
   - Contains all deployment details

## Testing Coverage

### Automated Tests (Included in deploy script)

```
✓ USDT Mock deployment
✓ DirectSendRouter deployment
✓ Initial state verification
✓ USDT minting to deployer
✓ Basic transfer with fee collection
✓ Pause functionality
✓ Unpause functionality
```

### Comprehensive Test Suite (test-bsc-testnet.ts)

```
✓ Test 1: USDT Minting
✓ Test 2: Approval
✓ Test 3: Basic Transfer & Fee Collection
✓ Test 4: Multiple Transfers
✓ Test 5: Pause/Unpause Functions
✓ Test 6: Event Emission
✓ Test 7: Treasury Management
✓ Test 8: Input Validation
```

## Verification on BSCscan

### Manual Verification

```bash
npx hardhat verify --network bscTestnet \
  <ROUTER_ADDRESS> \
  <USDT_ADDRESS> \
  <TREASURY_ADDRESS> \
  <FIXED_FEE>
```

### View on Block Explorer

1. Router: `https://testnet.bscscan.com/address/<ROUTER_ADDRESS>`
2. USDT: `https://testnet.bscscan.com/address/<USDT_ADDRESS>`
3. Transactions: Search by hash in explorer

## Testing Scenarios

### Scenario 1: Basic Transfer

```
User A → 100 USDT → User B
+ 1 USDT fee → Treasury

Result:
- User B receives: 100 USDT
- Treasury receives: 1 USDT
- Event emitted with sponsor ID
```

### Scenario 2: Multiple Transfers

```
Transfer 1: User A → 50 USDT → User B (+ 1 fee)
Transfer 2: User A → 75 USDT → User C (+ 1 fee)

Result:
- User B: 50 USDT
- User C: 75 USDT
- Treasury: 2 USDT (both fees)
```

### Scenario 3: Pause/Unpause

```
1. Normal transfer: ✓
2. Pause router
3. Attempt transfer: ✗ (ContractPaused error)
4. Unpause router
5. Transfer again: ✓
```

### Scenario 4: Validation

```
Test insufficient balance: ✗ (InsufficientUSDTBalance)
Test zero amount: ✗ (InvalidAmount)
Test zero recipient: ✗ (InvalidRecipient)
Test insufficient allowance: ✗ (InsufficientAllowance)
```

## Gas Analysis

### Expected Gas Usage

**Route Function**:

- ~80,000-120,000 gas
- Cost at 10 gwei: ~0.0008-0.0012 BNB (~$0.3-0.5 at $5000/BNB)

**Pause/Unpause**:

- ~30,000 gas
- Cost at 10 gwei: ~0.0003 BNB

## Troubleshooting

### Issue: "Invalid USDT address"

**Solution**: Ensure USDT_CONTRACT_ADDRESS is set. For testnet, use the deployed mock address.

### Issue: "InsufficientAllowance"

**Solution**: Approve router for amount + fee. Example:

```javascript
await usdt.approve(routerAddress, transferAmount + fixedFee);
```

### Issue: Deployment fails - Network error

**Solution**: Check BSCscan status or use alternative RPC:

```bash
# Update in hardhat.config.ts
BSC_TESTNET_RPC=https://rpc.ankr.com/bsc_testnet_chapel
```

### Issue: "ContractPaused" error

**Solution**: Router is paused. Owner must unpause:

```javascript
await router.unpause();
```

## Files Reference

| File                             | Purpose               |
| -------------------------------- | --------------------- |
| `contracts/DirectSendRouter.sol` | Main router contract  |
| `contracts/ERC20Mock.sol`        | Test USDT mock        |
| `scripts/deploy-bsc-testnet.ts`  | Testnet deployment    |
| `scripts/test-bsc-testnet.ts`    | Comprehensive tests   |
| `hardhat.config.ts`              | Hardhat configuration |
| `deployments/bsc-testnet.json`   | Deployment record     |

## Deployment Record Example

After deployment, check `deployments/bsc-testnet.json`:

```json
{
	"network": "bsc-testnet",
	"chainId": 97,
	"timestamp": "2026-03-15T...",
	"contracts": {
		"DirectSendRouter": {
			"address": "0x...",
			"deploymentTx": "0x...",
			"constructor": {
				"usdt": "0x...",
				"treasury": "0x...",
				"fixedFee": "1000000"
			}
		},
		"USDTMock": {
			"address": "0x...",
			"deploymentTx": "0x..."
		}
	}
}
```

## Next Steps After Deployment

1. ✓ Verify contracts on BSCscan
2. ✓ Run comprehensive test suite
3. ✓ Document deployed addresses
4. ✓ Test treasury management
5. ✓ Test pause/unpause functionality
6. ✓ Plan mainnet deployment

## Mainnet Preparation

Before mainnet deployment:

1. **Verify testnet works**: All tests passing
2. **Prepare mainnet config**: Update .env for real USDT
3. **Real treasury address**: Confirm mainnet treasury
4. **Sufficient BNB**: 1+ BNB for gas and contingencies
5. **Security review**: Code audit (optional but recommended)
6. **Monitoring setup**: Alert configuration

See `DEPLOYMENT_GUIDE.md` for mainnet deployment process.

## Key Differences: Testnet vs Mainnet

| Aspect        | Testnet                 | Mainnet                                    |
| ------------- | ----------------------- | ------------------------------------------ |
| Chain ID      | 97                      | 56                                         |
| USDT Contract | ERC20Mock (deployed)    | 0x55d398326f99059fF775485246999027B3197955 |
| BNB Source    | Faucet                  | Real purchase                              |
| Risk Level    | None (test environment) | Production (real funds)                    |
| Verification  | Optional                | Recommended                                |
| Monitoring    | Development             | Production grade                           |

## Support Resources

- **Hardhat Docs**: https://hardhat.org/docs
- **OpenZeppelin**: https://docs.openzeppelin.com/contracts/
- **BSC Docs**: https://docs.binance.org/smart-chain/
- **BSCscan**: https://testnet.bscscan.com (testnet)

---

**Last Updated**: 2026-03-15
**Solidity Version**: 0.8.20
**Network**: BSC Testnet (Chain ID 97)
