<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import DebugWalletAssetList from '$lib/components/wallet/DebugWalletAssetList.svelte';
	import DebugWalletSendForm from '$lib/components/wallet/DebugWalletSendForm.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
	import { walletManager, walletStore, rskConnection } from '$lib/stores/wallet.store';
	import type { TokenBalance } from '$lib/types/wallet';

	let selectedToken = $state<TokenBalance | null>(null);
	let isSendModalOpen = $state(false);
	let isLoading = $state(false);
	let refreshTrigger = $state(0);

	// Use reactive state from wallet store (same as main wallet page)
	let hasErrors = $derived($walletStore.error || $rskConnection.error);

	/**
	 * Initialize wallet - matches main wallet page pattern exactly
	 */
	async function initializeWallet(): Promise<void> {
		try {
			isLoading = true;
			await walletManager.initialize();
			await walletManager.loadAssets();
		} finally {
			isLoading = false;
		}
	}

	function handleSendToken(token: TokenBalance) {
		selectedToken = token;
		isSendModalOpen = true;
	}

	function handleCloseModal() {
		isSendModalOpen = false;
		selectedToken = null;
	}

	function handleSendSuccess() {
		// Refresh asset list after successful send
		refreshTrigger++;
		handleCloseModal();
	}

	onMount(async () => {
		await initializeWallet();
	});

	onDestroy(async () => {
		// Note: We don't call walletManager.cleanup() here because:
		// 1. The wallet might be used by other pages
		// 2. The main wallet page handles cleanup
		// 3. We only want to cleanup if we're the only page using the wallet
	});
</script>

<svelte:head>
	<title>{$t('wallet.debug_wallet.title')} - BitTasker</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
	<!-- Page Header -->
	<div class="mb-4 sm:mb-6">
		<h1 class="mb-1.5 text-xl font-bold sm:mb-2 sm:text-2xl">{$t('wallet.debug_wallet.title')}</h1>
		<p class="text-xs opacity-70 sm:text-sm">{$t('wallet.debug_wallet.description')}</p>
	</div>

	<!-- Loading/Connecting State -->
	{#if $rskConnection.connecting || isLoading || $walletStore.isInitializing}
		<div class="alert alert-outline alert-info mb-3 py-2 sm:mb-6 sm:py-4">
			<div class="flex items-center">
				<span class="loading loading-spinner loading-sm mr-2"></span>
				<span>{$t('wallet.connecting')}</span>
			</div>
		</div>
		<!-- Error State (only show after attempting initialization) -->
	{:else if hasErrors && !$walletStore.isConnected}
		<div class="alert alert-outline alert-error mb-3 py-2 sm:mb-6 sm:py-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
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
			<div class="flex-1">
				<div class="font-bold">{$t('wallet.page.connection_error')}</div>
				<div class="mt-1 text-sm">
					{#if $walletStore.error?.includes('No mnemonic found') || $walletStore.error?.includes('no mnemonic')}
						{$t('wallet.error.no_mnemonic_found')}
					{:else if $walletStore.error}
						{$walletStore.error}
					{:else if $rskConnection.error}
						RSK: {$rskConnection.error}
					{:else}
						{$t('wallet.error.connection_failed')}
					{/if}
				</div>
				<div class="mt-3">
					<button class="btn btn-primary btn-sm" onclick={initializeWallet} disabled={isLoading}>
						{$t('wallet.page.retry_connection')}
					</button>
				</div>
			</div>
		</div>
		<!-- Asset List (only show when connected AND not initializing, same as main wallet page) -->
	{:else if $walletStore.isConnected && !$walletStore.isInitializing && !isLoading}
		<DebugWalletAssetList onSendToken={handleSendToken} {refreshTrigger} />
	{/if}

	<!-- Send Modal -->
	{#if selectedToken}
		<WalletPaymentModal isOpen={isSendModalOpen} onClose={handleCloseModal}>
			<DebugWalletSendForm
				token={selectedToken}
				onClose={handleCloseModal}
				onSuccess={handleSendSuccess}
			/>
		</WalletPaymentModal>
	{/if}
</div>
