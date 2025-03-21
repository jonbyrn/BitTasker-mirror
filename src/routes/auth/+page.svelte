<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { bytesToHex } from '@noble/hashes/utils';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { isValidEmail, validatePassword } from '$lib/utils/helpers/validators';
	import {
		checkBiometricAvailability,
		verifyIdentity,
		setBiometricKey
	} from '$lib/utils/helpers/biometrics';
	import {
		encrypt,
		generateRandomKey,
		exportKey,
		type EncryptedData
	} from '$lib/utils/helpers/crypto';
	import {
		registerWithNostr,
		getEncryptedNostrKey,
		getLoginChallenge,
		loginWithNostr
	} from '$lib/services/auth.service';
	import {
		decryptPrivateKeyWithBiometrics,
		decryptPrivateKeyWithPassword,
		signLoginChallenge
	} from '$lib/utils/helpers/auth';
	import { bytesToBase64 } from '$lib/utils/helpers/encoding';

	let isLogin = $state(true);
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let name = $state('');
	let isBiometricAvailable = $state(false);
	let useBiometrics = $state(false);
	let isLoading = $state(false);
	let error = $state('');

	onMount(async () => {
		isBiometricAvailable = await checkBiometricAvailability();
	});

	async function handleBiometricAuth() {
		try {
			isLoading = true;
			error = '';

			if (isLogin) {
				if (!isValidEmail(email)) {
					error = 'Please enter a valid email';
					return;
				}

				// Login with biometrics
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
			} else {
				// Register with biometrics
				useBiometrics = true;
				await handleSubmit();
			}
		} catch (err) {
			error = 'Biometric authentication failed';
			console.error(err);
		} finally {
			isLoading = false;
		}
	}
	async function handleSubmit(e: Event) {
		try {
			e.preventDefault();

	async function handleSubmit(e?: Event) {
		e?.preventDefault();

		try {
			isLoading = true;
			error = '';

			if (!isValidEmail(email)) {
				error = 'Please enter a valid email';
				return;
			}

			if (isLogin) {
				// Get encrypted key data from API
				const keyData = await getEncryptedNostrKey(email);
				if (keyData.useBiometrics) {
					error = 'Please use biometric login for this account';
					return;
				}

				// Decrypt private key with password
				const privateKey = await decryptPrivateKeyWithPassword(
					keyData.encryptedPrivateKey,
					keyData.iv,
					keyData.authTag,
					password,
					keyData.salt,
					keyData.iterations
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
				return;
			}

			// Registration
			if (!useBiometrics && (!password || password !== confirmPassword)) {
				error = 'Passwords do not match';
				return;
			}

			if (!useBiometrics) {
				const passwordValidation = validatePassword(password);
				if (!passwordValidation.isValid) {
					error = passwordValidation.error!;
					return;
				}
			}

			// Generate Nostr keypair
			const sk = generateSecretKey();
			const pk = getPublicKey(sk);
			const privateKeyHex = bytesToHex(sk);

			let encryptedData: EncryptedData;
			let salt: string;

			if (useBiometrics) {
				// Generate a random salt
				const saltBytes = crypto.getRandomValues(new Uint8Array(16));
				salt = bytesToBase64(saltBytes);

				// Biometric flow: encrypt with random key
				const encryptionKey = await generateRandomKey();
				encryptedData = await encrypt(privateKeyHex, encryptionKey);

				const exportedKey = await exportKey(encryptionKey);

				// Store encryption key with biometrics
				const success = await setBiometricKey(pk, exportedKey);

				if (!success) {
					error = 'Failed to set up biometric authentication';
					return;
				}
			} else {
				// Password flow: encrypt with password-derived key
				error = 'Password-based registration not yet implemented';
				return;
			}

			// Register with API
			await registerWithNostr({
				name,
				email,
				publicKey: pk,
				encryptedPrivateKey: encryptedData.data,
				iv: encryptedData.iv,
				authTag: encryptedData.authTag,
				useBiometrics,
				salt, // Salt is not needed but used for key derivation
				iterations: 100000 // Default iterations for PBKDF2
			});

			// Redirect to dashboard
			goto('/dashboard');
		} catch (err: any) {
			error = err.response?.data?.message || 'Registration failed';
			console.error(err);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex min-h-screen items-center justify-center px-4">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">
				{isLogin ? 'Login' : 'Sign Up'} to BitTasker
			</h2>

			{#if error}
				<div class="alert alert-error mb-4">
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

			<form onsubmit={handleSubmit} class="space-y-4">
				{#if !isLogin}
					<div class="form-control">
						<label class="label" for="name">
							<span class="label-text">Full Name</span>
						</label>
						<input
							type="text"
							id="name"
							bind:value={name}
							placeholder="Enter your name"
							class="input input-bordered w-full"
							required
						/>
					</div>
				{/if}

				<div class="form-control">
					<label class="label" for="email">
						<span class="label-text">Email</span>
					</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						placeholder="user@example.com"
						class="input input-bordered w-full"
						required
					/>
				</div>

				{#if !useBiometrics}
					<div class="form-control">
						<label class="label" for="password">
							<span class="label-text">Password</span>
						</label>
						<input
							type="password"
							id="password"
							bind:value={password}
							placeholder="password"
							class="input input-bordered w-full"
							required={!useBiometrics}
						/>
					</div>

					{#if !isLogin}
						<div class="form-control">
							<label class="label" for="confirmPassword">
								<span class="label-text">Confirm Password</span>
							</label>
							<input
								type="password"
								id="confirmPassword"
								bind:value={confirmPassword}
								placeholder="Confirm your password"
								class="input input-bordered w-full"
								required={!useBiometrics}
							/>
						</div>
					{/if}
				{/if}

				<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{:else}
						{isLogin ? 'Login' : 'Sign Up'}
					{/if}
				</button>
			</form>

			{#if isBiometricAvailable}
				<div class="divider">OR</div>
				<button class="btn btn-outline w-full" onclick={handleBiometricAuth} disabled={isLoading}>
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
					{isLogin ? 'Login' : 'Sign Up'} with Biometrics
				</button>
			{/if}

			<p class="mt-4 text-center">
				{isLogin ? "Don't have an account?" : 'Already have an account?'}
				<button
					class="link ml-1"
					onclick={() => {
						isLogin = !isLogin;
						error = '';
						useBiometrics = false;
					}}
				>
					{isLogin ? 'Sign Up' : 'Login'}
				</button>
			</p>
		</div>
	</div>
</div>
