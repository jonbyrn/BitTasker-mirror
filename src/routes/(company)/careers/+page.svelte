<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { darkMode } from '$lib/stores/theme.store';
	import { t, locale } from 'svelte-i18n';
	import IconEmailOutline from '~icons/mdi/email-outline';

	let { data } = $props();
	const seo = data.seo;

	// Obfuscate email address to make it harder for simple bots to scrape
	// This is constructed on the client-side
	const user = 'careers';
	const domain = 'bittasker.com';
	const mailtoHref = `mailto:${user}@${domain}`;

	// Job application sections visibility state with Svelte 5 runes
	let expandedSection = $state<string | null>(null);

	function toggleSection(section: string): void {
		expandedSection = expandedSection === section ? null : section;
	}
</script>

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
	<meta property="og:image:alt" content="BitTasker Careers - Join the Bitcoin Revolution" />
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
	{@html `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
</svelte:head>

<div class="w-full">
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h3>{$t('about_careers.join.title')}</h3>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('about_careers.join.description')}
				</p>
			</div>
		</div>
	</section>

	<!-- Our Culture Section -->
	<div class="prose mx-auto my-16 max-w-4xl px-8">
		<div class="mb-12 text-center">
			<h3>{$t('about_careers.culture.title')}</h3>
			<p class="text-base-content/80 py-6 text-lg">
				{$t('about_careers.culture.description')}
			</p>
		</div>
	</div>
	<!-- Why Join BitTasker Section -->
	<div class="prose mx-auto my-16 max-w-4xl px-5 sm:px-8">
		<div class="mx-auto max-w-4xl">
			<div class="mb-8">
				<div class="mb-4 flex items-baseline gap-4">
					<h3>{$t('why.join.bittasker')}</h3>
				</div>

				<div class="card bg-base-100 mb-4 shadow-lg">
					<div class="card-body">
						<p class="mb-4">
							{$t('careers.why_join.description')}
						</p>

						<div class="divider">{$t('careers.why_join.core_values')}</div>

						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{$t('careers.why_join.bitcoin_first.title')}</h4>
									<p>
										{$t('careers.why_join.bitcoin_first.description')}
									</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{$t('careers.why_join.fully_remote.title')}</h4>
									<p>{$t('careers.why_join.fully_remote.description')}</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">
										{$t('careers.why_join.innovation_driven.title')}
									</h4>
									<p>
										{$t('careers.why_join.innovation_driven.description')}
									</p>
								</div>
							</div>

							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title">{$t('careers.why_join.mission_focused.title')}</h4>
									<p>
										{$t('careers.why_join.mission_focused.description')}
									</p>
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
							<p>
								{$t('careers.about.join')}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Open Positions -->
	<div class="prose mx-auto my-16 max-w-4xl px-5 sm:p-8">
		<div class="mb-4 flex items-baseline gap-4">
			<h3>{$t('careers.section_title')}</h3>
		</div>

		<div class="card bg-base-100 mb-4 shadow-lg">
			<div class="card-body">
				<p class="mb-4">{$t('careers.section_description')}</p>

				<div class="join join-vertical w-full">
					<!-- Position 1: Full Stack Developer -->
					<div
						class="collapse-arrow join-item border-base-300 collapse border-b"
						class:collapse-open={expandedSection === 'dev'}
					>
						<button
							type="button"
							class="collapse-title text-left text-lg font-medium sm:text-xl"
							onclick={() => toggleSection('dev')}
						>
							{$t('careers.positions.dev.title')}
							<span class="badge badge-primary ml-2 text-[10px] whitespace-nowrap sm:text-sm"
								>{$t('careers.positions.dev.location')}</span
							>
						</button>
						<div class="collapse-content">
							<div class="mt-4 space-y-4">
								<h4 class="font-medium">{$t('careers.positions.dev.about_title')}</h4>
								<p>{$t('careers.positions.dev.about_description')}</p>

								<h4 class="font-medium">{$t('careers.positions.dev.responsibilities_title')}</h4>
								<ul class="ml-5 list-disc space-y-1">
									<li>{$t('careers.positions.dev.responsibility_1')}</li>
									<li>{$t('careers.positions.dev.responsibility_2')}</li>
									<li>{$t('careers.positions.dev.responsibility_3')}</li>
									<li>{$t('careers.positions.dev.responsibility_4')}</li>
									<li>{$t('careers.positions.dev.responsibility_5')}</li>
								</ul>

								<h4 class="font-medium">{$t('careers.positions.dev.qualifications_title')}</h4>
								<ul class="ml-5 list-disc space-y-1">
									<li>{$t('careers.positions.dev.qual_1')}</li>
									<li>{$t('careers.positions.dev.qual_2')}</li>
									<li>{$t('careers.positions.dev.qual_3')}</li>
									<li>{$t('careers.positions.dev.qual_4')}</li>
									<li>{$t('careers.positions.dev.qual_5')}</li>
									<li>{$t('careers.positions.dev.qual_6')}</li>
								</ul>

								<div class="card-actions mt-4 justify-end">
									<a href={mailtoHref} class="btn btn-primary">{$t('careers.apply_now')}</a>
								</div>
							</div>
						</div>
					</div>

					<!-- Position 2: Public Relations Specialist -->
					<div
						class="collapse-arrow join-item border-base-300 collapse border-b"
						class:collapse-open={expandedSection === 'pr'}
					>
						<button
							type="button"
							class="collapse-title text-left text-lg font-medium sm:text-xl"
							onclick={() => toggleSection('pr')}
						>
							{$t('careers.positions.pr.title')}
							<span class="badge badge-primary ml-2 text-[10px] whitespace-nowrap sm:text-sm"
								>{$t('careers.positions.pr.location')}</span
							>
						</button>
						<div class="collapse-content">
							<div class="mt-4 space-y-4">
								<h4 class="font-medium">{$t('careers.positions.pr.about_title')}</h4>
								<p>{$t('careers.positions.pr.about_description')}</p>

								<h4 class="font-medium">{$t('careers.positions.pr.responsibilities_title')}</h4>
								<ul class="ml-5 list-disc space-y-1">
									<li>{$t('careers.positions.pr.responsibility_1')}</li>
									<li>{$t('careers.positions.pr.responsibility_2')}</li>
									<li>{$t('careers.positions.pr.responsibility_3')}</li>
									<li>{$t('careers.positions.pr.responsibility_4')}</li>
								</ul>

								<h4 class="font-medium">{$t('careers.positions.pr.qualifications_title')}</h4>
								<ul class="ml-5 list-disc space-y-1">
									<li>{$t('careers.positions.pr.qual_1')}</li>
									<li>{$t('careers.positions.pr.qual_2')}</li>
									<li>{$t('careers.positions.pr.qual_3')}</li>
									<li>{$t('careers.positions.pr.qual_4')}</li>
									<li>{$t('careers.positions.pr.qual_5')}</li>
									<li>{$t('careers.positions.pr.qual_6')}</li>
								</ul>

								<div class="card-actions mt-4 justify-end">
									<a href={mailtoHref} class="btn btn-primary">{$t('careers.apply_now')}</a>
								</div>
							</div>
						</div>
					</div>

					<!-- Position 3: Media Specialist/PR -->
					<div
						class="collapse-arrow join-item border-base-300 collapse border-b"
						class:collapse-open={expandedSection === 'media'}
					>
						<button
							type="button"
							class="collapse-title text-left text-lg font-medium sm:text-xl"
							onclick={() => toggleSection('media')}
						>
							{$t('careers.positions.media.title')}
							<span class="badge badge-primary ml-2 text-[10px] whitespace-nowrap sm:text-sm">
								{$t('careers.positions.media.location')}</span
							>
						</button>
						<div class="collapse-content">
							<div class="mt-4 space-y-4">
								<h4 class="font-medium">{$t('careers.positions.media.about_title')}</h4>
								<p>{$t('careers.positions.media.about_description')}</p>

								<h4 class="font-medium">{$t('careers.positions.media.responsibilities_title')}</h4>
								<ul class="ml-5 list-disc space-y-1">
									<li>{$t('careers.positions.media.responsibility_1')}</li>
									<li>{$t('careers.positions.media.responsibility_2')}</li>
									<li>{$t('careers.positions.media.responsibility_3')}</li>
									<li>{$t('careers.positions.media.responsibility_4')}</li>
								</ul>

								<h4 class="font-medium">{$t('careers.positions.media.qualifications_title')}</h4>
								<ul class="ml-5 list-disc space-y-1">
									<li>{$t('careers.positions.media.qual_1')}</li>
									<li>{$t('careers.positions.media.qual_2')}</li>
									<li>{$t('careers.positions.media.qual_3')}</li>
									<li>{$t('careers.positions.media.qual_4')}</li>
									<li>{$t('careers.positions.media.qual_5')}</li>
									<li>{$t('careers.positions.media.qual_6')}</li>
								</ul>

								<div class="card-actions mt-4 justify-end">
									<a href={mailtoHref} class="btn btn-primary">{$t('careers.apply_now')}</a>
								</div>
							</div>
						</div>
					</div>

					<!-- Position 4: Brand Ambassador -->
					<div
						class="collapse-arrow join-item border-base-300 collapse border-b"
						class:collapse-open={expandedSection === 'ambassador'}
					>
						<button
							type="button"
							class="collapse-title text-left text-lg font-medium sm:text-xl"
							onclick={() => toggleSection('ambassador')}
						>
							{$t('careers.positions.ambassador.title')}
							<span class="badge badge-primary ml-2 text-[10px] whitespace-nowrap sm:text-sm"
								>{$t('careers.positions.ambassador.location')}</span
							>
						</button>
						<div class="collapse-content">
							<div class="mt-4 space-y-4">
								<h4 class="font-medium">{$t('careers.positions.ambassador.about_title')}</h4>
								<p>{$t('careers.positions.ambassador.about_description')}</p>

								<h4 class="font-medium">
									{$t('careers.positions.ambassador.responsibilities_title')}
								</h4>
								<ul class="ml-5 list-disc space-y-1">
									<li>{$t('careers.positions.ambassador.responsibility_1')}</li>
									<li>{$t('careers.positions.ambassador.responsibility_2')}</li>
									<li>{$t('careers.positions.ambassador.responsibility_3')}</li>
									<li>{$t('careers.positions.ambassador.responsibility_4')}</li>
								</ul>

								<h4 class="font-medium">
									{$t('careers.positions.ambassador.qualifications_title')}
								</h4>
								<ul class="ml-5 list-disc space-y-1">
									<li>{$t('careers.positions.ambassador.qual_1')}</li>
									<li>{$t('careers.positions.ambassador.qual_2')}</li>
									<li>{$t('careers.positions.ambassador.qual_3')}</li>
									<li>{$t('careers.positions.ambassador.qual_4')}</li>
									<li>{$t('careers.positions.ambassador.qual_5')}</li>
									<li>{$t('careers.positions.ambassador.qual_6')}</li>
								</ul>

								<div class="card-actions mt-4 justify-end">
									<a href={mailtoHref} class="btn btn-primary">{$t('careers.apply_now')}</a>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- How to Apply Section -->
	<div class="bg-base-200 my-16 px-8">
		<div class="w-full py-16">
			<div class="mx-auto max-w-3xl text-center">
				<h3 class="mb-6">{$t('careers.how_to_apply.title')}</h3>
				<p class="mb-6">{$t('careers.how_to_apply.description')}</p>

				<div class="card-body items-center text-center">
					<a href={mailtoHref} class="btn btn-primary btn-wide mt-4">
						<IconEmailOutline class="text-xl" />
						{$t('careers.how_to_apply.button')}
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
