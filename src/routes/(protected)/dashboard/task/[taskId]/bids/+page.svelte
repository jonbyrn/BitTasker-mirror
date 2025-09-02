<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import { getTaskBids } from '$lib/utils/nostr-bid';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import type { CounterOffer, TaskBid } from '$lib/types/bid';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import bidService from '$lib/api/services/bid.service';
	import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
	import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
	import { formatNumberWithTwoDecimals } from '$lib/stores/wallet.store';
	// State
	let task = $state<Task | null>(null);
	let bids = $state<TaskBid[]>([]);
	let loading = $state(false);
	let errorMessage = $state('');
	let isOwner = $state(false);
	let btcPrice = $state(0);
	let withdrawalReason = $state('');
	let withdrawalError = $state('');
	let bidToWithdraw = $state<string | null>(null);
	let withdrawingBid = $state(false);
	let expandedBidId = $state<string | null>(null);
	let showAcceptanceForm = $state(false);
	let bidToAccept = $state<TaskBid | null>(null);
	let showCounterOfferForm = $state(false);
	let selectedBid = $state<TaskBid | null>(null);

	async function loadTaskDetails(id: string) {
		if (!id) return;
		try {
			loading = true;
			errorMessage = '';

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

			if (task) {
				const dmBids = await getTaskBids(task.id);

				// Deduplicate: keep only the oldest bid per user for this task,
				// and also remove any duplicates by bidId
				const oldestPerUser = Object.values(
					dmBids
						.slice()
						.sort((a, b) => a.bid.timestamp - b.bid.timestamp)
						.reduce(
							(acc, msg) => {
								const key = `${msg.senderPubkey}:${msg.bid.taskId}`;
								if (!acc[key]) acc[key] = msg; // first (oldest) wins
								return acc;
							},
							{} as Record<string, (typeof dmBids)[number]>
						)
				);

				const uniqueByBidId = Array.from(
					new Map(oldestPerUser.map((m) => [m.bid.bidId, m])).values()
				);

				// Fetch profiles for each unique sender
				const uniqueSenders = Array.from(new Set(uniqueByBidId.map((m) => m.senderPubkey)));
				const profileEntries = await Promise.all(
					uniqueSenders.map(async (pk) => [pk, await fetchProfileMetadata(pk)] as const)
				);
				const profileMap = new Map(profileEntries);

				bids = uniqueByBidId.map(({ bid, senderPubkey }) => ({
					id: bid.bidId,
					taskId: bid.taskId as unknown as string,
					freelancerId: 0,
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
							displayName: (profileMap.get(senderPubkey)?.name ?? '').trim().length
								? (profileMap.get(senderPubkey)?.name as string)
								: `${senderPubkey.slice(0, 8)}...${senderPubkey.slice(-4)}`,
							picture: profileMap.get(senderPubkey)?.picture || ''
						}
					} as unknown as any
				})) as unknown as TaskBid[];
			}
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = $t('task.drawer.error.load');
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

	async function submitBidAcceptance(bidId: string, escrowMethod: string, escrowDetails: any) {
		try {
			// First accept the bid
			await bidService.acceptBid(bidId);

			// Then handle escrow funding based on the method
			if (escrowMethod === 'bittasker') {
				// Handle BitTasker wallet funding
				console.log('Funding escrow from BitTasker wallet:', escrowDetails);
				// TODO: Implement BitTasker wallet funding
			} else if (escrowMethod === 'external') {
				// Handle external wallet funding
				console.log('External wallet funding details:', escrowDetails);
				// TODO: Implement external wallet funding tracking
			}

			// Close the form
			showAcceptanceForm = false;
			bidToAccept = null;

			// Refresh task to update status and bids
			// await loadTaskDetails(props.taskId!);
		} catch (error) {
			console.error('Error accepting bid:', error);
		}
	}

	function toggleBidWithdrawal(bidId: string) {
		// If we're already withdrawing this bid, cancel withdrawal mode
		if (bidToWithdraw === bidId) {
			bidToWithdraw = null;
			withdrawalReason = '';
			withdrawalError = '';
			return;
		}

		// Otherwise, enter withdrawal mode for this bid
		withdrawalReason = '';
		withdrawalError = '';
		bidToWithdraw = bidId;
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
		btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
	}

	onMount(async () => {
		await loadTaskDetails($page.params.taskId as string);
		await fetchBtcPrice();
	});
</script>

