<script lang="ts">
	import type { AccountRecoveryData } from '$lib/types/auth';
	import { nip19 } from 'nostr-tools';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { authState } from '$lib/stores/auth.store';
	import { encryptNsec } from '$lib/utils/helpers/auth';
	import { bytesToHex } from '$lib/utils/helpers/encoding';
	import { CheckUsernameAvailabilityStore } from '$houdini';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { setWebBiometricKey } from '$lib/utils/helpers/webBiometrics';
	import { getDeviceIdentifier, getDeviceName } from '$lib/utils/helpers/deviceIdentity';
	import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
	import {
		validateNostrPrivateKey,
		validateUsername,
		validatePassword,
		validateEmail
	} from '$lib/utils/helpers/validators';
	import authService from '$lib/api/services/auth.service';

	let {
		nextStep,
		prevStep
	}: {
		nextStep: () => void;
		prevStep: () => void;
	} = $props();

	// Create the store for username availability checking
	const usernameStore = new CheckUsernameAvailabilityStore();

	// User data
	let username = $state('');
	let nsec = $state('');
	let npub = $state('');
	let recoveryPassword = $state('');
	let confirmPassword = $state('');
	let recoveryEmail = $state('');
	let enableRecovery = $state(false);
	let importNostrKey = $state(false);

	// Status indicators
	let isLoading = $state(false);
	let isCheckingUsername = $state(false);
	let error = $state('');
	let usernameError = $state('');
	let nsecError = $state('');
	let passwordError = $state('');
	let emailError = $state('');
	let usernameAvailable = $state(false);

	// Password visibility
	let showPrivateKey = $state(false);
	let showPassword = $state(false);

	async function generateKeyPair() {
		const sk = generateSecretKey();
		const npub = getPublicKey(sk);
		const nsec = bytesToHex(sk);
		return { npub, nsec };
	}

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
				usernameError = 'Username is already taken';
			}
		} catch (err) {
			usernameError = 'Failed to check username availability';
			usernameAvailable = false;
		} finally {
			isCheckingUsername = false;
		}
	}

	/**
	 * Register a new user with biometric authentication
	 */
	async function register(username: string, npub: string, nsec: string) {
		try {
			isLoading = true;
			error = '';

			const deviceId = await getDeviceIdentifier();

			// Encrypt the private key with device ID as the password
			const { encrypted, salt, exportedKey, iterations } = await encryptNsec(nsec, deviceId);

			// Check available authentication methods
			const isMobileBiometrics = await checkBiometricAvailability();

			// Register device with server
			let credentialId = '';
			if (isMobileBiometrics) {
				credentialId = await setBiometricKey(npub, exportedKey, username);
			} else {
				credentialId = await setWebBiometricKey(npub, exportedKey, username);
			}

			if (!credentialId) {
				throw new Error('Failed to get credential ID');
			}

			// Register with server
			await authService.registerWithNostr({
				username,
				publicKey: npub,
				encryptedPrivateKey: encrypted.data,
				iv: encrypted.iv,
				salt: salt,
				authTag: encrypted.authTag,
				iterations,
				authMethod: 'passkey'
			});

			const deviceName = await getDeviceName();

			await authService.registerPasskeyDevice(npub, deviceId, deviceName, credentialId);

			const response = await authService.loginWithPasskey(npub, deviceId);
			if (response && response.access_token) {
				const biometricData = {
					username: npub,
					password: JSON.stringify({
						key: exportedKey,
						data: encrypted.data,
						iv: encrypted.iv,
						authTag: encrypted.authTag,
						salt
					}),
					server: deviceId
				};
				authState.setupAuthData(
					response.access_token,
					'passkey',
					npub,
					response.user,
					biometricData,
					false
				);
			}
		} catch (err: unknown) {
			console.error('Registration failed:', err);
			error = err instanceof Error ? err.message : 'Registration failed';
			throw new Error(error);
		} finally {
			isLoading = false;
		}
	}

	async function setupAccRecovery(npub: string, nsec: string, password: string, email: string) {
		try {
			isLoading = true;
			error = '';

			const { encrypted, salt, iterations } = await encryptNsec(nsec, password);

			const data: AccountRecoveryData = {
				publicKey: npub,
				recoveryPrivateKey: encrypted.data,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				salt: salt,
				iterations: iterations,
				email
			};

			await authService.setupAccountRecoveryPassword(data);
		} catch (err: unknown) {
			console.error('Failed to setup account recovery:', err);
			error = err instanceof Error ? err.message : 'Failed to setup account recovery';
			throw new Error(error);
		} finally {
			isLoading = false;
		}
	}

	// Debounce function
	function debounce(fn: (...args: any[]) => void, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<typeof fn>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';
			usernameError = '';
			nsecError = '';
			passwordError = '';
			emailError = '';

			// Validate username
			if (!username) {
				usernameError = 'Username is required';
				return;
			}

			if (!usernameAvailable) {
				await checkUsernameAvailability();
				if (!usernameAvailable) {
					usernameError = 'Username is already taken';
					return;
				}
			}

			const usernameValidation = validateUsername(username);
			if (!usernameValidation.isValid) {
				usernameError = usernameValidation.error!;
				return;
			}

			// If importing key, validate it and convert to hex
			if (importNostrKey) {
				const validation = validateNostrPrivateKey(nsec);
				if (!validation.isValid) {
					nsecError = validation.error!;
					return;
				}

				try {
					// Convert nsec to hex format
					const { type, data } = nip19.decode(nsec);
					if (type !== 'nsec') {
						nsecError = 'Invalid nsec format';
						return;
					}
					// Convert Uint8Array to hex
					nsec = bytesToHex(data);
					// Get public key
					npub = getPublicKey(data);
				} catch (err) {
					nsecError = 'Invalid private key';
					return;
				}
			} else {
				// Generate key pair
				({ npub, nsec } = await generateKeyPair());
			}

			// Validate recovery password if enabled
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

				const validation = validatePassword(recoveryPassword);
				if (!validation.isValid) {
					passwordError = validation.error!;
					return;
				}
			}

			await register(username, npub, nsec);
			if (enableRecovery) await setupAccRecovery(npub, nsec, recoveryPassword, recoveryEmail);

			// Go to the next step
			nextStep();
		} catch (err: unknown) {
			console.error('Account setup failed:', err);
			error = err instanceof Error ? err.message : 'Account setup failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body">
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
				<input
					type="text"
					id="username"
					bind:value={username}
					oninput={debounce(checkUsernameAvailability, 1000)}
					class="input input-bordered w-full {usernameError
						? 'input-error'
						: usernameAvailable && username
							? 'input-success'
							: ''}"
					placeholder="Choose a username"
					required
				/>
				{#if usernameError}
					<label class="label" for="username">
						<span class="label-text-alt text-error">{usernameError}</span>
					</label>
				{/if}
			</div>

			<!-- Nostr Key Import Option -->
			<div class="form-control">
				<label class="label flex cursor-pointer items-center justify-start gap-2">
					<input type="checkbox" bind:checked={importNostrKey} class="checkbox checkbox-sm" />
					<div class="flex items-center gap-2">
						<span class="label-text">Import Nostr Key (nsec)</span>
					</div>
				</label>
			</div>

			<!-- Private Key Field (Only shown if import is checked) -->
			{#if importNostrKey}
				<div class="form-control" in:fly={{ duration: 100, y: -20, easing: linear }}>
					<label class="label" for="privateKey">
						<span class="label-text">Private Key (nsec)</span>
					</label>
					<div class="relative">
						<input
							type={showPrivateKey ? 'text' : 'password'}
							id="privateKey"
							bind:value={nsec}
							class="input input-bordered w-full pr-10 {nsecError ? 'input-error' : ''}"
							placeholder="Enter your Nostr private key"
							required
						/>
						<button
							type="button"
							class="absolute inset-y-0 right-0 flex items-center pr-3"
							onclick={() => (showPrivateKey = !showPrivateKey)}
						>
							{#if showPrivateKey}
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
					{#if nsecError}
						<label class="label" for="privateKey">
							<span class="label-text-alt text-error">{nsecError}</span>
						</label>
					{/if}
				</div>
			{:else}
				<div
					class="alert alert-info alert-outline mt-2 rounded-2xl text-xs text-black"
					in:fly={{ duration: 100, y: -20, easing: linear }}
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
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>
						If you already have a private key on Nostr, you can import it here and use it. If not,
						we'll generate one for you.
					</span>
				</div>
			{/if}

			<!-- Recovery Password Option -->
			<div class="form-control">
				<label class="label flex cursor-pointer items-center justify-start gap-2">
					<input type="checkbox" bind:checked={enableRecovery} class="checkbox checkbox-sm" />
					<span class="label-text">Create recovery password</span>
				</label>
				{#if !enableRecovery}
					<div
						class="alert alert-warning alert-outline mt-4 rounded-2xl text-xs text-black"
						in:fly={{ duration: 100, y: -20, easing: linear }}
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
				<div class="space-y-4" in:fly={{ duration: 100, y: -20, easing: linear }}>
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
						class="alert alert-warning mt-4 rounded-2xl text-xs text-black"
						in:fly={{ duration: 100, y: -20, easing: linear }}
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
						<p class="mt-2" in:fly={{ duration: 100, y: -20, easing: linear }}>
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

			{#if error}
				<div class="alert alert-error whitespace-normal">
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
				<button type="button" class="btn btn-outline" onclick={prevStep}> Back </button>
				<button type="submit" class="btn btn-primary" disabled={isLoading || !usernameAvailable}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{/if}
					Next
				</button>
			</div>
		</form>
	</div>
</div>
