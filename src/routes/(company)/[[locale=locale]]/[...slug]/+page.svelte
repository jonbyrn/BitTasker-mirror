<script lang="ts">
	import LearnPageLayout from '$lib/components/learn/LearnPageLayout.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Derive breadcrumbs from content key
	let breadcrumbs = $derived(() => {
		const parts = data.contentKey.split('/');
		const crumbs = [
			{ label: 'Home', href: '/' },
			{ label: 'Learn', href: '/learn/' }
		];

		// Add pillar crumb if there's a sub-path
		if (parts.length > 1) {
			const pillarName = parts[0]
				.replace(/-/g, ' ')
				.replace(/\b\w/g, (c: string) => c.toUpperCase());
			const prefix = data.locale === 'es' ? 'aprende' : 'learn';
			crumbs.push({ label: pillarName, href: `/${prefix}/${parts[0]}/` });
		}

		return crumbs;
	});
</script>

<LearnPageLayout
	content={data.content}
	seo={data.seo}
	locale={data.locale}
	lastUpdated={data.lastUpdated}
	breadcrumbs={breadcrumbs()}
/>
