// Gasless Helpers — Pure functions for paymaster hashing, fee estimation, validation
// All financial math uses BigInt exclusively (no floating-point for money).
import { keccak256, encodeAbiParameters, toBytes } from 'viem';
import type { FeeTierDef } from '$lib/types/gasless.types';
import {
	GAS_BOUNDS,
	FEE_TIERS,
	FEE_BUFFER_MIN,
	FEE_BUFFER_MAX,
	ALLOWED_FEE_TOKENS,
	GAS_TREASURY,
	TOKENS
} from './gasless.config';

// ---------------------------------------------------------------------------
// Paymaster signature hash (must match Coinbase VerifyingPaymaster contract)
// ---------------------------------------------------------------------------

/**
 * Compute the paymaster signature hash.
 *
 * The Coinbase VerifyingPaymaster contract computes:
 *   hash = keccak256(abi.encode(sender, nonce, keccak256(callData), entryPoint, chainId))
 *
 * This function replicates that exact computation so the backend signature matches.
 *
 * @returns The 32-byte hash that the paymaster contract expects for signature recovery.
 */
export function getPaymasterSignatureHash(
	sender: string,
	nonce: bigint,
	callData: string,
	entryPointAddress: string,
	chainId: bigint
): `0x${string}` {
	const callDataHash = keccak256(toBytes(callData as `0x${string}`));

	return keccak256(
		encodeAbiParameters(
			[
				{ type: 'address' },
				{ type: 'uint256' },
				{ type: 'bytes32' },
				{ type: 'address' },
				{ type: 'uint256' }
			],
			[sender as `0x${string}`, nonce, callDataHash, entryPointAddress as `0x${string}`, chainId]
		)
	);
}

// ---------------------------------------------------------------------------
// Fee tier lookup
// ---------------------------------------------------------------------------

/**
 * Determine the fee tier based on estimated total gas.
 *
 * | Estimated Gas         | Fee Tier  | Fee (USD) |
 * |-----------------------|-----------|-----------|
 * | ≤ 200,000             | Low       | $0.01     |
 * | 200,001 – 500,000     | Medium    | $0.03     |
 * | 500,001 – 1,000,000   | High      | $0.05     |
 * | 1,000,001 – 5,000,000 | Very High | $0.10     |
 * | > 5,000,000           | REJECTED  | —         |
 *
 * @throws Error if estimatedGas exceeds 5,000,000 (network fee too high).
 */
export function getNetworkFeeTier(estimatedGas: bigint): FeeTierDef {
	for (const tier of FEE_TIERS) {
		if (estimatedGas >= tier.minGas && estimatedGas <= tier.maxGas) {
			return tier;
		}
	}
	throw new Error('Network fee too high — operation too complex');
}

// ---------------------------------------------------------------------------
// BigInt fee conversion (no floating-point)
// ---------------------------------------------------------------------------

/**
 * Convert a USD fee amount to token amount using BigInt-only arithmetic.
 *
 * The conversion is:
 *   tokenAmount = ceil(feeUSD * 1e18 * 10^tokenDecimals / tokenPriceUSD)
 *
 * Always rounds UP (favor treasury over underpayment).
 *
 * For USDT0 (stablecoin pegged to $1), tokenPrice is 1e18 ($1.00).
 * For wBTC/tBTC, tokenPrice comes from Chainlink BTC/USD oracle.
 *
 * @param feeUSD - The fee in USD (used as a number for tier display only)
 * @param tokenPriceUSD - Token price in USD with 18 decimals (BigInt)
 * @param tokenDecimals - Number of token decimals (e.g., 18 for USDT0, 8 for wBTC)
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

// ---------------------------------------------------------------------------
// Fee parameter validation (defense-in-depth)
// ---------------------------------------------------------------------------

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
		throw new Error('Network fee too high — operation exceeds 5M gas limit');
	}
}

// ---------------------------------------------------------------------------
// callData validation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Token info lookup
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Total gas computation
// ---------------------------------------------------------------------------

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
