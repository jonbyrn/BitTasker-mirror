<!--
	Asset Selector Component
	Dynamically loads and displays available assets with balances
-->
<script lang="ts">
	import { walletAssets } from '$lib/stores/wallet.store';
	import { derived } from 'svelte/store';

	// Props
	let {
		selectedAsset = $bindable('L-BTC'),
		onAssetChange = () => {},
		onBalanceUpdate = () => {},
		showBalance = true,
		disabled = false,
		filterZeroBalances = false
	} = $props();

	// Filtered assets based on props
	const filteredAssets = derived(walletAssets, (assets) => {
		if (!filterZeroBalances) return assets;
		return assets.filter((asset) => asset.balance > 0);
	});

	// Auto-select first asset if current selection is not available
	$effect(() => {
		if (
			$filteredAssets.length > 0 &&
			!$filteredAssets.find((a) => a.ticker === selectedAsset || a.assetId === selectedAsset)
		) {
			selectedAsset = $filteredAssets[0].ticker;
			onAssetChange(selectedAsset);
			notifyBalanceUpdate();
		}
	});

	function notifyBalanceUpdate() {
		const currentAsset = getSelectedAsset();
		if (currentAsset && onBalanceUpdate) {
			onBalanceUpdate(currentAsset.balance, currentAsset.precision, currentAsset.ticker);
		}
	}

	function handleAssetSelect(assetId: string) {
		if (disabled) return;

		selectedAsset = assetId;
		onAssetChange(assetId);
		notifyBalanceUpdate();
	}

	function formatBalance(balance: number, precision: number): string {
		const divisor = Math.pow(10, precision);
		const formatted = (balance / divisor).toFixed(precision);

		// Remove trailing zeros
		return parseFloat(formatted).toString();
	}

	function getSelectedAsset() {
		return $filteredAssets.find(
			(asset) => asset.ticker === selectedAsset || asset.assetId === selectedAsset
		);
	}
</script>

<div class="asset-selector">
	{#if $filteredAssets.length === 0}
		<div class="alert alert-warning">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 flex-shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
				/>
			</svg>
			<span>No assets available</span>
		</div>
	{:else}
		<div class="dropdown dropdown-bottom w-full">
			<div
				tabindex="0"
				role="button"
				class="btn btn-outline w-full justify-between {disabled ? 'btn-disabled' : ''}"
			>
				{#if getSelectedAsset()}
					{@const asset = getSelectedAsset()}
					{#if asset}
						<div class="flex items-center gap-3">
							<span class="text-2xl">{asset.icon}</span>
							<div class="text-left">
								<span class="font-semibold">{asset.ticker}</span>
								<span class="text-xs opacity-70">({asset.network})</span>
							</div>
						</div>
						{#if showBalance}
							<div class="text-right">
								<span class="font-medium">{formatBalance(asset.balance, asset.precision)}</span>
								<span class="text-xs opacity-70">{asset.ticker}</span>
							</div>
						{/if}
					{:else}
						<span>Select Asset</span>
					{/if}
				{:else}
					<span>Select Asset</span>
				{/if}

				{#if !disabled}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				{/if}
			</div>

			{#if !disabled}
				<ul
					class="dropdown-content menu bg-base-100 rounded-box z-[1] mt-1 w-full border p-2 shadow"
				>
					{#each $filteredAssets as asset (asset.assetId)}
						<li>
							<button
								class="hover:bg-base-200 flex items-center justify-between p-3 {asset.ticker ===
								selectedAsset
									? 'bg-base-200'
									: ''}"
								onclick={() => handleAssetSelect(asset.ticker)}
							>
								<div class="flex items-center gap-3">
									<span class="text-2xl">{asset.icon}</span>
									<div>
										<div class="font-semibold">{asset.name}</div>
										<div class="text-xs opacity-70">{asset.network} Network</div>
									</div>
								</div>

								{#if showBalance}
									<div class="text-right">
										<span class="font-medium">{formatBalance(asset.balance, asset.precision)}</span>
										<span class="text-xs opacity-70">{asset.ticker}</span>
									</div>
								{/if}

								{#if asset.ticker === selectedAsset}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="text-primary h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- Asset Info -->
		{#if getSelectedAsset() && !showBalance}
			{@const asset = getSelectedAsset()}
			{#if asset}
				<div class="mt-2 text-sm">
					<div class="flex justify-between">
						<span class="opacity-70">Available Balance:</span>
						<span class="font-medium"
							>{formatBalance(asset.balance, asset.precision)} {asset.ticker}</span
						>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.asset-selector {
		width: 100%;
	}

	.dropdown-content {
		max-height: 300px;
		overflow-y: auto;
	}
</style>
