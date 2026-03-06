<script lang="ts">
	import type { Service, ServiceTier } from '$lib/types/service.d';
	import type { Attachment } from '$lib/types/task.d';
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { getServiceDisplayTitle, getServiceDisplayDescription } from '$lib/utils/serviceDisplayTranslation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import Avatar from '../Avatar.svelte';
	import ServiceShareButton from './ServiceShareButton.svelte';
	import IconEye from '~icons/mdi/eye';
	import IconPlus from '~icons/mdi/plus';

	const { service, btcPrice, onclick, selectedService, onSelectServiceForMap, isMapVisible, onRequestQuote } = $props<{
		service: Service;
		btcPrice: number;
		onclick?: () => void;
		selectedService?: Service | null;
		onSelectServiceForMap?: (service: Service) => void;
		isMapVisible?: boolean;
		onRequestQuote?: (service: Service) => void;
	}>();

	const isInquiryRequired = $derived(
		service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED
	);

	function formatMemberSince(timestamp: number): string {
		try {
			const date = new Date(timestamp * 1000);
			return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
		} catch {
			return '';
		}
	}

	// Helper function to get pricing display
	function getPricingDisplay(): string {
		if (!service.pricing) {
			return $t('dashboard.services.browse.pricing.inquiry_required') || 'Request Quote';
		}

		switch (service.pricing.type) {
			case ServicePricingTypeEnum.FIXED:
				if (service.pricing.amount) {
					return `$${formatNumberWithTwoDecimals(service.pricing.amount)}`;
				}
				return $t('dashboard.services.browse.pricing.not_set') || 'Price not set';
			case ServicePricingTypeEnum.HOURLY:
				if (service.pricing.hourlyRate) {
					return `$${formatNumberWithTwoDecimals(service.pricing.hourlyRate)}/hr`;
				}
				return $t('dashboard.services.browse.pricing.not_set') || 'Price not set';
			case ServicePricingTypeEnum.TIERED:
				if (service.pricing.tiers && service.pricing.tiers.length > 0) {
					const prices = service.pricing.tiers
						.map((tier: ServiceTier) => tier.price)
						.filter((price: number | undefined): price is number => typeof price === 'number' && price > 0);
					if (prices.length > 0) {
						const minPrice = Math.min(...prices);
						return `From $${formatNumberWithTwoDecimals(minPrice)}`;
					}
				}
				return $t('dashboard.services.browse.pricing.from_price') || 'From $X';
			case ServicePricingTypeEnum.INQUIRY_REQUIRED:
				return $t('dashboard.services.browse.pricing.request_quote') || 'Request Quote';
			default:
				return $t('dashboard.services.browse.pricing.not_set') || 'Price not set';
		}
	}

	// Helper: show only address when available (no "En Mi Ubicación"), max 50 chars
	const LOCATION_DISPLAY_MAX_LENGTH = 50;

	function getLocationTypesDisplay(): string {
		if (!service.serviceLocationTypes || service.serviceLocationTypes.length === 0) {
			return '';
		}

		const hasTaskerLocation = service.serviceLocationTypes?.includes(ServiceLocationTypeEnum.TASKER_LOCATION);
		const baseAddress =
			service.locationDetails?.taskerLocation?.serviceLocation?.displayName ||
			service.locationDetails?.taskerLocation?.serviceLocation?.formattedAddress;

		// When "En Mi Ubicación" with address: show only the address, truncated to 50 chars
		if (hasTaskerLocation && baseAddress) {
			return baseAddress.length > LOCATION_DISPLAY_MAX_LENGTH
				? baseAddress.slice(0, LOCATION_DISPLAY_MAX_LENGTH).trim() + '…'
				: baseAddress;
		}

		const locationLabels: Record<ServiceLocationTypeEnum, string> = {
			[ServiceLocationTypeEnum.REMOTE]: $t('dashboard.services.create.location.remote_title') || 'Remote',
			[ServiceLocationTypeEnum.TASKER_LOCATION]: $t('dashboard.services.create.location.tasker_title') || 'At My Location',
			[ServiceLocationTypeEnum.TASKEE_LOCATION]: $t('dashboard.services.create.location.taskee_title') || 'At Tasker Location'
		};

		return service.serviceLocationTypes
			.map((type: ServiceLocationTypeEnum) => locationLabels[type] || type)
			.join(', ');
	}

	// Handle card click - when map visible: select on map; otherwise go to detail (same as TaskCard)
	function handleCardClick(e: MouseEvent | KeyboardEvent): void {
		if (e.type === 'keydown') {
			const keyEvent = e as KeyboardEvent;
			if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') {
				return;
			}
			keyEvent.preventDefault();
		}

		// Don't handle if click came from a button
		if ((e.target as HTMLElement).closest('button')) {
			return;
		}

		if (isMapVisible && onSelectServiceForMap) {
			onSelectServiceForMap(service);
		} else {
			const serviceIdentifier = service.uniqueId || service.id;
			goto(`/services/${serviceIdentifier}`);
		}
		if (onclick) {
			onclick();
		}
	}

	// Get portfolio images (non-video)
	let portfolioImages = $derived.by<Attachment[]>(() => {
		if (service.portfolio && service.portfolio.length > 0) {
			return service.portfolio.filter((item: Attachment) => {
				if (!item?.url) return false;
				const url = item.url.toLowerCase();
				return !url.endsWith('.mp4') && !url.endsWith('.webm') && !url.endsWith('.ogg') && !url.endsWith('.mov');
			});
		}
		return [];
	});

	let currentImageIndex = $state(0);

	// Get rating (hardcoded if not available)
	let rating = $derived(service.creator?.rating || 0);

	// Display title and description in current locale (reactive to language switch)
	const currentLocale = $derived($locale || 'en');
	const displayTitle = $derived(getServiceDisplayTitle(service, currentLocale));
	const displayDescription = $derived(getServiceDisplayDescription(service, currentLocale));
