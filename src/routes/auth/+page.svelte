<script lang="ts">
	import type { LoginResponse, ApiResponse } from '$lib/types/auth';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { validateEmail, validatePassword } from '$lib/utils/helpers/validators';
	import {
		checkBiometricAvailability,
		getBiometricData,
		setBiometricKey
	} from '$lib/utils/helpers/biometrics';
	import {
		getLoginChallenge,
		loginWithCredentials,
		loginWithNostr,
		registerWithNostr
	} from '$lib/services/auth.service';
	import {
		signLoginChallenge,
		decryptPrivateKeyWithBiometrics,
		decryptPrivateKeyWithPassword,
		encryptNostrPrivateKeyWithPassword
	} from '$lib/utils/helpers/auth';
	import { bytesToBase64, bytesToHex } from '$lib/utils/helpers/encoding';
	import { encrypt, exportKey, generateRandomKey } from '$lib/utils/helpers/crypto';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

	let email: string = $state('');
	let password: string = $state('');
	let confirmPassword: string = $state('');
	let error: string = $state('');
	let emailError: string = $state('');
	let passwordError: string = $state('');
	let isLoading: boolean = $state(false);
	let isBiometricAvailable: boolean = $state(false);
	let isLogin = $state(true);

	onMount(async () => {
		isBiometricAvailable = await checkBiometricAvailability();
	});

	async function register() {
		try {
			emailError = '';
			passwordError = '';
			error = '';

			if (password !== confirmPassword) {
				passwordError = 'Passwords do not match';
				return;
			}

			const sk = generateSecretKey();
			const pk = getPublicKey(sk);
			const npriv = bytesToHex(sk);
			const { encrypted, salt } = await encryptNostrPrivateKeyWithPassword(npriv, password);

			const res = await registerWithNostr({
				email,
				publicKey: pk,
				encryptedPrivateKey: encrypted.data,
				iv: encrypted.iv,
				salt: salt,
				authTag: encrypted.authTag,
				iterations: 100000
			});

			console.log({ res });
		} catch (err) {
			if (err instanceof Error) {
				if (err.message.includes('email')) {
					emailError = err.message;
				} else {
					error = err.message;
				}
			} else {
				error = 'An error occurred during signup';
			}
		} finally {
			isLoading = false;
		}
	}

	async function login() {
		try {
			isLoading = true;
			emailError = '';
			passwordError = '';
			error = '';

			const response = (await loginWithCredentials(email, password)) as ApiResponse<LoginResponse>;
			const keyData = response.data;

			// Decrypt private key with password
			await decryptPrivateKeyWithPassword(
				keyData.publicKey,
				keyData.encryptedPrivateKey,
				keyData.iv,
				keyData.authTag,
				password,
				100000 // Default PBKDF2 iterations for key derivation
			);

			goto('/profile');
		} catch (err: any) {
			if (err.status === 401) {
				error = 'Invalid email or password';
			} else if (err.status === 400) {
				if (err.message?.toLowerCase().includes('email')) {
					emailError = err.message;
				} else if (err.message?.toLowerCase().includes('password')) {
					passwordError = err.message;
				} else {
					error = err.message || 'Bad Request';
				}
			} else {
				error = err instanceof Error ? err.message : 'Unknown error';
			}
		} finally {
			isLoading = false;
		}
	}

	function handleSubmit(event: Event) {
		event.preventDefault();
		emailError = '';
		passwordError = '';
		error = '';

		const emailValidation = validateEmail(email);
		const passwordValidation = validatePassword(password);

		if (!emailValidation.isValid) {
			emailError = emailValidation.error!;
			return;
		}

		if (!passwordValidation.isValid) {
			passwordError = passwordValidation.error!;
			return;
		}

		if (!isLogin) {
			register();
		} else {
			login();
		}
	}

	async function handleBiometricAuth() {
		try {
			isLoading = true;
			error = '';

			const biometricData = await getBiometricData();

			if (!biometricData) {
				const sk = generateSecretKey();
				const pk = getPublicKey(sk);
				const privateKeyHex = bytesToHex(sk);
				const encryptionKey = await generateRandomKey();
				const encryptedData = await encrypt(privateKeyHex, encryptionKey);
				const exportedKey = await exportKey(encryptionKey);
				const saltBytes = crypto.getRandomValues(new Uint8Array(16));

				await registerWithNostr({
					email: 'biometrics3@biometrics.com',
					publicKey: pk,
					encryptedPrivateKey: encryptedData.data,
					iv: encryptedData.iv,
					authTag: encryptedData.authTag,
					salt: bytesToBase64(saltBytes),
					iterations: 100000,
					authMethod: 'passkey'
				});

				const success = await setBiometricKey(pk, {
					key: exportedKey,
					iv: encryptedData.iv,
					authTag: encryptedData.authTag,
					data: encryptedData.data
				});

				if (!success) {
					error = 'Failed to set up biometric authentication';
					return;
				}

				goto('/profile');
			} else {
				const { username: pubKey, password: encryptedKey } = biometricData;
				const { challenge } = await getLoginChallenge();
				const privateKey = await decryptPrivateKeyWithBiometrics(encryptedKey);
				const signedChallenge = await signLoginChallenge(challenge, privateKey);
				await loginWithNostr(pubKey, challenge, signedChallenge);
				goto('/profile');
			}
		} catch (err: unknown) {
			console.error('Biometric auth failed:', err);
			error = err instanceof Error ? err.message : 'Biometric authentication failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex min-h-screen items-center justify-center px-4">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Login to BitTasker</h2>

			<form onsubmit={handleSubmit} class="space-y-4">
				<!-- Email Input -->
				<div class="form-control space-y-2">
					<label class="label" for="email">
						<span class="label-text">Email</span>
					</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						placeholder="user@example.com"
						class="input input-bordered w-full {emailError ? 'input-error' : ''}"
						onblur={() => {
							const validation = validateEmail(email);
							emailError = validation.error || '';
						}}
						required
					/>
					{#if emailError}
						<span class="text-error text-sm">{emailError}</span>
					{/if}
				</div>

				<!-- Password Input -->
				<div class="form-control space-y-2">
					<label class="label" for="password">
						<span class="label-text">Password</span>
					</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						placeholder="Enter your password"
						class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
						onblur={() => {
							const validation = validatePassword(password);
							passwordError = validation.error || '';
						}}
					/>
					{#if passwordError}
						<span class="text-error text-sm">{passwordError}</span>
					{/if}
				</div>

				{#if !isLogin}
					<!-- Confirm Password Input -->
					<div class="form-control space-y-2">
						<label class="label" for="confirmPassword">
							<span class="label-text">Confirm Password</span>
						</label>
						<input
							type="password"
							id="confirmPassword"
							bind:value={confirmPassword}
							placeholder="Confirm your password"
							class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
						/>
					</div>
				{/if}

				<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{:else}
						{isLogin ? 'Login' : 'Sign Up'}
					{/if}
				</button>

				{#if error}
				<div class="alert alert-error">
					<span>{error}</span>
				</div>
			{/if}
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
					{isLoading ? 'Loading...' : 'Continue with Biometrics'}
				</button>
			{/if}

			<div class="mt-4 text-center">
				<button class="text-primary cursor-pointer" onclick={() => (isLogin = !isLogin)}>
					{isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
				</button>
			</div>
		</div>
	</div>
</div>
