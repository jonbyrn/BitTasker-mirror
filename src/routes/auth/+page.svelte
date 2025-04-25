<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import { user } from '$lib/stores/user.store';
	import { authState } from '$lib/stores/auth.store';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { bytesToHex } from '$lib/utils/helpers/encoding';
	import { getDeviceIdentifier, getDeviceName } from '$lib/utils/helpers/deviceIdentity';
	import {
		checkBiometricAvailability,
		getBiometricData,
		setBiometricKey
	} from '$lib/utils/helpers/biometrics';
	import {
		signLoginChallenge,
		decryptNsecWithBiometrics,
		encryptNsec
	} from '$lib/utils/helpers/auth';
	import {
		checkWebBiometricAvailability,
		getWebBiometricData,
		setWebBiometricKey,
		verifyIdentity
	} from '$lib/utils/helpers/webBiometrics';
	import authService from '$lib/api/services/auth.service';
	import Alby from '$lib/components/AuthProviders/Alby.svelte';
	import BottomNavBar from '$lib/components/NavBar.svelte';
	import type { Credentials } from '$lib/types/auth';

	let error = $state('');
	let isLoading = $state(false);
	let authMethods = $state({
		biometric: false,
		webAuthn: false
	});

	onMount(async () => {
		try {
			// Check available authentication methods
			authMethods.biometric = await checkBiometricAvailability();
			authMethods.webAuthn = await checkWebBiometricAvailability();
		} catch (err) {
			console.error('Error checking authentication methods:', err);
		}
	});

	async function generateKeyPair() {
		const sk = generateSecretKey();
		const npub = getPublicKey(sk);
		const nsec = bytesToHex(sk);
		return { npub, nsec };
	}

	/**
	 * Register a new user with biometric authentication
	 */
	async function register(deviceId: string) {
		// Generate a new Nostr keypair
		const { npub, nsec } = await generateKeyPair();

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
		const response = await authService.registerPasskeyDevice(npub, deviceId, deviceName);

		// Store encryption data with biometrics
		let success = false;
		if (authMethods.biometric) {
			success = await setBiometricKey(npub, {
				key: exportedKey,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				data: encrypted.data,
				salt
			});
		} else if (authMethods.webAuthn) {
			success = await setWebBiometricKey(npub, {
				key: exportedKey,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				data: encrypted.data,
				salt
			});
		}

		if (!success) {
			throw new Error('Failed to set up biometric authentication');
		}

		if (response.userId && response.deviceId) {
			// Generate a random one-time token for recovery
			const tempToken = crypto.getRandomValues(new Uint8Array(32));
			const tempTokenHex = Array.from(tempToken)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');

			// Store nsec temporarily with the token
			await Preferences.set({
				key: tempTokenHex,
				value: nsec
			});

			// Clean up after 5 minutes
			setTimeout(
				async () => {
					await Preferences.remove({ key: tempTokenHex });
				},
				5 * 60 * 1000
			);

			goto(`/auth/recover?provider=passkey&npub=${npub}&token=${tempTokenHex}`);
		}
	}

	/**
	 * Login with biometric authentication
	 */
	async function login(pubKey: string, encryptedKey: string, deviceId: string) {
		// Get login challenge from server
		const { challenge } = await authService.getLoginChallenge();

		// Decrypt private key using biometrics
		const privateKey = await decryptNsecWithBiometrics(encryptedKey);

		// Sign the challenge with the private key
		const signedChallenge = await signLoginChallenge(challenge, privateKey);
		if (!signedChallenge) {
			throw new Error('Failed to sign login challenge');
		}

		// Login with passkey
		const response = await authService.loginWithPasskey(pubKey, deviceId);

		if (!response.access_token) {
			throw new Error('No access token received from server');
		}

		// Store access token securely
		await Preferences.set({
			key: StorageKeys.ACCESS_TOKEN,
			value: response.access_token
		});

		// Update user state and navigate to dashboard
		user.updateProfile(response.user);
		authState.login();
		goto('/dashboard');
	}

	async function authenticate() {
		try {
			isLoading = true;
			error = '';

			const deviceId = await getDeviceIdentifier();
			let biometricData: Credentials | null = null;

			if (authMethods.biometric) {
				biometricData = await getBiometricData();
			} else if (authMethods.webAuthn) {
				biometricData = await getWebBiometricData();
			}

			if (!biometricData) {
				// Registration flow
				await register(deviceId);
			} else {
				// Login flow
				await login(biometricData.username, biometricData.password, deviceId);
			}
		} catch (err: unknown) {
			console.error('Authentication failed:', err);
			error = err instanceof Error ? err.message : 'Authentication failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex min-h-screen items-center justify-center px-4">
	<BottomNavBar />
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Login to BitTasker</h2>

			<div class="flex flex-col gap-3">
				{#if authMethods.biometric}
					<button class="btn btn-outline w-full" onclick={authenticate} disabled={isLoading}>
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
						{isLoading ? 'Processing...' : 'Continue with Biometrics'}
					</button>
				{/if}

				{#if authMethods.webAuthn}
					<button class="btn btn-outline w-full" onclick={authenticate} disabled={isLoading}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="size-4"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
							/>
						</svg>
						{isLoading ? 'Processing...' : 'Continue with Passkey'}
					</button>
				{/if}

				{#if !authMethods.biometric}
					<Alby />
				{/if}

				{#if error}
					<div class="alert alert-error mt-4">
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

				<div class="divider"></div>

				<div class="flex items-center justify-center text-center">
					<span class="text-sm text-gray-500">Lost your account?</span>
					<button class="btn btn-link h-fit" onclick={() => goto('/auth/recover/send')}>
						Recover Account
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
