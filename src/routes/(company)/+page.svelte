<script lang="ts">
	import { browser } from '$app/environment';
	import { t as i18nT } from 'svelte-i18n';
	import type { LiveTask } from '$lib/types/homepage';
	import type { PageData } from './$types';
	import { onMount, onDestroy, untrack } from 'svelte';
	import type { FeaturedService } from '$lib/services/featuredServices.service';
	import type { FeaturedSectionState } from '$lib/services/featuredHomepage';
	import {
		FEATURED_HOMEPAGE_LIMIT,
		completeFeaturedSectionState
	} from '$lib/services/featuredHomepage';
	import Logo from '$lib/components/Logo.svelte';
	import LiveTaskCard from '$lib/components/homepage/LiveTaskCard.svelte';
	import FeaturedHomepageSection from '$lib/components/homepage/FeaturedHomepageSection.svelte';
	import FeaturedServiceCard from '$lib/components/homepage/FeaturedServiceCard.svelte';

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
		if (browser) {
			const i18nValue = $i18nT(key);
			if (i18nValue && i18nValue !== key) return i18nValue;
		}
		if (seo.translations) {
			const value = delve(seo.translations, key);
			if (value) return value;
		}
		return $i18nT(key);
	};

	// Initialize featured sections from load function data (fetched SSR-safe via nostr-tools)
	// untrack: seo is intentionally captured once at init — these sections manage their own state
	let featuredTasksState = $state<FeaturedSectionState<LiveTask>>(
		untrack(() => completeFeaturedSectionState(seo.homepageData?.tasks || [], null))
	);
	let featuredServicesState = $state<FeaturedSectionState<FeaturedService>>(
		untrack(() =>
			completeFeaturedSectionState(seo.homepageData?.services || [], null, { hideWhenEmpty: true })
		)
	);

	const jsonLdScript = $derived(
		seo.jsonLd
			? '<' + 'script type="application/ld+json">' + JSON.stringify(seo.jsonLd) + '</' + 'script>'
			: ''
	);

	type FeatureId = 'nostr' | 'bitcoin' | 'payments' | 'escrow';
	const featureIds: FeatureId[] = ['bitcoin', 'escrow', 'nostr', 'payments'];
	const featureImages: Record<FeatureId, string> = {
		nostr: '/images/features/nostr-decentralized.webp',
		bitcoin: '/images/features/bitcoin-money.webp',
		payments: '/images/features/pay-your-way.webp',
		escrow: '/images/features/bitcoin-escrow.webp'
	};
	const translationKeys = {
		bitcoin: {
			title: 'homepage.v2.trust.bitcoin.title' as const,
			description: 'homepage.v2.trust.bitcoin.description' as const
		},
		escrow: {
			title: 'homepage.v2.trust.escrow.title' as const,
			description: 'homepage.v2.trust.escrow.description' as const
		},
		nostr: {
			title: 'homepage.v2.trust.nostr.title' as const,
			description: 'homepage.v2.trust.nostr.description' as const
		},
		payments: {
			title: 'homepage.v2.trust.payments.title' as const,
			description: 'homepage.v2.trust.payments.description' as const
		}
	};

	let activeFeatureIndex = $state(0);

	function resolveHomepageTranslation(key: string, fallback: string): string {
		const value = t(key);
		return !value || value === key ? fallback : value;
	}

	let carouselInterval: ReturnType<typeof setInterval> | null = null;

	const rotateCarousel = () => {
		activeFeatureIndex = (activeFeatureIndex + 1) % featureIds.length;
	};
	const startCarouselRotation = () => {
		if (!carouselInterval) carouselInterval = setInterval(rotateCarousel, 5000);
	};
	const pauseCarouselRotation = () => {
		if (carouselInterval) {
			clearInterval(carouselInterval);
			carouselInterval = null;
		}
	};
	const resetCarouselRotation = () => {
		pauseCarouselRotation();
		startCarouselRotation();
	};

	onMount(() => {
		startCarouselRotation();
	});

	onDestroy(() => {
		pauseCarouselRotation();
	});
</script>

