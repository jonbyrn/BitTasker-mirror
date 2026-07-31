/**
 * use-receive-fees.svelte.ts
 *
 * Svelte 5 rune extracting ReceivePaymentForm.svelte's fee estimation logic:
 * - estimateFee() / computeFee() — unified fee computation dispatcher
 * - computeLightningFee() — Boltz reverse swap pairs
 * - computeLiquidFee() — Boltz chain swap pairs (L-BTC)
 * - computeBoltzChainFee() — Boltz chain swap pairs (BTC)
 * - computeCrossChainFee() — LI.FI / Symbiosis quote comparison
 * - computeChangellyFee() — Changelly exchange rate spread
 *
 * Rune uses getter-based DI for testability — no direct store imports.
 * No i18n — error keys surfaced, caller translates per design.
 */

import { createDebug } from '$lib/utils/debug';
import {
	deriveChainInfo,
	BOLTZ_LIGHTNING_ID,
	BOLTZ_LIQUID_ID,
	BOLTZ_BITCOIN_ID,
	EVM_NATIVE
} from '$lib/utils/receive-network-mapping';
import { CHANGELLY_REROUTE_NETWORKS } from '$lib/utils/generate-receive-invoice';
import { lifiService } from '$lib/services/lifi.service';
import { symbiosisService } from '$lib/services/symbiosis.service';
import { changellyService } from '$lib/services/changelly.service';
import { resolveFromTicker, resolveToTicker } from '$lib/services/changelly-ticker-map';
import { isLifiEnabled, isSymbiosisEnabled } from '$lib/services/kill-switch';

const d = createDebug('receive-fees');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeeEstimate = { serviceFee: number; networkFee: number; totalFees: number };

export interface UseReceiveFeesOptions {
	getAmountInSats: () => number;
	getPayerNetwork: () => string;
	getSelectedNetwork: () => string;
	getReceiveTab: () => string;
	getRskAddress: () => string | undefined;
	/** DI for walletManager.getCachedReverseSwapPairs */
	getCachedReverseSwapPairs: () => Promise<Record<
		string,
		Record<
			string,
			{
				fees: { percentage: number; minerFees: number | unknown };
				limits?: { minimal: number; maximal: number };
			}
		>
	> | null>;
	/** DI for walletManager.getCachedChainSwapPairs */
	getCachedChainSwapPairs: () => Promise<Record<
		string,
		Record<
			string,
			{
				fees: { percentage: number; minerFees: number | unknown };
				limits?: { minimal: number; maximal: number };
			}
		>
	> | null>;
}

