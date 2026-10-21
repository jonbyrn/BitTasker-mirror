<script lang="ts">
	import type { Attachment, Category, Task } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { user } from '$lib/stores/user.store';
	import { afterNavigate } from '$app/navigation';
	import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { authState } from '$lib/stores/auth.store';
	import TaskShareButton from './TaskShareButton.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import {
		formatStandardDateShort,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import Gallery from '$lib/components/Gallery.svelte';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import TaskLocationMap from '$lib/components/maps/TaskLocationMap.svelte';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import BidForm from '$lib/components/bidding/BidForm.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import UsdSatsDisplay from '$lib/components/shared/UsdSatsDisplay.svelte';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconMapMarkerCheck from '~icons/mdi/map-marker-check';
	import { taskTranslationService } from '$lib/services/task-translation.service';
	import { currentUserLanguage } from '$lib/stores/translation.store';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import { publishBid } from '$lib/utils/nostr-bid';
	import SubjectReviews from '$lib/components/reviews/SubjectReviews.svelte';
	import CreditAdvanceBadge from '$lib/components/credit/CreditAdvanceBadge.svelte';
	import { findTaskNostrEvent } from '$lib/nostr/findTaskEvent';

	// Props
	let { taskId, author } = $props<{ taskId: string; author?: string }>();
	const isE2ETest =
		(typeof window !== 'undefined' &&
			(window as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ === true) ||
		import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';

	// State
	let task = $state<Task | null>(null);
	let taskEventId = $state<string | null>(null);
	let loading = $state(true);
	let errorMessage = $state('');
	let btcPrice = $state<number>(0); // Default fallback price
	// TranslatedTask component now handles translations and show more/less automatically

	// Bid drawer state
	let isSidebarOpen = $state(false);

	// Check if current user is the task creator
	const isOwner = $derived(task?.npub === $user?.npub);

	// Get translated task title for page title
	const translatedTaskTitle = $derived.by(() => {
		if (!task) return $t('dashboard.task_details_by_task.title');

		const userLang = $currentUserLanguage;
		if (userLang && task.translations?.sourceLanguage !== userLang) {
			const translation = taskTranslationService.getStoredTranslation(task, userLang);
			if (translation?.translatedTitle) {
				return translation.translatedTitle;
			}
		}

		return task.title || $t('dashboard.task_details_by_task.title');
	});

	// Page title with translated task title
	const pageTitle = $derived.by(() => {
		if (!task) return $t('dashboard.task_details_by_task.title');
		const budget = task.budget?.amount ? `$${formatNumberWithTwoDecimals(task.budget.amount)}` : '';
		const title = translatedTaskTitle;
		return budget ? `${title} - ${budget} - BitTasker` : `${title} - BitTasker`;
	});

	// Helper function to translate a single category
	function translateCategory(category: string | Category): string {
		try {
			// Extract ID from category (handle both string and object)
			const categoryId = typeof category === 'string' ? category : category.id;
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

	const isRemoteTask = $derived(() => {
		if (!task) return false;

		// 1. Check explicit task type
		if (task.taskType) {
			const normalizedType =
				typeof task.taskType === 'string' ? task.taskType.toLowerCase() : task.taskType;
			if (normalizedType === TaskTypeEnum.REMOTE) return true;
		}

		// 2. Check for missing or placeholder pickup location
		const pickupName = (task.pickupLocation?.displayName || '').trim().toLowerCase();
		if (!pickupName || pickupName === 'remote' || pickupName === 'approximate location') {
			// If we also don't have a drop-off location, it's definitely remote
			const dropOffName = (task.dropOffLocation?.displayName || '').trim().toLowerCase();
			if (!dropOffName || dropOffName === 'remote' || dropOffName === 'approximate location') {
				return true;
			}
		}

		return false;
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

	function statusBadgeClass(status: string): string {
		if (status === TaskStatusEnum.COMPLETED) return 'badge-success';
		if (status === TaskStatusEnum.CANCELLED || status === TaskStatusEnum.DISPUTED)
			return 'badge-error';
		if (status === TaskStatusEnum.OPEN) return 'badge-info';
		if (
			status === TaskStatusEnum.BID_ACCEPTED ||
			status === TaskStatusEnum.ESCROW_FUNDED ||
			status === TaskStatusEnum.IN_PROGRESS
		) {
			return 'badge-warning';
		}
		return 'badge-outline';
	}

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

	// Helper function to detect video files
	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.m3u8'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	// Helper function to detect Cloudflare Stream videos
	function isStreamVideo(att: Attachment): boolean {
		return !!att.cloudflareId && (att.type || '').toLowerCase().startsWith('video/');
	}

	// Translation is now handled automatically by TranslatableTask component

	async function loadTaskDetails(taskId: string) {
		if (!taskId) {
			loading = false;
			return;
		}

		try {
			loading = true;
			errorMessage = '';

			const event = await findTaskNostrEvent(taskId, author);

			if (!event) {
				errorMessage = $t('bids.task_details.error.failed_to_load');
				taskEventId = null;
				return;
			}

			// Parse task data from nostr event
			const taskData = JSON.parse(event.content) as Task;
			const dTag = event.tags?.find((tag: string[]) => tag[0] === 'd')?.[1];

			// Ensure we have a valid ID
			if (!event.id) {
				errorMessage = $t('bids.task_details.error.task_id_missing');
				return;
			}

			task = {
				...taskData,
				id: dTag || event.id,
				npub: event.pubkey
			};
			taskEventId = event.id;
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = $t('bids.task_details.error.failed_to_load_details');
			taskEventId = null;
		} finally {
			loading = false;
		}
	}

	const handleBidNow = () => {
		// Open the bid drawer
		isSidebarOpen = true;
	};

	async function handleBidSubmit(data: {
		amount: number;
		days: number;
		proposal: string;
		taskId: string;
	}) {
		if (!task) throw new Error('Task is unavailable');
		if (!taskEventId) throw new Error('Task event id is unavailable');

		await publishBid({
			taskId: data.taskId,
			taskEventId,
			taskDTag: task.id,
			taskTitle: task.title,
			taskDescription: task.description,
			taskBudget: task.budget,
			taskCreatorPubkey: task.npub,
			amount: data.amount,
			days: data.days,
			proposal: data.proposal
		});
	}

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
		const taskAddress = `${taskId}:${author ?? ''}`;
		if (taskId && taskAddress !== previousTaskId) {
			previousTaskId = taskAddress;
			loadTaskDetails(taskId);
		}
	});

	// Reload task details when navigating to this route (handles back navigation)
	afterNavigate(({ to }) => {
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

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-4 px-2 pb-24 md:px-0 md:pb-0">
	<div class="flex flex-col gap-4 pt-4 md:pt-0">
		<div class="flex items-center gap-3">
			<div class="flex-1 text-left">
				<h3 class="">{$t('dashboard.task_details_by_task.title')}</h3>
				<p class="text-base-content/70">{$t('dashboard.task_details_by_task.description')}</p>
			</div>
			<div class="flex shrink-0 items-center gap-1">
				<TaskShareButton {task} variant="icon-only" />
				{#if $authState.isAuthenticated && task && !isOwner && task.npub}
					<ActionsMenu
						contentType="task"
						reportedPubkey={task.npub}
						reportedEventId={task.id}
						username={task.creator?.username}
					/>
				{/if}
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
			<div id="panel-details" role="tabpanel" aria-labelledby="tab-details">
				<!-- Task details -->
				<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
					<!-- Main content -->
					<div class="flex flex-col gap-4 lg:col-span-2">
						<!-- Main task info card -->
						<div class="card bg-base-100 border-base-300 border shadow-sm">
							<div class="card-body gap-4 p-5">
								<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
									<div class="min-w-0">
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
									<div class="flex flex-wrap items-center gap-2">
										<span class="badge badge-lg {statusBadgeClass(task.status)}">{task.status}</span
										>
										<CreditAdvanceBadge jobId={taskId} />
									</div>
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
											<div class="tracking-tight">
												<UsdSatsDisplay amount={task.budget.amount} {btcPrice} size="large" />
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
															<span>{$t('dashboard.task_details_by_task.remote')}</span>
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
													{#each task.skills as skill (skill)}
														<span class="badge badge-outline">{skill}</span>
													{/each}
												</div>
											</div>
										</div>
									</div>
								{/if}

								<!-- Tasker profile -->
								{#if task.npub}
									<div class="flex flex-col gap-2">
										<UserInfoDisplay
											avatar={task.creator?.avatar}
											username={task.creator?.username}
											pubkey={task.npub}
											size="md"
											showReviewCount={true}
										/>
										<a
											href={`${resolve('/(app)/(protected)/profile')}?user=${encodeURIComponent(task.npub)}&tab=reviews`}
											class="text-primary text-xs hover:underline"
										>
											{$t('reviews.view_all')}
										</a>
									</div>
								{:else}
									<div class="flex flex-col">
										<span class="text-base font-medium">
											{task.creator?.username || $t('dashboard.task_details_by_task.anonymous')}
										</span>
										<div class="flex items-center">
											{#each Array(5) as _, i (i)}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="text-base-content/30 h-4 w-4"
													fill="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
													/>
												</svg>
											{/each}
											<span class="text-base-content/60 ml-2 text-sm">0</span>
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
											{#each translatedCategories as category (category)}
												<span class="badge badge-outline">
													{category}
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
												{#each task.attachments.filter( (att) => isVideoFile(att.url) ) as attachment (attachment.key)}
													<div class="bg-base-200 overflow-hidden rounded-lg">
														{#if isStreamVideo(attachment)}
															<StreamPlayer
																videoUid={attachment.cloudflareId!}
																private={false}
																controls={true}
															/>
														{:else}
															<video class="h-48 w-full object-cover" controls preload="metadata">
																<source src={attachment.url} type={attachment.type} />
																{$t('dashboard.task_details_by_task.video_not_supported')}
															</video>
														{/if}
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
					</div>

					<!-- Sidebar -->
					<div class="lg:col-span-1">
						<div class="card bg-base-100 border-base-300 sticky top-6 border shadow-sm">
							<div class="card-body gap-4 p-5">
								<!-- Action buttons -->
								<div>
									{#if isDeadlineExpired() && task.status === TaskStatusEnum.OPEN}
										<div class="alert alert-warning alert-outline">
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
									{/if}
									{#if task.status === TaskStatusEnum.OPEN && (!isOwner || isE2ETest) && $authState.isAuthenticated}
										<div class="mb-6">
											<h4 class="mb-4">
												{$t('dashboard.task_details_by_task.interested_in_task')}
											</h4>
											<button
												data-testid="open-bid-form-btn"
												class="btn btn-primary btn-sm w-full"
												onclick={handleBidNow}
											>
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
											<h4 class="mb-4">
												{$t('dashboard.task_details_by_task.interested_in_task')}
											</h4>

											<button
												class="btn btn-primary btn-sm w-full"
												onclick={() =>
													goto(
														`${resolve('/(app)/auth/login')}?returnTo=${encodeURIComponent(window.location.pathname)}`
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
										<h4 class="mb-3 font-semibold">
											{$t('dashboard.task_details_by_task.tasker')}
										</h4>
										{#if task.npub}
											<UserInfoDisplay
												avatar={task.creator.avatar}
												username={task.creator.username}
												pubkey={task.npub}
												size="md"
												showReviewCount={true}
											/>
										{:else}
											<div class="flex items-center gap-3">
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
												<div class="flex flex-col">
													<span class="text-base font-medium">{task.creator.username}</span>
												</div>
											</div>
										{/if}
									</div>
								{/if}
								<!-- Task Location Map - Only show pickup location -->
								<SubjectReviews
									subjectIds={[taskId, task.id, taskEventId].filter(
										(id): id is string => typeof id === 'string' && id.length > 0
									)}
								/>
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
	{#if task}
		<BidForm {task} onSubmit={handleBidSubmit} onClose={() => (isSidebarOpen = false)} />
	{/if}
</Drawer>
