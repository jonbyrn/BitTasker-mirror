<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { t } from 'svelte-i18n';
	import DashboardQuoteCard from './DashboardQuoteCard.svelte';
	import ServiceRequestDrawer from './ServiceRequestDrawer.svelte';
	import ServiceRequestAcceptanceDrawer from './ServiceRequestAcceptanceDrawer.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import { findServiceByUniqueId } from '$lib/nostr/service';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import type { Service } from '$lib/types/service';
	import { getTaskerDataFreshness, serviceQuoteUiStore } from '$lib/stores/service-quote-ui.store';
	import { parseServiceAddress } from '$lib/utils/service-quote/protocol';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import { createPortal, portal } from '$lib/utils/portal';
	import { describeServiceContractPreflightFailure } from '$lib/utils/service-contract/preflight-feedback';
	import {
		preflightServiceContractCreation,
		type ServiceContractPreflightErrorCode
	} from '$lib/utils/service-contract/preflight';
	import { normalizeServiceContractSchedule } from '$lib/utils/service-contract/schedule';
	import {
		allAssets,
		formatSats,
		totalBalances,
		walletManager,
		walletStore
	} from '$lib/stores/wallet.store';
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
		restoreFocusedRequest = false,
		isSyncing = false,
		hasLoaded = true,
		loadError = null,
		onRetry,
		onRequestFocusChange,
		onRequestClear,
		onInvalidFocusedRequest
	}: {
		timelines?: ServiceQuoteTimelineEntry[];
		focusedRequestId?: string | null;
		restoreFocusedRequest?: boolean;
		isSyncing?: boolean;
		hasLoaded?: boolean;
		loadError?: string | null;
		onRetry?: (() => void | Promise<void>) | undefined;
		onRequestFocusChange?: (requestId: string | null) => void;
		onRequestClear?: (() => void | Promise<void>) | undefined;
		onInvalidFocusedRequest?: () => void;
	} = $props();

	interface ActionButton {
		label: string;
		class: string;
		onclick: (e: MouseEvent) => void;
		icon: string;
		disabled?: boolean;
	}

	type AcceptProposalFundingCheck = {
		status: 'ready' | 'error';
		errorCode?: ServiceContractPreflightErrorCode;
		message: string;
		hint: string | null;
		btcPrice: number | null;
		totalRequiredUsd: number | null;
		totalRequiredSats: string;
	};

	type ServiceRequestFilterCategory =
		| 'awaiting_proposal'
		| 'needs_attention'
		| 'contract_created'
		| 'declined'
		| 'withdrawn'
		| 'expired';
	type RequestConfirmationAction = 'decline' | 'delete';

	let actionPending = $state<'accept' | 'decline' | null>(null);
	let actionPendingRequestId = $state<string | null>(null);
	let activeFilter = $state<ServiceRequestFilterCategory>('awaiting_proposal');
	let acceptDrawerRequestId = $state<string | null>(null);
	let acceptFundingCheck = $state<AcceptProposalFundingCheck | null>(null);
	let acceptFundingCheckInFlight = $state(false);
	let acceptFundingCheckRunId = 0;
	let acceptPreflightErrorHint = $state('');
	let acceptPreflightErrorMessage = $state('');
	let hasUserSelectedFilter = $state(false);
	let deletePendingRequestId = $state<string | null>(null);
	let dismissedFocusedRequestId = $state<string | null>(null);
	let isDropdownOpen = $state(false);
	let requestDrawerRequestId = $state<string | null>(null);
	let statusDropdownButton = $state<HTMLButtonElement | null>(null);
	let statusDropdownContainer = $state<HTMLDivElement | null>(null);
	let serviceByAddress = $state<Record<string, Service | null>>({});
	let serviceLookupErrorByAddress = $state<Record<string, boolean>>({});
	let serviceLoadedByAddress = $state<Record<string, boolean>>({});
	let serviceUnavailableByAddress = $state<Record<string, boolean>>({});
	let requestActionError = $state<string | null>(null);
	let confirmationModalState = $state<{
		action: RequestConfirmationAction;
		requestId: string;
	} | null>(null);

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
	const activeRequestDrawerRequestId = $derived(requestDrawerRequestId);
	const requestDrawerTimeline = $derived.by(() =>
		activeRequestDrawerRequestId
			? (timelines.find(
					(timeline) => timeline.request.content.quoteRequestId === activeRequestDrawerRequestId
				) ?? null)
			: null
	);
	const acceptDrawerTimeline = $derived.by(() =>
		acceptDrawerRequestId
			? (timelines.find(
					(timeline) => timeline.request.content.quoteRequestId === acceptDrawerRequestId
				) ?? null)
			: null
	);

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
			case 'accept_failed':
			case 'accept_unknown':
				return 'needs_attention';
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
			id: 'needs_attention' as const,
			label: translateOrFallback(
				'dashboard.service_requests.filters.needs_attention',
				'Needs attention'
			),
			icon: IconCloseCircleOutline
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

	$effect(() => {
		if (!focusedRequestId) {
			dismissedFocusedRequestId = null;
			return;
		}

		if (dismissedFocusedRequestId !== null && dismissedFocusedRequestId !== focusedRequestId) {
			dismissedFocusedRequestId = null;
		}
	});

	$effect(() => {
		if (
			!restoreFocusedRequest ||
			!focusedRequestId ||
			hasPendingMutation ||
			acceptDrawerRequestId ||
			dismissedFocusedRequestId === focusedRequestId
		) {
			return;
		}

		if (requestDrawerRequestId === focusedRequestId) {
			return;
		}

		const focusedTimelineMatch =
			timelines.find((timeline) => timeline.request.content.quoteRequestId === focusedRequestId) ??
			null;
		if (!focusedTimelineMatch) {
			return;
		}

		requestActionError = null;
		requestDrawerRequestId = focusedRequestId;
	});

	const isOffline = $derived(!$browserNetworkStatus.online);
	const showReconnectNotice = $derived(
		$browserNetworkStatus.online && $browserNetworkStatus.lastTransition === 'online'
	);
	const bitcoinAsset = $derived($allAssets.find((asset) => asset.assetId === 'rbtc'));
	const walletBalanceSatsLabel = $derived(formatSats($totalBalances.sats));
	const walletBalanceUsdLabel = $derived.by(() => {
		if (bitcoinAsset?.usdValue != null && Number.isFinite(bitcoinAsset.usdValue)) {
			return `$${formatNumberWithTwoDecimals(bitcoinAsset.usdValue)}`;
		}

		if (acceptFundingCheck?.btcPrice && Number.isFinite($totalBalances.rbtc)) {
			return `$${formatNumberWithTwoDecimals($totalBalances.rbtc * acceptFundingCheck.btcPrice)}`;
		}

		return '';
	});
	const acceptRequiredUsdLabel = $derived.by(() => {
		if (acceptFundingCheck?.totalRequiredUsd == null) {
			return '';
		}

		return `$${formatNumberWithTwoDecimals(acceptFundingCheck.totalRequiredUsd)}`;
	});
	const acceptWalletVerificationStatus = $derived.by(() =>
		acceptFundingCheckInFlight ? 'verifying' : (acceptFundingCheck?.status ?? 'idle')
	);
	const acceptWalletVerificationMessage = $derived.by(() => {
		if (acceptFundingCheckInFlight) {
			return translateOrFallback(
				'dashboard.services.detail.book_now_drawer.verifying_wallet',
				'Checking your wallet balance for this contract...'
			);
		}

		return acceptFundingCheck?.message ?? '';
	});
	const acceptDrawerErrorMessage = $derived(requestActionError ?? acceptPreflightErrorMessage);
	const acceptDrawerErrorHint = $derived(requestActionError ? '' : acceptPreflightErrorHint);
	const taskerDataFreshness = $derived(getTaskerDataFreshness($serviceQuoteUiStore));
	const taskerDataIsStale = $derived(taskerDataFreshness === 'stale');
	const taskerDataIsPartial = $derived(taskerDataFreshness === 'partial');
	const showPartialSyncAlert = $derived(
		taskerDataIsPartial ||
			(Boolean(focusedRequestId) && hasLoaded && isSyncing && !selectedTimeline)
	);
	const activeMutationRequestId = $derived(actionPendingRequestId ?? deletePendingRequestId);
	const hasPendingMutation = $derived(Boolean(activeMutationRequestId));
	const globalActionsUnavailable = $derived(
		isSyncing || Boolean(loadError) || isOffline || taskerDataIsStale || showPartialSyncAlert
	);
	const isPasskeyLoadError = $derived.by(
		() => Boolean(loadError) && detectErrorType(loadError ?? '') === 'biometric'
	);
	const hasServiceLookupErrors = $derived(
		timelines.some(
			(timeline) => serviceLookupErrorByAddress[timeline.request.content.serviceAddress]
		)
	);

	function isServiceLookupPending(timeline: ServiceQuoteTimelineEntry | null): boolean {
		return timeline
			? serviceLoadedByAddress[timeline.request.content.serviceAddress] !== true
			: false;
	}

	function hasServiceLookupError(timeline: ServiceQuoteTimelineEntry | null): boolean {
		return timeline
			? serviceLookupErrorByAddress[timeline.request.content.serviceAddress] === true
			: false;
	}

	function isServiceUnavailable(timeline: ServiceQuoteTimelineEntry | null): boolean {
		return timeline
			? serviceUnavailableByAddress[timeline.request.content.serviceAddress] === true
			: false;
	}

	function isContextLockedToAnotherRequest(timeline: ServiceQuoteTimelineEntry | null): boolean {
		return timeline
			? Boolean(activeMutationRequestId) &&
					activeMutationRequestId !== timeline.request.content.quoteRequestId
			: Boolean(activeMutationRequestId);
	}

	function isActionUnavailableForTimeline(timeline: ServiceQuoteTimelineEntry | null): boolean {
		return (
			globalActionsUnavailable ||
			hasPendingMutation ||
			isContextLockedToAnotherRequest(timeline) ||
			isServiceLookupPending(timeline) ||
			hasServiceLookupError(timeline) ||
			isServiceUnavailable(timeline)
		);
	}

	const actionsUnavailable = $derived(isActionUnavailableForTimeline(requestDrawerTimeline));
	const deleteUnavailable = $derived(isActionUnavailableForTimeline(requestDrawerTimeline));

	function selectFilter(nextFilter: ServiceRequestFilterCategory) {
		if (hasPendingMutation) {
			return;
		}

		activeFilter = nextFilter;
		hasUserSelectedFilter = true;
		isDropdownOpen = false;
	}

	function clearFilters() {
		if (hasPendingMutation) {
			return;
		}

		hasUserSelectedFilter = false;
		activeFilter = getPreferredFilter();
		isDropdownOpen = false;
	}

	function toggleDropdown() {
		if (hasPendingMutation) {
			return;
		}

		isDropdownOpen = !isDropdownOpen;
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
		if (hasPendingMutation) {
			return;
		}

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
		optionId: ServiceRequestFilterCategory
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

	async function handleRefresh() {
		if (hasPendingMutation) {
			return;
		}

		await onRetry?.();
	}

	$effect(() => {
		const serviceAddresses = [
			...new Set(timelines.map((timeline) => timeline.request.content.serviceAddress))
		];
		let cancelled = false;

		if (serviceAddresses.length === 0) {
			serviceByAddress = {};
			serviceLookupErrorByAddress = {};
			serviceLoadedByAddress = {};
			serviceUnavailableByAddress = {};
			return;
		}

		const existingServiceByAddress = untrack(() => serviceByAddress);
		const existingServiceLookupErrorByAddress = untrack(() => serviceLookupErrorByAddress);
		const existingServiceLoadedByAddress = untrack(() => serviceLoadedByAddress);
		const existingServiceUnavailableByAddress = untrack(() => serviceUnavailableByAddress);

		serviceByAddress = Object.fromEntries(
			serviceAddresses.map((serviceAddress) => [
				serviceAddress,
				existingServiceByAddress[serviceAddress] ?? null
			])
		);
		serviceLookupErrorByAddress = Object.fromEntries(
			serviceAddresses.map((serviceAddress) => [
				serviceAddress,
				existingServiceLookupErrorByAddress[serviceAddress] ?? false
			])
		);
		serviceLoadedByAddress = Object.fromEntries(
			serviceAddresses.map((serviceAddress) => [
				serviceAddress,
				existingServiceLoadedByAddress[serviceAddress] ?? false
			])
		);
		serviceUnavailableByAddress = Object.fromEntries(
			serviceAddresses.map((serviceAddress) => [
				serviceAddress,
				existingServiceUnavailableByAddress[serviceAddress] ?? false
			])
		);

		void (async () => {
			const entries = await Promise.all(
				serviceAddresses.map(async (serviceAddress) => {
					try {
						const { dTag } = parseServiceAddress(serviceAddress);
						const service = await findServiceByUniqueId(dTag);
						return {
							serviceAddress,
							service,
							lookupError: false
						} as const;
					} catch {
						return {
							serviceAddress,
							service: null,
							lookupError: true
						} as const;
					}
				})
			);

			if (!cancelled) {
				serviceByAddress = Object.fromEntries(
					entries.map(({ serviceAddress, service }) => [serviceAddress, service] as const)
				);
				serviceLookupErrorByAddress = Object.fromEntries(
					entries.map(({ serviceAddress, lookupError }) => [serviceAddress, lookupError] as const)
				);
				serviceLoadedByAddress = Object.fromEntries(
					entries.map(({ serviceAddress }) => [serviceAddress, true] as const)
				);
				serviceUnavailableByAddress = Object.fromEntries(
					entries.map(
						({ serviceAddress, service, lookupError }) =>
							[serviceAddress, service === null && !lookupError] as const
					)
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

	function getRequestActionErrorMessage(
		action: 'accept' | RequestConfirmationAction,
		fallback: string
	): string {
		return translateOrFallback(`dashboard.service_requests.errors.${action}`, fallback);
	}

	function canShowAcceptActions(timeline: ServiceQuoteTimelineEntry | null): boolean {
		if (!timeline?.latestProposal || timeline.linkedEscrowId) {
			return false;
		}

		if (hasServiceLookupError(timeline) || isServiceUnavailable(timeline)) {
			return false;
		}

		return timeline.resolvedStatus === 'pending' || timeline.resolvedStatus === 'accept_failed';
	}

	function canShowDeclineAction(timeline: ServiceQuoteTimelineEntry | null): boolean {
		if (!timeline?.latestProposal || timeline.linkedEscrowId) {
			return false;
		}

		if (hasServiceLookupError(timeline) || isServiceUnavailable(timeline)) {
			return false;
		}

		return timeline.resolvedStatus === 'pending';
	}

	function canShowDeleteAction(timeline: ServiceQuoteTimelineEntry | null): boolean {
		if (!timeline || timeline.linkedEscrowId) {
			return false;
		}

		if (hasServiceLookupError(timeline) || isServiceUnavailable(timeline)) {
			return false;
		}

		return (
			timeline.resolvedStatus !== 'accepting' &&
			timeline.resolvedStatus !== 'accept_unknown' &&
			timeline.resolvedStatus !== 'accepted'
		);
	}
	function getQuoteActionButtons(timeline: ServiceQuoteTimelineEntry): ActionButton[] {
		const buttons: ActionButton[] = [];

		if (canShowAcceptActions(timeline)) {
			buttons.push({
				label: translateOrFallback('dashboard.service_requests.actions.accept', 'Accept'),
				class: 'btn-success btn-outline btn-sm',
				onclick: (e) => {
					e.stopPropagation();
					selectTimeline(timeline.request.content.quoteRequestId);
					openAcceptDrawer(timeline);
				},
				icon: 'accept',
				disabled: isActionUnavailableForTimeline(timeline)
			});

			if (canShowDeclineAction(timeline)) {
				buttons.push({
					label: translateOrFallback('dashboard.service_requests.actions.decline', 'Decline'),
					class: 'btn-outline btn-sm',
					onclick: (e) => {
						e.stopPropagation();
						selectTimeline(timeline.request.content.quoteRequestId);
						openConfirmationModal('decline', timeline);
					},
					icon: 'decline',
					disabled: isActionUnavailableForTimeline(timeline)
				});
			}
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
					viewContract(timeline.linkedEscrowId);
				},
				icon: 'contract',
				disabled: hasPendingMutation
			});
		}

		// View button - always available
		buttons.push({
			label: translateOrFallback('dashboard.service_requests.actions.view', 'View'),
			class: 'btn-primary btn-sm',
			onclick: (e) => {
				e.stopPropagation();
				openRequestDrawer(timeline);
			},
			icon: 'view',
			disabled: hasPendingMutation
		});

		return buttons;
	}

	function selectTimeline(requestId: string) {
		onRequestFocusChange?.(requestId);
	}

	function dismissFocusedRequest(requestId: string | null) {
		if (requestId && focusedRequestId === requestId) {
			dismissedFocusedRequestId = requestId;
		}
	}

	function clearFocusedRequestDismissal(requestId: string | null) {
		if (!requestId || focusedRequestId === requestId) {
			dismissedFocusedRequestId = null;
		}
	}

	function openRequestDrawer(timeline: ServiceQuoteTimelineEntry) {
		if (hasPendingMutation || isContextLockedToAnotherRequest(timeline)) {
			return;
		}

		clearFocusedRequestDismissal(timeline.request.content.quoteRequestId);
		requestActionError = null;
		requestDrawerRequestId = timeline.request.content.quoteRequestId;
		selectTimeline(timeline.request.content.quoteRequestId);
	}

	function closeRequestDrawer() {
		dismissFocusedRequest(requestDrawerRequestId);
		requestActionError = null;
		requestDrawerRequestId = null;
		if (onRequestClear) {
			void onRequestClear();
			return;
		}
		onRequestFocusChange?.(null);
	}

	function openAcceptDrawer(timeline: ServiceQuoteTimelineEntry | null) {
		if (!timeline || hasPendingMutation || isActionUnavailableForTimeline(timeline)) {
			return;
		}

		clearFocusedRequestDismissal(timeline.request.content.quoteRequestId);
		clearAcceptFundingCheckState();
		requestActionError = null;
		acceptDrawerRequestId = timeline.request.content.quoteRequestId;
		requestDrawerRequestId = null;
		selectTimeline(timeline.request.content.quoteRequestId);
	}

	function closeAcceptDrawer(force = false) {
		if (!force && actionPending === 'accept') {
			return;
		}

		dismissFocusedRequest(acceptDrawerRequestId);
		clearAcceptFundingCheckState();
		requestActionError = null;
		acceptDrawerRequestId = null;
		if (onRequestClear) {
			void onRequestClear();
			return;
		}
		onRequestFocusChange?.(null);
	}

	function finalizeAcceptedRequest() {
		closeAcceptDrawer(true);
		requestDrawerRequestId = null;
	}

	function openConfirmationModal(
		action: RequestConfirmationAction,
		timeline: ServiceQuoteTimelineEntry | null
	) {
		if (!timeline || hasPendingMutation || isActionUnavailableForTimeline(timeline)) {
			return;
		}

		requestActionError = null;
		confirmationModalState = {
			action,
			requestId: timeline.request.content.quoteRequestId
		};
	}

	function closeConfirmationModal() {
		if (actionPending || deletePendingRequestId) {
			return;
		}

		confirmationModalState = null;
	}

	async function applyStatus(timeline: ServiceQuoteTimelineEntry, status: 'declined') {
		if (!timeline.latestProposal || actionPending || isActionUnavailableForTimeline(timeline)) {
			return false;
		}

		actionPendingRequestId = timeline.request.content.quoteRequestId;
		actionPending = 'decline';
		try {
			const result = await serviceQuoteUiStore.applyTaskerStatus({
				quoteRequestId: timeline.request.content.quoteRequestId,
				proposalId: timeline.latestProposal.content.proposalId,
				status
			});
			if (!result.success) {
				requestActionError =
					result.error ??
					getRequestActionErrorMessage('decline', 'Unable to decline this proposal right now.');
				return false;
			}

			return true;
		} finally {
			actionPending = null;
			actionPendingRequestId = null;
		}
	}

	async function acceptProposal(timeline: ServiceQuoteTimelineEntry) {
		if (!timeline.latestProposal || actionPending || isActionUnavailableForTimeline(timeline)) {
			return false;
		}

		requestActionError = null;
		actionPendingRequestId = timeline.request.content.quoteRequestId;
		actionPending = 'accept';
		try {
			const result = await serviceQuoteUiStore.acceptTaskerProposal({
				quoteRequestId: timeline.request.content.quoteRequestId,
				proposalId: timeline.latestProposal.content.proposalId
			});
			if (!result.success) {
				requestActionError =
					result.error ??
					getRequestActionErrorMessage('accept', 'Unable to accept this proposal right now.');
				return false;
			}

			finalizeAcceptedRequest();
			return true;
		} finally {
			actionPending = null;
			actionPendingRequestId = null;
		}
	}

	function clearAcceptFundingCheckState() {
		acceptFundingCheckRunId += 1;
		acceptFundingCheck = null;
		acceptFundingCheckInFlight = false;
		acceptPreflightErrorMessage = '';
		acceptPreflightErrorHint = '';
	}

	async function refreshAcceptFundingCheck(timeline: ServiceQuoteTimelineEntry | null) {
		if (!timeline?.latestProposal) {
			clearAcceptFundingCheckState();
			return;
		}

		const latestProposal = timeline.latestProposal;
		const schedule = normalizeServiceContractSchedule(
			latestProposal.content.estimatedStartTime,
			latestProposal.content.estimatedEndTime
		);
		const runId = ++acceptFundingCheckRunId;
		acceptFundingCheckInFlight = true;
		acceptFundingCheck = null;
		acceptPreflightErrorMessage = '';
		acceptPreflightErrorHint = '';

		try {
			try {
				await walletManager.initialize();
			} catch {
				// Preflight handles disconnected wallets and returns stable recovery copy.
			}

			try {
				await walletManager.loadAssets();
			} catch {
				// Balance display is best-effort; preflight still gates confirmation.
			}

			const btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			const preflight = await preflightServiceContractCreation(
				{
					freelancerAddress: latestProposal.content.freelancerRskAddress,
					freelancerPubkey: latestProposal.pubkey,
					amountUsdt: latestProposal.content.amountUsdt,
					estimatedStartTime: schedule.estimatedStartTime,
					estimatedCompletionTime: schedule.estimatedCompletionTime,
					freelancerFeeTier: latestProposal.content.freelancerFeeTier
				},
				btcPrice
			);

			if (acceptFundingCheckRunId !== runId) {
				return;
			}

			if (!preflight.ok) {
				const feedback = describeServiceContractPreflightFailure(
					preflight.errorCode,
					preflight.error
				);
				acceptPreflightErrorMessage = feedback.message;
				acceptPreflightErrorHint = feedback.hint ?? '';
				acceptFundingCheck = {
					status: 'error',
					errorCode: preflight.errorCode,
					message: feedback.message,
					hint: feedback.hint,
					btcPrice,
					totalRequiredUsd: null,
					totalRequiredSats: ''
				};
				return;
			}

			acceptFundingCheck = {
				status: 'ready',
				message: translateOrFallback(
					'dashboard.services.detail.book_now_drawer.balance_verified',
					'Your available balance covers this service contract.'
				),
				hint: null,
				btcPrice,
				totalRequiredUsd: Number.parseFloat(preflight.totalRequired) * btcPrice,
				totalRequiredSats: formatSats(
					Math.round(Number.parseFloat(preflight.totalRequired) * 100_000_000)
				)
			};
		} catch (error) {
			if (acceptFundingCheckRunId !== runId) {
				return;
			}

			const feedback = describeServiceContractPreflightFailure(
				'preflight_failed',
				error instanceof Error
					? error.message
					: translateOrFallback(
							'dashboard.service_requests.accept_drawer.prepare_error',
							'Unable to prepare this proposal acceptance right now.'
						)
			);

			acceptPreflightErrorMessage = feedback.message;
			acceptPreflightErrorHint = feedback.hint ?? '';
			acceptFundingCheck = {
				status: 'error',
				errorCode: 'preflight_failed',
				message: feedback.message,
				hint: feedback.hint,
				btcPrice: null,
				totalRequiredUsd: null,
				totalRequiredSats: ''
			};
		} finally {
			if (acceptFundingCheckRunId === runId) {
				acceptFundingCheckInFlight = false;
			}
		}
	}

	async function viewContract(escrowId: string) {
		const nextUrl = createDashboardUrl(new URL('/dashboard', window.location.origin), {
			tab: 'contracts',
			context: 'services',
			highlight: escrowId
		});
		await goto(resolve(`${nextUrl.pathname}${nextUrl.search}`));
	}

	async function deleteRequest(timeline: ServiceQuoteTimelineEntry) {
		if (deletePendingRequestId) {
			return false;
		}

		deletePendingRequestId = timeline.request.content.quoteRequestId;
		try {
			const result = await serviceQuoteUiStore.deleteTaskerRequest({
				quoteRequestId: timeline.request.content.quoteRequestId
			});

			if (!result.success) {
				requestActionError =
					result.error ??
					getRequestActionErrorMessage(
						'delete',
						'Unable to delete this service request right now.'
					);
				return false;
			}

			if (requestDrawerRequestId === timeline.request.content.quoteRequestId) {
				closeRequestDrawer();
			}

			return true;
		} finally {
			deletePendingRequestId = null;
		}
	}

	const showDrawerAcceptActions = $derived(canShowAcceptActions(requestDrawerTimeline));
	const showDrawerDeclineAction = $derived(canShowDeclineAction(requestDrawerTimeline));
	const showDrawerDeleteAction = $derived(canShowDeleteAction(requestDrawerTimeline));
	const acceptDrawerCanConfirm = $derived.by(
		() =>
			Boolean(acceptDrawerTimeline?.latestProposal) &&
			canShowAcceptActions(acceptDrawerTimeline) &&
			!isActionUnavailableForTimeline(acceptDrawerTimeline) &&
			acceptWalletVerificationStatus === 'ready'
	);

	const confirmationModalConfig = $derived.by(() => {
		if (!confirmationModalState) {
			return null;
		}

		switch (confirmationModalState.action) {
			case 'decline':
				return {
					title: translateOrFallback(
						'dashboard.service_requests.confirm.decline_title',
						'Decline proposal'
					),
					message: translateOrFallback(
						'dashboard.service_requests.confirm.decline_message',
						'This will mark the current proposal as declined.'
					),
					confirmText: translateOrFallback(
						'dashboard.service_requests.confirm.decline_confirm',
						'Confirm Decline'
					),
					confirmButtonClass: 'btn-warning'
				};
			case 'delete':
				return {
					title: translateOrFallback(
						'dashboard.service_requests.delete_modal.title',
						'Delete service request'
					),
					message: translateOrFallback(
						'dashboard.service_requests.delete_modal.intro',
						'This will permanently remove this service request from your dashboard history.'
					),
					confirmText: translateOrFallback(
						'dashboard.service_requests.delete_modal.confirm',
						'Confirm Delete'
					),
					confirmButtonClass: 'btn-error'
				};
		}
	});

	async function handleConfirmedAction() {
		if (!confirmationModalState) {
			return;
		}

		const { action, requestId } = confirmationModalState;
		const timeline =
			timelines.find((entry) => entry.request.content.quoteRequestId === requestId) ?? null;

		if (!timeline) {
			confirmationModalState = null;
			return;
		}

		const success =
			action === 'decline'
				? await applyStatus(timeline, 'declined')
				: await deleteRequest(timeline);

		if (success) {
			confirmationModalState = null;
		}
	}

	$effect(() => {
		const timeline = acceptDrawerTimeline;
		if (!timeline?.latestProposal) {
			clearAcceptFundingCheckState();
			return;
		}

		void refreshAcceptFundingCheck(timeline);
	});
</script>

<section data-testid="my-quotes-panel" class="space-y-4">
	<div class="border-base-300/60 bg-base-100/40 mt-2 rounded-3xl border p-4 shadow-sm">
		<div class="mb-3 flex items-center justify-between gap-2">
			<div>
				<p class="text-base-content/70 text-xs font-semibold tracking-wide uppercase">
					{translateOrFallback(
						'dashboard.service_requests.status_heading',
						'Filter by request status'
					)}
				</p>
			</div>

			<button
				class="btn btn-ghost btn-sm sm:btn-outline gap-2"
				type="button"
				onclick={handleRefresh}
				disabled={isSyncing || !onRetry || hasPendingMutation}
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
			<div class="status-dropdown-container relative" bind:this={statusDropdownContainer}>
				<button
					bind:this={statusDropdownButton}
					type="button"
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
					onclick={toggleDropdown}
					onkeydown={handleStatusTriggerKeydown}
					disabled={hasPendingMutation}
					aria-expanded={isDropdownOpen}
					aria-controls="service-requests-filter-listbox"
					aria-haspopup="listbox"
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
						id="service-requests-filter-listbox"
						role="listbox"
						aria-label={translateOrFallback(
							'dashboard.service_requests.status_heading',
							'Filter by request status'
						)}
						class="border-base-300 bg-base-100 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
					>
						{#each filterOptions as option, index (option.id)}
							{@const IconComponent = option.icon}
							<button
								type="button"
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
								disabled={hasPendingMutation}
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
			<div
				class="flex flex-wrap gap-3"
				role="group"
				aria-label={translateOrFallback(
					'dashboard.service_requests.status_heading',
					'Filter by request status'
				)}
			>
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
						aria-pressed={activeFilter === option.id}
						disabled={hasPendingMutation}
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

	{#if hasServiceLookupErrors}
		<div
			class="alert alert-outline alert-warning text-sm"
			data-testid="my-quotes-service-lookup-alert"
		>
			<span>
				{translateOrFallback(
					'dashboard.service_requests.alerts.service_lookup_failed',
					'Some service details could not be refreshed. Retry before acting on those requests.'
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
							{translateOrFallback('common.buttons.retry', 'Retry')}
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<div class="alert alert-outline alert-error flex items-center justify-between gap-3 text-sm">
				<span>{loadError}</span>
				{#if onRetry}
					<button type="button" class="btn btn-ghost btn-xs" onclick={onRetry} disabled={isSyncing}>
						{translateOrFallback('common.buttons.retry', 'Retry')}
					</button>
				{/if}
			</div>
		{/if}
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
					icon={IconBriefcaseOutline}
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
				icon={IconBriefcaseOutline}
				title={translateOrFallback(
					'dashboard.service_requests.empty_filtered',
					'No service requests match this status yet.'
				)}
				description={translateOrFallback(
					'dashboard.service_requests.empty_filtered_description',
					'Try a different status filter to review the rest of your service requests.'
				)}
				actionLabel={translateOrFallback('find_tasks.clear_filters', 'Clear Filters')}
				actionIcon={IconRefresh}
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
					service={serviceByAddress[timeline.request.content.serviceAddress] ?? null}
					serviceLookupFailed={serviceLookupErrorByAddress[
						timeline.request.content.serviceAddress
					] === true}
					serviceUnavailable={serviceUnavailableByAddress[
						timeline.request.content.serviceAddress
					] === true}
				/>
			{/each}
		</div>
	{/if}
</section>

<ServiceRequestDrawer
	isOpen={requestDrawerTimeline !== null && acceptDrawerTimeline === null}
	timeline={requestDrawerTimeline}
	service={requestDrawerTimeline
		? (serviceByAddress[requestDrawerTimeline.request.content.serviceAddress] ?? null)
		: null}
	serviceLookupFailed={requestDrawerTimeline
		? serviceLookupErrorByAddress[requestDrawerTimeline.request.content.serviceAddress] === true
		: false}
	serviceUnavailable={requestDrawerTimeline
		? serviceUnavailableByAddress[requestDrawerTimeline.request.content.serviceAddress] === true
		: false}
	loading={requestDrawerTimeline
		? serviceLoadedByAddress[requestDrawerTimeline.request.content.serviceAddress] !== true
		: false}
	showAcceptActions={showDrawerAcceptActions}
	showDeclineAction={showDrawerDeclineAction}
	showDeleteAction={showDrawerDeleteAction}
	actionsDisabled={actionsUnavailable}
	deleteDisabled={deleteUnavailable ||
		(requestDrawerTimeline
			? deletePendingRequestId === requestDrawerTimeline.request.content.quoteRequestId
			: false)}
	{actionPending}
	deletePending={requestDrawerTimeline
		? deletePendingRequestId === requestDrawerTimeline.request.content.quoteRequestId
		: false}
	actionError={requestActionError}
	onAccept={() => openAcceptDrawer(requestDrawerTimeline)}
	onDecline={() => openConfirmationModal('decline', requestDrawerTimeline)}
	onDelete={() => openConfirmationModal('delete', requestDrawerTimeline)}
	onClose={closeRequestDrawer}
/>

{#if acceptDrawerTimeline}
	<ServiceRequestAcceptanceDrawer
		open={true}
		timeline={acceptDrawerTimeline}
		service={serviceByAddress[acceptDrawerTimeline.request.content.serviceAddress] ?? null}
		isSubmitting={actionPending === 'accept'}
		disabled={!acceptDrawerCanConfirm}
		errorMessage={acceptDrawerErrorMessage}
		errorHint={acceptDrawerErrorHint}
		walletLoading={acceptFundingCheckInFlight}
		walletConnected={$walletStore.rsk.connected}
		walletBalanceSats={walletBalanceSatsLabel}
		walletBalanceUsd={walletBalanceUsdLabel}
		requiredBalanceSats={acceptFundingCheck?.totalRequiredSats ?? ''}
		requiredBalanceUsd={acceptRequiredUsdLabel}
		walletVerificationStatus={acceptWalletVerificationStatus}
		walletVerificationMessage={acceptWalletVerificationMessage}
		onRetry={() => {
			if (requestActionError && acceptDrawerTimeline) {
				void acceptProposal(acceptDrawerTimeline);
				return;
			}

			void refreshAcceptFundingCheck(acceptDrawerTimeline);
		}}
		onConfirm={() => {
			void acceptProposal(acceptDrawerTimeline);
		}}
		onClose={closeAcceptDrawer}
	/>
{/if}

<div use:createPortal={'modals'} style="position: relative; z-index: 9999;"></div>

{#if confirmationModalConfig}
	<div use:portal={'modals'}>
		<ConfirmModal
			isOpen={true}
			title={confirmationModalConfig.title}
			message={confirmationModalConfig.message}
			confirmText={confirmationModalConfig.confirmText}
			cancelText={translateOrFallback('common.cancel', 'Cancel')}
			confirmButtonClass={confirmationModalConfig.confirmButtonClass}
			onConfirm={handleConfirmedAction}
			onCancel={closeConfirmationModal}
		/>
	</div>
{/if}
