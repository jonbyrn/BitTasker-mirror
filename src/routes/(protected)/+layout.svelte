<script lang="ts">
	import { authState } from '$lib/stores/auth.store';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { user } from '$lib/stores/user.store';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';

	const { children } = $props();

	onMount(async () => {
		await user.getUserData();
		await pushNotificationService.init();
	});
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
