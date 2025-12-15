<script lang="ts">
	import type { NostrRecoveryData } from '$lib/types/auth';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import { validatePassword } from '$lib/utils/helpers/validators';
	import {
		createUserDeviceShortName,
		getDeviceIdentifier
	} from '$lib/utils/helpers/deviceIdentity';
	import { decryptMasterKeyWithPassword, encryptMasterKeyData } from '$lib/utils/helpers/auth';
	import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
	import {
		checkWebBiometricAvailability,
		setWebBiometricKey
	} from '$lib/utils/helpers/webBiometrics';
	import authService from '$lib/api/services/auth.service';
	import { generatePassword } from '$lib/utils/helpers/password';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { RevokeAllDevicesStore } from '$houdini';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';

	const npub = page.params.npub;

	let recoveryCode = $state<string>('');
	let currentPassword = $state<string>('');
	let newPassword = $state<string>('');
	let confirmPassword = $state<string>('');
	let nsec = $state<string>('');
	let mnemonic = $state<string>('');
	let isLoading = $state(false);
	let error = $state<string>('');
	let passwordError = $state<string>('');
	let step = $state(1); // 1: Current Password, 2: New Password
	let recoveryData = $state<NostrRecoveryData>();
	let showCurrentPassword = $state(false);
	let showNewPassword = $state(false);
	let authMethods = $state({
		biometric: false,
		webAuthn: false
	});
	let lastRecoveryAction = $state<'decrypt' | 'complete' | null>(null);

	// Early return if npub is not available
	if (!npub) {
		error = $t('recovery_npub.errors.invalid_link');
	}

	onMount(async () => {
		if (!npub) {
			error = $t('recovery_npub.errors.no_public_key');
			return;
		}

		try {
			// Fetch recovery data for this npub
			recoveryData = await authService.getNostrRecoveryData(npub);

			// Check if recovery data is valid
			if (
				!recoveryData ||
				!recoveryData.nostr ||
				!recoveryData.wallet ||
				!recoveryData.masterSalt
			) {
				throw new Error($t('recovery_npub.errors.no_recovery_data'));
			}

			authMethods.biometric = await checkBiometricAvailability();
			authMethods.webAuthn = await checkWebBiometricAvailability();
			newPassword = generatePassword();
		} catch (err: any) {
			const message =
				err instanceof Error ? err.message : $t('recovery_npub.errors.no_recovery_data');
			appStore.showErrorToast(message, 4000);
			return goto('/auth/login');
		}
	});

	function regeneratePassword() {
		newPassword = generatePassword();
	}

	async function decryptAccountKeys(event: Event) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';
			lastRecoveryAction = 'decrypt';

			if (!currentPassword || !recoveryData) {
				error = $t('recovery_npub.errors.password_required');
				return;
			}

			// Check if recovery data has the required fields
			if (!recoveryData.nostr || !recoveryData.wallet || !recoveryData.masterSalt) {
				error = $t('recovery_npub.errors.no_recovery_data_available');
				return;
			}

			// Decrypt private key with current password
			({ nsec, mnemonic } = await decryptMasterKeyWithPassword(recoveryData, currentPassword));
			step = 2;
		} catch (err: any) {
			error = $t('recovery_npub.errors.decrypt_failed');
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

			if (!newPassword || !confirmPassword || !recoveryCode) {
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

			const deviceId = await getDeviceIdentifier();

			// Encrypt with device ID for biometric storage
			const masterKeyData = await encryptMasterKeyData(nsec, mnemonic, deviceId);

			// Encrypt private key with new password for recovery
			const recoveryData = await encryptMasterKeyData(nsec, mnemonic, newPassword);

			// Complete recovery
			if (!npub) {
				error = $t('recovery_npub.errors.invalid_link');
				return;
			}

			const recoveryResponse = await authService.completeNostrRecovery({
				publicKey: npub,
				otp: recoveryCode,
				recoveryData: {
					nostr: recoveryData.nostr,
					wallet: recoveryData.wallet,
					masterSalt: recoveryData.masterSalt
				},
				encryptedMasterKeyData: masterKeyData,
				deviceId
			});

			// TODO: revoke all devices access except the one being used for recovery
			/* const revokeStore = new RevokeAllDevicesStore();
			await revokeStore.mutate({
					
			}); */

			// Check available authentication methods
			const isMobileBiometrics = await checkBiometricAvailability();

			const deviceName = await createUserDeviceShortName(npub);

			// Register device with server
			let credentialId = '';
			if (isMobileBiometrics) {
				credentialId = await setBiometricKey(
					npub,
					masterKeyData.exportedMasterKey,
					'biometrics',
					deviceName
				);
			} else {
				credentialId = await setWebBiometricKey(npub, masterKeyData.exportedMasterKey, deviceName);
			}

			if (!credentialId) {
				throw new Error($t('recovery_npub.errors.register_device_failed'));
			}

			await authService.registerPasskeyDevice(npub, deviceId, deviceName, credentialId);

			const response = await authService.loginWithPasskey(npub, deviceId);
			console.log({ response, recoveryResponse });
			if (response && response.access_token) {
				const biometricData = {
					username: npub,
					password: JSON.stringify({
						masterKeyData,
						key: masterKeyData.exportedMasterKey
					}),
					server: deviceId,
					isLegacyFormat: false
				};
				authState.setupAuthData(
					response.access_token,
					'biometrics',
					npub,
					response.user,
					biometricData,
					true
				);
			}
		} catch (err: any) {
			error = err.message || $t('recovery_npub.errors.recovery_failed');
		} finally {
			isLoading = false;
		}
	}
