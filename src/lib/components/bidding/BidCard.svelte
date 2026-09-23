<script lang="ts">
	import type { NostrBidContent } from '$lib/types/bid';
	import type { NDKBid } from '$lib/nostr/events/bid';
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	// import { getProfileUrl } from '$lib/utils/helpers/profile';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';

	let {
		bid,
		acceptedBidId = null,
		onAcceptBid,
		onRejectBid,
		onOpenMessage,
		isRejecting = false,
		isRejected = false
	}: {
		bid: NDKBid;
		acceptedBidId?: string | null;
		onAcceptBid: (bid: NDKBid) => void;
		onRejectBid: (bid: NDKBid) => void;
		onOpenMessage: (bidderId: string, bidderName: string) => void;
		isRejecting?: boolean;
		isRejected?: boolean;
	} = $props();

	let detailsExpanded = $state(false);

	const bidContent = $derived(bid.bidContent);
	const bidAmountCurrency = $derived(
		bidContent?.currency?.toUpperCase() === 'USD' ? 'USD' : 'SATS'
	);

	let profileUrl = $derived(bid.author.npub ? `/npub/${bid.author.npub}` : '#');

	function toggleDetails() {
		detailsExpanded = !detailsExpanded;
	}

	function getTranslatedBidContent(
		content: NostrBidContent | null | undefined,
		field: 'description' | 'proposedApproach' | 'coverLetter'
	): string {
		if (!content) return '';
		const currentLang = $locale || 'en';
		const originalText = content[field] || '';

		if (!content.translations) {
			return originalText;
		}

		if (content.translations.sourceLanguage === currentLang) {
			return originalText;
		}

		const translation = content.translations.translations[currentLang];
		if (translation) {
			return translation[field] || originalText;
		}

		return originalText;
	}

	function seeProfile() {
		goto(profileUrl);
	}

	function openContract(): void {
		const taskId = bidContent?.taskId;
		if (!taskId) return;
		goto(`/hiring/contracts/contract-${taskId}-${bid.id}`).catch((error: unknown) => {
			console.error('Failed to open contract', error);
		});
	}
</script>

<div
	class="card bg-base-100 border-base-300 border shadow-sm"
	data-testid="bid-card"
	data-bid-id={bid.id}
