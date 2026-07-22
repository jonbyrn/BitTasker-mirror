// =============================================================================
// Gasless Configuration — Arbitrum ERC-4337 + EIP-7702
//
// Dynamic config: fetches gas bounds, fee tiers, and buffer bounds from the
// backend GET /gasless/config endpoint. Falls back to hardcoded defaults when
// the backend is unreachable.
//
// All mutable objects (GAS_BOUNDS, FEE_TIERS, FEE_BUFFER_MIN, FEE_BUFFER_MAX)
// are mutated in place by fetchGaslessConfig() so that every consumer —
// including re-exports in gasless.types.ts — sees the updated values.
// =============================================================================

import type { TokenInfo, GasBounds, FeeTierDef, GaslessConfig } from '$lib/types/gasless.types';
import { ARB_TOKEN_ADDRESSES } from '@bittasker/wallet-core';

// =============================================================================
// Static constants (never change)
// =============================================================================

export const ARBITRUM_CHAIN_ID = 42161;
export const ENTRY_POINT_ADDRESS = '0x433709009B8330FDa32311DF1C2AFA402eD8D009' as const;
export const SIMPLE_7702_ACCOUNT_IMPL = '0xB2779581b8B1F816b747fBa66c64D22196c7D001' as const;

/** Canonical Arbitrum token addresses — single source of truth from SDK */
export const USDT0_ADDRESS = ARB_TOKEN_ADDRESSES.USDT0;
export const WBTC_ADDRESS = ARB_TOKEN_ADDRESSES.WBTC;
export const TBTC_ADDRESS = ARB_TOKEN_ADDRESSES.TBTC;

export const TOKENS: readonly TokenInfo[] = [
	{ address: USDT0_ADDRESS, symbol: 'USDT0', decimals: 6, chainId: ARBITRUM_CHAIN_ID },
	{ address: WBTC_ADDRESS, symbol: 'WBTC', decimals: 8, chainId: ARBITRUM_CHAIN_ID },
	{ address: TBTC_ADDRESS, symbol: 'TBTC', decimals: 18, chainId: ARBITRUM_CHAIN_ID }
];

export const ALLOWED_FEE_TOKENS: readonly string[] = TOKENS.map((t) => t.address.toLowerCase());

export const GAS_TREASURY = import.meta.env.VITE_GAS_TREASURY ?? '';
if (!GAS_TREASURY) {
	console.warn('[gasless] VITE_GAS_TREASURY environment variable is not set.');
}

export const ALTO_URLS: readonly string[] = [
	import.meta.env.VITE_ALTO_URL_1 ?? 'http://alto-1:3000',
	import.meta.env.VITE_ALTO_URL_2 ?? 'http://alto-2:3000'
];

export const ARBITRUM_RPC_URL = import.meta.env.VITE_ARBITRUM_RPC_URL ?? '';
if (!ARBITRUM_RPC_URL) {
	console.warn('[gasless] VITE_ARBITRUM_RPC_URL environment variable is not set.');
}

export const ETH_USD_FEED = '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612' as const;
export const BTC_USD_FEED = '0x6ce185860a4963106506C203335A2910413708e9' as const;
export const MAX_ORACLE_STALENESS = 300;

export const PAYMASTER_SIGNER_KEY_FILE = '';

// =============================================================================
// Mutable config — updated in place by fetchGaslessConfig()
//
// These are MUTATED, not reassigned, so that re-exports in gasless.types.ts
// and imports in gasless-helpers.ts / gasless-store.ts always see current values.
// =============================================================================

export const GAS_BOUNDS: GasBounds = {
	maxCallGas: 5_000_000n,
	maxVerificationGas: 1_000_000n,
	maxPreVerificationGas: 400_000n,
	maxFeePerGas: 1_000_000_000n,
	maxPriorityFeePerGas: 100_000_000n,
	maxTotalGas: 6_400_000n
};

export const FEE_TIERS: FeeTierDef[] = [
	{ label: 'Low', minGas: 0n, maxGas: 200_000n, feeUSD: 0.01 },
	{ label: 'Medium', minGas: 200_001n, maxGas: 500_000n, feeUSD: 0.03 },
	{ label: 'High', minGas: 500_001n, maxGas: 1_000_000n, feeUSD: 0.05 },
	{ label: 'Very High', minGas: 1_000_001n, maxGas: 6_400_000n, feeUSD: 0.1 }
];

export const FEE_BUFFER_MIN: Record<string, bigint> = {
	[USDT0_ADDRESS.toLowerCase()]: 10_000n,
	[WBTC_ADDRESS.toLowerCase()]: 16n,
	[TBTC_ADDRESS.toLowerCase()]: 150_000_000_000n // ≈ $0.01 at $65K BTC
};

export const FEE_BUFFER_MAX: Record<string, bigint> = {
	[USDT0_ADDRESS.toLowerCase()]: 150_000n,
	[WBTC_ADDRESS.toLowerCase()]: 230n,
	[TBTC_ADDRESS.toLowerCase()]: 2_500_000_000_000n // ≈ $0.16 at $65K BTC
};

// =============================================================================
// Dynamic config fetch
// =============================================================================

let _configFetched = false;
let _configFetchPromise: Promise<boolean> | null = null;
let _configFetchTime = 0;
const CONFIG_REFRESH_MS = 300_000; // Re-fetch every 5 minutes

