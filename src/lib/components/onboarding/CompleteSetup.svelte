<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let { onFinish }: { onFinish?: () => void } = $props();

	// Completion status
	let isRedirecting = $state(false);
</script>

<div class="card bg-base-100 w-full shadow-xl" data-testid="onboarding-step-complete">
	<div class="card-body space-y-2">
		<div class="mx-auto w-full items-center space-y-2 text-center">
			<!-- Educational Header (aligned with other onboarding screens) -->
			<div class="education-header text-center">
				<div class="bt-celebrate text-success">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mx-auto h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				</div>
				<h4 class="step-title">{$t('onboarding_auth.form.complete_setup.welcome')}</h4>

				<p class="text-primary text-base md:text-lg">
					{$t('onboarding_auth.form.complete_setup.jump_in')}
				</p>
			</div>

			<button
				class="btn btn-primary min-w-10"
				data-testid="onboarding-go-to-dashboard"
				onclick={() => {
					onFinish?.();
					isRedirecting = true;
					goto(resolve('/wallet')).finally(() => {
						isRedirecting = false;
					});
				}}
			>
				{#if isRedirecting}
					<span class="loading loading-spinner loading-sm"></span>
					{$t('onboarding_auth.form.complete_setup.loading')}
				{:else}
					{$t('onboarding_auth.form.complete_setup.start_tasking')}
				{/if}
			</button>
		</div>
	</div>
</div>
