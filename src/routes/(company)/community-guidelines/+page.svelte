<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';
	import type { PageData } from './$types';

	let { data: seo }: { data: PageData } = $props();

	let openAccordion = $state({
		taskers: -1,
		taskees: -1
	});

	function toggleAccordion(category: keyof typeof openAccordion, index: number) {
		if (openAccordion[category] === index) {
			openAccordion[category] = -1; // Close if already open
		} else {
			openAccordion[category] = index; // Open the new one
		}
	}
</script>

<svelte:head>
	<DocumentTitle fallback={seo.title} />
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
	<meta property="og:image:alt" content="Community Guidelines - BitTasker" />
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
				<h1>{$t('guidelines.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg mb-6">
					{@html $t('guidelines.intro')}
				</p>
				<p class="text-base-content/80 text-sm">
					{$t('guidelines.last_updated')}
				</p>
			</div>
		</div>
	</section>

	<div class="prose mx-auto max-w-4xl my-16 px-8">
		<div class="mb-4">
			<h3>{$t('guidelines.section_taskers.title')}</h3>
		</div>

		<div class="card bg-base-100 my-4 shadow-lg">
			<div class="card-body">
				<div class="join join-vertical w-full">
					<!-- Taskers Accordion Items -->
					{#each [0, 1, 2] as index}
						<div
							class="collapse-arrow join-item border-base-300 collapse border-b"
							class:collapse-open={openAccordion.taskers === index}
						>
							<button
								type="button"
								class="collapse-title text-left text-xl font-medium"
								onclick={() => toggleAccordion('taskers', index)}
							>
								{$t(`guidelines.taskers.${index + 1}.title`)}
							</button>
							<div class="collapse-content prose">
								<ul class="list-inside list-disc">
									{#each Array(5) as _, i}
										<li>{@html $t(`guidelines.taskers.${index + 1}.item_${i + 1}`)}</li>
									{/each}
								</ul>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="my-4 pt-8">
			<h3>{$t('guidelines.section_taskees.title')}</h3>
		</div>

		<div class="card bg-base-100 mt-4 shadow-lg">
			<div class="card-body">
				<div class="join join-vertical w-full">
					<!-- Taskees Accordion Items -->
					{#each [0, 1, 2] as index}
						<div
							class="collapse-arrow join-item border-base-300 collapse border-b"
							class:collapse-open={openAccordion.taskees === index}
						>
							<button
								type="button"
								class="collapse-title text-left text-xl font-medium"
								onclick={() => toggleAccordion('taskees', index)}
							>
								{$t(`guidelines.taskees.${index + 1}.title`)}
							</button>
							<div class="collapse-content prose">
								<ul class="list-inside list-disc">
									{#each Array(5) as _, i}
										<li>{@html $t(`guidelines.taskees.${index + 1}.item_${i + 1}`)}</li>
									{/each}
								</ul>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Trust & Safety Section -->
	<div class="flex justify-center px-8 my-16">
		<div class="bg-base-200 rounded-box w-full max-w-4xl p-6 text-center">
			<h3 class="mb-4">{$t('guidelines.trust.title')}</h3>
			<p class="text-base-content/80 mb-4">
				{@html $t('guidelines.trust.part1')}
			</p>
			<p class="text-base-content/80">
				{@html $t('guidelines.trust.part2')}
			</p>
		</div>
	</div>
</div>
