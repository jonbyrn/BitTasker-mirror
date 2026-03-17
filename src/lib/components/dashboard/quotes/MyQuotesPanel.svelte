<script lang="ts">
	import { goto } from '$app/navigation';
	import DashboardQuoteCard from './DashboardQuoteCard.svelte';
	import ServiceAgreementSummary from '$lib/components/contracts/ServiceAgreementSummary.svelte';
	import { buildServiceQuoteAgreementSummary } from '$lib/utils/service-quote/agreement-summary';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';
	import { buildServiceQuoteReentryUrl } from '$lib/utils/service-quote/reentry';
	import { describeServiceContractPreflightFailure } from '$lib/utils/service-contract/preflight-feedback';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import {
		getTaskerDataFreshness,
		serviceQuoteUiStore
	} from '$lib/stores/service-quote-ui.store';

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
	}

	let actionError = $state<string | null>(null);
	let actionHint = $state<string | null>(null);
	let actionMessage = $state<string | null>(null);
	let actionPending = $state<'accept' | 'decline' | null>(null);

	const selectedTimeline = $derived.by(() => {
		if (focusedRequestId) {
			return timelines.find((timeline) => timeline.request.content.quoteRequestId === focusedRequestId) ?? null;
		}
		return timelines[0] ?? null;
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
	const actionsUnavailable = $derived(
		isSyncing || Boolean(loadError) || isOffline || taskerDataIsStale || showPartialSyncAlert
	);
	const selectedProposalSummary = $derived(buildServiceQuoteAgreementSummary(selectedTimeline));

	function describeStatus(timeline: ServiceQuoteTimelineEntry): string {
		switch (timeline.resolvedStatus) {
			case 'accepted':
				return 'Contract created';
			case 'declined':
				return 'Declined';
			case 'withdrawn':
				return 'Withdrawn';
			case 'expired':
				return 'Expired';
			case 'accepting':
				return 'Accepting';
			case 'accept_failed':
				return 'Accept failed';
			case 'accept_unknown':
				return 'Accept unknown';
			default:
				return timeline.latestProposal ? 'Proposal received' : 'Awaiting proposal';
		}
	}

	function getQuoteActionButtons(timeline: ServiceQuoteTimelineEntry): ActionButton[] {
		const buttons: ActionButton[] = [];

		// View button - always available
		buttons.push({
			label: 'View',
			class: 'btn-ghost',
			onclick: (e) => {
				e.stopPropagation();
				selectTimeline(timeline.request.content.quoteRequestId);
			},
			icon: 'view'
		});

		// Accept button - only if proposal exists and not yet accepted
		if (timeline.latestProposal && !timeline.linkedEscrowId && showAcceptActions) {
			buttons.push({
				label: 'Accept',
				class: 'btn-success',
				onclick: (e) => {
					e.stopPropagation();
					selectTimeline(timeline.request.content.quoteRequestId);
					acceptProposal();
				},
				icon: 'accept'
			});
		}

		// Decline button - only if proposal exists and not yet accepted
		if (timeline.latestProposal && !timeline.linkedEscrowId && showAcceptActions) {
			buttons.push({
				label: 'Decline',
				class: 'btn-ghost',
				onclick: (e) => {
					e.stopPropagation();
					selectTimeline(timeline.request.content.quoteRequestId);
					applyStatus('declined');
				},
				icon: 'decline'
			});
		}

		// View Contract button - only if contract exists
		if (timeline.linkedEscrowId) {
			buttons.push({
				label: 'View Contract',
				class: 'btn-primary',
				onclick: (e) => {
					e.stopPropagation();
					viewContract(timeline.linkedEscrowId);
				},
				icon: 'contract'
			});
		}

		return buttons;
	}

	function selectTimeline(requestId: string) {
		actionError = null;
		actionHint = null;
		actionMessage = null;
		onRequestFocusChange?.(requestId);
	}

	async function applyStatus(status: 'declined') {
		if (!selectedTimeline?.latestProposal || actionPending || actionsUnavailable) return;
		actionError = null;
		actionHint = null;
		actionMessage = null;
		actionPending = 'decline';
		try {
			const result = await serviceQuoteUiStore.applyTaskerStatus({
				quoteRequestId: selectedTimeline.request.content.quoteRequestId,
				proposalId: selectedTimeline.latestProposal.content.proposalId,
				status
			});
			if (!result.success) {
				actionError = result.error || 'Unable to update quote status.';
			}
		} finally {
			actionPending = null;
		}
	}

	async function acceptProposal() {
		if (!selectedTimeline?.latestProposal || actionPending || actionsUnavailable) return;
		actionError = null;
		actionHint = null;
		actionMessage = null;
		actionPending = 'accept';
		try {
			const result = await serviceQuoteUiStore.acceptTaskerProposal({
				quoteRequestId: selectedTimeline.request.content.quoteRequestId,
				proposalId: selectedTimeline.latestProposal.content.proposalId
			});
			if (!result.success) {
				const feedback = describeServiceContractPreflightFailure(result.errorCode, result.error);
				actionError = feedback.message;
				actionHint = feedback.hint;
				return;
			}

			actionMessage =
				'Acceptance submitted. The funded contract will appear here once escrow creation is confirmed.';
		} finally {
			actionPending = null;
		}
	}

	async function returnToService() {
		if (!selectedTimeline) return;
		await goto(
			buildServiceQuoteReentryUrl(selectedTimeline.request.content.serviceAddress, {
				openRequestQuote: true,
				tierId: selectedTimeline.request.content.tierId,
				selectedAddOnIds: selectedTimeline.request.content.selectedAddOns ?? []
			})
		);
	}

	async function viewContract(escrowId: string) {
		const nextUrl = createDashboardUrl(new URL('/dashboard', window.location.origin), {
			tab: 'contracts',
			context: 'services',
			highlight: escrowId
		});
		await goto(`${nextUrl.pathname}${nextUrl.search}`);
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
	{#if isSyncing}
		<div class="alert alert-info text-sm">
			<span>Syncing your latest quote request…</span>
		</div>
	{/if}

	{#if showPartialSyncAlert}
		<div class="alert alert-warning text-sm" data-testid="my-quotes-partial-alert">
			<span>
				Latest quote thread data is still propagating across relays. Showing partial results until the thread finishes syncing.
			</span>
		</div>
	{:else if taskerDataIsStale}
		<div class="alert alert-warning text-sm" data-testid="my-quotes-stale-alert">
			<span>
				Showing your last known quote data. Refresh before acting on proposals because the latest relay sync did not complete.
			</span>
		</div>
	{/if}

	{#if isOffline}
		<div class="alert alert-warning text-sm" data-testid="my-quotes-offline-alert">
			<span>You are offline. Reconnect before reviewing or acting on quote proposals.</span>
		</div>
	{:else if showReconnectNotice}
		<div class="alert alert-info text-sm" data-testid="my-quotes-reconnect-alert">
			<span>Back online. Retry if the latest quote status has not refreshed yet.</span>
		</div>
	{/if}

	{#if loadError}
		<div class="alert alert-error flex items-center justify-between gap-3 text-sm">
			<span>{loadError}</span>
			{#if onRetry}
				<button type="button" class="btn btn-ghost btn-xs" onclick={onRetry} disabled={isSyncing}>
					Retry
				</button>
			{/if}
		</div>
	{/if}

	{#if timelines.length === 0}
		<div class="rounded-xl border border-dashed border-base-300 p-6 text-sm text-base-content/70">
			{#if !hasLoaded && isSyncing}
				Loading your quote requests...
			{:else if loadError}
				Retry to load your quote requests.
			{:else}
				No quote requests have been submitted yet.
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-5">
			{#each timelines as timeline (timeline.request.id)}
				<DashboardQuoteCard {timeline} getActionButtons={getQuoteActionButtons} />
			{/each}
		</div>
	{/if}
</section>
