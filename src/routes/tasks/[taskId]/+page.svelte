<script lang="ts">
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import { devicePlatform } from '$lib/stores/device.store';
	import { sections } from '$lib/utils/consts';
	import WarningPopup from '$lib/components/WarningPopup.svelte';
	import TaskDetailsView from '$lib/components/task/TaskDetailsView.svelte';

	// Get taskId from route params
	const taskId = page.params.taskId;

	// Get SEO data from page data
	let { data }: { data } = $props();

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
		<!-- eslint-disable svelte/no-at-html-tags -->
		{@html `<\u{73}cript type="application/ld+json">${JSON.stringify(data.seo.jsonLd)}</script>`}
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
											href={section.path}
											class:menu-active={page.url.pathname + page.url.search === section.path ||
												(section.id === 'find-tasks' && page.url.pathname.startsWith('/tasks'))}
											class="flex items-center gap-3"
										>
											<svelte:component this={section.icon} class="text-primary h-6 w-6" />
											<span class="font-medium">{$t(section.label)}</span>
										</a>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Main Content -->
		<div class="flex-1 overflow-y-auto md:px-4">
			<TaskDetailsView {taskId} />
		</div>
	</div>
{:else}
	<div class="container mx-auto p-4">
		<TaskDetailsView {taskId} />
	</div>
{/if}

<!-- Auth required warning for certain actions can be handled within TaskDetailsView 
     or here via a global event/store -->
<WarningPopup />
