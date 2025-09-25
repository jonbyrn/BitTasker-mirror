<script lang="ts">
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	// Icon imports for unplugin-icons
	import IconContentCopy from '~icons/mdi/content-copy';
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
						<img src="/images/chains/Liquid-Bitcoin.svg" alt="Liquid" class="h-4 w-4" />
						Liquid
					</div>
				</div>
				<!-- RSK Status Indicator -->
				<div class="tooltip" data-tip="Rootstock Wallet">
					<div class="badge {$rskConnection.connected ? 'badge-success' : 'badge-error'} gap-2">
						<img src="/images/chains/Bitcoin-Rootstock-logo.webp" alt="RSK" class="h-4 w-4" />
						RSK
					</div>
				</div>
			</div>
		</div>

		<!-- Connection Status -->
		{#if $combinedWalletState.isInitializing}
			<div class="alert alert-outlinealert-info mb-6">
				<div class="flex items-center">
					<span class="loading loading-spinner loading-sm mr-2"></span>
					<span>{$t('wallet.page.initializing')}</span>
				</div>
			</div>
		{:else if isConnecting}
			<div class="alert alert-outline alert-info mb-6">
				<div class="flex items-center">
					<span class="loading loading-spinner loading-sm mr-2"></span>
					<span>{$t('wallet.connecting')}</span>
				</div>
			</div>
		{:else if hasErrors}
			<div class="alert alert-outline alert-error mb-6">
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

		<!-- Testnet Warning Alert -->
		{#if import.meta.env.VITE_RSK_NETWORK === 'testnet'}
			<div class="alert alert-outline alert-warning mb-6">
				<div class="flex items-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-3 h-6 w-6 flex-shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
					<div class="flex-1">
						<div class="font-bold text-warning text-center">{$t('wallet.testnet_warning.title')}</div>
						<div class="text-sm">
							<strong>{$t('wallet.testnet_warning.do_not_send_real_assets')}</strong> {$t('wallet.testnet_warning.description')}
						</div>
						<!-- User's Testnet Address -->
						{#if $rskConnection.address}
							<div class="mt-3 p-3 bg-base-200 rounded-lg">
								<div class="text-sm font-medium mb-2">{$t('wallet.testnet_warning.your_address')}</div>
								<div class="flex items-center gap-2">
									<input
										type="text"
										value={$rskConnection.address}
										readonly
										class="input input-sm flex-1 font-mono text-xs"
									/>
									<button
										class="btn btn-sm btn-outline"
										onclick={() => {
											navigator.clipboard.writeText($rskConnection.address);
											// You could add a toast notification here
										}}
										title={$t('wallet.testnet_warning.copy_address')}
										aria-label={$t('wallet.testnet_warning.copy_address')}
									>
										<IconContentCopy class="h-4 w-4" />
									</button>
								</div>
							</div>
						{/if}
						
						<div class="mt-2 text-sm">
							{$t('wallet.testnet_warning.faucet_instruction')} 
							<a 
								href="https://faucet.rootstock.io/" 
								target="_blank" 
								rel="noopener noreferrer"
								class="link link-primary font-semibold"
							>
								{$t('wallet.testnet_warning.faucet_link_text')}
							</a>
							{$t('wallet.testnet_warning.faucet_instruction_end')}
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if $combinedWalletState.hasAnyConnection || !hasErrors}
			<!-- Tab Navigation -->
			<div class="tabs tabs-bordered w-full mb-6">
				<button
					class="tab {$combinedWalletState.activeTab === 'balance' ? 'active-tab' : ''}"
					onclick={() => walletManager.setActiveTab('balance')}
				>
					{$t('wallet.tab_balance')}
				</button>
				<button
					class="tab {$combinedWalletState.activeTab === 'receive' ? 'active-tab' : ''}"
					onclick={() => walletManager.setActiveTab('receive')}
				>
					{$t('wallet.tab_receive')}
				</button>
				<button
					class="tab {$combinedWalletState.activeTab === 'send' ? 'active-tab' : ''}"
					onclick={() => walletManager.setActiveTab('send')}
				>
					{$t('wallet.tab_send')}
				</button>
				<button
					class="tab {$combinedWalletState.activeTab === 'transactions' ? 'active-tab' : ''}"
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

<style>
	.tab.active-tab {
		position: relative;
		color: white;
	}

	.tab.active-tab::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 2px;
		background-color: orange;
		border-radius: 1px;
	}
</style>
