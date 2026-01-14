<script lang="ts">
	import type { Service, ServiceTier } from '$lib/types/service.d';
	import type { Attachment } from '$lib/types/task.d';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';

	const { service, btcPrice, onclick } = $props<{
		service: Service;
		btcPrice: number;
		onclick?: () => void;
	}>();

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

	// Helper function to get location types display
	function getLocationTypesDisplay(): string {
		if (!service.serviceLocationTypes || service.serviceLocationTypes.length === 0) {
			return '';
		}

		const locationLabels: Record<ServiceLocationTypeEnum, string> = {
			[ServiceLocationTypeEnum.REMOTE]: $t('dashboard.services.create.location.remote_title') || 'Remote',
			[ServiceLocationTypeEnum.TASKER_LOCATION]: $t('dashboard.services.create.location.tasker_title') || 'At My Location',
			[ServiceLocationTypeEnum.TASKEE_LOCATION]: $t('dashboard.services.create.location.taskee_title') || 'At Client Location'
		};

		return service.serviceLocationTypes
			.map((type: ServiceLocationTypeEnum) => locationLabels[type] || type)
			.join(', ');
	}

	// Handle card click
	function handleCardClick(e: MouseEvent | KeyboardEvent): void {
		if (e.type === 'keydown') {
			const keyEvent = e as KeyboardEvent;
			if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') {
				return;
			}
			keyEvent.preventDefault();
		}

		const serviceIdentifier = service.uniqueId || service.id;
		goto(`/services/${serviceIdentifier}`);
		if (onclick) {
			onclick();
		}
	}

	// Handle heart icon click (favorite)
	function handleFavoriteClick(e: MouseEvent): void {
		e.stopPropagation();
		// TODO: Implement favorite functionality
		console.log('Favorite clicked for service:', service.id);
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
	let rating = $derived(service.creator?.rating || 4.2);
</script>

<div
	class="card bg-base-100 shadow-md hover:shadow-xl transition-all cursor-pointer overflow-hidden h-full flex flex-col"
	role="button"
	tabindex="0"
	onclick={handleCardClick}
	onkeydown={handleCardClick}
>
	<!-- Portfolio Image - Larger, more prominent with carousel if multiple images -->
	<figure class="relative w-full h-48 overflow-hidden bg-base-200 shrink-0">
		{#if portfolioImages.length > 0}
			<div class="relative h-full w-full">
				<img
					src={portfolioImages[currentImageIndex]?.url}
					alt={service.title || 'Service image'}
					class="h-full w-full object-cover transition-opacity duration-300"
					loading="lazy"
				/>
				<!-- Carousel Controls - Only show if more than 2 images -->
				{#if portfolioImages.length > 2}
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
						{#each portfolioImages.slice(0, 5) as _, i}
							<button
								class="h-1.5 rounded-full transition-all {i === currentImageIndex
									? 'w-4 bg-base-100'
									: 'w-1.5 bg-base-100/50'}"
								onclick={(e) => {
									e.stopPropagation();
									currentImageIndex = i;
								}}
								aria-label="Go to image {i + 1}"
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
		<!-- Heart Icon - Top Right -->
		<button
			class="absolute top-2 right-2 btn btn-circle btn-sm btn-ghost bg-base-100/80 hover:bg-base-100 backdrop-blur-sm border-0 shadow-sm"
			onclick={handleFavoriteClick}
			aria-label="Add to favorites"
			title="Add to favorites"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 text-base-content/70 hover:text-error"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
				/>
			</svg>
		</button>
	</figure>

	<!-- Card Body -->
	<div class="card-body p-4 flex-1 flex flex-col">
		<!-- Provider Info - Single line, compact with rating -->
		{#if service.creator}
			<div class="flex items-center gap-2">
				{#if service.creator.avatar}
					<div class="avatar shrink-0">
						<div class="w-7 h-7 rounded-full">
							<img src={service.creator.avatar} alt={service.creator.username || 'Provider'} />
						</div>
					</div>
				{/if}
				<div class="flex items-center gap-1.5 flex-1 min-w-0">
					<span class="text-sm font-medium text-base-content truncate">{service.creator.username || 'Provider'}</span>
					<!-- Rating Stars - Always show, hardcoded if not available -->
					<div class="flex items-center gap-0.5 shrink-0">
						{#each Array(5) as _, i}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-3.5 w-3.5 {i < Math.round(rating)
									? 'text-warning fill-current'
									: 'text-base-content/30'}"
								viewBox="0 0 24 24"
							>
								<path
									d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
								/>
							</svg>
						{/each}
						<span class="text-xs font-semibold text-base-content ml-0.5">
							{rating.toFixed(1)}
						</span>
					</div>
				</div>
			</div>
		{/if}

		<!-- Service Title with Price - Larger, more prominent -->
		<div class="flex items-start justify-between gap-2">
			<span class="text-sm font-semibold line-clamp-2 text-base-content hover:text-primary transition-colors">
				{service.title}
			</span>
			<!-- Price - Next to title -->
			<div class="text-right shrink-0">
				<div class="text-base font-bold leading-tight">{getPricingDisplay()}</div>
				{#if service.pricing?.type === ServicePricingTypeEnum.FIXED && service.pricing.amount}
					<div class="text-base-content/60 font-s} text-sm">
						{satsFromUsd(service.pricing.amount, btcPrice)}
					</div>
				{:else if service.pricing?.type === ServicePricingTypeEnum.HOURLY && service.pricing.hourlyRate}
					<div class="text-xs text-base-content/60 leading-tight">
						{satsFromUsd(service.pricing.hourlyRate, btcPrice)} Sats/hr
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
						)}{' '}
						Sats
					</div>
				{/if}
			</div>
		</div>

		<!-- Description -->
		{#if service.description}
			<p class="text-sm text-base-content/70 line-clamp-2 mb-2">{service.description}</p>
		{/if}

		<!-- Categories and Skills - Moved up, no border, limit to 2 and show +X -->
		{#if (service.categories && service.categories.length > 0) || (service.skills && service.skills.length > 0)}
			{@const totalCategories = service.categories?.length || 0}
			{@const totalSkills = service.skills?.length || 0}
			{@const shownCategories = service.categories?.slice(0, 2) || []}
			{@const shownSkills = service.skills?.slice(0, 2) || []}
			{@const remainingCount = Math.max(0, (totalCategories - 2) + (totalSkills - 2))}
			<div class="flex flex-wrap gap-1.5 mb-2">
				{#if shownCategories.length > 0}
					{#each shownCategories as category}
						<span class="badge badge-sm badge-info badge-outline">
							{typeof category === 'string' ? category : category.name}
						</span>
					{/each}
				{/if}
				{#if shownSkills.length > 0}
					{#each shownSkills as skill}
						<span class="badge badge-sm badge-info badge-outline">{skill}</span>
					{/each}
				{/if}
				{#if remainingCount > 0}
					<span class="badge badge-sm badge-info badge-outline">+{remainingCount}</span>
				{/if}
			</div>
		{/if}

		<!-- Location - At bottom, no border -->
		{#if getLocationTypesDisplay()}
			<div class="flex items-center gap-1.5 text-xs text-base-content/60 mt-auto">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 shrink-0"
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
				<span class="truncate">{getLocationTypesDisplay()}</span>
			</div>
		{/if}
	</div>
</div>
