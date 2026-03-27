<script lang="ts">
	import { onMount } from 'svelte';
	import { getReviewsForUser } from '$lib/utils/nostr-review';
	import { calculateReviewStats } from '$lib/utils/review-aggregation';
	import type { NostrVerifiedReview } from '$lib/types/review';
	import { nip19 } from 'nostr-tools';

	let {
		userPubkey,
		size = 'sm' as 'xs' | 'sm' | 'md' | 'lg',
		showCount = true,
		showStars = true
	} = $props<{
		userPubkey: string;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		showCount?: boolean;
		showStars?: boolean;
	}>();

	let averageRating = $state(0);
	let reviewCount = $state(0);
	let isLoading = $state(true);

	// Convert pubkey to npub format if needed
	function normalizePubkey(pubkey: string): string {
		if (!pubkey) return '';

		// If already npub, return as is
		if (pubkey.startsWith('npub')) {
			return pubkey;
		}

		// Try to convert hex to npub
		try {
			return nip19.npubEncode(pubkey);
		} catch {
			// If conversion fails, return as is (might be invalid)
			return pubkey;
		}
	}

	const sizeClasses = {
		xs: { star: 'h-2 w-2', text: 'text-xs' },
		sm: { star: 'h-3 w-3', text: 'text-xs' },
		md: { star: 'h-4 w-4', text: 'text-sm' },
		lg: { star: 'h-5 w-5', text: 'text-base' }
	} as const;
	const currentSizeClasses = $derived(sizeClasses[size as keyof typeof sizeClasses]);

	onMount(async () => {
		await loadUserRating();
	});

	async function loadUserRating() {
		if (!userPubkey) {
			averageRating = 0;
			reviewCount = 0;
			isLoading = false;
			return;
		}

		try {
			isLoading = true;
			const normalizedPubkey = normalizePubkey(userPubkey);
			const reviews: NostrVerifiedReview[] = await getReviewsForUser(normalizedPubkey, 100);

			if (reviews.length > 0) {
				const stats = calculateReviewStats(reviews);
				averageRating = Math.round(stats.averageRating * 10) / 10; // Round to 1 decimal
				reviewCount = stats.totalReviews;
			} else {
				averageRating = 0;
				reviewCount = 0;
			}
		} catch (error) {
			console.error('Failed to load user rating:', error);
			averageRating = 0;
			reviewCount = 0;
		} finally {
			isLoading = false;
		}
	}

	// Round rating for star display (0-5)
	const roundedRating = $derived(Math.round(averageRating));
</script>

{#if isLoading}
	<div class="flex items-center gap-1">
		<span class="loading loading-spinner loading-xs"></span>
	</div>
{:else if showStars}
	<div class="flex items-center gap-1">
		{#if showStars}
			{#each [0, 1, 2, 3, 4] as i (i)}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="{currentSizeClasses.star} {i < roundedRating
						? 'text-warning fill-warning'
						: 'text-base-content/30'}"
					fill="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
					/>
				</svg>
			{/each}
		{/if}
		{#if showCount}
			<span class="text-base-content/60 ml-1 {currentSizeClasses.text}">
				{reviewCount > 0 ? averageRating.toFixed(1) : '0'}
				{#if reviewCount > 0}
					<span class="text-base-content/40">({reviewCount})</span>
				{/if}
			</span>
		{:else}
			<span class="text-base-content/60 ml-1 {currentSizeClasses.text}">
				{reviewCount > 0 ? averageRating.toFixed(1) : '0'}
			</span>
		{/if}
	</div>
{:else}
	<!-- Just show number if stars disabled -->
	<span class="text-base-content/60 {currentSizeClasses.text}">
		{reviewCount > 0 ? averageRating.toFixed(1) : '0'}
		{#if showCount && reviewCount > 0}
			<span class="text-base-content/40">({reviewCount})</span>
		{/if}
	</span>
{/if}
