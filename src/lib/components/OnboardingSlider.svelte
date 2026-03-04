<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { register } from 'swiper/element/bundle';
	import { Preferences } from '@capacitor/preferences';
	import { onboardingCompleted } from '$lib/stores/device.store';
	import { StorageKeys } from '$lib/utils/constants/storage';

	register();

	const languages: { code: string; name: string }[] = [
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Español' }
	];

	const handleLanguageChange = async (code: string) => {
		try {
			await locale.set(code);
		} catch (error) {
			console.error('Error changing language:', error);
		}
	};

	type OnboardingTranslationKey =
		| 'auth.signup.button'
		| 'onboarding.slide1.description'
		| 'onboarding.slide2.title'
		| 'onboarding.slide2.description'
		| 'onboarding.slide3.title'
		| 'onboarding.slide3.description'
		| 'onboarding.slide4.title'
		| 'onboarding.slide4.description'
		| 'onboarding.slide5.title'
		| 'onboarding.slide5.description'
		| 'onboarding.get_started';

	const slides = [
		{
			id: 1,
			titleKey: 'auth.signup.button' as OnboardingTranslationKey,
			descriptionKey: 'onboarding.slide1.description' as OnboardingTranslationKey,
			image: '/illustrations/signup.svg'
		},
		{
			id: 2,
			titleKey: 'onboarding.slide2.title' as OnboardingTranslationKey,
			descriptionKey: 'onboarding.slide2.description' as OnboardingTranslationKey,
			image: '/illustrations/profile.svg'
		},
		{
			id: 3,
			titleKey: 'onboarding.slide3.title' as OnboardingTranslationKey,
			descriptionKey: 'onboarding.slide3.description' as OnboardingTranslationKey,
			image: '/illustrations/tasks.svg'
		},
		{
			id: 4,
			titleKey: 'onboarding.slide4.title' as OnboardingTranslationKey,
			descriptionKey: 'onboarding.slide4.description' as OnboardingTranslationKey,
			image: '/illustrations/work.svg'
		},
		{
			id: 5,
			titleKey: 'onboarding.slide5.title' as OnboardingTranslationKey,
			descriptionKey: 'onboarding.slide5.description' as OnboardingTranslationKey,
			image: '/illustrations/payment.svg'
		}
	];

	const getStarted = async () => {
		await Preferences.set({ key: StorageKeys.ONBOARDING_COMPLETED, value: 'true' });
		onboardingCompleted.set(true);
		goto('/auth/login');
	};

	type SwiperContainerElement = HTMLElement & {
		swiper?: {
			slideTo: (index: number) => void;
		};
	};

	let swiperContainerEl: SwiperContainerElement | null = null;

	const skipOnboardingToLastSlide = async () => {
		swiperContainerEl?.swiper?.slideTo(slides.length - 1);
	};
</script>

<div class="bg-base-400 h-full flex-grow px-6">
	<!-- Floating Controls -->
	<div class="flex flex-row items-center justify-between py-6">
		<ul class="menu menu-horizontal px-1">
			<li>
				<details class="dropdown">
					<summary>{$t('navbar.language')}</summary>
					<ul class="menu dropdown-content rounded-box bg-base-100 z-[1] w-52 p-2 shadow">
						{#each languages as { code, name } (code)}
							<li>
								<button class="text-left" onclick={() => handleLanguageChange(code)}>
									{name}
								</button>
							</li>
						{/each}
					</ul>
				</details>
			</li>
		</ul>
	</div>

	<swiper-container
		bind:this={swiperContainerEl}
		pagination={true}
		pagination-clickable={true}
		navigation={false}
		space-between={0}
		slides-per-view={1}
		onswiperslidechange={() => {}}
		class="[--swiper-pagination-bottom:10px] [--swiper-pagination-bullet-border-color:#fff] [--swiper-pagination-bullet-inactive-color:#fff] [--swiper-pagination-bullet-inactive-opacity:0.5] [--swiper-pagination-color:#fff]"
	>
		{#each slides as slide (slide.id)}
			<swiper-slide>
				<div class="relative flex flex-col items-center justify-evenly pb-12">
					<div class="flex flex-col items-center justify-evenly">
						<div class="bg-primary mb-8 flex h-64 w-64 items-center justify-center rounded-lg">
							<img
								src={slide.image}
								alt={$t(slide.titleKey)}
								class="h-full w-full object-contain"
							/>
						</div>
						<h2 class="text-primary mb-4 text-center text-2xl font-bold">{$t(slide.titleKey)}</h2>
						<p class="text-center">{$t(slide.descriptionKey)}</p>
					</div>
					{#if slide.id === slides.length}
						<button class="btn btn-primary mt-6 px-10" onclick={getStarted}>
							{$t('onboarding.get_started' as OnboardingTranslationKey)}
						</button>
					{:else}
						<button class="btn btn-soft mt-6 px-10" onclick={skipOnboardingToLastSlide}>
							{$t('onboarding.skip' as OnboardingTranslationKey)}
						</button>
					{/if}
				</div>
			</swiper-slide>
		{/each}
	</swiper-container>
</div>
