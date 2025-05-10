<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { bytesToHex } from '$lib/utils/helpers/encoding';
	import { getDeviceIdentifier, getDeviceName } from '$lib/utils/helpers/deviceIdentity';
	import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
	import { encryptNsec } from '$lib/utils/helpers/auth';
	import {
		checkWebBiometricAvailability,
		setWebBiometricKey
	} from '$lib/utils/helpers/webBiometrics';
	import authService from '$lib/api/services/auth.service';
	import Alby from '$lib/components/AuthProviders/Alby.svelte';

	let error = $state('');
	let isLoading = $state(false);
	let isCaptchaVerified = $state(false);
	let turnstileWidget = $state<HTMLElement | null>(null);
	let turnstileResponse = $state('');
	let authMethods = $state({
		biometric: false,
		webAuthn: false
	});

	// Cloudflare Turnstile site key - replace with your actual site key
	const TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
	let turnstileWidgetId: string | undefined;

	onMount(async () => {
		try {
			// Check available authentication methods
			authMethods.biometric = await checkBiometricAvailability();
			authMethods.webAuthn = await checkWebBiometricAvailability();

			// Setup callback for Turnstile
			window.onloadTurnstileCallback = renderTurnstile;
		} catch (err) {
			console.error('Error checking authentication methods:', err);
		}
	});

	// Render Turnstile widget
	function renderTurnstile() {
		if (!turnstileWidget || !window.turnstile) return;

		turnstileWidgetId = window.turnstile.render(turnstileWidget, {
			sitekey: TURNSTILE_SITE_KEY,
			theme: 'auto', // Automatically use light/dark based on user preference
			size: 'normal', // Can be 'normal', 'compact', or 'flexible'
			callback: function (token: string) {
				// This function is called when the user successfully completes the challenge
				turnstileResponse = token;
				verifyCaptcha(token);
			},
			'expired-callback': function () {
				// This function is called when the token expires after 300 seconds
				console.log('Captcha expired, please solve again');
				turnstileResponse = '';
				isCaptchaVerified = false;
				error = 'Verification expired, please complete the captcha again';
			},
			'error-callback': function () {
				// This function is called when there's an error with the widget
				console.error('Turnstile widget encountered an error');
				error = 'Captcha verification error, please try again';
			}
		});
	}

	function resetTurnstile() {
		if (window.turnstile && turnstileWidgetId) {
			window.turnstile.reset(turnstileWidgetId);
		}
	}

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

			goto('/auth/onboarding');
		}
	}

	async function handleSignup() {
		try {
			if (!isCaptchaVerified) {
				error = 'Please complete the captcha verification';
				return;
			}

			isLoading = true;
			error = '';

			const deviceId = await getDeviceIdentifier();
			await register(deviceId);
		} catch (err: unknown) {
			console.error('Registration failed:', err);
			error = err instanceof Error ? err.message : 'Registration failed';
			// If registration fails, reset the captcha so the user can try again
			resetTurnstile();
		} finally {
			isLoading = false;
		}
	}

	// TODO: In a production environment, you must verify the token on your server
	async function verifyCaptcha(token: string) {
		try {
			// The verification should look something like this:

			/*
			const response = await fetch('/api/verify-turnstile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ 
					token,
					action: 'signup' // Optional custom action to track in analytics
				})
			});
			
			const result = await response.json();
			isCaptchaVerified = result.success;
			
			if (!result.success) {
				error = result.error || 'Captcha verification failed';
			}
			*/

			// For development purposes, we'll simulate a successful verification
			console.log('Turnstile token received:', token);
			isCaptchaVerified = true;
			error = ''; // Clear any previous errors
		} catch (err) {
			console.error('Error verifying captcha:', err);
			error = 'Failed to verify captcha';
			isCaptchaVerified = false;
		}
	}
</script>

<!-- Cloudflare Turnstile Script -->
<svelte:head>
	<script
		src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback"
		async
		defer
	></script>
</svelte:head>

<div class="mx-auto flex w-full max-w-md flex-grow flex-col items-center justify-center px-4 py-8">
	<div class="card bg-base-100 w-full p-4 shadow-xl">
		<div class="flex flex-col items-center justify-center">
			<img src="/logo.svg" alt="BitTasker" class="h-20 w-auto" />
			<h1 class="mt-6 text-center text-2xl font-bold">Signup for BitTasker</h1>
			<p class="mx-auto text-center">
				<span class="text-base-content/70 mt-3 text-center text-sm">
					Hire for gigs, pay in Bitcoin or Fiat. Own your data.
				</span> <br />
				<span class="text-base-content/70 mt-1 text-center text-sm">
					To get started, signup with a next-gen Passkey/Biometric login, or your
					<a
						href="https://getalby.com"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline">Alby Connect</a
					> account.
				</span> <br />
				<span class="text-base-content/70 mt-1 text-center text-sm">
					If you have an existing account on
					<a
						href="https://nostr.com"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline">Nostr</a
					>, you'll be able to import it on the next step.
				</span>
			</p>
		</div>

		<div class="card-body">
			<div class="flex flex-col gap-4">
				<!-- Cloudflare Turnstile Captcha -->
				<div class="mt-2">
					<p class="mb-2 w-full text-start text-sm">Please verify you're human</p>
					<div bind:this={turnstileWidget} class="flex justify-center"></div>
					<!-- {#if isCaptchaVerified}
							<div class="alert alert-success mt-3 text-sm">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<span>Verification successful</span>
							</div>
						{/if} -->
				</div>

				<button
					class="btn btn-primary"
					onclick={() => goto('/auth/onboarding?method=create')}
					disabled={isLoading || !isCaptchaVerified}
				>
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
					{isLoading ? 'Processing...' : 'Create Account'}
				</button>

				<button
					class="btn btn-secondary"
					onclick={() => goto('/auth/onboarding?method=import')}
					disabled={!isCaptchaVerified}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						stroke="currentColor"
						class="size-6"
					>
						<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5">
							<path stroke-linejoin="round" d="M12 4v10m0 0l3-3m-3 3l-3-3" />
							<path d="M12 20a8 8 0 0 1-8-8m16 0a7.99 7.99 0 0 1-3 6.245" />
						</g>
					</svg>
					Import Nostr Account
				</button>

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

				<div class="divider my-1">OR</div>

				<div class="text-center">
					<a href="/auth/login" class="btn btn-outline w-full">Login</a>
				</div>
			</div>
		</div>
	</div>
</div>
