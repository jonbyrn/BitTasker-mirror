<script lang="ts">
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';

	import { goto } from '$app/navigation';
	import BalanceCard from './_components/balanceTab/BalanceCard.svelte';
	import RecentTransactions from './_components/balanceTab/RecentTransactions.svelte';
	import PaymentRequestForm from './_components/PaymentRequestForm.svelte';
	import TransactionHistory from './_components/TransactionHistory.svelte';
	import SendForm from './_components/sendTab/SendForm.svelte';
	import SwapDashboard from './_components/SwapDashboard.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { walletStore, walletConnection, walletInfo, walletUI } from '$lib/stores/wallet.store';
	import { emergencyBlock } from '$lib/wallet/breez/requestThrottler';
	import { clearCache } from '$lib/wallet/helper';
	import { isWasmInitialized } from '$lib/wallet/breez/wasmLoader';

	// Emergency function to stop infinite loops
	function handleEmergencyBlock(): void {
		console.warn('[Wallet] Emergency block activated!');
		emergencyBlock(300000); // Block for 5 minutes
		clearCache(); // Clear helper caches
	}

	onMount(() => {
		if ($isWasmInitialized) {
			walletStore.initialize();
		}

		// Add event listeners for navigation from swap dashboard
		const handleNavigateToSend = () => walletStore.setActiveTab('send');
		const handleNavigateToReceive = () => walletStore.setActiveTab('receive');

		window.addEventListener('navigate-to-send', handleNavigateToSend);
		window.addEventListener('navigate-to-receive', handleNavigateToReceive);

		return () => {
			window.removeEventListener('navigate-to-send', handleNavigateToSend);
			window.removeEventListener('navigate-to-receive', handleNavigateToReceive);
		};
	});

	onDestroy(async () => {
		await walletStore.disconnectWallet();
	});
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-6 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">Bitcoin Wallet</h2>

	<!-- Connection Status -->
	{#if $walletConnection.isConnecting}
		<div class="alert alert-info mb-6">
			<div class="flex items-center">
				<span class="loading loading-spinner loading-sm mr-2"></span>
				<span>Initializing wallet...</span>
			</div>
		</div>
	{:else if $walletConnection.errorMessage}
		<div class="alert alert-error mb-6">
			<div>
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
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div>
					<h3 class="font-bold">Connection Error</h3>
					<div class="text-xs">{$walletConnection.errorMessage}</div>
				</div>
			</div>
			<button class="btn btn-outline btn-sm" onclick={() => walletStore.initialize()}>
				Retry
			</button>
		</div>
	{:else if $walletConnection.isConnected && $walletInfo}
		<!-- Tabs -->
		<div class="tabs tabs-boxed mb-6">
			<button
				class="tab {$walletUI.activeTab === 'balance' ? 'tab-active' : ''}"
				onclick={() => walletStore.setActiveTab('balance')}
			>
				Balance
			</button>
			<button
				class="tab {$walletUI.activeTab === 'receive' ? 'tab-active' : ''}"
				onclick={() => walletStore.setActiveTab('receive')}
			>
				Receive
			</button>
			<button
				class="tab {$walletUI.activeTab === 'send' ? 'tab-active' : ''}"
				onclick={() => walletStore.setActiveTab('send')}
			>
				Send
			</button>
			<!-- <button
				class="tab {$walletUI.activeTab === 'swaps' ? 'tab-active' : ''}"
				onclick={() => walletStore.setActiveTab('swaps')}
			>
				Swaps
			</button> -->
			<button
				class="tab {$walletUI.activeTab === 'transactions' ? 'tab-active' : ''}"
				onclick={() => walletStore.setActiveTab('transactions')}
			>
				Transactions
			</button>
		</div>

		<!-- Tab Content -->
		{#if $walletUI.activeTab === 'balance'}
			<div class="space-y-6">
				<!-- Balance Card -->
				<BalanceCard />

				<!-- Quick Actions -->
				<div class="grid grid-cols-2 gap-4">
					<button
						class="btn btn-outline btn-primary"
						onclick={() => walletStore.setActiveTab('receive')}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-5 w-5"
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
						Receive
					</button>
					<button
						class="btn btn-outline btn-primary"
						onclick={() => walletStore.setActiveTab('send')}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 15l7-7 7 7"
							/>
						</svg>
						Send
					</button>
				</div>

				<!-- Recent Transactions -->
				<RecentTransactions />
			</div>
		{/if}

		{#if $walletUI.activeTab === 'receive'}
			<div class="space-y-6">
				<h3 class="mb-3 text-lg font-semibold">Receive Bitcoin</h3>

				<!-- Request Payment Form -->
				<PaymentRequestForm />
			</div>
		{/if}

		{#if $walletUI.activeTab === 'send'}
			<div class="space-y-6">
				<!-- Enhanced Send Form with Multi-Asset Support -->
				<SendForm />
			</div>
		{/if}

		<!-- {#if $walletUI.activeTab === 'swaps'}
			<SwapDashboard />
		{/if} -->

		{#if $walletUI.activeTab === 'transactions'}
			<TransactionHistory />
		{/if}
	{/if}
</div>
