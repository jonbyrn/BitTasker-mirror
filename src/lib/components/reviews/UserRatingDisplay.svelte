<script lang="ts">
	import type { NostrVerifiedReview } from '$lib/types/review';
	import { getReviewsForUser } from '$lib/utils/reviews/queries';
	import { calculateReviewStats } from '$lib/utils/reviews/aggregation';
	import { normalizeNostrPubkey } from '$lib/utils/nostr-pubkey';
	import { createDebug } from '$lib/utils/debug';
	import IconStar from '~icons/mdi/star';

	const d = createDebug('reviews:rating');

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

	function resolveHexPubkey(pubkey: string): string | null {
		return normalizeNostrPubkey(pubkey);
	}

	function getCachedUserRating(hexPubkey: string): UserRatingSummary | null {
		const cachedRating = userRatingCache.get(hexPubkey);
		if (!cachedRating) {
			return null;
		}

		if (Date.now() - cachedRating.fetchedAt > USER_RATING_CACHE_TTL_MS) {
			userRatingCache.delete(hexPubkey);
			return null;
		}

		return cachedRating;
	}

	async function fetchUserRatingSummary(hexPubkey: string): Promise<UserRatingSummary> {
		const cachedRating = getCachedUserRating(hexPubkey);
		if (cachedRating) {
			return cachedRating;
		}

		const existingRequest = userRatingRequests.get(hexPubkey);
		if (existingRequest) {
			return existingRequest;
		}

		const request = (async () => {
			const reviews: NostrVerifiedReview[] = await getReviewsForUser(hexPubkey, ALL_REVIEWS_LIMIT);
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

			if (nextSummary.reviewCount > 0) {
				userRatingCache.set(hexPubkey, nextSummary);
			}
			return nextSummary;
		})().finally(() => {
			userRatingRequests.delete(hexPubkey);
		});

		userRatingRequests.set(hexPubkey, request);
		return request;
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

		const hexPubkey = resolveHexPubkey(pubkey);
		if (!hexPubkey) {
			averageRating = 0;
			reviewCount = 0;
			isLoading = false;
			return;
		}

		try {
			isLoading = true;
			const ratingSummary = await fetchUserRatingSummary(hexPubkey);

			if (requestId !== activeRequestId) {
				return;
			}

			averageRating = ratingSummary.averageRating;
			reviewCount = ratingSummary.reviewCount;
		} catch (error) {
			d.error('Failed to load user rating:', error);
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
				<IconStar
					class="{currentSizeClasses.star} {i < roundedRating
						? 'text-primary'
						: 'text-base-content/30'}"
				/>
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
