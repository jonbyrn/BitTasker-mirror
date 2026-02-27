<script lang="ts">
	import { validateUsername } from '$lib/utils/helpers/validators';
	import { t } from 'svelte-i18n';
	import authService from '$lib/api/services/auth.service';

	let {
		nextStep,
		currentStep: _currentStep,
		totalSteps: _totalSteps,
		onUsernameChange
	}: {
		nextStep: () => void;
		currentStep: number;
		totalSteps: number;
		onUsernameChange: (username: string, isAvailable: boolean) => void;
	} = $props();
	void _currentStep;
	void _totalSteps;

	// User data
	let username = $state('');
	let isCheckingUsername = $state(false);
	let usernameError = $state('');
	let usernameAvailable = $state(false);

	//validation function
	function validateUsernameInput(value: string, skipSpaceCheck = false) {
		if (!value) {
			usernameError = '';
			return;
		}

		const validation = validateUsername(value);
		if (!validation.isValid) {
			usernameError = validation.error ? $t(validation.error) : '';
			usernameAvailable = false;
			onUsernameChange(value, false);
		} else if (!skipSpaceCheck) {
			usernameError = '';
		}
	}

	async function checkUsernameAvailability() {
		const validation = validateUsername(username);
		if (!validation.isValid) {
			usernameError = validation.error ? $t(validation.error) : '';
			usernameAvailable = false;
			onUsernameChange(username, false);
			return;
		}

		try {
			isCheckingUsername = true;
			usernameError = '';

			const available = await authService.checkUsernameAvailability(username);

			usernameAvailable = available;

			if (!usernameAvailable) {
				usernameError = $t('onboarding_auth.form.username_setup.errors.already_taken');
			}

			onUsernameChange(username, usernameAvailable);
		} catch (err) {
			console.error('Error checking username availability:', err);
			usernameError = $t('onboarding_auth.form.username_setup.errors.check_failed');
			usernameAvailable = false;
			onUsernameChange(username, false);
		} finally {
			isCheckingUsername = false;
		}
	}

	async function handleSubmit() {
		// Check username availability when Next button is clicked
		await checkUsernameAvailability();

		// Only proceed if username is available
		if (usernameAvailable && username) {
			nextStep();
		}
	}
</script>

<div class="card bg-base-100 w-full shadow-xl" data-testid="onboarding-step-username">
	<div class="card-body space-y-2">
		<!-- Educational Header -->
		<div class="education-header text-center">
			<h4 class="step-title">{$t('onboarding_auth.form.username_setup.title')}</h4>

			<p class="text-primary text-base md:text-lg">
				{$t('onboarding_auth.form.username_setup.first_impressions')}
			</p>
		</div>

		<form onsubmit={handleSubmit} class="space-y-2">
			<!-- Username Field -->
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
					bind:value={username}
					class="input input-bordered w-full {usernameError ? 'input-error' : ''}"
					placeholder={$t('onboarding_auth.form.username_setup.placeholder')}
					required
					maxlength="64"
					onkeydown={(e) => {
						// Prevent space key from being typed
						if (e.key === ' ') {
							e.preventDefault();
						}
					}}
					oninput={(e) => {
						const input = e.target as HTMLInputElement;
						const value = input.value;

						// Strip spaces if any are entered
						if (value.includes(' ')) {
							const cleanedValue = value.replace(/\s/g, '');
							input.value = cleanedValue;
							username = cleanedValue;
							// Validate the cleaned value (validateUsername will catch spaces)
							validateUsernameInput(cleanedValue);
						} else {
							username = value;
							validateUsernameInput(value);
						}
					}}
				/>
				<div class="label flex justify-start">
					<span
						class="label-text-alt {username.length > 64 ? 'text-error' : 'text-base-content/70'}"
					>
						{username.length}/64
					</span>
				</div>
				{#if usernameError}
					<label class="label" for="username">
						<span class="label-text-alt text-error" data-testid="onboarding-username-error"
							>{usernameError}</span
						>
					</label>
				{/if}
			</div>

			<!-- Form Actions -->
			<div class="flex justify-between">
				<!-- Empty div for spacing since there's no back on step 1 -->
				<div></div>
				<button
					type="submit"
					class="btn btn-primary"
					data-testid="onboarding-username-next"
					disabled={!username || isCheckingUsername}
				>
					{#if isCheckingUsername}
						<span class="loading loading-spinner loading-sm"></span>
						{$t('onboarding_auth.form.username_setup.checking')}
					{:else}
						{$t('onboarding_auth.form.username_setup.next')}
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
