/**
 * Toast Helpers — Shared utilities for blockchain toast registration.
 *
 * Used by send/swap flows when registering toasts that need
 * source address and asset information from the wallet store.
 */

import { get } from 'svelte/store';
import { walletStore } from '$lib/stores/wallet/wallet-state';

/** Display names for assets by network key. */
const NETWORK_ASSET: Record<string, string> = {
	'rootstock-bitcoin': 'rBTC',
	'usdt-bsc': 'USDT',
	'usdt-ethereum': 'USDT',
	'usdt0-arb': 'USDT',
	'usdt-polygon': 'USDT',
	bitcoin: 'BTC',
	'lightning-bitcoin': 'BTC'
};

/**
 * Get the user's source address for a given network.
 * Returns the wallet address that initiated the transaction,
 * used for disconnect matching (not recipient).
 */
export function getSourceAddress(network: string): string | null {
	const state = get(walletStore);
	if (network === 'rootstock-bitcoin' || network === 'lightning-bitcoin') {
		return state.rsk.address;
	}
	if (network === 'usdt-bsc') {
		return state.bsc.address;
	}
	return null; // Connected wallets — address comes from connector
}

/**
 * Get the display asset name for a network key.
 * Falls back to 'Unknown' for unrecognized networks.
 */
export function getAssetForNetwork(network: string): string {
	return NETWORK_ASSET[network] ?? 'Unknown';
}
