<script lang="ts">
	import type { WalletAsset } from '$lib/types/wallet';
	import { t } from 'svelte-i18n';
	import { allAssets, totalBalances, walletManager, walletStore } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import IconDownload from '~icons/mdi/download';
	import IconUpload from '~icons/mdi/upload';
	import IconHelpCircle from '~icons/mdi/help-circle';
	import IconRefresh from '~icons/mdi/refresh';
	import HelpModal from '$lib/components/wallet/HelpModal.svelte';

	// Refresh state
	let isRefreshing = $state(false);

	// Convert rBTC to sats using dynamic market rate or show separate balances on error
	let totalUsdValue = $derived($totalBalances.usd);
	let rbtcBalance = $derived($totalBalances.rbtc);
	let hasRbtcRateError = $derived($walletStore.rbtcRateError);
	let rbtcRate = $derived($walletStore.rbtcToBtcRate);

	let rbtcInSats = $derived(rbtcBalance * rbtcRate * 100_000_000);
	let totalSats = $derived(Math.floor(rbtcInSats));
	let totalBtcEquivalent = $derived(totalSats / 100_000_000);

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

<div class="space-y-4">
	<!-- Total Portfolio Value Card -->
	<div class="card bg-primary relative bg-linear-to-br text-white shadow-xl">
		<div class="card-body">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<h3 class="card-title text-white">{$t('wallet.total_balance')}</h3>

					{#if rbtcBalance > 0}
						<!-- Show rBTC balance as L2 BTC -->
						<p class="text-3xl font-bold text-white">
							{totalSats.toLocaleString()}
							{$t('wallet.sats')}
						</p>
						<p class="text-white opacity-90">
							≈ {totalBtcEquivalent.toFixed(8)} BTC
						</p>
						{#if hasRbtcRateError}
							<div class="mt-1">
								<p class="text-xs text-white opacity-70">
									⚠️ {$t('wallet.exchange_rate_unavailable')}
								</p>
								<button
									class="text-xs text-white underline opacity-80 hover:opacity-100"
									onclick={() => walletManager.retryRbtcExchangeRate()}
								>
									{$t('wallet.retry')}
								</button>
							</div>
						{/if}
					{:else}
						<!-- No balance state -->
						<p class="text-2xl font-bold text-white opacity-70">{$t('wallet.no_assets')}</p>
					{/if}

					{#if totalUsdValue > 0}
						<p class="mt-1 text-white opacity-80">
							≈ ${totalUsdValue.toFixed(2)}
							{$t('wallet.usd')}
						</p>
					{/if}
				</div>
			</div>
		</div>
		<button
			class="btn btn-outline btn-accent absolute top-2 right-2 rounded-full p-2"
			onclick={handleRefresh}
			disabled={isRefreshing}
			aria-label={$t('wallet.refresh_balance')}
		>
			<IconRefresh class={isRefreshing ? 'h-5 w-5 animate-spin' : 'h-5 w-5'} />
		</button>
	</div>

	<!-- Quick Actions -->
	<div class="grid grid-cols-2 gap-4 sm:gap-10">
		<button
			class="btn btn-outline btn-primary"
			onclick={() => walletManager.setActiveTab('receive')}
		>
			<IconDownload class="mr-2 h-5 w-5" />
			{$t('wallet.receive')}
		</button>
		<button class="btn btn-outline btn-primary" onclick={() => walletManager.setActiveTab('send')}>
			<IconUpload class="mr-2 h-5 w-5" />
			{$t('wallet.send_button')}
		</button>
	</div>

	<!-- Network Breakdown -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<!-- Rootstock Network Card -->
		<div class="card bg-base-200 flex flex-col">
			<div class="card-body flex flex-1 flex-col">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-6 w-6" />
						<h4 class="font-semibold">{$t('wallet.bitcoin')}</h4>
						<button
							class="btn btn-ghost btn-xs p-1"
							onclick={() =>
								(document.querySelector('[data-help-modal]') as HTMLButtonElement)?.click()}
						>
							<IconHelpCircle class="text-base-content/70 hover:text-base-content h-5 w-5" />
						</button>
					</div>
				</div>

				<div class="flex-1">
					<div class="space-y-2">
						<!-- L2 BTC Entry with Lightning Bolt Icon -->
						{#if $allAssets.filter((a: WalletAsset) => a.assetId === 'rbtc').length > 0}
							{#each $allAssets.filter((a: WalletAsset) => a.assetId === 'rbtc') as asset (asset.assetId)}
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
										<div class="font-semibold">{asset.formattedBalance}</div>
										{#if asset.usdValue > 0}
											<div class="text-xs opacity-70">
												${asset.usdValue.toFixed(2)}
											</div>
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
									<div class="font-semibold">0.000000</div>
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
		</div>

		<!-- USD Network Card -->
		<div class="card bg-base-200 pointer-events-none flex flex-col opacity-50">
			<div class="card-body flex flex-1 flex-col">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<img src="/images/chains/Tether-USD.svg" alt="USD" class="h-6 w-6" />
						<h4 class="text-base-content/70 font-semibold">{$t('wallet.usd')}</h4>
					</div>
				</div>

				<div class="flex flex-1 flex-col">
					<div class="space-y-2">
						<div class="flex items-center gap-2">
							<img
								src="/images/chains/Binance-logo.svg"
								alt="USDT (Binance Chain)"
								class="h-5 w-5 opacity-50"
							/>
							<span class="text-base-content/50 font-medium">{$t('wallet.usdt_binance_chain')}</span
							>
							<div class="text-base-content/50 ml-auto text-xs">
								${$walletStore.bsc.formattedUsdtBalance || '0.00'}
							</div>
						</div>
						<div class="flex items-center gap-2">
							<img src="/images/chains/Tether-USD.svg" alt="USDT" class="h-5 w-5 opacity-50" />
							<span class="text-base-content/50 font-medium">{$t('wallet.usdt_liquid')}</span>
							<div class="text-base-content/50 ml-auto text-xs">$0.000000</div>
						</div>
					</div>
					<div class="flex-1"></div>
					<div class="mt-4 text-center">
						<p class="text-base-content/50 font-bold">{$t('wallet.coming_soon')}</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Learn More Section -->
	<div class="mt-6 flex justify-center">
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
