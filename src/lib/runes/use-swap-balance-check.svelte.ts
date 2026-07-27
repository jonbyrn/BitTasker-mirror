/**
 * use-swap-balance-check.svelte.ts
 *
 * Svelte 5 rune extracting SwapForm.svelte's balance and route validity checks:
 * - Arbitrum ETH balance check for gas (boltz+lifi routes)
 * - Route validity deriveds: outputBelowMinimum, smartRouteWarning, isSelfSend
 * - Combined isAmountError + canSwap gate
 *
 * Rune uses getter-based DI for testability — no direct store imports in
 * deriveds. checkArbEthBalance reads walletStore directly for the built-in
 * wallet Arbitrum address (same pattern as use-swap-wallets).
 */

import { get } from 'svelte/store';
import { walletStore } from '$lib/stores/wallet.store';
import { checkArbEthBalance as fetchArbEthBalance } from '$lib/utils/swap-gas';
import { SOURCE_TO_SAME_DEST } from '$lib/utils/swap-helpers';
import * as Sentry from '@sentry/sveltekit';
import type { SourceWallet } from '$lib/services/route-resolver';
import type { DestType } from '$lib/runes/use-swap-options.svelte';
import type { SmartRoute } from '$lib/services/SmartRouter';
import type { RouteEngineResult } from '$lib/services/route-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSwapBalanceCheckOptions {
	getSourceType: () => SourceWallet;
	getDestType: () => DestType;
	getSourceWallet: () => string;
	getDestWallet: () => string;
	/** Source wallet address for Arb balance check. */
	getSourceAddr: () => string;
	/** SmartRoute from local state (SwapFallback retry path). */
	getSmartRoute: () => SmartRoute | null;
	/** Engine result from swap routes rune. */
	getEngineResult: () => RouteEngineResult;
	/** Minimum swap amount in sats from swap routes rune. */
	getMinSwapSats: () => number;
	/** Amount in sats from swap calculator rune. */
	getAmountSats: () => number;
	/** Whether balance is insufficient from swap calculator rune. */
	getIsInsufficientBalance: () => boolean;
	/** Amount in token units from swap calculator rune. */
	getAmountInTokenUnits: () => number;
	/** Whether route is loading from swap routes rune. */
	getRouteLoading: () => boolean;
	/** Estimated output string from swap routes rune. */
	getEstimatedOutput: () => string;
	/** Whether the amount is valid from swap calculator rune. */
	getIsValidAmount: () => boolean;
	/** Whether online. */
	getIsOnline: () => boolean;
	/** Whether swap is in the form phase (not confirm/executing/etc). */
	getIsFormPhase: () => boolean;
	/** Whether the gasless relay is available (paymaster deposit sufficient). */
	getRelayAvailable: () => boolean;
	/** Whether gas data is available for fee estimation. */
	getGasDataAvailable: () => boolean;
}

export interface UseSwapBalanceCheck {
	// Arb ETH check
	arbEthBalance: string | null;
	arbEthCheckDone: boolean;
	checkArbEthBalance(): Promise<void>;
	needsArbEth: boolean;

	// Route/balance validation
	outputBelowMinimum: boolean;
	isBalanceSufficient: boolean;
	smartRouteWarning: boolean;
	isSelfSend: boolean;
	isAmountError: boolean;
	canSwap: boolean;

	/** Combined warning state for the Arb ETH low-balance banner in footer. */
	needsArbEthWarning: boolean;
}

// ---------------------------------------------------------------------------
// Rune
// ---------------------------------------------------------------------------

