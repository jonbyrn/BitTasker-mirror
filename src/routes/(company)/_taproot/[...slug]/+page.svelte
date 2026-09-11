<script lang="ts">
	import { locale } from 'svelte-i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const title = $derived($locale === 'es' ? 'Contenido no disponible' : 'Content unavailable');
	const description = $derived(
		$locale === 'es'
			? 'Esta pagina de aprendizaje esta deshabilitada temporalmente.'
			: 'This learn page is temporarily disabled.'
	);
</script>

<svelte:head>
	<title>{data.seo.title}</title>
	<meta name="description" content={data.seo.description} />
</svelte:head>

<section class="mx-auto flex min-h-[50vh] max-w-3xl flex-col justify-center px-6 py-16">
	<p class="text-base-content/60 text-sm">{data.contentKey}</p>
	<h1 class="mt-3 text-3xl font-bold">{title}</h1>
	<p class="text-base-content/70 mt-4">{description}</p>
</section>
