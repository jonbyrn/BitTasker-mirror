<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import type { Attachment, Task } from '$lib/types/task';
	import { formatDistanceToNow, format } from 'date-fns';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import Gallery from '$lib/components/Gallery.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { formatNumberWithTwoDecimals } from '$lib/stores/breezWallet.store';
	import { formatStandardDate, formatStandardDateTime, formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const { seo, taskId } = data;

	let task = $state<Task | null>(seo.task);
	let loading = $state(!seo.task);
	let errorMessage = $state('');
	let taskCreatorPubkey = $state<string>('');
	let btcPrice = $state<number>(0); // Default fallback price
	let showFullDescription = $state(false); // New state for description toggle

	// Check if current user is the task creator (always false for public users)
	const isOwner = $derived(false);

	// Reactive date formatting functions using Svelte 5 runes
	function formatDateReactive(date: Date) {
		return formatStandardDate(date, $locale || 'en');
	}

	function formatDateTimeReactive(date: Date) {
		return formatStandardDateTime(date, $locale || 'en');
	}

	function formatDateRangeReactive(startDate: Date, endDate: Date) {
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
							alt: attachment.alt || $t('dashboard.task_details_by_task.attachment'),
							width: img.naturalWidth, // Ancho real de la imagen
							height: img.naturalHeight, // Altura real de la imagen
							size: attachment.size
						});
					};
					img.onerror = () => {
						// Si hay un error, resuelve con valores por defecto o null
						resolve({
							url: attachment.url,
							alt: attachment.alt || $t('dashboard.task_details_by_task.attachment'),
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
		// If task is already loaded from SEO data, skip loading
		if (task) {
			loading = false;
			return;
		}

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
		// Redirect to signup page for public users
		goto('/auth/signup');
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
	<!-- Primary Meta Tags -->
	<title>{seo.title}</title>
	<meta name="title" content={seo.title} />
	<meta name="description" content={seo.description} />
	<meta name="keywords" content={seo.keywords} />
	<meta name="author" content="BitTasker" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={seo.canonical} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />
	<meta property="og:image" content={seo.ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={task?.title || 'BitTasker Task'} />
	<meta property="og:site_name" content="BitTasker" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={seo.canonical} />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />
	<meta property="twitter:image" content={seo.twitterImage} />
	<meta property="twitter:image:alt" content={task?.title || 'BitTasker Task'} />
	<meta property="twitter:site" content="@BitTaskerdotcom" />
	<meta property="twitter:creator" content="@BitTaskerdotcom" />

	<!-- Additional Meta Tags -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="theme-color" content="#F7931B" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="BitTasker" />

	<!-- Structured Data -->
	{#if seo.jsonLd}
		{@html `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
	{/if}
</svelte:head>

<div class="mx-auto max-w-7xl p-4 pt-10! md:p-0">
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
								<div class="card-title line-clamp-2 pb-1 text-lg">
									<TranslatableTask {task} />
								</div>
								<div class="text-base-content/60 text-start">
									<TranslatableTask 
										{task} 
										showTitle={false} 
										showDescription={true} 
										showToggle={false}
										descriptionClass="text-base-content/60 text-start"
									/>

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
												{formatDateTimeReactive(new Date(task.deadline))}
											</div>
										</div>
									{:else if task.dateRange}
										<div>
											<span class="text-base-content/60 text-sm"
												>{$t('dashboard.task_details_by_task.date_range')}</span
											>
											<div class="font-semibold">
												{formatDateRangeReactive(new Date(task.dateRange.start), new Date(task.dateRange.end))}
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
									{$t('dashboard.task_details_by_task.sign_up_to_bid')}
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
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