/**
 * Fetch gasless config from the backend and update the mutable objects in place.
 * Safe to call multiple times — only fetches once, then refreshes every 5 minutes.
 *
 * @returns true if config was fetched successfully, false if using defaults
 */
export async function fetchGaslessConfig(): Promise<boolean> {
	const now = Date.now();
	if (_configFetched && now - _configFetchTime < CONFIG_REFRESH_MS) return true;
	if (_configFetchPromise) return _configFetchPromise;

	_configFetchPromise = _doFetch();
	return _configFetchPromise;
}

async function _doFetch(): Promise<boolean> {
	try {
		// Use the existing gaslessService which has the correct base URL via axios interceptor.
		// Raw fetch() with import.meta.env.VITE_API_BASE_URL hits the wrong server when empty.
		const { gaslessService } = await import('$lib/api/services/gasless.service');
		const data = await gaslessService.config();

		// Mutate GAS_BOUNDS in place
		if (data.gasBounds) {
			if (data.gasBounds.maxCallGas) GAS_BOUNDS.maxCallGas = BigInt(data.gasBounds.maxCallGas);
			if (data.gasBounds.maxVerificationGas)
				GAS_BOUNDS.maxVerificationGas = BigInt(data.gasBounds.maxVerificationGas);
			if (data.gasBounds.maxPreVerificationGas)
				GAS_BOUNDS.maxPreVerificationGas = BigInt(data.gasBounds.maxPreVerificationGas);
			if (data.gasBounds.maxFeePerGas)
				GAS_BOUNDS.maxFeePerGas = BigInt(data.gasBounds.maxFeePerGas);
			if (data.gasBounds.maxPriorityFeePerGas)
				GAS_BOUNDS.maxPriorityFeePerGas = BigInt(data.gasBounds.maxPriorityFeePerGas);
			if (data.gasBounds.maxTotalGas)
				GAS_BOUNDS.maxTotalGas = BigInt(data.gasBounds.maxTotalGas);
		}

		// Replace FEE_TIERS contents in place
		if (data.feeTiers && Array.isArray(data.feeTiers)) {
			FEE_TIERS.length = 0;
			for (const tier of data.feeTiers) {
				FEE_TIERS.push({
					label: tier.label,
					minGas: BigInt(tier.minGas),
					maxGas: BigInt(tier.maxGas),
					feeUSD: tier.feeUSD
				});
			}
		}

		// Update FEE_BUFFER_MIN in place
		if (data.feeBufferMin) {
			for (const key of Object.keys(FEE_BUFFER_MIN)) delete FEE_BUFFER_MIN[key];
			for (const [key, val] of Object.entries(data.feeBufferMin)) {
				FEE_BUFFER_MIN[key] = BigInt(val);
			}
		}

		// Update FEE_BUFFER_MAX in place
		if (data.feeBufferMax) {
			for (const key of Object.keys(FEE_BUFFER_MAX)) delete FEE_BUFFER_MAX[key];
			for (const [key, val] of Object.entries(data.feeBufferMax)) {
				FEE_BUFFER_MAX[key] = BigInt(val);
			}
		}

		_configFetched = true;
		_configFetchTime = Date.now();
		_configFetchPromise = null; // Allow future refreshes
		console.log('[gasless] Config fetched from backend:', {
			maxPreVerificationGas: GAS_BOUNDS.maxPreVerificationGas.toString(),
			maxTotalGas: GAS_BOUNDS.maxTotalGas.toString(),
			feeTiers: FEE_TIERS.length
		});
		return true;
	} catch (err) {
		console.warn('[gasless] Failed to fetch config from backend, using hardcoded defaults:', err);
		return false;
	}
}

// =============================================================================
// Helper functions
// =============================================================================

export function getTokenByAddress(address: string): TokenInfo | undefined {
	const lower = address.toLowerCase();
	return TOKENS.find((t) => t.address.toLowerCase() === lower);
}

export function getTokenBySymbol(symbol: string): TokenInfo | undefined {
	const upper = symbol.toUpperCase();
	return TOKENS.find((t) => t.symbol === upper);
}

export function isAllowedFeeToken(address: string): boolean {
	return ALLOWED_FEE_TOKENS.includes(address.toLowerCase());
}

export const gaslessConfig: GaslessConfig = {
	tokens: [...TOKENS],
	gasBounds: GAS_BOUNDS,
	feeTiers: FEE_TIERS,
	feeBufferBounds: {
		[USDT0_ADDRESS.toLowerCase()]: {
			min: FEE_BUFFER_MIN[USDT0_ADDRESS.toLowerCase()],
			max: FEE_BUFFER_MAX[USDT0_ADDRESS.toLowerCase()]
		},
		[WBTC_ADDRESS.toLowerCase()]: {
			min: FEE_BUFFER_MIN[WBTC_ADDRESS.toLowerCase()],
			max: FEE_BUFFER_MAX[WBTC_ADDRESS.toLowerCase()]
		},
		[TBTC_ADDRESS.toLowerCase()]: {
			min: FEE_BUFFER_MIN[TBTC_ADDRESS.toLowerCase()],
			max: FEE_BUFFER_MAX[TBTC_ADDRESS.toLowerCase()]
		}
	},
	treasury: GAS_TREASURY,
	entryPointAddress: ENTRY_POINT_ADDRESS,
	chainId: BigInt(ARBITRUM_CHAIN_ID),
	altoUrls: [...ALTO_URLS],
	chainlinkFeeds: { ethUsd: ETH_USD_FEED, btcUsd: BTC_USD_FEED }
};
