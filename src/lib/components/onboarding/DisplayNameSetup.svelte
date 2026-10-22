<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		displayName = $bindable(''),
		nextStep,
		isPublishing = false,
		publishError = ''
	}: {
		displayName: string;
		nextStep: () => void | Promise<void>;
		isPublishing?: boolean;
		publishError?: string;
	} = $props();

	let nameError = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		const name = displayName.trim();
		// Spaces do not count toward the length. "Ana Luz" stays valid.
		if (name.length < 3 || name.length > 50) {
			nameError = $t('onboarding_auth.form.display_name_setup.invalid');
			return;
		}
		nameError = '';
		await nextStep();
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
					disabled={isPublishing}
					oninput={() => (nameError = '')}
				/>
				{#if nameError}
					<p
						class="text-error mt-1 text-sm"
						role="alert"
						data-testid="onboarding-display-name-error"
					>
						{nameError}
					</p>
				{/if}
				<div class="label flex justify-start">
					<span class="label-text-alt text-base-content/70">
						{displayName.length}/50
					</span>
				</div>
			</div>

			{#if publishError}
				<div class="alert alert-outline alert-error mx-auto max-w-lg">
					<span class="whitespace-normal">{publishError}</span>
				</div>
			{/if}

			<div class="flex justify-between">
				<div></div>
				<button
					type="submit"
					class="btn btn-primary"
					data-testid="onboarding-display-name-next"
					disabled={!displayName.trim() || isPublishing}
				>
					{#if isPublishing}
						<span class="loading loading-spinner"></span>
					{/if}
					{$t('onboarding_auth.form.display_name_setup.next')}
				</button>
			</div>
		</form>
	</div>
</div>
