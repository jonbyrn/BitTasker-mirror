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

			// Eagerly load all keys — caches in appStore for all child routes.
			// This MUST happen before wallet init so getMnemonic()/getNostrKeyPair()
			// hit Tier 1 cache and never race with each other.
			const { getAllKeys } = await import('$lib/utils/nostrKeys');
			await getAllKeys();

			// Initialize wallet — keys are now cached, so getMnemonic() and
			// getNostrKeyPair() inside walletManager.initialize() return instantly.
			const { walletStore, walletManager } = await import('$lib/stores/wallet.store');
			const { get } = await import('svelte/store');
			let walletState = get(walletStore);

			if (!walletState.isConnected || !walletState.rsk?.wallet || !walletState.rsk?.provider) {
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
