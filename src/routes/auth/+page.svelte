<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import {
		checkBiometricAvailability,
		getBiometricData,
		setBiometricKey
	} from '$lib/utils/helpers/biometrics';
	import {
		getLoginChallenge,
		loginWithPasskey,
		registerPasskeyDevice
	} from '$lib/services/auth.service';
	import { signLoginChallenge, decryptPrivateKeyWithBiometrics } from '$lib/utils/helpers/auth';
	import { bytesToHex } from '$lib/utils/helpers/encoding';
	import { encrypt, exportKey, generateRandomKey } from '$lib/utils/helpers/crypto';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { user, authState } from '$lib/states/user.store';
	import { getDeviceIdentifier, getDeviceName } from '$lib/utils/helpers/deviceIdentity';
	import Alby from '$lib/components/AuthProviders/Alby.svelte';
	import Google from '$lib/components/AuthProviders/Google.svelte';

	let error: string = $state('');
	let isLoading: boolean = $state(false);
	let isBiometricAvailable: boolean = $state(false);

	onMount(async () => {
		isBiometricAvailable = await checkBiometricAvailability();
	});

	const registerWithPasskey = async (deviceId: string) => {
		const sk = generateSecretKey();
		const npub = getPublicKey(sk);
		const nsec = bytesToHex(sk);
		const encryptionKey = await generateRandomKey();
		const encryptedData = await encrypt(nsec, encryptionKey);
		const exportedKey = await exportKey(encryptionKey);
		const deviceName = await getDeviceName();

		const response = await registerPasskeyDevice(npub, deviceId, deviceName);
		console.log({ response });

		const success = await setBiometricKey(npub, {
			key: exportedKey,
			iv: encryptedData.iv,
			authTag: encryptedData.authTag,
			data: encryptedData.data
		});

		if (!success) {
			error = 'Failed to set up biometric authentication';
			return;
		}

		if(response.userId && response.deviceId) {
			goto(`/auth/recover?npub=${npub}&nsec=${nsec}`);
		}
	};

	const loginWithBiometric = async (pubKey: string, encryptedKey: string, deviceId: string) => {
		const { challenge } = await getLoginChallenge();
		const privateKey = await decryptPrivateKeyWithBiometrics(encryptedKey);
		const signedChallenge = await signLoginChallenge(challenge, privateKey);
		if (!signedChallenge) {
			error = 'Failed to sign login challenge';
			return;
		}
		const response = await loginWithPasskey(pubKey, deviceId);
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
		
		user.updateProfile(response.user);
		authState.login();
		goto('/dashboard');
	};

	async function handleBiometricAuth() {
		try {
			isLoading = true;
			error = '';

			const biometricData = await getBiometricData();
			const deviceId = await getDeviceIdentifier();

			if (!biometricData) {
				await registerWithPasskey(deviceId);
			} else {
				const { username: pubKey, password: encryptedKey } = biometricData;
				await loginWithBiometric(pubKey, encryptedKey, deviceId);
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
