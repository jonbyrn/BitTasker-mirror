<script lang="ts">
	import type { SimplifiedTaskBid, TaskBid } from '$lib/types/bid';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { cachedSatsFromUsd } from '$lib/utils/nostr-bid';
	import TranslatableBidContent from '$lib/components/bidding/TranslatableBidContent.svelte';
	import type { CounterOffer } from '$lib/types/bid';

	let {
		bid,
		btcPrice = 0,
		expandedBidId = null,
		onAcceptBid,
		onRejectBid,
		onCounterOffer,
		onToggleDetails
	} = $props<{
		bid: TaskBid | SimplifiedTaskBid;
		btcPrice?: number;
		expandedBidId?: string | null;
		onAcceptBid?: (bid: TaskBid | SimplifiedTaskBid) => void;
		onRejectBid?: (bid: TaskBid | SimplifiedTaskBid) => void;
		onCounterOffer?: (bid: TaskBid | SimplifiedTaskBid) => void;
		onToggleDetails?: (bidId: string) => void;
	}>();

	// Cache for formatted dates to avoid re-computation
	const dateFormatterCache = $state<Map<string, string>>(new Map());

	// Optimized date formatting with caching
	function getCachedFormattedDate(date: Date): string {
		const key = date.getTime().toString();
		if (dateFormatterCache.has(key)) {
			return dateFormatterCache.get(key)!;
		}

		const formatted = new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			year: 'numeric'
		});

		dateFormatterCache.set(key, formatted);
		return formatted;
	}

	// Internal state for expansion if no callback is provided
	let internalExpandedBidId = $state<string | null>(null);

	function toggleBidDetails(bidId: string) {
		if (onToggleDetails) {
			onToggleDetails(bidId);
		} else {
			internalExpandedBidId = internalExpandedBidId === bidId ? null : bidId;
		}
	}

	// Use prop if callback is provided, otherwise use internal state
	const currentExpandedBidId = $derived(onToggleDetails ? expandedBidId : internalExpandedBidId);
	const isExpanded = $derived(currentExpandedBidId === bid.id);

	// Get user profile data - handle both TaskBid and SimplifiedTaskBid formats
	const userProfile = $derived(() => {
		if ('userProfile' in bid && bid.userProfile) {
			return bid.userProfile;
		}
		// Fallback for TaskBid format
		return {
			user: {
				id: bid.bidderId || 'unknown',
				name: bid.bidderName || 'Anonymous',
				avatar: bid.bidderAvatar || '',
				rating: 0
			}
		};
	});

	// Get status - handle both formats
	const bidStatus = $derived(() => {
		if (typeof bid.status === 'string') {
			return bid.status.toUpperCase() as 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'COUNTERED';
		}
		return 'PENDING';
	});
</script>

<div
	class="bg-base-100 border-base-200 rounded-2xl border shadow-sm transition-all duration-200 hover:shadow-md"
