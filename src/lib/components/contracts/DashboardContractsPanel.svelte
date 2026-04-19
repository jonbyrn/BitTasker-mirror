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
	import { getStatusTranslationKey } from '$lib/utils/helpers/contractStatusFormatter';
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
	import IconCancel from '~icons/mdi/cancel';
	import IconRefresh from '~icons/mdi/refresh';
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
	import DashboardFilterBar from '$lib/components/shared/DashboardFilterBar.svelte';
	import DashboardDropdown from '$lib/components/shared/DashboardDropdown.svelte';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';

	const {
		initialType = 'all',
		initialStatus = 'all',
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
		initialType?: 'all' | 'tasks' | 'services';
		initialStatus?: EscrowStatus | 'all';
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
	let typeFilter = $state<'all' | 'tasks' | 'services'>('all');

	$effect(() => {
		if (initialStatus) {
			statusFilter = initialStatus;
		}
	});

	$effect(() => {
		if (initialType) {
			typeFilter = initialType;
		}
	});

	$effect(() => {
		if (fixedRole) {
			roleFilter = fixedRole;
		}
	});

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

	const isFilterActive = $derived(
		statusFilter !== 'all' ||
			typeFilter !== 'all' ||
			(roleFilter !== 'all' && roleFilter !== fixedRole) ||
			selectedServiceAddress !== null
	);

	function tr(key: string, fallback: string): string {
		const value = $t(key);
		return typeof value === 'string' && value !== key ? value : fallback;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const STATUS_FILTER_ORDER: EscrowStatus[] = [
		EscrowStatus.PendingFunding,
		EscrowStatus.Funded,
		EscrowStatus.InProgress,
		EscrowStatus.PendingCompletion,
		EscrowStatus.Completed,
		EscrowStatus.PendingAcceptance,
		EscrowStatus.FundsReleased,
		EscrowStatus.PendingDispute,
		EscrowStatus.InDispute,
		EscrowStatus.PendingResolutionProposal,
		EscrowStatus.DisputeResolutionProposed,
		EscrowStatus.PendingProposalAcceptance,
		EscrowStatus.DisputeResolved,
		EscrowStatus.PendingTimelockResolution,
		EscrowStatus.DisputeUnresolved,
		EscrowStatus.PendingCancellation,
		EscrowStatus.Cancelled
	];

	function getStatusFallbackLabel(status: EscrowStatus): string {
		switch (status) {
			case EscrowStatus.PendingFunding:
				return 'Pending Funding';
			case EscrowStatus.Funded:
				return 'Funded';
			case EscrowStatus.InProgress:
				return 'In Progress';
			case EscrowStatus.PendingCompletion:
				return 'Pending Completion';
			case EscrowStatus.Completed:
				return 'Completed';
			case EscrowStatus.PendingAcceptance:
				return 'Pending Acceptance';
			case EscrowStatus.FundsReleased:
				return 'Funds Released';
			case EscrowStatus.PendingDispute:
				return 'Pending Dispute';
			case EscrowStatus.InDispute:
				return 'In Dispute';
			case EscrowStatus.DisputeResolutionProposed:
				return 'Dispute Resolution Proposed';
			case EscrowStatus.PendingResolutionProposal:
				return 'Pending Resolution Proposal';
			case EscrowStatus.PendingProposalAcceptance:
				return 'Pending Proposal Acceptance';
			case EscrowStatus.DisputeResolved:
				return 'Dispute Resolved';
			case EscrowStatus.PendingTimelockResolution:
				return 'Pending Timelock Resolution';
			case EscrowStatus.DisputeUnresolved:
				return 'Dispute Unresolved';
			case EscrowStatus.PendingCancellation:
				return 'Pending Cancellation';
			case EscrowStatus.Cancelled:
				return 'Cancelled';
		}

		return 'Unknown Status';
	}

	function getStatusFilterLabel(status: EscrowStatus): string {
		return tr(getStatusTranslationKey(status), getStatusFallbackLabel(status));
	}

	function getStatusFilterIcon(status: EscrowStatus | 'all') {
		switch (status) {
			case 'all':
				return IconCheckAll;
			case EscrowStatus.PendingFunding:
			case EscrowStatus.Funded:
				return IconLightningBolt;
			case EscrowStatus.InProgress:
				return IconBriefcaseOutline;
			case EscrowStatus.PendingCompletion:
			case EscrowStatus.Completed:
			case EscrowStatus.PendingAcceptance:
			case EscrowStatus.FundsReleased:
			case EscrowStatus.PendingProposalAcceptance:
			case EscrowStatus.DisputeResolved:
				return IconCheckCircle;
			case EscrowStatus.PendingDispute:
			case EscrowStatus.InDispute:
			case EscrowStatus.DisputeResolutionProposed:
			case EscrowStatus.PendingResolutionProposal:
			case EscrowStatus.PendingTimelockResolution:
			case EscrowStatus.DisputeUnresolved:
				return IconAlertCircleOutline;
			case EscrowStatus.PendingCancellation:
			case EscrowStatus.Cancelled:
				return IconCancel;
		}

		return IconCheckAll;
	}

	// Role filter options
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

	function applyNonStatusFilters(contracts: ContractWithEvents[]): ContractWithEvents[] {
		let filtered = contracts;

		if (fixedRole === 'client') {
			filtered = filtered.filter((c) => c.isClient);
		} else if (fixedRole === 'freelancer') {
			filtered = filtered.filter((c) => !c.isClient);
		}

		// Filter by role
		if (showRoleFilters && fixedRole === 'all' && roleFilter === 'client') {
			filtered = filtered.filter((c) => c.isClient);
		} else if (showRoleFilters && fixedRole === 'all' && roleFilter === 'freelancer') {
			filtered = filtered.filter((c) => !c.isClient);
		}

		if (typeFilter === 'tasks') {
			filtered = filtered.filter((contract) => {
				const contextType = contract.contractEvent.content.contextType;
				return contextType == null || contextType === 'task';
			});
		} else if (typeFilter === 'services') {
			filtered = filtered.filter(
				(contract) => contract.contractEvent.content.contextType === 'service'
			);
		}

		if (selectedServiceAddress && typeFilter === 'services') {
			filtered = filtered.filter((contract) => contractMatchesSelectedService(contract));
		}

		return filtered;
	}

	const contractsMatchingNonStatusFilters = $derived.by(() =>
		applyNonStatusFilters($contractStore.contracts)
	);

	const statusFilterOptions = $derived([
		{
			id: 'all' as const,
			label: $t('dashboard.contracts.all_statuses'),
			icon: IconCheckAll
		},
		{
			id: EscrowStatus.PendingFunding,
			label: getStatusFilterLabel(EscrowStatus.PendingFunding),
			icon: getStatusFilterIcon(EscrowStatus.PendingFunding)
		},
		{
			id: EscrowStatus.Funded,
			label: getStatusFilterLabel(EscrowStatus.Funded),
			icon: getStatusFilterIcon(EscrowStatus.Funded)
		},
		{
			id: EscrowStatus.InProgress,
			label: getStatusFilterLabel(EscrowStatus.InProgress),
			icon: getStatusFilterIcon(EscrowStatus.InProgress)
		},
		{
			id: EscrowStatus.Completed,
			label: getStatusFilterLabel(EscrowStatus.Completed),
			icon: getStatusFilterIcon(EscrowStatus.Completed)
		},
		{
			id: EscrowStatus.InDispute,
			label: getStatusFilterLabel(EscrowStatus.InDispute),
			icon: getStatusFilterIcon(EscrowStatus.InDispute)
		},
		{
			id: EscrowStatus.Cancelled,
			label: getStatusFilterLabel(EscrowStatus.Cancelled),
			icon: getStatusFilterIcon(EscrowStatus.Cancelled)
		}
	]);

	const filteredContracts = $derived.by(() => {
		if (statusFilter === 'all') {
			return contractsMatchingNonStatusFilters;
		}

		return contractsMatchingNonStatusFilters.filter((contract) => contract.status === statusFilter);
	});

	const typeFilterOptions = $derived([
		{
			id: 'all' as const,
			label: tr('dashboard.contracts.context_filters.all', 'All Types'),
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
		typeFilter = initialType;

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

	$effect(() => {
		if (
			statusFilter !== 'all' &&
			!statusFilterOptions.some((option) => option.id === statusFilter)
		) {
			statusFilter = 'all';
		}
	});

	onDestroy(() => {
		// Cleanup subscriptions when leaving contracts panel
		contractStore.unsubscribeFromStatusUpdates();
		contractStore.unsubscribeFromNewContracts();
	});

	function handleFilterChange(updates: {
		status?: EscrowStatus | 'all';
		type?: 'all' | 'tasks' | 'services';
		role?: 'all' | 'client' | 'freelancer';
	}) {
		if (updates.status !== undefined) statusFilter = updates.status;
		if (updates.type !== undefined) typeFilter = updates.type;
		if (updates.role !== undefined) roleFilter = updates.role;

		const nextUrl = createDashboardUrl(new URL(window.location.href), {
			tab: 'contracts',
			status: statusFilter === 'all' ? null : statusFilter,
			type: typeFilter,
			role: roleFilter as unknown as string
		});
		void goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function clearFilters() {
		statusFilter = 'all';
		roleFilter = fixedRole;
		typeFilter = 'all';
		onServiceFilterChange?.(null);
		onClearFilters?.();

		const nextUrl = createDashboardUrl(new URL(window.location.href), {
			tab: 'contracts',
			status: null,
			type: 'all',
			role: fixedRole as unknown as string
		});
		void goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

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

<div class="space-y-4">
	<DashboardFilterBar
		onRefresh={() => refreshContracts()}
		isRefreshing={$contractStore.isLoading}
		refreshDisabled={isOffline || highlightRecoveryPending}
	>
		<DashboardDropdown
			options={typeFilterOptions}
			value={typeFilter}
			onSelect={(val) => handleFilterChange({ type: val })}
			containerClass="sm:w-48"
		/>

		<DashboardDropdown
			options={statusFilterOptions}
			value={statusFilter}
			onSelect={(val) => handleFilterChange({ status: val })}
			containerClass="sm:w-64"
		/>

		{#if showServiceFilter && (typeFilter === 'services' || selectedServiceAddress)}
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
				containerClass="col-span-2 sm:w-64"
				onChange={(serviceAddress) => onServiceFilterChange?.(serviceAddress)}
			/>
		{/if}
	</DashboardFilterBar>

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
					title={!isFilterActive
						? $t('dashboard.contracts.no_contracts')
						: $t('dashboard.contracts.no_filtered_contracts')}
					description={!isFilterActive ? '' : $t('dashboard.contracts.try_different_filters')}
					actionLabel={!isFilterActive
						? (emptyStateActionLabel ?? $t('dashboard.create_task'))
						: $t('dashboard.contracts.clear_filters')}
					actionIcon={!isFilterActive
						? (emptyStateActionIcon ?? IconBriefcaseOutline)
						: IconRefresh}
					actionHref={!isFilterActive ? (emptyStateActionHref ?? '/dashboard/create-task') : null}
					onAction={() => {
						if (!isFilterActive) {
							if (!emptyStateActionHref) {
								void goto('/dashboard/create-task');
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
