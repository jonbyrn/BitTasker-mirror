<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { getMyBids } from '$lib/utils/nostr-bid';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { goto } from '$app/navigation';
	import { formatTimeLarge } from '$lib/utils/helpers/dateFormatter';
	import { formatNumberWithTwoDecimals } from '$lib/stores/wallet.store';

	// State
	let myBids = $state<any[]>([]);
	let loading = $state(true);
	let error = $state<string>('');
	let btcPrice = $state<number>(0); // Default fallback price
	let expandedBids = $state<Set<string>>(new Set()); // Track expanded bids

	/**
	 * Fetch current BTC price
	 */
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Keep using fallback price
		}
	}

	onMount(async () => {
		try {
			// Fetch BTC price for USDT conversion
			fetchBtcPrice();

			// Load user's bids
			await loadMyBids();
		} catch (err) {
			console.error('Error loading user data:', err);
			error = $t('bids.error.loading_user_data');
		} finally {
			loading = false;
		}
	});

	async function loadMyBids() {
		try {
			loading = true;
			const bids = await getMyBids();
			myBids = bids;
		} catch (err) {
			console.error('Error loading bids:', err);
			error = $t('bids.error.loading');
		} finally {
			loading = false;
		}
	}

	// Toggle bid expansion
	function toggleBidExpansion(bidId: string) {
		if (expandedBids.has(bidId)) {
			expandedBids.delete(bidId);
		} else {
			expandedBids.add(bidId);
		}
		expandedBids = new Set(expandedBids);
	}
</script>

