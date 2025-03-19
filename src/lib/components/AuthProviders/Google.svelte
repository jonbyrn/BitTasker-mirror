<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { bytesToHex } from '@noble/hashes/utils';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { encryptNostrPrivateKeyWithUserId } from '$lib/utils/helpers/auth';
	import { authenticateWithGoogle, registerWithNostr } from '$lib/services/auth.service';

	const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

	let email = $state('');
	let name = $state('');
	let googleAuthInitialized = $state(false);

	async function handleGoogleCallback(response: any) {
		console.log('Google callback response:', response);
		if (!response?.credential) return;

		try {
			const authResponse = await authenticateWithGoogle(response.credential);
			console.log('Google auth response:', authResponse);
			
			// User exists, handle successful login
			const payload = JSON.parse(atob(response.credential.split('.')[1]));
			email = payload.email;
			name = payload.name;
			
			// Redirect to dashboard or home
			goto('/dashboard');
		} catch (error: any) {
			if (error.response?.status === 401) {
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

				// Register the new user
				const registrationResult = await registerWithNostr({
					name: payload.name,
					email: payload.email,
					publicKey: publicKey,
					encryptedPrivateKey: encrypted.data,
					iv: encrypted.iv,
					salt: salt,
					authTag: 'auth-tag-data',
					iterations: 100000,
					googleToken: response.credential // Pass the Google token for verification
				});

				console.log('Registration result:', registrationResult);

				// Store necessary info and redirect to recovery page
				localStorage.setItem('temp_registration_data', JSON.stringify({
					email: payload.email,
					name: payload.name,
					publicKey: publicKey
				}));

				// Redirect to recovery page
				// goto('/auth/recovery');
			} else {
				console.error('Google auth error:', error);
				// Handle other errors
			}
		}
	}

	function initializeGoogleAuth() {
		if (!browser || !window.google) return;

		window.google.accounts.id.initialize({
			client_id: GOOGLE_CLIENT_ID,
			callback: handleGoogleCallback,
			auto_select: false,
			cancel_on_tap_outside: true
		});

		googleAuthInitialized = true;
	}

	if (browser) {
		// Load Google Identity Services
		const script = document.createElement('script');
		script.src = 'https://accounts.google.com/gsi/client';
		script.async = true;
		script.defer = true;
		script.onload = initializeGoogleAuth;
		document.head.appendChild(script);
	}

	const handleGoogleSignIn = () => {
		if (!browser || !googleAuthInitialized) return;
		window.google.accounts.id.prompt();
	};
</script>

<button type="button" class="btn btn-outline w-full" onclick={handleGoogleSignIn}>
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
