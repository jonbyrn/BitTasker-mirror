<script lang="ts">
	import type { Transaction } from '$lib/types/wallet';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { transactions, walletManager } from '$lib/stores/wallet.store';

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedFilter = $state<'all' | 'rsk' | 'bsc' | 'send' | 'receive' | 'swap'>('all');
	let currentPage = $state(0);
	let itemsPerPage = 20;

	// Filtered transactions
	let filteredTransactions = $derived(
		$transactions
			.filter((tx) => {
				if (selectedFilter === 'all') return true;
				if (selectedFilter === 'rsk' || selectedFilter === 'bsc') {
					return tx.network === selectedFilter;
				}
				if (selectedFilter === 'send' || selectedFilter === 'receive' || selectedFilter === 'swap') {
					return tx.type === selectedFilter;
				}
				return true;
			})
			.sort((a, b) => b.timestamp - a.timestamp)
	);

	// Paginated transactions
	let paginatedTransactions = $derived(
		filteredTransactions.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage)
	);

	let totalPages = $derived(Math.ceil(filteredTransactions.length / itemsPerPage));

	onMount(() => {
		loadTransactions();
	});

	async function loadTransactions() {
		isLoading = true;
		error = null;

		try {
			// Load transactions using the combined wallet manager
			await walletManager.loadTransactions();
		} catch (err) {
			console.error('Failed to load transactions:', err);
			error = err instanceof Error ? err.message : $t('wallet.failed_to_load_transactions');
		} finally {
			isLoading = false;
		}
	}

	async function refreshTransactions() {
		await loadTransactions();
	}



	function getTranslatedStatus(status: string): string {
		switch (status) {
			case 'confirmed':
				return 'Confirmed';
			case 'pending':
				return 'Pending';
			case 'failed':
				return 'Failed';
			default:
				return status;
		}
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

	function getNetworkIcon(network: string): string {
		switch (network) {
			case 'rsk':
				return '/images/chains/Bitcoin-Rootstock-logo.webp';
			case 'bsc':
				return '/images/chains/Binance-logo.svg';
			default:
				return '/images/chains/Bitcoin.svg';
		}
	}

	function getNetworkDisplayName(network: string): string {
		switch (network) {
			case 'rsk':
				return 'Rootstock Bitcoin';
			case 'bsc':
				return 'Binance Smart Chain';
			default:
				return 'Unknown Network';
		}
	}

	function getTypeIcon(type: string): string {
		if (type === 'receive') return '↓';
		if (type === 'swap') return '⇄';
		return '↑';
	}

	function formatFee(fee: number): string {
		// Convert to a more readable format
		if (fee < 0.000001) {
			// For very small fees, show in scientific notation with fewer decimals
			return fee.toExponential(2);
		} else if (fee < 0.001) {
			// For small fees, show 8 decimal places
			return fee.toFixed(8);
		} else {
			// For larger fees, show 6 decimal places
			return fee.toFixed(6);
		}
	}

	function formatTimestamp(timestamp: number): string {
		return (
			new Date(timestamp).toLocaleDateString() + ' ' + new Date(timestamp).toLocaleTimeString()
		);
	}

	function formatAddress(address?: string): string {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function openExplorer(txHash?: string, network?: string) {
		if (!txHash) return;

		let explorerUrl = '';
		if (network === 'rsk') {
			// Use the correct RSK explorer based on network (default to testnet for now)
			const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
			if (rskNetwork === 'mainnet') {
				explorerUrl = `https://rootstock.blockscout.com/tx/${txHash}`;
			} else {
				explorerUrl = `https://rootstock-testnet.blockscout.com/tx/${txHash}`;
			}
		} else if (network === 'bsc') {
			// Use BSC explorer based on network
			const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
			if (bscNetwork === 'mainnet') {
				explorerUrl = `https://bscscan.com/tx/${txHash}`;
			} else {
				explorerUrl = `https://testnet.bscscan.com/tx/${txHash}`;
			}
		}

		if (explorerUrl) {
			window.open(explorerUrl, '_blank');
		}
	}

	function nextPage() {
		if (currentPage < totalPages - 1) {
			currentPage++;
		}
	}

	function prevPage() {
		if (currentPage > 0) {
			currentPage--;
		}
	}

	function goToPage(page: number) {
		if (page >= 0 && page < totalPages) {
			currentPage = page;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap gap-4">
		<h3 class="text-lg font-semibold">{$t('wallet.transaction_history')}</h3>
		<button
			class="btn btn-outline btn-sm self-start sm:self-auto"
			onclick={refreshTransactions}
			disabled={isLoading}
		>
			{#if isLoading}
				<span class="loading loading-spinner loading-xs"></span>
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
			{$t('wallet.refresh')}
		</button>
	</div>

	<!-- Filter Tabs -->
	<div class="overflow-x-auto">
		<div class="tabs tabs-boxed min-w-max">
			<button
				class="tab {selectedFilter === 'all' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'all';
					currentPage = 0;
				}}
			>
				{$t('wallet.all')} ({$transactions.length})
			</button>
			<button
				class="tab {selectedFilter === 'rsk' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'rsk';
					currentPage = 0;
				}}
			>
				<img
					src="/images/chains/Bitcoin-Rootstock-logo.webp"
					alt="Rootstock Bitcoin"
					class="mr-1 inline h-4 w-4"
				/>
				Rootstock Bitcoin ({$transactions.filter((tx) => tx.network === 'rsk').length})
			</button>
			<button
				class="tab {selectedFilter === 'bsc' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'bsc';
					currentPage = 0;
				}}
			>
				<img
					src="/images/chains/Binance-logo.svg"
					alt="Binance Smart Chain"
					class="mr-1 inline h-4 w-4"
				/>
				BSC ({$transactions.filter((tx) => tx.network === 'bsc').length})
			</button>
			<button
				class="tab {selectedFilter === 'send' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'send';
					currentPage = 0;
				}}
			>
				↑ {$t('wallet.sent')} ({$transactions.filter((tx) => tx.type === 'send').length})
			</button>
			<button
				class="tab {selectedFilter === 'receive' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'receive';
					currentPage = 0;
				}}
			>
				↓ {$t('wallet.received')} ({$transactions.filter((tx) => tx.type === 'receive').length})
			</button>
			<button
				class="tab {selectedFilter === 'swap' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'swap';
					currentPage = 0;
				}}
			>
				⇄ {$t('wallet.swaps')} ({$transactions.filter((tx) => tx.type === 'swap').length})
			</button>
		</div>
	</div>

	{#if error}
		<div class="alert alert-error">
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
			<span>{error}</span>
		</div>
	{/if}

	{#if isLoading}
		<div class="space-y-4">
			{#each Array(5) as _}
				<div class="card bg-base-200 animate-pulse">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="bg-base-300 h-8 w-8 rounded-full"></div>
								<div class="space-y-2">
									<div class="bg-base-300 h-4 w-32 rounded"></div>
									<div class="bg-base-300 h-3 w-24 rounded"></div>
								</div>
							</div>
							<div class="space-y-2 text-right">
								<div class="bg-base-300 ml-auto h-4 w-20 rounded"></div>
								<div class="bg-base-300 ml-auto h-3 w-16 rounded"></div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if paginatedTransactions.length === 0}
		<div class="py-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/30 mx-auto mb-4 h-16 w-16"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1"
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
				/>
			</svg>
			<h3 class="mb-2 text-lg font-semibold">{$t('wallet.no_transactions')}</h3>
			<p class="text-base-content/70">
				{selectedFilter === 'all'
					? $t('wallet.no_transactions_yet')
					: $t('wallet.no_transactions_filter')}
			</p>
		</div>
	{:else}
		<!-- Transaction List -->
		<div class="space-y-3">
			{#each paginatedTransactions as tx}
				<div class="card bg-base-200 hover:bg-base-300 transition-colors">
					<div class="card-body p-4">
						<!-- Desktop Layout -->
						<div class="hidden items-center justify-between md:flex">
							<div class="flex items-center gap-3">
								<!-- Network and Type Icons -->
								<div class="flex flex-col items-center">
									{#if getNetworkIcon(tx.network).startsWith('/')}
										<img src={getNetworkIcon(tx.network)} alt="Network icon" class="h-6 w-6" />
									{:else}
										<span class="text-lg">{getNetworkIcon(tx.network)}</span>
									{/if}
									<span class="text-sm {tx.type === 'receive' ? 'text-success' : 'text-warning'}">
										{getTypeIcon(tx.type)}
									</span>
								</div>

								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<span class="font-semibold capitalize">
											{#if tx.type === 'swap'}
												{$t('wallet.swap_title')}
											{:else}
												{tx.type === 'send' ? $t('wallet.sent') : $t('wallet.received')}
											{/if}
										</span>
										<div class="badge badge-outline badge-sm text-xs">
											{getNetworkDisplayName(tx.network)}
										</div>
										<div class="badge {getStatusBadgeClass(tx.status)} badge-sm text-xs">
											{getTranslatedStatus(tx.status)}
										</div>
									</div>

									<div class="space-y-1 text-sm opacity-70">
										<div>{formatTimestamp(tx.timestamp)}</div>
										{#if tx.description}
											<div>{tx.description || ''}</div>
										{/if}
									</div>
								</div>
							</div>

							<div class="text-right">
								<div
									class="font-semibold {tx.type === 'receive' || tx.type === 'swap' ? 'text-success' : 'text-warning'}"
								>
									{tx.type === 'receive' || tx.type === 'swap' ? '+' : '-'}{tx.formattedAmount}
								</div>
								{#if tx.fee}
									<div class="text-xs opacity-70">
										{$t('wallet.transaction_fee')}: {formatFee(tx.fee)}
										{tx.asset}
									</div>
								{/if}
								{#if tx.txHash}
									<button
										class="btn btn-ghost btn-xs mt-1"
										onclick={() => openExplorer(tx.txHash, tx.network)}
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
									</button>
								{/if}
							</div>
						</div>

						<!-- Mobile Layout -->
						<div class="space-y-3 md:hidden">
							<!-- Header Row -->
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<div class="flex items-center gap-1">
										{#if getNetworkIcon(tx.network).startsWith('/')}
											<img src={getNetworkIcon(tx.network)} alt="Network icon" class="h-6 w-6" />
										{:else}
											<span class="text-lg">{getNetworkIcon(tx.network)}</span>
										{/if}
										<span class="text-sm {tx.type === 'receive' ? 'text-success' : 'text-warning'}">
											{getTypeIcon(tx.type)}
										</span>
									</div>
									<span class="font-semibold capitalize">
										{#if tx.type === 'swap'}
											{$t('wallet.swap_title')}
										{:else}
											{tx.type === 'send' ? $t('wallet.sent') : $t('wallet.received')}
										{/if}
									</span>
								</div>
								<div
									class="font-semibold {tx.type === 'receive' || tx.type === 'swap' ? 'text-success' : 'text-warning'}"
								>
									{tx.type === 'receive' || tx.type === 'swap' ? '+' : '-'}{tx.formattedAmount}
								</div>
							</div>

							<!-- Badges Row -->
							<div class="flex items-center gap-2">
								<div class="badge badge-outline badge-sm text-xs">
									{getNetworkDisplayName(tx.network)}
								</div>
								<div class="badge {getStatusBadgeClass(tx.status)} badge-sm text-xs">
									{getTranslatedStatus(tx.status)}
								</div>
							</div>

							<!-- Details -->
							<div class="space-y-1 text-sm opacity-70">
								<div>{formatTimestamp(tx.timestamp)}</div>
								{#if tx.description}
									<div>{tx.description || ''}</div>
								{/if}
								{#if tx.fee}
									<div class="text-xs">
										{$t('wallet.transaction_fee')}: {formatFee(tx.fee)}
										{tx.asset}
									</div>
								{/if}
							</div>

							<!-- Action Button -->
							{#if tx.txHash}
								<div class="flex justify-end">
									<button
										class="btn btn-ghost btn-xs"
										onclick={() => openExplorer(tx.txHash, tx.network)}
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
									</button>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="flex justify-center">
				<div class="join">
					<button class="join-item btn btn-sm" onclick={prevPage} disabled={currentPage === 0}>
						«
					</button>

					{#each Array(Math.min(5, totalPages)) as _, i}
						{@const pageNum = Math.max(0, Math.min(totalPages - 5, currentPage - 2)) + i}
						{#if pageNum < totalPages}
							<button
								class="join-item btn btn-sm {currentPage === pageNum ? 'btn-active' : ''}"
								onclick={() => goToPage(pageNum)}
							>
								{pageNum + 1}
							</button>
						{/if}
					{/each}

					<button
						class="join-item btn btn-sm"
						onclick={nextPage}
						disabled={currentPage === totalPages - 1}
					>
						»
					</button>
				</div>
			</div>

			<div class="text-center text-sm opacity-70">
				{$t('wallet.showing_page')}
				{currentPage + 1}
				{$t('wallet.of')}
				{totalPages}
				({filteredTransactions.length}
				{$t('wallet.total_transactions')})
			</div>
		{/if}
	{/if}
</div>
