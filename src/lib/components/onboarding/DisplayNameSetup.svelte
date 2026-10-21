<script lang="ts">
	import { t } from 'svelte-i18n';
	import { normalizeSimpleUsername, simpleUsernameIssue } from '$lib/utils/helpers/simpleUsername';

	let {
		displayName = '',
		username = '',
		onDisplayName,
		onUsername,
		nextStep,
		onKeyBackup,
		isPublishing = false,
		publishError = ''
	}: {
		displayName: string;
		username: string;
		onDisplayName: (value: string) => void;
		onUsername: (value: string) => void;
		nextStep: () => void | Promise<void>;
		onKeyBackup: () => void | Promise<void>;
		isPublishing?: boolean;
		publishError?: string;
	} = $props();

	const usernameIssue = $derived(simpleUsernameIssue(normalizeSimpleUsername(username)));
	const nameReady = $derived(displayName.trim().length >= 3 && displayName.length <= 50);

	function setName(event: Event) {
		const value = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
		onDisplayName(value);
	}

	function setUsername(event: Event) {
		const value = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
		onUsername(value);
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!nameReady || usernameIssue) return;
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
					value={displayName}
					oninput={setName}
					class="input input-bordered w-full"
					placeholder={$t('onboarding_auth.form.display_name_setup.placeholder')}
					minlength={3}
					maxlength={50}
					disabled={isPublishing}
				/>
				<div class="label flex justify-start">
					<span class="label-text-alt text-base-content/70">
						{displayName.length}/50
					</span>
				</div>
			</div>

			<div class="form-control mx-auto max-w-lg">
				<label class="label" for="username">
					<span class="label-text text-base-content pb-1">
						{$t('onboarding_auth.form.username_setup.username_field')}
					</span>
				</label>
				<input
					type="text"
					id="username"
					data-testid="onboarding-username-input"
					value={username}
					oninput={setUsername}
					class="input input-bordered w-full"
					placeholder={$t('onboarding_auth.form.username_setup.placeholder')}
					autocapitalize="off"
					autocorrect="off"
					spellcheck="false"
					minlength={3}
					maxlength={20}
					disabled={isPublishing}
				/>
				<div class="label flex justify-start">
					<span class="label-text-alt text-base-content/70">
						{$t('onboarding_auth.form.username_setup.help_text')}
					</span>
				</div>
			</div>

			{#if publishError}
				<div class="alert alert-outline alert-error mx-auto max-w-lg">
					<span class="whitespace-normal">{publishError}</span>
				</div>
			{/if}

			<button
				type="button"
				class="btn btn-outline w-full"
				data-testid="onboarding-key-backup"
				disabled={!nameReady || usernameIssue !== null || isPublishing}
				onclick={() => void onKeyBackup()}
			>
				{$t('onboarding_auth.form.passkey_setup.create_key_backup')}
			</button>

			<div class="flex justify-between">
				<div></div>
				<button
					type="submit"
					class="btn btn-primary"
					data-testid="onboarding-display-name-next"
					disabled={!nameReady || usernameIssue !== null || isPublishing}
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
