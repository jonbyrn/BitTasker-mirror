<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { bscUsdtWalletStore, bscUsdtWallet } from '$lib/stores/bscUsdtWallet.store';
	import BSCBalanceCard from '$lib/components/wallet/bsc/BSCBalanceCard.svelte';
	import BSCSendForm from '$lib/components/wallet/bsc/BSCSendForm.svelte';
	import BSCReceiveForm from '$lib/components/wallet/bsc/BSCReceiveForm.svelte';
	import BSCTransactionHistory from '$lib/components/wallet/bsc/BSCTransactionHistory.svelte';
	import BSCPaymasterManager from '$lib/components/wallet/bsc/BSCPaymasterManager.svelte';

	let activeTab = $state('balance');

	onMount(async () => {
		await bscUsdtWallet.initialize();
	});

	onDestroy(() => {
		bscUsdtWallet.cleanup();
	});
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-3 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">{$t('wallet.bsc.title')}</h2>

	<!-- Connection Status -->
	{#if $bscUsdtWalletStore.isConnecting}
		<div class="alert alert-outline alert-info mb-6">
			<div class="flex items-center">
				<span class="loading loading-spinner loading-sm mr-2"></span>
				<span>{$t('wallet.bsc.connecting')}</span>
			</div>
		</div>
	{:else if $bscUsdtWalletStore.error}
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
					<span class="flex-1">{$bscUsdtWalletStore.error}</span>
				</div>
				<button 
					class="btn btn-sm btn-outline ml-4"
					onclick={() => bscUsdtWallet.initialize()}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
					{$t('wallet.bsc.retry')}
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
			{$t('wallet.bsc.tab_balance')}
		</button>
		<button
			class="tab {activeTab === 'send' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'send')}
		>
			{$t('wallet.bsc.tab_send')}
		</button>
		<button
			class="tab {activeTab === 'receive' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'receive')}
		>
			{$t('wallet.bsc.tab_receive')}
		</button>
		<button
			class="tab {activeTab === 'history' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'history')}
		>
			{$t('wallet.bsc.tab_history')}
		</button>
		<button
			class="tab {activeTab === 'paymaster' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'paymaster')}
		>
			{$t('wallet.bsc.tab_paymaster')}
		</button>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'balance'}
		<BSCBalanceCard />
	{:else if activeTab === 'send'}
		<BSCSendForm />
	{:else if activeTab === 'receive'}
		<BSCReceiveForm />
	{:else if activeTab === 'history'}
		<BSCTransactionHistory />
	{:else if activeTab === 'paymaster'}
		<BSCPaymasterManager />
	{/if}
</div>
