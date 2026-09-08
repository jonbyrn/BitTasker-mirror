<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';

	type AssetTab = 'btc' | 'usd';

	let activeAsset = $state<AssetTab>('btc');
	let initializationError = $state<string | null>(null);
	let operationMessage = $state<string | null>(null);
	let isSendOpen = $state(false);
	let isReceiveOpen = $state(false);
	const chartRanges = ['24h', '7d', '30d'] as const;
	const chartBars = [24, 41, 29, 55, 38, 64, 48, 73, 52, 81, 67, 92];

	function text(value: unknown, fallback: string): string {
		return typeof value === 'string' && value.trim() ? value : fallback;
	}

	function translate(key: string, fallback: string): string {
		return text($t(key), fallback);
	}

	function formatNumber(value: unknown, fallback = '0'): string {
		const numeric = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(numeric) ? new Intl.NumberFormat().format(Math.max(0, numeric)) : fallback;
	}

	async function initializeWallet(): Promise<void> {
		initializationError = null;
		try {
			await walletManager.initialize();
			await Promise.allSettled([walletManager.loadAssets(), walletManager.loadTransactions()]);
		} catch (error) {
			initializationError = error instanceof Error
				? error.message
				: text($t('wallet.error.initialization_failed'), 'Wallet initialization failed');
			console.error('[wallet-page] Wallet initialization failed:', error);
		}
	}

	onMount(() => {
		void initializeWallet();
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

<div class="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:gap-6 sm:p-6">
	<div class="flex items-center justify-between gap-3">
		<div>
			<p class="text-base-content/60 text-sm">{translate('wallet.title', 'Wallet')}</p>
			<h1 class="text-2xl font-bold sm:text-3xl">{translate('wallet.tab_balance', 'Balance')}</h1>
		</div>
		{#if $walletStore.isConnected}
			<span class="badge badge-success gap-2">{translate('wallet.connected', 'Connected')}</span>
		{:else if $walletStore.isInitializing}
			<span class="badge badge-warning gap-2">
				<span class="loading loading-spinner loading-xs"></span>
				{translate('wallet.loading', 'Loading wallet')}
			</span>
		{:else}
			<span class="badge badge-ghost">{translate('wallet.error.no_connection', 'Wallet offline')}</span>
		{/if}
	</div>

	{#if initializationError || $walletStore.error}
		<div class="alert alert-error" role="alert">
			<span>{text(initializationError ?? $walletStore.error, 'Wallet initialization failed')}</span>
			<button class="btn btn-sm" type="button" onclick={() => void initializeWallet()}>
				{translate('wallet.error.retry', 'Retry')}
			</button>
		</div>
	{/if}

	{#if operationMessage}
		<div class="alert alert-success" role="status">{operationMessage}</div>
	{/if}

	<section class="grid gap-4 sm:grid-cols-2">
		<div class="bg-base-100 border-base-300 rounded-2xl border p-5 shadow-sm sm:p-8">
			<p class="text-base-content/60 text-sm">Sats balance</p>
			<p class="mt-2 text-4xl font-bold tabular-nums sm:text-5xl">
				{formatNumber($walletStore.totalBalances.sats)}
				<span class="text-base-content/60 text-lg font-medium">sats</span>
			</p>
		</div>
		<div class="bg-base-100 border-base-300 rounded-2xl border p-5 shadow-sm sm:p-8">
			<p class="text-base-content/60 text-sm">USD / USDT balance</p>
			<p class="mt-2 text-4xl font-bold tabular-nums sm:text-5xl">
				${formatNumber($walletStore.totalBalances.usdt, '0.00')}
			</p>
		</div>
	</section>

	<section class="bg-base-100 border-base-300 rounded-2xl border p-4 shadow-sm sm:p-6">
		<p class="text-base-content/60 text-sm">{translate('wallet.available_balance', 'Available balance')}</p>
		<div class="mt-4 flex flex-wrap gap-2 text-sm">
			<button class:badge-primary={activeAsset === 'btc'} class="badge badge-outline" type="button" onclick={() => (activeAsset = 'btc')}>Bitcoin</button>
			<button class:badge-primary={activeAsset === 'usd'} class="badge badge-outline" type="button" onclick={() => (activeAsset = 'usd')}>USD / USDT</button>
			{#if $walletStore.rgb.address}
				<span class="badge badge-ghost max-w-full truncate">{$walletStore.rgb.address}</span>
			{/if}
		</div>
	</section>

	<section class="bg-base-100 border-base-300 rounded-2xl border p-4 shadow-sm sm:p-6">
		<div class="flex items-center justify-between gap-3">
			<h2 class="font-semibold">Balance history</h2>
			<span class="text-base-content/50 text-xs">{activeAsset === 'btc' ? 'BTC' : 'USD'}</span>
		</div>
		<div class="mt-5 grid grid-cols-3 gap-3">
			{#each chartRanges as range, rangeIndex (range)}
				<div class="border-base-300 rounded-xl border p-3">
					<div class="text-base-content/60 text-xs">{range}</div>
					<div class="mt-3 flex h-16 items-end gap-1" aria-label={`${range} balance chart`}>
						{#each chartBars.slice(rangeIndex * 2, rangeIndex * 2 + 6) as height (height)}
							<div class="bg-primary/70 min-w-0 flex-1 rounded-t" style:height={`${height}%`}></div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="bg-base-100 border-base-300 rounded-2xl border p-4 shadow-sm sm:p-6">
		<div class="flex items-center justify-between">
			<h2 class="font-semibold">Recent transactions</h2>
			<span class="text-base-content/50 text-xs">{$walletStore.transactions.length}</span>
		</div>
		{#if $walletStore.transactions.length === 0}
			<p class="text-base-content/60 mt-4 text-sm">No transactions yet.</p>
		{:else}
			<div class="mt-3 divide-y divide-base-300">
				{#each $walletStore.transactions.slice(0, 5) as transaction (transaction.id)}
					<div class="flex items-center justify-between gap-3 py-3 text-sm">
						<span class="capitalize">{text(transaction.type, 'transaction')}</span>
						<span class="font-semibold">{formatNumber(transaction.amountSats)} sats</span>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="grid gap-4 sm:grid-cols-2">
			<button class="btn btn-primary min-h-24 text-lg" type="button" onclick={openSend}>
				{translate('wallet.tab_send', 'Send')}
			</button>
			<button class="btn btn-outline min-h-24 text-lg" type="button" onclick={() => (isReceiveOpen = true)}>
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