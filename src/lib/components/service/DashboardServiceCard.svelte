<script lang="ts">
	import type { Service } from '$lib/types/service';
	import { t, locale } from 'svelte-i18n';
	import {
		getServiceDisplayTitle,
		getServiceDisplayDescription
	} from '$lib/utils/serviceDisplayTranslation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import ServiceShareButton from './ServiceShareButton.svelte';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconInformationOutline from '~icons/mdi/information-outline';

	interface ActionButton {
		label: string;
		class: string;
		onclick: (e: MouseEvent) => void;
		icon: string;
	}

	const { service, getActionButtons, onStatusToggle, isTogglingStatus, btcPrice = 0 } = $props<{
		service: Service;
		getActionButtons: (service: Service) => ActionButton[];
		onStatusToggle?: (e: MouseEvent) => void;
		isTogglingStatus?: boolean;
		btcPrice?: number;
	}>();

	function getPriceDisplay(): string {
		if (service.pricing?.type === ServicePricingTypeEnum.FIXED) {
			return `$${formatNumberWithTwoDecimals(service.pricing.amount || 0)}`;
		} else if (service.pricing?.type === ServicePricingTypeEnum.HOURLY) {
			return `$${formatNumberWithTwoDecimals(service.pricing.hourlyRate || 0)}/hr`;
		} else if (service.pricing?.type === ServicePricingTypeEnum.TIERED) {
			return 'Tiered pricing';
		}
		return 'Quote required';
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
				return $t('dashboard.services.my_services.status_active') || 'Active';
			case 'inactive':
				return $t('dashboard.services.my_services.status_inactive') || 'Inactive';
			case 'sold':
				return $t('dashboard.services.my_services.status_sold') || 'Sold';
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
			return 'Remote';
		}

		return '';
	}

	function getServiceRadiusDisplay(): string {
		const locationDetails = service.locationDetails;
		const serviceLocationTypes = service.serviceLocationTypes;

		// Only show radius for TASKER_LOCATION (taskee travels to tasker's location)
		if (!serviceLocationTypes?.includes('tasker_location')) {
			return '';
		}

		const radius = locationDetails?.taskerLocation?.serviceRadius;
		if (!radius) return '';
		// Convert km to miles (1 km = 0.621371 miles)
		const miles = Math.round(radius * 0.621371 * 10) / 10;
		return `(${radius} km/${miles} mi)`;
	}
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Status Badge + Share Button + Price -->
		<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
			<!-- Left: Title + Description (flexible, takes available space) -->
			<div class="min-w-0 flex-1 pr-2 md:pr-4 transition-opacity duration-300" class:opacity-50={service.status !== 'active'}>
				<span class="card-title line-clamp-2 text-lg font-semibold">
					{getServiceDisplayTitle(service, $locale || 'en')}
				</span>
				<p class="text-sm text-base-content/80 line-clamp-2 mt-1">
					{getServiceDisplayDescription(service, $locale || 'en') || '—'}
				</p>
			</div>
			<!-- Right: Status Badge + Share Button + Toggle + Price (aligned right) -->
			<div class="flex shrink-0 flex-col items-end gap-2">
				<!-- Row 1: Badge + Share Button -->
				<div class="flex items-center gap-2">
					<div class="badge {getStatusColor(service.status)} badge-sm max-w-[100px] truncate text-center">
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
						<ServiceShareButton service={service} variant="circle" class="btn-xs" />
					</span>
				</div>
				<!-- Row 2: Price -->
				<div class="text-right text-xl font-bold transition-opacity duration-300" class:opacity-50={service.status !== 'active'}>
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

		<!-- Second Row: Service Location -->
		{#if getLocationDisplay()}
			<div class="mb-3 flex items-center gap-2 transition-opacity duration-300" class:opacity-50={service.status !== 'active'}>
				<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
				<div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
					<span class="line-clamp-2 text-sm font-medium">
						{getLocationDisplay()}
					</span>
					{#if getServiceRadiusDisplay()}
						<span class="text-sm text-base-content/60">
							{getServiceRadiusDisplay()}
						</span>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Third Row: Location badges + Pricing type + Toggle -->
		<div class="mb-3 flex flex-col gap-3 text-sm">
			<!-- Location badges display -->
			{#if service.locationDetails?.types && service.locationDetails.types.length > 0}
				<div class="flex flex-wrap gap-1">
					{#each service.locationDetails.types as locationType}
						<span class="badge badge-outline badge-sm">
							{locationType === 'remote'
								? 'Remote'
								: locationType === 'tasker_location'
									? 'My Location'
									: 'Tasker Location'}
						</span>
					{/each}
				</div>
			{/if}

			<!-- Pricing type info + Toggle -->
			<div class="flex items-center justify-between gap-2 text-xs text-base-content/70">
				<div class="flex items-center gap-2">
					{#if service.pricing?.type === ServicePricingTypeEnum.FIXED}
						<span class="badge badge-outline badge-sm">Fixed</span>
					{:else if service.pricing?.type === ServicePricingTypeEnum.HOURLY}
						<span class="badge badge-outline badge-sm">Hourly</span>
					{:else if service.pricing?.type === ServicePricingTypeEnum.TIERED}
						<span class="badge badge-outline badge-sm">Tiered</span>
					{:else}
						<span class="badge badge-outline badge-sm">Quote</span>
					{/if}
				</div>
				{#if onStatusToggle && service.status !== 'sold'}
					<label class="flex cursor-pointer items-center gap-2 transition-opacity duration-300">
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm transition-all duration-200"
							checked={service.status === 'active'}
							onchange={onStatusToggle}
							disabled={isTogglingStatus}
						/>
						<span class="label-text text-sm transition-opacity duration-200">{service.status === 'active' ? 'Active' : 'Inactive'}</span>
					</label>
				{/if}
			</div>
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
