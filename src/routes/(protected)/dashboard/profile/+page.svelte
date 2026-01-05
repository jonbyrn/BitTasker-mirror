<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
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

	// Cleanup on destroy
	onDestroy(() => {
		profileStore.destroy();
	});

	// Tab management
	let activeTab = $state<'overview' | 'reviews'>('overview');
</script>

<!-- Mismas dimensiones que Mi Panel -->
<div class="mx-auto h-full max-w-6xl px-4 py-4 md:px-0 md:py-0">
	<div class="mb-2 md:mb-6">
		<h3 class="text-2xl font-bold">{$t('profile.page.title')}</h3>
	</div>
	<div class="bg-base-100 rounded-xl p-4 shadow-lg sm:p-6 md:p-8">
		<ProfileHeader />

		<ProfileStats
			stats={$profileStore.stats}
			serviceCountState={$profileStore.servicesLoading
				? 'loading'
				: $profileStore.servicesError
					? 'error'
					: 'ready'}
		/>
		<ProfileServicesSection />

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
