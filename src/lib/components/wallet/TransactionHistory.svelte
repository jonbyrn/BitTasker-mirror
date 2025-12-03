<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { transactions, walletManager, walletStore } from '$lib/stores/wallet.store';
	import { weiToSatoshi } from '@bittasker/wallet-core';
	// MDI Icons
	import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
	import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconCloseCircle from '~icons/mdi/close-circle';
	import IconCheck from '~icons/mdi/check';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconCheckAll from '~icons/mdi/check-all';

	// State
	// Use store's isLoadingTransactions instead of local state for single source of truth
	let isLoading = $derived($walletStore.isLoadingTransactions);
	let error = $state<string | null>(null);
	let typeFilter = $state<'all' | 'send' | 'receive'>('all');
	let networkFilter = $state<'all' | 'rsk' | 'bsc'>('all');
	let isNetworkDropdownOpen = $state(false);
	let currentPage = $state(0);
	let itemsPerPage = 20;

	// Filtered transactions (exclude swaps)
	let filteredTransactions = $derived.by(() => {
		const filterStartTime = performance.now();
		const filtered = $transactions.filter((tx) => {
			// Filter by type
			if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
			// Filter by network
			if (networkFilter !== 'all' && tx.network !== networkFilter) return false;
			return true;
		});
		const filterDuration = performance.now() - filterStartTime;
		if (filterDuration > 10) { // Only log if it takes more than 10ms
			console.log(`[TransactionHistory] Filtering completed in ${filterDuration.toFixed(2)}ms (${$transactions.length} → ${filtered.length} transactions)`);
		}
		return filtered;
	});

	// Network filter options
	const networkFilterOptions = $derived([
		{
			id: 'all' as const,
			label: $t('wallet.all_networks'),
			icon: IconCheckAll,
			isImage: false
		},
		{
			id: 'rsk' as const,
			label: $t('wallet.transaction.network.rootstock_bitcoin'),
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			isImage: true
		},
		{
			id: 'bsc' as const,
			label: $t('wallet.transaction.network.bsc'),
			icon: '/images/chains/Binance-logo.svg',
			isImage: true
		}
	]);

	// Type filter options
	const typeFilterOptions = $derived([
		{
			id: 'all' as const,
			label: $t('wallet.all'),
			icon: IconCheckAll
		},
		{
			id: 'send' as const,
			label: $t('wallet.sent'),
			icon: IconArrowUpBold
		},
		{
			id: 'receive' as const,
			label: $t('wallet.received'),
			icon: IconArrowDownBold
		}
	]);

	function selectTypeFilter(typeId: 'all' | 'send' | 'receive') {
		typeFilter = typeId;
		currentPage = 0;
	}

	function selectNetworkFilter(networkId: 'all' | 'rsk' | 'bsc') {
		networkFilter = networkId;
		isNetworkDropdownOpen = false;
		currentPage = 0;
	}

	function toggleNetworkDropdown() {
		isNetworkDropdownOpen = !isNetworkDropdownOpen;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.network-dropdown-container')) {
			isNetworkDropdownOpen = false;
		}
	}

	// Paginated transactions
	let paginatedTransactions = $derived(
		filteredTransactions.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage)
	);

	let totalPages = $derived(Math.ceil(filteredTransactions.length / itemsPerPage));

	onMount(() => {
		loadTransactionsIfNeeded();
		document.addEventListener('click', handleClickOutside);
	});

	onDestroy(() => {
		document.removeEventListener('click', handleClickOutside);
		
		// Cleanup: If component unmounts during load, ensure loading flag is reset
		// This prevents the flag from getting stuck if component is destroyed mid-load
		if ($walletStore.isLoadingTransactions) {
			console.log('[TransactionHistory] Component destroyed during load, resetting loading flag');
			walletStore.update(s => ({ ...s, isLoadingTransactions: false }));
		}
	});

	/**
	 * Check if transactions need to be loaded
	 * Returns true if transactions are empty or stale (older than 5 minutes)
	 */
	function shouldLoadTransactions(): boolean {
		// Check if wallet is connected first
		if (!$walletStore.hasAnyConnection) {
			console.log('[TransactionHistory] Wallet not connected, skipping load');
			return false;
		}
		
		// Check if already loading (prevent concurrent loads)
		if ($walletStore.isLoadingTransactions) {
			console.log('[TransactionHistory] Transactions already loading, skipping duplicate request');
			return false;
		}
		
		const transactions = $walletStore.transactions;
		const lastLoaded = $walletStore.transactionsLastLoaded;
		
		// If we have a timestamp, even with empty transactions, they've been loaded
		// Only load if we don't have a timestamp (first load) or if stale
		if (lastLoaded) {
			// Check if transactions are stale (older than 5 minutes)
			const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
			const age = Date.now() - lastLoaded;
			
			if (age > STALE_THRESHOLD) {
				console.log(`[TransactionHistory] Transactions are stale (${Math.round(age / 1000)}s old), will refresh`);
				return true;
			}
			
			console.log(`[TransactionHistory] Transactions are fresh (${Math.round(age / 1000)}s old), skipping load`);
			return false;
		}
		
		// No timestamp means first load (even if transactions array exists from previous session)
		console.log('[TransactionHistory] No load timestamp found, will load');
		return true;
	}

	/**
	 * Load transactions only if needed (empty or stale)
	 */
	async function loadTransactionsIfNeeded() {
		if (!shouldLoadTransactions()) {
			// Transactions are already loaded and fresh, or wallet not connected
			// No need to set isLoading - it's derived from store
			return;
		}
		
		await loadTransactions(false);
	}

	/**
	 * Load transactions (force refresh if needed)
	 * @param forceRefresh - If true, bypasses loading lock and always fetches from API
	 */
	async function loadTransactions(forceRefresh: boolean = false) {
		const startTime = performance.now();
		console.log(`[TransactionHistory] Starting transaction load (forceRefresh: ${forceRefresh})...`);
		
		error = null;

		try {
			// Load transactions using the combined wallet manager
			// Pass forceRefresh to bypass store's loading lock if needed
			const loadStartTime = performance.now();
			await walletManager.loadTransactions(forceRefresh);
			const loadDuration = performance.now() - loadStartTime;
			console.log(`[TransactionHistory] Wallet manager loadTransactions completed in ${loadDuration.toFixed(2)}ms`);
			
			const totalDuration = performance.now() - startTime;
			console.log(`[TransactionHistory] Total transaction load completed in ${totalDuration.toFixed(2)}ms`);
		} catch (err) {
			const errorDuration = performance.now() - startTime;
			console.error(`[TransactionHistory] Failed to load transactions after ${errorDuration.toFixed(2)}ms:`, err);
			error = err instanceof Error ? err.message : $t('wallet.failed_to_load_transactions');
		}
		// isLoading is derived from store, so no need to set it here
	}

	async function refreshTransactions() {
		// Force refresh by bypassing loading lock
		await loadTransactions(true);
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

	function getExplorerUrl(txHash?: string, network?: string): string | null {
		if (!txHash) return null;

		if (network === 'rsk') {
			// Use the correct RSK explorer based on network (default to testnet for now)
			const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
			if (rskNetwork === 'mainnet') {
				return `https://rootstock.blockscout.com/tx/${txHash}`;
			} else {
				return `https://rootstock-testnet.blockscout.com/tx/${txHash}`;
			}
		} else if (network === 'bsc') {
			// Use BSC explorer based on network
			const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
			if (bscNetwork === 'mainnet') {
				return `https://bscscan.com/tx/${txHash}`;
			} else {
				return `https://testnet.bscscan.com/tx/${txHash}`;
			}
		}

		return null;
	}

	function openExplorer(txHash?: string, network?: string) {
		const url = getExplorerUrl(txHash, network);
		if (url) {
			window.open(url, '_blank');
		}
	}

	// Calculate running balances for transactions
	// Transactions are displayed newest first, so we need to calculate backwards
	let runningBalances = $derived.by(() => {
		const calcStartTime = performance.now();
		const balances = new Map<string, number>();
		
		// Get current balance from wallet store (in sats)
		const currentBalance = $walletStore.totalBalances.sats;
		let runningBalance = currentBalance;
		
		// Sort transactions by timestamp (newest first for display, but we calculate backwards)
		const sortStartTime = performance.now();
		const sortedTxs = [...filteredTransactions].sort((a, b) => b.timestamp - a.timestamp);
		const sortDuration = performance.now() - sortStartTime;
		console.log(`[TransactionHistory] Running balance: sorted ${sortedTxs.length} transactions in ${sortDuration.toFixed(2)}ms`);
		
		// Calculate balance after each transaction (working backwards from current)
		const loopStartTime = performance.now();
		for (const tx of sortedTxs) {
			const txValueSats = Number(weiToSatoshi(BigInt(tx.value)));
			const txFeeSats = tx.fee ? Math.floor(tx.fee * 100_000_000) : 0; // Convert fee to sats
			
			// Store the balance after this transaction
			const txId = tx.txHash || tx.hash || '';
			if (txId) {
				balances.set(txId, runningBalance);
			}
			
			// Work backwards: if it was a receive, subtract it; if it was a send, add it back
			if (tx.type === 'receive') {
				runningBalance -= txValueSats;
			} else if (tx.type === 'send') {
				runningBalance += txValueSats + txFeeSats;
			}
		}
		const loopDuration = performance.now() - loopStartTime;
		const totalDuration = performance.now() - calcStartTime;
		console.log(`[TransactionHistory] Running balance calculation completed in ${totalDuration.toFixed(2)}ms (loop: ${loopDuration.toFixed(2)}ms, ${balances.size} balances calculated)`);
		
		return balances;
	});

	function getRunningBalance(txHash?: string): string {
		if (!txHash) return '';
		const balance = runningBalances.get(txHash);
		if (balance === undefined || balance === null) return '';
		return Math.floor(balance).toLocaleString();
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

<div class="space-y-6 pb-6">
	<!-- Filters container matching contracts screen design -->
	<div class="border-base-300/60 bg-base-100/40 rounded-3xl border p-4 shadow-sm">
		<!-- Mobile: Type Filter Buttons and Network Dropdown -->
		<div class="mb-3 sm:hidden">
			<!-- Type Filter Buttons (Mobile) - 2x2 Grid -->
			<div class="mb-3 grid grid-cols-2 gap-2">
				<!-- Top Row: All and Refresh -->
				{#if true}
					{@const allOption = typeFilterOptions.find((opt) => opt.id === 'all')}
					{#if allOption}
						{@const IconComponent = allOption.icon}
						<button
							class="btn {typeFilter === 'all'
								? 'btn-primary'
								: 'btn-secondary'} btn-sm flex items-center justify-center gap-2"
							onclick={() => selectTypeFilter('all')}
							aria-label={allOption.label}
						>
							{#if typeFilter === 'all'}
								<IconCheck class="h-4 w-4" />
							{:else}
								<IconComponent class="h-4 w-4" />
							{/if}
							<span>{allOption.label}</span>
						</button>
					{/if}
				{/if}
				<!-- Refresh Button (Mobile) -->
				<button
					class="btn btn-secondary btn-sm flex items-center justify-center gap-2"
					onclick={refreshTransactions}
					disabled={isLoading}
					aria-label={$t('wallet.refresh')}
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
					<span>{$t('wallet.refresh')}</span>
				</button>
				<!-- Bottom Row: Sent and Received -->
				{#each typeFilterOptions.filter((opt) => opt.id !== 'all') as option}
					{@const IconComponent = option.icon}
					<button
						class="btn {typeFilter === option.id
							? 'btn-primary'
							: 'btn-secondary'} btn-sm flex items-center justify-center gap-2"
						onclick={() => selectTypeFilter(option.id)}
						aria-label={option.label}
					>
						{#if typeFilter === option.id}
							<IconCheck class="h-4 w-4" />
						{:else}
							<IconComponent class="h-4 w-4" />
						{/if}
						<span>{option.label}</span>
					</button>
				{/each}
			</div>

			<!-- Network Filter Dropdown (Mobile) -->
			<div class="network-dropdown-container relative">
				<button
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
					onclick={toggleNetworkDropdown}
				>
					<div class="flex items-center gap-2">
						{#if true}
							{@const selectedOption = networkFilterOptions.find((opt) => opt.id === networkFilter)}
							{#if selectedOption?.isImage}
								<img
									src={selectedOption.icon as string}
									alt={selectedOption.label}
									class="h-5 w-5"
								/>
							{:else if selectedOption && typeof selectedOption.icon !== 'string'}
								{@const IconComponent = selectedOption.icon}
								<IconComponent class="h-5 w-5" />
							{/if}
							<span class="font-medium">
								{selectedOption?.label}
							</span>
						{/if}
					</div>
					<IconChevronDown
						class="h-5 w-5 transition-transform duration-200 {isNetworkDropdownOpen
							? 'rotate-180'
							: ''}"
					/>
				</button>

				{#if isNetworkDropdownOpen}
					<div
						class="border-base-300 bg-base-100 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
					>
						{#each networkFilterOptions as option}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {networkFilter ===
								option.id
									? 'bg-primary/10 text-primary'
									: 'text-base-content'}"
								onclick={() => selectNetworkFilter(option.id)}
							>
							{#if option.isImage}
								<img src={option.icon as string} alt={option.label} class="h-5 w-5" />
							{:else if typeof option.icon !== 'string'}
								{@const IconComponent = option.icon}
								<IconComponent
									class="h-5 w-5 {networkFilter === option.id
										? 'text-primary'
										: 'text-base-content/60'}"
								/>
							{/if}
								<span class="font-medium">{option.label}</span>
								{#if networkFilter === option.id}
									<IconCheck class="text-primary ml-auto h-5 w-5" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Desktop: Type Filter Buttons -->
		<div class="mb-4 hidden sm:block">
			<div class="flex items-center justify-between gap-2">
				<div class="flex gap-2">
					{#each typeFilterOptions as option}
						{@const IconComponent = option.icon}
						<button
							class="btn {typeFilter === option.id
								? 'btn-primary'
								: 'btn-secondary'} btn-sm flex items-center gap-2"
							onclick={() => selectTypeFilter(option.id)}
							aria-label={option.label}
						>
							{#if typeFilter === option.id}
								<IconCheck class="h-4 w-4" />
							{:else}
								<IconComponent class="h-4 w-4" />
							{/if}
							<span>{option.label}</span>
						</button>
					{/each}
				</div>
				<!-- Refresh Button (Desktop) -->
				<button
					class="btn btn-outline btn-sm flex items-center gap-2"
					onclick={refreshTransactions}
					disabled={isLoading}
					aria-label={$t('wallet.refresh')}
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
					<span>{$t('wallet.refresh')}</span>
				</button>
			</div>
		</div>

		<!-- Desktop: Network Filter Buttons -->
		<div class="mt-4 hidden sm:block">
			<div class="flex flex-col gap-3 sm:flex-row">
				{#each networkFilterOptions as option}
					<button
						class="btn btn-sm flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-3xl py-4 text-center transition-all duration-200 {networkFilter ===
						option.id
							? 'text-primary bg-primary/10 border-primary/30 border'
							: 'bg-base-100/40 hover:bg-base-100/60 text-base-content/70'}"
						onclick={() => selectNetworkFilter(option.id)}
						aria-label={option.label}
					>
						{#if option.isImage}
							<img
								src={option.icon as string}
								alt={option.label}
								class="h-5 w-5 {networkFilter === option.id ? 'opacity-100' : 'opacity-60'}"
							/>
						{:else if typeof option.icon !== 'string'}
							{@const IconComponent = option.icon}
							<IconComponent class="h-5 w-5 {networkFilter === option.id ? 'text-primary' : ''}" />
						{/if}
						<span class="font-medium">{option.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#if error}
		<div class="alert alert-error alert-outline">
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
							<div class="flex items-center gap-1">
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
				{typeFilter === 'all' && networkFilter === 'all'
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
				{@const explorerUrl = getExplorerUrl(tx.txHash || tx.hash, tx.network)}
				{@const cardClasses = `card bg-base-200 hover:bg-base-300 transition-colors ${explorerUrl ? 'cursor-pointer' : ''} ${tx.type === 'receive' ? 'border-2 border-success' : tx.type === 'send' ? 'border-2 border-warning' : ''}`}
				
				{#snippet transactionCard()}
					<div class="card-body p-4">
						<div class="flex flex-col gap-1">
							<!-- Top Row: Icon, Text, Checkmark, Amount, Fee -->
							<div class="flex items-center justify-between gap-2 sm:gap-4">
								<div class="flex items-center gap-3">
									<!-- Type Icon -->
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
									<div class="flex items-center gap-2">
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
								</div>
								<div class="flex flex-col items-end">
									<div
										class="font-semibold {tx.type === 'receive' ? 'text-success' : 'text-warning'}"
									>
										{tx.type === 'receive' ? '+' : '-'}
										{weiToSatoshi(BigInt(tx.value)).toLocaleString()} {$t('wallet.sats')}
									</div>
									{#if tx.fee}
										<div class="text-xs opacity-70">
											{$t('wallet.tx_fee')}: {formatFee(tx.fee, tx.asset || '')}
										</div>
									{/if}
								</div>
							</div>

							<!-- Bottom Row: Network Icon, Date/Time, Running Balance -->
							<div class="flex items-center justify-between gap-2 sm:gap-4">
								<div class="flex items-center gap-3">
									<!-- Network Icon -->
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
									<div class="text-sm opacity-70">
										<div>{formatDate(tx.timestamp)}</div>
										<div>{formatTime(tx.timestamp)}</div>
									</div>
								</div>
								<div class="text-right">
									{#if tx.txHash || tx.hash}
										<div class="text-sm md:text-base font-semibold">
											{$t('wallet.balance_after')}: {getRunningBalance(tx.txHash || tx.hash)} {$t('wallet.sats')}
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/snippet}

				{#if explorerUrl}
					<a
						href={explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						class={cardClasses}
					>
						{@render transactionCard()}
					</a>
				{:else}
					<div class={cardClasses}>
						{@render transactionCard()}
					</div>
				{/if}
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
