<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import { t } from 'svelte-i18n';
	import DashboardQuoteCard from './DashboardQuoteCard.svelte';
	import ServiceRequestDrawer from './ServiceRequestDrawer.svelte';
	import { findServiceByUniqueId } from '$lib/nostr/service';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import type { Service } from '$lib/types/service';
	import { getTaskerDataFreshness, serviceQuoteUiStore } from '$lib/stores/service-quote-ui.store';
	import { parseServiceAddress } from '$lib/utils/service-quote/protocol';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconCheck from '~icons/mdi/check';
	import IconCheckCircleOutline from '~icons/mdi/check-circle-outline';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconCloseCircleOutline from '~icons/mdi/close-circle-outline';
	import IconRefresh from '~icons/mdi/refresh';
	import IconTimerSand from '~icons/mdi/timer-sand';
	import IconUndoVariant from '~icons/mdi/undo-variant';

	let {
		timelines = [],
		focusedRequestId = null,
		isSyncing = false,
		hasLoaded = true,
		loadError = null,
		onRetry,
		onRequestFocusChange,
		onInvalidFocusedRequest
	}: {
		timelines?: ServiceQuoteTimelineEntry[];
		focusedRequestId?: string | null;
		isSyncing?: boolean;
		hasLoaded?: boolean;
		loadError?: string | null;
		onRetry?: (() => void | Promise<void>) | undefined;
		onRequestFocusChange?: (requestId: string | null) => void;
		onInvalidFocusedRequest?: () => void;
	} = $props();

	interface ActionButton {
		label: string;
		class: string;
		onclick: (e: MouseEvent) => void;
		icon: string;
		disabled?: boolean;
	}

	type EmptyStateIcon = Component<{ class?: string; 'aria-hidden'?: string }>;

	type ServiceRequestFilterCategory =
		| 'awaiting_proposal'
		| 'contract_created'
		| 'declined'
		| 'withdrawn'
		| 'expired';

	let actionPending = $state<'accept' | 'decline' | null>(null);
	let activeFilter = $state<ServiceRequestFilterCategory>('awaiting_proposal');
	let hasUserSelectedFilter = $state(false);
	let deletePendingRequestId = $state<string | null>(null);
	let deleteModalTimeline = $state<ServiceQuoteTimelineEntry | null>(null);
	let deleteError = $state<string | null>(null);
	let isDropdownOpen = $state(false);
	let requestDrawerTimeline = $state<ServiceQuoteTimelineEntry | null>(null);
	let serviceByAddress = $state<Record<string, Service | null>>({});
	let serviceLoadedByAddress = $state<Record<string, boolean>>({});
	let serviceUnavailableByAddress = $state<Record<string, boolean>>({});
	const briefcaseEmptyStateIcon = IconBriefcaseOutline as unknown as EmptyStateIcon;
	const refreshEmptyStateIcon = IconRefresh as unknown as EmptyStateIcon;

	function translateOrFallback(key: string, fallback: string): string {
		try {
			const translated = $t(key);
			return translated === key ? fallback : translated;
		} catch {
			return fallback;
		}
	}

	const selectedTimeline = $derived.by(() => {
		if (focusedRequestId) {
			return (
				timelines.find(
					(timeline) => timeline.request.content.quoteRequestId === focusedRequestId
				) ?? null
			);
		}
		return timelines[0] ?? null;
	});

	function getTimelineFilterCategory(
		timeline: Pick<
			ServiceQuoteTimelineEntry,
			'resolvedStatus' | 'latestProposal' | 'linkedEscrowId'
		>
	): ServiceRequestFilterCategory {
		if (timeline.linkedEscrowId || timeline.resolvedStatus === 'accepted') {
			return 'contract_created';
		}

		switch (timeline.resolvedStatus) {
			case 'declined':
				return 'declined';
			case 'withdrawn':
				return 'withdrawn';
			case 'expired':
				return 'expired';
			default:
				return 'awaiting_proposal';
		}
	}

	const filterOptions = $derived.by(() => [
		{
			id: 'awaiting_proposal' as const,
			label: translateOrFallback(
				'dashboard.service_requests.filters.awaiting_proposal',
				'Awaiting proposal'
			),
			icon: IconClockOutline
		},
		{
			id: 'contract_created' as const,
			label: translateOrFallback(
				'dashboard.service_requests.filters.contract_created',
				'Contract created'
			),
			icon: IconCheckCircleOutline
		},
		{
			id: 'declined' as const,
			label: translateOrFallback('dashboard.service_requests.filters.declined', 'Declined'),
			icon: IconCloseCircleOutline
		},
		{
			id: 'withdrawn' as const,
			label: translateOrFallback('dashboard.service_requests.filters.withdrawn', 'Withdrawn'),
			icon: IconUndoVariant
		},
		{
			id: 'expired' as const,
			label: translateOrFallback('dashboard.service_requests.filters.expired', 'Expired'),
			icon: IconTimerSand
		}
	]);

	const filteredTimelines = $derived.by(() =>
		timelines.filter((timeline) => getTimelineFilterCategory(timeline) === activeFilter)
	);

	function getPreferredFilter(): ServiceRequestFilterCategory {
		const focusedTimelineEntry =
			(focusedRequestId
				? timelines.find((timeline) => timeline.request.content.quoteRequestId === focusedRequestId)
				: null) ?? selectedTimeline;

		if (focusedTimelineEntry) {
			return getTimelineFilterCategory(focusedTimelineEntry);
		}

		return (
			filterOptions.find((option) =>
				timelines.some((timeline) => getTimelineFilterCategory(timeline) === option.id)
			)?.id ?? 'awaiting_proposal'
		);
	}

	$effect(() => {
		if (!hasUserSelectedFilter && timelines.length > 0) {
			activeFilter = getPreferredFilter();
		}
	});

	$effect(() => {
		if (focusedRequestId && !selectedTimeline && !isSyncing && hasLoaded) {
			onInvalidFocusedRequest?.();
		}
	});

	const isOffline = $derived(!$browserNetworkStatus.online);
	const showReconnectNotice = $derived(
		$browserNetworkStatus.online && $browserNetworkStatus.lastTransition === 'online'
	);
	const taskerDataFreshness = $derived(getTaskerDataFreshness($serviceQuoteUiStore));
	const taskerDataIsStale = $derived(taskerDataFreshness === 'stale');
	const taskerDataIsPartial = $derived(taskerDataFreshness === 'partial');
	const showPartialSyncAlert = $derived(
		taskerDataIsPartial ||
			(Boolean(focusedRequestId) && hasLoaded && isSyncing && !selectedTimeline)
	);
	const selectedTimelineServiceUnavailable = $derived(
		selectedTimeline
			? serviceUnavailableByAddress[selectedTimeline.request.content.serviceAddress] === true
			: false
	);
	const actionsUnavailable = $derived(
		isSyncing ||
			Boolean(loadError) ||
			isOffline ||
			taskerDataIsStale ||
			showPartialSyncAlert ||
			selectedTimelineServiceUnavailable
	);
	const deleteUnavailable = $derived(
		isSyncing || Boolean(loadError) || isOffline || taskerDataIsStale || showPartialSyncAlert
	);

	function selectFilter(nextFilter: ServiceRequestFilterCategory) {
		activeFilter = nextFilter;
		hasUserSelectedFilter = true;
		isDropdownOpen = false;
	}

	function clearFilters() {
		hasUserSelectedFilter = false;
		activeFilter = getPreferredFilter();
		isDropdownOpen = false;
	}

	function toggleDropdown() {
		isDropdownOpen = !isDropdownOpen;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const dropdownContainer = target.closest('.status-dropdown-container');
		if (!dropdownContainer && isDropdownOpen) {
			isDropdownOpen = false;
		}
	}

	async function handleRefresh() {
		await onRetry?.();
	}

	$effect(() => {
		const serviceAddresses = [
			...new Set(timelines.map((timeline) => timeline.request.content.serviceAddress))
		];
		let cancelled = false;

		if (serviceAddresses.length === 0) {
			serviceByAddress = {};
			serviceLoadedByAddress = {};
			serviceUnavailableByAddress = {};
			return;
		}

		void (async () => {
			const entries = await Promise.all(
				serviceAddresses.map(async (serviceAddress) => {
					try {
						const { dTag } = parseServiceAddress(serviceAddress);
						const service = await findServiceByUniqueId(dTag);
						return [serviceAddress, service] as const;
					} catch {
						return [serviceAddress, null] as const;
					}
				})
			);

			if (!cancelled) {
				serviceByAddress = Object.fromEntries(entries);
				serviceLoadedByAddress = Object.fromEntries(
					entries.map(([serviceAddress]) => [serviceAddress, true] as const)
				);
				serviceUnavailableByAddress = Object.fromEntries(
					entries.map(([serviceAddress, service]) => [serviceAddress, service === null] as const)
				);
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
	function getQuoteActionButtons(timeline: ServiceQuoteTimelineEntry): ActionButton[] {
		const buttons: ActionButton[] = [];

		// Accept button - only if proposal exists and not yet accepted
		if (
			timeline.latestProposal &&
			!timeline.linkedEscrowId &&
			showAcceptActions &&
			serviceUnavailableByAddress[timeline.request.content.serviceAddress] !== true
		) {
			buttons.push({
				label: translateOrFallback('dashboard.service_requests.actions.accept', 'Accept'),
				class: 'btn-success btn-outline btn-sm',
				onclick: (e) => {
					e.stopPropagation();
					selectTimeline(timeline.request.content.quoteRequestId);
					acceptProposal();
				},
				icon: 'accept',
				disabled: actionsUnavailable
			});
		}

		// Decline button - only if proposal exists and not yet accepted
		if (
			timeline.latestProposal &&
			!timeline.linkedEscrowId &&
			showAcceptActions &&
			serviceUnavailableByAddress[timeline.request.content.serviceAddress] !== true
		) {
			buttons.push({
				label: translateOrFallback('dashboard.service_requests.actions.decline', 'Decline'),
				class: 'btn-outline btn-sm',
				onclick: (e) => {
					e.stopPropagation();
					selectTimeline(timeline.request.content.quoteRequestId);
					applyStatus('declined');
				},
				icon: 'decline',
				disabled: actionsUnavailable
			});
		}

		// View Contract button - only if contract exists
		if (timeline.linkedEscrowId) {
			buttons.push({
				label: translateOrFallback(
					'dashboard.service_requests.actions.view_contract',
					'View Contract'
				),
				class: 'btn-outline btn-sm',
				onclick: (e) => {
					e.stopPropagation();
					const escrowId = timeline.linkedEscrowId;
					if (!escrowId) return;
					viewContract(escrowId);
				},
				icon: 'contract'
			});
		}

		if (!timeline.linkedEscrowId) {
			buttons.push({
				label: translateOrFallback('dashboard.service_requests.actions.delete', 'Delete'),
				class: 'btn-error btn-outline btn-sm',
				onclick: (e) => {
					e.stopPropagation();
					deleteError = null;
					deleteModalTimeline = timeline;
				},
				icon: 'delete',
				disabled:
					deleteUnavailable || deletePendingRequestId === timeline.request.content.quoteRequestId
			});
		}

		// View button - always available
		buttons.push({
			label: translateOrFallback('dashboard.service_requests.actions.view', 'View'),
			class: 'btn-primary btn-sm',
			onclick: (e) => {
				e.stopPropagation();
				requestDrawerTimeline = timeline;
				selectTimeline(timeline.request.content.quoteRequestId);
			},
			icon: 'view'
		});

		return buttons;
	}

	function selectTimeline(requestId: string) {
		onRequestFocusChange?.(requestId);
	}

	async function applyStatus(status: 'declined') {
		if (!selectedTimeline?.latestProposal || actionPending || actionsUnavailable) return;
		actionPending = 'decline';
		try {
			await serviceQuoteUiStore.applyTaskerStatus({
				quoteRequestId: selectedTimeline.request.content.quoteRequestId,
				proposalId: selectedTimeline.latestProposal.content.proposalId,
				status
			});
		} finally {
			actionPending = null;
		}
	}

	async function acceptProposal() {
		if (!selectedTimeline?.latestProposal || actionPending || actionsUnavailable) return;
		actionPending = 'accept';
		try {
			await serviceQuoteUiStore.acceptTaskerProposal({
				quoteRequestId: selectedTimeline.request.content.quoteRequestId,
				proposalId: selectedTimeline.latestProposal.content.proposalId
			});
		} finally {
			actionPending = null;
		}
	}

	async function viewContract(escrowId: string) {
		const nextUrl = createDashboardUrl(new URL('/dashboard', window.location.origin), {
			tab: 'contracts',
			context: 'services',
			highlight: escrowId
		});
		await goto(`${nextUrl.pathname}${nextUrl.search}`);
	}

	function closeRequestDrawer() {
		requestDrawerTimeline = null;
	}

	function closeDeleteModal() {
		if (deletePendingRequestId) {
			return;
		}

		deleteError = null;
		deleteModalTimeline = null;
	}

	async function confirmDeleteRequest() {
		if (!deleteModalTimeline || deletePendingRequestId) {
			return;
		}

		deleteError = null;
		deletePendingRequestId = deleteModalTimeline.request.content.quoteRequestId;
		try {
			const result = await serviceQuoteUiStore.deleteTaskerRequest({
				quoteRequestId: deleteModalTimeline.request.content.quoteRequestId
			});

			if (!result.success) {
				deleteError =
					result.error ??
					translateOrFallback(
						'dashboard.service_requests.errors.delete_request',
						'Unable to delete this service request right now.'
					);
				return;
			}

			deleteModalTimeline = null;
		} finally {
			deletePendingRequestId = null;
		}
	}

	const showAcceptActions = $derived.by(() => {
		if (!selectedTimeline?.latestProposal || selectedTimeline.linkedEscrowId) {
			return false;
		}

		return (
			selectedTimeline.resolvedStatus === 'pending' ||
			selectedTimeline.resolvedStatus === 'accept_failed' ||
			selectedTimeline.resolvedStatus === 'accept_unknown'
		);
	});
</script>

<section data-testid="my-quotes-panel" class="space-y-4">
	<div class="border-base-300/60 bg-base-100/40 mt-2 rounded-3xl border p-4 shadow-sm">
		<div class="mb-3 flex items-center justify-between gap-2">
			<div class="space-y-1">
				<p class="text-base-content/70 text-xs font-semibold tracking-wide uppercase">
					{translateOrFallback(
						'dashboard.service_requests.status_heading',
						'Filter by request status'
					)}
				</p>
				<p class="text-base-content/70 hidden text-sm sm:block">
					{translateOrFallback(
						'dashboard.service_requests.status_subheading',
						'Filter the requests you sent to services you want to hire.'
					)}
				</p>
			</div>

			<button
				class="btn btn-ghost btn-sm sm:btn-outline gap-2"
				type="button"
				onclick={handleRefresh}
				disabled={isSyncing || !onRetry}
				aria-label={translateOrFallback('dashboard.service_requests.refresh', 'Refresh')}
			>
				{#if isSyncing}
					<span class="loading loading-spinner loading-xs"></span>
					<span class="hidden sm:inline">
						{translateOrFallback('dashboard.service_requests.refreshing', 'Refreshing')}
					</span>
				{:else}
					<IconRefresh class="h-5 w-5" />
					<span class="hidden sm:inline">
						{translateOrFallback('dashboard.service_requests.refresh', 'Refresh')}
					</span>
				{/if}
			</button>
		</div>

		<div class="mb-3 sm:hidden">
			<p class="text-base-content/70 mb-3 text-sm">
				{translateOrFallback(
					'dashboard.service_requests.status_subheading',
					'Filter the requests you sent to services you want to hire.'
				)}
			</p>
			<div class="status-dropdown-container relative">
				<button
					type="button"
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
					onclick={toggleDropdown}
				>
					<div class="flex items-center gap-2">
						{#each filterOptions as option (option.id)}
							{#if activeFilter === option.id}
								{@const IconComponent = option.icon}
								<IconComponent class="h-5 w-5" />
							{/if}
						{/each}
						<span class="font-medium">
							{filterOptions.find((option) => option.id === activeFilter)?.label}
						</span>
					</div>
					<IconChevronDown
						class="h-5 w-5 transition-transform duration-200 {isDropdownOpen ? 'rotate-180' : ''}"
					/>
				</button>

				{#if isDropdownOpen}
					<div
						class="border-base-300 bg-base-100 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
					>
						{#each filterOptions as option (option.id)}
							{@const IconComponent = option.icon}
							<button
								type="button"
								class="hover:bg-base-200 flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {activeFilter ===
								option.id
									? 'bg-primary/10 text-primary'
									: 'text-base-content'}"
								onclick={() => selectFilter(option.id)}
							>
								<IconComponent
									class="h-5 w-5 {activeFilter === option.id
										? 'text-primary'
										: 'text-base-content/60'}"
								/>
								<span class="font-medium">{option.label}</span>
								{#if activeFilter === option.id}
									<IconCheck class="text-primary ml-auto h-5 w-5" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="mt-4 hidden sm:block">
			<div class="flex flex-wrap gap-3">
				{#each filterOptions as option (option.id)}
					{@const IconComponent = option.icon}
					<button
						type="button"
						class="btn btn-sm flex cursor-pointer items-center justify-center gap-2 rounded-3xl px-4 py-4 text-center transition-all duration-200 {activeFilter ===
						option.id
							? 'text-primary bg-primary/10 border-primary/30 border'
							: 'bg-base-100/40 hover:bg-base-100/60 text-base-content/70'}"
						onclick={() => selectFilter(option.id)}
						aria-label={option.label}
					>
						<IconComponent class="h-5 w-5 {activeFilter === option.id ? 'text-primary' : ''}" />
						<span class="font-medium">{option.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#if timelines.some((timeline) => serviceUnavailableByAddress[timeline.request.content.serviceAddress] === true)}
		<div
			class="alert alert-outline alert-warning text-sm"
			data-testid="my-quotes-unavailable-alert"
		>
			<span>
				{translateOrFallback(
					'dashboard.service_requests.alerts.service_unavailable',
					'Some services were deleted by the provider. Those requests remain visible as read-only history unless a contract was already created.'
				)}
			</span>
		</div>
	{/if}

	{#if showPartialSyncAlert}
		<div class="alert alert-outline alert-warning text-sm" data-testid="my-quotes-partial-alert">
			<span>
				{translateOrFallback(
					'dashboard.service_requests.alerts.partial_sync',
					'Latest quote thread data is still propagating across relays. Showing partial results until the thread finishes syncing.'
				)}
			</span>
		</div>
	{:else if taskerDataIsStale}
		<div class="alert alert-outline alert-warning text-sm" data-testid="my-quotes-stale-alert">
			<span>
				{translateOrFallback(
					'dashboard.service_requests.alerts.stale',
					'Showing your last known quote data. Refresh before acting on proposals because the latest relay sync did not complete.'
				)}
			</span>
		</div>
	{/if}

	{#if isOffline}
		<div class="alert alert-outline alert-warning text-sm" data-testid="my-quotes-offline-alert">
			<span>
				{translateOrFallback(
					'dashboard.service_requests.alerts.offline',
					'You are offline. Reconnect before reviewing or acting on quote proposals.'
				)}
			</span>
		</div>
	{:else if showReconnectNotice}
		<div class="alert alert-outline alert-info text-sm" data-testid="my-quotes-reconnect-alert">
			<span>
				{translateOrFallback(
					'dashboard.service_requests.alerts.reconnect',
					'Back online. Retry if the latest quote status has not refreshed yet.'
				)}
			</span>
		</div>
	{/if}

	{#if loadError}
		<div class="alert alert-outline alert-error flex items-center justify-between gap-3 text-sm">
			<span>{loadError}</span>
			{#if onRetry}
				<button type="button" class="btn btn-ghost btn-xs" onclick={onRetry} disabled={isSyncing}>
					{translateOrFallback('common.buttons.retry', 'Retry')}
				</button>
			{/if}
		</div>
	{/if}

	{#if timelines.length === 0}
		{#if !hasLoaded && isSyncing}
			<div class="border-base-300 text-base-content/70 rounded-xl border border-dashed p-6 text-sm">
				{translateOrFallback(
					'dashboard.service_requests.loading',
					'Loading your service requests...'
				)}
			</div>
		{:else if loadError}
			<div class="border-base-300 text-base-content/70 rounded-xl border border-dashed p-6 text-sm">
				{translateOrFallback(
					'dashboard.service_requests.retry_loading',
					'Retry to load your service requests.'
				)}
			</div>
		{:else}
			<div class="card bg-base-100 rounded-xl p-4">
				<DashboardEmptyState
					icon={briefcaseEmptyStateIcon}
					title={translateOrFallback(
						'dashboard.service_requests.empty',
						'No service requests have been submitted yet.'
					)}
					actionLabel={translateOrFallback('dashboard.find_services', 'Find Services')}
					actionHref="/services"
					testId="my-quotes-empty-state"
				/>
			</div>
		{/if}
	{:else if filteredTimelines.length === 0}
		<div class="card bg-base-100 rounded-xl p-4">
			<DashboardEmptyState
				icon={briefcaseEmptyStateIcon}
				title={translateOrFallback(
					'dashboard.service_requests.empty_filtered',
					'No service requests match this status yet.'
				)}
				description={translateOrFallback(
					'dashboard.service_requests.empty_filtered_description',
					'Try a different status filter to review the rest of your service requests.'
				)}
				actionLabel={translateOrFallback('find_tasks.clear_filters', 'Clear Filters')}
				actionIcon={refreshEmptyStateIcon}
				onAction={clearFilters}
				testId="my-quotes-filtered-empty-state"
			/>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-5">
			{#each filteredTimelines as timeline (timeline.request.id)}
				<DashboardQuoteCard
					{timeline}
					getActionButtons={getQuoteActionButtons}
					serviceUnavailable={serviceUnavailableByAddress[
						timeline.request.content.serviceAddress
					] === true}
				/>
			{/each}
		</div>
	{/if}
</section>

<ServiceRequestDrawer
	isOpen={requestDrawerTimeline !== null}
	timeline={requestDrawerTimeline}
	service={requestDrawerTimeline
		? (serviceByAddress[requestDrawerTimeline.request.content.serviceAddress] ?? null)
		: null}
	serviceUnavailable={requestDrawerTimeline
		? serviceUnavailableByAddress[requestDrawerTimeline.request.content.serviceAddress] === true
		: false}
	loading={requestDrawerTimeline
		? serviceLoadedByAddress[requestDrawerTimeline.request.content.serviceAddress] !== true
		: false}
	onClose={closeRequestDrawer}
/>

<Modal
	isOpen={deleteModalTimeline !== null}
	title={translateOrFallback(
		'dashboard.service_requests.delete_modal.title',
		'Delete service request'
	)}
	onClose={closeDeleteModal}
	size="md"
>
	{#if deleteModalTimeline}
		<p class="text-base-content/80 text-sm">
			{translateOrFallback(
				'dashboard.service_requests.delete_modal.intro',
				'This will permanently remove this service request from your dashboard history.'
			)}
		</p>
		{#if deleteError}
			<div class="alert alert-outline alert-error mt-4 text-sm">
				<span>{deleteError}</span>
			</div>
		{/if}
		<div class="mt-6 flex justify-end gap-2">
			<button
				type="button"
				class="btn btn-ghost"
				onclick={closeDeleteModal}
				disabled={deletePendingRequestId === deleteModalTimeline.request.content.quoteRequestId}
			>
				{translateOrFallback('common.cancel', 'Cancel')}
			</button>
			<button
				type="button"
				class="btn btn-error"
				onclick={confirmDeleteRequest}
				disabled={deletePendingRequestId === deleteModalTimeline.request.content.quoteRequestId}
			>
				{#if deletePendingRequestId === deleteModalTimeline.request.content.quoteRequestId}
					<span class="loading loading-spinner loading-xs"></span>
				{/if}
				{translateOrFallback('dashboard.service_requests.delete_modal.confirm', 'Confirm Delete')}
			</button>
		</div>
	{/if}
</Modal>
