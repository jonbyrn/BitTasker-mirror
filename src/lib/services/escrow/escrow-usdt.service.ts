/**
 * USDT Escrow Service
 *
 * High-level service for USDT escrow parameter derivation and token-aware
 * pricing. Provides pure functions that convert USD amounts to token wei
 * amounts without blockchain dependencies.
 *
 * Key design decisions:
 *  - `convertUSDTAmountToWei(amount)`: USDT on BSC uses 18 decimals, so
 *    amount * 10^18. No BTC price division is needed.
 *  - `deriveEscrowParams(token, amount, btcPrice?)`: Unified dispatch that
 *    routes to the correct derivation function based on token type.
 *  - Token-aware fee calculation: USDT escrows use 5% per-side flat fee.
 *    rBTC escrows use the existing FEE_TIERS from @bittasker/wallet-core.
 *
 * All exported functions are pure and deterministic — no async, no side effects.
 */
import { ethers } from 'ethers';
import { FEE_TIERS } from '@bittasker/wallet-core';
import { GAS_REIMBURSEMENT_PER_OP } from '$lib/utils/contract/v2/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported escrow token types */
export type EscrowToken = 'USDT' | 'rBTC';

/** Token-aware chain mapping */
export type EscrowChain = 'rsk' | 'bsc';

/**
 * Result of deriving a USDT amount to wei.
 * Pure data — no contract state.
 */
export interface EscrowAmountResult {
	/** Token amount in wei (smallest unit) */
	amountWei: bigint;
	/** Human-readable formatted amount (token units) */
	formatted: string;
	/** Token type */
	token: EscrowToken;
	/** Target chain for the escrow contract */
	chain: EscrowChain;
}

/**
 * Fee breakdown for an escrow.
 */
