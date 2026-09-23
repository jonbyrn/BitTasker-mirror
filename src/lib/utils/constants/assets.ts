/**
 * @deprecated Unused file
 * Liquid Network Asset Constants
 * These are well-known asset IDs that never change on the Liquid Network
 */

import type { AssetMetadata } from '$lib/types/wallet';

export const LIQUID_ASSET_IDS = {
	mainnet: {
		// L-BTC (Liquid Bitcoin) - the native asset of Liquid Network
		LBTC: '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d'
	},
	testnet: {
		// Testnet L-BTC
		LBTC: '144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49'
	}
} as const;

export const ASSET_METADATA: Record<'mainnet' | 'testnet', Record<string, AssetMetadata>> = {
	mainnet: {
		[LIQUID_ASSET_IDS.mainnet.LBTC]: {
			assetId: LIQUID_ASSET_IDS.mainnet.LBTC,
			name: 'Liquid Bitcoin',
			ticker: 'L-BTC',
			precision: 8,
			icon: '/images/chains/Liquid-Bitcoin.svg'
		}
	},
	testnet: {
		[LIQUID_ASSET_IDS.testnet.LBTC]: {
			assetId: LIQUID_ASSET_IDS.testnet.LBTC,
			name: 'Testnet Liquid Bitcoin',
			ticker: 'L-BTC',
			precision: 8,
			icon: '/images/chains/Liquid-Bitcoin.svg'
		}
	}
};

/**
 * Get asset metadata by network and asset ID
 */
export function getAssetMetadata(
	network: 'mainnet' | 'testnet',
	assetId: string
): AssetMetadata | undefined {
	return ASSET_METADATA[network][assetId];
}

/**
 * Get all supported assets for a network
 */
export function getSupportedAssets(network: 'mainnet' | 'testnet'): AssetMetadata[] {
	return Object.values(ASSET_METADATA[network]);
}

/**
 * Detect current network based on environment or asset ID
 */
export function getCurrentNetwork(): 'mainnet' | 'testnet' {
	return import.meta.env.VITE_BITCOIN_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
}

/**
 * Get the appropriate asset ID for current network
 */
export function getAssetId(asset: 'LBTC'): string {
	const network = getCurrentNetwork();
	return LIQUID_ASSET_IDS[network][asset];
}
