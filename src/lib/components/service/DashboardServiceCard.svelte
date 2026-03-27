<script lang="ts">
	import type { Service } from '$lib/types/service';
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
				return `${tr('dashboard.services.my_services.pricing_type.from', 'From')} $${formatNumberWithTwoDecimals(lowestTierPrice)}`;
			}

			return tr('dashboard.services.my_services.pricing_type.tiered_pricing', 'Tiered pricing');
		} else if (service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED) {
			// Short label on cards (same as badge) — "Cotización requerida" steals title space on mobile
			return tr('dashboard.services.my_services.pricing_type.quote', 'Quote');
		}
		return tr('dashboard.services.my_services.pricing_type.quote_required', 'Quote required');
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'active':
				return 'badge-success';
			case 'inactive':
				return 'badge-warning';
			case 'sold':
				return 'badge-ghost';
			default:
				return 'badge-neutral';
		}
	}

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'active':
				return tr('dashboard.services.my_services.status_active', 'Active');
			case 'inactive':
				return tr('dashboard.services.my_services.status_inactive', 'Inactive');
			case 'sold':
				return tr('dashboard.services.my_services.status_sold', 'Sold');
			default:
				return status;
		}
	}

	function getLocationDisplay(): string {
		const locationDetails = service.locationDetails;

		// Check for taskee location (where service is provided to client)
		if (locationDetails?.taskeeLocation?.locationDisplayName) {
			return locationDetails.taskeeLocation.locationDisplayName;
		}

		// Check for tasker location (where tasker travels to)
		if (locationDetails?.taskerLocation?.serviceLocation?.displayName) {
			return locationDetails.taskerLocation.serviceLocation.displayName;
		}

		// Check if service has remote location type
		if (locationDetails?.types?.includes('remote')) {
			return tr('dashboard.services.my_services.location.remote', 'Remote');
		}

		return '';
	}

	function getServiceRadiusDisplay(): string {
		const locationDetails = service.locationDetails;
		const serviceLocationTypes = service.serviceLocationTypes;

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

	function getLowestTier() {
		const tiers = getServiceDisplayTiers(service, $locale || 'en');
		if (!tiers.length) return null;

		return [...tiers].sort((left, right) => left.price - right.price)[0] ?? null;
	}

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
				(tier) => getInstantBuyEligibility(service, tier.id).eligible
			);
		}

		return getInstantBuyEligibility(service).eligible;
	}

	function getPricingBadgeLabel(): string {
		if (service.pricing?.type === ServicePricingTypeEnum.FIXED) {
			return tr('dashboard.services.my_services.pricing_type.fixed', 'Fixed');
		}

		if (service.pricing?.type === ServicePricingTypeEnum.HOURLY) {
			return tr('dashboard.services.my_services.pricing_type.hourly', 'Hourly');
		}

		if (service.pricing?.type === ServicePricingTypeEnum.TIERED) {
			return tr('dashboard.services.my_services.pricing_type.tiered', 'Tiered');
		}

		return tr('dashboard.services.my_services.pricing_type.quote', 'Quote');
	}
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Status Badge + Share Button + Price -->
		<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
			<!-- Left: Title + Description (flexible, takes available space) -->
			<div
				class="min-w-0 flex-1 pr-2 transition-opacity duration-300 md:pr-4"
				class:opacity-50={service.status !== 'active'}
			>
				<span class="card-title line-clamp-2 text-lg font-semibold">
					{getServiceDisplayTitle(service, $locale || 'en')}
				</span>
				<p class="text-base-content/80 mt-1 line-clamp-2 text-sm">
					{getServiceDisplayDescription(service, $locale || 'en') || '—'}
				</p>
			</div>
			<!-- Right: Status Badge + Share Button + Toggle + Price (aligned right) -->
			<div class="flex shrink-0 flex-col items-end gap-2">
				<!-- Row 1: Badge + Share Button -->
				<div class="flex items-center gap-2">
					<div
						class="badge {getStatusColor(
							service.status
						)} badge-sm max-w-[100px] truncate text-center"
					>
						{getStatusLabel(service.status)}
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
				<!-- Row 2: Price (compact on mobile for quote-only — long copy competes with title) -->
				<div
					class="text-right font-bold transition-opacity duration-300"
					class:text-base={service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED}
					class:md:text-xl={service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED}
					class:text-xl={service.pricing?.type !== ServicePricingTypeEnum.INQUIRY_REQUIRED}
					class:max-w-[9.5rem]={service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED}
					class:leading-tight={service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED}
					class:opacity-50={service.status !== 'active'}
				>
					{getPriceDisplay()}

					<div class="text-base-content/60 text-sm">
						{#if service.pricing?.type === ServicePricingTypeEnum.FIXED && service.pricing.amount}
							{satsFromUsd(service.pricing.amount, btcPrice)}
						{:else if service.pricing?.type === ServicePricingTypeEnum.HOURLY && service.pricing.hourlyRate}
							{satsFromUsd(service.pricing.hourlyRate, btcPrice)}/hr
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Second Row: Service Location + Toggle -->
		{#if getLocationDisplay() || (onStatusToggle && service.status !== 'sold')}
			<div
				class="mb-3 flex items-center justify-between gap-3 transition-opacity duration-300"
				class:opacity-50={service.status !== 'active'}
			>
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
			<div
				class="mb-3 space-y-2 transition-opacity duration-300"
				class:opacity-50={service.status !== 'active'}
			>
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
						<span class="badge badge-outline badge-sm shrink-0">{getPricingBadgeLabel()}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Third Row: Location badges + Pricing type + Toggle -->
		<div class="mb-3 flex flex-col gap-3 text-sm">
			<!-- Location badges display -->
			{#if service.locationDetails?.types && service.locationDetails.types.length > 0}
				<div class="flex flex-wrap gap-1">
					{#each service.locationDetails.types as locationType (locationType)}
						<span class="badge badge-outline badge-sm">
							{locationType === 'remote'
								? tr('dashboard.services.my_services.location.remote', 'Remote')
								: locationType === 'tasker_location'
									? tr('dashboard.services.my_services.location.my_location', 'My Location')
									: tr(
											'dashboard.services.my_services.location.tasker_location',
											'Tasker Location'
										)}
						</span>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Fourth Row: Action Buttons -->
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
						{:else if action.icon === 'view_quotes'}
							<IconEyeOutline class="h-4 w-4" />
						{/if}
						{action.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
