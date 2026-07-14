// Gasless Configuration — Arbitrum ERC-4337 + EIP-7702
import type { TokenInfo, GasBounds, FeeTierDef, GaslessConfig } from '$lib/types/gasless.types';
import { ARB_TOKEN_ADDRESSES } from '@bittasker/wallet-core';

export const ARBITRUM_CHAIN_ID = 42161;
export const ENTRY_POINT_ADDRESS = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' as const;
export const SIMPLE_7702_ACCOUNT_IMPL = '0xe6Cae83BdE06E4c305530e199D7217f42808555B' as const;

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

export const GAS_BOUNDS: GasBounds = {
	maxCallGas: 5_000_000n,
	maxVerificationGas: 1_000_000n,
	maxPreVerificationGas: 100_000n,
	maxFeePerGas: 1_000_000_000n, // 1 gwei
	maxPriorityFeePerGas: 100_000_000n, // 0.1 gwei
	maxTotalGas: 5_000_000n
};

export const FEE_TIERS: readonly FeeTierDef[] = [
	{ label: 'Low', minGas: 0n, maxGas: 200_000n, feeUSD: 0.01 },
	{ label: 'Medium', minGas: 200_001n, maxGas: 500_000n, feeUSD: 0.03 },
	{ label: 'High', minGas: 500_001n, maxGas: 1_000_000n, feeUSD: 0.05 },
	{ label: 'Very High', minGas: 1_000_001n, maxGas: 5_000_000n, feeUSD: 0.1 }
];

export const FEE_BUFFER_MIN: Record<string, bigint> = {
	[USDT0_ADDRESS.toLowerCase()]: 10_000n, // USDT0 (6 decimals): $0.01
	[WBTC_ADDRESS.toLowerCase()]: 16n, // WBTC (8 decimals): ~16 sats
	[TBTC_ADDRESS.toLowerCase()]: 10_000_000_000_000n // tBTC (18 decimals): $0.01
};

export const FEE_BUFFER_MAX: Record<string, bigint> = {
	[USDT0_ADDRESS.toLowerCase()]: 150_000n, // USDT0 (6 decimals): $0.15
	[WBTC_ADDRESS.toLowerCase()]: 230n, // WBTC (8 decimals): ~230 sats
	[TBTC_ADDRESS.toLowerCase()]: 150_000_000_000_000n // tBTC (18 decimals): $0.15
};

export const GAS_TREASURY = import.meta.env.VITE_GAS_TREASURY ?? '';
if (!GAS_TREASURY) {
	console.warn(
		'[gasless] VITE_GAS_TREASURY environment variable is not set. Fee collection will fail.'
	);
}

export const ALTO_URLS: readonly string[] = [
	import.meta.env.VITE_ALTO_URL_1 ?? 'http://alto-1:3000',
	import.meta.env.VITE_ALTO_URL_2 ?? 'http://alto-2:3000'
];

export const ARBITRUM_RPC_URL = import.meta.env.VITE_ARBITRUM_RPC_URL ?? '';
if (!ARBITRUM_RPC_URL) {
	console.warn(
		'[gasless] VITE_ARBITRUM_RPC_URL environment variable is not set. RPC calls will fail.'
	);
}
export const API_BASE_URL =
	import.meta.env.VITE_TX_RELAY_BASE_URL ?? 'http://localhost:8000/api/v1';

export const ETH_USD_FEED = '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612' as const;
export const BTC_USD_FEED = '0x6ce185860a4963106506C203335A2910413708e9' as const;
export const MAX_ORACLE_STALENESS = 300;

// Paymaster signer key file path (backend-only, not used client-side)
export const PAYMASTER_SIGNER_KEY_FILE = '';

export const gaslessConfig: GaslessConfig = {
	tokens: [...TOKENS],
	gasBounds: GAS_BOUNDS,
	feeTiers: [...FEE_TIERS],
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
