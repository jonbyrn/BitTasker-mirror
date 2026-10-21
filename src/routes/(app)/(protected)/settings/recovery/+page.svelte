<script lang="ts">
	import { resolve } from '$app/paths';
	import { getContext } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { t } from 'svelte-i18n';
	import { encryptMasterKeyData } from '$lib/utils/helpers/auth';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { debounce } from '$lib/utils/helpers/common';
	import { generatePassword } from '$lib/utils/helpers/password';
	import { locale } from 'svelte-i18n';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { Preferences } from '@capacitor/preferences';
	import authService from '$lib/api/services/auth.service';
	import { walletUnlockRoute } from '$lib/utils/helpers/login-method';

	const settings = getContext<{
		nsec: string;
		npub: string;
		mnemonic: string;
		keysReady: boolean;
		error: string;
		unlock: () => Promise<void>;
	}>('settings');

	let recoveryLoading = $state(false);
	let recoveryError = $state('');
	let recoverySuccess = $state('');
	let recoveryEmail = $state('');
	let recoveryPassword = $state('');
	let confirmRecoveryPassword = $state('');
	let showRecoveryPassword = $state(false);
	let showConfirmRecoveryPassword = $state(false);
	let emailError = $state('');
	let passwordError = $state('');
	let passwordMismatchError = $state('');
	let copySuccess = $state('');

	let passwordStrength = $state<'weak' | 'medium' | 'strong'>('weak');

	function validateEmail(value: string): { isValid: boolean; error?: string } {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
			? { isValid: true }
			: { isValid: false, error: $t('settings.validation.emailInvalid') };
	}

	function validatePassword(value: string): { isValid: boolean; error?: string } {
		return value.length >= 12
			? { isValid: true }
			: { isValid: false, error: $t('settings.validation.passwordTooShort') };
	}

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

	const updatePasswordStrength = debounce((event: unknown) => {
		const target = (event as Event).target as HTMLInputElement;
		if (target) {
			passwordStrength = getPasswordStrength(target.value);
		}
	}, 400);

	const validatePasswordMatch = debounce(() => {
		if (
			confirmRecoveryPassword &&
			recoveryPassword &&
			confirmRecoveryPassword !== recoveryPassword
		) {
			passwordMismatchError = $t('settings.validation.passwordMismatch');
		} else {
			passwordMismatchError = '';
		}
	}, 400);

	function handleGeneratePassword() {
		const newPassword = generatePassword($locale || 'en');
		recoveryPassword = newPassword;
		confirmRecoveryPassword = newPassword;
		passwordError = '';
		passwordMismatchError = '';
		passwordStrength = getPasswordStrength(newPassword);
	}

	async function _copyToClipboard(text: string, type: 'npub' | 'nsec' | 'recovery' | 'confirm') {
		try {
			copyToClipboard(text);
			copySuccess = type;
			setTimeout(() => {
				copySuccess = '';
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	function validateRecoveryForm(): boolean {
		emailError = '';
		passwordError = '';
		passwordMismatchError = '';

		if (!recoveryEmail) {
			emailError = $t('settings.validation.emailRequired');
			return false;
		}

		const emailValidation = validateEmail(recoveryEmail);
		if (!emailValidation.isValid) {
			emailError = emailValidation.error!;
			return false;
		}

		if (!recoveryPassword) {
			passwordError = $t('settings.validation.passwordRequired');
			return false;
		}

		if (recoveryPassword !== confirmRecoveryPassword) {
			passwordMismatchError = $t('settings.validation.passwordMismatch');
			return false;
		}

		const passwordValidation = validatePassword(recoveryPassword);
		if (!passwordValidation.isValid) {
			passwordError = passwordValidation.error!;
			return false;
		}

		return true;
	}

	async function setupAccountRecovery(event: Event) {
		event.preventDefault();

		if (!validateRecoveryForm()) return;

		const keyLogin = walletUnlockRoute() === 'nsec';
		const pending = settings.nsec.startsWith('nsec') || keyLogin ? null : settings.unlock();
		try {
			recoveryLoading = true;
			if (pending) await pending;
			recoveryError = '';
			recoverySuccess = '';

			if (keyLogin && !settings.nsec.startsWith('nsec')) {
				throw new Error($t('wallet.nsec_unlock_hint'));
			}

			if (!settings.nsec.startsWith('nsec') || !settings.npub) {
				throw new Error($t('settings.error.invalidNostrKeys'));
			}

			if (!settings.mnemonic) {
				throw new Error($t('settings.error.noMnemonic'));
			}

			const { encryptedData: recoveryData } = await encryptMasterKeyData(
				settings.nsec,
				settings.mnemonic,
				recoveryPassword
			);

			const { value: credentialId } = await Preferences.get({
				key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
			});

			if (!credentialId) {
				throw new Error('No credential ID found');
			}

			const data = {
				credentialId: credentialId,
				recoveryData,
				email: recoveryEmail
			};

			await authService.setupRecovery(data);

			recoverySuccess = $t('settings.recovery.success');

			recoveryEmail = '';
			recoveryPassword = '';
			confirmRecoveryPassword = '';
			passwordMismatchError = '';
			passwordStrength = 'weak';
		} catch (err: unknown) {
			console.error('Failed to setup account recovery:', err);
			recoveryError = err instanceof Error ? err.message : $t('settings.error.recoverySetup');
		} finally {
			recoveryLoading = false;
		}
	}
</script>

<div in:fly={{ x: 300, duration: 250, easing: cubicOut }}>
	<div class="mb-4">
		<a href={resolve('/settings')} class="btn btn-sm border-base-300 bg-base-200 gap-2 border">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg
			>
			{$t('settings.back')}
		</a>
	</div>

	{#if settings.keysReady}
		<div class="settings-sub-content bg-base-100 rounded-xl p-4 shadow-lg">
			<div class="mb-6">
				<h4 class="border-base-300 mb-4 border-b pb-2 text-lg font-semibold">
					{$t('settings.recovery.title')}
				</h4>
				<div>
					<p class="text-base-content/70 mb-6">
						{$t('settings.recovery.description')}
					</p>

					<form onsubmit={setupAccountRecovery} class="space-y-4">
						<div class="form-control">
							<label class="label" for="recovery-email">
								<span class="label-text font-semibold">{$t('settings.recovery.email-label')}</span>
							</label>
							<input
								type="email"
								id="recovery-email"
								bind:value={recoveryEmail}
								class="input input-bordered w-full {emailError ? 'input-error' : ''}"
								placeholder={$t('settings.recovery.email.placeholder')}
								required
								disabled={recoveryLoading}
							/>
							{#if emailError}
								<label class="label" for="recovery-email">
									<span class="label-text-alt text-error">{emailError}</span>
								</label>
							{/if}
						</div>

						<div class="form-control">
							{#if recoveryPassword && recoveryPassword.split(' ').length === 4}
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
									<span class="text-sm">{$t('settings.recovery.generated_password_note')}</span>
								</div>
							{/if}
							<label class="label" for="recovery-password">
								<span class="label-text font-semibold"
									>{$t('settings.recovery.password-label')}</span
								>
							</label>
							<div class="relative">
								<input
									type={showRecoveryPassword ? 'text' : 'password'}
									id="recovery-password"
									bind:value={recoveryPassword}
									oninput={(e) => {
										updatePasswordStrength(e);
										validatePasswordMatch();
									}}
									class="input input-bordered w-full pr-28 {passwordError || passwordMismatchError
										? 'input-error'
										: ''}"
									placeholder={$t('settings.recovery.password.placeholder')}
									required
									disabled={recoveryLoading}
								/>
								<button
									type="button"
									class="absolute inset-y-0 right-12 flex items-center pr-3"
									onclick={() => (showRecoveryPassword = !showRecoveryPassword)}
									disabled={recoveryLoading}
									title={showRecoveryPassword ? 'Hide password' : 'Show password'}
								>
									{#if showRecoveryPassword}
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
								<button
									type="button"
									class="absolute inset-y-0 right-24 flex items-center pr-3"
									onclick={handleGeneratePassword}
									disabled={recoveryLoading}
									title="Generate secure password"
									aria-label="Generate secure password"
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
											d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
										/>
									</svg>
								</button>
								<button
									type="button"
									class="absolute inset-y-0 right-0 flex items-center pr-3"
									onclick={() => _copyToClipboard(recoveryPassword, 'recovery')}
									disabled={!recoveryPassword || recoveryLoading}
									title="Copy password to clipboard"
								>
									{#if copySuccess === 'recovery'}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-success h-5 w-5"
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
											class="h-5 w-5"
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
						</div>

						<div class="form-control">
							<label class="label" for="confirm-recovery-password">
								<span class="label-text font-semibold"
									>{$t('settings.recovery.confirmPassword-label')}</span
								>
							</label>
							<div class="relative">
								<input
									type={showConfirmRecoveryPassword ? 'text' : 'password'}
									id="confirm-recovery-password"
									bind:value={confirmRecoveryPassword}
									oninput={validatePasswordMatch}
									class="input input-bordered w-full pr-20 {passwordError || passwordMismatchError
										? 'input-error'
										: ''}"
									placeholder={$t('settings.recovery.confirmPassword.placeholder')}
									required
									disabled={recoveryLoading}
								/>
								<button
									type="button"
									class="absolute inset-y-0 right-12 flex items-center pr-3"
									onclick={() => (showConfirmRecoveryPassword = !showConfirmRecoveryPassword)}
									disabled={recoveryLoading}
									title={showConfirmRecoveryPassword ? 'Hide password' : 'Show password'}
								>
									{#if showConfirmRecoveryPassword}
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
								<button
									type="button"
									class="absolute inset-y-0 right-0 flex items-center pr-3"
									onclick={() => _copyToClipboard(confirmRecoveryPassword, 'confirm')}
									disabled={!confirmRecoveryPassword || recoveryLoading}
									title="Copy password to clipboard"
								>
									{#if copySuccess === 'confirm'}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-success h-5 w-5"
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
											class="h-5 w-5"
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
								<label class="label" for="confirm-recovery-password">
									<span class="label-text-alt text-error">{passwordMismatchError}</span>
								</label>
							{:else if passwordError}
								<label class="label" for="confirm-recovery-password">
									<span class="label-text-alt text-error">{passwordError}</span>
								</label>
							{/if}

							{#if recoveryPassword && recoveryPassword.length >= 12}
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
											{$t(`settings.recovery.password_strength.${passwordStrength}`)}
										</span>
									</div>
								</div>
							{/if}
						</div>

						<div class="flex justify-end pt-4">
							<button
								type="submit"
								class="btn btn-primary"
								disabled={recoveryLoading ||
									!recoveryEmail ||
									!recoveryPassword ||
									!confirmRecoveryPassword}
							>
								{#if recoveryLoading}
									<span class="loading loading-spinner loading-sm"></span>
									{$t('settings.recovery.setting')}
								{:else}
									{$t('settings.recovery.setup')}
								{/if}
							</button>
						</div>
					</form>

					{#if recoverySuccess}
						<div class="alert alert-success alert-outline mb-4">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span>{recoverySuccess}</span>
						</div>
					{/if}

					{#if recoveryError}
						<div class="alert alert-error alert-outline mb-4">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span>{recoveryError}</span>
						</div>
					{/if}

					<div class="alert alert-info alert-outline mt-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
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
						<div class="text-sm">
							<p class="font-semibold">{$t('settings.recovery.notice.title')}</p>
							<p>
								{$t('settings.recovery.notice.description')}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
