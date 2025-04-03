<script lang="ts">
	import type { NostrRegistrationData } from '$lib/types/auth';
	import { PUBLIC_GOOGLE_CLIENT_ID, PUBLIC_GOOGLE_IOS_CLIENT_ID } from '$env/static/public';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { bytesToHex } from '@noble/hashes/utils';
	import { user } from '$lib/stores/user.store';
	import { authState } from '$lib/stores/auth.store';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { SocialLogin } from '@capgo/capacitor-social-login';
	import { Capacitor } from '@capacitor/core';
	import {
		encryptNostrPrivateKeyWithUserId,
		decryptNostrPrivateKeyWithUserId
	} from '$lib/utils/helpers/auth';
	import authService from '$lib/api/services/auth.service';

	const isNative = Capacitor.isNativePlatform();
	let googleAuthInitialized = $state(false);

	async function handleGoogleCallback(response: any) {
		if (!response?.credential) return;

		try {
			const res = await authService.authenticateWithGoogle(response.credential);
			const { user: userData } = res;

			// User exists, handle successful login
			const { email, name, nostrKey } = userData;

			try {
				// Decrypt the user's Nostr private key
				const decryptedPrivateKey = await decryptNostrPrivateKeyWithUserId(
					{
						data: nostrKey.encryptedPrivateKey,
						iv: nostrKey.iv,
						authTag: nostrKey.authTag
					},
					response.client_id,
					nostrKey.salt
				);

				// Only update user store and grant access if decryption succeeds
				user.updateProfile({
					id: response.client_id,
					email,
					name,
					npub: nostrKey.publicKey,
					createdAt: new Date(userData.createdAt),
					updatedAt: new Date(userData.updatedAt)
				});

				goto('/profile');
			} catch (decryptError) {
				console.error('Failed to decrypt Nostr private key:', decryptError);
				// Set error state and prevent login
				authState.setError(
					'Failed to decrypt user credentials. Please try again or contact support.'
				);
				// TODO: Could redirect to a help page or show an error modal
				return;
			}
		} catch (error: any) {
			if (error.response?.status === 404) {
				// User doesn't exist, proceed with registration
				console.log('New user, proceeding with registration');

				// Decode the JWT token to get user info
				const payload = JSON.parse(atob(response.credential.split('.')[1]));

				// Generate Nostr keypair
				const privateKey = generateSecretKey();
				const publicKey = getPublicKey(privateKey);
				const privateKeyHex = bytesToHex(privateKey);

				// Encrypt private key using client ID as user ID
				const { encrypted, salt } = await encryptNostrPrivateKeyWithUserId(
					privateKeyHex,
					response.client_id
				);

				// Register user with encrypted Nostr keys
				const registrationResult = await authService.registerWithNostr({
					email: payload.email,
					name: payload.name,
					publicKey,
					encryptedPrivateKey: encrypted.data,
					iv: encrypted.iv,
					salt,
					authTag: 'auth-tag-data',
					iterations: 100000
				} as NostrRegistrationData);

				console.log('Registration result:', registrationResult);

				// Redirect to recovery page with email
				goto('/auth/recover?email=' + encodeURIComponent(payload.email));
			} else {
				console.error('Authentication error:', error);
				authState.setError('Authentication failed. Please try again.');
			}
		}
	}

	async function handleNativeGoogleLogin() {
		try {
			const result = await SocialLogin.login({
				provider: 'google',
				options: {
					scopes: ['email', 'profile']
					// forceRefreshToken: true // if you need refresh token
				}
			});
			console.log('Google login result:', result);

			if (result?.result && 'accessToken' in result.result && result.result.accessToken?.token) {
				await handleGoogleCallback({
					credential: result.result.accessToken.token
				});
			}
		} catch (error) {
			console.error('Native Google login error:', error);
		}
	}

	async function initializeGoogleAuth() {
		if (!browser) return;

		if (isNative) {
			await SocialLogin.initialize({
				google: {
					webClientId: PUBLIC_GOOGLE_CLIENT_ID, // Use Web Client ID for all platforms
					iOSClientId: PUBLIC_GOOGLE_IOS_CLIENT_ID // for iOS
					// mode: 'offline' // replaces grantOfflineAccess
				}
			}).then(() => {
				googleAuthInitialized = true;
			});
			return;
		}

		if (!window.google) return;

		window.google.accounts.id.initialize({
			client_id: PUBLIC_GOOGLE_CLIENT_ID,
			callback: handleGoogleCallback,
			auto_select: false,
			cancel_on_tap_outside: true
		});

		googleAuthInitialized = true;
	}

	if (browser) {
		// TODO: initialize google login once enabled
		// if (!isNative) {
		// 	// Load Google Identity Services only for web
		// 	const script = document.createElement('script');
		// 	script.src = 'https://accounts.google.com/gsi/client';
		// 	script.async = true;
		// 	script.defer = true;
		// 	script.onload = initializeGoogleAuth;
		// 	document.head.appendChild(script);
		// } else {
		// 	// Initialize directly for native platforms
		// 	initializeGoogleAuth();
		// }
	}

	const handleGoogleSignIn = () => {
		return console.warn('Google auth disabled');
		if (!browser || !googleAuthInitialized) return;
		if (isNative) {
			handleNativeGoogleLogin();
		} else {
			window.google.accounts.id.prompt();
		}
	};
</script>

<button
	type="button"
	class="btn btn-outline w-full"
	onclick={handleGoogleSignIn}
	disabled={!googleAuthInitialized}
>
	<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5" viewBox="0 0 48 48">
		<path
			fill="#FFC107"
			d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
		/>
		<path
			fill="#FF3D00"
			d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
		/>
		<path
			fill="#4CAF50"
			d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
		/>
		<path
			fill="#1976D2"
			d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
		/>
	</svg>
	Continue with Google
</button>
