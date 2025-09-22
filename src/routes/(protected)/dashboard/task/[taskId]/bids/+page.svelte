<script lang="ts">
	import type { Task } from '$lib/types/task';
	import type { CounterOffer, TaskBid } from '$lib/types/bid';
	import { t } from 'svelte-i18n';
	import { getBidsFromDMs } from '$lib/utils/nostr-bid';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { formatNumberWithTwoDecimals } from '$lib/stores/breezWallet.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import bidService from '$lib/api/services/bid.service';
	import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
	import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';

	// State
	let task = $state<Task | null>(null);
	let bids = $state<TaskBid[]>([]);
	let loading = $state(false);
	let errorMessage = $state('');
	let isOwner = $state(false);
	let btcPrice = $state(0);
	let expandedBidId = $state<string | null>(null);
	let showAcceptanceForm = $state(false);
	let bidToAccept = $state<TaskBid | null>(null);
	let showCounterOfferForm = $state(false);
	let selectedBid = $state<TaskBid | null>(null);
	let showRetryButton = $state(false);

	async function loadTaskDetails(id: string) {
		if (!id) return;
		try {
			loading = true;
			errorMessage = '';
			showRetryButton = false;

			const { data: event } = await nostrEventsService.findEventById(id);

			if (!event) {
				errorMessage = $t('task.drawer.error.load');
				return;
			}

			// Parse task data from nostr event
			const taskData = JSON.parse(event.content) as Task;
			task = {
				...taskData,
				id: event.id
			};

			// Update task status based on existing bids
			if (task) {
				const dmBids = await getBidsFromDMs(task.id);

				// Deduplicate: keep only the newest bid per user for this task,
				// and also remove any duplicates by bidId
				const newestPerUser = Object.values(
					dmBids
						.slice()
						.sort((a, b) => b.bid.timestamp - a.bid.timestamp)
						.reduce(
							(acc, msg) => {
								const key = `${msg.senderPubkey}:${msg.bid.taskId}`;
								if (!acc[key]) acc[key] = msg; // first (newest) wins
								return acc;
							},
							{} as Record<string, (typeof dmBids)[number]>
						)
				);

				const uniqueByBidId = Array.from(
					new Map(newestPerUser.map((m) => [m.bid.bidId, m])).values()
				);

				bids = uniqueByBidId.map(({ bid, senderPubkey }) => ({
					id: bid.bidId,
					taskId: bid.taskId as unknown as string,
					freelancerId: 0,
					bidderWalletAddress: bid.bidderWalletAddress,
					amount: bid.amount,
					currency: bid.currency as unknown as any,
					paymentType: bid.paymentType,
					hourlyRate: bid.hourlyRate ?? undefined,
					estimatedHours: bid.estimatedHours ?? undefined,
					description: bid.description,
					estimatedDuration: bid.estimatedDuration,
					proposedApproach: bid.proposedApproach,
					coverLetter: bid.coverLetter,
					visibility: 'PRIVATE',
					milestones: [],
					responseTime: 0,
					status: 'PENDING',
					createdAt: new Date(bid.timestamp).toISOString(),
					updatedAt: new Date(bid.timestamp).toISOString(),
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
					task: {
						id: 0 as unknown as number,
						title: task?.title || '',
						description: task?.description || '',
						status: (task as any)?.status || ''
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
						averageRating: null,
						level: 0,
						experiencePoints: 0,
						reputationScore: 0,
						feeDiscount: 0,
						monthlyActivityPoints: 0,
						verificationLevel: 'UNVERIFIED' as unknown as any,
						identityVerified: false,
						createdAt: new Date(bid.timestamp).toISOString(),
						updatedAt: new Date(bid.timestamp).toISOString(),
						user: {
							id: 0,
							email: ''
						}
					},
					userProfile: {
						user: {
							id: bid.bidderId || 'unknown', // This will now be the npub
							name: (bid.bidderName as string) || 'Anonymous',
							avatar: (bid.bidderAvatar as string) || ''
						}
					} as unknown as any
				})) as unknown as TaskBid[];
			}
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = $t('task.drawer.error.load');
			showRetryButton = true;
		} finally {
			loading = false;
		}
	}

	function toggleBidDetails(bidId: string) {
		expandedBidId = expandedBidId === bidId ? null : bidId;
	}

	function handleCounterOffer(bid: TaskBid) {
		selectedBid = bid;
		showCounterOfferForm = true;
	}

	function handleAcceptBid(bid: TaskBid) {
		bidToAccept = bid;
		showAcceptanceForm = true;
	}

	async function submitCounterOffer(
		bidId: string,
		counterOffer: Omit<CounterOffer, 'id' | 'bidId' | 'createdAt' | 'status'>
	) {
		try {
			// API call to create counter offer
			await bidService.createCounterOffer(bidId, counterOffer);
			// Reset state
			showCounterOfferForm = false;
			selectedBid = null;
			// Reload task to update bids with counter offer
			// if (props.taskId) {
			// 	await loadTaskDetails(props.taskId);
			// }
		} catch (error) {
			console.error($t('task.drawer.error.counter_offer'), error);
		}
	}

	async function handleRejectBid(bid: TaskBid) {
		try {
			await bidService.rejectBid(bid.id);
			// Refresh task to update status and bids
			// await loadTaskDetails(props.taskId!);
		} catch (error) {
			console.error('Error rejecting bid:', error);
		}
	}

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Failed to fetch BTC price:', error);
		}
	}

	function retryLoadingData() {
		loadTaskDetails(page.params.taskId as string);
		fetchBtcPrice();
	}

	onMount(async () => {
		await loadTaskDetails(page.params.taskId as string);
		await fetchBtcPrice();
	});
