<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import type { Service } from '$lib/types/service.d';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import type { ServiceQuoteDataFreshness } from '$lib/types/service-quote';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import {
		getProviderDataFreshness,
		serviceQuoteUiStore
	} from '$lib/stores/service-quote-ui.store';
	import type { ServiceProposalComposerSubmitPayload } from './ServiceProposalComposer.svelte';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconCheck from '~icons/mdi/check';
	import IconCheckCircleOutline from '~icons/mdi/check-circle-outline';
	import IconChevronDown from '~icons/mdi/chevron-down';
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
		showServiceTitles = false,
		serviceTitleByAddress = {},
		serviceFilterLabel = 'Filter by service',
		allServicesLabel = 'All Services',
		deletedServiceLabel = 'Deleted service',
		totalPendingRequestCount = 0,
		selectedServiceRequestCount = null,
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
		onDeleteProposal
	}: {
		service?: Service | null;
		services?: Service[];
		selectedServiceAddress?: string | null;
		serviceUnavailable?: boolean;
		showServiceTitles?: boolean;
		serviceTitleByAddress?: Record<string, string>;
		serviceFilterLabel?: string;
		allServicesLabel?: string;
		deletedServiceLabel?: string;
		totalPendingRequestCount?: number;
		selectedServiceRequestCount?: number | null;
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
	} = $props();

	let activeProposalRequestId = $state<string | null>(null);
	let activeProposalDrawerMode = $state<'compose' | 'view' | null>(null);
	let activeProposalTimelineSnapshot = $state<ServiceQuoteTimelineEntry | null>(null);
	let activeFilter = $state<
		| 'all'
		| 'awaiting_proposal'
		| 'proposal_sent'
		| 'contract_created'
		| 'declined'
		| 'withdrawn'
		| 'expired'
	>('all');
	let deleteProposalSubmitting = $state(false);
	let deleteProposalError = $state<string | null>(null);
	let isDropdownOpen = $state(false);
	let currentPage = $state(1);
	let statusDropdownButton = $state<HTMLButtonElement | null>(null);
	let statusDropdownContainer = $state<HTMLDivElement | null>(null);
	const PAGE_SIZE = 10;
	const statusDropdownId = 'service-request-status-listbox';

	const selectedTimeline = $derived.by(() => {
		const requestId = activeProposalRequestId ?? focusedRequestId;
		if (requestId) {
			return (
				timelines.find((timeline) => timeline.request.content.quoteRequestId === requestId) ?? null
			);
		}
		return null;
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
			return tr(
				'dashboard.services.my_services.quote_inbox.blocked_reason.wallet',
				'Connect your wallet before sending a proposal.'
			);
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
			label: tr('dashboard.service_requests.filters.all', 'All'),
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
	const totalTimelineCount = $derived(sortedTimelines.length);
	const filteredTimelineCount = $derived(filteredTimelines.length);
	const showingSummary = $derived.by(() =>
		activeFilter === 'all'
			? trv('dashboard.service_requests.showing_all', 'Showing {count} requests', {
					count: filteredTimelineCount
				})
			: trv(
					'dashboard.service_requests.showing_filtered',
					'Showing {visible} of {total} requests',
					{
						visible: filteredTimelineCount,
						total: totalTimelineCount
					}
				)
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

	function selectFilter(
		nextFilter:
			| 'all'
			| 'awaiting_proposal'
			| 'proposal_sent'
			| 'contract_created'
			| 'declined'
			| 'withdrawn'
			| 'expired'
	) {
		activeFilter = nextFilter;
		isDropdownOpen = false;
		currentPage = 1;
	}

	function clearFilters() {
		activeFilter = 'all';
		currentPage = 1;
	}

	function toggleDropdown() {
		isDropdownOpen = !isDropdownOpen;
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

	function trv(key: string, fallback: string, values: Record<string, string | number>): string {
		try {
			const value = $t(key, { values });
			if (typeof value === 'string' && value !== key) {
				return value;
			}
			return Object.entries(values).reduce(
				(result, [placeholder, replacement]) =>
					result.replaceAll(`{${placeholder}}`, String(replacement)),
				fallback
			);
		} catch {
			return Object.entries(values).reduce(
				(result, [placeholder, replacement]) =>
					result.replaceAll(`{${placeholder}}`, String(replacement)),
				fallback
			);
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

	function focusStatusOption(index: number) {
		const options = Array.from(
			statusDropdownContainer?.querySelectorAll<HTMLButtonElement>(
				'[data-status-filter-option="true"]'
			) ?? []
		);
		if (options.length === 0) {
			return;
		}

		const normalizedIndex = ((index % options.length) + options.length) % options.length;
		options[normalizedIndex]?.focus();
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Node | null;
		if (
			isDropdownOpen &&
			statusDropdownContainer &&
			target &&
			!statusDropdownContainer.contains(target)
		) {
			isDropdownOpen = false;
		}
	}

	function handleStatusTriggerKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			isDropdownOpen = true;
			queueMicrotask(() =>
				focusStatusOption(event.key === 'ArrowDown' ? 0 : filterOptions.length - 1)
			);
			return;
		}

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			const willOpen = !isDropdownOpen;
			toggleDropdown();
			if (willOpen) {
				queueMicrotask(() => focusStatusOption(0));
			}
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			isDropdownOpen = false;
			statusDropdownButton?.focus();
		}
	}

	function handleStatusOptionKeydown(
		event: KeyboardEvent,
		index: number,
		optionId:
			| 'all'
			| 'awaiting_proposal'
			| 'proposal_sent'
			| 'contract_created'
			| 'declined'
			| 'withdrawn'
			| 'expired'
	) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			selectFilter(optionId);
			statusDropdownButton?.focus();
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			isDropdownOpen = false;
			statusDropdownButton?.focus();
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			focusStatusOption(index + 1);
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			focusStatusOption(index - 1);
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			focusStatusOption(0);
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			focusStatusOption(filterOptions.length - 1);
		}
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
			context: 'services',
			highlight: escrowId
		});
		await goto(resolve(`${nextUrl.pathname}${nextUrl.search}`));
	}

	function getActionButtons(timeline: ServiceQuoteTimelineEntry) {
		if (timeline.linkedEscrowId) {
			return [
				{
					label: tr('dashboard.services.my_services.quote_inbox.view_contract', 'View Contract'),
					class: 'btn-primary btn-sm',
					icon: 'contract' as const,
					onclick: () => viewContract(timeline.linkedEscrowId!)
				}
			];
		}

		if (timeline.latestProposal) {
			return [
				{
					label: tr('dashboard.services.my_services.quote_inbox.view_proposal', 'View Proposal'),
					class: 'btn-outline btn-sm',
					icon: 'view' as const,
					onclick: () => openProposalDrawer(timeline.request.content.quoteRequestId, 'view')
				}
			];
		}

		if (serviceUnavailable || timeline.isExpired || timeline.resolvedStatus === 'expired') {
			return [];
		}

		return [
			{
				label: tr('dashboard.services.my_services.quote_inbox.send_proposal', 'Send Proposal'),
				class: 'btn-primary btn-sm',
				icon: 'proposal' as const,
				disabled: Boolean(proposalAuthoringBlockedReason),
				onclick: () => openProposalDrawer(timeline.request.content.quoteRequestId, 'compose')
			}
		];
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

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
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
		<div class="border-base-300/60 bg-base-100/40 mt-2 rounded-3xl border p-4 shadow-sm">
			<div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p class="text-base-content/70 text-xs font-semibold tracking-wide uppercase">
						{tr('dashboard.service_requests.status_heading', 'Filter by request status')}
					</p>
				</div>

				<div class="flex items-center gap-2 sm:max-w-md sm:min-w-[20rem]">
					<div class="min-w-0 flex-1">
						<ServiceFilterSelect
							{services}
							{selectedServiceAddress}
							filterLabel={serviceFilterLabel}
							{allServicesLabel}
							{deletedServiceLabel}
							testId="service-request-filter"
							containerClass="w-full max-w-none"
							selectClass="select select-bordered h-11 min-h-11 w-full truncate rounded-3xl"
							onChange={(serviceAddress) => onServiceFilterChange?.(serviceAddress)}
						/>
					</div>

					<button
						type="button"
						class="btn btn-ghost btn-sm sm:btn-outline gap-2"
						disabled={isSyncing}
						aria-label={tr('common.buttons.refresh', 'Refresh')}
						data-testid="service-request-refresh"
						onclick={onRetry}
					>
						<IconRefresh class="h-5 w-5" />
						<span class="hidden sm:inline">{tr('common.buttons.refresh', 'Refresh')}</span>
					</button>
				</div>
			</div>

			<div class="mb-3 sm:hidden">
				<div class="status-dropdown-container relative" bind:this={statusDropdownContainer}>
					<button
						bind:this={statusDropdownButton}
						class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
						onclick={toggleDropdown}
						onkeydown={handleStatusTriggerKeydown}
						type="button"
						aria-expanded={isDropdownOpen}
						aria-haspopup="listbox"
						aria-controls={statusDropdownId}
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
							id={statusDropdownId}
							role="listbox"
							aria-label={tr(
								'dashboard.service_requests.status_heading',
								'Filter by request status'
							)}
							class="border-base-300 bg-base-100 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
						>
							{#each filterOptions as option, index (option.id)}
								{@const IconComponent = option.icon}
								<button
									data-status-filter-option="true"
									role="option"
									aria-selected={activeFilter === option.id}
									class="hover:bg-base-200 flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {activeFilter ===
									option.id
										? 'bg-primary/10 text-primary'
										: 'text-base-content'}"
									onclick={() => {
										selectFilter(option.id);
										statusDropdownButton?.focus();
									}}
									onkeydown={(event) => handleStatusOptionKeydown(event, index, option.id)}
									type="button"
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
				<div class="flex flex-col gap-3 sm:flex-row">
					{#each filterOptions as option (option.id)}
						{@const IconComponent = option.icon}
						<button
							class="btn btn-sm flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-3xl py-4 text-center transition-all duration-200 {activeFilter ===
							option.id
								? 'text-primary bg-primary/10 border-primary/30 border'
								: 'bg-base-100/40 hover:bg-base-100/60 text-base-content/70'}"
							onclick={() => selectFilter(option.id)}
							aria-label={option.label}
							type="button"
						>
							<IconComponent class="h-5 w-5 {activeFilter === option.id ? 'text-primary' : ''}" />
							<span class="font-medium">{option.label}</span>
						</button>
					{/each}
				</div>
			</div>
		</div>

		<section
			class="border-base-300/60 bg-base-100/40 rounded-3xl border p-3 shadow-sm md:p-4"
			data-testid="service-quotes-summary-card"
		>
			<div class="grid grid-cols-2 gap-3">
				<div class="border-base-300 bg-base-100 rounded-2xl border p-3 shadow-sm">
					<div class="flex items-center gap-2.5">
						<div
							class="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full"
						>
							<IconClockOutline class="h-5 w-5" />
						</div>
						<div class="min-w-0">
							<p class="text-base-content/70 text-xs leading-tight sm:text-sm">
								{tr(
									'dashboard.services.my_services.quote_inbox.total_pending_requests',
									'Pending requests'
								)}
							</p>
							<p class="text-lg font-semibold sm:text-2xl">{totalPendingRequestCount}</p>
						</div>
					</div>
				</div>

				{#if selectedServiceRequestCount !== null}
					<div class="border-base-300 bg-base-100 rounded-2xl border p-3 shadow-sm">
						<div class="flex items-center gap-2.5">
							<div
								class="bg-secondary/10 text-secondary flex h-10 w-10 items-center justify-center rounded-full"
							>
								<IconBriefcaseOutline class="h-5 w-5" />
							</div>
							<div class="min-w-0">
								<p class="text-base-content/70 text-xs leading-tight sm:text-sm">
									{tr(
										'dashboard.services.my_services.quote_inbox.selected_service_total',
										'Requests for selected service'
									)}
								</p>
								<p class="text-lg font-semibold sm:text-2xl">{selectedServiceRequestCount}</p>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<p
				class="text-base-content/70 mt-3 text-xs sm:text-sm"
				data-testid="service-quotes-showing-summary"
			>
				{showingSummary}
			</p>
		</section>

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
						: tr(
								'dashboard.services.my_services.quote_inbox.no_service_quotes_description',
								'New quote requests for your services will appear here.'
							)}
					actionLabel={activeFilter !== 'all'
						? tr('dashboard.contracts.clear_filters', 'Clear Filters')
						: undefined}
					actionIcon={activeFilter !== 'all' ? IconRefresh : undefined}
					onAction={activeFilter !== 'all' ? clearFilters : undefined}
					testId="service-quotes-filtered-empty-state"
				/>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-5">
				{#each paginatedTimelines as timeline (timeline.request.id)}
					<ServiceQuoteRequestCard
						{timeline}
						isSelected={focusedRequestId === timeline.request.content.quoteRequestId}
						{showServiceTitles}
						{serviceTitleByAddress}
						serviceUnavailable={serviceUnavailable && !timeline.linkedEscrowId}
						{getActionButtons}
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
		<DashboardEmptyState
			icon={IconBriefcaseOutline}
			title={tr(
				'dashboard.services.my_services.quote_inbox.no_service_quotes',
				'No service requests yet.'
			)}
			actionLabel={tr('dashboard.services.my_services.create_service', 'Create Service')}
			actionHref="/dashboard/create-service"
			actionIcon={IconPlus}
			testId="service-quotes-empty-state"
		/>
	{/if}

	<ServiceProposalDrawer
		isOpen={drawerTimeline !== null &&
			activeProposalDrawerMode !== null &&
			!drawerTimeline.linkedEscrowId &&
			(activeProposalDrawerMode === 'view' || (!serviceUnavailable && !selectedTimelineExpired))}
		mode={activeProposalDrawerMode ?? 'compose'}
		timeline={drawerTimeline}
		proposal={selectedProposal}
		serviceTitle={selectedServiceTitle}
		disabled={isSyncing ||
			serviceUnavailable ||
			!walletReady ||
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
