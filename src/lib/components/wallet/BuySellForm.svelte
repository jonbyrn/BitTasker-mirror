<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { SvelteMap } from 'svelte/reactivity';
	import Drawer from '$lib/components/Drawer.svelte';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import type { AssetOption } from './AssetSelector.svelte';
	import SwapPartySelector from './SwapPartySelector.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import BuySellCountrySelector from '$lib/components/wallet/BuySellCountrySelector.svelte';
	import FiatOfferSection from '$lib/components/wallet/FiatOfferSection.svelte';
	import OffRampStatusCard from '$lib/components/wallet/OffRampStatusCard.svelte';
	import { useBuySellBalances } from '$lib/runes/use-buy-sell-balances.svelte';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { appStore } from '$lib/stores/app.store';
	import { reconnectPersistedWallets } from '$lib/services/external-wallet/reconnect';
	import { changellyFiatService, sortOffersByBestRate } from '$lib/services/fiat-ramp.service';
	import type {
		ChangellyOfferSuccess,
		ChangellyCountry,
		ChangellyPaymentMethodOffer
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
	import IconPlus from '~icons/mdi/plus';
	import IconMinus from '~icons/mdi/minus';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import { cryptoTicker, friendlyAssetName } from '$lib/utils/fiat-helpers';
	import { createDebug } from '$lib/utils/debug';
	const debug = createDebug('buy-sell-form');

	let {
		isOpen,
		onClose,
		defaultCrypto
	}: {
		isOpen: boolean;
		onClose: () => void;
		defaultCrypto?: 'rbtc' | 'usdt0-arb' | 'wbtc-arb' | 'btc-onchain';
	} = $props();

	// -----------------------------------------------------------------------
	// Locale-aware formatter
	// -----------------------------------------------------------------------
	const usdFormatter = $derived(
		new Intl.NumberFormat(($locale ?? 'en') as string, {
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
	let showSats = $state(false);
	let swapPercent = $state(0);

	// Off-ramp orchestrator
	const offRampOrchestrator = new OffRampOrchestrator();
	let offRampFlow = $state<OffRampFlowState | null>(offRampOrchestrator.getActiveFlow());
	let offRampQuote = $state<OffRampQuote | null>(null);
	let depositAddressInput = $state('');
	let depositAddressError = $state('');
	let offRampLoading = $state(false);

	// Wallet source
	let source = $state('builtin');
	let sourceInitialized = $state(false);

	// Country & state
	let selectedCountry = $state('SV');
	let selectedState = $state('');
	let countries = $state<ChangellyCountry[]>([]);
	let countriesLoading = $state(false);

	// Offer state
	let offers = $state<ChangellyOfferSuccess[]>([]);
	let selectedOffer = $state<ChangellyOfferSuccess | null>(null);
	let selectedPaymentMethod = $state<ChangellyPaymentMethodOffer | null>(null);
	let quoteLoading = $state(false);
	let quoteError = $state(false);
	let quoteAbort: AbortController | null = null;
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

	let filteredOffers = $derived.by(() => {
		if (!activePaymentFilter) return offers;
		return offers.filter((o) =>
			o.paymentMethodOffer.some((pm) => pm.method === activePaymentFilter)
		);
	});

	// -----------------------------------------------------------------------
	// Balance rune
	// -----------------------------------------------------------------------
	const balances = useBuySellBalances({
		getSource: () => source,
		getSelectedCrypto: () => selectedCrypto,
		getActiveTab: () => activeTab,
		getShowSats: () => showSats,
		getTotalBalances: () => $walletStore.totalBalances,
		getArbData: () =>
			$walletStore.arb as unknown as import('$lib/runes/use-buy-sell-balances.svelte.ts').ArbData,
		getConnectedWallets: () => $connectedWalletsStore.wallets,
		getBtcPrice: () => btcPrice.price,
		getUsdFormatter: () => usdFormatter
	});

	// Asset options with i18n labels
	let assetOptions = $derived.by<AssetOption[]>(() => {
		const opts: AssetOption[] = [
			{
				id: 'rbtc',
				label: $t('wallet.buy_sell.bitcoin_rbtc'),
				icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
				subLabel: $t('wallet.buy_sell.sub_rbtc'),
				balance: balances.rbtcBalanceDisplay
			},
			{
				id: 'usdt0-arb',
				label: $t('wallet.send_form.asset.usd'),
				icon: '/images/chains/Tether-USD.svg',
				subLabel: $t('wallet.buy_sell.sub_usdt0'),
				balance: balances.usdtBalanceDisplay
			},
			{
				id: 'wbtc-arb',
				label: $t('wallet.wbtc_arbitrum'),
				icon: '/images/chains/arbitrum.png',
				subLabel: $t('wallet.buy_sell.sub_wbtc'),
				balance: balances.wbtcBalanceDisplay
			}
		];
		if (balances.selectedSourceHasBtc) {
			opts.push({
				id: 'btc-onchain',
				label: $t('wallet.buy_sell.bitcoin_btc'),
				icon: '/images/chains/Bitcoin.svg',
				subLabel: $t('wallet.buy_sell.sub_btc_onchain'),
				balance: balances.rbtcBalanceDisplay
			});
		}
		return opts;
	});

	// -----------------------------------------------------------------------
	// Fiat swap orchestrator
	// -----------------------------------------------------------------------
	const orchestrator = new FiatSwapOrchestrator();
	let flowState = $state<FiatFlowState | null>(orchestrator.getActiveFlow());

	$effect(() => {
		const unsub = orchestrator.onStageChange((state) => {
			flowState = { ...state };
		});
		return unsub;
	});

	$effect(() => {
		const unsub = offRampOrchestrator.onStageChange((state) => {
			offRampFlow = { ...state };
		});
		return unsub;
	});

	// -----------------------------------------------------------------------
	// Derived helpers
	// -----------------------------------------------------------------------
	let isMultiHop = $derived(selectedCrypto === 'rbtc');
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

	let isFlowActive = $derived(
		activeTab === 'buy' &&
			flowState !== null &&
			flowState.stage !== 'idle' &&
			flowState.stage !== 'complete'
	);

	let walletAddress = $derived.by(() => {
		if (source === 'builtin') {
			if (selectedCrypto === 'btc-onchain') return '';
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

	let statesForSelected = $derived(countries.find((c) => c.code === selectedCountry)?.states ?? []);

	// -----------------------------------------------------------------------
	// Effects
	// -----------------------------------------------------------------------
	$effect(() => {
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
		if (selectedCrypto === 'btc-onchain' && !balances.selectedSourceHasBtc) {
			selectedCrypto = 'rbtc';
		}
	});

	$effect(() => {
		if (isOpen && defaultCrypto) {
			selectedCrypto = defaultCrypto;
		}
	});

	$effect(() => {
		if (!isOpen || supportedCryptoTickers) return;
		changellyFiatService
			.getCurrencies({ type: 'crypto' })
			.then((currencies) => {
				supportedCryptoTickers = new Set(currencies.map((c) => c.ticker.toUpperCase()));
			})
			.catch((err) => {
				Sentry.addBreadcrumb({
					category: 'fiat-ramp',
					message: 'Failed to fetch supported crypto currencies',
					data: { error: String(err) },
					level: 'warning'
				});
				supportedCryptoError = 'wallet.buy_sell.supported_crypto_error';
			});
	});

	// Load countries on mount + auto-detect from browser locale
	$effect(() => {
		if (!isOpen) return;
		const ctrl = new AbortController();
		countriesLoading = true;
		changellyFiatService
			.getAvailableCountries()
			.then((result) => {
				if (ctrl.signal.aborted) return;
				countries = result;
				try {
					const lang = navigator.language || '';
					const region = lang.split('-')[1]?.toUpperCase() ?? '';
					if (region && region !== 'US' && result.some((c) => c.code === region)) {
						selectedCountry = region;
					}
				} catch {
					// navigator.language unavailable
				}
			})
			.catch(() => {})
			.finally(() => {
				if (!ctrl.signal.aborted) countriesLoading = false;
			});
		return () => ctrl.abort();
	});

	// -----------------------------------------------------------------------
	// Form state reset
	// -----------------------------------------------------------------------
	function resetFormState(
		opts: {
			resetTab?: boolean;
			resetAmount?: boolean;
			resetOffers?: boolean;
			resetOffRamp?: boolean;
			resetSource?: boolean;
		} = {}
	) {
		const {
			resetTab = false,
			resetAmount = true,
			resetOffers = true,
			resetOffRamp = true,
			resetSource = false
		} = opts;
		if (resetTab) activeTab = 'buy';
		if (resetAmount) {
			amount = '';
			swapPercent = 0;
			showSats = false;
		}
		if (resetOffers) {
			cancelOfferFetch();
			offers = [];
			selectedOffer = null;
			selectedPaymentMethod = null;
			quoteLoading = false;
			quoteError = false;
			supportedCryptoError = null;
		}
		if (resetOffRamp) {
			offRampOrchestrator.cancel();
			offRampQuote = null;
			offRampFlow = null;
			depositAddressInput = '';
			depositAddressError = '';
			offRampLoading = false;
			sellFlowActive = false;
		}
		if (resetSource) {
			source = 'builtin';
			sourceInitialized = false;
			isLoading = false;
			flowState = null;
		}
	}

	function switchTab(tab: 'buy' | 'sell') {
		if (tab === activeTab) return;
		activeTab = tab;
		resetFormState({ resetAmount: true, resetOffers: true, resetOffRamp: true });
	}

	function handleCryptoChange(cryptoId: string) {
		const validCryptos = ['rbtc', 'usdt0-arb', 'wbtc-arb', 'btc-onchain'] as const;
		if (validCryptos.includes(cryptoId as typeof selectedCrypto)) {
			selectedCrypto = cryptoId as typeof selectedCrypto;
		}
		resetFormState({ resetAmount: true, resetOffers: true, resetOffRamp: true });
		if (amount && parseFloat(amount) > 0) fetchOffers(amount);
	}

	// -----------------------------------------------------------------------
	// Max amount & percent slider
	// -----------------------------------------------------------------------
	function setMaxAmount() {
		triggerHaptic(ImpactStyle.Light);
		const maxVal = balances.computeMaxAmount();
		amount = maxVal;
		swapPercent = 100;
		fetchOffers(maxVal);
	}

	function applyPercent(pct: number) {
		swapPercent = pct;
		const displayVal = balances.computePercentAmount(pct);
		const val = parseFloat(displayVal);
		amount = displayVal;
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
		if (raw && parseFloat(raw) > 0) fetchOffers(raw);
		else {
			cancelOfferFetch();
			offers = [];
			selectedOffer = null;
			selectedPaymentMethod = null;
			quoteLoading = false;
		}
	}

	function clearAmount() {
		resetFormState({ resetAmount: true, resetOffers: true, resetOffRamp: false });
		offRampQuote = null;
	}

	function onSellAmountChange(val: string) {
		amount = val;
		if (val && parseFloat(val) > 0) fetchOffers(val);
		else {
			cancelOfferFetch();
			offers = [];
			selectedOffer = null;
			selectedPaymentMethod = null;
			quoteLoading = false;
			offRampQuote = null;
		}
	}

	// -----------------------------------------------------------------------
	// Offer fetching
	// -----------------------------------------------------------------------
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

		if (needsBridgeAndSend) {
			const sourceAddress = walletAddress;
			if (!sourceAddress) {
				quoteLoading = false;
				return;
			}
			let assetAmount = rawAmount;
			if (balances.isBtcDenominated && showSats) {
				const sats = parseInt(rawAmount);
				if (!isNaN(sats) && sats > 0) assetAmount = (sats / 100_000_000).toFixed(8);
			} else if (balances.isBtcDenominated && !showSats && btcPrice.price > 0) {
				const usdValue = parseFloat(rawAmount);
				if (!isNaN(usdValue) && usdValue > 0) assetAmount = (usdValue / btcPrice.price).toFixed(8);
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
				Sentry.captureException(err, {
					tags: { component: 'BuySellForm', action: 'off-ramp-quote' }
				});
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
			const cryptoSide = activeTab === 'buy' ? currencyTo : currencyFrom;
			if (supportedCryptoTickers && !supportedCryptoTickers.has(cryptoSide.toUpperCase())) {
				quoteLoading = false;
				quoteAbort = null;
				supportedCryptoError = 'wallet.buy_sell.unavailable_in_region';
				return;
			}
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
				quoteError = true;
			}
		} catch (err) {
			if (ctrl.signal.aborted) return;
			Sentry.captureException(err, { tags: { component: 'BuySellForm', action: 'fetch-offers' } });
			quoteError = true;
			offers = [];
		} finally {
			if (!ctrl.signal.aborted) {
				quoteLoading = false;
				quoteAbort = null;
			}
		}
	}

	// -----------------------------------------------------------------------
	// Provider redirect
	// -----------------------------------------------------------------------
	async function openRedirectUrl(url: string): Promise<Window | null> {
		const isNative = Capacitor.isNativePlatform();
		if (isNative && Capacitor.isPluginAvailable('Browser')) {
			debug.log('Opening redirect in Capacitor Browser: %s', url.substring(0, 80));
			await Browser.open({ url });
			return null;
		}
		debug.log('Opening redirect via window.open: %s', url.substring(0, 80));
		const popup = window.open(url, '_blank', 'noopener,noreferrer');
		debug.log('window.open returned: %s', popup ? 'Window' : 'null');
		return popup;
	}

	// -----------------------------------------------------------------------
	// Submit
	// -----------------------------------------------------------------------
	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (!amount || !selectedCountry) return;
		if (!selectedOffer && !needsBridgeAndSend) return;

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
					const redirectUrl = await offRampOrchestrator.openMoonPay(selectedCountry);
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

	// -----------------------------------------------------------------------
	// Stage helpers
	// -----------------------------------------------------------------------
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

	// -----------------------------------------------------------------------
	// Close
	// -----------------------------------------------------------------------
	function handleClose() {
		resetFormState({
			resetTab: true,
			resetAmount: true,
			resetOffers: true,
			resetOffRamp: true,
			resetSource: true
		});
		orchestrator.destroy();
		offRampOrchestrator.destroy();
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
				<IconPlus class="mr-1 h-4 w-4" />
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
				<IconMinus class="mr-1 h-4 w-4" />
				{$t('wallet.buy_sell.sell')}
			</button>
		</div>

		<!-- Country / State Selectors -->
		<BuySellCountrySelector
			{countries}
			{selectedCountry}
			{selectedState}
			{countriesLoading}
			{statesForSelected}
			onCountryChange={(code) => {
				selectedCountry = code;
				selectedState = '';
			}}
			onStateChange={(code) => {
				selectedState = code;
			}}
			onRefreshOffers={() => {
				if (amount && parseFloat(amount) > 0) fetchOffers(amount);
			}}
		/>

		<!-- Wallet + Asset Selector -->
		<SwapPartySelector
			label={activeTab === 'buy' ? $t('wallet.to') + ':' : $t('wallet.from') + ':'}
			selectedWalletId={source}
			onWalletSelect={(id) => (source = id)}
			connectedWallets={$connectedWalletsStore.wallets}
			walletBtcSatsFor={balances.walletBtcSatsFor}
			walletUsdt0For={balances.walletUsdt0For}
			btcPrice={btcPrice.price}
			selectedAssetId={selectedCrypto}
			onAssetSelect={(id) => handleCryptoChange(id)}
			assets={assetOptions}
		/>

		<!-- Transaction Form -->
		<div class="bg-base-200 rounded-xl p-4 sm:p-5">
			<form onsubmit={handleSubmit} class="space-y-4">
				{#if isFlowActive && flowState}
					{@const fs = flowState}
					<div class="bg-info/5 border-info/20 flex items-center gap-3 rounded-lg border p-3">
						{#if isTerminalStage(fs.stage)}
							<IconAlertCircle class="text-error h-4 w-4 shrink-0" />
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
						<AmountInputSection
							variant="direct"
							{amount}
							unit={showSats ? 'sats' : 'usd'}
							tokenPrefix={balances.isBtcDenominated ? undefined : '$'}
							supportsBtcUsdToggle={balances.isBtcDenominated}
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
							onMaxAmount={async () => setMaxAmount()}
							maxDisabled={balances.sellMaxDisabled}
							sliderDisabled={balances.sellMaxDisabled}
							showPercentSlider={true}
							percent={swapPercent}
							onPercentChange={applyPercent}
							disabled={false}
						/>
					{:else}
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
												aria-label={$t('wallet.buy_sell.clear')}
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
								{#each ['10', '20', '50', '100'] as quickAmount (quickAmount)}
									<button
										type="button"
										class="btn btn-ghost border-base-300 min-h-[44px] border text-sm active:scale-95"
										onclick={() => {
											amount = quickAmount;
											fetchOffers(quickAmount);
										}}
									>
										{$t(`wallet.buy_sell.quick_amount_${quickAmount}`)}
									</button>
								{/each}
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

				<!-- Sell button -->
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

				<!-- Off-ramp status cards -->
				{#if needsBridgeAndSend}
					<OffRampStatusCard
						{offRampStage}
						{offRampQuote}
						{offRampFlow}
						{depositAddressInput}
						{depositAddressError}
						{selectedCrypto}
						onDepositAddressChange={(val) => {
							depositAddressInput = val;
							if (val.trim()) depositAddressError = '';
						}}
						onStartOver={() => offRampOrchestrator.startOver()}
						onSubmit={() => handleSubmit(new Event('submit'))}
					/>
				{/if}

				<!-- Multi-hop flow info for rBTC -->
				{#if isMultiHop && activeTab === 'buy'}
					<p class="text-base-content/50 text-xs">
						{$t('wallet.buy_sell.multi_hop_label')}
						{$t('wallet.buy_sell.multi_hop_rbtc_desc')}
					</p>
				{/if}

				{#if !needsBridgeAndSend}
					<FiatOfferSection
						{filteredOffers}
						{allPaymentMethods}
						{activePaymentFilter}
						{selectedOffer}
						{quoteLoading}
						{quoteError}
						{supportedCryptoError}
						{providerExpanded}
						{amount}
						isBtcAsset={balances.isBtcAsset}
						{selectedCrypto}
						{activeTab}
						btcPrice={btcPrice.price}
						onFilterChange={(method) => {
							activePaymentFilter = method;
						}}
						onOfferSelect={(offer) => {
							selectedOffer = offer;
							selectedPaymentMethod = offer.paymentMethodOffer[0] ?? null;
							providerExpanded = false;
						}}
						onExpandToggle={() => (providerExpanded = !providerExpanded)}
					/>
				{/if}
			</form>
		</div>

		<!-- Sell flow note -->
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
