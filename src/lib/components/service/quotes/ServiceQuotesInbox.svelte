<script lang="ts">
	import { goto } from '$app/navigation';
	import ServiceAgreementSummary from '$lib/components/contracts/ServiceAgreementSummary.svelte';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import { buildServiceQuoteAgreementSummary } from '$lib/utils/service-quote/agreement-summary';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import {
		getProviderDataFreshness,
		serviceQuoteUiStore
	} from '$lib/stores/service-quote-ui.store';
	import ServiceProposalComposer, {
		type ServiceProposalComposerSubmitPayload
	} from './ServiceProposalComposer.svelte';

	let {
		serviceLabel = null,
		showServiceTitles = false,
		serviceTitleByAddress = {},
		timelines = [],
		focusedRequestId = null,
		isSyncing = false,
		hasLoaded = true,
		loadError = null,
		walletReady = false,
		feeTierReady = false,
		onRetry,
		onRequestFocusChange,
		onInvalidFocusedRequest,
		onSendProposal
	}: {
		serviceLabel?: string | null;
		showServiceTitles?: boolean;
		serviceTitleByAddress?: Record<string, string>;
		timelines?: ServiceQuoteTimelineEntry[];
		focusedRequestId?: string | null;
		isSyncing?: boolean;
		hasLoaded?: boolean;
		loadError?: string | null;
		walletReady?: boolean;
		feeTierReady?: boolean;
		onRetry?: (() => void | Promise<void>) | undefined;
		onRequestFocusChange?: (requestId: string | null) => void;
		onInvalidFocusedRequest?: () => void;
		onSendProposal?: (
			requestId: string,
			payload: ServiceProposalComposerSubmitPayload
		) =>
			| Promise<{ success: boolean; error?: string } | void>
			| { success: boolean; error?: string }
			| void;
	} = $props();

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

	$effect(() => {
		if (focusedRequestId && !selectedTimeline && !isSyncing && hasLoaded) {
			onInvalidFocusedRequest?.();
		}
	});

	const isOffline = $derived(!$browserNetworkStatus.online);
	const showReconnectNotice = $derived(
		$browserNetworkStatus.online && $browserNetworkStatus.lastTransition === 'online'
	);
	const freshnessServiceAddress = $derived(
		selectedTimeline?.request.content.serviceAddress ??
			timelines[0]?.request.content.serviceAddress ??
			null
	);
	const providerDataFreshness = $derived(
		getProviderDataFreshness($serviceQuoteUiStore, freshnessServiceAddress)
	);
	const providerDataIsStale = $derived(providerDataFreshness === 'stale');
	const providerDataIsPartial = $derived(providerDataFreshness === 'partial');
	const showPartialSyncAlert = $derived(
		providerDataIsPartial ||
			(Boolean(focusedRequestId) && hasLoaded && isSyncing && !selectedTimeline)
	);
	const composerBlockedReason = $derived.by(() => {
		if (isOffline) {
			return 'You are offline. Reconnect before sending a proposal.';
		}
		if (providerDataIsStale) {
			return 'Showing stale quote data. Refresh before sending a proposal.';
		}
		if (showPartialSyncAlert) {
			return 'Quote data is still propagating across relays. Sending is disabled until the latest request thread is fully synced.';
		}
		if (loadError) {
			return 'Quote data is unavailable right now. Retry before sending a proposal.';
		}
		if (isSyncing) {
			return 'Quote data is still syncing. Sending is disabled until the latest request state loads.';
		}
		return null;
	});
	const selectedProposalSummary = $derived(buildServiceQuoteAgreementSummary(selectedTimeline));
	const selectedTimelineExpired = $derived(
		selectedTimeline?.isExpired === true || selectedTimeline?.resolvedStatus === 'expired'
	);

	function selectTimeline(requestId: string) {
		onRequestFocusChange?.(requestId);
	}

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
				return timeline.latestProposal ? 'Proposal sent' : 'Pending';
		}
	}

	async function handleProposalSubmit(payload: ServiceProposalComposerSubmitPayload) {
		if (!selectedTimeline || !onSendProposal) {
			return { success: false, error: 'Select a request before sending a proposal.' };
		}
		return onSendProposal(selectedTimeline.request.content.quoteRequestId, payload);
	}

	async function viewContract(escrowId: string) {
		const nextUrl = createDashboardUrl(new URL(window.location.href), {
			tab: 'contracts',
			context: 'services',
			highlight: escrowId
		});
		await goto(`${nextUrl.pathname}${nextUrl.search}`);
	}
