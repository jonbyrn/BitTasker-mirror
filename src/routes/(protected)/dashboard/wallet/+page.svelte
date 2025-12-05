<script lang="ts">
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	// Icon imports for unplugin-icons
	import IconContentCopy from '~icons/mdi/content-copy';
	import { walletManager, rskConnection, walletStore } from '$lib/stores/wallet.store';
	import BalanceCard from '$lib/components/wallet/BalanceCard.svelte';
	import SendForm from '$lib/components/wallet/SendForm.svelte';
	import ReceiveForm from '$lib/components/wallet/ReceiveForm.svelte';
	import TransactionHistory from '$lib/components/wallet/TransactionHistory.svelte';
	import HelpModal from '$lib/components/wallet/HelpModal.svelte';
	import BuySellForm from '$lib/components/wallet/BuySellForm.svelte';
	import SwapForm from '$lib/components/wallet/SwapForm.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';

	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';

	async function initializeWallet(): Promise<void> {
		await walletManager.initialize();
		await Promise.allSettled([
			walletManager.loadAssets(),
			walletManager.loadTransactions(),
			walletManager.loadRbtcExchangeRate()
		]);
	}

	onMount(async () => {
		await initializeWallet();
	});

	onDestroy(async () => {
		await walletManager.cleanup();
	});

	// Reactive state from centralized store
	let hasErrors = $derived($walletStore.error || $rskConnection.error);
	let isConnecting = $derived($rskConnection.connecting);

	// Modal state for new UX
	let showReceiveModal = $state(false);
	let showSendModal = $state(false);
	let showBuySellModal = $state(false);
	let showSwapModal = $state(false);
	let showTransactionsModal = $state(false);
</script>

<svelte:head>
	<title>{$t('wallet.title')} | BitTasker</title>
</svelte:head>

<div 
	class="bg-base-100 mx-auto max-w-4xl rounded-lg p-6 shadow-lg wallet-container"
	style="height: calc(100dvh - var(--bottom-nav-height, 140px) - 3rem); max-height: calc(100dvh - var(--bottom-nav-height, 140px) - 3rem);"
