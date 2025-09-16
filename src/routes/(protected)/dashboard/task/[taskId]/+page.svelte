<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import type { Attachment, Task } from '$lib/types/task';
	import { formatDistanceToNow, format } from 'date-fns';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { user } from '$lib/stores/user.store';
	import TaskDetailsBidDrawer from '$lib/components/bidding/TaskDetailsBidDrawer.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { formatNumberWithTwoDecimals } from '$lib/stores/wallet.store';
	import TaskLocationMap from '$lib/components/maps/TaskLocationMap.svelte';

	// Get taskId from route params
	const taskId = $page.params.taskId;

	// State
	let task = $state<Task | null>(null);
	let loading = $state(true);
	let errorMessage = $state('');
	let taskCreatorPubkey = $state<string>('');
	let btcPrice = $state<number>(0); // Default fallback price
	let showFullDescription = $state(false); // New state for description toggle

	// Bid drawer state
	let selectedTaskId = $state<string | null>(taskId || null);
	let isSidebarOpen = $state(false);

	// Check if current user is the task creator
	const isOwner = $derived(task?.npub === $user?.npub);

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

	// Format helpers
	const formatTimeAgo = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return formatDistanceToNow(dateObj, { addSuffix: true });
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

	// Helper function to truncate description
	const getTruncatedDescription = (description: string, maxLength: number = 50) => {
		if (description.length <= maxLength) return description;
		return description.slice(0, maxLength) + '...';
	};

	const toggleDescription = () => {
		showFullDescription = !showFullDescription;
	};

	async function loadTaskDetails(taskId: string) {
		if (!taskId) return;

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
		btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
	}

	onMount(() => {
		loadTaskDetails(taskId || '');
		fetchBtcPrice();
	});
</script>

<svelte:head>
	<title>Task Details - BitTasker</title>
	<meta
		name="description"
		content={task?.description || "Here you can see the details of the task."}
	/>
</svelte:head>

<div class="mx-auto max-w-7xl p-4 md:p-0">
	<div class="mb-2">
		<h3 class="">{$t('dashboard.task_details_by_task.title')}</h3>
		<p class="text-base-content/70">{$t('dashboard.task_details_by_task.description')}</p>
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
								<small class="card-title line-clamp-2 pb-1 text-lg">
									{task.title}
								</small>
								<div class="text-base-content/60 text-start">
									{#if showFullDescription}
										{task.description}
									{:else}
										{getTruncatedDescription(task.description)}
									{/if}

									{#if task.description.length > 200}
										<button class="btn btn-xs hover:text-primary-focus" onclick={toggleDescription}>
											{#if showFullDescription}
												{$t('dashboard.task_details_by_task.show_less')}
											{:else}
												{$t('dashboard.task_details_by_task.show_more')}
											{/if}
										</button>
									{/if}
								</div>
							</div>
							<div class="flex flex-col text-center">
								<div class="badge badge-primary badge-outline text-sm font-bold">{task.status}</div>
							</div>
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
												{new Date(task.deadline).toLocaleDateString('en-US', {
													day: '2-digit',
													month: '2-digit',
													year: 'numeric'
												})}, 12pm
											</div>
										</div>
									{:else if task.dateRange}
										<div>
											<span class="text-base-content/60 text-sm"
												>{$t('dashboard.task_details_by_task.date_range')}</span
											>
											<div class="font-semibold">
												{new Date(task.dateRange.start).toLocaleDateString('en-US', {
													day: '2-digit',
													month: '2-digit',
													year: 'numeric'
												})} - {new Date(task.dateRange.end).toLocaleDateString('en-US', {
													day: '2-digit',
													month: '2-digit',
													year: 'numeric'
												})}
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
								<h4 class="mb-3 font-semibold">
									{$t('dashboard.task_details_by_task.requirements')}
								</h4>
								<div class="space-y-3">
									<div>
										<span class="text-base-content/60 text-sm"
											>{$t('dashboard.task_details_by_task.required_skills')}</span
										>
										<div class="mt-2 flex flex-wrap gap-2">
											{#each task.skills as skill}
												<span class="badge badge-primary badge-outline badge-sm">{skill}</span>
											{/each}
										</div>
									</div>
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
						{#if task.status === TaskStatusEnum.OPEN && !isOwner}
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
											{task.creator.username || $t('dashboard.task_details_by_task.anonymous')}
										</span>
										<!-- Review Stars -->
										<div class="flex items-center">
											{#each Array(5) as _, i}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-4 w-4 {i < 4 ? 'text-yellow-400' : 'text-base-content/30'}"
													fill="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
													/>
												</svg>
											{/each}
											<span class="text-base-content/60 ml-2 text-sm">4.0</span>
										</div>
										<p class="text-base-content/60 text-sm">
											{$t('dashboard.task_details_by_task.member_since')}
											{formatDateString(task.createdAt)}
										</p>
									</div>
								</div>
							</div>
						{/if}
						<!-- Task Location Map -->
						{#if task.pickupLocation || task.dropOffLocation}
							<div class="border-base-300 mt-4 border-t">
								<h4 class="mb-2 mt-3 font-semibold">{$t('dashboard.task_details_by_task.location')}</h4>
								<TaskLocationMap tasks={[task]} height="300px" showFullscreen={true} />
								<div class="text-base-content/60 text-sm px-1 pt-2">
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
