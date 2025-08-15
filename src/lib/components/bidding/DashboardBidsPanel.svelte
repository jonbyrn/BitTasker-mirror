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
			currentUserPubkey = npub.startsWith('npub') 
				? (nip19.decode(npub).data as string) 
				: npub;

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
			case 'accepted': return 'bg-green-500';
			case 'rejected': return 'bg-red-500';
			case 'pending': return 'bg-yellow-500';
			default: return 'bg-gray-500';
		}
	}

	function getStatusText(status: string): string {
		switch (status?.toLowerCase()) {
			case 'accepted': return $t('bids.accepted');
			case 'rejected': return $t('bids.rejected');
			case 'pending': return $t('bids.pending');
			default: return $t('bids.pending');
		}
	}

	function truncateText(text: string, maxLength: number = 100): string {
		if (!text) return '';
		if (text.length <= maxLength) return text;
		return text.substring(0, maxLength) + '...';
	}
</script>

<div class="space-y-6">
	<!-- Header Section -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold text-white">
				{$t('bids.my_submitted_bids')}
			</h2>
			<p class="text-gray-400 mt-1">
				{$t('bids.manage_description')}
			</p>
		</div>
		<button 
			onclick={loadMyBids}
			class="inline-flex items-center px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors duration-200 border border-gray-600 hover:bg-gray-700"
		>
			<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
			{$t('bids.refresh')}
		</button>
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="flex justify-center py-12">
			<div class="text-center">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
				<p class="text-gray-400">{$t('bids.loading_bids')}</p>
			</div>
		</div>

		
	{:else if error}
		<!-- Error State -->
		<div class="text-center py-12">
			<div class="card bg-base-100 shadow-md rounded-lg p-6 max-w-md mx-auto">
				<svg class="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<h3 class="text-lg font-medium text-white mb-2">{$t('bids.error_loading_bids')}</h3>
				<p class="text-gray-400 mb-4">{error}</p>
				<button 
					onclick={loadMyBids}
					class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors border border-gray-600"
				>
					{$t('bids.retry')}
				</button>
			</div>
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
				<a href="/dashboard/find-tasks" class="inline-flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors border border-gray-600">
					<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
					{$t('bids.empty.find_tasks')}
				</a>
			</div>
		</div>
	{:else}
		<!-- Bids List -->
		<div class="space-y-4">
			{#each myBids as bid, index}
				<div class="card bg-base-100 shadow-md rounded-lg overflow-hidden">
					<div class="card-body">
						<!-- Bid Header -->
						<div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
							<h3 class="card-title line-clamp-2">
								{bid.bid.taskTitle || $t('bids.unknown_task')}
							</h3>
							<div class="flex items-center justify-between gap-4 text-sm">
								<div class="flex flex-col items-center md:min-w-[140px]">
									<div class="flex items-center gap-2">
										<span class="font-semibold text-base">
											{formatAmount(bid.bid.amount || 0, bid.bid.currency || 'SATS')}
										</span>
									</div>
									<span class="text-info text-xs">
										≈ {calculateUsdtEstimate(bid.bid.amount || 0, btcPrice)} USDT
									</span>
								</div>
								<!-- <span class="badge badge-outline">
									{getStatusText('pending')}
								</span> -->
							</div>
						</div>

						<!-- Description -->
						{#if bid.bid.description}
							<p class="text-base-content/80 my-2 line-clamp-2">
								{truncateText(bid.bid.description, 150)}
							</p>
						{/if}

						<!-- Payment Type and Duration -->
						<div class="mt-2 mb-4">
							<div class="flex flex-wrap gap-4">
								<div>
									<p class="text-base-content/60 text-sm">{$t('bids.type')}</p>
									<p class="font-medium">
										<span class="badge badge-primary badge-outline">
											{bid.bid.paymentType || 'FIXED'}
										</span>
									</p>
								</div>
								{#if bid.bid.paymentType === 'HOURLY' && bid.bid.hourlyRate}
									<div>
										<p class="text-base-content/60 text-sm">{$t('bids.hourly_rate')}</p>
										<p class="font-medium">
											{bid.bid.hourlyRate} {$t('bids.sats')}/{$t('bids.per_hour')}
										</p>
									</div>
								{/if}
								<div>
									<p class="text-base-content/60 text-sm">{$t('bids.duration')}</p>
									<p class="font-medium">
										{formatDuration(bid.bid.estimatedDuration)}
									</p>
								</div>
							</div>
						</div>

						<!-- Proposed Approach -->
						{#if bid.bid.proposedApproach}
							<div class="mb-4">
								<h4 class="text-sm font-medium text-base-content/70 mb-2">
									{$t('bids.approach')}:
								</h4>
								<p class="text-base-content/80 text-sm leading-relaxed">
									{truncateText(bid.bid.proposedApproach, 150)}
								</p>
							</div>
						{/if}

						<!-- Cover Letter -->
						{#if bid.bid.coverLetter}
							<div class="mb-4">
								<h4 class="text-sm font-medium text-base-content/70 mb-2">
									{$t('bids.cover_letter')}:
								</h4>
								<p class="text-base-content/80 text-sm leading-relaxed">
									{truncateText(bid.bid.coverLetter, 150)}
								</p>
							</div>
						{/if}

						<!-- Footer -->
						<div class="card-actions mt-4 flex items-center justify-between">
							<div class="text-xs text-base-content/60">
								{$t('bids.submitted')}: {new Date(bid.bid.timestamp).toLocaleDateString()}
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
