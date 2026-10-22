<script lang="ts">
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';
	import { validateEmail, validatePassword } from '$lib/utils/helpers/validators';
	import { generatePassword } from '$lib/utils/helpers/password';
	import { locale, t } from 'svelte-i18n';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { getAllKeys } from '$lib/utils/nostrKeys';
	import { encryptMasterKeyData } from '$lib/utils/helpers/auth';
	import { nip19 } from 'nostr-tools';
	import { appStore } from '$lib/stores/app.store';
	import { debounce } from '$lib/utils/helpers/common';
	import { onMount } from 'svelte';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import authService from '$lib/api/services/auth.service';
	import { userFacingOnboardingError } from '$lib/utils/helpers/onboarding-error';

	let {
		nextStep,
		prevStep
	}: {
		nextStep: () => void;
		prevStep: () => void;
	} = $props();

	// User data
	let recoveryEmail = $state('');
	let recoveryPassword = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	// Copy success state
	let copySuccess = $state('');

	// Autofocus email when enabling recovery
	let recoveryEmailInput = $state<HTMLInputElement | null>(null);

	// Error states
	let emailError = $state('');
	let passwordError = $state('');
	let passwordMismatchError = $state('');

	// Password strength state
	let passwordStrength = $state<'weak' | 'medium' | 'strong'>('weak');

	// Password strength calculation
	function getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
		const length = password.length;
		if (length >= 12 && length <= 15) {
			return 'weak';
		} else if (length > 15 && length <= 20) {
			return 'medium';
		} else if (length > 20) {
			return 'strong';
		}
		return 'weak';
	}

	// Debounced function to update password strength
	const updatePasswordStrength = debounce(() => {
		passwordStrength = getPasswordStrength(recoveryPassword);
	}, 400);

	// Debounced function to validate password match
	const validatePasswordMatch = debounce(() => {
		if (confirmPassword && recoveryPassword && confirmPassword !== recoveryPassword) {
			passwordMismatchError = $t('onboarding_auth.form.recovery_setup.errors.passwords_mismatch');
		} else {
			passwordMismatchError = '';
		}
	}, 400);

	// Generate password function
	function handleGeneratePassword() {
		const newPassword = generatePassword($locale || 'en');
		recoveryPassword = newPassword;
		confirmPassword = newPassword;
		passwordError = '';
		passwordMismatchError = '';
		passwordStrength = getPasswordStrength(newPassword);
	}

	// Copy password function with success feedback
	async function handleCopyPassword() {
		try {
			copyToClipboard(recoveryPassword);
			copySuccess = 'password';
			setTimeout(() => {
				copySuccess = '';
			}, 2000);
		} catch (err) {
			console.error('Failed to copy password:', err);
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		emailError = '';
		passwordError = '';

		// Validate recovery fields if enabled
		if (!recoveryEmail) {
			nextStep();
			return;
		}

		const emailValidation = validateEmail(recoveryEmail);
		if (!emailValidation.isValid) {
			emailError = emailValidation.error!;
			return;
		}

		if (!recoveryPassword) {
			passwordError = $t('onboarding_auth.form.recovery_setup.errors.password_required');
			return;
		}

		if (recoveryPassword !== confirmPassword) {
			passwordError = $t('onboarding_auth.form.recovery_setup.errors.passwords_mismatch');
			return;
		}

		const passwordValidation = validatePassword(recoveryPassword);
		if (!passwordValidation.isValid) {
			passwordError = passwordValidation.error!;
			return;
		}

		try {
			const allKeys = await getAllKeys();
			let nsec = '';

			// Convert the private key (Uint8Array) to nsec format
			if (allKeys.nsec && allKeys.nsec instanceof Uint8Array) {
				try {
					nsec = nip19.nsecEncode(allKeys.nsec);
				} catch (err) {
					console.error('Error encoding nsec:', err);
					throw new Error($t('onboarding_auth.form.recovery_setup.errors.encoding_nsec'));
				}
			} else {
				nsec = $t('onboarding_auth.form.recovery_setup.errors.invalid_private_key');
			}

			const { encryptedData: recoveryData } = await encryptMasterKeyData(
				nsec,
				allKeys.mnemonic,
				recoveryPassword
			);

			const { value: credentialId } = await Preferences.get({
				key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
			});

			if (!credentialId) {
				throw new Error('No credential ID found');
			}

			await authService.setupRecovery({
				credentialId: credentialId,
				recoveryData,
				email: recoveryEmail
			});

			nextStep();
		} catch (err) {
			// Clear recovery email to allow skipping recovery setup
			recoveryEmail = '';
			console.error('Failed to setup account recovery:', err);
			const fallback = $t('onboarding_auth.form.recovery_setup.errors.setup_failed');
			const error = userFacingOnboardingError(err instanceof Error ? err.message : '', fallback);
			appStore.showErrorToast(error);
			throw new Error(error);
		}
	}

	onMount(() => {
		// Auto-generate password when recovery is enabled
		handleGeneratePassword();
	});
</script>

<div class="card bg-base-100 w-full shadow-xl" data-testid="onboarding-step-recovery">
	<div class="card-body space-y-2">
		<!-- Educational Header -->
		<div class="education-header text-center">
			<h4 class="step-title">{$t('onboarding_auth.form.recovery_setup.title')}</h4>
			<p class="text-base-content/90 mx-auto max-w-lg text-center text-sm md:text-base">
				{$t('onboarding_auth.form.recovery_setup.description')}
			</p>
			<p class="text-base-content/80 mx-auto max-w-lg text-center text-sm md:text-base">
				{$t('onboarding_auth.form.recovery_setup.set_later')}
			</p>
		</div>

		<form onsubmit={handleSubmit} class="space-y-2">
			<div
				class="space-y-2"
				in:slide={{ duration: 200, easing: cubicOut }}
				out:slide={{ duration: 200, easing: cubicIn }}
			>
				<!-- Recovery Email Field -->
				<div class="form-control mx-auto max-w-lg">
					<label class="label" for="email">
						<div class="flex items-center gap-2">
							<span class="label-text"
								>{$t('onboarding_auth.form.recovery_setup.recovery_email')}</span
							>
						</div>
					</label>
					<input
						type="email"
						id="email"
						bind:value={recoveryEmail}
						bind:this={recoveryEmailInput}
						class="input input-bordered w-full {emailError ? 'input-error' : ''}"
						placeholder={$t('onboarding_auth.form.recovery_setup.email_placeholder')}
						data-testid="onboarding-recovery-email"
					/>
					{#if emailError}
						<label class="label" for="email">
							<span class="label-text-alt text-error">{emailError}</span>
						</label>
					{/if}
				</div>

				<!-- Recovery Password Field -->
				<div class="form-control mx-auto max-w-lg">
					<!-- Generated Password Note -->
					<div class="alert alert-warning alert-outline">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span class="text-sm"
							>{$t('onboarding_auth.form.recovery_setup.generated_password_note')}</span
						>
					</div>
					<label aria-label="Recovery Password" class="label" for="password">
						<span class="label-text"
							>{$t('onboarding_auth.form.recovery_setup.recovery_password')}</span
						>
					</label>

					<!-- Password Input with Eye Icon and Generate Button in same row -->
					<div class="flex items-stretch gap-2">
						<div class="relative min-w-0 flex-1">
							<input
								type={showPassword ? 'text' : 'password'}
								id="password"
								bind:value={recoveryPassword}
								oninput={() => {
									updatePasswordStrength();
									validatePasswordMatch();
								}}
								class="input input-bordered w-full pr-12 {passwordError || passwordMismatchError
									? 'input-error'
									: ''}"
								placeholder={$t('onboarding_auth.form.recovery_setup.password_placeholder')}
								required={recoveryEmail.trim() !== ''}
								data-testid="onboarding-recovery-password"
							/>
							<!-- Eye Icon -->
							<button
								type="button"
								class="text-base-content/70 hover:text-base-content absolute inset-y-0 right-0 flex items-center pr-3"
								onclick={() => (showPassword = !showPassword)}
								title={showPassword
									? $t('onboarding_auth.form.recovery_setup.hide_password')
									: $t('onboarding_auth.form.recovery_setup.show_password')}
								aria-label={showPassword
									? $t('onboarding_auth.form.recovery_setup.hide_password')
									: $t('onboarding_auth.form.recovery_setup.show_password')}
							>
								{#if showPassword}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
										/>
									</svg>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
										/>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
										/>
									</svg>
								{/if}
							</button>
						</div>

						<!-- Generate Button - icon only, same size as copy button -->
						<button
							type="button"
							class="btn btn-outline btn-sm btn-square flex shrink-0 items-center justify-center"
							onclick={handleGeneratePassword}
							title={$t('onboarding_auth.form.recovery_setup.generate_password', {
								locale: $locale === 'es' ? 'Spanish' : 'English'
							})}
							aria-label={$t('onboarding_auth.form.recovery_setup.generate_password', {
								locale: $locale === 'es' ? 'Spanish' : 'English'
							})}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
								/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Confirm Password Field -->
				<div class="form-control mx-auto max-w-lg">
					<label class="label" for="confirmPassword">
						<span class="label-text"
							>{$t('onboarding_auth.form.recovery_setup.confirm_recovery_password')}</span
						>
					</label>

					<!-- Confirm Password Input with Eye Icon and Copy Button in same row -->
					<div class="flex items-stretch gap-2">
						<div class="relative min-w-0 flex-1">
							<input
								type={showConfirmPassword ? 'text' : 'password'}
								id="confirmPassword"
								bind:value={confirmPassword}
								oninput={validatePasswordMatch}
								class="input input-bordered w-full pr-12 {passwordError || passwordMismatchError
									? 'input-error'
									: ''}"
								placeholder={$t('onboarding_auth.form.recovery_setup.confirm_password_placeholder')}
								required={recoveryPassword.trim() !== ''}
								data-testid="onboarding-recovery-confirm-password"
							/>
							<!-- Eye Icon -->
							<button
								type="button"
								class="text-base-content/70 hover:text-base-content absolute inset-y-0 right-0 flex items-center pr-3"
								onclick={() => (showConfirmPassword = !showConfirmPassword)}
								title={showConfirmPassword
									? $t('onboarding_auth.form.recovery_setup.hide_password')
									: $t('onboarding_auth.form.recovery_setup.show_password')}
								aria-label={showConfirmPassword
									? $t('onboarding_auth.form.recovery_setup.hide_password')
									: $t('onboarding_auth.form.recovery_setup.show_password')}
							>
								{#if showConfirmPassword}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
										/>
									</svg>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
										/>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
										/>
									</svg>
								{/if}
							</button>
						</div>

						<!-- Copy Button - Same row as input -->
						<button
							type="button"
							class="btn btn-outline btn-sm btn-square flex shrink-0 items-center justify-center"
							onclick={handleCopyPassword}
							title={$t('onboarding_auth.form.recovery_setup.copy_password')}
							disabled={!recoveryPassword}
							aria-label={$t('onboarding_auth.form.recovery_setup.copy_password')}
						>
							{#if copySuccess === 'password'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-success h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
							{/if}
						</button>
					</div>

					{#if passwordMismatchError}
						<label class="label" for="confirmPassword">
							<span class="label-text-alt text-error">{passwordMismatchError}</span>
						</label>
					{:else if passwordError}
						<label class="label" for="confirmPassword">
							<span class="label-text-alt text-error">{passwordError}</span>
						</label>
					{/if}

					<!-- Password Strength Indicator -->
					{#if recoveryPassword && recoveryPassword.length >= 12}
						<div>
							<div class="flex items-center gap-2">
								<div class="flex-1">
									<div class="bg-base-300 h-2 w-full overflow-hidden rounded-full">
										<div
											class="h-full transition-all duration-300 {passwordStrength === 'weak'
												? 'bg-error'
												: passwordStrength === 'medium'
													? 'bg-warning'
													: 'bg-success'}"
											style="width: {passwordStrength === 'weak'
												? '33%'
												: passwordStrength === 'medium'
													? '66%'
													: '100%'}"
										></div>
									</div>
								</div>
								<span
									class="text-sm font-medium {passwordStrength === 'weak'
										? 'text-error'
										: passwordStrength === 'medium'
											? 'text-warning'
											: 'text-success'}"
								>
									{$t(`onboarding_auth.form.recovery_setup.password_strength.${passwordStrength}`)}
								</span>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Form Actions -->
			<div class="flex justify-between">
				<button type="button" class="btn btn-outline" onclick={prevStep}
					>{$t('onboarding_auth.form.recovery_setup.back')}</button
				>
				<button type="submit" class="btn btn-primary" data-testid="onboarding-recovery-next"
					>{$t('onboarding_auth.form.recovery_setup.next')}</button
				>
			</div>
		</form>
	</div>
</div>
