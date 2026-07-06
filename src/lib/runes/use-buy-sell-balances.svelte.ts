/**
 * use-buy-sell-balances.svelte.ts
 *
 * Svelte 5 rune extracting BuySellForm.svelte's balance calculations:
 * - Per-asset balance deriveds (rbtc, usdt, wbtc) from builtin or connected wallet
 * - Display formatting with USD equivalents
 * - Asset options list for SwapPartySelector
 * - SwapPartySelector helper functions (walletBtcSatsFor, walletUsdt0For)
 * - Max amount computation for sell tab (setMaxAmount + applyPercent)
 *
 * Rune uses getter-based DI for testability — no direct store imports.
 * No i18n, no Sentry, no haptics — those stay at the call site.
 */

import { formatSats } from '$lib/stores/wallet.store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CryptoAsset = 'rbtc' | 'usdt0-arb' | 'wbtc-arb' | 'btc-onchain';

export interface WalletBalances {
	sats: number;
	usdt: number;
}

export interface ConnectedWalletLike {
	id: string;
	balances?: {
		rbtc?: { raw?: number | string };
		wbtc?: { raw?: number | string };
		btc?: { raw?: number | string };
		usdt?: { raw?: number | string };
		'usdt0-arb'?: { raw?: number | string };
		'tbtc-arb'?: { raw?: number | string };
	};
}

export interface ArbData {
	address?: string;
	formattedUsdt0Balance?: string;
	formattedWbtcBalance?: string;
}

export interface UseBuySellBalancesOptions {
	getSource: () => string;
	getSelectedCrypto: () => CryptoAsset;
	getActiveTab: () => 'buy' | 'sell';
	getShowSats: () => boolean;
	getTotalBalances: () => WalletBalances;
	getArbData: () => ArbData;
	getConnectedWallets: () => ConnectedWalletLike[];
	getBtcPrice: () => number;
	getUsdFormatter: () => Intl.NumberFormat;
}

export interface UseBuySellBalances {
	// Balance values (reactive)
	rbtcBalance: string;
	usdtBalance: string;
	wbtcBalance: string;
	rbtcBalanceDisplay: string;
	usdtBalanceDisplay: string;
	wbtcBalanceDisplay: string;

	// Derived flags
	isConnectedSource: boolean;
	isBtcDenominated: boolean;
	isBtcAsset: boolean;
	selectedSourceHasBtc: boolean;
	sellMaxDisabled: boolean;

	// Asset options for SwapPartySelector (caller builds with $t() labels)

	// SwapPartySelector helpers
	walletBtcSatsFor(walletId: string): number;
	walletUsdt0For(walletId: string): number;