>
	<div transition:fly={{ y: 20, duration: 300, easing: linear }} class="h-full flex flex-col">

		<!-- Connection Status - commented out -->

		{#if isConnecting}
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
							class="mr-2 h-6 w-6 shrink-0 stroke-current"
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
								{#if $rskConnection.error?.includes('No mnemonic found')}
									{$t('wallet.page.no_wallet_setup')}
								{:else if $rskConnection.error}
									RSK: {$rskConnection.error}
								{/if}
							</div>
						</div>
					</div>
					<button class="btn btn-outline btn-sm ml-4" onclick={initializeWallet}>
						{$t('wallet.page.retry_connection')}
					</button>
				</div>
			</div>
		{/if}

		<!-- Testnet Warning Alert -->
		{#if network === 'testnet'}
			<div class="alert alert-outline alert-warning mb-6">
				<div class="flex items-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-3 h-6 w-6 shrink-0 stroke-current"
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
						<div class="text-warning text-center font-bold">
							{$t('wallet.testnet_warning.title')}
						</div>
						<div class="text-sm">
							<strong>{$t('wallet.testnet_warning.do_not_send_real_assets')}</strong>
							{$t('wallet.testnet_warning.description')}
						</div>
						<!-- User's Testnet Address -->
						{#if $rskConnection.address}
							<div class="bg-base-200 mt-3 rounded-lg p-3">
								<div class="mb-2 text-sm font-medium">
									{$t('wallet.testnet_warning.your_address')}
								</div>
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
											copyToClipboard($rskConnection.address || '');
											appStore.showSuccessToast($t('wallet.address_copied'));
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

		{#if $walletStore.hasAnyConnection || !hasErrors}
			<!-- Balance Tab - Keep as is -->
			{#if $walletStore.activeTab === 'balance'}
				<div class="flex-1 flex flex-col min-h-0">
					<BalanceCard
						onReceive={() => {
							showReceiveModal = true;
						}}
						onSend={() => {
							showSendModal = true;
						}}
						onBuySell={() => {
							showBuySellModal = true;
						}}
						onSwap={() => {
							showSwapModal = true;
						}}
						onTransactions={() => {
							showTransactionsModal = true;
						}}
					/>
				</div>
			{:else}
				<!-- Legacy Tab Navigation (for backward compatibility) -->
			<div class="tabs tabs-bordered mb-6 w-full">
				<button
					class="tab {$walletStore.activeTab === 'balance' ? 'active-tab' : ''}"
					onclick={() => walletManager.setActiveTab('balance')}
				>
					{$t('wallet.tab_balance')}
				</button>
				<button
					class="tab {$walletStore.activeTab === 'receive' ? 'active-tab' : ''}"
					onclick={() => walletManager.setActiveTab('receive')}
				>
					{$t('wallet.tab_receive')}
				</button>
				<button
					class="tab {$walletStore.activeTab === 'send' ? 'active-tab' : ''}"
					onclick={() => walletManager.setActiveTab('send')}
				>
					{$t('wallet.tab_send')}
				</button>
				<button
					class="tab {$walletStore.activeTab === 'buy-sell' ? 'active-tab' : ''}"
					onclick={() => walletManager.setActiveTab('buy-sell')}
				>
					{$t('wallet.tab_buy_sell')}
				</button>
				<button
					class="tab {$walletStore.activeTab === 'swap' ? 'active-tab' : ''}"
					onclick={() => walletManager.setActiveTab('swap')}
				>
					{$t('wallet.tab_swap')}
				</button>
				<button
					class="tab {$walletStore.activeTab === 'transactions' ? 'active-tab' : ''}"
					onclick={() => walletManager.setActiveTab('transactions')}
				>
					{$t('wallet.tab_transactions')}
				</button>
			</div>

				<!-- Legacy Tab Content -->
			{#if $walletStore.activeTab === 'receive'}
				<ReceiveForm />
			{/if}

			{#if $walletStore.activeTab === 'send'}
				<SendForm />
			{/if}

			{#if $walletStore.activeTab === 'buy-sell'}
				<BuySellForm />
			{/if}

			{#if $walletStore.activeTab === 'swap'}
				<SwapForm />
			{/if}

			{#if $walletStore.activeTab === 'transactions'}
				<TransactionHistory />
				{/if}
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
					<button class="btn btn-primary" onclick={initializeWallet}>
						{$t('wallet.error.no_mnemonic.try_again')}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- New UX Modals -->
<WalletPaymentModal isOpen={showReceiveModal} mode="receive" onClose={() => (showReceiveModal = false)}>
	<ReceivePaymentForm
		onCancel={() => (showReceiveModal = false)}
		onInvoiceGenerated={(invoiceData) => {
			// Handle invoice generation success - could show InvoiceDisplay here
			console.log('Invoice generated:', invoiceData);
		}}
	/>
</WalletPaymentModal>

<WalletPaymentModal isOpen={showSendModal} mode="send" onClose={() => (showSendModal = false)}>
	<SendPaymentForm
		onCancel={() => (showSendModal = false)}
		onSuccess={(txHash, network) => {
			// Handle send success
			console.log('Payment sent:', txHash, network);
			showSendModal = false;
		}}
	/>
</WalletPaymentModal>

<!-- Legacy Modals for Buy/Sell, Swap, Transactions -->
<!-- These can be converted to modals later if needed -->
{#if showBuySellModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="bg-base-100 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg p-6 shadow-xl">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-2xl font-bold">{$t('wallet.tab_buy_sell')}</h2>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={() => (showBuySellModal = false)}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			<BuySellForm />
		</div>
	</div>
{/if}

{#if showSwapModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="bg-base-100 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg p-6 shadow-xl">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-2xl font-bold">{$t('wallet.tab_swap')}</h2>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={() => (showSwapModal = false)}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			<SwapForm />
		</div>
	</div>
{/if}

{#if showTransactionsModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="bg-base-100 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg p-6 shadow-xl">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-2xl font-bold">{$t('wallet.tab_transactions')}</h2>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={() => (showTransactionsModal = false)}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			<TransactionHistory />
		</div>
	</div>
{/if}

<style>
	.tab.active-tab {
		position: relative;
		color: hsl(var(--p));
		background-color: hsl(var(--p) / 0.1);
		font-weight: 600;
	}

	.tab.active-tab::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 2px;
		background-color: hsl(var(--p));
		border-radius: 1px;
	}
</style>
