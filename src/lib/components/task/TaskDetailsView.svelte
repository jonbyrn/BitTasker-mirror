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
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { getBidsForTaskOptimized, sendBidStatusUpdate, clearBidCache } from '$lib/utils/nostr-bid';
	import IconRefresh from '~icons/mdi/refresh';
	import type { TaskBid, NostrBid } from '$lib/types/bid';
	import BidCardDetailed from '$lib/components/bidding/BidCardDetailed.svelte';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import KINDS from '$lib/utils/constants/kinds';

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

	// Bids state
	let bids = $state<TaskBid[]>([]);
	let bidsLoading = $state(false);
	let expandedBidId = $state<string | null>(null);
	let showAcceptanceForm = $state(false);
	let bidToAccept = $state<TaskBid | null>(null);

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

	// Generate share link for public route - always use uniqueId for stable URLs
	const shareLink = $derived(() => {
		if (typeof window !== 'undefined' && task) {
			// Always use the uniqueId from the loaded task for stable URLs
			// This ensures URLs remain stable even if task is edited (event ID changes, but uniqueId stays the same)
			return `${window.location.origin}/tasks/${task.uniqueId || task.id}`;
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

	// Handle copy link functionality
	const handleCopyLink = async () => {
		const link = shareLink();
		if (!link) return;
		
		const success = await copyToClipboard(link);
		if (success) {
			appStore.showSuccessToast($t('dashboard.task_details_by_task.link_copied'));
		} else {
			appStore.showErrorToast($t('dashboard.task_details_by_task.link_copy_failed'));
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

			// Check if taskId is an event ID (64 hex chars) or UUID (uniqueId)
			const isEventId = /^[0-9a-fA-F]{64}$/.test(taskId);
			const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId);
			let event: any = null;

			if (isEventId) {
				// It's an event ID, use it directly
				// Note: This should rarely happen as page loader redirects event IDs to uniqueId
				const result = await nostrEventsService.findEventById(taskId);
				event = result.data;
			} else if (isUuid) {
				// It's a uniqueId (UUID), query by d-tag
				const dTagValue = `task-${taskId}`;
				const filter = {
					kinds: [KINDS.TASK_CREATION],
					'#d': [dTagValue],
					limit: 1
				};
				
				const response = await nostrEventsService.requestEvents({
					filters: [filter]
				});
				
				if (response.data && response.data.length > 0) {
					event = response.data[0];
				}
			} else {
				// Try as event ID anyway (fallback for edge cases)
				// Note: The page loader should handle npub conversion and redirect,
				// but we handle it here as a fallback for robustness
				try {
					const result = await nostrEventsService.findEventById(taskId);
					event = result.data;
				} catch {
					errorMessage = $t('bids.task_details.error.failed_to_load');
					return;
				}
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

			// Get the task creator's pubkey from the event
			taskCreatorPubkey = event.pubkey;

			task = {
				...taskData,
				id: event.id, // Always use the event ID from the event
				npub: event.pubkey // Add the npub from the event to the task object
			};

			// If we loaded via a different identifier, update the URL to use uniqueId
			// This ensures URLs remain stable even if task is edited (event ID changes, but uniqueId stays the same)
			if (typeof window !== 'undefined' && taskData.uniqueId && taskData.uniqueId !== taskId) {
				const currentPath = window.location.pathname;
				const newPath = `/tasks/${taskData.uniqueId}`;
				if (currentPath !== newPath) {
					window.history.replaceState({}, '', newPath);
				}
			}

			// Load bids if user is logged in and is the task owner
			if (isLoggedIn && event.id && event.pubkey === $user?.npub) {
				loadBids(event.id);
			}
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

	// Load bids for the task
	async function loadBids(taskEventId: string) {
		if (!isLoggedIn) return;

		try {
			bidsLoading = true;
			const dmBids = await getBidsForTaskOptimized(taskEventId);

			// Transform to TaskBid format for BidCard component
			bids = dmBids.map(({ bid }) => {
				const bidWithStatus = bid as NostrBid & { bidStatus?: string };
				const status = bidWithStatus.bidStatus || 'PENDING';

				return {
					id: bid.bidId,
					taskId: bid.taskId,
					freelancerId: 0, // Not available in Nostr bid
					amount: bid.amount,
					currency: bid.currency,
					paymentType: bid.paymentType,
					hourlyRate: bid.hourlyRate ?? undefined,
					estimatedHours: bid.estimatedHours ?? undefined,
					description: bid.description || '',
					estimatedDuration: bid.estimatedDuration || '',
					proposedApproach: bid.proposedApproach || '',
					coverLetter: bid.coverLetter || '',
					status: (status.toLowerCase() as 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'countered') || 'pending',
					createdAt: new Date(bid.timestamp).toISOString(),
					visibility: 'PUBLIC' as const,
					responseTime: 0,
					clientViewed: false,
					clientViewedAt: null,
					featured: false,
					clientResponse: null,
					competitiveScore: null,
					rank: null,
					impressions: 0,
					clicks: 0,
					isWithdrawn: false,
					withdrawnReason: null,
					expiresAt: null,
					updatedAt: new Date(bid.timestamp).toISOString(),
					task: {
						id: 0,
						title: task?.title || '',
						description: task?.description || '',
						status: task?.status || ''
					},
					freelancer: {
						id: 0,
						userId: 0,
						professionalTitle: null,
						bio: null,
						promotionalVideo: null,
						yearsExperience: null,
						specialties: [],
						standardRates: null,
						tasksCompleted: 0,
						bidsSent: 0,
						successRate: null,
						rating: 0,
						verified: false
					},
					bidderId: bid.bidderId || '',
					bidderName: bid.bidderName || 'Anonymous',
					bidderAvatar: bid.bidderAvatar || '',
					bidderWalletAddress: bid.bidderWalletAddress || '',
					dropOffLocation: task?.dropOffLocation || { displayName: '', latitude: 0, longitude: 0 },
					pickupLocation: task?.pickupLocation || { displayName: '', latitude: 0, longitude: 0 },
					translations: bid.translations
				} as TaskBid;
			});
		} catch (error) {
			console.error('Failed to load bids:', error);
		} finally {
			bidsLoading = false;
		}
	}

	// Handler functions for BidCardDetailed
	function handleToggleDetails(bidId: string) {
		expandedBidId = expandedBidId === bidId ? null : bidId;
	}

	function handleAcceptBid(bid: TaskBid) {
		// Check if this bid is already accepted or if another bid is already accepted
		if (bid.status === 'accepted') {
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.bid_already_accepted'));
			return;
		}

		bidToAccept = bid;
		showAcceptanceForm = true;
	}

	async function handleRejectBid(bid: TaskBid) {
		// Prevent rejecting bids that are already accepted or rejected
		if (bid.status === 'accepted' || bid.status === 'rejected') {
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.bid_already_rejected'));
			return;
		}

		try {
			// Send bid rejection status via encrypted DM to the bidder
			await sendBidStatusUpdate(
				bid.id,
				bid.taskId,
				bid.bidderId || '', // bidder's pubkey
				'rejected',
				$t('dashboard.bids.bid_acceptance.bid_rejected_message') // Optional rejection message
			);

			// Clear bid cache and refresh task to update status and bids
			clearBidCache();
			if (task?.id) {
				await loadBids(task.id);
			}
		} catch (error) {
			console.error('Error rejecting bid:', error);
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.bid_rejected_error'));
		}
	}

	function handleCloseBid() {
		showAcceptanceForm = false;
		bidToAccept = null;
	}

	// Handle refresh bids button
	async function handleRefreshBids() {
		if (!task?.id || !isLoggedIn || !isOwner) return;
		
		try {
			// Clear cache to ensure fresh data
			clearBidCache();
			await loadBids(task.id);
			appStore.showSuccessToast($t('dashboard.task_details_by_task.bids_refreshed'));
		} catch (error) {
			console.error('Error refreshing bids:', error);
			appStore.showErrorToast($t('dashboard.task_details_by_task.bids_refresh_error'));
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

<div class="mx-auto w-full max-w-6xl p-4 md:p-6 lg:p-0">
	<div class="mb-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			{#if task}
				<h3 class="">
					<TranslatableTask 
						{task} 
						showTitle={true}
						showDescription={false}
						titleClass=""
					/>
				</h3>
				<p class="text-base-content/70">
					<TranslatableTask 
						{task} 
						showTitle={false}
						showDescription={true}
						showToggle={false}
						descriptionClass="line-clamp-3"
					/>
				</p>
			{:else}
				<h3 class="">{$t('dashboard.task_details_by_task.title')}</h3>
				<p class="text-base-content/70">{$t('dashboard.task_details_by_task.description')}</p>
			{/if}
		</div>
		{#if showShareButton}
			<div class="flex flex-row gap-2 justify-center sm:justify-start sm:flex-col">
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
				<button 
					class="btn btn-outline btn-sm gap-2" 
					onclick={handleCopyLink}
					title={$t('dashboard.task_details_by_task.copy_link')}
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
							d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
						/>
					</svg>
					{$t('dashboard.task_details_by_task.copy_link')}
				</button>
			</div>
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
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3 w-full">
				<!-- Main content -->
				<div class="space-y-4 lg:col-span-2 w-full">
					<!-- Bids Section - Show if user is logged in, is owner, and task has bids -->
					{#if isLoggedIn && isOwner && bids.length > 0}
						<div class="bg-base-100 border-base-300 rounded-2xl border p-4 md:p-6 shadow-sm w-full">
							<h4 class="mb-4 text-xl font-bold">{$t('dashboard.task_details_by_task.bids_section_title')}</h4>
							<div class="space-y-4">
								{#each bids as bid (bid.id)}
									<BidCardDetailed
										{bid}
										{btcPrice}
										expandedBidId={expandedBidId}
										onAcceptBid={handleAcceptBid}
										onRejectBid={handleRejectBid}
										onToggleDetails={handleToggleDetails}
									/>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Main task info card -->
					<div class="bg-base-100 border-base-300 rounded-2xl border p-4 md:p-6 shadow-sm w-full">
						<!-- Description section -->
						<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:justify-between">
							{#if task.deadline || task.dateRange}
								<div class="flex flex-col gap-2 sm:max-w-md">
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

							<div class="flex flex-col items-end gap-2">
								<!-- Refresh bids button - only show for task owner -->
								{#if isLoggedIn && isOwner}
									<button
										class="btn btn-ghost btn-sm gap-2"
										onclick={handleRefreshBids}
										disabled={bidsLoading}
										title={$t('dashboard.task_details_by_task.refresh_bids')}
										aria-label={$t('dashboard.task_details_by_task.refresh_bids')}
									>
										{#if bidsLoading}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											<IconRefresh class="h-4 w-4" />
										{/if}
										<span class="hidden sm:inline">{$t('dashboard.task_details_by_task.refresh_bids')}</span>
									</button>
								{/if}
								
								<div class="text-lg font-bold">
									${formatNumberWithTwoDecimals(task.budget.amount)}

									<div class="text-base-content/60 text-sm">
										{satsFromUsd(task.budget.amount, btcPrice)}
									</div>
								</div>
							</div>
						</div>

						<!-- Timeline and Requirements in same row -->
						<div class="mb-2 flex flex-col gap-4 sm:flex-row sm:justify-between">
							<!-- Location information -->
							{#if task.pickupLocation || task.dropOffLocation}
								<div>
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
					<div class="bg-base-100 border-base-300 sticky top-6 rounded-2xl border p-4 lg:p-6 shadow-sm">
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

<!-- Bid Acceptance Drawer -->
<Drawer
	isOpen={showAcceptanceForm}
	title={$t('dashboard.bids.bid_acceptance.accept_bid_fund_contract')}
	onClose={handleCloseBid}
	position="right"
	isScrollable={true}
>
	{#snippet children()}
		{#if showAcceptanceForm && bidToAccept && task}
			<BidAcceptanceForm bid={bidToAccept} {task} {btcPrice} onCancel={handleCloseBid} />
		{/if}
	{/snippet}
</Drawer>
