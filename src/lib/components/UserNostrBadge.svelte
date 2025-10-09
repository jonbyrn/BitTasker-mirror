<script lang="ts">
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';

	const {
		pubkey,
		showReviews = true,
		showMemberSince = true,
		size = 'md'
	} = $props<{
		pubkey: string;
		showReviews?: boolean;
		showMemberSince?: boolean;
		size?: 'sm' | 'md' | 'lg';
	}>();

	// State for profile data
	let profile = $state<{ name?: string; picture?: string; createdAt?: string } | null>(null);
	let isLoading = $state(true);

	// Size configurations
	const sizeConfig = {
		sm: {
			avatar: 'h-6 w-6',
			text: 'text-xs',
			name: 'text-xs font-medium',
			details: 'text-xs'
		},
		md: {
			avatar: 'h-8 w-8',
			text: 'text-sm',
			name: 'text-sm font-medium',
			details: 'text-xs'
		},
		lg: {
			avatar: 'h-10 w-10',
			text: 'text-base',
			name: 'text-base font-medium',
			details: 'text-sm'
		}
	};

	const config = sizeConfig[size as keyof typeof sizeConfig];

	// Load profile on mount
	$effect(() => {
		if (pubkey) {
			loadProfile();
		}
	});

	async function loadProfile() {
		try {
			isLoading = true;
			profile = await fetchProfileMetadata(pubkey);
		} catch (error) {
			console.error('Failed to load profile:', error);
			profile = null;
		} finally {
			isLoading = false;
		}
	}

	// Get display name - prioritize username from database over name
	function getDisplayName(): string {
		// First check if this is the current user and we have database data
		if (profile?.name) return profile.name;
		// Return shortened pubkey as fallback
		return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
	}
</script>

<div class="flex items-center gap-3">
	<!-- Avatar -->
	<div class="avatar">
		<div class="bg-base-300 flex items-center justify-center rounded-full {config.avatar}">
			{#if isLoading}
				<div class="skeleton rounded-full {config.avatar}"></div>
			{:else if profile?.picture}
				<img
					src={profile.picture}
					alt="User avatar"
					class="rounded-full object-cover {config.avatar}"
				/>
			{:else}
				<!-- Placeholder with initials -->
				<div
					class="avatar placeholder text-neutral-content bg-primary flex items-center justify-center overflow-hidden rounded-full text-center {config.avatar}"
				>
					<span class="{config.text} font-semibold">
						{getDisplayName().charAt(0).toUpperCase()}
					</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- User Info -->
	<div class="flex min-w-0 flex-col">
		<span class="{config.name} truncate">
			{isLoading ? 'Loading...' : getDisplayName()}
		</span>

		<!-- TODO: Review System - Currently not implemented in Nostr -->
		<!-- {#if showReviews && !isLoading}
			<div class="flex items-center gap-1">
				<span class="text-base-content/60 {config.details}"> No reviews yet </span>
			</div>
		{/if} -->

		{#if showMemberSince && !isLoading}
			<p class="text-base-content/60 {config.details}">
				Member since {profile?.createdAt}
			</p>
		{/if}
	</div>
</div>
