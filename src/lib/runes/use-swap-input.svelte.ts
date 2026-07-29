/**
 * use-swap-input.svelte.ts
 *
 * Svelte 5 rune extracting SwapForm.svelte's amount/USD input management:
 * - BTC/USD input mode toggle with bidirectional conversion
 * - Display amount syncing (USD ↔ native sats/tokens)
 * - Live fee/gas price fetching and caching
 * - isBtcSource derived for template branching
 *
 * Rune uses getter-based DI for testability — no direct store imports.
 * No i18n, no Sentry, no haptics — those stay at the call site.
 */

import { createDebug } from '$lib/utils/debug';
import { fetchLiveFees } from '$lib/utils/swap-gas';
import type { SourceWallet } from '$lib/services/route-resolver';
import type { DestType } from '$lib/runes/use-swap-options.svelte';

const d = createDebug('swap-input');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSwapInputOptions {
	getSourceType: () => SourceWallet;
	getIsOnline: () => boolean;
	/** Current amount string from swap calculator (sats-int or usd-decimal). */
	getAmount: () => string;
	/** Parsed amount in token units from swap calculator. */
	getAmountInTokenUnits: () => number;
	/** Whether the swap drawer is open. */
	getIsOpen: () => boolean;
	/** Default destination type (e.g. from loan flow). */
	getDefaultDestType: () => DestType | undefined;
	/** Set swap calculator amount (bidirectional sync writes back). */
	setAmount: (v: string) => void;
	/** Set dest type when default is applied on drawer open. */
	setDestType: (v: DestType) => void;
}

export interface UseSwapInput {
	// Price state (reactive, fed to routes + template)
	btcUsdPrice: number;
	ethUsdPrice: number;
	rskGasPriceWei: bigint;
	arbGasPriceWei: bigint;

	/** True when the last gas/price refresh failed. Cleared on next success. */
	gasError: boolean;

	// Input mode (writable — caller resets on source/dest change)
	btcUsdInputMode: boolean;
	displayInputAmount: string;

	// Derived
	isBtcSource: boolean;

	// Actions
	handleAmountChange(v: string): void;
	handleBtcUsdModeChange(isUsd: boolean): void;
	refreshLiveFees(): Promise<void>;
	/** Reset input mode to defaults (called on source/dest change or form reset). */
	resetInputMode(): void;
}

// ---------------------------------------------------------------------------
// Rune
// ---------------------------------------------------------------------------

