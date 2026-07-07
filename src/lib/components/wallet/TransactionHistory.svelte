<script lang="ts">
	import type { ProcessedTransaction, SwapAction } from '$lib/types/wallet';
	import type { Component } from 'svelte';
	import { t, locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { transactions, walletManager, walletStore } from '$lib/stores/wallet.store';
	import * as Sentry from '@sentry/sveltekit';
	import TransactionListLayout from '$lib/components/wallet/TransactionListLayout.svelte';
	import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
	import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconCheck from '~icons/mdi/check';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconCheckAll from '~icons/mdi/check-all';
	import IconClose from '~icons/mdi/close';

	let { onOpenPaymentRequest, onClose } = $props<{
		onOpenPaymentRequest: (swapId: string) => void;
		onClose?: () => void;
	}>();

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let typeFilter = $state<'all' | 'send' | 'receive' | 'contract-function'>('all');
	let networkFilter = $state<'all' | 'rsk' | 'arb' | 'lightning'>('all');
	let isNetworkDropdownOpen = $state(false);
	let currentPage = $state(0);
	let itemsPerPage = 20;
	let searchQuery = $state('');

	// Filtered transactions
	let filteredTransactions = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		return $transactions.filter((tx) => {
			if (typeFilter !== 'all' && tx.displayType !== typeFilter) return false;
			if (networkFilter !== 'all' && tx.network !== networkFilter) return false;
			if (query) {
				const matchesHash = tx.hash?.toLowerCase().includes(query);
				const matchesFrom = tx.from?.toLowerCase().includes(query);
				const matchesTo = tx.to?.toLowerCase().includes(query);
				const matchesValue = tx.value?.toString().includes(query);
				if (!matchesHash && !matchesFrom && !matchesTo && !matchesValue) return false;
			}
			return true;
		});
	});

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
			id: 'lightning' as const,
			label: $t('wallet.transaction.network.lightning_bitcoin'),
			icon: '/images/chains/lightning.svg',
			isImage: true
		},
		{
			id: 'arb' as const,
			label: $t('wallet.transaction.network.arbitrum'),
			icon: '/images/chains/arbitrum.png',
			isImage: true
		}
	];

	// Type filter options
	const typeFilterOptions = [
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
		},
		{
			id: 'contract-function' as const,
			label: $t('wallet.transaction.type.contracts'),
			icon: IconFileDocumentOutline
		}
	];

	const transactionUI = {
		success: {
			border: 'border-success',
			background: 'bg-success/20',
			text: 'text-success'
		},
		warning: {
			border: 'border-warning',
			background: 'bg-warning/20',
			text: 'text-warning'
		},
		neutral: {
			border: 'border-neutral',
			background: 'bg-neutral/20',
			text: 'text-neutral'
		},
		error: {
			border: 'border-error',
			background: 'bg-error/20',
			text: 'text-error'
		},
		info: {
			border: 'border-info',
			background: 'bg-info/20',
			text: 'text-info'
		}
	};

	function selectTypeFilter(typeId: 'all' | 'send' | 'receive' | 'contract-function') {
		typeFilter = typeId;
		currentPage = 0;
	}

	function selectNetworkFilter(networkId: 'all' | 'rsk' | 'arb' | 'lightning') {
		networkFilter = networkId;
		isNetworkDropdownOpen = false;
		currentPage = 0;
	}

	function toggleNetworkDropdown() {
		isNetworkDropdownOpen = !isNetworkDropdownOpen;
	}

	// Paginated transactions
	let paginatedTransactions = $derived(
		filteredTransactions.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage)
	);

	let totalPages = $derived(Math.ceil(filteredTransactions.length / itemsPerPage));

	onMount(async () => {
		await loadTransactionList(false);
	});

	/**
	 * Load transactions — reuse store data on open; full Nostr recovery on refresh only.
	 */
	async function loadTransactionList(forceRecover = false) {
		isLoading = true;
		error = null;

		try {

			if (!$walletStore.isConnected || $walletStore.isInitializing) {
				if ($walletStore.isInitializing) {
					const maxWaitTime = 10000;
					const startTime = Date.now();
					while (Date.now() - startTime < maxWaitTime) {
						await new Promise((resolve) => setTimeout(resolve, 100));
						if ($walletStore.isConnected && !$walletStore.isInitializing) {
							break;
						}
					}
				} else {
					await walletManager.initialize();
				}

				if (!$walletStore.isConnected) {
					throw new Error('Wallet initialization failed. Please try again.');
				}
			}

			if (forceRecover) {
				await walletManager.refreshTransactions();
			} else {
				await walletManager.loadTransactions();
			}
		} catch (err) {
			Sentry.captureException(err, {
				tags: { feature: 'transaction-history', action: 'load-transactions' }
			});
			error = err instanceof Error ? err.message : $t('wallet.failed_to_load_transactions');
		} finally {
			isLoading = false;
		}
	}

	async function loadTransactions() {
		await loadTransactionList(true);
	}

	function formatFee(feeSats: number | undefined): string {
		if (!feeSats || !isFinite(feeSats) || isNaN(feeSats)) return '0';
		return `${feeSats.toLocaleString()} ${$t('wallet.sats')}`;
	}

	function formatDate(timestamp: string): string {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		return date.toLocaleDateString(get(locale) ?? 'en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatTime(timestamp: string): string {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		return date.toLocaleTimeString(get(locale) ?? 'en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	/**
	 * Handle transaction click
	 * Opens swap QR modal for pending swaps (via callback), otherwise opens explorer URL
	 */
	async function handleTransactionClick(tx: ProcessedTransaction) {
		if (tx.swap && tx.swap.actions) {
			const hasViewQRAction = tx.swap.actions.some(
				(action: SwapAction) => action.type === 'viewQR'
			);

			if (hasViewQRAction && tx.swap.id) {
				onOpenPaymentRequest(tx.swap.id);
				return;
			}
		}

		if (tx.explorerUrl) {
			window.open(tx.explorerUrl, '_blank');
		}
	}

	async function handleViewQRAction(tx: ProcessedTransaction, event: Event) {
		event.stopPropagation();
		await handleTransactionClick(tx);
	}

	function handlePageChange(page: number) {
		currentPage = page;
	}
</script>

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

		<!-- Network Filter Dropdown -->
		<div class="network-dropdown-container relative">
			{#each [networkFilterOptions.find((opt) => opt.id === networkFilter)] as selectedOption (selectedOption?.id ?? networkFilter)}
				<button
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
					onclick={toggleNetworkDropdown}
				>
					<div class="flex items-center gap-2">
						{#if selectedOption?.isImage}
							<img src={selectedOption.icon as string} alt={selectedOption.label} class="h-5 w-5" />
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

		<!-- Search Input -->
		<div class="relative mt-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/40 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			<input
				id="tx-search"
				type="text"
				class="input input-bordered input-sm w-full pr-8 pl-9"
				placeholder={$t('wallet.history.search')}
				aria-label={$t('wallet.history.search')}
				bind:value={searchQuery}
				oninput={() => {
					currentPage = 0;
				}}
			/>
			{#if searchQuery}
				<button
					type="button"
					class="btn btn-ghost btn-xs absolute top-1/2 right-2 -translate-y-1/2 p-0"
					onclick={() => {
						searchQuery = '';
						currentPage = 0;
					}}
				>
					<IconClose class="h-3.5 w-3.5" />
				</button>
			{/if}
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
					{typeFilter === 'all' && networkFilter === 'all'
						? $t('wallet.no_transactions_yet')
						: $t('wallet.no_transactions_filter')}
				</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each paginatedTransactions as tx (tx.hash)}
					{@const valueSats = Number(tx.value)}
					{@const transactionClasses = transactionUI[tx.borderColor]}
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
								<!-- Top Row: Icon, Text, Checkmark, Amount, Fee -->
								<div class="flex items-center justify-between gap-2 sm:gap-4">
									<div class="flex min-w-0 flex-1 items-center gap-3">
										<div class="relative inline-block">
											<div
												class="flex h-10 w-10 items-center justify-center rounded-full {transactionClasses.background} {transactionClasses.text}"
											>
												{#if tx.iconConfig.base}
													{@const IconBase = tx.iconConfig.base as unknown as Component}
													<IconBase class="h-6 w-6" />
												{/if}
											</div>
											<div
												class="bg-base-100 absolute top-0 left-0 rounded-full p-0.5 shadow-sm"
												title={tx.status.label}
											>
												<tx.status.icon class="h-4 w-4 {tx.status.color}" />
											</div>
											{#if tx.iconConfig.overlay}
												<div
													class="bg-base-100 absolute top-0 right-0 rounded-full p-0.5 shadow-sm"
												>
													<tx.iconConfig.overlay
														class="h-4 w-4 {tx.borderColor === 'success'
															? 'text-success'
															: 'text-warning'}"
													/>
												</div>
											{/if}
										</div>
										<div class="flex items-center gap-2">
											<span class="font-semibold">
												{$t(tx.title)}
											</span>
										</div>
									</div>
									<!-- Swap Action Buttons -->
									{#if tx.swap?.actions && tx.swap.actions.length > 0}
										<div class="flex flex-wrap gap-1">
											{#each tx.swap.actions as action (action.type)}
												<button
													class="btn btn-xs"
													class:btn-warning={action.type === 'refund'}
													class:btn-primary={action.type === 'renegotiate' ||
														action.type === 'viewQR'}
													class:btn-success={action.type === 'claim'}
													onclick={(e) => {
														if (action.type === 'viewQR') {
															handleViewQRAction(tx, e);
														} else {
															action.handler();
														}
													}}
												>
													{$t(action.label)}
												</button>
											{/each}
										</div>
									{/if}
									<div class="flex flex-shrink-0 flex-col items-end">
										<div class="{transactionClasses.text} font-semibold">
											{#if tx.displayType === 'receive' || tx.displayType === 'swap-claim'}
												{#if valueSats > 0}+{/if}
											{:else if tx.displayType === 'send'}
												{#if valueSats > 0}-{/if}
											{/if}
											{valueSats.toLocaleString()}
											{$t('wallet.sats')}
										</div>
										<div class="text-xs opacity-70">
											{$t('wallet.tx_fee')}: {formatFee(tx.feeSats)}
										</div>
									</div>
								</div>

								<!-- Bottom Row: Network Icon, Date/Time, Running Balance -->
								<div class="flex items-center justify-between gap-2 sm:gap-4">
									<div class="flex min-w-0 flex-1 items-center gap-3">
										<div
											class="bg-base-300/20 flex h-10 w-10 items-center justify-center rounded-full"
										>
											<img src={tx.networkIcon} alt={tx.networkDisplayName} class="h-10 w-10" />
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
											{Math.floor(tx.balanceAfter)?.toLocaleString() || '0'}
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
