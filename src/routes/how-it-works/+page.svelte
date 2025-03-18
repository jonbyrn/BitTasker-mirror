<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/states/i18n';
</script>

<div class="bg-base-100 glow-effect min-h-screen px-4 py-16">
	<!-- Glow Effects -->
	<div class="glow-container">
		<div
			class="glow-blur glow-primary"
			style="width: 30vw; height: 30vw; top: 10%; left: 5%; animation-delay: 0s;"
		></div>
		<div
			class="glow-blur glow-secondary"
			style="width: 25vw; height: 25vw; bottom: 15%; right: 10%; animation-delay: -5s;"
		></div>
		<div
			class="glow-blur glow-accent"
			style="width: 20vw; height: 20vw; top: 40%; right: 25%; animation-delay: -10s;"
		></div>
	</div>

	<!-- Header -->
	<div class="relative z-10 mb-20 text-center">
		<h1 class="mb-6 text-5xl font-bold">{$t('how_it_works.title')}</h1>
		<p class="mx-auto max-w-2xl text-xl leading-relaxed">
			{$t('how_it_works.subtitle')}
		</p>
	</div>

	<!-- Steps -->
	<div class="relative z-10 mx-auto max-w-5xl">
		<ul class="steps steps-vertical lg:steps-horizontal mb-20 w-full">
			<li class="step step-primary">{$t('how_it_works.steps.signup')}</li>
			<li class="step step-primary">{$t('how_it_works.steps.create_profile')}</li>
			<li class="step step-primary">{$t('how_it_works.steps.find_tasks')}</li>
			<li class="step step-primary">{$t('how_it_works.steps.complete_work')}</li>
			<li class="step step-primary">{$t('how_it_works.steps.get_paid')}</li>
		</ul>

		<!-- Detailed Steps -->
		<div class="space-y-16">
			<div
				class="card bg-base-200 bg-opacity-70 backdrop-blur-sm transition-all duration-300 hover:shadow-md"
			>
				<div class="card-body p-8">
					<h3 class="card-title mb-4 text-3xl font-extrabold">{$t('how_it_works.step1.title')}</h3>
					<p class="textarea-base leading-relaxed">
						{$t('how_it_works.step1.description')}
					</p>
				</div>
			</div>

			<div
				class="card bg-base-200 bg-opacity-70 backdrop-blur-sm transition-all duration-300 hover:shadow-md"
			>
				<div class="card-body p-8">
					<h3 class="card-title mb-4 text-3xl font-extrabold">{$t('how_it_works.step2.title')}</h3>
					<p class="textarea-base leading-relaxed">
						{$t('how_it_works.step2.description')}
					</p>
					<div class="mt-6">
						<h4 class="mb-3 text-xl font-semibold">{$t('how_it_works.step2.key_elements')}</h4>
						<ul class="list-inside list-disc space-y-3 pl-4">
							<li class="text-base">{$t('how_it_works.step2.elements.skills')}</li>
							<li class="text-base">{$t('how_it_works.step2.elements.experience')}</li>
							<li class="text-base">{$t('how_it_works.step2.elements.portfolio')}</li>
							<li class="text-base">{$t('how_it_works.step2.elements.payment')}</li>
						</ul>
					</div>
				</div>
			</div>

			<div
				class="card bg-base-200 bg-opacity-70 backdrop-blur-sm transition-all duration-300 hover:shadow-md"
			>
				<div class="card-body p-8">
					<h3 class="card-title mb-4 text-3xl font-extrabold">{$t('how_it_works.step3.title')}</h3>
					<div class="divider my-6">{$t('how_it_works.step3.for_clients')}</div>
					<div class="space-y-6">
						<p class="textarea-base leading-relaxed">
							{$t('how_it_works.step3.clients_description')}
						</p>
						<div class="alert bg-opacity-80 p-5">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								class="h-6 w-6 shrink-0 stroke-current"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								></path></svg
							>
							<span class="text-base">{$t('how_it_works.step3.budget_info')}</span>
						</div>
					</div>
					<div class="divider my-6">{$t('how_it_works.step3.for_freelancers')}</div>
					<div class="space-y-6">
						<p class="textarea-base leading-relaxed">
							{$t('how_it_works.step3.freelancers_description')}
						</p>
					</div>
				</div>
			</div>

			<div
				class="card bg-base-200 bg-opacity-70 backdrop-blur-sm transition-all duration-300 hover:shadow-md"
			>
				<div class="card-body p-8">
					<h3 class="card-title mb-4 text-3xl font-extrabold">{$t('how_it_works.step4.title')}</h3>
					<p class="textarea-base leading-relaxed">
						{$t('how_it_works.step4.description')}
					</p>
					<ul class="mt-6 list-inside list-disc space-y-3 pl-4">
						<li class="text-base">{$t('how_it_works.step4.tools.messaging')}</li>
						<li class="text-base">{$t('how_it_works.step4.tools.files')}</li>
						<li class="text-base">{$t('how_it_works.step4.tools.milestones')}</li>
						<li class="text-base">{$t('how_it_works.step4.tools.progress')}</li>
					</ul>
				</div>
			</div>

			<div
				class="card bg-base-200 bg-opacity-70 backdrop-blur-sm transition-all duration-300 hover:shadow-md"
			>
				<div class="card-body p-8">
					<h3 class="card-title mb-4 text-3xl font-extrabold">{$t('how_it_works.step5.title')}</h3>
					<p class="textarea-base leading-relaxed">{$t('how_it_works.step5.description')}</p>
					<div class="mt-6 space-y-5">
						<div class="alert bg-opacity-80 p-5">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/></svg
							>
							<span class="text-base">{$t('how_it_works.step5.features.escrow')}</span>
						</div>
						<div class="alert bg-opacity-80 p-5">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/></svg
							>
							<span class="text-base">{$t('how_it_works.step5.features.auto_release')}</span>
						</div>
						<div class="alert bg-opacity-80 p-5">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/></svg
							>
							<span class="text-base">{$t('how_it_works.step5.features.instant')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- CTA -->
	<div class="relative z-10 mt-20 text-center">
		<h3 class="mb-6 text-3xl font-bold">{$t('how_it_works.cta.title')}</h3>
		<div class="flex justify-center gap-6">
			<a href="/signup" class="btn btn-primary btn-lg">{$t('how_it_works.cta.create_account')}</a>
		</div>
	</div>
</div>