</script>

<div
	class="bg-base-200 flex flex-grow flex-col items-center justify-center gap-4 px-4 py-10 md:pt-20"
>
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h3 class="card-title mb-6 text-center font-semibold text-xl sm:text-2xl leading-tight">
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
						<label class="label" for="recoveryCode">
							<span class="label-text">{$t('recovery_npub.recovery_code_label')}</span>
						</label>
						<input
							type="text"
							id="recoveryCode"
							bind:value={recoveryCode}
							placeholder={$t('recovery_npub.recovery_code_placeholder')}
							class="input input-bordered w-full"
							required
						/>
					</div>

					<div class="form-control">
						<label class="label" for="newPassword">
							<span class="label-text">{$t('recovery_npub.new_password_label')}</span>
						</label>
						<div class="relative">
							<input
								type={showNewPassword ? 'text' : 'password'}
								id="newPassword"
								bind:value={newPassword}
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
								placeholder={$t('recovery_npub.confirm_password_placeholder')}
								class="input input-bordered w-full {passwordError ? 'input-error' : ''} pr-20"
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
						{#if passwordError}
							<span class="text-error text-sm">{passwordError}</span>
						{/if}
					</div>

					<!-- Password Guidelines -->
					{#if newPassword}
						<div class="space-y-1 text-sm">
							<p class="font-medium">{$t('recovery_npub.password_requirements_title')}</p>
							<div class="flex flex-wrap gap-x-4 gap-y-1">
								<span class={newPassword.length >= 8 ? 'text-success' : 'text-base-content/60'}>
									{$t('recovery_npub.password_requirements.min_length')}
								</span>
								<span class={/[A-Z]/.test(newPassword) ? 'text-success' : 'text-base-content/60'}>
									{$t('recovery_npub.password_requirements.uppercase')}
								</span>
								<span class={/[a-z]/.test(newPassword) ? 'text-success' : 'text-base-content/60'}>
									{$t('recovery_npub.password_requirements.lowercase')}
								</span>
								<span class={/[0-9]/.test(newPassword) ? 'text-success' : 'text-base-content/60'}>
									{$t('recovery_npub.password_requirements.numbers')}
								</span>
								<span
									class={/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)
										? 'text-success'
										: 'text-base-content/60'}
								>
									{$t('recovery_npub.password_requirements.special_chars')}
								</span>
							</div>
						</div>
					{/if}

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
						return lastRecoveryAction === 'complete' && (
							errorLower.includes('passkey') ||
							errorLower.includes('biometric') ||
							errorLower.includes('webauthn') ||
							errorLower.includes('authentication') ||
							errorLower.includes('credential') ||
							errorLower.includes('device')
						);
					})()}
					autoOpenModal={(() => {
						// Auto-open modal for passkey errors
						const errorLower = error.toLowerCase();
						return lastRecoveryAction === 'complete' && (
							errorLower.includes('passkey') ||
							errorLower.includes('biometric') ||
							errorLower.includes('webauthn') ||
							errorLower.includes('authentication') ||
							errorLower.includes('credential') ||
							errorLower.includes('device')
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
