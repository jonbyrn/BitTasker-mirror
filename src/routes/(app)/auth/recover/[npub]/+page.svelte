<script lang="ts">
	import type { NostrRecoveryData } from '$lib/types/auth';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t, locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { authState } from '$lib/stores/auth.store';
	import { validatePassword } from '$lib/utils/helpers/validators';
	import {
		createUserDeviceShortName,
		getDeviceIdentifier
	} from '$lib/utils/helpers/deviceIdentity';
	import { decryptMasterKeyWithPassword, encryptMasterKeyData } from '$lib/utils/helpers/auth';
	import {
		checkBiometricAvailability,
		checkNativePlatform,
		setBiometricKey
	} from '$lib/utils/helpers/biometrics';
	import { generatePassword } from '$lib/utils/helpers/password';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { debounce } from '$lib/utils/helpers/common';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import authService from '$lib/api/services/auth.service';

	const npub = page.params.npub;

	let otpCode = $state<string>('');
	let currentPassword = $state<string>('');
	let newPassword = $state<string>('');
	let confirmPassword = $state<string>('');
	let nsec = $state<string>('');
	let mnemonic = $state<string>('');
	let isLoading = $state(false);
	let error = $state<string>('');
	let passwordError = $state<string>('');
	let passwordMismatchError = $state<string>('');
	let step = $state(1); // 1: Current Password, 2: New Password
	let recoveryData = $state<NostrRecoveryData>();
	let showCurrentPassword = $state(false);
	let showNewPassword = $state(false);
	let isBiometricsAvailable = $state(false);
	let lastRecoveryAction = $state<'decrypt' | 'complete' | null>(null);
	let revokeAll = $state(false);

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
	const updatePasswordStrength = debounce((event: unknown) => {
		const target = (event as Event).target as HTMLInputElement;
		if (target) {
			passwordStrength = getPasswordStrength(target.value);
		}
	}, 400);

	// Debounced function to validate password match
	const validatePasswordMatch = debounce(() => {
		if (confirmPassword && newPassword && confirmPassword !== newPassword) {
			passwordMismatchError = $t('recovery_npub.errors.passwords_mismatch');
		} else {
			passwordMismatchError = '';
		}
	}, 400);

	// Early return if npub is not available
	if (!npub) {
		error = $t('recovery_npub.errors.invalid_link');
	}

	onMount(async () => {
		try {
			if (!npub) {
				error = $t('recovery_npub.errors.no_public_key');
				throw new Error(error);
			}

			isBiometricsAvailable = await checkBiometricAvailability();
			const generatedPassword = generatePassword($locale || 'en');
			newPassword = generatedPassword;
			confirmPassword = generatedPassword;
			passwordStrength = getPasswordStrength(generatedPassword);
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : $t('recovery_npub.errors.no_recovery_data');
			appStore.showErrorToast(message, 4000);
			return goto('/auth/login');
		}
	});

	function regeneratePassword() {
		const generatedPassword = generatePassword($locale || 'en');
		newPassword = generatedPassword;
		confirmPassword = generatedPassword;
		passwordStrength = getPasswordStrength(generatedPassword);
		passwordMismatchError = '';
	}

	async function decryptAccountKeys(event: Event) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';
			lastRecoveryAction = 'decrypt';

			// Fetch recovery data for this npub
			recoveryData = await authService.getNostrRecoveryData({ npub, otp: otpCode });

			// Check if recovery data is valid
			if (!recoveryData || !recoveryData.nostr || !recoveryData.wallet) {
				error = $t('recovery_npub.errors.no_recovery_data');
				throw new Error(error);
			}

			if (!currentPassword) {
				error = $t('recovery_npub.errors.password_required');
				return;
			}

			// Decrypt private key with current password
			({ nsec, mnemonic } = await decryptMasterKeyWithPassword(recoveryData, currentPassword));
			step = 2;
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : $t('recovery_npub.errors.decrypt_failed');
		} finally {
			isLoading = false;
		}
	}

	async function completeRecovery(event: Event) {
		event.preventDefault();

		try {
			lastRecoveryAction = 'complete';
			isLoading = true;
			error = '';
			passwordError = '';

			// Complete recovery
			if (!npub) {
				error = $t('recovery_npub.errors.invalid_link');
				return;
			}

			if (!newPassword || !confirmPassword || !otpCode) {
				error = $t('recovery_npub.errors.all_fields_required');
				return;
			}

			if (newPassword !== confirmPassword) {
				passwordError = $t('recovery_npub.errors.passwords_mismatch');
				return;
			}

			const passwordValidation = validatePassword(newPassword);
			if (!passwordValidation.isValid) {
				passwordError = passwordValidation.error!;
				return;
			}

			// Encrypt with device ID for biometric storage
			const { encryptedData, exportedKey } = await encryptMasterKeyData(nsec, mnemonic, nsec);

			let credentialData = {
				credentialId: '',
				passkeyPubkey: '',
				clientDataJSON: '',
				attestationObject: '',
				challenge: ''
			};
			if (isBiometricsAvailable) {
				credentialData = await setBiometricKey({ npub, exportedKey });
			}

			if (!credentialData.credentialId) {
				throw new Error($t('recovery_npub.errors.register_device_failed'));
			}

			// Encrypt private key with new password for recovery
			const { encryptedData: recoveryData } = await encryptMasterKeyData(
				nsec,
				mnemonic,
				newPassword
			);

			const deviceId = await getDeviceIdentifier();
			const deviceName = await createUserDeviceShortName(npub);

			const { access_token, refresh_token, user } = await authService.completeNostrRecovery({
				npub: npub,
				otp: otpCode,
				encryptedData,
				recoveryData,
				credentialId: credentialData.credentialId,
				challenge: credentialData.challenge,
				passkeyPubkey: credentialData.passkeyPubkey,
				clientDataJSON: credentialData.clientDataJSON,
				attestationObject: credentialData.attestationObject,
				deviceId,
				deviceName,
				platform: checkNativePlatform() ? 'mobile' : 'web',
				revokeAll,
				timezoneOffset: new Date().getTimezoneOffset(),
				lang: get(locale) || 'en'
			});

			if (access_token && user) {
				const biometricData = {
					npub,
					encryptedData,
					exportedKey,
					credentialId: credentialData.credentialId
				};
				authState.setupAuthData(
					access_token,
					'passkey',
					npub,
					user,
					biometricData,
					true,
					refresh_token
				);
			}
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : $t('recovery_npub.errors.recovery_failed');
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex grow flex-col items-center justify-center gap-4 px-4 py-10 md:pt-20">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h3 class="card-title mb-6 text-center text-xl leading-tight font-semibold sm:text-2xl">
				{$t('recovery_npub.title')}
			</h3>

			{#if step === 1}
				<form onsubmit={decryptAccountKeys} class="space-y-4">
					<div class="form-control">
						<label class="label" for="currentPassword">
							<span class="label-text">{$t('recovery_npub.current_password_label')}</span>
						</label>
						<div class="relative">
							<input
								type={showCurrentPassword ? 'text' : 'password'}
								id="currentPassword"
								bind:value={currentPassword}
								placeholder={$t('recovery_npub.current_password_placeholder')}
								class="input input-bordered w-full pr-10"
								required
							/>
							<button
								type="button"
								class="absolute inset-y-0 right-0 flex items-center pr-3"
								onclick={() => (showCurrentPassword = !showCurrentPassword)}
							>
								{#if showCurrentPassword}
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
					</div>

					<div class="form-control">
						<label class="label" for="recoveryCode">
							<span class="label-text">{$t('recovery_npub.recovery_code_label')}</span>
						</label>
						<input
							type="text"
							id="recoveryCode"
							bind:value={otpCode}
							placeholder={$t('recovery_npub.recovery_code_placeholder')}
							class="input input-bordered w-full"
							required
						/>
					</div>

					<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
						{#if isLoading}
							<span class="loading loading-spinner"></span>
						{:else}
							{$t('recovery_npub.continue_button')}
						{/if}
					</button>
					<button
						type="button"
						class="btn btn-soft w-full"
						disabled={isLoading}
						onclick={() => goto('/auth/recover/send')}
					>
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
								d="M10 19l-7-7m0 0l7-7m-7 7h18"
							/>
						</svg>
						{$t('recovery_npub.back_to_recovery')}
					</button>
				</form>
			{:else if step === 2}
				<form onsubmit={completeRecovery} class="space-y-4">
					<div class="form-control">
						<!-- Generated Password Note -->
						<div class="alert alert-warning alert-outline mb-2">
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
						<label class="label" for="newPassword">
							<span class="label-text">{$t('recovery_npub.new_password_label')}</span>
						</label>
						<div class="relative">
							<input
								type={showNewPassword ? 'text' : 'password'}
								id="newPassword"
								bind:value={newPassword}
								oninput={(e) => {
									updatePasswordStrength(e);
									validatePasswordMatch();
								}}
								placeholder={$t('recovery_npub.new_password_placeholder')}
								class="input input-bordered w-full {passwordError ? 'input-error' : ''} pr-20"
								required
							/>
							<div class="absolute inset-y-0 right-0 flex items-center pr-3">
								<!-- Copy Button -->
								<button
									type="button"
									class="mr-2"
									onclick={() => copyToClipboard(newPassword)}
									disabled={!newPassword}
									title={$t('recovery_npub.copy_password_title')}
									aria-label={$t('recovery_npub.copy_password_title')}
								>
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
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
								</button>
								<!-- Regenerate Button -->
								<button
									aria-label={$t('recovery_npub.regenerate_password_title')}
									type="button"
									class="mr-2"
									onclick={regeneratePassword}
								>
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
											d="M8.25 4.5l7.5 7.5-7.5 7.5"
										/>
									</svg>
								</button>
								<!-- Show/Hide Button -->
								<button
									type="button"
									onclick={() => (showNewPassword = !showNewPassword)}
									aria-label={showNewPassword
										? $t('recovery_npub.hide_password_title')
										: $t('recovery_npub.show_password_title')}
								>
									{#if showNewPassword}
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
						</div>
					</div>

					<div class="form-control">
						<label class="label" for="confirmPassword">
							<span class="label-text">{$t('recovery_npub.confirm_password_label')}</span>
						</label>
						<div class="relative">
							<input
								type={showNewPassword ? 'text' : 'password'}
								id="confirmPassword"
								bind:value={confirmPassword}
								oninput={validatePasswordMatch}
								placeholder={$t('recovery_npub.confirm_password_placeholder')}
								class="input input-bordered w-full {passwordError || passwordMismatchError
									? 'input-error'
									: ''} pr-20"
								required
							/>
							<!-- Copy Button -->
							<button
								type="button"
								class="absolute inset-y-0 right-0 flex items-center pr-3"
								onclick={() => copyToClipboard(confirmPassword)}
								disabled={!confirmPassword}
								title={$t('recovery_npub.copy_password_title')}
								aria-label={$t('recovery_npub.copy_password_title')}
							>
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
										d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
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
						{#if newPassword && newPassword.length >= 12}
							<div class="mt-2">
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
										{$t(
											`onboarding_auth.form.recovery_setup.password_strength.${passwordStrength}`
										)}
									</span>
								</div>
							</div>
						{/if}
					</div>

					<!-- Revoke All Devices Checkbox -->
					<div class="form-control">
						<label class="label cursor-pointer gap-3">
							<input
								type="checkbox"
								bind:checked={revokeAll}
								class="checkbox checkbox-primary"
								id="revokeAll"
							/>
							<span class="label-text font-medium">{$t('recovery_npub.revoke_all_label')}</span>
						</label>
						<p class="label-text-alt text-base-content/70 whitespace-break-spaces">
							{$t('recovery_npub.revoke_all_description')}
						</p>
					</div>

					<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
						{#if isLoading}
							<span class="loading loading-spinner"></span>
						{:else}
							{$t('recovery_npub.reset_password_button')}
						{/if}
					</button>
					<button
						type="button"
						class="btn btn-soft w-full"
						disabled={isLoading}
						onclick={() => goto('/auth/recover/send')}
					>
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
								d="M10 19l-7-7m0 0l7-7m-7 7h18"
							/>
						</svg>
						{$t('recovery_npub.back_to_recovery')}
					</button>
				</form>
			{/if}

			{#if error}
				<ErrorAlertWithModal
					{error}
					isPasskeyError={(() => {
						// Check if error is passkey/biometric related
						const errorLower = error.toLowerCase();
						return (
							lastRecoveryAction === 'complete' &&
							(errorLower.includes('passkey') ||
								errorLower.includes('biometric') ||
								errorLower.includes('webauthn') ||
								errorLower.includes('authentication') ||
								errorLower.includes('credential') ||
								errorLower.includes('device'))
						);
					})()}
					autoOpenModal={(() => {
						// Auto-open modal for passkey errors
						const errorLower = error.toLowerCase();
						return (
							lastRecoveryAction === 'complete' &&
							(errorLower.includes('passkey') ||
								errorLower.includes('biometric') ||
								errorLower.includes('webauthn') ||
								errorLower.includes('authentication') ||
								errorLower.includes('credential') ||
								errorLower.includes('device'))
						);
					})()}
					onRetry={async () => {
						error = '';
						// Create a minimal event object for the form handlers
						const syntheticEvent = {
							preventDefault: () => {}
						} as Event;

						if (lastRecoveryAction === 'decrypt') {
							await decryptAccountKeys(syntheticEvent);
						} else if (lastRecoveryAction === 'complete') {
							await completeRecovery(syntheticEvent);
						}
					}}
					class="mt-4"
				/>
			{/if}
		</div>
	</div>
</div>
