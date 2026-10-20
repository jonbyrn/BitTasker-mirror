<script lang="ts">
	import { authState } from '$lib/stores/auth.store';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { user } from '$lib/stores/user.store';
	import { page } from '$app/state';
	import { createDebug } from '$lib/utils/debug';
	import { triggerPendingReviewBanner } from '$lib/utils/reviews';
	import ProtectedLayout from '$lib/components/ProtectedLayout.svelte';

	const { children } = $props();

	onMount(async () => {
		try {
			if (!$authState.isAuthenticated) return;

			await user.getUserData();

			// Restore the tab session. This does not open WebAuthn.
			// A passkey is asked on login, an explicit wallet unlock, and funding.
			const { restoreUnlockedSession } = await import('$lib/utils/nostrKeys');
			await restoreUnlockedSession();

			// Initialize wallet only when the seed is already in this tab.
			const { walletStore, walletManager } = await import('$lib/stores/wallet.store');
			const { appStore } = await import('$lib/stores/app.store');
			const { get } = await import('svelte/store');
			const mnemonicReady = Boolean(get(appStore).nostrKeys.mnemonic);
			let walletState = get(walletStore);

			if (
				mnemonicReady &&
				(!walletState.isConnected || !walletState.rsk?.wallet || !walletState.rsk?.provider)
			) {
				await walletManager.initialize();
				walletState = get(walletStore);
			}

			// Start activity tracking for re-engagement reminders
			const { initActivityTracking } = await import('$lib/utils/activityTracker');
			initActivityTracking();

			// Trigger pending review banner (skip on /reviews)
			if (page.url.pathname !== '/reviews') {
				triggerPendingReviewBanner('reviews.pending.review_now', 'reviews.pending.dismiss');
			}
		} catch (error) {
			const d = createDebug('layout');
			d.error('Error initializing wallet', error);
			// Continue anyway - contracts will handle wallet initialization individually
		}
	});
</script>

<svelte:head>
	<title>{$t('dashboard.hiring.page_title')}</title>
	<meta name="description" content={$t('dashboard.hiring.page_description')} />
</svelte:head>

{#if $authState.isLoading}
	<div class="flex h-dvh w-full flex-col items-center justify-center">
		<span class="loading loading-spinner loading-xl"></span>
		<p>{$t('common.loading')}</p>
	</div>
{:else if $authState.isAuthenticated}
	<ProtectedLayout>
		{@render children()}
	</ProtectedLayout>
{/if}
