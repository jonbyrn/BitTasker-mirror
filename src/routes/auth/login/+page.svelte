<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isValidEmail } from '$lib/utils/helpers/validators';
	import { checkBiometricAvailability, verifyIdentity } from '$lib/utils/helpers/biometrics';
	import {
		getEncryptedNostrKey,
		getLoginChallenge,
		loginWithNostr
	} from '$lib/services/auth.service';
	import {
		decryptPrivateKeyWithBiometrics,
		decryptPrivateKeyWithPassword,
		signLoginChallenge
	} from '$lib/utils/helpers/auth';

	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let isBiometricAvailable = $state(false);
	let isLoading = $state(false);
	let error = $state('');

	onMount(async () => {
		isBiometricAvailable = await checkBiometricAvailability();
	});

	function handleEmailSubmit(e: Event) {
		e.preventDefault();
		if (!isValidEmail(email)) {
			error = 'Please enter a valid email';
			return;
		}
		showPassword = true;
	}

	async function handlePasswordSubmit(e: Event) {
		e.preventDefault();
		try {
			isLoading = true;
			error = '';

			// Get encrypted key data from API
			const keyData = await getEncryptedNostrKey(email);

			// Decrypt private key with password
			const privateKey = await decryptPrivateKeyWithPassword(
				keyData.publicKey,
				keyData.encryptedPrivateKey,
				keyData.iv,
				keyData.authTag,
				password,
				100000 // Default PBKDF2 iterations for key derivation
			);

			// Get login challenge
			const { challenge } = await getLoginChallenge(email);

			// Sign challenge with private key
			const signedChallenge = await signLoginChallenge(challenge, privateKey);

			// Login with signed challenge
			const { token } = await loginWithNostr(email, signedChallenge);

			// Store token and redirect
			localStorage.setItem('token', token);
			goto('/dashboard');
		} catch (err) {
			error = 'Invalid email or password';
			console.error(err);
		} finally {
			isLoading = false;
		}
	}

	async function handleBiometricAuth() {
		try {
			isLoading = true;
			error = '';

			// Verify biometric identity
			const verified = await verifyIdentity();
			if (!verified) {
				error = 'Biometric verification failed';
				return;
			}

			// Get encrypted key data from API
			const keyData = await getEncryptedNostrKey(email);
			if (!keyData.useBiometrics) {
				error = 'This account is not set up for biometric login';
				return;
			}

			// Decrypt private key with biometrics
			const privateKey = await decryptPrivateKeyWithBiometrics(
				keyData.publicKey,
				keyData.encryptedPrivateKey,
				keyData.iv,
				keyData.authTag
			);

			// Get login challenge
			const { challenge } = await getLoginChallenge(email);

			// Sign challenge with private key
			const signedChallenge = await signLoginChallenge(challenge, privateKey);

			// Login with signed challenge
			const { token } = await loginWithNostr(email, signedChallenge);

			// Store token and redirect
			localStorage.setItem('token', token);
			goto('/dashboard');
		} catch (err) {
			error = 'Biometric authentication failed';
			console.error(err);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex min-h-screen items-center justify-center px-4">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Login to BitTasker</h2>

			{#if error}
				<div class="alert alert-error mb-4">
					<span>{error}</span>
				</div>
			{/if}

			{#if !showPassword}
				<form onsubmit={handleEmailSubmit} class="space-y-4">
					<div class="form-control">
						<label class="label" for="email">
							<span class="label-text">Email</span>
						</label>
						<input
							type="email"
							id="email"
							bind:value={email}
							placeholder="Enter your email"
							class="input input-bordered w-full"
							required
						/>
					</div>

					<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
						{#if isLoading}
							<span class="loading loading-spinner"></span>
						{/if}
						Continue
					</button>
				</form>
			{:else}
				<form onsubmit={handlePasswordSubmit} class="space-y-4">
					<div class="form-control">
						<label class="label" for="password">
							<span class="label-text">Password</span>
						</label>
						<input
							type="password"
							id="password"
							bind:value={password}
							placeholder="Enter your password"
							class="input input-bordered w-full"
							required
						/>
					</div>

					<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
						{#if isLoading}
							<span class="loading loading-spinner"></span>
						{/if}
						Login
					</button>

					{#if isBiometricAvailable}
						<div class="divider">OR</div>

						<button
							type="button"
							class="btn btn-outline w-full"
							onclick={handleBiometricAuth}
							disabled={isLoading}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="size-6"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33"
								/>
							</svg>
							Continue with Biometric
						</button>
					{/if}
				</form>
			{/if}

			<div class="mt-4 text-center">
				<a class="link link-primary" href="/auth/register" data-sveltekit-reload="off">
					Don't have an account? Sign up
				</a>
			</div>
		</div>
	</div>
</div>
