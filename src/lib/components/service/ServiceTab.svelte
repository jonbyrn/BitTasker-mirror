<script lang="ts">
	import type { Service, ServiceTier, ServiceAddOn, ServiceFAQ } from '$lib/types/service';
	import { t } from 'svelte-i18n';
	import { getServiceDisplayTitle, getServiceDisplayDescription, getServiceDisplayTiers, getServiceDisplayAddOns, getServiceDisplayFaqs } from '$lib/utils/serviceDisplayTranslation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import ServiceShareButton from './ServiceShareButton.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import IconPencilOutline from '~icons/mdi/pencil-outline';
	import IconDeleteOutline from '~icons/mdi/delete-outline';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconStarOutline from '~icons/mdi/star-outline';
	import IconPlus from '~icons/mdi/plus';
	import IconHelpCircleOutline from '~icons/mdi/help-circle-outline';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconChevronUp from '~icons/mdi/chevron-up';

	let { service, isOwner, onRequestEditConfirm, onRequestDeleteConfirm, isDeleting, onQuotes } = $props<{
		service: Service;
		isOwner: boolean;
		onRequestEditConfirm?: () => void;
		onRequestDeleteConfirm?: () => void;
		isDeleting?: boolean;
		onQuotes?: () => void;
	}>();

	let btcPrice = $state<number>(63000);
	let canDelete = $state(true);
	let isCheckingDelete = $state(false);
	let canEdit = $state(true);
	let isCheckingEdit = $state(false);

	// FAQ expansion state
	let expandedFaqs = $state<Set<number>>(new Set());

	// Toggle FAQ expansion
	function toggleFaq(index: number) {
		const newSet = new Set(expandedFaqs);
		if (newSet.has(index)) {
			newSet.delete(index);
		} else {
			newSet.add(index);
		}
		expandedFaqs = newSet;
	}

	// Helper function to format date string with time
	function formatDateStringWithTime(date: string | number): string {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		if (!dateObj || isNaN(dateObj.getTime())) return '';
		return formatStandardDateTime(dateObj, $locale || 'en');
	}

	// Get translated content
	const displayTitle = $derived(getServiceDisplayTitle(service, 'en'));
	const displayDescription = $derived(getServiceDisplayDescription(service, 'en'));
	const displayTiers = $derived(getServiceDisplayTiers(service, 'en') || []);
	const displayAddOns = $derived(getServiceDisplayAddOns(service, 'en') || []);
	const displayFaqs = $derived(getServiceDisplayFaqs(service, 'en') || []);

	// Filter tiers with price
	const tiersWithPrice = $derived(displayTiers.filter((t: ServiceTier) => (t.price ?? 0) > 0));

	// Helper function to translate a single category
	function translateCategory(category: string | { id: string; name: string }): string {
		try {
			const categoryId = typeof category === 'string' ? category : category.id;
			const categoryObj = TASK_CATEGORIES.find((cat) => cat.id === categoryId);
			if (categoryObj) {
				const translatedName = $t(`categories.${categoryObj.slug}.name`);
				return translatedName.startsWith('categories.') ? categoryObj.name : translatedName;
			}
			return categoryId;
		} catch (error) {
			return typeof category === 'string' ? category : category.id || '';
		}
	}

	const translatedCategories = $derived(service?.categories?.map(translateCategory) || []);

	// Prepare gallery images
	async function prepareGalleryImages(attachments: any[]) {
		if (!attachments || attachments.length === 0) return [];
		const imagePromises = attachments
			.filter((attachment) => {
				const urlLower = attachment.url?.toLowerCase() || '';
				return !urlLower.endsWith('.mp4') && !urlLower.endsWith('.webm') && !urlLower.endsWith('.mov');
			})
			.map((attachment) => {
				return new Promise<{
					url: string;
					largeURL?: string;
					alt: string;
					width: number;
					height: number;
					size: number;
				}>((resolve) => {
					const img = new Image();
					const fullSizeUrl = attachment.url;
					img.onload = () => {
						resolve({
							url: fullSizeUrl,
							largeURL: fullSizeUrl,
							alt: attachment.alt || 'Service image',
							width: img.naturalWidth,
							height: img.naturalHeight,
							size: attachment.size || 0
						});
					};
					img.onerror = () => {
						resolve({
							url: fullSizeUrl,
							largeURL: fullSizeUrl,
							alt: attachment.alt || 'Service image',
							width: 0,
							height: 0,
							size: attachment.size || 0
						});
					};
					img.src = fullSizeUrl;
				});
			});
		return await Promise.all(imagePromises);
	}

	function handleEditService() {
		if (onRequestEditConfirm) {
			onRequestEditConfirm();
		}
	}

	function showDeleteConfirmation() {
		if (!canDelete) return;
		if (onRequestDeleteConfirm) {
			onRequestDeleteConfirm();
		}
	}

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

	function getLocationDisplay(): string {
		const locationDetails = service.locationDetails;

		if (locationDetails?.taskeeLocation?.locationDisplayName) {
			return locationDetails.taskeeLocation.locationDisplayName;
		}

		if (locationDetails?.taskerLocation?.serviceLocation?.displayName) {
			return locationDetails.taskerLocation.serviceLocation.displayName;
		}

		if (locationDetails?.types?.includes('remote')) {
			return 'Remote';
		}

		return '';
	}

	function getServiceRadiusDisplay(): string {
		const locationDetails = service.locationDetails;
		const serviceLocationTypes = service.serviceLocationTypes;

		if (!serviceLocationTypes?.includes('tasker_location')) {
			return '';
		}

		const radius = locationDetails?.taskerLocation?.serviceRadius;
		if (!radius) return '';
		const miles = Math.round(radius * 0.621371 * 10) / 10;
		return `(${radius} km/${miles} mi)`;
	}

	function getDeliveryTimeDisplay(): string {
		if (service.pricing?.deliveryTime?.display) {
			return service.pricing.deliveryTime.display;
		}
		return '';
	}
