<script lang="ts">
	import { t } from 'svelte-i18n';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import Drawer from '$lib/components/Drawer.svelte';
	import { walletStore, formatSats } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';

	let { isOpen, onClose } = $props<{ isOpen: boolean; onClose: () => void }>();

	let activeTab = $state<'buy' | 'sell'>('buy');
	let selectedCrypto = $state<'rbtc' | 'usdt-bsc' | 'btc-onchain'>('rbtc');
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

	let source = $state('builtin');
	let sourceExpanded = $state(false);
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
			const usdt = Number(b.usdt?.raw ?? 0);
			return sats > 0 || usdt > 0;
		});
		return firstWithBalance?.id ?? 'builtin';
	}

	$effect(() => {
		if (!sourceInitialized) {
			source = defaultWalletId();
			sourceInitialized = true;
		} else if (
			source !== 'builtin' &&
			!$connectedWalletsStore.wallets.some((w) => w.id === source)
		) {
			source = 'builtin';
		}
	});

	let isConnectedSource = $derived(source !== 'builtin');
	let isSatsField = $derived(activeTab === 'sell' && selectedCrypto !== 'usdt-bsc');

	// BTC on-chain detection
	let hasBtcWallet = $derived(
		$connectedWalletsStore.wallets.some(
			(w) =>
				w.walletType === 'trezor' ||
				w.walletType === 'ledger' ||
				Number(w.balances?.btc?.raw ?? 0) > 0
		)
	);

	let digitalAssetOptions = $derived.by(() => {
		const opts: { id: string; name: string; icon: string }[] = [
			{ id: 'rbtc', name: 'Bitcoin (rBTC)', icon: '/images/chains/Bitcoin-Rootstock-logo.webp' },
			{ id: 'usdt-bsc', name: 'USDT (Binance)', icon: '/images/chains/Tether-USD.svg' }
		];
		if (hasBtcWallet) {
			opts.push({ id: 'btc-onchain', name: 'Bitcoin (BTC)', icon: '/images/chains/Bitcoin.svg' });
		}
		return opts;
	});

	function usdBalanceFor(wallet: { balances?: Record<string, { raw: string }> }): string {
		const cur = wallet.balances;
		if (!cur) return '$0.00';
		const sats = Number(cur.btc?.raw ?? 0) + Number(cur.rbtc?.raw ?? 0);
		const usdt = Number(cur.usdt?.raw ?? 0) / 1e18;
		const usd = (sats / 100_000_000) * btcPrice.price + usdt;
		return usd.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function totalBuiltinUsd(): string {
		const sats = $walletStore.totalBalances.sats;
		const usdt = $walletStore.totalBalances.usdt;
		const usd = (sats / 100_000_000) * btcPrice.price + usdt;
		return usd.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
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
		return $walletStore.bsc?.formattedUsdtBalance || '0.00';
	});

	let rbtcBalanceDisplay = $derived.by(() => {
		const sats = Math.round(parseFloat(rbtcBalance) * 100_000_000);
		if (sats <= 0) return '0 Sats';
		const usd = (sats / 100_000_000) * btcPrice.price;
		const usdStr =
			usd >= 1
				? usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
				: `$${usd.toFixed(usd >= 0.01 ? 2 : 4)}`;
		return `${formatSats(sats)} (${usdStr})`;
	});

	let usdtBalanceDisplay = $derived.by(() => {
		const num = parseFloat(usdtBalance);
		if (num === 0) return '$0.00';
		return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
		if (tokenId === 'rbtc') return Math.round(n * 100000000).toLocaleString();
		if (tokenId === 'usdt-bsc') return Math.round(n * 100).toLocaleString();
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
		swapPercent = 0;
	}

	function handleCryptoChange(cryptoId: string) {
		cancelQuoteFetch();
		selectedCrypto = cryptoId as typeof selectedCrypto;
		amount = '';
		quoteData = null;
		quoteLoading = false;
		swapPercent = 0;
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
			} else if (selectedCrypto === 'btc-onchain') {
				const raw = Number(w?.balances?.btc?.raw ?? 0);
				maxVal = String(isNaN(raw) ? 0 : Math.floor(raw / 100_000_000));
			} else {
				const raw = Number(w?.balances?.usdt?.raw ?? 0);
				maxVal = (isNaN(raw) ? 0 : raw / 1e18).toString();
			}
		} else {
			if (selectedCrypto === 'rbtc' && activeTab === 'sell') {
				const sats = $walletStore.totalBalances.sats;
				maxVal = String(sats);
			} else {
				maxVal = selectedCrypto === 'rbtc' ? parseFloat(rbtcBalance).toString() : usdtBalance;
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
			else if (selectedCrypto === 'btc-onchain')
				fullBalance = Math.floor(
					Number(w.balances?.btc?.raw ?? 0) / (activeTab === 'sell' ? 1 : 100_000_000)
				);
			else fullBalance = Number(w.balances?.usdt?.raw ?? 0) / 1e18;
		} else {
			fullBalance =
				selectedCrypto === 'rbtc' && activeTab === 'sell'
					? $walletStore.totalBalances.sats
					: selectedCrypto === 'rbtc'
						? parseFloat(rbtcBalance)
						: parseFloat(usdtBalance);
		}
		const val = (fullBalance * pct) / 100;
		const precision =
			selectedCrypto === 'rbtc' || selectedCrypto === 'btc-onchain'
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
		const input = e.target as HTMLInputElement;
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
		try {
			const price = await cryptoPriceService.getCurrentPrice('BTC');
			if (ctrl.signal.aborted) return;
			await new Promise((resolve) => setTimeout(resolve, 500));
			if (ctrl.signal.aborted) return;
			const amt = parseFloat(rawAmount);
			let estimatedAmount: string;
			if (selectedCrypto === 'rbtc' || selectedCrypto === 'btc-onchain') {
				estimatedAmount = (activeTab === 'buy' ? amt / price : amt * price).toFixed(
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
		try {
			await new Promise((resolve) => setTimeout(resolve, 2000));
		} catch (error) {
			console.error('Transaction failed:', error);
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
		isLoading = false;
		source = defaultWalletId();
		sourceInitialized = false;
		swapPercent = 0;
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
			class="tabs tabs-boxed tabs-reversed border-base-300 mb-1 shrink-0 overflow-hidden rounded-lg border sm:mb-2"
		>
			<button
				class="tab flex-1"
				class:bg-primary={activeTab === 'buy'}
				class:text-primary-content={activeTab === 'buy'}
				class:tab-active={activeTab === 'buy'}
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
				class="tab flex-1"
				class:bg-primary={activeTab === 'sell'}
				class:text-primary-content={activeTab === 'sell'}
				class:tab-active={activeTab === 'sell'}
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
		{#if true}
			{@const builtinUsd = totalBuiltinUsd()}
			<div class="form-control">
				<div
					class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
					class:collapse-open={sourceExpanded}
				>
					<button
						type="button"
						class="collapse-title flex min-h-0 items-center gap-2 px-3 py-2 pr-10 pl-3 text-sm font-medium"
						onclick={() => (sourceExpanded = !sourceExpanded)}
					>
						<span class="text-base-content/60">{activeTab === 'buy' ? 'To:' : 'From:'}</span>
						{#if source === 'builtin'}
							<img
								src="/images/chains/Bitcoin-Rootstock-logo.webp"
								alt="rBTC"
								class="h-5 w-5 shrink-0"
							/>
							<span class="font-medium">BitTasker Wallet</span>
							<span class="text-base-content/50 ml-auto tabular-nums">{builtinUsd}</span>
						{:else}
							{@const w = $connectedWalletsStore.wallets.find((w) => w.id === source)}
							{#if w}
								<span class="shrink-0 text-lg"
									>{w.walletType === 'metamask'
										? '🦊'
										: w.walletType === 'walletconnect'
											? '🔗'
											: w.walletType === 'trezor'
												? '🔐'
												: '💾'}</span
								>
								<span class="font-medium">{w.walletName}</span>
								<span class="text-base-content/50 ml-auto tabular-nums">{usdBalanceFor(w)}</span>
							{/if}
						{/if}
					</button>
					<div class="collapse-content px-2">
						<div class="space-y-1">
							<button
								class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {source ===
								'builtin'
									? 'bg-primary/10'
									: 'hover:bg-base-200'}"
								onmousedown={() => {
									source = 'builtin';
									sourceExpanded = false;
								}}
							>
								<img
									src="/images/chains/Bitcoin-Rootstock-logo.webp"
									alt="rBTC"
									class="h-5 w-5 shrink-0"
								/>
								<div class="min-w-0 flex-1 text-left">
									<div class="text-sm font-medium">BitTasker Wallet</div>
								</div>
								<span class="ml-auto shrink-0 text-xs font-semibold tabular-nums">{builtinUsd}</span
								>
							</button>
						</div>
						{#if $connectedWalletsStore.wallets.length > 0}
							<div class="divider my-1 text-xs">Connected</div>
						{/if}
						<div class="space-y-1">
							{#each $connectedWalletsStore.wallets as wallet (wallet.id)}
								<button
									class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {source ===
									wallet.id
										? 'bg-primary/10'
										: 'hover:bg-base-200'}"
									onmousedown={() => {
										source = wallet.id;
										sourceExpanded = false;
									}}
								>
									<span class="shrink-0 text-lg"
										>{wallet.walletType === 'metamask'
											? '🦊'
											: wallet.walletType === 'walletconnect'
												? '🔗'
												: wallet.walletType === 'trezor'
													? '🔐'
													: '💾'}</span
									>
									<div class="min-w-0 flex-1 text-left">
										<div class="text-sm font-medium">{wallet.walletName}</div>
									</div>
									<span class="ml-auto shrink-0 text-xs font-semibold tabular-nums"
										>{usdBalanceFor(wallet)}</span
									>
								</button>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Digital Asset Selection -->
		<div class="space-y-2">
			{#each digitalAssetOptions as asset (asset.id)}
				{@const isSelected = selectedCrypto === asset.id}
				{@const balanceText = asset.id === 'usdt-bsc' ? usdtBalanceDisplay : rbtcBalanceDisplay}
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all duration-200 sm:p-4 {isSelected
						? 'border-primary bg-primary/5 shadow-sm'
						: 'border-base-300 hover:border-primary/30 hover:bg-base-200'} touch-manipulation active:scale-[0.98]"
					onclick={() => handleCryptoChange(asset.id)}
					style="-webkit-tap-highlight-color: transparent;"
				>
					<div
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 {isSelected
							? 'border-primary'
							: 'border-base-300'}"
					>
						{#if isSelected}<div class="bg-primary h-2.5 w-2.5 rounded-full"></div>{/if}
					</div>
					<div class="relative shrink-0">
						<img src={asset.icon} alt={asset.name} class="h-8 w-8 rounded-full sm:h-10 sm:w-10" />
						{#if asset.id === 'usdt-bsc'}
							<img
								src="/images/chains/Binance-logo.svg"
								alt="BSC"
								class="border-base-200 absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border sm:h-4 sm:w-4"
							/>
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-sm font-semibold sm:text-base">{asset.name}</div>
						<div class="text-base-content/60 text-xs sm:text-sm">
							{$t('wallet.available_balance')}: {balanceText}
						</div>
					</div>
				</button>
			{/each}
		</div>

		<!-- Transaction Form -->
		<div class="bg-base-200 rounded-xl p-4 sm:p-5">
			<div class="text-sm font-semibold sm:text-base">
				{activeTab === 'buy'
					? 'Pay with debit / credit card or bank transfer'
					: 'Sell to your bank account'}
			</div>
			<form onsubmit={handleSubmit} class="mt-3 space-y-4">
				<div class="form-control">
					<label for="amount-input" class="label py-1">
						<span class="label-text text-xs font-medium sm:text-sm">
							Amount: {activeTab === 'buy'
								? 'USD'
								: selectedCrypto === 'usdt-bsc'
									? 'USDT'
									: 'Sats'}
						</span>
					</label>
					<div class="join w-full">
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
				</div>

				<div class="mt-3">
					<button
						type="submit"
						class="btn btn-primary min-h-[48px] w-full sm:min-h-[52px]"
						disabled={isLoading || !amount || (activeTab === 'sell' && !bankDetails)}
					>
						{#if isLoading}<span class="loading loading-spinner loading-sm mr-1"></span>{/if}
						{activeTab === 'buy' ? $t('wallet.buy_sell.buy') : $t('wallet.buy_sell.sell')}
					</button>
				</div>

				<!-- Quick amount buttons (buy only) -->
				{#if activeTab === 'buy'}
					<div class="flex flex-wrap justify-center gap-2">
						<button
							type="button"
							class="btn btn-ghost btn-sm border-base-300 border"
							onclick={() => {
								amount = '10';
								fetchQuoteForAmount('10');
							}}>$10</button
						>
						<button
							type="button"
							class="btn btn-ghost btn-sm border-base-300 border"
							onclick={() => {
								amount = '20';
								fetchQuoteForAmount('20');
							}}>$20</button
						>
						<button
							type="button"
							class="btn btn-ghost btn-sm border-base-300 border"
							onclick={() => {
								amount = '50';
								fetchQuoteForAmount('50');
							}}>$50</button
						>
						<button
							type="button"
							class="btn btn-ghost btn-sm border-base-300 border"
							onclick={() => {
								amount = '100';
								fetchQuoteForAmount('100');
							}}>$100</button
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
								oninput={(e) => applyPercent(parseInt((e.target as HTMLInputElement).value))}
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
							{#if quoteLoading}<span class="loading loading-spinner loading-sm text-info"></span>
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
								{#if quoteLoading}<span class="text-base-content/40">...</span>
								{:else if quoteData}{activeTab === 'buy' ? estimatedReceive : estimatedSend}
									<span class="text-base-content/60 ml-1 text-xs font-normal"
										>{activeTab === 'buy'
											? selectedCrypto === 'usdt-bsc'
												? 'USDT (Binance Smart Chain)'
												: selectedCrypto === 'btc-onchain'
													? 'BTC'
													: 'rBTC'
											: selectedCrypto === 'usdt-bsc'
												? '$'
												: 'sats'}</span
									>
								{:else}<span class="text-base-content/40">—</span>{/if}
							</div>
							{#if activeTab === 'buy' && selectedCrypto !== 'usdt-bsc' && quoteData}
								<div class="text-base-content/50 text-xs">
									{convertToSats(estimatedReceive, selectedCrypto)} sats
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</form>
		</div>

		<!-- Changelly KYC note -->
		<div class="text-base-content/50 text-xs leading-relaxed">
			Powered by <strong>Changelly</strong> and their banking partners. A one-time KYC (identity verification)
			may be required for your first purchase or sale. This is handled securely by Changelly — BitTasker
			never sees your documents.
		</div>
	</div>
</Drawer>
