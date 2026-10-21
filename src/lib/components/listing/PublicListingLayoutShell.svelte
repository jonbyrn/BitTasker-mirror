<script lang="ts">
	import { devicePlatform } from '$lib/stores/device.store';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import { user } from '$lib/stores/user.store';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
	import IconMagnify from '~icons/mdi/magnify';
	import IconBriefcaseSearch from '~icons/mdi/briefcase-search';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconInvoiceTextSendOutline from '~icons/mdi/invoice-text-send-outline';
	import IconFileSign from '~icons/mdi/file-sign';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconAccount from '~icons/mdi/account';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconCog from '~icons/mdi/cog';
	import IconTrendingUp from '~icons/mdi/trending-up';
	import IconStarOutline from '~icons/mdi/star-outline';

	let {
		layoutClassName = 'listing-layout',
		activeSectionId,
		activeBasePath,
		isDetailsRoute = false,
		children
	} = $props<{
		layoutClassName?: string;
		activeSectionId: string;
		activeBasePath: string;
		isDetailsRoute?: boolean;
		children?: import('svelte').Snippet;
	}>();

	let width = $state(375);
	const showAccountNav = $derived(
		Boolean($authState.isAuthenticated && $user?.npub) &&
			$devicePlatform !== 'ios' &&
			$devicePlatform !== 'android' &&
			width >= 1200 &&
			!isDetailsRoute
	);

	function isSectionActive(sectionId: string, sectionPath: string): boolean {
		return (
			page.url.pathname + page.url.search === sectionPath ||
			(sectionId === activeSectionId && page.url.pathname === activeBasePath)
		);
	}
</script>

<svelte:window bind:innerWidth={width} />

<div
	class={`${layoutClassName} bg-base-200 mx-auto flex h-full min-h-0 w-full flex-col px-2 md:py-4`}
>
	<div class="flex min-h-0 flex-1 flex-row" class:gap-8={showAccountNav}>
		{#if showAccountNav}
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
											class:menu-active={isSectionActive(section.id, section.path)}
											class="flex items-center gap-3"
										>
											{#if section.icon === 'mdi:format-list-bulleted'}
												<IconFormatListBulleted class="text-primary" />
											{:else if section.icon === 'mdi:plus-circle-outline'}
												<IconPlusCircleOutline class="text-primary" />
											{:else if section.icon === 'mdi:magnify'}
												<IconMagnify class="text-primary" />
											{:else if section.icon === 'mdi:briefcase-search'}
												<IconBriefcaseSearch class="text-primary" />
											{:else if section.icon === 'mdi:briefcase-outline'}
												<IconBriefcaseOutline class="text-primary" />
											{:else if section.icon === 'mdi:invoice-text-send-outline'}
												<IconInvoiceTextSendOutline class="text-primary" />
											{:else if section.icon === 'mdi:file-sign'}
												<IconFileSign class="text-primary" />
											{:else if section.icon === 'mdi:wallet-outline'}
												<IconWalletOutline class="text-primary" />
											{:else if section.icon === 'mdi:account'}
												<IconAccount class="text-primary" />
											{:else if section.icon === 'mdi:chat-outline'}
												<IconChatOutline class="text-primary" />
											{:else if section.icon === 'mdi:cog'}
												<IconCog class="text-primary" />
											{:else if section.icon === 'mdi:trending-up'}
												<IconTrendingUp class="text-primary" />
											{:else if section.icon === 'mdi:star-outline'}
												<IconStarOutline class="text-primary" />
											{:else}
												<IconFormatListBulleted class="text-primary" />
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

		<div class="min-h-0 w-full flex-1" data-testid={isDetailsRoute ? 'listing-detail' : undefined}>
			{@render children?.()}
		</div>
	</div>
</div>

<style>
	:global(.listing-layout),
	:global(.tasks-layout),
	:global(.services-layout) {
		height: 100%;
		max-height: 100%;
		flex: 1;
		min-height: 0;
	}
</style>
