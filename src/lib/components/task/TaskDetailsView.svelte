<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import type { Attachment, Task } from '$lib/types/task';
	import { format } from 'date-fns';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { user } from '$lib/stores/user.store';
	import { authState } from '$lib/stores/auth.store';
	import TaskDetailsBidDrawer from '$lib/components/bidding/TaskDetailsBidDrawer.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import {
		formatStandardDateShort,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import TaskLocationMap from '$lib/components/maps/TaskLocationMap.svelte';
	import { goto } from '$app/navigation';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import IconAlertCircle from '~icons/mdi/alert-circle';

	// Props
	let { taskId, showShareButton = true } = $props<{
		taskId: string;
		showShareButton?: boolean;
	}>();

	// State
	let task = $state<Task | null>(null);
	let loading = $state(true);
	let errorMessage = $state('');
	let taskCreatorPubkey = $state<string>('');
	let btcPrice = $state<number>(0); // Default fallback price
	// TranslatedTask component now handles translations and show more/less automatically

	// Bid drawer state
	let selectedTaskId = $state<string | null>(taskId || null);
	let isSidebarOpen = $state(false);

	// Check if current user is the task creator
	const isOwner = $derived(task?.npub === $user?.npub);
	
	// Check if user is logged in - using same validation as navbar
	const isLoggedIn = $derived($authState.isAuthenticated);
	
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
			return `${window.location.origin}/tasks/task/${taskId}`;
		}
		return '';
	});
	
	// Handle share functionality
	const handleShare = async () => {
		const link = shareLink();
		if (!link) return;
		
		if (navigator.share) {
			try {
				await navigator.share({
					title: task?.title || 'Task Details',
					text: task?.description || 'Check out this task',
					url: link
				});
			} catch (error) {
				// User cancelled sharing or error occurred
				console.log('Share cancelled or failed:', error);
			}
		} else {
			// Fallback: copy to clipboard
			try {
				await navigator.clipboard.writeText(link);
				// You could add a toast notification here
			} catch (error) {
				console.error('Failed to copy link:', error);
			}
		}
	};

	function formatDateTimeReactive(dateString: string) {
		const date = parseDateToLocalMidnight(dateString);
		if (!date) return '';
		// For deadlines, only show date, not time
		return formatStandardDateShort(date, $locale || 'en');
	}

	function formatDateRangeReactive(startDateString: string, endDateString: string) {
		const startDate = parseDateToLocalMidnight(startDateString);
		const endDate = parseDateToLocalMidnight(endDateString);
		if (!startDate || !endDate) return '';
		const start = formatStandardDateShort(startDate, $locale || 'en');
		const end = formatStandardDateShort(endDate, $locale || 'en');
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

	async function loadTaskDetails(taskId: string) {
		if (!taskId) {
			loading = false;
			return;
		}

		try {
			loading = true;
			errorMessage = '';

			const { data: event } = await nostrEventsService.findEventById(taskId);

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

			// Get the task creator's pubkey from the event
			taskCreatorPubkey = event.pubkey;

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
		if (to && taskId && to.url.pathname.includes(`/task/${taskId}`)) {
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

<div class="mx-auto max-w-6xl p-4 md:p-0">
	<div class="mb-2 flex items-start justify-between">
		<div>
			<h3 class="">{$t('dashboard.task_details_by_task.title')}</h3>
			<p class="text-base-content/70">{$t('dashboard.task_details_by_task.description')}</p>
		</div>
		{#if showShareButton}
			<button 
				class="btn btn-outline btn-sm gap-2" 
				onclick={handleShare}
				title={$t('dashboard.task_details_by_task.share_task')}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
					/>
				</svg>
				{$t('dashboard.task_details_by_task.share')}
			</button>
		{/if}
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
						<div class="mb-6 flex flex-row items-start justify-between gap-3">
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
											descriptionClass="text-sm text-base-content/80 line-clamp-2"
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
						<div class="mb-6 flex justify-between">
							{#if task.deadline || task.dateRange}
								<div class="flex max-w-md flex-col gap-2">
									{#if task.deadline}
										<div>
											<h4 class="mb-1 font-semibold">
												{$t('dashboard.task_details_by_task.deadline')}
											</h4>
											<div class="font-semibold">
												{formatDateTimeReactive(task.deadline)}
											</div>
										</div>
									{:else if task.dateRange}
										<div>
											<span class="text-base-content/60 text-sm"
												>{$t('dashboard.task_details_by_task.date_range')}</span
											>
											<div class="font-semibold">
												{formatDateRangeReactive(
													task.dateRange.start,
													task.dateRange.end
												)}
											</div>
										</div>
									{/if}
								</div>
							{/if}

							<div class="text-lg font-bold">
								${formatNumberWithTwoDecimals(task.budget.amount)}

								<div class="text-base-content/60 text-sm">
									{satsFromUsd(task.budget.amount, btcPrice)}
								</div>
							</div>
						</div>

						<!-- Timeline and Requirements in same row -->
						<div class="mb-2 flex justify-between">
							<!-- Location information -->
							{#if task.pickupLocation || task.dropOffLocation}
								<div class="mb-2">
									<div class="grid grid-cols-1">
										{#if task.pickupLocation && task.pickupLocation.displayName && task.pickupLocation.displayName.trim() !== ''}
											<div class="mb-2">
												<span class="text-base-content/60 text-sm"
													>{$t('dashboard.task_details_by_task.pickup_location')}</span
												>
												<div>{task.pickupLocation.displayName}</div>
											</div>
										{/if}
										{#if task.dropOffLocation && task.dropOffLocation.displayName && task.dropOffLocation.displayName.trim() !== ''}
											<div>
												<span class="text-base-content/60 text-sm"
													>{$t('dashboard.task_details_by_task.dropoff_location')}</span
												>
												<div>{task.dropOffLocation.displayName}</div>
											</div>
										{/if}
										{#if (!task.pickupLocation || !task.pickupLocation.displayName || task.pickupLocation.displayName.trim() === '') && (!task.dropOffLocation || !task.dropOffLocation.displayName || task.dropOffLocation.displayName.trim() === '')}
											<div class="text-base-content/60 text-sm">
												{$t('dashboard.task_details_by_task.remote')}
											</div>
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
										<div class="mt-2 flex flex-wrap gap-2">
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
							<div class="my-4">
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
					<div class="bg-base-100 border-base-300 sticky top-6 rounded-2xl border p-6 shadow-sm">
						<!-- Action buttons -->
						{#if isDeadlineExpired()}
							<div class="alert alert-error alert-outline">
								<IconAlertCircle class="h-6 w-6 shrink-0" />
								<div>
									<span class="font-bold">{$t('dashboard.task_details_by_task.deadline_expired')}</span>
									<div class="text-xs">{$t('dashboard.task_details_by_task.deadline_expired_message')}</div>
								</div>
							</div>
						{:else if task.status === TaskStatusEnum.OPEN && !isOwner && isLoggedIn}
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
						{:else if task.status === TaskStatusEnum.OPEN && !isOwner && !isLoggedIn}
							<div class="mb-6">
								<h4 class="mb-4">{$t('dashboard.task_details_by_task.interested_in_task')}</h4>
								
								
								<button class="btn btn-primary btn-sm w-full" onclick={() => goto(`/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`)}>
									
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

						<!-- Task creator info -->
						{#if task.creator}
							<div class="border-base-300 border-t pt-4">
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
											{task.creator.username || task.creator.name || ''}
										</span>
										<!-- Review Stars -->
										<div class="flex items-center">
											{#each Array(5) as _, i}	
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-4 w-4 {i < (task.creator?.rating || 0) ? 'text-yellow-400' : 'text-base-content/30'}"
													fill="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
													/>
												</svg>
											{/each}
											<span class="text-base-content/60 ml-2 text-sm">{task.creator?.rating || 0}</span>
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
						{#if task.pickupLocation}
							<div class="border-base-300 mt-4 border-t">
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

<!-- Task Details Bid Drawer -->
<TaskDetailsBidDrawer
	taskId={selectedTaskId}
	onClose={() => (isSidebarOpen = false)}
	isOpen={isSidebarOpen}
/>
