<script lang="ts">
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import { locale, t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { formatStandardDateTimeShort } from '$lib/utils/helpers/dateFormatter';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import IconCheckCircleOutline from '~icons/mdi/check-circle-outline';
	import IconCloseCircleOutline from '~icons/mdi/close-circle-outline';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconDeleteOutline from '~icons/mdi/delete-outline';
	import IconEmailFastOutline from '~icons/mdi/email-fast-outline';
	import IconEyeOutline from '~icons/mdi/eye-outline';

	interface ActionButton {
		label: string;
		class: string;
		onclick: (e: MouseEvent) => void;
		icon: string;
		disabled?: boolean;
	}

	const {
		timeline,
		getActionButtons,
		serviceUnavailable = false
	} = $props<{
		timeline: ServiceQuoteTimelineEntry;
		getActionButtons: (timeline: ServiceQuoteTimelineEntry) => ActionButton[];
		serviceUnavailable?: boolean;
	}>();

	function translateOrFallback(key: string, fallback: string): string {
		try {
			const translated = $t(key);
			return translated === key ? fallback : translated;
		} catch {
			return fallback;
		}
	}

	function describeStatus(timeline: ServiceQuoteTimelineEntry): string {
		switch (timeline.resolvedStatus) {
			case 'accepted':
				return translateOrFallback(
					'dashboard.service_requests.statuses.contract_created',
					'Contract created'
				);
			case 'declined':
				return translateOrFallback('dashboard.service_requests.statuses.declined', 'Declined');
			case 'withdrawn':
				return translateOrFallback('dashboard.service_requests.statuses.withdrawn', 'Withdrawn');
			case 'expired':
				return translateOrFallback('dashboard.service_requests.statuses.expired', 'Expired');
			case 'accepting':
				return translateOrFallback(
					'dashboard.service_requests.statuses.accepting_progress',
					'Accepting...'
				);
			case 'accept_failed':
				return translateOrFallback(
					'dashboard.service_requests.statuses.accept_failed',
					'Accept failed'
				);
			case 'accept_unknown':
				return translateOrFallback(
					'dashboard.service_requests.statuses.accept_unknown',
					'Accept unknown'
				);
			default:
				return timeline.latestProposal
					? translateOrFallback(
							'dashboard.service_requests.statuses.proposal_received',
							'Proposal received'
						)
					: translateOrFallback('dashboard.service_requests.quote_pending', 'Pending');
		}
	}

	function getStatusColor(timeline: ServiceQuoteTimelineEntry): string {
		switch (timeline.resolvedStatus) {
			case 'accepted':
				return 'badge-success';
			case 'declined':
			case 'withdrawn':
			case 'expired':
				return 'badge-ghost';
			case 'accepting':
				return 'badge-info';
			case 'accept_failed':
			case 'accept_unknown':
				return 'badge-error';
			default:
				return 'badge-warning';
		}
	}

	function getPriceDisplay(): string {
		if (timeline.latestProposal?.content.pricingSnapshot?.amount !== undefined) {
			return `$${formatNumberWithTwoDecimals(timeline.latestProposal.content.pricingSnapshot.amount)}`;
		}
		return '';
	}

	function formatTimestamp(timestampSeconds: number | undefined): string {
		if (!timestampSeconds) return '—';
		return formatStandardDateTimeShort(new Date(timestampSeconds * 1000), $locale || 'en');
	}

	const selectedTierLabel = $derived(
		timeline.latestProposal?.content.pricingSnapshot?.tierId ?? timeline.request.content.tierId
	);
	const selectedAddOns = $derived(
		timeline.latestProposal?.content.pricingSnapshot?.selectedAddOns ??
			timeline.request.content.selectedAddOns ??
			[]
	);
	const rushDeliverySelected = $derived(
		timeline.latestProposal?.content.pricingSnapshot?.rushDelivery === true ||
			timeline.request.content.rushDelivery === true
	);
	const formattedRequestedAt = $derived(formatTimestamp(timeline.request.created_at));
	const formattedExpiresAt = $derived(
		formatTimestamp(
			timeline.latestProposal?.content.expirationTimestamp ?? timeline.expirationTimestamp
		)
	);

	const hasProposalAmount = $derived(
		timeline.latestProposal?.content.pricingSnapshot?.amount !== undefined
	);
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Status Badge + Price -->
		<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
			<!-- Left: Title + Description (flexible, takes available space) -->
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<span class="card-title line-clamp-2 text-lg font-semibold">
					{timeline.request.content.inquiry.title}
				</span>
				<p class="text-base-content/80 mt-1 line-clamp-2 text-sm whitespace-pre-line">
					{timeline.request.content.inquiry.description || '—'}
				</p>
			</div>
			<!-- Right: Status Badge + Price (aligned right) -->
			<div class="flex shrink-0 flex-col items-end gap-2">
				<div class="badge {getStatusColor(timeline)} badge-sm text-center whitespace-nowrap">
					{describeStatus(timeline)}
				</div>
				{#if hasProposalAmount}
					<div class="text-right text-xl font-bold">
						{getPriceDisplay()}
					</div>
				{/if}
			</div>
		</div>

		<!-- Second Row: Request Details -->
		<div class="mb-3 flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<IconEmailFastOutline class="text-primary h-8 w-8 shrink-0" />
				<span class="line-clamp-2 text-sm font-medium">
					{formattedRequestedAt}
				</span>
			</div>

			<div class="flex items-center gap-2">
				<IconClockOutline class="text-primary h-8 w-8 shrink-0" />
				<span class="line-clamp-2 text-sm font-medium">
					{#if timeline.latestProposal?.content.estimatedDuration}
						{translateOrFallback(
							'dashboard.service_requests.estimated_duration',
							'Estimated duration'
						)}:
						{timeline.latestProposal.content.estimatedDuration}
					{:else}
						{translateOrFallback(
							'dashboard.service_requests.statuses.awaiting_proposal',
							'Awaiting proposal'
						)}
					{/if}
				</span>
			</div>

			{#if serviceUnavailable && !timeline.linkedEscrowId}
				<div class="alert alert-outline alert-warning py-2 text-xs">
					<span>
						{translateOrFallback(
							'dashboard.service_requests.alerts.service_unavailable_read_only',
							'This service was deleted by the provider. The request is now read-only.'
						)}
					</span>
				</div>
			{/if}

			{#if selectedTierLabel || selectedAddOns.length > 0 || rushDeliverySelected || timeline.latestProposal?.content.expirationTimestamp}
				<div class="flex flex-wrap gap-2 text-xs">
					{#if selectedTierLabel}
						<span class="badge badge-outline badge-sm">
							{translateOrFallback('dashboard.service_requests.selected_tier', 'Tier')}:
							{selectedTierLabel}
						</span>
					{/if}
					{#if selectedAddOns.length > 0}
						<span class="badge badge-outline badge-sm">
							{selectedAddOns.length === 1
								? translateOrFallback('dashboard.service_requests.add_ons_one', '1 add-on')
								: translateOrFallback(
										'dashboard.service_requests.add_ons_other',
										`${selectedAddOns.length} add-ons`
									).replace('{count}', String(selectedAddOns.length))}
						</span>
					{/if}
					{#if rushDeliverySelected}
						<span class="badge badge-outline badge-sm">
							{translateOrFallback('dashboard.service_requests.rush_delivery', 'Rush delivery')}
						</span>
					{/if}
					{#if timeline.latestProposal?.content.expirationTimestamp}
						<span class="badge badge-outline badge-sm">
							{translateOrFallback('dashboard.service_requests.expires', 'Expires')}:
							{formattedExpiresAt}
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<div class="mb-3">
			<UserInfoDisplay
				pubkey={timeline.request.pubkey}
				rating={0}
				size="md"
				memberSince={timeline.request.created_at}
				avatarAlt={translateOrFallback('dashboard.find_tasks.avatar_alt', 'Avatar')}
			/>
		</div>

		<!-- Bottom Row: Action Buttons -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: empty spacer on desktop to align with title -->
			<div class="hidden md:block"></div>

			<!-- Right: Action buttons side-by-side -->
			<div class="flex w-full items-center gap-2 md:w-auto">
				{#each getActionButtons(timeline) as action (action.label)}
					<button
						class="btn {action.class} flex-1 md:flex-none"
						disabled={action.disabled === true}
						onclick={(e) => {
							e.stopPropagation();
							action.onclick(e);
						}}
					>
						{#if action.icon === 'view'}
							<IconEyeOutline class="h-4 w-4" />
						{:else if action.icon === 'accept'}
							<IconCheckCircleOutline class="h-4 w-4" />
						{:else if action.icon === 'decline'}
							<IconCloseCircleOutline class="h-4 w-4" />
						{:else if action.icon === 'contract'}
							<IconCheckCircleOutline class="h-4 w-4" />
						{:else if action.icon === 'delete'}
							<IconDeleteOutline class="h-4 w-4" />
						{/if}
						{action.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
