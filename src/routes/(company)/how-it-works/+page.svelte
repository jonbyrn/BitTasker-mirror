<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '$lib/components/Logo.svelte';
	import { howItWorksText } from '$lib/i18n/howItWorksText';
	import { onMount } from 'svelte';
	import { locale } from 'svelte-i18n';
	// Icon imports for unplugin-icons
	import IconFileUpload from '~icons/mdi/file-upload';
	import IconHandshake from '~icons/mdi/handshake';
	import IconLock from '~icons/mdi/lock';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconMessageText from '~icons/mdi/message-text';

	let { data: seo } = $props();

	let jsonLdHtml = $derived(
		`<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</${'script>'}`
	);

	// `{@html}` keeps the prerendered markup through hydration, so HTML strings
	// stay on the English prerender until after mount, then follow `$locale`.
	let htmlReady = $state(false);

	onMount(() => {
		htmlReady = true;
	});

	function copy(key: string): string {
		return howItWorksText(key, $locale, key);
	}

	function rich(key: string): string {
		return howItWorksText(key, htmlReady ? $locale : 'en', key);
	}

	// State for tasker/taskee accordion in step 3
	let openTaskTalentSection = $state<number>(-1); // Default to closed

	// Function to toggle between tasker and taskee accordion
	function toggleTaskTalentSection(index: number): void {
		if (openTaskTalentSection === index) {
			openTaskTalentSection = -1; // Close if already open
		} else {
			openTaskTalentSection = index; // Open the new one
		}
	}
</script>

<!-- eslint-disable svelte/no-at-html-tags -->
<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<meta name="keywords" content={seo.keywords} />
	<meta name="author" content="BitTasker" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={seo.canonical} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />

	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="How BitTasker Works - Bitcoin Task Marketplace" />
	<meta property="og:site_name" content="BitTasker" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={seo.canonical} />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />

	<meta property="twitter:image:alt" content="BitTasker Logo" />
	<meta property="twitter:site" content="@BitTaskerdotcom" />
	<meta property="twitter:creator" content="@BitTaskerdotcom" />

	<!-- Structured Data -->
	{@html jsonLdHtml}
</svelte:head>

