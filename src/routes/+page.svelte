<script lang="ts">
	import { t } from '$lib/stores/i18n.store';
	import { deviceInfo } from '$lib/stores/deviceInfo.store';
	import OnboardingSlider from '$lib/components/OnboardingSlider.svelte';
</script>

{#if $deviceInfo !== null && $deviceInfo?.platform !== 'web'}
	<OnboardingSlider />
{:else}
	<div class="min-h-screen">
		<!-- Hero Section -->
		<div class="hero bg-base-200 glow-effect min-h-[70vh]">
			<div class="glow-container">
				<div
					class="glow-blur glow-primary top-[20%] left-[10%] h-[20vw] w-[20vw]"
					style="animation-delay: -2s;"
				></div>
				<div
					class="glow-blur glow-secondary right-[15%] bottom-[25%] h-[18vw] w-[18vw]"
					style="animation-delay: -5s;"
				></div>
				<div
					class="glow-blur glow-accent top-[10%] right-[30%] h-[15vw] w-[15vw]"
					style="opacity: 0.2; animation-delay: -8s;"
				></div>
			</div>
			<div class="hero-content text-center">
				<div class="max-w-md">
					<h1 class="text-5xl font-bold">{$t('homepage.hero.title')}</h1>
					<p class="py-6">
						{$t('homepage.hero.description')}
					</p>
					<div class="flex justify-center gap-4">
						<a href="/how-it-works" class="btn btn-primary">{$t('homepage.hero.cta')}</a>
					</div>
				</div>
			</div>
		</div>

		<!-- Features Section -->
		<div class="bg-base-100 px-4 py-12">
			<h2 class="mb-8 text-center text-3xl font-bold">{$t('homepage.features.title')}</h2>
			<div class="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
				<div class="card bg-base-200">
					<div class="card-body items-center text-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-primary h-12 w-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<h3 class="card-title">{$t('homepage.features.crypto.title')}</h3>
						<p>{$t('homepage.features.crypto.description')}</p>
					</div>
				</div>

				<div class="card bg-base-200">
					<div class="card-body items-center text-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-primary h-12 w-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
							/>
						</svg>
						<h3 class="card-title">{$t('homepage.features.talent.title')}</h3>
						<p>{$t('homepage.features.talent.description')}</p>
					</div>
				</div>

				<div class="card bg-base-200">
					<div class="card-body items-center text-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-primary h-12 w-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
							/>
						</svg>
						<h3 class="card-title">{$t('homepage.features.escrow.title')}</h3>
						<p>{$t('homepage.features.escrow.description')}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- CTA Section -->
		<div class="bg-primary text-primary-content glow-effect px-4 py-12">
			<div class="glow-container">
				<div
					class="glow-blur glow-accent top-[30%] left-[20%] h-[15vw] w-[15vw]"
					style="opacity: 0.3; animation-delay: -3s;"
				></div>
				<div
					class="glow-blur glow-primary right-[25%] bottom-[30%] h-[12vw] w-[12vw]"
					style="opacity: 0.25; animation-delay: -7s;"
				></div>
			</div>
			<div class="relative z-10 mx-auto max-w-3xl text-center">
				<h2 class="mb-4 text-3xl font-bold">{$t('homepage.cta.title')}</h2>
				<p class="mb-6">{$t('homepage.cta.description')}</p>
				<a href="/auth/login" class="btn btn-secondary">{$t('homepage.cta.button')}</a>
			</div>
		</div>
	</div>
{/if}
