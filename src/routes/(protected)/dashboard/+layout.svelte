<script lang="ts">
	import { devicePlatform } from '$lib/stores/device.store';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';
	import { t } from 'svelte-i18n';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
import IconMagnify from '~icons/mdi/magnify';
import IconBriefcaseSearch from '~icons/mdi/briefcase-search';
import IconInvoiceTextSendOutline from '~icons/mdi/invoice-text-send-outline';
	import IconFileSign from '~icons/mdi/file-sign';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconAccount from '~icons/mdi/account';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconCog from '~icons/mdi/cog';
	import WarningPopup from '$lib/components/WarningPopup.svelte';

	let { children } = $props();

	let width = $state(375);
</script>

<svelte:head>
	<title>Dashboard | BitTasker</title>
	<meta
		name="description"
		content="Manage your tasks, bids, and wallet on BitTasker's dashboard."
	/>
</svelte:head>

<svelte:window bind:innerWidth={width} />

<div class="bg-base-200 mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden px-2 md:py-4 dashboard-layout">
	<div class="flex min-h-0 flex-1 flex-row gap-8 overflow-hidden">
	{#if $devicePlatform !== 'ios' && $devicePlatform !== 'android' && width >= 1200}
		<!-- Fixed Sidebar - Solo en desktop -->
		<div class="w-full shrink-0 md:w-64">
			<div class="fixed top-24 left-8 z-10 w-60">
				<div class="card bg-base-100 rounded-xl shadow-xl">
					<div class="card-body p-4">
						<ul class="menu bg-base-100 rounded-box w-full">
							{#each sections as section}
								<li class="my-1">
									<a
										data-sveltekit-reload="off"
										href={section.path}
										class:menu-active={page.url.pathname + page.url.search === section.path}
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

		<!-- Main Content with left margin for fixed sidebar -->
		<div class="w-full min-h-0 flex-1 overflow-hidden">
			{@render children()}
			<WarningPopup />
		</div>
	</div>
</div>

<style>
	/* Ensure dashboard layout fills available space without causing scroll */
	.dashboard-layout {
		height: 100%;
		max-height: 100%;
		overflow: hidden;
		flex: 1;
		min-height: 0;
	}
</style>
