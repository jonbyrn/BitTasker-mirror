<script lang="ts">
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import { t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import IconCheckCircleOutline from '~icons/mdi/check-circle-outline';
	import IconCloseCircleOutline from '~icons/mdi/close-circle-outline';
	import IconInformationOutline from '~icons/mdi/information-outline';

	interface ActionButton {
		label: string;
		class: string;
		onclick: (e: MouseEvent) => void;
		icon: string;
		disabled?: boolean;
	}

	const { timeline, getActionButtons } = $props<{
		timeline: ServiceQuoteTimelineEntry;
		getActionButtons: (timeline: ServiceQuoteTimelineEntry) => ActionButton[];
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
					: translateOrFallback(
							'dashboard.service_requests.statuses.awaiting_proposal',
							'Awaiting proposal'
						);
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
		return translateOrFallback('dashboard.service_requests.quote_pending', 'Quote pending');
	}
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Status Badge + Price -->
		<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
			<!-- Left: Title + Service Name (flexible, takes available space) -->
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<h3 class="card-title line-clamp-2 text-lg font-semibold">
					{timeline.request.content.inquiry.title}
				</h3>
				<p class="text-base-content/60 mt-1 line-clamp-1 text-sm">
					{timeline.request.content.serviceAddress ||
						translateOrFallback('dashboard.service_requests.service_label', 'Service')}
				</p>
			</div>
			<!-- Right: Status Badge + Price (aligned right) -->
			<div class="flex shrink-0 flex-col items-end gap-2">
				<div class="badge {getStatusColor(timeline)} badge-sm max-w-[120px] truncate text-center">
					{describeStatus(timeline)}
				</div>
				<div class="text-right text-xl font-bold">
					{getPriceDisplay()}
				</div>
			</div>
		</div>

		<!-- Second Row: Quote Details -->
		<div class="text-base-content/70 mb-3 flex flex-col gap-2 text-sm">
			<!-- Description snippet -->
			<p class="line-clamp-2 text-sm">
				{timeline.request.content.inquiry.description || '—'}
			</p>

			<!-- Quote details -->
			{#if timeline.latestProposal?.content.pricingSnapshot}
				<div class="flex flex-wrap gap-2 text-xs">
					<span class="badge badge-outline badge-sm">
						{timeline.latestProposal.content.pricingSnapshot.label ||
							translateOrFallback('dashboard.service_requests.standard_tier', 'Standard')}
					</span>
					{#if timeline.latestProposal.content.pricingSnapshot.estimatedDeliveryDays}
						<span class="badge badge-outline badge-sm">
							{`${timeline.latestProposal.content.pricingSnapshot.estimatedDeliveryDays} ${translateOrFallback(
								'dashboard.service_requests.days',
								'days'
							)}`}
						</span>
					{/if}
				</div>
			{/if}
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
							<IconInformationOutline class="h-4 w-4" />
						{:else if action.icon === 'accept'}
							<IconCheckCircleOutline class="h-4 w-4" />
						{:else if action.icon === 'decline'}
							<IconCloseCircleOutline class="h-4 w-4" />
						{:else if action.icon === 'contract'}
							<IconCheckCircleOutline class="h-4 w-4" />
						{/if}
						{action.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
