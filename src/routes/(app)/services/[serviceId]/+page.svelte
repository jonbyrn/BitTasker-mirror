<script lang="ts">
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import { appStore } from '$lib/stores/app.store';
	import ProtectedLayout from '$lib/components/ProtectedLayout.svelte';
	import ServiceDetailsView from '$lib/components/service/ServiceDetailsView.svelte';
	import { publishServiceQuoteRequest } from '$lib/utils/service-quote/publish';
	import { generateServiceQuoteEntityId } from '$lib/utils/service-quote/protocol';
	import type { QuoteRequestPayload } from '$lib/types/service.d';
	import type { PageData } from './$types';

	// Get serviceId from route params
	const serviceId = page.params.serviceId;

	// Get SEO data from page data
	let { data }: { data: PageData } = $props();

	const seo = $derived(
		data?.seo ?? {
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
	async function handleQuoteSubmit(
		payload: QuoteRequestPayload
	): Promise<{ success: boolean; error?: string }> {
		const service = data.service;
		if (!service) {
			return { success: false, error: $t('dashboard.services.detail.not_found') };
		}

		const result = await publishServiceQuoteRequest({
			service,
			payload,
			quoteRequestId: generateServiceQuoteEntityId('qr'),
			sideEffects: { dmMirror: true }
		});
		if (!result.event?.content?.quoteRequestId) {
			return {
				success: false,
				error: $t('dashboard.services.detail.quote_request_submit_error')
			};
		}

		appStore.showSuccessToast($t('dashboard.services.detail.quote_submitted'));
		return { success: true };
	}

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
	{#if jsonLdScript}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html jsonLdScript}
	{/if}
</svelte:head>

{#snippet View()}
	<div class="mx-auto h-full py-6 md:px-0 md:py-0">
		<ServiceDetailsView
			service={data.service ?? null}
			serviceId={data.serviceId ?? serviceId}
			onQuoteSubmit={handleQuoteSubmit}
		/>
	</div>
{/snippet}

{#if $authState.isLoading}
	<div class="flex h-dvh w-full flex-col items-center justify-center">
		<span class="loading loading-spinner loading-xl"></span>
		<p>{$t('common.loading')}</p>
	</div>
{:else if $authState.isAuthenticated}
	<ProtectedLayout>
		{@render View?.()}
	</ProtectedLayout>
{:else}
	{@render View?.()}
{/if}
