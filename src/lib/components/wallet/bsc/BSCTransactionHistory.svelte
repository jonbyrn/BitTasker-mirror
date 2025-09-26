<script lang="ts">
	import { t } from 'svelte-i18n';
	import { ethers } from 'ethers';
	import { bscUsdtWalletStore, bscTransactions, bscUsdtWallet } from '$lib/stores/bscUsdtWallet.store';
	import { BSC_NETWORKS } from '$lib/stores/bscUsdtWallet.store';

	let selectedFilter = $state('all');
	let isLoading = $state(false);

	// Get current network info
	const networkInfo = $derived(BSC_NETWORKS[$bscUsdtWalletStore.network]);
	const explorerUrl = $derived(networkInfo.explorerUrl);

	// Filter transactions
	const filteredTransactions = $derived($bscTransactions.filter(tx => {
		if (selectedFilter === 'all') return true;
		if (selectedFilter === 'sent') return tx.type === 'send';
		if (selectedFilter === 'received') return tx.type === 'receive';
		if (selectedFilter === 'usdt') return tx.tokenSymbol === 'USDT' || tx.tokenSymbol === 'tUSDT';
		if (selectedFilter === 'bnb') return !tx.tokenSymbol || tx.tokenSymbol === 'BNB';
		return true;
	}));

	// Format transaction value
	function formatTransactionValue(tx: any): string {
		if (tx.tokenSymbol) {
			// Token transaction
			const value = parseFloat(ethers.formatUnits(tx.value, 18));
			return `${value.toFixed(6)} ${tx.tokenSymbol}`;
		} else {
			// BNB transaction
			const value = parseFloat(ethers.formatEther(tx.value));
			return `${value.toFixed(6)} BNB`;
		}
	}

	// Format timestamp
	function formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleString();
	}

	// Get transaction status color
	function getStatusColor(status: string): string {
		switch (status) {
			case 'confirmed': return 'text-success';
			case 'pending': return 'text-warning';
			case 'failed': return 'text-error';
			default: return 'text-base-content';
		}
	}

	function getTranslatedStatus(status: string): string {
		switch (status) {
			case 'confirmed':
				return $t('wallet.rsk.confirmed');
			case 'failed':
				return $t('wallet.rsk.failed');
			case 'pending':
				return $t('wallet.rsk.pending');
			default:
				return status;
		}
	}

	function getTranslatedType(type: string): string {
		switch (type) {
			case 'send':
				return $t('wallet.rsk.sending');
			case 'receive':
				return $t('wallet.rsk.receiving');
			default:
				return type;
		}
	}

	// Get transaction type icon
	function getTransactionIcon(tx: any): string {
		if (tx.type === 'send') return '📤';
		if (tx.type === 'receive') return '📥';
		return '📄';
	}

	// Refresh transactions
	async function refreshTransactions() {
		isLoading = true;
		try {
			await bscUsdtWallet.refreshTransactions();
		} catch (error) {
			console.error('Failed to refresh transactions:', error);
		} finally {
			isLoading = false;
		}
	}

	// Open transaction in explorer
	function openInExplorer(txHash: string) {
		const url = `${explorerUrl}/tx/${txHash}`;
		window.open(url, '_blank');
	}

	// Copy transaction hash
	async function copyTxHash(txHash: string) {
		try {
			await navigator.clipboard.writeText(txHash);
			// You could show a toast notification here
		} catch (err) {
			console.error('Failed to copy transaction hash:', err);
		}
	}
</script>

