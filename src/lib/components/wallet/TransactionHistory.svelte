<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { transactions, walletManager } from '$lib/stores/wallet.store';
	import { weiToSatoshi } from '@bittasker/wallet-core';
	// MDI Icons
	import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
	import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconCloseCircle from '~icons/mdi/close-circle';

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedFilter = $state<'all' | 'rsk' | 'bsc' | 'send' | 'receive'>('all');
	let currentPage = $state(0);
	let itemsPerPage = 20;

	// Filtered transactions (exclude swaps)
	let filteredTransactions = $derived(
		$transactions.filter((tx) => {
			if (selectedFilter === 'all') return true;
			if (selectedFilter === 'rsk' || selectedFilter === 'bsc') {
				return tx.network === selectedFilter;
			}
			if (selectedFilter === 'send' || selectedFilter === 'receive') {
				return tx.type === selectedFilter;
			}
			return true;
		})
	);

	// Derived filter counts for performance
	let filterCounts = $derived({
		all: $transactions.length,
		rsk: $transactions.filter((tx) => tx.network === 'rsk' && tx.type !== 'swap').length,
		bsc: $transactions.filter((tx) => tx.network === 'bsc' && tx.type !== 'swap').length,
		send: $transactions.filter((tx) => tx.type === 'send').length,
		receive: $transactions.filter((tx) => tx.type === 'receive').length
	});

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

	function getStatusLabel(status: string): string {
		if (!status) return 'Unknown'; // Fallback for undefined/null
		switch (status) {
			case 'confirmed':
				return $t('wallet.transaction.status.confirmed');
			case 'pending':
				return $t('wallet.transaction.status.pending');
			case 'failed':
				return $t('wallet.transaction.status.failed');
			default:
				return status;
		}
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
				return $t('wallet.transaction.network.rootstock_bitcoin');
			case 'bsc':
				return $t('wallet.transaction.network.binance_smart_chain');
			default:
				return $t('wallet.transaction.network.unknown_network');
		}
	}

	function getTypeIcon(type: string) {
		if (!type) return IconArrowUpBold; // Fallback for undefined/null
		if (type === 'receive') return IconArrowDownBold;
		if (type === 'contract') return IconFileDocumentOutline;
		// Default to send icon for 'send' and any other types
		return IconArrowUpBold;
	}

	function formatFee(fee: number, asset: string): string {
		try {
			// Fee is already in native units (rBTC, BNB, etc.) from transactionHistory.ts
			if (!fee || !isFinite(fee) || isNaN(fee)) return '0';
			if (!asset) asset = '';

			if (asset === 'rBTC' || asset === 'BTC' || asset === 'L-BTC' || asset.includes('BTC')) {
				// For Bitcoin-based assets, show in satoshis
				const sats = Math.floor(fee * 100_000_000);
				if (sats > 0) {
					return `${sats.toLocaleString()} ${$t('wallet.sats')}`;
				}
				// For very small fees, show in BTC with appropriate decimals
				return `${fee.toFixed(8)} ${asset}`;
			} else if (asset === 'BNB' || asset.includes('ETH')) {
				// For other EVM chains, show in native token (no Gwei conversion)
				if (fee < 0.00001) {
					return `${fee.toFixed(10)} ${asset}`;
				}
				// For larger fees, show in native token
				return `${fee.toFixed(8)} ${asset}`;
			} else {
				// Fallback for unknown assets
				if (fee < 0.000001) {
					return `${fee.toExponential(2)} ${asset}`;
				}
				return `${fee.toFixed(8)} ${asset}`;
			}
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
	<div class="flex flex-wrap items-center gap-4">
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
				{$t('wallet.all')} ({filterCounts.all})
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
				{$t('wallet.transaction.network.rootstock_bitcoin')} ({filterCounts.rsk})
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
				{$t('wallet.transaction.network.bsc')} ({filterCounts.bsc})
			</button>
			<button
				class="tab {selectedFilter === 'send'
					? 'tab-active'
					: ''} flex items-center gap-1 whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'send';
					currentPage = 0;
				}}
			>
				<IconArrowUpBold class="h-4 w-4" />
				{$t('wallet.sent')} ({filterCounts.send})
			</button>
			<button
				class="tab {selectedFilter === 'receive'
					? 'tab-active'
					: ''} flex items-center gap-1 whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'receive';
					currentPage = 0;
				}}
			>
				<IconArrowDownBold class="h-4 w-4" />
				{$t('wallet.received')} ({filterCounts.receive})
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
				{@const TypeIcon = getTypeIcon(tx.type)}
				{@const StatusIcon = getStatusIcon(tx.status || 'pending')}
				<div class="card bg-base-200 hover:bg-base-300 transition-colors">
					<div class="card-body p-4">
						<!-- Desktop Layout -->
						<div class="hidden items-center justify-between gap-2 sm:gap-4 md:flex">
							<div class="flex items-center gap-3">
								<!-- Network and Type Icons -->
								<div class="flex items-center gap-2">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-full {tx.type ===
										'receive'
											? 'bg-success/20 text-success'
											: tx.type === 'contract'
												? 'bg-primary/20 text-primary'
												: 'bg-warning/20 text-warning'}"
									>
										<TypeIcon class="h-5 w-5" />
									</div>
									<div
										class="bg-base-300/20 flex h-10 w-10 items-center justify-center rounded-full"
									>
										{#if getNetworkIcon(tx.network || 'rsk').startsWith('/')}
											<img
												src={getNetworkIcon(tx.network || 'rsk')}
												alt={getNetworkDisplayName(tx.network || 'rsk')}
												class="h-10 w-10"
											/>
										{:else}
											<span class="text-xl">{getNetworkIcon(tx.network || 'rsk')}</span>
										{/if}
									</div>
								</div>

								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<span class="font-semibold capitalize">
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
										<div
											class="flex h-5 w-5 items-center justify-center {getStatusIconColor(
												tx.status || 'pending'
											)}"
											title={getStatusLabel(tx.status || 'pending')}
										>
											<StatusIcon
												class="h-5 w-5"
												aria-label={getStatusLabel(tx.status || 'pending')}
											/>
										</div>
									</div>

									<div class="text-sm opacity-70">
										<div>{formatDate(tx.timestamp)}</div>
										<div>{formatTime(tx.timestamp)}</div>
									</div>
								</div>
							</div>

							<div class="flex flex-col items-end gap-1.5 text-right">
								<div
									class="font-semibold {tx.type === 'receive' ? 'text-success' : 'text-warning'}"
								>
									{tx.type === 'receive' ? '+' : '-'}
									{weiToSatoshi(BigInt(tx.value)).toLocaleString() + ' ' + $t('wallet.sats')}
								</div>
								{#if tx.fee}
									<div class="text-xs opacity-70">
										{$t('wallet.network_fee')}: {formatFee(tx.fee, tx.asset || '')}
									</div>
								{/if}
								{#if tx.txHash}
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
								{/if}
							</div>
						</div>

						<!-- Mobile Layout -->
						<div class="md:hidden">
							<div class="flex items-center justify-between gap-2 sm:gap-4">
								<div class="flex items-center gap-3">
									<div class="flex items-center gap-2">
										<div
											class="flex h-10 w-10 items-center justify-center rounded-full {tx.type ===
											'receive'
												? 'bg-success/20 text-success'
												: tx.type === 'contract'
													? 'bg-primary/20 text-primary'
													: 'bg-warning/20 text-warning'}"
										>
											<TypeIcon class="h-5 w-5" />
										</div>
										<div
											class="bg-base-300/20 flex h-10 w-10 items-center justify-center rounded-full"
										>
											{#if getNetworkIcon(tx.network || 'rsk').startsWith('/')}
												<img
													src={getNetworkIcon(tx.network || 'rsk')}
													alt={getNetworkDisplayName(tx.network || 'rsk')}
													class="h-10 w-10"
												/>
											{:else}
												<span class="text-xl">{getNetworkIcon(tx.network || 'rsk')}</span>
											{/if}
										</div>
									</div>
									<div class="flex-1">
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
											<div
												class="flex h-5 w-5 items-center justify-center {getStatusIconColor(
													tx.status || 'pending'
												)}"
												title={getStatusLabel(tx.status || 'pending')}
											>
												<StatusIcon
													class="h-5 w-5"
													aria-label={getStatusLabel(tx.status || 'pending')}
												/>
											</div>
										</div>
										<div class="text-sm opacity-70">
											<div>{formatDate(tx.timestamp)}</div>
											<div>{formatTime(tx.timestamp)}</div>
										</div>
									</div>
								</div>

								<div class="flex flex-col items-end gap-1.5 text-right">
									<div
										class="font-semibold {tx.type === 'receive' ? 'text-success' : 'text-warning'}"
									>
										{tx.type === 'receive'
											? '+'
											: '-' +
												weiToSatoshi(BigInt(tx.value)).toLocaleString() +
												' ' +
												$t('wallet.sats')}
									</div>
									{#if tx.fee}
										<div class="text-xs opacity-70">
											{$t('wallet.network_fee')}: {formatFee(tx.fee, tx.asset || '')}
										</div>
									{/if}
									{#if tx.txHash}
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
									{/if}
								</div>
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
