<script lang="ts">
	import type { Service, ServiceTier } from '$lib/types/service';
	import { t, locale } from 'svelte-i18n';
	import {
		getServiceDisplayDescription,
		getServiceDisplayTiers,
		getServiceDisplayTitle
	} from '$lib/utils/serviceDisplayTranslation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { getInstantBuyEligibility } from '$lib/utils/service-instant-buy/eligibility';
	import {
		formatInstantBuyDurationInput,
		inferInstantBuyTimeUnit
	} from '$lib/utils/service-instant-buy/authoring';
	import ServiceShareButton from './ServiceShareButton.svelte';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconTruckDeliveryOutline from '~icons/mdi/truck-delivery-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconPencilOutline from '~icons/mdi/pencil-outline';

	interface ActionButton {
		label: string;
		class: string;
		onclick: (e: MouseEvent) => void;
		icon: string;
	}

	const {
		service,
		getActionButtons,
		onStatusToggle,
		isTogglingStatus,
		btcPrice = 0
	} = $props<{
		service: Service;
		getActionButtons: (service: Service) => ActionButton[];
		onStatusToggle?: (e: MouseEvent) => void;
		isTogglingStatus?: boolean;
		btcPrice?: number;
	}>();

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function getPriceDisplay(): string {
		if (service.pricing?.type === ServicePricingTypeEnum.FIXED) {
			return `$${formatNumberWithTwoDecimals(service.pricing.amount || 0)}`;
		} else if (service.pricing?.type === ServicePricingTypeEnum.HOURLY) {
			return `$${formatNumberWithTwoDecimals(service.pricing.hourlyRate || 0)}/hr`;
		} else if (service.pricing?.type === ServicePricingTypeEnum.TIERED) {
			const lowestTierPrice = getLowestTierPrice();
			if (lowestTierPrice != null) {
				return `$${formatNumberWithTwoDecimals(lowestTierPrice)}`;
			}
			return tr('dashboard.services.my_services.pricing_type.tiered_pricing', 'Tiered pricing');
		} else if (service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED) {
			return tr('dashboard.services.my_services.pricing_type.quote', 'Quote');
		}
		return tr('dashboard.services.my_services.pricing_type.quote_required', 'Quote required');
	}

	function getServiceLocationTypes(): string[] {
		if (service.serviceLocationTypes?.length) {
			return service.serviceLocationTypes;
		}

		return (service.locationDetails as { types?: string[] } | undefined)?.types ?? [];
	}

	function getLocationTypeLabel(locationType: string): string {
		if (locationType === 'remote') {
			return tr('dashboard.services.my_services.location.remote', 'Remote');
		}

		if (locationType === 'tasker_location') {
			return tr('dashboard.services.my_services.location.my_location', 'My Location');
		}

		return tr('dashboard.services.my_services.location.tasker_location', 'Tasker Location');
	}

	function getLocationDisplay(): string {
		const locationDetails = service.locationDetails;
		const locationTypes = getServiceLocationTypes();
		const taskeeLocation = locationDetails?.taskeeLocation?.serviceLocation;
		const taskerLocation = locationDetails?.taskerLocation?.serviceLocation;

		// Check for taskee location (where service is provided to client)
		if (locationTypes.includes('taskee_location')) {
			return (
				locationDetails?.taskeeLocation?.locationDisplayName ||
				taskeeLocation?.displayName ||
				taskeeLocation?.formattedAddress ||
				getLocationTypeLabel('taskee_location')
			);
		}

		// Check for tasker location (where tasker travels to)
		if (locationTypes.includes('tasker_location')) {
			return (
				taskerLocation?.displayName ||
				taskerLocation?.formattedAddress ||
				getLocationTypeLabel('tasker_location')
			);
		}

		// Check if service has remote location type
		if (locationTypes.includes('remote')) {
			return getLocationTypeLabel('remote');
		}

		return '';
	}

	function getServiceRadiusDisplay(): string {
		const locationDetails = service.locationDetails;
		const serviceLocationTypes = getServiceLocationTypes();

		// Only show radius for TASKEE_LOCATION ("At Tasker Location")
		if (!serviceLocationTypes?.includes('taskee_location')) {
			return '';
		}

		const radius = locationDetails?.taskeeLocation?.serviceRadius;
		if (!radius) return '';
		// Convert km to miles (1 km = 0.621371 miles)
		const miles = Math.round(radius * 0.621371 * 10) / 10;
		return `(${radius} km/${miles} mi)`;
	}

	const getLowestTier = () => {
		const tiers = getServiceDisplayTiers(service, $locale || 'en');
		if (!tiers.length) return null;

		return [...tiers].sort((left, right) => left.price - right.price)[0] ?? null;
	};

	function getLowestTierPrice(): number | null {
		return getLowestTier()?.price ?? null;
	}

	function formatDurationFromHours(hours: number | undefined): string {
		if (!Number.isFinite(hours) || hours == null) {
			return '';
		}

		const unit = inferInstantBuyTimeUnit(hours);
		const value = formatInstantBuyDurationInput(hours, unit);
		const singularKey = `dashboard.services.my_services.duration.${unit}`;
		const pluralKey = `dashboard.services.my_services.duration.${unit}s`;
		const numericValue = Number(value);
		const unitLabel = tr(
			numericValue === 1 ? singularKey : pluralKey,
			numericValue === 1 ? unit : `${unit}s`
		);

		return `${value} ${unitLabel}`;
	}

	function getLeadTimeDisplay(): string {
		return formatDurationFromHours(service.instantBuyLeadHours);
	}

	function getDeliveryTimeDisplay(): string {
		if (service.pricing?.type === ServicePricingTypeEnum.TIERED) {
			return getLowestTier()?.deliveryTime?.display ?? '';
		}

		if (service.instantBuyDeliveryHours != null) {
			return formatDurationFromHours(service.instantBuyDeliveryHours);
		}

		return service.pricing?.deliveryTime?.display ?? '';
	}

	function hasProviderWalletAddress(): boolean {
		const candidate = service.providerWalletAddress?.trim();
		return Boolean(candidate && /^0x[a-fA-F0-9]{40}$/.test(candidate));
	}

	function isBookNowAvailable(): boolean {
		if (!hasProviderWalletAddress()) {
			return false;
		}

		if (service.pricing?.type === ServicePricingTypeEnum.TIERED) {
			return (service.pricing.tiers ?? []).some(
				(tier: { id: string }) => getInstantBuyEligibility(service, tier.id).eligible
			);
		}

		return getInstantBuyEligibility(service).eligible;
	}
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Row 1: Title + Share Button -->
		<div class="mb-1 flex flex-row items-start justify-between gap-2">
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<span class="card-title text-base-content line-clamp-2 text-lg font-semibold">
					{getServiceDisplayTitle(service, $locale || 'en')}
				</span>
			</div>
			<span
				role="presentation"
				class="shrink-0"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.stopPropagation();
					}
				}}
			>
				<ServiceShareButton {service} variant="circle" class="btn-xs" />
			</span>
		</div>

		<!-- Row 2: Description + Price (From label above for tiered) -->
		<div class="mb-3 flex flex-row items-start justify-between gap-2">
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<p class="text-base-content/80 line-clamp-2 text-sm whitespace-pre-line">
					{getServiceDisplayDescription(service, $locale || 'en') || '—'}
				</p>
			</div>
			<div class="shrink-0 text-right">
				{#if service.pricing?.type === ServicePricingTypeEnum.TIERED && service.pricing.tiers && service.pricing.tiers.length > 0}
					<div class="text-base-content/60 text-xs leading-tight">
						{tr('dashboard.services.my_services.pricing_type.from', 'From')}
					</div>
				{/if}
				<div class="text-base leading-tight font-bold">
					{getPriceDisplay()}
				</div>
				{#if service.pricing?.type === ServicePricingTypeEnum.FIXED && service.pricing.amount}
					<div class="text-base-content/60 text-sm">
						{satsFromUsd(service.pricing.amount, btcPrice)}
					</div>
				{:else if service.pricing?.type === ServicePricingTypeEnum.HOURLY && service.pricing.hourlyRate}
					<div class="text-base-content/60 text-xs leading-tight">
						{satsFromUsd(service.pricing.hourlyRate, btcPrice)}/hr
					</div>
				{:else if service.pricing?.type === ServicePricingTypeEnum.TIERED && service.pricing.tiers && service.pricing.tiers.length > 0}
					<div class="text-base-content/60 text-xs leading-tight">
						{satsFromUsd(
							Math.min(
								...service.pricing.tiers
									.map((tier: ServiceTier) => tier.price || 0)
									.filter((price: number) => price > 0)
							),
							btcPrice
						)}
					</div>
				{/if}
			</div>
		</div>

		<!-- Second Row: Service Location + Toggle -->
		{#if getLocationDisplay() || (onStatusToggle && service.status !== 'sold')}
			<div class="mb-3 flex items-center justify-between gap-3">
				<div class="flex min-w-0 flex-1 items-center gap-2">
					{#if getLocationDisplay()}
						<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
						<div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
							<span class="line-clamp-2 text-sm font-medium">
								{getLocationDisplay()}
							</span>
							{#if getServiceRadiusDisplay()}
								<span class="text-base-content/60 text-sm">
									{getServiceRadiusDisplay()}
								</span>
							{/if}
						</div>
					{/if}
				</div>
				{#if onStatusToggle && service.status !== 'sold'}
					<label
						class="flex shrink-0 cursor-pointer items-center gap-2 transition-opacity duration-300"
					>
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm transition-all duration-200"
							checked={service.status === 'active'}
							onchange={onStatusToggle}
							disabled={isTogglingStatus}
						/>
						<span class="label-text text-sm transition-opacity duration-200">
							{service.status === 'active'
								? tr('dashboard.services.my_services.status_active', 'Active')
								: tr('dashboard.services.my_services.status_inactive', 'Inactive')}
						</span>
					</label>
				{/if}
			</div>
		{/if}

		{#if getLeadTimeDisplay() || getDeliveryTimeDisplay()}
			<div class="mb-3 space-y-2">
				{#if getLeadTimeDisplay()}
					<div class="flex items-center justify-between gap-2">
						<div class="flex min-w-0 items-center gap-2">
							<IconClockOutline class="text-primary h-8 w-8 shrink-0" />
							<div class="flex min-w-0 flex-wrap items-center gap-1 text-sm">
								<span class="font-medium">
									{tr('dashboard.services.my_services.timing.lead_time', 'Lead Time')}:
								</span>
								<span class="text-base-content/80 wrap-break-words">{getLeadTimeDisplay()}</span>
							</div>
						</div>
						{#if isBookNowAvailable()}
							<span class="badge badge-primary badge-sm shrink-0">
								{tr('dashboard.services.my_services.book_now', 'Book Now')}
							</span>
						{/if}
					</div>
				{/if}
				{#if getDeliveryTimeDisplay()}
					<div class="flex items-center justify-between gap-2">
						<div class="flex min-w-0 items-center gap-2">
							<IconTruckDeliveryOutline class="text-primary h-8 w-8 shrink-0" />
							<div class="flex min-w-0 flex-wrap items-center gap-1 text-sm">
								<span class="font-medium">
									{tr('dashboard.services.my_services.timing.delivery_time', 'Delivery Time')}:
								</span>
								<span class="text-base-content/80 wrap-break-words">{getDeliveryTimeDisplay()}</span
								>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Third Row: Action Buttons -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: empty spacer on desktop to align with title -->
			<div class="hidden md:block"></div>

			<!-- Right: Action buttons side-by-side -->
			<div class="flex w-full items-center gap-2 md:w-auto">
				{#each getActionButtons(service) as action (action.label)}
					<button
						class="btn {action.class} flex-1 md:flex-none"
						onclick={(e) => {
							e.stopPropagation();
							action.onclick(e);
						}}
					>
						{#if action.icon === 'view_details'}
							<IconInformationOutline class="h-4 w-4" />
						{:else if action.icon === 'edit'}
							<IconPencilOutline class="h-4 w-4" />
						{:else if action.icon === 'view_quotes'}
							<IconEyeOutline class="h-4 w-4" />
						{:else if action.icon === 'contracts'}
							<IconBriefcaseOutline class="h-4 w-4" />
						{/if}
						{action.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