export function useSwapBalanceCheck(opts: UseSwapBalanceCheckOptions): UseSwapBalanceCheck {
	// ------- Arb ETH balance check state -------
	let arbEthBalance = $state<string | null>(null);
	let arbEthCheckDone = $state(false);

	// ------- Derived -------

	/** Whether the current route requires Arbitrum ETH for gas (boltz+lifi). */
	const needsArbEth = $derived.by(() => {
		// Local SmartRoute (SwapFallback retry path)
		const localRoute = opts.getSmartRoute();
		if (localRoute?.provider === 'boltz+lifi' && localRoute?.toChain === 'arbitrum') {
			return true;
		}
		// Engine's recommended Route — check hops for boltz+lifi multi-hop to Arbitrum
		const rec = opts.getEngineResult().recommended;
		if (rec && rec.hops.length > 1) {
			const hasBoltz = rec.hops.some((h) => h.service === 'boltz');
			const hasLifiOrSymbiosis = rec.hops.some(
				(h) => h.service === 'lifi' || h.service === 'symbiosis'
			);
			const targetsArbitrum = rec.hops[rec.hops.length - 1]?.toChain === 'arbitrum';
			if (hasBoltz && hasLifiOrSymbiosis && targetsArbitrum) return true;
		}
		return false;
	});

	/** Whether the entered amount is below the minimum swap amount. */
	const outputBelowMinimum = $derived(
		opts.getMinSwapSats() > 0 &&
			opts.getAmountSats() > 0 &&
			opts.getAmountSats() < opts.getMinSwapSats()
	);

	/** Whether the source wallet balance is sufficient for the entered amount. */
	const isBalanceSufficient = $derived(!opts.getIsInsufficientBalance());

	/** Whether the estimated output is zero or negative (route warning). */
	const smartRouteWarning = $derived(
		opts.getAmountInTokenUnits() > 0 &&
			!opts.getRouteLoading() &&
			opts.getEstimatedOutput() !== '' &&
			parseFloat(opts.getEstimatedOutput()) <= 0
	);

	/** Whether source and dest wallets are the same for a same-asset transfer. */
	const isSelfSend = $derived(
		opts.getSourceWallet() === opts.getDestWallet() &&
			SOURCE_TO_SAME_DEST[opts.getSourceType()] === opts.getDestType()
	);

	/** Combined error state for the amount input (below minimum or insufficient). */
	const isAmountError = $derived(outputBelowMinimum || opts.getIsInsufficientBalance());

	/** Whether the swap can proceed (all validation gates pass). */
	const canSwap = $derived(
		opts.getIsValidAmount() &&
			!outputBelowMinimum &&
			(opts.getEngineResult().recommended !== null || opts.getEngineResult().routes.length > 0) &&
			opts.getIsFormPhase() &&
			opts.getIsOnline() &&
			opts.getRelayAvailable() &&
			opts.getGasDataAvailable() &&
			!isSelfSend &&
			!(
				opts.getAmountInTokenUnits() > 0 &&
				opts.getEstimatedOutput() !== '' &&
				parseFloat(opts.getEstimatedOutput()) <= 0
			)
	);

	/** Combined warning for the Arb ETH low-balance banner in confirm footer. */
	const needsArbEthWarning = $derived(
		needsArbEth &&
			arbEthCheckDone &&
			arbEthBalance !== 'unknown' &&
			parseFloat(arbEthBalance ?? '0') < 0.0001
	);

	// ------- Functions -------

	/**
	 * Check Arbitrum ETH balance for gas. Must be called when entering confirm
	 * phase if the route requires Arb gas.
	 */
	async function checkArbEthBalance(): Promise<void> {
		try {
			// For connected wallets the EVM address is the same across chains.
			// For the built-in wallet we must use the Arbitrum address, NOT the RSK address,
			// because the built-in wallet derives separate addresses per chain.
			let addr = '';
			if (opts.getSourceWallet() !== 'builtin') {
				// Connected wallet — address is the same on all EVM chains
				addr = opts.getSourceAddr() || '';
			} else {
				// Built-in wallet — use the Arbitrum address from the wallet store
				const store = get(walletStore);
				addr = store.arb?.address || store.rsk?.address || '';
			}
			arbEthBalance = await fetchArbEthBalance(addr);
		} catch (e) {
			arbEthBalance = 'unknown';
			Sentry.addBreadcrumb({
				category: 'wallet.swap',
				message: 'ARB ETH balance check failed',
				level: 'warning',
				data: { error: e instanceof Error ? e.message : String(e) }
			});
		}
		arbEthCheckDone = true;
	}

	return {
		get arbEthBalance() {
			return arbEthBalance;
		},
		get arbEthCheckDone() {
			return arbEthCheckDone;
		},
		get needsArbEth() {
			return needsArbEth;
		},
		get outputBelowMinimum() {
			return outputBelowMinimum;
		},
		get isBalanceSufficient() {
			return isBalanceSufficient;
		},
		get smartRouteWarning() {
			return smartRouteWarning;
		},
		get isSelfSend() {
			return isSelfSend;
		},
		get isAmountError() {
			return isAmountError;
		},
		get canSwap() {
			return canSwap;
		},
		get needsArbEthWarning() {
			return needsArbEthWarning;
		},
		checkArbEthBalance
	};
}
