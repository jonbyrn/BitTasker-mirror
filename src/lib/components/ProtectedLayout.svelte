<script lang="ts">
	import { authState } from '$lib/stores/auth.store';
	import { devicePlatform } from '$lib/stores/device.store';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';
	import { t } from 'svelte-i18n';
	import WarningPopup from '$lib/components/WarningPopup.svelte';
	import NotificationPermissionBanner from '$lib/components/notifications/NotificationPermissionBanner.svelte';
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

	const { children } = $props();

	let width = $state(375);

	const showSidebar = $derived(
		$authState.isAuthenticated &&
			$devicePlatform !== 'ios' &&
			$devicePlatform !== 'android' &&
			width >= 1200 &&
			page.url.pathname !== '/feedback'
	);
</script>

<svelte:window bind:innerWidth={width} />

<div class="protected-layout bg-base-200 mx-auto flex h-full min-h-0 w-full flex-col px-2 md:py-4">
	<div class="flex min-h-0 flex-1 flex-row gap-8">
		{#if showSidebar}
			<div class="w-full shrink-0 md:w-64">
				<div class="fixed top-24 left-8 z-10 max-h-[calc(100dvh-6rem)] w-64 overflow-y-auto">
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

		<div class="min-h-0 w-full flex-1">
			{@render children?.()}
			<NotificationPermissionBanner />
		</div>
	</div>
</div>
<WarningPopup />

<style>
	.protected-layout {
		height: 100%;
		max-height: 100%;
		flex: 1;
		min-height: 0;
	}
</style>