	// Max amount computation
	computeMaxAmount(): string;
	computePercentAmount(pct: number): string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Gas reserve in sats for native token sells (rBTC). */
const SELL_GAS_RESERVE_SATS = 100_000;

// ---------------------------------------------------------------------------
// Rune
// ---------------------------------------------------------------------------

export function useBuySellBalances(opts: UseBuySellBalancesOptions): UseBuySellBalances {
	const getSource = opts.getSource;
	const getSelectedCrypto = opts.getSelectedCrypto;
	const getActiveTab = opts.getActiveTab;
	const getShowSats = opts.getShowSats;
	const getTotalBalances = opts.getTotalBalances;
	const getArbData = opts.getArbData;
	const getConnectedWallets = opts.getConnectedWallets;
	const getBtcPrice = opts.getBtcPrice;
	const getUsdFormatter = opts.getUsdFormatter;

	// ------- Derived: source type -------
	const isConnectedSource = $derived(getSource() !== 'builtin');

	const isBtcDenominated = $derived.by(() => {
		const crypto = getSelectedCrypto();
		return crypto === 'rbtc' || crypto === 'wbtc-arb' || crypto === 'btc-onchain';
	});

	const isBtcAsset = $derived(isBtcDenominated);

	const selectedSourceHasBtc = $derived.by(() => {
		if (!isConnectedSource) return false;
		const w = getConnectedWallets().find((w) => w.id === getSource());
		return !!w?.balances?.btc?.raw && Number(w.balances.btc.raw) > 0;
	});

	// ------- Balance deriveds -------
	const rbtcBalance = $derived.by(() => {
		if (isConnectedSource) {
			const w = getConnectedWallets().find((w) => w.id === getSource());
			const raw = Number(w?.balances?.rbtc?.raw ?? 0);
			return (isNaN(raw) ? 0 : raw / 100_000_000).toFixed(6);
		}
		const sats = getTotalBalances().sats ?? 0;
		return (sats / 100_000_000).toFixed(6);
	});

	const usdtBalance = $derived.by(() => {
		if (isConnectedSource) {
			const w = getConnectedWallets().find((w) => w.id === getSource());
			const raw = Number(w?.balances?.usdt?.raw ?? 0);
			return (isNaN(raw) ? 0 : raw / 1e18).toFixed(2);
		}
		return getArbData().formattedUsdt0Balance || '0.00';
	});

	const wbtcBalance = $derived.by(() => {
		if (isConnectedSource) {
			const w = getConnectedWallets().find((w) => w.id === getSource());
			const raw = Number(w?.balances?.wbtc?.raw ?? 0);
			return (isNaN(raw) ? 0 : raw / 100_000_000).toFixed(6);
		}
		return getArbData().formattedWbtcBalance || '0.000000';
	});

	const rbtcBalanceDisplay = $derived.by(() => {
		const sats = Math.round(parseFloat(rbtcBalance) * 100_000_000);
		if (sats <= 0) return '0 Sats';
		const usd = (sats / 100_000_000) * getBtcPrice();
		const usdFormatter = getUsdFormatter();
		const usdStr = usd >= 1 ? usdFormatter.format(usd) : `$${usd.toFixed(usd >= 0.01 ? 2 : 4)}`;
		return `${formatSats(sats)} (${usdStr})`;
	});

	const usdtBalanceDisplay = $derived.by(() => {
		const num = parseFloat(usdtBalance);
		if (num === 0) return '$0.00';
		return getUsdFormatter().format(num);
	});

	const wbtcBalanceDisplay = $derived.by(() => {
		const sats = Math.round(parseFloat(wbtcBalance) * 100_000_000);
		if (sats <= 0) return '0 Sats';
		const usd = (sats / 100_000_000) * getBtcPrice();
		const usdFormatter = getUsdFormatter();
		const usdStr = usd >= 1 ? usdFormatter.format(usd) : `$${usd.toFixed(usd >= 0.01 ? 2 : 4)}`;
		return `${formatSats(sats)} (${usdStr})`;
	});

	const sellMaxDisabled = $derived.by(() => {
		if (getActiveTab() !== 'sell') return false;
		const crypto = getSelectedCrypto();
		if (crypto === 'rbtc') return parseFloat(rbtcBalance) <= 0;
		if (crypto === 'wbtc-arb') return parseFloat(wbtcBalance) <= 0;
		return parseFloat(usdtBalance) <= 0;
	});

	// ------- Note: assetOptions built in component (needs $t() for i18n) -------

	// ------- SwapPartySelector helpers -------
	function walletBtcSatsFor(walletId: string): number {
		if (walletId === 'builtin') return getTotalBalances().sats;
		const w = getConnectedWallets().find((cw) => cw.id === walletId);
		if (!w) return 0;
		return Number(w.balances?.rbtc?.raw ?? 0) + Number(w.balances?.btc?.raw ?? 0);
	}

	function walletUsdt0For(walletId: string): number {
		if (walletId === 'builtin') return getTotalBalances().usdt;
		const w = getConnectedWallets().find((cw) => cw.id === walletId);
		if (!w) return 0;
		return Number(w.balances?.usdt?.raw ?? 0) / 1e18;
	}

	// ------- Max amount computation -------
	function computeMaxAmount(): string {
		const source = getSource();
		const crypto = getSelectedCrypto();
		const activeTab = getActiveTab();
		const showSats = getShowSats();
		const btcPrice = getBtcPrice();
		const connectedWallets = getConnectedWallets();
		const totalBalances = getTotalBalances();

		let maxVal: string;

		if (source !== 'builtin') {
			const w = connectedWallets.find((w) => w.id === source);
			if (crypto === 'rbtc') {
				const raw = Math.max(0, Number(w?.balances?.rbtc?.raw ?? 0) - SELL_GAS_RESERVE_SATS);
				if (isNaN(raw) || raw <= 0) {
					maxVal = '0';
				} else if (activeTab === 'sell' && showSats) {
					maxVal = String(Math.floor(raw));
				} else if (activeTab === 'sell') {
					maxVal = ((raw / 100_000_000) * btcPrice).toFixed(2);
				} else {
					maxVal = String(Math.floor(raw / 100_000_000));
				}
			} else if (crypto === 'wbtc-arb') {
				const raw = Number(w?.balances?.wbtc?.raw ?? 0);
				if (isNaN(raw) || raw === 0) {
					maxVal = '0';
				} else if (activeTab === 'sell' && showSats) {
					maxVal = String(Math.floor(raw));
				} else if (activeTab === 'sell') {
					maxVal = ((raw / 100_000_000) * btcPrice).toFixed(2);
				} else {
					maxVal = String(Math.floor(raw / 100_000_000));
				}
			} else if (crypto === 'btc-onchain') {
				const raw = Number(w?.balances?.btc?.raw ?? 0);
				maxVal = String(isNaN(raw) ? 0 : Math.floor(raw / 100_000_000));
			} else {
				const raw = Number(w?.balances?.usdt?.raw ?? 0);
				maxVal = (isNaN(raw) ? 0 : raw / 1e18).toString();
			}
		} else {
			if (activeTab === 'sell') {
				if (crypto === 'rbtc') {
					const sats = Math.max(0, totalBalances.sats - SELL_GAS_RESERVE_SATS);
					maxVal = showSats ? String(sats) : ((sats / 100_000_000) * btcPrice).toFixed(2);
				} else if (crypto === 'wbtc-arb') {
					const sats = Math.round(parseFloat(wbtcBalance) * 100_000_000);
					maxVal = showSats ? String(sats) : ((sats / 100_000_000) * btcPrice).toFixed(2);
				} else {
					maxVal = usdtBalance;
				}
			} else {
				if (crypto === 'rbtc') {
					maxVal = parseFloat(rbtcBalance).toString();
				} else if (crypto === 'wbtc-arb') {
					maxVal = parseFloat(wbtcBalance).toString();
				} else {
					maxVal = usdtBalance;
				}
			}
		}
		return maxVal;
	}

	function computePercentAmount(pct: number): string {
		const source = getSource();
		const crypto = getSelectedCrypto();
		const activeTab = getActiveTab();
		const showSats = getShowSats();
		const btcPrice = getBtcPrice();
		const connectedWallets = getConnectedWallets();
		const totalBalances = getTotalBalances();

		const w = source !== 'builtin' ? connectedWallets.find((w) => w.id === source) : null;

		let fullBalance: number;
		if (source !== 'builtin' && w) {
			if (crypto === 'rbtc')
				fullBalance = Math.floor(
					Number(w.balances?.rbtc?.raw ?? 0) / (activeTab === 'sell' ? 1 : 100_000_000)
				);
			else if (crypto === 'wbtc-arb')
				fullBalance = Math.floor(
					Number(w.balances?.wbtc?.raw ?? 0) / (activeTab === 'sell' ? 1 : 100_000_000)
				);
			else if (crypto === 'btc-onchain')
				fullBalance = Math.floor(
					Number(w.balances?.btc?.raw ?? 0) / (activeTab === 'sell' ? 1 : 100_000_000)
				);
			else fullBalance = Number(w.balances?.usdt?.raw ?? 0) / 1e18;
		} else {
			if (activeTab === 'sell' && crypto === 'rbtc') {
				fullBalance = totalBalances.sats;
			} else if (activeTab === 'sell' && crypto === 'wbtc-arb') {
				fullBalance = Math.round(parseFloat(wbtcBalance) * 100_000_000);
			} else if (crypto === 'rbtc') {
				fullBalance = parseFloat(rbtcBalance);
			} else if (crypto === 'wbtc-arb') {
				fullBalance = parseFloat(wbtcBalance);
			} else {
				fullBalance = parseFloat(usdtBalance);
			}
		}

		// For native token sells (rBTC), subtract gas reserve
		if (activeTab === 'sell' && crypto === 'rbtc' && fullBalance > SELL_GAS_RESERVE_SATS) {
			fullBalance -= SELL_GAS_RESERVE_SATS;
		}

		const val = (fullBalance * pct) / 100;
		const isBtc = crypto === 'rbtc' || crypto === 'btc-onchain' || crypto === 'wbtc-arb';
		const precision = isBtc ? (activeTab === 'sell' ? 0 : 6) : 2;

		// For sell tab BTC assets in USD mode: convert sats → USD
		let displayVal = val;
		if (activeTab === 'sell' && isBtc && !showSats && btcPrice > 0) {
			displayVal = (val / 100_000_000) * btcPrice;
		}

		return displayVal.toFixed(displayVal >= 1 ? 2 : precision);
	}

	// ------- Return -------
	return {
		get rbtcBalance() {
			return rbtcBalance;
		},
		get usdtBalance() {
			return usdtBalance;
		},
		get wbtcBalance() {
			return wbtcBalance;
		},
		get rbtcBalanceDisplay() {
			return rbtcBalanceDisplay;
		},
		get usdtBalanceDisplay() {
			return usdtBalanceDisplay;
		},
		get wbtcBalanceDisplay() {
			return wbtcBalanceDisplay;
		},
		get isConnectedSource() {
			return isConnectedSource;
		},
		get isBtcDenominated() {
			return isBtcDenominated;
		},
		get isBtcAsset() {
			return isBtcAsset;
		},
		get selectedSourceHasBtc() {
			return selectedSourceHasBtc;
		},
		get sellMaxDisabled() {
			return sellMaxDisabled;
		},

		walletBtcSatsFor,
		walletUsdt0For,
		computeMaxAmount,
		computePercentAmount
	};
}