<div class="space-y-6">
	{#if loading}
		<div class="space-y-4">
			{#each Array(1) as _}
				<div class="card bg-base-100 border-base-300 animate-pulse rounded-lg border shadow-sm">
					<div class="card-body p-4 md:p-6">
						<!-- Task Information - Header skeleton -->
						<div class="border-base-300 mb-4 md:mb-6">
							<div class="flex items-start">
								<div class="flex-1">
									<!-- Task title skeleton -->
									<div class="bg-base-300 h-6 w-3/4 rounded"></div>
								</div>
							</div>
						</div>

						<!-- Your Bid Details skeleton -->
						<div class="space-y-2">
							<!-- Proposal title skeleton -->
							<div class="flex flex-col gap-2 md:flex-row md:items-center">
								<div class="bg-base-300 h-4 w-32 rounded md:h-5"></div>
								<div class="bg-base-300 h-3 w-16 rounded md:h-4"></div>
							</div>

							<!-- Two-column layout skeleton -->
							<div class="flex flex-col items-start justify-between gap-3 md:flex-row md:gap-4">
								<!-- Left column: Scheduled Period skeleton -->
								<div class="flex w-full flex-col gap-3 text-left md:w-auto md:gap-6">
									<div>
										<div class="bg-base-300 mb-1 h-3 w-28 rounded md:w-32"></div>
										<div class="bg-base-300 h-4 w-32 rounded md:w-36"></div>
										<div class="bg-base-300 mt-1 h-3 w-24 rounded md:w-28"></div>
									</div>
								</div>

								<!-- Right column: Amount & Payment Type skeleton -->
								<div class="flex w-full flex-row md:ml-auto md:w-auto">
									<div class="w-full text-start md:w-auto">
										<div class="bg-base-300 h-6 w-20 rounded md:w-24"></div>
										<div class="bg-base-300 mt-1 h-4 w-24 rounded md:w-28"></div>
									</div>
								</div>
							</div>

							<!-- Avatar, Username, and Review Stars skeleton -->
							<div
								class="flex flex-col gap-2 pt-2 md:flex-row md:items-center md:justify-between md:gap-3"
							>
								<div class="flex items-center gap-2 md:gap-3">
									<!-- Avatar skeleton -->
									<div class="bg-base-300 h-6 w-6 rounded-full md:h-8 md:w-8"></div>

									<!-- Username and Review Stars skeleton -->
									<div class="flex flex-col">
										<div class="bg-base-300 mb-1 h-3 w-16 rounded md:h-4 md:w-20"></div>
										<!-- Review Stars skeleton -->
										<div class="flex items-center">
											{#each Array(5) as _}
												<div class="bg-base-300 mr-1 h-2 w-2 rounded md:h-3 md:w-3"></div>
											{/each}
											<div class="bg-base-300 ml-1 h-2 w-6 rounded md:h-3 md:w-8"></div>
										</div>
									</div>
								</div>
							</div>

							<!-- Bottom section: Show more and View Task button skeleton -->
							<div class="flex flex-col gap-3 md:flex-row md:justify-between md:gap-0">
								<!-- Show more button skeleton -->
								<div class="border-base-200 pt-2">
									<div class="bg-base-300 h-6 w-20 rounded-2xl"></div>
								</div>

								<!-- View Task button skeleton -->
								<div class="flex justify-start md:justify-end">
									<div class="bg-base-300 h-8 w-24 rounded"></div>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="bg-base-100 rounded-xl py-12 text-center shadow-md">
			<svg
				class="mx-auto mb-4 h-12 w-12 text-red-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<h3 class="mt-4 text-lg font-semibold">{$t('bids.error_loading_bids')}</h3>
			<p class="text-base-content/60 mt-2 mb-4">{error}</p>
			<button
				onclick={loadMyBids}
				class="rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
			>
				{$t('bids.retry')}
			</button>
		</div>
	{:else if myBids.length === 0}
		<!-- Empty State -->
		<div class="bg-base-100 rounded-xl py-12 text-center shadow-md">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-primary mx-auto mb-3 h-12 w-12"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			<span class="text-xl font-medium">{$t('bids.no_bids_yet')}</span>
			<p class="mb-4 text-gray-500">
				{$t('bids.no_bids_description')}
			</p>
		</div>
	{:else}
		<!-- Bids List -->
		<div class="space-y-4">
			{#each myBids as bid, index}
				<div class="card bg-base-100 border-base-300 rounded-lg border shadow-sm">
					<div class="card-body p-4 md:p-6">
						<!-- Task Information - Header -->
						<div class="border-base-300 mb-4 md:mb-6">
							<div class="flex items-start">
								<div class="flex-1">
									<small class="card-title line-clamp-1 text-lg">
										<a
											href="/dashboard/task/{bid.bid.task?.id || bid.bid.taskId}"
											class="hover:text-primary transition-colors"
											onclick={(e) => e.stopPropagation()}
										>
											{bid.bid.taskTitle || $t('bids.unknown_task')}
										</a>
									</small>
								</div>
							</div>
						</div>

						<!-- Your Bid Details -->
						<div class="space-y-3">
							<small class="text-base-content/90 text-xl font-medium">
								{$t('bids.your_proposal')} -
								<small class="text-base-content/60">
									{(bid.bid.paymentType || 'FIXED').toLowerCase()}
								</small>
							</small>

							<!-- Two-column layout -->
							<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
								<!-- Left column: FIXED period OR HOURLY rate/hours -->
								<div class="flex flex-col gap-4 md:flex-row md:gap-6">
									{#if bid.bid.paymentType === 'FIXED' && bid.bid.startDate && bid.bid.endDate}
										<div>
											<p class="text-sm font-medium">
												{new Date(bid.bid.startDate).toLocaleDateString()} -
												{new Date(bid.bid.endDate).toLocaleDateString()}
												{#if bid.bid.startTime && bid.bid.endTime}
													<br />
													<span class="text-base-content/70 text-xs">
														{formatTimeLarge(bid.bid.startTime)} - {formatTimeLarge(
															bid.bid.endTime
														)}
													</span>
												{/if}
											</p>
										</div>
									{:else if bid.bid.paymentType === 'HOURLY'}
										<div class="text-start">
											<p class="text-base-content/60 mb-1 text-xs">{$t('bids.hourly_rate')}</p>
											<p class="font-medium">
												{bid.bid.hourlyRate}
												{$t('bids.sats')}/{$t('bids.per_hour')}
											</p>
										</div>
										{#if bid.bid.estimatedHours}
											<div class="text-start">
												<p class="text-base-content/60 mb-1 text-xs">
													{$t('bids.estimated_hours')}
												</p>
												<p class="font-medium">
													{bid.bid.estimatedHours}
													{$t('bids.hours')}
												</p>
											</div>
										{/if}
									{/if}
								</div>

								<!-- Right column: Amount & Payment Type -->
								<div class="flex justify-start md:justify-end">
									<div class="text-start">
										<div class="text-lg font-semibold">
											${formatNumberWithTwoDecimals(bid.bid.amount)}
										</div>
										<div class="text-base-content/60 text-sm md:text-lg">
											{satsFromUsd(bid.bid.amount, btcPrice)}
										</div>
									</div>
								</div>
							</div>

							<div class="flex flex-col gap-3 pt-2 md:flex-row md:items-center md:justify-between">
								<!-- Left: Avatar, Username, and Review Stars -->
								<div class="flex items-center gap-3">
									<!-- Avatar -->
									<div class="avatar">
										<div class="bg-base-300 flex h-8 w-8 items-center justify-center rounded-full">
											{#if bid.bid.creator?.avatar}
												<img
													src={bid.bid.creator.avatar}
													alt="Avatar"
													class="h-8 w-8 rounded-full object-cover"
												/>
											{:else}
												<!-- Placeholder con iniciales del nombre -->
												<div
													class="avatar placeholder text-neutral-content bg-primary flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-center"
												>
													{#if bid.bid.creator?.username}
														<span class="text-lg font-semibold">
															{bid.bid.creator.username.charAt(0).toUpperCase()}
														</span>
													{:else}
														<svg
															xmlns="http://www.w3.org/2000/svg"
															class="text-base-content/60 h-6 w-6"
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
										<span class="text-sm font-medium">
											{bid.bid.creator?.username || 'Anonymous'}
										</span>
										<!-- Review Stars -->
										<div class="flex items-center">
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
											<span class="text-base-content/60 ml-1 text-xs">4.0</span>
										</div>
									</div>
								</div>
							</div>

							<!-- Expandable sections -->
							<div class="flex flex-col gap-3">
								<!-- Show more button and View Task button in same row -->
								<div class="flex items-center justify-between">
									{#if bid.bid.description || bid.bid.proposedApproach || bid.bid.coverLetter}
										<button
											type="button"
											onclick={() => toggleBidExpansion(bid.bid.bidId)}
											class="hover:bg-base-content/5 flex w-fit cursor-pointer items-center gap-2 rounded-2xl p-2 text-left transition-colors duration-200"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3 w-3 transition-transform duration-200 {expandedBids.has(
													bid.bid.bidId
												)
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
											{expandedBids.has(bid.bid.bidId)
												? $t('bids.show_less')
												: $t('bids.show_more')}
										</button>
									{:else}
										<div></div>
									{/if}

									<button
										class="btn btn-secondary btn-sm"
										onclick={() => goto(`/dashboard/task/${bid.bid.task?.id || bid.bid.taskId}`)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-5 w-5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
											/>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
											/>
										</svg>
										{$t('bids.view_task')}
									</button>
								</div>

								<!-- Expandable content - full width -->
								{#if (bid.bid.description || bid.bid.proposedApproach || bid.bid.coverLetter) && expandedBids.has(bid.bid.bidId)}
									<div class="w-full space-y-4">
										{#if bid.bid.description}
											<div>
												<p class="text-base-content/60 mb-2 text-xs font-medium">
													{$t('bids.your_description')}
												</p>
												<div class="bg-base-200 rounded-lg p-3">
													<p class="text-base-content/80 text-sm leading-relaxed">
														{bid.bid.description}
													</p>
												</div>
											</div>
										{/if}

										{#if bid.bid.proposedApproach}
											<div>
												<p class="text-base-content/60 mb-2 text-xs font-medium">
													{$t('bids.your_approach')}
												</p>
												<div class="bg-base-200 rounded-lg p-3">
													<p class="text-base-content/80 text-sm leading-relaxed">
														{bid.bid.proposedApproach}
													</p>
												</div>
											</div>
										{/if}

										{#if bid.bid.coverLetter}
											<div>
												<p class="text-base-content/60 mb-2 text-xs font-medium">
													{$t('bids.your_cover_letter')}
												</p>
												<div class="bg-base-200 rounded-lg p-3">
													<p class="text-base-content/80 text-sm leading-relaxed">
														{bid.bid.coverLetter}
													</p>
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
