<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { validateEmail, validatePassword } from '$lib/utils/helpers/validators';
	import { generatePassword } from '$lib/utils/helpers/password';
	import { locale, t } from 'svelte-i18n';
	import IconCheck from '~icons/mdi/check-circle-outline';

	let {
		nextStep,
		prevStep,
		onRecoveryChange
	}: {
		nextStep: () => void;
		prevStep: () => void;
		onRecoveryChange: (email: string, password: string, enabled: boolean) => void;
	} = $props();

	// User data
	let recoveryEmail = $state('');
	let recoveryPassword = $state('');
	let confirmPassword = $state('');
	let enableRecovery = $state(false);
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	// Autofocus email when enabling recovery
	let recoveryEmailInput = $state<HTMLInputElement | null>(null);

	// Error states
	let emailError = $state('');
	let passwordError = $state('');

	// Generate password function
	function handleGeneratePassword() {
		const newPassword = generatePassword($locale || 'en');
		recoveryPassword = newPassword;
		confirmPassword = newPassword;
		passwordError = '';
	}

	// Copy password function
	async function handleCopyPassword() {
		try {
			await navigator.clipboard.writeText(recoveryPassword);
			// You could add a toast notification here if you want
		} catch (err) {
			console.error('Failed to copy password:', err);
		}
	}

	// Auto-generate password when recovery is enabled
	$effect(() => {
		if (enableRecovery) {
			handleGeneratePassword();
		}
	});

	function handleSubmit() {
		emailError = '';
		passwordError = '';

		// Validate recovery fields if enabled
		if (enableRecovery) {
			if (!recoveryEmail) {
				emailError = 'Recovery email is required';
				return;
			}

			const emailValidation = validateEmail(recoveryEmail);
			if (!emailValidation.isValid) {
				emailError = emailValidation.error!;
				return;
			}

			if (!recoveryPassword) {
				passwordError = 'Recovery password is required';
				return;
			}

			if (recoveryPassword !== confirmPassword) {
				passwordError = 'Passwords do not match';
				return;
			}

			const passwordValidation = validatePassword(recoveryPassword);
			if (!passwordValidation.isValid) {
				passwordError = passwordValidation.error!;
				return;
			}
		}

		// Update parent with recovery data
		onRecoveryChange(recoveryEmail, recoveryPassword, enableRecovery);
		nextStep();
	}

	// Update parent when checkbox changes
	$effect(() => {
		if (!enableRecovery) {
			recoveryEmail = '';
			recoveryPassword = '';
			confirmPassword = '';
			emailError = '';
			passwordError = '';
		}
		onRecoveryChange(recoveryEmail, recoveryPassword, enableRecovery);
	});

	// Focus email field when recovery is enabled
	$effect(() => {
		if (enableRecovery) {
			setTimeout(() => recoveryEmailInput?.focus(), 0);
		}
	});
