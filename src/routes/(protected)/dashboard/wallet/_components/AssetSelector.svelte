<!--
	Asset Selector Component
	Dynamically loads and displays available assets with balances
-->
<script lang="ts">
	import { getAssetBalances } from '$lib/wallet/breez/walletService';
	import { createBitcoinWallet } from '$lib/wallet/bitcoin/bitcoinWallet';
	import { getAssetMetadata, getCurrentNetwork, getSupportedAssets } from '$lib/constants/assets';
	import { onMount } from 'svelte';

	interface Asset {
		id: string;
		name: string;
		ticker: string;
		balance: number;
		network: string;
		icon: string;
		precision: number;
		assetId: string;
	}

	// Props
	let { 
		selectedAsset = $bindable('L-BTC'),
		onAssetChange = () => {},
		onBalanceUpdate = () => {},
		showBalance = true,
		disabled = false,
		filterZeroBalances = false
	} = $props();

	// State
	let assets = $state<Asset[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let currentNetwork = getCurrentNetwork();

	// Bitcoin wallet instance for BTC balance
	const bitcoinWallet = createBitcoinWallet();

	onMount(async () => {
		await loadAssets();
	});

	async function loadAssets() {
		try {
			isLoading = true;
			error = null;

			// Get Liquid assets (L-BTC, USDT) from Breez
			const liquidAssets = await getAssetBalances();
			
			// Get Bitcoin balance from Bitcoin wallet
			let bitcoinBalance = 0;
			try {
				const btcWalletBalance = bitcoinWallet.getBalance();
				bitcoinBalance = btcWalletBalance.total;
			} catch (btcError) {
				console.warn('Could not load Bitcoin balance:', btcError);
			}

			// Build assets array dynamically
			const processedAssets: Asset[] = [];

			// Add all liquid assets that have metadata
			for (const liquidAsset of liquidAssets) {
				const metadata = getAssetMetadata(currentNetwork, liquidAsset.assetId);
				if (metadata) {
					// Only add if balance > 0 when filtering is enabled
					if (!filterZeroBalances || liquidAsset.balance > 0) {
						processedAssets.push({
							id: metadata.ticker,
							name: metadata.name,
							ticker: metadata.ticker,
							balance: liquidAsset.balance,
							network: 'Liquid',
							icon: metadata.icon,
							precision: metadata.precision,
							assetId: metadata.assetId
						});
					}
				} else {
					// Handle unknown assets gracefully
					if (!filterZeroBalances || liquidAsset.balance > 0) {
						processedAssets.push({
							id: liquidAsset.assetId.substring(0, 8),
							name: 'Unknown Asset',
							ticker: liquidAsset.assetId.substring(0, 8) + '...',
							balance: liquidAsset.balance,
							network: 'Liquid',
							icon: '?',
							precision: 8,
							assetId: liquidAsset.assetId
						});
					}
				}
			}

			// Add supported assets that don't have balances yet (for sending)
			if (!filterZeroBalances) {
				const supportedAssets = getSupportedAssets(currentNetwork);
				for (const supportedAsset of supportedAssets) {
					// Check if we already added this asset
					const exists = processedAssets.find(a => a.assetId === supportedAsset.assetId);
					if (!exists) {
						processedAssets.push({
							id: supportedAsset.ticker,
							name: supportedAsset.name,
							ticker: supportedAsset.ticker,
							balance: 0,
							network: 'Liquid',
							icon: supportedAsset.icon,
							precision: supportedAsset.precision,
							assetId: supportedAsset.assetId
						});
					}
				}
			}

			// Add Bitcoin if balance > 0 or if not filtering
			if (!filterZeroBalances || bitcoinBalance > 0) {
				processedAssets.push({
					id: 'BTC',
					name: 'Bitcoin',
					ticker: 'BTC',
					balance: bitcoinBalance,
					network: 'Bitcoin',
					icon: '₿',
					precision: 8,
					assetId: 'bitcoin'
				});
			}

			// Sort by balance (highest first), then by name
			processedAssets.sort((a, b) => {
				if (a.balance !== b.balance) {
					return b.balance - a.balance;
				}
				return a.name.localeCompare(b.name);
			});

			assets = processedAssets;

			// Auto-select first asset if current selection is not available
			if (assets.length > 0 && !assets.find(a => a.id === selectedAsset)) {
				selectedAsset = assets[0].id;
				onAssetChange(selectedAsset);
			}

			// Notify parent about balance update
			notifyBalanceUpdate();

		} catch (err) {
			console.error('Failed to load assets:', err);
			error = 'Failed to load asset balances';
		} finally {
			isLoading = false;
		}
	}
	
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

	function getSelectedAsset(): Asset | undefined {
		return assets.find(asset => asset.id === selectedAsset);
	}

	// Refresh assets manually
	function refreshAssets() {
		loadAssets();
	}
</script>

<div class="asset-selector">
	{#if error}
		<div class="alert alert-error">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 flex-shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{error}</span>
			<div class="alert-actions">
				<button class="btn btn-sm btn-outline" onclick={refreshAssets}>
					Retry
				</button>
			</div>
		</div>
	{:else if isLoading}
		<div class="flex items-center gap-3">
			<div class="loading loading-spinner loading-sm"></div>
			<span>Loading assets...</span>
		</div>
	{:else if assets.length === 0}
		<div class="alert alert-warning">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 flex-shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
			</svg>
			<span>No assets available</span>
		</div>
	{:else}
		<div class="dropdown dropdown-bottom w-full">
			<div tabindex="0" role="button" class="btn btn-outline w-full justify-between {disabled ? 'btn-disabled' : ''}">
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
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				{/if}
			</div>
			
			{#if !disabled}
				<ul class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-full mt-1 border">
					{#each assets as asset (asset.assetId)}
						<li>
							<button 
								class="flex items-center justify-between p-3 hover:bg-base-200 {asset.id === selectedAsset ? 'bg-base-200' : ''}"
								onclick={() => handleAssetSelect(asset.id)}
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
								
								{#if asset.id === selectedAsset}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
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
						<span class="font-medium">{formatBalance(asset.balance, asset.precision)} {asset.ticker}</span>
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