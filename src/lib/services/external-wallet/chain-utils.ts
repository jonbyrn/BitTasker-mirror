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
		case 'usdt-arbitrum':
			return rskNetwork === 'mainnet' ? 42161 : 421614;
		case 'usdt-polygon':
			return rskNetwork === 'mainnet' ? 137 : 80002;
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
export function getUSDTContractAddress(): string {
	const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
	if (bscNetwork === 'mainnet') {
		return '0x55d398326f99059ff775485246999027b3197955';
	}
	return '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
}
