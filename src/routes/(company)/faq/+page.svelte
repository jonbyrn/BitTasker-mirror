<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';

	let { data: seo } = $props();

	let openAccordion = $state({
		general: -1,
		taskers: -1,
		taskees: -1,
		payment: -1,
		nostr: -1,
		safety: -1
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
	<meta property="og:image:alt" content="BitTasker FAQ - Your Questions Answered" />
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
			<div class="max-w-3xl text-center">
				<!-- FAQ Section Header -->
				<h1>{$t('faq.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('faq.description')}
				</p>
			</div>
		</div>
	</section>

	<div class="prose mx-auto max-w-4xl my-16 px-8">
		<!-- General Questions -->
		<div class="bg-base-100 rounded-box p-6 my-12">
			<h3 class="mb-4 text-2xl font-bold mt-2">{$t('faq.general.title')}</h3>
			<div class="join join-vertical w-full">
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.general === 0}
				>
					<!-- FAQ Item: What is BitTasker? -->
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('general', 0)}
					>
						{$t('faq.general.0.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.general.0.answer')}</p>
					</div>
				</div>
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.general === 1}
				>
					<!-- FAQ Item: How does BitTasker work? -->
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('general', 1)}
					>
						{$t('faq.general.1.question')}
					</button>
					<div class="collapse-content prose">
						<ol>
							<li>
								<strong>{@html $t('faq.general.1.step_1_title')}</strong>
								{@html $t('faq.general.1.step_1_text')}
							</li>
							<li>
								<strong>{@html $t('faq.general.1.step_2_title')}</strong>
								{@html $t('faq.general.1.step_2_text')}
							</li>
							<li>
								<strong>{@html $t('faq.general.1.step_3_title')}</strong>
								{@html $t('faq.general.1.step_3_text')}
							</li>
							<li>
								<strong>{@html $t('faq.general.1.step_4_title')}</strong>
								{@html $t('faq.general.1.step_4_text')}
							</li>
						</ol>
					</div>
				</div>
			</div>
		</div>

		<!-- For Taskers -->
		<div class="bg-base-100 rounded-box p-6 my-12">
			<h3 class="mb-4 text-2xl font-bold mt-2">{$t('faq.taskers.title')}</h3>
			<div class="join join-vertical w-full">
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.taskers === 0}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('taskers', 0)}
					>
						{$t('faq.taskers.0.question')}
					</button>
					<div class="collapse-content prose">
						<p>{@html $t('faq.taskers.0.answer')}</p>
					</div>
				</div>
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.taskers === 1}
				>
					<!-- FAQ Item: Taskers - How does payment work? -->
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('taskers', 1)}
					>
						{$t('faq.taskers.1.question')}
					</button>
					<div class="collapse-content prose">
						<p>{@html $t('faq.taskers.1.answer')}</p>
					</div>
				</div>
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-200 collapse border-b"
					class:collapse-open={openAccordion.taskers === 2}
				>
					<!-- FAQ Item: Taskers - What if I'm not satisfied with the work? -->
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('taskers', 2)}
					>
						{$t('faq.taskers.2.question')}
					</button>
					<div class="collapse-content prose">
						<p class="text-base-content/80">{@html $t('faq.taskers.2.answer')}</p>
					</div>
				</div>
				<!-- FAQ Item: Taskers - Can I cancel a task? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.taskers === 3}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('taskers', 3)}
					>
						{$t('faq.taskers.3.question')}
					</button>
					<div class="collapse-content prose">
						<p>{@html $t('faq.taskers.3.answer')}</p>
					</div>
				</div>

				<!-- FAQ Item: Taskers - What are the fees for taskers? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.taskers === 4}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('taskers', 4)}
					>
						{$t('faq.taskers.4.question')}
					</button>
					<div class="collapse-content prose">
						<p>{@html $t('faq.taskers.4.answer')}</p>
					</div>
				</div>
			</div>
		</div>

		<div class="bg-base-100 rounded-box p-6 my-12">
			<h3 class="mb-4 text-2xl font-bold mt-2">{$t('faq.taskees.title')}</h3>
			<div class="join join-vertical w-full">
				<!-- FAQ Taskees - How do I find tasks? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.taskees === 0}
				>
					<button
						type="button"
						class="text-base-content/80 collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('taskees', 0)}
					>
						{$t('faq.taskees.0.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.taskees.0.answer')}</p>
					</div>
				</div>

				<!-- FAQ Taskees - How do I get paid? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.taskees === 1}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('taskees', 1)}
					>
						{$t('faq.taskees.1.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.taskees.1.answer')}</p>
					</div>
				</div>

				<!-- FAQ Taskees - What if the tasker doesn't approve my work? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.taskees === 2}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('taskees', 2)}
					>
						{$t('faq.taskees.2.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.taskees.2.answer')}</p>
					</div>
				</div>

				<!-- FAQ Taskees - What are the fees for taskees? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.taskees === 3}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('taskees', 3)}
					>
						{$t('faq.taskees.3.question')}
					</button>
					<div class="collapse-content prose">
						<p>{@html $t('faq.taskees.3.answer')}</p>
					</div>
				</div>

				<!-- FAQ Taskees - Do I need to own Bitcoin? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.taskees === 4}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('taskees', 4)}
					>
						{$t('faq.taskees.4.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.taskees.4.answer')}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Payments & Bitcoin -->
		<div class="bg-base-100 rounded-box p-6 my-12">
			<h3 class="mb-4 text-2xl font-bold mt-2">{$t('faq.payment.title')}</h3>
			<div class="join join-vertical w-full">
				<!-- Why use Bitcoin? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.payment === 0}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('payment', 0)}
					>
						{$t('faq.payment.0.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.payment.0.answer')}</p>
					</div>
				</div>

				<!-- What are the fees? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.payment === 1}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('payment', 1)}
					>
						{$t('faq.payment.1.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.payment.1.answer_1')}</p>
						<p>{$t('faq.payment.1.answer_2')}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Nostr -->
		<div class="bg-base-100 rounded-box p-6 my-12">
			<h3 class="mb-4 text-2xl font-bold mt-2">{$t('faq.nostr.title')}</h3>
			<div class="join join-vertical w-full">
				<!-- What is Nostr? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.nostr === 0}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('nostr', 0)}
					>
						{$t('faq.nostr.0.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.nostr.0.answer')}</p>
					</div>
				</div>

				<!-- How do I own my data with Nostr? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.nostr === 1}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('nostr', 1)}
					>
						{$t('faq.nostr.1.question')}
					</button>
					<div class="collapse-content prose">
						<p>{@html $t('faq.nostr.1.answer')}</p>
					</div>
				</div>

				<!-- How is Nostr secured? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.nostr === 2}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('nostr', 2)}
					>
						{$t('faq.nostr.2.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.nostr.2.answer')}</p>
					</div>
				</div>

				<!-- How do you protect my Nostr private key (nsec)? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.nostr === 3}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('nostr', 3)}
					>
						{$t('faq.nostr.3.question')}
					</button>
					<div class="collapse-content prose">
						<p>{@html $t('faq.nostr.3.answer')}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Trust & Safety -->
		<div class="bg-base-100 rounded-box p-6 my-12">
			<h3 class="mb-4 text-2xl font-bold mt-2">{$t('faq.safety.title')}</h3>
			<div class="join join-vertical w-full">
				<!-- Is my payment secure? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.safety === 0}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('safety', 0)}
					>
						{$t('faq.safety.0.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.safety.0.answer')}</p>
					</div>
				</div>

				<!-- What happens if something goes wrong? -->
				<div
					class="collapse-arrow text-base-content/70 join-item border-base-300 collapse border-b"
					class:collapse-open={openAccordion.safety === 1}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleAccordion('safety', 1)}
					>
						{$t('faq.safety.1.question')}
					</button>
					<div class="collapse-content prose">
						<p>{$t('faq.safety.1.answer')}</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
