// =============================================================================
// Gasless Configuration for Arbitrum Mainnet
// Source of truth: requirements/gasless-arbitrum-plan.md
// =============================================================================

import type {
	GasBounds,
	TokenInfo,
	FeeBufferBounds,
	FeeTierDef,
	GaslessConfig
} from './src/types/gasless.types';
import { FeeTier } from './src/types/gasless.types';

// ---------------------------------------------------------------------------
// Gas bounds configuration (plan section 4.9)
// ---------------------------------------------------------------------------

export const gasBounds: GasBounds = {
	maxCallGas: 5_000_000n, // 5M gas for callGasLimit
	maxVerificationGas: 1_000_000n, // 1M gas for verificationGasLimit
	maxPreVerificationGas: 100_000n, // 100k gas for preVerificationGas
	maxFeePerGas: 1_000_000_000n, // 1 gwei ceiling
	maxTotalGas: 5_000_000n // Reject operations exceeding 5M gas
};

// ---------------------------------------------------------------------------
// Network fee tiers (plan section 4.5 — tiered fee model)
// ---------------------------------------------------------------------------

export const networkFeeTiers: readonly FeeTierDef[] = [
	{
		tier: FeeTier.Low,
		label: 'Low',
		feeUSD: 0.01, // $0.01 — simple ERC-20 transfer
		gasMultiplier: 10_000n // 1x (base rate)
	},
	{
		tier: FeeTier.Medium,
		label: 'Medium',
		feeUSD: 0.03, // $0.03 — Uniswap swap, simple DeFi
		gasMultiplier: 15_000n // 1.5x
	},
	{
		tier: FeeTier.High,
		label: 'High',
		feeUSD: 0.05, // $0.05 — complex DeFi (Aave, Compound)
		gasMultiplier: 20_000n // 2x
	},
	{
		tier: FeeTier.VeryHigh,
		label: 'Very High',
		feeUSD: 0.1, // $0.10 — governance, multicall batch
		gasMultiplier: 25_000n // 2.5x
	}
] as const;

// ---------------------------------------------------------------------------
// Tokens accepted for gas fee payment (plan section 3.1)
// ---------------------------------------------------------------------------

export const tokens: readonly TokenInfo[] = [
	{
		address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT0
		symbol: 'USDT0',
		decimals: 6, // 6 decimals
		chainId: 42161 // Arbitrum One
	},
	{
		address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', // wBTC
		symbol: 'WBTC',
		decimals: 8, // 8 decimals (satoshis)
		chainId: 42161
	},
	{
		address: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40', // tBTC
		symbol: 'TBTC',
		decimals: 18, // 18 decimals
		chainId: 42161
	}
] as const;

// ---------------------------------------------------------------------------
// Fee buffer bounds per token (plan section 4.3 constants)
// ---------------------------------------------------------------------------

export const feeBufferBounds: Record<string, FeeBufferBounds> = {
	'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': {
		// USDT0
		min: 10_000n, // 0.01 tokens ($0.01 — Low tier minimum, 6 decimals)
		max: 150_000n // 0.15 tokens ($0.15 — maximum to prevent drain, 6 decimals)
	},
	'0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': {
		// wBTC
		min: 16n, // 16 satoshis (~$0.01 at $66K)
		max: 230n // 230 satoshis (~$0.15)
	},
	'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': {
		// tBTC
		min: 10_000_000_000_000_000n, // 0.01 tokens (~$0.01 at $66K)
		max: 150_000_000_000_000_000n // 0.15 tokens (~$0.15)
	}
};

// ---------------------------------------------------------------------------
// Treasury address (plan section 4.3)
// ---------------------------------------------------------------------------

/** Single treasury address for fee buffer collection */
export const treasuryAddress = '0x0000000000000000000000000000000000000001';

// ---------------------------------------------------------------------------
// Chainlink price feeds (plan section 4.12)
// ---------------------------------------------------------------------------

export const chainlinkFeeds = {
	ethUsd: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612', // ETH/USD on Arbitrum One
	btcUsd: '0x6ce185860a4963106506C203335A2910413708e9' // BTC/USD on Arbitrum One
} as const;

/** Maximum age (seconds) before Chainlink price is considered stale */
export const CHAINLINK_STALENESS_THRESHOLD = 300; // 5 minutes

// ---------------------------------------------------------------------------
// EntryPoint (plan section 4.1)
// ---------------------------------------------------------------------------

export const entryPointAddress = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'; // v0.8

// ---------------------------------------------------------------------------
// Alto bundler URLs (internal Docker network)
// ---------------------------------------------------------------------------

export const altoUrls = [
	'http://alto-1:3000', // Primary
	'http://alto-2:3000' // Redundant
] as const;

// ---------------------------------------------------------------------------
// Chain ID
// ---------------------------------------------------------------------------

export const chainId = 42161n; // Arbitrum One

// ---------------------------------------------------------------------------
// Complete gasless configuration
// ---------------------------------------------------------------------------

export const gaslessConfig: GaslessConfig = {
	tokens,
	gasBounds,
	feeTiers: networkFeeTiers,
	feeBufferBounds,
	treasury: treasuryAddress,
	entryPointAddress,
	chainId,
	altoUrls: [...altoUrls],
	chainlinkFeeds
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Get token info by address (case-insensitive)
 */
export function getTokenByAddress(address: string): TokenInfo | undefined {
	return tokens.find((token) => token.address.toLowerCase() === address.toLowerCase());
}

/**
 * Get token info by symbol
 */
export function getTokenBySymbol(symbol: string): TokenInfo | undefined {
	return tokens.find((token) => token.symbol.toLowerCase() === symbol.toLowerCase());
}

/**
 * Check if a token address is in the allowed list
 */
export function isTokenAllowed(address: string): boolean {
	return tokens.some((token) => token.address.toLowerCase() === address.toLowerCase());
}

/**
 * Get fee tier by gas estimate
 * Returns undefined if gas exceeds maximum (rejected at > 5M)
 */
export function getNetworkFeeTier(estimatedGas: bigint): FeeTierDef | undefined {
	// Sort tiers by maxGas ascending, find first tier where estimatedGas <= maxGas
	return networkFeeTiers.find((tier) => estimatedGas <= tier.gasMultiplier * 100n);
}

/**
 * Validate fee buffer amount for a token
 */
export function isFeeBufferValid(tokenAddress: string, amount: bigint): boolean {
	const bounds = feeBufferBounds[tokenAddress.toLowerCase()];
	if (!bounds) return false;
	return amount >= bounds.min && amount <= bounds.max;
}

/**
 * Get fee buffer bounds for a token
 */
export function getFeeBufferBounds(tokenAddress: string): FeeBufferBounds | undefined {
	return feeBufferBounds[tokenAddress.toLowerCase()];
}

/**
 * Validate total gas doesn't exceed maximum
 */
export function isTotalGasValid(totalGas: bigint): boolean {
	return totalGas <= gasBounds.maxTotalGas;
}

export default gaslessConfig;
