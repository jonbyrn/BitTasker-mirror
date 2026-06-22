<script lang="ts">
	import { authState } from '$lib/stores/auth.store';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { user } from '$lib/stores/user.store';
	import { devicePlatform } from '$lib/stores/device.store';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';
	import { createDebug } from '$lib/utils/debug';
	import { triggerPendingReviewBanner } from '$lib/utils/reviews';
	import IconTrendingUp from '~icons/mdi/trending-up';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
	import IconMagnify from '~icons/mdi/magnify';
	import IconBriefcaseSearch from '~icons/mdi/briefcase-search';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconAccount from '~icons/mdi/account';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconCog from '~icons/mdi/cog';
	import IconStarOutline from '~icons/mdi/star-outline';
	import IconBellOutline from '~icons/mdi/bell-outline';
	import WarningPopup from '$lib/components/WarningPopup.svelte';
	import NotificationPermissionBanner from '$lib/components/notifications/NotificationPermissionBanner.svelte';

	const { children } = $props();

	let width = $state(375);

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

<svelte:window bind:innerWidth={width} />

{#if $authState.isLoading}
	<div class="flex h-dvh w-full flex-col items-center justify-center">
		<span class="loading loading-spinner loading-xl"></span>
		<p>{$t('common.loading')}</p>
	</div>
{:else if $authState.isAuthenticated}
	<div
		class="bg-base-200 dashboard-layout mx-auto flex h-full min-h-0 w-full flex-col px-2 md:py-4"
	>
		<div class="flex min-h-0 flex-1 flex-row gap-8">
			{#if $devicePlatform !== 'ios' && $devicePlatform !== 'android' && width >= 1200 && page.url.pathname !== '/feedback'}
				<!-- Fixed Sidebar - Solo en desktop -->
				<div class="w-full shrink-0 md:w-64">
					<div class="fixed top-24 left-8 z-10 w-64">
						<div class="card bg-base-100 rounded-xl shadow-xl">
							<div class="card-body p-4">
								<ul class="menu bg-base-100 rounded-box w-full">
									{#each sections as section (section.id)}
										<li class="my-1">
											<a
												data-sveltekit-reload="off"
												href={section.path}
												class:menu-active={page.url.pathname.startsWith(section.path)}
												class="flex items-center gap-3"
											>
												{#if section.icon === 'mdi:briefcase-outline'}
													<IconBriefcaseOutline class="text-primary" />
												{:else if section.icon === 'mdi:trending-up'}
													<IconTrendingUp class="text-primary" />
												{:else if section.icon === 'mdi:plus-circle-outline'}
													<IconPlusCircleOutline class="text-primary" />
												{:else if section.icon === 'mdi:magnify'}
													<IconMagnify class="text-primary" />
												{:else if section.icon === 'mdi:briefcase-search'}
													<IconBriefcaseSearch class="text-primary" />
												{:else if section.icon === 'mdi:wallet-outline'}
													<IconWalletOutline class="text-primary" />
												{:else if section.icon === 'mdi:account'}
													<IconAccount class="text-primary" />
												{:else if section.icon === 'mdi:chat-outline'}
													<IconChatOutline class="text-primary" />
												{:else if section.icon === 'mdi:cog'}
													<IconCog class="text-primary" />
												{:else if section.icon === 'mdi:star-outline'}
													<IconStarOutline class="text-primary" />
												{:else if section.icon === 'mdi:bell-outline'}
													<IconBellOutline class="text-primary" />
												{:else}
													<IconTrendingUp class="text-primary" />
												{/if}
												{$t(section.label)}
											</a>
										</li>
									{/each}
								</ul>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Main Content with left margin for fixed sidebar -->
			<div class="min-h-0 w-full flex-1">
				{@render children()}
				<NotificationPermissionBanner />
				<WarningPopup />
			</div>
		</div>
	</div>
{:else}
	<!-- This shouldn't be seen since the +layout.ts should redirect -->
	<div class="flex h-full w-full flex-col items-center justify-center">
		<p>{$t('common.redirecting_to_login')}</p>
	</div>
{/if}

<style>
	/* Ensure dashboard layout fills available space without causing scroll */
	.dashboard-layout {
		height: 100%;
		max-height: 100%;
		flex: 1;
		min-height: 0;
	}
</style>
