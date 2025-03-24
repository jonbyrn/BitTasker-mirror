<script lang="ts">
	import type { ApiResponse, AuthResponse, UserAuthData } from '$lib/types/auth';
	import type { UserType } from '$lib/types/user';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import {
		checkBiometricAvailability,
		getBiometricData,
		setBiometricKey
	} from '$lib/utils/helpers/biometrics';
	import { getLoginChallenge, loginWithNostr, registerWithNostr } from '$lib/services/auth.service';
	import { signLoginChallenge, decryptPrivateKeyWithBiometrics } from '$lib/utils/helpers/auth';
	import { bytesToBase64, bytesToHex } from '$lib/utils/helpers/encoding';
	import { encrypt, exportKey, generateRandomKey } from '$lib/utils/helpers/crypto';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { user, isProfileComplete } from '$lib/states/user.store';
	import Alby from '$lib/components/AuthProviders/Alby.svelte';
	import Google from '$lib/components/AuthProviders/Google.svelte';

	let error: string = $state('');
	let isLoading: boolean = $state(false);
	let isBiometricAvailable: boolean = $state(false);

	function transformUserData(authData: UserAuthData): UserType {
		return {
			id: authData.id.toString(),
			name: authData.name,
			email: authData.email,
			publicKey: authData.nostrKey?.publicKey || '',
			createdAt: new Date(authData.createdAt),
			updatedAt: new Date(authData.updatedAt)
		};
	}

	onMount(async () => {
		isBiometricAvailable = await checkBiometricAvailability();
	});

	async function handleBiometricAuth() {
		try {
			isLoading = true;
			error = '';

			const biometricData = await getBiometricData();

			if (!biometricData) {
				// Registration flow
				const sk = generateSecretKey();
				const pk = getPublicKey(sk);
				const privateKeyHex = bytesToHex(sk);
				const encryptionKey = await generateRandomKey();
				const encryptedData = await encrypt(privateKeyHex, encryptionKey);
				const exportedKey = await exportKey(encryptionKey);
				const saltBytes = crypto.getRandomValues(new Uint8Array(16));

				const response = (await registerWithNostr({
					publicKey: pk,
					encryptedPrivateKey: encryptedData.data,
					iv: encryptedData.iv,
					authTag: encryptedData.authTag,
					salt: bytesToBase64(saltBytes),
					iterations: 100000,
					authMethod: 'passkey'
				})) as ApiResponse<AuthResponse>;
				console.log({ response });

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

				if (!response.access_token) {
					error = 'No access token received from server';
					return;
				}

				// Store access token securely
				await Preferences.set({
					key: 'access_token',
					value: response.access_token
				});

				// Update user store with profile data
				const userData = response.data?.user;
				if (userData) {
					const transformedUser = transformUserData(userData);
					user.updateProfile(transformedUser);
					goto('/recover');
				} else {
					error = 'No user data received from server';
				}
			} else {
				// Login flow
				const { username: pubKey, password: encryptedKey } = biometricData;
				const { challenge } = await getLoginChallenge();
				const privateKey = await decryptPrivateKeyWithBiometrics(encryptedKey);
				const signedChallenge = await signLoginChallenge(challenge, privateKey);
				const response = (await loginWithNostr(
					pubKey,
					challenge,
					signedChallenge
				)) as ApiResponse<AuthResponse>;
				console.log({ response });

				if (!response.access_token) {
					error = 'No access token received from server';
					return;
				}

				// Store access token securely
				await Preferences.set({
					key: 'access_token',
					value: response.access_token
				});

				// Update user store with profile data
				const userData = response.data?.user;
				if (userData) {
					const transformedUser = transformUserData(userData);
					user.updateProfile(transformedUser);
					goto(isProfileComplete(transformedUser) ? '/dashboard' : '/profile');
				} else {
					error = 'No user data received from server';
				}
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
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Login to BitTasker</h2>

			{#if isBiometricAvailable}
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
					{isLoading ? 'Processing...' : 'Continue with Biometrics'}
				</button>

				{#if error}
					<p class="mt-2 text-red-500">{error}</p>
				{/if}
			{:else}
				<Alby />
			{/if}

			<Google />
		</div>
	</div>
</div>
