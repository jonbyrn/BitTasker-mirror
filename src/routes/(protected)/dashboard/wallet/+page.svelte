<script lang="ts">
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';

	import type { GetInfoResponse } from '@breeztech/breez-sdk-liquid/web';
	import { wallet } from '$lib/utils/consts';
	import { getMnemonic } from '$lib/wallet/helper';
	import { goto } from '$app/navigation';
	import BalanceCard from './_components/balanceTab/BalanceCard.svelte';
	import RecentTransactions from './_components/balanceTab/RecentTransactions.svelte';
	import PaymentRequestForm from './_components/receiveTab/PaymentRequestForm.svelte';
	// import NetworkSelection from './_components/receiveTab/NetworkSelection.svelte';
	import TransactionHistory from './_components/transactionsTab/TransactionHistory.svelte';
	import EnhancedSendForm from './_components/sendTab/EnhancedSendForm.svelte';
	import SwapDashboard from './_components/swapTab/SwapDashboard.svelte';
	import { onMount, onDestroy } from 'svelte';
	import {
		connectToBreez,
		disconnect,
		getWalletInfo,
		isConnectedStore
	} from '$lib/wallet/breez/walletService';
	import { emergencyBlock } from '$lib/wallet/breez/requestThrottler';
	import { clearCache } from '$lib/wallet/helper';
	import { isWasmInitialized } from '$lib/wallet/breez/wasmLoader';

	// UI state
	let activeTab = $state<'balance' | 'receive' | 'send' | 'swaps' | 'transactions'>('balance');

	// Send form
	let sendAmount = $state('');
	let sendAddress = $state('');
	let sendNetworkFee = $state<'low' | 'medium' | 'high'>('medium');
	let sendError = $state('');

	// Wallet initialization state
	let isConnecting = $state(false);
	let errorMessage = $state<string | null>(null);
	let walletInfo = $state<GetInfoResponse | null>(null);

	// Format number with a specific number of decimals
	function formatNumber(number: number, decimals: number): string {
		return number.toFixed(decimals);
	}

	// Validate send form
	function validateSendForm(): boolean {
		if (!sendAmount || isNaN(parseFloat(sendAmount)) || parseFloat(sendAmount) <= 0) {
			sendError = 'Please enter a valid amount';
			return false;
		}

		if (parseFloat(sendAmount) > wallet.balance.btc) {
			sendError = 'Insufficient balance';
			return false;
		}

		if (!sendAddress.trim()) {
			sendError = 'Please enter a recipient address';
			return false;
		}

		sendError = '';
		return true;
	}

	// Send transaction
	function sendTransaction(): void {
		if (!validateSendForm()) {
			return;
		}

		// In a real implementation, this would call an API to send the transaction
		alert(`Transaction initiated: ${sendAmount} BTC to ${sendAddress}`);

		// Reset form
		sendAmount = '';
		sendAddress = '';
		sendNetworkFee = 'medium';
	}

	// Emergency function to stop infinite loops
	function handleEmergencyBlock(): void {
		console.warn('[Wallet] Emergency block activated!');
		emergencyBlock(300000); // Block for 5 minutes
		clearCache(); // Clear helper caches
	}

	// Initialize wallet connection
	async function initializeWallet() {
		if ($isConnectedStore) {
			return;
		}

		isConnecting = true;
		errorMessage = null;

		try {
			const mnemonic = await getMnemonic();

			await connectToBreez(mnemonic);

			walletInfo = await getWalletInfo();

			console.log({ walletInfo });
		} catch (error) {
			console.error('Failed to initialize wallet:', error);
			errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

			// Navigate to error page for specific errors
			if (error instanceof Error && error.message.includes('Mnemonic not found')) {
				goto('/dashboard/wallet/error?type=no-mnemonic');
			}
		} finally {
			isConnecting = false;
		}
	}

	// Clean up wallet connection
	async function cleanup() {
		try {
			if ($isConnectedStore) {
				await disconnect();
				walletInfo = null;
			}
		} catch (error) {
			console.error('Error during wallet cleanup:', error);
		}
	}

	$effect.pre(() => {
		console.log('pre effect', $isWasmInitialized);
		if ($isWasmInitialized) {
			initializeWallet();
		}
	});

	onMount(() => {
		// Add event listeners for navigation from swap dashboard
		const handleNavigateToSend = () => (activeTab = 'send');
		const handleNavigateToReceive = () => (activeTab = 'receive');

		window.addEventListener('navigate-to-send', handleNavigateToSend);
		window.addEventListener('navigate-to-receive', handleNavigateToReceive);

		return () => {
			window.removeEventListener('navigate-to-send', handleNavigateToSend);
			window.removeEventListener('navigate-to-receive', handleNavigateToReceive);
		};
	});

	onDestroy(() => {
		cleanup();
	});
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-6 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">Bitcoin Wallet</h2>

	<!-- Connection Status -->
	{#if isConnecting}
		<div class="alert alert-info mb-6">
			<div class="flex items-center">
				<span class="loading loading-spinner loading-sm mr-2"></span>
				<span>Initializing wallet...</span>
			</div>
		</div>
	{:else if errorMessage}
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
					<div class="text-xs">{errorMessage}</div>
				</div>
			</div>
			<button class="btn btn-outline btn-sm" onclick={initializeWallet}> Retry </button>
		</div>
	{:else if $isConnectedStore && walletInfo}
		<!-- Tabs -->
		<div class="tabs tabs-boxed mb-6">
			<button
				class="tab {activeTab === 'balance' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'balance')}
			>
				Balance
			</button>
			<button
				class="tab {activeTab === 'receive' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'receive')}
			>
				Receive
			</button>
			<button
				class="tab {activeTab === 'send' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'send')}
			>
				Send
			</button>
			<button
				class="tab {activeTab === 'swaps' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'swaps')}
			>
				Swaps
			</button>
			<button
				class="tab {activeTab === 'transactions' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'transactions')}
			>
				Transactions
			</button>
		</div>

		<!-- Tab Content -->
		{#if activeTab === 'balance'}
			<div class="space-y-6">
				<!-- Balance Card -->
				<BalanceCard />

				<!-- Quick Actions -->
				<div class="grid grid-cols-2 gap-4">
					<button class="btn btn-outline btn-primary" onclick={() => (activeTab = 'receive')}>
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
					<button class="btn btn-outline btn-primary" onclick={() => (activeTab = 'send')}>
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
				<RecentTransactions {activeTab} />
			</div>
		{/if}

		{#if activeTab === 'receive'}
			<div class="space-y-6">
				<h3 class="mb-3 text-lg font-semibold">Receive Bitcoin</h3>

				<!-- Network Selection -->
				<!-- TODO: Implement this section -->
				<!-- <NetworkSelection /> -->

				<!-- Request Payment Form -->
				<PaymentRequestForm />
			</div>
		{/if}

		{#if activeTab === 'send'}
			<div class="space-y-6">
				<!-- Enhanced Send Form with Multi-Asset Support -->
				<EnhancedSendForm />
			</div>
		{/if}

		{#if activeTab === 'swaps'}
			<SwapDashboard />
		{/if}

		{#if activeTab === 'transactions'}
			<TransactionHistory />
		{/if}
	{/if}
</div>
