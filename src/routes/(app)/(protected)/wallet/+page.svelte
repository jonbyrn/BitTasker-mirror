<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';

	let initializationError = $state<string | null>(null);
	let operationMessage = $state<string | null>(null);
	let isSendOpen = $state(false);
	let isReceiveOpen = $state(false);
	const rgbAssets = $derived($walletStore.rgb.assets ?? []);

	function text(value: unknown, fallback: string): string {
		return typeof value === 'string' && value.trim() ? value : fallback;
	}

	function translate(key: string, fallback: string): string {
		return text($t(key), fallback);
	}

	function formatNumber(value: unknown, fallback = '0'): string {
		const numeric = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(numeric)
			? new Intl.NumberFormat().format(Math.max(0, numeric))
			: fallback;
	}

	async function initializeWallet(): Promise<void> {
		initializationError = null;
		try {
			await walletManager.initialize();
			await Promise.allSettled([walletManager.loadAssets(), walletManager.loadTransactions()]);
		} catch (error) {
			initializationError =
				error instanceof Error
					? error.message
					: text($t('wallet.error.initialization_failed'), 'Wallet initialization failed');
			console.error('[wallet-page] Wallet initialization failed:', error);
		}
	}

	onMount(() => {
		initializeWallet().catch((err: unknown) => {
			console.error('[wallet-page-init-error]', err);
		});
	});

	function handleSent(txid: string): void {
		operationMessage = txid ? translate('wallet.sent_successfully', 'Payment sent') : null;
		isSendOpen = false;
	}

	function handleReceiveClose(): void {
		isReceiveOpen = false;
	}

	function openSend(): void {
		isSendOpen = true;
	}

	function closeSend(): void {
		isSendOpen = false;
	}
</script>

<svelte:head>
	<title>{translate('wallet.title', 'Wallet')}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-6">
	<div class="card bg-base-100 border-base-300 border shadow-sm">
		<div class="card-body flex-row items-start justify-between gap-3 p-5">
			<div class="min-w-0">
				<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">
					{translate('wallet.title', 'Wallet')}
				</p>
				<h2 class="text-2xl font-semibold sm:text-3xl">
					{translate('wallet.tab_balance', 'Balance')}
				</h2>
			</div>
			{#if $walletStore.isConnected && $walletStore.rgb?.initialized}
				<span class="badge badge-success badge-lg" data-testid="wallet-connected">
					{translate('wallet.tab_connected', 'Connected')}
				</span>
			{:else if $walletStore.isInitializing}
				<span class="badge badge-warning badge-lg gap-2">
					<span class="loading loading-spinner loading-xs"></span>
					{translate('wallet.loading', 'Loading wallet')}
				</span>
			{:else}
				<span class="badge badge-ghost badge-lg">
					{translate('wallet.error.no_connection', 'Wallet offline')}
				</span>
			{/if}
		</div>
	</div>

	{#if initializationError || $walletStore.error}
		<div class="alert alert-outline alert-error" role="alert">
			<span>{text(initializationError ?? $walletStore.error, 'Wallet initialization failed')}</span>
			<button
				class="btn btn-sm"
				type="button"
				onclick={() => {
					initializeWallet().catch((err: unknown) => {
						console.error('[wallet-page] Wallet initialization failed:', err);
					});
				}}
			>
				{translate('wallet.error.retry', 'Retry')}
			</button>
		</div>
	{/if}

	{#if operationMessage}
		<div class="alert alert-outline alert-success" role="status">{operationMessage}</div>
	{/if}

	<section class="card bg-base-100 border-base-300 border shadow-sm">
		<div class="card-body gap-0 p-0">
			<div class="flex items-center justify-between gap-3 px-5 py-4">
				<div class="min-w-0">
					<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">
						{translate('wallet.bitcoin', 'Bitcoin')}
					</p>
					<p class="text-base font-semibold">{translate('wallet.btc', 'BTC')}</p>
				</div>
				<p class="text-lg font-semibold tabular-nums">
					{formatNumber($walletStore.totalBalances.sats)}
					<span class="text-base-content/60 text-sm font-medium">
						{translate('wallet.sats', 'sats')}
					</span>
				</p>
			</div>
			{#each rgbAssets as asset (asset.assetId)}
				<div class="border-base-300 flex items-center justify-between gap-3 border-t px-5 py-4">
					<div class="min-w-0">
						{#if asset.symbol}
							<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">
								{asset.symbol}
							</p>
						{/if}
						<p class="truncate text-base font-semibold">{asset.name}</p>
					</div>
					<p class="text-lg font-semibold tabular-nums">
						{asset.formattedBalance || formatNumber(asset.balance)}
					</p>
				</div>
			{:else}
				<div class="border-base-300 border-t px-5 py-4">
					<p class="text-base-content/60 text-sm">{translate('wallet.no_assets', 'No assets')}</p>
				</div>
			{/each}
		</div>
	</section>

	<section class="card bg-base-100 border-base-300 border shadow-sm">
		<div class="card-body gap-3 p-5">
			<div class="flex items-center justify-between gap-3">
				<p class="text-base font-semibold">
					{translate('wallet.transaction_history', 'Transaction History')}
				</p>
				<span class="badge badge-ghost">{$walletStore.transactions.length}</span>
			</div>
			{#if $walletStore.transactions.length === 0}
				<p class="text-base-content/60 text-sm">
					{translate('wallet.no_transactions', 'No transactions found.')}
				</p>
			{:else}
				<div class="divide-base-300 divide-y">
					{#each $walletStore.transactions.slice(0, 5) as transaction (transaction.id)}
						<div class="flex items-center justify-between gap-3 py-3 text-sm">
							<span class="capitalize">{text(transaction.type, 'transaction')}</span>
							<span class="font-semibold">
								{formatNumber(transaction.amountSats)}
								{translate('wallet.sats', 'sats')}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<section class="grid gap-4 sm:grid-cols-2">
		<button class="btn btn-primary min-h-24 text-lg" type="button" onclick={openSend}>
			{translate('wallet.tab_send', 'Send')}
		</button>
		<button
			class="btn btn-outline min-h-24 text-lg"
			type="button"
			onclick={() => (isReceiveOpen = true)}
		>
			{translate('wallet.tab_receive', 'Receive')}
		</button>
	</section>

	<WalletPaymentModal isOpen={isSendOpen} onClose={closeSend}>
		<SendPaymentForm onSent={handleSent} onCancel={closeSend} />
	</WalletPaymentModal>
	<WalletPaymentModal isOpen={isReceiveOpen} onClose={handleReceiveClose}>
		<ReceivePaymentForm onClose={handleReceiveClose} />
	</WalletPaymentModal>
</div>
