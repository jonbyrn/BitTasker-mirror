<script lang="ts">
	import type { WalletAsset } from '@bittasker/wallet-core';
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { allAssets, totalBalances, walletManager, walletStore, formatSats, isAssetsLoading } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { ethers } from 'ethers';
	import IconDownload from '~icons/mdi/download';
	import IconUpload from '~icons/mdi/upload';
	import IconCashMultiple from '~icons/mdi/cash-multiple';
	import IconSwapHorizontal from '~icons/mdi/swap-horizontal';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import IconHelpCircle from '~icons/mdi/help-circle';
	import IconRefresh from '~icons/mdi/refresh';
	import IconEye from '~icons/mdi/eye';
	import IconEyeOff from '~icons/mdi/eye-off';
	import IconChevronRight from '~icons/mdi/chevron-right';
	import HelpModal from '$lib/components/wallet/HelpModal.svelte';

	let {
		onReceive,
		onSend,
		onBuySell,
		onSwap,
		onTransactions
	}: {
		onReceive?: () => void;
		onSend?: () => void;
		onBuySell?: () => void;
		onSwap?: () => void;
		onTransactions?: () => void;
	} = $props();

	// Refresh state
	let isRefreshing = $state(false);

	// Balance visibility state
	let balancesHidden = $state(true);
	let countdownSeconds = $state(0);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	// Use actual sats from wallet (sum of all sats, not converted)
	let totalUsdValue = $derived($totalBalances.usd);
	let totalSats = $derived($totalBalances.sats);
	let bitcoinExpanded = $state(false);
	let usdExpanded = $state(false);

	// Historical balance and price tracking
	let historicalPrices = $state<{ [key: string]: number }>({});
	let historicalBalances = $state<{ [key: string]: number | null }>({});

	// Helper to convert wei to sats
	function weiToSatoshi(wei: bigint): number {
		const rbtc = Number(ethers.formatEther(wei));
		return Math.floor(rbtc * 100_000_000);
	}

	// Calculate historical balance from transactions
	function calculateHistoricalBalance(targetTimestamp: number): number | null {
		const transactions = $walletStore.transactions;
		if (transactions.length === 0) return null;

		// Get current balance
		const currentBalance = totalSats;
		
		// Filter transactions that occurred after the target time
		const relevantTxs = transactions.filter(tx => tx.timestamp > targetTimestamp);
		if (relevantTxs.length === 0) return currentBalance;

		// Sort by timestamp (oldest first) to work backwards
		const sortedTxs = [...relevantTxs].sort((a, b) => a.timestamp - b.timestamp);
		
		// Work backwards from current balance
		let historicalBalance = currentBalance;
		for (const tx of sortedTxs) {
			const txValueSats = weiToSatoshi(BigInt(tx.value || '0'));
			const txFeeSats = tx.fee ? Math.floor(tx.fee * 100_000_000) : 0;
			
			// Reverse the transaction effect
			const txType = String((tx as any).type || '');
			if (txType === 'receive' || txType === 'contract-receive') {
				historicalBalance -= txValueSats;
			} else if (txType === 'send' || txType === 'contract-send') {
				historicalBalance += txValueSats + txFeeSats;
			}
		}

		return Math.max(0, historicalBalance);
	}

	// Fetch historical Bitcoin price using crypto price service
	async function fetchHistoricalPrice(daysAgo: number): Promise<number | null> {
		try {
			const cacheKey = `btc_price_${daysAgo}d`;
			if (historicalPrices[cacheKey]) {
				return historicalPrices[cacheKey];
			}

			// Use the crypto price service which handles CORS properly
			const price = await cryptoPriceService.getHistoricalPrice(daysAgo);
			
			if (price !== null) {
				historicalPrices[cacheKey] = price;
			}
			
			return price;
		} catch (error) {
			console.warn(`[BalanceCard] Error fetching historical price for ${daysAgo}d ago:`, error);
			return null;
		}
	}

	// Calculate balance changes for different periods
	let balanceChanges = $state<Array<{
		label: string;
		satsChange: number | null;
		usdChange: number | null;
		satsPercentChange: number | null;
		usdPercentChange: number | null;
	}>>([
		{ label: '24h', satsChange: null, usdChange: null, satsPercentChange: null, usdPercentChange: null },
		{ label: '7d', satsChange: null, usdChange: null, satsPercentChange: null, usdPercentChange: null },
		{ label: '30d', satsChange: null, usdChange: null, satsPercentChange: null, usdPercentChange: null }
	]);

	// Update balance changes when balance or transactions change
	async function updateBalanceChanges() {
		if ($isAssetsLoading || isRefreshing || totalSats === undefined || totalUsdValue === undefined) {
			return;
		}

		const periods = [
			{ label: '24h', hours: 24, days: 1 },
			{ label: '7d', hours: 24 * 7, days: 7 },
			{ label: '30d', hours: 24 * 30, days: 30 }
		];
		
		const now = Date.now();
		const results = await Promise.all(periods.map(async (period) => {
			const targetTimestamp = now - (period.hours * 60 * 60 * 1000);
			
			// Calculate historical balance from transactions
			const historicalBalanceSats = calculateHistoricalBalance(targetTimestamp);
			
			// Fetch historical price
			const historicalPrice = await fetchHistoricalPrice(period.days);
			
			if (historicalBalanceSats === null || historicalPrice === null) {
				return {
					label: period.label,
					satsChange: null,
					usdChange: null,
					satsPercentChange: null,
					usdPercentChange: null
				};
			}

			// Calculate historical USD value using historical price
			const historicalUsdValue = (historicalBalanceSats / 100_000_000) * historicalPrice;
			
			// Calculate changes
			const satsChange = totalSats - historicalBalanceSats;
			const usdChange = totalUsdValue - historicalUsdValue;
			
			const satsPercentChange = historicalBalanceSats > 0 
				? ((satsChange / historicalBalanceSats) * 100) 
				: (totalSats > 0 ? 100 : 0);
			const usdPercentChange = historicalUsdValue > 0 
				? ((usdChange / historicalUsdValue) * 100) 
				: (totalUsdValue > 0 ? 100 : 0);
			
			return {
				label: period.label,
				satsChange,
				usdChange,
				satsPercentChange,
				usdPercentChange
			};
		}));

		balanceChanges = results as typeof balanceChanges;
	}

	// Update balance changes when balance or transactions change
	$effect(() => {
		// React to balance and transaction changes
		totalSats;
		totalUsdValue;
		$walletStore.transactions.length;
		
		updateBalanceChanges();
	});

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

	onDestroy(() => {
		if (countdownInterval) {
			clearInterval(countdownInterval);
		}
	});

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
</script>