</script>

<div
	class="card bg-base-100 rounded-xl shadow-md hover:shadow-xl transition-all cursor-pointer overflow-hidden h-full flex flex-col gap-0 p-0"
	class:bg-base-300={selectedService && (service.uniqueId || service.id) === (selectedService.uniqueId || selectedService.id)}
	class:border-primary={selectedService && (service.uniqueId || service.id) === (selectedService.uniqueId || selectedService.id)}
	class:border-2={selectedService && (service.uniqueId || service.id) === (selectedService.uniqueId || selectedService.id)}
	role="button"
	tabindex="0"
	onclick={handleCardClick}
	onkeydown={handleCardClick}
>
	<!-- Portfolio Image - Compact (50% smaller) -->
	<figure class="relative w-full h-[88px] overflow-hidden bg-base-200 shrink-0 rounded-t-xl mt-0">
		{#if portfolioImages.length > 0}
			<div class="relative h-full w-full">
				<img
					src={portfolioImages[currentImageIndex]?.url}
					alt={displayTitle || 'Service image'}
					class="h-full w-full object-cover transition-opacity duration-300"
					loading="lazy"
				/>
				<!-- Carousel Controls - Show if 2 or more images -->
				{#if portfolioImages.length > 1}
					<!-- Previous Button -->
					{#if currentImageIndex > 0}
						<button
							class="absolute left-2 top-1/2 -translate-y-1/2 btn btn-circle btn-sm btn-ghost bg-base-100/80 hover:bg-base-100 backdrop-blur-sm border-0 shadow-sm"
							onclick={(e) => {
								e.stopPropagation();
								currentImageIndex = Math.max(0, currentImageIndex - 1);
							}}
							aria-label="Previous image"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
							</svg>
						</button>
					{/if}
					<!-- Next Button -->
					{#if currentImageIndex < portfolioImages.length - 1}
						<button
							class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-circle btn-sm btn-ghost bg-base-100/80 hover:bg-base-100 backdrop-blur-sm border-0 shadow-sm"
							onclick={(e) => {
								e.stopPropagation();
								currentImageIndex = Math.min(portfolioImages.length - 1, currentImageIndex + 1);
							}}
							aria-label="Next image"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
							</svg>
						</button>
					{/if}
					<!-- Image Indicators -->
					<div class="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
						{#each portfolioImages.slice(0, 5) as img, idx (img?.url ?? idx)}
							<button
								class="h-1.5 rounded-full transition-all {idx === currentImageIndex
									? 'w-4 bg-base-100'
									: 'w-1.5 bg-base-100/50'}"
								onclick={(e) => {
									e.stopPropagation();
									currentImageIndex = idx;
								}}
								aria-label="Go to image {idx + 1}"
							></button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="h-full w-full bg-linear-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-16 w-16 text-base-content/30"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
					/>
				</svg>
			</div>
		{/if}
	</figure>

	<!-- Card Body - Same layout as TaskCard: Title+Price+Share | Location (arriba) | Description | Provider+Ver (abajo) -->
	<div class="card-body rounded-b-xl p-4 flex-1 flex flex-col">
		<!-- Top Row: Title + Share + Price (matches TaskCard: Title + Status+Share+Price) -->
		<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<span class="card-title line-clamp-2 text-lg font-semibold text-base-content">
					{displayTitle}
				</span>
				<p class="text-sm text-base-content/80 whitespace-pre-line line-clamp-2 mt-1">
					{displayDescription}
				</p>
			</div>
			<div class="flex shrink-0 flex-col items-end gap-2">
				<span
					role="presentation"
					class="shrink-0"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.key === 'Enter' && e.stopPropagation()}
				>
					<ServiceShareButton {service} variant="circle" class="btn-xs" />
				</span>
				<div class="text-right">
					<div class="text-base font-bold leading-tight">{getPricingDisplay()}</div>
					{#if service.pricing?.type === ServicePricingTypeEnum.FIXED && service.pricing.amount}
						<div class="text-base-content/60 text-sm">
							{satsFromUsd(service.pricing.amount, btcPrice)}
						</div>
					{:else if service.pricing?.type === ServicePricingTypeEnum.HOURLY && service.pricing.hourlyRate}
						<div class="text-xs text-base-content/60 leading-tight">
							{satsFromUsd(service.pricing.hourlyRate, btcPrice)}/hr
						</div>
					{:else if service.pricing?.type === ServicePricingTypeEnum.TIERED && service.pricing.tiers && service.pricing.tiers.length > 0}
						<div class="text-xs text-base-content/60 leading-tight">
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
		</div>

		<!-- Second Row: Location (arriba - matches TaskCard Deadline+Location) -->
		{#if getLocationTypesDisplay()}
			<div class="mb-3 flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5 shrink-0 text-primary"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
					/>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
					/>
				</svg>
				<span class="text-sm text-base-content/80 truncate flex-1 min-w-0">{getLocationTypesDisplay()}</span>
			</div>
		{/if}

		<!-- Categories and Skills -->
		{#if (service.categories && service.categories.length > 0) || (service.skills && service.skills.length > 0)}
			{@const totalCategories = service.categories?.length || 0}
			{@const totalSkills = service.skills?.length || 0}
			{@const shownCategories = service.categories?.slice(0, 2) || []}
			{@const shownSkills = service.skills?.slice(0, 2) || []}
			{@const remainingCount = Math.max(0, (totalCategories - 2) + (totalSkills - 2))}
			<div class="flex flex-wrap gap-1.5 mb-3 max-h-11.5 overflow-hidden">
				{#if shownCategories.length > 0}
					{#each shownCategories as category, i (`cat-${i}-${typeof category === 'string' ? category : category.name}`)}
						<span class="badge badge-sm badge-info badge-outline">
							{typeof category === 'string' ? category : category.name}
						</span>
					{/each}
				{/if}
				{#if shownSkills.length > 0}
					{#each shownSkills as skill (skill)}
						<span class="badge badge-sm badge-info badge-outline">{skill}</span>
					{/each}
				{/if}
				{#if remainingCount > 0}
					<span class="badge badge-sm badge-info badge-outline">+{remainingCount}</span>
				{/if}
			</div>
		{/if}

		<!-- Bottom Row: Avatar + Ver (abajo - matches TaskCard) -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mt-auto">
			{#if service.creator}
				<div class="flex min-w-0 flex-1 items-center gap-3">
					{#if service.creator.avatar}
						<Avatar name={service.creator.username} picture={service.creator.avatar} size="md" />
					{:else}
						<Avatar name={service.creator.username} size="md" />
					{/if}
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium text-base-content truncate">
							{service.creator.username}
						</div>
						{#if service.createdAt}
							<div class="text-xs text-base-content/60">
								{$t('common.profile.member_since')} {formatMemberSince(service.createdAt)}
							</div>
						{/if}
						<div class="flex items-center gap-1.5">
							{#each [0, 1, 2, 3, 4] as idx (idx)}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3 w-3 text-base-content/40"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
								</svg>
							{/each}
							<span class="text-base-content/60 text-xs">{rating.toFixed(1)}</span>
						</div>
					</div>
				</div>
			{:else}
				<div class="flex-1"></div>
			{/if}
			<div class="flex w-full shrink-0 items-center gap-2 md:w-auto">
				{#if isInquiryRequired && onRequestQuote}
					<button
						class="btn btn-primary btn-sm flex-1 md:flex-none"
						onclick={(e) => {
							e.stopPropagation();
							onRequestQuote(service);
						}}
						aria-label={$t('dashboard.services.browse.quote')}
					>
						<IconPlus class="h-4 w-4" />
						{$t('dashboard.services.browse.quote')}
					</button>
				{/if}
				<button
					class="btn btn-secondary btn-sm flex-1 md:flex-none"
					onclick={(e) => {
						e.stopPropagation();
						const serviceIdentifier = service.uniqueId || service.id;
						goto(`/services/${serviceIdentifier}`);
					}}
					aria-label={$t('dashboard.services.browse.view')}
				>
					<IconEye class="h-4 w-4" />
					{$t('dashboard.services.browse.view')}
				</button>
			</div>
		</div>
	</div>
</div>
