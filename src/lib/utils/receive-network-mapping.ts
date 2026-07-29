/**
 * receive-network-mapping.ts
 *
 * Pure functions for mapping network strings to chain/token info.
 * Extracted from ReceivePaymentForm.svelte to reduce component size
 * and enable independent testing.
 *
 * All functions are side-effect free.
 */

import type { SourceWallet } from '$lib/services/route-resolver';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EVM_NATIVE = '0x0000000000000000000000000000000000000000';
export const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';
export const USDT0_RSK = '0x779Ded0c9e1022225f8E0630b35a9b54bE713736';

/** Sentinel IDs for non-EVM destinations routed via Boltz. */
export const BOLTZ_LIGHTNING_ID = -1;
export const BOLTZ_LIQUID_ID = -2;
export const BOLTZ_BITCOIN_ID = -3;

/** Map payerNetwork strings to { chainId, tokenAddress } for fee computation. */
export const SOURCE_CHAIN_MAP: Record<string, { chainId: number; address: string } | undefined> = {
	'usdt-bsc': { chainId: 56, address: USDT_BSC },
	'usdt-arbitrum': { chainId: 42161, address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
	'usdt-avalanche': { chainId: 43114, address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7' },
	'usdt-base': { chainId: 8453, address: '0x4200000000000000000000000000000000000023' },
	'usdt-ethereum': { chainId: 1, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
	'usdt-optimism': { chainId: 10, address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' },
	'usdt-polygon': { chainId: 137, address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
	'usdt0-arbitrum': { chainId: 42161, address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
	'usdt0-rootstock': { chainId: 30, address: USDT0_RSK },
	'usdt-tron': { chainId: 0, address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' },
	'wbtc-arbitrum': { chainId: 42161, address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' },
	'tbtc-arbitrum': { chainId: 42161, address: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40' }
};

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/** Extract the source type from a payerNetwork string. */
export function getSourceFromNetwork(network: string): SourceWallet {
	if (network === 'usdt-bsc') return 'usdt-bsc';
	if (network === 'usdt0-rootstock') return 'usdt0-rsk';
	if (network === 'doc-rootstock') return 'doc-rsk';
	if (network === 'bitcoin') return 'btc-onchain';
	// Arbitrum tokens
	if (network === 'usdt0-arbitrum' || network === 'usdt-arbitrum' || network === 'usdt0-arb')
		return 'usdt0-arb';
	if (network === 'wbtc-arbitrum' || network === 'wbtc-arb') return 'wbtc-arb';
	if (network === 'tbtc-arbitrum' || network === 'tbtc-arb') return 'tbtc-arb';
	// Any other usdt-* network → treat as USDT stablecoin source
	if (network.startsWith('usdt-') || network.startsWith('usdt0-')) return 'usdt-bsc';
	// dyn- tokens that look like stablecoins → treat as USDT source
	if (network.startsWith('dyn-')) {
		const symbol = network.split('-')[1]?.toLowerCase() ?? '';
		if (symbol === 'usdt' || symbol === 'usdc' || symbol === 'dai' || symbol === 'usd0') {
			return 'usdt-bsc';
		}
	}
	return 'rbtc';
}

/**
 * Derive chain/token info from any network string (payer or destination).
 * Returns null for unknown/unparseable networks.
 */
export function deriveChainInfo(network: string): {
	chainId: number;
	address: string;
	asset: string;
	decimals: number;
} | null {
	// Destination networks used in formInput.selectedNetwork
	switch (network) {
		case 'rootstock-bitcoin':
			return { chainId: 30, address: EVM_NATIVE, asset: 'RBTC', decimals: 18 };
		case 'usdt-bsc':
			return { chainId: 56, address: USDT_BSC, asset: 'USDT', decimals: 18 };
		case 'bitcoin':
			return { chainId: BOLTZ_BITCOIN_ID, address: 'BTC', asset: 'BTC', decimals: 8 };
		case 'lightning-bitcoin':
			return { chainId: BOLTZ_LIGHTNING_ID, address: 'LIGHTNING', asset: 'BTC', decimals: 8 };
		case 'liquid-bitcoin':
			return { chainId: BOLTZ_LIQUID_ID, address: 'L-BTC', asset: 'L-BTC', decimals: 8 };
		case 'wbtc-arbitrum':
			return {
				chainId: 42161,
				address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
				asset: 'wBTC',
				decimals: 8
			};
		case 'tbtc-arbitrum':
			return {
				chainId: 42161,
				address: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40',
				asset: 'tBTC',
				decimals: 18
			};
	}

	// Payer source networks from SOURCE_CHAIN_MAP
	const known = SOURCE_CHAIN_MAP[network];
	if (known) {
		const asset = network.startsWith('usdt0-')
			? 'USDT0'
			: network.startsWith('usdt-')
				? 'USDT'
				: 'UNKNOWN';
		return { ...known, asset, decimals: 18 };
	}

	// dyn-* networks: dyn-{symbol}-{chainId}
	if (network.startsWith('dyn-')) {
		const parts = network.split('-');
		const symbol = parts[1]?.toUpperCase() ?? 'UNKNOWN';
		const chainId = parseInt(parts[parts.length - 1], 10);
		if (!isNaN(chainId)) {
			return { chainId, address: '', asset: symbol, decimals: 18 };
		}
	}

	// changelly-* networks: changelly-{ticker}
	if (network.startsWith('changelly-')) {
		const ticker = network.replace('changelly-', '').toUpperCase();
		return { chainId: 0, address: '', asset: ticker, decimals: 18 };
	}

	return null;
}
