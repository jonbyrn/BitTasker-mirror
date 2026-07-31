/**
 * use-send-fee-estimate.svelte.ts
 *
 * Svelte 5 rune extracting SendPaymentForm.svelte's fee estimation logic:
 * - updateFeeEstimate() (L1214-1421): per-network fee computation
 * - fetchFeeParameters() (L1424-1510): Boltz pairs for max calculation
 * - calculateMaxAmount() (L1513-1539): mathematical max with buffer
 *
 * Responsibilities:
 * - Compute serviceFee, networkFee, totalFees per destination network
 * - Fetch Boltz submarine swap pairs for Lightning estimates
 * - Estimate RSK gas for direct RSK / Bitcoin destinations
 * - Fetch fee parameters (percentage + fixedFee) for max amount math
 * - Calculate max sendable amount with 20% buffer + 20 sats minimum
 * - Expose feeEstimate, isLoading, error, swapLimits, parameters, maxAmount
 *
 * Defensive patterns:
 * - All getters guarded with try/catch + isFinite checks
 * - Null/undefined params → safe fallback or early return
 * - Network failures → error state, not thrown
 * - DI for walletManager (testability)
 * - No i18n (error keys surfaced, caller translates per design)
 *
 * Usage:
 *   const feeEst = useSendFeeEstimate({
 *     getSourceType: () => formInput.selectedSource,
 *     getDestNetwork: () => parsedPayment.detectedNetwork,
 *     getAmountSats: () => amountInSats,
 *     getAvailableBalance: () => availableBalance,
 *     getBtcPrice: () => btcPrice,
 *     getWalletManager: () => walletManager,
 *     getIsRskConnected: () => $walletStore.rsk.connected,
 *     getRskAddress: () => $walletStore.rsk.address,
 *     getRecipientAddress: () => parsedPayment.data?.address,
 *   });
 *   // feeEst.feeEstimate, .isLoading, .error, .swapLimits, .parameters, .maxAmount, .refresh()
 */

import { createDebug } from '$lib/utils/debug';
import { tryCatch } from '$lib/utils/tryCatch';
import { FEE_BUFFER_MAX, USDT0_ADDRESS } from '$lib/wallet/gasless.config';
import * as Sentry from '@sentry/sveltekit';

const d = createDebug('send-fee-estimate');

let _abortController: AbortController | null = null;
let _lastRequestKey = '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendFeeEstimate {
	serviceFee: number;
	networkFee: number;
	totalFees: number;
}

export interface SendFeeParameters {
	percentage?: number;
	fixedFee?: number;
}

export interface SwapLimits {
	minimal: number;
	maximal: number;
}

/** Minimal wallet manager interface for DI / testability. */
export interface WalletManagerLike {
	getCachedSubmarineSwapPairs(): Promise<
		| Record<
				string,
				Record<
					string,
					{
						fees?: {
							percentage?: number;
							minerFees?: number;
						};
						limits?: SwapLimits;
					}
				>
		  >
		| undefined
	>;
	estimateRBTCGas(
		to: string,
		amount: string
	): Promise<{
		totalCostFormatted: string;
	}>;
	getSubmarineSwapLimits(): Promise<SwapLimits>;
}

export interface UseSendFeeEstimateOptions {
	getSourceType: () => string;
	getDestNetwork: () => string | null;
	getAmountSats: () => number;
	getAvailableBalance: () => number;
	getBtcPrice: () => number;
	getWalletManager: () => WalletManagerLike | null;
	getIsRskConnected: () => boolean;
	getRskAddress: () => string | null;
	getRecipientAddress: () => string | null;

	/** DI: override i18n key for fee_fetch_failed error. */
	errorKey?: string;
}

