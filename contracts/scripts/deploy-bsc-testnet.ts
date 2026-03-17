import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * BSC Testnet Deployment Script
 * Deploys DirectSendRouter and USDT mock contract to BSC testnet (Chain ID 97)
 *
 * Prerequisites:
 * - Set DEPLOYER_PRIVATE_KEY in .env
 * - Have testnet BNB in deployer account for gas
 * - Configure BSC_TESTNET_RPC in .env or use default
 */

async function main() {
	console.log('='.repeat(70));
	console.log('DirectSendRouter - BSC Testnet Deployment');
	console.log('='.repeat(70));

	// Validate environment
	if (!process.env.DEPLOYER_PRIVATE_KEY) {
		throw new Error('DEPLOYER_PRIVATE_KEY not set in .env');
	}

	// Get network info
	const network = await ethers.provider.getNetwork();
	if (network.chainId !== 97n) {
		throw new Error(`Expected Chain ID 97 (BSC Testnet), got ${network.chainId}`);
	}
	console.log(`\n✓ Network: ${network.name} (Chain ID: ${network.chainId})`);

	// Get deployer account
	const [deployer] = await ethers.getSigners();
	console.log(`✓ Deployer: ${deployer.address}`);

	// Get balance
	const balance = await ethers.provider.getBalance(deployer.address);
	const balanceBNB = ethers.formatEther(balance);
	console.log(`✓ Balance: ${balanceBNB} BNB`);

	if (parseFloat(balanceBNB) < 0.1) {
		console.warn(
			'⚠ WARNING: Balance is low. You may not have enough BNB for deployment and testing.'
		);
	}

	// Step 1: Deploy USDT Mock Contract
	console.log('\n' + '-'.repeat(70));
	console.log('Step 1: Deploying USDT Mock Contract');
	console.log('-'.repeat(70));

	const ERC20MockFactory = await ethers.getContractFactory('ERC20Mock');
	console.log('Deploying ERC20Mock...');
	const usdtMock = await ERC20MockFactory.deploy();
	const usdtMockTx = usdtMock.deploymentTransaction();
	if (!usdtMockTx) {
		throw new Error('No deployment transaction found for USDT mock');
	}

	await usdtMock.waitForDeployment();
	const usdtAddress = await usdtMock.getAddress();
	const usdtDeployHash = usdtMockTx.hash;

	console.log(`✓ USDT Mock deployed to: ${usdtAddress}`);
	console.log(`✓ Deployment tx: ${usdtDeployHash}`);

	// Step 2: Deploy DirectSendRouter
	console.log('\n' + '-'.repeat(70));
	console.log('Step 2: Deploying DirectSendRouter');
	console.log('-'.repeat(70));

	const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
	const fixedFeeString = process.env.FIXED_FEE_USDT || '1';
	const fixedFee = ethers.parseUnits(fixedFeeString, 6);

	console.log(`Treasury Address: ${treasuryAddress}`);
	console.log(`Fixed Fee: ${fixedFeeString} USDT`);

	const DirectSendRouterFactory = await ethers.getContractFactory('DirectSendRouter');
	console.log('Deploying DirectSendRouter...');
	const router = await DirectSendRouterFactory.deploy(usdtAddress, treasuryAddress, fixedFee);
	const routerTx = router.deploymentTransaction();
	if (!routerTx) {
		throw new Error('No deployment transaction found for router');
	}

	await router.waitForDeployment();
	const routerAddress = await router.getAddress();
	const routerDeployHash = routerTx.hash;

	console.log(`✓ DirectSendRouter deployed to: ${routerAddress}`);
	console.log(`✓ Deployment tx: ${routerDeployHash}`);

	// Step 3: Verify initial state
	console.log('\n' + '-'.repeat(70));
	console.log('Step 3: Verifying Initial State');
	console.log('-'.repeat(70));

	const usdtAddr = await router.USDT();
	const treasuryAddr = await router.treasury();
	const fee = await router.FIXED_FEE();
	const isPaused = await router.isPaused();

	console.log(`✓ USDT Contract: ${usdtAddr}`);
	console.log(`✓ Treasury: ${treasuryAddr}`);
	console.log(`✓ Fixed Fee: ${ethers.formatUnits(fee, 6)} USDT`);
	console.log(`✓ Paused: ${isPaused}`);

	// Step 4: Mint USDT for testing
	console.log('\n' + '-'.repeat(70));
	console.log('Step 4: Minting USDT for Testing');
	console.log('-'.repeat(70));

	const testAmount = ethers.parseUnits('100000', 6); // 100k USDT
	console.log(`Minting ${ethers.formatUnits(testAmount, 6)} USDT to deployer...`);
	const mintTx = await usdtMock.mint(deployer.address, testAmount);
	await mintTx.wait();
	console.log(`✓ Mint tx: ${mintTx.hash}`);

	const balance1 = await usdtMock.balanceOf(deployer.address);
	console.log(`✓ Deployer USDT Balance: ${ethers.formatUnits(balance1, 6)} USDT`);

	// Step 5: Test basic functionality
	console.log('\n' + '-'.repeat(70));
	console.log('Step 5: Testing Basic Functionality');
	console.log('-'.repeat(70));

	// Approve router
	console.log('Approving router to spend USDT...');
	const approveTx = await usdtMock.approve(routerAddress, ethers.parseUnits('50000', 6));
	await approveTx.wait();
	console.log(`✓ Approval tx: ${approveTx.hash}`);

	// Create test recipient
	const testRecipient = (await ethers.getSigners())[1];
	const testAmount1 = ethers.parseUnits('100', 6); // 100 USDT
	const sponsorId = ethers.id('bsc-testnet-deployment');

	console.log(`\nTesting route function with:
  - Recipient: ${testRecipient.address}
  - Amount: ${ethers.formatUnits(testAmount1, 6)} USDT
  - Sponsor ID: ${sponsorId}`);

	const routeTx = await router.route(testRecipient.address, testAmount1, sponsorId);
	await routeTx.wait();
	console.log(`✓ Route tx: ${routeTx.hash}`);

	// Verify balances
	const recipientBalance = await usdtMock.balanceOf(testRecipient.address);
	const treasuryBalance = await usdtMock.balanceOf(treasuryAddress);

	console.log(`\n✓ Recipient received: ${ethers.formatUnits(recipientBalance, 6)} USDT`);
	console.log(`✓ Treasury collected: ${ethers.formatUnits(treasuryBalance, 6)} USDT fee`);

	// Step 6: Test pause functionality
	console.log('\n' + '-'.repeat(70));
	console.log('Step 6: Testing Pause Functionality');
	console.log('-'.repeat(70));

	console.log('Pausing router...');
	const pauseTx = await router.pause();
	await pauseTx.wait();
	console.log(`✓ Pause tx: ${pauseTx.hash}`);
	console.log(`✓ Router paused: ${await router.isPaused()}`);

	console.log('Unpausing router...');
	const unpauseTx = await router.unpause();
	await unpauseTx.wait();
	console.log(`✓ Unpause tx: ${unpauseTx.hash}`);
	console.log(`✓ Router paused: ${await router.isPaused()}`);

	// Step 7: Save deployment record
	console.log('\n' + '-'.repeat(70));
	console.log('Step 7: Saving Deployment Record');
	console.log('-'.repeat(70));

	const blockNumber = await ethers.provider.getBlockNumber();
	const deploymentRecord = {
		network: 'bsc-testnet',
		chainId: 97,
		timestamp: new Date().toISOString(),
		deployer: deployer.address,
		contracts: {
			DirectSendRouter: {
				address: routerAddress,
				deploymentTx: routerDeployHash,
				blockNumber: blockNumber,
				constructor: {
					usdt: usdtAddress,
					treasury: treasuryAddress,
					fixedFee: fee.toString()
				}
			},
			USDTMock: {
				address: usdtAddress,
				deploymentTx: usdtDeployHash,
				blockNumber: blockNumber
			}
		},
		testing: {
			recipientTestAddress: testRecipient.address,
			testTransferTx: routeTx.hash,
			recipientBalance: recipientBalance.toString(),
			treasuryBalance: treasuryBalance.toString(),
			recipientBalanceFormatted: ethers.formatUnits(recipientBalance, 6),
			treasuryBalanceFormatted: ethers.formatUnits(treasuryBalance, 6)
		},
		bscScanLinks: {
			router: `https://testnet.bscscan.com/address/${routerAddress}`,
			usdt: `https://testnet.bscscan.com/address/${usdtAddress}`,
			deployerAccount: `https://testnet.bscscan.com/address/${deployer.address}`
		}
	};

	const deploymentsDir = path.join(__dirname, '..', 'deployments');
	if (!fs.existsSync(deploymentsDir)) {
		fs.mkdirSync(deploymentsDir, { recursive: true });
	}

	const deploymentFile = path.join(deploymentsDir, 'bsc-testnet.json');
	fs.writeFileSync(deploymentFile, JSON.stringify(deploymentRecord, null, 2));
	console.log(`✓ Deployment record saved to: ${deploymentFile}`);

	// Final summary
	console.log('\n' + '='.repeat(70));
	console.log('DEPLOYMENT SUMMARY');
	console.log('='.repeat(70));
	console.log(`
Network:                BSC Testnet (Chain ID 97)
DirectSendRouter:       ${routerAddress}
USDT Mock:              ${usdtAddress}
Treasury:               ${treasuryAddress}
Fixed Fee:              ${ethers.formatUnits(fee, 6)} USDT

Test Results:
- Transfer Amount:      100 USDT
- Recipient Address:    ${testRecipient.address}
- Recipient Balance:    ${ethers.formatUnits(recipientBalance, 6)} USDT ✓
- Treasury Balance:     ${ethers.formatUnits(treasuryBalance, 6)} USDT ✓
- Pause/Unpause:        Working ✓

BSCscan Links:
- Router:               https://testnet.bscscan.com/address/${routerAddress}
- USDT Mock:            https://testnet.bscscan.com/address/${usdtAddress}

Next Steps:
1. Verify contracts on BSCscan using hardhat verify
2. Run additional test suite: npm run test:bsc-testnet
3. Review deployment record: ${deploymentFile}
`);

	console.log('✓ Deployment complete!');
	console.log('='.repeat(70));
}

main().catch((error) => {
	console.error('\n✗ Deployment failed:');
	console.error(error);
	process.exitCode = 1;
});
