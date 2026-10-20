<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { profileStore } from '$lib/stores/profile.store';
	import { user } from '$lib/stores/user.store';
	import { t, locale } from 'svelte-i18n';
	import Avatar from '$lib/components/Avatar.svelte';
	import { getUserDisplayName } from '$lib/utils/helpers/userDisplayName';
	import NpubQrCodeModal from '$lib/components/NpubQrCodeModal.svelte';

	// Helper function to get translated profile content
	// Reactive to locale changes via $locale
	function getTranslatedProfileContent(field: 'professionalTitle' | 'about'): string {
		const currentLang = $locale || 'en';
		const originalText = $profileStore.data?.[field] || '';

		// If no translations, return original
		if (!$profileStore.data?.translations) {
			return originalText;
		}

		// If current language is source language, return original
		if ($profileStore.data.translations.sourceLanguage === currentLang) {
			return originalText;
		}

		// Get translation for current language
		const translation = $profileStore.data.translations.translations[currentLang];
		if (translation) {
			return translation[field] || originalText;
		}

		// Fallback to original
		return originalText;
	}

	// Control share modal visibility
	let showShareModal = $state(false);

	// Initialize user store when component mounts
	onMount(async () => {
		try {
			await user.getUserData();
		} catch (error) {
			console.error('Failed to initialize user store:', error);
		}
	});

	// Derived values for reactive updates - prioritize username from database over name
	let userName = $derived(
		getUserDisplayName(
			{
				username: $user.username,
				name: $profileStore.data?.name || $user.name
			},
			''
		)
	);

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

	// Generate share link for profile
	const _shareLink = $derived(() => {
		if (typeof window === 'undefined') {
			return '';
		}
		// Use current profile page URL for sharing
		return `${window.location.origin}/npub/${$user.npub}`;
	});

	// Get display name for sharing (professional title if available, otherwise name)
	const shareDisplayName = $derived(() => {
		const translatedTitle = getTranslatedProfileContent('professionalTitle');
		if (translatedTitle && translatedTitle.trim()) {
			return translatedTitle;
		}
		return userName || 'Professional Profile';
	});

	// Generate share text with professional title/name and description
	const _shareText = $derived(() => {
		if (!$profileStore.data) return '';

		const displayName = shareDisplayName();
		let description = '';

		// Use about description if available (translated)
		const translatedAbout = getTranslatedProfileContent('about');
		if (translatedAbout && translatedAbout.trim()) {
			description = translatedAbout;
		}

		// Build share message - use string replacement for parameters
		if (description) {
			const message = String($t('profile.page.share_message') || '');
			return message.replace('{name}', displayName).replace('{description}', description);
		} else {
			const message = String($t('profile.page.share_message_no_desc') || '');
			return message.replace('{name}', displayName);
		}
	});

	// Handle share functionality - open share modal
	function handleShare() {
		showShareModal = true;
	}

	function closeShareModal() {
		showShareModal = false;
	}
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
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="min-w-0 flex-1">
						<h3 class="line-clamp-2 min-w-0 wrap-break-word">
							{userName}
						</h3>
						{#if $profileStore.data.professionalTitle}
							<p class="text-base-content/80 text-sm font-medium">
								{getTranslatedProfileContent('professionalTitle')}
							</p>
						{/if}
						<div class="mt-1 flex items-center gap-1 text-sm" data-testid="profile-reputation">
							{#each Array(5) as _, i (i)}
								<svg
									class="h-4 w-4 {i < Math.round($profileStore.stats.rating || 0)
										? 'text-brand-ink'
										: 'text-base-content/30'}"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path
										d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
									/>
								</svg>
							{/each}
							<span class="text-brand-ink ml-1 font-bold"
								>{$profileStore.stats.rating ? $profileStore.stats.rating.toFixed(1) : '0.0'}</span
							>
							<span class="text-base-content/50 ml-1 font-medium"
								>({$profileStore.data?.reviews?.length || 0})</span
							>
							{#if $profileStore.data.website}
								<a
									href={$profileStore.data.website}
									target="_blank"
									rel="noopener noreferrer"
									class="text-base-content/50 hover:text-primary ml-2 inline-flex items-center"
									title={$profileStore.data.website}
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
								</a>
							{/if}
						</div>
					</div>
					<!-- Action buttons - Desktop only -->
					<div class="hidden gap-2 md:flex">
						<button
							class="btn btn-outline btn-md gap-2"
							onclick={handleShare}
							title={$t('profile.page.share_profile')}
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
									d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
								/>
							</svg>
							{$t('profile.page.share')}
						</button>
						<button
							class="btn btn-primary btn-md gap-2"
							onclick={() => goto('/profile/edit')}
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
									d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
								/>
							</svg>
							{$t('profile.page.edit_profile')}
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Action Buttons - Mobile only -->
		<div class="flex gap-2 md:hidden">
			<button
				class="btn btn-outline btn-sm flex-1 gap-2"
				onclick={handleShare}
				title={$t('profile.page.share_profile')}
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
						d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
					/>
				</svg>
				{$t('profile.page.share')}
			</button>
			<button
				class="btn btn-primary btn-sm flex-1 gap-2"
				onclick={() => goto('/profile/edit')}
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
						d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
					/>
				</svg>
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

<!-- Share Profile Modal -->
<NpubQrCodeModal isOpen={showShareModal} onClose={closeShareModal} />
