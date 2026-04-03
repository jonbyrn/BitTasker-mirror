<script lang="ts">
	import type { NostrBidContent } from '$lib/types/bid';
	import type { NDKBid } from '$lib/nostr/events/bid';
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	// import { getProfileUrl } from '$lib/utils/helpers/profile';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';
	import { formatStandardDateTime, parseDateWithLocalTime } from '$lib/utils/helpers/dateFormatter';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';

	let {
		bid,
		acceptedBidId = null,
		onAcceptBid,
		onRejectBid,
		onOpenMessage
	}: {
		bid: NDKBid;
		acceptedBidId?: string | null;
		onAcceptBid: (bid: NDKBid) => void;
		onRejectBid: (bid: NDKBid) => void;
		onOpenMessage: (bidderId: string, bidderName: string) => void;
	} = $props();

	let detailsExpanded = $state(false);

	const bidContent = $derived(bid.bidContent);

	let profileUrl = $derived(`/npub/${bid.author.npub}`);

	function toggleDetails() {
		detailsExpanded = !detailsExpanded;
	}

	function getTranslatedBidContent(
		content: NostrBidContent,
		field: 'description' | 'proposedApproach' | 'coverLetter'
	): string {
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
</script>

<div
	class="bg-base-100 border-base-200 rounded-2xl border shadow-sm transition-all duration-200 hover:shadow-md"
>
	<div class="p-4 md:p-6">
		<div class="mb-4 flex w-full items-center justify-between gap-4">
			<div class="flex min-w-0 flex-1 items-center gap-4">
				<UserInfoDisplay
					avatar={bidContent.bidderAvatar}
					username={bidContent.bidderName ?? ''}
					rating={bidContent.bidderRating ?? 0}
					size="md"
					pubkey={bidContent.bidderId}
					profileLink={bidContent.bidderId}
					memberSince={bidContent.timestamp}
				/>
			</div>

			<div class="flex shrink-0 flex-col items-end gap-2">
				{#if acceptedBidId === bid.id || bidContent.status === 'ACCEPTED'}
					<div class="badge badge-success badge-sm text-primary-content">
						{$t('dashboard.bids.bid_acceptance.accepted')}
					</div>
				{/if}
				{#if bidContent.bidderId}
					<button
						class="btn btn-ghost btn-xs text-primary hover:bg-primary/10 cursor-pointer"
						onclick={seeProfile}
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
						<span class="">{$t('dashboard.bids.bid_acceptance.see_profile')}</span>
					</button>
				{/if}

				{#if bidContent.bidderId}
					<ActionsMenu
						contentType="bid"
						reportedPubkey={bidContent.bidderId}
						reportedEventId={bid.id}
					/>
				{/if}
			</div>
		</div>
	</div>

	<div class="mb-4 flex flex-col gap-4">
		<div class="min-w-0 flex-1">
			<p class="text-base-content/80 wrap-break-words line-clamp-2">
				{getTranslatedBidContent(bidContent, 'description')}
			</p>
		</div>

		<div class="flex flex-row items-center justify-between gap-2">
			{#if bidContent.paymentType === 'FIXED' && bidContent.startDateTime && bidContent.endDateTime}
				<div class="flex max-w-[60%] items-start gap-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/60 mt-0.5 h-4 w-4 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<div class="flex min-w-0 flex-1 flex-col">
						<small class="text-base-content/60 text-xs">
							{$t('bids.estimated_date')}
						</small>
						<span class="text-sm font-medium">
							{(() => {
								const startDate = parseDateWithLocalTime(bidContent.startDateTime);
								const endDate = parseDateWithLocalTime(bidContent.endDateTime);
								return startDate && endDate
									? `${formatStandardDateTime(startDate, $locale || 'en')} - ${formatStandardDateTime(endDate, $locale || 'en')}`
									: 'N/A';
							})()}
						</span>
						<span class="text-base-content/60 text-xs">
							({bidContent.estimatedDuration})
						</span>
					</div>
				</div>
			{/if}
			<div class="shrink-0 text-right">
				<div class="text-xl font-bold sm:text-2xl">
					{formatConvertedAmount(bidContent.amount, 'USD')}
				</div>
				<div class="sm:text-md text-base-content/60 text-sm font-bold">
					{formatConvertedAmount(bidContent.amount, 'USD', {
						btcPrice: btcPrice.price,
						toCurrency: 'SATS'
					})}
				</div>
			</div>
		</div>
	</div>

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
					{@render expandedDetails()}
				</div>
			{/if}
		</div>

		<div class="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
			<button
				class="btn btn-error btn-outline btn-sm flex-1 py-1 sm:flex-none"
				onclick={() => onRejectBid(bid)}
				disabled={false}
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
				{#if bidContent.status === 'REJECTED'}
					{$t('dashboard.bids.bid_acceptance.rejected')}
				{:else}
					{$t('dashboard.bids.bid_acceptance.decline')}
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
					{$t('common.profile.send_message')}
				</button>
			{/if}

			{#if bid.id === acceptedBidId}
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
					class="btn btn-success btn-sm flex-1 py-1 sm:flex-none"
					onclick={() => onAcceptBid(bid)}
					disabled={false}
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
		</div>
	</div>

	{#if detailsExpanded}
		<div
			class="border-base-200 mt-4 hidden space-y-4 border-t pt-4 sm:mt-6 sm:block sm:space-y-6 sm:pt-6"
			aria-label={$t('dashboard.bids.bid_acceptance.show_details')}
		>
			{@render expandedDetails()}
		</div>
	{/if}
</div>
