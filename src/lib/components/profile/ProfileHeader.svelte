<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { profileStore } from '$lib/stores/profile.store';
	import { user } from '$lib/stores/user.store';
	import { t } from 'svelte-i18n';
	import Avatar from '$lib/components/Avatar.svelte';

	// Initialize user store when component mounts
	onMount(async () => {
		try {
			await user.getUserData();
		} catch (error) {
			console.error('Failed to initialize user store:', error);
		}
	});

	// Derived values for reactive updates
	let userName = $derived($profileStore.data?.name || $user.name || 'Anonymous');

	// Get the first image from pictures array, or fallback to user.picture or profileStore.data.picture
	let userPicture = $derived(() => {
		// First priority: first image from pictures array
		if ($profileStore.data?.pictures && $profileStore.data.pictures.length > 0) {
			return $profileStore.data.pictures[0].url;
		}
		// Second priority: user store picture
		if ($user.picture) {
			return $user.picture;
		}
		// Third priority: profile store picture
		if ($profileStore.data?.picture) {
			return $profileStore.data.picture;
		}
		return '';
	});
</script>

<!-- Profile Header -->
<div class="mb-6">
	{#if $profileStore.isLoading}
		<div class="flex animate-pulse items-center gap-4">
			<div class="bg-base-300 h-16 w-16 rounded-full"></div>
			<div>
				<div class="bg-base-300 mb-2 h-6 w-48 rounded"></div>
				<div class="bg-base-300 h-4 w-32 rounded"></div>
			</div>
		</div>
	{:else if $profileStore.data}
		<!-- User Profile Info -->
		<div class="mb-4 flex items-center gap-4">
			<Avatar name={userName} picture={userPicture()} size="lg" />
			<div class="flex-1">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex flex-wrap items-center gap-2">
						<h3 class="truncate">
							{userName}
						</h3>
						{#if $profileStore.data.professionalTitle}
							<div class="badge badge-primary whitespace-nowrap leading-tight break-words w-fit mb-2">{$profileStore.data.professionalTitle}</div>
						{/if}
					</div>
					<!-- Edit Profile Button - Desktop only -->
					<button class="btn btn-primary hidden md:inline-flex" onclick={() => goto('/dashboard/profile/edit')}>
						{$t('profile.page.edit_profile')}
					</button>
				</div>
				{#if $profileStore.data.website}
					<a
						href={$profileStore.data.website}
						target="_blank"
						rel="noopener noreferrer"
						class="text-base-content/70 hover:text-primary flex items-center gap-1"
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
								d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
							/>
						</svg>
						{$profileStore.data.website}
					</a>
				{/if}
			</div>
		</div>

		<!-- Action Buttons - Mobile only -->
		<div class="flex justify-center md:hidden">
			<button class="btn btn-primary w-full" onclick={() => goto('/dashboard/profile/edit')}>
				{$t('profile.page.edit_profile')}
			</button>
		</div>
	{:else if $profileStore.error}
		<!-- Error State -->
		<div class="alert alert-error alert-outline">
			<span>
				{$t('profile.page.sections.error')}
			</span>
		</div>
	{/if}
</div>
