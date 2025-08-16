<!--
	Swap Management Dashboard
	Shows active swaps, swap history, and quick actions
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { swapManager } from '$lib/integrations/boltz/swapManager';
	import { createBitcoinWallet } from '$lib/wallet/bitcoin/bitcoinWallet';
	import type { SwapMonitor, SwapStatusType } from '$lib/integrations/boltz/types';

	// State
	let activeSwaps = $state<SwapMonitor[]>([]);
	let swapHistory = $state<SwapMonitor[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	onMount(() => {
		loadSwaps();
		
		// Set up periodic refresh for active swaps
		const interval = setInterval(() => {
			if (activeSwaps.length > 0) {
				loadSwaps();
			}
		}, 30000); // Refresh every 30 seconds

		return () => clearInterval(interval);
	});

	async function loadSwaps() {
		try {
			isLoading = true;
			error = null;

			// Get all swaps from swap manager
			const allSwaps = swapManager.getAllSwaps();
			
			// Separate active and completed swaps
			activeSwaps = allSwaps.filter(swap => 
				swap.status !== 'transaction.confirmed' && 
				swap.status !== 'invoice.failedToPay' && 
				swap.status !== 'swap.refunded' &&
				swap.status !== 'transaction.refunded'
			);
			
			swapHistory = allSwaps.filter(swap => 
				swap.status === 'transaction.confirmed' || 
				swap.status === 'invoice.failedToPay' || 
				swap.status === 'swap.refunded' ||
				swap.status === 'transaction.refunded'
			).slice(0, 10); // Show last 10

		} catch (err) {
			console.error('Failed to load swaps:', err);
			error = 'Failed to load swap information';
		} finally {
			isLoading = false;
		}
	}

	function getStatusColor(status: SwapStatusType): string {
		switch (status) {
			case 'swap.created':
			case 'invoice.set':
			case 'invoice.pending':
				return 'badge-warning';
			case 'transaction.mempool':
				return 'badge-info';
			case 'transaction.confirmed':
			case 'invoice.paid':
				return 'badge-success';
			case 'invoice.failedToPay':
			case 'transaction.lockupFailed':
			case 'swap.expired':
				return 'badge-error';
			case 'swap.refunded':
			case 'transaction.refunded':
				return 'badge-neutral';
			default: return 'badge-ghost';
		}
	}

	function getStatusIcon(status: SwapStatusType): string {
		switch (status) {
			case 'swap.created':
			case 'invoice.set':
			case 'invoice.pending':
				return '⏳';
			case 'transaction.mempool':
				return '⏰';
			case 'transaction.confirmed':
			case 'invoice.paid':
				return '✅';
			case 'invoice.failedToPay':
			case 'transaction.lockupFailed':
			case 'swap.expired':
				return '❌';
			case 'swap.refunded':
			case 'transaction.refunded':
				return '↩️';
			default: return '❓';
		}
	}

	function formatAmount(amount: number): string {
		return (amount / 100_000_000).toFixed(8);
	}

	function formatDate(date: Date): string {
		return date.toLocaleDateString();
	}

	function getSwapTypeDisplay(type: string): string {
		switch (type) {
			case 'submarine': return '⚡ → ₿';
			case 'reverse': return '₿ → ⚡';
			default: return type;
		}
	}

    // TODO: To be tested
	async function handleRefund(swapId: string) {
		try {
			// Get a fresh Bitcoin address from the Bitcoin wallet
			const bitcoinWallet = createBitcoinWallet();
			const refundAddress = await bitcoinWallet.generateNewAddress();
			
			// Use medium fee rate for refunds
			const feeRates = await bitcoinWallet.getFeeEstimates();
			const refundFeeRate = feeRates.medium;
			
			await swapManager.refundSwap(swapId, refundAddress, refundFeeRate);
			await loadSwaps(); // Refresh the list
		} catch (err) {
			console.error('Failed to refund swap:', err);
			error = 'Failed to initiate refund';
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">Swap Management</h3>
		<button class="btn btn-sm btn-primary" onclick={loadSwaps}>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
			Refresh
		</button>
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="alert alert-outline alert-error">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 flex-shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{error}</span>
		</div>
	{/if}

	<!-- Loading State -->
	{#if isLoading}
		<div class="flex items-center justify-center py-8">
			<div class="loading loading-spinner loading-lg"></div>
			<span class="ml-3">Loading swaps...</span>
		</div>
	{:else}
		<!-- Active Swaps -->
		{#if activeSwaps.length > 0}
			<div class="space-y-4">
				<h4 class="text-md font-semibold">Active Swaps</h4>
				<div class="space-y-3">
					{#each activeSwaps as swap (swap.swapId)}
						<div class="card bg-base-200">
							<div class="card-body p-4">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<span class="text-xl">{getStatusIcon(swap.status)}</span>
										<div>
											<div class="font-semibold text-sm">
												{getSwapTypeDisplay(swap.type)} Swap
											</div>
											<div class="text-xs opacity-70">
												{formatAmount(swap.amount)} BTC
											</div>
										</div>
									</div>
									
									<div class="flex items-center gap-3">
										<div class="badge {getStatusColor(swap.status)}">
											{swap.status}
										</div>
										
										{#if swap.status === 'invoice.failedToPay' || swap.status === 'transaction.lockupFailed' || swap.status === 'swap.expired'}
											<button 
												class="btn btn-xs btn-outline"
												onclick={() => handleRefund(swap.swapId)}
											>
												Refund
											</button>
										{/if}
									</div>
								</div>
								
								<!-- Progress Indicator -->
								{#if swap.status === 'invoice.pending' || swap.status === 'transaction.mempool'}
									<div class="mt-3">
										<div class="text-xs text-base-content/70 mb-1">
											{swap.status === 'invoice.pending' ? 'Waiting for payment...' : 'Transaction in mempool...'}
										</div>
										<progress class="progress progress-primary w-full" value="50" max="100"></progress>
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<!-- No Active Swaps -->
			<div class="text-center py-8">
				<div class="text-4xl mb-2">🔄</div>
				<p class="text-base-content/70">No active swaps</p>
				<p class="text-sm text-base-content/50">Your swaps will appear here when you create them</p>
			</div>
		{/if}

		<!-- Quick Actions -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div class="card bg-base-100 border">
				<div class="card-body">
					<h5 class="card-title text-sm">⚡ → ₿ Lightning to Bitcoin</h5>
					<p class="text-sm text-base-content/70">
						Convert Lightning payments to Bitcoin using submarine swaps
					</p>
					<div class="card-actions justify-end">
						<button class="btn btn-sm btn-primary" onclick={() => window.dispatchEvent(new CustomEvent('navigate-to-send'))}>
							Create Swap
						</button>
					</div>
				</div>
			</div>
			
			<div class="card bg-base-100 border">
				<div class="card-body">
					<h5 class="card-title text-sm">₿ → ⚡ Bitcoin to Lightning</h5>
					<p class="text-sm text-base-content/70">
						Receive Lightning payments using your Bitcoin balance
					</p>
					<div class="card-actions justify-end">
						<button class="btn btn-sm btn-primary" onclick={() => window.dispatchEvent(new CustomEvent('navigate-to-receive'))}>
							Create Swap
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Swap History -->
		{#if swapHistory.length > 0}
			<div class="space-y-4">
				<h4 class="text-md font-semibold">Recent History</h4>
				<div class="overflow-x-auto">
					<table class="table table-zebra w-full">
						<thead>
							<tr>
								<th>Type</th>
								<th>Amount</th>
								<th>Status</th>
								<th>Date</th>
							</tr>
						</thead>
						<tbody>
							{#each swapHistory as swap (swap.swapId)}
								<tr>
									<td>
										<div class="flex items-center gap-2">
											<span>{getStatusIcon(swap.status)}</span>
											<span class="text-sm">{getSwapTypeDisplay(swap.type)}</span>
										</div>
									</td>
									<td class="font-mono text-sm">
										{formatAmount(swap.amount)} BTC
									</td>
									<td>
										<div class="badge {getStatusColor(swap.status)} badge-sm">
											{swap.status}
										</div>
									</td>
									<td class="text-sm text-base-content/70">
										{formatDate(swap.createdAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.card-body {
		transition: background-color 0.2s ease-in-out;
	}
	
	.card:hover .card-body {
		background-color: var(--fallback-b3, oklch(var(--b3)));
	}
</style>