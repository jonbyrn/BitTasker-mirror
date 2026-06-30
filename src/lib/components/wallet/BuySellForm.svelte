<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import Drawer from '$lib/components/Drawer.svelte';
	import { walletStore, formatSats } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import type { AssetOption } from './AssetSelector.svelte';
	import SwapPartySelector from './SwapPartySelector.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { appStore } from '$lib/stores/app.store';
	import { reconnectPersistedWallets } from '$lib/services/external-wallet/reconnect';
	import { changellyFiatService, sortOffersByBestRate } from '$lib/services/fiat-ramp.service';
	import type {
		ChangellyOfferSuccess,
		ChangellyCountry,
		ChangellyPaymentMethodOffer,
		ChangellyTransactionStatus
	} from '$lib/services/fiat-ramp.service';
	import { FiatSwapOrchestrator } from '$lib/services/fiat-swap-orchestrator.service';
	import type {
		FiatFlowState,
		FiatFlowStage,
		FiatBuyAsset
	} from '$lib/services/fiat-swap-orchestrator.service';
	import { Browser } from '@capacitor/browser';
	import { Capacitor } from '@capacitor/core';
	import * as Sentry from '@sentry/sveltekit';
	import { OffRampOrchestrator } from '$lib/services/off-ramp-orchestrator.service';
	import type {
		OffRampQuote,
		OffRampFlowState,
		OffRampAsset
	} from '$lib/services/off-ramp-orchestrator.service';
	import IconClose from '~icons/mdi/close';

	import { createDebug } from '$lib/utils/debug';
	const debug = createDebug('buy-sell-form');

	let { isOpen, onClose, defaultCrypto } = $props<{
		isOpen: boolean;
		onClose: () => void;
		defaultCrypto?: 'rbtc' | 'usdt0-arb' | 'wbtc-arb' | 'btc-onchain';
	}>();

	// -----------------------------------------------------------------------
	// Locale-aware formatter
	// -----------------------------------------------------------------------
	const usdFormatter = $derived(
		new Intl.NumberFormat($locale as string, {
			style: 'currency',
			currency: 'USD'
		})
	);

	// -----------------------------------------------------------------------
	// Wallet reconnect
	// -----------------------------------------------------------------------
	reconnectPersistedWallets();

	// -----------------------------------------------------------------------
	// Tab & crypto selection
	// -----------------------------------------------------------------------
	let activeTab = $state<'buy' | 'sell'>('buy');
	let selectedCrypto = $state<'rbtc' | 'usdt0-arb' | 'wbtc-arb' | 'btc-onchain'>('rbtc');
	let amount = $state<string>('');
	let isLoading = $state(false);
	let sellFlowActive = $state(false);

	// Off-ramp bridge-and-send orchestrator
	const offRampOrchestrator = new OffRampOrchestrator();
	let offRampFlow = $state<OffRampFlowState | null>(offRampOrchestrator.getActiveFlow());
	let offRampQuote = $state<OffRampQuote | null>(null);
	let depositAddressInput = $state('');
	let depositAddressError = $state('');
	let offRampLoading = $state(false);

	// -----------------------------------------------------------------------
	// Wallet source
	// -----------------------------------------------------------------------
	let source = $state('builtin');
	let sourceInitialized = $state(false);

	// -----------------------------------------------------------------------
	// Country & state
	// -----------------------------------------------------------------------
	let selectedCountry = $state('SV'); // El Salvador — Bitcoin-friendly default
	let selectedState = $state('');
	let countries = $state<ChangellyCountry[]>([]);
	let countriesLoading = $state(false);

	// -----------------------------------------------------------------------
	// Offer state
	// -----------------------------------------------------------------------
	let offers = $state<ChangellyOfferSuccess[]>([]);
	let selectedOffer = $state<ChangellyOfferSuccess | null>(null);
	let selectedPaymentMethod = $state<ChangellyPaymentMethodOffer | null>(null);
	let quoteLoading = $state(false);
	let quoteError = $state(false);
	let quoteAbort: AbortController | null = null;

	// Supported crypto tickers from Changelly fiat API (pre-fetched)
	let supportedCryptoTickers = $state<Set<string> | null>(null);
	let supportedCryptoError = $state<string | null>(null);

	// Payment method filter
	let activePaymentFilter = $state<string | null>(null);
	let providerExpanded = $state(false);

	// All unique payment methods across all offers
	let allPaymentMethods = $derived.by(() => {
		const seen = new SvelteMap<string, { method: string; methodName: string }>();
		for (const offer of offers) {
			for (const pm of offer.paymentMethodOffer) {
				if (!seen.has(pm.method)) {
					seen.set(pm.method, { method: pm.method, methodName: pm.methodName });
				}
			}
		}
		return [...seen.values()];
	});

	// Offers filtered by active payment method
	let filteredOffers = $derived.by(() => {
		if (!activePaymentFilter) return offers;
		return offers.filter((o) =>
			o.paymentMethodOffer.some((pm) => pm.method === activePaymentFilter)
		);
	});

	// Provider name formatting (proper case)
	function formatProviderName(code: string): string {
		const names: Record<string, string> = {
			moonpay: 'Moonpay',
			banxa: 'Banxa',
			transak: 'Transak',
			wert: 'Wert'
		};
		return names[code] || code.charAt(0).toUpperCase() + code.slice(1);
	}

	// Convert BTC amount string to sats
	function btcToSats(btcStr: string): number {
		return Math.round(parseFloat(btcStr) * 100_000_000);
	}

	// Format sats with commas
	function formatSatsAmount(offer: ChangellyOfferSuccess): string {
		return btcToSats(offer.amountExpectedTo).toLocaleString();
	}

	// Convert sats to USD using current BTC price
	function satsToUsd(sats: number): string {
		const price = btcPrice.price;
		return ((sats / 100_000_000) * price).toFixed(2);
	}

	// Format USD equivalent from offer
	function formatUsdFromSats(offer: ChangellyOfferSuccess): string {
		return satsToUsd(btcToSats(offer.amountExpectedTo));
	}

	// Calculate fee as difference between input USD and received value
	// For BTC assets: input USD - (sats × BTC price)
	// For stablecoins (USDT0): input USD - received amount (1:1 USD)
	function calculateFee(offer: ChangellyOfferSuccess): string {
		const inputUsd = parseFloat(amount) || 0;
		let receivedUsd: number;
		if (isBtcAsset) {
			receivedUsd = parseFloat(formatUsdFromSats(offer));
		} else {
			// Stablecoin: amountExpectedTo is already in USD terms
			receivedUsd = parseFloat(offer.amountExpectedTo) || 0;
		}
		const fee = Math.max(0, inputUsd - receivedUsd);
		return fee.toFixed(2);
	}

	// Is this the lowest-fee provider?
	function isLowestFee(offer: ChangellyOfferSuccess): boolean {
		if (filteredOffers.length <= 1) return true;
		const fees = filteredOffers.map((o) => parseFloat(calculateFee(o)));
		const minFee = Math.min(...fees);
		return parseFloat(calculateFee(offer)) <= minFee;
	}

	// -----------------------------------------------------------------------
	// Fiat swap orchestrator (manages Changelly order → monitoring → auto-swap)
	// -----------------------------------------------------------------------
	const orchestrator = new FiatSwapOrchestrator();
	let flowState = $state<FiatFlowState | null>(orchestrator.getActiveFlow());

	// Subscribe to orchestrator updates
	$effect(() => {
		const unsub = orchestrator.onStageChange((state) => {
			flowState = { ...state };
		});
		return unsub;
	});

	// Subscribe to off-ramp orchestrator updates
	$effect(() => {
		const unsub = offRampOrchestrator.onStageChange((state) => {
			offRampFlow = { ...state };
		});
		return unsub;
	});

	// Auto-focus deposit address input when stage transitions
	$effect(() => {
		if (offRampStage === 'awaiting_deposit_address') {
			tick().then(() => {
				document.getElementById('deposit-addr-input')?.focus();
			});
		}
	});

	// -----------------------------------------------------------------------
	// Percent slider (sell only)
	// -----------------------------------------------------------------------
	let swapPercent = $state(0);

	// Whether the selected crypto is a BTC-type asset (show sats + USD equiv)
	let isBtcAsset = $derived(
		selectedCrypto === 'rbtc' || selectedCrypto === 'wbtc-arb' || selectedCrypto === 'btc-onchain'
	);

	// Whether the selected asset uses a multi-hop flow (buy WBTC, swap to rBTC)
	let isMultiHop = $derived(selectedCrypto === 'rbtc');

	/** All sell assets bridge to USDT-BSC then off-ramp via MoonPay. */
	let needsBridgeAndSend = $derived(activeTab === 'sell');

	let offRampStage = $derived(offRampFlow?.stage ?? 'idle');

	let sellButtonDisabled = $derived.by(() => {
		if (needsBridgeAndSend) {
			switch (offRampStage) {
				case 'quote_ready':
				case 'idle':
					return !offRampQuote || offRampLoading;
				case 'awaiting_deposit_address':
					return !depositAddressInput.trim() || offRampLoading;
				default:
					return true;
			}
		}
		return isLoading || !amount || !selectedOffer || !walletAddress;
	});

	// Whether an in-progress buy flow is active (replaces amount input with status row)
	let isFlowActive = $derived(
		activeTab === 'buy' &&
			flowState !== null &&
			flowState.stage !== 'idle' &&
			flowState.stage !== 'complete'
	);

	// -----------------------------------------------------------------------
	// -----------------------------------------------------------------------
	// Derived: wallet address (used for both buy and sell)
	// Buy: destination for purchased crypto
	// Sell: source of crypto being sold (provider redirect handles fiat destination)
	// -----------------------------------------------------------------------
	let walletAddress = $derived.by(() => {
		if (source === 'builtin') {
			if (selectedCrypto === 'btc-onchain') return '';
			// rBTC multi-hop: Changelly sends WBTC to Arbitrum, then auto-swaps to rBTC
			if (
				selectedCrypto === 'usdt0-arb' ||
				selectedCrypto === 'wbtc-arb' ||
				selectedCrypto === 'rbtc'
			) {
				return $walletStore.arb?.address ?? '';
			}
			return $walletStore.rsk?.address ?? '';
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === source);
		if (!w) return '';
		if (selectedCrypto === 'btc-onchain') return w.btcAddress ?? '';
		return w.address ?? '';
	});

	// -----------------------------------------------------------------------
	// Derived: is Sats field (sell mode, BTC-denominated assets)
	// -----------------------------------------------------------------------
	let isConnectedSource = $derived(source !== 'builtin');
	/** Whether the selected asset is BTC-type (can show sats). */
	let isBtcDenominated = $derived(
		selectedCrypto === 'rbtc' || selectedCrypto === 'wbtc-arb' || selectedCrypto === 'btc-onchain'
	);
	/** Whether the amount field shows sats (BTC assets only, toggleable). Defaults to false (USD). */
	let showSats = $state(false);

	// -----------------------------------------------------------------------
	// Derived: selected source has BTC on-chain
	// -----------------------------------------------------------------------
	let selectedSourceHasBtc = $derived.by(() => {
		if (!isConnectedSource) return false;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === source);
		return (
			(w?.walletType === 'trezor' ||
				w?.walletType === 'ledger' ||
				w?.walletType === 'walletconnect') &&
			!!w?.btcAddress
		);
	});

	// ===================================================================
	// Default wallet selection
	// ===================================================================
	function defaultWalletId(): string {
		if ($walletStore.totalBalances.sats > 0 || $walletStore.totalBalances.usdt > 0)
			return 'builtin';
		const firstWithBalance = $connectedWalletsStore.wallets.find((w) => {
			const b = w.balances;
			if (!b) return false;
			const sats = Number(b.btc?.raw ?? 0) + Number(b.rbtc?.raw ?? 0);
			const usdt = Number(b['usdt0-arb']?.raw ?? 0);
			return sats > 0 || usdt > 0;
		});
		return firstWithBalance?.id ?? 'builtin';
	}

	$effect(() => {
		// Fiat buy/sell always defaults to built-in wallet.
		// Connected wallets can be selected manually via the SwapPartySelector.
		if (!sourceInitialized) {
			source = 'builtin';
			sourceInitialized = true;
		} else if (
			source !== 'builtin' &&
			!$connectedWalletsStore.wallets.some((w) => w.id === source)
		) {
			source = 'builtin';
		}
	});

	$effect(() => {
		if (selectedCrypto === 'btc-onchain' && !selectedSourceHasBtc) {
			selectedCrypto = 'rbtc';
		}
	});

	// Apply default crypto asset when drawer opens (e.g. wBTC from loan flow)
	$effect(() => {
		if (isOpen && defaultCrypto) {
			selectedCrypto = defaultCrypto;
		}
	});

	// Pre-fetch supported crypto tickers from Changelly fiat API
	$effect(() => {
		if (!isOpen || supportedCryptoTickers) return;
		changellyFiatService
			.getCurrencies({ type: 'crypto' })
			.then((currencies) => {
				supportedCryptoTickers = new Set(currencies.map((c) => c.ticker.toUpperCase()));
			})
			.catch((err) => {
				console.warn('[BuySellForm] Failed to fetch supported crypto currencies:', err);
				supportedCryptoError = 'wallet.buy_sell.supported_crypto_error';
			});
	});

	// ===================================================================
	// Asset options
	// ===================================================================
	let assetOptions = $derived.by<AssetOption[]>(() => {
		const opts: AssetOption[] = [
			{
				id: 'rbtc',
				label: $t('wallet.buy_sell.bitcoin_rbtc'),
				icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
				subLabel: $t('wallet.buy_sell.sub_rbtc'),
				balance: rbtcBalanceDisplay
			},
			{
				id: 'usdt0-arb',
				label: 'USD',
				icon: '/images/chains/Tether-USD.svg',
				subLabel: $t('wallet.buy_sell.sub_usdt0'),
				balance: usdtBalanceDisplay
			},
			{
				id: 'wbtc-arb',
				label: $t('wallet.wbtc_arbitrum'),
				icon: '/images/chains/arbitrum.png',
				subLabel: $t('wallet.buy_sell.sub_wbtc'),
				balance: wbtcBalanceDisplay
			}
		];
		if (selectedSourceHasBtc) {
			opts.push({
				id: 'btc-onchain',
				label: $t('wallet.buy_sell.bitcoin_btc'),
				icon: '/images/chains/Bitcoin.svg',
				subLabel: $t('wallet.buy_sell.sub_btc_onchain'),
				balance: rbtcBalanceDisplay
			});
		}
		return opts;
	});

	// ===================================================================
	// Balance helpers
	// ===================================================================
	function _usdBalanceFor(wallet: { balances?: Record<string, { raw: string }> }): string {
		const cur = wallet.balances;
		if (!cur) return '$0.00';
		const sats = Number(cur.btc?.raw ?? 0) + Number(cur.rbtc?.raw ?? 0);
		const usdt = Number(cur.usdt?.raw ?? 0) / 1e18;
		const usd = (sats / 100_000_000) * btcPrice.price + usdt;
		return usdFormatter.format(usd);
	}

	function _totalBuiltinUsd(): string {
		const sats = $walletStore.totalBalances.sats;
		const usdt = $walletStore.totalBalances.usdt;
		const usd = (sats / 100_000_000) * btcPrice.price + usdt;
		return usdFormatter.format(usd);
	}

	/** BTC sats for a given wallet (for SwapPartySelector) */
	function walletBtcSatsForFn(id: string): number {
		if (id === 'builtin') return $walletStore.totalBalances.sats;
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === id);
		if (!w) return 0;
		return Number(w.balances?.rbtc?.raw ?? 0) + Number(w.balances?.btc?.raw ?? 0);
	}

	/** USDT0 USD for a given wallet (for SwapPartySelector) */
	function walletUsdt0ForFn(id: string): number {
		if (id === 'builtin') return $walletStore.totalBalances.usdt;
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === id);
		if (!w) return 0;
		return Number(w.balances?.usdt?.raw ?? 0) / 1e18;
	}

	let rbtcBalance = $derived.by(() => {
		if (isConnectedSource) {
			const w = $connectedWalletsStore.wallets.find((w) => w.id === source);
			const raw = Number(w?.balances?.rbtc?.raw ?? 0);
			return (isNaN(raw) ? 0 : raw / 100_000_000).toFixed(6);
		}
		return $walletStore.rsk?.formattedBalance || '0.00';
	});

	let usdtBalance = $derived.by(() => {
		if (isConnectedSource) {
			const w = $connectedWalletsStore.wallets.find((w) => w.id === source);
			const raw = Number(w?.balances?.usdt?.raw ?? 0);
			return (isNaN(raw) ? 0 : raw / 1e18).toFixed(2);
		}
		return $walletStore.arb?.formattedUsdt0Balance || '0.00';
	});

	let rbtcBalanceDisplay = $derived.by(() => {
		const sats = Math.round(parseFloat(rbtcBalance) * 100_000_000);
		if (sats <= 0) return '0 Sats';
		const usd = (sats / 100_000_000) * btcPrice.price;
		const usdStr = usd >= 1 ? usdFormatter.format(usd) : `$${usd.toFixed(usd >= 0.01 ? 2 : 4)}`;
		return `${formatSats(sats)} (${usdStr})`;
	});

	let usdtBalanceDisplay = $derived.by(() => {
		const num = parseFloat(usdtBalance);
		if (num === 0) return '$0.00';
		return usdFormatter.format(num);
	});

	let wbtcBalance = $derived.by(() => {
		if (isConnectedSource) {
			const w = $connectedWalletsStore.wallets.find((w) => w.id === source);
			const raw = Number(w?.balances?.wbtc?.raw ?? 0);
			return (isNaN(raw) ? 0 : raw / 100_000_000).toFixed(6);
		}
		return $walletStore.arb?.formattedWbtcBalance || '0.000000';
	});

	let wbtcBalanceDisplay = $derived.by(() => {
		const sats = Math.round(parseFloat(wbtcBalance) * 100_000_000);
		if (sats <= 0) return '0 Sats';
		const usd = (sats / 100_000_000) * btcPrice.price;
		const usdStr = usd >= 1 ? usdFormatter.format(usd) : `$${usd.toFixed(usd >= 0.01 ? 2 : 4)}`;
		return `${formatSats(sats)} (${usdStr})`;
	});

	// ===================================================================
	// Crypto ticker mapping (for Changelly API)
	// ===================================================================
	function cryptoTicker(assetId: string): string {
		switch (assetId) {
			case 'rbtc':
				return 'WBTC'; // Multi-hop: buy WBTC, auto-swap WBTC→tBTC→rBTC
			case 'usdt0-arb':
				return 'USDTARB';
			case 'wbtc-arb':
				return 'WBTC';
			case 'btc-onchain':
				return 'BTC';
			default:
				return 'BTC';
		}
	}

	/** Friendly display name for the selected asset (not Changelly ticker) */
	function friendlyAssetName(assetId: string): string {
		switch (assetId) {
			case 'rbtc':
				return 'rBTC';
			case 'usdt0-arb':
				return 'USDT0 on Arbitrum';
			case 'wbtc-arb':
				return 'wBTC on Arbitrum';
			case 'btc-onchain':
				return 'BTC on-chain';
			default:
				return assetId;
		}
	}

	// ===================================================================
	// Helper: convert to sats
	// ===================================================================
	function _convertToSats(value: string, tokenId: string): string {
		if (!value) return '0';
		const n = parseFloat(value);
		if (tokenId === 'rbtc' || tokenId === 'wbtc-arb')
			return Math.round(n * 100000000).toLocaleString();
		if (tokenId === 'usdt0-arb') return Math.round(n * 100).toLocaleString();
		return value;
	}

	// ===================================================================
	// Helper: format offer error for user display
	// ===================================================================
	function _providerErrorMessage(errorType: string): string {
		switch (errorType) {
			case 'timeout':
				return $t('wallet.buy_sell.provider_error_timeout');
			case 'unavailable':
				return $t('wallet.buy_sell.provider_error_unavailable');
			case 'limits':
				return $t('wallet.buy_sell.provider_error_limits');
			case 'country':
				return $t('wallet.buy_sell.provider_error_country');
			default:
				return errorType;
		}
	}

	// ===================================================================
	// Status display label
	// ===================================================================
	function _statusLabel(status: ChangellyTransactionStatus): string {
		switch (status) {
			case 'created':
				return $t('wallet.buy_sell.status_created');
			case 'pending':
				return $t('wallet.buy_sell.status_pending');
			case 'hold':
				return $t('wallet.buy_sell.status_hold');
			case 'complete':
				return $t('wallet.buy_sell.status_complete');
			case 'failed':
				return $t('wallet.buy_sell.status_failed');
			case 'expired':
				return $t('wallet.buy_sell.status_expired');
			case 'refunded':
				return $t('wallet.buy_sell.status_refunded');
			default:
				return status;
		}
	}

	// ===================================================================
	// Load countries on mount + auto-detect from browser locale
	// ===================================================================
	$effect(() => {
		if (!isOpen) return;
		const ctrl = new AbortController();
		countriesLoading = true;
		changellyFiatService
			.getAvailableCountries()
			.then((result) => {
				if (ctrl.signal.aborted) return;
				countries = result;
				// Auto-detect country from browser locale (best-effort)
				// Skip US — it requires state selection, which is bad UX for a default
				try {
					const lang = navigator.language || ''; // e.g. "en-US", "es-SV"
					const region = lang.split('-')[1]?.toUpperCase() ?? '';
					if (region && region !== 'US' && result.some((c) => c.code === region)) {
						selectedCountry = region;
					}
				} catch {
					// navigator.language unavailable — keep El Salvador default
				}
			})
			.catch(() => {
				// Silently fall back to El Salvador — the select will be empty
				// but the user can still type amounts and see offers once the
				// API call for offers uses the default country.
			})
			.finally(() => {
				if (!ctrl.signal.aborted) {
					countriesLoading = false;
				}
			});
		return () => ctrl.abort();
	});

	// ===================================================================
	// Country state list
	// ===================================================================
	let statesForSelected = $derived(countries.find((c) => c.code === selectedCountry)?.states ?? []);

	// ===================================================================
	// Tab switching
	// ===================================================================
	function switchTab(tab: 'buy' | 'sell') {
		if (tab === activeTab) return;
		cancelOfferFetch();
		activeTab = tab;
		amount = '';
		offers = [];
		selectedOffer = null;
		selectedPaymentMethod = null;
		quoteLoading = false;
		quoteError = false;
		supportedCryptoError = null;
		swapPercent = 0;
		showSats = false;
		sellFlowActive = false;
		offRampOrchestrator.cancel();
		offRampQuote = null;
		offRampFlow = null;
		depositAddressInput = '';
		depositAddressError = '';
		offRampLoading = false;
	}

	function handleCryptoChange(cryptoId: string) {
		cancelOfferFetch();
		selectedCrypto = cryptoId as typeof selectedCrypto;
		offers = [];
		selectedOffer = null;
		selectedPaymentMethod = null;
		quoteLoading = false;
		quoteError = false;
		supportedCryptoError = null;
		swapPercent = 0;
		showSats = false;
		// Reset off-ramp state
		offRampOrchestrator.cancel();
		offRampQuote = null;
		offRampFlow = null;
		depositAddressInput = '';
		depositAddressError = '';
		offRampLoading = false;
		// Refetch offers for the new asset if amount is already entered
		if (amount && parseFloat(amount) > 0) {
			fetchOffers(amount);
		}
	}

	// ===================================================================
	// Max amount & percent slider
	// ===================================================================
	function setMaxAmount() {
		triggerHaptic(ImpactStyle.Light);
		let maxVal: string;
		if (isConnectedSource) {
			const w = $connectedWalletsStore.wallets.find((w) => w.id === source);
			if (selectedCrypto === 'rbtc') {
				const raw = Number(w?.balances?.rbtc?.raw ?? 0);
				if (isNaN(raw) || raw === 0) {
					maxVal = '0';
				} else if (activeTab === 'sell' && showSats) {
					maxVal = String(Math.floor(raw));
				} else if (activeTab === 'sell') {
					maxVal = ((raw / 100_000_000) * btcPrice.price).toFixed(2);
				} else {
					maxVal = String(Math.floor(raw / 100_000_000));
				}
			} else if (selectedCrypto === 'wbtc-arb') {
				const raw = Number(w?.balances?.wbtc?.raw ?? 0);
				if (isNaN(raw) || raw === 0) {
					maxVal = '0';
				} else if (activeTab === 'sell' && showSats) {
					maxVal = String(Math.floor(raw));
				} else if (activeTab === 'sell') {
					maxVal = ((raw / 100_000_000) * btcPrice.price).toFixed(2);
				} else {
					maxVal = String(Math.floor(raw / 100_000_000));
				}
			} else if (selectedCrypto === 'btc-onchain') {
				const raw = Number(w?.balances?.btc?.raw ?? 0);
				maxVal = String(isNaN(raw) ? 0 : Math.floor(raw / 100_000_000));
			} else {
				const raw = Number(w?.balances?.usdt?.raw ?? 0);
				maxVal = (isNaN(raw) ? 0 : raw / 1e18).toString();
			}
		} else {
			if (activeTab === 'sell') {
				if (selectedCrypto === 'rbtc') {
					const sats = $walletStore.totalBalances.sats;
					maxVal = showSats ? String(sats) : ((sats / 100_000_000) * btcPrice.price).toFixed(2);
				} else if (selectedCrypto === 'wbtc-arb') {
					const sats = Math.round(parseFloat(wbtcBalance) * 100_000_000);
					maxVal = showSats ? String(sats) : ((sats / 100_000_000) * btcPrice.price).toFixed(2);
				} else {
					maxVal = usdtBalance;
				}
			} else {
				if (selectedCrypto === 'rbtc') {
					maxVal = parseFloat(rbtcBalance).toString();
				} else if (selectedCrypto === 'wbtc-arb') {
					maxVal = parseFloat(wbtcBalance).toString();
				} else {
					maxVal = usdtBalance;
				}
			}
		}
		amount = maxVal;
		swapPercent = 100;
		fetchOffers(maxVal);
	}

	function applyPercent(pct: number) {
		swapPercent = pct;
		const w = isConnectedSource
			? $connectedWalletsStore.wallets.find((w) => w.id === source)
			: null;
		let fullBalance: number;
		if (isConnectedSource && w) {
			if (selectedCrypto === 'rbtc')
				fullBalance = Math.floor(
					Number(w.balances?.rbtc?.raw ?? 0) / (activeTab === 'sell' ? 1 : 100_000_000)
				);
			else if (selectedCrypto === 'wbtc-arb')
				fullBalance = Math.floor(
					Number(w.balances?.wbtc?.raw ?? 0) / (activeTab === 'sell' ? 1 : 100_000_000)
				);
			else if (selectedCrypto === 'btc-onchain')
				fullBalance = Math.floor(
					Number(w.balances?.btc?.raw ?? 0) / (activeTab === 'sell' ? 1 : 100_000_000)
				);
			else fullBalance = Number(w.balances?.usdt?.raw ?? 0) / 1e18;
		} else {
			if (activeTab === 'sell' && selectedCrypto === 'rbtc') {
				fullBalance = $walletStore.totalBalances.sats;
			} else if (activeTab === 'sell' && selectedCrypto === 'wbtc-arb') {
				fullBalance = Math.round(parseFloat(wbtcBalance) * 100_000_000);
			} else if (selectedCrypto === 'rbtc') {
				fullBalance = parseFloat(rbtcBalance);
			} else if (selectedCrypto === 'wbtc-arb') {
				fullBalance = parseFloat(wbtcBalance);
			} else {
				fullBalance = parseFloat(usdtBalance);
			}
		}
		const val = (fullBalance * pct) / 100;
		const isBtcAsset =
			selectedCrypto === 'rbtc' ||
			selectedCrypto === 'btc-onchain' ||
			selectedCrypto === 'wbtc-arb';
		const precision = isBtcAsset ? (activeTab === 'sell' ? 0 : 6) : 2;
		// For sell tab BTC assets in USD mode: convert sats → USD
		let displayVal = val;
		if (activeTab === 'sell' && isBtcAsset && !showSats && btcPrice.price > 0) {
			displayVal = (val / 100_000_000) * btcPrice.price;
		}
		amount = displayVal.toFixed(displayVal >= 1 ? 2 : precision);
		if (val > 0 && pct > 0) fetchOffers(amount);
		else {
			offers = [];
			selectedOffer = null;
			selectedPaymentMethod = null;
			quoteLoading = false;
		}
	}

	function handleAmountInput(e: Event) {
		const input = e.target;
		if (!(input instanceof HTMLInputElement)) return;
		const raw = input.value;
		amount = raw;
		if (raw && parseFloat(raw) > 0) {
			fetchOffers(raw);
		} else {
			cancelOfferFetch();
			offers = [];
			selectedOffer = null;
			selectedPaymentMethod = null;
			quoteLoading = false;
		}
	}

	function clearAmount() {
		cancelOfferFetch();
		amount = '';
		offers = [];
		selectedOffer = null;
		selectedPaymentMethod = null;
		quoteLoading = false;
		quoteError = false;
		swapPercent = 0;
		offRampQuote = null;
	}

	/** AmountInputSection callback for sell tab amount changes. */
	function onSellAmountChange(val: string) {
		amount = val;
		if (val && parseFloat(val) > 0) {
			fetchOffers(val);
		} else {
			cancelOfferFetch();
			offers = [];
			selectedOffer = null;
			selectedPaymentMethod = null;
			quoteLoading = false;
			offRampQuote = null;
		}
	}

	/** AmountInputSection callback for sell tab MAX button. */
	async function onSellMaxAmount(): Promise<void> {
		setMaxAmount();
	}

	/** AmountInputSection callback for sell tab % slider. */
	function onSellPercentChange(pct: number) {
		applyPercent(pct);
	}

	// ===================================================================
	// Offer fetching with AbortController
	// ===================================================================
	function cancelOfferFetch() {
		quoteAbort?.abort();
		quoteAbort = null;
	}

	async function fetchOffers(rawAmount: string) {
		cancelOfferFetch();
		const ctrl = new AbortController();
		quoteAbort = ctrl;
		quoteLoading = true;
		quoteError = false;
		offers = [];
		selectedOffer = null;
		selectedPaymentMethod = null;

		// Bridge-and-send path: use LI.FI quote instead of Changelly sell offers
		if (needsBridgeAndSend) {
			const sourceAddress = walletAddress;
			if (!sourceAddress) {
				quoteLoading = false;
				return;
			}

			// Convert to asset's native unit for bridge-and-send
			// USDT0-Arb: already in USD (native unit)
			// wBTC-Arb: need BTC, user enters USD or sats
			let assetAmount = rawAmount;
			if (isBtcDenominated && showSats) {
				// Sats → BTC
				const sats = parseInt(rawAmount);
				if (!isNaN(sats) && sats > 0) {
					assetAmount = (sats / 100_000_000).toFixed(8);
				}
			} else if (isBtcDenominated && !showSats && btcPrice.price > 0) {
				// USD → BTC
				const usdValue = parseFloat(rawAmount);
				if (!isNaN(usdValue) && usdValue > 0) {
					assetAmount = (usdValue / btcPrice.price).toFixed(8);
				}
			}

			offRampLoading = true;
			try {
				const quote = await offRampOrchestrator.createQuote({
					asset: selectedCrypto as OffRampAsset,
					amount: assetAmount,
					sourceAddress,
					sourceWalletId: source
				});
				offRampQuote = quote;
			} catch (err) {
				console.error('Off-ramp quote failed:', err);
				quoteError = true;
				offRampQuote = null;
			} finally {
				offRampLoading = false;
				quoteLoading = false;
			}
			return;
		}

		Sentry.addBreadcrumb({
			category: 'wallet',
			message: 'Fetching fiat offers',
			data: { tab: activeTab, crypto: selectedCrypto, amount: rawAmount, country: selectedCountry },
			level: 'info'
		});

		try {
			const currencyFrom = activeTab === 'buy' ? 'USD' : cryptoTicker(selectedCrypto);
			const currencyTo = activeTab === 'buy' ? cryptoTicker(selectedCrypto) : 'USD';

			// Check if the crypto ticker is supported by Changelly fiat API
			const cryptoSide = activeTab === 'buy' ? currencyTo : currencyFrom;
			if (supportedCryptoTickers && !supportedCryptoTickers.has(cryptoSide.toUpperCase())) {
				quoteLoading = false;
				quoteAbort = null;
				supportedCryptoError = 'wallet.buy_sell.unavailable_in_region';
				return;
			}

			// Changelly requires a US state for country=US — wait until selected
			if (selectedCountry === 'US' && !selectedState) {
				quoteLoading = false;
				quoteAbort = null;
				return;
			}

			const result = await (activeTab === 'sell'
				? changellyFiatService.getSellOffers(
						{
							currencyFrom,
							currencyTo,
							amountFrom: rawAmount,
							country: selectedCountry,
							state: selectedState || undefined
						},
						ctrl.signal
					)
				: changellyFiatService.getOffers(
						{
							currencyFrom,
							currencyTo,
							amountFrom: rawAmount,
							country: selectedCountry,
							state: selectedState || undefined
						},
						ctrl.signal
					));

			if (ctrl.signal.aborted) return;

			offers = sortOffersByBestRate(result);
			activePaymentFilter = null;
			if (offers.length > 0) {
				selectedOffer = offers[0];
				if (offers[0].paymentMethodOffer.length > 0) {
					selectedPaymentMethod = offers[0].paymentMethodOffer[0];
				}
			} else if (result.length > 0) {
				// API returned offers but all were errors (e.g. unsupported currency)
				quoteError = true;
			}
		} catch (err) {
			if (ctrl.signal.aborted) return;
			console.error('Failed to fetch offers:', err);
			quoteError = true;
			offers = [];
		} finally {
			if (!ctrl.signal.aborted) {
				quoteLoading = false;
				quoteAbort = null;
			}
		}
	}

	// ===================================================================
	// Offer selection (manual)
	// ===================================================================
	function _selectOffer(offer: ChangellyOfferSuccess) {
		selectedOffer = offer;
		if (offer.paymentMethodOffer.length > 0) {
			selectedPaymentMethod = offer.paymentMethodOffer[0];
		} else {
			selectedPaymentMethod = null;
		}
	}

	// ===================================================================
	// Provider redirect
	// ===================================================================
	async function openRedirectUrl(url: string): Promise<Window | null> {
		const isNative = Capacitor.isNativePlatform();
		if (isNative && Capacitor.isPluginAvailable('Browser')) {
			debug.log('Opening redirect in Capacitor Browser: %s', url.substring(0, 80));
			await Browser.open({ url });
			return null;
		} else {
			debug.log('Opening redirect via window.open: %s', url.substring(0, 80));
			const popup = window.open(url, '_blank', 'noopener,noreferrer');
			debug.log('window.open returned: %s', popup ? 'Window' : 'null');
			return popup;
		}
	}

	// ===================================================================
	// Submit order via orchestrator
	// ===================================================================
	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (!amount || !selectedCountry) return;
		if (!selectedOffer && !needsBridgeAndSend) return;

		// Bridge-and-send sell flow (uses own loading state, separate from buy/Changelly)
		if (needsBridgeAndSend && activeTab === 'sell') {
			offRampLoading = true;
			try {
				if (!walletAddress) {
					appStore.showErrorToast($t('wallet.error.no_connection'));
					return;
				}
				if (
					offRampStage === 'quote_ready' ||
					offRampStage === 'idle' ||
					offRampStage === 'failed'
				) {
					const redirectUrl = await offRampOrchestrator.openMoonPay();
					await openRedirectUrl(redirectUrl);
					offRampOrchestrator.trackCheckoutReturn();
					appStore.showSuccessToast($t('wallet.buy_sell.moonpay_redirect_note'));
				} else if (offRampStage === 'awaiting_deposit_address') {
					if (!depositAddressInput.trim()) {
						depositAddressError = $t('wallet.buy_sell.deposit_address_invalid');
						return;
					}
					try {
						await offRampOrchestrator.setDepositAddress(depositAddressInput.trim());
						depositAddressError = '';
					} catch {
						depositAddressError = $t('wallet.buy_sell.deposit_address_invalid');
						return;
					}
					await offRampOrchestrator.executeBridge();
					appStore.showSuccessToast(
						$t('wallet.buy_sell.bridge_in_progress', {
							values: { asset: friendlyAssetName(selectedCrypto) }
						})
					);
				}
			} catch (err) {
				Sentry.captureException(err);
				appStore.showErrorToast($t('wallet.buy_sell.transaction_failed'));
			} finally {
				offRampLoading = false;
			}
			return;
		}

		if (!selectedOffer) return;

		isLoading = true;
		Sentry.addBreadcrumb({
			category: 'wallet',
			message: 'Creating fiat order',
			data: { tab: activeTab, provider: selectedOffer.providerCode, crypto: selectedCrypto },
			level: 'info'
		});

		try {
			if (!walletAddress) {
				appStore.showErrorToast($t('wallet.error.no_connection'));
				return;
			}

			if (activeTab === 'buy') {
				// Use orchestrator for buy flow
				const { redirectUrl } = await orchestrator.createOrder({
					asset: selectedCrypto as FiatBuyAsset,
					fiatAmount: amount,
					walletAddress,
					providerCode: selectedOffer.providerCode,
					country: selectedCountry,
					state: selectedState || undefined,
					paymentMethod: selectedPaymentMethod?.method
				});

				await openRedirectUrl(redirectUrl);
				debug.log('Checkout opened, tracking return');
				orchestrator.trackCheckoutReturn();
				orchestrator.startMonitoring();
				appStore.showSuccessToast($t('wallet.buy_sell.order_submitted'));
			} else {
				// Sell flow — direct Changelly off-ramp (no orchestrator needed)
				const order = await changellyFiatService.createOffRampOrder({
					cryptoCurrency: cryptoTicker(selectedCrypto),
					cryptoAmount: amount,
					fiatCurrency: 'USD',
					fiatAddress: walletAddress,
					providerCode: selectedOffer.providerCode,
					country: selectedCountry,
					state: selectedState || undefined,
					paymentMethod: selectedPaymentMethod?.method
				});

				const checkoutPopup = await openRedirectUrl(order.redirectUrl);
				debug.log('Checkout opened, tracking return (popup=%s)', checkoutPopup ? 'Window' : 'null');
				// Track when user returns to app — triggers immediate status check
				orchestrator.trackCheckoutReturn();
				sellFlowActive = true;
				appStore.showSuccessToast($t('wallet.buy_sell.order_submitted'));
			}
		} catch (error) {
			Sentry.captureException(error);
			appStore.showErrorToast($t('wallet.buy_sell.transaction_failed'));
		} finally {
			isLoading = false;
		}
	}

	// ===================================================================
	// Stage display helpers
	// ===================================================================
	function stageLabel(stage: FiatFlowStage): string {
		const key: Record<FiatFlowStage, string> = {
			idle: '',
			awaiting_payment: 'wallet.buy_sell.stage_awaiting_payment',
			payment_confirmed: 'wallet.buy_sell.stage_payment_confirmed',
			crypto_delivered: 'wallet.buy_sell.stage_crypto_delivered',
			converting: 'wallet.buy_sell.stage_converting',
			swap_hop1: 'wallet.buy_sell.stage_swap_hop1',
			swap_hop2: 'wallet.buy_sell.stage_swap_hop2',
			complete: 'wallet.buy_sell.stage_complete',
			failed: 'wallet.buy_sell.stage_failed',
			swap_failed: 'wallet.buy_sell.stage_swap_failed'
		};
		return $t(key[stage] || '');
	}

	function isTerminalStage(stage: FiatFlowStage): boolean {
		return stage === 'complete' || stage === 'failed' || stage === 'swap_failed';
	}

	// ===================================================================
	// Cleanup on close
	// ===================================================================
	function handleClose() {
		cancelOfferFetch();
		orchestrator.destroy();
		offRampOrchestrator.destroy();
		activeTab = 'buy';
		amount = '';
		offers = [];
		selectedOffer = null;
		selectedPaymentMethod = null;
		quoteLoading = false;
		quoteError = false;
		isLoading = false;
		source = defaultWalletId();
		sourceInitialized = false;
		swapPercent = 0;
		flowState = null;
		sellFlowActive = false;
		offRampQuote = null;
		offRampFlow = null;
		depositAddressInput = '';
		depositAddressError = '';
		offRampLoading = false;
		onClose();
	}
