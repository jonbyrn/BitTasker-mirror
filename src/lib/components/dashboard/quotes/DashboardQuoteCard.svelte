<script lang="ts">
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import type { Service, ServiceTier } from '$lib/types/service';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { locale, t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { formatStandardDateTimeShort } from '$lib/utils/helpers/dateFormatter';
	import { parseServiceAddress } from '$lib/utils/service-quote/protocol';
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
		service = null,
		serviceUnavailable = false,
		serviceLookupFailed = false
	} = $props<{
		timeline: ServiceQuoteTimelineEntry;
		getActionButtons: (timeline: ServiceQuoteTimelineEntry) => ActionButton[];
		service?: Service | null;
		serviceUnavailable?: boolean;
		serviceLookupFailed?: boolean;
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
			case 'contract_sync_pending':
				return translateOrFallback(
					'dashboard.service_requests.statuses.contract_sync_pending',
					'Contract syncing'
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
			case 'contract_sync_pending':
				return 'badge-info';
			case 'accept_failed':
			case 'accept_unknown':
				return 'badge-error';
			default:
				return timeline.latestProposal ? 'badge-info' : 'badge-warning';
		}
	}

	function formatTimestamp(timestampSeconds: number | undefined): string {
		if (!timestampSeconds) return '—';
		return formatStandardDateTimeShort(new Date(timestampSeconds * 1000), $locale || 'en');
	}

	const formattedRequestedAt = $derived(formatTimestamp(timeline.request.created_at));
	const formattedExpiresAt = $derived(
		formatTimestamp(
			timeline.latestProposal?.content.expirationTimestamp ?? timeline.expirationTimestamp
		)
	);
	// Pricing info (label + price) shown on its own row below the title
	const pricingInfo = $derived.by(() => {
		if (!service) return null;
		const pricingType = service.pricing?.type;

		if (pricingType === ServicePricingTypeEnum.TIERED) {
			const tierId =
				timeline.latestProposal?.content.pricingSnapshot?.tierId ?? timeline.request.content.tierId;
			const tier = tierId
				? service.pricing?.tiers?.find((t: ServiceTier) => t.id === tierId)
				: null;
			return {
				label: tier?.name ?? 'Tier',
				price: tier?.price != null ? `$${formatNumberWithTwoDecimals(tier.price)}` : null
			};
		}
		if (pricingType === ServicePricingTypeEnum.FIXED) {
			return {
				label: 'Fixed Price',
				price:
					service.pricing?.amount != null
						? `$${formatNumberWithTwoDecimals(service.pricing.amount)}`
						: null
			};
		}
		if (pricingType === ServicePricingTypeEnum.HOURLY) {
			return {
				label: 'Hourly',
				price:
					service.pricing?.hourlyRate != null
						? `$${formatNumberWithTwoDecimals(service.pricing.hourlyRate)}`
						: null
			};
		}
		if (pricingType === ServicePricingTypeEnum.INQUIRY_REQUIRED) {
			return { label: 'Inquire', price: null };
		}
		return null;
	});

	const providerPubkey = $derived.by(() => {
		if (timeline.latestProposal?.pubkey) {
			return timeline.latestProposal.pubkey;
		}

		if (service?.npub) {
			return service.npub;
		}

		try {
			return parseServiceAddress(timeline.request.content.serviceAddress).pubkey;
		} catch {
			return timeline.request.pubkey;
		}
	});
	const providerUsername = $derived(service?.creator?.username ?? null);
	const providerAvatar = $derived(service?.creator?.avatar ?? null);
	const providerRating = $derived(service?.creator?.rating ?? 0);
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Status Badge -->
		<div class="mb-2 flex flex-row items-start justify-between gap-2">
			<div class="min-w-0 flex-1">
				{#if service}
					<span class="card-title line-clamp-2 text-lg font-semibold">
						{service.title}
					</span>
				{:else}
					<div class="bg-base-300 h-5 w-48 animate-pulse rounded"></div>
				{/if}
			</div>
			<div class="badge {getStatusColor(timeline)} badge-sm max-w-[180px] shrink-0 text-center">
				{describeStatus(timeline)}
			</div>
		</div>

		<!-- Pricing Row: Tier/Type + Price -->
		<div class="mb-3 flex items-center justify-between">
			<div>
				{#if !service}
					<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
				{:else if pricingInfo}
					<span class="text-base-content/70 text-base">{pricingInfo.label}</span>
				{/if}
			</div>
			<div>
				{#if pricingInfo?.price}
					<span class="text-primary text-lg font-bold">{pricingInfo.price}</span>
				{/if}
			</div>
		</div>

		<!-- Second Row: Request Details -->
		<div class="mb-3 flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<IconEmailFastOutline class="text-primary h-8 w-8 shrink-0" />
				<span class="text-sm font-medium">{formattedRequestedAt}</span>
			</div>

			<div class="flex items-center gap-2">
				<IconClockOutline class="text-primary h-8 w-8 shrink-0" />
				<span class="text-sm font-medium">
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
			{:else if serviceLookupFailed}
				<div class="alert alert-outline alert-warning py-2 text-xs">
					<span>
						{translateOrFallback(
							'dashboard.service_requests.alerts.service_lookup_failed',
							'Some service details could not be refreshed. Retry before acting on those requests.'
						)}
					</span>
				</div>
			{/if}

			{#if timeline.latestProposal?.content.expirationTimestamp}
				<div class="bg-primary/10 rounded-lg px-3 py-2 text-sm">
					<span class="font-medium">
						{translateOrFallback('dashboard.service_requests.expires', 'Expires')}:
					</span>
					<span class="text-base-content/80 ml-1">
						{formattedExpiresAt}
					</span>
				</div>
			{/if}
		</div>

		<div class="mb-3">
			<UserInfoDisplay
				avatar={providerAvatar}
				username={providerUsername}
				pubkey={providerPubkey}
				rating={providerRating}
				size="md"
				memberSince={service?.createdAt ??
					timeline.latestProposal?.created_at ??
					timeline.request.created_at}
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
