<script lang="ts">
	import { page } from '$app/state';
	import { locale } from 'svelte-i18n';
	import { routeDocumentTitle } from '$lib/seo/route-titles';

	let { fallback = 'BitTasker' }: { fallback?: string } = $props();

	const title = $derived.by(() => {
		const boot =
			typeof document === 'undefined' ? '' : document.documentElement.dataset.btLocale || '';
		const lang = String($locale || boot || 'en');
		return routeDocumentTitle(page.url.pathname, lang) || fallback;
	});
</script>

<title>{title}</title>
