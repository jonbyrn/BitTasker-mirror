<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { t } from '$lib/stores/i18n.store';
	import { onMount, onDestroy } from 'svelte';
	import { darkMode } from '$lib/stores/theme.store';
	import { deviceInfo } from '$lib/stores/deviceInfo.store';
	import { liveTasks, featuredTaskees } from '$lib/utils/constants/homepage.constants';
	import LiveTaskCard from '$lib/components/homepage/LiveTaskCard.svelte';
	import TaskeeCard from '$lib/components/homepage/TaskeeCard.svelte';

	// Define feature types for type safety
	type FeatureId = 'nostr' | 'bitcoin' | 'payments' | 'escrow';

	// Feature IDs for the trust features section
	const featureIds: FeatureId[] = ['bitcoin', 'escrow', 'nostr', 'payments'];

	// Map of feature images - using custom SVG illustrations from static directory
	const featureImages: Record<FeatureId, string> = {
		nostr: '/images/features/nostr-decentralized.jpg',
		bitcoin: '/images/features/bitcoin-money.jpg',
		payments: '/images/features/pay-your-way.jpg',
		escrow: '/images/features/bitcoin-escrow.jpg'
	};

	// Translation key mappings for type safety
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
	const activeFeatureId = $derived(featureIds[activeFeatureIndex] as FeatureId);

	// Auto-rotation interval reference
	let carouselInterval: ReturnType<typeof setInterval> | null = null;

	// Function to rotate to the next slide
	const rotateCarousel = () => {
		activeFeatureIndex = (activeFeatureIndex + 1) % featureIds.length;
	};

	// Start carousel auto-rotation
	const startCarouselRotation = () => {
		if (!carouselInterval) {
			carouselInterval = setInterval(rotateCarousel, 5000); // Rotate every 3 seconds
		}
	};

	// Stop carousel auto-rotation (when user interacts with it)
	const pauseCarouselRotation = () => {
		if (carouselInterval) {
			clearInterval(carouselInterval);
			carouselInterval = null;
		}
	};

	// Reset carousel rotation (call after user interaction to restart the timer)
	const resetCarouselRotation = () => {
		pauseCarouselRotation();
		startCarouselRotation();
	};

	onMount(async () => {
		// Start carousel auto-rotation
		startCarouselRotation();
	});

	// Clean up interval when component is destroyed
	onDestroy(() => {
		pauseCarouselRotation();
	});
</script>

<svelte:head>
	<title>{$t('homepage.v2.page_title')}</title>
	<meta name="description" content={$t('homepage.v2.hero.description')} />
</svelte:head>

