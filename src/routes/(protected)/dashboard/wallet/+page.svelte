<script lang="ts">
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';
	import { onMount, onDestroy } from 'svelte';
	import { walletStore, walletConnection, walletInfo, walletUI } from '$lib/stores/wallet.store';
	import { initWasm, isWasmInitialized } from '$lib/wallet/breez/wasmLoader';
	import BalanceCard from '$lib/components/wallet/balanceTab/BalanceCard.svelte';
	import RecentTransactions from '$lib/components/wallet/balanceTab/RecentTransactions.svelte';
	import PaymentRequestForm from '$lib/components/wallet/PaymentRequestForm.svelte';
	import TransactionHistory from '$lib/components/wallet/TransactionHistory.svelte';
	import SendForm from '$lib/components/wallet/sendTab/SendForm.svelte';

	onMount(async () => {
		initWasm().then(async () => {
			if ($isWasmInitialized) {
				await walletStore.initialize();
			}
		});
	});

	onDestroy(async () => {
		await walletStore.disconnectWallet();
	});
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-3 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">Bitcoin Wallet</h2>

	<!-- Connection Status -->
	{#if $walletConnection.isConnecting}
		<div class="alert alert-outline alert-info mb-6">
			<div class="flex items-center">
				<span class="loading loading-spinner loading-sm mr-2"></span>
				<span>Initializing wallet...</span>
			</div>
		</div>
	{:else if $walletConnection.errorMessage}
		<div class="alert alert-outline alert-error mb-6 flex flex-col rounded-2xl">
			<div class="flex items-center justify-start gap-2 whitespace-nowrap">
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
				<h3 class="font-bold">Wallet Connection Error</h3>
			</div>
			<div class="text-sm">
				{#if $walletConnection.errorMessage.includes('No mnemonic found')}
					You have no wallet set up. Please set up your wallet to continue.
				{:else}
					{$walletConnection.errorMessage}
				{/if}
			</div>
			<button
				class="btn btn-outline btn-sm place-self-end"
				onclick={() => walletStore.initialize()}
			>
				Retry Connection
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

		{#if $walletUI.activeTab === 'transactions'}
			<TransactionHistory />
		{/if}
	{/if}
</div>