export interface EscrowFeeBreakdown {
	/** Tasker (client) fee in wei */
	taskerFeeWei: bigint;
	/** Taskee (freelancer) fee in wei */
	taskeeFeeWei: bigint;
	/** Total fees (tasker + taskee) in wei */
	totalFeesWei: bigint;
	/** Gas reimbursement in wei (2 * GAS_REIMBURSEMENT_PER_OP) */
	gasReimbursementWei: bigint;
	/** Total value (base + tasker fee + gas reimbursement) in wei */
	totalValueWei: bigint;
	/** Tasker fee tier used */
	taskerFeeTier: number;
	/** Taskee fee tier used */
	taskeeFeeTier: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function assertAmount(amount: number): void {
	if (!Number.isFinite(amount) || amount <= 0) {
		throw new Error('Amount must be a finite number greater than 0');
	}
}

// ---------------------------------------------------------------------------
// Public API — Amount Derivation
// ---------------------------------------------------------------------------

/**
 * Derive USDT escrow wei amount from a USD amount.
 *
 * USDT on BSC uses 18 decimals, so this is simply `amount * 10^18`.
 * No BTC price division is performed — USDT is a stablecoin pegged 1:1 to USD.
 *
 * @param amount - USD amount (e.g. 50.00 for $50)
 * @returns Amount in USDT wei with token and chain metadata
 *
 * @example
 * ```ts
 * const result = convertUSDTAmountToWei(50.00);
 * // { amountWei: 50000000000000000000n, formatted: '50.00', token: 'USDT', chain: 'bsc' }
 * ```
 */
export function convertUSDTAmountToWei(amount: number): EscrowAmountResult {
	assertAmount(amount);

	const amountWei = BigInt(Math.round(amount * 10 ** 18));
	const formatted = ethers.formatUnits(amountWei, 18);

	return {
		amountWei,
		formatted,
		token: 'USDT',
		chain: 'bsc'
	};
}

/**
 * Derive rBTC escrow wei amount from a USD amount and BTC price.
 *
 * Delegates to the existing rBTC derivation pattern: `amount / btcPrice` to get
 * BTC, then `parseEther()` to convert to wei.
 *
 * @param amount - USD amount (e.g. 50.00 for $50)
 * @param btcPrice - Current BTC/USD price
 * @returns Amount in rBTC wei with token and chain metadata
 *
 * @example
 * ```ts
 * const result = deriveRBTCScrowParams(50.00, 65000);
 * // { amountWei: 769230769230769230n, formatted: '0.00076923', token: 'rBTC', chain: 'rsk' }
 * ```
 */
export function deriveRBTCScrowParams(amount: number, btcPrice: number): EscrowAmountResult {
	assertAmount(amount);

	if (!Number.isFinite(btcPrice) || btcPrice <= 0) {
		throw new Error('BTC price must be a finite number greater than 0');
	}

	const rbtcAmount = amount / btcPrice;
	const amountWei = ethers.parseEther(rbtcAmount.toFixed(18));
	const formatted = ethers.formatEther(amountWei);

	return {
		amountWei,
		formatted,
		token: 'rBTC',
		chain: 'rsk'
	};
}

/**
 * Unified escrow amount derivation that dispatches based on token type.
 *
 * - For `'USDT'`: calls `convertUSDTAmountToWei()` — no BTC price needed.
 * - For `'rBTC'`: calls `deriveRBTCScrowParams()` — requires `btcPrice`.
 *
 * @param token - Target escrow token ('USDT' | 'rBTC')
 * @param amount - USD amount to convert
 * @param btcPrice - Current BTC/USD price (required when token is 'rBTC')
 * @returns Token-aware amount in wei with chain metadata
 * @throws {Error} If btcPrice is missing for rBTC
 *
 * @example
 * ```ts
 * // USDT: no btcPrice needed
 * const usdtResult = deriveEscrowParams('USDT', 50.00);
 *
 * // rBTC: btcPrice required
 * const rbtcResult = deriveEscrowParams('rBTC', 50.00, 65000);
 * ```
 */
export function deriveEscrowParams(
	token: EscrowToken,
	amount: number,
	btcPrice?: number
): EscrowAmountResult {
	if (token === 'USDT') {
		return convertUSDTAmountToWei(amount);
	}

	if (btcPrice == null) {
		throw new Error('btcPrice is required when token is rBTC');
	}

	return deriveRBTCScrowParams(amount, btcPrice);
}

/**
 * Convert an EscrowAmountResult to a display-friendly string
 * with token suffix (e.g. "50.00 USDT").
 *
 * @param result - Token amount result from derivation
 * @returns Formatted display string
 */
export function formatEscrowAmount(result: EscrowAmountResult): string {
	// Use the original formatted field, which is the human-readable token amount
	return `${result.formatted} ${result.token}`;
}

// ---------------------------------------------------------------------------
// Public API — Fee Calculation
// ---------------------------------------------------------------------------

/**
 * USDT platform fee: 5% per side (500 basis points).
 * This is a flat fee regardless of fee tier, per the integration plan specification.
 */
const USDT_FEE_BASIS_POINTS = 500;

/**
 * Calculate fee breakdown for an escrow given the base amount in wei.
 *
 * For USDT: tasker and taskee each pay a flat 5% (500 bps) regardless of tier.
 * For rBTC: uses the existing FEE_TIERS lookup (tier 1 = 2.5% = 250 bps per side).
 *
 * Pure function — no side effects, deterministic output.
 *
 * @param baseAmountWei - Base escrow amount in wei
 * @param token - Escrow token type
 * @param taskerFeeTier - Fee tier for tasker (default: 1, used for rBTC only)
 * @param taskeeFeeTier - Fee tier for taskee (default: 1, used for rBTC only)
 * @returns Fee breakdown with all components in wei
 *
 * @example
 * ```ts
 * const fees = calculateEscrowFees(parseUnits('100', 18), 'USDT');
 * // taskerFeeWei = 5.0 USDT (5%), taskeeFeeWei = 5.0 USDT (5%)
 * ```
 */
export function calculateEscrowFees(
	baseAmountWei: bigint,
	token: EscrowToken,
	taskerFeeTier: number = 1,
	taskeeFeeTier: number = 1
): EscrowFeeBreakdown {
	if (baseAmountWei <= 0n) {
		throw new Error('Base amount must be greater than zero');
	}

	// USDT uses a flat 5% per side; rBTC uses the tier-based system
	const taskerFeePercentage =
		token === 'USDT'
			? USDT_FEE_BASIS_POINTS
			: (FEE_TIERS[taskerFeeTier as keyof typeof FEE_TIERS]?.percentage ?? 250);
	const taskeeFeePercentage =
		token === 'USDT'
			? USDT_FEE_BASIS_POINTS
			: (FEE_TIERS[taskeeFeeTier as keyof typeof FEE_TIERS]?.percentage ?? 250);

	const taskerFeeWei = (baseAmountWei * BigInt(taskerFeePercentage)) / 10000n;
	const taskeeFeeWei = (baseAmountWei * BigInt(taskeeFeePercentage)) / 10000n;

	const gasReimbursementWei = 2n * GAS_REIMBURSEMENT_PER_OP;

	// For ERC-20 tokens (USDT), totalValueWei is 0 (no msg.value).
	// For native tokens (rBTC), totalValueWei = base + taskerFee + gasReimbursement.
	// The caller sets totalValueWei appropriately for each token.
	const totalValueWei = token === 'USDT' ? 0n : baseAmountWei + taskerFeeWei + gasReimbursementWei;

	return {
		taskerFeeWei,
		taskeeFeeWei,
		totalFeesWei: taskerFeeWei + taskeeFeeWei,
		gasReimbursementWei,
		totalValueWei,
		taskerFeeTier,
		taskeeFeeTier
	};
}

/**
 * Calculate the platform fee percentage for a given token.
 *
 * USDT escrows use a flat 5% per side (tasker and taskee each pay 5%).
 * rBTC escrows use tier-based percentages from FEE_TIERS.
 *
 * @param token - Escrow token type
 * @param feeTier - Fee tier (default: 1, used for rBTC only)
 * @returns Fee percentage as a decimal (e.g. 5 for 5%)
 */
export function getEscrowFeePercentage(token: EscrowToken, feeTier: number = 1): number {
	if (token === 'USDT') {
		return USDT_FEE_BASIS_POINTS / 100;
	}
	const percentage = FEE_TIERS[feeTier as keyof typeof FEE_TIERS]?.percentage ?? 250;
	return percentage / 100;
}

// ---------------------------------------------------------------------------
// Public API — Token Info
// ---------------------------------------------------------------------------

/**
 * Get the default chain for a given token.
 */
export function getTokenChain(token: EscrowToken): EscrowChain {
	if (token === 'USDT') return 'bsc';
	return 'rsk';
}

/**
 * Get the token display name.
 */
export function getTokenDisplayName(token: EscrowToken): string {
	const names: Record<EscrowToken, string> = {
		USDT: 'USDT (BSC)',
		rBTC: 'rBTC (RSK)'
	};
	return names[token];
}
