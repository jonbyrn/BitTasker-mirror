<script lang="ts">
	import { rskTransactions, rskWalletStore, rskWallet } from '$lib/stores/rskWallet.store';
	import { RSK_NETWORKS } from '$lib/utils/wallet/networkConfig';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { ethers } from 'ethers';
	import { appStore } from '$lib/stores/app.store';
	import { t } from 'svelte-i18n';
	// MDI Icons
	import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
	import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconCloseCircle from '~icons/mdi/close-circle';

	let isRefreshing = $state(false);

	function formatAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function formatAmountInSats(value: string): string {
		try {
			if (!value || value === '0' || value === '') return '0';
			const amount = ethers.formatEther(value);
			const rbtcAmount = parseFloat(amount);
			if (isNaN(rbtcAmount) || !isFinite(rbtcAmount)) return '0';
			// Convert rBTC to sats (1 rBTC = 100,000,000 sats)
			const sats = Math.floor(rbtcAmount * 100_000_000);
			return sats.toLocaleString();
		} catch (error) {
			console.error('Error formatting amount:', error);
			return '0';
		}
	}

	function formatFeeInSats(gasUsed: string, gasPrice: string): string {
		try {
			if (!gasUsed || !gasPrice || gasUsed === '0' || gasPrice === '0') return '0';
			// Calculate fee in wei: gasUsed * gasPrice
			const feeWei = BigInt(gasUsed) * BigInt(gasPrice);
			// Convert wei to rBTC (1 rBTC = 1e18 wei)
			const feeRBTC = Number(ethers.formatEther(feeWei.toString()));
			if (isNaN(feeRBTC) || !isFinite(feeRBTC)) return '0';
			// Convert rBTC to sats (1 rBTC = 100,000,000 sats)
			const sats = Math.floor(feeRBTC * 100_000_000);
			return sats.toLocaleString();
		} catch (error) {
			console.error('Error formatting fee:', error);
			return '0';
		}
	}

	function formatDate(timestamp: number): string {
		try {
			if (!timestamp || isNaN(timestamp) || !isFinite(timestamp)) return '';
			const date = new Date(timestamp);
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		} catch (error) {
			console.error('Error formatting date:', error);
			return '';
		}
	}

	function formatTime(timestamp: number): string {
		try {
			if (!timestamp || isNaN(timestamp) || !isFinite(timestamp)) return '';
			const date = new Date(timestamp);
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		} catch (error) {
			console.error('Error formatting time:', error);
			return '';
		}
	}

	function getTransactionUrl(hash: string): string {
		const network = RSK_NETWORKS[$rskWalletStore.network];
		return `${network.explorerUrl}/tx/${hash}`;
	}

	async function copyTxHash(hash: string) {
		await copyToClipboard(hash);
		appStore.showSuccessToast($t('wallet.transaction.toast.hash_copied'));
	}

	function getStatusIcon(status: string) {
		if (!status) return IconClockOutline; // Fallback for undefined/null
		switch (status) {
			case 'confirmed':
				return IconCheckCircle;
			case 'pending':
				return IconClockOutline;
			case 'failed':
				return IconCloseCircle;
			default:
				// Default to pending icon for unknown statuses
				return IconClockOutline;
		}
	}

	function getStatusIconColor(status: string): string {
		if (!status) return 'text-base-content/60'; // Fallback for undefined/null
		switch (status) {
			case 'confirmed':
				return 'text-success';
			case 'pending':
				return 'text-warning';
			case 'failed':
				return 'text-error';
			default:
				// Default to muted color for unknown statuses
				return 'text-base-content/60';
		}
	}

	function getTypeIcon(type: string) {
		if (!type) return IconArrowUpBold; // Fallback for undefined/null
		switch (type) {
			case 'send':
				return IconArrowUpBold;
			case 'receive':
				return IconArrowDownBold;
			case 'contract':
				return IconFileDocumentOutline;
			default:
				// Default to send icon for unknown types (swaps are filtered out)
				return IconArrowUpBold;
		}
	}

	function getStatusLabel(status: string): string {
		if (!status) return 'Unknown'; // Fallback for undefined/null
		switch (status) {
			case 'confirmed':
				return $t('common.components.wallet.transaction_history.confirmed');
			case 'failed':
				return $t('common.components.wallet.transaction_history.failed');
			case 'pending':
				return $t('common.components.wallet.transaction_history.pending');
			default:
				return status;
		}
	}

	async function refreshTransactions() {
		if (isRefreshing) return;
		
		isRefreshing = true;
		try {
			await rskWallet.refreshTransactions();
			appStore.showSuccessToast($t('wallet.transaction.toast.refreshed'));
		} catch (error) {
			console.error('Failed to refresh transactions:', error);
			appStore.showErrorToast($t('wallet.transaction.toast.refresh_failed'));
		} finally {
			isRefreshing = false;
		}
	}

    // Combine confirmed and pending transactions, filter out swaps
	const allTransactions = $derived([...$rskWalletStore.pendingTransactions, ...$rskTransactions]
		.filter(tx => tx.type !== 'swap')
		.sort((a, b) => b.timestamp - a.timestamp)
	);
