/**
 * Chain Utility Functions — independent of any connector SDK.
 *
 * These are imported by SendPaymentForm and other components that
 * need chain-to-network mapping without pulling in the Multichain SDK.
 */

/** Map a network string to an EVM chain ID, respecting environment config. */
export function getChainIdForNetwork(network: string): number {
	const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
	switch (network) {
		case 'rootstock-bitcoin':
			return rskNetwork === 'mainnet' ? 30 : 31;
		case 'usdt-bsc':
			return bscNetwork === 'mainnet' ? 56 : 97;
		case 'usdt-ethereum':
			return rskNetwork === 'mainnet' ? 1 : 11155111;
		case 'usdt0-arb':
			return rskNetwork === 'mainnet' ? 42161 : 421614;
		case 'usdt-polygon':
			return rskNetwork === 'mainnet' ? 137 : 80002;
		case 'usdt-avalanche':
			return rskNetwork === 'mainnet' ? 43114 : 43113;
		case 'usdt-base':
			return rskNetwork === 'mainnet' ? 8453 : 84532;
		default:
			return rskNetwork === 'mainnet' ? 30 : 31;
	}
}

/** Encode an ERC20 transfer call data (transfer(address,uint256)). */
export function encodeERC20Transfer(to: string, amount: bigint): string {
	const methodId = 'a9059cbb';
	const paddedTo = to.slice(2).padStart(64, '0');
	const paddedAmount = amount.toString(16).padStart(64, '0');
	return '0x' + methodId + paddedTo + paddedAmount;
}

/** BSC USDT contract address for the current network. */
export function getBSCUSDTContractAddress(): string {
	const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
	if (bscNetwork === 'mainnet') {
		return '0x55d398326f99059ff775485246999027b3197955';
	}
	return '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
}

/**
 * USDT contract address for a given network string.
 * Used when sending USDT via connected wallet EVM signers — the ERC-20
 * transfer() calldata is sent TO this contract, not to the recipient directly.
 */
export function getUSDTContractAddressForNetwork(network: string): string {
	const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	const isMainnet = rskNetwork === 'mainnet';
	switch (network) {
		case 'usdt-bsc':
			return getBSCUSDTContractAddress();
		case 'usdt-ethereum':
			// Mainnet: 0xdAC17F958D2ee523a2206206994597C13D831ec7 (USDT)
			// Testnet (Sepolia): no official USDT — use mainnet address as placeholder
			return '0xdAC17F958D2ee523a2206206994597C13D831ec7';
		case 'usdt0-arb':
			// USDT0 on Arbitrum (bridged USDT)
			return isMainnet
				? '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
				: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
		case 'usdt-polygon':
			return '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
		case 'usdt-avalanche':
			return '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7';
		case 'usdt-base':
			return '0x4200000000000000000000000000000000000023';
		default:
			return getBSCUSDTContractAddress();
	}
}
