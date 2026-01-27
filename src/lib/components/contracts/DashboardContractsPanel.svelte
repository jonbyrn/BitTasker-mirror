<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { createPortal } from '$lib/utils/portal';
	import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
	import { contractStore } from '$lib/stores/contract.store';
	import { scroll } from '$lib/stores/infiniteScroll.store';
	import ContractCard from './ContractCard.svelte';
	import ContractDrawer from './ContractDrawer.svelte';
	import InfiniteScroll from '$lib/components/InfiniteScroll.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	// MDI Icons for filters
	import IconCheckAll from '~icons/mdi/check-all';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconAlertCircleOutline from '~icons/mdi/alert-circle-outline';
	import IconCheck from '~icons/mdi/check';
	import IconCancel from '~icons/mdi/cancel';
	import IconRefresh from '~icons/mdi/refresh';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconAccountOutline from '~icons/mdi/account-outline';
	import IconAccountTieOutline from '~icons/mdi/account-tie-outline';

	// Filters
	let statusFilter = $state<EscrowStatus | 'all'>('all');
	let roleFilter = $state<string>('all'); // 'all', 'client', 'freelancer'
	let isStatusDropdownOpen = $state(false);

	let btcPrice = $state<number>(0);
	let btcPriceError = $state<string | null>(null);

	// Status filter options - using EscrowStatus enum
	const statusFilterOptions = $derived([
		{
			id: 'all' as const,
			label: $t('dashboard.contracts.all_statuses'),
			icon: IconCheckAll
		},
		{
			id: EscrowStatus.Funded,
			label: $t('dashboard.contracts.status.funded'),
			icon: IconLightningBolt
		},
		{
			id: EscrowStatus.Completed,
			label: $t('dashboard.contracts.status.completed'),
			icon: IconCheckCircle
		},
		{
			id: EscrowStatus.InDispute,
			label: $t('dashboard.contracts.status.in_dispute'),
			icon: IconAlertCircleOutline
		},
		{
			id: EscrowStatus.DisputeResolved,
			label: $t('dashboard.contracts.status.dispute_resolved'),
			icon: IconCheck
		},
		{
			id: EscrowStatus.Cancelled,
			label: $t('dashboard.contracts.status.cancelled'),
			icon: IconCancel
		}
	] as const);

	// Role filter options
	const roleFilterOptions = $derived([
		{
			id: 'all',
			label: $t('dashboard.contracts.all_roles'),
			icon: IconAccountOutline
		},
		{
			id: 'client',
			label: $t('dashboard.contracts.as_client'),
			icon: IconAccountTieOutline
		},
		{
			id: 'freelancer',
			label: $t('dashboard.contracts.as_freelancer'),
			icon: IconAccountOutline
		}
	] as const);

	const filteredContracts = $derived.by(() => {
		let filtered = $contractStore.contracts;

		// Filter by status (using unified status enum)
		if (statusFilter !== 'all') {
			filtered = filtered.filter((c) => c.status === statusFilter);
		}

		// Filter by role
		if (roleFilter === 'client') {
			filtered = filtered.filter((c) => c.isClient);
		} else if (roleFilter === 'freelancer') {
			filtered = filtered.filter((c) => !c.isClient);
		}

		return filtered;
	});

	// Load contracts on mount
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPriceError = null;
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			btcPriceError = error instanceof Error ? error.message : 'Failed to fetch BTC price';
			// Set fallback price to 0 so UI shows RBTC amount instead
			btcPrice = 0;
		}
	}

	onMount(async () => {
		const mountStartTime = import.meta.env.DEV ? performance.now() : 0;
		if (import.meta.env.DEV) {
			console.log('[DEBUG] [DashboardContractsPanel] onMount - Starting contract load', {
				timestamp: new Date().toISOString()
			});
		}

		// Ensure wallet is initialized BEFORE loading contracts
		try {
			const { walletStore, walletManager } = await import('$lib/stores/wallet.store');
			const { get } = await import('svelte/store');
			let walletState = get(walletStore);
			
			if (import.meta.env.DEV) {
				console.log('[DEBUG] [DashboardContractsPanel] Wallet state before initialization check', {
					isConnected: walletState.isConnected,
					isInitializing: walletState.isInitializing,
					hasRSKWallet: !!walletState.rsk?.wallet,
					hasRSKProvider: !!walletState.rsk?.provider,
					rskConnected: walletState.rsk?.connected,
					rskAddress: walletState.rsk?.address,
					timestamp: new Date().toISOString()
				});
			}

			// Wait for wallet initialization if not already initialized
			if (!walletState.isConnected || !walletState.rsk?.wallet || !walletState.rsk?.provider) {
				if (import.meta.env.DEV) {
					console.log('[DEBUG] [DashboardContractsPanel] Wallet not ready, initializing...');
				}
				const walletInitStartTime = import.meta.env.DEV ? performance.now() : 0;
				await walletManager.initialize();
				
				// Re-check wallet state after initialization
				walletState = get(walletStore);
				if (import.meta.env.DEV) {
					const walletInitDuration = performance.now() - walletInitStartTime;
					console.log('[DEBUG] [DashboardContractsPanel] Wallet initialization completed', {
						isConnected: walletState.isConnected,
						hasRSKWallet: !!walletState.rsk?.wallet,
						hasRSKProvider: !!walletState.rsk?.provider,
						rskConnected: walletState.rsk?.connected,
						initDurationMs: walletInitDuration.toFixed(2)
					});
				}
			} else if (import.meta.env.DEV) {
				console.log('[DEBUG] [DashboardContractsPanel] Wallet already initialized');
			}
		} catch (walletStateError) {
			if (import.meta.env.DEV) {
				console.error('[DEBUG] [DashboardContractsPanel] Failed to initialize wallet:', walletStateError);
			}
			// Continue anyway - contracts will handle wallet initialization individually
		}

		const loadStartTime = import.meta.env.DEV ? performance.now() : 0;
		await Promise.all([contractStore.loadContracts(), fetchBtcPrice()]);
		
		if (import.meta.env.DEV) {
			const loadDuration = performance.now() - loadStartTime;
			const totalMountDuration = performance.now() - mountStartTime;
			console.log('[DEBUG] [DashboardContractsPanel] Contract load completed', {
				loadDurationMs: loadDuration.toFixed(2),
				totalMountDurationMs: totalMountDuration.toFixed(2),
				contractCount: $contractStore.contracts.length,
				timestamp: new Date().toISOString()
			});
		}

		// Configure infinite scroll
		scroll.update((state) => ({
			...state,
			hasMore: $contractStore.hasMore,
			loadMore: async () => {
				if ($contractStore.hasMore && !$contractStore.isLoadingMore) {
					await contractStore.loadMoreContracts();
					// Update hasMore state after loading
					scroll.update((state) => ({ ...state, hasMore: $contractStore.hasMore }));
				}
			}
		}));
	});

	// Keep infinite scroll state in sync reactively
	$effect(() => {
		scroll.update((state) => ({
			...state,
			hasMore: $contractStore.hasMore
		}));
	});

	onDestroy(() => {
		// Cleanup subscriptions when leaving contracts panel
		contractStore.unsubscribeFromStatusUpdates();
		contractStore.unsubscribeFromNewContracts();
	});

	function selectStatusFilter(statusId: EscrowStatus | 'all') {
		statusFilter = statusId;
		isStatusDropdownOpen = false;
	}

	function selectRoleFilter(roleId: string) {
		roleFilter = roleId;
	}

	function toggleStatusDropdown() {
		isStatusDropdownOpen = !isStatusDropdownOpen;
	}

	function handleClickOutside(event: MouseEvent) {
		// Only handle clicks when dropdown is open
		if (!isStatusDropdownOpen) return;
		const target = event.target as HTMLElement;
		if (!target.closest('.status-dropdown-container')) {
			isStatusDropdownOpen = false;
		}
	}

	// Handle window clicks for dropdown - use effect to conditionally attach
	$effect(() => {
		if (!isStatusDropdownOpen) return;
		
		const handler = (event: MouseEvent) => {
			handleClickOutside(event);
		};
		
		window.addEventListener('click', handler);
		return () => {
			window.removeEventListener('click', handler);
		};
	});