</script>

<section class="space-y-4" data-testid="service-quotes-inbox">
	<div class="border-base-300 bg-base-100 rounded-2xl border p-4 shadow-sm">
		<div class="mb-4">
			<h4 class="text-sm font-semibold">Quotes Inbox</h4>
			<p class="text-base-content/70 mt-1 text-sm">
				{serviceLabel
					? `Service: ${serviceLabel}`
					: 'Select a service to review incoming requests.'}
			</p>
		</div>

		{#if isSyncing}
			<div class="alert alert-info mb-4 text-sm">
				<span>Syncing the requested thread…</span>
			</div>
		{/if}

		{#if showPartialSyncAlert}
			<div class="alert alert-warning mb-4 text-sm" data-testid="service-quotes-partial-alert">
				<span>
					Latest request-thread data is still propagating across relays. Showing partial results
					until the sync completes.
				</span>
			</div>
		{:else if providerDataIsStale}
			<div class="alert alert-warning mb-4 text-sm" data-testid="service-quotes-stale-alert">
				<span>
					Showing the last known quote data for this service. Refresh before sending a proposal
					because the latest relay sync did not complete.
				</span>
			</div>
		{/if}

		{#if isOffline}
			<div class="alert alert-warning mb-4 text-sm" data-testid="service-quotes-offline-alert">
				<span>You are offline. Reconnect before replying to quote requests.</span>
			</div>
		{:else if showReconnectNotice}
			<div class="alert alert-info mb-4 text-sm" data-testid="service-quotes-reconnect-alert">
				<span>Back online. Retry if the latest request thread has not refreshed yet.</span>
			</div>
		{/if}

		{#if loadError}
			<div class="alert alert-error mb-4 flex items-center justify-between gap-3 text-sm">
				<span>{loadError}</span>
				{#if onRetry}
					<button type="button" class="btn btn-ghost btn-xs" onclick={onRetry} disabled={isSyncing}>
						Retry
					</button>
				{/if}
			</div>
		{/if}

		{#if timelines.length === 0}
			<div class="border-base-300 text-base-content/70 rounded-xl border border-dashed p-6 text-sm">
				{#if !hasLoaded && isSyncing}
					Loading quote requests for this service...
				{:else if loadError}
					Retry to load quote requests for this service.
				{:else}
					No quote requests are available for this service yet.
				{/if}
			</div>
		{:else}
			<div class="space-y-3">
				{#each timelines as timeline (timeline.request.id)}
					<button
						type="button"
						class={`w-full rounded-xl border p-4 text-left transition ${
							selectedTimeline?.request.id === timeline.request.id
								? 'border-primary bg-primary/5'
								: 'border-base-300 bg-base-100'
						}`}
						onclick={() => selectTimeline(timeline.request.content.quoteRequestId)}
					>
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="font-medium">{timeline.request.content.inquiry.title}</p>
								{#if showServiceTitles}
									<p class="text-base-content/50 mt-1 text-xs tracking-wide uppercase">
										{serviceTitleByAddress[timeline.request.content.serviceAddress] ??
											timeline.request.content.serviceAddress}
									</p>
								{/if}
								<p class="text-base-content/70 mt-1 line-clamp-2 text-sm">
									{timeline.request.content.inquiry.description}
								</p>
							</div>
							<span class="badge badge-outline">{describeStatus(timeline)}</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="space-y-4">
		{#if selectedTimeline}
			<section class="border-base-300 bg-base-100 rounded-2xl border p-4 shadow-sm">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h4 class="text-sm font-semibold">{selectedTimeline.request.content.inquiry.title}</h4>
						<p class="text-base-content/70 mt-1 text-sm">
							Request ID: {selectedTimeline.request.content.quoteRequestId}
						</p>
						{#if showServiceTitles}
							<p class="text-base-content/70 mt-1 text-sm">
								Service: {serviceTitleByAddress[selectedTimeline.request.content.serviceAddress] ??
									selectedTimeline.request.content.serviceAddress}
							</p>
						{/if}
					</div>
					<span class="badge badge-outline">{describeStatus(selectedTimeline)}</span>
				</div>

				<div class="mt-4 space-y-3 text-sm">
					<p>{selectedTimeline.request.content.inquiry.description}</p>
					{#if selectedTimeline.request.content.tierId}
						<p class="text-base-content/70">
							Selected tier: {selectedTimeline.request.content.tierId}
						</p>
					{/if}
					{#if selectedTimeline.request.content.selectedAddOns?.length}
						<p class="text-base-content/70">
							Add-ons: {selectedTimeline.request.content.selectedAddOns.join(', ')}
						</p>
					{/if}
				</div>
			</section>

			{#if selectedTimeline.linkedEscrowId}
				<section class="border-success/20 bg-success/10 rounded-2xl border p-4 shadow-sm">
					<h4 class="text-sm font-semibold">Contract created</h4>
					<p class="text-base-content/70 mt-1 text-sm">
						This quote request has already been converted into an active service contract.
					</p>
					<button
						class="btn btn-primary btn-sm mt-3"
						onclick={() => viewContract(selectedTimeline.linkedEscrowId)}
					>
						View Contract
					</button>
				</section>
			{:else if selectedTimelineExpired}
				<section class="border-warning/20 bg-warning/10 rounded-2xl border p-4 shadow-sm">
					<h4 class="text-sm font-semibold">Request expired</h4>
					<p class="text-base-content/70 mt-1 text-sm">
						This quote request is now read-only. Wait for the buyer to send a new request before
						replying again.
					</p>
				</section>
			{:else}
				{#if selectedProposalSummary}
					<section class="border-base-300 bg-base-100 rounded-2xl border p-4 shadow-sm">
						<h4 class="text-sm font-semibold">Latest Proposal</h4>
						<div class="mt-3">
							<ServiceAgreementSummary
								quoteRequestId={selectedProposalSummary.quoteRequestId}
								proposalId={selectedProposalSummary.proposalId}
								selectedTierLabel={selectedProposalSummary.selectedTierLabel}
								agreementSnapshot={selectedProposalSummary.agreementSnapshot}
								pricingSnapshot={selectedProposalSummary.pricingSnapshot}
								estimatedStartTime={selectedProposalSummary.estimatedStartTime}
								estimatedCompletionTime={selectedProposalSummary.estimatedCompletionTime}
							/>
							<p class="text-base-content/70 mt-3 text-sm">
								Estimated duration: {selectedProposalSummary.estimatedDuration}
							</p>
						</div>
					</section>
				{/if}
				<ServiceProposalComposer
					requestTitle={selectedTimeline.request.content.inquiry.title}
					disabled={isSyncing ||
						Boolean(loadError) ||
						isOffline ||
						providerDataIsStale ||
						showPartialSyncAlert}
					blockedReason={composerBlockedReason}
					{walletReady}
					{feeTierReady}
					onSubmit={handleProposalSubmit}
				/>
			{/if}
		{:else}
			<div
				class="border-base-300 text-base-content/70 rounded-2xl border border-dashed p-6 text-sm"
			>
				{#if showPartialSyncAlert}
					Waiting for the selected quote thread to finish syncing.
				{:else}
					Select a request to review the full inquiry and compose a proposal.
				{/if}
			</div>
		{/if}
	</div>
</section>
