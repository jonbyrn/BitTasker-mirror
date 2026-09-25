<script lang="ts">
	import { onMount } from 'svelte';
	import { locale, t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
	import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
	import {
		parseWalletUtxos,
		type WalletUtxoKind,
		type WalletUtxoRow
	} from '$lib/stores/wallet/rgb-allocations';
	import {
		formatRelativeTime,
		isRgbMovement,
		pickHeroAsset,
		shortOutpoint,
		summarizeUtxoKinds
	} from '$lib/components/wallet/wallet-formatters';

	let initializationError = $state<string | null>(null);
	let operationMessage = $state<string | null>(null);
	let isSendOpen = $state(false);
	let isReceiveOpen = $state(false);
	let utxos = $state<WalletUtxoRow[]>([]);
	let utxoError = $state<string | null>(null);
	let showUtxoDetails = $state(false);
	const rgbAssets = $derived($walletStore.rgb.assets ?? []);
	const heroAssets = $derived(pickHeroAsset(rgbAssets));
	const utxoSummary = $derived(summarizeUtxoKinds(utxos.map((utxo) => utxo.kind)));

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
			await Promise.allSettled([
				walletManager.loadAssets(),
				walletManager.loadTransactions(),
				loadUtxos()
			]);
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

	async function loadUtxos(): Promise<void> {
		const wallet = getUtexoWallet();
		if (!wallet?.listUnspents) {
			utxos = [];
			return;
		}
		try {
			utxos = parseWalletUtxos(await wallet.listUnspents());
			utxoError = null;
		} catch (error) {
			utxoError = error instanceof Error ? error.message : translate('wallet.no_utxos', 'No UTXOs');
			console.error('[wallet-page] UTXO list failed:', error);
		}
	}

	function utxoKindLabel(kind: WalletUtxoKind): string {
		if (kind === 'free') return translate('wallet.utxo_free', 'Free');
		if (kind === 'colored') return translate('wallet.utxo_colored', 'Colored');
		if (kind === 'locked') return translate('wallet.utxo_locked', 'Locked');
		return translate('wallet.utxo_vanilla', 'Vanilla');
	}

	function handleSent(txid: string): void {
		operationMessage = txid ? translate('wallet.sent_successfully', 'Payment sent') : null;
		isSendOpen = false;
	}

	function handleReceiveClose(): void {
		isReceiveOpen = false;
	}

	function historyLabel(type: string, description: string | undefined, amount: string): string {
		const incoming = type === 'receive';
		if (isRgbMovement(description)) {
			return translate(
				incoming ? 'wallet.received_rgb' : 'wallet.sent_rgb',
				incoming ? 'Received RGB' : 'Sent RGB'
			);
		}
		const key = incoming ? 'wallet.received_sats' : 'wallet.sent_sats';
		const fallback = incoming ? `Received ${amount} sats` : `Sent ${amount} sats`;
		const translated = $t(key, { values: { amount } });
		return text(translated, fallback);
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

<div class="wallet-screen bg-base-200 absolute inset-0 flex flex-col gap-2 overflow-hidden p-3">
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

	{#snippet assetMark(symbol: string)}
		{@const ticker = symbol.toUpperCase()}
		<span
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
			class:bg-primary={ticker === 'BTC' || ticker === 'BITCOIN'}
			class:text-primary-content={ticker === 'BTC' || ticker === 'BITCOIN'}
			class:bg-success={ticker === 'USDT'}
			class:text-success-content={ticker === 'USDT'}
			class:bg-base-300={ticker !== 'BTC' && ticker !== 'BITCOIN' && ticker !== 'USDT'}
			aria-hidden="true"
		>
			{ticker === 'BTC' || ticker === 'BITCOIN'
				? '₿'
				: ticker === 'USDT'
					? '₮'
					: ticker.slice(0, 1)}
		</span>
	{/snippet}

	{#snippet balanceRow(symbol: string, label: string, amount: string, emphasized: boolean)}
		<div class="border-base-300 flex w-full items-center gap-3 border-t px-3 py-2">
			{@render assetMark(symbol)}
			<div class="min-w-0">
				<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">{label}</p>
			</div>
			<p
				class={emphasized ? 'ml-auto text-right text-2xl font-bold tabular-nums' : 'wallet-amount'}
			>
				{amount}
			</p>
		</div>
	{/snippet}

	<section class="card bg-base-100 border-base-300 shrink-0 border shadow-sm">
		<div class="card-body gap-0 p-0">
			<div class="flex items-center justify-between gap-3 px-4 py-2">
				<p class="text-sm font-semibold">{translate('wallet.tab_balance', 'Balance')}</p>
				{#if $walletStore.isConnected && $walletStore.rgb?.initialized}
					<span class="badge badge-success badge-sm" data-testid="wallet-connected">
						{translate('wallet.tab_connected', 'Connected')}
					</span>
				{:else if $walletStore.isInitializing}
					<span class="badge badge-warning badge-sm gap-2">
						<span class="loading loading-spinner loading-xs"></span>
						{translate('wallet.loading', 'Loading wallet')}
					</span>
				{:else}
					<span class="badge badge-ghost badge-sm">
						{translate('wallet.error.no_connection', 'Wallet offline')}
					</span>
				{/if}
			</div>
			{#if heroAssets.hero}
				<div class="border-base-300 flex items-center gap-3 border-t px-4 py-4">
					{@render assetMark(heroAssets.hero.symbol || heroAssets.hero.name)}
					<div class="min-w-0">
						<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">
							{heroAssets.hero.symbol || heroAssets.hero.name}
						</p>
						<p class="truncate text-2xl font-bold tabular-nums">
							{heroAssets.hero.formattedBalance || formatNumber(heroAssets.hero.balance)}
						</p>
					</div>
				</div>
			{/if}
			{@render balanceRow(
				'BTC',
				translate('wallet.bitcoin', 'Bitcoin'),
				`${formatNumber($walletStore.totalBalances.sats)} ${translate('wallet.sats', 'sats')}`,
				!heroAssets.hero
			)}
			{#each heroAssets.rest as asset (asset.assetId)}
				{@render balanceRow(
					asset.symbol || asset.name,
					asset.name,
					asset.formattedBalance || formatNumber(asset.balance),
					false
				)}
			{/each}
		</div>
	</section>

	<div
		class="flex min-h-0 flex-1 flex-col gap-2 {showUtxoDetails
			? 'overflow-y-auto'
			: 'overflow-hidden'}"
	>
		<section
			class="card bg-base-100 border-base-300 shrink-0 border shadow-sm"
			data-testid="wallet-utxos"
		>
			<div class="card-body gap-1 p-3">
				<div class="flex items-center justify-between gap-3">
					<p class="text-sm font-semibold">
						{translate('wallet.utxo_state', 'RGB state and UTXOs')}
					</p>
					<span class="badge badge-ghost badge-sm">{utxos.length}</span>
				</div>
				{#if utxoError}
					<p class="text-error text-sm">{utxoError}</p>
				{:else if utxos.length === 0}
					<p class="text-base-content/60 text-sm">{translate('wallet.no_utxos', 'No UTXOs')}</p>
				{:else}
					<ul class="text-sm">
						<li>
							{$t('wallet.utxo_asset_bearing', { values: { count: utxoSummary.colored } })}
						</li>
						<li>{$t('wallet.utxo_in_escrow', { values: { count: utxoSummary.locked } })}</li>
						<li>
							{$t('wallet.utxo_available_btc', { values: { count: utxoSummary.available } })}
						</li>
					</ul>
					<button
						type="button"
						class="btn btn-ghost btn-sm w-full"
						aria-expanded={showUtxoDetails}
						onclick={() => (showUtxoDetails = !showUtxoDetails)}
					>
						{translate('wallet.utxo_advanced', 'Advanced details')}
					</button>
					{#if showUtxoDetails}
						<ul class="divide-base-300 divide-y">
							{#each utxos as utxo (utxo.id)}
								<li class="flex flex-col gap-0.5 py-1.5">
									<div class="flex items-center gap-2">
										<p class="min-w-0 flex-1 truncate font-mono text-xs" title={utxo.outpoint}>
											{shortOutpoint(utxo.outpoint)}
										</p>
										<span
											class="badge badge-sm shrink-0"
											class:badge-success={utxo.kind === 'free'}
											class:badge-info={utxo.kind === 'colored'}
											class:badge-warning={utxo.kind === 'locked'}
											class:badge-ghost={utxo.kind === 'vanilla'}
										>
											{utxoKindLabel(utxo.kind)}
										</span>
									</div>
									<p class="text-base-content/70 text-xs tabular-nums">
										{formatNumber(utxo.sats)}
										{translate('wallet.sats', 'sats')}
										·
										{$t('wallet.utxo_allocations', { values: { count: utxo.allocations } })}
									</p>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
		</section>

		<section
			class="card bg-base-100 border-base-300 flex min-h-0 flex-1 flex-col overflow-hidden border shadow-sm"
		>
			<div class="card-body min-h-0 flex-1 gap-1 overflow-hidden p-3">
				<div class="flex shrink-0 items-center justify-between gap-3">
					<p class="text-sm font-semibold">
						{translate('wallet.transaction_history', 'Transaction History')}
					</p>
					<span class="badge badge-ghost badge-sm">{$walletStore.transactions.length}</span>
				</div>
				{#if $walletStore.transactions.length === 0}
					<p class="text-base-content/60 text-sm">
						{translate('wallet.no_transactions', 'No transactions found.')}
					</p>
				{:else}
					<div class="min-h-0 flex-1 overflow-y-auto">
						{#each $walletStore.transactions as transaction (transaction.id)}
							{@const incoming = transaction.type === 'receive'}
							<div class="flex items-center gap-3 py-2">
								<span
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
									class:bg-success={incoming}
									class:text-success-content={incoming}
									class:bg-primary={!incoming}
									class:text-primary-content={!incoming}
									aria-hidden="true"
								>
									<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
										{#if incoming}
											<path
												fill-rule="evenodd"
												d="M5.22 9.22a.75.75 0 011.06 0L9.25 12.19V3.75a.75.75 0 011.5 0v8.44l2.97-2.97a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 10.28a.75.75 0 010-1.06z"
												clip-rule="evenodd"
											/>
										{:else}
											<path
												fill-rule="evenodd"
												d="M14.78 10.78a.75.75 0 01-1.06 0L10.75 7.81v8.44a.75.75 0 01-1.5 0V7.81L6.28 10.78a.75.75 0 11-1.06-1.06l4.25-4.25a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06z"
												clip-rule="evenodd"
											/>
										{/if}
									</svg>
								</span>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">
										{historyLabel(
											transaction.type,
											transaction.description,
											formatNumber(transaction.amountSats)
										)}
									</p>
									<p class="text-base-content/60 text-xs">
										{formatRelativeTime(transaction.timestamp, Date.now(), $locale || 'en')}
									</p>
								</div>
								{#if isRgbMovement(transaction.description)}
									<p class="wallet-amount">
										{formatNumber(transaction.amountSats)}
										{translate('wallet.sats', 'sats')}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>

	<div class="grid shrink-0 grid-cols-2 gap-2 pt-1">
		<button class="btn btn-primary gap-2" type="button" onclick={openSend}>
			<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
				<path
					fill-rule="evenodd"
					d="M14.78 10.78a.75.75 0 01-1.06 0L10.75 7.81v8.44a.75.75 0 01-1.5 0V7.81L6.28 10.78a.75.75 0 11-1.06-1.06l4.25-4.25a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06z"
					clip-rule="evenodd"
				/>
			</svg>
			{translate('wallet.tab_send', 'Send')}
		</button>
		<button class="btn btn-neutral gap-2" type="button" onclick={() => (isReceiveOpen = true)}>
			<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
				<path
					fill-rule="evenodd"
					d="M5.22 9.22a.75.75 0 011.06 0L9.25 12.19V3.75a.75.75 0 011.5 0v8.44l2.97-2.97a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 10.28a.75.75 0 010-1.06z"
					clip-rule="evenodd"
				/>
			</svg>
			{translate('wallet.tab_receive', 'Receive')}
		</button>
	</div>

	<WalletPaymentModal isOpen={isSendOpen} onClose={closeSend}>
		<SendPaymentForm onSent={handleSent} onCancel={closeSend} />
	</WalletPaymentModal>
	<WalletPaymentModal isOpen={isReceiveOpen} onClose={handleReceiveClose}>
		<ReceivePaymentForm onClose={handleReceiveClose} />
	</WalletPaymentModal>
</div>

<style>
	/* Keep this page inside the content viewport so Send/Receive stay above the dock. */
	:global(.app-shell__content:has(.wallet-screen)) {
		overflow: hidden;
	}

	.wallet-amount {
		flex: none;
		margin-left: auto;
		text-align: right;
		font-size: 0.875rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: 1.25rem;
		white-space: nowrap;
	}
</style>
