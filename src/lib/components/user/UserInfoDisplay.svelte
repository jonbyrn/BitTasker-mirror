<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconAccount from '~icons/mdi/account';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { nip19 } from 'nostr-tools';
	import UserRatingDisplay from '$lib/components/reviews/UserRatingDisplay.svelte';

	const {
		avatar = null,
		username = null,
		rating = 0,
		avatarAlt = $t('dashboard.find_tasks.avatar_alt') || 'Avatar',
		size = 'md',
		pubkey = null, // Optional pubkey to fetch profile if username is invalid
		memberSince = null, // Optional date/timestamp for "Member since" text
		profileLink = null // Optional npub/pubkey for profile link
	} = $props<{
		avatar?: string | null;
		username?: string | null;
		rating?: number;
		avatarAlt?: string;
		size?: 'sm' | 'md' | 'lg';
		pubkey?: string | null; // npub or hex pubkey for fetching profile metadata
		memberSince?: Date | number | string | null; // Date, timestamp, or ISO string
		profileLink?: string | null; // npub or hex pubkey for profile link
	}>();

	// State for fetched profile data (fetchProfileMetadata returns name, picture, createdAt)
	let fetchedProfile = $state<{ name?: string; picture?: string; createdAt?: string } | null>(null);
	let isLoadingProfile = $state(false);
	let normalizedHexPubkey = $state<string | null>(null); // Normalized hex pubkey for consistent caching
	let lastLoadedPubkey = $state<string | null>(null); // Track which pubkey we last loaded to prevent duplicate loads

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
			star: 'h-3 w-3 sm:h-4 sm:w-4',
			rating: 'text-xs sm:text-sm',
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
			const dateObj = typeof date === 'number' 
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
		
		// If it's hex, convert to npub for the URL
		if (/^[a-fA-F0-9]{64}$/.test(pubkeyToUse)) {
			try {
				const npub = nip19.npubEncode(pubkeyToUse);
				return `/npub/${npub}`;
			} catch (error) {
				console.error('[UserInfoDisplay] Failed to encode npub:', error);
				// Fallback to hex format (route should handle it)
				return `/npub/${pubkeyToUse}`;
			}
		}
		
		// Fallback: use as-is (route should handle it)
		// If it's an npub format, it will be handled by the route
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

	/**
	 * Normalize username - ensure it's a string and not invalid
	 */
	const normalizedUsername = $derived.by(() => {
		if (!username) return null;
		
		// Convert to string if needed
		const str = typeof username === 'string' ? username : String(username);
		
		// Check if it's invalid
		if (isInvalidUsername(str)) {
			return null;
		}
		
		return str.trim() || null;
	});

	/**
	 * Get the display username - use fetched profile if available, otherwise use normalized username.
	 * Username is always present (not optional); no anonymous fallback.
	 */
	const displayUsername = $derived.by(() => {
		if (fetchedProfile?.name) {
			return fetchedProfile.name;
		}
		if (normalizedUsername) {
			return normalizedUsername;
		}
		return '';
	});

	/**
	 * Get the display avatar - use fetched profile if available, otherwise use provided avatar
	 */
	const displayAvatar = $derived.by(() => {
		// Priority: fetched profile picture > provided avatar
		return fetchedProfile?.picture || avatar;
	});

	/**
	 * Check if avatar is missing or empty (checks displayAvatar for consistency)
	 */
	const isAvatarMissing = $derived.by(() => {
		const avatarToCheck = displayAvatar;
		return !avatarToCheck || (typeof avatarToCheck === 'string' && avatarToCheck.trim() === '');
	});

	/**
	 * Normalize pubkey to hex format (like profile page does)
	 * This ensures consistent cache keys and proper filtering
	 */
	function normalizePubkeyToHex(pubkeyInput: string | null): string | null {
		if (!pubkeyInput) return null;

		// Check if it's an npub format (starts with npub1)
		if (pubkeyInput.startsWith('npub1')) {
			try {
				const decoded = nip19.decode(pubkeyInput);
				if (decoded.type === 'npub') {
					return decoded.data as string;
				}
			} catch (error) {
				console.error('[UserInfoDisplay] Failed to decode npub:', error);
				return null;
			}
		}

		// Check if it's a hex pubkey (64 characters)
		if (/^[a-fA-F0-9]{64}$/.test(pubkeyInput)) {
			return pubkeyInput;
		}

		// If it's just "npub" without the full format, try to decode anyway
		if (pubkeyInput.startsWith('npub') && !pubkeyInput.startsWith('npub1')) {
			try {
				const decoded = nip19.decode(pubkeyInput);
				// Use type assertion since we know it's an npub if decode succeeds
				if ((decoded as { type: string }).type === 'npub') {
					return (decoded as { type: 'npub'; data: string }).data;
				}
			} catch (error) {
				console.error('[UserInfoDisplay] Failed to decode npub:', error);
			}
		}

		return null;
	}

	/**
	 * Load user profile (like profile page does)
	 * Always fetches fresh data when pubkey is provided
	 */
	async function loadUserProfile() {
		if (!normalizedHexPubkey) {
			return;
		}

		// Prevent duplicate loads for the same pubkey or if already loading
		if (normalizedHexPubkey === lastLoadedPubkey || isLoadingProfile) {
			return;
		}

		// Set loading state and track pubkey immediately to prevent race conditions
		isLoadingProfile = true;
		lastLoadedPubkey = normalizedHexPubkey;
		
		try {
			console.debug('[UserInfoDisplay] loadUserProfile: starting fetch', { 
				username, 
				normalizedUsername, 
				avatar,
				isAvatarMissing,
				pubkey,
				normalizedHexPubkey 
			});
			
			// Convert hex to npub for fetchProfileMetadata (it handles both, but npub ensures cache consistency)
			// The cache key will be npub format, which is consistent across calls
			const npubToFetch = nip19.npubEncode(normalizedHexPubkey);
			
			const profile = await fetchProfileMetadata(npubToFetch);
			console.debug('[UserInfoDisplay] loadUserProfile: received profile', { 
				profile, 
				hasName: !!profile?.name,
				hasPicture: !!profile?.picture 
			});
			
			// Update fetched profile even if empty (to avoid re-fetching)
			fetchedProfile = profile;
			console.debug('[UserInfoDisplay] loadUserProfile: updated fetchedProfile', { fetchedProfile });
		} catch (error) {
			console.error('[UserInfoDisplay] loadUserProfile: error', error);
			fetchedProfile = null;
		} finally {
			isLoadingProfile = false;
		}
	}

	// Normalize pubkey to hex format when it changes (like profile page)
	$effect(() => {
		const newHexPubkey = normalizePubkeyToHex(pubkey);
		// Reset loaded pubkey when pubkey changes to allow fresh fetch
		if (newHexPubkey !== normalizedHexPubkey) {
			lastLoadedPubkey = null;
			fetchedProfile = null;
		}
		normalizedHexPubkey = newHexPubkey;
	});

	// Load profile when normalized pubkey is available (like profile page)
	// Use $effect to handle both initial mount and reactive updates
	$effect(() => {
		if (normalizedHexPubkey && normalizedHexPubkey !== lastLoadedPubkey && !isLoadingProfile) {
			loadUserProfile();
		}
	});

	// Debug: Log final values (only when they actually change, not on every render)
	let lastLoggedValues = $state<{ username?: string; display?: string } | null>(null);
	$effect(() => {
		const current = {
			username: displayUsername,
			display: displayUsername
		};
		
		// Only log if values actually changed
		if (!lastLoggedValues || 
			lastLoggedValues.username !== current.username || 
			lastLoggedValues.display !== current.display) {
			console.debug('[UserInfoDisplay] Display values:', {
				displayUsername,
				displayAvatar: !!displayAvatar,
				normalizedUsername,
				hasFetchedProfile: !!fetchedProfile,
				fetchedProfileName: fetchedProfile?.name,
				username,
				pubkey
			});
			lastLoggedValues = current;
		}
	});
</script>

<div class="flex min-w-0 flex-1 items-center gap-4">
	<!-- Avatar -->
	{#if profileUrl}
		<a
			href={profileUrl}
			class="avatar shrink-0 cursor-pointer transition-opacity hover:opacity-80"
		>
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
							<IconAccount class="text-base-content/60 {size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-6 w-6' : 'h-8 w-8'}" />
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
							<IconAccount class="text-base-content/60 {size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-6 w-6' : 'h-8 w-8'}" />
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
				{$t('task.drawer.member_since')} {formattedMemberSince}
			</span>
		{/if}
		
		<!-- Rating: live from Nostr when pubkey available, otherwise static -->
		<div class="flex items-center gap-1">
			{#if profileLink || pubkey}
				<UserRatingDisplay
					userPubkey={profileLink || pubkey}
					size={size}
					showCount={false}
					showStars={true}
				/>
			{:else}
				{#each Array(5) as _, i}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="{config.star} {i < Math.round(rating || 0)
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
				<span class="text-base-content/60 ml-1 {config.rating}">{(rating ?? 0).toFixed(1)}</span>
			{/if}
		</div>
	</div>
</div>
