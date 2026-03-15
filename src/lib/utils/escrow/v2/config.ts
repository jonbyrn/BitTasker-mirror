/**
 * V2 Escrow configuration: relay URL and contract address by network.
 * Uses env: VITE_RELAY_URL, VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET, VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET.
 */

/** Rootstock Testnet */
export const CHAIN_ID_TESTNET = 31;
/** Rootstock Mainnet */
export const CHAIN_ID_MAINNET = 30;

/**
 * Relay base URL (no trailing slash).
 * Used for GET /health, GET /info, POST /relay.
 */
export function getRelayBaseUrl(): string {
	const url = import.meta.env.VITE_RELAY_URL as string | undefined;
	if (!url || typeof url !== 'string') {
		return '';
	}
	return url.replace(/\/$/, '');
}

/**
 * V2 SecurePaymentContract address for the given chain.
 * Returns undefined if env is not set for that network.
 */
export function getV2ContractAddressByChainId(chainId: number): string | undefined {
	if (chainId === CHAIN_ID_TESTNET) {
		return import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET as string | undefined;
	}
	if (chainId === CHAIN_ID_MAINNET) {
		return import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET as string | undefined;
	}
	return undefined;
}
