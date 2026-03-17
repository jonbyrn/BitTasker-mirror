<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { profileStore } from '$lib/stores/profile.store';
	import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
	import ProfileStats from '$lib/components/profile/ProfileStats.svelte';
	import ProfileServicesSection from '$lib/components/profile/ProfileServicesSection.svelte';
	import ProfileInfoSection from '$lib/components/profile/ProfileInfoSection.svelte';
	import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';

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
</script>

<!-- Mismas dimensiones que Mi Panel -->
<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-8">
		<h3 class="text-2xl font-bold mb-2">{$t('profile.page.title')}</h3>
		<p class="text-base-content/70 text-lg">{$t('profile.page.description')}</p>
	</div>
	<div class="bg-base-100 rounded-xl p-8 shadow-lg">
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

		<ProfileInfoSection {formatDate} />

		<ProfileSidebar {formatDate} />
	</div>
</div>
