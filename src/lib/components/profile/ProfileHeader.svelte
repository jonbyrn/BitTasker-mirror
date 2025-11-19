<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { profileStore } from '$lib/stores/profile.store';
	import { user } from '$lib/stores/user.store';
	import { t } from 'svelte-i18n';
	import Avatar from '$lib/components/Avatar.svelte';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { getProfileUrl } from '$lib/utils/helpers/profile';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { browser } from '$app/environment';

	// Initialize user store when component mounts
	onMount(async () => {
		try {
			await user.getUserData();
			// Get user's npub for share functionality
			const { value } = await Preferences.get({ key: StorageKeys.NPUB });
			userNpub = value || null;
		} catch (error) {
			console.error('Failed to initialize user store:', error);
		}
	});

	// Derived values for reactive updates - prioritize username from database over name
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

	// Share modal state
	let userNpub = $state<string | null>(null);
	let showShareModal = $state(false);
	let qrCodeDataUrl = $state<string | null>(null);
	let qrCodeLoading = $state(false);
	let qrCodeError = $state<string | null>(null);
	let copyLinkSuccess = $state(false);
	let copyNpubSuccess = $state(false);

	// Share functions
	function openShareModal() {
		showShareModal = true;
		qrCodeDataUrl = null;
		qrCodeError = null;
		copyLinkSuccess = false;
		copyNpubSuccess = false;
		if (browser && userNpub) {
			generateQrCode();
		}
	}

	function closeShareModal() {
		showShareModal = false;
		copyLinkSuccess = false;
		copyNpubSuccess = false;
	}

	async function generateQrCode() {
		if (!browser || !userNpub) return;

		try {
			qrCodeLoading = true;
			qrCodeError = null;

			const profileUrl = `${window.location.origin}${getProfileUrl(userNpub)}`;
			const qrUrl = await generateQrCodeUrl(profileUrl);
			qrCodeDataUrl = qrUrl;
		} catch (error) {
			console.error('Failed to generate QR code:', error);
			qrCodeError = $t('common.profile.qr_generation_failed');
		} finally {
			qrCodeLoading = false;
		}
	}

	async function copyProfileLink() {
		if (!browser || !userNpub) return;

		const profileUrl = `${window.location.origin}${getProfileUrl(userNpub)}`;
		const success = await copyToClipboard(profileUrl);
		if (success) {
			copyLinkSuccess = true;
			setTimeout(() => {
				copyLinkSuccess = false;
			}, 2000);
		}
	}

	async function copyNpub() {
		if (!userNpub) return;

		const success = await copyToClipboard(userNpub);
		if (success) {
			copyNpubSuccess = true;
			setTimeout(() => {
				copyNpubSuccess = false;
			}, 2000);
		}
	}

	function viewPublicProfile() {
		if (userNpub) {
			goto(getProfileUrl(userNpub));
		}
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
			<div class="flex-1">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex flex-wrap items-center gap-2">
						<h3 class="truncate">
							{userName}
						</h3>
						{#if $profileStore.data.professionalTitle}
							<div
								class="badge badge-primary mb-2 w-fit leading-tight break-words whitespace-nowrap"
							>
								{$profileStore.data.professionalTitle}
							</div>
						{/if}
					</div>
					<!-- Action Buttons - Desktop only -->
					<div class="hidden md:flex md:flex-row md:items-center md:gap-2 lg:flex-row">
						<button
							class="btn btn-primary"
							onclick={() => goto('/dashboard/profile/edit')}
						>
							{$t('profile.page.edit_profile')}
						</button>
						<button
							class="btn btn-outline"
							onclick={viewPublicProfile}
							disabled={!userNpub}
						>
							<svg
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
								/>
							</svg>
							{$t('common.profile.view_public_profile')}
						</button>
						<button
							class="btn btn-outline"
							onclick={openShareModal}
							disabled={!userNpub}
						>
							<svg
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8.684 13.342c-.396 0-.72-.324-.72-.72 0-.396.324-.72.72-.72.396 0 .72.324.72.72 0 .396-.324.72-.72.72zm0-2.829c-.747 0-1.355.608-1.355 1.355 0 .747.608 1.355 1.355 1.355.747 0 1.355-.608 1.355-1.355 0-.747-.608-1.355-1.355-1.355zm6.564 0c-.396 0-.72-.324-.72-.72 0-.396.324-.72.72-.72.396 0 .72.324.72.72 0 .396-.324.72-.72.72zm0-2.829c-.747 0-1.355.608-1.355 1.355 0 .747.608 1.355 1.355 1.355.747 0 1.355-.608 1.355-1.355 0-.747-.608-1.355-1.355-1.355z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
								/>
							</svg>
							{$t('common.profile.share_profile')}
						</button>
					</div>
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

		<!-- Action Buttons - Mobile and Tablet -->
		<div class="flex flex-col gap-2 md:flex-row md:justify-center lg:hidden">
			<button class="btn btn-primary w-full md:w-auto" onclick={() => goto('/dashboard/profile/edit')}>
				{$t('profile.page.edit_profile')}
			</button>
			<button
				class="btn btn-outline w-full md:w-auto"
				onclick={viewPublicProfile}
				disabled={!userNpub}
			>
				<svg
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
					/>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
					/>
				</svg>
				{$t('common.profile.view_public_profile')}
			</button>
			<button
				class="btn btn-outline w-full md:w-auto"
				onclick={openShareModal}
				disabled={!userNpub}
			>
				<svg
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8.684 13.342c-.396 0-.72-.324-.72-.72 0-.396.324-.72.72-.72.396 0 .72.324.72.72 0 .396-.324.72-.72.72zm0-2.829c-.747 0-1.355.608-1.355 1.355 0 .747.608 1.355 1.355 1.355.747 0 1.355-.608 1.355-1.355 0-.747-.608-1.355-1.355-1.355zm6.564 0c-.396 0-.72-.324-.72-.72 0-.396.324-.72.72-.72.396 0 .72.324.72.72 0 .396-.324.72-.72.72zm0-2.829c-.747 0-1.355.608-1.355 1.355 0 .747.608 1.355 1.355 1.355.747 0 1.355-.608 1.355-1.355 0-.747-.608-1.355-1.355-1.355z"
					/>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
					/>
				</svg>
				{$t('common.profile.share_profile')}
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

<!-- Share Modal -->
{#if showShareModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<div class="mb-6">
				<h3 class="text-lg font-bold">{$t('common.profile.share_profile')}</h3>
			</div>

			<div class="space-y-4">
				<!-- QR Code -->
				<div class="flex flex-col items-center">
					{#if qrCodeLoading}
						<div class="flex h-64 w-64 items-center justify-center">
							<span class="loading loading-spinner loading-lg"></span>
						</div>
					{:else if qrCodeError}
						<div class="alert alert-error alert-outline">
							<span>{qrCodeError}</span>
						</div>
					{:else if qrCodeDataUrl}
						<img src={qrCodeDataUrl} alt="Profile QR Code" class="h-64 w-64" />
					{/if}
				</div>

				<!-- Copy Link Button -->
				<button class="btn btn-primary btn-block" onclick={copyProfileLink}>
					{#if copyLinkSuccess}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						{$t('common.profile.copied')}
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
						{$t('common.profile.copy_link')}
					{/if}
				</button>

				<!-- Copy npub Button -->
				<button class="btn btn-outline btn-block" onclick={copyNpub}>
					{#if copyNpubSuccess}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						{$t('common.profile.copied')}
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
						{$t('common.profile.copy_npub')}
					{/if}
				</button>
			</div>

			<div class="modal-action">
				<button class="btn btn-ghost" onclick={closeShareModal}>
					{$t('common.close')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={closeShareModal}>X</button>
	</div>
{/if}
