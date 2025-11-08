<script lang="ts">
	import { rskTransactions, rskWalletStore, rskWallet } from '$lib/stores/rskWallet.store';
	import { RSK_NETWORKS } from '$lib/utils/wallet/networkConfig';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { ethers } from 'ethers';
	import { appStore } from '$lib/stores/app.store';
	import { t } from 'svelte-i18n';

	let isRefreshing = $state(false);

	function formatAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function formatAmount(value: string): string {
		const amount = ethers.formatEther(value);
		return parseFloat(amount).toFixed(6);
	}

	function formatFeeInSats(gasUsed: string, gasPrice: string): string {
		// Calculate fee in wei: gasUsed * gasPrice
		const feeWei = BigInt(gasUsed) * BigInt(gasPrice);
		// Convert wei to rBTC (1 rBTC = 1e18 wei)
		const feeRBTC = Number(ethers.formatEther(feeWei.toString()));
		// Convert rBTC to sats (1 rBTC = 100,000,000 sats)
		const sats = Math.floor(feeRBTC * 100_000_000);
		return sats.toLocaleString();
	}

	function formatTimestamp(timestamp: number): string {
		return new Date(timestamp).toLocaleString();
	}

	function getTransactionUrl(hash: string): string {
		const network = RSK_NETWORKS[$rskWalletStore.network];
		return `${network.explorerUrl}/tx/${hash}`;
	}

	async function copyTxHash(hash: string) {
		await copyToClipboard(hash);
		appStore.showSuccessToast($t('wallet.transaction.toast.hash_copied'));
	}

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'confirmed':
				return 'badge-success';
			case 'pending':
				return 'badge-warning';
			case 'failed':
				return 'badge-error';
			default:
				return 'badge-ghost';
		}
	}

	function getTypeIcon(type: string): string {
		switch (type) {
			case 'send':
				return '↗️';
			case 'receive':
				return '↙️';
			case 'contract':
				return '📄';
			default:
				return '💱';
		}
	}

	function getTranslatedStatus(status: string): string {
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

    // Combine confirmed and pending transactions
	const allTransactions = $derived([...$rskWalletStore.pendingTransactions, ...$rskTransactions].sort(
		(a, b) => b.timestamp - a.timestamp
	));
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
					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-start justify-between">
								<!-- Transaction Info -->
								<div class="flex flex-1 items-start gap-3">
									<div class="text-2xl">
										{getTypeIcon(tx.type)}
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
											<div class="badge badge-sm {getStatusBadgeClass(tx.status)}">
												{getTranslatedStatus(tx.status)}
											</div>
											{#if tx.status === 'pending'}
												<span class="loading loading-spinner loading-xs"></span>
											{/if}
										</div>

										<div class="space-y-1 text-sm opacity-70">
											<div class="flex items-center gap-2">
												<span>{$t('wallet.rsk.to')}</span>
												<span class="font-mono">{formatAddress(tx.to)}</span>
												<button
													aria-label="Copy address"
													class="btn btn-ghost btn-xs"
													onclick={() => copyTxHash(tx.to)}
													title="Copy address"
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
															d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
														/>
													</svg>
												</button>
											</div>

											<div class="flex items-center gap-2">
												<span>{$t('wallet.rsk.hash')}</span>
												<span class="font-mono">{formatAddress(tx.hash)}</span>
												<button
													aria-label="Copy hash"
													class="btn btn-ghost btn-xs"
													onclick={() => copyTxHash(tx.hash)}
													title="Copy hash"
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
															d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
														/>
													</svg>
												</button>
											</div>

											{#if tx.blockNumber > 0}
												<div>{$t('wallet.rsk.block')} #{tx.blockNumber.toLocaleString()}</div>
											{/if}

											<div>{formatTimestamp(tx.timestamp)}</div>
										</div>
									</div>
								</div>

								<!-- Amount and Actions -->
								<div class="flex flex-col items-end gap-2 text-right">
									<div class="text-lg font-bold">
										{#if tx.type === 'send'}
											<span class="text-error">-{formatAmount(tx.value)}</span>
										{:else}
											<span class="text-success">+{formatAmount(tx.value)}</span>
										{/if}
										<span class="ml-1 text-sm opacity-60">RBTC</span>
									</div>

									{#if tx.gasUsed !== '0'}
										<div class="text-xs opacity-60">
											{$t('wallet.rsk.fee')} {formatFeeInSats(tx.gasUsed, tx.gasPrice)} {$t('wallet.sats')}
										</div>
									{/if}

									<!-- Action Buttons -->
									<div class="flex gap-1">
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
										</a>
									</div>
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
