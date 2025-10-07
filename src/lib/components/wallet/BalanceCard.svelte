<script lang="ts">
	import { t } from 'svelte-i18n';
	import {
		allAssets,
		totalBalances,
		liquidConnection,
		rskConnection,
		bscConnection,
		walletManager,
		combinedWalletState,
		walletStore
	} from '$lib/stores/wallet.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import type { WalletAsset } from '$lib/stores/wallet.store';
	// Icon imports for unplugin-icons
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconDownload from '~icons/mdi/download';
	import IconUpload from '~icons/mdi/upload';
	import IconHelpCircle from '~icons/mdi/help-circle';
	
	// Import HelpModal component
	import HelpModal from './HelpModal.svelte';

	// Convert rBTC to sats using dynamic market rate or show separate balances on error
	let totalUsdValue = $derived($totalBalances.usd);
	let liquidSats = $derived($totalBalances.sats);
	let rbtcBalance = $derived($totalBalances.rbtc);
	let usdtBalance = $derived($totalBalances.usdt);
	let bnbBalance = $derived($totalBalances.bnb);
	let hasRbtcRateError = $derived($walletStore.rbtcRateError);
	let rbtcRate = $derived($walletStore.rbtcToBtcRate);

	// Only combine balances if we have a reliable exchange rate
	let canCombineBalances = $derived(!hasRbtcRateError && rbtcBalance > 0);
	let rbtcInSats = $derived(rbtcBalance * rbtcRate * 100_000_000);
	let totalSats = $derived(canCombineBalances ? liquidSats + rbtcInSats : liquidSats);
	let totalBtcEquivalent = $derived(totalSats / 100_000_000);

	async function copyLiquidAddress() {
		// Get the actual liquid address from walletInfo
		const walletInfo = $combinedWalletState.liquid.walletInfo;
		if (walletInfo?.walletInfo?.pubkey) {
			await copyToClipboard(walletInfo.walletInfo.pubkey);
			appStore.showSuccessToast($t('wallet.address_copied'));
		} else {
			appStore.showErrorToast('Liquid address not available');
		}
	}

	async function copyRskAddress() {
		const rskAddr = $combinedWalletState.rsk.address;
		if (rskAddr) {
			await copyToClipboard(rskAddr);
			appStore.showSuccessToast($t('wallet.address_copied'));
		}
	}

	async function copyBscAddress() {
		const bscAddr = $combinedWalletState.bsc.address;
		if (bscAddr) {
			await copyToClipboard(bscAddr);
			appStore.showSuccessToast($t('wallet.address_copied'));
		}
	}
</script>

