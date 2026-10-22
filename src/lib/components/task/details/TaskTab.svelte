<script lang="ts">
	import type { Attachment, Task, Category } from '$lib/types/task';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import UsdSatsDisplay from '$lib/components/shared/UsdSatsDisplay.svelte';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { escrow } from '$lib/utils/escrow';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import LocationDetailsCard from '$lib/components/location/LocationDetailsCard.svelte';
	import TaskLocationDisplay from '../TaskLocationDisplay.svelte';
	import TaskShareButton from '../TaskShareButton.svelte';
	import {
		formatLocationAddress,
		generateGoogleMapsDirectionsLink
	} from '$lib/utils/location/maps';
	import Gallery from '$lib/components/Gallery.svelte';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	// Icon imports for unplugin-icons
	import IconPlus from '~icons/mdi/plus';

	let { task, isOwner, onRequestEditConfirm, onRequestDeleteConfirm, isDeleting, onBid } = $props<{
		task: Task;
		isOwner: boolean;
		onRequestEditConfirm?: () => void;
		onRequestDeleteConfirm?: () => void;
		isDeleting?: boolean;
		onBid?: () => void;
	}>();

	let btcPrice = $state<number>(63000); // Default fallback price
	let canDelete = $state(true); // Default to true, will be checked
	let isCheckingDelete = $state(false);
	let canEdit = $state(true); // Default to true, will be checked
	let isCheckingEdit = $state(false);

	// Video lightbox state
	let selectedVideo = $state<Attachment | null>(null);
	let isVideoLightboxOpen = $state(false);
	let lightboxContainer: HTMLDivElement | null = $state(null);

	// Helper function to format date string with time (for timestamps like createdAt)
	function formatDateStringWithTime(date: string | number): string {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		if (!dateObj || isNaN(dateObj.getTime())) return '';
		return formatStandardDateTime(dateObj, $locale || 'en');
	}

	// Helper function to detect video files
	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	// Helper function to translate a single category
	function translateCategory(category: string | Category): string {
		try {
			// Extract ID from category (handle both string and object)
			const categoryId = typeof category === 'string' ? category : (category as Category).id;
			const categoryObj = TASK_CATEGORIES.find((cat) => cat.id === categoryId);
			if (categoryObj) {
				// Use slug for translation key (as defined in translation files)
				const translatedName = $t(`categories.${categoryObj.slug}.name`);
				// Fallback to category.name if translation key is returned (translation not loaded)
				return translatedName.startsWith('categories.') ? categoryObj.name : translatedName;
			}
			return categoryId;
		} catch (error) {
			console.error('Error translating category:', error);
			return typeof category === 'string' ? category : (category as Category).id || '';
		}
	}

	// Convert category IDs to translated names for display (reactive)
	let translatedCategories = $derived(task?.categories?.map(translateCategory) || []);

	// Directions link for in-person tasks with location (used to make location text/icon clickable)
	const locationDirectionsLink = $derived.by(() => {
		if (task?.taskType !== TaskTypeEnum.IN_PERSON) return null;
		const loc = task.pickupLocation || task.dropOffLocation;
		if (!loc?.latitude || !loc?.longitude) return null;
		return generateGoogleMapsDirectionsLink(loc, { origin: 'current' });
	});

	// Prepare gallery images for PhotoSwipe lightbox
	// Note: attachment.url is the full-size/original image URL
	// The Gallery component uses 'url' for the lightbox href (full-size) and 'thumbnailURL' for the thumbnail display
	const prepareGalleryImages = async (attachments: Attachment[]) => {
		const imagePromises = attachments
			.filter((attachment) => !isVideoFile(attachment.url))
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
					// Use the full-size image URL for both thumbnail and lightbox
					// attachment.url is the original/full-size image from the upload service
					const fullSizeUrl = attachment.url;

					img.onload = () => {
						resolve({
							url: fullSizeUrl, // Full-size image URL for lightbox (Gallery uses this in href)
							largeURL: fullSizeUrl, // Explicitly set largeURL to ensure full-size is used
							alt: attachment.alt || $t('dashboard.task_details_by_task.task_attachment'),
							width: img.naturalWidth,
							height: img.naturalHeight,
							size: attachment.size
						});
					};
					img.onerror = () => {
						resolve({
							url: fullSizeUrl,
							largeURL: fullSizeUrl,
							alt: attachment.alt || $t('dashboard.task_details_by_task.task_attachment'),
							width: 0,
							height: 0,
							size: attachment.size
						});
					};
					img.src = fullSizeUrl;
				});
			});

		return await Promise.all(imagePromises);
	};

	// Portal action to render lightbox at body level
	function portalToBody(node: HTMLElement) {
		if (!browser) return;

		// Append to body
		document.body.appendChild(node);

		return {
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
			}
		};
	}

	// (video lightbox opener removed — no inline video thumbnails present)

	// Close video lightbox
	function closeVideoLightbox() {
		isVideoLightboxOpen = false;
		// Restore body scroll
		if (browser) {
			document.body.style.overflow = '';
		}
		// Clear video after animation
		setTimeout(() => {
			selectedVideo = null;
		}, 300);
	}

	// Cleanup on component destroy
	onDestroy(() => {
		if (browser) {
			if (isVideoLightboxOpen) {
				document.body.style.overflow = '';
			}
			// Remove lightbox container from body if it exists
			if (lightboxContainer) {
				const parent = lightboxContainer.parentNode;
				if (parent) {
					parent.removeChild(lightboxContainer);
				}
			}
		}
	});

	function handleEditTask() {
		if (onRequestEditConfirm) {
			onRequestEditConfirm();
		}
	}

	// Check if task can be edited (cannot edit if contract exists)
	async function checkCanEditTask(): Promise<void> {
		if (!task?.id || task.status !== TaskStatusEnum.OPEN || !isOwner) {
			canEdit = false;
			return;
		}

		try {
			isCheckingEdit = true;

			// Check if task has any contracts
			const contracts = await escrow.contractOps.getContracts({ taskIds: [task.id] });

			if (contracts.length === 0) {
				// No contracts found - can edit
				canEdit = true;
				return;
			}

			// Task has contracts - cannot edit
			canEdit = false;
		} catch (error) {
			console.error('Error checking if task can be edited:', error);
			// On error, be conservative and disallow editing
			canEdit = false;
		} finally {
			isCheckingEdit = false;
		}
	}

	// Check if task can be deleted (similar to contract deletion logic)
	async function checkCanDeleteTask(): Promise<void> {
		if (!task?.id || task.status !== TaskStatusEnum.OPEN || !isOwner) {
			canDelete = false;
			return;
		}

		try {
			isCheckingDelete = true;

			// Check if task has any contracts (which means it has an escrow)
			const contracts = await escrow.contractOps.getContracts({ taskIds: [task.id] });

			if (contracts.length === 0) {
				// No contracts found - task was never funded, can delete
				canDelete = true;
				return;
			}

			// Task has contracts - check if any escrow was funded
			for (const contract of contracts) {
				const fundingStatus = await escrow.escrowOps.checkEscrowFundingStatus(contract);

				if (fundingStatus.error) {
					// Error checking escrow - be conservative and disallow deletion
					canDelete = false;
					return;
				}

				if (fundingStatus.wasFunded) {
					// Escrow was funded - cannot delete
					canDelete = false;
					return;
				}
			}

			// All escrows were never funded - can delete
			canDelete = true;
		} catch (error) {
			console.error('Error checking if task can be deleted:', error);
			// On error, be conservative and disallow deletion
			canDelete = false;
		} finally {
			isCheckingDelete = false;
		}
	}

	// Show delete confirmation
	function showDeleteConfirmation() {
		if (!canDelete) return;
		onRequestDeleteConfirm();
	}

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			throw new Error('Unable to fetch Bitcoin price. Please try again later.');
		}
	}

	// Re-check edit permission when task or isOwner changes
	$effect(() => {
		if (task && isOwner !== undefined) {
			checkCanEditTask();
		}
	});

	onMount(() => {
		fetchBtcPrice();
		checkCanDeleteTask();
	});
