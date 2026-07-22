/**
 * Gasless Helpers — Pure functions for paymaster hashing, fee estimation, validation
 *
 * All functions are pure and testable (no side effects, no external calls).
 * Uses ethers.js v6 exclusively for encoding and hashing (matches backend).
 * All financial math uses BigInt exclusively (no floating-point for money).
 *
 * This is the SINGLE SOURCE for gasless helper functions on the frontend.
 * This file is the ethers-based implementation of gasless helpers.
 *
 * @module gasless-helpers
 */

import { keccak256, AbiCoder } from 'ethers';
import type { FeeTierDef } from '$lib/types/gasless.types';
import {
	GAS_BOUNDS,
	FEE_TIERS,
	FEE_BUFFER_MIN,
	FEE_BUFFER_MAX,
	ALLOWED_FEE_TOKENS,
	GAS_TREASURY,
	TOKENS
} from '$lib/wallet/gasless.config';

// =============================================================================
// Paymaster Signature Hash
// =============================================================================

/**
 * Compute the paymaster signature hash matching Coinbase VerifyingPaymaster.
 *
 * The VerifyingPaymaster contract computes in `validatePaymasterUserOp`:
 *   keccak256(abi.encode(sender, nonce, keccak256(callData), entryPoint, chainId))
 *
 * This function replicates that exact computation for off-chain signing.
 * Uses ethers.js v6 ABI encoding — matches the backend implementation exactly.
 *
 * @param sender - UserOp.sender address
 * @param nonce - UserOp.nonce as bigint
 * @param callData - UserOp.callData as hex string (0x-prefixed)
 * @param entryPointAddress - EntryPoint contract address
 * @param chainId - Network chain ID (42161 for Arbitrum One)
 * @returns keccak256 hash of ABI-encoded paymaster parameters (hex string)
 */
export function getPaymasterSignatureHash(
	sender: string,
	nonce: bigint,
	callData: string,
	entryPointAddress: string,
	chainId: bigint
): string {
	const coder = AbiCoder.defaultAbiCoder();
	const callDataHash = keccak256(callData);
	const encoded = coder.encode(
		['address', 'uint256', 'bytes32', 'address', 'uint256'],
		[sender, nonce, callDataHash, entryPointAddress, chainId]
	);
	return keccak256(encoded);
}

// =============================================================================
// Fee Tier Lookup
// =============================================================================

/**
 * Determine the fee tier based on estimated total gas.
 *
 * | Estimated Gas            | Fee Tier  | Fee (USD) |
 * |--------------------------|-----------|-----------|
 * | ≤ 200,000                | Low       | $0.01     |
 * | 200,001 – 500,000        | Medium    | $0.03     |
 * | 500,001 – 1,000,000      | High      | $0.05     |
 * | 1,000,001 – 6,300,000    | Very High | $0.10     |
 * | > 6,300,000              | REJECTED  | —         |
 *
 * @throws Error if estimatedGas exceeds maxTotalGas (6,300,000).
 */
export function getNetworkFeeTier(estimatedGas: bigint): FeeTierDef {
	for (const tier of FEE_TIERS) {
		if (estimatedGas >= tier.minGas && estimatedGas <= tier.maxGas) {
			return tier;
		}
	}
	throw new Error('Network fee too high — operation too complex');
}

// =============================================================================
// BigInt Fee Conversion
// =============================================================================

/**
 * Convert a USD fee amount to token amount using BigInt-only arithmetic.
 *
 * Uses ethers.js ABI encoding for precise conversion.
 * Always rounds UP (favor treasury over underpayment).
 *
 * For USDT0 (stablecoin pegged to $1), tokenPrice is 1e18 ($1.00).
 * For wBTC/tBTC, tokenPrice comes from Chainlink BTC/USD oracle.
 *
 * @param feeUSD - The fee in USD (used as a number for tier display only)
 * @param tokenPriceUSD - Token price in USD with 18 decimals (BigInt)
 * @param tokenDecimals - Number of token decimals (e.g., 6 for USDT0, 8 for wBTC)
 * @returns The token amount in smallest unit (BigInt), rounded up.
 */
export function convertToTokenFee(
	feeUSD: number,
	tokenPriceUSD: bigint,
	tokenDecimals: number
): bigint {
	// Convert feeUSD to wei representation: feeUSD * 1e18
	const feeUSDWei = BigInt(Math.round(feeUSD * 1e18));

	// tokenAmount = feeUSDWei * 10^decimals / tokenPrice
	// Add (tokenPrice - 1n) before division to simulate ceiling division
	const divisor = tokenPriceUSD;
	if (divisor === 0n) throw new Error('Token price is zero — cannot compute fee');

	const numerator = feeUSDWei * 10n ** BigInt(tokenDecimals);
	const tokenAmount = (numerator + divisor - 1n) / divisor;

	return tokenAmount;
}

/**
 * Get USDT0 fee buffer for a given fee tier (stablecoin, constant $1.00 price).
 */