<div class="mx-auto max-w-7xl p-4 md:p-0">
	<div class="mb-6">
		<h3 class="">Bids received</h3>
		<p class="text-base-content/70">
			Here you can see all the bids for this task. You can accept or reject bids, and you can also
			counter offers.
		</p>
	</div>
	{#if loading}
		<div class="">
			{#each Array(1) as _, i}
				<div class="bg-base-100 rounded-2xl shadow-sm">
					<div class="card-body p-4">
						<!-- Skeleton header with avatar, name, and amount -->
						<div class="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
							<div class="flex items-center gap-3">
								<!-- Skeleton avatar -->
								<div class="bg-base-300 h-12 w-12 animate-pulse rounded-full"></div>

								<!-- Skeleton user info -->
								<div class="flex flex-col gap-2">
									<div class="bg-base-300 h-5 w-32 animate-pulse rounded"></div>
									<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
									<!-- Skeleton stars -->
									<div class="mt-1 flex items-center gap-1">
										{#each Array(5) as _}
											<div class="bg-base-300 h-3 w-3 animate-pulse rounded"></div>
										{/each}
										<div class="bg-base-300 ml-1 h-3 w-8 animate-pulse rounded"></div>
									</div>
								</div>
							</div>

							<!-- Skeleton amount -->
							<div class="mb-1">
								<div class="bg-base-300 mb-1 h-6 w-20 animate-pulse rounded"></div>
								<div class="bg-base-300 h-4 w-16 animate-pulse rounded"></div>
							</div>
						</div>

						<!-- Skeleton description -->
						<div class="mt-2 space-y-2">
							<div class="bg-base-300 h-4 w-full animate-pulse rounded"></div>
							<div class="bg-base-300 h-4 w-3/4 animate-pulse rounded"></div>
						</div>

						<!-- Skeleton action buttons -->
						<div class="card-actions mt-4 mb-3 justify-end gap-2 pb-1">
							<div class="bg-base-300 h-8 w-24 animate-pulse rounded"></div>
							<div class="bg-base-300 h-8 w-20 animate-pulse rounded"></div>
							<div class="bg-base-300 h-8 w-20 animate-pulse rounded"></div>
							<div class="bg-base-300 h-8 w-20 animate-pulse rounded"></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if bids.length === 0}
		<div class="py-8 text-center">
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
			<h3 class="mt-4 text-lg font-semibold">No bids yet</h3>
			<p class="text-base-content/60 mt-1">
				{isOwner
					? 'Your task has not received any bids yet.'
					: 'You have not bid on this task yet.'}
			</p>
		</div>
	{/if}
	<div class="space-y-4">
		{#each bids as bid}
			<div class="bg-base-100 rounded-2xl shadow-sm transition-shadow hover:shadow-md">
				<div class="card-body p-4">
					<!-- Bid header with status and amount -->
					<div class="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
						<div class="flex items-center gap-3">
							<!-- Avatar -->
							<div class="avatar">
								<div class="bg-base-300 flex h-12 w-12 items-center justify-center rounded-full">
									{#if bid.userProfile?.user?.avatar}
										<img
											src={bid.userProfile.user.avatar}
											alt="Avatar"
											class="h-12 w-12 rounded-full object-cover"
										/>
									{:else}
										<!-- Placeholder with initials -->
										<div
											class="avatar placeholder text-neutral-content bg-primary flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-center"
										>
											{#if bid.userProfile?.user?.name || bid.userProfile?.professionalTitle || 'Anonymous'}
												<span class="text-xl font-semibold">
													{(bid.userProfile?.user?.name || 'A').charAt(0).toUpperCase()}
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

							<!-- Username and submission time -->
							<div class="flex flex-col">
								<h3 class="text-lg font-semibold">
									{bid.userProfile?.user?.name || bid.userProfile?.professionalTitle || 'Anonymous'}
								</h3>

								<p class="text-base-content/60 text-sm">
									Member since
									{new Date(bid.createdAt).toLocaleDateString('en-US', {
										month: '2-digit',
										year: 'numeric'
									})}
								</p>
								<!-- Review Stars (if available) -->
								<div class="mt-1 flex items-center">
									{#each Array(5) as _, i}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3 {i < 4 ? 'text-yellow-400' : 'text-base-content/30'}"
											fill="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
											/>
										</svg>
									{/each}
									<span class="text-base-content/60 ml-1 text-xs">
										<!-- {(bid.userProfile.user.rating || 0).toFixed(1)} -->
										4.0
									</span>
								</div>
							</div>
						</div>

						<div class="mb-1">
							<div class="text-lg font-bold">
								${formatNumberWithTwoDecimals(bid.amount)}
							</div>
							<div class="text-base-content/60 text-sm">
								{satsFromUsd(bid.amount, btcPrice)}
							</div>
						</div>
					</div>

					<!-- Bid summary (always visible) -->
					<div class="mt-2">
						<p class="line-clamp-2">{bid.description}</p>
					</div>

					<!-- Withdrawal reason -->
					{#if bidToWithdraw === bid.id}
						<div class="animate-fadeIn mt-4 space-y-4">
							<div class="border-base-300 border-t pt-4">
								<h4 class="text-base-content/80 mb-3 text-sm font-medium">Withdraw Your Bid</h4>
								<p class="mb-2 text-sm">Please provide a reason for withdrawing your bid:</p>

								<div class="form-control w-full">
									<textarea
										id="withdrawal-reason-{bid.id}"
										name="withdrawal-reason"
										class="textarea textarea-bordered h-20 w-full {withdrawalError
											? 'textarea-error'
											: ''}"
										placeholder="Please explain why you're withdrawing your bid..."
										bind:value={withdrawalReason}
									></textarea>

									{#if withdrawalError}
										<label class="label" for="withdrawal-reason-{bid.id}">
											<span class="label-text-alt text-error">{withdrawalError}</span>
										</label>
									{/if}
								</div>
							</div>
						</div>
					{/if}

					<!-- Expanded bid details -->
					{#if expandedBidId === bid.id}
						<div class="animate-fadeIn mt-4 space-y-4">
							<!-- Payment details -->
							<div>
								<div class=" rounded-box">
									<div class="grid grid-cols-2 gap-2">
										<div>
											<span class="text-base-content/60 text-xs">Payment Type:</span>
											<div class="text-lg font-bold">{bid.paymentType}</div>
										</div>

										<div>
											<span class="text-base-content/60 text-xs">Total Amount:</span>
											<div class="text-lg font-bold">
												${formatNumberWithTwoDecimals(bid.amount)}
											</div>
											<div class="text-base-content/60 text-sm">
												{satsFromUsd(bid.amount, btcPrice)}
											</div>
										</div>

										<div>
											<span class="text-base-content/60 text-xs">Estimated Timeline:</span>
											<div class="text-lg font-bold">{bid.estimatedDuration}</div>
										</div>
									</div>
								</div>
							</div>

							<div>
								<!-- Location -->
								{#if bid?.pickupLocation?.displayName || bid?.dropOffLocation?.displayName}
									<div class="mt-4 flex items-center gap-2">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-base-content/60 h-4 w-4"
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
										<span class="text-sm">
											<strong>Location:</strong>
											{bid?.pickupLocation?.displayName || bid?.dropOffLocation?.displayName}
										</span>
									</div>
								{/if}
							</div>

							<!-- Full description -->
							<div>
								<small class="text-base-content/60 mb-1 text-sm font-medium">Proposal</small>
								<div class="rounded-box whitespace-pre-wrap">
									{bid.description}
								</div>
							</div>

							<!-- Approach -->
							{#if bid.proposedApproach}
								<div class="mt-2">
									<small class="text-base-content/60 mb-1 text-sm font-medium"
										>Proposed Approach</small
									>
									<div class=" rounded-box whitespace-pre-wrap">
										{bid.proposedApproach}
									</div>
								</div>
							{/if}

							<!-- Milestones -->
							{#if bid.milestones && bid.milestones.length > 0}
								<div>
									<h4 class="text-base-content/60 mb-1 text-sm font-medium">Milestones</h4>
									<div class="bg-base-300 rounded-box">
										<ul class="list-inside list-disc">
											{#each bid.milestones as milestone}
												<li class="text-sm">{milestone?.description}</li>
											{/each}
										</ul>
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Action buttons -->
					<div class="card-actions mt-4 mb-3 justify-end pb-1">
						<button
							class="btn btn-ghost btn-outline btn-sm"
							onclick={() => toggleBidDetails(bid.id)}
						>
							{expandedBidId === bid.id ? 'Hide details' : 'Show details'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="ml-1 h-4 w-4 transition-transform duration-300 {expandedBidId === bid.id
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
							<button class="btn btn-error btn-sm" onclick={() => handleRejectBid(bid)}
								>Decline</button
							>
							<button class="btn btn-outline btn-sm" onclick={() => handleCounterOffer(bid)}
								>Counter</button
							>
							<button class="btn btn-primary btn-sm" onclick={() => handleAcceptBid(bid)}
								>Accept</button
							>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>

{#if showCounterOfferForm && selectedBid}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<div class="w-full max-w-3xl p-4">
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
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<div class="w-full max-w-3xl p-4">
			<BidAcceptanceForm
				bid={bidToAccept}
				taskTitle={task?.title || ''}
				onSubmit={submitBidAcceptance}
				onCancel={() => {
					showAcceptanceForm = false;
					bidToAccept = null;
				}}
			/>
		</div>
	</div>
{/if}