</script>

<div class="min-w-0 space-y-6 overflow-x-hidden">
	<!-- Task Info Card - adapted from ContractDrawer layout -->
	<div class="card bg-base-200 min-w-0 overflow-hidden">
		<div class="card-body min-w-0 p-4">
			<!-- Row: Task title (left) and Share button (right), vertically centered -->
			<div class="mb-4 flex flex-row flex-nowrap items-center justify-between gap-4">
				<div class="min-w-0 flex-1">
					<TranslatableTask
						{task}
						showTitle={true}
						showDescription={false}
						titleClass="line-clamp-2 text-lg font-bold leading-tight"
					/>
				</div>
				<div class="shrink-0 pl-4">
					<TaskShareButton {task} variant="default" class="btn-lg" />
				</div>
			</div>

			<!-- Row 2: Description (left, with show more) | Budget (right) - inline description -->
			<div class="mb-4 flex flex-row flex-nowrap items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					<TranslatableTask
						{task}
						showTitle={false}
						showDescription={true}
						showToggle={false}
						showDescriptionToggle={true}
						descriptionClass="text-sm whitespace-pre-line line-clamp-2"
					/>
				</div>
				<div class="flex shrink-0 flex-col items-end pl-4">
					{#if typeof task.budget?.amount === 'number' && Number.isFinite(task.budget.amount)}
						{#if btcPrice > 0}
							<UsdSatsDisplay
								amount={task.budget.amount}
								{btcPrice}
								title={$t('dashboard.task_details_by_task.budget') +
									(task.budget.type ? ' - ' + task.budget.type : '')}
								satsKey="bids.sats"
							/>
						{:else}
							<div class="text-right">
								<span
									class="text-base-content/60 block text-xs font-semibold tracking-wide uppercase"
								>
									{$t('dashboard.task_details_by_task.budget')}{task.budget.type
										? ` - ${task.budget.type}`
										: ''}
								</span>
								<p class="text-lg font-bold">${task.budget.amount.toFixed(2)}</p>
							</div>
						{/if}
					{:else}
						<p class="text-lg font-bold">—</p>
					{/if}
				</div>
			</div>

			<!-- Row 3: Location (link when in-person) | Date range / deadline -->
			<div class="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div class="min-w-0 md:flex-1">
					<TaskLocationDisplay
						pickupLocation={task.pickupLocation}
						dropOffLocation={task.dropOffLocation}
						locationText={task.taskType === TaskTypeEnum.IN_PERSON && task.pickupLocation
							? formatLocationAddress(task.pickupLocation)
							: task.taskType === TaskTypeEnum.IN_PERSON && task.dropOffLocation
								? formatLocationAddress(task.dropOffLocation)
								: ''}
						directionsLink={locationDirectionsLink}
					/>
				</div>
				<div class="min-w-0 md:w-2/5 md:flex-shrink-0 md:text-right">
					{#if task.dateRange}
						<div class="mb-2 md:text-right">
							<!-- Mobile: stacked layout (label above date, UsdSatsDisplay-like) -->
							<div class="md:hidden">
								<TaskDeadlineDisplay
									label={$t('dashboard.task_details_by_task.date_range')}
									variant="stacked"
									align="left"
									dateRangeStart={task.dateRange.start}
									dateRangeEnd={task.dateRange.end}
									showTime={false}
									showDuration={true}
								/>
							</div>
							<!-- Desktop/tablet: right-aligned stacked block -->
							<div class="hidden items-center justify-end md:flex">
								<TaskDeadlineDisplay
									label={$t('dashboard.task_details_by_task.date_range')}
									variant="stacked"
									align="right"
									dateRangeStart={task.dateRange.start}
									dateRangeEnd={task.dateRange.end}
									showTime={false}
									showDuration={true}
								/>
							</div>
						</div>
					{:else if task.deadline}
						<div class="mb-2 md:text-right">
							<div class="md:hidden">
								<TaskDeadlineDisplay
									label={$t('dashboard.task_details_by_task.deadline')}
									variant="stacked"
									align="left"
									deadline={task.deadline}
									showTime={false}
								/>
							</div>
							<div class="hidden items-center justify-end md:flex">
								<TaskDeadlineDisplay
									label={$t('dashboard.task_details_by_task.deadline')}
									variant="stacked"
									align="right"
									deadline={task.deadline}
									showTime={false}
								/>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Row 4: Skills and Categories badges -->
			<div class="flex flex-col gap-3 space-y-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-4">
				{#if task.skills?.length > 0}
					<div class="min-w-0">
						<small class="text-base-content/60 mb-1 block text-sm">
							{$t('dashboard.task_details_by_task.required_skills')}
						</small>
						<div class="flex flex-wrap gap-1">
							{#each task.skills as skill (skill)}
								<span
									class="badge badge-primary badge-outline inline-flex h-auto min-h-0 max-w-full items-start justify-start rounded-lg px-3 py-2 text-left text-sm leading-snug wrap-break-word whitespace-normal"
									>{skill}</span
								>
							{/each}
						</div>
					</div>
				{/if}
				{#if task?.categories?.length > 0}
					<div class="min-w-0">
						<small class="text-base-content/60 mb-1 block text-sm">
							{$t('dashboard.task_details_by_task.categories')}
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

				<!-- Move image attachments (assets) here: above Posted row, below categories -->
				{#if task.attachments && task.attachments.filter((att: Attachment) => !isVideoFile(att.url)).length > 0}
					<div class="mt-2 w-full">
						{#await prepareGalleryImages(task.attachments) then galleryImages}
							<div class="mb-2">
								<Gallery
									galleryID="task-drawer-images-gallery-inline"
									images={galleryImages}
									thumbnailSize="h-32 w-32"
								/>
							</div>
						{/await}
					</div>
				{/if}
			</div>

			<!-- Posted - at bottom of card (reduced spacing) -->
			<div>
				<small class="text-base-content/60 block text-sm">
					{$t('dashboard.task_details_by_task.posted')}
				</small>
				<p class="font-semibold">{formatDateStringWithTime(task.createdAt)}</p>
			</div>
		</div>
	</div>

	<!-- Task location area: compact display (link) and optional dropoff card -->
	<div class="space-y-3">
		{#if task.taskType === TaskTypeEnum.REMOTE}
			<div class="alert alert-outline alert-info">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{$t('dashboard.task_details_by_task.remote_location_description')}</span>
			</div>
		{:else}
			<!-- Removed pickup location card as requested -->
			{#if task.dropOffLocation && task.dropOffLocation.latitude !== null && task.dropOffLocation.longitude !== null && task.dropOffLocation.locationLoaded && task.dropOffLocation.displayName}
				<LocationDetailsCard
					location={task.dropOffLocation}
					label={$t('common.location.dropoff_location')}
					showDirections={true}
					showAddress={true}
				/>
			{/if}
		{/if}
	</div>

	<!-- Attachments moved inline above (assets were relocated) -->

	<div class="space-y-3 pb-4">
		<!-- Action Buttons Row -->
		<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
			<!-- Bid Button (shown when task is open and user is not owner) -->
			{#if task.status === TaskStatusEnum.OPEN && !isOwner && onBid}
				<button
					class="btn btn-primary btn-sm min-h-[40px] flex-1 gap-2 sm:flex-none"
					onclick={async (e) => {
						e.stopPropagation();
						if (onBid) {
							await onBid();
						}
					}}
					aria-label={$t('dashboard.task_details_by_task.bid_now') || 'Bid on this task'}
				>
					<IconPlus class="h-4 w-4 shrink-0" />
					<span>{$t('dashboard.task_details_by_task.bid_now')}</span>
				</button>
			{/if}

			{#if isOwner && task.status === TaskStatusEnum.OPEN && onRequestEditConfirm && canEdit}
				<button
					class="btn btn-primary btn-sm hidden min-h-[40px] flex-1 sm:flex-none lg:flex"
					onclick={handleEditTask}
					disabled={isCheckingEdit}
				>
					{#if isCheckingEdit}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-1 h-4 w-4 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
							/>
						</svg>
					{/if}
					{$t('dashboard.task_details_by_task.edit')}
				</button>
			{/if}

			<!-- Delete Button (only shown when onRequestDeleteConfirm is provided) -->
			{#if isOwner && onRequestDeleteConfirm}
				<button
					class="btn btn-error btn-sm hidden min-h-[40px] flex-1 sm:flex-none lg:flex"
					onclick={showDeleteConfirmation}
					disabled={(isDeleting ?? false) || isCheckingDelete || !canDelete}
				>
					{#if (isDeleting ?? false) || isCheckingDelete}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-1 h-4 w-4 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
					{/if}
					{$t('dashboard.task_details_by_task.delete')}
				</button>
			{/if}

			<!-- Mobile: Edit and Delete on same row with Edit on right -->
			<div class="flex flex-row gap-2 lg:hidden">
				<!-- Delete Button (mobile) -->
				{#if isOwner && onRequestDeleteConfirm}
					<button
						class="btn btn-error btn-sm min-h-[40px] flex-1"
						onclick={showDeleteConfirmation}
						disabled={(isDeleting ?? false) || isCheckingDelete || !canDelete}
					>
						{#if (isDeleting ?? false) || isCheckingDelete}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-1 h-4 w-4 shrink-0"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>
						{/if}
						{$t('dashboard.task_details_by_task.delete')}
					</button>
				{/if}

				<!-- Edit Button (mobile) -->
				{#if isOwner && task.status === TaskStatusEnum.OPEN && onRequestEditConfirm && canEdit}
					<button
						class="btn btn-primary btn-sm min-h-[40px] flex-1"
						onclick={handleEditTask}
						disabled={isCheckingEdit}
					>
						{#if isCheckingEdit}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-1 h-4 w-4 shrink-0"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
								/>
							</svg>
						{/if}
						{$t('dashboard.task_details_by_task.edit')}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Video Lightbox Modal - Rendered at body level via portal to escape drawer stacking context -->
{#if isVideoLightboxOpen && selectedVideo}
	<div
		bind:this={lightboxContainer}
		use:portalToBody
		class="fixed inset-0 z-9999 flex items-center justify-center bg-black/90"
		style="position: fixed; top: 0; left: 0; right: 0; bottom: 0;"
		onclick={closeVideoLightbox}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				closeVideoLightbox();
			}
		}}
		role="dialog"
		aria-modal="true"
		aria-labelledby="video-lightbox-title"
		tabindex="-1"
	>
		<div
			class="relative flex h-full w-full items-center justify-center p-4"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="none"
		>
			<!-- Close button - positioned inside viewport -->
			<button
				class="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-white/20"
				onclick={closeVideoLightbox}
				aria-label={$t('common.close') || 'Close'}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- Video container - centered and responsive -->
			<div class="relative flex max-h-[90vh] w-full max-w-5xl flex-col items-center justify-center">
				<div class="w-full overflow-hidden rounded-lg bg-black shadow-2xl">
					<video class="h-auto max-h-[85vh] w-full object-contain" controls autoplay preload="auto">
						<source src={selectedVideo.url} type="video/mp4" />
						<track kind="captions" src="" label="English" />
						{$t('dashboard.task_details_by_task.video_not_supported')}
					</video>
					{#if selectedVideo.alt || selectedVideo.size}
						<div class="bg-black/50 p-4 text-white">
							{#if selectedVideo.alt}
								<p class="text-base font-medium">{selectedVideo.alt}</p>
							{/if}
							{#if selectedVideo.size}
								<p class="mt-1 text-sm text-white/60">
									{(selectedVideo.size / 1024 / 1024).toFixed(2)} MB
								</p>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
