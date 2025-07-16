<script lang="ts">
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
			carouselInterval = setInterval(rotateCarousel, 3000); // Rotate every 3 seconds
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
	<section class="hero bg-base-100 text-base-content min-h-[60vh]">
		<div class="hero-content text-center">
			<div class="max-w-2xl">
				<img
					src={$darkMode
						? '/images/Bittasker-logo-tagline-dark.svg'
						: '/images/Bittasker-logo-tagline-light.svg'}
					alt="BitTasker Logo"
					class="mx-auto mb-4 block md:min-w-[500px]"
				/>
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
				<h2 class="text-3xl font-bold">{$t('homepage.v2.trust.title')}</h2>
			</div>

			<!-- DaisyUI Carousel -->
			<div class="mx-auto max-w-5xl">
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
							<h3 class="card-title text-2xl">
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
							class="btn btn-circle btn-md {activeFeatureIndex === index
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
			<h2 class="mb-12 text-3xl font-bold">{$t('homepage.v2.howitworks.title')}</h2>
			<div class="grid grid-cols-1 gap-8 md:grid-cols-3">
				<!-- Step 1 -->
				<div class="flex flex-col items-center">
					<div
						class="bg-primary text-primary-content flex h-16 w-16 items-center justify-center rounded-full"
					>
						<span class="text-2xl font-bold">1</span>
					</div>
					<h3 class="mt-4 text-xl font-semibold">{$t('homepage.v2.howitworks.step1.title')}</h3>
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
					<h3 class="mt-4 text-xl font-semibold">{$t('homepage.v2.howitworks.step2.title')}</h3>
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
					<h3 class="mt-4 text-xl font-semibold">{$t('homepage.v2.howitworks.step3.title')}</h3>
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
				<h2 class="text-3xl font-bold">{$t('homepage.v2.livetasks.title')}</h2>
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
			<div class="-mx-4 overflow-hidden">
				<div
					class="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-6 md:px-4"
					style="scrollbar-width:none;"
				>
					{#each liveTasks as task (task.id)}
						<div class="w-80 flex-shrink-0 snap-start">
							<LiveTaskCard {task} />
						</div>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- Section 5: Core Benefits -->
	<section class="bg-base-100 py-16">
		<div class="container mx-auto px-4">
			<h2 class="mb-12 text-center text-3xl font-bold">{$t('homepage.v2.benefits.title')}</h2>
			<div class="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
				<div class="text-center">
					<h3 class="text-xl font-semibold">{$t('homepage.v2.benefits.payments.title')}</h3>
					<p class="text-base-content/80 mt-2">
						{$t('homepage.v2.benefits.payments.description')}
					</p>
				</div>
				<div class="text-center">
					<h3 class="text-xl font-semibold">{$t('homepage.v2.benefits.escrow.title')}</h3>
					<p class="text-base-content/80 mt-2">
						{$t('homepage.v2.benefits.escrow.description')}
					</p>
				</div>
				<div class="text-center">
					<h3 class="text-xl font-semibold">{$t('homepage.v2.benefits.ownership.title')}</h3>
					<p class="text-base-content/80 mt-2">
						{$t('homepage.v2.benefits.ownership.description')}
					</p>
				</div>
				<div class="text-center">
					<h3 class="text-xl font-semibold">{$t('homepage.v2.benefits.fees.title')}</h3>
					<p class="text-base-content/80 mt-2">{$t('homepage.v2.benefits.fees.description')}</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 6: Featured Freelancers -->
	<section class="bg-base-200 py-16">
		<div class="container mx-auto px-4">
			<div class="mb-8 flex items-center justify-between">
				<h2 class="text-3xl font-bold">{$t('homepage.v2.taskees.title')}</h2>
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
			<div class="-mx-4 overflow-hidden">
				<div
					class="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-6 md:px-4"
					style="scrollbar-width:none;"
				>
					{#each featuredTaskees as taskee (taskee.id)}
						<div class="w-80 flex-shrink-0 snap-start">
							<TaskeeCard {taskee} />
						</div>
					{/each}
				</div>
			</div>
		</div>
	</section>
</div>
