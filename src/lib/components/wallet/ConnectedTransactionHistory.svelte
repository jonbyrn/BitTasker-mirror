<!--
  ConnectedTransactionHistory — uses TransactionListLayout for shared structure,
  with wallet logo + last 4 address chars per transaction and wallet filter dropdown.
-->
<script lang="ts">
	import type { ConnectedTransaction } from '$lib/services/connected-wallet-transactions';
	import type { ConnectedWalletInfo } from '$lib/services/connected-wallet-transactions';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import * as Sentry from '@sentry/sveltekit';
	import WalletIcon from './WalletIcon.svelte';
	import TransactionListLayout from '$lib/components/wallet/TransactionListLayout.svelte';
	import { fetchAllConnectedWalletTransactions } from '$lib/services/connected-wallet-transactions';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { computeRunningBalances } from './running-balance';
	import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
	import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconCheck from '~icons/mdi/check';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconCheckAll from '~icons/mdi/check-all';

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

	// Network filter options
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

	// Type filter options
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

	let selectedNetworkOption = $derived(
		networkFilterOptions.find((opt) => opt.id === networkFilter)
	);

	const transactionUI: Record<string, { border: string; background: string; text: string }> = {
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

			// Build balance map from the connected wallet store
			const storeWallets = $connectedWalletsStore.wallets;
			const walletBalanceMap: Record<string, { rbtc?: string; btc?: string; wbtc?: string }> = {};
			for (const w of storeWallets) {
				const b = w.balances;
				if (b) {
					walletBalanceMap[w.id] = {
						rbtc: b.rbtc?.raw,
						btc: b.btc?.raw,
						wbtc: b.wbtc?.raw
					};
				}
			}

			allTransactions = computeRunningBalances(txs, walletBalanceMap);
		} catch (err) {
			Sentry.captureException(err, {
				tags: { feature: 'connected-transaction-history', action: 'load-transactions' }
			});
			error = err instanceof Error ? err.message : $t('wallet.failed_to_load_transactions');
		} finally {
			isLoading = false;
		}
	}

	function formatFee(feeSats: number | undefined): string {
		if (!feeSats || !isFinite(feeSats) || isNaN(feeSats)) return '0';
		return `${feeSats.toLocaleString()} ${$t('wallet.sats')}`;
	}

	function formatDate(timestamp: string): string {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatTime(timestamp: string): string {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

	function handlePageChange(page: number) {
		currentPage = page;
	}
</script>

<svelte:window onclick={handleWindowClick} />

<TransactionListLayout
	totalCount={filteredTransactions.length}
	{isLoading}
	{error}
	{currentPage}
	{totalPages}
	hasPageItems={paginatedTransactions.length > 0}
	{onClose}
	onRefresh={loadTransactions}
	onPageChange={handlePageChange}
>
	{#snippet filters()}
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
				<button
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
					onclick={toggleNetworkDropdown}
				>
					<div class="flex items-center gap-2">
						{#if selectedNetworkOption?.isImage}
							<img
								src={String(selectedNetworkOption.icon)}
								alt={selectedNetworkOption.label}
								class="h-5 w-5"
							/>
						{:else if selectedNetworkOption && typeof selectedNetworkOption.icon !== 'string'}
							{@const IconComponent = selectedNetworkOption.icon}
							<IconComponent class="h-5 w-5" />
						{/if}
						<span class="font-medium">
							{selectedNetworkOption?.label}
						</span>
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
						{#each networkFilterOptions as option (option.id)}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {networkFilter ===
								option.id
									? 'bg-primary/10 text-primary'
									: 'text-base-content'}"
								onclick={() => selectNetworkFilter(option.id)}
							>
								{#if option.isImage}
									<img src={String(option.icon)} alt={option.label} class="h-5 w-5" />
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

			<!-- Wallet Filter Dropdown -->
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
	{/snippet}

	{#snippet content()}
		{#if paginatedTransactions.length === 0}
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
													<IconCheck class="text-error h-4 w-4" />
												{:else}
													<IconChevronDown class="text-warning h-4 w-4" />
												{/if}
											</div>
										</div>
										<WalletIcon walletType={tx.walletType} className="h-6 w-6 shrink-0" />
										<div class="min-w-0">
											<span class="font-semibold">
												{getTxTitle(tx)}
											</span>
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
	{/snippet}
</TransactionListLayout>
