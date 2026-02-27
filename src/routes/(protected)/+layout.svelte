<script lang="ts">
	import { page } from '$app/stores';
	import { authState } from '$lib/stores/auth.store';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { user } from '$lib/stores/user.store';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import ReauthModal from '$lib/components/auth/ReauthModal.svelte';

	const { children } = $props();

	const reauthRequired = $derived($page.data?.reauthRequired === true);
	const reauthData = $derived(
		$page.data?.allowCredentialIds != null && $page.data?.currentPath != null
			? { allowCredentialIds: $page.data.allowCredentialIds as string[], currentPath: $page.data.currentPath as string }
			: null
	);

	onMount(async () => {
		// Only fetch user data and init push notifications if authenticated
		if ($authState.isAuthenticated) {
			await user.getUserData();
			await pushNotificationService.init();
		}
	});
</script>

{#if reauthRequired && reauthData}
	<ReauthModal allowCredentialIds={reauthData.allowCredentialIds} currentPath={reauthData.currentPath} />
{:else if $authState.isLoading}
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
