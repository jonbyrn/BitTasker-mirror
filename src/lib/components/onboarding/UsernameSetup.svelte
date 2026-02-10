<script lang="ts">
	import { CheckUsernameAvailabilityStore } from '$houdini';
	import { validateUsername } from '$lib/utils/helpers/validators';
    import IconCheck from '~icons/mdi/check-circle-outline';
	import { t } from 'svelte-i18n';

	let {
		nextStep,
		currentStep,
		totalSteps,
		onUsernameChange
	}: {
		nextStep: () => void;
		currentStep: number;
		totalSteps: number;
		onUsernameChange: (username: string, isAvailable: boolean) => void;
	} = $props();

	// Create the store for username availability checking
	const usernameStore = new CheckUsernameAvailabilityStore();

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

			const { data, errors } = await usernameStore.fetch({
				variables: {
					username
				}
			});

			if (errors) {
				throw new Error(errors[0].message);
			}

			usernameAvailable = data?.checkUsernameAvailability || false;

			if (!usernameAvailable) {
				usernameError = $t('onboarding_auth.form.username_setup.errors.already_taken');
			}

			onUsernameChange(username, usernameAvailable);
		} catch (err) {
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
	<div class="card-body">
		<!-- Educational Header -->
        <div class="education-header mb-6 text-center">
            <div class="step-indicator text-primary mb-2 text-sm font-medium text-end">
                {$t('onboarding_auth.form.username_setup.step')} {currentStep + 1} {$t('onboarding_auth.form.username_setup.of')} {totalSteps}
            </div>

            <h4 class="step-title mb-3 mt-4">{$t('onboarding_auth.form.username_setup.title')}</h4>
            <h5 class="mb-3">{$t('onboarding_auth.form.username_setup.subtitle')}</h5>

            <div class="features-list mb-6 space-y-2 text-center mx-auto w-fit">
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span>{@html $t('onboarding_auth.form.username_setup.features.claim_name')}</span>
                </div>
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span>{@html $t('onboarding_auth.form.username_setup.features.professional')}</span>
                </div>
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span>{@html $t('onboarding_auth.form.username_setup.features.shareable')}</span>
                </div>
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span>{@html $t('onboarding_auth.form.username_setup.features.nostr_portable')}</span>
                </div>
            </div>

            <p class="text-primary mb-2 text-lg">{$t('onboarding_auth.form.username_setup.first_impressions')}</p>
        </div>

        <form onsubmit={handleSubmit} class="">
			<!-- Username Field -->
			<div class="form-control max-w-lg mx-auto">
				<label class="label" for="username">
                    <span class="label-text pb-1 text-base-content">{$t('onboarding_auth.form.username_setup.username_field')}</span>
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
                    <span class="label-text-alt {username.length > 64 ? 'text-error' : 'text-base-content/70'}">
                        {username.length}/64
                    </span>
                </div>
				{#if usernameError}
					<label class="label" for="username">
						<span class="label-text-alt text-error">{usernameError}</span>
					</label>
				{/if}
			</div>

			<!-- Form Actions -->
			<div class="mt-6 flex justify-between">
				<div></div> <!-- Empty div for spacing since there's no back on step 1 -->
				<button type="submit" class="btn btn-primary" data-testid="onboarding-username-next" disabled={!username || isCheckingUsername}>
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
