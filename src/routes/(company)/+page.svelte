<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import { resolve } from '$app/paths';
	import { locale, t as i18nT } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import type { PageData } from './$types';
	import { authState } from '$lib/stores/auth.store';
	import Logo from '$lib/components/Logo.svelte';
	import IconChevronRight from '~icons/mdi/chevron-right';

	let { data: seo }: { data: PageData } = $props();

	function delve(obj: unknown, fullKey: string): string | undefined {
		if (!obj || typeof obj !== 'object') return undefined;
		const keys = fullKey.split('.');
		let result: unknown = obj;
		for (const key of keys) {
			if (result && typeof result === 'object') {
				result = (result as Record<string, unknown>)[key];
			} else {
				return undefined;
			}
		}
		return typeof result === 'string' ? result : undefined;
	}

	const t = (key: string): string => {
		const spanish =
			browser &&
			(document.documentElement.dataset.btLocale === 'es' ||
				String($locale || '').startsWith('es'));
		const englishFallback = seo.translations ? delve(seo.translations, key) : undefined;
		if (browser) {
			const i18nValue = $i18nT(key);
			if (i18nValue && i18nValue !== key && !(spanish && i18nValue === englishFallback)) {
				return i18nValue;
			}
		}
		if (!spanish && englishFallback) return englishFallback;
		return $i18nT(key);
	};

	// Door photos, Pexels License (free to use, including commercially):
	// browse-tasks.webp https://www.pexels.com/photo/1181675/ Mike Ngo Photography
	// browse-services.webp https://www.pexels.com/photo/1249611/
	// buy-sell.webp https://www.pexels.com/photo/3965545/
	// temporary-staff.webp https://www.pexels.com/photo/1216589/

	const jsonLdScript = $derived(
		seo.jsonLd
			? '<' + 'script type="application/ld+json">' + JSON.stringify(seo.jsonLd) + '</' + 'script>'
			: ''
	);

	const cards = [
		{
			route: '/(app)/browse/tasks',
			title: 'navbar.browse_tasks',
			subtitle: 'homepage.v2.hero.cards.tasks_subtitle',
			alt: 'homepage.v2.hero.cards.tasks_alt',
			image: '/images/home/browse-tasks.webp',
			testId: 'hero-browse-tasks'
		},
		{
			route: '/(app)/browse/services',
			title: 'navbar.browse_services',
			subtitle: 'homepage.v2.hero.cards.services_subtitle',
			alt: 'homepage.v2.hero.cards.services_alt',
			image: '/images/home/browse-services.webp',
			testId: 'hero-browse-services'
		},
		{
			route: '/(app)/browse/goods',
			title: 'navbar.buy_sell',
			subtitle: 'homepage.v2.hero.cards.goods_subtitle',
			alt: 'homepage.v2.hero.cards.goods_alt',
			image: '/images/home/buy-sell.webp',
			testId: 'hero-browse-goods'
		},
		{
			route: '/(app)/browse/staff',
			title: 'homepage.v2.hero.staff',
			subtitle: 'homepage.v2.hero.cards.staff_subtitle',
			alt: 'homepage.v2.hero.cards.staff_alt',
			image: '/images/home/temporary-staff.webp',
			testId: 'hero-browse-staff'
		}
	] as const;
</script>

