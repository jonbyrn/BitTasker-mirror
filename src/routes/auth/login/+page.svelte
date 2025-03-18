<script lang="ts">
	import { onMount } from 'svelte';
	import { NativeBiometric } from 'capacitor-native-biometric';
	import { isValidEmail } from '$lib/utils/helpers/validators';
	import { createPasskey, verifyIdentity } from '$lib/utils/helpers/biometrics';
	import { browser } from '$app/environment';

	// Google OAuth configuration
	const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
	const GOOGLE_REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback/google';

	let isLogin = $state(true);
    let isLoading = $state(false);
    let errorMessage = $state('');
    let successMessage = $state('');
	let isPasskey = $state(false);
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let name = $state('');
	let isBiometricAvailable = $state(false);

	// Add Google auth state
	let googleAuthInitialized = $state(false);

	onMount(async () => {
		const result = await NativeBiometric.isAvailable();
		if (result.isAvailable) isBiometricAvailable = true;
	});
    
    if (browser) {
        // Load Google Identity Services
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = initializeGoogleAuth;
        document.head.appendChild(script);
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

	async function handleGoogleCallback(response: any) {
        console.log('Google callback response:', response);
		if (!response?.credential) return;

		try {
			// Decode the JWT token to get user info
			const payload = JSON.parse(atob(response.credential.split('.')[1]));
			
			// Create a secure key using Web Crypto API
			const encoder = new TextEncoder();
			const keyMaterial = encoder.encode(response.credential);
			const key = await crypto.subtle.importKey(
				'raw',
				keyMaterial,
				{ name: 'PBKDF2' },
				false,
				['deriveKey']
			);

			// Store encrypted credentials securely
			const encryptedCreds = await encryptCredentials(response.credential, key);
			localStorage.setItem('auth_token', encryptedCreds);

			// Update user state with Google profile info
			email = payload.email;
			name = payload.name;
			
			// Handle login/signup logic
			if (isLogin) {
				// Implement login logic
				console.log('Google login successful');
			} else {
				// Implement signup logic
				console.log('Google signup successful');
			}
		} catch (error) {
			console.error('Google auth error:', error);
		}
	}

	async function encryptCredentials(credential: string, key: CryptoKey): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(credential);
		
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encryptedData = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv
			},
			key,
			data
		);

		// Combine IV and encrypted data
		const result = new Uint8Array(iv.length + encryptedData.byteLength);
		result.set(iv);
		result.set(new Uint8Array(encryptedData), iv.length);
		
		return btoa(String.fromCharCode(...result));
	}

	function handleGoogleSignIn() {
		if (!browser || !googleAuthInitialized) return;
		window.google.accounts.id.prompt();
	}

	function handlePasskey() {
		if (isLogin) {
			verifyIdentity();
		} else if (!isPasskey) {
			isPasskey = true;
		}
	}

	function handleSubmit(e: Event) {
		e.preventDefault();

		if (!isValidEmail(email)) return console.error('email validation failed');

		if (isLogin) {
			// Handle login
			console.log('Login:', { email, password });
		} else if (isPasskey) {
			createPasskey(email);
		} else {
			// Handle signup
			console.log('Signup:', { name, email, password });
		}
	}
</script>

<div class="bg-base-200 flex min-h-screen items-center justify-center px-4">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">
				{isLogin ? 'Login' : 'Sign Up'} to Bittasker
			</h2>

			<form onsubmit={handleSubmit} class="space-y-4">
				{#if !isLogin && !isPasskey}
					<div class="form-control">
						<label class="label" for="name">
							<span class="label-text">Full Name</span>
						</label>
						<input
							type="text"
							id="name"
							bind:value={name}
							placeholder="Enter your full name"
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
						placeholder="Enter your email"
						class="input input-bordered w-full"
						required
					/>
				</div>

				{#if !isPasskey}
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
								required
							/>
						</div>
					{/if}
				{/if}

				<button type="submit" class="btn btn-primary w-full">
					{isLogin ? 'Login' : 'Sign Up'}
				</button>
			</form>

			<div class="divider">OR</div>

			{#if isBiometricAvailable && !isPasskey}
				<button class="btn btn-outline w-full" onclick={handlePasskey}>
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
					{#if isLogin}
						Continue with Biometric
					{:else}
						Add Passkey
					{/if}
				</button>
			{/if}

			<button class="btn btn-outline w-full" onclick={handleGoogleSignIn}>
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

			<div class="mt-4 text-center">
				<button onclick={() => (isLogin = !isLogin)} class="link link-primary">
					{isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
				</button>
			</div>
		</div>
	</div>
</div>
