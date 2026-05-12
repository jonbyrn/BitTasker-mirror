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

	function getRequestedTabFromUrl(url: URL): 'overview' | 'reviews' {
		return url.searchParams.get('tab') === 'reviews' ? 'reviews' : 'overview';
	}

	function getReviewTargetPubkeyFromUrl(url: URL): string | undefined {
		const user = url.searchParams.get('user')?.trim();
		return user || undefined;
	}

	// Tab management
	let activeTab = $state<'overview' | 'reviews'>(
		getReviewTargetPubkeyFromUrl(page.url) ? 'reviews' : getRequestedTabFromUrl(page.url)
	);
	let lastSyncedSearch = $state('');
	const reviewTargetPubkey = $derived.by(() => {
		return getReviewTargetPubkeyFromUrl(page.url);
	});
	const isOtherUserReviewsView = $derived(Boolean(reviewTargetPubkey));
	const requestedTab = $derived<'overview' | 'reviews'>(getRequestedTabFromUrl(page.url));

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

	$effect(() => {
		const currentSearch = page.url.search;

		if (currentSearch === lastSyncedSearch) {
			return;
		}

		lastSyncedSearch = currentSearch;
		activeTab = reviewTargetPubkey ? 'reviews' : requestedTab;
	});
</script>

<!-- Mismas dimensiones que Mi Panel -->
<div class="mx-auto h-full max-w-6xl py-4 md:px-0 md:py-0">
	<div class="mb-6">
		<h3 class="font-bold">{$t('profile.page.title')}</h3>
	</div>
	<div class="bg-base-100 rounded-xl p-8 shadow-lg">
		{#if isOtherUserReviewsView}
			<ProfileReviewsSection userPubkey={reviewTargetPubkey} isCurrentUser={false} />
		{:else}
			<ProfileHeader />

			<!-- Profile Tabs -->
			<div class="tabs tabs-bordered mb-6 grid w-full grid-cols-2">
				<button
					class="tab text-center {activeTab === 'overview' ? 'tab-active' : ''}"
					onclick={() => (activeTab = 'overview')}
					role="tab"
					aria-selected={activeTab === 'overview'}
				>
					{$t('profile.tabs.overview')}
				</button>
				<button
					class="tab text-center {activeTab === 'reviews' ? 'tab-active' : ''}"
					onclick={() => (activeTab = 'reviews')}
					role="tab"
					aria-selected={activeTab === 'reviews'}
				>
					{$t('profile.tabs.reviews')}
				</button>
			</div>

			<!-- Tab Content -->
			{#if activeTab === 'overview'}
				<ProfileInfoSection {formatDate} />
				<ProfileSidebar />
			{:else if activeTab === 'reviews'}
				<ProfileReviewsSection isCurrentUser={true} />
			{/if}
		{/if}
	</div>
</div>
