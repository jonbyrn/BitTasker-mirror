<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		displayName = $bindable(''),
		nextStep
	}: {
		displayName: string;
		nextStep: () => void;
	} = $props();

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!displayName.trim() || displayName.length < 3 || displayName.length > 50) {
			return $t('onboarding_auth.form.display_name_setup.invalid');
		}

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
		</div>

		<form onsubmit={handleSubmit} class="space-y-2">
			<div class="form-control mx-auto max-w-lg">
				<label class="label" for="display-name">
					<span class="label-text text-base-content pb-1">
						{$t('onboarding_auth.form.display_name_setup.label')}
					</span>
				</label>
				<input
					type="text"
					id="display-name"
					data-testid="onboarding-display-name-input"
					bind:value={displayName}
					class="input input-bordered w-full"
					placeholder={$t('onboarding_auth.form.display_name_setup.placeholder')}
					required
					minlength={3}
					maxlength={50}
				/>
				<div class="label flex justify-start">
					<span class="label-text-alt text-base-content/70">
						{displayName.length}/50
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
