<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconAccount from '~icons/mdi/account';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { ndk } from '$lib/nostr/ndk';
	import { getReviewsForUser } from '$lib/utils/reviews/queries';
	import { calculateReviewStats } from '$lib/utils/reviews/aggregation';
	import { calculateUserRanking, type UserRanking } from '$lib/utils/reviews/ranking';
	import { truncateNpub } from '$lib/utils/nostr';

	// ── Module-level review cache (one fetch per pubkey per session) ──────────
	interface CachedReviewData {
		reviewCount: number;
		averageRating: number;
		ranking: UserRanking | null;
		timestamp: number;
	}
	const REVIEWS_CACHE_TTL = 5 * 60 * 1000;
	const MAX_CACHE_SIZE = 100;
	const reviewsCache: Record<string, CachedReviewData> = {};
	const inFlightRequests: Record<string, Promise<CachedReviewData>> = {};

	function getCachedReviews(pubkey: string): CachedReviewData | null {
		const entry = reviewsCache[pubkey];
		if (!entry) return null;
		if (Date.now() - entry.timestamp > REVIEWS_CACHE_TTL) {
			delete reviewsCache[pubkey];
			return null;
		}
		return entry;
	}

	function setCachedReviews(pubkey: string, data: CachedReviewData): void {
		reviewsCache[pubkey] = data;
		const keys = Object.keys(reviewsCache);
		if (keys.length > MAX_CACHE_SIZE) {
			let oldestKey = keys[0];
			let oldestTime = reviewsCache[oldestKey].timestamp;
			for (const k of keys) {
				if (reviewsCache[k].timestamp < oldestTime) {
					oldestTime = reviewsCache[k].timestamp;
					oldestKey = k;
				}
			}
			delete reviewsCache[oldestKey];
		}
	}

	const {
		avatar = null,
		username = null,
		rating: ratingProp = null, // Now optional - will calculate from reviews if not provided
		avatarAlt = $t('dashboard.find_tasks.avatar_alt') || 'Avatar',
		size = 'md',
		pubkey = null, // Optional pubkey to fetch profile if username is invalid
		memberSince = null, // Optional date/timestamp for "Member since" text
		profileLink = null, // Optional npub/pubkey for profile link
		onResolvedName = null,
		showRanking = false, // Show ranking badge
		showReviewCount = true, // Show review count next to stars
		reviewBadge = null // Text label shown as a subtle badge when this user has reviewed you
	} = $props<{
		avatar?: string | null;
		username?: string | null;
		rating?: number | null;
		avatarAlt?: string;
		size?: 'sm' | 'md' | 'lg';
		pubkey?: string | null; // npub or hex pubkey for fetching profile metadata
		memberSince?: Date | number | string | null; // Date, timestamp, or ISO string
		profileLink?: string | null; // npub or hex pubkey for profile link
		/** Callback invoked with the resolved display name after fetch completes or username changes. */
		onResolvedName?: ((name: string) => void) | null;
		showRanking?: boolean;
		showReviewCount?: boolean;
		reviewBadge?: string | null; // Shows a subtle "reviewed you" indicator
	}>();

	// State for fetched profile data (fetchProfileMetadata returns name, picture, createdAt)
	let fetchedProfile = $state<{ name?: string; picture?: string; createdAt?: string } | null>(null);
	let activeProfileRequestId = 0;

	// State for reviews and ranking
	let userRanking = $state<UserRanking | null>(null);
	let reviewCount = $state(0);
	let calculatedRating = $state(0);
	let isLoadingReviews = $state(false);

	// Size configurations - matching bids page styling
	const sizeConfig = {
		sm: {
			avatar: 'h-8 w-8',
			text: 'text-xs',
			name: 'text-sm font-semibold',
			star: 'h-2 w-2',
			rating: 'text-xs',
			memberSince: 'text-xs'
		},
		md: {
			avatar: 'h-12 w-12 sm:h-14 sm:w-14',
			text: 'text-base',
			name: 'text-base font-semibold sm:text-lg',
			star: 'h-3 w-3',
			rating: 'text-xs',
			memberSince: 'text-xs sm:text-sm'
		},
		lg: {
			avatar: 'h-16 w-16',
			text: 'text-lg',
			name: 'text-lg font-semibold sm:text-xl',
			star: 'h-4 w-4 sm:h-5 sm:w-5',
			rating: 'text-sm sm:text-base',
			memberSince: 'text-sm sm:text-base'
		}
	};

	const config = $derived(sizeConfig[size as keyof typeof sizeConfig]);

	/**
	 * Format date for "Member since" display (Month Year format)
	 */
	function formatMemberSinceDate(date: Date | number | string): string {
		try {
			const dateObj =
				typeof date === 'number'
					? new Date(date * 1000) // If timestamp in seconds
					: typeof date === 'string'
						? new Date(date)
						: date;

			return dateObj.toLocaleDateString('en-US', {
				month: 'short',
				year: 'numeric'
			});
		} catch {
			return '';
		}
	}

	/**
	 * Get formatted member since text
	 * Uses memberSince prop when provided, otherwise falls back to fetched profile's createdAt
	 */
	const formattedMemberSince = $derived.by(() => {
		const dateSource = memberSince ?? fetchedProfile?.createdAt;
		if (!dateSource) return null;
		return formatMemberSinceDate(dateSource);
	});

	/**
	 * Encode hex pubkey to npub using NDK
	 */
	function hexToNpub(hex: string): string | null {
		try {
			const user = ndk.getUser({ pubkey: hex });
			return user.npub;
		} catch {
			return null;
		}
	}

	/**
	 * Get profile URL from profileLink or pubkey (npub or hex)
	 * Converts to npub format for consistent URLs
	 */
	const profileUrl = $derived.by(() => {
		// Use profileLink if provided, otherwise fall back to pubkey
		const pubkeyToUse = profileLink || pubkey;
		if (!pubkeyToUse) return null;

		// If it's already an npub, use it directly
		if (pubkeyToUse.startsWith('npub1')) {
			return `/npub/${pubkeyToUse}`;
		}

		// If it's hex, convert to npub for the URL using NDK
		if (/^[a-fA-F0-9]{64}$/.test(pubkeyToUse)) {
			const npub = hexToNpub(pubkeyToUse);
			return npub ? `/npub/${npub}` : `/npub/${pubkeyToUse}`;
		}

		// Fallback: use as-is (route should handle it)
		return `/npub/${pubkeyToUse}`;
	});

	/**
	 * Check if a string looks like an npub or pubkey (not a real username)
	 */
	function isInvalidUsername(value: unknown): boolean {
		if (!value) return true;

		// Convert to string if it's not already
		const str = typeof value === 'string' ? value : String(value);

		// Check for common invalid patterns:
		// 1. Starts with "npub" (npub format)
		if (str.startsWith('npub')) return true;
		// 2. Contains "..." (shortened npub pattern)
		if (str.includes('...')) return true;
		// 3. Is a hex string (64 chars, all hex)
		if (/^[0-9a-fA-F]{64}$/.test(str)) return true; // Hex pubkey
		// 4. Is "[object Object]" or similar
		if (str.startsWith('[object')) return true;
		// 5. Is just numbers
		if (/^\d+$/.test(str) && str.length > 3) return true; // Just numbers (but allow short numbers like "123")

		return false;
	}

	function sanitizeDisplayName(value: unknown): string | null {
		if (typeof value !== 'string') return null;

		const trimmedValue = value.trim();
		if (!trimmedValue || isInvalidUsername(trimmedValue)) {
			return null;
		}

		return trimmedValue;
	}

	/**
	 * Normalize username - ensure it's a string and not invalid
	 */
	const normalizedUsername = $derived.by(() => {
		return sanitizeDisplayName(username);
	});

	const normalizedFetchedProfileName = $derived.by(() => sanitizeDisplayName(fetchedProfile?.name));

	const fallbackDisplayName = $derived.by(() => {
		if (pubkey) {
			return truncateNpub(pubkey);
		}
		return '';
	});

	/**
	 * Get the display username - prefer a valid fetched profile name, then a valid caller-provided
	 * username, then a deterministic generic fallback.
	 */
	const displayUsername = $derived.by(() => {
		if (normalizedFetchedProfileName) {
			return normalizedFetchedProfileName;
		}
		if (normalizedUsername) {
			return normalizedUsername;
		}
		return fallbackDisplayName;
	});

	// Notify parent when a real display name resolves (skip fallback)
	$effect(() => {
		if (!onResolvedName) return;
		const name = normalizedFetchedProfileName || normalizedUsername;
		if (name) onResolvedName(name);
	});

	/**
	 * Validate that an image URL uses an allowed protocol (http or https)
	 * This prevents XSS attacks via javascript: or data: URLs in profile pictures
	 */
	function isSafeImageUrl(url: string | null | undefined): url is string {
		if (!url) return false;
		try {
			const parsed = new URL(url);
			return ['http:', 'https:'].includes(parsed.protocol);
		} catch {
			return false;
		}
	}

	/**
	 * Get the display avatar - use fetched profile if available, otherwise use provided avatar
	 * Only returns URLs that pass safety validation (http/https only)
	 */
	const displayAvatar = $derived.by(() => {
		// Priority: fetched profile picture > provided avatar
		const avatarUrl = fetchedProfile?.picture || avatar;
		if (isSafeImageUrl(avatarUrl)) {
			return avatarUrl;
		}
		return null;
	});

	/**
	 * Normalize pubkey to hex format using NDK
	 * This ensures consistent cache keys and proper filtering
	 */
	function normalizePubkeyToHex(pubkeyInput: string | null): string | null {
		if (!pubkeyInput) return null;

		// Check if it's a hex pubkey (64 characters)
		if (/^[a-fA-F0-9]{64}$/.test(pubkeyInput)) {
			return pubkeyInput;
		}

		// Check if it's an npub format - use NDK to decode
		if (pubkeyInput.startsWith('npub')) {
			try {
				const user = ndk.getUser({ npub: pubkeyInput });
				return user.pubkey;
			} catch (error) {
				console.error('[UserInfoDisplay] Failed to decode npub:', error);
				return null;
			}
		}

		return null;
	}

	const normalizedHexPubkey = $derived.by(() => normalizePubkeyToHex(pubkey));

	/**
	 * Load user profile (like profile page does)
	 * Always fetches fresh data when pubkey is provided
	 */
	async function loadUserProfile(currentPubkey: string, requestId: number) {
		try {
			// Convert hex to npub for fetchProfileMetadata using NDK
			const npubToFetch = hexToNpub(currentPubkey);
			if (!npubToFetch) {
				fetchedProfile = null;
				return;
			}

			const profile = await fetchProfileMetadata(npubToFetch);

			if (requestId !== activeProfileRequestId) {
				return;
			}

			const hasMeaningfulProfileData = Boolean(
				sanitizeDisplayName(profile?.name) || profile?.picture?.trim() || profile?.createdAt?.trim()
			);
			fetchedProfile = hasMeaningfulProfileData ? profile : null;
		} catch (error) {
			if (requestId !== activeProfileRequestId) {
				return;
			}

			console.error('[UserInfoDisplay] Failed to load user profile metadata:', error);
			fetchedProfile = null;
		}
	}

	/**
	 * Load reviews and calculate ranking for a user
	 */
	async function loadUserReviews(currentPubkey: string, requestId: number) {
		if (ratingProp !== null && ratingProp !== undefined) {
			calculatedRating = ratingProp;
			return;
		}

		// Deduplicate in-flight requests for the same pubkey
		const inFlight = inFlightRequests[currentPubkey];
		if (inFlight) {
			try {
				const result = await inFlight;
				if (requestId !== activeProfileRequestId) return;
				reviewCount = result.reviewCount;
				calculatedRating = result.averageRating;
				userRanking = result.ranking;
			} catch {
				if (requestId !== activeProfileRequestId) return;
				calculatedRating = 0;
				userRanking = null;
			}
			return;
		}

		isLoadingReviews = true;

		const promise = (async (): Promise<CachedReviewData> => {
			const reviews = await getReviewsForUser(currentPubkey, 100);
			let result: CachedReviewData;
			if (reviews.length > 0) {
				const stats = calculateReviewStats(reviews);
				result = {
					reviewCount: reviews.length,
					averageRating: stats.averageRating,
					ranking: calculateUserRanking({ reviewStats: stats }),
					timestamp: Date.now()
				};
			} else {
				result = {
					reviewCount: 0,
					averageRating: 0,
					ranking: null,
					timestamp: Date.now()
				};
			}
			setCachedReviews(currentPubkey, result);
			return result;
		})();

		inFlightRequests[currentPubkey] = promise;

		try {
			const result = await promise;
			if (requestId !== activeProfileRequestId) return;
			reviewCount = result.reviewCount;
			calculatedRating = result.averageRating;
			userRanking = result.ranking;
		} catch (error) {
			if (requestId !== activeProfileRequestId) return;
			console.error('[UserInfoDisplay] Failed to load user reviews:', error);
			calculatedRating = 0;
			userRanking = null;
		} finally {
			delete inFlightRequests[currentPubkey];
			isLoadingReviews = false;
		}
	}

	/**
	 * Get display rating - use prop if provided, otherwise calculated from reviews
	 */
	const displayRating = $derived(
		ratingProp !== null && ratingProp !== undefined ? ratingProp : calculatedRating
	);

	$effect(() => {
		const currentPubkey = normalizedHexPubkey;
		activeProfileRequestId += 1;
		const requestId = activeProfileRequestId;

		fetchedProfile = null;

		if (!currentPubkey) {
			userRanking = null;
			reviewCount = 0;
			calculatedRating = 0;
			return;
		}

		// Check cache first — avoid flash of empty state when data is already loaded
		if (ratingProp === null || ratingProp === undefined) {
			const cached = getCachedReviews(currentPubkey);
			if (cached) {
				reviewCount = cached.reviewCount;
				calculatedRating = cached.averageRating;
				userRanking = cached.ranking;
				isLoadingReviews = false;
				void loadUserProfile(currentPubkey, requestId);
				return;
			}
		}

		// Cache miss — reset and fetch both
		userRanking = null;
		reviewCount = 0;
		calculatedRating = 0;

		void Promise.all([
			loadUserProfile(currentPubkey, requestId),
			loadUserReviews(currentPubkey, requestId)
		]);
	});
