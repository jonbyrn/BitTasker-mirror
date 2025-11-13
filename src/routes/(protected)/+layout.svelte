<script lang="ts">
	import { authState } from '$lib/stores/auth.store';
	import { t } from 'svelte-i18n';
	const { children } = $props();
</script>

{#if $authState.isLoading}
	<div class="flex h-dvh w-full flex-col items-center justify-center">
		<span class="loading loading-spinner loading-xl"></span>
		<p>{$t('common.loading')}</p>
	</div>
{:else if $authState.isAuthenticated}
	{@render children()}
{:else}
	<!-- This shouldn't be seen since the +layout.ts should redirect -->
	<div class="flex h-full w-full flex-col items-center justify-center">
		<p>{$t('common.redirecting_to_login')}</p>
	</div>
{/if}
