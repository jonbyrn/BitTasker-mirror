import { ethers } from 'hardhat';

/**
 * Check USDT Balance
 * Usage: npx hardhat run scripts/check-balance.ts --network bscTestnet
 */

async function main() {
	const [signer] = await ethers.getSigners();
	const network = await ethers.provider.getNetwork();

	console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
	console.log(`Account: ${signer.address}`);

	// Get BNB balance
	const bnbBalance = await ethers.provider.getBalance(signer.address);
	console.log(`\nBNB Balance: ${ethers.formatEther(bnbBalance)} BNB`);

	// Try to get USDT balance if address provided
	const usdtAddress = process.argv[2];
	if (usdtAddress && usdtAddress.startsWith('0x')) {
		try {
			const usdt = await ethers.getContractAt('IERC20', usdtAddress);
			const balance = await usdt.balanceOf(signer.address);
			console.log(`USDT Balance: ${ethers.formatUnits(balance, 6)} USDT`);
		} catch {
			console.log(`Could not read USDT at ${usdtAddress}`);
		}
	}
}

main().catch(console.error);
