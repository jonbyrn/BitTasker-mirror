<script lang="ts">
	import type { Service } from '$lib/types/service';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import Drawer from '$lib/components/Drawer.svelte';
	import ServiceTab from '$lib/components/service/ServiceTab.svelte';
	import { formatStandardDateTimeShort } from '$lib/utils/helpers/dateFormatter';
	import { locale, t } from 'svelte-i18n';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconFormTextbox from '~icons/mdi/form-textbox';

	const {
		isOpen,
		timeline = null,
		service = null,
		serviceUnavailable = false,
		loading = false,
		onClose
	} = $props<{
		isOpen: boolean;
		timeline: ServiceQuoteTimelineEntry | null;
		service: Service | null;
		serviceUnavailable?: boolean;
		loading?: boolean;
		onClose: () => void;
	}>();

	let inquiryDescriptionExpanded = $state(false);

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

	function stringifyInquiryValue(value: unknown): string {
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
	const inquiryNeedsToggle = $derived(inquiryDescriptionText.length > 100);

	const customFormEntries = $derived.by(() =>
		Object.entries(timeline?.request.content.inquiry.customFormResponses ?? {})
	);
</script>

<Drawer {isOpen} title={drawerTitle} {onClose} position="right" isScrollable={true}>
	<div class="space-y-6" data-testid="service-request-drawer">
		{#if timeline}
			<section
				class="border-info/50 bg-info/5 rounded-2xl border p-4 shadow-sm"
				aria-labelledby="service-request-inquiry-heading"
			>
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
							class="text-base-content/80 whitespace-pre-line"
							class:line-clamp-2={!inquiryDescriptionExpanded && inquiryNeedsToggle}
						>
							{timeline.request.content.inquiry.description || '—'}
						</p>
						{#if inquiryNeedsToggle}
							<button
								type="button"
								class="btn btn-link btn-xs text-info mt-1 h-auto min-h-0 px-0 font-semibold underline"
								onclick={() => (inquiryDescriptionExpanded = !inquiryDescriptionExpanded)}
							>
								{inquiryDescriptionExpanded
									? tr('dashboard.service_requests.drawer.show_less', 'Show less')
									: tr('dashboard.service_requests.drawer.show_more', 'Show more')}
							</button>
						{/if}
					</div>

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
								<IconFileDocumentOutline class="text-info h-5 w-5 shrink-0" />
								<h5 class="text-info text-sm font-bold">
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
