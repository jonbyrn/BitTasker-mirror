<script lang="ts">
	import type { Attachment, Task } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { format } from 'date-fns';
	import { locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores/user.store';
	import { afterNavigate } from '$app/navigation';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { authState } from '$lib/stores/auth.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import {
		formatStandardDateShort,
		formatStandardDateTime,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import KINDS from '$lib/utils/constants/kinds';
	import Gallery from '$lib/components/Gallery.svelte';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import TaskLocationMap from '$lib/components/maps/TaskLocationMap.svelte';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import BidForm from '$lib/components/bidding/BidForm.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconMapMarkerCheck from '~icons/mdi/map-marker-check';

	// Props
	let { taskId } = $props<{ taskId: string }>();

	// State
	let task = $state<Task | null>(null);
	let loading = $state(true);
	let errorMessage = $state('');
	let btcPrice = $state<number>(0); // Default fallback price
	// TranslatedTask component now handles translations and show more/less automatically

	// Bid drawer state
	let isSidebarOpen = $state(false);

	// Check if current user is the task creator
	const isOwner = $derived(task?.npub === $user?.npub);

	const isRemoteTask = $derived(() => {
		if (!task?.taskType) return false;
		const normalizedType =
			typeof task.taskType === 'string' ? task.taskType.toLowerCase() : task.taskType;
		return normalizedType === TaskTypeEnum.REMOTE;
	});

	const shouldShowLocationInfo = $derived(
		() => isRemoteTask() || !!task?.pickupLocation || !!task?.dropOffLocation
	);

	// Check if task deadline has expired
	// Compare dates using date strings to avoid timezone issues
	// Deadline is expired only if today is AFTER the deadline date (allows bidding through end of deadline day)
	const isDeadlineExpired = $derived(() => {
		if (!task?.deadline) return false;
		const deadlineDate = new Date(task.deadline);
		const now = new Date();

		// Compare dates using date strings to avoid timezone issues
		const deadlineDateStr = deadlineDate.toISOString().split('T')[0];
		const todayDateStr = now.toISOString().split('T')[0];

		// Deadline is expired only if today is AFTER the deadline date
		return todayDateStr > deadlineDateStr;
	});

	// Generate share link for public route
	const shareLink = $derived(() => {
		if (typeof window !== 'undefined' && taskId) {
			return `${window.location.origin}/tasks/${taskId}`;
		}
		return '';
	});

	// Helper function to truncate text to 200 characters at last complete word
	function truncateText(text: string, maxLength: number = 200): string {
		if (!text || text.length <= maxLength) return text;
		
		const truncated = text.substring(0, maxLength);
		const lastSpace = truncated.lastIndexOf(' ');
		
		if (lastSpace > 0) {
			return truncated.substring(0, lastSpace) + '...';
		}
		return truncated + '...';
	}

	// Helper function to format share text with task details
	function formatShareText(): string {
		if (!task) return 'Check out this task';
		
		let text = '';
		
		// Add truncated description
		const description = task.description || '';
		if (description) {
			text += truncateText(description, 200);
		} else {
			text += 'Check out this task';
		}
		
		// Collect details
		const details: string[] = [];
		
		// Budget
		if (task.budget?.amount) {
			details.push(`💰 Budget:\n$${formatNumberWithTwoDecimals(task.budget.amount)}`);
		}
		
		// Deadline
		if (task.deadline) {
			const deadlineFormatted = formatDateTimeReactive(task.deadline);
			if (deadlineFormatted) {
				details.push(`📅 Deadline:\n${deadlineFormatted}`);
			}
		} else if (task.dateRange) {
			const dateRangeFormatted = formatDateRangeReactive(task.dateRange.start, task.dateRange.end);
			if (dateRangeFormatted) {
				details.push(`📅 Deadline:\n${dateRangeFormatted}`);
			}
		}
		
		// Location
		if (task.dropOffLocation?.displayName) {
			details.push(`📍 Location:\n${task.dropOffLocation.displayName}`);
		} else if (task.pickupLocation?.displayName) {
			details.push(`📍 Location:\n${task.pickupLocation.displayName}`);
		} else if (isRemoteTask()) {
			details.push(`📍 Location:\n${$t('dashboard.task_details_by_task.remote')}`);
		}
		
		// Add details if any exist
		if (details.length > 0) {
			text += '\n\n' + details.join('\n\n');
		}
		
		return text;
	}

	// Helper function to fetch first image attachment as File
	async function getFirstImageFile(): Promise<File | null> {
		if (!task?.attachments || task.attachments.length === 0) return null;
		
		// Find first non-video attachment (image)
		const firstImage = task.attachments.find(att => !isVideoFile(att.url));
		if (!firstImage) return null;
		
		try {
			// Fetch the image
			const response = await fetch(firstImage.url);
			if (!response.ok) return null;
			
			const blob = await response.blob();
			
			// Get file extension from URL or use default
			const urlParts = firstImage.url.split('.');
			const extension = urlParts.length > 1 ? urlParts[urlParts.length - 1].split('?')[0] : 'jpg';
			const mimeType = blob.type || `image/${extension}`;
			
			// Create File object
			const fileName = firstImage.alt || `task-image.${extension}`;
			const file = new File([blob], fileName, { type: mimeType });
			
			return file;
		} catch (error) {
			console.error('Failed to fetch image for sharing:', error);
			return null;
		}
	}

	// Handle share functionality
	let shareSuccess = $state(false);
	const handleShare = async () => {
		const link = shareLink();
		if (!link) return;

		if (navigator.share) {
			try {
				// Prepare share data
				const shareData: ShareData = {
					title: task?.title || 'Task Details',
					text: formatShareText(),
					url: link
				};
				
				// Try to add first image if available
				const imageFile = await getFirstImageFile();
				if (imageFile) {
					// Check if files can be shared
					if (navigator.canShare && navigator.canShare({ files: [imageFile] })) {
						shareData.files = [imageFile];
					}
				}
				
				await navigator.share(shareData);
				shareSuccess = true;
				appStore.showSuccessToast($t('dashboard.task_details_by_task.share_success') || 'Task shared successfully!');
				setTimeout(() => {
					shareSuccess = false;
				}, 2000);
			} catch (error) {
				// User cancelled sharing or error occurred
				if ((error as Error).name !== 'AbortError') {
					console.log('Share cancelled or failed:', error);
					// Fallback to copy link if share fails
					const success = await copyToClipboard(link);
					if (success) {
						shareSuccess = true;
						appStore.showSuccessToast($t('dashboard.task_details_by_task.link_copied'));
						setTimeout(() => {
							shareSuccess = false;
						}, 2000);
					}
				}
			}
		} else {
			// Fallback: copy to clipboard
			const success = await copyToClipboard(link);
			if (success) {
				shareSuccess = true;
				appStore.showSuccessToast($t('dashboard.task_details_by_task.link_copied'));
				setTimeout(() => {
					shareSuccess = false;
				}, 2000);
			} else {
				appStore.showErrorToast($t('dashboard.task_details_by_task.link_copy_failed'));
			}
		}
	};

	function formatDateTimeReactive(dateString: string) {
		const date = parseDateToLocalMidnight(dateString);
		if (!date) return '';
		const localeToUse = $locale || 'en';
		const formattedDate = formatStandardDateShort(date, localeToUse);
		const formattedTime = date.toLocaleTimeString(localeToUse, {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
		return `${formattedDate} · ${formattedTime}`;
	}

	function formatDateRangeReactive(startDateString: string, endDateString: string) {
		const localeToUse = $locale || 'en';

		// Parse dates
		const startDate = new Date(startDateString);
		const endDate = new Date(endDateString);

		if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
			return '';
		}

		// Format with short month name and no time using formatStandardDateShort
		const start = formatStandardDateShort(startDate, localeToUse);
		const end = formatStandardDateShort(endDate, localeToUse);

		return `${start} - ${end}`;
	}

	// Helper function to prepare images for Gallery component
	// La función ahora es asíncrona
	const prepareGalleryImages = async (attachments: Attachment[]) => {
		const imagePromises = attachments
			.filter((attachment) => !isVideoFile(attachment.url))
			.map((attachment) => {
				// Retorna una promesa para cada imagen
				return new Promise((resolve) => {
					const img = new Image();
					img.onload = () => {
						// Cuando la imagen se carga, resuelve la promesa con sus dimensiones reales
						resolve({
							url: attachment.url,
							alt: attachment.alt || $t('dashboard.task_details_by_task.task_attachment'),
							width: img.naturalWidth, // Ancho real de la imagen
							height: img.naturalHeight, // Altura real de la imagen
							size: attachment.size
						});
					};
					img.onerror = () => {
						// Si hay un error, resuelve con valores por defecto o null
						resolve({
							url: attachment.url,
							alt: attachment.alt || $t('dashboard.task_details_by_task.task_attachment'),
							width: 0,
							height: 0,
							size: attachment.size
						});
					};
					img.src = attachment.url;
				});
			});

		// Espera a que todas las promesas se resuelvan
		return await Promise.all(imagePromises);
	};

	const formatDateString = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return format(dateObj, 'MMM yyyy');
	};

	// Helper function to detect video files
	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	// Translation is now handled automatically by TranslatableTask component

	const isEventId = (value: string): boolean => /^[0-9a-f]{64}$/i.test(value);
	const isUuid = (value: string): boolean =>
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

	async function findTaskEventByUniqueId(uniqueId: string) {
		try {
			const dTagValue = `task-${uniqueId}`;
			const response = await nostrEventsService.requestEvents({
				filters: [
					{
						kinds: [KINDS.TASK_CREATION],
						'#d': [dTagValue],
						limit: 1
					}
				]
			});
			return response.data?.[0] ?? null;
		} catch (error) {
			console.error('Failed to load task by unique ID:', error);
			return null;
		}
	}

	async function loadTaskDetails(taskId: string) {
		if (!taskId) {
			loading = false;
			return;
		}

		try {
			loading = true;
			errorMessage = '';

			let event: any = null;

			if (isEventId(taskId)) {
				const response = await nostrEventsService.findEventById(taskId);
				event = response.data;
			} else if (isUuid(taskId)) {
				event = await findTaskEventByUniqueId(taskId);
			} else {
				// Fallback attempt
				const response = await nostrEventsService.findEventById(taskId);
				event = response.data;
			}

			if (!event) {
				errorMessage = $t('bids.task_details.error.failed_to_load');
				return;
			}

			// Parse task data from nostr event
			const taskData = JSON.parse(event.content) as Task;

			// Ensure we have a valid ID
			if (!event.id) {
				errorMessage = $t('bids.task_details.error.task_id_missing');
				return;
			}

			task = {
				...taskData,
				id: event.id,
				npub: event.pubkey // Add the npub from the event to the task object
			};
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = $t('bids.task_details.error.failed_to_load_details');
		} finally {
			loading = false;
		}
	}

	const handleBidNow = () => {
		// Open the bid drawer
		isSidebarOpen = true;
	};

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Failed to fetch BTC price:', error);
		}
	}

	// Translation is now handled automatically by TranslatableTask component

	// Track previous taskId to detect changes
	let previousTaskId = $state<string | null>(null);

	// React to taskId prop changes and reload task details
	$effect(() => {
		if (taskId && taskId !== previousTaskId) {
			previousTaskId = taskId;
			loadTaskDetails(taskId);
		}
	});

	// Reload task details when navigating to this route (handles back navigation)
	afterNavigate(({ to, from }) => {
		// Only reload if we're navigating TO a task details route (not away from it)
		// Check if the current URL matches a task details pattern
		if (to && taskId && to.url.pathname.includes(`/tasks/${taskId}`)) {
			// Reset state and reload to ensure fresh data
			task = null;
			errorMessage = '';
			loadTaskDetails(taskId);
		}
	});

	// Fetch BTC price on mount
	onMount(() => {
		fetchBtcPrice();
	});

