<script lang="ts">
	import type { PageData } from './$types';
	import { t } from 'svelte-i18n';
	import { page } from '$app/state';
	import { authState } from '$lib/stores/auth.store';
	import ProtectedLayout from '$lib/components/ProtectedLayout.svelte';
	import TaskDetailsView from '$lib/components/task/TaskDetailsView.svelte';

	const taskId = page.params.taskId;

	let { data }: { data: PageData } = $props();

	const seo = $derived(
		data?.seo ?? {
			title: 'Task Details - BitTasker',
			description: '',
			keywords: '',
			canonical: '',
			ogTitle: '',
			ogDescription: '',
			ogImage: '',
			twitterTitle: '',
			twitterDescription: '',
			twitterImage: '',
			jsonLd: null
		}
	);

	const jsonLdScript = $derived(
		seo.jsonLd
			? `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</sc` + `ript>`
			: ''
	);
</script>

<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<meta name="keywords" content={seo.keywords} />
	<link rel="canonical" href={seo.canonical} />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />
	<meta property="og:image" content={seo.ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={seo.ogTitle} />
	<meta property="og:site_name" content="BitTasker" />

	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={seo.canonical} />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />
	<meta property="twitter:image" content={seo.twitterImage} />
	<meta property="twitter:image:alt" content={seo.twitterTitle} />
	<meta property="twitter:site" content="@BitTaskerdotcom" />
	<meta property="twitter:creator" content="@BitTaskerdotcom" />

	{#if seo.jsonLd}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html jsonLdScript}
	{/if}
</svelte:head>

{#snippet View()}
	<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
		<TaskDetailsView {taskId} initialTask={data.seo?.task ?? null} />
	</div>
{/snippet}

{#if $authState.isLoading}
	<div class="flex h-dvh w-full flex-col items-center justify-center">
		<span class="loading loading-spinner loading-xl"></span>
		<p>{$t('common.loading')}</p>
	</div>
{:else if $authState.isAuthenticated}
	<ProtectedLayout>
		{@render View()}
	</ProtectedLayout>
{:else}
	{@render View()}
{/if}
