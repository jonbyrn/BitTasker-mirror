<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { rskWalletStore, rskWallet } from '$lib/stores/rskWallet.store';
	import RSKBalanceCard from '$lib/components/wallet/rootstock/RSKBalanceCard.svelte';
	import RSKSendForm from '$lib/components/wallet/rootstock/RSKSendForm.svelte';
	import RSKReceiveForm from '$lib/components/wallet/rootstock/RSKReceiveForm.svelte';
	import RSKTransactionHistory from '$lib/components/wallet/rootstock/RSKTransactionHistory.svelte';

	let activeTab = $state('balance');

	onMount(async () => {
		await rskWallet.initialize();
	});

	onDestroy(() => {
		rskWallet.cleanup();
	});
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-3 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">Rootstock Wallet</h2>

	<!-- Connection Status -->
	{#if $rskWalletStore.isConnecting}
		<div class="alert alert-outline alert-info mb-6">
			<div class="flex items-center">
				<span class="loading loading-spinner loading-sm mr-2"></span>
				<span>Connecting to Rootstock wallet...</span>
			</div>
		</div>
	{:else if $rskWalletStore.error}
		<div class="alert alert-outline alert-error mb-6">
			<div class="flex items-center justify-between w-full">
				<div class="flex items-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 flex-shrink-0 stroke-current mr-2"
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
					<span class="flex-1">{$rskWalletStore.error}</span>
				</div>
				<button 
					class="btn btn-sm btn-outline ml-4"
					onclick={async () => await rskWallet.initialize()}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
					Retry
				</button>
			</div>
		</div>
	{/if}

	<!-- Tab Navigation -->
	<div class="tabs tabs-bordered mb-6">
		<button
			class="tab {activeTab === 'balance' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'balance')}
		>
			Balance
		</button>
		<button
			class="tab {activeTab === 'send' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'send')}
		>
			Send
		</button>
		<button
			class="tab {activeTab === 'receive' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'receive')}
		>
			Receive
		</button>
		<button
			class="tab {activeTab === 'history' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'history')}
		>
			History
		</button>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'balance'}
		<RSKBalanceCard />
	{:else if activeTab === 'send'}
		<RSKSendForm />
	{:else if activeTab === 'receive'}
		<RSKReceiveForm />
	{:else if activeTab === 'history'}
		<RSKTransactionHistory />
	{/if}
</div>
