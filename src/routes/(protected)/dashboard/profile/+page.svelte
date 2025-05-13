<script lang="ts">
	import { goto } from '$app/navigation';
	import { authState } from '$lib/stores/auth.store.js';
	import ProfileHeader from './_components/ProfileHeader.svelte';
	import ProfileStats from './_components/ProfileStats.svelte';
	import ProfileInfoSection from './_components/ProfileInfoSection.svelte';
	import ProfileSidebar from './_components/ProfileSidebar.svelte';

	// Edit mode state - Managed by the parent page
	let isEditMode = $state(false);

	// Toggle edit mode
	function toggleEditMode() {
		isEditMode = !isEditMode;
	}

	// Save profile changes
	function saveProfile() {
		// TODO: Implement actual save logic.
		console.log('Saving profile changes... (gather state from children or use store)');
		isEditMode = false;
	}

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

	// Logout (passed to children)
	const logout = async () => {
		await authState.logout();
		goto('/');
	};
</script>

<div class="mx-auto max-w-5xl">
	<div class="bg-base-100 mb-6 rounded-lg p-6 shadow-lg">
		<ProfileHeader {isEditMode} {toggleEditMode} {saveProfile} {logout} />

		<!-- Rest here is static content -->
		<ProfileStats />

		<div class="flex flex-col gap-8 lg:flex-row">
			<ProfileInfoSection {isEditMode} {formatDate} {yearsFrom} />

			<ProfileSidebar {formatDate} />
		</div>
	</div>
</div>