export interface UseSendFeeEstimateResult {
	feeEstimate: SendFeeEstimate | null;
	isLoading: boolean;
	error: string | null;
	swapLimits: SwapLimits | null;
	parameters: SendFeeParameters | null;
	maxAmount: number;
	refresh: () => Promise<void>;
	fetchFeeParameters: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure Helpers (exported for TDD + reuse)
// ---------------------------------------------------------------------------

/** True when dest network is a cross-chain EVM USDT destination. */
function isCrossChainEvmDest(dest: string): boolean {
	return (
		dest === 'usdt-ethereum' ||
		dest === 'usdt0-arb' ||
		dest === 'usdt-polygon' ||
		dest === 'usdt-optimism' ||
		dest === 'usdt-base' ||
		dest === 'usdt-avalanche' ||
		dest === 'usdt-tron'
	);
}

/**
 * Compute Lightning (submarine swap) fees from Boltz pair data.
 * Matches SendPaymentForm L1253-1283 exactly.
 */
export function computeLightningFees(
	amountSats: number,
	pair: { percentage: number; minerFees?: number; rootstockGasSats: number }
): SendFeeEstimate {
	const serviceFee = Math.ceil((amountSats * pair.percentage) / 100);
	const minerFee = pair.minerFees ?? 32;
	const networkFee = minerFee + pair.rootstockGasSats;
	return {
		serviceFee,
		networkFee,
		totalFees: serviceFee + networkFee
	};
}

/**
 * Compute fees for non-Lightning destination networks.
 * Matches SendPaymentForm L1311-1413 logic.
 *
 * @returns SendFeeEstimate | null (null = unknown network, caller sets null estimate)
 */
export async function computeDirectFees(
	destNetwork: string,
	opts: {
		selectedSource: string;
		isRskConnected: boolean;
		gasEstimation: { totalCostFormatted: string } | null;
		btcPrice?: number;
		amountSats?: number;
		recipient?: string | null;
	}
): Promise<SendFeeEstimate | null> {
	const { selectedSource, isRskConnected, gasEstimation, btcPrice } = opts;

	// rootstock-bitcoin destination
	if (destNetwork === 'rootstock-bitcoin') {
		// USDT-BSC source: swap handles delivery, no RSK gas needed
		if (selectedSource === 'usdt-bsc') {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}
		// RSK not connected → fallback
		if (!isRskConnected) {
			return { serviceFee: 0, networkFee: 3000, totalFees: 3000 };
		}
		// Estimate RSK gas
		if (gasEstimation) {
			const networkFee = Math.floor(parseFloat(gasEstimation.totalCostFormatted) * 100_000_000);
			return { serviceFee: 0, networkFee, totalFees: networkFee };
		}
		return { serviceFee: 0, networkFee: 3000, totalFees: 3000 };
	}

	// usdt-bsc destination
	if (destNetwork === 'usdt-bsc') {
		if (selectedSource === 'rootstock-bitcoin') {
			return { serviceFee: 0, networkFee: 100, totalFees: 100 };
		}
		return { serviceFee: 0, networkFee: 0, totalFees: 0 };
	}

	// Cross-chain EVM USDT destinations
	if (isCrossChainEvmDest(destNetwork)) {
		if (selectedSource === 'rootstock-bitcoin') {
			return { serviceFee: 0, networkFee: 100, totalFees: 100 };
		}
		if (destNetwork === 'usdt0-arb') {
			try {
				const { estimateFee } = await import('$lib/wallet/gasless-store');
				const amountUsd = ((opts.amountSats ?? 0) * (btcPrice ?? 0)) / 100_000_000;
				const estimate = await estimateFee(
					USDT0_ADDRESS,
					BigInt(Math.round(amountUsd * 1_000_000)),
					opts.recipient ?? ''
				);
				const feeBufferMicroUsdt = Number(BigInt(estimate.feeBuffer));
				const feeBufferUsd = feeBufferMicroUsdt / 1_000_000;
				const feeBufferSats =
					(btcPrice ?? 0) > 0
						? Math.ceil((feeBufferUsd / (btcPrice ?? 1)) * 100_000_000)
						: 15_000_000;
				return { serviceFee: 0, networkFee: feeBufferSats, totalFees: feeBufferSats };
			} catch {
				const feeBufferMicroUsdt = Number(FEE_BUFFER_MAX[USDT0_ADDRESS.toLowerCase()] ?? 150_000n);
				const feeBufferUsd = feeBufferMicroUsdt / 1_000_000;
				const feeBufferSats =
					(btcPrice ?? 0) > 0
						? Math.ceil((feeBufferUsd / (btcPrice ?? 1)) * 100_000_000)
						: 15_000_000;
				return { serviceFee: 0, networkFee: feeBufferSats, totalFees: feeBufferSats };
			}
		}
		return { serviceFee: 0, networkFee: 0, totalFees: 0 };
	}

	// bitcoin destination
	if (destNetwork === 'bitcoin') {
		if (selectedSource === 'usdt-bsc') {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}
		if (!isRskConnected) {
			return { serviceFee: 0, networkFee: 3000, totalFees: 3000 };
		}
		if (gasEstimation) {
			const networkFee = Math.floor(parseFloat(gasEstimation.totalCostFormatted) * 100_000_000);
			return { serviceFee: 0, networkFee, totalFees: networkFee };
		}
		return { serviceFee: 0, networkFee: 3000, totalFees: 3000 };
	}

	// Unknown network
	return null;
}

/**
 * Calculate max sendable amount with buffer.
 * Matches SendPaymentForm L1513-1539 exactly.
 */
export function calculateMaxAmount(
	availableBalance: number,
	parameters: SendFeeParameters | null
): number {
	if (!availableBalance || availableBalance <= 0) return 0;
	if (!parameters) return 0;

	const marginPercentage = 0.2;
	const absoluteMinimum = 20;

	// For percentage-based fees
	if (parameters.percentage !== undefined) {
		const fixedFee = parameters.fixedFee ?? 0;
		const percentage = parameters.percentage;
		const feeWithBuffer = Math.ceil(fixedFee * (1 + marginPercentage));
		const maxBeforeMargin = (availableBalance - feeWithBuffer) / (1 + percentage / 100);
		return Math.max(0, Math.floor(maxBeforeMargin) - absoluteMinimum);
	}

	// For fixed fees only
	if (parameters.fixedFee !== undefined) {
		const feeWithBuffer = Math.ceil(parameters.fixedFee * (1 + marginPercentage));
		const maxAmount = availableBalance - feeWithBuffer - absoluteMinimum;
		return Math.max(0, maxAmount);
	}

	return 0;
}

// ---------------------------------------------------------------------------
// Rune Factory
// ---------------------------------------------------------------------------

export function useSendFeeEstimate(opts: UseSendFeeEstimateOptions): UseSendFeeEstimateResult {
	// ---------------------------------------------------------------------------
	// Defensive reactive inputs (getters with guards, pattern from use-swap-routes)
	// ---------------------------------------------------------------------------

	const sourceType = $derived.by((): string => {
		try {
			return opts.getSourceType() || '';
		} catch (e) {
			d.warn('getter fallback:', (e as Error).message);
			return '';
		}
	});

	const destNetwork = $derived.by((): string | null => {
		try {
			return opts.getDestNetwork() || null;
		} catch (e) {
			d.warn('getter fallback:', (e as Error).message);
			return null;
		}
	});

	const amountSats = $derived.by((): number => {
		try {
			const a = opts.getAmountSats();
			return Number.isFinite(a) && a > 0 ? a : 0;
		} catch (e) {
			d.warn('getter fallback:', (e as Error).message);
			return 0;
		}
	});

	const availableBalance = $derived.by((): number => {
		try {
			const b = opts.getAvailableBalance();
			return Number.isFinite(b) && b > 0 ? b : 0;
		} catch (e) {
			d.warn('getter fallback:', (e as Error).message);
			return 0;
		}
	});

	const btcPrice = $derived.by((): number => {
		try {
			const p = opts.getBtcPrice();
			return Number.isFinite(p) && p > 0 ? p : 0;
		} catch (e) {
			d.warn('getter fallback:', (e as Error).message);
			return 0;
		}
	});

	const walletManager = $derived.by(() => {
		try {
			return opts.getWalletManager();
		} catch (e) {
			d.warn('getter fallback:', (e as Error).message);
			return null;
		}
	});

	const isRskConnected = $derived.by((): boolean => {
		try {
			return !!opts.getIsRskConnected();
		} catch (e) {
			d.warn('getter fallback:', (e as Error).message);
			return false;
		}
	});

	const rskAddress = $derived.by((): string | null => {
		try {
			return opts.getRskAddress() ?? null;
		} catch (e) {
			d.warn('getter fallback:', (e as Error).message);
			return null;
		}
	});

	const recipientAddress = $derived.by((): string | null => {
		try {
			return opts.getRecipientAddress() ?? null;
		} catch (e) {
			d.warn('getter fallback:', (e as Error).message);
			return null;
		}
	});

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------
	let feeEstimate = $state<SendFeeEstimate | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let swapLimits = $state<SwapLimits | null>(null);
	let parameters = $state<SendFeeParameters | null>(null);

	const maxAmount = $derived.by(() => {
		return calculateMaxAmount(availableBalance, parameters);
	});

	// ---------------------------------------------------------------------------
	// Fee estimation (matches updateFeeEstimate from SendPaymentForm L1214-1421)
	// ---------------------------------------------------------------------------
	async function refresh(): Promise<void> {
		_abortController?.abort();
		_abortController = new AbortController();
		const signal = _abortController.signal;

		const requestKey = `${destNetwork}:${amountSats}:${sourceType}`;
		if (requestKey === _lastRequestKey && isLoading) return;
		_lastRequestKey = requestKey;

		if (amountSats <= 0 || !destNetwork) {
			if (!destNetwork) {
				feeEstimate = null;
			}
			error = null;
			swapLimits = null;
			return;
		}

		isLoading = true;
		error = null;

		try {
			// Lightning submarine swap
			if (destNetwork === 'lightning-bitcoin') {
				await estimateLightningFees();
				if (signal.aborted) return;
				return;
			}

			// Direct RSK, cross-chain EVM, bitcoin → computeDirectFees
			// First, optionally fetch gas estimation for networks that need it
			let gasEstimation: { totalCostFormatted: string } | null = null;

			const needsGasEstimate =
				(destNetwork === 'rootstock-bitcoin' &&
					sourceType !== 'usdt-bsc' &&
					isRskConnected &&
					rskAddress) ||
				(destNetwork === 'bitcoin' && sourceType !== 'usdt-bsc' && isRskConnected && rskAddress);

			if (needsGasEstimate && walletManager) {
				const addr = recipientAddress || rskAddress;
				if (addr) {
					const amountRBTC = (amountSats / 100_000_000).toFixed(8);
					const { data: gasResult, error: gasError } = await tryCatch(
						walletManager.estimateRBTCGas(addr, amountRBTC)
					);
					if (!gasError && gasResult && !signal.aborted) {
						gasEstimation = gasResult;
					}
				}
			}

			const estimate = await computeDirectFees(destNetwork, {
				selectedSource: sourceType,
				isRskConnected,
				gasEstimation,
				btcPrice,
				amountSats,
				recipient: recipientAddress
			});

			if (signal.aborted) return;
			feeEstimate = estimate;
			Sentry.addBreadcrumb({
				category: 'wallet.send.fee',
				message: 'Fee estimated',
				data: {
					dest: destNetwork,
					source: sourceType,
					totalFees: estimate?.totalFees ?? null
				}
			});
		} catch (err) {
			d.warn('Failed to estimate fees: %s', err);
			error = 'wallet.swap.error.fee_fetch_failed';
			feeEstimate = null;
		} finally {
			isLoading = false;
		}
	}

	// Lightning-specific fee estimation (matches SendPaymentForm L1237-1309)
	async function estimateLightningFees(): Promise<void> {
		// Set synchronous estimate first so UI never shows "Free"
		const syncServiceFee = Math.ceil((amountSats * 0.1) / 100);
		const syncMinerFee = 32;
		feeEstimate = {
			serviceFee: syncServiceFee,
			networkFee: syncMinerFee + 4000,
			totalFees: syncServiceFee + syncMinerFee + 4000
		};

		if (!walletManager) {
			return;
		}

		try {
			const { data: pairsData, error: pairsError } = await tryCatch(
				walletManager.getCachedSubmarineSwapPairs()
			);

			if (!pairsError && pairsData) {
				const pair = pairsData?.['RBTC']?.['BTC'];
				if (pair?.fees) {
					const pairFees = pair.fees;
					// Estimate Rootstock gas fee for the swap transaction
					let rootstockGasFee = 4000;
					if (isRskConnected && rskAddress) {
						const { data: gasResult } = await tryCatch(
							(async () => {
								const totalAmountToSend =
									amountSats +
									Math.ceil((amountSats * (pairFees.percentage ?? 0.1)) / 100) +
									(pairFees.minerFees ?? 32);
								const amountRBTC = (totalAmountToSend / 100_000_000).toFixed(8);
								return await walletManager.estimateRBTCGas(rskAddress, amountRBTC);
							})()
						);
						if (gasResult) {
							rootstockGasFee = Math.max(
								0,
								Math.floor(parseFloat(gasResult.totalCostFormatted) * 100_000_000)
							);
						}
					}

					feeEstimate = computeLightningFees(amountSats, {
						percentage: pairFees.percentage ?? 0.1,
						minerFees: pairFees.minerFees,
						rootstockGasSats: rootstockGasFee
					});

					if (pair.limits) {
						swapLimits = {
							minimal: pair.limits.minimal,
							maximal: pair.limits.maximal
						};
					}
				} else {
					// Fallback if Boltz API returns no pair data
					const serviceFee = Math.ceil((amountSats * 0.1) / 100);
					const minerFee = 32;
					const networkFee = minerFee + 4000;
					feeEstimate = { serviceFee, networkFee, totalFees: serviceFee + networkFee };

					try {
						swapLimits = await walletManager.getSubmarineSwapLimits();
					} catch (e) {
						d.warn('getter fallback:', (e as Error).message);
						swapLimits = null;
					}
				}
			}
			// If pairsError → keep synchronous estimate (don't overwrite)
		} catch (e) {
			d.warn('getter fallback:', (e as Error).message);
			// Keep synchronous estimate on any failure
		}
	}

	// ---------------------------------------------------------------------------
	// Fee Parameters (matches fetchFeeParameters from SendPaymentForm L1424-1510)
	// ---------------------------------------------------------------------------

	async function fetchFeeParameters(): Promise<void> {
		if (!destNetwork || availableBalance <= 0) {
			parameters = null;
			return;
		}

		try {
			if (destNetwork === 'lightning-bitcoin' && walletManager) {
				await fetchLightningFeeParameters();
			} else if (destNetwork === 'rootstock-bitcoin') {
				await fetchRootstockFeeParameters();
			} else if (destNetwork === 'usdt0-arb') {
				try {
					const { estimateFee } = await import('$lib/wallet/gasless-store');
					const amountUsd = (availableBalance * btcPrice) / 100_000_000;
					const estimate = await estimateFee(
						USDT0_ADDRESS,
						BigInt(Math.round(amountUsd * 1_000_000)),
						recipientAddress ?? ''
					);
					const feeBufferMicroUsdt = Number(BigInt(estimate.feeBuffer));
					const feeBufferUsd = feeBufferMicroUsdt / 1_000_000;
					const feeBufferSats =
						btcPrice > 0 ? Math.ceil((feeBufferUsd / btcPrice) * 100_000_000) : 15_000_000;
					parameters = { fixedFee: feeBufferSats };
				} catch {
					const feeBufferMicroUsdt = Number(FEE_BUFFER_MAX[USDT0_ADDRESS.toLowerCase()] ?? 150_000n);
					const feeBufferUsd = feeBufferMicroUsdt / 1_000_000;
					const feeBufferSats =
						btcPrice > 0 ? Math.ceil((feeBufferUsd / btcPrice) * 100_000_000) : 15_000_000;
					parameters = { fixedFee: feeBufferSats };
				}
			} else {
				parameters = null;
			}
		} catch (err) {
			d.warn('Failed to fetch fee parameters: %s', err);
			parameters = null;
		}
	}

	async function fetchLightningFeeParameters(): Promise<void> {
		if (!walletManager) {
			parameters = { percentage: 0.1, fixedFee: 3000 };
			return;
		}

		const { data: pairsData } = await tryCatch(walletManager.getCachedSubmarineSwapPairs());

		const pair = pairsData?.['RBTC']?.['BTC'];
		if (pair?.fees) {
			const minerFee = pair.fees.minerFees ?? 32;

			let estimatedGasFee = 0;
			if (isRskConnected && rskAddress) {
				try {
					const estimateAmountRBTC = ((availableBalance * 0.8) / 100_000_000).toFixed(8);
					const { data: gasResult } = await tryCatch(
						walletManager.estimateRBTCGas(rskAddress, estimateAmountRBTC)
					);
					if (gasResult) {
						estimatedGasFee = Math.floor(parseFloat(gasResult.totalCostFormatted) * 100_000_000);
					} else {
						estimatedGasFee = 3000;
					}
				} catch (e) {
					d.warn('getter fallback:', (e as Error).message);
					estimatedGasFee = 3000;
				}
			} else {
				estimatedGasFee = 3000;
			}

			parameters = {
				percentage: pair.fees.percentage ?? 0.1,
				fixedFee: minerFee + estimatedGasFee
			};
		} else {
			parameters = {
				percentage: 0.1,
				fixedFee: 3000
			};
		}
	}

	async function fetchRootstockFeeParameters(): Promise<void> {
		if (isRskConnected && rskAddress && walletManager) {
			try {
				const estimateAmountRBTC = ((availableBalance * 0.8) / 100_000_000).toFixed(8);
				const addr = recipientAddress || rskAddress;
				const { data: gasResult } = await tryCatch(
					walletManager.estimateRBTCGas(addr, estimateAmountRBTC)
				);
				if (gasResult) {
					const estimatedGasFee = Math.floor(
						parseFloat(gasResult.totalCostFormatted) * 100_000_000
					);
					parameters = { fixedFee: estimatedGasFee };
				} else {
					parameters = { fixedFee: 3000 };
				}
			} catch (e) {
				d.warn('getter fallback:', (e as Error).message);
				parameters = { fixedFee: 3000 };
			}
		} else {
			parameters = { fixedFee: 3000 };
		}
	}

	// ---------------------------------------------------------------------------
	// Auto-refresh effect (debounced, pattern from use-swap-routes)
	// ---------------------------------------------------------------------------
	let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		// Subscribe to reactive inputs
		const _src = sourceType;
		const _dst = destNetwork;
		const _amt = amountSats;
		const _bal = availableBalance;

		// Cleanup prior timer
		if (_refreshTimer) {
			clearTimeout(_refreshTimer);
			_refreshTimer = null;
		}

		if (_amt <= 0 || !_dst) {
			feeEstimate = null;
			error = null;
			swapLimits = null;
			return;
		}

		// Debounce 300ms (faster than routes 400ms since these are lighter calls)
		_refreshTimer = setTimeout(async () => {
			await refresh();
			await fetchFeeParameters();
		}, 300);

		return () => {
			if (_refreshTimer) {
				clearTimeout(_refreshTimer);
				_refreshTimer = null;
			}
		};
	});

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	return {
		get feeEstimate() {
			return feeEstimate;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		get swapLimits() {
			return swapLimits;
		},
		get parameters() {
			return parameters;
		},
		get maxAmount() {
			return maxAmount;
		},
		refresh,
		// Expose pure helpers for direct testing + reuse
		fetchFeeParameters
	};
}