</script>

<Drawer
	{isOpen}
	onClose={handleClose}
	title={$t('wallet.buy_sell.title')}
	position="right"
	isScrollable={true}
	isSubmitting={isLoading}
>
	<div class="flex flex-col gap-4">
		<!-- Tab Bar -->
		<div
			class="tabs tabs-boxed border-base-300 mb-1 shrink-0 overflow-hidden rounded-lg border sm:mb-2"
			role="tablist"
		>
			<button
				class="tab min-h-[44px] flex-1"
				class:bg-primary={activeTab === 'buy'}
				class:text-primary-content={activeTab === 'buy'}
				class:tab-active={activeTab === 'buy'}
				role="tab"
				aria-selected={activeTab === 'buy'}
				onclick={() => switchTab('buy')}
			>
				<svg class="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 6v6m0 0v6m0-6h6m-6 0H6"
					/></svg
				>
				{$t('wallet.buy_sell.buy')}
			</button>
			<button
				class="tab min-h-[44px] flex-1"
				class:bg-primary={activeTab === 'sell'}
				class:text-primary-content={activeTab === 'sell'}
				class:tab-active={activeTab === 'sell'}
				role="tab"
				aria-selected={activeTab === 'sell'}
				onclick={() => switchTab('sell')}
			>
				<svg class="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M20 12H4"
					/></svg
				>
				{$t('wallet.buy_sell.sell')}
			</button>
		</div>

		<!-- Country / State Selectors (same on both tabs) -->
		<div class="space-y-2">
			<div class="form-control">
				<div class="relative">
					<select
						id="country-select"
						class="select border-primary bg-base-100 min-h-[48px] w-full rounded-lg border-2 text-base"
						class:opacity-50={countriesLoading}
						disabled={countriesLoading}
						bind:value={selectedCountry}
						onchange={() => {
							selectedState = '';
							if (amount && parseFloat(amount) > 0) fetchOffers(amount);
						}}
					>
						{#if countries.length === 0}
							<option value="">{$t('wallet.buy_sell.loading_offers')}</option>
						{/if}
						{#each countries as c (c.code)}
							<option value={c.code}>{c.name} ({c.code})</option>
						{/each}
					</select>
					{#if countriesLoading}
						<span
							class="loading loading-spinner loading-sm text-primary absolute top-1/2 right-3 -translate-y-1/2"
						></span>
					{/if}
				</div>
			</div>

			{#if selectedCountry === 'US' && statesForSelected.length > 0}
				<div class="form-control animate-fade-in">
					<select
						id="state-select"
						class="select border-primary bg-base-100 min-h-[48px] w-full rounded-lg border-2 text-base"
						bind:value={selectedState}
						onchange={() => {
							if (amount && parseFloat(amount) > 0) fetchOffers(amount);
						}}
					>
						<option value="">{$t('wallet.buy_sell.select_state')}</option>
						{#each statesForSelected as s (s.code)}
							<option value={s.code}>{s.name}</option>
						{/each}
					</select>
					{#if !selectedState && amount && parseFloat(amount) > 0}
						<p class="text-base-content/50 mt-1 text-xs">{$t('wallet.buy_sell.state_required')}</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Wallet + Asset Selector (hybrid accordion) -->
		<SwapPartySelector
			label={activeTab === 'buy' ? $t('wallet.to') + ':' : $t('wallet.from') + ':'}
			selectedWalletId={source}
			onWalletSelect={(id) => (source = id)}
			connectedWallets={$connectedWalletsStore.wallets}
			walletBtcSatsFor={walletBtcSatsForFn}
			walletUsdt0For={walletUsdt0ForFn}
			btcPrice={btcPrice.price}
			selectedAssetId={selectedCrypto}
			onAssetSelect={(id) => handleCryptoChange(id)}
			assets={assetOptions}
		/>

		<!-- Transaction Form -->
		<div class="bg-base-200 rounded-xl p-4 sm:p-5">
			<form onsubmit={handleSubmit} class="space-y-4">
				{#if isFlowActive && flowState}
					<!-- Buy flow: replace input with inline status row -->
					{@const fs = flowState}
					<div class="bg-info/5 border-info/20 flex items-center gap-3 rounded-lg border p-3">
						{#if isTerminalStage(fs.stage)}
							<svg
								class="text-error h-4 w-4 shrink-0"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
								/></svg
							>
						{:else}
							<span class="loading loading-spinner loading-sm text-info shrink-0"></span>
						{/if}
						<div class="min-w-0 flex-1">
							<span class="text-sm font-medium">{stageLabel(fs.stage)}</span>
							{#if fs.error}
								<p class="text-error mt-0.5 text-xs">{fs.error}</p>
							{/if}
						</div>
						<button
							type="button"
							class="btn btn-ghost btn-xs shrink-0"
							onclick={() => {
								orchestrator.cancel();
								flowState = null;
							}}
						>
							{$t('wallet.buy_sell.start_over')}
						</button>
					</div>
				{:else if sellFlowActive}
					<!-- Sell flow: replace input with inline status row -->
					<div class="bg-info/5 border-info/20 flex items-center gap-3 rounded-lg border p-3">
						<span class="loading loading-spinner loading-sm text-info shrink-0"></span>
						<span class="min-w-0 flex-1 text-sm font-medium"
							>{$t('wallet.buy_sell.stage_awaiting_payment')}</span
						>
						<button
							type="button"
							class="btn btn-ghost btn-xs shrink-0"
							onclick={() => {
								sellFlowActive = false;
							}}
						>
							{$t('wallet.buy_sell.start_over')}
						</button>
					</div>
				{:else}
					{#if activeTab === 'sell'}
						<!-- Sell tab: unified AmountInputSection (direct variant) -->
						<AmountInputSection
							variant="direct"
							{amount}
							unit={showSats ? 'sats' : 'usd'}
							tokenPrefix={isBtcDenominated ? undefined : '$'}
							supportsBtcUsdToggle={isBtcDenominated}
							btcUsdMode={!showSats}
							onBtcUsdModeChange={(isUsd) => {
								showSats = !isUsd;
								clearAmount();
							}}
							onAmountChange={onSellAmountChange}
							onUnitChange={(u) => {
								showSats = u === 'sats';
								clearAmount();
							}}
							onClear={clearAmount}
							onMaxAmount={onSellMaxAmount}
							showPercentSlider={true}
							percent={swapPercent}
							onPercentChange={onSellPercentChange}
							disabled={false}
						/>
					{:else}
						<!-- Buy tab: inline input (existing) -->
						<div class="form-control">
							<div class="flex items-start gap-2">
								<div class="join min-w-0 flex-1">
									<span
										class="btn join-item no-animation bg-base-200 text-base-content/70 min-h-[48px] border-r-0 text-sm sm:min-h-[52px]"
										>$</span
									>
									<div class="relative min-w-0 flex-1">
										<label for="amount-input" class="sr-only">
											{$t('wallet.buy_sell.amount_to_buy')}
										</label>
										<input
											id="amount-input"
											type="number"
											class="input input-bordered join-item min-h-[48px] w-full pr-10 text-base sm:min-h-[52px]"
											placeholder="0.00"
											bind:value={amount}
											oninput={handleAmountInput}
											min="0"
											step="0.01"
											pattern="[0-9]*"
											inputmode="numeric"
										/>
										{#if amount && parseFloat(amount) > 0}
											<button
												type="button"
												class="text-error hover:bg-error/20 absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full transition-colors"
												onclick={clearAmount}
												aria-label="Clear amount"
											>
												<IconClose class="h-4 w-4" />
											</button>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/if}

					<!-- Quick amount buttons + Buy button (buy only) -->
					{#if activeTab === 'buy'}
						<div class="flex items-center justify-between gap-2">
							<div class="flex min-w-0 flex-1 flex-wrap gap-2">
								<button
									type="button"
									class="btn btn-ghost border-base-300 min-h-[44px] border text-sm active:scale-95"
									onclick={() => {
										amount = '10';
										fetchOffers('10');
									}}>{$t('wallet.buy_sell.quick_amount_10')}</button
								>
								<button
									type="button"
									class="btn btn-ghost border-base-300 min-h-[44px] border text-sm active:scale-95"
									onclick={() => {
										amount = '20';
										fetchOffers('20');
									}}>{$t('wallet.buy_sell.quick_amount_20')}</button
								>
								<button
									type="button"
									class="btn btn-ghost border-base-300 min-h-[44px] border text-sm active:scale-95"
									onclick={() => {
										amount = '50';
										fetchOffers('50');
									}}>{$t('wallet.buy_sell.quick_amount_50')}</button
								>
								<button
									type="button"
									class="btn btn-ghost border-base-300 min-h-[44px] border text-sm active:scale-95"
									onclick={() => {
										amount = '100';
										fetchOffers('100');
									}}>{$t('wallet.buy_sell.quick_amount_100')}</button
								>
							</div>
							<button
								type="submit"
								class="btn btn-primary min-h-[48px] shrink-0 sm:min-h-[52px]"
								disabled={isLoading || !amount || !selectedOffer || !walletAddress}
							>
								{#if isLoading}<span class="loading loading-spinner loading-sm mr-1"></span>{/if}
								{$t('wallet.buy_sell.buy')}
							</button>
						</div>
					{/if}
				{/if}

				<!-- Sell button (sell only, hidden during active sell flow) -->
				{#if activeTab === 'sell' && !sellFlowActive}
					<div class="flex items-center gap-3">
						<button
							type="submit"
							class="btn btn-primary ml-auto min-h-[48px] shrink-0 sm:min-h-[52px]"
							disabled={sellButtonDisabled}
						>
							{#if needsBridgeAndSend ? offRampLoading : isLoading}<span
									class="loading loading-spinner loading-sm mr-1"
								></span>{/if}
							{#if needsBridgeAndSend && offRampStage === 'awaiting_deposit_address'}
								{$t('wallet.buy_sell.continue_bridge')}
							{:else}
								{$t('wallet.buy_sell.sell')}
							{/if}
						</button>
					</div>
				{/if}

				<!-- Bridge-and-send: quote card -->
				{#if needsBridgeAndSend && offRampQuote && (offRampStage === 'quote_ready' || offRampStage === 'idle')}
					<div class="bg-base-100 border-base-300 space-y-2 rounded-lg border p-3">
						<div class="flex items-center justify-between">
							<span class="text-base-content/60 text-xs">{$t('wallet.buy_sell.you_receive')}</span>
							<span class="text-sm font-semibold">${offRampQuote.estimatedFiatReceived}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-base-content/60 text-xs">{$t('wallet.buy_sell.bridge_fee')}</span>
							<span class="text-xs">${offRampQuote.bridgeFeeUsd}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-base-content/60 text-xs">{$t('wallet.buy_sell.moonpay_fee')}</span>
							<span class="text-xs">${offRampQuote.moonpayFeeUsd}</span>
						</div>
						<div class="border-base-300 flex items-center justify-between border-t pt-2">
							<span class="text-xs font-medium"
								>{$t('wallet.buy_sell.sell_summary_fee_total', {
									values: { percent: offRampQuote.totalFeePercent }
								})}</span
							>
							<span class="text-base-content/60 text-xs"
								>{$t('wallet.buy_sell.estimated_time', {
									values: { time: Math.ceil(offRampQuote.estimatedTimeSeconds / 60) }
								})}</span
							>
						</div>
					</div>
				{/if}

				<!-- Bridge-and-send: opening MoonPay -->
				{#if needsBridgeAndSend && offRampStage === 'opening_moonpay'}
					<div class="bg-info/5 border-info/20 flex items-center gap-3 rounded-lg border p-3">
						<span class="loading loading-spinner loading-sm text-info shrink-0"></span>
						<span class="min-w-0 flex-1 text-sm font-medium"
							>{$t('wallet.buy_sell.open_moonpay')}</span
						>
						<button
							type="button"
							class="btn btn-ghost btn-xs shrink-0"
							onclick={() => offRampOrchestrator.startOver()}
						>
							{$t('wallet.buy_sell.start_over_moonpay')}
						</button>
					</div>
				{/if}

				<!-- Bridge-and-send: awaiting deposit address -->
				{#if needsBridgeAndSend && offRampStage === 'awaiting_deposit_address'}
					<div class="space-y-3">
						<p class="text-base-content/70 text-xs">
							{$t('wallet.buy_sell.deposit_address_helper')}
						</p>
						<div class="form-control">
							<label class="label pb-1" for="deposit-addr-input">
								<span class="label-text text-xs">{$t('wallet.buy_sell.paste_deposit_address')}</span
								>
							</label>
							<input
								id="deposit-addr-input"
								type="text"
								class="input input-bordered input-sm w-full font-mono text-xs"
								class:input-error={!!depositAddressError}
								placeholder={$t('wallet.buy_sell.deposit_address_placeholder')}
								bind:value={depositAddressInput}
								spellcheck="false"
								autocomplete="off"
								aria-invalid={!!depositAddressError}
								aria-describedby={depositAddressError ? 'deposit-addr-error' : undefined}
							/>
							{#if depositAddressError}
								<label class="label pt-1" id="deposit-addr-error" for="deposit-addr-input">
									<span class="label-text-alt text-error text-xs">{depositAddressError}</span>
								</label>
							{/if}
						</div>
						<button
							type="button"
							class="btn btn-ghost btn-xs"
							onclick={() => offRampOrchestrator.startOver()}
						>
							{$t('wallet.buy_sell.start_over_moonpay')}
						</button>
					</div>
				{/if}

				<!-- Bridge-and-send: bridging in progress -->
				{#if needsBridgeAndSend && offRampStage === 'bridging'}
					<div class="bg-info/5 border-info/20 flex items-center gap-3 rounded-lg border p-3">
						<span class="loading loading-spinner loading-sm text-info shrink-0"></span>
						<span class="min-w-0 flex-1 text-sm font-medium">
							{$t('wallet.buy_sell.bridge_in_progress', {
								values: { asset: friendlyAssetName(selectedCrypto) }
							})}
						</span>
					</div>
				{/if}

				<!-- Bridge-and-send: complete -->
				{#if needsBridgeAndSend && offRampStage === 'complete'}
					<div class="bg-success/5 border-success/20 flex items-center gap-3 rounded-lg border p-3">
						<svg
							class="text-success h-4 w-4 shrink-0"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						<span class="min-w-0 flex-1 text-sm font-medium"
							>{$t('wallet.buy_sell.bridge_complete')}</span
						>
					</div>
				{/if}

				<!-- Bridge-and-send: failed -->
				{#if needsBridgeAndSend && offRampStage === 'failed'}
					<div class="bg-error/5 border-error/20 flex items-center gap-3 rounded-lg border p-3">
						<svg
							class="text-error h-4 w-4 shrink-0"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
						<div class="min-w-0 flex-1">
							<span class="text-sm font-medium">{$t('wallet.buy_sell.bridge_failed')}</span>
							{#if offRampFlow?.error}
								<p class="text-error mt-0.5 text-xs">{$t(offRampFlow.error)}</p>
							{/if}
						</div>
						<button
							type="button"
							class="btn btn-ghost btn-xs shrink-0"
							onclick={() => offRampOrchestrator.startOver()}
						>
							{$t('wallet.buy_sell.start_over_moonpay')}
						</button>
					</div>
				{/if}

				<!-- Multi-hop flow info for rBTC -->
				{#if isMultiHop && activeTab === 'buy'}
					<p class="text-base-content/50 text-xs">
						{$t('wallet.buy_sell.multi_hop_label')}
						{$t('wallet.buy_sell.multi_hop_rbtc_desc')}
					</p>
				{/if}

				{#if !needsBridgeAndSend}
					<!-- Payment method filter badges (always visible, disabled when no offers) -->
					<div class="flex flex-wrap gap-1.5">
						<button
							type="button"
							class="badge min-h-[28px] cursor-pointer border px-2 text-xs transition-colors"
							class:badge-primary={!activePaymentFilter && filteredOffers.length > 0}
							class:badge-ghost={activePaymentFilter !== null || filteredOffers.length === 0}
							class:border-primary={!activePaymentFilter && filteredOffers.length > 0}
							class:border-base-300={activePaymentFilter !== null || filteredOffers.length === 0}
							class:opacity-50={filteredOffers.length === 0}
							disabled={filteredOffers.length === 0}
							onclick={() => {
								activePaymentFilter = null;
								if (filteredOffers.length > 0) {
									selectedOffer = filteredOffers[0];
									selectedPaymentMethod = filteredOffers[0].paymentMethodOffer[0] ?? null;
								}
							}}
						>
							{$t('wallet.buy_sell.filter_all')}
						</button>
						{#each allPaymentMethods as pm (pm.method)}
							<button
								type="button"
								class="badge min-h-[28px] cursor-pointer border px-2 text-xs transition-colors"
								class:badge-primary={activePaymentFilter === pm.method && filteredOffers.length > 0}
								class:badge-ghost={activePaymentFilter !== pm.method || filteredOffers.length === 0}
								class:border-primary={activePaymentFilter === pm.method &&
									filteredOffers.length > 0}
								class:border-base-300={activePaymentFilter !== pm.method ||
									filteredOffers.length === 0}
								class:opacity-50={filteredOffers.length === 0}
								disabled={filteredOffers.length === 0}
								onclick={() => {
									activePaymentFilter = pm.method;
									if (filteredOffers.length > 0) {
										selectedOffer = filteredOffers[0];
										selectedPaymentMethod = filteredOffers[0].paymentMethodOffer[0] ?? null;
									}
								}}
							>
								{pm.methodName}
							</button>
						{/each}
					</div>

					<!-- Provider accordion (always visible — no layout shift) -->
					<div
						class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
						class:collapse-open={providerExpanded && filteredOffers.length > 0}
						class:chevron-dimmed={(filteredOffers.length === 0 && !quoteLoading && !quoteError) ||
							needsBridgeAndSend}
					>
						{#if filteredOffers.length > 0}
							{@const best = filteredOffers[0]}
							{@const selected = selectedOffer ?? best}
							<button
								type="button"
								class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10 text-sm font-medium"
								onclick={() => (providerExpanded = !providerExpanded)}
								aria-expanded={providerExpanded}
							>
								<div class="min-w-0 flex-1 text-left">
									<div class="text-sm font-medium">
										{formatProviderName(selected.providerCode)}
									</div>
									<div class="text-base-content/60 text-xs">
										{$t('wallet.buy_sell.fee')}: ${calculateFee(selected)}
									</div>
								</div>
								<div class="shrink-0 text-right">
									{#if isBtcAsset}
										<div class="text-sm font-semibold tabular-nums">
											{formatSatsAmount(selected)}
											{$t('wallet.buy_sell.sats')}
										</div>
										<div class="text-base-content/60 text-xs tabular-nums">
											≈ ${formatUsdFromSats(selected)}
										</div>
									{:else}
										<div class="text-sm font-semibold tabular-nums">
											${selected.amountExpectedTo}
										</div>
										<div class="text-base-content/60 text-xs">
											{friendlyAssetName(selectedCrypto)}
										</div>
									{/if}
								</div>
								{#if isLowestFee(selected)}
									<svg
										class="text-success h-5 w-5 shrink-0"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
										/></svg
									>
								{/if}
							</button>
							<div class="collapse-content px-2">
								<div class="space-y-1">
									{#each filteredOffers as offer (offer.providerCode)}
										{@const isSelected = selectedOffer?.providerCode === offer.providerCode}
										{@const isCheapest = isLowestFee(offer)}
										<button
											type="button"
											class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {isSelected
												? 'bg-primary/10'
												: 'hover:bg-base-200'}"
											onclick={() => {
												selectedOffer = offer;
												selectedPaymentMethod = offer.paymentMethodOffer[0] ?? null;
												providerExpanded = false;
											}}
										>
											<div class="min-w-0 flex-1 text-left">
												<div class="text-sm font-medium">
													{formatProviderName(offer.providerCode)}
												</div>
												<div class="text-base-content/60 text-xs">
													{$t('wallet.buy_sell.fee')}: ${calculateFee(offer)}
												</div>
											</div>
											<div class="shrink-0 text-right">
												{#if isBtcAsset}
													<div class="text-sm font-semibold tabular-nums">
														{formatSatsAmount(offer)}
														{$t('wallet.buy_sell.sats')}
													</div>
													<div class="text-base-content/60 text-xs tabular-nums">
														≈ ${formatUsdFromSats(offer)}
													</div>
												{:else}
													<div class="text-sm font-semibold tabular-nums">
														${offer.amountExpectedTo}
													</div>
													<div class="text-base-content/60 text-xs">
														{friendlyAssetName(selectedCrypto)}
													</div>
												{/if}
											</div>
											{#if isCheapest}
												<svg
													class="text-success h-5 w-5 shrink-0"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
													><path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
													/></svg
												>
											{/if}
										</button>
									{/each}
								</div>
							</div>
						{:else if quoteLoading}
							<div
								class="collapse-title flex min-h-[44px] items-center justify-center gap-2 px-3 py-2.5 pr-10"
							>
								<span class="loading loading-spinner loading-sm text-info"></span>
								<span class="text-base-content/60 text-sm"
									>{$t('wallet.buy_sell.loading_offers')}</span
								>
							</div>
						{:else if quoteError}
							<div class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10">
								<svg
									class="text-error h-4 w-4 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
									/></svg
								>
								<span class="text-base-content/60 text-sm">{$t('wallet.buy_sell.no_offers')}</span>
							</div>
						{:else if supportedCryptoError}
							<div class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10">
								<svg
									class="text-warning h-4 w-4 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
									/></svg
								>
								<span class="text-base-content/60 text-sm"
									>{$t(supportedCryptoError ?? '', {
										values: {
											asset: friendlyAssetName(selectedCrypto),
											action:
												activeTab === 'buy'
													? $t('wallet.buy_sell.purchase')
													: $t('wallet.buy_sell.sale')
										}
									})}</span
								>
							</div>
						{:else}
							<div
								class="collapse-title flex min-h-[44px] items-center justify-center px-3 py-2.5 pr-10"
							>
								<span class="text-base-content/50 text-sm"
									>{$t('wallet.buy_sell.enter_amount_prompt')}</span
								>
							</div>
						{/if}
					</div>
				{/if}
			</form>
		</div>

		<!-- Sell flow note (hidden during active sell flow) -->
		{#if activeTab === 'sell' && !sellFlowActive}
			<div class="bg-info/5 border-info/20 rounded-lg border p-3 text-xs leading-relaxed">
				{$t('wallet.buy_sell.sell_redirect_note')}
			</div>
		{/if}

		<!-- Changelly KYC note -->
		<div class="text-base-content/50 text-xs leading-relaxed">
			{$t('wallet.buy_sell.kyc_disclaimer')}
		</div>
	</div>
</Drawer>

<style>
	.animate-fade-in {
		animation: fadeIn 200ms ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global(.chevron-dimmed) > :global(.collapse-title)::after {
		color: color-mix(in oklch, var(--color-base-content) 50%, transparent);
	}
</style>
