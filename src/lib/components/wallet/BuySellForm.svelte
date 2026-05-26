<script lang="ts">
	import { t } from 'svelte-i18n';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import Drawer from '$lib/components/Drawer.svelte';
	import { walletStore, formatSats } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';

	// Props
	let { isOpen, onClose } = $props<{
		isOpen: boolean;
		onClose: () => void;
	}>();

	// State
	let activeTab = $state<'buy' | 'sell'>('buy');
	let selectedCrypto = $state<'rbtc' | 'usdt-bsc'>('rbtc');
	let amount = $state<string>('');
	let bankDetails = $state<string>('');
	let isLoading = $state<boolean>(false);
	let quoteData = $state<{
		estimatedAmount: string;
		fee: string;
		totalCost: string;
		btcPrice: number;
	} | null>(null);
	let quoteLoading = $state<boolean>(false);

	// Source wallet
	let source = $state<string>('builtin');
	let sourceExpanded = $state(false);

	$effect(() => {
		if (source !== 'builtin' && !$connectedWalletsStore.wallets.some((w) => w.id === source)) {
			source = 'builtin';
		}
	});
	$effect(() => {
		if ($connectedWalletsStore.wallets.length > 0 && source === 'builtin') {
			source = $connectedWalletsStore.wallets[0].id;
		}
	});

	let isConnectedSource = $derived(source !== 'builtin');

	// Balances
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
		const btc = sats / 100_000_000;
		const usd = btc * btcPrice.price;
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

	const digitalAssetOptions = [
		{ id: 'rbtc', name: 'Bitcoin (rBTC)', icon: '/images/chains/Bitcoin-Rootstock-logo.webp' },
		{ id: 'usdt-bsc', name: 'USD (Binance)', icon: '/images/chains/Tether-USD.svg' }
	];

	let estimatedReceive = $derived(
		!amount || !selectedCrypto || !quoteData ? '0.00' : (quoteData.estimatedAmount ?? '0.00')
	);
	let estimatedSend = $derived(
		!amount || !selectedCrypto || !quoteData ? '0.00' : (quoteData.estimatedAmount ?? '0.00')
	);

	// Helpers
	function convertToSats(value: string, tokenId: string): string {
		if (!value) return '0';
		const numAmount = parseFloat(value);
		if (tokenId === 'rbtc') return Math.round(numAmount * 100000000).toLocaleString();
		if (tokenId === 'usdt-bsc') return Math.round(numAmount * 100).toLocaleString();
		return value;
	}

	// Tab switching
	function switchTab(tab: 'buy' | 'sell') {
		if (tab === activeTab) return;
		cancelQuoteFetch();
		activeTab = tab;
		amount = '';
		bankDetails = '';
		quoteData = null;
		quoteLoading = false;
	}

	// Crypto selection
	function handleCryptoChange(cryptoId: string) {
		if (cryptoId === 'rbtc' || cryptoId === 'usdt-bsc') {
			cancelQuoteFetch();
			selectedCrypto = cryptoId;
			amount = '';
			quoteData = null;
			quoteLoading = false;
		}
	}

	// Max amount
	function setMaxAmount() {
		triggerHaptic(ImpactStyle.Light);
		let maxVal: string;
		if (isConnectedSource) {
			const w = $connectedWalletsStore.wallets.find((w) => w.id === source);
			if (selectedCrypto === 'rbtc') {
				const raw = Number(w?.balances?.rbtc?.raw ?? 0);
				maxVal = String(isNaN(raw) ? 0 : Math.floor(raw / 100_000_000));
			} else {
				const raw = Number(w?.balances?.usdt?.raw ?? 0);
				maxVal = (isNaN(raw) ? 0 : raw / 1e18).toString();
			}
		} else {
			maxVal = selectedCrypto === 'rbtc' ? parseFloat(rbtcBalance).toString() : usdtBalance;
		}
		amount = maxVal;
		fetchQuoteForAmount(maxVal);
	}

	// Amount input
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
			if (selectedCrypto === 'rbtc') {
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

	// Submit
	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (!amount || (activeTab === 'sell' && !bankDetails)) return;
		isLoading = true;
		try {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			console.log('Transaction initiated:', {
				activeTab,
				selectedCrypto,
				amount,
				bankDetails,
				quoteData
			});
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
		source =
			$connectedWalletsStore.wallets.length > 0 ? $connectedWalletsStore.wallets[0].id : 'builtin';
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

		<!-- Source Wallet Accordion -->
		{#if $connectedWalletsStore.wallets.length > 0}
			<div class="form-control">
				<div
					class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
					class:collapse-open={sourceExpanded}
				>
					<button
						type="button"
						class="collapse-title flex min-h-0 items-center gap-2 px-3 py-2 text-sm font-medium"
						onclick={() => (sourceExpanded = !sourceExpanded)}
					>
						<span class="text-base-content/60">From:</span>
						{#if source === 'builtin'}
							<img src="/images/chains/Bitcoin-Rootstock-logo.webp" alt="rBTC" class="h-5 w-5" />
							<span>BitTasker Wallet</span>
						{:else}
							{@const w = $connectedWalletsStore.wallets.find((w) => w.id === source)}
							{#if w}
								<span class="text-lg"
									>{w.walletType === 'metamask'
										? '🦊'
										: w.walletType === 'walletconnect'
											? '🔗'
											: w.walletType === 'trezor'
												? '🔐'
												: '💾'}</span
								>
								<span class="font-medium">{w.walletName}</span>
								<span class="text-base-content/50 ml-auto truncate text-xs"
									>{w.address.slice(0, 10)}...{w.address.slice(-4)}</span
								>
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
								onclick={() => {
									source = 'builtin';
									sourceExpanded = false;
								}}
							>
								<img src="/images/chains/Bitcoin-Rootstock-logo.webp" alt="rBTC" class="h-5 w-5" />
								<span>BitTasker Wallet</span>
							</button>
						</div>
						<div class="divider my-1 text-xs">Connected</div>
						<div class="space-y-1">
							{#each $connectedWalletsStore.wallets as wallet (wallet.id)}
								<button
									class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {source ===
									wallet.id
										? 'bg-primary/10'
										: 'hover:bg-base-200'}"
									onclick={() => {
										source = wallet.id;
										sourceExpanded = false;
									}}
								>
									<span class="text-lg"
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
										<div class="truncate text-xs opacity-50">
											{wallet.address.slice(0, 10)}...{wallet.address.slice(-4)}
										</div>
									</div>
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
				{@const balanceText = asset.id === 'rbtc' ? rbtcBalanceDisplay : usdtBalanceDisplay}
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
					? $t('wallet.buy_sell.buy_with_fiat')
					: $t('wallet.buy_sell.sell_to_fiat')}
			</div>
			<form onsubmit={handleSubmit} class="mt-3 space-y-4">
				<div class="join w-full">
					<input
						id="amount-input"
						type="number"
						class="input input-bordered join-item min-h-[48px] flex-1 rounded-r-none text-base sm:min-h-[52px]"
						placeholder={$t('wallet.buy_sell.enter_amount')}
						bind:value={amount}
						oninput={handleAmountInput}
						min="0"
						step="0.01"
						pattern="[0-9]*"
						inputmode="numeric"
					/>
					{#if activeTab === 'sell'}
						<button
							type="button"
							class="btn btn-primary join-item min-h-[48px] touch-manipulation rounded-l-none active:scale-95 sm:min-h-[52px]"
							onclick={setMaxAmount}
							style="-webkit-tap-highlight-color: transparent;"
						>
							<span class="text-xs sm:text-sm">{$t('wallet.max')}</span>
						</button>
					{/if}
					<button
						type="submit"
						class="btn btn-primary join-item min-h-[48px] touch-manipulation rounded-l-none active:scale-95 sm:min-h-[52px]"
						disabled={isLoading || !amount || (activeTab === 'sell' && !bankDetails)}
					>
						{#if isLoading}<span class="loading loading-spinner loading-sm mr-1"></span>{/if}
						<span class="text-xs sm:text-sm"
							>{activeTab === 'buy' ? $t('wallet.buy_sell.buy') : $t('wallet.buy_sell.sell')}</span
						>
					</button>
				</div>

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
							{:else}
								<svg class="text-info h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/></svg
								>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="text-base-content/60 text-xs sm:text-sm">
								{activeTab === 'buy'
									? $t('wallet.buy_sell.estimated_receive')
									: $t('wallet.buy_sell.estimated_send')}
							</div>
							<div class="text-sm font-semibold sm:text-base">
								{#if quoteLoading}<span class="text-base-content/40">...</span>
								{:else if quoteData}{activeTab === 'buy' ? estimatedReceive : estimatedSend}<span
										class="text-base-content/60 ml-1 text-xs font-normal"
										>{activeTab === 'buy' ? selectedCrypto.toUpperCase() : '$'}</span
									>
								{:else}<span class="text-base-content/40">—</span>{/if}
							</div>
							{#if activeTab === 'buy' && quoteData}<div class="text-base-content/50 text-xs">
									{convertToSats(estimatedReceive, selectedCrypto)} sats
								</div>{/if}
						</div>
					</div>
				{/if}
			</form>
		</div>
	</div>
</Drawer>
