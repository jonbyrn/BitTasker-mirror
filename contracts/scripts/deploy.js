// Contract Deployment Script — VerifyingPaymaster
// Usage: npx hardhat run scripts/deploy.js --network <network>
//
// Required env vars:
//   DEPLOYER_PRIVATE_KEY  — deployer wallet private key
//   PAYMASTER_SIGNER_KEY  — backend signer address for paymaster verification
//   ARBITRUM_RPC_URL      — RPC endpoint
//
// Network-specific defaults:
//   localhost: EntryPoint at 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108
//   arbitrumSepolia: same EntryPoint address
//   arbitrumOne: same EntryPoint address

const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

// EntryPoint v0.8 address (same on all Arbitrum networks)
const ENTRY_POINT_ADDRESS = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108';

async function main() {
	const [deployer] = await ethers.getSigners();
	const network = await ethers.provider.getNetwork();

	console.log('=== VerifyingPaymaster Deployment ===');
	console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
	console.log(`Deployer: ${deployer.address}`);
	console.log(
		`Deployer balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`
	);

	// --- Validate environment ---
	const verifyingSigner = process.env.PAYMASTER_SIGNER_KEY;
	if (!verifyingSigner) {
		throw new Error(
			'PAYMASTER_SIGNER_KEY environment variable is required (backend signer address)'
		);
	}

	const signerAddress = ethers.isAddress(verifyingSigner)
		? verifyingSigner
		: ethers.getAddress(verifyingSigner);

	console.log(`\nVerifying signer: ${signerAddress}`);
	console.log(`EntryPoint: ${ENTRY_POINT_ADDRESS}`);

	// --- Deploy VerifyingPaymaster ---
	console.log('\nDeploying VerifyingPaymaster...');
	const Paymaster = await ethers.getContractFactory('VerifyingPaymaster');
	const paymaster = await Paymaster.deploy(ENTRY_POINT_ADDRESS, signerAddress);
	await paymaster.waitForDeployment();

	const paymasterAddress = await paymaster.getAddress();
	console.log(`VerifyingPaymaster deployed at: ${paymasterAddress}`);

	// --- Verify contract state ---
	const deployedEntryPoint = await paymaster.entryPoint();
	const deployedSigner = await paymaster.verifyingSigner();
	const maxCallGas = await paymaster.MAX_CALL_GAS();
	const maxTotalGas = await paymaster.MAX_TOTAL_GAS();

	console.log(`\n--- Contract State Verification ---`);
	console.log(`EntryPoint: ${deployedEntryPoint}`);
	console.log(`VerifyingSigner: ${deployedSigner}`);
	console.log(`MAX_CALL_GAS: ${maxCallGas}`);
	console.log(`MAX_TOTAL_GAS: ${maxTotalGas}`);

	if (deployedEntryPoint.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase()) {
		throw new Error('EntryPoint mismatch!');
	}
	if (deployedSigner.toLowerCase() !== signerAddress.toLowerCase()) {
		throw new Error('VerifyingSigner mismatch!');
	}

	// --- Fund paymaster deposit (optional) ---
	const fundAmount = process.env.FUND_AMOUNT_ETH;
	if (fundAmount && parseFloat(fundAmount) > 0) {
		console.log(`\nFunding paymaster with ${fundAmount} ETH...`);
		const tx = await paymaster.deposit({ value: ethers.parseEther(fundAmount) });
		await tx.wait();
		const deposit = await paymaster.getDeposit();
		console.log(`Paymaster deposit: ${ethers.formatEther(deposit)} ETH`);
	}

	// --- Write deployment artifact ---
	const deployment = {
		network: network.name,
		chainId: Number(network.chainId),
		timestamp: new Date().toISOString(),
		paymasterAddress,
		entryPointAddress: ENTRY_POINT_ADDRESS,
		verifyingSigner: signerAddress,
		maxCallGas: maxCallGas.toString(),
		maxTotalGas: maxTotalGas.toString()
	};

	const artifactDir = path.join(__dirname, '../deployments');
	if (!fs.existsSync(artifactDir)) {
		fs.mkdirSync(artifactDir, { recursive: true });
	}
	const artifactPath = path.join(artifactDir, `${network.name}-${network.chainId}.json`);
	fs.writeFileSync(artifactPath, JSON.stringify(deployment, null, 2));
	console.log(`\nDeployment artifact saved: ${artifactPath}`);

	console.log('\n=== Deployment Complete ===');
	console.log(`PAYMASTER_ADDRESS=${paymasterAddress}`);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('Deployment failed:', error);
		process.exit(1);
	});