</script>

<div class="space-y-6">
	<!-- Filters container with same design as TasksPanel -->
	<div class="border-base-300/60 bg-base-100/40 mt-2 rounded-3xl border p-4 shadow-sm">
		<!-- Header with title and refresh button -->
		<div class="mb-3 flex items-center justify-between gap-2">
			<div class="space-y-1">
				<p class="text-base-content/70 text-xs font-semibold tracking-wide uppercase">
					{$t('dashboard.contracts.filter_by_status_and_role')}
				</p>
				<p class="text-base-content/70 hidden text-sm sm:block">
					{$t('dashboard.contracts.filter_description')}
				</p>
			</div>

			<!-- Refresh button: icon only on mobile, with text on desktop -->
			<button
				class="btn btn-ghost btn-sm sm:btn-outline gap-2"
				onclick={() => contractStore.loadContracts()}
				disabled={$contractStore.isLoading}
				aria-label={$t('dashboard.contracts.refresh')}
			>
				{#if $contractStore.isLoading}
					<span class="loading loading-spinner loading-xs"></span>
					<span class="hidden sm:inline">{$t('dashboard.contracts.refresh')}</span>
				{:else}
					<IconRefresh class="h-5 w-5" />
					<span class="hidden sm:inline">{$t('dashboard.contracts.refresh')}</span>
				{/if}
			</button>
		</div>

		<!-- Mobile: Subheading and dropdowns -->
		<div class="mb-3 sm:hidden">
			<p class="text-base-content/70 mb-3 text-sm">
				{$t('dashboard.contracts.filter_description')}
			</p>

			<!-- Role Filter Buttons (Mobile) -->
			<div class="mb-3 flex gap-2">
				{#each roleFilterOptions as option}
					{@const IconComponent = option.icon}
					<button
						class="btn {roleFilter === option.id
							? 'btn-primary'
							: 'btn-secondary'} btn-sm flex items-center gap-2"
						onclick={() => selectRoleFilter(option.id)}
						aria-label={option.label}
					>
						{#if roleFilter === option.id}
							<IconCheck class="h-4 w-4" />
						{:else}
							<IconComponent class="h-4 w-4" />
						{/if}
						<span>{option.label}</span>
					</button>
				{/each}
			</div>

			<!-- Status Filter Dropdown (Mobile) -->
			<div class="status-dropdown-container relative">
				<button
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
					onclick={toggleStatusDropdown}
					aria-expanded={isStatusDropdownOpen}
					aria-haspopup="true"
					aria-controls="status-dropdown-menu"
					aria-label={$t('dashboard.contracts.filter_by_status')}
				>
					<div class="flex items-center gap-2">
						{#each statusFilterOptions as option}
							{#if statusFilter === option.id}
								{@const IconComponent = option.icon}
								<IconComponent class="h-5 w-5" />
							{/if}
						{/each}
						<span class="font-medium">
							{statusFilterOptions.find((opt) => opt.id === statusFilter)?.label}
						</span>
					</div>
					<IconChevronDown
						class="h-5 w-5 transition-transform duration-200 {isStatusDropdownOpen
							? 'rotate-180'
							: ''}"
					/>
				</button>

				{#if isStatusDropdownOpen}
					<div
						id="status-dropdown-menu"
						role="menu"
						aria-label={$t('dashboard.contracts.status_filter_menu')}
						class="border-base-300 bg-base-100 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
					>
						{#each statusFilterOptions as option}
							{@const IconComponent = option.icon}
							<button
								role="menuitemradio"
								aria-checked={statusFilter === option.id}
								class="hover:bg-base-200 flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {statusFilter ===
								option.id
									? 'bg-primary/10 text-primary'
									: 'text-base-content'}"
								onclick={() => selectStatusFilter(option.id)}
							>
								<IconComponent
									class="h-5 w-5 {statusFilter === option.id
										? 'text-primary'
										: 'text-base-content/60'}"
								/>
								<span class="font-medium">{option.label}</span>
								{#if statusFilter === option.id}
									<IconCheck class="text-primary ml-auto h-5 w-5" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Desktop: Role Filter Buttons -->
		<div class="mb-4 hidden sm:block">
			<div class="flex gap-2">
				{#each roleFilterOptions as option}
					{@const IconComponent = option.icon}
					<button
						class="btn {roleFilter === option.id
							? 'btn-primary'
							: 'btn-secondary'} btn-sm flex items-center gap-2"
						onclick={() => selectRoleFilter(option.id)}
						aria-label={option.label}
					>
						{#if roleFilter === option.id}
							<IconCheck class="h-4 w-4" />
						{:else}
							<IconComponent class="h-4 w-4" />
						{/if}
						<span>{option.label}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Desktop: Status Filter Buttons -->
		<div class="mt-4 hidden sm:block">
			<div class="flex flex-col gap-3 sm:flex-row">
				{#each statusFilterOptions as option}
					{@const IconComponent = option.icon}
					<button
						class="btn btn-sm flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-3xl py-4 text-center transition-all duration-200 {statusFilter ===
						option.id
							? 'text-primary bg-primary/10 border-primary/30 border'
							: 'bg-base-100/40 hover:bg-base-100/60 text-base-content/70'}"
						onclick={() => selectStatusFilter(option.id)}
						aria-label={option.label}
					>
						<IconComponent class="h-5 w-5 {statusFilter === option.id ? 'text-primary' : ''}" />
						<span class="font-medium">{option.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Loading State -->
	{#if $contractStore.isLoading}
		<div class="flex justify-center py-12">
			<div class="flex items-center gap-3">
				<span class="loading loading-spinner loading-md"></span>
				<span>{$t('dashboard.contracts.loading')}</span>
			</div>
		</div>
	{/if}

	<!-- Error State -->
	{#if $contractStore.error}
		<div class="alert alert-outline alert-error">
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
			<div>
				<h3 class="font-bold">{$t('dashboard.contracts.error_title')}</h3>
				<div class="text-xs">{$contractStore.error}</div>
			</div>
			<button class="btn btn-sm btn-outline" onclick={() => contractStore.loadContracts()}>
				{$t('dashboard.contracts.retry')}
			</button>
		</div>
	{/if}

		<!-- Contracts List -->
	{#if !$contractStore.isLoading && !$contractStore.error}
		{#if filteredContracts.length === 0}
			<div class="py-12 text-center">
				<div class="mb-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/30 mx-auto h-12 w-12"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
				</div>
				<h3 class="mb-2 text-lg font-semibold">
					{$contractStore.contracts.length === 0
						? $t('dashboard.contracts.no_contracts')
						: $t('dashboard.contracts.no_filtered_contracts')}
				</h3>
				<p class="text-base-content/70">
					{$contractStore.contracts.length === 0
						? $t('dashboard.contracts.no_contracts_description')
						: $t('dashboard.contracts.try_different_filters')}
				</p>
			</div>
		{:else}
			{#each filteredContracts as contract (contract.escrowData?.id ?? contract.contractEvent.content.escrowId)}
				<ContractCard {contract} {btcPrice} />
			{/each}

			<!-- Loading more indicator -->
			{#if $contractStore.isLoadingMore}
				<div class="flex justify-center">
					<div class="flex items-center gap-3">
						<span class="loading loading-spinner loading-md"></span>
						<span class="text-base-content/70">{$t('dashboard.contracts.loading_more')}</span>
					</div>
				</div>
			{/if}

			<!-- End of list indicator -->
			{#if !$contractStore.hasMore && filteredContracts.length > 0}
				<div class="text-center">
					<p class="text-base-content/50 text-sm">
						{$t('dashboard.contracts.no_more_contracts')}
					</p>
				</div>
			{/if}
		{/if}
	{/if}

	<!-- Infinite Scroll Component -->
	<InfiniteScroll />
</div>

<!-- Contract Drawer - DO Not wrap in a condition for animation to work -->
<ContractDrawer {btcPrice} />

<!-- Portal target for confirmation modals - outside drawer context -->
<div use:createPortal={'modals'} style="position: relative; z-index: 9999;"></div>
