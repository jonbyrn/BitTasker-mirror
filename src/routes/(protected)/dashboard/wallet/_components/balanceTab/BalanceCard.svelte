<script lang="ts">
	import { walletStore, walletAssets, walletBalance } from '$lib/stores/wallet.store';
	import type { EnhancedAsset } from '$lib/stores/wallet.store';

	// Get total balance in BTC equivalent
	function getTotalBtcBalance(): number {
		return $walletAssets.assets.reduce((total: number, asset: EnhancedAsset) => {
			if (asset.ticker === 'BTC' || asset.ticker === 'L-BTC') {
				return total + asset.balance / Math.pow(10, asset.precision);
			}
			// For other assets, would need conversion rates
			return total;
		}, 0);
	}
</script>

<div class="space-y-4">
	<!-- Total Balance Card -->
	<div class="card bg-primary text-primary-content">
		<div class="card-body">
			<h3 class="card-title text-lg">Total Balance</h3>

			<p class="text-4xl font-bold">{walletStore.formatSats($walletBalance.totalSats)} sats</p>
			<p class="opacity-80">≈ {walletStore.formatNumber(getTotalBtcBalance())} BTC</p>
			{#if $walletBalance.totalUsdt > 0}
				<p class="opacity-80">+ {walletStore.formatNumber($walletBalance.totalUsdt)} USDT</p>
			{/if}
		</div>
	</div>

	<!-- Asset Breakdown -->
	{#if $walletAssets.assets.length > 0}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			{#each $walletAssets.assets as asset (asset.assetId)}
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-2xl">{asset.icon}</span>
								<div>
									<div class="text-sm font-semibold">{asset.ticker}</div>
									<div class="text-xs opacity-70">{asset.name}</div>
								</div>
							</div>
							<div class="text-right">
								<div class="text-sm font-medium">
									{walletStore.formatNumber(parseFloat(asset.formattedBalance))}
								</div>
								<div class="text-xs opacity-70">{asset.ticker}</div>
								{#if asset.usdValue > 0}
									<div class="text-success text-xs">
										{walletStore.formatUsd(asset.usdValue)}
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<!-- Empty state -->
		<div class="card bg-base-200">
			<div class="card-body text-center">
				<h4 class="mb-2 text-lg font-semibold">💰 No Assets Found</h4>
				<p class="text-base-content/70 mb-4">
					Your wallet doesn't have any assets yet. Start by receiving some Bitcoin or Lightning
					payments.
				</p>
			</div>
		</div>
	{/if}

	<!-- Refresh Button -->
	<div class="flex justify-center">
		<button class="btn btn-outline btn-sm" onclick={() => walletStore.refreshAssets()}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-2 h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
				/>
			</svg>
			Refresh Balances
		</button>
	</div>
</div>
