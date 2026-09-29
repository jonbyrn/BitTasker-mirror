<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import type { Service } from '$lib/types/service.d';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import {
		type ServiceQuoteDataFreshness,
		getProviderDataFreshness,
		serviceQuoteUiStore
	} from '$lib/stores/service-quote-ui.store';
	import { buildServiceAddress } from '$lib/utils/service-quote/protocol';
	import type { ServiceProposalComposerSubmitPayload } from './ServiceProposalComposer.svelte';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import DashboardFilterBar from '$lib/components/shared/DashboardFilterBar.svelte';
	import DashboardDropdown from '$lib/components/shared/DashboardDropdown.svelte';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconCheck from '~icons/mdi/check';
	import IconCheckCircleOutline from '~icons/mdi/check-circle-outline';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconEmailFastOutline from '~icons/mdi/email-fast-outline';
	import IconPlus from '~icons/mdi/plus';
	import IconRefresh from '~icons/mdi/refresh';
	import IconTimerSand from '~icons/mdi/timer-sand';
	import IconUndoVariant from '~icons/mdi/undo-variant';
	import ServiceQuoteRequestCard from './ServiceQuoteRequestCard.svelte';
	import ServiceProposalDrawer from './ServiceProposalDrawer.svelte';
	import ServiceFilterSelect from '$lib/components/service/ServiceFilterSelect.svelte';

	let {
		service = null,
		services = [],
		selectedServiceAddress = null,
		serviceUnavailable = false,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- prop passed by consumers but used internally via derived state
		showServiceTitles = false,
		serviceTitleByAddress = {},
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- prop accepted by interface but not used in template
		serviceFilterLabel = null,
		allServicesLabel = null,
		deletedServiceLabel = null,
		dataFreshness = null,
		timelines = [],
		focusedRequestId = null,
		isSyncing = false,
		hasLoaded = true,
		loadError = null,
		walletReady = false,
		feeTierReady = false,
		onRetry,
		onServiceFilterChange,
		onRequestFocusChange,
		onRequestClear,
		onInvalidFocusedRequest,
		onSendProposal,
		onDeleteProposal,
		status = null
	}: {
		service?: Service | null;
		services?: Service[];
		selectedServiceAddress?: string | null;
		serviceUnavailable?: boolean;
		showServiceTitles?: boolean;
		serviceTitleByAddress?: Record<string, string>;
		serviceFilterLabel?: string | null;
		allServicesLabel?: string | null;
		deletedServiceLabel?: string | null;
		dataFreshness?: ServiceQuoteDataFreshness | null;
		timelines?: ServiceQuoteTimelineEntry[];
		focusedRequestId?: string | null;
		isSyncing?: boolean;
		hasLoaded?: boolean;
		loadError?: string | null;
		walletReady?: boolean;
		feeTierReady?: boolean;
		onRetry?: (() => void | Promise<void>) | undefined;
		onServiceFilterChange?: (serviceAddress: string | null) => void;
		onRequestFocusChange?: (requestId: string | null) => void;
		onRequestClear?: () => void;
		onInvalidFocusedRequest?: () => void;
		onSendProposal?: (
			requestId: string,
			payload: ServiceProposalComposerSubmitPayload
		) =>
			| Promise<{ success: boolean; error?: string } | void>
			| { success: boolean; error?: string }
			| void;
		onDeleteProposal?: (
			requestId: string,
			proposalId: string
		) =>
			| Promise<{ success: boolean; error?: string } | void>
			| { success: boolean; error?: string }
			| void;
		status?: string | null;
	} = $props();

	let activeProposalRequestId = $state<string | null>(null);
	let activeProposalDrawerMode = $state<'compose' | 'view' | null>(null);
	let activeProposalTimelineSnapshot = $state<ServiceQuoteTimelineEntry | null>(null);

	type ServiceRequestFilterCategory =
		| 'all'
		| 'awaiting_proposal'
		| 'proposal_sent'
		| 'contract_created'
		| 'declined'
		| 'withdrawn'
		| 'expired';

	const VALID_FILTERS: ServiceRequestFilterCategory[] = [
		'all',
		'awaiting_proposal',
		'proposal_sent',
		'contract_created',
		'declined',
		'withdrawn',
		'expired'
	];

	let activeFilter = $state<ServiceRequestFilterCategory>('all');

	$effect(() => {
		if (status && VALID_FILTERS.includes(status as ServiceRequestFilterCategory)) {
			activeFilter = status as ServiceRequestFilterCategory;
		}
	});

	let deleteProposalSubmitting = $state(false);
	let deleteProposalError = $state<string | null>(null);
	let currentPage = $state(1);
	const PAGE_SIZE = 10;

	const selectedTimeline = $derived.by(() => {
		const requestId = activeProposalRequestId ?? focusedRequestId;
		if (requestId) {
			return (
				timelines.find((timeline) => timeline.request.content.quoteRequestId === requestId) ?? null
			);
		}
		return null;
	});
	const serviceByAddress = $derived.by(() => {
		const entries = services.flatMap((listedService) => {
			try {
				return [[buildServiceAddress(listedService), listedService] as const];
			} catch {
				return [];
			}
		});

		return Object.fromEntries(entries);
	});
	const drawerTimeline = $derived(selectedTimeline ?? activeProposalTimelineSnapshot);
	const selectedProposal = $derived(drawerTimeline?.latestProposal ?? null);

	$effect(() => {
		if (
			focusedRequestId &&
			!timelines.some((timeline) => timeline.request.content.quoteRequestId === focusedRequestId) &&
			!isSyncing &&
			hasLoaded
		) {
			onInvalidFocusedRequest?.();
		}
	});

	const isOffline = $derived(!$browserNetworkStatus.online);
	const showReconnectNotice = $derived(
		$browserNetworkStatus.online && $browserNetworkStatus.lastTransition === 'online'
	);
	const freshnessServiceAddress = $derived(
		drawerTimeline?.request.content.serviceAddress ??
			timelines[0]?.request.content.serviceAddress ??
			null
	);
	const providerDataFreshness = $derived(
		dataFreshness ?? getProviderDataFreshness($serviceQuoteUiStore, freshnessServiceAddress)
	);
	const providerDataIsStale = $derived(providerDataFreshness === 'stale');
	const providerDataIsPartial = $derived(providerDataFreshness === 'partial');
	const isPasskeyLoadError = $derived.by(
		() => Boolean(loadError) && detectErrorType(loadError ?? '') === 'biometric'
	);
	const showPartialSyncAlert = $derived(
		providerDataIsPartial ||
			(Boolean(focusedRequestId) && hasLoaded && isSyncing && !selectedTimeline)
	);
	const proposalAuthoringBlockedReason = $derived.by(() => {
		if (!walletReady) {
			// Wallet initialization is deferred until proposal submission so re-auth can happen on demand.
			return null;
		}
		if (!feeTierReady) {
			return tr(
				'dashboard.services.my_services.quote_inbox.blocked_reason.fee_tier',
				'Choose a freelancer fee tier before sending a proposal.'
			);
		}
		return null;
	});
	const composerBlockedReason = $derived.by(() => {
		if (serviceUnavailable) {
			return tr(
				'dashboard.services.my_services.quote_inbox.blocked_reason.service_unavailable',
				'This service was deleted by the provider. Existing requests are now read-only.'
			);
		}
		if (proposalAuthoringBlockedReason) {
			return proposalAuthoringBlockedReason;
		}
		if (isOffline) {
			return tr(
				'dashboard.services.my_services.quote_inbox.blocked_reason.offline',
				'You are offline. Reconnect before sending a proposal.'
			);
		}
		if (providerDataIsStale) {
			return tr(
				'dashboard.services.my_services.quote_inbox.blocked_reason.stale',
				'Showing stale quote data. Refresh before sending a proposal.'
			);
		}
		if (showPartialSyncAlert) {
			return tr(
				'dashboard.services.my_services.quote_inbox.blocked_reason.partial',
				'Quote data is still propagating across relays. Sending is disabled until the latest request thread is fully synced.'
			);
		}
		if (loadError) {
			return tr(
				'dashboard.services.my_services.quote_inbox.blocked_reason.unavailable',
				'Quote data is unavailable right now. Retry before sending a proposal.'
			);
		}
		if (isSyncing) {
			return tr(
				'dashboard.services.my_services.quote_inbox.blocked_reason.syncing',
				'Quote data is still syncing. Sending is disabled until the latest request state loads.'
			);
		}
		return null;
	});
	const sortedTimelines = $derived(
		[...timelines].sort((left, right) => right.request.created_at - left.request.created_at)
	);
	const selectedTimelineExpired = $derived(
		drawerTimeline?.isExpired === true || drawerTimeline?.resolvedStatus === 'expired'
	);
	const selectedTimelineReadOnly = $derived.by(() => {
		if (!drawerTimeline) {
			return false;
		}

		return (
			serviceUnavailable ||
			selectedTimelineExpired ||
			drawerTimeline.resolvedStatus === 'accepting' ||
			drawerTimeline.resolvedStatus === 'contract_sync_pending' ||
			drawerTimeline.resolvedStatus === 'accept_failed' ||
			drawerTimeline.resolvedStatus === 'accept_unknown' ||
			drawerTimeline.resolvedStatus === 'declined' ||
			drawerTimeline.resolvedStatus === 'withdrawn' ||
			drawerTimeline.resolvedStatus === 'accepted'
		);
	});
	const selectedServiceTitle = $derived(
		drawerTimeline?.request.content.serviceAddress
			? (serviceTitleByAddress[drawerTimeline.request.content.serviceAddress] ?? null)
			: null
	);
	const filterOptions = $derived.by(() => [
		{
			id: 'all' as const,
			label: tr('dashboard.service_requests.filters.all', 'All Statuses'),
			icon: IconBriefcaseOutline
		},
		{
			id: 'awaiting_proposal' as const,
			label: tr('dashboard.service_requests.filters.awaiting_proposal', 'Awaiting proposal'),
			icon: IconClockOutline
		},
		{
			id: 'proposal_sent' as const,
			label: tr(
				'dashboard.services.my_services.quote_inbox.statuses.proposal_sent',
				'Proposal sent'
			),
			icon: IconEmailFastOutline
		},
		{
			id: 'contract_created' as const,
			label: tr('dashboard.service_requests.filters.contract_created', 'Contract created'),
			icon: IconCheckCircleOutline
		},
		{
			id: 'declined' as const,
			label: tr('dashboard.service_requests.filters.declined', 'Declined'),
			icon: IconCheck
		},
		{
			id: 'withdrawn' as const,
			label: tr('dashboard.service_requests.filters.withdrawn', 'Withdrawn'),
			icon: IconUndoVariant
		},
		{
			id: 'expired' as const,
			label: tr('dashboard.service_requests.filters.expired', 'Expired'),
			icon: IconTimerSand
		}
	]);
	const filteredTimelines = $derived.by(() =>
		activeFilter === 'all'
			? sortedTimelines
			: sortedTimelines.filter((timeline) => getTimelineFilterCategory(timeline) === activeFilter)
	);
	const focusedTimelinePage = $derived.by(() => {
		const requestId = activeProposalRequestId ?? focusedRequestId;
		if (!requestId) {
			return null;
		}

		const focusedIndex = filteredTimelines.findIndex(
			(timeline) => timeline.request.content.quoteRequestId === requestId
		);
		if (focusedIndex === -1) {
			return null;
		}

		return Math.floor(focusedIndex / PAGE_SIZE) + 1;
	});
	const totalPages = $derived(Math.max(1, Math.ceil(filteredTimelines.length / PAGE_SIZE)));
	const paginatedTimelines = $derived.by(() => {
		const start = (currentPage - 1) * PAGE_SIZE;
		return filteredTimelines.slice(start, start + PAGE_SIZE);
	});
	const pageNumbers = $derived.by(() =>
		Array.from({ length: totalPages }, (_, index) => index + 1)
	);
	const hasRequestsWorkspace = $derived(
		services.length > 0 ||
			service !== null ||
			selectedServiceAddress !== null ||
			timelines.length > 0
	);

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	const resolvedAllServicesLabel = $derived(
		allServicesLabel ?? tr('dashboard.services.my_services.workspace.all_services', 'All Services')
	);
	const resolvedDeletedServiceLabel = $derived(
		deletedServiceLabel ??
			tr('dashboard.services.my_services.quote_inbox.deleted_service_prefix', 'Deleted service')
	);

	function getTimelineFilterCategory(
		timeline: Pick<
			ServiceQuoteTimelineEntry,
			'resolvedStatus' | 'latestProposal' | 'linkedEscrowId'
		>
	):
		| 'awaiting_proposal'
		| 'proposal_sent'
		| 'contract_created'
		| 'declined'
		| 'withdrawn'
		| 'expired' {
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
				return timeline.latestProposal ? 'proposal_sent' : 'awaiting_proposal';
		}
	}

	function handleFilterChange(nextStatus: ServiceRequestFilterCategory) {
		activeFilter = nextStatus;
		const nextUrl = createDashboardUrl(new URL(window.location.href), {
			tab: 'requests',
			status: nextStatus === 'all' ? null : nextStatus
		});
		void goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
		currentPage = 1;
	}

	function clearFilters() {
		activeFilter = 'all';
		currentPage = 1;
		const nextUrl = createDashboardUrl(new URL(window.location.href), {
			tab: 'requests',
			status: null
		});
		void goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function goToPage(page: number) {
		if (page < 1 || page > totalPages) {
			return;
		}

		currentPage = page;
		const isJsdom =
			typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');
		if (!isJsdom && typeof window.scrollTo === 'function') {
			try {
				window.scrollTo({ top: 0, behavior: 'smooth' });
			} catch {
				// jsdom does not implement scrollTo
			}
		}
	}

	function openProposalDrawer(requestId: string, mode: 'compose' | 'view') {
		activeProposalTimelineSnapshot =
			timelines.find((timeline) => timeline.request.content.quoteRequestId === requestId) ?? null;
		activeProposalRequestId = requestId;
		activeProposalDrawerMode = mode;
		deleteProposalError = null;
		queueMicrotask(() => onRequestFocusChange?.(requestId));
	}

	function closeProposalDrawer() {
		activeProposalTimelineSnapshot = null;
		activeProposalRequestId = null;
		activeProposalDrawerMode = null;
		deleteProposalSubmitting = false;
		deleteProposalError = null;
		if (onRequestClear) {
			onRequestClear();
			return;
		}
		onRequestFocusChange?.(null);
	}

	async function handleProposalSubmit(payload: ServiceProposalComposerSubmitPayload) {
		if (proposalAuthoringBlockedReason) {
			return {
				success: false,
				error: proposalAuthoringBlockedReason
			};
		}
		if (!selectedTimeline || !onSendProposal) {
			const requestId =
				drawerTimeline?.request.content.quoteRequestId ??
				activeProposalRequestId ??
				focusedRequestId;
			if (requestId && onSendProposal) {
				return onSendProposal(requestId, payload);
			}
			return {
				success: false,
				error: tr(
					'dashboard.services.my_services.quote_inbox.blocked_reason.select_request',
					'Select a request before sending a proposal.'
				)
			};
		}
		return onSendProposal(selectedTimeline.request.content.quoteRequestId, payload);
	}

	async function viewContract(escrowId: string) {
		const nextUrl = createDashboardUrl(new URL(window.location.href), {
			tab: 'contracts',
			type: 'services',
			highlight: escrowId
		});
		await goto(resolve(`${nextUrl.pathname}${nextUrl.search}`, {}));
	}

	function getActionButtons(timeline: ServiceQuoteTimelineEntry) {
		if (timeline.linkedEscrowId) {
			const actions: {
				label: string;
				class: string;
				icon: string;
				onclick: () => void;
				disabled?: boolean;
			}[] = [
				{
					label: tr('dashboard.services.my_services.quote_inbox.view_contract_short', 'Contract'),
					class: 'btn-primary btn-sm',
					icon: 'contract',
					onclick: () => viewContract(timeline.linkedEscrowId!)
				}
			];

			if (timeline.latestProposal) {
				actions.push({
					label: tr('dashboard.services.my_services.quote_inbox.view_proposal_short', 'View'),
					class: 'btn-outline btn-sm',
					icon: 'view',
					onclick: () => openProposalDrawer(timeline.request.content.quoteRequestId, 'view')
				});
			}

			return actions;
		}

		if (timeline.latestProposal) {
			return [
				{
					label: tr('dashboard.services.my_services.quote_inbox.view_proposal_short', 'View'),
					class: 'btn-outline btn-sm',
					icon: 'view' as const,
					onclick: () => openProposalDrawer(timeline.request.content.quoteRequestId, 'view')
				},
				messageAction(timeline)
			];
		}

		if (serviceUnavailable || timeline.isExpired || timeline.resolvedStatus === 'expired') {
			return [];
		}

		return [
			{
				label: tr('dashboard.services.my_services.quote_inbox.send_proposal_short', 'Send'),
				class: 'btn-primary btn-sm',
				icon: 'proposal' as const,
				disabled: Boolean(proposalAuthoringBlockedReason),
				onclick: () => openProposalDrawer(timeline.request.content.quoteRequestId, 'compose')
			},
			messageAction(timeline)
		];
	}

	function messageAction(timeline: ServiceQuoteTimelineEntry) {
		return {
			label: tr('dashboard.services.my_services.quote_inbox.message_short', 'Message'),
			class: 'btn-outline btn-sm',
			icon: 'view' as const,
			onclick: () => {
				goto(`/messages/to/${timeline.request.pubkey}`);
			}
		};
	}

	async function handleProposalDelete() {
		if (!drawerTimeline || !selectedProposal || !onDeleteProposal || deleteProposalSubmitting) {
			return { success: false };
		}

		deleteProposalSubmitting = true;
		deleteProposalError = null;

		try {
			const result = await onDeleteProposal(
				drawerTimeline.request.content.quoteRequestId,
				selectedProposal.content.proposalId
			);

			if (result && typeof result === 'object' && result.success === false) {
				deleteProposalError = result.error ?? null;
				return result;
			}

			closeProposalDrawer();
			return result;
		} catch (error) {
			deleteProposalError =
				error instanceof Error
					? error.message
					: tr(
							'dashboard.services.my_services.quote_inbox.delete_proposal_failed',
							'Unable to delete this proposal right now.'
						);
			return {
				success: false,
				error: deleteProposalError
			};
		} finally {
			deleteProposalSubmitting = false;
		}
	}

	$effect(() => {
		if (currentPage > totalPages) {
			currentPage = totalPages;
		}
	});

	$effect(() => {
		if (focusedTimelinePage && currentPage !== focusedTimelinePage) {
			currentPage = focusedTimelinePage;
		}
	});

	$effect(() => {
		if (selectedServiceAddress || selectedServiceAddress === null) {
			currentPage = 1;
		}
	});
</script>

<section class="space-y-4" data-testid="service-quotes-inbox">
	{#if loadError}
		{#if isPasskeyLoadError}
			<div class="space-y-2">
				<ErrorAlertWithModal
					error={loadError}
					isPasskeyError
					autoOpenModal={false}
					{onRetry}
					class="text-sm"
				/>
				{#if onRetry}
					<div class="flex justify-end">
						<button
							type="button"
							class="btn btn-ghost btn-xs"
							onclick={onRetry}
							disabled={isSyncing}
						>
							{tr('common.buttons.retry', 'Retry')}
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<div class="alert alert-error flex items-center justify-between gap-3 text-sm">
				<span>{loadError}</span>
				{#if onRetry}
					<button type="button" class="btn btn-ghost btn-xs" onclick={onRetry} disabled={isSyncing}>
						{tr('common.buttons.retry', 'Retry')}
					</button>
				{/if}
			</div>
		{/if}
	{:else if showReconnectNotice}
		<div class="alert alert-info text-sm" data-testid="service-quotes-reconnect-alert">
			<span>
				{tr(
					'dashboard.services.my_services.quote_inbox.reconnect_alert',
					'Back online. Retry if the latest request thread has not refreshed yet.'
				)}
			</span>
		</div>
	{:else if proposalAuthoringBlockedReason}
		<div class="alert alert-warning text-sm" data-testid="service-quotes-prerequisite-alert">
			<span>{proposalAuthoringBlockedReason}</span>
		</div>
	{/if}

	{#if !hasLoaded && isSyncing}
		<div class="border-base-300 text-base-content/70 rounded-xl border border-dashed p-6 text-sm">
			{tr(
				'dashboard.services.my_services.quote_inbox.loading_service_quotes',
				'Loading quote requests for this service...'
			)}
		</div>
	{:else if !hasLoaded && loadError}
		<div class="border-base-300 text-base-content/70 rounded-xl border border-dashed p-6 text-sm">
			{tr(
				'dashboard.services.my_services.quote_inbox.retry_service_quotes',
				'Retry to load quote requests for this service.'
			)}
		</div>
	{:else if hasRequestsWorkspace}
		<DashboardFilterBar onRefresh={onRetry} isRefreshing={isSyncing}>
			<DashboardDropdown
				options={filterOptions}
				value={activeFilter}
				onSelect={handleFilterChange}
				containerClass="col-span-2 sm:col-span-1 w-full sm:w-64"
			/>

			<ServiceFilterSelect
				{services}
				{selectedServiceAddress}
				allServicesLabel={resolvedAllServicesLabel}
				deletedServiceLabel={resolvedDeletedServiceLabel}
				testId="service-request-filter"
				containerClass="col-span-2 sm:col-span-1 w-full sm:w-64"
				onChange={(serviceAddress) => onServiceFilterChange?.(serviceAddress)}
			/>
		</DashboardFilterBar>

		{#if filteredTimelines.length === 0}
			<div class="card bg-base-100 rounded-xl p-4">
				<DashboardEmptyState
					icon={IconBriefcaseOutline}
					title={activeFilter !== 'all'
						? tr(
								'dashboard.service_requests.empty_filtered',
								'No service requests match this status yet.'
							)
						: tr(
								'dashboard.services.my_services.quote_inbox.no_service_quotes',
								'No service requests yet.'
							)}
					description={activeFilter !== 'all'
						? tr(
								'dashboard.service_requests.empty_filtered_description',
								'Try a different status filter to review the rest of your service requests.'
							)
						: ''}
					actionLabel={activeFilter !== 'all'
						? tr('dashboard.contracts.clear_filters', 'Clear Filters')
						: tr('dashboard.services.my_services.create_service', 'Create Service')}
					actionHref={activeFilter !== 'all' ? null : '/create-service'}
					actionIcon={activeFilter !== 'all' ? IconRefresh : IconPlus}
					onAction={activeFilter !== 'all' ? clearFilters : undefined}
					testId="service-quotes-filtered-empty-state"
				/>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-5">
				{#each paginatedTimelines as timeline (timeline.request.id)}
					<ServiceQuoteRequestCard
						{timeline}
						service={serviceByAddress[timeline.request.content.serviceAddress] ??
							(service && selectedServiceAddress === timeline.request.content.serviceAddress
								? service
								: null)}
						isSelected={focusedRequestId === timeline.request.content.quoteRequestId}
						{serviceTitleByAddress}
						serviceUnavailable={serviceUnavailable && !timeline.linkedEscrowId}
						getActionButtons={getActionButtons as unknown as ServiceQuoteRequestCard extends {
							getActionButtons: infer T;
						}
							? T
							: never}
					/>
				{/each}
			</div>

			{#if totalPages > 1}
				<div class="flex items-center justify-center gap-2 py-6">
					<button
						type="button"
						class="btn btn-sm btn-ghost"
						onclick={() => goToPage(currentPage - 1)}
						disabled={currentPage === 1}
					>
						{tr('common.pagination.previous', 'Previous')}
					</button>

					<div class="flex gap-1">
						{#each pageNumbers as page (page)}
							<button
								type="button"
								class="btn btn-sm {currentPage === page ? 'btn-primary' : 'btn-ghost'}"
								onclick={() => goToPage(page)}
							>
								{page}
							</button>
						{/each}
					</div>

					<button
						type="button"
						class="btn btn-sm btn-ghost"
						onclick={() => goToPage(currentPage + 1)}
						disabled={currentPage === totalPages}
					>
						{tr('common.pagination.next', 'Next')}
					</button>
				</div>
			{/if}
		{/if}
	{:else}
		<div class="card bg-base-100 rounded-xl p-4">
			<DashboardEmptyState
				icon={IconBriefcaseOutline}
				title={tr(
					'dashboard.services.my_services.quote_inbox.no_service_quotes',
					'No service requests yet.'
				)}
				actionLabel={tr('dashboard.services.my_services.create_service', 'Create Service')}
				actionHref="/create-service"
				actionIcon={IconPlus}
				testId="service-quotes-empty-state"
			/>
		</div>
	{/if}

	<ServiceProposalDrawer
		isOpen={drawerTimeline !== null &&
			activeProposalDrawerMode !== null &&
			(activeProposalDrawerMode === 'view' ||
				(!drawerTimeline.linkedEscrowId && !serviceUnavailable && !selectedTimelineExpired))}
		mode={activeProposalDrawerMode ?? 'compose'}
		timeline={drawerTimeline}
		service={drawerTimeline
			? (serviceByAddress[drawerTimeline.request.content.serviceAddress] ??
				(service && selectedServiceAddress === drawerTimeline.request.content.serviceAddress
					? service
					: null))
			: null}
		proposal={selectedProposal}
		serviceTitle={selectedServiceTitle}
		disabled={isSyncing ||
			serviceUnavailable ||
			!feeTierReady ||
			Boolean(loadError) ||
			isOffline ||
			providerDataIsStale ||
			showPartialSyncAlert}
		blockedReason={composerBlockedReason}
		allowDelete={!selectedTimelineReadOnly}
		deleteSubmitting={deleteProposalSubmitting}
		deleteError={deleteProposalError}
		onClose={closeProposalDrawer}
		onSubmit={handleProposalSubmit}
		onDelete={selectedTimelineReadOnly ? undefined : handleProposalDelete}
	/>
</section>
