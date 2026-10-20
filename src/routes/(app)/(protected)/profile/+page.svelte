<script lang="ts">
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { profileStore } from '$lib/stores/profile.store';
	import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
	import ProfileInfoSection from '$lib/components/profile/ProfileInfoSection.svelte';
	import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
	import ProfileReviewsSection from '$lib/components/profile/ProfileReviewsSection.svelte';

	// Format date (passed to children)
	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	// Initialize profile store
	onMount(() => {
		profileStore.init();
	});

	function getReviewTargetPubkeyFromUrl(url: URL): string | undefined {
		const user = url.searchParams.get('user')?.trim();
		return user || undefined;
	}

	const reviewTargetPubkey = $derived.by(() => {
		return getReviewTargetPubkeyFromUrl(page.url);
	});
	const isOtherUserReviewsView = $derived(Boolean(reviewTargetPubkey));

	let profileStoreInitialized = false;

	$effect(() => {
		if (isOtherUserReviewsView) {
			if (profileStoreInitialized) {
				profileStore.destroy();
				profileStoreInitialized = false;
			}
			return;
		}

		if (!profileStoreInitialized) {
			profileStore.init();
			profileStoreInitialized = true;
		}

		return () => {
			if (profileStoreInitialized) {
				profileStore.destroy();
				profileStoreInitialized = false;
			}
		};
	});
</script>

<!-- Mismas dimensiones que Mi Panel -->
<div class="mx-auto h-full w-full max-w-6xl min-w-0 px-4 py-4 md:py-0">
	<div class="mb-6">
		<h3 class="font-bold">{$t('profile.page.title')}</h3>
	</div>
	<div class="bg-base-100 min-w-0 overflow-hidden rounded-xl p-4 shadow-lg sm:p-8">
		{#if isOtherUserReviewsView}
			<ProfileReviewsSection userPubkey={reviewTargetPubkey} isCurrentUser={false} />
		{:else}
			<ProfileHeader />
			<ProfileInfoSection {formatDate} />
			<ProfileSidebar />
		{/if}
	</div>
</div>
