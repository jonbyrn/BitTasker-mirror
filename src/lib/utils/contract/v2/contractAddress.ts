import { ethers } from 'ethers';

/**
 * Deployed secure payment contract address from env (RSK mainnet / testnet).
 */
export function getSecurePaymentContractAddress(): string {
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	const address =
		network === 'mainnet'
			? ethers.getAddress(import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET).toLowerCase()
			: ethers.getAddress(import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET).toLowerCase();

	if (!address) {
		throw new Error(
			`V2 contract address not configured. Set VITE_RSK_CONTRACT_ADDRESS_V2_${network === 'mainnet' ? 'MAINNET' : 'TESTNET'}`
		);
	}
	return address;
}
