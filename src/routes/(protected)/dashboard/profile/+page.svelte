<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store.js';
	import { profileStore } from '$lib/stores/profile.store';
	import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
	import ProfileStats from '$lib/components/profile/ProfileStats.svelte';
	import ProfileInfoSection from '$lib/components/profile/ProfileInfoSection.svelte';
	import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';

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
</script>

<div class="mx-auto max-w-7xl p-4">
	<div class="mb-6">
		<h3 class="">{$t('profile.page.title')}</h3>
		<p class="text-base-content/70">{$t('profile.page.description')}</p>
	</div>
	<div class="bg-base-100 rounded-xl p-6 shadow-lg">
		<ProfileHeader />

		<ProfileStats stats={$profileStore.stats} />

		<ProfileInfoSection {formatDate} {yearsFrom} />

		<ProfileSidebar {formatDate} />
	</div>
</div>
