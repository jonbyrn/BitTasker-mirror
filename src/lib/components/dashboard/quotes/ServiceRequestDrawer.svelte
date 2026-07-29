<script lang="ts">
	import type { Service } from '$lib/types/service';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import Drawer from '$lib/components/Drawer.svelte';
	import ServiceTab from '$lib/components/service/ServiceTab.svelte';
	import type { ServiceTier } from '$lib/types/service';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { formatStandardDateTimeShort } from '$lib/utils/helpers/dateFormatter';
	import { normalizeServiceContractSchedule } from '$lib/utils/service-contract/schedule';
	import { locale, t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import IconCheckCircleOutline from '~icons/mdi/check-circle-outline';
	import IconCloseCircleOutline from '~icons/mdi/close-circle-outline';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconFormTextbox from '~icons/mdi/form-textbox';
	import IconTrashCanOutline from '~icons/mdi/trash-can-outline';

	const {
		isOpen,
		timeline = null,
		service = null,
		serviceUnavailable = false,
		serviceLookupFailed = false,
		loading = false,
		showAcceptActions = false,
		showDeclineAction = false,
		showDeleteAction = false,
		actionsDisabled = false,
		deleteDisabled = false,
		actionPending = null,
		deletePending = false,
		actionError = null,
		onAccept,
		onDecline,
		onDelete,
		onClose
	} = $props<{
		isOpen: boolean;
		timeline: ServiceQuoteTimelineEntry | null;
		service: Service | null;
		serviceUnavailable?: boolean;
		serviceLookupFailed?: boolean;
		loading?: boolean;
		showAcceptActions?: boolean;
		showDeclineAction?: boolean;
		showDeleteAction?: boolean;
		actionsDisabled?: boolean;
		deleteDisabled?: boolean;
		actionPending?: 'accept' | 'decline' | null;
		deletePending?: boolean;
		actionError?: string | null;
		onAccept?: () => void;
		onDecline?: () => void;
		onDelete?: () => void;
		onClose: () => void;
	}>();

	let _inquiryDescriptionExpanded = $state(false);

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function formatTimestamp(timestampSeconds: number | undefined): string {
		if (!timestampSeconds) return '—';
		return formatStandardDateTimeShort(new Date(timestampSeconds * 1000), $locale || 'en');
	}

	function formatProposalAmount(amountUsdt: string | undefined): string {
		if (!amountUsdt) {
			return '—';
		}

		const numericAmount = Number(amountUsdt);
		return Number.isFinite(numericAmount)
			? `$${formatNumberWithTwoDecimals(numericAmount)}`
			: `$${amountUsdt}`;
	}

	function stringifyInquiryValue(value: string | number | boolean | string[] | undefined): string {
		if (value === undefined) return '—';
		if (Array.isArray(value)) {
			return value.length > 0 ? value.join(', ') : '—';
		}
		if (typeof value === 'boolean') {
			return value
				? tr('dashboard.service_requests.boolean_yes', 'Yes')
				: tr('dashboard.service_requests.boolean_no', 'No');
		}
		if (typeof value === 'number' || typeof value === 'string') {
			const rendered = String(value).trim();
			return rendered.length > 0 ? rendered : '—';
		}
		return '—';
	}

	function getInquiryFieldLabel(fieldId: string): string {
		const fields = service?.pricing?.inquiryForm?.fields ?? [];
		return (
			fields.find((field: { id: string; label?: string }) => field.id === fieldId)?.label ?? fieldId
		);
	}

	const drawerTitle = $derived.by(() => {
		void $locale;
		return tr('dashboard.service_requests.drawer.heading', 'General information');
	});

	const inquiryDescriptionText = $derived(
		(timeline?.request.content.inquiry.description ?? '').trim()
	);

	/** ~2 lines on mobile; show toggle when likely to overflow */
	const _inquiryNeedsToggle = $derived(inquiryDescriptionText.length > 100);

	const customFormEntries = $derived.by(() =>
		Object.entries(timeline?.request.content.inquiry.customFormResponses ?? {})
	);
	const latestProposal = $derived(timeline?.latestProposal ?? null);
	const tierId = $derived(timeline?.request.content.tierId);
	const selectedTier = $derived(
		service?.pricing?.tiers?.find((t: ServiceTier) => t.id === tierId) ?? null
	);
	const normalizedSchedule = $derived.by(() =>
		normalizeServiceContractSchedule(
			latestProposal?.content.estimatedStartTime ?? 0,
			latestProposal?.content.estimatedEndTime ?? 0
		)
	);
	const proposalStartLabel = $derived(formatTimestamp(normalizedSchedule.estimatedStartTime));
	const proposalEndLabel = $derived(formatTimestamp(normalizedSchedule.estimatedCompletionTime));
	const proposalTimingWarning = $derived.by(() =>
		normalizedSchedule.startWasAdjusted
			? tr(
					'dashboard.service_requests.accept_drawer.start_time_adjusted_warning',
					'The quoted start time has already passed. The contract will use a start time about one hour from now and keep the quoted duration.'
				)
			: ''
	);
	const inquiryDescription = $derived(timeline?.request.content.inquiry.description?.trim() ?? '');

	let inquiryDescriptionElement: HTMLParagraphElement | null = $state(null);
	let showFullInquiryDescription = $state(false);
	let isInquiryDescriptionTruncated = $state(false);

	function checkIfInquiryDescriptionTruncated() {
		if (!inquiryDescriptionElement || !inquiryDescription) {
			isInquiryDescriptionTruncated = false;
			return;
		}

		const clone = inquiryDescriptionElement.cloneNode(true) as HTMLElement;
		clone.className = inquiryDescriptionElement.className.replace(/line-clamp-\d+/g, '').trim();
		clone.style.position = 'absolute';
		clone.style.visibility = 'hidden';
		clone.style.pointerEvents = 'none';
		clone.style.height = 'auto';
		clone.style.maxHeight = 'none';
		clone.style.overflow = 'visible';
		clone.style.width = `${inquiryDescriptionElement.offsetWidth}px`;
		document.body.appendChild(clone);

		const fullHeight = clone.scrollHeight;
		const lineHeight = parseFloat(getComputedStyle(inquiryDescriptionElement).lineHeight) || 24;
		const maxHeight = lineHeight * 3;

		document.body.removeChild(clone);

		isInquiryDescriptionTruncated = fullHeight > maxHeight + 1;
	}

	onMount(() => {
		const handleResize = () => {
			if (isOpen) {
				checkIfInquiryDescriptionTruncated();
			}
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	$effect(() => {
		const requestId = timeline?.request.id ?? null;
		const currentDescription = inquiryDescription;

		showFullInquiryDescription = false;
		isInquiryDescriptionTruncated = false;

		if (!isOpen || !requestId || !currentDescription || !inquiryDescriptionElement) {
			return;
		}

		requestAnimationFrame(() => {
			setTimeout(() => {
				checkIfInquiryDescriptionTruncated();
			}, 0);
		});
	});
</script>

<Drawer {isOpen} title={drawerTitle} {onClose} position="right" isScrollable={true}>
	<div class="space-y-6" data-testid="service-request-drawer">
		{#if timeline}
			{#if latestProposal}
				<section
					class="border-base-300 bg-base-100 rounded-2xl border p-4 shadow-sm"
					data-testid="service-request-drawer-proposal"
				>
					<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
						<div>
							<span class="text-base font-semibold">
								{tr('dashboard.service_requests.drawer.proposal_title', 'Received Proposal')}
							</span>
							<p class="text-base-content mt-1 text-2xl font-semibold">
								{formatProposalAmount(latestProposal.content.amountUsdt)}
							</p>
						</div>
						<div class="text-base-content/70 flex items-center gap-2 text-sm">
							<IconClockOutline class="text-primary h-5 w-5 shrink-0" />
							<span>
								{tr('dashboard.service_requests.expires', 'Expires')}:
								{formatTimestamp(latestProposal.content.expirationTimestamp)}
							</span>
						</div>
					</div>

					<div class="grid gap-3 md:grid-cols-2">
						<div class="bg-base-200/60 rounded-xl p-3">
							<p class="text-base-content/60 text-xs font-medium">
								{tr('dashboard.service_requests.estimated_duration', 'Estimated duration')}
							</p>
							<p class="mt-1 text-sm font-medium">
								{latestProposal.content.estimatedDuration || '—'}
							</p>
						</div>
						<div class="bg-base-200/60 rounded-xl p-3">
							<p class="text-base-content/60 text-xs font-medium">
								{tr('dashboard.service_requests.drawer.proposal_start', 'Estimated Start')}
							</p>
							<p class="mt-1 text-sm font-medium">
								{proposalStartLabel}
							</p>
						</div>
						<div class="bg-base-200/60 rounded-xl p-3">
							<p class="text-base-content/60 text-xs font-medium">
								{tr('dashboard.service_requests.drawer.proposal_end', 'Estimated End')}
							</p>
							<p class="mt-1 text-sm font-medium">
								{proposalEndLabel}
							</p>
						</div>
					</div>

					{#if proposalTimingWarning}
						<div
							class="alert alert-outline alert-warning mt-4 text-sm"
							role="alert"
							aria-live="polite"
						>
							<span>{proposalTimingWarning}</span>
						</div>
					{/if}

					<div class="mt-4 space-y-3 text-sm">
						<div>
							<p class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
								{tr('dashboard.service_requests.drawer.scope_of_work', 'Scope of work')}
							</p>
							<p class="text-base-content mt-1 whitespace-pre-line">
								{latestProposal.content.description || '—'}
							</p>
						</div>

						{#if latestProposal.content.coverLetter}
							<div>
								<p class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
									{tr('dashboard.service_requests.drawer.cover_letter', 'Cover letter')}
								</p>
								<p class="text-base-content mt-1 whitespace-pre-line">
									{latestProposal.content.coverLetter}
								</p>
							</div>
						{/if}
					</div>
				</section>
			{/if}

			<section class="border-primary bg-base-100 rounded-2xl border p-4 shadow-sm">
				<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0 flex-1">
						<span
							id="service-request-inquiry-heading"
							class="text-info text-sm leading-snug font-semibold"
						>
							{tr('dashboard.service_requests.drawer.inquiry_heading', 'Your request details')}
						</span>
						<p class="text-base-content mt-1.5 text-sm font-medium">
							{timeline.request.content.inquiry.title}
						</p>
					</div>
					<div class="text-info/90 flex shrink-0 items-center gap-1.5 text-xs font-medium">
						<IconClockOutline class="h-4 w-4 shrink-0 opacity-90" />
						<span>{formatTimestamp(timeline.request.created_at)}</span>
					</div>
				</div>

				<div class="space-y-4 text-sm">
					<div>
						<p
							bind:this={inquiryDescriptionElement}
							class={`text-base-content/80 leading-6 whitespace-pre-line ${
								showFullInquiryDescription ? '' : 'line-clamp-3'
							}`}
							id="service-request-drawer-inquiry-description"
							data-testid="service-request-drawer-inquiry-description"
						>
							{timeline.request.content.inquiry.description || '—'}
						</p>

						{#if isInquiryDescriptionTruncated}
							<button
								type="button"
								class="btn btn-ghost btn-xs mt-2 h-auto min-h-0 px-0 text-[0.75rem] font-semibold tracking-wide uppercase"
								aria-controls="service-request-drawer-inquiry-description"
								aria-expanded={showFullInquiryDescription}
								onclick={() => {
									showFullInquiryDescription = !showFullInquiryDescription;
								}}
							>
								{showFullInquiryDescription
									? tr('dashboard.service_requests.show_less', 'See Less')
									: tr('dashboard.service_requests.show_more', 'See More')}
							</button>
						{/if}
					</div>

					{#if tierId || timeline.request.content.selectedAddOns?.length || timeline.request.content.rushDelivery}
						<div class="flex flex-wrap items-center gap-2 text-xs">
							{#if tierId}
								<div class="bg-primary/5 border-primary/20 rounded-lg border px-3 py-1.5">
									{#if !service}
										<span class="loading loading-spinner loading-xs text-primary"></span>
									{:else if selectedTier}
										<span class="text-sm font-semibold">{selectedTier.name}</span>
										<span class="text-base-content/40 mx-1.5">&middot;</span>
										<span class="text-primary text-sm font-bold">${selectedTier.price}</span>
									{:else}
										<span class="text-base-content/60"
											>{tr('dashboard.service_requests.selected_tier', 'Tier')}</span
										>
									{/if}
								</div>
							{/if}
							{#if timeline.request.content.selectedAddOns?.length}
								<span class="badge badge-outline badge-sm">
									{timeline.request.content.selectedAddOns.length === 1
										? tr('dashboard.service_requests.add_ons_one', '1 add-on')
										: tr('dashboard.service_requests.add_ons_other', '{count} add-ons').replace(
												'{count}',
												String(timeline.request.content.selectedAddOns.length)
											)}
								</span>
							{/if}
							{#if timeline.request.content.rushDelivery}
								<span class="badge badge-outline badge-sm">
									{tr('dashboard.service_requests.rush_delivery', 'Rush delivery')}
								</span>
							{/if}
						</div>
					{/if}

					{#if customFormEntries.length > 0}
						<div class="space-y-3">
							<div class="flex items-center gap-2">
								<IconFormTextbox class="text-info h-5 w-5 shrink-0" />
								<h5 class="text-info text-sm font-bold">
									{tr('dashboard.service_requests.drawer.custom_answers', 'Submitted answers')}
								</h5>
							</div>
							<div class="space-y-2">
								{#each customFormEntries as [fieldId, value] (fieldId)}
									<div class="border-base-300 rounded-xl border p-3">
										<p class="text-base-content/70 text-xs font-semibold tracking-wide uppercase">
											{getInquiryFieldLabel(fieldId)}
										</p>
										<p class="mt-1 text-sm whitespace-pre-line">
											{stringifyInquiryValue(value as string)}
										</p>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if timeline.request.content.inquiry.attachments?.length}
						<div class="space-y-3">
							<div class="flex items-center gap-2">
								<IconFileDocumentOutline class="text-info h-5 w-5 shrink-0" />
								<h5 class="text-info text-sm font-bold">
									{tr('dashboard.service_requests.drawer.attachments', 'Attachments')}
								</h5>
							</div>
							<div class="space-y-2">
								{#each timeline.request.content.inquiry.attachments as attachment, idx (`${attachment.key || attachment.url || idx}-${idx}`)}
									<a
										href={attachment.url}
										target="_blank"
										rel="noreferrer"
										class="border-base-300 hover:border-primary/40 hover:bg-base-200 flex items-center justify-between rounded-xl border p-3 text-sm transition-colors"
									>
										<span class="line-clamp-1 min-w-0 flex-1">
											{attachment.alt || attachment.key || attachment.url}
										</span>
										<span class="text-base-content/60 ml-3 shrink-0 text-xs">
											{tr('dashboard.service_requests.actions.view', 'View')}
										</span>
									</a>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</section>

			{#if actionError}
				<div class="alert alert-outline alert-error text-sm" role="alert" aria-live="assertive">
					<span>{actionError}</span>
				</div>
			{:else if serviceLookupFailed}
				<div class="alert alert-outline alert-warning text-sm" role="alert" aria-live="polite">
					<span>
						{tr(
							'dashboard.service_requests.alerts.service_lookup_failed',
							'Some service details could not be refreshed. Retry before acting on those requests.'
						)}
					</span>
				</div>
			{/if}

			{#if showAcceptActions || showDeclineAction || showDeleteAction}
				<section class="border-base-300 bg-base-100 rounded-2xl border p-4 shadow-sm">
					<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
						{#if showDeleteAction}
							<button
								type="button"
								class="btn btn-error btn-outline min-h-[40px] flex-1 sm:flex-none"
								disabled={deleteDisabled}
								onclick={() => onDelete?.()}
							>
								{#if deletePending}
									<span class="loading loading-spinner loading-sm"></span>
								{:else}
									<IconTrashCanOutline class="h-4 w-4 shrink-0" />
								{/if}
								{tr('dashboard.service_requests.actions.delete', 'Delete')}
							</button>
						{/if}
						{#if showDeclineAction}
							<button
								type="button"
								class="btn btn-outline min-h-[40px] flex-1 sm:flex-none"
								disabled={actionsDisabled}
								onclick={() => onDecline?.()}
							>
								{#if actionPending === 'decline'}
									<span class="loading loading-spinner loading-sm"></span>
								{:else}
									<IconCloseCircleOutline class="h-4 w-4 shrink-0" />
								{/if}
								{tr('dashboard.service_requests.actions.decline', 'Decline')}
							</button>
						{/if}
						{#if showAcceptActions}
							<button
								type="button"
								class="btn btn-success btn-outline min-h-[40px] flex-1 sm:flex-none"
								disabled={actionsDisabled}
								onclick={() => onAccept?.()}
							>
								{#if actionPending === 'accept'}
									<span class="loading loading-spinner loading-sm"></span>
								{:else}
									<IconCheckCircleOutline class="h-4 w-4 shrink-0" />
								{/if}
								{tr('dashboard.service_requests.actions.accept', 'Accept')}
							</button>
						{/if}
					</div>
				</section>
			{/if}
		{/if}

		{#if loading}
			<div class="border-base-300 text-base-content/70 rounded-xl border border-dashed p-6 text-sm">
				{tr('dashboard.service_requests.drawer.loading', 'Loading service details...')}
			</div>
		{:else if service}
			<div
				class="collapse-arrow border-primary/20 collapse overflow-hidden rounded-xl border shadow-sm"
				data-testid="service-request-drawer-service-collapse"
			>
				<input type="checkbox" aria-expanded="false" />
				<div
					class="collapse-title bg-primary/10 text-primary after:text-primary hover:bg-primary/15 min-h-10! border-0 py-2! pr-12 pl-4 text-sm leading-tight font-semibold"
				>
					{tr('dashboard.service_requests.drawer.service_to_hire', 'Service to hire')}
				</div>
				<div
					class="collapse-content service-collapse-content bg-base-100 border-base-300 border-t p-0"
				>
					<div class="p-4 pb-6">
						<ServiceTab {service} isOwner={false} />
					</div>
				</div>
			</div>
		{:else if serviceUnavailable}
			<div
				class="alert alert-outline alert-warning text-sm"
				data-testid="service-request-drawer-unavailable"
			>
				<span>
					{tr(
						'dashboard.service_requests.alerts.service_unavailable_read_only',
						'This service was deleted by the provider. The request is now read-only.'
					)}
				</span>
			</div>
		{/if}
	</div>
</Drawer>

<style>
	/* In this drawer, render ServiceTab without the heavy gray card blocks */
	.service-collapse-content :global(.card.bg-base-200) {
		background-color: transparent;
		box-shadow: none;
	}
</style>
