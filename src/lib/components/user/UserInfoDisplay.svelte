<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from 'svelte-i18n';
	import IconAccount from '~icons/mdi/account';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { nip19 } from 'nostr-tools';

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
	let activeProfileRequestId = 0;

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
		try {
			const value = $t('messages.unknown_user');
			return typeof value === 'string' && value !== 'messages.unknown_user'
				? value
				: 'Unknown User';
		} catch {
			return 'Unknown User';
		}
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

	/**
	 * Get the display avatar - use fetched profile if available, otherwise use provided avatar
	 */
	const displayAvatar = $derived.by(() => {
		// Priority: fetched profile picture > provided avatar
		return fetchedProfile?.picture || avatar;
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

	const normalizedHexPubkey = $derived.by(() => normalizePubkeyToHex(pubkey));

	/**
	 * Load user profile (like profile page does)
	 * Always fetches fresh data when pubkey is provided
	 */
	async function loadUserProfile(currentPubkey: string, requestId: number) {
		try {
			// Convert hex to npub for fetchProfileMetadata (it handles both, but npub ensures cache consistency)
			// The cache key will be npub format, which is consistent across calls
			const npubToFetch = nip19.npubEncode(currentPubkey);
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

	$effect(() => {
		const currentPubkey = normalizedHexPubkey;
		activeProfileRequestId += 1;
		const requestId = activeProfileRequestId;

		fetchedProfile = null;

		if (!currentPubkey) {
			return;
		}

		void loadUserProfile(currentPubkey, requestId);
	});
</script>

<div class="flex min-w-0 flex-1 items-center gap-4">
	<!-- Avatar -->
	{#if profileUrl}
		<a
			href={resolve(profileUrl, '')}
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
				href={resolve(profileUrl, '')}
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
			{#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="{config.star} {i < (rating || 0) ? 'text-yellow-400' : 'text-base-content/30'}"
					fill="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
					/>
				</svg>
			{/each}
			<span class="text-base-content/60 ml-1 {config.rating}">{rating || 0}</span>
		</div>
	</div>
</div>
