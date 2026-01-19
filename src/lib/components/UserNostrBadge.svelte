<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { onMount } from 'svelte';

	const {
		npub,
		showReviews = true,
		showMemberSince = true,
		size = 'md',
		role = ''
	} = $props<{
		npub: string;
		showReviews?: boolean;
		showMemberSince?: boolean;
		size?: 'sm' | 'md' | 'lg';
		role?: string;
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

	const config = $derived(sizeConfig[size as keyof typeof sizeConfig]);

	// Load profile on mount
	onMount(() => {
		loadProfile();
	});

	async function loadProfile() {
		try {
			isLoading = true;
			profile = await fetchProfileMetadata(npub);
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
		// Return shortened npub as fallback
		return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
	}

	// Format date as "Month, Year" (e.g., "Sep, 2025")
	function formatMemberSinceDate(dateString: string | undefined): string {
		if (!dateString) return '';

		try {
			// Parse the date string (it should be in format like "Sep 27, 2025")
			const date = new Date(dateString);
			if (isNaN(date.getTime())) return dateString; // Return original if invalid

			// Format as "Month, Year" (e.g., "Sep, 2025")
			return date.toLocaleDateString('en-US', {
				month: 'short',
				year: 'numeric'
			});
		} catch (error) {
			console.error('Error formatting member since date:', error);
			return dateString; // Return original if error
		}
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
		{#if role}
			<small class="text-base-content/60 text-xs">
				{role}
			</small>
		{/if}
		<span class="{config.name} truncate">
			{isLoading ? 'Loading...' : getDisplayName()}
		</span>

		<!-- Review System - Currently not implemented in Nostr -->
		{#if showReviews && !isLoading}
			<!-- <div class="mt-1 flex min-w-0 items-center">
					<div class="flex shrink-0">
						{#each Array(5) as _, i}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-3 w-3 {i < (profile.averageRating || 0)
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
					</div>
					<span class="text-base-content/60 ml-1 truncate text-xs">
						{(profile.averageRating || 0).toFixed(1)} ({profile.tasksCompleted || 0}
						{$t('dashboard.contracts.tasks')})
					</span>
				</div> -->
		{:else}
			<div class="flex items-center gap-1">
				<span class="text-base-content/60 {config.details}"> {$t('dashboard.no_reviews')} </span>
			</div>
		{/if}

		{#if showMemberSince && !isLoading}
			<p class="text-base-content/60 {config.details}">
				Member since {formatMemberSinceDate(profile?.createdAt)}
			</p>
		{/if}
	</div>
</div>