export function useSwapInput(opts: UseSwapInputOptions): UseSwapInput {
	const getSourceType = opts.getSourceType;
	const getIsOnline = opts.getIsOnline;
	const getAmount = opts.getAmount;
	const getAmountInTokenUnits = opts.getAmountInTokenUnits;
	const getIsOpen = opts.getIsOpen;
	const getDefaultDestType = opts.getDefaultDestType;

	// ------- Price state -------
	let btcUsdPrice = $state(0);
	let ethUsdPrice = $state(0);
	let rskGasPriceWei = $state(0n);
	let arbGasPriceWei = $state(0n);
	let gasError = $state(false);

	// ------- Fee cache -------
	let _lastFeeRefreshTime = 0;
	const FEE_CACHE_MS = 30_000;

	async function refreshLiveFees(): Promise<void> {
		if (!getIsOnline()) {
			d.log('refreshLiveFees: skipped (offline)');
			return;
		}
		if (Date.now() - _lastFeeRefreshTime < FEE_CACHE_MS) {
			d.log(
				'refreshLiveFees: skipped (cached, age=%ds)',
				Math.round((Date.now() - _lastFeeRefreshTime) / 1000)
			);
			return;
		}
		d.log('refreshLiveFees: fetching gas prices + BTC/ETH rates');
		try {
			const fees = await fetchLiveFees();

			if (fees.rskGasPriceWei !== null) rskGasPriceWei = fees.rskGasPriceWei;
			if (fees.arbGasPriceWei !== null) arbGasPriceWei = fees.arbGasPriceWei;
			if (fees.btcUsdPrice !== null) btcUsdPrice = fees.btcUsdPrice;
			if (fees.ethUsdPrice !== null) ethUsdPrice = fees.ethUsdPrice;
			gasError = false;

			d.log(
				'refreshLiveFees done: rskGas=%d gwei arbGas=%d gwei btc=$%s eth=$%s',
				Number(rskGasPriceWei) / 1e9,
				Number(arbGasPriceWei) / 1e9,
				btcUsdPrice || '?',
				ethUsdPrice || '?'
			);
		} catch (e) {
			d.warn('refreshLiveFees failed: %s', e instanceof Error ? e.message : String(e));
			gasError = true;
		}
		_lastFeeRefreshTime = Date.now();
	}

	// ------- Input mode state -------
	let btcUsdInputMode = $state(true);
	let displayInputAmount = $state('');
	let syncingFromInput = false;

	// ------- Derived -------
	const isBtcSource = $derived(
		getSourceType() === 'rbtc' ||
			getSourceType() === 'wbtc-arb' ||
			getSourceType() === 'tbtc-arb' ||
			getSourceType() === 'btc-onchain'
	);

	// ------- Effects -------

	// Sync display amount when amount changes (for USD mode on BTC sources)
	$effect(() => {
		const nativeStr = getAmount();
		if (isBtcSource && btcUsdInputMode) {
			if (syncingFromInput) {
				syncingFromInput = false;
				return;
			}
			const frac = getAmountInTokenUnits();
			const usd = frac * btcUsdPrice;
			displayInputAmount = usd > 0 ? usd.toFixed(2) : '';
		} else {
			displayInputAmount = nativeStr;
		}
	});

	// Reset USD mode when source changes away from BTC-denominated assets
	$effect(() => {
		if (!isBtcSource && btcUsdInputMode) {
			btcUsdInputMode = false;
			syncingFromInput = false;
		}
	});

	// Fee refresh timer: fires when drawer opens
	let _feeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!getIsOpen()) return;
		// Apply default destination type when drawer opens (e.g. wBTC from loan flow)
		const defaultDest = getDefaultDestType();
		if (defaultDest) {
			opts.setDestType(defaultDest);
		}
		_feeRefreshTimer = setTimeout(() => refreshLiveFees(), 300);
		return () => {
			if (_feeRefreshTimer) clearTimeout(_feeRefreshTimer);
		};
	});

	// ------- Handlers -------

	function handleAmountChange(v: string): void {
		if (isBtcSource && btcUsdInputMode) {
			// USD entered for BTC source → convert to native sats str for calc
			const usdNum = parseFloat(v || '0');
			if (usdNum > 0 && btcUsdPrice > 0) {
				const frac = usdNum / btcUsdPrice;
				opts.setAmount(Math.round(frac * 100_000_000).toString());
			} else {
				opts.setAmount('');
			}
			syncingFromInput = true;
			displayInputAmount = v;
		} else if (getSourceType() === 'usdt0-arb') {
			// Enforce 2 decimals + floor dust for USDT (formatting only, no clamp)
			const n = parseFloat(v || '0');
			const clean = n > 0 ? (Math.floor(n * 100) / 100).toFixed(2) : '';
			opts.setAmount(clean);
			displayInputAmount = clean;
		} else {
			opts.setAmount(v);
			displayInputAmount = v;
		}
	}

	function handleBtcUsdModeChange(isUsd: boolean): void {
		const wasUsd = btcUsdInputMode;
		btcUsdInputMode = isUsd;
		syncingFromInput = false;
		if (isUsd && !wasUsd) {
			// native → USD display (effect will update displayInputAmount)
		} else if (!isUsd && wasUsd) {
			// USD → native
			const usdNum = parseFloat(displayInputAmount || '0');
			if (usdNum > 0 && btcUsdPrice > 0) {
				const frac = usdNum / btcUsdPrice;
				opts.setAmount(Math.round(frac * 100_000_000).toString());
			} else {
				opts.setAmount('');
			}
		}
	}

	function resetInputMode(): void {
		btcUsdInputMode = true;
		displayInputAmount = '';
		syncingFromInput = false;
	}

	return {
		get btcUsdPrice() {
			return btcUsdPrice;
		},
		get ethUsdPrice() {
			return ethUsdPrice;
		},
		get rskGasPriceWei() {
			return rskGasPriceWei;
		},
		get arbGasPriceWei() {
			return arbGasPriceWei;
		},
		get btcUsdInputMode() {
			return btcUsdInputMode;
		},
		set btcUsdInputMode(v: boolean) {
			btcUsdInputMode = v;
		},
		get displayInputAmount() {
			return displayInputAmount;
		},
		set displayInputAmount(v: string) {
			displayInputAmount = v;
		},
		get isBtcSource() {
			return isBtcSource;
		},
		get gasError() {
			return gasError;
		},
		handleAmountChange,
		handleBtcUsdModeChange,
		refreshLiveFees,
		resetInputMode
	};
}
