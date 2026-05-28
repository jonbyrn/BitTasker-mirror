/**
 * Redemption Fee Estimator Service
 *
 * Provides real-time fee estimation for the DOC→RBTC redemption flow
 * via MoC (Money on Chain) on RSK (Rootstock). Calculates MoC redemption
 * fee (0.20%), on-chain gas costs, and the expected RBTC to receive.
 *
 * Called by the redemption UI before user confirms the transaction.
 *
 * Flow:
 *   DOC amount (wei) → RBTC price → MoC redemption fee (0.20%)
 *   → gas estimate (approve + redeemDoc) → aggregated RedemptionFeeEstimate
 *
 * @see MoCMintingService.redeemDoc — performs the actual redemption on-chain
 * @see https://wiki.moneyonchain.com/en/faq — MoC fee documentation
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { loanMonitoringService } from '$lib/services/loan-monitoring.service';
import cryptoPriceService from '$lib/api/services/crypto-price.service';
import type { Wallet, JsonRpcProvider } from 'ethers';

const debug = createDebug('redemption-fee-estimator');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * MoC redemption fee rate: 0.20%
 * Per https://wiki.moneyonchain.com/en/faq — the protocol charges 0.20% on
 * both minting (DOC) and redemption (RBTC) operations.
 */
const MOC_REDEMPTION_FEE_RATE = 0.002;

/** Gas per transaction type on RSK for the redemption flow. */
const GAS_PER_REDEMPTION = {
	/** ERC-20 approve for DOC token (standard). */
	approve: 45_000,
	/** MoC redeemDoc call (~150k verified via estimateGas). */
	redeemDoc: 150_000
} as const;

/** Total gas across both steps (approve + redeemDoc). */
const TOTAL_REDEMPTION_GAS = GAS_PER_REDEMPTION.approve + GAS_PER_REDEMPTION.redeemDoc;
// = 195,000 gas

/** Default gas cost in USD (used when provider gas estimation fails). */
const DEFAULT_GAS_COST_USD = 2.0;

/** Quote expiry time in seconds. */
const QUOTE_EXPIRY_SECONDS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Aggregated DOC→RBTC redemption fee estimate returned to the UI.
 */
export interface RedemptionFeeEstimate {
	/** Expected RBTC to receive after fees in RBTC units (8 decimal places). */
	expectedRbtc: string;
	/** MoC redemption fee in USD (2 decimal places). */
	mocFeeUsd: string;
	/** MoC redemption fee rate (e.g. 0.002 = 0.20%). */
	mocFeeRate: number;
	/** Estimated gas cost in USD (2 decimal places). */
	gasCostUsd: string;
	/** Total fees (MoC fee + gas) in USD (2 decimal places). */
	totalFeesUsd: string;
	/** RBTC/USD price used for the quote. */
	rbtcPrice: number;
	/**
	 * MoC global coverage ratio at quote time, or null if unavailable.
	 * Mirrors the MoC contract's `globalCoverage()` — higher values indicate
	 * healthier collateralization.
	 */
	coverageRatio: number | null;
	/** Seconds until this quote should be considered stale. */
	quoteExpiresIn: number;
}

/**
 * Parameters required to produce a redemption fee estimate.
 */
