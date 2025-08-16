<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import { getMyBids } from '$lib/utils/nostr-bid';
	import { nip19 } from 'nostr-tools';
	import { calculateUsdtEstimate } from '$lib/utils/helpers/crypto';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	// State
	let currentUserPubkey = $state<string>('');
	let myBids = $state<any[]>([]);
	let loading = $state(true);
	let error = $state<string>('');
	let btcPrice = $state<number>(120000); // Default fallback price
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

			// Get current user's pubkey
			const { npub } = await getNostrKeyPair();
			currentUserPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

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
			console.log('Bids loaded:', bids);
		} catch (err) {
			console.error('Error loading bids:', err);
			error = $t('bids.error.loading');
		} finally {
			loading = false;
		}
	}

	// Helper functions
	function formatAmount(amount: number, currency: string): string {
		if (currency === 'SATS') {
			return `${amount.toLocaleString()} sats`;
		}
		return `${amount} ${currency}`;
	}

	function formatDuration(duration: string): string {
		if (!duration) return 'N/A';
		return `${duration} ${$t('bids.hours')}`;
	}

	function getStatusColor(status: string): string {
		switch (status?.toLowerCase()) {
			case 'accepted':
				return 'bg-green-500';
			case 'rejected':
				return 'bg-red-500';
			case 'pending':
				return 'bg-yellow-500';
			default:
				return 'bg-gray-500';
		}
	}

	function getStatusText(status: string): string {
		switch (status?.toLowerCase()) {
			case 'accepted':
				return $t('bids.accepted');
			case 'rejected':
				return $t('bids.rejected');
			case 'pending':
				return $t('bids.pending');
			default:
				return $t('bids.pending');
		}
	}

	function truncateText(text: string, maxLength: number = 100): string {
		if (!text) return '';
		if (text.length <= maxLength) return text;
		return text.substring(0, maxLength) + '...';
	}

	// Toggle bid expansion
	function toggleBidExpansion(bidId: string) {
		if (expandedBids.has(bidId)) {
			expandedBids.delete(bidId);
		} else {
			expandedBids.add(bidId);
		}
		expandedBids = new Set(expandedBids); // Trigger reactivity
	}
</script>

