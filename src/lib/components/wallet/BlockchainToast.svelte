<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { beforeNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { getNetworkDisplay } from '$lib/utils/send-network-mapping';
	import {
		blockchainToastStore,
		type BlockchainToastItem
	} from '$lib/stores/wallet/blockchain-toast.store';
	import { formatSats } from '$lib/utils/wallet/format';

	let storeState = $derived($blockchainToastStore);
	let expanded = $derived(storeState.expanded);

	let toasts = $derived(storeState.toasts);
	let hasItems = $derived(toasts.length > 0);

	// Most recent confirming item, or first item
	let mostRecent = $derived(toasts.find((t) => t.status === 'confirming') ?? toasts[0] ?? null);

	let otherCount = $derived(Math.max(0, toasts.length - 1));

	// Collapse on navigation
	if (browser) {
		beforeNavigate(() => {
			blockchainToastStore.dismissActive();
		});
	}

	// Keyboard dismiss via Escape
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && expanded) {
			blockchainToastStore.dismissActive();
		}
	}

	/** Estimated time remaining for a confirming item. */
	function formatTime(item: BlockchainToastItem): string {
		const blocksRemaining = Math.max(
			0,
			(item.requiredConfirmations ?? 3) - (item.currentBlock ?? 0)
		);
		if (blocksRemaining <= 0) return '';
		const seconds = blocksRemaining * 30;
		if (seconds < 60) return $t('wallet.toast.time_approx_seconds', { values: { seconds } });
		return $t('wallet.toast.time_approx_minutes', {
			values: { minutes: Math.ceil(seconds / 60) }
		});
	}

	function formatCollapsedDescription(item: BlockchainToastItem): string {
		const formatted = formatSats(item.amount);
		if (item.type === 'swap')
			return $t('wallet.toast.swapping', { values: { amount: formatted, asset: item.asset } });
		if (item.type === 'defi')
			return $t('wallet.toast.swapping', { values: { amount: formatted, asset: item.asset } });
		return $t('wallet.toast.sending', { values: { amount: formatted, asset: item.asset } });
	}

	function formatCollapsedStatus(item: BlockchainToastItem): string {
		if (item.status === 'confirming') return $t('wallet.toast.confirming');
		if (item.status === 'success') return $t('wallet.toast.confirmed');
		if (item.status === 'error') return $t('wallet.toast.error');
		if (item.status === 'stale') return $t('wallet.toast.stale_warning');
		return $t('wallet.toast.confirming');
	}

	function getBlockExplorerUrl(item: BlockchainToastItem): string | null {
		if (!item.txHash || !item.network) return null;
		const display = getNetworkDisplay(item.network);
		if (!display?.explorerUrl) return null;
		const baseUrl = display.explorerUrl.replace(/\/address\/?$/, '');
		return `${baseUrl}/tx/${item.txHash}`;
	}

	function toggleExpand() {
		blockchainToastStore.toggleExpanded();
	}

	function handleDismiss(id: string, e: MouseEvent) {
		e.stopPropagation();
		blockchainToastStore.remove(id);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if hasItems}
	<div
		class="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-2"
		style:padding-bottom="calc(var(--app-footer-height, 0px) + 0.5rem)"
		role="status"
		aria-live="polite"
	>
		<div class="pointer-events-auto w-full max-w-lg">
			{#if expanded}
				<!-- ═══ Expanded: scrollable list ═══ -->
				<div
					class="bg-base-100 border-base-300 overflow-y-auto rounded-xl border shadow-lg"
					style:max-height="40vh"
					transition:fly={{ y: 40, duration: 300, easing: cubicOut }}
				>
					<!-- Header -->
					<div class="border-base-300 flex items-center justify-between border-b p-3">
						<span class="text-sm font-medium">{$t('wallet.toast.blockchain_activity')}</span>
						<button class="btn btn-ghost btn-xs" onclick={toggleExpand}>
							{$t('wallet.toast.collapse')}
						</button>
					</div>

					<!-- Items -->
					{#each toasts as item (item.id)}
						{@const explorerUrl = getBlockExplorerUrl(item)}
						<div class="border-base-300 border-b p-3 last:border-b-0">
							<div class="flex items-center gap-3">
								<!-- Status icon -->
								{#if item.status === 'confirming'}
									<span class="loading loading-spinner loading-sm text-primary shrink-0"></span>
								{:else if item.status === 'success'}
									<span class="text-success shrink-0 text-lg">✓</span>
								{:else if item.status === 'error'}
									<span class="text-error shrink-0 text-lg">✗</span>
								{:else if item.status === 'stale'}
									<span class="text-warning shrink-0 text-lg">⚠</span>
								{:else}
									<span class="text-base-content/50 shrink-0 text-lg">●</span>
								{/if}

								<!-- Description -->
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">
										{#if item.type === 'swap'}
											{$t('wallet.toast.swapping', {
												values: {
													fromAmount: formatSats(item.amount),
													fromAsset: item.asset
												}
											})}
										{:else}
											{$t('wallet.toast.sending', {
												values: { amount: formatSats(item.amount), asset: item.asset }
											})}
										{/if}
									</p>

									{#if item.status === 'confirming'}
										<p class="text-base-content/60 text-xs">
											{formatTime(item)}
										</p>
										<progress
											class="progress progress-primary mt-1 w-full"
											value={item.currentBlock ?? 0}
											max={item.requiredConfirmations}
										></progress>
									{:else if item.status === 'success'}
										<p class="text-success text-xs">{$t('wallet.toast.confirmed')}</p>
									{:else if item.status === 'error' && item.error}
										<p class="text-error text-xs">
											{$t(item.error, (item.errorValues ?? {}) as Record<string, string | number>)}
										</p>
									{:else if item.status === 'stale'}
										<p class="text-warning text-xs">{$t('wallet.toast.stale_warning')}</p>
									{/if}
								</div>

								<!-- Actions -->
								<div class="flex shrink-0 gap-1">
									{#if item.actions.length > 0}
										{#each item.actions as action (action.labelKey)}
											<button
												class="btn btn-primary btn-xs"
												onclick={(e) => {
													e.stopPropagation();
													action.onClick();
												}}
											>
												{$t(action.labelKey)}
											</button>
										{/each}
									{:else if item.status === 'success' || item.status === 'error'}
										<button class="btn btn-ghost btn-xs" onclick={(e) => handleDismiss(item.id, e)}>
											{$t('wallet.toast.dismiss')}
										</button>
									{/if}
								</div>
							</div>

							<!-- Explorer link -->
							{#if explorerUrl}
								<a
									href={explorerUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="text-primary mt-1 inline-block text-xs"
									onclick={(e) => e.stopPropagation()}
								>
									{$t('wallet.toast.view_explorer')}
								</a>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<!-- ═══ Collapsed: summary line ═══ -->
				<button
					class="bg-base-100 border-base-300 w-full rounded-xl border p-3 text-left shadow-lg"
					transition:fly={{ y: 40, duration: 300, easing: cubicOut }}
					onclick={toggleExpand}
				>
					{#if mostRecent}
						<div class="flex items-center gap-3">
							<!-- Status icon -->
							{#if mostRecent.status === 'confirming'}
								<span class="loading loading-spinner loading-sm text-primary shrink-0"></span>
							{:else if mostRecent.status === 'success'}
								<span class="text-success shrink-0 text-lg">✓</span>
							{:else if mostRecent.status === 'error'}
								<span class="text-error shrink-0 text-lg">✗</span>
							{:else if mostRecent.status === 'stale'}
								<span class="text-warning shrink-0 text-lg">⚠</span>
							{:else}
								<span class="text-base-content/50 shrink-0 text-lg">●</span>
							{/if}

							<!-- Description -->
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">
									{formatCollapsedDescription(mostRecent)}
									{#if otherCount > 0}
										<span class="text-base-content/50">
											{$t('wallet.toast.others_pending', { values: { count: otherCount } })}
										</span>
									{/if}
								</p>
								<p class="text-base-content/60 text-xs">
									{formatCollapsedStatus(mostRecent)}
								</p>
							</div>

							<!-- Progress bar (confirming only) -->
							{#if mostRecent.status === 'confirming'}
								<progress
									class="progress progress-primary w-20 shrink-0"
									value={mostRecent.currentBlock ?? 0}
									max={mostRecent.requiredConfirmations}
								></progress>
							{/if}

							<span class="text-base-content/50 text-xs">{$t('wallet.toast.details')}</span>
						</div>
					{/if}
				</button>
			{/if}
		</div>
	</div>
{/if}