export function getUSDT0FeeBuffer(feeUSD: number): bigint {
	// USDT0 is 6 decimals, price = 1e18 ($1.00)
	return convertToTokenFee(feeUSD, 1_000_000_000_000_000_000n, 6);
}

/**
 * Get wBTC fee buffer for a given fee tier and BTC/USD price.
 */
export function getWBTCDerivedFeeBuffer(feeUSD: number, btcPriceUSD: bigint): bigint {
	return convertToTokenFee(feeUSD, btcPriceUSD, 8);
}

/**
 * Get tBTC fee buffer for a given fee tier and BTC/USD price.
 */
export function getTBTCFeeBuffer(feeUSD: number, btcPriceUSD: bigint): bigint {
	return convertToTokenFee(feeUSD, btcPriceUSD, 18);
}

// =============================================================================
// Fee Parameter Validation (defense-in-depth)
// =============================================================================

/**
 * Validate UserOp gas parameters against bounds.
 * Prevents paymaster drain via inflated gas values.
 *
 * @throws Error with descriptive message if any bound is exceeded.
 */
export function validateFeeParameters(userOp: {
	callGasLimit: bigint;
	verificationGasLimit: bigint;
	preVerificationGas: bigint;
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
}): void {
	// Lower bounds — reject zero/negative gas (defense-in-depth)
	if (userOp.callGasLimit <= 0n) {
		throw new Error('callGasLimit must be positive');
	}
	if (userOp.verificationGasLimit <= 0n) {
		throw new Error('verificationGasLimit must be positive');
	}
	if (userOp.preVerificationGas <= 0n) {
		throw new Error('preVerificationGas must be positive');
	}
	if (userOp.maxFeePerGas <= 0n) {
		throw new Error('maxFeePerGas must be positive');
	}
	if (userOp.maxPriorityFeePerGas <= 0n) {
		throw new Error('maxPriorityFeePerGas must be positive');
	}
	// Upper bounds
	if (userOp.callGasLimit > GAS_BOUNDS.maxCallGas) {
		throw new Error('callGasLimit exceeds maximum');
	}
	if (userOp.verificationGasLimit > GAS_BOUNDS.maxVerificationGas) {
		throw new Error('verificationGasLimit exceeds maximum');
	}
	if (userOp.preVerificationGas > GAS_BOUNDS.maxPreVerificationGas) {
		throw new Error('preVerificationGas exceeds maximum');
	}
	if (userOp.maxFeePerGas > GAS_BOUNDS.maxFeePerGas) {
		throw new Error('maxFeePerGas exceeds ceiling');
	}
	if (userOp.maxPriorityFeePerGas > GAS_BOUNDS.maxPriorityFeePerGas) {
		throw new Error('maxPriorityFeePerGas exceeds ceiling');
	}

	const totalGas = userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas;
	if (totalGas > GAS_BOUNDS.maxTotalGas) {
		throw new Error('Network fee too high — operation exceeds gas limit');
	}
}

// =============================================================================
// Fee Buffer Bounds Validation
// =============================================================================

/**
 * Validate fee buffer amount against token-specific min/max bounds.
 *
 * @throws Error if fee buffer is below minimum or above maximum.
 */
export function validateFeeBufferBounds(tokenAddress: string, feeAmount: bigint): void {
	const key = tokenAddress.toLowerCase();

	if (!ALLOWED_FEE_TOKENS.includes(key)) {
		throw new Error('Fee token not in allowed list');
	}

	const min = FEE_BUFFER_MIN[key];
	const max = FEE_BUFFER_MAX[key];

	if (min === undefined || max === undefined) {
		throw new Error(`No fee buffer bounds configured for token ${tokenAddress}`);
	}

	if (feeAmount < min) {
		throw new Error('Fee buffer below minimum for this token');
	}
	if (feeAmount > max) {
		throw new Error('Fee buffer above maximum — possible drain attempt');
	}
}

// =============================================================================
// Fee Recipient Validation
// =============================================================================

/**
 * Validate that the fee buffer recipient matches the treasury address.
 *
 * @throws Error if recipient does not match GAS_TREASURY.
 */
export function validateFeeRecipient(recipient: string): void {
	if (!GAS_TREASURY) {
		throw new Error('GAS_TREASURY not configured');
	}
	if (recipient.toLowerCase() !== GAS_TREASURY.toLowerCase()) {
		throw new Error('Fee buffer must go to GAS_TREASURY');
	}
}

// =============================================================================
// Token Info Lookup
// =============================================================================

/**
 * Get token info by address (case-insensitive).
 * Throws if token is not in the supported list.
 */
export function requireTokenInfo(address: string): (typeof TOKENS)[number] {
	const key = address.toLowerCase();
	const token = TOKENS.find((t) => t.address.toLowerCase() === key);
	if (!token) {
		throw new Error(`Unsupported token: ${address}`);
	}
	return token;
}

// =============================================================================
// Total Gas Computation
// =============================================================================

/**
 * Compute total gas from a UserOperation.
 */
export function computeTotalGas(userOp: {
	callGasLimit: bigint;
	verificationGasLimit: bigint;
	preVerificationGas: bigint;
}): bigint {
	return userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas;
}
