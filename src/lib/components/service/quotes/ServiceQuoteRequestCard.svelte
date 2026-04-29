<script lang="ts">
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import type { Service } from '$lib/types/service';
	import { locale, t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { formatStandardDateTimeShort } from '$lib/utils/helpers/dateFormatter';
	import { resolveServiceTierLabel } from '$lib/utils/service-quote/tier-label';
	import { generateUniversalMapLink } from '$lib/utils/location/maps';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconCheckCircleOutline from '~icons/mdi/check-circle-outline';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconEmailFastOutline from '~icons/mdi/email-fast-outline';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import IconMapMarker from '~icons/mdi/map-marker';

	interface ActionButton {
		label: string;
		class: string;
		onclick: (event: MouseEvent) => void;
		icon: 'proposal' | 'contract' | 'view';
		disabled?: boolean;
	}

	const {
		timeline,
		service = null,
		isSelected = false,
		showServiceTitles = false,
		serviceTitleByAddress = {},
		serviceUnavailable = false,
		getActionButtons
	} = $props<{
		timeline: ServiceQuoteTimelineEntry;
		service?: Service | null;
		isSelected?: boolean;
		showServiceTitles?: boolean;
		serviceTitleByAddress?: Record<string, string>;
		serviceUnavailable?: boolean;
		getActionButtons: (timeline: ServiceQuoteTimelineEntry) => ActionButton[];
	}>();

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function trv(key: string, fallback: string, values: Record<string, string | number>): string {
		try {
			const value = $t(key, { values });
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function describeStatus(entry: ServiceQuoteTimelineEntry): string {
		switch (entry.resolvedStatus) {
			case 'accepted':
				return tr(
					'dashboard.services.my_services.quote_inbox.statuses.accepted',
					'Contract created'
				);
			case 'declined':
				return tr('dashboard.services.my_services.quote_inbox.statuses.declined', 'Declined');
			case 'withdrawn':
				return tr('dashboard.services.my_services.quote_inbox.statuses.withdrawn', 'Withdrawn');
			case 'expired':
				return tr('dashboard.services.my_services.quote_inbox.statuses.expired', 'Expired');
			case 'accepting':
				return tr('dashboard.services.my_services.quote_inbox.statuses.accepting', 'Accepted');
			case 'contract_sync_pending':
				return tr(
					'dashboard.services.my_services.quote_inbox.statuses.contract_sync_pending',
					'Contract syncing'
				);
			case 'accept_failed':
				return tr(
					'dashboard.services.my_services.quote_inbox.statuses.accept_failed',
					'Accept failed'
				);
			case 'accept_unknown':
				return tr(
					'dashboard.services.my_services.quote_inbox.statuses.accept_unknown',
					'Accept unknown'
				);
			default:
				return entry.latestProposal
					? tr('dashboard.services.my_services.quote_inbox.statuses.proposal_sent', 'Proposal sent')
					: tr('dashboard.services.my_services.quote_inbox.statuses.pending', 'Pending');
		}
	}

	function getStatusColor(entry: ServiceQuoteTimelineEntry): string {
		switch (entry.resolvedStatus) {
			case 'accepted':
				return 'badge-success';
			case 'declined':
			case 'withdrawn':
			case 'expired':
				return 'badge-ghost';
			case 'accepting':
			case 'contract_sync_pending':
				return 'badge-info';
			case 'accept_failed':
			case 'accept_unknown':
				return 'badge-error';
			default:
				return entry.latestProposal ? 'badge-secondary' : 'badge-warning';
		}
	}

	function getPriceDisplay(entry: ServiceQuoteTimelineEntry): string {
		const amount = entry.latestProposal?.content.amountUsdt;
		if (!amount) {
			return tr('dashboard.services.my_services.quote_inbox.pending_amount', 'Pending');
		}

		const numericAmount = Number(amount);
		if (Number.isFinite(numericAmount)) {
			return `$${formatNumberWithTwoDecimals(numericAmount)}`;
		}

		return `$${amount}`;
	}

	function formatTimestamp(timestampSeconds: number | undefined): string {
		if (!timestampSeconds) return '—';
		return formatStandardDateTimeShort(new Date(timestampSeconds * 1000), $locale || 'en');
	}

	const requestTimestamp = $derived(formatTimestamp(timeline.request.created_at));
	const selectedTierLabel = $derived(
		resolveServiceTierLabel(service, timeline.request.content.tierId)
	);
	const selectedAddOnCount = $derived(timeline.request.content.selectedAddOns?.length ?? 0);
	const requestServiceTitle = $derived(
		serviceTitleByAddress[timeline.request.content.serviceAddress] ??
			timeline.request.content.serviceAddress
	);
	const actionButtons = $derived(getActionButtons(timeline));
	const serviceLocation = $derived(timeline.request.content.serviceLocation ?? null);
	const serviceLocationMapLink = $derived(
		serviceLocation?.location ? generateUniversalMapLink(serviceLocation.location) : null
	);
</script>

<div
	class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg"
	class:bg-base-300={isSelected}
	class:border-primary={isSelected}
	class:border-2={isSelected}
	data-testid={`service-request-card-${timeline.request.content.quoteRequestId}`}
>
	<div class="card-body rounded-xl p-4 md:p-4">
		<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<span class="card-title line-clamp-2 text-lg font-semibold">
					{timeline.request.content.inquiry.title}
				</span>
				<p class="text-base-content/80 mt-1 line-clamp-2 text-sm whitespace-pre-line">
					{timeline.request.content.inquiry.description || '—'}
				</p>
			</div>
			<div class="flex shrink-0 flex-col items-end gap-2">
				<div class="badge {getStatusColor(timeline)} badge-sm max-w-[140px] truncate text-center">
					{describeStatus(timeline)}
				</div>
				<div class="text-right text-xl font-bold">
					{getPriceDisplay(timeline)}
				</div>
			</div>
		</div>

		<div class="mb-3 flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<IconEmailFastOutline class="text-primary h-8 w-8 shrink-0" />
				<span class="line-clamp-2 text-sm font-medium">
					{requestTimestamp}
				</span>
			</div>

			{#if showServiceTitles}
				<div class="flex items-center gap-2">
					<IconBriefcaseOutline class="text-primary h-8 w-8 shrink-0" />
					<span class="line-clamp-2 text-sm font-medium">{requestServiceTitle}</span>
				</div>
			{/if}

			{#if serviceLocation && serviceLocationMapLink}
				<div class="flex items-center gap-2">
					<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
					<a
						href={serviceLocationMapLink}
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary line-clamp-1 text-sm font-medium"
					>
						{serviceLocation.label}
					</a>
				</div>
			{/if}

			{#if selectedTierLabel || selectedAddOnCount > 0 || timeline.request.content.rushDelivery}
				<div class="flex flex-wrap gap-2 text-xs">
					{#if selectedTierLabel}
						<span class="badge badge-outline badge-sm">{selectedTierLabel}</span>
					{/if}
					{#if selectedAddOnCount > 0}
						<span class="badge badge-outline badge-sm">
							{trv(
								selectedAddOnCount === 1
									? 'dashboard.services.my_services.quote_inbox.add_ons_one'
									: 'dashboard.services.my_services.quote_inbox.add_ons_other',
								selectedAddOnCount === 1 ? '1 add-on' : `${selectedAddOnCount} add-ons`,
								{ count: selectedAddOnCount }
							)}
						</span>
					{/if}
					{#if timeline.request.content.rushDelivery}
						<span class="badge badge-outline badge-sm">
							{tr('dashboard.services.my_services.quote_inbox.rush_delivery', 'Rush delivery')}
						</span>
					{/if}
				</div>
			{/if}

			{#if serviceUnavailable && !timeline.linkedEscrowId}
				<div class="alert alert-outline alert-warning py-2 text-xs">
					<span>
						{tr(
							'dashboard.services.my_services.quote_inbox.service_unavailable_body',
							'This service was deleted by the provider. Keep this request for reference, but no new proposals can be sent.'
						)}
					</span>
				</div>
			{:else if timeline.isExpired || timeline.resolvedStatus === 'expired'}
				<div class="alert alert-outline alert-warning py-2 text-xs">
					<span>
						{tr(
							'dashboard.services.my_services.quote_inbox.expired_body',
							'This quote request is now read-only. Wait for the buyer to send a new request before replying again.'
						)}
					</span>
				</div>
			{/if}
		</div>

		<div class="mb-3">
			<UserInfoDisplay
				pubkey={timeline.request.pubkey}
				rating={0}
				size="md"
				memberSince={timeline.request.created_at}
				avatarAlt={tr('dashboard.find_tasks.avatar_alt', 'Avatar')}
			/>
		</div>

		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div class="hidden md:block"></div>

			<div class="flex w-full items-center gap-2 md:w-auto">
				{#each actionButtons as action (action.label)}
					<button
						class="btn {action.class} flex-1 md:flex-none"
						disabled={action.disabled === true}
						onclick={(event) => {
							event.stopPropagation();
							action.onclick(event);
						}}
					>
						{#if action.icon === 'proposal'}
							<IconClockOutline class="h-4 w-4" />
						{:else if action.icon === 'contract'}
							<IconCheckCircleOutline class="h-4 w-4" />
						{:else if action.icon === 'view'}
							<IconEyeOutline class="h-4 w-4" />
						{/if}
						{action.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
