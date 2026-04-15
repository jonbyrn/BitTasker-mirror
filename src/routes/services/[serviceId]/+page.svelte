<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import ServiceDetailsView from '$lib/components/service/ServiceDetailsView.svelte';
	import { authState } from '$lib/stores/auth.store';
	import { devicePlatform } from '$lib/stores/device.store';
	import { sections } from '$lib/utils/consts';
	import WarningPopup from '$lib/components/WarningPopup.svelte';
	// Icon imports for unplugin-icons
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
	import type { PageData } from './$types';

	// Get serviceId from route params
	const serviceId = page.params.serviceId;

	// Get SEO data from page data
	let { data }: { data: PageData } = $props();

	// Layout state
	let width = $state(375);

	const seo = $derived(
		data.seo ?? {
			title: $t('dashboard.services.detail.seo.page_title'),
			description: $t('dashboard.services.detail.seo.page_description'),
			keywords: '',
			canonical: '',
			robots: 'noindex, follow',
			ogType: 'website',
			ogTitle: $t('dashboard.services.detail.seo.page_title'),
			ogDescription: $t('dashboard.services.detail.seo.page_description'),
			ogImage: '',
			ogImageAlt: $t('dashboard.services.detail.seo.image_alt', {
				values: { title: 'BitTasker' }
			}),
			twitterCard: 'summary_large_image',
			twitterTitle: $t('dashboard.services.detail.seo.page_title'),
			twitterDescription: $t('dashboard.services.detail.seo.page_description'),
			twitterImage: '',
			twitterImageAlt: $t('dashboard.services.detail.seo.image_alt', {
				values: { title: 'BitTasker' }
			}),
			jsonLd: null
		}
	);
</script>

<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<meta name="keywords" content={seo.keywords} />
	<meta name="robots" content={seo.robots} />
	<link rel="canonical" href={seo.canonical} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content={seo.ogType} />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />
	<meta property="og:image" content={seo.ogImage} />
	<meta property="og:image:secure_url" content={seo.ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={seo.ogImageAlt} />
	<meta property="og:site_name" content="BitTasker" />

	<!-- Twitter -->
	<meta name="twitter:card" content={seo.twitterCard} />
	<meta name="twitter:url" content={seo.canonical} />
	<meta name="twitter:title" content={seo.twitterTitle} />
	<meta name="twitter:description" content={seo.twitterDescription} />
	<meta name="twitter:image" content={seo.twitterImage} />
	<meta name="twitter:image:alt" content={seo.twitterImageAlt} />
	<meta name="twitter:site" content="@BitTaskerdotcom" />
	<meta name="twitter:creator" content="@BitTaskerdotcom" />

	<!-- Structured Data -->
	{#if seo.jsonLd}
		<script type="application/ld+json">
{JSON.stringify(seo.jsonLd)}
		</script>
	{/if}
</svelte:head>

<svelte:window bind:innerWidth={width} />

{#if $authState.isAuthenticated}
	<!-- Mismas dimensiones que Mi Panel -->
	<div
		class="dashboard-layout bg-base-200 mx-auto flex h-full w-full flex-row gap-8 overflow-hidden px-2 md:py-4"
	>
		{#if $devicePlatform !== 'ios' && $devicePlatform !== 'android' && width >= 1200}
			<!-- Fixed Sidebar - Only on desktop; max-h + overflow para que no se desborde -->
			<div class="w-full shrink-0 md:w-64">
				<div class="fixed top-24 left-8 z-10 max-h-[calc(100dvh-6rem)] w-56 overflow-y-auto">
					<div class="card bg-base-100 rounded-xl shadow-xl">
						<div class="card-body p-4">
							<ul class="menu bg-base-100 rounded-box w-full">
								{#each sections as section (section.id)}
									<li class="my-1">
										<a
											data-sveltekit-reload="off"
											href={resolve(section.path)}
											class:menu-active={page.url.pathname + page.url.search === section.path ||
												(section.id === 'find-tasks' && page.url.pathname.startsWith('/tasks')) ||
												(section.id === 'find-services' &&
													page.url.pathname.startsWith('/services'))}
											class="flex items-center gap-3 {section.indent ? 'pl-6' : ''}"
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

		<!-- Main Content - mismas dimensiones que Mi Panel -->
		<div class="min-h-0 w-full flex-1 overflow-hidden">
			<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
				<ServiceDetailsView
					service={data.service ?? null}
					serviceId={data.serviceId ?? serviceId}
				/>
			</div>
		</div>
	</div>
	<WarningPopup />
{:else}
	<!-- Simple layout for non-logged-in users -->
	<ServiceDetailsView service={data.service ?? null} serviceId={data.serviceId ?? serviceId} />
{/if}