<div class="space-y-4 flex flex-col h-full overflow-y-auto">
	<!-- Total Portfolio Value Card -->
	<div class="card bg-primary relative bg-linear-to-br text-white shadow-xl rounded-lg">
		<div class="card-body p-4">
			<div class="flex items-center justify-between">
				<div class="flex-1 min-h-[80px]">
					<p class="card-title text-white">{$t('wallet.total_balance')}</p>

					{#if $isAssetsLoading || isRefreshing}
						<!-- Loading state with reserved space -->
						<div class="flex items-center gap-2">
							<span class="loading loading-spinner loading-md"></span>
							<p class="text-2xl font-bold text-white opacity-70">
								{isRefreshing ? $t('wallet.rsk.refreshing') : $t('wallet.page.initializing')}
							</p>
						</div>
						<!-- USD field with spinner -->
						<p class="mt-1 text-white opacity-80 text-lg flex items-center">
							<span class="loading loading-spinner loading-sm ml-1"></span>
						</p>
					{:else if balancesHidden}
						<!-- Hidden balances state -->
						<p class="text-3xl font-bold text-white">
							•••••• {$t('wallet.sats')}
						</p>
						<p class="mt-1 text-white opacity-80 text-lg">
							≈ $•••••• {$t('wallet.usd')}
						</p>
					{:else if totalSats > 0}
						<!-- Show total sats -->
						<p class="text-3xl font-bold text-white">
							{formatSats(totalSats)} {$t('wallet.sats')}
						</p>

						{#if totalUsdValue > 0}
							<p class="mt-1 text-white opacity-80 text-lg">
								≈ ${totalUsdValue.toFixed(2)} {$t('wallet.usd')}
							</p>
						{:else}
							<!-- Show $0.00 to avoid layout shift when no assets -->
							<p class="mt-1 text-white opacity-80 text-lg">
								≈ $0.00 {$t('wallet.usd')}
							</p>
						{/if}
					{:else}
						<!-- Confirmed no assets - show 0 sats and $0.00 USD to avoid layout shift -->
						<p class="text-3xl font-bold text-white">
							0 {$t('wallet.sats')}
						</p>
						<p class="mt-1 text-white opacity-80 text-lg">
							≈ $0.00 {$t('wallet.usd')}
						</p>
					{/if}
				</div>
			</div>
		</div>
		<!-- Hide/Show Balances Toggle Button (Upper Right) -->
		<button
			class="absolute top-2 right-2 rounded-full p-2 bg-base-100 text-base-content shadow-2xl border-2 border-base-content/20 hover:bg-base-200 hover:shadow-3xl hover:scale-110 active:scale-95 transition-all duration-200 flex items-center gap-1"
			onclick={toggleBalances}
			aria-label={balancesHidden ? $t('wallet.show_balances') : $t('wallet.hide_balances')}
		>
			{#if balancesHidden}
				<IconEyeOff class="h-5 w-5" />
			{:else}
				<IconEye class="h-5 w-5" />
				{#if countdownSeconds > 0}
					<span class="text-xs font-semibold">{countdownSeconds}s</span>
				{/if}
			{/if}
		</button>
		<!-- Refresh Button (Lower Right) -->
		<button
			class="absolute bottom-2 right-2 rounded-full p-2 bg-base-100 text-base-content shadow-2xl border-2 border-base-content/20 hover:bg-base-200 hover:shadow-3xl hover:scale-110 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-2xl"
			onclick={handleRefresh}
			disabled={isRefreshing}
			aria-label={$t('wallet.refresh_balance')}
		>
			<IconRefresh class={isRefreshing ? 'h-5 w-5 animate-spin' : 'h-5 w-5'} />
		</button>
	</div>

	<!-- Historical Balance Indicators Card -->
	<div class="border-2 border-primary rounded-lg bg-base-100">
		<div class="py-3 px-4">
			<div class="grid grid-cols-3 gap-2 text-sm">
				{#each balanceChanges as change}
					<div class="flex flex-col items-center gap-1">
						<div class="text-base-content/70 font-medium">{change.label}</div>
						{#if balancesHidden}
							<div class="text-base-content/50">••••</div>
							<div class="text-base-content/50">••••</div>
						{:else if change.satsChange === null}
							<div class="text-base-content/50">—</div>
							<div class="text-base-content/50">—</div>
						{:else}
							{@const satsChange = change.satsChange ?? 0}
							{@const usdChange = change.usdChange ?? 0}
							{@const isZero = satsChange === 0 && usdChange === 0}
							{@const isBelowThreshold = Math.abs(usdChange) < 0.01}
							{@const isNeutral = isZero || isBelowThreshold}
							{@const isPositive = satsChange > 0 && !isNeutral}
							{@const formattedUsd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(usdChange))}
							{@const satsDisplay = isNeutral ? `${formatSats(Math.abs(satsChange))}` : (satsChange > 0 ? `+${formatSats(Math.abs(satsChange))}` : `-${formatSats(Math.abs(satsChange))}`)}
							{@const usdDisplay = isNeutral ? `$${formattedUsd}` : (usdChange > 0 ? `+$${formattedUsd}` : `-$${formattedUsd}`)}
							<div class="font-semibold {isNeutral ? 'text-base-content' : (isPositive ? 'text-success' : 'text-error')}">
								{satsDisplay} {$t('wallet.sats')}
							</div>
							<div class="text-base-content/70 {isNeutral ? '' : (isPositive ? 'text-success/80' : 'text-error/80')}">
								{usdDisplay}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Network Breakdown -->
	<div class="space-y-4">
		<!-- Bitcoin Accordion -->
		{#if true}
			{@const bitcoinAssets = $allAssets.filter((a: WalletAsset) => a.assetId === 'rbtc')}
			{@const bitcoinTotalSats = bitcoinAssets.reduce((sum: number, asset: WalletAsset) => sum + Math.floor(asset.balance * 100_000_000), 0)}
			{@const bitcoinTotalUsd = bitcoinAssets.reduce((sum: number, asset: WalletAsset) => sum + (asset.usdValue || 0), 0)}
			<div class="collapse collapse-arrow border-2 border-primary rounded-lg bg-base-100" class:collapse-open={bitcoinExpanded}>
			<button
				type="button"
				class="collapse-title min-h-0 py-3 px-4 pr-12 font-medium text-left flex items-center justify-between"
				onclick={() => {
					bitcoinExpanded = !bitcoinExpanded;
				}}
			>
				<div class="flex items-center gap-2 flex-1 min-w-0">
					<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-6 w-6 shrink-0" />
					<span>{$t('wallet.bitcoin')}</span>
					<div
						class="btn btn-ghost btn-xs p-1 ml-2 cursor-pointer shrink-0"
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
						<IconHelpCircle class="text-base-content/70 hover:text-base-content h-5 w-5" />
					</div>
				</div>
				<div class="text-right shrink-0 ml-2">
					{#if $isAssetsLoading || isRefreshing}
						<span class="loading loading-spinner loading-sm"></span>
					{:else if balancesHidden}
						<div class="font-semibold">
							•••••• {$t('wallet.sats')}
						</div>
						<div class="text-xs opacity-70">
							$••••••
						</div>
					{:else}
						<div class="font-semibold">
							{formatSats(bitcoinTotalSats)} {$t('wallet.sats')}
						</div>
						{#if bitcoinTotalUsd > 0}
							<div class="text-xs opacity-70">
								${bitcoinTotalUsd.toFixed(2)}
							</div>
						{/if}
					{/if}
				</div>
			</button>
			<div class="collapse-content">
				<div class="space-y-2 pb-2 px-4">
					<!-- L2 BTC Entry with Lightning Bolt Icon -->
					{#if bitcoinAssets.length > 0}
						{#each bitcoinAssets as asset (asset.assetId)}
							{@const balanceInSats = Math.floor(asset.balance * 100_000_000)}
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 text-yellow-500"
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
									<span class="font-medium">{$t('wallet.l2_btc')}</span>
								</div>
								<div class="text-right">
									{#if balancesHidden}
										<div class="font-semibold">
											•••••• {$t('wallet.sats')}
										</div>
										<div class="text-xs opacity-70">
											$••••••
										</div>
									{:else}
										<div class="font-semibold">
											{formatSats(balanceInSats)} {$t('wallet.sats')}
										</div>
										{#if asset.usdValue > 0}
											<div class="text-xs opacity-70">
												${asset.usdValue.toFixed(2)}
											</div>
										{/if}
									{/if}
								</div>
							</div>
						{/each}
					{:else}
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5 text-yellow-500"
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
								<span class="font-medium">{$t('wallet.l2_btc')}</span>
							</div>
							<div class="text-right">
								<div class="font-semibold">0 {$t('wallet.sats')}</div>
							</div>
						</div>
					{/if}

					<!-- BTC Entry (Coming Soon) -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-5 w-5 opacity-50" />
							<span class="text-base-content/50 font-medium">{$t('wallet.btc')}</span>
						</div>
						<div class="text-right">
							<span class="text-base-content/50 font-semibold">{$t('wallet.coming_soon')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
		{/if}

		<!-- USD Accordion -->
		{#if true}
			{@const usdAssets = $allAssets.filter((a: WalletAsset) => a.assetId === 'usdt' || a.assetId === 'bnb')}
			{@const usdTotal = usdAssets.reduce((sum: number, asset: WalletAsset) => sum + (asset.usdValue || 0), 0)}
			<div class="collapse collapse-arrow border-2 border-primary rounded-lg bg-base-100 opacity-50" class:collapse-open={usdExpanded}>
			<button
				type="button"
				class="collapse-title min-h-0 py-3 px-4 pr-12 font-medium text-left flex items-center justify-between"
				onclick={() => {
					usdExpanded = !usdExpanded;
				}}
			>
				<div class="flex items-center gap-2 flex-1 min-w-0">
					<img src="/images/chains/Tether-USD.svg" alt="USD" class="h-6 w-6 shrink-0" />
					<span class="text-base-content/70">{$t('wallet.usd')}</span>
				</div>
				<div class="text-right shrink-0 ml-2">
					<div class="font-semibold text-base-content/70">
						{$t('wallet.coming_soon')}
					</div>
				</div>
			</button>
			<div class="collapse-content">
				<div class="space-y-2 pb-2 px-2">
					<div class="flex items-center gap-2">
						<img
							src="/images/chains/Binance-logo.svg"
							alt="USDT (Binance Chain)"
							class="h-5 w-5 opacity-50"
						/>
						<span class="text-base-content/50 font-medium">{$t('wallet.usdt_binance_chain')}</span>
						<div class="text-base-content/50 ml-auto text-xs">
							{#if balancesHidden}
								$••••••
							{:else}
								${parseFloat($walletStore.bsc.formattedUsdtBalance || '0').toFixed(2)}
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						<img src="/images/chains/Tether-USD.svg" alt="USDT" class="h-5 w-5 opacity-50" />
						<span class="text-base-content/50 font-medium">{$t('wallet.usdt_liquid')}</span>
						<div class="text-base-content/50 ml-auto text-xs">
							{#if balancesHidden}
								$••••••
							{:else}
								$0.00
							{/if}
						</div>
					</div>
					<div class="mt-4 text-center">
						<p class="text-base-content/50 font-bold">{$t('wallet.coming_soon')}</p>
					</div>
				</div>
			</div>
		</div>
		{/if}
	</div>

	<!-- Transactions Button -->
	<div>
		<button
			type="button"
			class="collapse-title min-h-0 py-3 px-4 pr-12 font-medium text-left flex items-center justify-between w-full border-2 border-primary rounded-lg bg-base-100 hover:bg-base-200 transition-colors"
			onclick={() => {
				if (onTransactions) {
					onTransactions();
				} else {
					walletManager.setActiveTab('transactions');
				}
			}}
		>
			<div class="flex items-center gap-2 flex-1 min-w-0">
				<IconFormatListBulleted class="h-5 w-5 shrink-0" />
				<span>{$t('wallet.tab_transactions')}</span>
			</div>
			<div class="absolute right-3 flex items-center">
				<IconChevronRight class="h-6 w-6 shrink-0" />
			</div>
		</button>
	</div>

	<!-- Spacer to push buttons to bottom -->
	<div class="flex-1"></div>

	<!-- Learn More Section - Above buttons on mobile/tablet -->
	<div class="mt-4 md:hidden flex justify-center">
		<div class="text-base-content/70 text-sm">
			<HelpModal />
		</div>
	</div>

	<!-- Send and Receive Buttons -->
	<div class="mt-4 flex flex-col sm:flex-row gap-4">
		<button
			class="btn btn-secondary flex-1 py-3 order-1 sm:order-2"
			onclick={() => {
				if (onSend) {
					onSend();
				} else {
					walletManager.setActiveTab('send');
				}
			}}
		>
			<IconUpload class="mr-2 h-5 w-5" />
			{$t('wallet.send_button')}
		</button>
		<button
			class="btn btn-primary flex-1 py-3 order-2 sm:order-1"
			onclick={() => {
				if (onReceive) {
					onReceive();
				} else {
					walletManager.setActiveTab('receive');
				}
			}}
		>
			<IconDownload class="mr-2 h-5 w-5" />
			{$t('wallet.tab_receive')}
		</button>
	</div>

	<!-- Learn More Section - Below buttons on desktop -->
	<div class="mt-6 hidden md:flex justify-center">
		<div class="text-base-content/70 text-sm">
			<HelpModal />
		</div>
	</div>

	<!-- Recent Activity Summary -->
	<!-- <div class="card bg-base-200">
		<div class="card-body">
			<h4 class="mb-4 font-semibold">{$t('wallet.recent_transactions')}</h4>

			<div class="py-8 text-center opacity-70">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mx-auto mb-2 h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1"
						d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
					/>
				</svg>
				<p>{$t('wallet.no_transactions')}</p>
				<p class="mt-1 text-xs">{$t('wallet.view_all_transactions_tab')}</p>
			</div>
		</div>
	</div> -->
</div>