</script>

<div class="flex min-w-0 flex-1 items-center gap-4">
	<!-- Avatar -->
	{#if profileUrl}
		<a href={profileUrl} class="avatar shrink-0 cursor-pointer transition-opacity hover:opacity-80">
			<div class="bg-base-300 flex {config.avatar} items-center justify-center rounded-full">
				{#if displayAvatar}
					<img
						src={displayAvatar}
						alt={avatarAlt}
						class="{config.avatar} rounded-full object-cover"
						onerror={(e) => {
							// Hide broken image and show placeholder instead
							(e.target as HTMLImageElement).style.display = 'none';
						}}
					/>
				{:else}
					<div
						class="avatar placeholder text-neutral-content bg-primary flex {config.avatar} items-center justify-center overflow-hidden rounded-full text-center"
					>
						{#if displayUsername}
							<span class="text-lg font-semibold sm:text-2xl">
								{displayUsername.charAt(0).toUpperCase()}
							</span>
						{:else}
							<IconAccount
								class="text-base-content/60 {size === 'sm'
									? 'h-4 w-4'
									: size === 'md'
										? 'h-6 w-6'
										: 'h-8 w-8'}"
							/>
						{/if}
					</div>
				{/if}
			</div>
		</a>
	{:else}
		<div class="avatar shrink-0">
			<div class="bg-base-300 flex {config.avatar} items-center justify-center rounded-full">
				{#if displayAvatar}
					<img
						src={displayAvatar}
						alt={avatarAlt}
						class="{config.avatar} rounded-full object-cover"
						onerror={(e) => {
							// Hide broken image and show placeholder instead
							(e.target as HTMLImageElement).style.display = 'none';
						}}
					/>
				{:else}
					<div
						class="avatar placeholder text-neutral-content bg-primary flex {config.avatar} items-center justify-center overflow-hidden rounded-full text-center"
					>
						{#if displayUsername}
							<span class="text-lg font-semibold sm:text-2xl">
								{displayUsername.charAt(0).toUpperCase()}
							</span>
						{:else}
							<IconAccount
								class="text-base-content/60 {size === 'sm'
									? 'h-4 w-4'
									: size === 'md'
										? 'h-6 w-6'
										: 'h-8 w-8'}"
							/>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- User info column -->
	<div class="flex min-w-0 flex-1 flex-col items-start">
		<!-- Display name -->
		{#if profileUrl}
			<a
				href={profileUrl}
				class="w-full cursor-pointer truncate {config.name} transition-opacity hover:opacity-80"
			>
				{displayUsername}
			</a>
		{:else}
			<p class="w-full truncate {config.name}">
				{displayUsername}
			</p>
		{/if}

		<!-- Member since -->
		{#if formattedMemberSince}
			<span class="text-base-content/60 {config.memberSince}">
				{$t('common.profile.member_since')}
				{formattedMemberSince}
			</span>
		{/if}

		<!-- Rating - same pattern as find-tasks: filled stars, yellow for filled, grey for empty -->
		<div class="flex items-center gap-1">
			{#if isLoadingReviews}
				<span class="loading loading-spinner loading-xs text-base-content/40"></span>
			{:else}
				{#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="{config.star} {i < Math.round(displayRating)
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
				<span class="text-base-content/60 ml-1 {config.rating}">
					{displayRating > 0 ? displayRating.toFixed(1) : '0'}
				</span>
				{#if showReviewCount && reviewCount > 0}
					<span class="text-base-content/40 {config.rating}">
						({reviewCount})
					</span>
				{/if}
			{/if}
		</div>
		{#if reviewBadge}
			<span class="badge badge-info badge-xs gap-1" title={$t('reviews.review_received')}>
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
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				{reviewBadge}
			</span>
		{/if}

		<!-- Ranking Badge (optional) -->
		{#if showRanking && userRanking && userRanking.score > 0}
			<div class="mt-1">
				<span class="badge {userRanking.tierConfig.badgeClass} badge-sm gap-1">
					{userRanking.tierConfig.label}
				</span>
			</div>
		{/if}
	</div>
</div>
