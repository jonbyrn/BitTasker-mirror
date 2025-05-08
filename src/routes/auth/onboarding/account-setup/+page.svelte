<script lang="ts">
	import { goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { bytesToHex } from '$lib/utils/helpers/encoding';
	import { validateNostrPrivateKey, validateUsername, validatePassword } from '$lib/utils/helpers/validators';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import authService from '$lib/api/services/auth.service';

	// Account type
	let accountType = $state('create'); // 'create' or 'import'

	// User data
	let username = $state('');
	let privateKey = $state('');
	let recoveryPassword = $state('');
	let confirmPassword = $state('');
	let enableRecovery = $state(false);

	// Status indicators
	let isLoading = $state(false);
	let isCheckingUsername = $state(false);
	let error = $state('');
	let usernameError = $state('');
	let privateKeyError = $state('');
	let passwordError = $state('');
	let usernameAvailable = $state(false);

	// Password visibility
	let showPrivateKey = $state(false);
	let showPassword = $state(false);

	async function checkUsernameAvailability() {
		if (!username) {
			usernameError = 'Username is required';
			return;
		}

		const validation = validateUsername(username);
		if (!validation.isValid) {
			usernameError = validation.error!;
			return;
		}

		try {
			isCheckingUsername = true;
			usernameError = '';
			// API call to check username availability would go here
			// Simulated for now
			await new Promise(resolve => setTimeout(resolve, 500));
			usernameAvailable = true;
		} catch (err) {
			usernameError = 'Failed to check username availability';
			usernameAvailable = false;
		} finally {
			isCheckingUsername = false;
		}
	}

	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';
			usernameError = '';
			privateKeyError = '';
			passwordError = '';

			// Validate username
			if (!username) {
				usernameError = 'Username is required';
				return;
			}

			const usernameValidation = validateUsername(username);
			if (!usernameValidation.isValid) {
				usernameError = usernameValidation.error!;
				return;
			}

			// Validate or generate private key
			let npub;
			let nsec;

			if (accountType === 'import') {
				// Validate imported private key
				const validation = validateNostrPrivateKey(privateKey);
				if (!validation.isValid) {
					privateKeyError = validation.error!;
					return;
				}
				nsec = privateKey;
				// Get public key from private key
				// In a real implementation, you'd need to convert nsec to npub
				// This is a placeholder
				npub = 'dummy_npub_from_import';
			} else {
				// Generate new key pair
				const sk = generateSecretKey();
				npub = getPublicKey(sk);
				nsec = bytesToHex(sk);
			}

			// Validate recovery password if enabled
			if (enableRecovery) {
				if (!recoveryPassword) {
					passwordError = 'Recovery password is required';
					return;
				}

				if (recoveryPassword !== confirmPassword) {
					passwordError = 'Passwords do not match';
					return;
				}

				const validation = validatePassword(recoveryPassword);
				if (!validation.isValid) {
					passwordError = validation.error!;
					return;
				}
			}

			// Store the account data in session storage for the next steps
			await Preferences.set({
				key: StorageKeys.ONBOARDING_DATA,
				value: JSON.stringify({
					username,
					npub,
					nsec,
					recoveryEnabled: enableRecovery,
					recoveryPassword: enableRecovery ? recoveryPassword : null
				})
			});

			// Go to the next step
			goto('/auth/onboarding/profile-info');
		} catch (err: unknown) {
			console.error('Account setup failed:', err);
			error = err instanceof Error ? err.message : 'Account setup failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="flex min-h-[85vh] w-full flex-col items-center justify-center px-4 py-8">
	<div class="w-full max-w-md">
		<div class="mb-8 flex flex-col items-center justify-center">
			<img src="/logo.svg" alt="BitTasker" class="h-16 w-auto" />
			<h1 class="mt-4 text-center text-2xl font-bold">Account Setup</h1>
			<div class="mt-2 flex w-full justify-between">
				<div class="flex flex-col items-center">
					<div class="badge badge-primary">Step 1</div>
					<span class="mt-1 text-xs">Account</span>
				</div>
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 2</div>
					<span class="mt-1 text-xs">Profile</span>
				</div>
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 3</div>
					<span class="mt-1 text-xs">Location</span>
				</div>
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 4</div>
					<span class="mt-1 text-xs">Complete</span>
				</div>
			</div>
		</div>

		<div class="card bg-base-100 w-full shadow-xl">
			<div class="card-body">
				<div class="tabs mb-4 flex justify-center">
					<button 
						class={`tab tab-bordered ${accountType === 'create' ? 'tab-active' : ''}`}
						onclick={() => (accountType = 'create')}
					>
						Create new key
					</button>
					<button 
						class={`tab tab-bordered ${accountType === 'import' ? 'tab-active' : ''}`}
						onclick={() => (accountType = 'import')}
					>
						Import key
					</button>
				</div>

				<form onsubmit={handleSubmit} class="space-y-4">
					<!-- Username Field -->
					<div class="form-control">
						<label class="label" for="username">
							<span class="label-text">Username</span>
							{#if isCheckingUsername}
								<span class="label-text-alt loading loading-spinner loading-xs"></span>
							{:else if usernameAvailable && username}
								<span class="label-text-alt text-success">Available</span>
							{/if}
						</label>
						<div class="join w-full">
							<input
								type="text"
								id="username"
								bind:value={username}
								class="input input-bordered join-item flex-1 {usernameError ? 'input-error' : usernameAvailable && username ? 'input-success' : ''}"
								placeholder="Choose a username"
								required
							/>
							<button 
								type="button" 
								class="btn btn-neutral join-item" 
								onclick={checkUsernameAvailability}
								disabled={isCheckingUsername || !username}
							>
								Check
							</button>
						</div>
						{#if usernameError}
							<label class="label" for="username">
								<span class="label-text-alt text-error">{usernameError}</span>
							</label>
						{/if}
					</div>

					<!-- Private Key Field (Import Mode) -->
					{#if accountType === 'import'}
						<div class="form-control">
							<label class="label" for="privateKey">
								<span class="label-text">Private Key (nsec)</span>
							</label>
							<div class="relative">
								<input
									type={showPrivateKey ? 'text' : 'password'}
									id="privateKey"
									bind:value={privateKey}
									class="input input-bordered w-full pr-10 {privateKeyError ? 'input-error' : ''}"
									placeholder="Enter your Nostr private key"
									required
								/>
								<button
									type="button"
									class="absolute inset-y-0 right-0 flex items-center pr-3"
									onclick={() => (showPrivateKey = !showPrivateKey)}
								>
									{#if showPrivateKey}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
										</svg>
									{:else}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
										</svg>
									{/if}
								</button>
							</div>
							{#if privateKeyError}
								<label class="label" for="privateKey">
									<span class="label-text-alt text-error">{privateKeyError}</span>
								</label>
							{/if}
						</div>
					{/if}

					<!-- Recovery Password Option -->
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-2">
							<input type="checkbox" bind:checked={enableRecovery} class="checkbox checkbox-sm" />
							<span class="label-text">Create recovery password</span>
						</label>
						<span class="text-xs text-base-content/70">
							Optional but recommended. If you lose access to your device, you'll be able to recover your account.
						</span>
					</div>

					{#if enableRecovery}
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
								/>
								<button
									type="button"
									class="absolute inset-y-0 right-0 flex items-center pr-3"
									onclick={() => (showPassword = !showPassword)}
								>
									{#if showPassword}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
										</svg>
									{:else}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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
							/>
							{#if passwordError}
								<label class="label" for="confirmPassword">
									<span class="label-text-alt text-error">{passwordError}</span>
								</label>
							{/if}
						</div>

						<!-- Password Guidelines -->
						<div class="alert alert-info text-xs">
							<ul class="list-inside list-disc">
								<li>Use at least 8 characters</li>
								<li>Include numbers and special characters</li>
								<li>Avoid using personal information</li>
								<li>Store this password in a secure place</li>
							</ul>
						</div>
					{/if}

					{#if error}
						<div class="alert alert-error">
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
							<span>{error}</span>
						</div>
					{/if}

					<!-- Form Actions -->
					<div class="mt-6 flex justify-between">
						<button type="button" class="btn btn-outline" onclick={() => goto('/auth/signup')}>
							Back
						</button>
						<button type="submit" class="btn btn-primary" disabled={isLoading}>
							{#if isLoading}
								<span class="loading loading-spinner"></span>
							{/if}
							Next
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div> 