export interface RedemptionEstimateParams {
	/** DOC amount to redeem in wei (18 decimals string). */
	docAmountWei: string;
	/** Connected RSK wallet signer (ethers.Wallet). */
	signer: Wallet;
	/** RSK JSON-RPC provider for gas estimation. */
	provider: JsonRpcProvider;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const redemptionFeeEstimator = {
	/**
	 * Estimate fees for redeeming DOC tokens for RBTC via MoC.
	 *
	 * Steps:
	 *   1. Fetch live RBTC/USD price from Coinbase.
	 *   2. Calculate DOC value in USD (DOC is 1:1 with USD).
	 *   3. Compute MoC redemption fee (0.20% of DOC value).
	 *   4. Estimate on-chain gas cost for approve + redeemDoc.
	 *   5. Calculate expected RBTC to receive after fees.
	 *
	 * @param params.docAmountWei - DOC amount to redeem in wei (18 decimals)
	 * @param params.signer - Connected RSK wallet signer
	 * @param params.provider - RSK JSON-RPC provider
	 * @returns Aggregated RedemptionFeeEstimate with expected RBTC, fees, and metadata
	 */
	async estimateFees(params: RedemptionEstimateParams): Promise<RedemptionFeeEstimate> {
		const { docAmountWei, signer: _signer, provider } = params;
		const startTime = Date.now();

		// Dynamic import — ethers is browser-only and cannot be top-level
		const ethersMod = await import('ethers');
		const { ethers } = ethersMod;

		debug.log('Starting redemption fee estimation for DOC %s wei', docAmountWei);
		loanMonitoringService.lifecycleEvent('started', {
			docAmountWei,
			action: 'estimateRedemptionFees'
		});

		// -------------------------------------------------------------------
		// Step 1: RBTC/USD price
		// -------------------------------------------------------------------
		const rbtcPrice = await getRbtcPrice();

		// -------------------------------------------------------------------
		// Step 2: DOC value in USD (DOC is 1:1 with USD)
		// -------------------------------------------------------------------
		const docAmount = parseFloat(ethers.formatEther(docAmountWei));
		if (docAmount <= 0) {
			throw new Error('DOC amount must be greater than zero');
		}
		const docValueUsd = docAmount; // DOC is pegged 1:1 to USD

		// -------------------------------------------------------------------
		// Step 3: MoC redemption fee (0.20%)
		// -------------------------------------------------------------------
		const mocFeeUsd = docValueUsd * MOC_REDEMPTION_FEE_RATE;
		const rbtcToReceive = (docValueUsd - mocFeeUsd) / rbtcPrice;

		// -------------------------------------------------------------------
		// Step 4: Gas estimate (on-chain fee data)
		// -------------------------------------------------------------------
		const gasCostUsd = await getGasCostUsd(provider, rbtcPrice, ethers);

		// -------------------------------------------------------------------
		// Step 5: Aggregate totals
		// -------------------------------------------------------------------
		const totalFeesUsd = mocFeeUsd + gasCostUsd;

		debug.log(
			'Redemption estimate: doc=%s → rbtc=%s, fees=moc:$%s gas:$%s total:$%s',
			docAmount.toFixed(2),
			rbtcToReceive.toFixed(8),
			mocFeeUsd.toFixed(2),
			gasCostUsd.toFixed(2),
			totalFeesUsd.toFixed(2)
		);

		const estimate: RedemptionFeeEstimate = {
			expectedRbtc: rbtcToReceive.toFixed(8),
			mocFeeUsd: mocFeeUsd.toFixed(2),
			mocFeeRate: MOC_REDEMPTION_FEE_RATE,
			gasCostUsd: gasCostUsd.toFixed(2),
			totalFeesUsd: totalFeesUsd.toFixed(2),
			rbtcPrice,
			coverageRatio: null,
			quoteExpiresIn: QUOTE_EXPIRY_SECONDS
		};

		loanMonitoringService.lifecycleEvent('completed', {
			docAmountWei,
			expectedRbtc: estimate.expectedRbtc,
			totalFeesUsd: estimate.totalFeesUsd,
			durationMs: Date.now() - startTime
		});

		return estimate;
	},

	/**
	 * Check if the redemption fee estimator is available.
	 *
	 * Verifies that the RBTC price feed is reachable (Coinbase API).
	 * This is a lightweight pre-flight check that does not require a
	 * signer or provider.
	 *
	 * @returns Availability status with optional reason if unavailable
	 */
	async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
		debug.log('Checking redemption fee estimator availability...');

		const { data: price, error } = await tryCatch(cryptoPriceService.getCurrentPrice('RBTC'));

		if (error || !price || price <= 0) {
			const reason = `RBTC price feed unavailable: ${error?.message ?? 'zero price'}`;
			debug.warn('Availability check failed: %s', reason);
			loanMonitoringService.healthCheck('redemption-fee-estimator', false, undefined, reason);
			return { available: false, reason };
		}

		loanMonitoringService.healthCheck('redemption-fee-estimator', true);
		return { available: true };
	}
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch RBTC price from Coinbase (via cryptoPriceService).
 * Always returns a fresh price (cache is per-instance, 5 min TTL).
 */
async function getRbtcPrice(): Promise<number> {
	const { data: price, error } = await tryCatch(cryptoPriceService.getCurrentPrice('RBTC'));

	if (error || !price || price <= 0) {
		debug.error('Failed to fetch RBTC price: %s', error?.message ?? 'invalid price');
		loanMonitoringService.healthCheck('crypto-price', false, undefined, error?.message);
		throw new Error(
			`Unable to fetch RBTC price for redemption quote: ${error?.message ?? 'zero or negative price returned'}`
		);
	}

	loanMonitoringService.healthCheck('crypto-price', true);
	debug.log('RBTC price: $%d', price);
	return price;
}

/**
 * Estimate on-chain gas cost in USD for the redemption flow.
 *
 * Queries the RSK provider for the live gas price and multiplies it by
 * the documented per-transaction gas values (approve + redeemDoc).
 * Falls back to a default estimate if the provider call fails.
 */
async function getGasCostUsd(
	provider: JsonRpcProvider,
	rbtcPrice: number,
	ethers: (typeof import('ethers'))['ethers']
): Promise<number> {
	const { data: feeData, error: feeDataError } = await tryCatch(provider.getFeeData());

	if (feeDataError || !feeData) {
		debug.warn(
			'Gas price fetch failed, using default $%.2f: %s',
			DEFAULT_GAS_COST_USD,
			feeDataError?.message ?? 'no data'
		);
		return DEFAULT_GAS_COST_USD;
	}

	const gasPrice = feeData.gasPrice ?? ethers.parseUnits('0.04', 'gwei');

	// Total gas cost = documented total gas per redemption × live on-chain gas price
	const totalGasCostWei = BigInt(TOTAL_REDEMPTION_GAS) * gasPrice;
	const gasCostRbtc = parseFloat(ethers.formatEther(totalGasCostWei));
	const gasCostUsd = gasCostRbtc * rbtcPrice;

	debug.log(
		'Gas: %d total gas × %s gwei = %s RBTC ($%.2f)',
		TOTAL_REDEMPTION_GAS,
		ethers.formatUnits(gasPrice, 'gwei'),
		gasCostRbtc.toFixed(8),
		gasCostUsd
	);

	return gasCostUsd;
}