>
	<div class="p-4 md:p-6">
		<!-- Top row: User info and status (full width) -->
		<div class="mb-4 flex w-full items-center justify-between gap-4">
			<!-- Left side: Avatar + Username on same row, then member since and rating below -->
			<div class="flex min-w-0 flex-1 items-center gap-4">
				<!-- Avatar -->
				<div class="avatar shrink-0">
					<div
						class="bg-base-300 flex h-12 w-12 items-center justify-center rounded-full sm:h-14 sm:w-14"
					>
						{#if userProfile().user?.avatar}
							<img
								src={userProfile().user.avatar}
								alt={$t('task.drawer.avatar_alt')}
								class="h-12 w-12 rounded-full object-cover sm:h-14 sm:w-14"
							/>
						{:else}
							<div
								class="avatar placeholder text-neutral-content bg-primary flex h-12 w-12 items-center justify-center rounded-full sm:h-14 sm:w-14"
							>
								<span class="text-lg font-semibold sm:text-2xl">
									{(userProfile().user?.name || 'A').charAt(0).toUpperCase()}
								</span>
							</div>
						{/if}
					</div>
				</div>
				<!-- User info column -->
				<div class="flex min-w-0 flex-1 flex-col items-start">
					<!-- Display name with See Profile (desktop) -->
					<div class="flex w-full items-center gap-2">
						<p class="truncate text-base font-semibold sm:text-lg">
							{userProfile().user?.name || $t('task.drawer.anonymous')}
						</p>
						<!-- See Profile link - Desktop only -->
						<button
							class="btn btn-ghost btn-xs hidden text-primary hover:bg-primary/10 sm:flex"
							onclick={() =>
								goto(
									`/dashboard/taskees/profile/${userProfile().user?.id || 'unknown'}`
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
							<span>{$t('dashboard.bids.bid_acceptance.see_profile')}</span>
						</button>
					</div>
					<!-- Member since -->
					<span class="text-base-content/60 text-xs sm:text-sm">
						{$t('dashboard.task_details_by_task.member_since')}
						{getCachedFormattedDate(new Date(bid.createdAt))}
					</span>
					<!-- Rating -->
					<div class="flex items-center gap-1">
						{#each Array(5) as _, i}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-3 w-3 sm:h-4 sm:w-4 {i < (userProfile().user?.rating || 0)
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
						<span class="text-base-content/60 ml-1 text-xs sm:text-sm"
							>{userProfile().user?.rating || 0}</span
						>
					</div>
				</div>
			</div>

			<!-- Right side: See Profile (mobile) and Status badge (right-aligned) -->
			<div class="flex shrink-0 flex-col items-end gap-2">
				<!-- See Profile link - Mobile only (above status) -->
				<button
					class="btn btn-ghost btn-xs text-primary hover:bg-primary/10 sm:hidden"
					onclick={() =>
						goto(
							`/dashboard/taskees/profile/${userProfile().user?.id || 'unknown'}`
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
					<span>{$t('dashboard.bids.bid_acceptance.see_profile')}</span>
				</button>
				<!-- Bid Status Badge -->
				{#if bidStatus() === 'ACCEPTED'}
					<div class="badge badge-success badge-sm text-primary-content">
						{$t('dashboard.bids.bid_acceptance.accepted')}
					</div>
				{:else if bidStatus() === 'REJECTED'}
					<div class="badge badge-error badge-sm text-primary-content">
						{$t('dashboard.bids.bid_acceptance.rejected')}
					</div>
				{:else if bidStatus() === 'PENDING'}
					<div class="badge badge-warning badge-sm text-primary-content">
						{$t('dashboard.bids.bid_acceptance.pending')}
					</div>
				{/if}
			</div>
		</div>

		<!-- Second row: Description and payment info -->
		<div class="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-end">
			<!-- Description column -->
			<div class="flex-1 min-w-0">
				<TranslatableBidContent 
					bid={bid as any}
					content={bid.description || ''} 
					contentType="description"
					fallbackClass="text-base-content/80 wrap-break-words line-clamp-2"
				/>
			</div>
			<!-- Payment info column - 2 columns on mobile, right-aligned on desktop -->
			<div class="grid shrink-0 grid-cols-2 gap-2 text-left sm:grid-cols-1 sm:text-right lg:text-right">
				<!-- Mobile: Amount and Sats in 2 columns -->
				<div class="sm:hidden">
					<div class="text-base-content/60 text-xs">{$t('dashboard.bids.bid_acceptance.base_amount')}</div>
					<div class="text-lg font-bold">
						${formatNumberWithTwoDecimals(bid.amount)}
					</div>
					<div class="text-base-content/60 text-xs font-bold">
						{cachedSatsFromUsd(bid.amount, btcPrice)} Sats
					</div>
				</div>
				<div class="sm:hidden">
					<div class="text-base-content/60 text-xs">{$t('bids.type')} / {$t('bids.duration')}</div>
					<div class="text-base-content/50 text-xs">
						{bid.paymentType}
					</div>
					<div class="text-base-content/50 text-xs">
						{bid.estimatedDuration || ''}
					</div>
				</div>
				<!-- Desktop: All info in one column, right-aligned -->
				<div class="hidden sm:block">
					<div class="text-xl font-bold sm:text-2xl">
						${formatNumberWithTwoDecimals(bid.amount)}
					</div>
					<div class="sm:text-md text-base-content/60 text-sm font-bold">
						{cachedSatsFromUsd(bid.amount, btcPrice)} Sats
					</div>
					<div class="text-base-content/50 mt-1 text-xs">
						{bid.paymentType} {bid.estimatedDuration ? `• ${bid.estimatedDuration}` : ''}
					</div>
				</div>
			</div>
		</div>

		<!-- Action buttons - always visible -->
		<div
			class="border-base-200 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<button
				class="btn btn-ghost btn-sm w-full sm:w-auto"
				onclick={() => toggleBidDetails(bid.id)}
			>
				{isExpanded
					? $t('dashboard.bids.bid_acceptance.hide_details')
					: $t('dashboard.bids.bid_acceptance.show_details')}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="ml-1 h-4 w-4 transition-transform duration-200 {isExpanded
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

			<div class="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
				<!-- Reject Button -->
				{#if onRejectBid}
					<button
						class="btn btn-error btn-outline btn-sm flex-1 py-1 sm:flex-none"
						onclick={() => onRejectBid(bid)}
						disabled={bidStatus() === 'ACCEPTED' || bidStatus() === 'REJECTED'}
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
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
						{#if bidStatus() === 'REJECTED'}
							{$t('dashboard.bids.bid_acceptance.rejected')}
						{:else}
							{$t('dashboard.bids.bid_acceptance.decline')}
						{/if}
					</button>
				{/if}

				<!-- Accept Button -->
				{#if onAcceptBid}
					{#if bidStatus() === 'ACCEPTED'}
						<button class="btn btn-success btn-sm flex-1 py-1 sm:flex-none" disabled={true}>
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
									d="M5 13l4 4L19 7"
								/>
							</svg>
							{$t('dashboard.bids.bid_acceptance.accepted')}
						</button>
					{:else}
						<button
							class="btn btn-primary btn-sm flex-1 py-1 sm:flex-none"
							onclick={() => onAcceptBid(bid)}
							disabled={bidStatus() === 'REJECTED'}
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
									d="M5 13l4 4L19 7"
								/>
							</svg>
							{$t('dashboard.bids.bid_acceptance.accept')}
						</button>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Expanded details -->
		{#if isExpanded}
			<div
				class="border-base-200 mt-4 space-y-4 border-t pt-4 sm:mt-6 sm:space-y-6 sm:pt-6"
			>
				<!-- Description -->
				{#if bid.description}
					<div>
						<p class="text-base-content/60 mb-2 text-xs font-medium wrap-break-words">
							{$t('bids.your_description')}
						</p>
						<div class="bg-base-200 rounded-lg p-3">
							<TranslatableBidContent 
								bid={bid as any}
								content={bid.description} 
								contentType="description"
							/>
						</div>
					</div>
				{/if}

				<!-- Approach -->
				{#if bid.proposedApproach}
					<div>
						<p class="text-base-content/60 mb-2 text-xs font-medium wrap-break-words">
							{$t('bids.your_approach')}
						</p>
						<div class="bg-base-200 rounded-lg p-3">
							<TranslatableBidContent 
								bid={bid as any}
								content={bid.proposedApproach} 
								contentType="proposedApproach"
							/>
						</div>
					</div>
				{/if}

				<!-- Cover Letter -->
				{#if bid.coverLetter}
					<div>
						<p class="text-base-content/60 mb-2 text-xs font-medium wrap-break-words">
							{$t('bids.your_cover_letter')}
						</p>
						<div class="bg-base-200 rounded-lg p-3">
							<TranslatableBidContent 
								bid={bid as any}
								content={bid.coverLetter} 
								contentType="coverLetter"
							/>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

