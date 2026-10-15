<script lang="ts">
	import { onMount } from 'svelte';
	import { locale, t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { lightningStore } from '$lib/stores/wallet/signet-lsp';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
	import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
	import { scheduleRgbRefresh } from '$lib/stores/wallet/wallet-balances';
	import { formatUsdtBalance, usdtPrecision } from '$lib/types/rgb-contract';
	import {
		pendingBlindReceives,
		type BlindReceiveRow
	} from '$lib/stores/wallet/decode-rgb-invoice';
	import {
		parseWalletUtxos,
		type WalletUtxoKind,
		type WalletUtxoRow
	} from '$lib/stores/wallet/rgb-allocations';
	import {
		formatHistoryAmount,
		formatRelativeTime,
		isRgbMovement,
		shortOutpoint,
		signetTxUrl,
		summarizeUtxoKinds
	} from '$lib/components/wallet/wallet-formatters';

	let initializationError = $state<string | null>(null);
	let operationMessage = $state<string | null>(null);
	let isSendOpen = $state(false);
	let isReceiveOpen = $state(false);
	let utxos = $state<WalletUtxoRow[]>([]);
	let utxoError = $state<string | null>(null);
	let showUtxoDetails = $state(false);
	let showAllHistory = $state(false);
	let blindReceives = $state<BlindReceiveRow[]>([]);
	let refreshedSeal = $state('');
	let refreshing = $state(false);
	const receiveLocked = $derived(blindReceives.some((row) => !row.txid));
	const rgbAssets = $derived($walletStore.rgb.assets ?? []);
	const usdtAsset = $derived(
		rgbAssets.find((asset) => asset.symbol?.toUpperCase() === 'USDT') ?? null
	);
	const chainGap = $derived.by(() => {
		if (!usdtAsset || usdtAsset.chainSpendable == null) return null;
		const reported = usdtAsset.spendable ?? usdtAsset.balance;
		if (reported <= usdtAsset.chainSpendable) return null;
		const precision = usdtPrecision(usdtAsset.symbol, usdtAsset.precision);
		return {
			reported: formatUsdtBalance(reported, precision),
			chain: formatUsdtBalance(usdtAsset.chainSpendable, precision)
		};
	});
	const otherAssets = $derived(rgbAssets.filter((asset) => asset !== usdtAsset));
	const visibleTransactions = $derived(
		showAllHistory ? $walletStore.transactions : $walletStore.transactions.slice(0, 5)
	);
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
			await walletManager.loadAssets();
			const wallet = getUtexoWallet();
			if (wallet) scheduleRgbRefresh(wallet);
			await loadUtxos();
			await loadBlindReceives();
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

	$effect(() => {
		const balance = usdtAsset?.balance ?? null;
		if (balance === null && usdtAsset) return;
		loadBlindReceives().catch((error: unknown) => {
			console.error('[wallet-page] receive list failed:', error);
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

	async function loadBlindReceives(): Promise<void> {
		const wallet = getUtexoWallet();
		if (!wallet?.listTransfers) {
			blindReceives = [];
			return;
		}
		try {
			const plain = await wallet.listTransfers();
			const listed = wallet.listAssets ? await wallet.listAssets().catch(() => null) : null;
			const ids: string[] = [];
			if (listed && typeof listed === 'object') {
				const groups = listed as { ifa?: unknown; nia?: unknown };
				for (const rows of [groups.ifa, groups.nia]) {
					if (!Array.isArray(rows)) continue;
					for (const row of rows) {
						if (!row || typeof row !== 'object') continue;
						const assetId = (row as { assetId?: unknown }).assetId;
						if (typeof assetId === 'string' && assetId.length > 0) ids.push(assetId);
					}
				}
			}
			const named = await Promise.all(
				ids.map(async (id) => {
					try {
						const batch = await wallet.listTransfers?.(id);
						return Array.isArray(batch) ? batch : [];
					} catch {
						return [];
					}
				})
			);
			blindReceives = pendingBlindReceives([
				...(Array.isArray(plain) ? plain : []),
				...named.flat()
			]);
		} catch (error) {
			blindReceives = [];
			console.error('[wallet-page] receive list failed:', error);
		}
		const paid = blindReceives.find((row) => row.txid);
		if (paid?.txid && refreshedSeal !== paid.seal) {
			refreshedSeal = paid.seal;
			scheduleRgbRefresh(wallet);
		}
	}

	async function refreshTransfers(): Promise<void> {
		const wallet = getUtexoWallet();
		if (!wallet || refreshing) return;
		refreshing = true;
		try {
			await scheduleRgbRefresh(wallet);
			await walletManager.loadAssets();
			await loadUtxos();
			await loadBlindReceives();
		} catch (error) {
			console.error('[wallet-page] refresh failed:', error);
		} finally {
			refreshing = false;
		}
	}

	function utxoKindLabel(kind: WalletUtxoKind): string {
		if (kind === 'free') return translate('wallet.utxo_free', 'Free');
		if (kind === 'colored') return translate('wallet.utxo_colored', 'Colored');
		if (kind === 'locked') return translate('wallet.utxo_locked', 'Locked');
		return translate('wallet.utxo_vanilla', 'Vanilla');
	}

	function handleSent(txid: string): void {
		if (!txid) {
			operationMessage = null;
			return;
		}
		operationMessage = /^[0-9a-f]{64}$/i.test(txid)
			? text($t('wallet.toast.sent_successfully', { values: { txid } }), `Sent ${txid}`)
			: translate('wallet.toast.sent_successfully', 'Sent');
	}

	function handleReceiveClose(): void {
		isReceiveOpen = false;
	}

	function assetLabel(symbol: string | undefined, name: string | undefined): string {
		const label = (symbol || name || '').trim();
		if (!label || /^(nia|ifa|utxob|consignment)$/i.test(label)) {
			return translate('wallet.asset', 'Asset');
		}
		return label;
	}

	function historyLabel(type: string, description: string | undefined): string {
		const incoming = type === 'receive';
		if (isRgbMovement(description)) {
			return translate(
				incoming ? 'wallet.received_rgb' : 'wallet.sent_rgb',
				incoming ? 'Received USDT' : 'Sent USDT'
			);
		}
		return translate(
			incoming ? 'wallet.received_sats' : 'wallet.sent_sats',
			incoming ? 'Received bitcoin' : 'Sent bitcoin'
		);
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

<div class="wallet-screen mx-auto flex w-full max-w-md flex-col gap-4 p-3 sm:p-6">
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

	{#snippet balanceRow(symbol: string, label: string, amount: string)}
		<div class="border-base-300 flex w-full items-center gap-3 border-t px-4 py-3">
			{@render assetMark(symbol)}
			<p class="text-base-content/60 min-w-0 text-sm">{label}</p>
			<p class="ml-auto text-right text-2xl font-bold tabular-nums">{amount}</p>
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
			{@render balanceRow(
				'BTC',
				translate('wallet.bitcoin', 'Bitcoin'),
				`${formatNumber($walletStore.totalBalances.sats)} ${translate('wallet.sats', 'sats')}`
			)}
			{@render balanceRow(
				'USDT',
				usdtAsset ? assetLabel(usdtAsset.symbol, usdtAsset.name) : 'USDT',
				usdtAsset
					? formatUsdtBalance(
							usdtAsset.balance,
							usdtPrecision(usdtAsset.symbol, usdtAsset.precision)
						)
					: formatUsdtBalance(0, 6)
			)}
			{#if chainGap}
				<div class="alert alert-outline alert-warning mx-4 my-2" role="status">
					<span>
						{$t('wallet.chain_balance_gap', {
							values: { reported: chainGap.reported, chain: chainGap.chain }
						})}
					</span>
				</div>
			{/if}
			{#each otherAssets as asset (asset.assetId)}
				{@render balanceRow(
					asset.symbol || asset.name,
					assetLabel(asset.symbol, asset.name),
					asset.formattedBalance || formatNumber(asset.balance)
				)}
			{/each}
		</div>
	</section>

	<section
		class="card bg-base-100 border-base-300 shrink-0 border shadow-sm"
		data-testid="lightning-wallet"
	>
		<div class="card-body gap-2 p-4">
			<div class="flex items-center justify-between gap-3">
				<p class="text-sm font-semibold">{translate('wallet.lightning_title', 'Lightning')}</p>
				{#if $lightningStore.ready}
					<span class="badge badge-success badge-sm" data-testid="lightning-ready">
						{translate('wallet.lightning_ready', 'Ready')}
					</span>
				{:else}
					<span class="badge badge-ghost badge-sm" data-testid="lightning-offline">
						{translate('wallet.lightning_offline', 'Not ready')}
					</span>
				{/if}
			</div>
			<p class="text-base-content/70 text-sm">
				{translate(
					'wallet.lightning_hint',
					'On-chain USDT does not need a Lightning channel. Lightning here is for bitcoin sats.'
				)}
			</p>
			{#if $lightningStore.peerHost}
				<p class="font-mono text-xs" data-testid="lightning-peer">{$lightningStore.peerHost}</p>
			{/if}
			{#if $lightningStore.channel === 'waiting'}
				<p class="text-sm" data-testid="lightning-channel">
					{translate('wallet.lightning_channel_waiting', 'Waiting for an LSP channel')}
				</p>
			{:else if $lightningStore.channel === 'open'}
				<p class="text-success text-sm" data-testid="lightning-channel">
					{translate('wallet.lightning_channel_open', 'LSP channel is open')}
				</p>
			{:else if $lightningStore.channel === 'missing'}
				<p class="text-sm" data-testid="lightning-channel">
					{translate('wallet.lightning_channel_missing', 'No LSP channel yet')}
				</p>
			{:else}
				<p class="text-sm" data-testid="lightning-channel">
					{translate('wallet.lightning_channel_closed', 'LSP channel not open')}
				</p>
			{/if}
			{#if $lightningStore.rgbInvoice}
				<p class="text-xs">{translate('wallet.lightning_rgb_invoice', 'On-chain RGB invoice')}</p>
				<p class="font-mono text-xs break-all" data-testid="lightning-rgb-invoice">
					{$lightningStore.rgbInvoice}
				</p>
			{/if}
			{#if $lightningStore.lnInvoice}
				<p class="text-xs">{translate('wallet.lightning_ln_invoice', 'Lightning invoice')}</p>
				<p class="font-mono text-xs break-all" data-testid="lightning-ln-invoice">
					{$lightningStore.lnInvoice}
				</p>
			{/if}
		</div>
	</section>

	<div class="flex flex-col gap-4">
		<section class="card bg-base-100 border-base-300 border shadow-sm" data-testid="wallet-utxos">
			<div class="card-body gap-2 p-4">
				<p class="text-base-content/60 text-sm">
					{translate('wallet.utxo_state', 'Assets on Bitcoin')}
				</p>
				<button
					type="button"
					class="btn btn-ghost btn-sm text-base-content/50 w-full"
					aria-expanded={showUtxoDetails}
					onclick={() => (showUtxoDetails = !showUtxoDetails)}
				>
					{translate('wallet.utxo_advanced', 'Show coin details')}
				</button>
				{#if showUtxoDetails}
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
			<div class="card-body min-h-0 flex-1 gap-0 overflow-hidden p-0">
				<div class="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
					<p class="text-sm font-semibold">
						{translate('wallet.transaction_history', 'Transaction History')}
					</p>
					<button
						type="button"
						class="btn btn-outline btn-sm"
						data-testid="refresh-transfers"
						disabled={refreshing}
						onclick={() => {
							void refreshTransfers();
						}}
					>
						{#if refreshing}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{translate('wallet.refresh_transfers', 'Refresh transfers')}
					</button>
					<span class="badge badge-ghost badge-sm">{$walletStore.transactions.length}</span>
				</div>
				{#if $walletStore.transactions.length === 0}
					<p class="text-base-content/60 px-4 pb-3 text-sm">
						{translate('wallet.no_transactions', 'No transactions found.')}
					</p>
				{:else}
					<div class="flex flex-col">
						{#each visibleTransactions as transaction (transaction.id)}
							{@const txid = transaction.txHash || transaction.id}
							{@const explorerUrl = signetTxUrl(txid)}
							{@const rgb = isRgbMovement(transaction.description)}
							{@const rowClass =
								'border-base-300 text-base-content hover:bg-base-200 flex w-full items-center gap-3 border-t px-4 py-3 no-underline'}
							{#snippet historyBody()}
								{@render assetMark(rgb ? 'USDT' : 'BTC')}
								<div class="min-w-0">
									<p class="text-base-content/60 truncate text-sm">
										{historyLabel(transaction.type, transaction.description)}
									</p>
									<p class="truncate font-mono text-xs" title={txid}>
										{shortOutpoint(txid)}
									</p>
									<p class="text-base-content/50 text-xs">
										{formatRelativeTime(transaction.timestamp, Date.now(), $locale || 'en')}
									</p>
								</div>
								<p class="text-base-content/70 ml-auto shrink-0 text-right text-xs tabular-nums">
									{formatHistoryAmount(
										transaction.description,
										transaction.amountSats,
										transaction.assetUnits,
										translate('wallet.sats', 'sats')
									)}
								</p>
							{/snippet}
							{#if explorerUrl}
								<a
									class={rowClass}
									href={explorerUrl}
									target="_blank"
									rel="noopener noreferrer"
									title={txid}
								>
									{@render historyBody()}
								</a>
							{:else}
								<div class={rowClass} title={txid}>
									{@render historyBody()}
								</div>
							{/if}
						{/each}
					</div>
					{#if $walletStore.transactions.length > 5 && !showAllHistory}
						<button
							type="button"
							class="btn btn-ghost btn-sm text-base-content/50 w-full"
							onclick={() => (showAllHistory = true)}
						>
							{translate('wallet.see_all', 'See all')}
						</button>
					{/if}
				{/if}
			</div>
		</section>
	</div>

	{#if blindReceives.length > 0}
		<div class="alert alert-outline flex flex-col items-start gap-1" data-testid="receive-waiting">
			{#each blindReceives as row (`${row.seal}-${row.status}`)}
				<p class="font-mono text-xs">{row.seal}</p>
				<p class="text-xs">{row.status}</p>
				{#if row.expiry}<p class="text-xs">{row.expiry}</p>{/if}
				<p class="font-mono text-xs break-all">
					{row.txid ?? translate('wallet.receive_waiting', 'Waiting for txid')}
				</p>
			{/each}
		</div>
	{/if}

	<div class="grid shrink-0 grid-cols-2 gap-2 pt-1">
		<button class="btn btn-primary glow-soft gap-2" type="button" onclick={openSend}>
			<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
				<path
					fill-rule="evenodd"
					d="M14.78 10.78a.75.75 0 01-1.06 0L10.75 7.81v8.44a.75.75 0 01-1.5 0V7.81L6.28 10.78a.75.75 0 11-1.06-1.06l4.25-4.25a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06z"
					clip-rule="evenodd"
				/>
			</svg>
			{translate('wallet.tab_send', 'Send')}
		</button>
		<button
			class="btn btn-neutral gap-2"
			type="button"
			disabled={receiveLocked}
			onclick={() => (isReceiveOpen = true)}
		>
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
		<SendPaymentForm
			initialAsset={usdtAsset && usdtAsset.balance > 0 ? 'usdt_rgb' : 'btc_onchain'}
			onSent={handleSent}
			onCancel={closeSend}
		/>
	</WalletPaymentModal>
	<WalletPaymentModal isOpen={isReceiveOpen} onClose={handleReceiveClose}>
		<ReceivePaymentForm onClose={handleReceiveClose} onchainLocked={receiveLocked} />
	</WalletPaymentModal>
</div>
