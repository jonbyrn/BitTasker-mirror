<script lang="ts">
	import { locale, t } from 'svelte-i18n';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { advancedWallet } from '$lib/stores/wallet/wallet-mode';
	import PullToRefresh from './PullToRefresh.svelte';
	import { mergedTransactionRows, type TransactionListRow } from './transaction-rows';

	let { onRefresh }: { onRefresh: () => void | Promise<void> } = $props();

	let selected = $state<TransactionListRow | null>(null);
	const rows = $derived(
		mergedTransactionRows($walletStore.transactions, {
			btcUsd: btcPrice.price > 0 ? btcPrice.price : null,
			now: Date.now(),
			locale: $locale || 'en',
			satsWord: $t('wallet.transactions.sats'),
			unavailable: $t('wallet.transactions.price_unavailable')
		})
	);

	function openRow(row: TransactionListRow): void {
		selected = row;
	}

	function closeDetail(): void {
		selected = null;
	}
</script>

<PullToRefresh
	class="mx-auto flex w-full max-w-md min-w-0 flex-col gap-3 p-3 sm:p-6"
	{onRefresh}
	label={$t('wallet.transactions.pull')}
>
	<a class="btn btn-ghost min-h-12 w-fit px-3" href="/wallet" data-testid="transactions-back">
		{$t('wallet.transactions.back')}
	</a>
	<h1 class="text-lg font-semibold">{$t('wallet.transactions.title')}</h1>
	{#if rows.length === 0}
		<p class="text-base-content/60 text-sm" data-testid="transactions-empty">
			{$t('wallet.transactions.empty')}
		</p>
	{:else}
		<ul
			class="card bg-base-100 border-base-300 divide-base-300 divide-y border shadow-sm"
			data-testid="transactions-list"
		>
			{#each rows as row (row.key)}
				<li>
					<button
						type="button"
						class="hover:bg-base-200 flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left"
						data-testid="transaction-row"
						onclick={() => openRow(row)}
					>
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
							class:bg-primary={row.asset === 'BTC'}
							class:text-primary-content={row.asset === 'BTC'}
							class:bg-success={row.asset === 'USDT'}
							class:text-success-content={row.asset === 'USDT'}
							aria-hidden="true"
						>
							{row.asset === 'BTC' ? '₿' : '₮'}
						</span>
						<div class="min-w-0 flex-1">
							<p data-testid="transaction-direction">
								{$t(
									row.direction === 'received'
										? 'wallet.transactions.received'
										: 'wallet.transactions.sent'
								)}
							</p>
							<p class="text-base-content/50 text-xs" data-testid="transaction-when">{row.when}</p>
							{#if row.status}
								<p class="text-base-content/50 text-xs" data-testid="transaction-status">
									{$t(`wallet.transactions.${row.status}`)}
								</p>
							{/if}
						</div>
						<div class="shrink-0 text-right">
							<p class="font-semibold tabular-nums" data-testid="transaction-primary">
								{row.primary}
							</p>
							<p
								class="text-base-content/60 text-xs tabular-nums"
								data-testid="transaction-secondary"
							>
								{row.secondary}
							</p>
						</div>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</PullToRefresh>

{#if selected}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		data-testid="transaction-detail"
		onclick={(event) => {
			if (event.currentTarget === event.target) closeDetail();
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') closeDetail();
		}}
	>
		<div class="bg-base-100 w-full max-w-md rounded-2xl p-4 shadow-xl">
			<p class="text-base-content/60 text-sm">
				{$t(
					selected.direction === 'received'
						? 'wallet.transactions.received'
						: 'wallet.transactions.sent'
				)}
			</p>
			<p class="text-2xl font-bold tabular-nums">{selected.primary}</p>
			<p class="text-base-content/70 tabular-nums">{selected.secondary}</p>
			<p class="text-base-content/50 mt-1 text-sm">{selected.when}</p>
			{#if selected.status}
				<p class="text-sm" data-testid="transaction-detail-status">
					{$t(`wallet.transactions.${selected.status}`)}
				</p>
			{/if}
			{#if $advancedWallet && selected.txid}
				<p class="mt-4 font-mono text-xs break-all" data-testid="transaction-txid">
					{selected.txid}
				</p>
			{/if}
			{#if $advancedWallet && selected.explorerUrl}
				<a
					class="link mt-2 inline-flex min-h-12 items-center"
					href={selected.explorerUrl}
					target="_blank"
					rel="noopener noreferrer"
					data-testid="transaction-explorer"
				>
					{$t('wallet.transactions.explorer')}
				</a>
			{/if}
			<button
				type="button"
				class="btn mt-4 min-h-12 w-full"
				data-testid="transaction-detail-close"
				onclick={closeDetail}
			>
				{$t('wallet.transactions.close')}
			</button>
		</div>
	</div>
{/if}
