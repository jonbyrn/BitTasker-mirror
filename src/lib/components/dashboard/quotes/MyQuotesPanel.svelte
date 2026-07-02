<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import type { Component } from 'svelte';
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
	import DashboardFilterBar from '$lib/components/shared/DashboardFilterBar.svelte';
	import DashboardDropdown from '$lib/components/shared/DashboardDropdown.svelte';
	import { createPortal, portal } from '$lib/utils/portal';
	import { describeServiceContractPreflightFailure } from '$lib/utils/service-contract/preflight-feedback';
	import {
		preflightServiceContractCreation,
		type ServiceContractPreflightErrorCode
	} from '$lib/utils/service-contract/preflight';
	import { normalizeServiceContractSchedule } from '$lib/utils/service-contract/schedule';
	import { appStore } from '$lib/stores/app.store';
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
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconCloseCircleOutline from '~icons/mdi/close-circle-outline';
	import IconRefresh from '~icons/mdi/refresh';
	import IconTimerSand from '~icons/mdi/timer-sand';
	import IconUndoVariant from '~icons/mdi/undo-variant';

	const briefcaseEmptyStateIcon = IconBriefcaseOutline as Component;
	const refreshEmptyStateIcon = IconRefresh as Component;

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
		| 'all'
		| 'awaiting_proposal'
		| 'proposal_received'
		| 'needs_attention'
		| 'contract_created'
		| 'declined'
		| 'withdrawn'
		| 'expired';
	type RequestConfirmationAction = 'decline' | 'delete';

	const VALID_FILTERS: ServiceRequestFilterCategory[] = [
		'all',
		'awaiting_proposal',
		'proposal_received',
		'needs_attention',
		'contract_created',
		'declined',
		'withdrawn',
		'expired'
	];

	let actionPending = $state<'accept' | 'decline' | null>(null);
	let actionPendingRequestId = $state<string | null>(null);
	let activeFilter = $state<ServiceRequestFilterCategory>(
		status && VALID_FILTERS.includes(status as ServiceRequestFilterCategory)
			? (status as ServiceRequestFilterCategory)
			: 'all'
	);

	$effect(() => {
		if (status && VALID_FILTERS.includes(status as ServiceRequestFilterCategory)) {
			activeFilter = status as ServiceRequestFilterCategory;
		}
	});

	let acceptContractCreationBackgrounded = $state(false);
	let acceptContractCreationRequestId = $state<string | null>(null);
	let acceptContractCreationTimelineSnapshot = $state<ServiceQuoteTimelineEntry | null>(null);
	let acceptDrawerRequestId = $state<string | null>(null);
	let acceptDrawerTimelineSnapshot = $state<ServiceQuoteTimelineEntry | null>(null);
	let acceptFundingCheck = $state<AcceptProposalFundingCheck | null>(null);
	let acceptFundingCheckInFlight = $state(false);
	let acceptFundingCheckRunId = 0;
	let acceptPreflightErrorHint = $state('');
	let acceptPreflightErrorMessage = $state('');
	let deletePendingRequestId = $state<string | null>(null);
	let dismissedFocusedRequestId = $state<string | null>(null);
	let requestDrawerRequestId = $state<string | null>(null);
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
				) ??
				(acceptDrawerTimelineSnapshot?.request.content.quoteRequestId === acceptDrawerRequestId
					? acceptDrawerTimelineSnapshot
					: null))
			: null
	);
	const acceptContractCreationTimeline = $derived.by(() =>
		acceptContractCreationRequestId
			? (timelines.find(
					(timeline) => timeline.request.content.quoteRequestId === acceptContractCreationRequestId
				) ??
				(acceptContractCreationTimelineSnapshot?.request.content.quoteRequestId ===
				acceptContractCreationRequestId
					? acceptContractCreationTimelineSnapshot
					: null))
			: null
	);

	$effect(() => {
		if (!acceptDrawerRequestId) {
			acceptDrawerTimelineSnapshot = null;
			return;
		}

		const currentTimeline =
			timelines.find(
				(timeline) => timeline.request.content.quoteRequestId === acceptDrawerRequestId
			) ?? null;
		if (currentTimeline) {
			acceptDrawerTimelineSnapshot = currentTimeline;
		}
	});

	$effect(() => {
		if (!acceptContractCreationRequestId) {
			acceptContractCreationTimelineSnapshot = null;
			return;
		}

		const currentTimeline =
			timelines.find(
				(timeline) => timeline.request.content.quoteRequestId === acceptContractCreationRequestId
			) ?? null;
		if (currentTimeline) {
			acceptContractCreationTimelineSnapshot = currentTimeline;
		}
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
			case 'contract_sync_pending':
				return 'contract_created';
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
				return timeline.latestProposal ? 'proposal_received' : 'awaiting_proposal';
		}
	}

	const filteredTimelines = $derived.by(() => {
		if (activeFilter === 'all') {
			return timelines;
		}

		return timelines.filter((timeline) => getTimelineFilterCategory(timeline) === activeFilter);
	});

	const filterOptions = $derived([
		{ id: 'all', label: translateOrFallback('dashboard.contracts.all_statuses', 'All statuses') },
		{
			id: 'awaiting_proposal',
			label: translateOrFallback(
				'dashboard.service_requests.filter.awaiting_proposal',
				'Awaiting proposal'
			),
			icon: IconClockOutline
		},
		{
			id: 'proposal_received',
			label: translateOrFallback(
				'dashboard.service_requests.filter.proposal_received',
				'Proposal received'
			),
			icon: IconCheckCircleOutline
		},
		{
			id: 'needs_attention',
			label: translateOrFallback(
				'dashboard.service_requests.filter.needs_attention',
				'Needs attention'
			),
			icon: IconUndoVariant
		},
		{
			id: 'contract_created',
			label: translateOrFallback(
				'dashboard.service_requests.filter.contract_created',
				'Contract created'
			),
			icon: IconCheck
		},
		{
			id: 'declined',
			label: translateOrFallback('dashboard.service_requests.filter.declined', 'Declined'),
			icon: IconCloseCircleOutline
		},
		{
			id: 'withdrawn',
			label: translateOrFallback('dashboard.service_requests.filter.withdrawn', 'Withdrawn'),
			icon: IconUndoVariant
		},
		{
			id: 'expired',
			label: translateOrFallback('dashboard.service_requests.filter.expired', 'Expired'),
			icon: IconTimerSand
		}
	]);

	function getPreferredFilter(): ServiceRequestFilterCategory {
		const focusedTimelineEntry =
			(focusedRequestId
				? timelines.find((timeline) => timeline.request.content.quoteRequestId === focusedRequestId)
				: null) ?? selectedTimeline;

		if (focusedTimelineEntry) {
			return getTimelineFilterCategory(focusedTimelineEntry);
		}

		return (
			VALID_FILTERS.find((filter) =>
				timelines.some((timeline) => getTimelineFilterCategory(timeline) === filter)
			) ?? 'all'
		);
	}

	$effect(() => {
		untrack(() => {
			if (activeFilter === 'all' || !VALID_FILTERS.includes(activeFilter)) {
				activeFilter = getPreferredFilter();
			}
		});
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

		const focusedTimelineMatch =
			timelines.find((timeline) => timeline.request.content.quoteRequestId === focusedRequestId) ??
			null;

		if (!focusedTimelineMatch && hasLoaded && !isSyncing) {
			onInvalidFocusedRequest?.();
			return;
		}

		if (!focusedTimelineMatch) {
			return;
		}

		if (requestDrawerRequestId === focusedRequestId) {
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

	const isFilterActive = $derived(activeFilter !== 'all');

	function handleFilterChange(nextStatus: ServiceRequestFilterCategory) {
		activeFilter = nextStatus;
		const nextUrl = createDashboardUrl(new URL(window.location.href), {
			tab: 'service-requests',
			status: nextStatus === 'all' ? null : nextStatus
		});
		void goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
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
			const results = await Promise.all(
				serviceAddresses.map(async (serviceAddress) => {
					if (existingServiceLoadedByAddress[serviceAddress]) {
						return {
							serviceAddress,
							service: existingServiceByAddress[serviceAddress] ?? null,
							lookupError: existingServiceLookupErrorByAddress[serviceAddress] ?? false
						};
					}

					try {
						const { dTag } = parseServiceAddress(serviceAddress);
						const service = await findServiceByUniqueId(dTag);
						return { serviceAddress, service, lookupError: false };
					} catch (err) {
						console.error(`Failed to lookup service ${serviceAddress}:`, err);
						return { serviceAddress, service: null, lookupError: true };
					}
				})
			);

			if (!cancelled) {
				const entries = results.map(({ serviceAddress, service, lookupError }) => ({
					serviceAddress,
					service,
					lookupError
				}));

				serviceByAddress = Object.fromEntries(
					entries.map(({ serviceAddress, service }) => [serviceAddress, service])
				);
				serviceLookupErrorByAddress = Object.fromEntries(
					entries.map(({ serviceAddress, lookupError }) => [serviceAddress, lookupError])
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

		return timeline.resolvedStatus === 'pending' || timeline.resolvedStatus === 'accept_failed';
	}

	function canShowDeleteAction(timeline: ServiceQuoteTimelineEntry | null): boolean {
		if (timeline?.linkedEscrowId) {
			return false;
		}

		return (
			timeline?.resolvedStatus === 'pending' ||
			timeline?.resolvedStatus === 'declined' ||
			timeline?.resolvedStatus === 'withdrawn' ||
			timeline?.resolvedStatus === 'expired'
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
					const escrowId = timeline.linkedEscrowId;
					if (!escrowId) return;
					viewContract(escrowId);
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
		acceptDrawerTimelineSnapshot = timeline;
		acceptDrawerRequestId = timeline.request.content.quoteRequestId;
		requestDrawerRequestId = null;
		selectTimeline(timeline.request.content.quoteRequestId);
	}

	function closeAcceptDrawer(force = false, options: { clearRequestFocus?: boolean } = {}) {
		if (!force && actionPending === 'accept') {
			return;
		}

		const shouldBackgroundProgress =
			!force &&
			acceptContractCreationRequestId === acceptDrawerRequestId &&
			acceptContractCreationStatus === 'creating';
		if (shouldBackgroundProgress) {
			acceptContractCreationBackgrounded = true;
		}

		dismissFocusedRequest(acceptDrawerRequestId);
		clearAcceptFundingCheckState();
		requestActionError = null;
		acceptDrawerRequestId = null;
		acceptDrawerTimelineSnapshot = null;
		const clearRequestFocus = options.clearRequestFocus ?? true;
		if (clearRequestFocus && onRequestClear) {
			void onRequestClear();
			return;
		}
		if (clearRequestFocus) {
			onRequestFocusChange?.(null);
		}
	}

	function clearAcceptContractCreationState() {
		acceptContractCreationBackgrounded = false;
		acceptContractCreationRequestId = null;
		acceptContractCreationTimelineSnapshot = null;
	}

	async function completeAcceptedRequest(escrowId: string) {
		const backgrounded = acceptContractCreationBackgrounded || !acceptDrawerRequestId;
		clearAcceptContractCreationState();
		closeAcceptDrawer(true, { clearRequestFocus: backgrounded });
		requestDrawerRequestId = null;
		appStore.showSuccessToast(
			translateOrFallback(
				backgrounded
					? 'dashboard.service_requests.messages.acceptance_complete_background'
					: 'dashboard.service_requests.messages.acceptance_complete',
				backgrounded
					? 'Proposal accepted. Your service contract is ready in Contracts.'
					: 'Proposal accepted. Opening your service contract.'
			)
		);
		if (!backgrounded) {
			await viewContract(escrowId);
		}
	}

	function finalizeAcceptanceProgressWithoutContract(message: string, severity: 'info' | 'error') {
		clearAcceptContractCreationState();
		closeAcceptDrawer(true);
		requestDrawerRequestId = null;
		if (severity === 'info') {
			appStore.showInfoToast(message);
			return;
		}
		appStore.showErrorToast(message);
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

			acceptContractCreationBackgrounded = false;
			acceptContractCreationRequestId = timeline.request.content.quoteRequestId;
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
					freelancerFeeTier: (latestProposal.content.freelancerFeeTier || 1) as 1 | 2 | 3
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
		const nextUrl = createDashboardUrl(new URL('/hiring', window.location.origin), {
			tab: 'contracts',
			type: 'services',
			highlight: escrowId
		});
		await goto(`${nextUrl.pathname}${nextUrl.search}`);
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

		if (showAcceptContractCreationProgress) {
			return;
		}

		void refreshAcceptFundingCheck(timeline);
	});

	$effect(() => {
		const timeline = acceptContractCreationTimeline;
		if (!acceptContractCreationRequestId || !timeline) {
			return;
		}

		if (timeline.linkedEscrowId) {
			void completeAcceptedRequest(timeline.linkedEscrowId);
			return;
		}

		if (timeline.resolvedStatus === 'contract_sync_pending') {
			finalizeAcceptanceProgressWithoutContract(
				timeline.resolvedTerminalEvent?.content.message ??
					translateOrFallback(
						'dashboard.service_requests.messages.contract_sync_pending',
						'The funded service contract is still syncing across relays. Open Contracts to monitor it.'
					),
				'info'
			);
			return;
		}

		if (timeline.resolvedStatus === 'accept_unknown') {
			finalizeAcceptanceProgressWithoutContract(
				timeline.resolvedTerminalEvent?.content.message ??
					translateOrFallback(
						'dashboard.service_requests.messages.acceptance_submitted',
						'Acceptance submitted. The funded contract will appear here once escrow creation is confirmed.'
					),
				'info'
			);
			return;
		}

		if (timeline.resolvedStatus === 'accept_failed') {
			finalizeAcceptanceProgressWithoutContract(
				timeline.resolvedTerminalEvent?.content.message ??
					getRequestActionErrorMessage('accept', 'Unable to accept this proposal right now.'),
				'error'
			);
		}
	});

	const actionsUnavailable = $derived(isActionUnavailableForTimeline(requestDrawerTimeline));
	const deleteUnavailable = $derived(isActionUnavailableForTimeline(requestDrawerTimeline));
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
	const acceptContractCreationStatus = $derived.by(() => {
		const timeline = acceptContractCreationTimeline;
		if (!acceptContractCreationRequestId || !timeline) {
			return 'idle' as const;
		}

		if (timeline.linkedEscrowId) {
			return 'success' as const;
		}

		return 'creating' as const;
	});
	const showAcceptContractCreationProgress = $derived.by(
		() =>
			Boolean(acceptDrawerRequestId) &&
			acceptContractCreationRequestId === acceptDrawerRequestId &&
			acceptContractCreationStatus !== 'idle'
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

	function clearFilters() {
		handleFilterChange('all');
	}
</script>

<section data-testid="my-quotes-panel" class="space-y-4">
	<DashboardFilterBar
		onRefresh={handleRefresh}
		isRefreshing={isSyncing}
		refreshDisabled={!onRetry || hasPendingMutation}
	>
		{@const dropdownOptions = filterOptions as unknown as {
			id: ServiceRequestFilterCategory;
			label: string;
			icon?: Component;
		}[]}
		<DashboardDropdown
			options={dropdownOptions}
			value={activeFilter}
			onSelect={handleFilterChange}
			containerClass="col-span-2 sm:w-64"
		/>
	</DashboardFilterBar>

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

	{#if filteredTimelines.length === 0}
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
					title={!isFilterActive
						? translateOrFallback(
								'dashboard.service_requests.empty',
								"You haven't submitted any service requests yet."
							)
						: translateOrFallback(
								'dashboard.service_requests.empty_filtered',
								'No service requests match this status yet.'
							)}
					description={!isFilterActive
						? ''
						: translateOrFallback(
								'dashboard.service_requests.empty_filtered_description',
								'Try a different status filter to review the rest of your service requests.'
							)}
					actionLabel={!isFilterActive
						? translateOrFallback('dashboard.find_services', 'Find Services')
						: translateOrFallback('dashboard.contracts.clear_filters', 'Clear Filters')}
					actionHref={!isFilterActive ? '/services' : null}
					actionIcon={!isFilterActive ? briefcaseEmptyStateIcon : refreshEmptyStateIcon}
					onAction={!isFilterActive ? undefined : clearFilters}
					testId="my-quotes-empty-state"
				/>
			</div>
		{/if}
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
		showContractCreationProgress={showAcceptContractCreationProgress}
		contractCreationStatus={acceptContractCreationStatus === 'success' ? 'success' : 'creating'}
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
