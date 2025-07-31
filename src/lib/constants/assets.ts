/**
 * Liquid Network Asset Constants
 * These are well-known asset IDs that never change on the Liquid Network
 */

export const LIQUID_ASSET_IDS = {
	mainnet: {
		// L-BTC (Liquid Bitcoin) - the native asset of Liquid Network
		LBTC: '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d',
		// Tether USD on Liquid
		USDT: 'ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2',
		// Add more mainnet assets as needed
	},
	testnet: {
		// Testnet L-BTC
		LBTC: '144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49',
		// Testnet USDT
		USDT: 'b612eb46313a2cd6ebabd8b7a8eed5696e29898b87a43bff41c94f51acef9d73',
		// Add more testnet assets as needed
	}
} as const;

export interface AssetMetadata {
	assetId: string;
	name: string;
	ticker: string;
	precision: number;
	icon: string;
	fiatId?: string; // For assets that can pay fees
}

export const ASSET_METADATA: Record<'mainnet' | 'testnet', Record<string, AssetMetadata>> = {
	mainnet: {
		[LIQUID_ASSET_IDS.mainnet.LBTC]: {
			assetId: LIQUID_ASSET_IDS.mainnet.LBTC,
			name: 'Liquid Bitcoin',
			ticker: 'L-BTC',
			precision: 8,
			icon: '₿'
		},
		[LIQUID_ASSET_IDS.mainnet.USDT]: {
			assetId: LIQUID_ASSET_IDS.mainnet.USDT,
			name: 'Tether USD',
			ticker: 'USDt',
			precision: 8,
			icon: '₮',
			fiatId: 'USD' // Enables fee payment with USDT
		}
	},
	testnet: {
		[LIQUID_ASSET_IDS.testnet.LBTC]: {
			assetId: LIQUID_ASSET_IDS.testnet.LBTC,
			name: 'Testnet Liquid Bitcoin',
			ticker: 'L-BTC',
			precision: 8,
			icon: '₿'
		},
		[LIQUID_ASSET_IDS.testnet.USDT]: {
			assetId: LIQUID_ASSET_IDS.testnet.USDT,
			name: 'Testnet Tether USD',
			ticker: 'USDt',
			precision: 8,
			icon: '₮',
			fiatId: 'USD'
		}
	}
};

/**
 * Get asset metadata by network and asset ID
 */
export function getAssetMetadata(network: 'mainnet' | 'testnet', assetId: string): AssetMetadata | undefined {
	return ASSET_METADATA[network][assetId];
}

/**
 * Get all supported assets for a network
 */
export function getSupportedAssets(network: 'mainnet' | 'testnet'): AssetMetadata[] {
	return Object.values(ASSET_METADATA[network]);
}

/**
 * Check if an asset ID is valid for the given network
 */
export function isValidAssetId(network: 'mainnet' | 'testnet', assetId: string): boolean {
	return assetId in ASSET_METADATA[network];
}

/**
 * Detect current network based on environment or asset ID
 */
export function getCurrentNetwork(): 'mainnet' | 'testnet' {
	// Check environment variable first
	if (typeof import.meta !== 'undefined' && import.meta.env) {
		const envNetwork = import.meta.env.VITE_NETWORK;
		if (envNetwork === 'testnet') return 'testnet';
	}
	
	// Default to mainnet for production
	return 'mainnet';
}

/**
 * Get the appropriate asset ID for current network
 */
export function getAssetId(asset: 'LBTC' | 'USDT'): string {
	const network = getCurrentNetwork();
	return LIQUID_ASSET_IDS[network][asset];
}