<div class="space-y-6">
	<!-- Header Section -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold text-white">
				{$t('bids.my_submitted_bids')}
			</h2>
			<p class="mt-1 text-gray-400">
				{$t('bids.manage_description')}
			</p>
		</div>
		<button
			onclick={loadMyBids}
			class="inline-flex items-center rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-gray-700"
		>
			<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
				/>
			</svg>
			{$t('bids.refresh')}
		</button>
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="flex justify-center py-12">
			<div class="text-center">
				<div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-white"></div>
				<p class="text-gray-400">{$t('bids.loading_bids')}</p>
			</div>
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
			<h3 class="mt-4 text-lg font-semibold">{$t('bids.no_bids_yet')}</h3>
			<p class="text-base-content/60 mt-2 mb-6">
				{$t('bids.no_bids_description')}
			</p>
			<div class="space-y-2">
				<a
					href="/dashboard/find-tasks"
					class="inline-flex items-center rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
				>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					{$t('bids.empty.find_tasks')}
				</a>
			</div>
		</div>
	{:else}
		<!-- Bids List -->
		<div class="space-y-4">
			{#each myBids as bid, index}
				<div class="card bg-base-100 border-base-300 rounded-lg border shadow-sm">
					<div class="card-body p-6">
						<!-- Task Information - Header with submission date on the right -->
						<div class="border-base-300 mb-6 border-b pb-4">
							<div class="flex items-start justify-between">
								<div class="flex-1">
									<h3 class="mb-2 text-xl font-semibold">
										{bid.bid.taskTitle || $t('bids.unknown_task')}
									</h3>
									{#if bid.bid.taskDescription}
										<p class="text-base-content/70 text-sm">
											{bid.bid.taskDescription}
										</p>
									{:else}
										<p class="text-base-content/50 text-sm italic">
											{$t('bids.no_task_description')}
										</p>
									{/if}
								</div>
								<div class="ml-4 text-right">
									<p class="text-base-content/60 mb-1 text-xs">{$t('bids.submitted')}</p>
									<p class="text-sm font-medium">
										{new Date(bid.bid.timestamp).toLocaleDateString()}
									</p>
									<p class="text-base-content/60 text-xs">
										{new Date(bid.bid.timestamp).toLocaleTimeString()}
									</p>
								</div>
							</div>
						</div>

						<!-- Your Bid Details - Clean and simple -->
						<div class="space-y-2">
							<h4 class="text-base-content/90 font-medium">
								{$t('bids.your_proposal')}
							</h4>

							<!-- Two-column layout: Left for Scheduled Period, Right for other details -->
							<div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
								<!-- Left column: Scheduled Period -->
								{#if bid.bid.paymentType === 'FIXED' && bid.bid.startDate && bid.bid.endDate}
									<div class="text-left order-1 lg:order-1">
										<p class="text-base-content/60 mb-1 text-xs">
											{$t('bids.scheduled_period')} ({bid.bid.estimatedDuration || 'N/A'})
										</p>
										<p class="text-sm font-medium">
											{new Date(bid.bid.startDate).toLocaleDateString()} - {new Date(
												bid.bid.endDate
											).toLocaleDateString()}
											{#if bid.bid.startTime && bid.bid.endTime}
												<br />
												<span class="text-base-content/70 text-xs">
													{bid.bid.startTime} - {bid.bid.endTime}
												</span>
											{/if}
										</p>
									</div>
								{/if}

								<!-- Right column: Amount, Payment Type - Always in same row with justify-between -->
								<div class="flex flex-row justify-between gap-4 sm:gap-6 order-2 lg:order-2 lg:ml-auto">
									<div class="text-center">
										<p class="text-base-content/60 mb-1 text-xs">{$t('bids.your_bid_amount')}</p>
										<p class="text-lg font-semibold">
											{formatAmount(bid.bid.amount || 0, bid.bid.currency || 'SATS')}
										</p>
										<p class="text-info text-xs">
											≈ {calculateUsdtEstimate(bid.bid.amount || 0, btcPrice)} USDT
										</p>
									</div>

									<div class="text-center">
										<p class="text-base-content/60 mb-1 text-xs">{$t('bids.payment_type')}</p>
										<span class="badge badge-outline">
											{bid.bid.paymentType || 'FIXED'}
										</span>
									</div>
								</div>
							</div>

							<!-- Additional payment details if needed -->
							{#if bid.bid.paymentType === 'HOURLY' && bid.bid.hourlyRate}
								<div class="border-base-200 border-t pt-2">
									<div class="flex justify-end gap-6">
										<div class="text-center">
											<p class="text-base-content/60 mb-1 text-xs">{$t('bids.hourly_rate')}</p>
											<p class="font-medium">
												{bid.bid.hourlyRate}
												{$t('bids.sats')}/{$t('bids.per_hour')}
											</p>
										</div>
										{#if bid.bid.estimatedHours}
											<div class="text-center">
												<p class="text-base-content/60 mb-1 text-xs">
													{$t('bids.estimated_hours')}
												</p>
												<p class="font-medium">
													{bid.bid.estimatedHours}
													{$t('bids.hours')}
												</p>
											</div>
										{/if}
									</div>
								</div>
							{/if}

							<!-- Expandable sections for Description, Approach and Cover Letter -->
							{#if bid.bid.description || bid.bid.proposedApproach || bid.bid.coverLetter}
								<div class="border-base-200 border-t pt-2">
									<button
										type="button"
										onclick={() => toggleBidExpansion(bid.bid.bidId)}
										class="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content h-auto min-h-0 gap-1 p-0"
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
										{expandedBids.has(bid.bid.bidId) ? $t('bids.show_less') : $t('bids.show_more')}
									</button>

									{#if expandedBids.has(bid.bid.bidId)}
										<div class="mt-3 space-y-3">
											<!-- Your Description -->
											{#if bid.bid.description}
												<div>
													<p class="text-base-content/60 mb-2 text-xs">
														{$t('bids.your_description')}
													</p>
													<p class="text-base-content/80 text-sm">
														{bid.bid.description}
													</p>
												</div>
											{/if}

											<!-- Proposed Approach -->
											{#if bid.bid.proposedApproach}
												<div>
													<p class="text-base-content/60 mb-2 text-xs">
														{$t('bids.your_approach')}
													</p>
													<p class="text-base-content/80 text-sm">
														{bid.bid.proposedApproach}
													</p>
												</div>
											{/if}

											<!-- Cover Letter -->
											{#if bid.bid.coverLetter}
												<div>
													<p class="text-base-content/60 mb-2 text-xs">
														{$t('bids.your_cover_letter')}
													</p>
													<p class="text-base-content/80 text-sm">
														{bid.bid.coverLetter}
													</p>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/if}

							<!-- Simple footer -->
							<div class="border-base-200 border-t pt-2 text-right">
								<span class="text-base-content/50 text-xs">
									{$t('bids.bid_id')}: {bid.bid.bidId?.slice(0, 8)}...
								</span>
							</div>
						</div>
					</div>
				</div>

				{#if index < myBids.length - 1}
					<div class="divider mx-auto w-[90%]"></div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
