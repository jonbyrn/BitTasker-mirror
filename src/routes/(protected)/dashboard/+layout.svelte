<script lang="ts">
	import { devicePlatform } from '$lib/stores/device.store';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';
	import { t } from 'svelte-i18n';
	// Icon imports for unplugin-icons
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
	import IconMagnify from '~icons/mdi/magnify';
	import IconInvoiceTextSendOutline from '~icons/mdi/invoice-text-send-outline';
	import IconFileSign from '~icons/mdi/file-sign';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconAccount from '~icons/mdi/account';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconCog from '~icons/mdi/cog';

	let { children } = $props();

	let width = $state(375);
	let activeSection = $state('');

	// Icon mapping function for dynamic icon rendering
	function getIconComponent(iconName: string) {
		const iconMap = {
			'mdi:format-list-bulleted': IconFormatListBulleted,
			'mdi:plus-circle-outline': IconPlusCircleOutline,
			'mdi:magnify': IconMagnify,
			'mdi:invoice-text-send-outline': IconInvoiceTextSendOutline,
			'mdi:file-sign': IconFileSign,
			'mdi:wallet-outline': IconWalletOutline,
			'mdi:account': IconAccount,
			'mdi:chat-outline': IconChatOutline,
			'mdi:cog': IconCog
		};
		return iconMap[iconName as keyof typeof iconMap] || IconFormatListBulleted;
	}

	// Create a reactive component map for Svelte 5 compatibility
	let iconComponents = $derived.by(() => {
		const components = new Map();
		sections.forEach((section) => {
			components.set(section.icon, getIconComponent(section.icon));
		});
		return components;
	});

	$effect(() => {
		const section = page.url.pathname.split('/dashboard/')[1] || '';
		activeSection = section;
	});
</script>

<svelte:head>
	<title>Dashboard | BitTasker</title>
	<meta
		name="description"
		content="Manage your tasks, bids, and wallet on BitTasker's dashboard."
	/>
</svelte:head>

<svelte:window bind:innerWidth={width} />

<div class="bg-base-200 mx-auto flex h-full w-full flex-row gap-8 px-2 md:py-4">
	{#if $devicePlatform !== 'ios' && $devicePlatform !== 'android' && width >= 1200}
		<!-- Fixed Sidebar - Solo en desktop -->
		<div class="w-full flex-shrink-0 md:w-64">
			<div class="fixed top-24 left-8 z-10 w-56">
				<div class="card bg-base-100 rounded-xl shadow-xl">
					<div class="card-body p-4">
						<ul class="menu bg-base-100 rounded-box w-full">
							{#each sections as section}
								<li class="my-1">
									<a
										data-sveltekit-reload="off"
										href="/dashboard/{section.id}"
										class:menu-active={activeSection === section.id}
										class="flex items-center gap-3"
									>
									{#if section.icon === 'mdi:format-list-bulleted'}
										<IconFormatListBulleted class="text-primary" />
									{:else if section.icon === 'mdi:plus-circle-outline'}
										<IconPlusCircleOutline class="text-primary" />
									{:else if section.icon === 'mdi:magnify'}
										<IconMagnify class="text-primary" />
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
	<div class="min-h-0 w-full flex-1">
		{@render children()}
	</div>
</div>
