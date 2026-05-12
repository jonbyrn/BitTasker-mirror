<script lang="ts">
	import { profileStore } from '$lib/stores/profile.store';
	import { t } from 'svelte-i18n';
</script>

<!-- Profile Sidebar -->
<div class="flex-1">
	{#if $profileStore.isLoading}
		<div class="space-y-6">
			<div class="animate-pulse space-y-4">
				<div class="bg-base-300 h-6 w-48 rounded"></div>
				<div class="bg-base-300 h-4 w-full rounded"></div>
				<div class="bg-base-300 h-4 w-3/4 rounded"></div>
			</div>
		</div>
	{:else if $profileStore.error}
		<div class="alert alert-outline alert-error">
			<span>{$t('profile_availability.error_load')}</span>
		</div>
	{/if}
</div>