</script>

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body">
		<!-- Educational Header -->
		<div class="education-header mb-6 text-center">
			<div class="step-indicator text-primary mb-2 text-end text-sm font-medium">
				Step 4 of 7 — Optional
			</div>
			<h3 class="step-title mt-4 mb-3">Create Recovery Password (Optional)</h3>
			<h5 class="mb-3">Add a safe backup for account access</h5>
			<p class="step-description text-base-content mx-auto mb-6 max-w-lg text-lg">
				Set up a recovery method to regain access if you lose your device.<br /><br />This is
				optional, but highly recommended for account security.
			</p>

			<!-- Features List (aligned with Nostr import styling) -->
			<div class="features-list mx-auto mb-6 w-fit space-y-2 text-left">
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span><strong>Secure</strong> — protected with a password only you know</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span><strong>Recoverable</strong> — regain access via your email</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span><strong>Optional</strong> — you can set this up later</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span><strong>Private</strong> — only you can decrypt your data</span>
				</div>

				<p class="text-primary mb-6 text-lg">Optional, but highly recommended.</p>
			</div>
		</div>

		<form onsubmit={handleSubmit} class="space-y-6">
			<!-- Recovery Password Option -->
			<div class="form-control mx-auto max-w-lg">
				<label class="label flex cursor-pointer items-center justify-start gap-2">
					<input type="checkbox" bind:checked={enableRecovery} class="checkbox checkbox-sm" />
					<span class="label-text">Create recovery password</span>
				</label>
			</div>

			{#if enableRecovery}
				<div class="space-y-6" in:fly={{ duration: 200, y: -20, easing: linear }}>
					<!-- Recovery Email Field -->
					<div class="form-control mx-auto max-w-lg">
						<label class="label" for="email">
							<div class="flex items-center gap-2">
								<span class="label-text">Recovery Email</span>
							</div>
						</label>
						<input
							type="email"
							id="email"
							bind:value={recoveryEmail}
							bind:this={recoveryEmailInput}
							class="input input-bordered w-full {emailError ? 'input-error' : ''}"
							placeholder="Enter your email address"
							required={enableRecovery}
						/>
						{#if emailError}
							<label class="label" for="email">
								<span class="label-text-alt text-error">{emailError}</span>
							</label>
						{/if}
					</div>

					<!-- Recovery Password Field -->
					<div class="form-control mx-auto max-w-lg">
						<label aria-label="Recovery Password" class="label" for="password">
							<span class="label-text">Recovery Password</span>
						</label>

						<!-- Password Input with Eye Icon and Generate Button in same row -->
						<div class="mb-3 flex gap-2">
							<div class="relative flex-1">
								<input
									type={showPassword ? 'text' : 'password'}
									id="password"
									bind:value={recoveryPassword}
									class="input input-bordered w-full pr-12 {passwordError ? 'input-error' : ''}"
									placeholder="Create a strong password"
									required={enableRecovery}
								/>
								<!-- Eye Icon -->
								<button
									type="button"
									class="text-base-content/70 hover:text-base-content absolute inset-y-0 right-0 flex items-center pr-3"
									onclick={() => (showPassword = !showPassword)}
									title={showPassword ? 'Hide password' : 'Show password'}
									aria-label={showPassword ? 'Hide password' : 'Show password'}
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

							<!-- Generate Button - Same row as input -->
							<button
								type="button"
								class="btn btn-outline btn-sm"
								onclick={handleGeneratePassword}
								title="Generate new 4-word password in {$locale === 'es' ? 'Spanish' : 'English'}"
								aria-label="Generate new 4-word password in {$locale === 'es'
									? 'Spanish'
									: 'English'}"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="mr-2 h-4 w-4"
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
							<span class="label-text">Confirm Recovery Password</span>
						</label>

						<!-- Confirm Password Input with Eye Icon and Copy Button in same row -->
						<div class="mb-3 flex gap-2">
							<div class="relative flex-1">
								<input
									type={showConfirmPassword ? 'text' : 'password'}
									id="confirmPassword"
									bind:value={confirmPassword}
									class="input input-bordered w-full pr-12 {passwordError ? 'input-error' : ''}"
									placeholder="Confirm your password"
									required={enableRecovery}
								/>
								<!-- Eye Icon -->
								<button
									type="button"
									class="text-base-content/70 hover:text-base-content absolute inset-y-0 right-0 flex items-center pr-3"
									onclick={() => (showConfirmPassword = !showConfirmPassword)}
									title={showConfirmPassword ? 'Hide password' : 'Show password'}
									aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
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
								class="btn btn-outline btn-sm"
								onclick={handleCopyPassword}
								title="Copy password to clipboard"
								disabled={!recoveryPassword}
								aria-label="Copy password to clipboard"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="mr-2 h-4 w-4"
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
							</button>
						</div>

						{#if passwordError}
							<label class="label" for="confirmPassword">
								<span class="label-text-alt text-error">{passwordError}</span>
							</label>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Form Actions -->
			<div class="mt-8 flex justify-between">
				<button type="button" class="btn btn-outline" onclick={prevStep}>Back</button>
				<button type="submit" class="btn btn-primary">Next</button>
			</div>
		</form>
	</div>
</div>
