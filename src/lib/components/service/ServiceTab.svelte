<script lang="ts">
	import type { Service, ServiceTier } from '$lib/types/service';
	import { t } from 'svelte-i18n';
	import {
		getServiceDisplayTitle,
		getServiceDisplayDescription,
		getServiceDisplayTiers,
		getServiceDisplayAddOns,
		getServiceDisplayFaqs
	} from '$lib/utils/serviceDisplayTranslation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import ServiceShareButton from './ServiceShareButton.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import IconPencilOutline from '~icons/mdi/pencil-outline';
	import IconDeleteOutline from '~icons/mdi/delete-outline';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconPlus from '~icons/mdi/plus';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import type { Attachment } from '$lib/types/task.d';

	let { service, isOwner, onRequestEditConfirm, onRequestDeleteConfirm, isDeleting, onQuotes } =
		$props<{
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

	let selectedVideo = $state<Attachment | null>(null);

	const videoAttachments = $derived(
		(service.portfolio || []).filter((a: Attachment) => {
			const urlLower = a.url?.toLowerCase() || '';
			const typeLower = a.type?.toLowerCase() || '';
			return (
				a.cloudflareId ||
				typeLower.startsWith('video/') ||
				urlLower.endsWith('.mp4') ||
				urlLower.endsWith('.webm') ||
				urlLower.endsWith('.mov')
			);
		})
	);

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	// Helper function to format date string with time
	function formatDateStringWithTime(date: string | number): string {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		if (!dateObj || isNaN(dateObj.getTime())) return '';
		return formatStandardDateTime(dateObj, $locale || 'en');
	}

	// Get translated content
	const displayTitle = $derived(getServiceDisplayTitle(service, $locale || 'en'));
	const displayDescription = $derived(getServiceDisplayDescription(service, $locale || 'en'));
	const displayTiers = $derived(getServiceDisplayTiers(service, $locale || 'en') || []);
	const displayAddOns = $derived(getServiceDisplayAddOns(service, $locale || 'en') || []);
	const displayFaqs = $derived(getServiceDisplayFaqs(service, $locale || 'en') || []);

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
		} catch {
			return typeof category === 'string' ? category : category.id || '';
		}
	}

	const translatedCategories = $derived(service?.categories?.map(translateCategory) || []);

	// Prepare gallery images
	async function prepareGalleryImages(attachments: Attachment[]) {
		if (!attachments || attachments.length === 0) return [];
		const imagePromises = attachments
			.filter((attachment) => {
				const urlLower = attachment.url?.toLowerCase() || '';
				return (
					!urlLower.endsWith('.mp4') && !urlLower.endsWith('.webm') && !urlLower.endsWith('.mov')
				);
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
							alt: attachment.alt || tr('dashboard.services.detail.image_alt', 'Service image'),
							width: img.naturalWidth,
							height: img.naturalHeight,
							size: attachment.size || 0
						});
					};
					img.onerror = () => {
						resolve({
							url: fullSizeUrl,
							largeURL: fullSizeUrl,
							alt: attachment.alt || tr('dashboard.services.detail.image_alt', 'Service image'),
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

	function getLowestTierPrice(): number | null {
		if (service.pricing?.type !== ServicePricingTypeEnum.TIERED || !service.pricing.tiers?.length) {
			return null;
		}

		const prices = service.pricing.tiers
			.map((tier: { name?: string; price?: number }) => tier.price)
			.filter((price: number | undefined): price is number => price != null && price > 0);

		if (prices.length === 0) {
			return null;
		}

		return Math.min(...prices);
	}

	function getPriceDisplay(): string {
		if (service.pricing?.type === ServicePricingTypeEnum.FIXED) {
			return `$${formatNumberWithTwoDecimals(service.pricing.amount || 0)}`;
		} else if (service.pricing?.type === ServicePricingTypeEnum.HOURLY) {
			return `$${formatNumberWithTwoDecimals(service.pricing.hourlyRate || 0)}/hr`;
		} else if (service.pricing?.type === ServicePricingTypeEnum.TIERED) {
			const lowestTierPrice = getLowestTierPrice();
			if (lowestTierPrice != null) {
				return `${tr('dashboard.services.detail.pricing_type.from', 'From')} $${formatNumberWithTwoDecimals(lowestTierPrice)}`;
			}
			return tr('dashboard.services.detail.pricing_type.tiered_pricing', 'Tiered pricing');
		}
		return tr('dashboard.services.detail.pricing_type.quote_required', 'Quote required');
	}

	function getServiceLocationTypes(): string[] {
		if (service.serviceLocationTypes?.length) {
			return service.serviceLocationTypes;
		}

		return (service.locationDetails as { types?: string[] } | undefined)?.types ?? [];
	}

	function getLocationTypeLabel(locationType: string): string {
		if (locationType === 'remote') {
			return tr('dashboard.services.detail.location.remote', 'Remote');
		}

		if (locationType === 'tasker_location') {
			return tr('dashboard.services.detail.location.my_location', 'My Location');
		}

		return tr('dashboard.services.detail.location.tasker_location', 'Tasker Location');
	}

	function getLocationDisplay(): string {
		const locationDetails = service.locationDetails;
		const locationTypes = getServiceLocationTypes();
		const taskeeLocation = locationDetails?.taskeeLocation?.serviceLocation;
		const taskerLocation = locationDetails?.taskerLocation?.serviceLocation;

		if (locationTypes.includes('taskee_location')) {
			return (
				locationDetails?.taskeeLocation?.locationDisplayName ||
				taskeeLocation?.displayName ||
				taskeeLocation?.formattedAddress ||
				getLocationTypeLabel('taskee_location')
			);
		}

		if (locationTypes.includes('tasker_location')) {
			return (
				taskerLocation?.displayName ||
				taskerLocation?.formattedAddress ||
				getLocationTypeLabel('tasker_location')
			);
		}

		if (locationTypes.includes('remote')) {
			return getLocationTypeLabel('remote');
		}

		return '';
	}

	function getServiceRadiusDisplay(): string {
		const locationDetails = service.locationDetails;
		const serviceLocationTypes = getServiceLocationTypes();

		if (!serviceLocationTypes?.includes('taskee_location')) {
			return '';
		}

		const radius = locationDetails?.taskeeLocation?.serviceRadius;
		if (!radius) return '';
		const miles = Math.round(radius * 0.621371 * 10) / 10;
		return `(${radius} km/${miles} mi)`;
	}

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'active':
				return tr('dashboard.services.detail.status.active', 'Active');
			case 'inactive':
				return tr('dashboard.services.detail.status.inactive', 'Inactive');
			case 'sold':
				return tr('dashboard.services.detail.status.sold', 'Sold');
			default:
				return status;
		}
	}
</script>

<div class="min-w-0 space-y-6 overflow-x-hidden">
	<!-- Service Info Card -->
	<div class="card bg-base-200 min-w-0 overflow-hidden">
		<div class="card-body min-w-0 p-4">
			<!-- Row: Service title (left) and Share button (right) -->
			<div class="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
				<div class="min-w-0 flex-1">
					<span class="line-clamp-2 text-lg leading-tight font-bold">
						{displayTitle}
					</span>
				</div>
				<div class="shrink-0 pl-4">
					<ServiceShareButton {service} variant="default" class="btn-lg" />
				</div>
			</div>

			<!-- Row 2: Description | Price (hide big price column for quote-only — badge row already shows it) -->
			<div class="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div class="min-w-0 flex-1">
					<p class="line-clamp-3 text-sm whitespace-pre-line">
						{displayDescription || tr('dashboard.services.detail.no_description', 'No description')}
					</p>
				</div>
				{#if service.pricing?.type !== ServicePricingTypeEnum.INQUIRY_REQUIRED}
					<div
						class="flex min-w-0 flex-col items-start break-words sm:shrink-0 sm:items-end sm:pl-4"
					>
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
				{/if}
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
							<span class="text-base-content/60 text-sm">
								{getServiceRadiusDisplay()}
							</span>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Row 4: Location and Pricing type badges -->
			<div class="flex flex-wrap gap-2">
				{#if service.locationDetails?.types && service.locationDetails.types.length > 0}
					{#each service.locationDetails.types as locationType (locationType)}
						<span class="badge badge-outline badge-sm">
							{locationType === 'remote'
								? tr('dashboard.services.detail.location.remote', 'Remote')
								: locationType === 'tasker_location'
									? tr('dashboard.services.detail.location.my_location', 'My Location')
									: tr('dashboard.services.detail.location.tasker_location', 'Tasker Location')}
						</span>
					{/each}
				{/if}
				{#if service.pricing?.type === ServicePricingTypeEnum.FIXED}
					<span class="badge badge-outline badge-sm">
						{tr('dashboard.services.detail.pricing_type.fixed', 'Fixed')}
					</span>
				{:else if service.pricing?.type === ServicePricingTypeEnum.HOURLY}
					<span class="badge badge-outline badge-sm">
						{tr('dashboard.services.detail.pricing_type.hourly', 'Hourly')}
					</span>
				{:else if service.pricing?.type === ServicePricingTypeEnum.TIERED}
					<span class="badge badge-outline badge-sm">
						{tr('dashboard.services.detail.pricing_type.tiered', 'Tiered')}
					</span>
				{:else}
					<span class="badge badge-outline badge-sm">
						{tr('dashboard.services.detail.pricing_type.quote', 'Quote')}
					</span>
				{/if}
				{#if service.status}
					<span
						class="badge {service.status === 'active'
							? 'badge-success'
							: service.status === 'inactive'
								? 'badge-warning'
								: 'badge-ghost'} badge-sm"
					>
						{getStatusLabel(service.status)}
					</span>
				{/if}
			</div>

			<!-- Row 5: Skills and Categories badges -->
			<div class="flex flex-col gap-3 space-y-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-4">
				{#if service.skills?.length > 0}
					<div class="min-w-0">
						<small class="text-base-content/60 mb-1 block text-sm">
							{tr('dashboard.services.detail.skills', 'Skills')}
						</small>
						<div class="flex flex-wrap gap-1">
							{#each service.skills as skill (skill)}
								<span
									class="badge badge-primary badge-outline inline-flex h-auto min-h-0 max-w-full items-start justify-start rounded-lg px-3 py-2 text-left text-sm leading-snug wrap-break-word whitespace-normal"
									>{skill}</span
								>
							{/each}
						</div>
					</div>
				{/if}
				{#if service?.categories?.length > 0}
					<div class="min-w-0">
						<small class="text-base-content/60 mb-1 block text-sm">
							{tr('dashboard.services.detail.categories', 'Categories')}
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
			{#if service.portfolio && service.portfolio.length > 0}
				{#await prepareGalleryImages(service.portfolio) then galleryImages}
					{#if galleryImages.length > 0}
						<div class="mt-2 w-full">
							<small class="text-base-content/60 mb-1 block text-sm">
								{tr('dashboard.services.detail.portfolio', 'Portfolio')}
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

			<!-- Videos -->
			{#if videoAttachments.length > 0}
				<div class="mt-2 w-full">
					<small class="text-base-content/60 mb-1 block text-sm">
						{tr('dashboard.services.detail.videos', 'Videos')}
					</small>
					<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
						{#each videoAttachments as video (video.key || video.url)}
							<button
								class="bg-base-300 group relative aspect-video cursor-pointer overflow-hidden rounded-lg"
								onclick={() => (selectedVideo = video)}
							>
								{#if video.cloudflareId}
									<img
										src={`https://customer-${import.meta.env.VITE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${video.cloudflareId}/thumbnails/thumbnail.jpg`}
										alt={video.alt || 'Video thumbnail'}
										class="h-full w-full object-cover"
										loading="lazy"
									/>
								{:else}
									<div class="text-base-content/40 flex h-full w-full items-center justify-center">
										<svg class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
											<path d="M8 5v14l11-7z" />
										</svg>
									</div>
								{/if}
								<div class="absolute right-2 bottom-2 rounded-full bg-black/60 p-1.5">
									<svg class="h-3 w-3 text-white" viewBox="0 0 24 24" fill="currentColor">
										<path d="M8 5v14l11-7z" />
									</svg>
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Posted date -->
			<div>
				<small class="text-base-content/60 block text-sm">
					{tr('dashboard.services.detail.posted', 'Posted')}
				</small>
				<p class="font-semibold">{formatDateStringWithTime(service.createdAt)}</p>
			</div>
		</div>
	</div>

	<!-- Tiers Section -->
	{#if tiersWithPrice && tiersWithPrice.length > 0}
		<div class="card bg-base-200 min-w-0 overflow-hidden">
			<div class="card-body min-w-0 p-4">
				<h3 class="mb-3 text-lg font-semibold">
					{tr('dashboard.services.detail.pricing_tiers', 'Pricing Tiers')}
				</h3>
				<div class="space-y-3">
					{#each tiersWithPrice as tier, index (index)}
						<div
							class="bg-base-100 flex flex-col gap-2 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="min-w-0 flex-1">
								<div class="font-medium">
									{tier.name || `${tr('dashboard.services.detail.tier', 'Tier')} ${index + 1}`}
								</div>
								{#if tier.features && tier.features.length > 0}
									<ul class="text-base-content/70 mt-1 space-y-1 text-sm">
										{#each tier.features as feature (feature)}
											<li class="flex items-start gap-1">
												<IconPlus class="text-primary mt-0.5 h-3 w-3 shrink-0" />
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
									<div class="text-base-content/60 text-sm">
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
				<h3 class="mb-3 text-lg font-semibold">
					{tr('dashboard.services.detail.addons_title', 'Add-ons')}
				</h3>
				<div class="space-y-2">
					{#each displayAddOns as addon, index (index)}
						<div
							class="bg-base-100 flex flex-col gap-1 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="min-w-0 flex-1">
								<div class="font-medium">
									{addon.name || `${tr('dashboard.services.detail.addon', 'Add-on')} ${index + 1}`}
								</div>
								{#if addon.description}
									<p class="text-base-content/70 text-sm">{addon.description}</p>
								{/if}
							</div>
							{#if (addon.price ?? 0) > 0}
								<div class="flex shrink-0 items-center gap-2">
									<span class="font-semibold">
										+${formatNumberWithTwoDecimals(addon.price ?? 0)}
									</span>
									<span class="text-base-content/60 text-sm">
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
				<h3 class="mb-3 text-lg font-semibold">
					{tr('dashboard.services.detail.faqs', 'FAQ')}
				</h3>
				<div class="space-y-2">
					{#each displayFaqs as faq, index (index)}
						<div class="collapse-arrow bg-base-200 collapse">
							<input type="checkbox" />
							<div class="collapse-title text-sm font-medium">
								{faq.question ||
									`${tr('dashboard.services.detail.question', 'Question')} ${index + 1}`}
							</div>
							<div class="collapse-content text-base-content/70 text-xs">
								<p>{faq.answer}</p>
							</div>
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
					<span>{tr('dashboard.services.detail.view_quotes', 'View Quotes')}</span>
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
					{tr('dashboard.services.detail.edit_service', 'Edit Service')}
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
					{tr('dashboard.services.detail.delete_service', 'Delete Service')}
				</button>
			{/if}
		</div>
	</div>

	{#if selectedVideo}
		<Modal
			isOpen={true}
			title=""
			onClose={() => (selectedVideo = null)}
			size="lg"
			hideHeader={true}
			showCloseButton={true}
		>
			<StreamPlayer
				videoUid={selectedVideo.cloudflareId || ''}
				controls={true}
				poster={selectedVideo.cloudflareId
					? `https://customer-${import.meta.env.VITE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${selectedVideo.cloudflareId}/thumbnails/thumbnail.jpg`
					: null}
				videoUrl={!selectedVideo.cloudflareId ? selectedVideo.url : undefined}
			/>
		</Modal>
	{/if}
</div>
