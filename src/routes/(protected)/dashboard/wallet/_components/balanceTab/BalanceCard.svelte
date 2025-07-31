<script lang="ts">
	import { onMount } from 'svelte';
	import { getBalance } from '$lib/wallet/helper';
	import { getAssetBalances, fetchFiatRates } from '$lib/wallet/breez/walletService';
	import { createBitcoinWallet } from '$lib/wallet/bitcoin/bitcoinWallet';
	import { getAssetMetadata, getCurrentNetwork, getAssetId, type AssetMetadata } from '$lib/constants/assets';

	interface EnhancedAssetBalance extends AssetMetadata {
		balance: number;
		usdValue: number;
		formattedBalance: string;
	}

	let legacyBalance = $state<{ btc: number | undefined; sats: number; usdValue: number }>({
		btc: 0,
		sats: 0,
		usdValue: 0
	});

	let assetBalances = $state<EnhancedAssetBalance[]>([]);
	let totalUsdValue = $state(0);
	let isLoading = $state(true);
	let currentNetwork = getCurrentNetwork();

	// Bitcoin wallet for BTC balance
	const bitcoinWallet = createBitcoinWallet();

	onMount(() => {
		loadBalances();
		
		// Set up periodic refresh every 30 seconds
		const interval = setInterval(loadBalances, 30000);
		return () => clearInterval(interval);
	});

	async function loadBalances() {
		try {
			isLoading = true;
			
			// Load legacy balance for USD calculation
			legacyBalance = await getBalance();
			
			// Get fiat rates for USD conversion
			const fiatRates = await fetchFiatRates();
			const btcUsdRate = fiatRates.find(rate => rate.coin === 'BTC')?.value || 0;
			const usdtRate = 1; // USDT is pegged to USD
			
			// Load actual asset balances from Breez SDK
			const liquidAssets = await getAssetBalances();
			
			// Get Bitcoin balance from Bitcoin wallet
			let bitcoinBalance = 0;
			try {
				const btcWalletBalance = bitcoinWallet.getBalance();
				bitcoinBalance = btcWalletBalance.total;
			} catch (error) {
				console.warn('Could not load Bitcoin balance:', error);
			}

			// Process all liquid assets dynamically
			const processedAssets: EnhancedAssetBalance[] = [];
			
			// Add liquid assets (L-BTC, USDT, etc.)
			for (const asset of liquidAssets) {
				if (asset.balance > 0) {
					const metadata = getAssetMetadata(currentNetwork, asset.assetId);
					if (metadata) {
						const balanceInUnit = asset.balance / Math.pow(10, metadata.precision);
						let usdValue = 0;
						
						// Calculate USD value based on asset type
						if (asset.assetId === getAssetId('LBTC')) {
							usdValue = balanceInUnit * btcUsdRate;
						} else if (asset.assetId === getAssetId('USDT')) {
							usdValue = balanceInUnit * usdtRate;
						}
						
						processedAssets.push({
							...metadata,
							balance: asset.balance,
							usdValue,
							formattedBalance: balanceInUnit.toFixed(metadata.precision === 8 ? 8 : metadata.precision)
						});
					} else {
						// Handle unknown assets gracefully
						const balanceInUnit = asset.balance / 100_000_000; // Assume 8 decimals
						processedAssets.push({
							assetId: asset.assetId,
							name: 'Unknown Asset',
							ticker: asset.assetId.substring(0, 8) + '...',
							precision: 8,
							icon: '?',
							balance: asset.balance,
							usdValue: 0,
							formattedBalance: balanceInUnit.toFixed(8)
						});
					}
				}
			}
			
			// Add Bitcoin balance if > 0
			if (bitcoinBalance > 0) {
				const balanceInBtc = bitcoinBalance / 100_000_000;
				processedAssets.push({
					assetId: 'bitcoin',
					name: 'Bitcoin',
					ticker: 'BTC',
					precision: 8,
					icon: '₿',
					balance: bitcoinBalance,
					usdValue: balanceInBtc * btcUsdRate,
					formattedBalance: balanceInBtc.toFixed(8)
				});
			}
			
			assetBalances = processedAssets;
			
			// Calculate total USD value
			totalUsdValue = assetBalances.reduce((total, asset) => total + asset.usdValue, 0);

		} catch (error) {
			console.error('Failed to load balances:', error);
		} finally {
			isLoading = false;
		}
	}

	// Format balance for display
	function formatBalance(balance: number, precision: number): string {
		const divisor = Math.pow(10, precision);
		const formatted = (balance / divisor).toFixed(precision);
		return parseFloat(formatted).toString();
	}

	// Get total balance in BTC equivalent
	function getTotalBtcBalance(): number {
		return assetBalances.reduce((total, asset) => {
			if (asset.ticker === 'BTC' || asset.ticker === 'L-BTC') {
				return total + (asset.balance / Math.pow(10, asset.precision));
			}
			// For other assets, would need conversion rates
			return total;
		}, 0);
	}

	// Format USD value with proper formatting
	function formatUsd(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	// Clean up large numbers
	function formatNumber(value: number): string {
		return parseFloat(value.toFixed(8)).toString();
	}
</script>

<div class="space-y-4">
	<!-- Total Balance Card -->
	<div class="card bg-primary text-primary-content">
		<div class="card-body">
			<h3 class="card-title text-lg">Total Portfolio Value</h3>
			
			{#if isLoading}
				<div class="flex items-center gap-3">
					<div class="loading loading-spinner loading-md"></div>
					<span>Loading balances...</span>
				</div>
			{:else}
				<p class="text-4xl font-bold">{formatUsd(totalUsdValue)}</p>
				<p class="opacity-80">≈ {formatNumber(getTotalBtcBalance())} BTC equivalent</p>
			{/if}
		</div>
	</div>

	<!-- Asset Breakdown -->
	{#if !isLoading && assetBalances.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			{#each assetBalances as asset (asset.assetId)}
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-2xl">{asset.icon}</span>
								<div>
									<div class="font-semibold text-sm">{asset.ticker}</div>
									<div class="text-xs opacity-70">{asset.name}</div>
								</div>
							</div>
							<div class="text-right">
								<div class="font-medium text-sm">
									{formatNumber(parseFloat(asset.formattedBalance))}
								</div>
								<div class="text-xs opacity-70">{asset.ticker}</div>
								{#if asset.usdValue > 0}
									<div class="text-xs text-success">
										{formatUsd(asset.usdValue)}
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if !isLoading}
		<!-- Empty state -->
		<div class="card bg-base-200">
			<div class="card-body text-center">
				<div class="text-4xl mb-2">💰</div>
				<h4 class="text-lg font-semibold mb-2">No Assets Found</h4>
				<p class="text-base-content/70 mb-4">
					Your wallet doesn't have any assets yet. Start by receiving some Bitcoin or Lightning payments.
				</p>
			</div>
		</div>
	{/if}

	<!-- Refresh Button -->
	{#if !isLoading}
		<div class="flex justify-center">
			<button 
				class="btn btn-outline btn-sm"
				onclick={loadBalances}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
				</svg>
				Refresh Balances
			</button>
		</div>
	{/if}
</div>