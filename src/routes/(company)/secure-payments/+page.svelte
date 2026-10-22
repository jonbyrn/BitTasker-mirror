<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconShieldCheck from '~icons/mdi/shield-check';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconCheckCircleOutline from '~icons/mdi/check-circle-outline';
	import IconAlertCircleOutline from '~icons/mdi/alert-circle-outline';
	import IconHandshakeOutline from '~icons/mdi/handshake-outline';
	import IconCloseCircleOutline from '~icons/mdi/close-circle-outline';

	let { data: seo } = $props();

	// State to track which FAQ section is open
	let openFaqSection = $state<number>(-1);

	// Function to toggle FAQ sections
	function toggleFaqSection(index: number): void {
		if (openFaqSection === index) {
			openFaqSection = -1; // Close if already open
		} else {
			openFaqSection = index; // Open the new one
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
	<meta
		property="og:image:alt"
		content="Secure Payment Contracts - Protected Payments | BitTasker"
	/>
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
				<h1>{$t('secure_payments.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('secure_payments.subtitle')}
				</p>
			</div>
		</div>
	</section>

	<!-- Main Content -->
	<div class="mx-auto my-16 max-w-4xl px-8">
		<!-- The Simple Process -->
		<div class="mb-8">
			<h3 class="mb-6 text-center">{$t('secure_payments.simpleProcessTitle')}</h3>
			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<div class="space-y-4">
						<div class="flex items-center gap-4">
							<div
								class="border-primary text-primary flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
							>
								1
							</div>
							<div>
								<p class="mb-0.5 font-medium">
									<strong>{$t('secure_payments.process1Title')}</strong> — {$t(
										'secure_payments.process1Description'
									)}
								</p>
							</div>
						</div>

						<div class="flex items-center gap-4">
							<div
								class="border-primary text-primary flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
							>
								2
							</div>
							<div>
								<p class="mb-0.5 font-medium">
									<strong>{$t('secure_payments.process2Title')}</strong> — {$t(
										'secure_payments.process2Description'
									)}
								</p>
							</div>
						</div>

						<div class="flex items-center gap-4">
							<div
								class="border-primary text-primary flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
							>
								3
							</div>
							<div>
								<p class="mb-0.5 font-medium">
									<strong>{$t('secure_payments.process3Title')}</strong> — {$t(
										'secure_payments.process3Description'
									)}
								</p>
							</div>
						</div>

						<div class="flex items-center gap-4">
							<div
								class="border-primary text-primary flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
							>
								4
							</div>
							<div>
								<p class="mb-0.5 font-medium">
									<strong>{$t('secure_payments.process4Title')}</strong> — {$t(
										'secure_payments.process4Description'
									)}
								</p>
							</div>
						</div>

						<div class="flex items-center gap-4">
							<div
								class="border-primary text-primary flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full border text-sm font-medium"
							>
								5
							</div>
							<div>
								<p class="mb-0.5 font-medium">
									<strong>{$t('secure_payments.process5Title')}</strong> — {$t(
										'secure_payments.process5Description'
									)}
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
						<span>{$t('secure_payments.simpleProcessConclusion')}</span>
					</div>
				</div>
			</div>
		</div>

		<div class="mb-12 text-center">
			<h3>{$t('secure_payments.howItWorksTitle')}</h3>
		</div>

		<!-- Step 1: Create Your Contract -->
		<div class="mb-8">
			<div class="mb-4 flex items-baseline gap-4">
				<div
					class="bg-primary text-primary-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-2xl sm:min-h-12 sm:min-w-12 sm:text-3xl"
				>
					1
				</div>
				<h3>{$t('secure_payments.step1Title')}</h3>
			</div>

			<div class="card bg-base-100 mb-4 shadow-lg">
				<div class="card-body">
					<ul class="mb-4 list-inside list-disc space-y-2">
						<li>{$t('secure_payments.step1List1')}</li>
						<li>{$t('secure_payments.step1List2')}</li>
						<li>{$t('secure_payments.step1List3')}</li>
						<li>{$t('secure_payments.step1List4')}</li>
					</ul>
					<div class="alert alert-info alert-outline mt-4">
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
							<strong>{$t('secure_payments.step1Fees')}</strong>
							{$t('secure_payments.step1FeesText')}
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- After Contract Creation -->
		<div class="mb-8">
			<div class="card bg-base-100 mb-4 shadow-lg">
				<div class="card-body">
					<h4 class="mb-4">{$t('secure_payments.afterCreationTitle')}</h4>
					<p class="mb-4">{$t('secure_payments.afterCreationIntro')}</p>

					<div class="space-y-4">
						<div>
							<h4 class="mb-2">{$t('secure_payments.afterCreationTaskerTitle')}</h4>
							<ul class="ml-4 list-inside list-disc space-y-1">
								<li>{$t('secure_payments.afterCreationTaskerList1')}</li>
								<li>{$t('secure_payments.afterCreationTaskerList2')}</li>
								<li>{$t('secure_payments.afterCreationTaskerList3')}</li>
							</ul>
						</div>

						<div>
							<h4 class="mb-2">{$t('secure_payments.afterCreationTaskeeTitle')}</h4>
							<ul class="ml-4 list-inside list-disc space-y-1">
								<li>{$t('secure_payments.afterCreationTaskeeList1')}</li>
								<li>{$t('secure_payments.afterCreationTaskeeList2')}</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Step 2: Complete Your Task -->
		<div class="mb-8">
			<div class="mb-4 flex items-baseline gap-4">
				<div
					class="bg-primary text-primary-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-2xl sm:min-h-12 sm:min-w-12 sm:text-3xl"
				>
					2
				</div>
				<h3>{$t('secure_payments.step2Title')}</h3>
			</div>

			<div class="card bg-base-100 mb-4 shadow-lg">
				<div class="card-body">
					<div class="space-y-4">
						<div>
							<h4 class="mb-2">{$t('secure_payments.step2TaskeeTitle')}</h4>
							<ul class="ml-4 list-inside list-disc space-y-1">
								<li>{$t('secure_payments.step2TaskeeList1')}</li>
								<li>{$t('secure_payments.step2TaskeeList2')}</li>
							</ul>
						</div>

						<div>
							<h4 class="mb-2">{$t('secure_payments.step2TaskerTitle')}</h4>
							<ul class="ml-4 list-inside list-disc space-y-1">
								<li>{$t('secure_payments.step2TaskerList1')}</li>
								<li>{$t('secure_payments.step2TaskerList2')}</li>
								<li>{$t('secure_payments.step2TaskerList3')}</li>
							</ul>
						</div>

						<div>
							<h4 class="mb-2">{$t('secure_payments.step2AutoTitle')}</h4>
							<ul class="ml-4 list-inside list-disc space-y-1">
								<li>{$t('secure_payments.step2AutoList1')}</li>
								<li>{$t('secure_payments.step2AutoList2')}</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Step 3: If There's a Dispute -->
		<div class="mb-8">
			<div class="mb-4 flex items-baseline gap-4">
				<div
					class="bg-primary text-primary-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-2xl sm:min-h-12 sm:min-w-12 sm:text-3xl"
				>
					3
				</div>
				<h3>{$t('secure_payments.step3Title')}</h3>
			</div>

			<div class="card bg-base-100 mb-4 shadow-lg">
				<div class="card-body">
					<div class="space-y-4">
						<div>
							<h4 class="mb-2">{$t('secure_payments.step3StartingTitle')}</h4>
							<ul class="ml-4 list-inside list-disc space-y-1">
								<li>{$t('secure_payments.step3StartingList1')}</li>
								<li>{$t('secure_payments.step3StartingList2')}</li>
								<li>{$t('secure_payments.step3StartingList3')}</li>
							</ul>
						</div>

						<div>
							<h4 class="mb-2">{$t('secure_payments.step3ResolvingTitle')}</h4>
							<ul class="ml-4 list-inside list-disc space-y-1">
								<li>{$t('secure_payments.step3ResolvingList1')}</li>
								<li>{$t('secure_payments.step3ResolvingList2')}</li>
								<li>{$t('secure_payments.step3ResolvingList3')}</li>
								<li>{$t('secure_payments.step3ResolvingList4')}</li>
							</ul>
						</div>

						<div>
							<h4 class="mb-2">{$t('secure_payments.step3NoResolutionTitle')}</h4>
							<ul class="ml-4 list-inside list-disc space-y-1">
								<li>{$t('secure_payments.step3NoResolutionList1')}</li>
								<li>{$t('secure_payments.step3NoResolutionList2')}</li>
								<li>{$t('secure_payments.step3NoResolutionList3')}</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Step 4: Canceling a Contract -->
		<div class="mb-8">
			<div class="mb-4 flex items-baseline gap-4">
				<div
					class="bg-primary text-primary-content flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-2xl sm:min-h-12 sm:min-w-12 sm:text-3xl"
				>
					4
				</div>
				<h3>{$t('secure_payments.step4Title')}</h3>
			</div>

			<div class="card bg-base-100 mb-4 shadow-lg">
				<div class="card-body">
					<div class="space-y-4">
						<div>
							<h4 class="mb-2">{$t('secure_payments.step4TaskerTitle')}</h4>
							<ul class="ml-4 list-inside list-disc space-y-1">
								<li>{$t('secure_payments.step4TaskerList1')}</li>
								<li>{$t('secure_payments.step4TaskerList2')}</li>
								<li>{$t('secure_payments.step4TaskerList3')}</li>
								<li>{$t('secure_payments.step4TaskerList4')}</li>
							</ul>
						</div>

						<div>
							<h4 class="mb-2">{$t('secure_payments.step4TaskeeTitle')}</h4>
							<ul class="ml-4 list-inside list-disc space-y-1">
								<li>{$t('secure_payments.step4TaskeeList1')}</li>
								<li>{$t('secure_payments.step4TaskeeList2')}</li>
								<li>{$t('secure_payments.step4TaskeeList3')}</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Key Benefits -->
		<div class="mb-12">
			<h3 class="mb-6 text-center">{$t('secure_payments.benefitsTitle')}</h3>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
				<!-- For Taskers -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body p-6">
						<h4 class="card-title">{$t('secure_payments.benefitsTaskersTitle')}</h4>
						<ul class="mt-2 list-inside list-disc space-y-2">
							<li>{$t('secure_payments.benefitsTaskersList1')}</li>
							<li>{$t('secure_payments.benefitsTaskersList2')}</li>
							<li>{$t('secure_payments.benefitsTaskersList3')}</li>
							<li>{$t('secure_payments.benefitsTaskersList4')}</li>
						</ul>
					</div>
				</div>

				<!-- For Taskees -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body p-6">
						<h4 class="card-title">{$t('secure_payments.benefitsTaskeesTitle')}</h4>
						<ul class="mt-2 list-inside list-disc space-y-2">
							<li>{$t('secure_payments.benefitsTaskeesList1')}</li>
							<li>{$t('secure_payments.benefitsTaskeesList2')}</li>
							<li>{$t('secure_payments.benefitsTaskeesList3')}</li>
							<li>{$t('secure_payments.benefitsTaskeesList4')}</li>
						</ul>
					</div>
				</div>

				<!-- For Everyone -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body p-6">
						<h4 class="card-title">{$t('secure_payments.benefitsEveryoneTitle')}</h4>
						<ul class="mt-2 list-inside list-disc space-y-2">
							<li>{$t('secure_payments.benefitsEveryoneList1')}</li>
							<li>{$t('secure_payments.benefitsEveryoneList2')}</li>
							<li>{$t('secure_payments.benefitsEveryoneList3')}</li>
							<li>{$t('secure_payments.benefitsEveryoneList4')}</li>
						</ul>
					</div>
				</div>
			</div>
		</div>

		<!-- Contract States -->
		<div class="mb-8">
			<h3 class="mb-6 text-center">{$t('secure_payments.contractStatesTitle')}</h3>
			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<p class="mb-4">{$t('secure_payments.contractStatesIntro')}</p>
					<div class="space-y-3">
						<div class="flex items-center gap-3">
							<IconWalletOutline class="text-primary h-6 w-6 shrink-0" />
							<div>
								<strong>{$t('secure_payments.state1Title')}</strong> — {$t(
									'secure_payments.state1Description'
								)}
							</div>
						</div>
						<div class="flex items-center gap-3">
							<IconCheckCircleOutline class="text-primary h-6 w-6 shrink-0" />
							<div>
								<strong>{$t('secure_payments.state2Title')}</strong> — {$t(
									'secure_payments.state2Description'
								)}
							</div>
						</div>
						<div class="flex items-center gap-3">
							<IconAlertCircleOutline class="text-primary h-6 w-6 shrink-0" />
							<div>
								<strong>{$t('secure_payments.state3Title')}</strong> — {$t(
									'secure_payments.state3Description'
								)}
							</div>
						</div>
						<div class="flex items-center gap-3">
							<IconHandshakeOutline class="text-primary h-6 w-6 shrink-0" />
							<div>
								<strong>{$t('secure_payments.state4Title')}</strong> — {$t(
									'secure_payments.state4Description'
								)}
							</div>
						</div>
						<div class="flex items-center gap-3">
							<IconCloseCircleOutline class="text-primary h-6 w-6 shrink-0" />
							<div>
								<strong>{$t('secure_payments.state5Title')}</strong> — {$t(
									'secure_payments.state5Description'
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Protection Periods -->
		<div class="mb-8">
			<h3 class="mb-6 text-center">{$t('secure_payments.protectionPeriodsTitle')}</h3>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div class="card bg-base-200 shadow-sm">
					<div class="card-body p-6">
						<div class="mb-3 flex items-center">
							<IconClockOutline class="text-primary mr-3 text-3xl" />
							<h4 class="card-title mb-0">{$t('secure_payments.reviewPeriodTitle')}</h4>
						</div>
						<ul class="list-inside list-disc space-y-2">
							<li>{$t('secure_payments.reviewPeriodList1')}</li>
							<li>{$t('secure_payments.reviewPeriodList2')}</li>
							<li>{$t('secure_payments.reviewPeriodList3')}</li>
						</ul>
					</div>
				</div>

				<div class="card bg-base-200 shadow-sm">
					<div class="card-body p-6">
						<div class="mb-3 flex items-center">
							<IconShieldCheck class="text-primary mr-3 text-3xl" />
							<h4 class="card-title mb-0">{$t('secure_payments.disputePeriodTitle')}</h4>
						</div>
						<ul class="list-inside list-disc space-y-2">
							<li>{$t('secure_payments.disputePeriodList1')}</li>
							<li>{$t('secure_payments.disputePeriodList2')}</li>
							<li>{$t('secure_payments.disputePeriodList3')}</li>
						</ul>
					</div>
				</div>
			</div>
		</div>

		<!-- Examples -->
		<div class="mb-8">
			<h3 class="mb-6 text-center">{$t('secure_payments.examplesTitle')}</h3>

			<div class="space-y-6">
				<!-- Example: Successful Task -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h4 class="card-title">{$t('secure_payments.exampleSuccessTitle')}</h4>
						<ol class="ml-4 list-inside list-decimal space-y-2">
							<li>{$t('secure_payments.exampleSuccessList1')}</li>
							<li>{$t('secure_payments.exampleSuccessList2')}</li>
							<li>{$t('secure_payments.exampleSuccessList3')}</li>
							<li>{$t('secure_payments.exampleSuccessList4')}</li>
							<li>{$t('secure_payments.exampleSuccessList5')}</li>
						</ol>
					</div>
				</div>

				<!-- Example: Dispute Resolution -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h4 class="card-title">{$t('secure_payments.exampleDisputeTitle')}</h4>
						<ol class="ml-4 list-inside list-decimal space-y-2">
							<li>{$t('secure_payments.exampleDisputeList1')}</li>
							<li>{$t('secure_payments.exampleDisputeList2')}</li>
							<li>{$t('secure_payments.exampleDisputeList3')}</li>
							<li>{$t('secure_payments.exampleDisputeList4')}</li>
							<li>{$t('secure_payments.exampleDisputeList5')}</li>
						</ol>
					</div>
				</div>

				<!-- Example: Auto-Payment -->
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h4 class="card-title">{$t('secure_payments.exampleAutoTitle')}</h4>
						<ol class="ml-4 list-inside list-decimal space-y-2">
							<li>{$t('secure_payments.exampleAutoList1')}</li>
							<li>{$t('secure_payments.exampleAutoList2')}</li>
							<li>{$t('secure_payments.exampleAutoList3')}</li>
							<li>{$t('secure_payments.exampleAutoList4')}</li>
							<li>{$t('secure_payments.exampleAutoList5')}</li>
						</ol>
					</div>
				</div>
			</div>
		</div>

		<!-- FAQ -->
		<div class="mb-8">
			<h3 class="mb-6 text-center">{$t('secure_payments.faqTitle')}</h3>

			<div class="join join-vertical w-full">
				<div
					class="collapse-arrow join-item border-base-300 collapse border-b"
					class:collapse-open={openFaqSection === 0}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleFaqSection(0)}
					>
						{$t('secure_payments.faq1Question')}
					</button>
					<div class="collapse-content">
						<p>{$t('secure_payments.faq1Answer')}</p>
					</div>
				</div>

				<div
					class="collapse-arrow join-item border-base-300 collapse border-b"
					class:collapse-open={openFaqSection === 1}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleFaqSection(1)}
					>
						{$t('secure_payments.faq2Question')}
					</button>
					<div class="collapse-content">
						<p>{$t('secure_payments.faq2Answer')}</p>
					</div>
				</div>

				<div
					class="collapse-arrow join-item border-base-300 collapse border-b"
					class:collapse-open={openFaqSection === 2}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleFaqSection(2)}
					>
						{$t('secure_payments.faq3Question')}
					</button>
					<div class="collapse-content">
						<p>{$t('secure_payments.faq3Answer')}</p>
					</div>
				</div>

				<div
					class="collapse-arrow join-item border-base-300 collapse border-b"
					class:collapse-open={openFaqSection === 3}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleFaqSection(3)}
					>
						{$t('secure_payments.faq4Question')}
					</button>
					<div class="collapse-content">
						<p>{$t('secure_payments.faq4Answer')}</p>
					</div>
				</div>

				<div
					class="collapse-arrow join-item border-base-300 collapse border-b"
					class:collapse-open={openFaqSection === 4}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleFaqSection(4)}
					>
						{$t('secure_payments.faq5Question')}
					</button>
					<div class="collapse-content">
						<p>{$t('secure_payments.faq5Answer')}</p>
					</div>
				</div>

				<div
					class="collapse-arrow join-item border-base-300 collapse border-b"
					class:collapse-open={openFaqSection === 5}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleFaqSection(5)}
					>
						{$t('secure_payments.faq6Question')}
					</button>
					<div class="collapse-content">
						<p>{$t('secure_payments.faq6Answer')}</p>
					</div>
				</div>

				<div
					class="collapse-arrow join-item border-base-300 collapse border-b"
					class:collapse-open={openFaqSection === 6}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleFaqSection(6)}
					>
						{$t('secure_payments.faq7Question')}
					</button>
					<div class="collapse-content">
						<p>{$t('secure_payments.faq7Answer')}</p>
					</div>
				</div>

				<div
					class="collapse-arrow join-item border-base-300 collapse border-b"
					class:collapse-open={openFaqSection === 7}
				>
					<button
						type="button"
						class="collapse-title text-left text-xl font-medium"
						onclick={() => toggleFaqSection(7)}
					>
						{$t('secure_payments.faq8Question')}
					</button>
					<div class="collapse-content">
						<p>{$t('secure_payments.faq8Answer')}</p>
					</div>
				</div>
			</div>

			<!-- FAQ Support Section -->
			<div class="mt-8">
				<div class="alert alert-info alert-outline">
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
					<div>
						<strong>{$t('secure_payments.faqSupportTitle')}</strong>
						<p class="mt-1">
							{$t('secure_payments.faqSupportText')}
							<a href="/contact" class="link link-primary">{$t('secure_payments.faqSupportLink')}</a
							>.
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Important Notes -->
		<div class="mb-8">
			<h3 class="mb-6 text-center">{$t('secure_payments.importantNotesTitle')}</h3>
			<div class="alert alert-warning alert-outline">
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
				<div>
					<ul class="list-inside list-disc space-y-1">
						<li>{$t('secure_payments.importantNotesList1')}</li>
						<li>{$t('secure_payments.importantNotesList2')}</li>
						<li>{$t('secure_payments.importantNotesList3')}</li>
						<li>{$t('secure_payments.importantNotesList4')}</li>
						<li>{$t('secure_payments.importantNotesList5')}</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</div>
