<script lang="ts">
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { walletManager, rskConnection, walletStore } from '$lib/stores/wallet.store';
	import BalanceCard from '$lib/components/wallet/BalanceCard.svelte';
	import TransactionHistory from '$lib/components/wallet/TransactionHistory.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
	import HelpModal from '$lib/components/wallet/HelpModal.svelte';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconDownload from '~icons/mdi/download';
	import IconUpload from '~icons/mdi/upload';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import IconChevronRight from '~icons/mdi/chevron-right';

	let isLoading = $state(false);

	async function initializeWallet(): Promise<void> {
		try {
			isLoading = true;
			await walletManager.initialize();
			await Promise.allSettled([walletManager.loadAssets(), walletManager.loadRbtcExchangeRate()]);
		} finally {
			isLoading = false;
		}
	}

	onMount(async () => {
		await initializeWallet();
	});

	onDestroy(async () => {
		await walletManager.cleanup();
	});

	// Reactive state from centralized store
	let hasErrors = $derived($walletStore.error || $rskConnection.error);

	// Modal state for new UX
	let showReceiveModal = $state(false);
	let showSendModal = $state(false);
	let showTransactionsModal = $state(false);
</script>

<svelte:head>
	<title>{$t('wallet.title')} | BitTasker</title>
</svelte:head>

<div class="bg-base-100 mx-auto h-full max-w-4xl rounded-lg p-4 shadow-lg sm:p-6">
	<div transition:fly={{ y: 20, duration: 300, easing: linear }} class="flex h-full flex-col">
		{#if $rskConnection.connecting}
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
		{#if $appStore.network === 'testnet'}
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

		{#if $walletStore.isConnected || !hasErrors}
			<div class="flex h-full flex-col space-y-4 overflow-y-auto">
				<!-- Balance Card with History and Accordions -->
				<BalanceCard {isLoading} />

				<!-- Transactions Button -->
				<div>
					<button
						type="button"
						class="collapse-title border-primary bg-base-100 hover:bg-base-200 flex min-h-0 w-full items-center justify-between rounded-lg border-2 px-4 py-3 pr-12 text-left font-medium transition-colors"
						onclick={() => (showTransactionsModal = true)}
					>
						<div class="flex min-w-0 flex-1 items-center gap-2">
							<IconFormatListBulleted class="h-5 w-5 shrink-0" />
							<span>{$t('wallet.tab_transactions')}</span>
						</div>
						<div class="absolute right-3 flex items-center">
							<IconChevronRight class="h-6 w-6 shrink-0" />
						</div>
					</button>
				</div>

				<!-- Learn More Section - Above buttons on mobile/tablet -->
				<div class="mt-4 flex justify-center md:hidden">
					<div class="text-base-content/70 text-sm">
						<HelpModal />
					</div>
				</div>

				<!-- Send and Receive Buttons -->
				<div class="flex flex-col gap-4 sm:mt-4 sm:flex-row">
					<button
						class="btn btn-secondary order-1 flex-1 py-3 sm:order-2"
						onclick={() => (showSendModal = true)}
					>
						<IconUpload class="mr-2 h-5 w-5" />
						{$t('wallet.send_button')}
					</button>
					<button
						class="btn btn-primary order-2 flex-1 py-3 sm:order-1"
						onclick={() => (showReceiveModal = true)}
					>
						<IconDownload class="mr-2 h-5 w-5" />
						{$t('wallet.tab_receive')}
					</button>
				</div>

				<!-- Learn More Section - Below buttons on desktop -->
				<div class="hidden justify-center md:flex">
					<div class="text-base-content/70 text-sm">
						<HelpModal />
					</div>
				</div>
			</div>
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
<WalletPaymentModal
	isOpen={showReceiveModal}
	mode="receive"
	onClose={() => (showReceiveModal = false)}
>
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

<WalletPaymentModal
	isOpen={showTransactionsModal}
	mode="send"
	onClose={() => (showTransactionsModal = false)}
>
	<div class="mb-4 flex items-center justify-between">
		<h2 class="text-2xl font-bold">{$t('wallet.tab_transactions')}</h2>
		<button
			class="btn btn-ghost btn-sm btn-circle"
			onclick={() => (showTransactionsModal = false)}
			aria-label="Close transactions modal"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
	</div>
	<TransactionHistory />
</WalletPaymentModal>
