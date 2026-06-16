<!--
  ConnectedTransactionHistory — mirrors TransactionHistory.svelte layout exactly,
  with two additions for connected wallets:
  1. Wallet logo + last 4 address chars next to each transaction title
  2. Wallet filter dropdown (alongside existing network dropdown)
  3. Network dropdown uses Arbitrum instead of BSC
-->
<script lang="ts">
	import type { ConnectedTransaction } from '$lib/services/connected-wallet-transactions';
	import type { ConnectedWalletInfo } from '$lib/services/connected-wallet-transactions';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import WalletIcon from './WalletIcon.svelte';
	import { fetchAllConnectedWalletTransactions } from '$lib/services/connected-wallet-transactions';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
	import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconCheck from '~icons/mdi/check';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconCheckAll from '~icons/mdi/check-all';
	import IconClose from '~icons/mdi/close';

	let { wallets, onClose }: { wallets: ConnectedWalletInfo[]; onClose?: () => void } = $props();

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let allTransactions = $state<ConnectedTransaction[]>([]);
	let typeFilter = $state<'all' | 'send' | 'receive' | 'contract-function'>('all');
	let networkFilter = $state<'all' | 'rsk' | 'arbitrum'>('all');
	let walletFilter = $state<string>('all');
	let isNetworkDropdownOpen = $state(false);
	let isWalletDropdownOpen = $state(false);
	let currentPage = $state(0);
	let itemsPerPage = 20;

	// Close dropdowns on outside click
	function handleWindowClick(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		if (!target.closest('.network-dropdown-container')) isNetworkDropdownOpen = false;
		if (!target.closest('.wallet-dropdown-container')) isWalletDropdownOpen = false;
	}

	// Filtered transactions
	let filteredTransactions = $derived(
		allTransactions.filter((tx) => {
			if (typeFilter !== 'all') {
				if (typeFilter === 'contract-function') {
					// Contract function: has a methodName that isn't a simple send/receive
					if (!tx.methodName) return false;
				} else if (tx.type !== typeFilter) {
					return false;
				}
			}
			if (networkFilter !== 'all' && tx.network !== networkFilter) return false;
			if (walletFilter !== 'all' && tx.walletId !== walletFilter) return false;
			return true;
		})
	);

	// Network filter options — Arbitrum instead of BSC
	const networkFilterOptions = [
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
			id: 'arbitrum' as const,
			label: 'Arbitrum',
			icon: '/images/chains/arbitrum.png',
			isImage: true
		}
	];

	// Type filter options — matches built-in wallet (4 buttons)
	const typeFilterOptions = [
		{ id: 'all' as const, label: $t('wallet.all'), icon: IconCheckAll },
		{ id: 'send' as const, label: $t('wallet.sent'), icon: IconArrowUpBold },
		{ id: 'receive' as const, label: $t('wallet.received'), icon: IconArrowDownBold },
		{
			id: 'contract-function' as const,
			label: $t('wallet.transaction.type.contracts'),
			icon: IconFileDocumentOutline
		}
	];

	// Wallet filter options
	let walletFilterOptions = $derived([
		{ id: 'all', label: $t('wallet.all_wallets'), walletType: '' },
		...wallets.map((w) => ({ id: w.id, label: w.walletName, walletType: w.walletType }))
	]);

	const transactionUI = {
		success: { border: 'border-success', background: 'bg-success/20', text: 'text-success' },
		warning: { border: 'border-warning', background: 'bg-warning/20', text: 'text-warning' },
		neutral: { border: 'border-neutral', background: 'bg-neutral/20', text: 'text-neutral' },
		error: { border: 'border-error', background: 'bg-error/20', text: 'text-error' },
		info: { border: 'border-info', background: 'bg-info/20', text: 'text-info' }
	};

	function selectTypeFilter(typeId: 'all' | 'send' | 'receive' | 'contract-function') {
		typeFilter = typeId;
		currentPage = 0;
	}

	function selectNetworkFilter(networkId: 'all' | 'rsk' | 'arbitrum') {
		networkFilter = networkId;
		isNetworkDropdownOpen = false;
		currentPage = 0;
	}

	function selectWalletFilter(id: string) {
		walletFilter = id;
		isWalletDropdownOpen = false;
		currentPage = 0;
	}

	function toggleNetworkDropdown() {
		isNetworkDropdownOpen = !isNetworkDropdownOpen;
		isWalletDropdownOpen = false;
	}

	function toggleWalletDropdown() {
		isWalletDropdownOpen = !isWalletDropdownOpen;
		isNetworkDropdownOpen = false;
	}

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
			const txs = await fetchAllConnectedWalletTransactions(wallets);
			allTransactions = computeRunningBalances(txs);
		} catch (err) {
			console.error('[ConnectedTransactionHistory] Failed to load:', err);
			error = err instanceof Error ? err.message : $t('wallet.failed_to_load_transactions');
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Compute running balances working backwards from current wallet totals.
	 * Bitcoin balance = rBTC + BTC + wBTC across all connected wallets.
	 * USDT balance = USDT0 (Arbitrum) across all connected wallets.
	 * Transactions are already sorted newest-first from the fetcher.
	 */
	function computeRunningBalances(txs: ConnectedTransaction[]): ConnectedTransaction[] {
		if (txs.length === 0) return txs;

		// Get current aggregated balances from the connected wallet store
		const storeWallets = $connectedWalletsStore.wallets;
		let currentBtcSats = 0;
		let currentUsdtCents = 0;

		for (const w of storeWallets) {
			const b = w.balances;
			if (b) {
				// BTC: rBTC + BTC + wBTC (all in sats from raw wei/sats values)
				currentBtcSats += Number(b.rbtc?.raw ?? 0);
				currentBtcSats += Number(b.btc?.raw ?? 0);
				currentBtcSats += Number(b.wbtc?.raw ?? 0);
				// USDT0-Arb: in micro-USDT (raw is in smallest unit, 6 decimals for USDT)
				currentUsdtCents += Number(b['usdt0-arb']?.raw ?? 0);
			}
		}

		// Work backwards: for each tx (newest first), store current balance, then adjust
		let runningBtc = currentBtcSats;
		let _runningUsdt = currentUsdtCents;

		for (const tx of txs) {
			const isFailed = tx.status === 'failed';
			if (tx.network === 'rsk') {
				// RSK = Bitcoin (rBTC)
				tx.balanceAfter = runningBtc;
				if (tx.type === 'receive') {
					// Failed receives never arrived
					if (!isFailed) {
						runningBtc -= tx.valueSats;
					}
				} else {
					// Failed sends only cost gas fee
					if (isFailed) {
						runningBtc += tx.feeSats;
					} else {
						runningBtc += tx.valueSats + tx.feeSats;
					}
				}
			} else if (tx.tokenSymbol) {
				// Arbitrum ERC-20 token transfer — doesn't affect BTC running balance
				tx.balanceAfter = runningBtc;
			} else {
				// Arbitrum native transfer — contributes to BTC running balance
				tx.balanceAfter = runningBtc;
				if (tx.type === 'receive') {
					if (!isFailed) {
						runningBtc -= tx.valueSats;
					}
				} else {
					if (isFailed) {
						runningBtc += tx.feeSats;
					} else {
						runningBtc += tx.valueSats + tx.feeSats;
					}
				}
			}
		}

		return txs;
	}

	function formatFee(feeSats: number | undefined): string {
		try {
			if (!feeSats || !isFinite(feeSats) || isNaN(feeSats)) return '0';
			return `${feeSats.toLocaleString()} ${$t('wallet.sats')}`;
		} catch {
			return '0';
		}
	}

	function formatDate(timestamp: string): string {
		try {
			if (!timestamp) return '';
			const date = new SvelteDate(timestamp);
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		} catch {
			return '';
		}
	}

	function formatTime(timestamp: string): string {
		try {
			if (!timestamp) return '';
			const date = new SvelteDate(timestamp);
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		} catch {
			return '';
		}
	}

	function nextPage() {
		if (currentPage < totalPages - 1) currentPage++;
	}

	function prevPage() {
		if (currentPage > 0) currentPage--;
	}

	function goToPage(page: number) {
		if (page >= 0 && page < totalPages) currentPage = page;
	}

	function handleTransactionClick(tx: ConnectedTransaction) {
		if (tx.explorerUrl) {
			window.open(tx.explorerUrl, '_blank');
		}
	}

	function getBorderColor(tx: ConnectedTransaction): string {
		if (tx.status === 'failed') return 'error';
		if (tx.type === 'receive') return 'success';
		return 'warning';
	}

	function getTxTitle(tx: ConnectedTransaction): string {
		if (tx.tokenSymbol) {
			return `${tx.tokenSymbol} Transfer`;
		}
		if (tx.methodName) {
			// Format camelCase or snake_case method name to readable
			return tx.methodName
				.replace(/([a-z])([A-Z])/g, '$1 $2')
				.replace(/_/g, ' ')
				.replace(/^\w/, (c) => c.toUpperCase());
		}
		return tx.type === 'send' ? $t('wallet.sent') : $t('wallet.received');
	}

	function formatAddressShort(addr: string): string {
		if (!addr || addr.length < 10) return '';
		return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div class="-m-3 flex min-h-0 flex-1 flex-col sm:-m-4 lg:-m-6">
	<!-- Filters container matching contracts screen design -->
	<div
		class="border-base-300/60 bg-base-100/40 mx-3 mt-3 shrink-0 rounded-3xl border p-2 shadow-sm sm:mx-4 sm:mt-4 lg:mx-6 lg:mt-6"
	>
		<!-- Type Filter Buttons -->
		<div class="mb-4">
			<!-- Mobile: 2x2 Grid -->
			<div class="mb-3 grid grid-cols-2 gap-2 sm:hidden">
				{#each typeFilterOptions as option (option.id)}
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
			<!-- Desktop: Horizontal Row -->
			<div class="hidden sm:flex sm:items-center sm:gap-2">
				{#each typeFilterOptions as option (option.id)}
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
		</div>

		<!-- Filter dropdowns row -->
		<div class="flex gap-2">
			<!-- Network Filter Dropdown -->
			<div class="network-dropdown-container relative flex-1">
				{#each [networkFilterOptions.find((opt) => opt.id === networkFilter)] as selectedOption (selectedOption?.id ?? networkFilter)}
					<button
						class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
						onclick={toggleNetworkDropdown}
					>
						<div class="flex items-center gap-2">
							{#if selectedOption?.isImage}
								<img src={selectedOption.icon} alt={selectedOption.label} class="h-5 w-5" />
							{:else if selectedOption && typeof selectedOption.icon !== 'string'}
								{@const IconComponent = selectedOption.icon}
								<IconComponent class="h-5 w-5" />
							{/if}
							<span class="font-medium">
								{selectedOption?.label}
							</span>
						</div>
						<IconChevronDown
							class="h-5 w-5 transition-transform duration-200 {isNetworkDropdownOpen
								? 'rotate-180'
								: ''}"
						/>
					</button>
				{/each}

				{#if isNetworkDropdownOpen}
					<div
						class="border-base-300 bg-base-100 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
					>
						{#each networkFilterOptions as option (option.id)}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {networkFilter ===
								option.id
									? 'bg-primary/10 text-primary'
									: 'text-base-content'}"
								onclick={() => selectNetworkFilter(option.id)}
							>
								{#if option.isImage}
									<img src={option.icon} alt={option.label} class="h-5 w-5" />
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

			<!-- Wallet Filter Dropdown (connected-wallet addition) -->
			<div class="wallet-dropdown-container relative flex-1">
				<button
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
					onclick={toggleWalletDropdown}
				>
					<div class="flex items-center gap-2">
						{#if walletFilter === 'all'}
							<IconCheckAll class="h-5 w-5" />
						{:else}
							{@const selected = walletFilterOptions.find((w) => w.id === walletFilter)}
							{#if selected}
								<WalletIcon walletType={selected.walletType} className="h-5 w-5 shrink-0" />
							{/if}
						{/if}
						<span class="font-medium">
							{walletFilter === 'all'
								? $t('wallet.all_wallets')
								: (walletFilterOptions.find((w) => w.id === walletFilter)?.label ?? '')}
						</span>
					</div>
					<IconChevronDown
						class="h-5 w-5 transition-transform duration-200 {isWalletDropdownOpen
							? 'rotate-180'
							: ''}"
					/>
				</button>

				{#if isWalletDropdownOpen}
					<div
						class="border-base-300 bg-base-100 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
					>
						{#each walletFilterOptions as option (option.id)}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {walletFilter ===
								option.id
									? 'bg-primary/10 text-primary'
									: 'text-base-content'}"
								onclick={() => selectWalletFilter(option.id)}
							>
								{#if option.id === 'all'}
									<IconCheckAll
										class="h-5 w-5 {walletFilter === option.id
											? 'text-primary'
											: 'text-base-content/60'}"
									/>
								{:else}
									<WalletIcon walletType={option.walletType} className="h-5 w-5 shrink-0" />
								{/if}
								<span class="font-medium">{option.label}</span>
								{#if walletFilter === option.id}
									<IconCheck class="text-primary ml-auto h-5 w-5" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Total transactions count (above scrollable area) -->
	{#if !isLoading && filteredTransactions.length > 0}
		<div class="mx-3 shrink-0 p-2 text-center text-lg font-bold sm:mx-4 lg:mx-6">
			{filteredTransactions.length}
			{$t('wallet.total_transactions')}
		</div>
	{/if}

	<!-- Scrollable transactions area -->
	<div class="mx-3 min-h-0 flex-1 overflow-y-auto sm:mx-4 lg:mx-6">
		<div class="space-y-3">
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
				<div class="space-y-3">
					{#each Array.from({ length: 10 }, (_, i) => i) as skeletonIndex (skeletonIndex)}
						<div class="card bg-base-200 animate-pulse rounded-lg">
							<div class="card-body p-2">
								<div class="flex flex-col gap-1">
									<!-- Top Row: Icon, Text, Amount -->
									<div class="flex items-center justify-between gap-2 sm:gap-4">
										<div class="flex min-w-0 flex-1 items-center gap-3">
											<div class="bg-base-300 h-10 w-10 rounded-full"></div>
											<div class="flex flex-col gap-1">
												<div class="bg-base-300 h-5 w-24 rounded"></div>
												<div class="bg-base-300 h-3 w-16 rounded"></div>
											</div>
										</div>
										<div class="flex flex-col items-end">
											<div class="bg-base-300 h-5 w-20 rounded"></div>
											<div class="bg-base-300 mt-1 h-3 w-16 rounded"></div>
										</div>
									</div>
									<!-- Bottom Row: Network Icon, Date/Time -->
									<div class="flex items-center justify-between gap-2 sm:gap-4">
										<div class="flex min-w-0 flex-1 items-center gap-3">
											<div class="bg-base-300 h-10 w-10 rounded-full"></div>
											<div class="space-y-1">
												<div class="bg-base-300 h-4 w-24 rounded"></div>
												<div class="bg-base-300 h-3 w-20 rounded"></div>
											</div>
										</div>
										<div class="bg-base-300 h-4 w-16 rounded"></div>
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
						{typeFilter === 'all' && networkFilter === 'all' && walletFilter === 'all'
							? $t('wallet.no_connected_transactions')
							: $t('wallet.no_transactions_filter')}
					</p>
				</div>
			{:else}
				<!-- Transaction List -->
				<div class="space-y-3">
					{#each paginatedTransactions as tx (tx.hash + '-' + tx.walletId)}
						{@const borderKey = getBorderColor(tx)}
						{@const transactionClasses = transactionUI[borderKey]}
						<div
							role="button"
							tabindex="0"
							onclick={() => handleTransactionClick(tx)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									handleTransactionClick(tx);
								}
							}}
							class="card bg-base-200 hover:bg-base-300 cursor-pointer rounded-lg border-2 transition-colors {transactionClasses.border}"
						>
							<div class="card-body p-2">
								<div class="flex flex-col gap-1">
									<!-- Top Row: Icon, Wallet Icon, Text, Amount, Fee -->
									<div class="flex items-center justify-between gap-2 sm:gap-4">
										<div class="flex min-w-0 flex-1 items-center gap-3">
											<!-- Type Icon with Overlay -->
											<div class="relative inline-block">
												<div
													class="flex h-10 w-10 items-center justify-center rounded-full {transactionClasses.background} {transactionClasses.text}"
												>
													{#if tx.type === 'send'}
														<IconArrowUpBold class="h-6 w-6" />
													{:else}
														<IconArrowDownBold class="h-6 w-6" />
													{/if}
												</div>
												<!-- Status Badge on top-left -->
												<div
													class="bg-base-100 absolute top-0 left-0 rounded-full p-0.5 shadow-sm"
													title={tx.status === 'success'
														? $t('wallet.confirmed')
														: tx.status === 'failed'
															? $t('wallet.failed')
															: $t('wallet.pending')}
												>
													{#if tx.status === 'success'}
														<IconCheck class="text-success h-4 w-4" />
													{:else if tx.status === 'failed'}
														<IconClose class="text-error h-4 w-4" />
													{:else}
														<IconChevronDown class="text-warning h-4 w-4" />
													{/if}
												</div>
											</div>
											<!-- Connected wallet icon (same height as arrow, not circle) -->
											<WalletIcon walletType={tx.walletType} className="h-6 w-6 shrink-0" />
											<div class="min-w-0">
												<span class="font-semibold">
													{getTxTitle(tx)}
												</span>
												<!-- Last 4 of wallet address -->
												<div class="text-base-content/40 truncate font-mono text-xs">
													{formatAddressShort(tx.walletAddress)}
												</div>
											</div>
										</div>
										<div class="flex flex-shrink-0 flex-col items-end">
											<div class="{transactionClasses.text} font-semibold">
												{#if tx.type === 'receive'}+{:else}-{/if}
												{#if tx.tokenSymbol && tx.tokenAmount}
													{tx.tokenAmount}
													{tx.tokenSymbol}
												{:else}
													{Math.abs(tx.valueSats).toLocaleString()}
													{$t('wallet.sats')}
												{/if}
											</div>
											<div class="text-xs opacity-70">
												{#if tx.tokenSymbol}
													{$t('wallet.tx_fee')}: 0 {$t('wallet.sats')}
												{:else}
													{$t('wallet.tx_fee')}: {formatFee(tx.feeSats)}
												{/if}
											</div>
										</div>
									</div>

									<!-- Bottom Row: Network Icon, Date/Time, Running Balance -->
									<div class="flex items-center justify-between gap-2 sm:gap-4">
										<div class="flex min-w-0 flex-1 items-center gap-3">
											<!-- Network Icon -->
											<div
												class="bg-base-300/20 flex h-10 w-10 items-center justify-center rounded-full"
											>
												<img
													src={tx.network === 'rsk'
														? '/images/chains/Bitcoin-Rootstock-logo.webp'
														: '/images/chains/arbitrum.png'}
													alt={tx.network === 'rsk' ? 'Rootstock' : 'Arbitrum'}
													class="h-10 w-10"
												/>
											</div>
											<div class="text-sm opacity-70">
												<div>{formatDate(tx.timestamp)}</div>
												<div>{formatTime(tx.timestamp)}</div>
											</div>
										</div>
										<!-- Running balance (matching built-in wallet) -->
										<div class="text-right">
											<div class="text-xs opacity-70">
												{$t('wallet.balance_after')}:
											</div>
											<div class="text-sm font-semibold md:text-base">
												{Math.floor(tx.balanceAfter ?? 0)?.toLocaleString() || '0'}
												{$t('wallet.sats')}
											</div>
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

	<!-- Bottom section with pagination and buttons -->
	<div
		class="border-base-300 mx-3 mt-auto mb-3 shrink-0 space-y-4 border-t pt-4 sm:mx-4 sm:mb-4 lg:mx-6 lg:mb-6 lg:pt-6"
	>
		<!-- Pagination controls -->
		{#if totalPages > 1 && !isLoading && paginatedTransactions.length > 0}
			<div class="flex justify-center">
				<div class="join">
					<button class="join-item btn btn-sm" onclick={prevPage} disabled={currentPage === 0}>
						«
					</button>

					{#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => i) as i (i)}
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
		{/if}

		<!-- Close and Refresh buttons -->
		<div class="flex gap-2">
			{#if onClose}
				<button
					class="btn btn-error min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:min-h-[48px]"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={onClose}
					aria-label={$t('common.close')}
				>
					<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
					<span class="text-sm sm:text-base">{$t('common.close')}</span>
				</button>
			{/if}
			<button
				class="btn btn-primary flex min-h-[44px] flex-1 items-center justify-center gap-2"
				onclick={loadTransactions}
				disabled={isLoading}
				aria-label={$t('wallet.refresh')}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
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
</div>
