import type { ContractInterface } from 'ethers';

/**
 * Escrow contract deployments by chain ID
 * This is populated after contract deployment
 *
 * For pre-deployment development, this will be empty
 * and ABI loading will return null (fail-closed)
 */
export const ESCROW_DEPLOYMENTS: Record<
	number,
	{
		address: string;
		abi: ContractInterface;
		deploymentBlock: number;
		verified: boolean;
	}
> = {
	// BSC Testnet (97) - to be populated after deployment
	// 97: {
	//   address: '0x...',
	//   abi: [...],
	//   deploymentBlock: 12345,
	//   verified: true
	// },

	// BSC Mainnet (56) - to be populated after deployment
	// 56: {
	//   address: '0x...',
	//   abi: [...],
	//   deploymentBlock: 12345,
	//   verified: true
	// }
};

/**
 * Get escrow contract deployment for a specific chain
 *
 * @param chainId - Blockchain chain ID
 * @returns Deployment info if available, null if not deployed
 */
export function getEscrowDeployment(
	chainId: number
): (typeof ESCROW_DEPLOYMENTS)[number] | null {
	return ESCROW_DEPLOYMENTS[chainId] ?? null;
}

/**
 * Check if escrow contract is deployed and verified on a chain
 *
 * @param chainId - Blockchain chain ID
 * @returns true if deployed and verified
 */
export function isEscrowDeployed(chainId: number): boolean {
	const deployment = ESCROW_DEPLOYMENTS[chainId];
	return deployment?.verified === true;
}

/**
 * Get all deployed escrow contracts
 *
 * @returns Array of chain IDs with deployments
 */
export function getDeployedChains(): number[] {
	return Object.keys(ESCROW_DEPLOYMENTS)
		.map(Number)
		.filter((chainId) => isEscrowDeployed(chainId));
}
