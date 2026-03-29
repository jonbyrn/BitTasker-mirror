<script lang="ts">
	import type { Service } from '$lib/types/service';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import Drawer from '$lib/components/Drawer.svelte';
	import ServiceTab from '$lib/components/service/ServiceTab.svelte';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { formatStandardDateTimeShort } from '$lib/utils/helpers/dateFormatter';
	import { normalizeServiceContractSchedule } from '$lib/utils/service-contract/schedule';
	import { locale, t } from 'svelte-i18n';
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
			return value ? tr('common.yes', 'Yes') : tr('common.no', 'No');
		}
		const rendered = String(value).trim();
		return rendered.length > 0 ? rendered : '—';
	}

	function getInquiryFieldLabel(fieldId: string): string {
		const fields = service?.pricing?.inquiryForm?.fields ?? [];
		return fields.find((field) => field.id === fieldId)?.label ?? fieldId;
	}

	const drawerTitle = $derived.by(() => {
		if (service) {
			return (
				getServiceDisplayTitle(service, $locale || 'en') ||
				tr('dashboard.service_requests.drawer.title', 'Service request')
			);
		}

		return timeline?.request.content.inquiry.title
			? timeline.request.content.inquiry.title
			: tr('dashboard.service_requests.drawer.title', 'Service request');
	});

	const customFormEntries = $derived.by(() =>
		Object.entries(timeline?.request.content.inquiry.customFormResponses ?? {})
	);
	const latestProposal = $derived(timeline?.latestProposal ?? null);
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
					<div>
						<span class="text-base font-semibold">
							{tr('dashboard.service_requests.drawer.inquiry_title', 'Your Inquiry')}
						</span>
						<p class="text-base-content/70 mt-1 text-sm">
							{timeline.request.content.inquiry.title}
						</p>
					</div>
					<div class="text-base-content/70 flex items-center gap-2 text-sm">
						<IconClockOutline class="text-primary h-5 w-5 shrink-0" />
						<span>{formatTimestamp(timeline.request.created_at)}</span>
					</div>
				</div>

				<div class="space-y-4 text-sm">
					<p class="text-base-content/80 whitespace-pre-line">
						{timeline.request.content.inquiry.description || '—'}
					</p>

					{#if timeline.request.content.tierId || timeline.request.content.selectedAddOns?.length || timeline.request.content.rushDelivery}
						<div class="flex flex-wrap gap-2 text-xs">
							{#if timeline.request.content.tierId}
								<span class="badge badge-outline badge-sm">
									{tr('dashboard.service_requests.selected_tier', 'Tier')}:
									{timeline.request.content.tierId}
								</span>
							{/if}
							{#if timeline.request.content.selectedAddOns?.length}
								<span class="badge badge-outline badge-sm">
									{timeline.request.content.selectedAddOns.length === 1
										? tr('dashboard.service_requests.add_ons_one', '1 add-on')
										: tr(
												'dashboard.service_requests.add_ons_other',
												`${timeline.request.content.selectedAddOns.length} add-ons`
											).replace('{count}', String(timeline.request.content.selectedAddOns.length))}
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
								<IconFormTextbox class="text-primary h-5 w-5 shrink-0" />
								<h5 class="text-sm font-semibold">
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
											{stringifyInquiryValue(value)}
										</p>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if timeline.request.content.inquiry.attachments?.length}
						<div class="space-y-3">
							<div class="flex items-center gap-2">
								<IconFileDocumentOutline class="text-primary h-5 w-5 shrink-0" />
								<h5 class="text-sm font-semibold">
									{tr('dashboard.service_requests.drawer.attachments', 'Attachments')}
								</h5>
							</div>
							<div class="space-y-2">
								{#each timeline.request.content.inquiry.attachments as attachment (attachment.url)}
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
			<ServiceTab {service} isOwner={false} />
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
