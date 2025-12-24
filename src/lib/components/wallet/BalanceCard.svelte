<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onDestroy, onMount } from 'svelte';
	import {
		allAssets,
		totalBalances,
		walletManager,
		walletStore,
		formatSats
	} from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import IconHelpCircle from '~icons/mdi/help-circle';
	import IconRefresh from '~icons/mdi/refresh';
	import IconEye from '~icons/mdi/eye';
	import IconEyeOff from '~icons/mdi/eye-off';
	import BalanceHistory from '$lib/components/wallet/BalanceHistory.svelte';

	const { isLoading = false } = $props();

	// Refresh state
	let isRefreshing = $state(false);

	// Balance visibility state
	let balancesHidden = $state(process.env.NODE_ENV !== 'development');
	let countdownSeconds = $state(0);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	// Accordion expansion state
	let bitcoinExpanded = $state(false);
	let usdExpanded = $state(false);

	// Get Bitcoin asset (RBTC) - returns single asset or undefined
	let bitcoinAsset = $derived($allAssets.find((a) => a.assetId === 'rbtc'));

	// Get USD-based assets (USDT, BNB) - we need all of them for the accordion
	let usdAssets = $derived($allAssets.filter((a) => a.assetId === 'usdt' || a.assetId === 'bnb'));
	let usdtAsset = $derived(usdAssets.find((a) => a.assetId === 'usdt'));

	function showBalances() {
		balancesHidden = false;
		countdownSeconds = 15;

		// Clear existing interval if any
		if (countdownInterval) {
			clearInterval(countdownInterval);
		}

		// Start countdown
		countdownInterval = setInterval(() => {
			countdownSeconds--;
			if (countdownSeconds <= 0) {
				hideBalances();
			}
		}, 1000);
	}

	function hideBalances() {
		balancesHidden = true;
		countdownSeconds = 0;
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	}

	function toggleBalances() {
		if (balancesHidden) {
			showBalances();
		} else {
			hideBalances();
		}
	}

	async function handleRefresh() {
		if (isRefreshing) return;

		isRefreshing = true;
		try {
			await walletManager.loadAssets();
			appStore.showSuccessToast($t('wallet.balance_refreshed'));
		} catch (error) {
			console.error('Failed to refresh balances:', error);
			appStore.showErrorToast($t('wallet.refresh_failed'));
		} finally {
			isRefreshing = false;
		}
	}

	onDestroy(() => {
		if (countdownInterval) {
			clearInterval(countdownInterval);
		}
	});
</script>

