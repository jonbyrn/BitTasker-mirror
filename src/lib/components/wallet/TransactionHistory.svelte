<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { transactions, walletManager } from '$lib/stores/wallet.store';
	import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
	import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconCheck from '~icons/mdi/check';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconCheckAll from '~icons/mdi/check-all';

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let typeFilter = $state<'all' | 'send' | 'receive' | 'contract-function'>('all');
	let networkFilter = $state<'all' | 'rsk' | 'bsc'>('all');
	let isNetworkDropdownOpen = $state(false);
	let currentPage = $state(0);
	let itemsPerPage = 20;

	// Filtered transactions
	let filteredTransactions = $derived(
		$transactions.filter((tx) => {
			// Filter by display type
			if (typeFilter !== 'all' && tx.displayType !== typeFilter) return false;
			// Filter by network
			if (networkFilter !== 'all' && tx.network !== networkFilter) return false;
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
			id: 'bsc' as const,
			label: $t('wallet.transaction.network.bsc'),
			icon: '/images/chains/Binance-logo.svg',
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
			label: $t('wallet.transaction.type.contract_function'),
			icon: IconFileDocumentOutline
		}
	];

	function selectTypeFilter(typeId: 'all' | 'send' | 'receive' | 'contract-function') {
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

	// Paginated transactions
	let paginatedTransactions = $derived(
		filteredTransactions.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage)
	);

	let totalPages = $derived(Math.ceil(filteredTransactions.length / itemsPerPage));

	onMount(() => {
		loadTransactions();
	});

	/**
	 * Load transactions
	 */
	async function loadTransactions() {
		isLoading = true;
		error = null;

		try {
			await walletManager.loadTransactions();
		} catch (err) {
			console.error('Failed to load transactions:', err);
			error = err instanceof Error ? err.message : $t('wallet.failed_to_load_transactions');
		} finally {
			isLoading = false;
		}
	}

	function formatFee(feeSats: number | undefined): string {
		try {
			// Fee is pre-calculated in sats in wallet store
			if (!feeSats || !isFinite(feeSats) || isNaN(feeSats)) return '0';
			return `${feeSats.toLocaleString()} ${$t('wallet.sats')}`;
		} catch (error) {
			console.error('Error formatting fee:', error);
			return '0';
		}
	}

	function formatDate(timestamp: string): string {
		try {
			if (!timestamp) return '';
			const date = new Date(timestamp);
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		} catch (error) {
			console.error('Error formatting date:', error);
			return '';
		}
	}

	function formatTime(timestamp: string): string {
		try {
			if (!timestamp) return '';
			const date = new Date(timestamp);
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		} catch (error) {
			console.error('Error formatting time:', error);
			return '';
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

<div class="space-y-6 pb-6">
	<!-- Filters container matching contracts screen design -->
	<div class="border-base-300/60 bg-base-100/40 rounded-3xl border p-4 shadow-sm">
		<!-- Mobile: Refresh Button (Above Grid) -->
		<div class="mb-3 flex justify-end sm:hidden">
			<button
				class="btn btn-outline btn-sm flex items-center gap-2"
				onclick={loadTransactions}
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

		<!-- Mobile: Type Filter Buttons and Network Dropdown -->
		<div class="mb-3 sm:hidden">
			<!-- Type Filter Buttons (Mobile) - 2x2 Grid -->
			<div class="mb-3 grid grid-cols-2 gap-2">
				{#each typeFilterOptions as option}
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
					onclick={loadTransactions}
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
		<div class="space-y-3">
			{#each Array(10) as _}
				<div class="card bg-base-200 animate-pulse rounded-lg">
					<div class="card-body p-4">
						<div class="flex flex-col gap-1">
							<!-- Top Row: Icon, Text, Checkmark, Amount, Fee -->
							<div class="flex items-center justify-between gap-2 sm:gap-4">
								<div class="flex items-center gap-3">
									<!-- Type Icon -->
									<div class="bg-base-300 h-10 w-10 rounded-full"></div>
									<div class="flex items-center gap-2">
										<div class="bg-base-300 h-5 w-24 rounded"></div>
										<div class="bg-base-300 h-5 w-5 rounded-full"></div>
									</div>
								</div>
								<div class="flex flex-col items-end">
									<div class="bg-base-300 h-5 w-20 rounded"></div>
									<div class="bg-base-300 mt-1 h-3 w-16 rounded"></div>
								</div>
							</div>
							<!-- Bottom Row: Network Icon, Date/Time, Running Balance -->
							<div class="flex items-center justify-between gap-2 sm:gap-4">
								<div class="flex items-center gap-3">
									<!-- Network Icon -->
									<div class="bg-base-300 h-10 w-10 rounded-full"></div>
									<div class="space-y-1">
										<div class="bg-base-300 h-4 w-24 rounded"></div>
										<div class="bg-base-300 h-3 w-20 rounded"></div>
									</div>
								</div>
								<div class="bg-base-300 h-4 w-32 rounded"></div>
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
				{@const valueSats = Number(tx.value)}
				{@const borderClass =
					tx.borderColor === 'success'
						? 'border-success'
						: tx.borderColor === 'warning'
							? 'border-warning'
							: 'border-info'}
				{@const bgClass =
					tx.borderColor === 'success'
						? 'bg-success/20'
						: tx.borderColor === 'warning'
							? 'bg-warning/20'
							: 'bg-info/20'}
				{@const textClass =
					tx.borderColor === 'success'
						? 'text-success'
						: tx.borderColor === 'warning'
							? 'text-warning'
							: 'text-info'}
				{#if tx.explorerUrl}
					<a
						href={tx.explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="card bg-base-200 hover:bg-base-300 cursor-pointer rounded-lg border-2 transition-colors {borderClass}"
					>
						<div class="card-body p-4">
							<div class="flex flex-col gap-1">
								<!-- Top Row: Icon, Text, Checkmark, Amount, Fee -->
								<div class="flex items-center justify-between gap-2 sm:gap-4">
									<div class="flex items-center gap-3">
										<!-- Type Icon with Overlay -->
										<div class="relative inline-block">
											<div
												class="flex h-10 w-10 items-center justify-center rounded-full {bgClass} {textClass}"
											>
												<tx.iconConfig.base class="h-6 w-6" />
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
											<div
												class="flex h-5 w-5 items-center justify-center {tx.status.color}"
												title={tx.status.label}
											>
												<tx.status.icon class="h-5 w-5" />
											</div>
										</div>
									</div>
									<div class="flex flex-col items-end">
										{#if tx.displayType === 'receive' || tx.displayType === 'swap-claim'}
											<div class="text-success font-semibold">
												{#if valueSats > 0}+{/if}{valueSats.toLocaleString()}
												{$t('wallet.sats')}
											</div>
										{:else if tx.displayType === 'send'}
											<div class="text-warning font-semibold">
												{#if valueSats > 0}-{/if}{valueSats.toLocaleString()}
												{$t('wallet.sats')}
											</div>
										{:else}
											<div class="text-info font-semibold">
												{valueSats.toLocaleString()}
												{$t('wallet.sats')}
											</div>
										{/if}
										<div class="text-xs opacity-70">
											{$t('wallet.tx_fee')}: {formatFee(tx.feeSats)}
										</div>
									</div>
								</div>

								<!-- Bottom Row: Network Icon, Date/Time, Running Balance -->
								<div class="flex items-center justify-between gap-2 sm:gap-4">
									<div class="flex items-center gap-3">
										<!-- Network Icon -->
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
										<div class="text-sm font-semibold md:text-base">
											{$t('wallet.balance_after')}: {Math.floor(
												tx.balanceAfter
											)?.toLocaleString() || '0'}
											{$t('wallet.sats')}
										</div>
									</div>
								</div>
							</div>
						</div>
					</a>
				{:else}
					<div
						class="card bg-base-200 hover:bg-base-300 rounded-lg border-2 transition-colors {borderClass}"
					>
						<div class="card-body p-4">
							<div class="flex flex-col gap-1">
								<!-- Top Row: Icon, Text, Checkmark, Amount, Fee -->
								<div class="flex items-center justify-between gap-2 sm:gap-4">
									<div class="flex items-center gap-3">
										<!-- Type Icon with Overlay -->
										<div class="relative inline-block">
											<div
												class="flex h-10 w-10 items-center justify-center rounded-full {bgClass} {textClass}"
											>
												<tx.iconConfig.base class="h-6 w-6" />
											</div>
											{#if tx.iconConfig.overlay}
												<div
													class="bg-base-100 absolute top-0 right-0 rounded-full p-0.5 shadow-sm"
												>
													<tx.iconConfig.overlay
														class="h-3 w-3 {tx.borderColor === 'success'
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
											<div
												class="flex h-5 w-5 items-center justify-center {tx.status.color}"
												title={tx.status.label}
											>
												<tx.status.icon class="h-5 w-5" />
											</div>
										</div>
									</div>
									<div class="flex flex-col items-end">
										{#if tx.displayType === 'receive' || tx.displayType === 'swap-claim'}
											<div class="text-success font-semibold">
												{#if valueSats > 0}+{/if}{valueSats.toLocaleString()}
												{$t('wallet.sats')}
											</div>
										{:else if tx.displayType === 'send'}
											<div class="text-warning font-semibold">
												{#if valueSats > 0}-{/if}{valueSats.toLocaleString()}
												{$t('wallet.sats')}
											</div>
										{:else}
											<div class="text-info font-semibold">
												{valueSats.toLocaleString()}
												{$t('wallet.sats')}
											</div>
										{/if}
										<div class="text-xs opacity-70">
											{$t('wallet.tx_fee')}: {formatFee(tx.feeSats)}
										</div>
									</div>
								</div>

								<!-- Bottom Row: Network Icon, Date/Time, Running Balance -->
								<div class="flex items-center justify-between gap-2 sm:gap-4">
									<div class="flex items-center gap-3">
										<!-- Network Icon -->
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
										<div class="text-sm font-semibold md:text-base">
											{$t('wallet.balance_after')}: {Math.floor(
												tx.balanceAfter
											)?.toLocaleString() || '0'}
											{$t('wallet.sats')}
										</div>
									</div>
								</div>
							</div>
						</div>
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
