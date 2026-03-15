/**
 * V2 Escrow configuration: relay URL and contract address by network.
 * Uses env: VITE_RELAY_URL, VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET, VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET.
 */

import { createDebug } from '$lib/utils/debug';

const d = createDebug('escrow:v2:config');

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
		d.log('getRelayBaseUrl: empty or missing VITE_RELAY_URL');
		return '';
	}
	const base = url.replace(/\/$/, '');
	d.log('getRelayBaseUrl', { url: base });
	return base;
}

/**
 * V2 SecurePaymentContract address for the given chain.
 * Returns undefined if env is not set for that network.
 */
export function getV2ContractAddressByChainId(chainId: number): string | undefined {
	let address: string | undefined;
	if (chainId === CHAIN_ID_TESTNET) {
		address = import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET as string | undefined;
		d.log('getV2ContractAddressByChainId', {
			chainId,
			network: 'testnet',
			address: address ? `${address.slice(0, 10)}...` : undefined
		});
	} else if (chainId === CHAIN_ID_MAINNET) {
		address = import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET as string | undefined;
		d.log('getV2ContractAddressByChainId', {
			chainId,
			network: 'mainnet',
			address: address ? `${address.slice(0, 10)}...` : undefined
		});
	} else {
		d.warn('getV2ContractAddressByChainId: unsupported chainId', { chainId });
		address = undefined;
	}
	return address;
}
