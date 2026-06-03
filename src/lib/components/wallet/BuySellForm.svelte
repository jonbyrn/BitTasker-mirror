<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import Drawer from '$lib/components/Drawer.svelte';
	import { walletStore, formatSats } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import WalletSelector from './WalletSelector.svelte';
	import AssetSelector from './AssetSelector.svelte';
	import type { AssetOption } from './AssetSelector.svelte';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { appStore } from '$lib/stores/app.store';
	import { reconnectPersistedWallets } from '$lib/services/external-wallet/reconnect';
	import * as Sentry from '@sentry/sveltekit';

	let { isOpen, onClose } = $props<{ isOpen: boolean; onClose: () => void }>();

	// Locale-aware formatter
	const usdFormatter = $derived(
		new Intl.NumberFormat($locale, {
			style: 'currency',
			currency: 'USD'
		})
	);

	// Restore persisted connected wallets and attempt SDK reconnection for live
	// balances. Uses the shared reconnect service (same as SwapForm + ConnectedWallets).
	reconnectPersistedWallets();

	let activeTab = $state<'buy' | 'sell'>('buy');
	let selectedCrypto = $state<'rbtc' | 'usdt0-arb' | 'wbtc-arb' | 'btc-onchain'>('rbtc');
	let amount = $state<string>('');
	let bankDetails = $state<string>('');
	let isLoading = $state(false);
	let quoteData = $state<{
		estimatedAmount: string;
		fee: string;
		totalCost: string;
		btcPrice: number;
	} | null>(null);
	let quoteLoading = $state(false);
	let quoteError = $state(false);

	let source = $state('builtin');
	let sourceExpanded = $state(false);
	let assetExpanded = $state(false);
	let sourceInitialized = $state(false);

	// % slider
	let swapPercent = $state(0);

	// Default wallet: built-in unless it's $0, then first connected wallet with balance > $0
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
		if ($connectedWalletsStore.wallets.length > 0 && !sourceInitialized) {
			source = defaultWalletId();
			sourceInitialized = true;
		} else if (
			sourceInitialized &&
			source !== 'builtin' &&
			!$connectedWalletsStore.wallets.some((w) => w.id === source)
		) {
			source = 'builtin';
		}
	});

	// Reset selectedCrypto if it becomes unavailable (e.g. btc-onchain when switching to built-in wallet)
	$effect(() => {
		if (selectedCrypto === 'btc-onchain' && !selectedSourceHasBtc) {
			selectedCrypto = 'rbtc';
		}
	});

	let isConnectedSource = $derived(source !== 'builtin');
	let isSatsField = $derived(activeTab === 'sell' && selectedCrypto !== 'usdt0-arb');

	// BTC on-chain detection — only for the currently selected connected wallet with Bitcoin
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

	let assetOptions = $derived.by<AssetOption[]>(() => {
		const opts: AssetOption[] = [
			{
				id: 'rbtc',
				label: $t('wallet.buy_sell.bitcoin_rbtc'),
				icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
				subLabel: 'Bitcoin on Rootstock',
				balance: rbtcBalanceDisplay
			},
			{
				id: 'usdt0-arb',
				label: $t('wallet.usdt0_arbitrum'),
				icon: '/images/chains/Tether-USD.svg',
				subLabel: 'USDT0 on Arbitrum',
				balance: usdtBalanceDisplay
			},
			{
				id: 'wbtc-arb',
				label: $t('wallet.wbtc_arbitrum'),
				icon: '/images/chains/arbitrum.png',
				subLabel: 'Wrapped BTC on Arbitrum',
				balance: wbtcBalanceDisplay
			}
		];
		if (selectedSourceHasBtc) {
			opts.push({
				id: 'btc-onchain',
				label: $t('wallet.buy_sell.bitcoin_btc'),
				icon: '/images/chains/Bitcoin.svg',
				subLabel: 'Bitcoin on-chain',
				balance: rbtcBalanceDisplay
			});
		}
		return opts;
	});

	function usdBalanceFor(wallet: { balances?: Record<string, { raw: string }> }): string {
		const cur = wallet.balances;
		if (!cur) return '$0.00';
		const sats = Number(cur.btc?.raw ?? 0) + Number(cur.rbtc?.raw ?? 0);
		const usdt = Number(cur.usdt?.raw ?? 0) / 1e18;
		const usd = (sats / 100_000_000) * btcPrice.price + usdt;
		return usdFormatter.format(usd);
	}

	function totalBuiltinUsd(): string {
		const sats = $walletStore.totalBalances.sats;
		const usdt = $walletStore.totalBalances.usdt;
		const usd = (sats / 100_000_000) * btcPrice.price + usdt;
		return usdFormatter.format(usd);
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

	let estimatedReceive = $derived(
		!amount || !selectedCrypto || !quoteData ? '0.00' : (quoteData.estimatedAmount ?? '0.00')
	);
	let estimatedSend = $derived(
		!amount || !selectedCrypto || !quoteData ? '0.00' : (quoteData.estimatedAmount ?? '0.00')
	);

	function convertToSats(value: string, tokenId: string): string {
		if (!value) return '0';
		const n = parseFloat(value);
		if (tokenId === 'rbtc' || tokenId === 'wbtc-arb')
			return Math.round(n * 100000000).toLocaleString();
		if (tokenId === 'usdt0-arb') return Math.round(n * 100).toLocaleString();
		return value;
	}

	function switchTab(tab: 'buy' | 'sell') {
		if (tab === activeTab) return;
		cancelQuoteFetch();
		activeTab = tab;
		amount = '';
		bankDetails = '';
		quoteData = null;
		quoteLoading = false;
		quoteError = false;
		swapPercent = 0;
		assetExpanded = false;
	}

	function handleCryptoChange(cryptoId: string) {
		cancelQuoteFetch();
		selectedCrypto = cryptoId as typeof selectedCrypto;
		amount = '';
		quoteData = null;
		quoteLoading = false;
		quoteError = false;
		swapPercent = 0;
		assetExpanded = false;
	}

	function setMaxAmount() {
		triggerHaptic(ImpactStyle.Light);
		let maxVal: string;
		if (isConnectedSource) {
			const w = $connectedWalletsStore.wallets.find((w) => w.id === source);
			if (selectedCrypto === 'rbtc') {
				const raw = Number(w?.balances?.rbtc?.raw ?? 0);
				maxVal = String(
					isNaN(raw) ? 0 : Math.floor(raw / (activeTab === 'sell' ? 1 : 100_000_000))
				);
			} else if (selectedCrypto === 'wbtc-arb') {
				const raw = Number(w?.balances?.wbtc?.raw ?? 0);
				maxVal = String(
					isNaN(raw) ? 0 : Math.floor(raw / (activeTab === 'sell' ? 1 : 100_000_000))
				);
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
					maxVal = String($walletStore.totalBalances.sats);
				} else if (selectedCrypto === 'wbtc-arb') {
					maxVal = String(Math.round(parseFloat(wbtcBalance) * 100_000_000));
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
		fetchQuoteForAmount(maxVal);
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
		const precision =
			selectedCrypto === 'rbtc' || selectedCrypto === 'btc-onchain' || selectedCrypto === 'wbtc-arb'
				? activeTab === 'sell'
					? 0
					: 6
				: 2;
		amount = val.toFixed(precision);
		if (val > 0 && pct > 0) fetchQuoteForAmount(amount);
		else {
			quoteData = null;
			quoteLoading = false;
		}
	}

	function handleAmountInput(e: Event) {
		const input = e.target;
		if (!(input instanceof HTMLInputElement)) return;
		const raw = input.value;
		amount = raw;
		if (raw && parseFloat(raw) > 0) {
			fetchQuoteForAmount(raw);
		} else {
			cancelQuoteFetch();
			quoteData = null;
			quoteLoading = false;
		}
	}

	let quoteAbort: AbortController | null = null;
	function cancelQuoteFetch() {
		quoteAbort?.abort();
		quoteAbort = null;
	}

	async function fetchQuoteForAmount(rawAmount: string) {
		cancelQuoteFetch();
		const ctrl = new AbortController();
		quoteAbort = ctrl;
		quoteLoading = true;
		quoteError = false;
		Sentry.addBreadcrumb({ category: 'wallet', message: 'Fetching buy/sell quote', level: 'info' });
		try {
			const price = await cryptoPriceService.getCurrentPrice('BTC');
			if (ctrl.signal.aborted) return;
			await new Promise((resolve) => setTimeout(resolve, 500));
			if (ctrl.signal.aborted) return;
			const amt = parseFloat(rawAmount);
			let estimatedAmount: string;
			if (
				selectedCrypto === 'rbtc' ||
				selectedCrypto === 'btc-onchain' ||
				selectedCrypto === 'wbtc-arb'
			) {
				estimatedAmount = (activeTab === 'buy' ? amt / price : (amt / 100_000_000) * price).toFixed(
					activeTab === 'buy' ? 6 : 2
				);
			} else {
				estimatedAmount = rawAmount;
			}
			if (ctrl.signal.aborted) return;
			quoteData = { estimatedAmount, fee: '0.5', totalCost: rawAmount, btcPrice: price };
		} catch (error) {
			if (ctrl.signal.aborted) return;
			console.error('Failed to fetch quote:', error);
			Sentry.captureException(error);
			quoteError = true;
			quoteData = null;
		} finally {
			if (!ctrl.signal.aborted) {
				quoteLoading = false;
				quoteAbort = null;
			}
		}
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (!amount || (activeTab === 'sell' && !bankDetails)) return;
		isLoading = true;
		Sentry.addBreadcrumb({
			category: 'wallet',
			message: 'Submitting buy/sell order',
			level: 'info'
		});
		try {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			appStore.showSuccessToast($t('wallet.buy_sell.order_submitted'));
			handleClose();
		} catch (error) {
			Sentry.captureException(error);
			appStore.showErrorToast($t('wallet.buy_sell.transaction_failed'));
		} finally {
			isLoading = false;
		}
	}

	function handleClose() {
		cancelQuoteFetch();
		activeTab = 'buy';
		amount = '';
		bankDetails = '';
		quoteData = null;
		quoteLoading = false;
		quoteError = false;
		isLoading = false;
		source = defaultWalletId();
		sourceInitialized = false;
		swapPercent = 0;
		assetExpanded = false;
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

		<!-- Wallet Accordion -->
		<WalletSelector
			label={activeTab === 'buy' ? $t('wallet.to') + ':' : $t('wallet.from') + ':'}
			selectedId={source}
			onSelect={(id) => (source = id)}
			builtinBalance={totalBuiltinUsd()}
			connectedWallets={$connectedWalletsStore.wallets}
			walletBalanceFor={(id) => {
				if (id === 'builtin') return totalBuiltinUsd();
				const w = $connectedWalletsStore.wallets.find((cw) => cw.id === id);
				return w ? usdBalanceFor(w) : '$0.00';
			}}
			expanded={sourceExpanded}
			onToggle={() => (sourceExpanded = !sourceExpanded)}
		/>

		<!-- Asset Selector -->
		<AssetSelector
			selectedId={selectedCrypto}
			onSelect={(id) => handleCryptoChange(id)}
			assets={assetOptions}
			expanded={assetExpanded}
			onToggle={() => (assetExpanded = !assetExpanded)}
		/>

		<!-- Transaction Form -->
		<div class="bg-base-200 rounded-xl p-4 sm:p-5">
			<div class="text-sm font-semibold sm:text-base">
				{activeTab === 'buy'
					? $t('wallet.buy_sell.pay_with_fiat_long')
					: $t('wallet.buy_sell.sell_to_fiat_long')}
			</div>
			<form onsubmit={handleSubmit} class="mt-3 space-y-4">
				<div class="form-control">
					<div class="flex items-start gap-2">
						<div class="join min-w-0 flex-1">
							<span
								class="btn join-item no-animation bg-base-200 text-base-content/70 min-h-[48px] border-r-0 text-sm sm:min-h-[52px]"
								>{isSatsField ? '₿' : '$'}</span
							>
							<input
								id="amount-input"
								type="number"
								class="input input-bordered join-item min-h-[48px] flex-1 text-base sm:min-h-[52px]"
								placeholder={isSatsField ? '0' : '0.00'}
								bind:value={amount}
								oninput={handleAmountInput}
								onkeypress={(e) => {
									if (isSatsField && e.key === '.') e.preventDefault();
								}}
								min="0"
								step={isSatsField ? '1' : '0.01'}
								pattern="[0-9]*"
								inputmode="numeric"
							/>
							{#if activeTab === 'sell'}
								<button
									type="button"
									class="btn btn-primary join-item min-h-[48px] rounded-r-lg sm:min-h-[52px]"
									onclick={setMaxAmount}
								>
									{$t('wallet.max')}
								</button>
							{/if}
						</div>
						<button
							type="submit"
							class="btn btn-primary min-h-[48px] shrink-0 sm:min-h-[52px]"
							disabled={isLoading || !amount || (activeTab === 'sell' && !bankDetails)}
						>
							{#if isLoading}<span class="loading loading-spinner loading-sm mr-1"></span>{/if}
							{activeTab === 'buy' ? $t('wallet.buy_sell.buy') : $t('wallet.buy_sell.sell')}
						</button>
					</div>
				</div>

				<!-- Quick amount buttons (buy only) -->
				{#if activeTab === 'buy'}
					<div class="flex flex-wrap justify-center gap-2">
						<button
							type="button"
							class="btn btn-ghost border-base-300 min-h-[44px] border text-sm active:scale-95"
							onclick={() => {
								amount = '10';
								fetchQuoteForAmount('10');
							}}>{$t('wallet.buy_sell.quick_amount_10')}</button
						>
						<button
							type="button"
							class="btn btn-ghost border-base-300 min-h-[44px] border text-sm active:scale-95"
							onclick={() => {
								amount = '20';
								fetchQuoteForAmount('20');
							}}>{$t('wallet.buy_sell.quick_amount_20')}</button
						>
						<button
							type="button"
							class="btn btn-ghost border-base-300 min-h-[44px] border text-sm active:scale-95"
							onclick={() => {
								amount = '50';
								fetchQuoteForAmount('50');
							}}>{$t('wallet.buy_sell.quick_amount_50')}</button
						>
						<button
							type="button"
							class="btn btn-ghost border-base-300 min-h-[44px] border text-sm active:scale-95"
							onclick={() => {
								amount = '100';
								fetchQuoteForAmount('100');
							}}>{$t('wallet.buy_sell.quick_amount_100')}</button
						>
					</div>
				{/if}

				<!-- Percent Slider (sell only) -->
				{#if activeTab === 'sell'}
					<div class="form-control py-1">
						<div class="flex items-center gap-3">
							<span class="text-primary min-w-[3ch] text-right text-sm font-semibold"
								>{swapPercent}%</span
							>
							<input
								id="swap-percent"
								type="range"
								min="0"
								max="100"
								step="1"
								value={swapPercent}
								class="range range-primary range-sm flex-1"
								oninput={(e) => {
									const input = e.target;
									if (!(input instanceof HTMLInputElement)) return;
									applyPercent(parseInt(input.value));
								}}
							/>
						</div>
					</div>
				{/if}

				{#if activeTab === 'sell'}
					<div class="form-control">
						<label for="bank-details" class="label py-1"
							><span class="label-text text-xs font-medium sm:text-sm"
								>{$t('wallet.buy_sell.bank_details')}</span
							></label
						>
						<input
							id="bank-details"
							type="text"
							class="input input-bordered min-h-[48px] text-base"
							placeholder={$t('wallet.buy_sell.bank_details_placeholder')}
							bind:value={bankDetails}
						/>
					</div>
				{/if}

				{#if amount && parseFloat(amount) > 0}
					<div class="bg-base-100 flex items-center gap-3 rounded-xl p-3 sm:p-4">
						<div class="bg-info/10 rounded-full p-2">
							{#if quoteLoading}
								<span class="loading loading-spinner loading-sm text-info"></span>
							{:else if quoteError}
								<svg
									class="text-error h-5 w-5"
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
							{:else}<svg
									class="text-info h-5 w-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/></svg
								>{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="text-base-content/60 text-xs sm:text-sm">
								{activeTab === 'buy'
									? $t('wallet.buy_sell.estimated_receive')
									: $t('wallet.buy_sell.estimated_send')}
							</div>
							<div class="text-sm font-semibold sm:text-base">
								{#if quoteLoading}
									<span class="text-base-content/40">...</span>
								{:else if quoteError}
									<span class="text-error">{$t('wallet.error.quote_failed')}</span>
								{:else if quoteData}{activeTab === 'sell' || selectedCrypto === 'usdt0-arb'
										? '$'
										: ''}{activeTab === 'buy' ? estimatedReceive : estimatedSend}
									<span class="text-base-content/60 ml-1 text-xs font-normal"
										>{activeTab === 'buy'
											? selectedCrypto === 'usdt0-arb'
												? $t('wallet.buy_sell.usdt_bsc')
												: selectedCrypto === 'btc-onchain'
													? $t('wallet.btc')
													: selectedCrypto === 'wbtc-arb'
														? $t('wallet.wbtc')
														: $t('wallet.rbtc')
											: $t('wallet.usdt')}</span
									>
								{:else}<span class="text-base-content/40">—</span>{/if}
							</div>
							{#if activeTab === 'buy' && selectedCrypto !== 'usdt0-arb' && quoteData}
								<div class="text-base-content/50 text-xs">
									{convertToSats(estimatedReceive, selectedCrypto)}
									{$t('wallet.sats')}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</form>
		</div>

		<!-- Changelly KYC note -->
		<div class="text-base-content/50 text-xs leading-relaxed">
			{$t('wallet.buy_sell.kyc_disclaimer')}
		</div>
	</div>
</Drawer>