<div class="min-h-screen">
	<!-- Section 1: Hero Section -->
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content text-center">
			<div class="max-w-2xl">
				<Logo />
				<p class="py-6">{$t('homepage.v2.hero.description')}</p>
				<div class="space-y-6">
					<!-- Two secondary buttons on top row -->
					<div class="flex flex-col justify-center gap-4 sm:flex-row">
						<a href="/dashboard/find-tasks" class="btn btn-secondary mx-auto w-64 sm:mx-0 sm:w-auto"
							>{$t('navbar.browse_tasks')}</a
						>
						<a
							href="/dashboard/taskees"
							class="btn btn-secondary mx-auto w-64 sm:mx-0 sm:w-auto"
							>{$t('navbar.browse_freelancers')}</a
						>
					</div>
					<!-- Large primary button below -->
					<div class="flex justify-center">
						<a href="/auth/signup" class="btn btn-primary btn-lg w-64 px-8 shadow-lg sm:w-auto"
							>{$t('homepage.v2.hero.cta')}</a
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
				<h2>{$t('homepage.v2.trust.title')}</h2>
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
								alt={$t(translationKeys[featureIds[activeFeatureIndex] as FeatureId].title)}
								class="h-72 w-full object-cover transition-opacity duration-500 md:h-96"
							/>
						</figure>

						<!-- Content section (right on desktop, bottom on mobile) -->
						<div class="card-body p-6 md:w-1/2 md:p-8">
							<h3 class="card-title">
								{$t(translationKeys[featureIds[activeFeatureIndex] as FeatureId].title)}
							</h3>
							<p class="text-base-content/80">
								{$t(translationKeys[featureIds[activeFeatureIndex] as FeatureId].description)}
							</p>
						</div>
					</div>
				</div>

				<!-- Navigation dots below the carousel -->
				<div class="flex w-full justify-center gap-2 py-4">
					{#each featureIds as _, index}
						<button
							onclick={() => {
								activeFeatureIndex = index;
								resetCarouselRotation();
							}}
							class="btn btn-circle btn-xs {activeFeatureIndex === index
								? 'btn-primary'
								: 'btn-outline btn-neutral'}"
							aria-label={$t('common.slide') + ' ' + (index + 1)}
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
			<h2 class="mb-12">{$t('homepage.v2.howitworks.title')}</h2>
			<div class="grid grid-cols-1 gap-8 md:grid-cols-3">
				<!-- Step 1 -->
				<div class="flex flex-col items-center">
					<div
						class="bg-primary text-primary-content flex h-16 w-16 items-center justify-center rounded-full"
					>
						<span class="text-2xl font-bold">1</span>
					</div>
					<h3 class="mt-4">{$t('homepage.v2.howitworks.step1.title')}</h3>
					<p class="text-base-content/80 mt-2">
						{$t('homepage.v2.howitworks.step1.description')}
					</p>
				</div>
				<!-- Step 2 -->
				<div class="flex flex-col items-center">
					<div
						class="bg-primary text-primary-content flex h-16 w-16 items-center justify-center rounded-full"
					>
						<span class="text-2xl font-bold">2</span>
					</div>
					<h3 class="mt-4">{$t('homepage.v2.howitworks.step2.title')}</h3>
					<p class="text-base-content/80 mt-2">
						{$t('homepage.v2.howitworks.step2.description')}
					</p>
				</div>
				<!-- Step 3 -->
				<div class="flex flex-col items-center">
					<div
						class="bg-primary text-primary-content flex h-16 w-16 items-center justify-center rounded-full"
					>
						<span class="text-2xl font-bold">3</span>
					</div>
					<h3 class="mt-4">{$t('homepage.v2.howitworks.step3.title')}</h3>
					<p class="text-base-content/80 mt-2">
						{$t('homepage.v2.howitworks.step3.description')}
					</p>
				</div>
			</div>

			<!-- Learn More Button -->
			<div class="mt-12 text-center">
				<a href="/how-it-works" class="btn btn-primary">{$t('homepage.v2.howitworks.learnMore')}</a>
			</div>
		</div>
	</section>

	<!-- Section 4: Live Task Feed -->
	<section class="bg-base-200 py-16">
		<div class="container mx-auto px-4">
			<div class="mb-8 flex items-center justify-between">
				<h2>{$t('homepage.v2.livetasks.title')}</h2>
				<a href="/dashboard/find-tasks" class="btn btn-link text-primary"
					>{$t('common.view_all')}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="ml-1 h-5 w-5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
						/>
					</svg>
				</a>
			</div>
			<div class="overflow-hidden">
				<div
					class="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 pl-8 pt-4 pr-0 md:px-4"
					style="scrollbar-width:none;"
				>
					{#each liveTasks as task (task.id)}
						<div class="w-80 flex-shrink-0 snap-start">
							<LiveTaskCard {task} />
						</div>
					{/each}
				</div>
			</div>

			<!-- Browse Tasks Button -->
			<div class="mt-12 text-center">
				<a href="/dashboard/find-tasks" class="btn btn-primary">{$t('navbar.browse_tasks')}</a>
			</div>
		</div>
	</section>

	<!-- Section 5: Core Benefits -->
	<section class="bg-base-100 py-16">
		<div class="container mx-auto px-4">
			<h2 class="mb-12 text-center">{$t('homepage.v2.benefits.title')}</h2>
			<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-2">
				<div class="card bg-base-200 text-center p-6 shadow-lg hover:shadow-xl transition-shadow h-full">
					<div class="card-body flex flex-col">
						<div class="flex justify-center mb-4">
							<div class="bg-primary/10 text-primary p-3 rounded-full">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
									<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.375c0 .621-.504 1.125-1.125 1.125h-9.75c-.621 0-1.125-.504-1.125-1.125V6.75m18 0v.375c0 .621-.504 1.125-1.125 1.125h-9.75c-.621 0-1.125-.504-1.125-1.125V6.75m18 0v.375c0 .621-.504 1.125-1.125 1.125h-9.75c-.621 0-1.125-.504-1.125-1.125V6.75" />
								</svg>
							</div>
						</div>
						<h3 class="text-lg font-semibold mb-4 min-h-[3rem] flex items-center justify-center">{$t('homepage.v2.benefits.payments.title')}</h3>
						<p class="text-base-content/80 flex-grow">
							{$t('homepage.v2.benefits.payments.description')}
						</p>
					</div>
				</div>
				<div class="card bg-base-200 text-center p-6 shadow-lg hover:shadow-xl transition-shadow h-full">
					<div class="card-body flex flex-col">
						<div class="flex justify-center mb-4">
							<div class="bg-primary/10 text-primary p-3 rounded-full">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 12 21a11.99 11.99 0 0 0 8.402-15.036A11.959 11.959 0 0 1 12 2.25Z" />
								</svg>
							</div>
						</div>
						<h3 class="text-lg font-semibold mb-4 min-h-[3rem] flex items-center justify-center">{$t('homepage.v2.benefits.escrow.title')}</h3>
						<p class="text-base-content/80 flex-grow">
							{$t('homepage.v2.benefits.escrow.description')}
						</p>
					</div>
				</div>
				<div class="card bg-base-200 text-center p-6 shadow-lg hover:shadow-xl transition-shadow h-full">
					<div class="card-body flex flex-col">
						<div class="flex justify-center mb-4">
							<div class="bg-primary/10 text-primary p-3 rounded-full">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
								</svg>
							</div>
						</div>
						<h3 class="text-lg font-semibold mb-4 min-h-[3rem] flex items-center justify-center">{$t('homepage.v2.benefits.ownership.title')}</h3>
						<p class="text-base-content/80 flex-grow">
							{$t('homepage.v2.benefits.ownership.description')}
						</p>
					</div>
				</div>
				<div class="card bg-base-200 text-center p-6 shadow-lg hover:shadow-xl transition-shadow h-full">
					<div class="card-body flex flex-col">
						<div class="flex justify-center mb-4">
							<div class="bg-primary/10 text-primary p-3 rounded-full">
								<svg height="32px" style="enable-background:new 0 0 512 512;" version="1.1" viewBox="0 0 512 512" width="32px" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
									<g id="_x34_5-bitcoin">
										<g>
											<path d="M362.199,243.996c24.913-12.74,40.767-35.39,37.088-73.044    c-4.814-51.526-47.131-68.796-103.188-73.607V26.001H252.5v69.362c-11.325,0-22.932,0.283-34.539,0.564V26.001h-43.6v71.344    c-16.029,0.484-34.698,0.248-87.479,0v46.43c34.423-0.609,52.483-2.821,56.623,19.251V358.37    c-2.629,17.515-16.643,14.991-47.846,14.438l-8.775,51.809c79.495,0,87.479,0.284,87.479,0.284v61.099h43.601v-60.25    c11.888,0.285,23.498,0.285,34.539,0.285v59.965h43.599V424.9c73.043-3.964,121.871-22.366,128.384-91.16    C429.579,278.535,403.531,253.903,362.199,243.996z M218.811,146.889c24.631,0,101.639-7.643,101.639,43.599    c0,48.979-77.007,43.315-101.639,43.315V146.889z M218.811,373.093v-95.691c29.445,0,119.608-8.209,119.608,47.847    C338.418,379.321,248.255,373.093,218.811,373.093L218.811,373.093z" style="fill:#F7931B;"/>
										</g>
									</g>
									<g id="Layer_1"/>
								</svg>
							</div>
						</div>
						<h3 class="text-lg font-semibold mb-4 min-h-[3rem] flex items-center justify-center">{$t('homepage.v2.benefits.fees.title')}</h3>
						<p class="text-base-content/80 flex-grow">{$t('homepage.v2.benefits.fees.description')}</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 6: Featured Freelancers -->
	<section class="bg-base-200 py-16">
		<div class="container mx-auto px-4">
			<div class="mb-8 flex items-center justify-between">
				<h2>{$t('homepage.v2.taskees.title')}</h2>
				<a href="/dashboard/taskees" class="btn btn-link text-primary"
					>{$t('common.view_all')}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="ml-1 h-5 w-5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
						/>
					</svg>
				</a>
			</div>
			<div class="overflow-hidden">
				<div
					class="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 pl-8 pt-4 pr-0 md:px-4"
					style="scrollbar-width:none;"
				>
					{#each featuredTaskees as taskee (taskee.id)}
						<div class="w-80 flex-shrink-0 snap-start">
							<TaskeeCard {taskee} />
						</div>
					{/each}
				</div>
			</div>

			<!-- Browse Taskees Button -->
			<div class="mt-12 text-center">
				<a href="/dashboard/taskees" class="btn btn-primary">{$t('navbar.browse_freelancers')}</a>
			</div>
		</div>
	</section>
</div>
