<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		nextStep,
		currentStep: _currentStep,
		totalSteps: _totalSteps,
		onDisplayNameChange
	}: {
		nextStep: () => void;
		currentStep: number;
		totalSteps: number;
		onDisplayNameChange: (displayName: string) => void;
	} = $props();
	void _currentStep;
	void _totalSteps;

	let displayName = $state('');
	const MAX_LENGTH = 50;

	function handleSubmit() {
		onDisplayNameChange(displayName.trim());
		nextStep();
	}
</script>

<div class="card bg-base-100 w-full shadow-xl" data-testid="onboarding-step-display-name">
	<div class="card-body space-y-2">
		<div class="education-header text-center">
			<h4 class="step-title">{$t('onboarding_auth.form.display_name_setup.title')}</h4>
			<p class="text-primary text-base md:text-lg">
				{$t('onboarding_auth.form.display_name_setup.subtitle')}
			</p>
			<p class="text-base-content text-sm md:text-base">
				{$t('onboarding_auth.form.display_name_setup.change_later_hint')}
			</p>
		</div>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
			class="space-y-2"
		>
			<div class="form-control mx-auto max-w-lg">
				<input
					type="text"
					id="display-name"
					data-testid="onboarding-display-name-input"
					aria-label={$t('onboarding_auth.form.display_name_setup.label')}
					bind:value={displayName}
					class="input input-bordered w-full"
					placeholder={$t('onboarding_auth.form.display_name_setup.placeholder')}
					maxlength={MAX_LENGTH}
				/>
				<div class="label flex justify-start">
					<span class="label-text-alt text-base-content/70">
						{displayName.length}/{MAX_LENGTH}
					</span>
				</div>
			</div>

			<div class="flex justify-between">
				<div></div>
				<button
					type="submit"
					class="btn btn-primary"
					data-testid="onboarding-display-name-next"
					disabled={!displayName.trim()}
				>
					{$t('onboarding_auth.form.display_name_setup.next')}
				</button>
			</div>
		</form>
	</div>
</div>