</script>

<div class="min-w-0 space-y-6 overflow-x-hidden">
	<!-- Service Info Card -->
	<div class="card bg-base-200 min-w-0 overflow-hidden">
		<div class="card-body min-w-0 p-4">
			<!-- Row: Service title (left) and Share button (right) -->
			<div class="mb-4 flex flex-row flex-nowrap items-center justify-between gap-4">
				<div class="min-w-0 flex-1">
					<span class="line-clamp-2 text-lg font-bold leading-tight">
						{displayTitle}
					</span>
				</div>
				<div class="shrink-0 pl-4">
					<ServiceShareButton service={service} variant="default" class="btn-lg" />
				</div>
			</div>

			<!-- Row 2: Description | Price -->
			<div class="mb-4 flex flex-row flex-nowrap items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					<p class="text-sm whitespace-pre-line line-clamp-3">
						{displayDescription || 'No description'}
					</p>
				</div>
				<div class="flex shrink-0 flex-col items-end pl-4">
					<div class="text-right text-xl font-bold">
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

			<!-- Row 3: Location -->
			{#if getLocationDisplay()}
				<div class="mb-4 flex items-center gap-2">
					<IconMapMarker class="text-primary h-5 w-5 shrink-0" />
					<div class="flex min-w-0 flex-wrap items-center gap-1">
						<span class="text-sm font-medium">
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

			<!-- Row 4: Location and Pricing type badges -->
			<div class="flex flex-wrap gap-2">
				{#if service.locationDetails?.types && service.locationDetails.types.length > 0}
					{#each service.locationDetails.types as locationType}
						<span class="badge badge-outline badge-sm">
							{locationType === 'remote'
								? 'Remote'
								: locationType === 'tasker_location'
									? 'My Location'
									: 'Tasker Location'}
						</span>
					{/each}
				{/if}
				{#if service.pricing?.type === ServicePricingTypeEnum.FIXED}
					<span class="badge badge-outline badge-sm">Fixed</span>
				{:else if service.pricing?.type === ServicePricingTypeEnum.HOURLY}
					<span class="badge badge-outline badge-sm">Hourly</span>
				{:else if service.pricing?.type === ServicePricingTypeEnum.TIERED}
					<span class="badge badge-outline badge-sm">Tiered</span>
				{:else}
					<span class="badge badge-outline badge-sm">Quote</span>
				{/if}
				{#if service.status}
					<span class="badge {service.status === 'active' ? 'badge-success' : service.status === 'inactive' ? 'badge-warning' : 'badge-ghost'} badge-sm">
						{service.status}
					</span>
				{/if}
			</div>

			<!-- Row 5: Skills and Categories badges -->
			<div class="flex flex-col gap-3 space-y-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-4">
				{#if service.skills?.length > 0}
					<div class="min-w-0">
						<small class="text-base-content/60 mb-1 block text-sm">
							Skills
						</small>
						<div class="flex flex-wrap gap-1">
							{#each service.skills as skill (skill)}
								<span class="badge badge-primary badge-outline pb-[2px]">{skill}</span>
							{/each}
						</div>
					</div>
				{/if}
				{#if service?.categories?.length > 0}
					<div class="min-w-0">
						<small class="text-base-content/60 mb-1 block text-sm">
							Categories
						</small>
						<div class="flex flex-wrap gap-1">
							{#each translatedCategories as category, i (i)}
								<span class="badge badge-outline badge-info pb-[2px]">
									{category}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Portfolio Images / Gallery -->
			{#if service.attachments && service.attachments.length > 0}
				{#await prepareGalleryImages(service.attachments) then galleryImages}
					{#if galleryImages.length > 0}
						<div class="mt-2 w-full">
							<small class="text-base-content/60 mb-1 block text-sm">
								Portfolio
							</small>
							<Gallery
								galleryID="service-drawer-gallery"
								images={galleryImages}
								thumbnailSize="h-32 w-32"
							/>
						</div>
					{/if}
				{/await}
			{/if}

			<!-- Posted date -->
			<div>
				<small class="text-base-content/60 block text-sm">
					Posted
				</small>
				<p class="font-semibold">{formatDateStringWithTime(service.createdAt)}</p>
			</div>
		</div>
	</div>

	<!-- Tiers Section -->
	{#if tiersWithPrice && tiersWithPrice.length > 0}
		<div class="card bg-base-200 min-w-0 overflow-hidden">
			<div class="card-body min-w-0 p-4">
				<h3 class="mb-3 text-lg font-semibold">Pricing Tiers</h3>
				<div class="space-y-3">
					{#each tiersWithPrice as tier, index (index)}
						<div class="flex flex-col gap-2 rounded-lg bg-base-100 p-3 sm:flex-row sm:items-center sm:justify-between">
							<div class="min-w-0 flex-1">
								<div class="font-medium">{tier.name || `Tier ${index + 1}`}</div>
								{#if tier.features && tier.features.length > 0}
									<ul class="mt-1 space-y-1 text-sm text-base-content/70">
										{#each tier.features as feature}
											<li class="flex items-start gap-1">
												<IconPlus class="mt-0.5 h-3 w-3 shrink-0 text-primary" />
												<span>{feature}</span>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
							<div class="flex shrink-0 flex-col items-end">
								<div class="text-lg font-bold">
									${formatNumberWithTwoDecimals(tier.price ?? 0)}
									<span class="text-base-content/60 text-sm font-normal">
										{satsFromUsd(tier.price ?? 0, btcPrice)}
									</span>
								</div>
								{#if tier.deliveryTime?.display}
									<div class="text-sm text-base-content/60">
										<IconClockOutline class="mr-1 inline h-3 w-3" />
										{tier.deliveryTime.display}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Add-ons Section -->
	{#if displayAddOns && displayAddOns.length > 0}
		<div class="card bg-base-200 min-w-0 overflow-hidden">
			<div class="card-body min-w-0 p-4">
				<h3 class="mb-3 text-lg font-semibold">Add-ons</h3>
				<div class="space-y-2">
					{#each displayAddOns as addon, index (index)}
						<div class="flex flex-col gap-1 rounded-lg bg-base-100 p-3 sm:flex-row sm:items-center sm:justify-between">
							<div class="min-w-0 flex-1">
								<div class="font-medium">{addon.name || `Add-on ${index + 1}`}</div>
								{#if addon.description}
									<p class="text-sm text-base-content/70">{addon.description}</p>
								{/if}
							</div>
							{#if (addon.price ?? 0) > 0}
								<div class="flex shrink-0 items-center gap-2">
									<span class="font-semibold">
										+${formatNumberWithTwoDecimals(addon.price ?? 0)}
									</span>
									<span class="text-sm text-base-content/60">
										{satsFromUsd(addon.price ?? 0, btcPrice)}
									</span>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- FAQs Section -->
	{#if displayFaqs && displayFaqs.length > 0}
		<div class="card bg-base-200 min-w-0 overflow-hidden">
			<div class="card-body min-w-0 p-4">
				<h3 class="mb-3 text-lg font-semibold">FAQs</h3>
				<div class="space-y-2">
					{#each displayFaqs as faq, index (index)}
						<div class="rounded-lg bg-base-100">
							<button
								class="flex w-full items-center justify-between p-3 text-left"
								onclick={() => toggleFaq(index)}
							>
								<span class="font-medium">{faq.question || `Question ${index + 1}`}</span>
								{#if expandedFaqs.has(index)}
									<IconChevronUp class="h-5 w-5 shrink-0" />
								{:else}
									<IconChevronDown class="h-5 w-5 shrink-0" />
								{/if}
							</button>
							{#if expandedFaqs.has(index)}
								<div class="border-t border-base-200 px-3 pb-3">
									<p class="text-sm text-base-content/70">{faq.answer}</p>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Action Buttons Row -->
	<div class="space-y-3 pb-4">
		<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
			<!-- View Quotes Button -->
			{#if onQuotes}
				<button
					class="btn btn-primary btn-sm min-h-[40px] flex-1 gap-2 sm:flex-none"
					onclick={(e) => {
						e.stopPropagation();
						if (onQuotes) {
							onQuotes();
						}
					}}
				>
					<IconEyeOutline class="h-4 w-4 shrink-0" />
					<span>{$t('dashboard.services.detail.view_quotes') || 'View Quotes'}</span>
				</button>
			{/if}

			<!-- Edit Button -->
			{#if isOwner && onRequestEditConfirm && canEdit}
				<button
					class="btn btn-outline btn-sm min-h-[40px] flex-1 sm:flex-none"
					onclick={handleEditService}
					disabled={isCheckingEdit}
				>
					{#if isCheckingEdit}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<IconPencilOutline class="h-4 w-4 shrink-0" />
					{/if}
					{$t('dashboard.services.detail.edit_service') || 'Edit Service'}
				</button>
			{/if}

			<!-- Delete Button -->
			{#if isOwner && onRequestDeleteConfirm}
				<button
					class="btn btn-error btn-sm min-h-[40px] flex-1 sm:flex-none"
					onclick={showDeleteConfirmation}
					disabled={(isDeleting ?? false) || isCheckingDelete || !canDelete}
				>
					{#if (isDeleting ?? false) || isCheckingDelete}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<IconDeleteOutline class="h-4 w-4 shrink-0" />
					{/if}
					{$t('dashboard.services.detail.delete_service') || 'Delete Service'}
				</button>
			{/if}
		</div>
	</div>
</div>