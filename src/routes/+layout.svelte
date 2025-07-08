<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/stores/i18n.store';
	import { Preferences } from '@capacitor/preferences';
	import { page } from '$app/state';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { darkMode, setDarkMode } from '$lib/stores/theme.store';
	import { deviceInfo, getDeviceInfo, getOnboardingCompleted } from '$lib/stores/deviceInfo.store';
	import { setupKeyboardListeners, setupGlobalInputFocusScroll } from '$lib/utils/helpers/keyboard';
	import TopBar from '$lib/components/TopBar.svelte';
	import BottomNavBar from '$lib/components/BottomNavBar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import '../app.css';

	// Import FontAwesome CSS
	import '$lib/styles/fontawesome.css';

	const { children } = $props();

	// Control for showing top and bottom bars - can be overridden by child layouts
	let showTopBar = $state(true);
	let showBottomBar = $state(false); // Default to false, enabled in protected routes as needed
	let width = $state(375);
	let height = $state(window.innerHeight);
	let isLandingPage = $state(false);

	// Update layout based on current route
	$effect(() => {
		const path = page.url.pathname;
		// Determine if on landing page (homepage, how-it-works, etc.)
		isLandingPage = path === '/' || path === '/how-it-works' || path.startsWith('/auth');

		// Show top bar everywhere except specific routes that handle their own layout
		showTopBar = !path.includes('/onboarding');

		// Only show bottom bar in dashboard routes
		showBottomBar = path.includes('/dashboard');
	});

	$effect(() => {
		setDarkMode($darkMode);
	});

	// Initialize theme based on system preference
	// TODO: Properly handle the cleanup of the global input focus scroll listener
	onMount(async (): Promise<any> => {
		const { value: savedDarkMode } = await Preferences.get({ key: StorageKeys.THEME });

		if (savedDarkMode) {
			$darkMode = savedDarkMode === 'true';
		}

		// Listen for system theme changes
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
			const { value: changedDarkMode } = await Preferences.get({ key: StorageKeys.THEME });
			if (!changedDarkMode) {
				$darkMode = e.matches;
			}
		});

		await getDeviceInfo();
		await getOnboardingCompleted();

		setupKeyboardListeners();
		const cleanup = setupGlobalInputFocusScroll();
		return cleanup;
	});
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<main
	data-theme={$darkMode ? 'BitTasker-Dark' : 'BitTasker-Light'}
	id="main"
	class="flex h-[100dvh] flex-col"
