<script lang="ts">
	import { locale } from 'svelte-i18n';
	import LearnPageLayout from '$lib/components/learn/LearnPageLayout.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Select content based on current i18n locale
	const activeContent = $derived(
		$locale === 'es' && data.esContent ? data.esContent : data.content
	);

	const activeLocale = $derived($locale === 'es' && data.esContent ? 'es' : 'en');

	const breadcrumbs = $derived.by(() => {
		const parts = data.contentKey.split('/');
		const crumbs = [
			{ label: activeLocale === 'es' ? 'Inicio' : 'Home', href: '/' },
			{ label: activeLocale === 'es' ? 'Aprender' : 'Learn', href: '/learn/' }
		];
		if (parts.length > 1) {
			const pillarName = parts[0]
				.replace(/-/g, ' ')
				.replace(/\b\w/g, (c: string) => c.toUpperCase());
			crumbs.push({ label: pillarName, href: `/learn/${parts[0]}/` });
		}
		return crumbs;
	});
</script>

<LearnPageLayout
	content={activeContent}
	seo={data.seo}
	locale={activeLocale}
	lastUpdated={data.lastUpdated}
	{breadcrumbs}
/>
