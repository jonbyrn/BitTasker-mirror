<script lang="ts">
	import type { Service } from '$lib/types/service';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import Drawer from '$lib/components/Drawer.svelte';
	import ServiceTab from '$lib/components/service/ServiceTab.svelte';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';
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
</script>

<Drawer {isOpen} title={drawerTitle} {onClose} position="right" isScrollable={true}>
	<div class="space-y-6" data-testid="service-request-drawer">
		{#if timeline}
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
						'dashboard.service_requests.service_unavailable_read_only',
						'This service was deleted by the provider. The request is now read-only.'
					)}
				</span>
			</div>
		{/if}
	</div>
</Drawer>
