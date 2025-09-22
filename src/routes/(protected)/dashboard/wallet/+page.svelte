<script lang="ts">
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import {
		walletManager,
		combinedWalletState,
		liquidConnection,
		rskConnection,
		walletStore
	} from '$lib/stores/wallet.store';
	import { initWasm, isWasmInitialized } from '$lib/wallet/breez/wasmLoader';
	import BalanceCard from '$lib/components/wallet/BalanceCard.svelte';
	import SendForm from '$lib/components/wallet/SendForm.svelte';
	import ReceiveForm from '$lib/components/wallet/ReceiveForm.svelte';
	import TransactionHistory from '$lib/components/wallet/TransactionHistory.svelte';

	onMount(async () => {
		// Initialize WASM first, then both wallets
		await initWasm();
		if ($isWasmInitialized) {
			await walletManager.initialize();
		}
	});

	onDestroy(async () => {
		await walletManager.cleanup();
	});

	// Reactive state from centralized store
	let hasErrors = $derived($walletStore.error || $liquidConnection.error || $rskConnection.error);
	let isConnecting = $derived($liquidConnection.connecting || $rskConnection.connecting);
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-6 shadow-lg">
	<div transition:fly={{ y: 20, duration: 300, easing: linear }}>
		<div class="mb-6 flex items-center justify-between">
			<h2 class="text-3xl font-bold">{$t('wallet.title')}</h2>
			<div class="flex gap-2">
				<!-- Breez Status Indicator -->
				<div class="tooltip" data-tip="Breez Liquid Wallet">
					<div class="badge {$liquidConnection.connected ? 'badge-success' : 'badge-error'} gap-2">
						<div class="h-2 w-2 rounded-full bg-current"></div>
						Liquid
					</div>
				</div>
				<!-- RSK Status Indicator -->
				<div class="tooltip" data-tip="Rootstock Wallet">
					<div class="badge {$rskConnection.connected ? 'badge-success' : 'badge-error'} gap-2">
						<div class="h-2 w-2 rounded-full bg-current"></div>
						RSK
					</div>
				</div>
			</div>
		</div>

		<!-- Connection Status -->
		{#if $combinedWalletState.isInitializing}
			<div class="alert alert-info mb-6">
				<div class="flex items-center">
					<span class="loading loading-spinner loading-sm mr-2"></span>
					<span>{$t('wallet.page.initializing')}</span>
				</div>
			</div>
		{:else if isConnecting}
			<div class="alert alert-info mb-6">
				<div class="flex items-center">
					<span class="loading loading-spinner loading-sm mr-2"></span>
					<span>{$t('wallet.connecting')}</span>
				</div>
			</div>
		{:else if hasErrors}
			<div class="alert alert-error mb-6">
				<div class="flex w-full items-center justify-between">
					<div class="flex items-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-6 w-6 flex-shrink-0 stroke-current"
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
							<div class="font-bold">{$t('wallet.page.connection_error')}</div>
							<div class="text-sm">
								{#if $liquidConnection.error?.includes('No mnemonic found')}
									{$t('wallet.page.no_wallet_setup')}
								{:else if $liquidConnection.error}
									Liquid: {$liquidConnection.error}
								{/if}
								{#if $rskConnection.error}
									{#if $liquidConnection.error}<br />{/if}
									RSK: {$rskConnection.error}
								{/if}
							</div>
						</div>
					</div>
					<button
						class="btn btn-outline btn-sm ml-4"
						onclick={async () => await walletManager.initialize()}
					>
						{$t('wallet.page.retry_connection')}
					</button>
				</div>
			</div>
		{/if}

		{#if $combinedWalletState.hasAnyConnection || !hasErrors}
			<!-- Tab Navigation -->
			<div class="tabs tabs-boxed mb-6">
				<button
					class="tab {$combinedWalletState.activeTab === 'balance' ? 'tab-active' : ''}"
					onclick={() => walletManager.setActiveTab('balance')}
				>
					{$t('wallet.tab_balance')}
				</button>
				<button
					class="tab {$combinedWalletState.activeTab === 'receive' ? 'tab-active' : ''}"
					onclick={() => walletManager.setActiveTab('receive')}
				>
					{$t('wallet.tab_receive')}
				</button>
				<button
					class="tab {$combinedWalletState.activeTab === 'send' ? 'tab-active' : ''}"
					onclick={() => walletManager.setActiveTab('send')}
				>
					{$t('wallet.tab_send')}
				</button>
				<button
					class="tab {$combinedWalletState.activeTab === 'transactions' ? 'tab-active' : ''}"
					onclick={() => walletManager.setActiveTab('transactions')}
				>
					{$t('wallet.tab_transactions')}
				</button>
			</div>

			<!-- Tab Content -->
			{#if $combinedWalletState.activeTab === 'balance'}
				<BalanceCard />
			{/if}

			{#if $combinedWalletState.activeTab === 'receive'}
				<ReceiveForm />
			{/if}

			{#if $combinedWalletState.activeTab === 'send'}
				<div class="space-y-6">
					<SendForm />
				</div>
			{/if}

			{#if $combinedWalletState.activeTab === 'transactions'}
				<TransactionHistory />
			{/if}
		{:else}
			<!-- No wallets connected - show setup options -->
			<div class="py-12 text-center">
				<div class="mb-6">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/30 mx-auto h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/>
					</svg>
				</div>
				<h3 class="mb-4 text-xl font-semibold">{$t('wallet.error.no_mnemonic.title')}</h3>
				<p class="text-base-content/70 mx-auto mb-6 max-w-md">
					{$t('wallet.error.no_mnemonic.message')}
				</p>
				<div class="flex justify-center gap-4">
					<button class="btn btn-primary" onclick={async () => await walletManager.initialize()}>
						{$t('wallet.error.no_mnemonic.try_again')}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