<div class="w-full">
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h1>{copy('how_it_works.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{copy('how_it_works.hero.description')}
				</p>
			</div>
		</div>
	</section>

	<!-- Overview Section -->
	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<div class="mb-12 text-center">
			<h3>{copy('how_it_works.overview.title')}</h3>
			<p class="text-base-content/80 py-6 text-lg">
				{copy('how_it_works.overview.description')}
			</p>
		</div>

		<!-- Steps Overview -->
		<div class="mb-12 flex justify-center">
			<div class="steps steps-vertical md:steps-horizontal gap-2">
				<div class="step step-primary">
					<div>{copy('how_it_works.steps.sign_up')}</div>
				</div>
				<div class="step step-primary">
					<div>{copy('how_it_works.steps.create_profile')}</div>
				</div>
				<div class="step step-primary">
					<div>{copy('how_it_works.steps.find_tasks')}</div>
				</div>
				<div class="step step-primary">
					<div>{copy('how_it_works.steps.complete_work')}</div>
				</div>
				<div class="step step-primary">
					<div>{copy('how_it_works.steps.get_paid')}</div>
				</div>
			</div>
		</div>

		<div class="alert alert-success alert-outline mb-8">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				class="h-6 w-6 shrink-0 stroke-current"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				></path>
			</svg>
			<span>
				<strong>{copy('how_it_works.alert.title')}</strong>
				{@html rich('how_it_works.alert.description')}
			</span>
		</div>

		<!-- Detailed Steps Section -->
		<div class="mx-auto max-w-4xl">
			<h3 class="mb-6 text-center">
				{copy('how_it_works.detailed_guide.title')}
			</h3>

			<!-- Step 1: Sign Up -->
			<div class="mb-8">
				<div class="mb-4 flex items-baseline gap-4">
					<div
						class="bg-primary text-primary-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-2xl sm:min-h-12 sm:min-w-12 sm:text-3xl"
					>
						1
					</div>
					<h3>{copy('how_it_works.step_1.title')}</h3>
				</div>

				<div class="card bg-base-100 mb-4 shadow-lg">
					<div class="card-body">
						<p class="mb-4">{copy('how_it_works.step_1.description')}</p>

						<div class="mt-0 flex flex-col gap-4 md:flex-row">
							<div class="flex-1">
								<h4 class="mt-0 mb-2">{copy('how_it_works.step_1.quick_secure.title')}</h4>
								<ul class="list-inside list-disc space-y-1">
									<li>{copy('how_it_works.step_1.quick_secure.item_1')}</li>
									<li>{copy('how_it_works.step_1.quick_secure.item_2')}</li>
									<li>{copy('how_it_works.step_1.quick_secure.item_3')}</li>
								</ul>
							</div>
							<div class="flex-1">
								<h4 class="mt-0 mb-2">{copy('how_it_works.step_1.requirements.title')}</h4>
								<ul class="list-inside list-disc space-y-1">
									<li>{copy('how_it_works.step_1.requirements.item_1')}</li>
									<li>{copy('how_it_works.step_1.requirements.item_2')}</li>
								</ul>
							</div>
						</div>

						<div class="alert alert-primary alert-outline mt-0">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								class="h-6 w-6 shrink-0 stroke-current"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
							<span>{@html rich('how_it_works.step_1.security_note')}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Step 2: Create Profile -->
			<div class="mb-8">
				<div class="mb-4 flex items-baseline gap-4">
					<div
						class="bg-primary text-primary-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-2xl sm:min-h-12 sm:min-w-12 sm:text-3xl"
					>
						2
					</div>
					<h3>{copy('how_it_works.step_2.title')}</h3>
				</div>

				<div class="card bg-base-100 mb-4 shadow-lg">
					<div class="card-body">
						<p class="mb-4">{copy('how_it_works.step_2.description')}</p>

						<div class="divider">{copy('how_it_works.step_2.divider')}</div>

						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{copy('how_it_works.step_2.skills.title')}</h4>
									<p>{copy('how_it_works.step_2.skills.description')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{copy('how_it_works.step_2.experience.title')}</h4>
									<p>{copy('how_it_works.step_2.experience.description')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{copy('how_it_works.step_2.rates.title')}</h4>
									<p>{copy('how_it_works.step_2.rates.description')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{copy('how_it_works.step_2.payments.title')}</h4>
									<p>{copy('how_it_works.step_2.payments.description')}</p>
								</div>
							</div>
						</div>

						<div class="alert alert-success alert-outline mt-6">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span>{@html rich('how_it_works.step_2.tip')}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Step 3: Find Tasks/Talent -->
			<div class="mb-8">
				<div class="mb-4 flex items-baseline gap-4">
					<div
						class="bg-primary text-primary-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-2xl sm:min-h-12 sm:min-w-12 sm:text-3xl"
					>
						3
					</div>
					<h3>{copy('how_it_works.step_3.title')}</h3>
				</div>

				<div class="card bg-base-100 mb-4 shadow-lg">
					<div class="card-body">
						<p class="mb-4">{copy('how_it_works.step_3.description')}</p>

						<div class="join join-vertical w-full">
							<!-- For Taskers -->
							<div
								class="collapse-arrow join-item border-base-300 collapse border-b"
								class:collapse-open={openTaskTalentSection === 0}
							>
								<button
									type="button"
									class="collapse-title text-left text-xl font-medium"
									onclick={() => toggleTaskTalentSection(0)}
								>
									{copy('how_it_works.step_3.for_taskers.title')}
								</button>
								<div class="collapse-content">
									<div class="space-y-4">
										<div class="mt-4 flex items-start gap-4">
											<div
												class="border-primary text-primary mt-1 flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
											>
												1
											</div>
											<div>
												<h6 class="mb-0.5 font-medium">
													{copy('how_it_works.step_3.for_taskers.1.title')}
												</h6>
												<p class="text-base-content/80 mt-1">
													{copy('how_it_works.step_3.for_taskers.1.description')}
												</p>
											</div>
										</div>

										<div class="flex items-start gap-4">
											<div
												class="border-primary text-primary mt-1 flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
											>
												2
											</div>
											<div>
												<h6 class="mb-0.5 font-medium">
													{copy('how_it_works.step_3.for_taskers.2.title')}
												</h6>
												<p class="text-base-content/80 mt-1">
													{copy('how_it_works.step_3.for_taskers.2.description')}
												</p>
											</div>
										</div>

										<div class="flex items-start gap-4">
											<div
												class="border-primary text-primary mt-1 flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
											>
												3
											</div>
											<div>
												<h6 class="mb-0.5 font-medium">
													{copy('how_it_works.step_3.for_taskers.3.title')}
												</h6>
												<p class="text-base-content/80 mt-1">
													{@html rich('how_it_works.step_3.for_taskers.3.description')}
												</p>
											</div>
										</div>
									</div>

									<div class="alert alert-info alert-outline mt-6">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											class="h-6 w-6 shrink-0 stroke-current"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
											></path>
										</svg>
										<span>{@html rich('how_it_works.step_3.for_taskers.tip')}</span>
									</div>
								</div>
							</div>

							<!-- For Taskees -->
							<div
								class="collapse-arrow join-item border-base-300 collapse border-b"
								class:collapse-open={openTaskTalentSection === 1}
							>
								<button
									type="button"
									class="collapse-title text-left text-xl font-medium"
									onclick={() => toggleTaskTalentSection(1)}
								>
									{copy('how_it_works.step_3.for_taskees.title')}
								</button>
								<div class="collapse-content">
									<div class="space-y-4">
										<div class="mt-4 flex items-start gap-4">
											<div
												class="border-primary text-primary mt-1 flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
											>
												1
											</div>
											<div>
												<h6 class="font-medium">
													{copy('how_it_works.step_3.for_taskees.1.title')}
												</h6>
												<p class="text-base-content/80 mt-1">
													{copy('how_it_works.step_3.for_taskees.1.description')}
												</p>
											</div>
										</div>

										<div class="flex items-start gap-4">
											<div
												class="border-primary text-primary mt-1 flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
											>
												2
											</div>
											<div>
												<h6 class="font-medium">
													{copy('how_it_works.step_3.for_taskees.2.title')}
												</h6>
												<p class="text-base-content/80 mt-1">
													{copy('how_it_works.step_3.for_taskees.2.description')}
												</p>
											</div>
										</div>

										<div class="flex items-start gap-4">
											<div
												class="border-primary text-primary mt-1 flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
											>
												3
											</div>
											<div>
												<h6 class="font-medium">
													{copy('how_it_works.step_3.for_taskees.3.title')}
												</h6>
												<p class="text-base-content/80 mt-1">
													{copy('how_it_works.step_3.for_taskees.3.description')}
												</p>
											</div>
										</div>
									</div>

									<div class="alert alert-info alert-outline mt-6">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											class="h-6 w-6 shrink-0 stroke-current"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
											></path>
										</svg>
										<span>{@html rich('how_it_works.step_3.for_taskees.tip')}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Step 4: Complete Work -->
			<div class="mb-8">
				<div class="mb-4 flex items-baseline gap-4">
					<div
						class="bg-primary text-primary-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-2xl sm:min-h-12 sm:min-w-12 sm:text-3xl"
					>
						4
					</div>
					<h3>{copy('how_it_works.step_4.title')}</h3>
				</div>

				<div class="card bg-base-100 mb-4 shadow-lg">
					<div class="card-body">
						<p class="mb-4">{copy('how_it_works.step_4.description')}</p>

						<div class="divider">{copy('how_it_works.step_4.divider')}</div>

						<div class="space-y-6">
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<div class="flex items-center">
										<IconFileUpload class="text-primary mr-4 text-3xl md:text-xl" />
										<div>
											<h4 class="font-medium">{copy('how_it_works.step_4.files.title')}</h4>
											<p>{copy('how_it_works.step_4.files.description')}</p>
										</div>
									</div>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<div class="flex items-center">
										<IconMessageText class="text-primary mr-4 text-3xl md:text-xl" />
										<div>
											<h4 class="font-medium">{copy('how_it_works.step_4.translation.title')}</h4>
											<p>{copy('how_it_works.step_4.translation.description')}</p>
										</div>
									</div>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<div class="flex items-center">
										<IconHandshake class="text-primary mr-4 text-3xl md:text-xl" />
										<div>
											<h4 class="font-medium">{copy('how_it_works.step_4.completion.title')}</h4>
											<p>{copy('how_it_works.step_4.completion.description')}</p>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="alert alert-warning alert-outline mt-6">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"
								/>
							</svg>
							<span>{@html rich('how_it_works.step_4.warning')}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Step 5: Get Paid -->
			<!-- Note: It's not clear why, but we need to use text-3xl to make the icon sizes below match the ones above -->
			<div class="mb-8">
				<div class="mb-4 flex items-baseline gap-4">
					<div
						class="bg-primary text-primary-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-2xl sm:min-h-12 sm:min-w-12 sm:text-3xl"
					>
						5
					</div>
					<h3>{copy('how_it_works.step_5.title')}</h3>
				</div>

				<div class="card bg-base-100 mb-4 shadow-lg">
					<div class="card-body">
						<p class="mb-4">{copy('how_it_works.step_5.description')}</p>

						<div class="divider">
							{copy('how_it_works.step_5.features_title')}
						</div>

						<div class="space-y-6">
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<div class="flex items-center">
										<IconLock class="text-primary mr-4 text-6xl md:text-3xl" />
										<div>
											<h4 class="font-medium">{copy('how_it_works.step_5.feature_1.title')}</h4>
											<p>{@html rich('how_it_works.step_5.feature_1.description')}</p>
										</div>
									</div>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<div class="flex items-center">
										<IconClockOutline class="text-primary mr-4 text-6xl md:text-3xl" />
										<div>
											<h4 class="font-medium">{copy('how_it_works.step_5.feature_2.title')}</h4>
											<p>{copy('how_it_works.step_5.feature_2.description')}</p>
										</div>
									</div>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<div class="flex items-center">
										<IconLightningBolt class="text-primary mr-4 text-6xl md:text-3xl" />
										<div>
											<h4 class="font-medium">{copy('how_it_works.step_5.feature_3.title')}</h4>
											<p>{copy('how_it_works.step_5.feature_3.description')}</p>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="alert alert-primary alert-outline mt-6">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								class="h-6 w-6 shrink-0 stroke-current"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								></path>
							</svg>
							<span>{@html rich('how_it_works.step_5.alert')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- CTA Section -->
	<div class="mx-auto my-16 max-w-4xl px-8 text-center">
		<h3 class="mb-4">{copy('common.cta_title')}</h3>
		<p class="text-base-content/80 mx-auto mb-8 max-w-2xl text-lg">
			{copy('common.cta_description')}
		</p>

		<div class="flex flex-col justify-center gap-4 sm:flex-row">
			<a href={resolve('/auth/signup')} class="btn btn-primary btn-lg">
				{copy('common.create_account')}
			</a>
			<a href={resolve('/faq')} class="btn btn-outline btn-lg">
				{copy('common.browse_faq')}
			</a>
		</div>
	</div>
</div>
