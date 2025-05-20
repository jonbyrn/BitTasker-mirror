<script lang="ts">
	import type { Credentials } from '$lib/types/auth';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import { t } from '$lib/stores/i18n.store';
	import { user } from '$lib/stores/user.store';
	import { appStore } from '$lib/stores/app.store';
	import { authState } from '$lib/stores/auth.store';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
	import { checkBiometricAvailability, getBiometricData } from '$lib/utils/helpers/biometrics';
	import {
		checkWebBiometricAvailability,
		getWebBiometricData
	} from '$lib/utils/helpers/webBiometrics';
	import { decryptNsecWithBiometrics, signLoginChallenge } from '$lib/utils/helpers/auth';
	import authService from '$lib/api/services/auth.service';
	import Alby from '$lib/components/AuthProviders/Alby.svelte';

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

	/**
	 * Login with biometric authentication
	 */
	async function login(biometricData: Credentials, deviceId: string) {
		const pubKey = biometricData.username;
		const encryptedKey = biometricData.password;
		
		// Get login challenge from server
		const { challenge } = await authService.getLoginChallenge();

		// Decrypt private key using biometrics
		const privateKey = await decryptNsecWithBiometrics(encryptedKey);

		// Sign the challenge with the private key
		const signedChallenge = await signLoginChallenge(challenge, privateKey);
		if (!signedChallenge) {
			throw new Error($t('auth.login.errors.challenge_signing'));
		}

		// Login with passkey
		const response = await authService.loginWithPasskey(pubKey, deviceId);

		if (!response.access_token) {
			throw new Error($t('auth.login.errors.no_token'));
		}

		// Store access token securely
		await Preferences.set({
			key: StorageKeys.ACCESS_TOKEN,
			value: response.access_token
		});

		// Update user state and navigate to dashboard
		user.updateProfile(response.user);
		authState.login();
		appStore.update((state) => ({ ...state, biometricData: null }));
		goto('/dashboard');
	}

	async function authenticate() {
		try {
			isLoading = true;
			error = '';

			const deviceId = await getDeviceIdentifier();
			let biometricData = null;

			if (authMethods.biometric) {
				biometricData = await getBiometricData();
			} else if (authMethods.webAuthn) {
				biometricData = await getWebBiometricData();
			}

			if (biometricData) {
				// Login flow
				await login(biometricData, deviceId);
			} else {
				// Show error message
				error = $t('auth.login.errors.no_account');
			}
		} catch (err: unknown) {
			console.error('Authentication failed:', err);
			error = err instanceof Error ? err.message : $t('auth.login.errors.failed');
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="mx-auto flex w-full max-w-md flex-grow flex-col items-center justify-center px-4 py-8">
	<div class="card bg-base-100 w-full shadow-xl">
		<div class="card-body">
			<div class="mb-8 flex flex-col items-center justify-center">
				<img src="/logo.svg" alt="BitTasker" class="h-20 w-auto" />
				<h1 class="mt-6 text-center text-2xl font-bold">{$t('auth.login.title')}</h1>
				<br />
				<p class="text-base-content/70 mt-3 text-center text-sm">
					{$t('auth.login.subtitle')}
				</p>
				<p class="text-base-content/70 mt-2 text-center text-sm">
					{$t('auth.login.login_with')} <span class="text-primary">Passkey/Biometrics</span>, {$t(
						'common.or'
					)}
					<a
						href="https://getalby.com"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline"
					>
						{$t('auth.login.alby_connect')}
					</a>
					{$t('auth.login.account')}.
				</p>
			</div>
			<div class="flex flex-col gap-4">
				{#if authMethods.biometric}
					<button class="btn btn-primary" onclick={authenticate} disabled={isLoading}>
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
						{isLoading ? $t('common.processing') + '...' : $t('auth.login.continue_biometrics')}
					</button>
				{/if}

				{#if authMethods.webAuthn}
					<button class="btn btn-primary" onclick={authenticate} disabled={isLoading}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="size-5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
							/>
						</svg>
						{isLoading ? $t('common.processing') + '...' : $t('auth.login.continue_passkey')}
					</button>
				{/if}

				{#if !authMethods.biometric}
					<Alby />
				{/if}

				{#if error}
					<div class="alert alert-error mt-2">
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

				<div class="divider my-1">{$t('common.or')}</div>

				<button onclick={() => goto('/auth/signup')} class="btn btn-outline">
					{$t('auth.login.create_account')}
				</button>

				<div class="mt-2 text-center">
					<a href="/auth/recover" class="link link-primary text-sm">
						{$t('auth.login.recover_account')}
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
