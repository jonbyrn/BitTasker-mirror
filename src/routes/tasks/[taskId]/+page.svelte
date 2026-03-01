<script lang="ts">
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import TaskDetailsView from '$lib/components/task/TaskDetailsView.svelte';
	import { authState } from '$lib/stores/auth.store';
	import { devicePlatform } from '$lib/stores/device.store';
	import { sections } from '$lib/utils/consts';
	import WarningPopup from '$lib/components/WarningPopup.svelte';
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
	import type { PageData } from './$types';

	// Get taskId from route params
	const taskId = page.params.taskId;
	
	// Get SEO data from page data
	let { data }: { data: PageData } = $props();

	// Check if user is logged in

	// Layout state
	let width = $state(375);
</script>

<svelte:head>
	<title>{data.seo.title}</title>
	<meta name="description" content={data.seo.description} />
	<meta name="keywords" content={data.seo.keywords} />
	<link rel="canonical" href={data.seo.canonical} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={data.seo.canonical} />
	<meta property="og:title" content={data.seo.ogTitle} />
	<meta property="og:description" content={data.seo.ogDescription} />
	<meta property="og:image" content={data.seo.ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={data.seo.ogTitle} />
	<meta property="og:site_name" content="BitTasker" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={data.seo.canonical} />
	<meta property="twitter:title" content={data.seo.twitterTitle} />
	<meta property="twitter:description" content={data.seo.twitterDescription} />
	<meta property="twitter:image" content={data.seo.twitterImage} />
	<meta property="twitter:image:alt" content={data.seo.twitterTitle} />
	<meta property="twitter:site" content="@BitTaskerdotcom" />
	<meta property="twitter:creator" content="@BitTaskerdotcom" />

	<!-- Structured Data -->
	{#if data.seo.jsonLd}
		{@html `<script type="application/ld+json">${JSON.stringify(data.seo.jsonLd)}</script>`}
	{/if}
</svelte:head>

<svelte:window bind:innerWidth={width} />

{#if $authState.isAuthenticated}
	<!-- Mismas dimensiones que Mi Panel -->
	<div class="dashboard-layout bg-base-200 mx-auto flex h-full w-full flex-row gap-8 overflow-hidden px-2 md:py-4">
		{#if $devicePlatform !== 'ios' && $devicePlatform !== 'android' && width >= 1200}
			<!-- Fixed Sidebar - Only on desktop; max-h + overflow para que no se desborde -->
			<div class="w-full shrink-0 md:w-64">
				<div class="fixed top-24 left-8 z-10 w-56 max-h-[calc(100dvh-6rem)] overflow-y-auto">
					<div class="card bg-base-100 rounded-xl shadow-xl">
						<div class="card-body p-4">
							<ul class="menu bg-base-100 rounded-box w-full">
								{#each sections as section}
									<li class="my-1">
										<a
											data-sveltekit-reload="off"
											href={section.path}
											class:menu-active={page.url.pathname + page.url.search === section.path || (section.id === 'find-tasks' && page.url.pathname.startsWith('/tasks'))}
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

		<!-- Main Content - mismas dimensiones que Mi Panel -->
		<div class="min-h-0 w-full flex-1 overflow-hidden">
			<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
				<TaskDetailsView {taskId} />
			</div>
		</div>
	</div>
	<WarningPopup />
{:else}
	<!-- Simple layout for non-logged-in users -->
	<TaskDetailsView {taskId} />
{/if}
