<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { profileStore } from '$lib/stores/profile.store';
	import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
	import ProfileStats from '$lib/components/profile/ProfileStats.svelte';
	import ProfileInfoSection from '$lib/components/profile/ProfileInfoSection.svelte';
	import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
	import ProfileReviewsSection from '$lib/components/profile/ProfileReviewsSection.svelte';

	// Format date (passed to children)
	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	// Calculate years from date (passed to children)
	function yearsFrom(dateString: string) {
		const then = new Date(dateString);
		const now = new Date();
		return now.getFullYear() - then.getFullYear();
	}

	// Initialize profile store
	onMount(() => {
		profileStore.init();
	});

	// Cleanup on destroy
	onDestroy(() => {
		profileStore.destroy();
	});

	// Tab management
	let activeTab = $state<'overview' | 'reviews'>('overview');
</script>

<div class="mx-auto max-w-6xl px-2 pt-2  md:px-0">
	<div class="mb-8">
		<h3 class="text-2xl font-bold mb-2">{$t('profile.page.title')}</h3>
		<p class="text-base-content/70 text-lg">{$t('profile.page.description')}</p>
	</div>
	<div class="bg-base-100 rounded-xl p-8 shadow-lg">
		<ProfileHeader />

		<ProfileStats stats={$profileStore.stats} />

		<!-- Profile Tabs -->
		<div class="tabs tabs-boxed bg-base-200 mb-6">
			<button
				class="tab {activeTab === 'overview' ? 'tab-active' : ''}"
				onclick={() => activeTab = 'overview'}
			>
				{$t('profile.tabs.overview')}
			</button>
			<button
				class="tab {activeTab === 'reviews' ? 'tab-active' : ''}"
				onclick={() => activeTab = 'reviews'}
			>
				{$t('profile.tabs.reviews')}
			</button>
		</div>

		<!-- Tab Content -->
		{#if activeTab === 'overview'}
			<ProfileInfoSection {formatDate} {yearsFrom} />
			<ProfileSidebar {formatDate} />
		{:else if activeTab === 'reviews'}
			<ProfileReviewsSection isCurrentUser={true} />
		{/if}
	</div>
</div>
