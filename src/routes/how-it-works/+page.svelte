<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/states/i18n';
</script>

<div class="bg-base-100 min-h-screen px-4 py-12">
	<!-- Header -->
	<div class="mb-12 text-center">
		<h1 class="mb-4 text-4xl font-bold">{$t('how_it_works.title')}</h1>
		<p class="mx-auto max-w-2xl text-lg">
			{$t('how_it_works.subtitle')}
		</p>
	</div>

	<!-- Steps -->
	<div class="mx-auto max-w-4xl">
		<ul class="steps steps-vertical lg:steps-horizontal mb-12 w-full">
			<li class="step step-primary">{$t('how_it_works.steps.signup')}</li>
			<li class="step step-primary">{$t('how_it_works.steps.create_profile')}</li>
			<li class="step step-primary">{$t('how_it_works.steps.find_tasks')}</li>
			<li class="step step-primary">{$t('how_it_works.steps.complete_work')}</li>
			<li class="step step-primary">{$t('how_it_works.steps.get_paid')}</li>
		</ul>

		<!-- Detailed Steps -->
		<div class="space-y-12">
			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-2xl">{$t('how_it_works.step1.title')}</h3>
					<p>
						{$t('how_it_works.step1.description')}
					</p>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-2xl">{$t('how_it_works.step2.title')}</h3>
					<p>
						{$t('how_it_works.step2.description')}
					</p>
					<div class="mt-4">
						<h4 class="mb-2 font-semibold">{$t('how_it_works.step2.key_elements')}</h4>
						<ul class="list-inside list-disc space-y-2">
							<li>{$t('how_it_works.step2.elements.skills')}</li>
							<li>{$t('how_it_works.step2.elements.experience')}</li>
							<li>{$t('how_it_works.step2.elements.portfolio')}</li>
							<li>{$t('how_it_works.step2.elements.payment')}</li>
						</ul>
					</div>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-2xl">{$t('how_it_works.step3.title')}</h3>
					<div class="divider">{$t('how_it_works.step3.for_clients')}</div>
					<div class="space-y-4">
						<p>
							{$t('how_it_works.step3.clients_description')}
						</p>
						<div class="alert alert-info">
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
							<span>{$t('how_it_works.step3.budget_info')}</span>
						</div>
					</div>
					<div class="divider">{$t('how_it_works.step3.for_freelancers')}</div>
					<div class="space-y-4">
						<p>
							{$t('how_it_works.step3.freelancers_description')}
						</p>
					</div>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-2xl">{$t('how_it_works.step4.title')}</h3>
					<p>
						{$t('how_it_works.step4.description')}
					</p>
					<ul class="mt-4 list-inside list-disc space-y-2">
						<li>{$t('how_it_works.step4.tools.messaging')}</li>
						<li>{$t('how_it_works.step4.tools.files')}</li>
						<li>{$t('how_it_works.step4.tools.milestones')}</li>
						<li>{$t('how_it_works.step4.tools.progress')}</li>
					</ul>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-2xl">{$t('how_it_works.step5.title')}</h3>
					<p>{$t('how_it_works.step5.description')}</p>
					<div class="mt-4 space-y-4">
						<div class="alert alert-success">
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
							<span>{$t('how_it_works.step5.features.escrow')}</span>
						</div>
						<div class="alert alert-success">
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
							<span>{$t('how_it_works.step5.features.auto_release')}</span>
						</div>
						<div class="alert alert-success">
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
							<span>{$t('how_it_works.step5.features.instant')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- CTA -->
	<div class="mt-12 text-center">
		<h3 class="mb-4 text-2xl font-bold">{$t('how_it_works.cta.title')}</h3>
		<div class="flex justify-center gap-4">
			<a href="/signup" class="btn btn-primary">{$t('how_it_works.cta.create_account')}</a>
			<a href="/browse-tasks" class="btn btn-ghost">{$t('how_it_works.cta.browse_tasks')}</a>
		</div>
	</div>
</div>
