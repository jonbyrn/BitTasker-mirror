<script lang="ts">
	import { getReviewsForUser } from '$lib/utils/review-source';
	import { calculateReviewStats } from '$lib/utils/review-aggregation';
	import type { NostrVerifiedReview } from '$lib/types/review';
	import StarRating from '$lib/components/reviews/StarRating.svelte';
	// @ts-expect-error - nostr-tools type definitions issue
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

	const textClasses: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
		xs: 'text-xs',
		sm: 'text-xs',
		md: 'text-sm',
		lg: 'text-base'
	};

	const sizeKey = $derived((size ?? 'sm') as keyof typeof textClasses);

	// React to userPubkey changes (e.g. different profile); cleanup avoids set-state after unmount
	$effect(() => {
		void userPubkey;
		let cancelled = false;
		(async () => {
			await loadUserRating(() => cancelled);
		})();
		return () => {
			cancelled = true;
		};
	});

	async function loadUserRating(isCancelled?: () => boolean) {
		if (!userPubkey) {
			if (!isCancelled?.()) {
				averageRating = 0;
				reviewCount = 0;
				isLoading = false;
			}
			return;
		}

		try {
			if (!isCancelled?.()) isLoading = true;
			const normalizedPubkey = normalizePubkey(userPubkey);
			const reviews: NostrVerifiedReview[] = await getReviewsForUser(normalizedPubkey, 100);
			if (isCancelled?.()) return;

			if (reviews.length > 0) {
				const stats = calculateReviewStats(reviews);
				averageRating = Math.round(stats.averageRating * 10) / 10; // Round to 1 decimal
				reviewCount = stats.totalReviews;
			} else {
				averageRating = 0;
				reviewCount = 0;
			}
		} catch (error) {
			if (!isCancelled?.()) {
				console.error('Failed to load user rating:', error);
				averageRating = 0;
				reviewCount = 0;
			}
		} finally {
			if (!isCancelled?.()) isLoading = false;
		}
	}
</script>

{#if isLoading}
	<div class="flex items-center gap-1">
		<span class="loading loading-spinner loading-xs"></span>
	</div>
{:else if showStars}
	<div class="flex items-center gap-1">
		<StarRating value={averageRating} size={sizeKey} />
		{#if showCount}
			<span class="text-primary ml-1 {textClasses[sizeKey]}">
				{reviewCount > 0 ? averageRating.toFixed(1) : '0'}
				{#if reviewCount > 0}
					<span class="text-base-content/40">({reviewCount})</span>
				{/if}
			</span>
		{:else}
			<span class="text-primary ml-1 {textClasses[sizeKey]}">
				{reviewCount > 0 ? averageRating.toFixed(1) : '0'}
			</span>
		{/if}
	</div>
{:else}
	<!-- Just show number if stars disabled -->
	<span class="text-primary {textClasses[sizeKey]}">
		{reviewCount > 0 ? averageRating.toFixed(1) : '0'}
		{#if showCount && reviewCount > 0}
			<span class="text-base-content/40">({reviewCount})</span>
		{/if}
	</span>
{/if}