</script>

<div class="mx-auto max-w-7xl">
	<div class="mb-4 sm:mb-6">
		<h3 class="text-xl font-bold sm:text-2xl">{$t('task.drawer.bids_received')}</h3>
		<p class="text-base-content/70 mt-2 text-sm sm:text-base">
			{$t('task.drawer.bids_description')}
		</p>
	</div>
	{#if loading}
		<div class="space-y-4">
			{#each Array(1) as _, i}
				<div class="bg-base-100 border-base-200 rounded-2xl border shadow-sm">
					<div class="p-4 md:p-6">
						<!-- Header skeleton -->
						<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div class="flex items-center gap-4">
								<div class="bg-base-300 h-14 w-14 animate-pulse rounded-full"></div>
								<div class="flex-1 space-y-2">
									<div class="bg-base-300 h-5 w-32 animate-pulse rounded"></div>
									<div class="flex items-center gap-4">
										<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
										<div class="flex gap-1">
											{#each Array(5) as _, j}
												<div class="bg-base-300 h-4 w-4 animate-pulse rounded"></div>
											{/each}
										</div>
									</div>
								</div>
							</div>
							<div class="text-right">
								<div class="bg-base-300 mb-1 h-8 w-20 animate-pulse rounded"></div>
								<div class="bg-base-300 mb-1 h-6 w-16 animate-pulse rounded"></div>
								<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
							</div>
						</div>

						<!-- Description skeleton -->
						<div class="mb-4">
							<div class="bg-base-300 mb-2 h-4 w-full animate-pulse rounded"></div>
							<div class="bg-base-300 h-4 w-3/4 animate-pulse rounded"></div>
						</div>

						<!-- Action buttons skeleton -->
						<div
							class="border-base-200 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="bg-base-300 h-8 w-24 animate-pulse rounded"></div>
							<div class="flex gap-2">
								<div class="bg-base-300 h-8 w-16 animate-pulse rounded"></div>
								<div class="bg-base-300 h-8 w-16 animate-pulse rounded"></div>
								<div class="bg-base-300 h-8 w-16 animate-pulse rounded"></div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if errorMessage}
		<div class="py-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-error mx-auto h-16 w-16"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
				/>
			</svg>
			<h3 class="mt-4 text-xl font-semibold text-error">Error Loading Bids</h3>
			<p class="text-base-content/60 mt-2 mb-4">
				{errorMessage}
			</p>
			{#if showRetryButton}
				<button 
					class="btn btn-primary"
					onclick={retryLoadingData}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 mr-2"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
					Retry
				</button>
			{/if}
		</div>
	{:else if bids.length === 0}
		<div class="py-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/30 mx-auto h-16 w-16"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<h3 class="mt-4 text-xl font-semibold">{$t('task.drawer.no_bids')}</h3>
			<p class="text-base-content/60 mt-2">
				{isOwner ? $t('task.drawer.no_bids_owner') : $t('task.drawer.no_bids_provider')}
			</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each bids as bid}
				<div
					class="bg-base-100 border-base-200 rounded-2xl border shadow-sm transition-all duration-200 hover:shadow-md"
				>
					<div class="p-4 md:p-6">
						<!-- Header with user info and bid amount -->
						<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div class="flex items-center gap-4">
								<!-- Avatar -->
								<div class="avatar">
									<div
										class="bg-base-300 flex h-12 w-12 items-center justify-center rounded-full sm:h-14 sm:w-14"
									>
										{#if bid.userProfile?.user?.avatar}
											<img
												src={bid.userProfile.user.avatar}
												alt={$t('task.drawer.avatar_alt')}
												class="h-12 w-12 rounded-full object-cover sm:h-14 sm:w-14"
											/>
										{:else}
											<div
												class="avatar placeholder text-neutral-content bg-primary flex h-12 w-12 items-center justify-center rounded-full sm:h-14 sm:w-14"
											>
												<span class="text-lg font-semibold sm:text-2xl">
													{(bid.userProfile?.user?.name || 'A').charAt(0).toUpperCase()}
												</span>
											</div>
										{/if}
									</div>
								</div>

								<!-- User info -->
								<div class="min-w-0 flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h3 class="truncate text-base font-semibold sm:text-lg">
											{bid.userProfile?.user?.name || $t('task.drawer.anonymous')}
										</h3>
										<button
											class="btn btn-ghost btn-xs text-primary hover:bg-primary/10"
											onclick={() =>
												window.open(
													`/dashboard/taskees/profile/${bid.userProfile?.user?.id || 'unknown'}`,
													'_blank'
												)}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3 w-3"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
												/>
											</svg>
											<span class="hidden sm:inline">See Profile</span>
										</button>
									</div>
									<div class="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
										<span class="text-base-content/60 text-xs sm:text-sm">
											{$t('task.drawer.member_since')}
											{new Date(bid.createdAt).toLocaleDateString('en-US', {
												month: '2-digit',
												year: 'numeric'
											})}
										</span>
										<!-- Rating -->
										<div class="flex items-center gap-1">
											{#each Array(5) as _, i}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3 w-3 sm:h-4 sm:w-4 {i < 4
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
											<span class="text-base-content/60 ml-1 text-xs sm:text-sm">4.0</span>
										</div>
									</div>
								</div>
							</div>

							<!-- Bid amount -->
							<div class="text-left sm:text-right">
								<div class="text-xl font-bold sm:text-2xl">
									${formatNumberWithTwoDecimals(bid.amount)}
								</div>
								<div class="sm:text-md text-base-content/60 text-sm font-bold">
									{satsFromUsd(bid.amount, btcPrice)}
								</div>
								<div class="text-base-content/50 mt-1 text-xs">
									{bid.paymentType} • {bid.estimatedDuration}
								</div>
							</div>
						</div>

						<!-- Bid description -->
						<div class="mb-4">
							<p class="text-base-content/80 line-clamp-2">{bid.description}</p>
						</div>

						<!-- Action buttons - always visible -->
						<div
							class="border-base-200 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<button
								class="btn btn-ghost btn-sm w-full sm:w-auto"
								onclick={() => toggleBidDetails(bid.id)}
							>
								{expandedBidId === bid.id ? 'Hide Details' : 'Show Details'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="ml-1 h-4 w-4 transition-transform duration-200 {expandedBidId === bid.id
										? 'rotate-180'
										: ''}"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>

							{#if bid?.status === 'PENDING'}
								<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
									<button
										class="btn btn-error btn-sm flex-1 sm:flex-none"
										onclick={() => handleRejectBid(bid)}
									>
										Decline
									</button>
									<button
										class="btn btn-outline btn-sm flex-1 sm:flex-none"
										onclick={() => handleCounterOffer(bid)}
									>
										Counter
									</button>
									<button
										class="btn btn-primary btn-sm flex-1 sm:flex-none"
										onclick={() => handleAcceptBid(bid)}
									>
										Accept
									</button>
								</div>
							{/if}
						</div>

						<!-- Expanded details -->
						{#if expandedBidId === bid.id}
							<div
								class="border-base-200 mt-4 space-y-4 border-t pt-4 sm:mt-6 sm:space-y-6 sm:pt-6"
							>
								<!-- Description -->
								{#if bid.description}
									<div>
										<p class="text-base-content/60 mb-2 text-xs font-medium">
											{$t('bids.your_description')}
										</p>
										<div class="bg-base-200 rounded-lg p-3">
											<p class="text-base-content/80 text-sm leading-relaxed">
												{bid.description}
											</p>
										</div>
									</div>
								{/if}

								<!-- Approach -->
								{#if bid.proposedApproach}
									<div>
										<p class="text-base-content/60 mb-2 text-xs font-medium">
											{$t('bids.your_approach')}
										</p>
										<div class="bg-base-200 rounded-lg p-3">
											<p class="text-base-content/80 text-sm leading-relaxed">
												{bid.proposedApproach}
											</p>
										</div>
									</div>
								{/if}

								<!-- Cover Letter -->
								{#if bid.coverLetter}
									<div>
										<p class="text-base-content/60 mb-2 text-xs font-medium">
											{$t('bids.your_cover_letter')}
										</p>
										<div class="bg-base-200 rounded-lg p-3">
											<p class="text-base-content/80 text-sm leading-relaxed">
												{bid.coverLetter}
											</p>
										</div>
									</div>
								{/if}

								<!-- Milestones -->
								{#if bid.milestones && bid.milestones.length > 0}
									<div>
										<p class="text-base-content/60 mb-2 text-xs font-medium">Milestones</p>
										<div class="bg-base-200 rounded-lg p-3">
											<ul class="space-y-2">
												{#each bid.milestones as milestone}
													<li class="flex items-start gap-2 text-sm">
														<div class="bg-primary mt-2 h-2 w-2 flex-shrink-0 rounded-full"></div>
														<span class="text-base-content/80 leading-relaxed"
															>{milestone?.description}</span
														>
													</li>
												{/each}
											</ul>
										</div>
									</div>
								{/if}

								<!-- Location -->
								{#if bid?.pickupLocation?.displayName || bid?.dropOffLocation?.displayName}
									<div>
										<p class="text-base-content/60 mb-2 text-xs font-medium">Location</p>
										<div class="bg-base-200 rounded-lg p-3">
											<div class="flex items-start gap-2 text-sm">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="text-base-content/60 mt-0.5 h-4 w-4 flex-shrink-0"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
													/>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
													/>
												</svg>
												<span class="text-base-content/80 leading-relaxed">
													{bid?.pickupLocation?.displayName || bid?.dropOffLocation?.displayName}
												</span>
											</div>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Modals -->
{#if showCounterOfferForm && selectedBid}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
			<CounterOfferForm
				bid={selectedBid}
				onSubmit={submitCounterOffer as any}
				onCancel={() => {
					showCounterOfferForm = false;
					selectedBid = null;
				}}
			/>
		</div>
	</div>
{/if}

{#if showAcceptanceForm && bidToAccept}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
			{#if task}
				<BidAcceptanceForm
					bid={bidToAccept}
					{task}
					{btcPrice}
					taskTitle={task.title || ''}
					onCancel={() => {
						showAcceptanceForm = false;
						bidToAccept = null;
					}}
				/>
			{/if}
		</div>
	</div>
{/if}
