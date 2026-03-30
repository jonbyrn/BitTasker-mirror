<script lang="ts">
	import { getReviewsForUser } from '$lib/utils/nostr-review';
	import { calculateReviewStats } from '$lib/utils/review-aggregation';
	import type { NostrVerifiedReview } from '$lib/types/review';
	import { nip19 } from 'nostr-tools';

	type UserRatingSummary = {
		averageRating: number;
		reviewCount: number;
		fetchedAt: number;
	};

	type UserRatingCacheState = {
		cache: Map<string, UserRatingSummary>;
		requests: Map<string, Promise<UserRatingSummary>>;
	};

	const ALL_REVIEWS_LIMIT = Number.MAX_SAFE_INTEGER;
	const USER_RATING_CACHE_TTL_MS = 5 * 60 * 1000;
	const userRatingState = (() => {
		const globalScope = globalThis as typeof globalThis & {
			__bitTaskerUserRatingState?: UserRatingCacheState;
		};

		globalScope.__bitTaskerUserRatingState ??= {
			cache: new Map<string, UserRatingSummary>(),
			requests: new Map<string, Promise<UserRatingSummary>>()
		};

		return globalScope.__bitTaskerUserRatingState;
	})();
	const userRatingCache = userRatingState.cache;
	const userRatingRequests = userRatingState.requests;

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
	let activeRequestId = 0;

	function getCachedUserRating(pubkey: string): UserRatingSummary | null {
		const cachedRating = userRatingCache.get(pubkey);
		if (!cachedRating) {
			return null;
		}

		if (Date.now() - cachedRating.fetchedAt > USER_RATING_CACHE_TTL_MS) {
			userRatingCache.delete(pubkey);
			return null;
		}

		return cachedRating;
	}

	async function fetchUserRatingSummary(pubkey: string): Promise<UserRatingSummary> {
		const cachedRating = getCachedUserRating(pubkey);
		if (cachedRating) {
			return cachedRating;
		}

		const existingRequest = userRatingRequests.get(pubkey);
		if (existingRequest) {
			return existingRequest;
		}

		const request = (async () => {
			const reviews: NostrVerifiedReview[] = await getReviewsForUser(pubkey, ALL_REVIEWS_LIMIT);
			const stats = reviews.length > 0 ? calculateReviewStats(reviews) : null;
			const nextSummary = stats
				? {
						averageRating: Math.round(stats.averageRating * 10) / 10,
						reviewCount: stats.totalReviews,
						fetchedAt: Date.now()
					}
				: {
						averageRating: 0,
						reviewCount: 0,
						fetchedAt: Date.now()
					};

			userRatingCache.set(pubkey, nextSummary);
			return nextSummary;
		})().finally(() => {
			userRatingRequests.delete(pubkey);
		});

		userRatingRequests.set(pubkey, request);
		return request;
	}

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

	async function loadUserRating(pubkey: string) {
		const requestId = ++activeRequestId;

		if (!pubkey) {
			averageRating = 0;
			reviewCount = 0;
			isLoading = false;
			return;
		}

		try {
			isLoading = true;
			const normalizedPubkey = normalizePubkey(pubkey);
			const ratingSummary = await fetchUserRatingSummary(normalizedPubkey);

			if (requestId !== activeRequestId) {
				return;
			}

			averageRating = ratingSummary.averageRating;
			reviewCount = ratingSummary.reviewCount;
		} catch (error) {
			console.error('Failed to load user rating:', error);
			if (requestId === activeRequestId) {
				averageRating = 0;
				reviewCount = 0;
			}
		} finally {
			if (requestId === activeRequestId) {
				isLoading = false;
			}
		}
	}

	$effect(() => {
		void userPubkey;

		loadUserRating(userPubkey);
	});

	// Round rating for star display (0-5)
	const roundedRating = $derived(Math.round(averageRating));
</script>

{#if isLoading}
	<div class="flex items-center gap-1" role="status" aria-live="polite">
		<span class="loading loading-spinner loading-xs"></span>
		<span class="sr-only">Loading user rating</span>
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
					aria-hidden="true"
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
