<script lang="ts">
	import type { AccountRecoveryData } from '$lib/types/auth';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { bytesToHex } from '$lib/utils/helpers/encoding';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { setWebBiometricKey } from '$lib/utils/helpers/webBiometrics';
	import { encryptNsec, getNpubFromEncodedNsec } from '$lib/utils/helpers/auth';
	import { getDeviceIdentifier, getDeviceName } from '$lib/utils/helpers/deviceIdentity';
	import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
	import {
		validateNostrPrivateKey,
		validateUsername,
		validatePassword
	} from '$lib/utils/helpers/validators';
	import authService from '$lib/api/services/auth.service';

	let {
		nextStep,
		prevStep
	}: {
		nextStep: () => void;
		prevStep: () => void;
	} = $props();

	const method = page.url.searchParams.get('method');

	// User data
	let username = $state('');
	let nsec = $state('');
	let npub = $state('');
	let recoveryPassword = $state('');
	let confirmPassword = $state('');
	let enableRecovery = $state(false);

	// Status indicators
	let isLoading = $state(false);
	let isCheckingUsername = $state(false);
	let error = $state('');
	let usernameError = $state('');
	let nsecError = $state('');
	let passwordError = $state('');
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

	onMount(async () => {
		try {
			if (method === 'create') {
				({ npub, nsec } = await generateKeyPair());
			}
		} catch (err) {
			console.error('Error checking authentication methods:', err);
		}
	});

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
			// TODO: API call to check username availability would go here
			// Simulated for now
			await new Promise((resolve) => setTimeout(resolve, 500));
			usernameAvailable = true;
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
	async function register(npub: string, nsec: string) {
		try {
			isLoading = true;
			error = '';

			const deviceId = await getDeviceIdentifier();

			// Encrypt the private key with device ID as the password
			const { encrypted, salt, exportedKey, iterations } = await encryptNsec(nsec, deviceId);

			// Register with server
			await authService.registerWithNostr({
				publicKey: npub,
				encryptedPrivateKey: encrypted.data,
				iv: encrypted.iv,
				salt: salt,
				authTag: encrypted.authTag,
				iterations,
				authMethod: 'passkey'
			});

			// Register device with server
			const deviceName = await getDeviceName();
			await authService.registerPasskeyDevice(npub, deviceId, deviceName);

			// Check available authentication methods
			const isMobileBiometrics = await checkBiometricAvailability();

			// Store encryption data with biometrics
			let success = false;
			if (isMobileBiometrics) {
				success = await setBiometricKey(npub, {
					key: exportedKey,
					iv: encrypted.iv,
					authTag: encrypted.authTag,
					data: encrypted.data,
					salt
				});
			} else {
				success = await setWebBiometricKey(npub, {
					key: exportedKey,
					iv: encrypted.iv,
					authTag: encrypted.authTag,
					data: encrypted.data,
					salt
				});
			}

			if (!success) {
				console.error('Failed to set up biometric data');
				error = 'Failed to set up biometric data';
			}
		} catch (err: unknown) {
			console.error('Registration failed:', err);
			error = err instanceof Error ? err.message : 'Registration failed';
		} finally {
			isLoading = false;
		}
	}

	async function setupAccRecovery(npub: string, nsec: string, password: string) {
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
				iterations: iterations
			};

			await authService.setupAccountRecoveryPassword(data);
		} catch (err: unknown) {
			console.error('Failed to setup account recovery:', err);
			error = err instanceof Error ? err.message : 'Failed to setup account recovery';
		} finally {
			isLoading = false;
		}
	}

	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';
			usernameError = '';
			nsecError = '';
			passwordError = '';

			// Validate username
			if (!username) {
				usernameError = 'Username is required';
				return;
			}

			if (!usernameAvailable) {
				usernameError = 'Username is already taken';
				return;
			}

			const usernameValidation = validateUsername(username);
			if (!usernameValidation.isValid) {
				usernameError = usernameValidation.error!;
				return;
			}

			// Validate imported private key
			const validation = validateNostrPrivateKey(nsec);
			if (!validation.isValid) {
				nsecError = validation.error!;
				return;
			}

			// Get npub from nsec if not provided
			if (!npub) {
				npub = getNpubFromEncodedNsec(nsec);
			}

			await register(npub, nsec);

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

				await setupAccRecovery(npub, nsec, recoveryPassword);
			}

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

<div class="card bg-base-100 w-full shadow-xl" in:fly={{ duration: 100, x: 20, easing: linear }}>
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
				<div class="join w-full">
					<input
						type="text"
						id="username"
						bind:value={username}
						class="input input-bordered join-item flex-1 {usernameError
							? 'input-error'
							: usernameAvailable && username
								? 'input-success'
								: ''}"
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
			<div class="form-control">
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

			<!-- Recovery Password Option -->
			<div class="form-control space-y-2">
				<label class="label flex cursor-pointer items-center justify-start gap-2">
					<input type="checkbox" bind:checked={enableRecovery} class="checkbox checkbox-sm" />
					<span class="label-text">Create recovery password</span>
				</label>
				<span class="text-info/90 block text-xs">
					Optional but recommended. If you lose access to your device, you'll be able to recover
					your account.
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
				<button type="button" class="btn btn-outline" onclick={prevStep}> Back </button>
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
