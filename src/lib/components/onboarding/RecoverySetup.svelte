<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { validateEmail, validatePassword } from '$lib/utils/helpers/validators';
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

    // Autofocus email when enabling recovery
    let recoveryEmailInput = $state<HTMLInputElement | null>(null);

	// Error states
	let emailError = $state('');
	let passwordError = $state('');

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
			<div class="step-indicator text-primary mb-2 text-sm font-medium text-end">Step 4 of 7 — Optional</div>
			<h3 class="step-title mb-3 mt-4">Create Recovery Password</h3>
			<h5 class="mb-3">Add a safe backup for account access</h5>
			<p class="step-description text-base-content mb-6 text-lg">
				Set up a recovery method to regain access if you lose your device. This is optional but highly recommended for account security.
			</p>

			<!-- Features List (aligned with Nostr import styling) -->
			<div class="features-list mb-6 space-y-2 text-left mx-auto max-w-xl">
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
			</div>

			<p class="text-primary mb-6 text-lg">Optional, but highly recommended.</p>
		</div>

		<form onsubmit={handleSubmit} class="space-y-4">
			<!-- Recovery Password Option -->
			<div class="form-control">
				<label class="label flex cursor-pointer items-center justify-start gap-2">
					<input type="checkbox" bind:checked={enableRecovery} class="checkbox checkbox-sm" />
					<span class="label-text">Create recovery password</span>
				</label>
				{#if !enableRecovery}
					<div
						class="alert alert-warning alert-outline mt-4 rounded-2xl text-sm"
						in:fly={{ duration: 200, y: -20, easing: linear }}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<p>
							<span class="font-bold">Optional but recommended.</span>
							<br />
							<span>
								If you lose access to your device, you'll be able to recover your account.
							</span>
						</p>
					</div>
				{/if}
			</div>

			{#if enableRecovery}
				<div class="space-y-4" in:fly={{ duration: 200, y: -20, easing: linear }}>
					<!-- Recovery Email Field -->
					<div class="form-control">
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

					<div
						class="alert alert-warning mt-4 rounded-2xl text-sm"
						in:fly={{ duration: 200, y: -20, easing: linear }}
					>
						<p>
							<span class="flex items-center justify-center gap-2 font-bold">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-6 w-6 shrink-0"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/>
								</svg>
								You will only be able to recover your account via email.
							</span>
							<br />
							<span>
								If you lose access to your email, you will not be able to recover your account in
								the event that you lose access to your primary login method.
							</span>
						</p>
					</div>

					<!-- Recovery Password Field -->
					<div class="form-control">
						<label class="label" for="password">
							<span class="label-text">Recovery Password</span>
						</label>
						<div class="relative">
							<input
								type={showPassword ? 'text' : 'password'}
								id="password"
								bind:value={recoveryPassword}
								class="input input-bordered w-full pr-10 {passwordError ? 'input-error' : ''}"
								placeholder="Create a strong password"
								required={enableRecovery}
							/>
							<button
								type="button"
								class="absolute inset-y-0 right-0 flex items-center pr-3"
								onclick={() => (showPassword = !showPassword)}
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
					</div>

					<!-- Confirm Password Field -->
					<div class="form-control">
						<label class="label" for="confirmPassword">
							<span class="label-text">Confirm Recovery Password</span>
						</label>
						<input
							type={showPassword ? 'text' : 'password'}
							id="confirmPassword"
							bind:value={confirmPassword}
							class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
							placeholder="Confirm your password"
							required={enableRecovery}
						/>
						{#if passwordError}
							<label class="label" for="confirmPassword">
								<span class="label-text-alt text-error">{passwordError}</span>
							</label>
						{/if}
					</div>

					<!-- Password Guidelines -->
					{#if recoveryPassword}
						<p class="mt-2 text-sm" in:fly={{ duration: 200, y: -20, easing: linear }}>
							Your password should be at least
							<span class={recoveryPassword.length >= 8 ? 'text-success font-medium' : ''}>
								8 characters
							</span>, include
							<span class={/[A-Z]/.test(recoveryPassword) ? 'text-success font-medium' : ''}>
								uppercase
							</span>,
							<span class={/[a-z]/.test(recoveryPassword) ? 'text-success font-medium' : ''}>
								lowercase
							</span>,
							<span class={/[0-9]/.test(recoveryPassword) ? 'text-success font-medium' : ''}>
								numbers
							</span>, and
							<span
								class={/[!@#$%^&*(),.?":{}|<>]/.test(recoveryPassword)
									? 'text-success font-medium'
									: ''}
							>
								special characters
							</span>.
						</p>
					{/if}
				</div>
			{/if}

			<!-- Form Actions -->
			<div class="mt-6 flex justify-between">
				<button type="button" class="btn btn-outline" onclick={prevStep}>Back</button>
				<button type="submit" class="btn btn-primary">Next</button>
			</div>
		</form>
	</div>
</div>
