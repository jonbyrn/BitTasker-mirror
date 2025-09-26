<script lang="ts">
	import { t } from 'svelte-i18n';
	import { encryptRecoveryNsec } from '$lib/utils/helpers/auth';
	import { validateEmail, validatePassword } from '$lib/utils/helpers/validators';
	import { nip19 } from 'nostr-tools';
	import authService from '$lib/api/services/auth.service';

	let {
		nsec,
		npub,
		authMethod
	}: {
		nsec: string;
		npub: string;
		authMethod: string;
	} = $props();

	// Recovery setup state
	let recoveryLoading = $state(false);
	let recoveryError = $state('');
	let recoverySuccess = $state('');
	let recoveryEmail = $state('');
	let recoveryPassword = $state('');
	let confirmRecoveryPassword = $state('');
	let showRecoveryPassword = $state(false);
	let emailError = $state('');
	let passwordError = $state('');
	let copySuccess = $state('');

	async function copyToClipboard(text: string, type: 'npub' | 'nsec' | 'recovery' | 'confirm') {
		try {
			await navigator.clipboard.writeText(text);
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

		// Validate email using existing validator
		if (!recoveryEmail) {
			emailError = $t('settings.validation.emailRequired');
			return false;
		}

		const emailValidation = validateEmail(recoveryEmail);
		if (!emailValidation.isValid) {
			emailError = emailValidation.error!;
			return false;
		}

		// Validate password using existing validator
		if (!recoveryPassword) {
			passwordError = $t('settings.validation.passwordRequired');
			return false;
		}

		if (recoveryPassword !== confirmRecoveryPassword) {
			passwordError = $t('settings.validation.passwordMismatch');
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

		try {
			recoveryLoading = true;
			recoveryError = '';
			recoverySuccess = '';

			// Get current user's keys in proper format
			if (!nsec.startsWith('nsec') || !npub) {
				throw new Error($t('settings.error.invalidNostrKeys'));
			}

			// Extract hex format from npub for API (remove npub prefix and decode)
			const { data: publicKeyHex } = nip19.decode(npub);

			// Encrypt the nsec with the recovery password
			const { encrypted } = await encryptRecoveryNsec(nsec, recoveryPassword);

			const data = {
				publicKey: publicKeyHex as string,
				recoveryPrivateKey: encrypted,
				email: recoveryEmail
			};

			await authService.setupAccountRecoveryPassword(data);

			recoverySuccess = $t('settings.recovery.success');

			// Clear the form
			recoveryEmail = '';
			recoveryPassword = '';
			confirmRecoveryPassword = '';
		} catch (err: unknown) {
			console.error('Failed to setup account recovery:', err);
			recoveryError = err instanceof Error ? err.message : $t('settings.error.recoverySetup');
		} finally {
			recoveryLoading = false;
		}
	}
</script>

<!-- Account Recovery Section -->
{#if authMethod !== 'alby'}
	<div class="card bg-base-100 mb-6 shadow-xl">
		<div class="card-body">
			<div class="mb-1 flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<h4 class="card-title">{$t('settings.recovery.title')}</h4>
			</div>
			<p class="text-base-content/70 mb-6">
				{$t('settings.recovery.description')}
			</p>

			<form onsubmit={setupAccountRecovery} class="space-y-4">
				<!-- Recovery Email Field -->
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

				<!-- Recovery Password Field -->
				<div class="form-control">
					<label class="label" for="recovery-password">
						<span class="label-text font-semibold">{$t('settings.recovery.password-label')}</span>
					</label>
					<div class="relative">
						<input
							type={showRecoveryPassword ? 'text' : 'password'}
							id="recovery-password"
							bind:value={recoveryPassword}
							class="input input-bordered w-full pr-20 {passwordError ? 'input-error' : ''}"
							placeholder={$t('settings.recovery.password.placeholder')}
							required
							disabled={recoveryLoading}
						/>
						<!-- Copy Button -->
						<button
							type="button"
							class="absolute inset-y-0 right-0 flex items-center pr-3"
							onclick={() => copyToClipboard(recoveryPassword, 'recovery')}
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
						<!-- Show/Hide Password Button -->
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
					</div>
				</div>

				<!-- Confirm Recovery Password Field -->
				<div class="form-control">
					<label class="label" for="confirm-recovery-password">
						<span class="label-text font-semibold"
							>{$t('settings.recovery.confirmPassword-label')}</span
						>
					</label>
					<div class="relative">
						<input
							type={showRecoveryPassword ? 'text' : 'password'}
							id="confirm-recovery-password"
							bind:value={confirmRecoveryPassword}
							class="input input-bordered w-full pr-20 {passwordError ? 'input-error' : ''}"
							placeholder={$t('settings.recovery.confirmPassword.placeholder')}
							required
							disabled={recoveryLoading}
						/>
						<!-- Copy Button -->
						<button
							type="button"
							class="absolute inset-y-0 right-0 flex items-center pr-3"
							onclick={() => copyToClipboard(confirmRecoveryPassword, 'confirm')}
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
					{#if passwordError}
						<label class="label" for="confirm-recovery-password">
							<span class="label-text-alt text-error">{passwordError}</span>
						</label>
					{/if}
				</div>

				<!-- Password Guidelines -->
				{#if recoveryPassword}
					<div class="space-y-1 text-sm">
						<p class="font-medium">{$t('settings.recovery.requirements')}</p>
						<div class="flex flex-wrap gap-x-4 gap-y-1">
							<span class={recoveryPassword.length >= 8 ? 'text-success' : 'text-base-content/60'}>
								✓ {$t('settings.recovery.requirements.length')}
							</span>
							<span
								class={/[A-Z]/.test(recoveryPassword) ? 'text-success' : 'text-base-content/60'}
							>
								✓ {$t('settings.recovery.requirements.uppercase')}
							</span>
							<span
								class={/[a-z]/.test(recoveryPassword) ? 'text-success' : 'text-base-content/60'}
							>
								✓ {$t('settings.recovery.requirements.lowercase')}
							</span>
							<span
								class={/[0-9]/.test(recoveryPassword) ? 'text-success' : 'text-base-content/60'}
							>
								✓ {$t('settings.recovery.requirements.numbers')}
							</span>
							<span
								class={/[!@#$%^&*(),.?":{}|<>]/.test(recoveryPassword)
									? 'text-success'
									: 'text-base-content/60'}
							>
								✓ {$t('settings.recovery.requirements.special')}
							</span>
						</div>
					</div>
				{/if}

				<!-- Submit Button -->
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

			<!-- Security Notice -->
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
{/if}