</script>

<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		<div class="mb-4 flex items-center justify-between">
			<h3 class="card-title">{$t('wallet.rsk.transaction_history')}</h3>
			<div class="badge badge-outline text-xs">
				{allTransactions.length} tx
			</div>
		</div>

		{#if allTransactions.length === 0}
			<div class="py-12 text-center">
				<div class="mb-4 text-6xl opacity-20">📝</div>
				<div class="text-lg font-semibold opacity-60">{$t('wallet.rsk.no_transactions_yet')}</div>
				<div class="mt-2 text-sm opacity-40">
					{$t('wallet.rsk.no_transactions_description')}
				</div>
			</div>
		{:else}
			<div class="space-y-3">
				{#each allTransactions as tx}
					{@const TypeIcon = getTypeIcon(tx.type || 'send')}
					{@const StatusIcon = getStatusIcon(tx.status || 'pending')}
					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center justify-between gap-2 sm:gap-4">
								<!-- Transaction Info -->
								<div class="flex flex-1 items-center gap-3">
									<div class="flex items-center gap-2">
										<div class="flex items-center justify-center w-10 h-10 rounded-full {tx.type === 'send' ? 'bg-error/20 text-error' : tx.type === 'receive' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'}">
											<TypeIcon class="w-5 h-5" />
										</div>
										<div class="flex items-center justify-center w-10 h-10 rounded-full bg-base-300/20">
											<img src="/images/chains/Bitcoin-Rootstock-logo.webp" alt="Rootstock Bitcoin" class="w-10 h-10" />
										</div>
									</div>
									<div class="min-w-0 flex-1">
										<div class="mb-1 flex items-center gap-2">
											<span class="font-semibold">
												{#if tx.type === 'send'}
													{$t('wallet.transaction.type.send')}
												{:else if tx.type === 'receive'}
													{$t('wallet.transaction.type.receive')}
												{:else if tx.type === 'contract'}
													{$t('wallet.transaction.type.contract')}
												{:else}
													{tx.type}
												{/if}
											</span>
											<div class="flex items-center justify-center w-5 h-5 {getStatusIconColor(tx.status || 'pending')}" title={getStatusLabel(tx.status || 'pending')}>
												<StatusIcon class="w-5 h-5" aria-label={getStatusLabel(tx.status || 'pending')} />
											</div>
										</div>

										<div class="text-sm opacity-70">
											<div>{formatDate(tx.timestamp)}</div>
											<div>{formatTime(tx.timestamp)}</div>
										</div>
									</div>
								</div>

								<!-- Amount, Fee, and Actions -->
								<div class="flex flex-col items-end gap-1.5 text-right">
									<div class="text-lg font-bold">
										{#if tx.type === 'send'}
											<span class="text-error">-{tx.formattedAmount || `${formatAmountInSats(tx.value || '0')} ${$t('wallet.sats')}`}</span>
										{:else}
											<span class="text-success">+{tx.formattedAmount || `${formatAmountInSats(tx.value || '0')} ${$t('wallet.sats')}`}</span>
										{/if}
									</div>

									{#if tx.gasUsed && tx.gasUsed !== '0' && tx.gasPrice && tx.gasPrice !== '0'}
										<div class="text-xs opacity-70">
											{$t('wallet.network_fee')}: {formatFeeInSats(tx.gasUsed, tx.gasPrice)} {$t('wallet.sats')}
										</div>
									{/if}

									<!-- Explorer Link -->
									<a
										aria-label="View on explorer"
										href={getTransactionUrl(tx.hash)}
										target="_blank"
										rel="noopener noreferrer"
										class="btn btn-ghost btn-xs"
										title="View on explorer"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
											/>
										</svg>
										{$t('wallet.view_explorer')}
									</a>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Load More (placeholder for future pagination) -->
		{#if allTransactions.length >= 10}
			<div class="mt-6 text-center">
				<button class="btn btn-outline btn-sm" disabled> {$t('wallet.rsk.load_more_transactions')} </button>
				<div class="mt-2 text-xs opacity-60">{$t('wallet.rsk.pagination_coming_soon')}</div>
			</div>
		{/if}
	</div>
</div>

<!-- Refresh Button -->
<div class="mt-4 flex justify-center">
	<button 
		class="btn btn-outline btn-sm" 
		onclick={refreshTransactions}
		disabled={isRefreshing}
	>
		{#if isRefreshing}
			<span class="loading loading-spinner loading-sm"></span>
		{:else}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
				/>
			</svg>
		{/if}
		{isRefreshing ? $t('wallet.rsk.refreshing') : $t('wallet.rsk.refresh')}
	</button>
</div>
