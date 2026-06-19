<script lang="ts">
	import { getContext } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { t } from 'svelte-i18n';
	import AccActions from '$lib/components/settings/AccActions.svelte';

	const settings = getContext<{
		loading: boolean;
		error: string;
	}>('settings');
</script>

<div in:fly={{ x: 300, duration: 250, easing: cubicOut }}>
	<div class="mb-4">
		<a href="/settings" class="btn btn-sm bg-base-200 border-base-300 gap-2 border">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg
			>
			{$t('settings.back')}
		</a>
	</div>

	{#if !settings.loading && !settings.error}
		<div class="settings-sub-content bg-base-100 rounded-xl p-4 shadow-lg">
			<AccActions />
		</div>
	{/if}
</div>