<div class="space-y-4">
	<!-- Total Portfolio Value Card -->
	<div class="card bg-gradient-to-br bg-primary text-white shadow-xl">
		<div class="card-body">
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<h3 class="card-title text-white">{$t('wallet.total_balance')}</h3>

					{#if canCombineBalances}
						<!-- Combined balance when exchange rate is available -->
						<p class="text-3xl font-bold text-white">
							{totalSats.toLocaleString()} {$t('wallet.sats')}
						</p>
						<p class="text-white opacity-90">
							≈ {totalBtcEquivalent.toFixed(8)} BTC
						</p>
					{:else}
						<!-- Separate balances when rate is unavailable -->
						<div class="space-y-1">
							{#if liquidSats > 0}
								<div>
									<span class="text-2xl font-bold text-white">
										{liquidSats.toLocaleString()}
									</span>
									<span class="ml-2 text-sm text-white opacity-90">{$t('wallet.sats')}</span>
								</div>
							{/if}
							{#if rbtcBalance > 0}
								<div>
									<span class="text-2xl font-bold text-white">
										{rbtcBalance.toFixed(6)}
									</span>
									<span class="ml-2 text-sm text-white opacity-90">{$t('wallet.rbtc')}</span>
								</div>
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
							{/if}
							{#if usdtBalance > 0}
								<div>
									<span class="text-2xl font-bold text-white">
										{usdtBalance.toFixed(2)}
									</span>
									<span class="ml-2 text-sm text-white opacity-90">{$t('wallet.usdt')}</span>
								</div>
							{/if}
					{#if liquidSats === 0 && rbtcBalance === 0 && usdtBalance === 0}
								<p class="text-2xl font-bold text-white opacity-70">{$t('wallet.no_assets')}</p>
							{/if}
						</div>
					{/if}

					{#if totalUsdValue > 0}
						<p class="mt-1 text-white opacity-80">
							≈ ${totalUsdValue.toFixed(2)} {$t('wallet.usd')}
						</p>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="grid grid-cols-2 gap-4">
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
			<div class="card-body flex flex-col flex-1">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<img src="/images/chains/Bitcoin-Rootstock-logo.webp" alt="Rootstock Bitcoin" class="h-6 w-6" />
						<h4 class="font-semibold">{$t('wallet.rootstock_bitcoin')}</h4>
						<button class="btn btn-ghost btn-xs p-1" onclick={() => (document.querySelector('[data-help-modal]') as HTMLButtonElement)?.click()}>
							<IconHelpCircle class="h-5 w-5 text-base-content/70 hover:text-base-content" />
						</button>
					</div>
					<!-- Connection status badge - commented out -->
					<!--
					<div
						class="badge {$rskConnection.connected
							? 'badge-success'
							: 'badge-error'} badge-sm text-xs"
					>
						{$rskConnection.connected ? 'Connected' : 'Disconnected'}
					</div>
					-->

				</div>

				<div class="flex-1">
					{#if $allAssets.filter((a: WalletAsset) => a.assetId === 'rbtc').length > 0}
						<div class="space-y-2">
							{#each $allAssets.filter((a: WalletAsset) => a.assetId === 'rbtc') as asset (asset.assetId)}
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<img src={asset.icon} alt={asset.name} class="h-5 w-5" />
										<span class="font-medium">{asset.ticker}</span>
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
						</div>
					{:else}
						<div class="py-4 text-center opacity-70">
							<p>{$t('wallet.no_assets_loaded')}</p>
						</div>
					{/if}
				</div>

				{#if $combinedWalletState.rsk.address}
					<div class="mt-4">
						<div class="mb-1 text-xs opacity-70">{$t('wallet.address')}</div>
						<div class="relative">
							<button
								class="bg-base-300 hover:bg-base-100 w-full cursor-pointer rounded px-3 py-2 pr-10 text-left transition-colors"
								onclick={copyRskAddress}
								disabled={!$rskConnection.connected || !$combinedWalletState.rsk.address}
							>
								<code class="text-xs">
									{walletManager.formatAddress($combinedWalletState.rsk.address)}
								</code>
							</button>
							<div class="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
								<IconContentCopy class="h-4 w-4 opacity-70" />
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- USD Network Card -->
		<div class="card bg-base-200 flex flex-col opacity-50 pointer-events-none">
			<div class="card-body flex flex-col flex-1">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<img src="/images/chains/Tether-USD.svg" alt="USD" class="h-6 w-6" />
						<h4 class="font-semibold text-base-content/70">{$t('wallet.usd')}</h4>
					</div>
				</div>

				<div class="flex-1 flex flex-col">
					<div class="space-y-2">
						<div class="flex items-center gap-2">
							<img src="/images/chains/Binance-logo.svg" alt="USDT (Binance Chain)" class="h-5 w-5 opacity-50" />
							<span class="font-medium text-base-content/50">{$t('wallet.usdt_binance_chain')}</span>
							<div class="text-xs text-base-content/50 ml-auto">
								{$combinedWalletState.bsc.formattedUsdtBalance || '0.00'}
							</div>
						</div>
						<div class="flex items-center gap-2">
							<img src="/images/chains/Tether-USD.svg" alt="USDT" class="h-5 w-5 opacity-50" />
							<span class="font-medium text-base-content/50">{$t('wallet.usdt_liquid')}</span>
						</div>
					</div>
					<div class="flex-1"></div>
					<div class="mt-4 text-center">
						<p class="font-bold text-base-content/50">{$t('wallet.coming_soon')}</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Additional Coming Soon Networks -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<!-- Bitcoin Network Card -->
		<div class="card bg-base-200 flex flex-col opacity-50">
			<div class="card-body flex flex-col flex-1">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-6 w-6" />
						<h4 class="font-semibold text-base-content/70">{$t('wallet.bitcoin')}</h4>
					</div>
				</div>

				<div class="flex-1 flex flex-col">
					<div class="space-y-2">
						<div class="flex items-center gap-2">
							<img src="/images/chains/Bitcoin.svg" alt="BTC" class="h-5 w-5 opacity-50" />
							<span class="font-medium text-base-content/50">{$t('wallet.btc')}</span>
						</div>
						<div class="flex items-center gap-2">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-500 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
							</svg>
							<span class="font-medium text-base-content/50">{$t('wallet.lightning')}</span>
						</div>
					</div>
					<div class="flex-1"></div>
					<div class="mt-4 text-center">
						<p class="font-bold text-base-content/50">{$t('wallet.coming_soon')}</p>
					</div>
				</div>
			</div>
		</div>

	<!-- Liquid Network Card -->
	<div class="card bg-base-200 flex flex-col opacity-50">
		<div class="card-body flex flex-col flex-1">
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<img src="/images/chains/Liquid-Bitcoin.svg" alt="Liquid Network" class="h-6 w-6" />
					<h4 class="font-semibold">Liquid</h4>
				</div>
				<!-- Connection status badge - commented out -->
				<!--
				<div
					class="badge {$liquidConnection.connected
						? 'badge-success'
						: 'badge-error'} badge-sm text-xs"
				>
					{$liquidConnection.connected ? 'Connected' : 'Disconnected'}
				</div>
				-->
			</div>

			<!-- Original Liquid content - commented out for coming soon display -->
			<!--
			<div class="flex-1">
				{#if $allAssets.filter((a: WalletAsset) => a.network === 'Liquid').length > 0}
					<div class="space-y-2">
						{#each $allAssets.filter((a: WalletAsset) => a.network === 'Liquid') as asset (asset.assetId)}
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<img src={asset.icon} alt={asset.name} class="h-5 w-5" />
									<span class="font-medium">{asset.ticker}</span>
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
					</div>
				{:else}
					<div class="py-4 text-center opacity-70">
						<p>{$t('wallet.no_assets_loaded')}</p>
					</div>
				{/if}
			</div>

			{#if $combinedWalletState.liquid.walletInfo?.walletInfo?.pubkey}
				<div class="mt-4">
					<div class="mb-1 text-xs opacity-70">{$t('wallet.address')}</div>
					<div class="relative">
						<button
							class="bg-base-300 hover:bg-base-100 w-full cursor-pointer rounded px-3 py-2 pr-10 text-left transition-colors"
							onclick={copyLiquidAddress}
							disabled={!$liquidConnection.connected ||
								!$combinedWalletState.liquid.walletInfo?.walletInfo?.pubkey}
						>
							<code class="text-xs">
								{walletManager.formatAddress(
									$combinedWalletState.liquid.walletInfo.walletInfo.pubkey
								)}
							</code>
						</button>
						<div class="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
							<IconContentCopy class="h-4 w-4 opacity-70" />
						</div>
					</div>
				</div>
			{/if}
			-->

			<!-- Liquid USDT display -->
			<div class="flex-1 flex flex-col">
				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<img src="/images/chains/Liquid-Bitcoin.svg" alt="L-BTC" class="h-5 w-5" />
						<span class="font-medium">{$t('wallet.lbtc')}</span>
					</div>
				</div>
				<div class="flex-1"></div>
				<div class="mt-4 text-center">
					<p class="font-bold text-base-content/50">{$t('wallet.coming_soon')}</p>
				</div>
			</div>
		</div>
	</div>
	</div>

	<!-- Learn More Section -->
	<div class="mt-6 flex justify-center">
		<div class="text-sm text-base-content/70">
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