</script>

<div class="mx-auto max-w-6xl px-2 pb-24 md:px-0 md:pb-0">
	<div class="rounded-xl pt-4 md:pt-0">
		<div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
			<div class="text-left">
				<h3 class="">{$t('dashboard.task_details_by_task.title')}</h3>
				<p class="text-base-content/70">{$t('dashboard.task_details_by_task.description')}</p>
			</div>
			<div class="flex flex-wrap gap-2 md:justify-end">
				<button
					class="btn btn-primary btn-sm min-w-[140px] flex-1 gap-2 transition-all duration-200 {shareSuccess
						? 'btn-success'
						: ''}"
					onclick={handleShare}
					title={$t('dashboard.task_details_by_task.share_task')}
				>
					{#if shareSuccess}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935-2.186 2.25 2.25 0 00-3.935 2.186z"
							/>
						</svg>
					{/if}
					<span>{$t('dashboard.task_details_by_task.share')}</span>
				</button>
			</div>
		</div>
		<!-- Loading state -->
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<div class="text-center">
					<span class="loading loading-spinner loading-lg"></span>
					<p class="mt-4 text-lg">{$t('dashboard.task_details_by_task.loading')}</p>
				</div>
			</div>
		{:else if errorMessage}
			<!-- Error state -->
			<div class="py-12 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/30 mx-auto h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<h3 class="mt-4 text-lg font-semibold">
					{$t('dashboard.task_details_by_task.task_not_found')}
				</h3>
				<p class="text-base-content/60 mt-1">{errorMessage}</p>
			</div>
		{:else if task}
			<!-- Task header -->

			<!-- Details Tab -->
			<div id="panel-details" role="tabpanel" aria-labelledby="tab-details" class="mt-3">
				<!-- Task details -->
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
					<!-- Main content -->
					<div class="space-y-4 lg:col-span-2">
						<!-- Main task info card -->
						<div class="bg-base-100 border-base-300 rounded-2xl border p-6 shadow-sm">
							<!-- Header row with title and posted date -->
							<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
								<div class="">
									<div class="pb-1">
										<TranslatableTask
											{task}
											showTitle={true}
											showDescription={false}
											titleClass="card-title line-clamp-2 text-lg"
										/>
									</div>
									<div class="text-base-content/60 text-start">
										{#if task}
											<TranslatableTask
												{task}
												showTitle={false}
												showDescription={true}
												showToggle={false}
												descriptionClass="text-sm text-base-content/80 whitespace-pre-line line-clamp-2"
											/>
										{/if}
									</div>
								</div>
								<!-- <div class="flex flex-col text-center">
								<div class="badge badge-primary badge-outline text-sm font-bold">{task.status}</div>
							</div> -->
							</div>

							<div class="divider"></div>

							<!-- Description section -->
							<div class="mb-6 flex w-full flex-col gap-4">
								<div
									class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8"
								>
									<div class="flex flex-col gap-2 md:w-full md:flex-1">
										{#if task.deadline || task.dateRange}
											{#if task.deadline}
												<div class="flex flex-col">
													<div class="text-base-content/60 flex items-center gap-2 text-sm">
														<IconCalendarClock class="h-4 w-4" />
														<span>{$t('dashboard.task_details_by_task.deadline')}</span>
													</div>
													<div class="font-semibold">
														{formatDateTimeReactive(task.deadline)}
													</div>
												</div>
											{:else if task.dateRange}
												<div class="flex flex-col">
													<div class="text-base-content/60 flex items-center gap-2 text-sm">
														<IconCalendarClock class="h-4 w-4" />
														<span>{$t('dashboard.task_details_by_task.date_range')}</span>
													</div>
													<div class="font-semibold">
														{formatDateRangeReactive(task.dateRange.start, task.dateRange.end)}
													</div>
												</div>
											{/if}
										{/if}
									</div>
									<div class="flex flex-col gap-2">
										<!-- <div class="flex items-center gap-2 text-base-content/60 text-sm md:justify-end">
										<IconWalletOutline class="h-4 w-4" />
										<span>{$t('dashboard.task_details_by_task.amount')}</span>
									</div> -->
										<div class="text-2xl font-bold tracking-tight">
											${formatNumberWithTwoDecimals(task.budget.amount)}
											<div class="text-base-content/60 text-base">
												{satsFromUsd(task.budget.amount, btcPrice)}
											</div>
										</div>
									</div>
								</div>
							</div>

							<!-- Timeline and Requirements in same row -->
							<div class="mb-2 flex flex-col gap-4 sm:flex-row sm:justify-between">
								<!-- Location information -->
								{#if shouldShowLocationInfo()}
									<div class="mb-2">
										<div class="grid grid-cols-1">
											{#if isRemoteTask()}
												<div class="mb-2">
													<div class="text-base-content/60 flex items-center gap-2 text-sm">
														<IconMapMarker class="h-4 w-4" />
														<span>{$t('dashboard.task_details_by_task.remote_location_label')}</span
														>
													</div>
													<div>
														{$t('dashboard.task_details_by_task.remote_location_description')}
													</div>
												</div>
											{:else}
												{#if task.pickupLocation && task.pickupLocation.displayName && task.pickupLocation.displayName.trim() !== ''}
													<div class="mb-2">
														<div class="text-base-content/60 flex items-center gap-2 text-sm">
															<IconMapMarker class="h-4 w-4" />
															<span>{$t('dashboard.task_details_by_task.pickup_location')}</span>
														</div>
														<div>{task.pickupLocation.displayName}</div>
													</div>
												{/if}
												{#if task.dropOffLocation && task.dropOffLocation.displayName && task.dropOffLocation.displayName.trim() !== ''}
													<div class="mt-3">
														<div class="text-base-content/60 flex items-center gap-2 text-sm">
															<IconMapMarkerCheck class="h-4 w-4" />
															<span>{$t('dashboard.task_details_by_task.dropoff_location')}</span>
														</div>
														<div>{task.dropOffLocation.displayName}</div>
													</div>
												{/if}
												{#if (!task.pickupLocation || !task.pickupLocation.displayName || task.pickupLocation.displayName.trim() === '') && (!task.dropOffLocation || !task.dropOffLocation.displayName || task.dropOffLocation.displayName.trim() === '')}
													<div class="text-base-content/60 text-sm">
														{$t('dashboard.task_details_by_task.remote')}
													</div>
												{/if}
											{/if}
										</div>
									</div>
								{/if}
							</div>

							<!-- Requirements section moved to the end -->
							{#if task.skills?.length > 0}
								<div class="border-base-300 border-t pt-6">
									<div class="space-y-3">
										<div>
											<h4 class="mb-3 font-semibold">
												{$t('dashboard.task_details_by_task.required_skills')}
											</h4>
											<div class="flex flex-wrap gap-2 pb-4">
												{#each task.skills as skill}
													<span class="badge badge-primary badge-outline badge-sm">{skill}</span>
												{/each}
											</div>
										</div>
									</div>
								</div>
							{/if}

							<!-- Categories -->
							{#if task.categories?.length > 0}
								<div class="border-base-300 border-t pt-6">
									<h4 class="mb-3 font-semibold">
										{$t('dashboard.task_details_by_task.categories')}
									</h4>
									<div class="mt-2 flex flex-wrap gap-2">
										{#each task.categories as category}
											<span class="badge badge-primary badge-outline badge-sm">
												{typeof category === 'string' ? category : category.name}
											</span>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Attachments -->
							{#if task.attachments && task.attachments.length > 0}
								<div class="border-base-300 mt-4 border-t pt-6">
									<h4 class="mb-1 font-semibold">
										{$t('dashboard.task_details_by_task.attachments')}
									</h4>

									{#if task.attachments.filter((att) => !isVideoFile(att.url)).length > 0}
										<div class="mb-6">
											{#await prepareGalleryImages(task.attachments) then galleryImages}
												<Gallery
													galleryID="task-images-gallery"
													images={galleryImages}
													thumbnailSize="h-40 w-40"
												/>
											{/await}
										</div>
									{/if}

									<!-- Only show non-image attachments (videos, documents, etc.) -->
									{#if task.attachments.filter((att) => isVideoFile(att.url)).length > 0}
										<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
											{#each task.attachments.filter((att) => isVideoFile(att.url)) as attachment}
												<div class="bg-base-200 overflow-hidden rounded-lg">
													<video class="h-48 w-full object-cover" controls preload="metadata">
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
						</div>
					</div>

					<!-- Sidebar -->
					<div class="lg:col-span-1">
						<div class="bg-base-100 sticky top-6 rounded-2xl p-6 shadow-sm">
							<!-- Action buttons -->
							<div>
								{#if isDeadlineExpired()}
									<div class="alert alert-error alert-outline">
										<IconAlertCircle class="h-6 w-6 shrink-0" />
										<div>
											<span class="font-bold"
												>{$t('dashboard.task_details_by_task.deadline_expired')}</span
											>
											<div class="text-xs">
												{$t('dashboard.task_details_by_task.deadline_expired_message')}
											</div>
										</div>
									</div>
								{:else if task.status === TaskStatusEnum.OPEN && !isOwner && $authState.isAuthenticated}
									<div class="mb-6">
										<h4 class="mb-4">{$t('dashboard.task_details_by_task.interested_in_task')}</h4>
										<button class="btn btn-primary btn-sm w-full" onclick={handleBidNow}>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="mr-2 h-5 w-5"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M12 4v16m8-8H4"
												/>
											</svg>
											{$t('dashboard.task_details_by_task.bid_now')}
										</button>
									</div>
								{:else if task.status === TaskStatusEnum.OPEN && !isOwner && !$authState.isAuthenticated}
									<div class="mb-6">
										<h4 class="mb-4">{$t('dashboard.task_details_by_task.interested_in_task')}</h4>

										<button
											class="btn btn-primary btn-sm w-full"
											onclick={() =>
												goto(
													`/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`
												)}
										>
											{$t('dashboard.task_details_by_task.login')}
										</button>
									</div>
								{:else if task.status !== TaskStatusEnum.OPEN}
									<div class="alert alert-warning alert-outline">
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
												d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L73.34 16c-.77 1.333.192 3 1.732 3z"
											/>
										</svg>
										<span>{$t('dashboard.task_details_by_task.task_not_open_bidding')}</span>
									</div>
								{:else if isOwner}
									<div class="alert alert-info alert-outline">
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
												d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
											/>
										</svg>
										<span>{$t('dashboard.task_details_by_task.you_are_owner')}</span>
									</div>
								{/if}
							</div>

							<!-- Task creator info -->
							{#if task.creator}
								<div class="border-base-300 mt-4 border-t pt-4">
									<h4 class="mb-3 font-semibold">{$t('dashboard.task_details_by_task.tasker')}</h4>
									<div class="flex items-center gap-3">
										<!-- Avatar -->
										<div class="avatar">
											<div
												class="bg-base-300 flex h-12 w-12 items-center justify-center rounded-full"
											>
												{#if task.creator.avatar}
													<img
														src={task.creator.avatar}
														alt={$t('dashboard.task_details_by_task.avatar_alt')}
														class="h-12 w-12 rounded-full object-cover"
													/>
												{:else}
													<!-- Placeholder with initials -->
													<div
														class="avatar placeholder text-neutral-content bg-primary flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-center"
													>
														{#if task.creator.username}
															<span class="text-xl font-semibold">
																{task.creator.username.charAt(0).toUpperCase()}
															</span>
														{:else}
															<svg
																xmlns="http://www.w3.org/2000/svg"
																class="text-base-content/60 h-8 w-8"
																fill="none"
																viewBox="0 0 24 24"
																stroke="currentColor"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	stroke-width="2"
																	d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
																/>
															</svg>
														{/if}
													</div>
												{/if}
											</div>
										</div>

										<!-- Username and Review Stars -->
										<div class="flex flex-col">
											<span class="text-base font-medium">
												{task.creator.username || $t('dashboard.task_details_by_task.anonymous')}
											</span>
											<!-- Review Stars -->
											<div class="flex items-center">
												{#each Array(5) as _, i}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-4 w-4 {i < (task.creator?.rating || 0)
															? 'text-yellow-400'
															: 'text-base-content/30'}"
														fill="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
														/>
													</svg>
												{/each}
												<span class="text-base-content/60 ml-2 text-sm"
													>{task.creator?.rating || 0}</span
												>
											</div>
											<p class="text-base-content/60 text-sm">
												{$t('dashboard.task_details_by_task.member_since')}
												{formatDateString(task.createdAt)}
											</p>
										</div>
									</div>
								</div>
							{/if}
							<!-- Task Location Map - Only show pickup location -->
							{#if task.pickupLocation && !isRemoteTask()}
								<div class="border-base-300 mt-4 border-t pt-4">
									<h4 class="mt-3 mb-2 font-semibold">
										{$t('dashboard.task_details_by_task.pickup_location')}
									</h4>
									<TaskLocationMap tasks={[task]} height="300px" showFullscreen={true} />
									<div class="text-base-content/60 px-1 pt-2 text-sm">
										{$t('dashboard.task_details_by_task.location_map_description')}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Task Details Bid Drawer -->
<Drawer
	isOpen={isSidebarOpen}
	title={$t('bid_form.title')}
	onClose={() => (isSidebarOpen = false)}
	position="right"
	isScrollable={true}
>
	{#snippet children()}
		{#if task}
			<BidForm {task} onClose={() => (isSidebarOpen = false)} />
		{/if}
	{/snippet}
</Drawer>
