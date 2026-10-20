<script lang="ts">
	import type { Service, ServiceTier } from '$lib/types/service.d';
	import type { Attachment, Location } from '$lib/types/task.d';
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import {
		getServiceDisplayTitle,
		getServiceDisplayDescription
	} from '$lib/utils/serviceDisplayTranslation';
	import { formatServicePriceAmount, servicePagePath } from '$lib/utils/service/listing';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import ServiceShareButton from './ServiceShareButton.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import { authState } from '$lib/stores/auth.store';
	import IconEye from '~icons/mdi/eye';
	import IconPlus from '~icons/mdi/plus';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';

	const {
		service,
		btcPrice,
		onclick,
		selectedService,
		onSelectServiceForMap,
		isMapVisible,
		onRequestQuote,
		canRequestQuote = true
	} = $props<{
		service: Service;
		btcPrice: number;
		onclick?: () => void;
		selectedService?: Service | null;
		onSelectServiceForMap?: (service: Service) => void;
		isMapVisible?: boolean;
		onRequestQuote?: (service: Service) => void;
		canRequestQuote?: boolean;
	}>();

	const isInquiryRequired = $derived(
		service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED
	);
	const showRequestQuoteButton = $derived(isInquiryRequired && !!onRequestQuote && canRequestQuote);

	// Display title and description in current locale (reactive to language switch)
	const currentLocale = $derived($locale || 'en');
	const displayTitle = $derived(getServiceDisplayTitle(service, currentLocale));
	const displayDescription = $derived(getServiceDisplayDescription(service, currentLocale));

	let currentIndex = $state(0);
	let resolvedCreatorName = $state<string | null>(null);

	const LOCATION_LABELS: Record<ServiceLocationTypeEnum, string> = {
		[ServiceLocationTypeEnum.REMOTE]:
			$t('dashboard.services.create.location.remote_title') || 'Remote',
		[ServiceLocationTypeEnum.TASKER_LOCATION]:
			$t('dashboard.services.create.location.tasker_title') || 'At Tasker Location',
		[ServiceLocationTypeEnum.TASKEE_LOCATION]:
			$t('dashboard.services.create.location.taskee_title') || 'At My Location'
	};

	// Helper function to get pricing display
	function getPricingDisplay(): string {
		if (!service.pricing) {
			return $t('dashboard.services.browse.pricing.inquiry_required') || 'Request Quote';
		}

		switch (service.pricing.type) {
			case ServicePricingTypeEnum.FIXED:
				if (service.pricing.amount) {
					return formatServicePriceAmount(service.pricing.amount, service.pricing.currency);
				}
				return $t('dashboard.services.browse.pricing.not_set') || 'Price not set';
			case ServicePricingTypeEnum.HOURLY:
				if (service.pricing.hourlyRate) {
					return `${formatServicePriceAmount(service.pricing.hourlyRate, service.pricing.currency)}/hr`;
				}
				return $t('dashboard.services.browse.pricing.not_set') || 'Price not set';
			case ServicePricingTypeEnum.TIERED:
				if (service.pricing.tiers && service.pricing.tiers.length > 0) {
					const prices = service.pricing.tiers
						.map((tier: ServiceTier) => tier.price)
						.filter(
							(price: number | undefined): price is number => typeof price === 'number' && price > 0
						);
					if (prices.length > 0) {
						const minPrice = Math.min(...prices);
						return formatServicePriceAmount(minPrice, service.pricing.currency);
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

	function getDisplayedLocationDetails(): { text: string; location: Location | null } {
		if (!service.serviceLocationTypes || service.serviceLocationTypes.length === 0) {
			return { text: '', location: null };
		}

		const taskerLocation = service.locationDetails?.taskerLocation?.serviceLocation ?? null;
		const taskeeLocation = service.locationDetails?.taskeeLocation?.serviceLocation ?? null;
		const hasTaskerLocation = service.serviceLocationTypes.includes(
			ServiceLocationTypeEnum.TASKER_LOCATION
		);
		const hasTaskeeLocation = service.serviceLocationTypes.includes(
			ServiceLocationTypeEnum.TASKEE_LOCATION
		);
		const taskeeAddress =
			service.locationDetails?.taskeeLocation?.locationDisplayName ||
			taskeeLocation?.displayName ||
			taskeeLocation?.formattedAddress;
		const taskerAddress = taskerLocation?.displayName || taskerLocation?.formattedAddress;

		if (hasTaskeeLocation && taskeeAddress) {
			return {
				text:
					taskeeAddress.length > LOCATION_DISPLAY_MAX_LENGTH
						? taskeeAddress.slice(0, LOCATION_DISPLAY_MAX_LENGTH).trim() + '…'
						: taskeeAddress,
				location: taskeeLocation
			};
		}

		if (hasTaskerLocation && taskerAddress) {
			return {
				text:
					taskerAddress.length > LOCATION_DISPLAY_MAX_LENGTH
						? taskerAddress.slice(0, LOCATION_DISPLAY_MAX_LENGTH).trim() + '…'
						: taskerAddress,
				location: taskerLocation
			};
		}

		return {
			text: service.serviceLocationTypes
				.map((type: ServiceLocationTypeEnum) => LOCATION_LABELS[type] || type)
				.join(', '),
			location: null
		};
	}

	const displayedLocationDetails = $derived(getDisplayedLocationDetails());

	// Handle card click - when map visible: select on map; otherwise go to detail (same as TaskCard)
	function handleCardClick(e: MouseEvent | KeyboardEvent): void {
		if (e.type === 'keydown') {
			const keyEvent = e as KeyboardEvent;
			if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') {
				return;
			}
			keyEvent.preventDefault();
		}

		const target = e.target as HTMLElement | null;
		if (target?.closest('a, button')) {
			return;
		}

		if (isMapVisible && onSelectServiceForMap) {
			onSelectServiceForMap(service);
		} else {
			void goto(servicePagePath(service));
		}
		if (onclick) {
			onclick();
		}
	}

	interface PortfolioItem extends Attachment {
		isVideo: boolean;
	}

	function itemIsVideo(item: Attachment): boolean {
		if (item?.cloudflareId) return true;
		if (!item?.url) return false;
		const url = item.url.toLowerCase();
		return (
			url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.ogg') || url.endsWith('.mov')
		);
	}

	// Single portfolio items preserving original upload order — mark each as video if applicable
	let portfolioItems = $derived.by<PortfolioItem[]>(() => {
		if (!service.portfolio || service.portfolio.length === 0) return [];
		const validItems = service.portfolio.filter((item: Attachment) => {
			if (!item?.url) return false;
			const url = item.url.toLowerCase();
			return url.startsWith('http://') || url.startsWith('https://');
		});
		return validItems.map((item: Attachment) => ({
			...item,
			isVideo: itemIsVideo(item)
		}));
	});

	// Helper to get video thumbnail URL for display
	function getVideoThumbnailUrl(item: Attachment): string {
		if (item.cloudflareId) {
			const customerCode = import.meta.env.VITE_STREAM_CUSTOMER_CODE as string;
			if (customerCode) {
				return `https://customer-${customerCode}.cloudflarestream.com/${item.cloudflareId}/thumbnails/thumbnail.jpg`;
			}
		}
		return item?.url || '';
	}
</script>

<div
	class="card bt-card bg-base-100 focus-visible:ring-primary flex h-full min-h-0 cursor-pointer flex-col overflow-hidden rounded-xl p-0 shadow-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
	class:bg-base-300={selectedService &&
		(service.uniqueId || service.id) === (selectedService.uniqueId || selectedService.id)}
	class:border-primary={selectedService &&
		(service.uniqueId || service.id) === (selectedService.uniqueId || selectedService.id)}
	class:border-2={selectedService &&
		(service.uniqueId || service.id) === (selectedService.uniqueId || selectedService.id)}
	role="button"
	tabindex="0"
	onclick={handleCardClick}
	onkeydown={handleCardClick}
>
	<!-- Portfolio Image - Compact (50% smaller) -->
	<figure class="bg-base-200 relative mt-0 h-[88px] w-full shrink-0 overflow-hidden rounded-t-xl">
		{#if portfolioItems.length > 0}
			<div class="relative h-full w-full">
				{#if portfolioItems[currentIndex]?.isVideo}
					<img
						src={getVideoThumbnailUrl(portfolioItems[currentIndex])}
						alt={portfolioItems[currentIndex]?.alt || displayTitle || 'Service video'}
						class="h-full w-full object-cover transition-opacity duration-300"
						loading="lazy"
					/>
					<!-- Play icon overlay -->
					<div class="absolute right-1 bottom-1 rounded-full bg-black/60 p-1">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3 w-3 text-white"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path d="M8 5v14l11-7z" />
						</svg>
					</div>
				{:else}
					<img
						src={portfolioItems[currentIndex]?.url}
						alt={displayTitle || 'Service image'}
						class="h-full w-full object-cover transition-opacity duration-300"
						loading="lazy"
					/>
				{/if}
				<!-- Carousel Controls - Show if 2 or more items -->
				{#if portfolioItems.length > 1}
					<!-- Previous Button -->
					{#if currentIndex > 0}
						<button
							class="btn btn-circle btn-sm btn-ghost bg-base-100/80 hover:bg-base-100 absolute top-1/2 left-2 min-h-11 min-w-11 -translate-y-1/2 border-0 shadow-sm backdrop-blur-sm"
							onclick={(e) => {
								e.stopPropagation();
								currentIndex = Math.max(0, currentIndex - 1);
							}}
							aria-label="Previous item"
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
					{#if currentIndex < portfolioItems.length - 1}
						<button
							class="btn btn-circle btn-sm btn-ghost bg-base-100/80 hover:bg-base-100 absolute top-1/2 right-2 min-h-11 min-w-11 -translate-y-1/2 border-0 shadow-sm backdrop-blur-sm"
							onclick={(e) => {
								e.stopPropagation();
								currentIndex = Math.min(portfolioItems.length - 1, currentIndex + 1);
							}}
							aria-label="Next item"
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
				{/if}
			</div>
		{:else}
			<div
				class="from-primary/20 to-secondary/20 flex h-full w-full items-center justify-center bg-linear-to-br"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/30 h-16 w-16"
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
	<div class="card-body flex min-h-0 flex-1 flex-col rounded-b-xl p-4">
		<!-- Top Row: Title + Share + Price (matches TaskCard: Title + Status+Share+Price) -->
		<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<span
					class="card-title text-base-content line-clamp-2 text-lg font-semibold"
					title={displayTitle}
				>
					{displayTitle}
				</span>
				<p
					class="text-base-content/80 mt-1 line-clamp-2 text-sm whitespace-pre-line"
					title={displayDescription}
				>
					{displayDescription}
				</p>
			</div>
			<div class="flex shrink-0 flex-col items-end gap-2">
				<span class="flex shrink-0 items-center gap-1">
					<ServiceShareButton {service} variant="circle" class="btn-xs" />
					{#if $authState.isAuthenticated && service.npub}
						<ActionsMenu
							contentType="service"
							reportedPubkey={service.npub}
							reportedEventId={service.id}
							username={resolvedCreatorName || undefined}
						/>
					{/if}
				</span>
				<div class="text-right">
					{#if service.pricing?.type === ServicePricingTypeEnum.TIERED && service.pricing.tiers && service.pricing.tiers.length > 0}
						<div class="text-base-content/60 text-xs leading-tight">
							{$t('dashboard.services.browse.pricing.from_price') || 'From'}
						</div>
					{/if}
					<div class="text-base leading-tight font-bold" aria-label="Price: {getPricingDisplay()}">
						{getPricingDisplay()}
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
		</div>

		<!-- Second Row: Location (arriba - matches TaskCard Deadline+Location) -->
		{#if displayedLocationDetails.text}
			<div class="mb-3 flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-primary h-5 w-5 shrink-0"
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
				<span
					class="text-base-content/80 min-w-0 flex-1 truncate text-sm"
					title={displayedLocationDetails.text}>{displayedLocationDetails.text}</span
				>
			</div>
		{/if}

		<!-- Categories -->
		{#if service.categories && service.categories.length > 0}
			<div class="mb-3 flex max-h-11.5 flex-wrap gap-1.5 overflow-hidden">
				{#each service.categories as category, i (`cat-${i}-${typeof category === 'string' ? category : category.name}`)}
					<span class="badge badge-sm badge-info badge-outline">
						{typeof category === 'string' ? category : category.name}
					</span>
				{/each}
			</div>
		{/if}

		<!-- Bottom Row: Avatar + Ver (abajo - matches TaskCard) -->
		<div class="mt-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<UserInfoDisplay
				avatar={service.creator?.avatar}
				username={service.creator?.username}
				size="sm"
				pubkey={service.npub}
				onResolvedName={(name) => (resolvedCreatorName = name)}
			/>
			<div class="flex w-full shrink-0 items-center gap-2 md:w-auto">
				{#if showRequestQuoteButton}
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
				<a
					class="btn btn-primary btn-sm flex-1 md:flex-none"
					href={servicePagePath(service)}
					data-testid="service-view-link"
					aria-label={$t('dashboard.services.browse.view')}
				>
					<IconEye class="h-4 w-4" />
					{$t('dashboard.services.browse.view')}
				</a>
			</div>
		</div>
	</div>
</div>
