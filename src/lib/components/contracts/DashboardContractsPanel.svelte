<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import type { ContractWithEvents } from '$lib/types/contract';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { createPortal } from '$lib/utils/portal';
	import { EscrowStatus } from '$lib/utils/escrow';
	import { contractStore } from '$lib/stores/contract.store';
	import { tasksStore, myTasksStore } from '$lib/stores/task.store';
	import { reconcileTaskStatusWithContracts } from '$lib/utils/helpers/task-status-reconciliation';
	import { scroll } from '$lib/stores/infiniteScroll.store';
	import ContractCard from './ContractCard.svelte';
	import ContractDrawer from './ContractDrawer.svelte';
	import InfiniteScroll from '$lib/components/InfiniteScroll.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { findMyServices } from '$lib/nostr/findServices';
	import ServiceFilterSelect from '$lib/components/service/ServiceFilterSelect.svelte';
	import { parseServiceAddress } from '$lib/utils/service-quote/protocol';

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
	import IconLayersTripleOutline from '~icons/mdi/layers-triple-outline';
	import IconClipboardTextOutline from '~icons/mdi/clipboard-text-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';

	const {
		initialContext = 'all',
		showRoleFilters = true,
		fixedRole = 'all',
		emptyStateActionLabel = null,
		emptyStateActionHref = null,
		emptyStateActionIcon = null,
		showServiceFilter = false,
		selectedServiceAddress = null,
		onServiceFilterChange,
		onClearFilters,
		highlightEscrowId = null,
		onHighlightConsumed,
		onHighlightMissing
	} = $props<{
		initialContext?: 'all' | 'tasks' | 'services';
		showRoleFilters?: boolean;
		fixedRole?: 'all' | 'client' | 'freelancer';
		emptyStateActionLabel?: string | null;
		emptyStateActionHref?: string | null;
		emptyStateActionIcon?: typeof IconWalletOutline | typeof IconRefresh | null;
		showServiceFilter?: boolean;
		selectedServiceAddress?: string | null;
		onServiceFilterChange?: (serviceAddress: string | null) => void;
		onClearFilters?: () => void;
		highlightEscrowId?: string | null;
		onHighlightConsumed?: (escrowId: string) => void;
		onHighlightMissing?: (escrowId: string) => void;
	}>();

	// Filters
	let statusFilter = $state<EscrowStatus | 'all'>('all');
	let roleFilter = $state<string>('all'); // 'all', 'client', 'freelancer'
	let contextFilter = $state<'all' | 'tasks' | 'services'>('all');
	let isStatusDropdownOpen = $state(false);
	let highlightRecoveryAttempted = $state(false);
	let lastHandledHighlight = $state<string | null>(null);
	let highlightRecoveryInFlightFor = $state<string | null>(null);
	const warnedUnknownContextEscrowIds = new SvelteSet<string>();

	let btcPrice = $state<number>(0);
	let services = $state<Service[]>([]);
	const isOffline = $derived(!$browserNetworkStatus.online);
	const highlightRecoveryPending = $derived(
		Boolean(highlightEscrowId) && highlightRecoveryInFlightFor === highlightEscrowId
	);
	const hasCachedContracts = $derived($contractStore.contracts.length > 0);
	const showBlockingLoadingState = $derived($contractStore.isLoading && !hasCachedContracts);
	const showBlockingErrorState = $derived(Boolean($contractStore.error) && !hasCachedContracts);
	const isPasskeyLoadError = $derived.by(
		() =>
			Boolean($contractStore.error) && detectErrorType($contractStore.error ?? '') === 'biometric'
	);

	function tr(key: string, fallback: string): string {
		const value = $t(key);
		return typeof value === 'string' && value !== key ? value : fallback;
	}

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

		if (fixedRole === 'client') {
			filtered = filtered.filter((c) => c.isClient);
		} else if (fixedRole === 'freelancer') {
			filtered = filtered.filter((c) => !c.isClient);
		}

		// Filter by status (using unified status enum)
		if (statusFilter !== 'all') {
			filtered = filtered.filter((c) => c.status === statusFilter);
		}

		// Filter by role
		if (showRoleFilters && fixedRole === 'all' && roleFilter === 'client') {
			filtered = filtered.filter((c) => c.isClient);
		} else if (showRoleFilters && fixedRole === 'all' && roleFilter === 'freelancer') {
			filtered = filtered.filter((c) => !c.isClient);
		}

		if (contextFilter === 'tasks') {
			filtered = filtered.filter((contract) => {
				const contextType = contract.contractEvent.content.contextType;
				return contextType == null || contextType === 'task';
			});
		} else if (contextFilter === 'services') {
			filtered = filtered.filter(
				(contract) => contract.contractEvent.content.contextType === 'service'
			);
		}

		if (selectedServiceAddress && contextFilter === 'services') {
			filtered = filtered.filter((contract) => contractMatchesSelectedService(contract));
		}

		return filtered;
	});

	const contextFilterOptions = $derived([
		{
			id: 'all' as const,
			label: tr('dashboard.contracts.context_filters.all', 'All'),
			icon: IconLayersTripleOutline
		},
		{
			id: 'tasks' as const,
			label: tr('dashboard.contracts.context_filters.tasks', 'Tasks'),
			icon: IconClipboardTextOutline
		},
		{
			id: 'services' as const,
			label: tr('dashboard.contracts.context_filters.services', 'Services'),
			icon: IconBriefcaseOutline
		}
	]);

	// Load contracts on mount
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Set fallback price to 0 so UI shows RBTC amount instead
			btcPrice = 0;
		}
	}

	async function loadServices(): Promise<void> {
		if (!showServiceFilter) {
			services = [];
			return;
		}

		try {
			const result = await findMyServices({ limit: 100 });
			services = result.services;
		} catch (error) {
			console.error('Failed to load services for contracts filter:', error);
			services = [];
		}
	}

	function getSelectedServiceStableId(): string | null {
		if (!selectedServiceAddress) {
			return null;
		}

		try {
			return parseServiceAddress(selectedServiceAddress).dTag;
		} catch {
			return null;
		}
	}

	function contractMatchesSelectedService(contract: ContractWithEvents): boolean {
		const content = contract.contractEvent.content as Record<string, unknown>;
		const contractServiceAddress =
			typeof content.serviceAddress === 'string' ? content.serviceAddress : null;
		if (contractServiceAddress && contractServiceAddress === selectedServiceAddress) {
			return true;
		}

		const selectedServiceStableId = getSelectedServiceStableId();
		if (!selectedServiceStableId) {
			return false;
		}

		const contractServiceStableId =
			(typeof content.serviceId === 'string' && content.serviceId) ||
			(typeof content.contextId === 'string' && content.contextId) ||
			(() => {
				if (!contractServiceAddress) {
					return null;
				}
				try {
					return parseServiceAddress(contractServiceAddress).dTag;
				} catch {
					return null;
				}
			})();

		return contractServiceStableId === selectedServiceStableId;
	}

	function getTaskStatusFromStores(taskId: string): string | undefined {
		const tasks = get(tasksStore).items;
		const myTasks = get(myTasksStore).items;
		const task = tasks.find((t) => t.id === taskId) ?? myTasks.find((t) => t.id === taskId);
		return task?.status;
	}

	async function runTaskStatusReconciliation(): Promise<void> {
		const contracts = get(contractStore).contracts;
		// Only reconcile contracts where current user is the Tasker (client).
		// The task event is owned by the Tasker; only they can call updateTask.
		// Running reconciliation on Taskee contracts causes "Task author mismatch" errors.
		const taskerContracts = contracts.filter(
			(c) => c.isClient && (c.contractEvent.content.contextType ?? 'task') === 'task'
		);
		if (taskerContracts.length === 0) return;
		await reconcileTaskStatusWithContracts(taskerContracts, getTaskStatusFromStores);
	}

	async function refreshContracts(): Promise<void> {
		if (isOffline) {
			return;
		}
		await contractStore.loadContracts();
		await runTaskStatusReconciliation();
	}

	onMount(async () => {
		contextFilter = initialContext;

		// Ensure wallet is initialized BEFORE loading contracts
		try {
			const { walletStore, walletManager } = await import('$lib/stores/wallet.store');
			const { get } = await import('svelte/store');
			let walletState = get(walletStore);

			// Wait for wallet initialization if not already initialized
			if (!walletState.isConnected || !walletState.rsk?.wallet || !walletState.rsk?.provider) {
				await walletManager.initialize();
				walletState = get(walletStore);
			}
		} catch {
			// Continue anyway - contracts will handle wallet initialization individually
		}

		await Promise.all([contractStore.loadContracts(), fetchBtcPrice(), loadServices()]);

		// Self-heal: sync Nostr task status for FundsReleased contracts (docs/tasks/task-status.md)
		runTaskStatusReconciliation();

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

	function selectContextFilter(next: 'all' | 'tasks' | 'services') {
		contextFilter = next;
	}

	function toggleStatusDropdown() {
		isStatusDropdownOpen = !isStatusDropdownOpen;
	}

	function clearFilters() {
		statusFilter = 'all';
		roleFilter = 'all';
		contextFilter = 'all';
		onServiceFilterChange?.(null);
		onClearFilters?.();
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

	$effect(() => {
		for (const contract of $contractStore.contracts) {
			const contextType = contract.contractEvent.content.contextType;
			if (contextType === 'task' || contextType === 'service' || contextType == null) {
				continue;
			}

			const escrowId =
				contract.escrowData?.id ??
				contract.contractEvent.content.escrowId ??
				contract.contractEvent.id;
			if (warnedUnknownContextEscrowIds.has(escrowId)) {
				continue;
			}

			warnedUnknownContextEscrowIds.add(escrowId);
			console.warn('Unknown contract context encountered; leaving contract read-only.', {
				escrowId,
				contextType
			});
		}
	});

	$effect(() => {
		if (!highlightEscrowId || !$contractStore.contracts.length) {
			highlightRecoveryAttempted = false;
			highlightRecoveryInFlightFor = null;
			lastHandledHighlight = null;
			return;
		}
		if (lastHandledHighlight === highlightEscrowId) {
			return;
		}
		if (highlightRecoveryInFlightFor === highlightEscrowId) {
			return;
		}

		const matchingContract = filteredContracts.find(
			(contract) =>
				(contract.escrowData?.id ?? contract.contractEvent.content.escrowId) === highlightEscrowId
		);

		if (matchingContract) {
			void (async () => {
				await tick();
				const element = document.querySelector<HTMLElement>(
					`[data-contract-escrow-id="${highlightEscrowId}"]`
				);
				element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
				lastHandledHighlight = highlightEscrowId;
				onHighlightConsumed?.(highlightEscrowId);
			})();
			return;
		}

		if (!highlightRecoveryAttempted) {
			highlightRecoveryAttempted = true;
			highlightRecoveryInFlightFor = highlightEscrowId;
			void (async () => {
				const recovered = await contractStore.loadContractByEscrowId(highlightEscrowId);
				highlightRecoveryInFlightFor = null;
				if (!recovered) {
					lastHandledHighlight = highlightEscrowId;
					onHighlightMissing?.(highlightEscrowId);
				}
			})();
			return;
		}

		lastHandledHighlight = highlightEscrowId;
		onHighlightMissing?.(highlightEscrowId);
	});
</script>

<div class="space-y-6">
	<!-- Filters container with same design as TasksPanel -->
	<div class="border-base-300/60 bg-base-100/40 mt-2 rounded-3xl border p-4 shadow-sm">
		<!-- Header with refresh button and top-level filters -->
		<div class="mb-3 flex items-center justify-between gap-2">
			<div class="flex flex-wrap gap-2">
				{#if showRoleFilters}
					{#each roleFilterOptions as option (option.id)}
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
				{/if}

				{#each contextFilterOptions as option (option.id)}
					{@const IconComponent = option.icon}
					<button
						class="btn btn-sm flex items-center gap-2 {contextFilter === option.id
							? 'btn-primary'
							: 'btn-secondary'}"
						onclick={() => selectContextFilter(option.id)}
					>
						<IconComponent class="h-4 w-4" />
						<span>{option.label}</span>
					</button>
				{/each}
			</div>

			<!-- Refresh button: icon only on mobile, with text on desktop -->
			<button
				class="btn btn-ghost btn-sm sm:btn-outline gap-2"
				onclick={() => refreshContracts()}
				disabled={$contractStore.isLoading || isOffline || highlightRecoveryPending}
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

		{#if showServiceFilter && (contextFilter === 'services' || selectedServiceAddress)}
			<div class="mb-4">
				<ServiceFilterSelect
					{services}
					{selectedServiceAddress}
					filterLabel={tr('dashboard.contracts.filter_by_service', 'Filter by service')}
					allServicesLabel={tr('dashboard.contracts.all_services', 'All Services')}
					deletedServiceLabel={tr(
						'dashboard.services.my_services.quote_inbox.deleted_service_prefix',
						'Deleted service'
					)}
					testId="contracts-service-filter"
					onChange={(serviceAddress) => onServiceFilterChange?.(serviceAddress)}
				/>
			</div>
		{/if}

		<!-- Mobile: Status Filter Dropdown -->
		<div class="status-dropdown-container relative mt-4 sm:hidden">
			<button
				class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
				onclick={toggleStatusDropdown}
				aria-expanded={isStatusDropdownOpen}
				aria-haspopup="true"
				aria-controls="status-dropdown-menu"
				aria-label={$t('dashboard.contracts.filter_by_status')}
			>
				<div class="flex items-center gap-2">
					{#each statusFilterOptions as option (String(option.id))}
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
					{#each statusFilterOptions as option (String(option.id))}
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

		<!-- Desktop: Status Filter Buttons -->
		<div class="mt-4 hidden sm:block">
			<div class="flex flex-col gap-3 sm:flex-row">
				{#each statusFilterOptions as option (String(option.id))}
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
	{#if showBlockingLoadingState}
		<div class="flex justify-center py-12">
			<div class="flex items-center gap-3">
				<span class="loading loading-spinner loading-md"></span>
				<span>{$t('dashboard.contracts.loading')}</span>
			</div>
		</div>
	{/if}

	<!-- Error State -->
	{#if showBlockingErrorState}
		{#if isPasskeyLoadError}
			<ErrorAlertWithModal
				error={$contractStore.error ?? ''}
				isPasskeyError
				autoOpenModal={false}
				onRetry={() => refreshContracts()}
				class="w-full"
			/>
		{:else}
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
				<button class="btn btn-sm btn-outline" onclick={() => refreshContracts()}>
					{$t('dashboard.contracts.retry')}
				</button>
			</div>
		{/if}
	{/if}

	<!-- Contracts List -->
	{#if !showBlockingLoadingState && !showBlockingErrorState}
		{#if filteredContracts.length === 0}
			<div class="card bg-base-100 rounded-xl p-4">
				<DashboardEmptyState
					icon={IconFileDocumentOutline}
					title={$contractStore.contracts.length === 0
						? $t('dashboard.contracts.no_contracts')
						: $t('dashboard.contracts.no_filtered_contracts')}
					description={$contractStore.contracts.length === 0
						? $t('dashboard.contracts.no_contracts_description')
						: $t('dashboard.contracts.try_different_filters')}
					actionLabel={$contractStore.contracts.length === 0
						? (emptyStateActionLabel ?? $t('dashboard.manage_wallet'))
						: $t('dashboard.contracts.clear_filters')}
					actionIcon={$contractStore.contracts.length === 0
						? (emptyStateActionIcon ?? IconWalletOutline)
						: IconRefresh}
					actionHref={$contractStore.contracts.length === 0 ? emptyStateActionHref : null}
					onAction={() => {
						if ($contractStore.contracts.length === 0) {
							if (!emptyStateActionHref) {
								void goto('/dashboard/wallet');
							}
							return;
						}
						clearFilters();
					}}
					testId="dashboard-contracts-empty-state"
				/>
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