<!-- eslint-disable svelte/no-at-html-tags -->
<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<meta name="keywords" content={seo.keywords} />
	<meta name="author" content="BitTasker" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={seo.canonical} />

	<!-- Open Graph / Facebook / WhatsApp -->
	<meta property="og:type" content="website" />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />
	<meta property="og:image" content={seo.ogImage} />
	<meta property="og:image:secure_url" content={seo.ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="BitTasker - Decentralized Bitcoin Task Marketplace" />
	<meta property="og:site_name" content="BitTasker" />

	<!-- Twitter Card - Note: Twitter uses 'name' attribute, not 'property' -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={seo.canonical} />
	<meta name="twitter:title" content={seo.twitterTitle} />
	<meta name="twitter:description" content={seo.twitterDescription} />
	<meta name="twitter:image" content={seo.twitterImage} />
	<meta name="twitter:image:alt" content="BitTasker Logo" />
	<meta name="twitter:site" content="@BitTaskerdotcom" />
	<meta name="twitter:creator" content="@BitTaskerdotcom" />

	<!-- Structured Data -->
	{#if jsonLdScript}
		{@html jsonLdScript}
	{/if}

	<link rel="preload" href={featureImages['bitcoin']} as="image" />
</svelte:head>

<div class="min-h-screen">
	<!-- Section 1: Hero Section -->
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content text-center">
			<div class="max-w-2xl">
				{#if browser}
					<Logo />
				{/if}

				<p class="py-6">{t('homepage.v2.hero.description')}</p>
				<div class="space-y-6">
					<!-- Two secondary buttons on top row -->
					<div class="flex flex-col justify-center gap-4 sm:flex-row">
						<a href="/tasks" class="btn btn-secondary mx-auto w-64 sm:mx-0 sm:w-auto"
							>{t('navbar.browse_tasks')}</a
						>
						<a href="/services" class="btn btn-secondary mx-auto w-64 sm:mx-0 sm:w-auto"
							>{t('navbar.browse_services')}</a
						>
					</div>
					<!-- Large primary button below -->
					<div class="flex justify-center">
						<a
							href="/auth/signup"
							class="btn btn-primary btn-lg w-64 px-8 shadow-lg sm:w-auto"
							data-testid="signup-link">{t('homepage.v2.hero.cta')}</a
						>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 2: Interactive Trust Features with Carousel -->
	<section class="bg-base-200 text-base-content py-16">
		<div class="container mx-auto px-4">
			<div class="mb-8 text-center">
				<h2>{t('homepage.v2.trust.title')}</h2>
			</div>

			<!-- DaisyUI Carousel -->
			<div class="w-full">
				<!-- Single card that changes content based on active feature -->
				<div class="card bg-base-100 w-full overflow-hidden rounded-xl shadow-xl">
					<div class="md:flex">
						<!-- Image section (left on desktop, top on mobile) -->
						<figure class="md:w-1/2">
							<img
								src={featureImages[featureIds[activeFeatureIndex]]}
								alt={t(translationKeys[featureIds[activeFeatureIndex] as FeatureId].title)}
								class="h-72 w-full object-cover transition-opacity duration-500 md:h-96"
								loading={activeFeatureIndex === 0 ? undefined : 'lazy'}
							/>
						</figure>

						<!-- Content section (right on desktop, bottom on mobile) -->
						<div class="card-body p-6 md:w-1/2 md:p-8">
							<h3 class="card-title">
								{t(translationKeys[featureIds[activeFeatureIndex] as FeatureId].title)}
							</h3>
							<p class="text-base-content/80">
								{t(translationKeys[featureIds[activeFeatureIndex] as FeatureId].description)}
							</p>
						</div>
					</div>
				</div>

				<!-- Navigation dots below the carousel -->
				<div class="flex w-full justify-center gap-2 py-4">
					{#each featureIds as featureId, index (featureId)}
						<button
							onclick={() => {
								activeFeatureIndex = index;
								resetCarouselRotation();
							}}
							class="btn btn-circle btn-xs {activeFeatureIndex === index
								? 'btn-primary'
								: 'btn-outline btn-neutral'}"
							aria-label={t('common.slide') + ' ' + (index + 1)}
						>
							<span class="sr-only">{index + 1}</span>
						</button>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- Section 3: How It Works -->
	<section class="bg-base-100 text-base-content py-16">
		<div class="container mx-auto px-4 text-center">
			<h2 class="mb-12">{t('homepage.v2.howitworks.title')}</h2>
			<div class="grid grid-cols-1 gap-8 md:grid-cols-3">
				<!-- Step 1 -->
				<div class="flex flex-col items-center">
					<div
						class="bg-primary text-primary-content flex h-16 w-16 items-center justify-center rounded-full"
					>
						<span class="text-2xl font-bold">1</span>
					</div>
					<h3 class="mt-4">{t('homepage.v2.howitworks.step1.title')}</h3>
					<p class="text-base-content/80 mt-2">
						{t('homepage.v2.howitworks.step1.description')}
					</p>
				</div>
				<!-- Step 2 -->
				<div class="flex flex-col items-center">
					<div
						class="bg-primary text-primary-content flex h-16 w-16 items-center justify-center rounded-full"
					>
						<span class="text-2xl font-bold">2</span>
					</div>
					<h3 class="mt-4">{t('homepage.v2.howitworks.step2.title')}</h3>
					<p class="text-base-content/80 mt-2">
						{t('homepage.v2.howitworks.step2.description')}
					</p>
				</div>
				<!-- Step 3 -->
				<div class="flex flex-col items-center">
					<div
						class="bg-primary text-primary-content flex h-16 w-16 items-center justify-center rounded-full"
					>
						<span class="text-2xl font-bold">3</span>
					</div>
					<h3 class="mt-4">{t('homepage.v2.howitworks.step3.title')}</h3>
					<p class="text-base-content/80 mt-2">
						{t('homepage.v2.howitworks.step3.description')}
					</p>
				</div>
			</div>

			<!-- Learn More Button -->
			<div class="mt-12 text-center">
				<a href="/how-it-works" class="btn btn-primary">{t('homepage.v2.howitworks.learnMore')}</a>
			</div>
		</div>
	</section>

	<FeaturedHomepageSection
		title={t('common.homepage.featured.services.title')}
		browseHref="/services"
		browseLabel={resolveHomepageTranslation('dashboard.services.browse.title', 'Browse Services')}
		items={featuredServicesState.items}
		loading={featuredServicesState.loading}
		error={featuredServicesState.error}
		hideWhenEmpty={!featuredServicesState.visible}
		emptyMessage={t('common.homepage.featured.services.empty')}
		skeletonCount={FEATURED_HOMEPAGE_LIMIT}
		sectionTestId="homepage-featured-services"
		cardTestIdPrefix="homepage-featured-service-card"
	>
		{#snippet card(item)}
			<FeaturedServiceCard service={item as FeaturedService} />
		{/snippet}
	</FeaturedHomepageSection>

	<!-- Section 5: Core Benefits -->
	<section class="bg-base-100 py-16" data-testid="homepage-benefits">
		<div class="container mx-auto px-4">
			<h2 class="mb-12 text-center">{t('homepage.v2.benefits.title')}</h2>
			<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-2">
				<div
					class="card bg-base-200 h-full p-6 text-center shadow-lg transition-shadow hover:shadow-xl"
				>
					<div class="card-body flex flex-col">
						<div class="mb-4 flex justify-center">
							<div class="bg-primary/10 text-primary rounded-full p-3">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-8 w-8"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.375c0 .621-.504 1.125-1.125 1.125h-9.75c-.621 0-1.125-.504-1.125-1.125V6.75m18 0v.375c0 .621-.504 1.125-1.125 1.125h-9.75c-.621 0-1.125-.504-1.125-1.125V6.75m18 0v.375c0 .621-.504 1.125-1.125 1.125h-9.75c-.621 0-1.125-.504-1.125-1.125V6.75"
									/>
								</svg>
							</div>
						</div>
						<h3 class="mb-4 flex min-h-12 items-center justify-center text-lg font-semibold">
							{t('homepage.v2.benefits.payments.title')}
						</h3>
						<p class="text-base-content/80 grow">
							{t('homepage.v2.benefits.payments.description')}
						</p>
					</div>
				</div>
				<div
					class="card bg-base-200 h-full p-6 text-center shadow-lg transition-shadow hover:shadow-xl"
				>
					<div class="card-body flex flex-col">
						<div class="mb-4 flex justify-center">
							<div class="bg-primary/10 text-primary rounded-full p-3">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-8 w-8"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 12 21a11.99 11.99 0 0 0 8.402-15.036A11.959 11.959 0 0 1 12 2.25Z"
									/>
								</svg>
							</div>
						</div>
						<h3 class="mb-4 flex min-h-12 items-center justify-center text-lg font-semibold">
							{t('homepage.v2.benefits.escrow.title')}
						</h3>
						<p class="text-base-content/80 grow">
							{t('homepage.v2.benefits.escrow.description')}
						</p>
					</div>
				</div>
				<div
					class="card bg-base-200 h-full p-6 text-center shadow-lg transition-shadow hover:shadow-xl"
				>
					<div class="card-body flex flex-col">
						<div class="mb-4 flex justify-center">
							<div class="bg-primary/10 text-primary rounded-full p-3">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-8 w-8"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
									/>
								</svg>
							</div>
						</div>
						<h3 class="mb-4 flex min-h-12 items-center justify-center text-lg font-semibold">
							{t('homepage.v2.benefits.ownership.title')}
						</h3>
						<p class="text-base-content/80 grow">
							{t('homepage.v2.benefits.ownership.description')}
						</p>
					</div>
				</div>
				<div
					class="card bg-base-200 h-full p-6 text-center shadow-lg transition-shadow hover:shadow-xl"
				>
					<div class="card-body flex flex-col">
						<div class="mb-4 flex justify-center">
							<div class="bg-primary/10 text-primary rounded-full p-3">
								<svg
									height="32px"
									style="enable-background:new 0 0 512 512;"
									version="1.1"
									viewBox="0 0 512 512"
									width="32px"
									xml:space="preserve"
									xmlns="http://www.w3.org/2000/svg"
									xmlns:xlink="http://www.w3.org/1999/xlink"
								>
									<g id="_x34_5-bitcoin">
										<g>
											<path
												d="M362.199,243.996c24.913-12.74,40.767-35.39,37.088-73.044    c-4.814-51.526-47.131-68.796-103.188-73.607V26.001H252.5v69.362c-11.325,0-22.932,0.283-34.539,0.564V26.001h-43.6v71.344    c-16.029,0.484-34.698,0.248-87.479,0v46.43c34.423-0.609,52.483-2.821,56.623,19.251V358.37    c-2.629,17.515-16.643,14.991-47.846,14.438l-8.775,51.809c79.495,0,87.479,0.284,87.479,0.284v61.099h43.601v-60.25    c11.888,0.285,23.498,0.285,34.539,0.285v59.965h43.599V424.9c73.043-3.964,121.871-22.366,128.384-91.16    C429.579,278.535,403.531,253.903,362.199,243.996z M218.811,146.889c24.631,0,101.639-7.643,101.639,43.599    c0,48.979-77.007,43.315-101.639,43.315V146.889z M218.811,373.093v-95.691c29.445,0,119.608-8.209,119.608,47.847    C338.418,379.321,248.255,373.093,218.811,373.093L218.811,373.093z"
												style="fill:#F7931B;"
											/>
										</g>
									</g>
									<g id="Layer_1" />
								</svg>
							</div>
						</div>
						<h3 class="mb-4 flex min-h-12 items-center justify-center text-lg font-semibold">
							{t('homepage.v2.benefits.fees.title')}
						</h3>
						<p class="text-base-content/80 grow">{t('homepage.v2.benefits.fees.description')}</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<FeaturedHomepageSection
		title={t('homepage.v2.livetasks.title')}
		browseHref="/tasks"
		browseLabel={t('navbar.browse_tasks')}
		items={featuredTasksState.items}
		loading={featuredTasksState.loading}
		error={featuredTasksState.error}
		emptyMessage={t('common.homepage.featured.tasks.empty')}
		skeletonCount={FEATURED_HOMEPAGE_LIMIT}
		sectionTestId="homepage-featured-tasks"
		cardTestIdPrefix="homepage-featured-task-card"
	>
		{#snippet card(item)}
			<LiveTaskCard task={item as LiveTask} />
		{/snippet}
	</FeaturedHomepageSection>
</div>
