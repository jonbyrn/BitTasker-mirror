<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';

	// Transaction types
	interface Transaction {
		id: string;
		type: 'send' | 'receive';
		network: 'liquid' | 'rsk';
		asset: string;
		amount: number;
		formattedAmount: string;
		address?: string;
		timestamp: number;
		status: 'confirmed' | 'pending' | 'failed';
		txHash?: string;
		description?: string;
		fee?: number;
	}

	// State
	let transactions = $state<Transaction[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedFilter = $state<'all' | 'liquid' | 'rsk' | 'send' | 'receive'>('all');
	let currentPage = $state(0);
	let itemsPerPage = 20;

	// Filtered transactions
	let filteredTransactions = $derived(transactions.filter(tx => {
		if (selectedFilter === 'all') return true;
		if (selectedFilter === 'liquid' || selectedFilter === 'rsk') {
			return tx.network === selectedFilter;
		}
		if (selectedFilter === 'send' || selectedFilter === 'receive') {
			return tx.type === selectedFilter;
		}
		return true;
	}).sort((a, b) => b.timestamp - a.timestamp));

	// Paginated transactions
	let paginatedTransactions = $derived(filteredTransactions.slice(
		currentPage * itemsPerPage,
		(currentPage + 1) * itemsPerPage
	));

	let totalPages = $derived(Math.ceil(filteredTransactions.length / itemsPerPage));

	onMount(() => {
		loadTransactions();
	});

	async function loadTransactions() {
		isLoading = true;
		error = null;

		try {
			// Load transactions from both networks
			const [liquidTxs, rskTxs] = await Promise.allSettled([
				loadLiquidTransactions(),
				loadRskTransactions()
			]);

			const allTransactions: Transaction[] = [];

			// Process Liquid transactions
			if (liquidTxs.status === 'fulfilled') {
				allTransactions.push(...liquidTxs.value);
			}

			// Process RSK transactions
			if (rskTxs.status === 'fulfilled') {
				allTransactions.push(...rskTxs.value);
			}

			// Sort by timestamp (newest first)
			transactions = allTransactions.sort((a, b) => b.timestamp - a.timestamp);
		} catch (err) {
			console.error('Failed to load transactions:', err);
			error = $t('wallet.failed_to_load_transactions');
		} finally {
			isLoading = false;
		}
	}

	async function loadLiquidTransactions(): Promise<Transaction[]> {
		// This would integrate with the existing Breez SDK transaction loading
		// For now, return placeholder data
		return [
			{
				id: 'liquid-1',
				type: 'receive',
				network: 'liquid',
				asset: 'L-BTC',
				amount: 50000,
				formattedAmount: '0.0005 L-BTC',
				timestamp: Date.now() - 3600000,
				status: 'confirmed',
				txHash: '0x123...abc',
				description: 'Lightning payment received'
			},
			{
				id: 'liquid-2',
				type: 'send',
				network: 'liquid',
				asset: 'USDt',
				amount: 10,
				formattedAmount: '10 USDt',
				timestamp: Date.now() - 7200000,
				status: 'confirmed',
				txHash: '0x456...def',
				description: 'Payment sent'
			}
		];
	}

	async function loadRskTransactions(): Promise<Transaction[]> {
		// This would integrate with the existing RSK transaction loading
		// For now, return placeholder data
		return [
			{
				id: 'rsk-1',
				type: 'send',
				network: 'rsk',
				asset: 'rBTC',
				amount: 0.001,
				formattedAmount: '0.001 rBTC',
				timestamp: Date.now() - 1800000,
				status: 'confirmed',
				txHash: '0x789...ghi',
				description: 'Contract interaction',
				fee: 0.0001
			}
		];
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
		return network === 'liquid' ? '🌊' : '⚡';
	}

	function getTypeIcon(type: string): string {
		return type === 'receive' ? '↓' : '↑';
	}

	function formatTimestamp(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString() + ' ' + 
			   new Date(timestamp).toLocaleTimeString();
	}

	function formatAddress(address?: string): string {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function openExplorer(txHash?: string, network?: string) {
		if (!txHash) return;
		
		let explorerUrl = '';
		if (network === 'liquid') {
			explorerUrl = `https://liquid.network/tx/${txHash}`;
		} else if (network === 'rsk') {
			explorerUrl = `https://explorer.rsk.co/tx/${txHash}`;
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
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">{$t('wallet.transaction_history')}</h3>
		<button
			class="btn btn-outline btn-sm"
			onclick={loadTransactions}
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
	<div class="tabs tabs-boxed">
		<button
			class="tab {selectedFilter === 'all' ? 'tab-active' : ''}"
			onclick={() => {selectedFilter = 'all'; currentPage = 0;}}
		>
			{$t('wallet.all')} ({transactions.length})
		</button>
		<button
			class="tab {selectedFilter === 'liquid' ? 'tab-active' : ''}"
			onclick={() => {selectedFilter = 'liquid'; currentPage = 0;}}
		>
			🌊 Liquid ({transactions.filter(tx => tx.network === 'liquid').length})
		</button>
		<button
			class="tab {selectedFilter === 'rsk' ? 'tab-active' : ''}"
			onclick={() => {selectedFilter = 'rsk'; currentPage = 0;}}
		>
			⚡ RSK ({transactions.filter(tx => tx.network === 'rsk').length})
		</button>
		<button
			class="tab {selectedFilter === 'send' ? 'tab-active' : ''}"
			onclick={() => {selectedFilter = 'send'; currentPage = 0;}}
		>
			↑ {$t('wallet.sent')} ({transactions.filter(tx => tx.type === 'send').length})
		</button>
		<button
			class="tab {selectedFilter === 'receive' ? 'tab-active' : ''}"
			onclick={() => {selectedFilter = 'receive'; currentPage = 0;}}
		>
			↓ {$t('wallet.received')} ({transactions.filter(tx => tx.type === 'receive').length})
		</button>
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
								<div class="w-8 h-8 bg-base-300 rounded-full"></div>
								<div class="space-y-2">
									<div class="w-32 h-4 bg-base-300 rounded"></div>
									<div class="w-24 h-3 bg-base-300 rounded"></div>
								</div>
							</div>
							<div class="text-right space-y-2">
								<div class="w-20 h-4 bg-base-300 rounded ml-auto"></div>
								<div class="w-16 h-3 bg-base-300 rounded ml-auto"></div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if paginatedTransactions.length === 0}
		<div class="text-center py-12">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mx-auto h-16 w-16 text-base-content/30 mb-4"
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
			<h3 class="text-lg font-semibold mb-2">{$t('wallet.no_transactions')}</h3>
			<p class="text-base-content/70">
				{selectedFilter === 'all' 
					? $t('wallet.no_transactions_yet')
					: $t('wallet.no_transactions_filter')}
			</p>
		</div>
	{:else}
		<!-- Transaction List -->
		<div class="space-y-3">
			{#each paginatedTransactions as tx (tx.id)}
				<div class="card bg-base-200 hover:bg-base-300 transition-colors">
					<div class="card-body p-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<!-- Network and Type Icons -->
								<div class="flex flex-col items-center">
									<span class="text-lg">{getNetworkIcon(tx.network)}</span>
									<span class="text-sm {tx.type === 'receive' ? 'text-success' : 'text-warning'}">
										{getTypeIcon(tx.type)}
									</span>
								</div>

								<div class="flex-1">
									<div class="flex items-center gap-2 mb-1">
										<span class="font-semibold capitalize">
											{$t(`wallet.${tx.type}`)}
										</span>
										<div class="badge badge-outline badge-sm text-xs">
											{tx.network.toUpperCase()}
										</div>
										<div class="badge {getStatusBadgeClass(tx.status)} badge-sm text-xs">
											{$t(`wallet.status_${tx.status}`)}
										</div>
									</div>

									<div class="text-sm opacity-70 space-y-1">
										<div>{formatTimestamp(tx.timestamp)}</div>
										{#if tx.address}
											<div>{$t('wallet.address')}: {formatAddress(tx.address)}</div>
										{/if}
										{#if tx.description}
											<div>{tx.description}</div>
										{/if}
									</div>
								</div>
							</div>

							<div class="text-right">
								<div class="font-semibold {tx.type === 'receive' ? 'text-success' : 'text-warning'}">
									{tx.type === 'receive' ? '+' : '-'}{tx.formattedAmount}
								</div>
								{#if tx.fee}
									<div class="text-xs opacity-70">
										{$t('wallet.transaction_fee')}: {tx.fee} {tx.asset}
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
					</div>
				</div>
			{/each}
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="flex justify-center">
				<div class="join">
					<button
						class="join-item btn btn-sm"
						onclick={prevPage}
						disabled={currentPage === 0}
					>
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
				{$t('wallet.showing_page')} {currentPage + 1} {$t('wallet.of')} {totalPages}
				({filteredTransactions.length} {$t('wallet.total_transactions')})
			</div>
		{/if}
	{/if}
</div>