>
	<!-- Desktop TopBar will be positioned fixed via its own component styles -->
	{#if showTopBar}
		<TopBar />
	{/if}

	<div
		class="flex flex-1 flex-col overflow-auto {$deviceInfo?.platform === 'web' && width > 768
			? 'pt-16'
			: ''}"
	>
		{#if $deviceInfo?.platform === 'web' && width > 768 && !isLandingPage}
			<div class="bg-base-200 flex flex-grow">
				{@render children()}
			</div>
		{:else}
			<div
				class="bg-base-200 flex flex-1 flex-col justify-between overflow-x-hidden"
				style={showBottomBar ? 'padding-bottom: var(--dock-height, 5rem);' : ''}
			>
				{@render children()}
			</div>
		{/if}
	</div>
	{#if !showBottomBar && showTopBar}
		<!-- Section 7: Final Call to Action (CTA) -->
		<section class="bg-primary text-primary-content py-16">
			<div class="container mx-auto px-4 text-center">
				<h2 class="text-4xl font-bold">{$t('homepage.v2.finalcta.title')}</h2>
				<p class="mx-auto mt-4 max-w-2xl text-lg">{$t('homepage.v2.finalcta.description')}</p>
				<div class="mt-8 flex flex-col items-center space-y-6">
					<div class="flex flex-wrap justify-center gap-4">
						<a
							href="/dashboard/find-tasks"
							class="btn btn-lg border-none bg-black text-white shadow-lg hover:bg-gray-800"
						>
							{$t('homepage.v2.finalcta.client_cta')}
						</a>
						<a
							href="/dashboard/professionals"
							class="btn btn-lg border-none bg-black text-white shadow-lg hover:bg-gray-800"
						>
							{$t('homepage.v2.finalcta.freelancer_cta')}
						</a>
					</div>
					<div>
						<a
							href="/auth/signup"
							class="btn hover:bg-primary btn-lg border-none bg-white px-8 text-black shadow-lg hover:text-white"
						>
							{$t('homepage.v2.finalcta.get_started')}
						</a>
					</div>
				</div>
			</div>
		</section>
		<footer class="bg-base-300 text-base-content/70 py-12">
			<div class="container mx-auto px-4">
				<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
					<!-- Company Info -->
					<div class="md:col-span-2 lg:col-span-1">
						<h3 class="text-base-content mb-4 text-lg font-bold">BitTasker</h3>
						<p class="mb-4">{$t('footer.company_description')}</p>
						<!-- Social media icons -->
						<div class="flex space-x-4">
							<a
								href="https://twitter.com/bittasker"
								class="hover:text-primary text-lg"
								aria-label="BitTasker on X (Twitter)"
							>
								<i class="fa-brands fa-x-twitter"></i>
							</a>
							<a
								href="https://facebook.com/bittasker"
								class="hover:text-primary text-lg"
								aria-label="BitTasker on Facebook"
							>
								<i class="fa-brands fa-facebook"></i>
							</a>
							<a
								href="https://instagram.com/bittasker"
								class="hover:text-primary text-lg"
								aria-label="BitTasker on Instagram"
							>
								<i class="fa-brands fa-instagram"></i>
							</a>
							<a
								href="https://youtube.com/bittasker"
								class="hover:text-primary text-lg"
								aria-label="BitTasker on YouTube"
							>
								<i class="fa-brands fa-youtube"></i>
							</a>
							<a
								href="https://linkedin.com/company/bittasker"
								class="hover:text-primary text-lg"
								aria-label="BitTasker on LinkedIn"
							>
								<i class="fa-brands fa-linkedin"></i>
							</a>
							<a
								href="https://reddit.com/r/bittasker"
								class="hover:text-primary text-lg"
								aria-label="BitTasker on Reddit"
							>
								<i class="fa-brands fa-reddit"></i>
							</a>
							<a
								href="https://rumble.com/c/bittasker"
								class="hover:text-primary text-lg"
								aria-label="BitTasker on Rumble"
							>
								<i class="fa-solid fa-play"></i>
							</a>
						</div>
					</div>

					<!-- Client and Tasker Columns (side by side on mobile) -->
					<div class="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-2">
						<!-- For Clients -->
						<div>
							<h3 class="text-base-content mb-4 text-lg font-bold">{$t('footer.for_clients')}</h3>
							<ul class="space-y-2">
								<li>
									<a href="/dashboard/create-task" class="hover:text-primary"
										>{$t('footer.post_task')}</a
									>
								</li>
								<li>
									<a href="/how-it-works" class="hover:text-primary">{$t('footer.how_it_works')}</a>
								</li>
								<li><a href="/fees" class="hover:text-primary">{$t('footer.fees')}</a></li>
								<li><a href="/escrow" class="hover:text-primary">{$t('footer.escrow')}</a></li>
								<li><a href="/faq" class="hover:text-primary">{$t('footer.faq')}</a></li>
							</ul>
						</div>

						<!-- For Taskers -->
						<div>
							<h3 class="text-base-content mb-4 text-lg font-bold">{$t('footer.for_taskers')}</h3>
							<ul class="space-y-2">
								<li>
									<a href="/dashboard/find-tasks" class="hover:text-primary">
										{$t('footer.start_earning')}
									</a>
								</li>
								<li>
									<a href="/community-guidelines" class="hover:text-primary"
										>{$t('footer.community_guidelines')}</a
									>
								</li>
								<li>
									<a href="/fees" class="hover:text-primary">{$t('footer.tasker_fees')}</a>
								</li>
								<li>
									<a href="/tasker-principles" class="hover:text-primary"
										>{$t('footer.tasker_principles')}</a
									>
								</li>
								<li>
									<a href="/faq" class="hover:text-primary">{$t('footer.tasker_faq')}</a>
								</li>
							</ul>
						</div>
					</div>

					<!-- Legal -->
					<div class="lg:col-span-1">
						<h3 class="text-base-content mb-4 text-lg font-bold">{$t('footer.company')}</h3>
						<ul class="space-y-2">
							<li><a href="/about" class="hover:text-primary">{$t('footer.about_us')}</a></li>
							<li><a href="/careers" class="hover:text-primary">{$t('footer.careers')}</a></li>
							<li><a href="/press" class="hover:text-primary">{$t('footer.press')}</a></li>
							<li><a href="/terms" class="hover:text-primary">{$t('footer.terms')}</a></li>
							<li><a href="/privacy" class="hover:text-primary">{$t('footer.privacy')}</a></li>
							<li><a href="/contact" class="hover:text-primary">{$t('footer.contact')}</a></li>
						</ul>
					</div>
				</div>

				<div class="border-base-content/10 mt-12 border-t pt-8 text-center">
					<p>© {new Date().getFullYear()} BitTasker. {$t('footer.copyright')}</p>
				</div>
			</div>
		</footer>
	{/if}

	{#if showBottomBar && ($deviceInfo?.platform !== 'web' || width <= 768)}
		<div class="pb-safe right-0 bottom-0 left-0 z-50">
			<BottomNavBar />
		</div>
	{/if}

	<!-- Toast notifications -->
	<Toast />
</main>