>
	{#if !bidContent}
		<div class="alert alert-outline alert-error">
			<span
				>{$t('dashboard.bids.errors.failed_to_load_content') || 'Failed to load bid content.'}</span
			>
		</div>
	{:else}
		<div class="card-body gap-3 p-5">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">Taskee</p>
					<h2 class="text-base font-semibold">
						{bidContent.taskTitle || bidContent.bidderName || $t('bids.unknown_task')}
					</h2>
					{#if bidContent.bidderName}
						<button type="button" class="link link-primary text-sm" onclick={seeProfile}>
							{bidContent.bidderName}
						</button>
					{/if}
				</div>
				{#if acceptedBidId === bid.id || bidContent.status === 'ACCEPTED'}
					<span class="badge badge-success badge-lg"
						>{$t('dashboard.bids.bid_acceptance.accepted')}</span
					>
				{:else if isRejected || bidContent.status === 'REJECTED'}
					<span class="badge badge-error badge-lg"
						>{$t('dashboard.bids.bid_acceptance.rejected')}</span
					>
				{:else}
					<span class="badge badge-warning badge-lg">{$t('bids.pending')}</span>
				{/if}
			</div>

			<p class="text-lg font-semibold">
				{formatConvertedAmount(bidContent.amount, bidAmountCurrency)}
			</p>
			<p class="text-base-content/60 text-sm">
				{formatConvertedAmount(bidContent.amount, bidAmountCurrency, {
					btcPrice: btcPrice.price,
					toCurrency: bidAmountCurrency === 'SATS' ? 'USD' : 'SATS'
				})}
			</p>
			<p class="text-base-content/80 line-clamp-2 text-sm">
				{getTranslatedBidContent(bidContent, 'description')}
			</p>

			{#snippet expandedDetails()}
				{#if bidContent.description}
					<div>
						<p class="text-base-content/60 wrap-break-words mb-2 text-xs font-medium">
							{$t('bids.your_description')}
						</p>
						<div class="bg-base-200 rounded-lg p-3">
							<p class="text-base-content/80 text-sm leading-relaxed">
								{getTranslatedBidContent(bidContent, 'description')}
							</p>
						</div>
					</div>
				{/if}
				{#if bidContent.proposedApproach && bidContent.proposedApproach.trim() !== ''}
					<div>
						<p class="text-base-content/60 wrap-break-words mb-2 text-xs font-medium">
							{$t('bids.your_approach')}
						</p>
						<div class="bg-base-200 rounded-lg p-3">
							<p class="text-base-content/80 text-sm leading-relaxed">
								{getTranslatedBidContent(bidContent, 'proposedApproach')}
							</p>
						</div>
					</div>
				{/if}
				{#if bidContent.coverLetter}
					<div>
						<p class="text-base-content/60 wrap-break-words mb-2 text-xs font-medium">
							{$t('bids.your_cover_letter')}
						</p>
						<div class="bg-base-200 rounded-lg p-3">
							<p class="text-base-content/80 text-sm leading-relaxed">
								{getTranslatedBidContent(bidContent, 'coverLetter')}
							</p>
						</div>
					</div>
				{/if}
			{/snippet}

			<div
				class="border-base-200 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
			>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
					<button class="btn btn-ghost btn-sm w-full sm:w-auto" onclick={toggleDetails}>
						{detailsExpanded
							? $t('dashboard.bids.bid_acceptance.hide_details')
							: $t('dashboard.bids.bid_acceptance.show_details')}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="ml-1 h-4 w-4 transition-transform duration-200 {detailsExpanded
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
					{#if detailsExpanded}
						<div
							class="border-base-200 space-y-4 border-t pt-4 sm:hidden"
							aria-label={$t('dashboard.bids.bid_acceptance.show_details')}
						>
							{@render expandedDetails?.()}
						</div>
					{/if}
				</div>

				<div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-row">
					<button
						class="btn btn-error btn-outline btn-sm flex-1 py-1 sm:flex-none"
						onclick={() => onRejectBid(bid)}
						disabled={isRejecting ||
							isRejected ||
							bidContent.status === 'REJECTED' ||
							bidContent.status === 'ACCEPTED' ||
							acceptedBidId === bid.id}
					>
						{#if isRejecting}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
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
						{/if}
						{#if isRejected || bidContent.status === 'REJECTED'}
							<span class="hidden sm:inline">{$t('dashboard.bids.bid_acceptance.rejected')}</span>
							<span class="sm:hidden">{$t('dashboard.bids.bid_acceptance.rejected')}</span>
						{:else}
							<span class="hidden sm:inline">{$t('dashboard.bids.bid_acceptance.decline')}</span>
							<span class="sm:hidden"
								>{$t('dashboard.bids.bid_acceptance.decline_short') || 'Decline'}</span
							>
						{/if}
					</button>

					{#if bidContent.bidderId}
						<button
							class="btn btn-primary btn-outline btn-sm flex-1 py-1 sm:flex-none"
							onclick={() => onOpenMessage(bidContent.bidderId || '', bidContent.bidderName ?? '')}
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
									d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
								/>
							</svg>
							<span class="hidden sm:inline">{$t('common.profile.send_message')}</span>
							<span class="sm:hidden">{$t('dashboard.bids.send_message_short') || 'Message'}</span>
						</button>
					{/if}

					{#if bid.id === acceptedBidId || bidContent.status === 'ACCEPTED'}
						<button
							type="button"
							class="btn btn-primary btn-sm flex-1 py-1 sm:flex-none"
							onclick={openContract}
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
							<span>{$t('bids.view_task')}</span>
						</button>
					{:else}
						<button
							class="btn btn-success btn-sm flex-1 py-1 sm:flex-none"
							data-testid="accept-bid-btn"
							onclick={() => onAcceptBid(bid)}
							disabled={isRejected || bidContent.status === 'REJECTED'}
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
							<span class="hidden sm:inline">{$t('dashboard.bids.bid_acceptance.accept')}</span>
							<span class="sm:hidden"
								>{$t('dashboard.bids.bid_acceptance.accept_short') || 'Accept'}</span
							>
						</button>
					{/if}
				</div>
			</div>

			{#if detailsExpanded}
				<div
					class="border-base-200 mt-4 hidden space-y-4 border-t pt-4 sm:mt-6 sm:block sm:space-y-6 sm:pt-6"
					aria-label={$t('dashboard.bids.bid_acceptance.show_details')}
				>
					{@render expandedDetails?.()}
				</div>
			{/if}
		</div>
	{/if}
</div>