<div class="flex flex-col space-y-3 sm:space-y-4">
	<!-- Total Portfolio Value Card -->
	<div class="card bg-primary relative rounded-lg bg-linear-to-br text-white shadow-xl">
		<div class="card-body p-3 sm:p-4">
			<div class="flex items-center justify-between">
				<div class="min-h-[70px] flex-1 sm:min-h-[80px]">
					<p class="card-title text-sm text-white sm:text-base">{$t('wallet.total_balance')}</p>

					{#if isLoading || isRefreshing}
						<!-- Loading state with reserved space -->
						<div class="flex items-center gap-2">
							<span class="loading loading-spinner loading-sm sm:loading-md"></span>
							<p class="text-xl font-bold text-white opacity-70 sm:text-2xl">
								{isRefreshing ? $t('wallet.rsk.refreshing') : $t('wallet.page.initializing')}
							</p>
						</div>
					{:else if balancesHidden}
						<!-- Hidden balances state -->
						<p class="text-3xl font-bold text-white">
							•••••• {$t('wallet.sats')}
						</p>
						<p class="mt-0.5 text-base text-white opacity-80 sm:mt-1 sm:text-lg">
							≈ $•••••• {$t('wallet.usd')}
						</p>
					{:else if $totalBalances.sats > 0}
						<!-- Show total sats -->
						<p class="text-2xl font-bold text-white sm:text-3xl">
							{formatSats($totalBalances.sats)}
							{$t('wallet.sats')}
						</p>

						{#if $totalBalances.usd > 0}
							<p class="mt-0.5 text-base text-white opacity-80 sm:mt-1 sm:text-lg">
								≈ ${$totalBalances.usd.toFixed(2)}
								{$t('wallet.usd')}
							</p>
						{:else}
							<!-- Show $0.00 to avoid layout shift when no assets -->
							<p class="mt-0.5 text-base text-white opacity-80 sm:mt-1 sm:text-lg">
								≈ $0.00 {$t('wallet.usd')}
							</p>
						{/if}
					{:else}
						<!-- Confirmed no assets - show 0 sats and $0.00 USD to avoid layout shift -->
						<p class="text-2xl font-bold text-white sm:text-3xl">
							0 {$t('wallet.sats')}
						</p>
						<p class="mt-0.5 text-base text-white opacity-80 sm:mt-1 sm:text-lg">
							≈ $0.00 {$t('wallet.usd')}
						</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Hide/Show Balances Toggle Button (Upper Right) -->
		<button
			class="bg-base-100 text-base-content border-base-content/20 hover:bg-base-200 hover:shadow-3xl absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full border-2 p-1.5 shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 sm:top-2 sm:right-2 sm:p-2"
			onclick={toggleBalances}
			aria-label={balancesHidden ? $t('wallet.show_balances') : $t('wallet.hide_balances')}
		>
			{#if balancesHidden}
				<IconEyeOff class="h-4 w-4 sm:h-5 sm:w-5" />
			{:else}
				<IconEye class="h-4 w-4 sm:h-5 sm:w-5" />
				{#if countdownSeconds > 0}
					<span class="text-xs font-semibold">{countdownSeconds}s</span>
				{/if}
			{/if}
		</button>
		<!-- Refresh Button (Lower Right) -->
		<button
			class="bg-base-100 text-base-content border-base-content/20 hover:bg-base-200 hover:shadow-3xl absolute right-1.5 bottom-1.5 rounded-full border-2 p-1.5 shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-2xl sm:right-2 sm:bottom-2 sm:p-2"
			onclick={handleRefresh}
			disabled={isRefreshing}
			aria-label={$t('wallet.refresh_balance')}
		>
			<IconRefresh class={isRefreshing ? 'h-4 w-4 animate-spin sm:h-5 sm:w-5' : 'h-4 w-4 sm:h-5 sm:w-5'} />
		</button>
	</div>

	<!-- Historical Balance Indicators -->
	<BalanceHistory {balancesHidden} />

	<!-- Network Breakdown -->
	<div class="space-y-2 sm:space-y-4">
		<!-- Bitcoin Accordion -->
		<div
			class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
			class:collapse-open={bitcoinExpanded}
		>
			<button
				type="button"
				class="collapse-title flex items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
				onclick={() => (bitcoinExpanded = !bitcoinExpanded)}
			>
				<div class="flex min-w-0 flex-1 items-center gap-2">
					<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
					<span>{$t('wallet.bitcoin')}</span>
					<div
						class="btn btn-ghost btn-xs ml-1 shrink-0 cursor-pointer p-0.5 sm:ml-2 sm:p-1"
						role="button"
						tabindex="0"
						onclick={(e) => {
							e.stopPropagation();
							(document.querySelector('[data-help-modal]') as HTMLButtonElement)?.click();
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								e.stopPropagation();
								(document.querySelector('[data-help-modal]') as HTMLButtonElement)?.click();
							}
						}}
					>
						<IconHelpCircle class="text-base-content/70 hover:text-base-content h-4 w-4 sm:h-5 sm:w-5" />
					</div>
				</div>
				<div class="ml-2 shrink-0 text-right">
					{#if isLoading || isRefreshing}
						<span class="loading loading-spinner loading-sm"></span>
					{:else if balancesHidden}
						<div class="text-sm font-semibold sm:text-base">
							•••••• {$t('wallet.sats')}
						</div>
						<div class="text-xs opacity-70">$••••••</div>
					{:else}
						<div class="text-sm font-semibold sm:text-base">
							{formatSats($totalBalances.sats)}
							{$t('wallet.sats')}
						</div>
						{#if bitcoinAsset?.usdValue}
							<div class="text-xs opacity-70">
								${bitcoinAsset.usdValue.toFixed(2)}
							</div>
						{/if}
					{/if}
				</div>
			</button>
			<div class="collapse-content">
				<div class="space-y-1.5 px-3 pb-1.5 sm:space-y-2 sm:px-4 sm:pb-2">
					<!-- L2 BTC Entry with Lightning Bolt Icon -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-1.5 sm:gap-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 text-yellow-500 sm:h-5 sm:w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
							<span class="text-sm font-medium sm:text-base">{$t('wallet.l2_btc')}</span>
						</div>
						<div class="text-right">
							{#if balancesHidden}
								<div class="text-sm font-semibold sm:text-base">
									•••••• {$t('wallet.sats')}
								</div>
								<div class="text-xs opacity-70">$••••••</div>
							{:else if bitcoinAsset}
								{@const balanceInSats = Math.floor(bitcoinAsset.balance * 100_000_000)}
								<div class="text-sm font-semibold sm:text-base">
									{formatSats(balanceInSats)}
									{$t('wallet.sats')}
								</div>
								{#if bitcoinAsset.usdValue > 0}
									<div class="text-xs opacity-70">
										${bitcoinAsset.usdValue.toFixed(2)}
									</div>
								{/if}
							{:else}
								<div class="text-sm font-semibold sm:text-base">0 {$t('wallet.sats')}</div>
							{/if}
						</div>
					</div>

					<!-- BTC Entry (Coming Soon) -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-1.5 sm:gap-2">
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-4 w-4 opacity-50 sm:h-5 sm:w-5" />
							<span class="text-base-content/50 text-sm font-medium sm:text-base">{$t('wallet.btc')}</span>
						</div>
						<div class="text-right">
							<span class="text-base-content/50 text-sm font-semibold sm:text-base">{$t('wallet.coming_soon')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- USD Accordion -->
		<div
			class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2 opacity-50"
			class:collapse-open={usdExpanded}
		>
			<button
				type="button"
				class="collapse-title flex min-h-0 items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
				onclick={() => {
					usdExpanded = !usdExpanded;
				}}
			>
				<div class="flex min-w-0 flex-1 items-center gap-2">
					<img src="/images/chains/Tether-USD.svg" alt="USD" class="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
					<span class="text-base-content/70">{$t('wallet.usd')}</span>
				</div>
				<div class="ml-2 shrink-0 text-right">
					<div class="text-base-content/70 text-sm font-semibold sm:text-base">
						{$t('wallet.coming_soon')}
					</div>
				</div>
			</button>
			<div class="collapse-content">
				<div class="space-y-1.5 px-2 pb-1.5 sm:space-y-2 sm:pb-2">
					<!-- USDT (Binance Chain) - show actual balance if available -->
					<div class="flex items-center gap-1.5 sm:gap-2">
						<img
							src="/images/chains/Binance-logo.svg"
							alt="USDT (Binance Chain)"
							class="h-4 w-4 opacity-50 sm:h-5 sm:w-5"
						/>
						<span class="text-base-content/50 text-sm font-medium sm:text-base">{$t('wallet.usdt_binance_chain')}</span>
						<div class="text-base-content/50 ml-auto text-xs">
							{#if balancesHidden}
								$••••••
							{:else if usdtAsset}
								${usdtAsset.usdValue.toFixed(2)}
							{:else}
								${parseFloat($walletStore.bsc.formattedUsdtBalance || '0').toFixed(2)}
							{/if}
						</div>
					</div>

					<!-- USDT (Liquid) - Coming Soon -->
					<div class="flex items-center gap-1.5 sm:gap-2">
						<img src="/images/chains/Tether-USD.svg" alt="USDT" class="h-4 w-4 opacity-50 sm:h-5 sm:w-5" />
						<span class="text-base-content/50 text-sm font-medium sm:text-base">{$t('wallet.usdt_liquid')}</span>
						<div class="text-base-content/50 ml-auto text-xs">
							{#if balancesHidden}
								$••••••
							{:else}
								$0.00
							{/if}
						</div>
					</div>

					<div class="mt-2 text-center sm:mt-4">
						<p class="text-base-content/50 text-sm font-bold sm:text-base">{$t('wallet.coming_soon')}</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
