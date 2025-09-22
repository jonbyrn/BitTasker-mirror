<script lang="ts">
	import { t } from 'svelte-i18n';
	import {
		allAssets,
		totalBalances,
		liquidConnection,
		rskConnection,
		walletManager,
		combinedWalletState
	} from '$lib/stores/wallet.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import type { WalletAsset } from '$lib/stores/wallet.store';

	// Use totalBalances from store instead of calculating here
	let totalUsdValue = $derived($totalBalances.usd);
	let totalBtcEquivalent = $derived($totalBalances.sats / 100_000_000 + $totalBalances.rbtc);

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
</script>

<div class="space-y-4">
	<!-- Total Portfolio Value Card -->
	<div class="card bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-xl">
		<div class="card-body">
			<div class="flex items-center justify-between">
				<div>
					<h3 class="card-title text-white">{$t('wallet.total_balance')}</h3>
					<p class="text-3xl font-bold text-white">
						{$totalBalances.sats} sats
					</p>
					<p class="text-white opacity-90">
						≈ {totalBtcEquivalent.toFixed(8)} BTC
					</p>
					{#if totalUsdValue > 0}
						<p class="text-white opacity-80">
							≈ ${totalUsdValue.toFixed(2)} USD
						</p>
					{/if}
				</div>
				<div class="text-right">
					<div class="flex flex-col gap-1">
						<div class="badge badge-outline badge-lg border-white text-white">
							{$t('wallet.multi_network')}
						</div>
					</div>
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
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-2 h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
			{$t('wallet.receive')}
		</button>
		<button class="btn btn-outline btn-primary" onclick={() => walletManager.setActiveTab('send')}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-2 h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
			</svg>
			{$t('wallet.send_button')}
		</button>
	</div>

	<!-- Network Breakdown -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<!-- Liquid Network Card -->
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<div class="h-3 w-3 rounded-full bg-blue-500"></div>
						<h4 class="font-semibold">{$t('wallet.liquid_network')}</h4>
					</div>
					<div
						class="badge {$liquidConnection.connected
							? 'badge-success'
							: 'badge-error'} badge-sm text-xs"
					>
						{$liquidConnection.connected ? 'Connected' : 'Disconnected'}
					</div>
				</div>

				{#if $allAssets.filter((a: WalletAsset) => a.network === 'Liquid').length > 0}
					<div class="space-y-2">
						{#each $allAssets.filter((a: WalletAsset) => a.network === 'Liquid') as asset (asset.assetId)}
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span class="text-lg">{asset.icon}</span>
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

				{#if $combinedWalletState.liquid.walletInfo?.walletInfo?.pubkey}
					<div class="mt-4">
						<div class="mb-1 text-xs opacity-70">{$t('wallet.address')}</div>
						<div class="flex items-center gap-2">
							<code class="bg-base-300 flex-1 rounded px-2 py-1 text-xs">
								{walletManager.formatAddress(
									$combinedWalletState.liquid.walletInfo.walletInfo.pubkey
								)}
							</code>
						</div>
					</div>
				{/if}

				<!-- Quick Actions -->
				<div class="divider"></div>
				<div class="flex gap-2">
					<button
						class="btn btn-outline btn-xs flex-1"
						onclick={copyLiquidAddress}
						disabled={!$liquidConnection.connected ||
							!$combinedWalletState.liquid.walletInfo?.walletInfo?.pubkey}
					>
						{$t('wallet.copy_address')}
					</button>
				</div>
			</div>
		</div>

		<!-- Rootstock Network Card -->
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<div class="h-3 w-3 rounded-full bg-orange-500"></div>
						<h4 class="font-semibold">{$t('wallet.rootstock_network')}</h4>
					</div>
					<div
						class="badge {$rskConnection.connected
							? 'badge-success'
							: 'badge-error'} badge-sm text-xs"
					>
						{$rskConnection.connected ? 'Connected' : 'Disconnected'}
					</div>
				</div>

				<div class="space-y-2">
					{#each $allAssets.filter((a: WalletAsset) => a.assetId === 'rbtc') as asset (asset.assetId)}
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-lg">{asset.icon}</span>
								<span class="font-medium">{asset.ticker}</span>
							</div>
							<div class="text-right">
								<div class="font-semibold">{asset.formattedBalance}</div>
								<div class="text-xs opacity-70">rBTC</div>
							</div>
						</div>
					{/each}
				</div>

				{#if $combinedWalletState.rsk.address}
					<div class="mt-4">
						<div class="mb-1 text-xs opacity-70">{$t('wallet.address')}</div>
						<div class="flex items-center gap-2">
							<code class="bg-base-300 flex-1 rounded px-2 py-1 text-xs">
								{walletManager.formatAddress($combinedWalletState.rsk.address)}
							</code>
						</div>
					</div>
				{/if}

				<!-- Quick Actions -->
				<div class="divider"></div>
				<div class="flex gap-2">
					<button
						class="btn btn-outline btn-xs flex-1"
						onclick={copyRskAddress}
						disabled={!$rskConnection.connected || !$combinedWalletState.rsk.address}
					>
						{$t('wallet.copy_address')}
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Recent Activity Summary -->
	<div class="card bg-base-200">
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
	</div>
</div>