<!-- eslint-disable svelte/no-at-html-tags -->
<svelte:head>
	<DocumentTitle fallback={seo.title} />
	<meta name="description" content={seo.description} />
	<meta name="keywords" content={seo.keywords} />
	<meta name="author" content="BitTasker" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={seo.canonical} />

	<meta property="og:type" content="website" />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />
	<meta property="og:image" content={seo.ogImage} />
	<meta property="og:image:secure_url" content={seo.ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="BitTasker" />
	<meta property="og:site_name" content="BitTasker" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={seo.canonical} />
	<meta name="twitter:title" content={seo.twitterTitle} />
	<meta name="twitter:description" content={seo.twitterDescription} />
	<meta name="twitter:image" content={seo.twitterImage} />
	<meta name="twitter:image:alt" content="BitTasker Logo" />
	<meta name="twitter:site" content="@BitTaskerdotcom" />
	<meta name="twitter:creator" content="@BitTaskerdotcom" />

	{#if jsonLdScript}
		{@html jsonLdScript}
	{/if}
</svelte:head>

<div
	class="bg-base-100 text-base-content min-h-full min-w-0 overflow-x-clip"
	data-testid="homepage"
>
	<section class="bg-base-100 min-w-0 overflow-x-clip" data-testid="homepage-hero">
		<div class="mx-auto w-full max-w-3xl px-4 pt-6 pb-10">
			{#if browser}
				<Logo />
			{/if}
			<p class="py-6 text-center" data-testid="homepage-tagline">
				{t('homepage.v2.hero.description')}
			</p>

			<div class="home-cards mt-6" data-testid="hero-browse">
				{#each cards as card (card.testId)}
					<a href={resolve(card.route)} class="home-card" data-testid={card.testId}>
						<img
							src={card.image}
							alt={t(card.alt)}
							width="640"
							height="640"
							loading="lazy"
							decoding="async"
						/>
						<span class="home-card__copy">
							<span class="home-card__title">{t(card.title)}</span>
							<span class="home-card__subtitle">{t(card.subtitle)}</span>
						</span>
						<span class="home-card__chevron"><IconChevronRight /></span>
					</a>
				{/each}
			</div>

			{#if $authState?.isLoading}
				<span
					class="btn btn-primary mt-6 min-h-14 w-full"
					aria-busy="true"
					data-testid="homepage-auth-pending"
				></span>
			{:else if $authState?.isAuthenticated}
				<a
					href={resolve('/create-task')}
					class="btn btn-primary mt-6 min-h-14 w-full text-base whitespace-normal"
					data-testid="post-task-link"
				>
					{t('homepage.v2.hero.post_task')}
				</a>
			{:else}
				<a
					href={resolve('/auth/signup')}
					class="btn btn-primary get-started mt-6 min-h-14 w-full text-base whitespace-normal"
					data-testid="get-started"
				>
					{t('homepage.v2.hero.get_started')}
				</a>
			{/if}
		</div>
	</section>
</div>

<style>
	.home-cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		width: 100%;
		min-width: 0;
	}

	.home-card {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		max-width: 100%;
		min-height: 6.5rem;
		padding: 0.5rem;
		border-radius: 1.25rem;
		background: var(--bt-home-card, #fde7d0);
		color: var(--bt-home-card-ink, #1c1917);
		text-align: left;
		text-decoration: none;
	}

	.home-card img {
		width: 2.25rem;
		height: 2.25rem;
		max-width: 100%;
		flex: 0 0 auto;
		border-radius: 0.65rem;
		object-fit: cover;
	}

	.home-card__copy {
		display: flex;
		min-width: 0;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 0.15rem;
	}

	.home-card__title,
	.home-card__subtitle {
		overflow: visible;
		white-space: normal;
		overflow-wrap: normal;
		word-break: normal;
	}

	.home-card__title {
		font-size: 0.8125rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.home-card__subtitle {
		font-size: 0.75rem;
		line-height: 1.25;
		color: var(--bt-home-card-muted, #44403c);
	}

	.home-card__chevron {
		display: flex;
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
	}

	.home-card__chevron :global(svg) {
		width: 100%;
		height: 100%;
	}

	.get-started {
		height: auto;
	}

	:global([data-theme='dark']) .home-card {
		background: var(--color-base-300);
		color: var(--color-base-content);
	}

	:global([data-theme='dark']) .home-card__subtitle {
		color: color-mix(in srgb, var(--color-base-content) 72%, transparent);
	}

	@media (max-width: 767px) {
		.home-cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.home-card {
			position: relative;
			flex-direction: column;
			align-items: stretch;
			padding: 0.45rem 0.55rem 0.6rem;
		}

		.home-card img {
			width: 100%;
			min-width: 0;
			max-width: 100%;
			height: 3rem;
		}

		.home-card__chevron {
			position: absolute;
			top: 0.55rem;
			right: 0.4rem;
			width: 1.15rem;
			height: 1.15rem;
		}

		.home-card__title {
			margin-top: 0.35rem;
			font-size: 0.875rem;
		}
	}

	@media (min-width: 768px) {
		.home-cards {
			gap: 1rem;
		}

		.home-card {
			min-height: 8.5rem;
			gap: 0.85rem;
			padding: 1rem;
		}

		.home-card img {
			width: 5.5rem;
			height: 5.5rem;
		}

		.home-card__chevron {
			width: 1.25rem;
			height: 1.25rem;
		}

		.home-card__title {
			font-size: 1.2rem;
		}

		.home-card__subtitle {
			font-size: 1rem;
		}
	}
</style>