export interface UseReceiveFees {
	estimated: FeeEstimate | null;
	isLoading: boolean;
	error: string | null;
	swapLimits: { minimal: number; maximal: number } | null;
	refresh(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Rune
// ---------------------------------------------------------------------------

export function useReceiveFees(opts: UseReceiveFeesOptions): UseReceiveFees {
	const getAmountInSats = opts.getAmountInSats;
	const getPayerNetwork = opts.getPayerNetwork;
	const getSelectedNetwork = opts.getSelectedNetwork;
	const getReceiveTab = opts.getReceiveTab;
	const getRskAddress = opts.getRskAddress;
	const getCachedReverseSwapPairs = opts.getCachedReverseSwapPairs;
	const getCachedChainSwapPairs = opts.getCachedChainSwapPairs;

	let estimated = $state<FeeEstimate | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let swapLimits = $state<{ minimal: number; maximal: number } | null>(null);
	let _feeGen = $state(0);

	// ---- Unified fee estimation (single write path, generation counter) ----
	async function refresh(): Promise<void> {
		if (isLoading) return;
		const gen = ++_feeGen;
		isLoading = true;
		error = null;

		try {
			estimated = null;
			const result = await computeFee();
			if (gen !== _feeGen) return;
			estimated = result;
		} catch (err) {
			if (gen !== _feeGen) return;
			d.error('Fee estimation failed:', err);
			error = 'wallet.swap.error.fee_fetch_failed';
			estimated = null;
		} finally {
			isLoading = false;
		}
	}

	/** Generalized fee computation: derive both sides, route through cheapest provider. */
	async function computeFee(): Promise<FeeEstimate | null> {
		const amountInSats = getAmountInSats();
		const payerNetwork = getPayerNetwork();
		const selectedNetwork = getSelectedNetwork();

		if (amountInSats === 0) return null;

		// ── Changelly "other" tab path ──
		if (payerNetwork.startsWith('changelly-')) {
			return computeChangellyFee();
		}

		// ── Changelly cross-chain USDT path (Ethereum, Avalanche, Base, etc.) ──
		if (CHANGELLY_REROUTE_NETWORKS.has(payerNetwork)) {
			return computeChangellyCrossChainFee();
		}

		const from = deriveChainInfo(payerNetwork);
		const to = deriveChainInfo(selectedNetwork);
		if (!from || !to) return null;

		// Direct send: same chain, same asset → zero fees
		if (from.chainId === to.chainId && from.asset === to.asset && from.chainId > 0) {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}

		// ── Boltz paths ──
		if (to.chainId === BOLTZ_LIGHTNING_ID) {
			if (from.asset !== 'RBTC') return { serviceFee: 0, networkFee: 0, totalFees: 0 };
			return computeLightningFee();
		}
		if (to.chainId === BOLTZ_LIQUID_ID) {
			return computeLiquidFee();
		}
		if (to.chainId === BOLTZ_BITCOIN_ID && from.asset === 'RBTC') {
			return computeBoltzChainFee();
		}
		if (
			to.chainId === BOLTZ_BITCOIN_ID ||
			to.chainId === BOLTZ_LIQUID_ID ||
			to.chainId === BOLTZ_LIGHTNING_ID
		) {
			const rbtcFee = await computeCrossChainFee(from.chainId, 30, from.address, EVM_NATIVE);
			if (!rbtcFee) return null;
			const boltzFee = Math.ceil(amountInSats * 0.001);
			return { ...rbtcFee, totalFees: rbtcFee.totalFees + boltzFee };
		}

		// ── General path: LI.FI / Symbiosis ──
		return computeCrossChainFee(from.chainId, to.chainId, from.address, to.address);
	}

	async function computeLightningFee(): Promise<FeeEstimate | null> {
		try {
			const pairsData = await getCachedReverseSwapPairs();
			const pair = pairsData?.['BTC']?.['RBTC'];
			if (!pair) return { serviceFee: 0, networkFee: 0, totalFees: 0 };

			const percentage = pair.fees.percentage;
			const serviceFee = Math.ceil((getAmountInSats() * percentage) / 100);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const mf = pair.fees.minerFees as any;
			const lockupFee = mf?.lockup || 0;
			const claimFee = mf?.claim || 0;
			const networkFee = lockupFee + claimFee;

			if (pair.limits) {
				swapLimits = { minimal: pair.limits.minimal, maximal: pair.limits.maximal };
			}
			return { serviceFee, networkFee, totalFees: serviceFee + networkFee };
		} catch {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}
	}

	async function computeLiquidFee(): Promise<FeeEstimate | null> {
		try {
			const pairsData = await getCachedChainSwapPairs();
			const pair = pairsData?.['L-BTC']?.['RBTC'];
			if (!pair) return { serviceFee: 0, networkFee: 0, totalFees: 0 };

			const percentage = pair.fees.percentage;
			const serviceFee = Math.ceil((getAmountInSats() * percentage) / 100);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const mf = pair.fees.minerFees as any;
			const lockupFee = mf?.user?.lockup || mf?.lockup || 0;
			const claimFee = mf?.user?.claim || mf?.claim || 0;
			const networkFee = lockupFee + claimFee;

			if (pair.limits) {
				swapLimits = { minimal: pair.limits.minimal, maximal: pair.limits.maximal };
			}
			return { serviceFee, networkFee, totalFees: serviceFee + networkFee };
		} catch {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}
	}

	async function computeBoltzChainFee(): Promise<FeeEstimate | null> {
		try {
			const pairsData = await getCachedChainSwapPairs();
			const pair = pairsData?.['BTC']?.['RBTC'];
			if (!pair) return { serviceFee: 0, networkFee: 0, totalFees: 0 };

			const percentage = pair.fees.percentage;
			const serviceFee = Math.ceil((getAmountInSats() * percentage) / 100);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const mf = pair.fees.minerFees as any;
			const lockupFee = mf?.user?.lockup || mf?.lockup || 0;
			const claimFee = mf?.user?.claim || mf?.claim || 0;
			const networkFee = lockupFee + claimFee;

			if (pair.limits) {
				swapLimits = { minimal: pair.limits.minimal, maximal: pair.limits.maximal };
			}
			return { serviceFee, networkFee, totalFees: serviceFee + networkFee };
		} catch {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}
	}

	async function computeCrossChainFee(
		fromChain: number,
		toChain: number,
		fromToken: string,
		toToken: string
	): Promise<FeeEstimate | null> {
		const probeAmount = '100000000000000000000';
		const userAddr = getRskAddress() || '';
		if (!userAddr) return { serviceFee: 0, networkFee: 0, totalFees: 0 };

		const amountInSats = getAmountInSats();
		const promises: Promise<{ provider: string; feePercent: number } | null>[] = [];

		if (isLifiEnabled()) {
			promises.push(
				lifiService
					.getQuote({
						fromChain,
						toChain,
						fromToken,
						toToken,
						fromAmount: probeAmount,
						fromAddress: userAddr
					})
					.then((r) => {
						const fromAmt = parseFloat(r.estimate?.fromAmount || '0');
						const toAmt = parseFloat(r.estimate?.toAmountMin || r.estimate?.toAmount || '0');
						return {
							provider: 'LI.FI',
							feePercent:
								fromAmt > 0 ? parseFloat((((fromAmt - toAmt) / fromAmt) * 100).toFixed(2)) : 0.5
						};
					})
					.catch(() => null)
			);
		}
		if (isSymbiosisEnabled()) {
			promises.push(
				symbiosisService
					.getQuote({
						tokenAmountIn: {
							address: fromToken,
							chainId: fromChain,
							symbol: fromToken === EVM_NATIVE ? 'RBTC' : 'USDT',
							decimals: 18,
							amount: probeAmount
						},
						tokenOut: {
							address: toToken,
							chainId: toChain,
							symbol: toToken === EVM_NATIVE ? 'RBTC' : 'USDT',
							decimals: 18
						},
						from: userAddr,
						to: userAddr
					})
					.then((r) => {
						const fromAmt = parseFloat(probeAmount);
						const toAmt = parseFloat(r.tokenAmountOut?.amount ?? '0');
						return {
							provider: 'Symbiosis',
							feePercent:
								fromAmt > 0 ? parseFloat((((fromAmt - toAmt) / fromAmt) * 100).toFixed(2)) : 0.3
						};
					})
					.catch(() => null)
			);
		}

		const results = await Promise.all(promises);
		const valid = results.filter(Boolean) as { provider: string; feePercent: number }[];
		if (valid.length > 0) {
			const best = valid.sort((a, b) => a.feePercent - b.feePercent)[0];
			const serviceFee = Math.ceil((amountInSats * best.feePercent) / 100);
			return { serviceFee, networkFee: 0, totalFees: serviceFee };
		}
		return { serviceFee: 0, networkFee: 0, totalFees: 0 };
	}

	async function computeChangellyFee(): Promise<FeeEstimate | null> {
		const payerNetwork = getPayerNetwork();
		const receiveTab = getReceiveTab();
		const amountInSats = getAmountInSats();

		const fromTicker = payerNetwork.replace('changelly-', '').toUpperCase();
		const toTicker = receiveTab === 'usdt0-arb' ? 'USDT' : 'BTC';

		if (!fromTicker || fromTicker === toTicker) {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}

		try {
			const limits = await changellyService.getLimits(
				fromTicker.toLowerCase(),
				toTicker.toLowerCase()
			);
			if (!limits || !limits.min) {
				return { serviceFee: 0, networkFee: 0, totalFees: 0 };
			}

			const estimate = await changellyService.estimateSwap({
				from: fromTicker.toLowerCase(),
				to: toTicker.toLowerCase(),
				amount: limits.min
			});

			if (!estimate || !estimate.estimatedAmount || parseFloat(estimate.estimatedAmount) <= 0) {
				return { serviceFee: 0, networkFee: 0, totalFees: 0 };
			}

			const inputVal = parseFloat(limits.min);
			const outputVal = parseFloat(estimate.estimatedAmount);
			const feePercent = inputVal > 0 ? ((inputVal - outputVal) / inputVal) * 100 : 0.5;

			const serviceFee = Math.ceil((amountInSats * Math.max(feePercent, 0.1)) / 100);
			const minerFee = estimate.minerFee
				? Math.ceil(parseFloat(estimate.minerFee) * 100_000_000)
				: 0;

			return {
				serviceFee,
				networkFee: minerFee,
				totalFees: serviceFee + minerFee
			};
		} catch (err) {
			d.warn('Changelly estimate failed:', err);
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}
	}

	async function computeChangellyCrossChainFee(): Promise<FeeEstimate | null> {
		const amountInSats = getAmountInSats();

		const fromTicker = resolveFromTicker(getPayerNetwork());
		const toTicker = resolveToTicker();

		try {
			const limits = await changellyService.getLimits(fromTicker, toTicker);
			if (!limits || !limits.min) {
				return { serviceFee: 0, networkFee: 0, totalFees: 0 };
			}

			const estimate = await changellyService.estimateSwap({
				from: fromTicker,
				to: toTicker,
				amount: limits.min
			});

			if (!estimate || !estimate.estimatedAmount || parseFloat(estimate.estimatedAmount) <= 0) {
				return { serviceFee: 0, networkFee: 0, totalFees: 0 };
			}

			const inputVal = parseFloat(limits.min);
			const outputVal = parseFloat(estimate.estimatedAmount);
			const feePercent = inputVal > 0 ? ((inputVal - outputVal) / inputVal) * 100 : 0.5;

			const serviceFee = Math.ceil((amountInSats * Math.max(feePercent, 0.1)) / 100);
			const minerFee = estimate.minerFee
				? Math.ceil(parseFloat(estimate.minerFee) * 100_000_000)
				: 0;

			return {
				serviceFee,
				networkFee: minerFee,
				totalFees: serviceFee + minerFee
			};
		} catch (err) {
			d.warn('Changelly cross-chain estimate failed:', err);
			error = 'wallet.receive.changelly_bridge_unavailable';
			return null;
		}
	}

	// ------- Return -------
	return {
		get estimated() {
			return estimated;
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
		refresh
	};
}