<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		<div class="flex items-center justify-between mb-4">
			<h3 class="card-title">{$t('wallet.bsc.transaction_history')}</h3>
			<button 
				class="btn btn-sm btn-outline"
				onclick={refreshTransactions}
				disabled={isLoading}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
				{/if}
				{$t('wallet.bsc.refresh')}
			</button>
		</div>

		<!-- Filter Tabs -->
		<div class="tabs tabs-bordered mb-4">
			<button
				class="tab {selectedFilter === 'all' ? 'tab-active' : ''}"
				onclick={() => selectedFilter = 'all'}
			>
				{$t('wallet.bsc.filter_all')}
			</button>
			<button
				class="tab {selectedFilter === 'sent' ? 'tab-active' : ''}"
				onclick={() => selectedFilter = 'sent'}
			>
				{$t('wallet.bsc.filter_sent')}
			</button>
			<button
				class="tab {selectedFilter === 'received' ? 'tab-active' : ''}"
				onclick={() => selectedFilter = 'received'}
			>
				{$t('wallet.bsc.filter_received')}
			</button>
			<button
				class="tab {selectedFilter === 'usdt' ? 'tab-active' : ''}"
				onclick={() => selectedFilter = 'usdt'}
			>
				{$t('wallet.bsc.filter_usdt')}
			</button>
			<button
				class="tab {selectedFilter === 'bnb' ? 'tab-active' : ''}"
				onclick={() => selectedFilter = 'bnb'}
			>
				{$t('wallet.bsc.filter_bnb')}
			</button>
		</div>

		<!-- Transaction List -->
		{#if filteredTransactions.length === 0}
			<div class="text-center py-8">
				<div class="text-6xl mb-4">📄</div>
				<div class="text-lg font-medium mb-2">{$t('wallet.bsc.no_transactions_found')}</div>
				<div class="text-sm text-base-content/70">
					{#if selectedFilter === 'all'}
						<div class="mb-4">
							<div class="alert alert-warning">
								<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
								</svg>
								<div>
									<div class="font-bold">{$t('wallet.bsc.api_key_required_title')}</div>
									<div class="text-xs">{$t('wallet.bsc.api_key_required_description')}</div>
								</div>
							</div>
						</div>
						{$t('wallet.bsc.no_transactions_description')}
					{:else}
						{$t('wallet.bsc.no_filtered_transactions', { values: { filter: selectedFilter } })}
					{/if}
				</div>
			</div>
		{:else}
			<div class="space-y-2">
				{#each filteredTransactions as tx}
					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center space-x-3">
									<div class="text-2xl">{getTransactionIcon(tx)}</div>
									<div>
										<div class="font-medium">
											{tx.type === 'send' ? $t('wallet.bsc.sent_token', { values: { token: tx.tokenSymbol || 'BNB' } }) : $t('wallet.bsc.received_token', { values: { token: tx.tokenSymbol || 'BNB' } })}
										</div>
										<div class="text-sm text-base-content/70">
											{formatTimestamp(tx.timestamp)}
										</div>
									</div>
								</div>
								<div class="text-right">
									<div class="font-medium">
										{tx.type === 'send' ? '-' : '+'}{formatTransactionValue(tx)}
									</div>
									<div class="text-sm {getStatusColor(tx.status)}">
										{getTranslatedStatus(tx.status)}
									</div>
								</div>
							</div>
							
							<!-- Transaction Details -->
							<div class="mt-3 pt-3 border-t border-base-300">
								<div class="grid grid-cols-2 gap-4 text-xs">
									<div>
										<div class="text-base-content/70">{$t('wallet.bsc.from')}</div>
										<div class="font-mono break-all">{tx.from}</div>
									</div>
									<div>
										<div class="text-base-content/70">{$t('wallet.bsc.to')}</div>
										<div class="font-mono break-all">{tx.to}</div>
									</div>
								</div>
								
								<div class="mt-2 flex items-center justify-between">
									<div class="text-xs text-base-content/70">
										{$t('wallet.bsc.gas')}: {tx.gasUsed} | {$t('wallet.bsc.block')}: {tx.blockNumber}
									</div>
									<div class="flex space-x-2">
										<button 
											class="btn btn-xs btn-outline"
											onclick={() => copyTxHash(tx.hash)}
										>
											{$t('wallet.bsc.copy_hash')}
										</button>
										<button 
											class="btn btn-xs btn-primary"
											onclick={() => openInExplorer(tx.hash)}
										>
											{$t('wallet.bsc.view')}
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Pending Transactions -->
		{#if $bscUsdtWalletStore.pendingTransactions.length > 0}
			<div class="divider">{$t('wallet.bsc.pending_transactions')}</div>
			<div class="space-y-2">
				{#each $bscUsdtWalletStore.pendingTransactions as tx}
					<div class="card bg-warning/10 shadow-sm">
						<div class="card-body p-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center space-x-3">
									<div class="text-2xl">⏳</div>
									<div>
										<div class="font-medium">
											{getTranslatedType(tx.type)} {tx.tokenSymbol || 'BNB'}
										</div>
										<div class="text-sm text-base-content/70">
											{formatTimestamp(tx.timestamp)}
										</div>
									</div>
								</div>
								<div class="text-right">
									<div class="font-medium">
										{tx.type === 'send' ? '-' : '+'}{formatTransactionValue(tx)}
									</div>
									<div class="text-sm text-warning">
										{$t('wallet.bsc.pending')}
									</div>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
