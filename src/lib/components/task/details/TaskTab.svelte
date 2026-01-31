<script lang="ts">
	import type { Attachment, Task } from '$lib/types/task';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import {
		formatStandardDate,
		formatStandardDateShort,
		formatStandardDateTime,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { escrow } from '$lib/utils/escrow';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import LocationDetailsCard from '$lib/components/location/LocationDetailsCard.svelte';
	import TaskShareButton from '../TaskShareButton.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	// Icon imports for unplugin-icons
	import IconPlus from '~icons/mdi/plus';

	let { task, isOwner, onClose, onRequestEditConfirm, onRequestDeleteConfirm, isDeleting, onBid } =
		$props<{
			task: Task;
			isOwner: boolean;
			onClose: () => void;
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
	function translateCategory(category: string | any): string {
		try {
			// Extract ID from category (handle both string and object)
			const categoryId = typeof category === 'string' ? category : (category as any).id;
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
			return typeof category === 'string' ? category : (category as any).id || '';
		}
	}

	// Convert category IDs to translated names for display (reactive)
	let translatedCategories = $derived(task?.categories?.map(translateCategory) || []);

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

	// Open video in lightbox
	function openVideoLightbox(video: Attachment) {
		selectedVideo = video;
		isVideoLightboxOpen = true;
		// Prevent body scroll when lightbox is open
		if (browser) {
			document.body.style.overflow = 'hidden';
		}
	}

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
		if (!task?.id) {
			canEdit = false;
			return;
		}

		// Only check if task is open and user is owner
		if (task.status !== TaskStatusEnum.OPEN || !isOwner) {
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
		if (!task?.id) {
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
		checkCanEditTask();
		checkCanDeleteTask();
	});
</script>

<div class="space-y-6">
	<!-- Task header with status and edit button -->
	<!-- 	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			{#if task.status}
				<div
					class="badge {task.status === TaskStatusEnum.OPEN
						? 'badge-success'
						: task.status === TaskStatusEnum.COMPLETED
							? 'badge-primary'
							: 'badge-neutral'}"
				>
					{task.status}
				</div>
			{/if}
		</div>
	</div> -->

	<!-- Task details -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2 relative">
		<!-- Share Button - Upper Right Corner -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="absolute top-0 right-0 z-10" onclick={(e) => e.stopPropagation()}>
			<TaskShareButton {task} variant="circle" />
		</div>
		<div>
			<small class="text-base-content/60 text-sm">
				{$t('dashboard.task_details_by_task.budget')} - {task.budget.type}
			</small>

			<div class="text-lg font-bold">
				${formatNumberWithTwoDecimals(task.budget.amount)}

				<div class="text-base-content/60 text-sm">
					{satsFromUsd(task.budget.amount, btcPrice)}
				</div>
			</div>
		</div>

		<div>
			<small class="text-base-content/60 text-sm">
				{$t('dashboard.task_details_by_task.type')}
			</small>
			<p class="font-semibold">
				{task.taskType === TaskTypeEnum.REMOTE
					? $t('dashboard.task_details_by_task.remote')
					: $t('dashboard.task_details_by_task.in_person')}
			</p>
		</div>

		{#if task.deadline}
			<div>
				<small class="text-base-content/60 text-sm">
					{$t('dashboard.task_details_by_task.deadline')}
				</small>
				<p class="font-semibold">
					{formatStandardDate(
						parseDateToLocalMidnight(task.deadline) || new Date(task.deadline),
						$locale || 'en'
					)}
				</p>
			</div>
		{:else if task.dateRange}
			<div>
				<small class="text-base-content/60 text-sm">
					{$t('dashboard.task_details_by_task.date_range')}
				</small>
				<p class="font-semibold">
					{formatStandardDateShort(
						parseDateToLocalMidnight(task.dateRange.start) || new Date(task.dateRange.start),
						$locale || 'en'
					)} - {formatStandardDateShort(
						parseDateToLocalMidnight(task.dateRange.end) || new Date(task.dateRange.end),
						$locale || 'en'
					)}
				</p>
			</div>
		{/if}

		<div>
			<small class="text-base-content/60 text-sm"
				>{$t('dashboard.task_details_by_task.posted')}</small
			>
			<p class="font-semibold">{formatDateStringWithTime(task.createdAt)}</p>
		</div>
	</div>

	<!-- Task description -->
	<div class="mb-4">
		<small class="text-base-content/60"
			>{$t('dashboard.task_details_by_task.description_task')}</small
		>
		<div class="bg-base-200 rounded-2xl p-3">
			<div class="max-h-28 overflow-y-auto">
				<TranslatableTask
					{task}
					showTitle={false}
					showDescription={true}
					showToggle={false}
					descriptionClass="text-sm whitespace-pre-line"
				/>
			</div>
		</div>
	</div>

	<!-- Task skills -->
	{#if task.skills?.length > 0}
		<div>
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.required_skills')}
			</small>
			<div class="flex flex-wrap gap-1">
				{#each task.skills as skill}
					<span class="badge badge-primary badge-outline pb-[2px]">{skill}</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Task categories -->
	{#if task?.categories?.length > 0}
		<div>
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.categories')}
			</small>
			<div class="flex flex-wrap gap-1">
				{#each translatedCategories as category}
					<span class="badge badge-outline badge-info pb-[2px]">
						{category}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Task location -->
	<div class="space-y-3">
		{#if task.taskType === TaskTypeEnum.REMOTE}
			<!-- Remote task - show message that it can be completed remotely -->
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
			<!-- In-person task - show pickup and/or dropoff locations -->
			{#if task.pickupLocation && task.pickupLocation.latitude !== null && task.pickupLocation.longitude !== null && task.pickupLocation.locationLoaded}
				<LocationDetailsCard
					location={task.pickupLocation}
					label={$t('common.location.pickup_location')}
					showDirections={true}
					showAddress={true}
				/>
			{/if}
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

	<!-- Task attachments -->
	{#if task.attachments && task.attachments.length > 0}
		<div class={!isOwner ? 'mb-20 sm:mb-0' : ''}>
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.attachments')}
			</small>

			<!-- Images with Gallery lightbox -->
			{#if task.attachments.filter((att: Attachment) => !isVideoFile(att.url)).length > 0}
				<div class="mb-6">
					{#await prepareGalleryImages(task.attachments) then galleryImages}
						<Gallery
							galleryID="task-drawer-images-gallery"
							images={galleryImages}
							thumbnailSize="h-32 w-full"
						/>
					{/await}
				</div>
			{/if}

			<!-- Videos with clickable lightbox -->
			{#if task.attachments.filter((att: Attachment) => isVideoFile(att.url)).length > 0}
				<div class="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
					{#each task.attachments.filter((att: Attachment) => isVideoFile(att.url)) as attachment}
						<div
							class="bg-base-200 overflow-hidden rounded-lg pb-4 cursor-pointer hover:opacity-90 transition-opacity"
							onclick={() => openVideoLightbox(attachment)}
							role="button"
							tabindex="0"
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									openVideoLightbox(attachment);
								}
							}}
						>
							<video class="h-32 w-full object-cover pointer-events-none" preload="metadata">
								<source src={attachment.url} type="video/mp4" />
								<track kind="captions" src="" label="English" />
								{$t('dashboard.task_details_by_task.video_not_supported')}
							</video>
							<div class="p-3">
								<p class="truncate text-sm font-medium">
									{attachment?.alt || $t('dashboard.task_details_by_task.attachment')}
								</p>
								<p class="text-base-content/60 text-xs">
									{(attachment.size / 1024 / 1024).toFixed(2)} MB
								</p>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<div class="space-y-3 pb-4">
		<!-- Action Buttons Row -->
		<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
			<!-- Bid Button (shown when task is open and user is not owner) -->
			{#if task.status === TaskStatusEnum.OPEN && !isOwner && onBid}
				<button
					class="btn btn-primary btn-sm min-h-[40px] flex-1 sm:flex-none gap-2"
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
					class="btn btn-primary btn-sm min-h-[40px] flex-1 sm:flex-none"
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
					{$t('dashboard.task_details_by_task.edit_task')}
				</button>
			{/if}

			<!-- Delete Button (only shown when onRequestDeleteConfirm is provided) -->
			{#if isOwner && onRequestDeleteConfirm}
				<button
					class="btn btn-error btn-sm min-h-[40px] flex-1 sm:flex-none"
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
					{$t('dashboard.task_details_by_task.delete_task')}
				</button>
			{/if}
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
			class="relative w-full h-full flex items-center justify-center p-4"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="none"
		>
			<!-- Close button - positioned inside viewport -->
			<button
				class="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white shadow-lg transition-colors flex items-center justify-center backdrop-blur-sm"
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
			<div class="relative w-full max-w-5xl max-h-[90vh] flex flex-col items-center justify-center">
				<div class="w-full bg-black rounded-lg overflow-hidden shadow-2xl">
					<video class="w-full h-auto max-h-[85vh] object-contain" controls autoplay preload="auto">
						<source src={selectedVideo.url} type="video/mp4" />
						<track kind="captions" src="" label="English" />
						{$t('dashboard.task_details_by_task.video_not_supported')}
					</video>
					{#if selectedVideo.alt || selectedVideo.size}
						<div class="p-4 bg-black/50 text-white">
							{#if selectedVideo.alt}
								<p class="text-base font-medium">{selectedVideo.alt}</p>
							{/if}
							{#if selectedVideo.size}
								<p class="text-white/60 text-sm mt-1">
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
